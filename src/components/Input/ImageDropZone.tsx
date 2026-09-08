import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { fileFromDrop, isHttpUrl, readFileAsDataUrl } from '../../lib/image'
import { SmartImage } from '../common/SmartImage'
import { CropModal } from './CropModal'

interface Props {
  label: string
  value: string | null
  onChange: (value: string | null) => void
}

/** One image slot: URL field + drag&drop/paste/click upload, with cropping
 * for anything uploaded (URLs are used as-is, uncropped). */
export function ImageDropZone({ label, value, onChange }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [pendingSrc, setPendingSrc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isUrlValue = value ? isHttpUrl(value) : false

  const handleFile = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file)
    setPendingSrc(dataUrl)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = fileFromDrop(e)
    if (file) handleFile(file)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          handleFile(file)
        }
        return
      }
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
            onClick={() => onChange(null)}
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
              if (file) handleFile(file)
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
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded-lg px-2.5 py-1.5 text-xs border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        />
      </div>

      {pendingSrc && (
        <CropModal
          src={pendingSrc}
          onCancel={() => setPendingSrc(null)}
          onDone={(webp) => {
            onChange(webp)
            setPendingSrc(null)
          }}
        />
      )}
    </div>
  )
}
