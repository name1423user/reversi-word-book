import { useEffect, useState } from 'react'

export interface StorageEstimate {
  usage: number
  quota: number
}

/** Wraps navigator.storage.estimate(), which is the only way to know how
 * close IndexedDB is to its quota before writes start failing. Not
 * supported everywhere (notably older Safari), so callers should treat
 * `null` as "unknown" rather than "zero used". */
export function useStorageEstimate(): StorageEstimate | null {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)

  useEffect(() => {
    let cancelled = false
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return
    navigator.storage
      .estimate()
      .then((e) => {
        if (!cancelled) setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 })
      })
      .catch(() => {
        /* estimate unsupported/denied: leave as unknown */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return estimate
}
