import { useState } from 'react'

/** Renders an image, falling back to a text placeholder (never a broken-image
 * icon) when the source 404s, is CORS-blocked, or otherwise fails to load —
 * relevant mainly for user-supplied external URLs. */
export function SmartImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    if (!src) return null
    return (
      <div
        className={`flex items-center justify-center text-center text-xs p-2 ${className ?? ''}`}
        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
      >
        画像が読み込めません
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      draggable={false}
    />
  )
}
