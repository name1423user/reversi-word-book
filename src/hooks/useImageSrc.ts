import { useEffect, useState } from 'react'
import { isHttpUrl } from '../lib/image'
import { getImageBlob, isImageRef } from '../lib/imageStore'

/** Resolves a Card image field (external URL, `image:<id>` blob ref, or
 * null) to something an <img> can use. Returns `undefined` while a blob
 * lookup is in flight, and `null` when there is nothing to show or the
 * blob is missing — distinct states so callers can tell "still loading"
 * from "failed". Object URLs are revoked automatically on change/unmount. */
export function useImageSrc(ref: string | null): string | null | undefined {
  const [resolved, setResolved] = useState<string | null | undefined>(
    ref ? undefined : null,
  )

  useEffect(() => {
    if (!ref) {
      setResolved(null)
      return
    }
    if (isHttpUrl(ref)) {
      setResolved(ref)
      return
    }
    if (!isImageRef(ref)) {
      setResolved(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setResolved(undefined)

    getImageBlob(ref)
      .then((blob) => {
        if (cancelled) return
        if (!blob) {
          setResolved(null)
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setResolved(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setResolved(null)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [ref])

  return resolved
}
