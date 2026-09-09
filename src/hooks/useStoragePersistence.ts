import { useCallback, useEffect, useState } from 'react'

export type PersistenceStatus = 'checking' | 'persisted' | 'transient' | 'unsupported'

export interface StoragePersistence {
  status: PersistenceStatus
  /** True when running as an installed/home-screen app. */
  isInstalled: boolean
  /** Ask the browser to make storage persistent. Call from a user gesture:
   * some browsers (Firefox) prompt, which shouldn't happen on page load. */
  request: () => Promise<boolean>
}

function detectInstalled(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari predates display-mode and uses navigator.standalone.
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}

function isPersistenceSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.persisted
}

/**
 * Tracks whether the browser will keep our IndexedDB data.
 *
 * This matters because iOS Safari evicts script-writable storage for
 * ordinary websites after about a week without a visit — which for this app
 * would mean losing every card. Data in a home-screen (installed) web app is
 * not subject to that sweep, so the UI nudges the user to install.
 *
 * We deliberately do NOT request persistence on mount: in Firefox that shows
 * a permission prompt, and an unexplained prompt on first load is worse than
 * a banner the user can act on.
 */
export function useStoragePersistence(): StoragePersistence {
  const [status, setStatus] = useState<PersistenceStatus>(() =>
    isPersistenceSupported() ? 'checking' : 'unsupported',
  )
  const [isInstalled] = useState(detectInstalled)

  useEffect(() => {
    if (!isPersistenceSupported()) return
    let cancelled = false
    navigator.storage
      .persisted()
      .then((persisted) => {
        if (!cancelled) setStatus(persisted ? 'persisted' : 'transient')
      })
      .catch(() => {
        if (!cancelled) setStatus('unsupported')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const request = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    try {
      const granted = await navigator.storage.persist()
      setStatus(granted ? 'persisted' : 'transient')
      return granted
    } catch {
      return false
    }
  }, [])

  return { status, isInstalled, request }
}
