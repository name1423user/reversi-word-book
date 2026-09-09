import { useState } from 'react'
import { useImageSrc } from '../../hooks/useImageSrc'

/** Renders an image (external URL or an `image:` blob reference), falling
 * back to a text placeholder (never a broken-image icon) when the source
 * 404s, is CORS-blocked, or the referenced blob is missing. */
export function SmartImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined
  alt: string
  className?: string
}) {
  const resolved = useImageSrc(src ?? null)
  const [prevSrc, setPrevSrc] = useState(src)
  const [imgError, setImgError] = useState(false)

  // Clear a stale error when the source changes, without waiting a tick for
  // an effect — see https://react.dev/learn/you-might-not-need-an-effect
  if (src !== prevSrc) {
    setPrevSrc(src)
    setImgError(false)
  }

  if (!src) return null

  if (resolved === undefined) {
    // Blob lookup in flight — keep layout stable without flashing the
    // "failed to load" placeholder for what is normally a few ms.
    return <div className={className} aria-hidden style={{ background: 'var(--surface-2)' }} />
  }

  if (resolved === null || imgError) {
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
      src={resolved}
      alt={alt}
      className={className}
      onError={() => setImgError(true)}
      draggable={false}
    />
  )
}
