import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { fileFromDrop, fileFromPaste, isHttpUrl } from '../../lib/image'
import { deleteImageRefs, storeImageBlob } from '../../lib/imageStore'
import { SmartImage } from '../common/SmartImage'
import { useToast } from '../common/ToastContext'
import { CropModal } from './CropModal'

interface Props {
  label: string
  value: string | null
  onChange: (value: string | null) => void
}

/** One image slot: URL field + drag&drop/paste/click upload, with cropping
 * for anything uploaded (URLs are used as-is, uncropped). Uploaded images
 * are stored as blobs (see lib/imageStore.ts); replacing or removing one
 * cleans up the blob it displaces so nothing is left orphaned. */
export function ImageDropZone({ label, value, onChange }: Props) {
  const toast = useToast()
  const [dragOver, setDragOver] = useState(false)
  const [pendingSrc, setPendingSrc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isUrlValue = value ? isHttpUrl(value) : false

  const openCropFor = (file: File) => {
    setPendingSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  const clearPending = () => {
    setPendingSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const replaceValue = async (next: string | null) => {
    const previous = value
    onChange(next)
    if (previous && previous !== next) {
      await deleteImageRefs([previous]).catch(() => {
        /* the card no longer points at it; the startup sweep will collect it */
      })
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = fileFromDrop(e)
    if (file) openCropFor(file)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const file = fileFromPaste(e)
    if (file) {
      e.preventDefault()
      openCropFor(file)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {label}画像
        </span>
        {value && (
          <button
            type="button"
            onClick={() => replaceValue(null)}
            className="text-xs"
            style={{ color: 'var(--danger)' }}
          >
            削除
          </button>
        )}
      </div>

      {value ? (
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          <SmartImage src={value} alt={`${label}画像プレビュー`} className="w-full max-h-40 object-contain" />
        </div>
      ) : (
        <div
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onPaste={onPaste}
          onClick={() => fileInputRef.current?.click()}
          tabIndex={0}
          role="button"
          aria-label={`${label}画像をドロップ・貼り付け・クリックして選択`}
          className="rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 py-4 text-xs cursor-pointer transition-colors"
          style={{
            borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
            background: dragOver ? 'var(--surface-2)' : 'transparent',
            color: 'var(--text-muted)',
          }}
        >
          <span>画像をドラッグ＆ドロップ／ペースト</span>
          <span>またはクリックして選択</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) openCropFor(file)
              e.target.value = ''
            }}
          />
        </div>
      )}

      <div className="mt-1.5">
        <input
          type="url"
          inputMode="url"
          placeholder="または画像URLを入力"
          value={isUrlValue ? value! : ''}
          onChange={(e) => replaceValue(e.target.value || null)}
          className="q-field"
          style={{ padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }}
        />
      </div>

      {pendingSrc && (
        <CropModal
          src={pendingSrc}
          onCancel={clearPending}
          onDone={async (blob) => {
            try {
              const ref = await storeImageBlob(blob)
              clearPending()
              await replaceValue(ref)
            } catch (e) {
              clearPending()
              toast.reportError(e, '画像の保存')
            }
          }}
        />
      )}
    </div>
  )
}
