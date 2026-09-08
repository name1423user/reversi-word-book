import { useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { cropToWebpBlob } from '../../lib/image'

export function CropModal({
  src,
  onCancel,
  onDone,
}: {
  src: string
  onCancel: () => void
  onDone: (webpBlob: Blob) => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (!area) return
    setBusy(true)
    try {
      const webp = await cropToWebpBlob(src, area)
      onDone(webp)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay)' }}
    >
      <div
        className="w-full max-w-lg rounded-xl p-4 flex flex-col gap-3"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
      >
        <h2 className="text-base font-semibold">画像をトリミング</h2>
        <div className="relative w-full h-72 rounded-lg overflow-hidden" style={{ background: '#000' }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        </div>
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          ズーム
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
          >
            キャンセル
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            {busy ? '処理中…' : 'この範囲で確定'}
          </button>
        </div>
      </div>
    </div>
  )
}
