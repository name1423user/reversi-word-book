import { useEffect, useState } from 'react'
import { isHttpUrl } from '../lib/image'
import { getImageBlob, isImageRef } from '../lib/imageStore'

/** The part of resolution that needs no async lookup: null/URL refs resolve
 * immediately, a blob ref resolves to `undefined` (pending) until the effect
 * below fetches it. */
function resolveSync(ref: string | null): string | null | undefined {
  if (!ref) return null
  if (isHttpUrl(ref)) return ref
  if (!isImageRef(ref)) return null
  return undefined
}

/** Resolves a Card image field (external URL, `image:<id>` blob ref, or
 * null) to something an <img> can use. Returns `undefined` while a blob
 * lookup is in flight, and `null` when there is nothing to show or the
 * blob is missing — distinct states so callers can tell "still loading"
 * from "failed". Object URLs are revoked automatically on change/unmount. */
export function useImageSrc(ref: string | null): string | null | undefined {
  const [prevRef, setPrevRef] = useState(ref)
  const [resolved, setResolved] = useState<string | null | undefined>(() => resolveSync(ref))

  // Re-derive synchronously when the ref changes, instead of waiting a tick
  // for the effect below — see https://react.dev/learn/you-might-not-need-an-effect
  if (ref !== prevRef) {
    setPrevRef(ref)
    setResolved(resolveSync(ref))
  }

  useEffect(() => {
    if (!ref || isHttpUrl(ref) || !isImageRef(ref)) return

    let cancelled = false
    let objectUrl: string | null = null

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
