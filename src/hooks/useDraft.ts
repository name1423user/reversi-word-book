import { useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 500

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Debounced localStorage-backed draft. Survives navigation/reloads until
 * explicitly cleared (on successful submit).
 *
 * The value is stored together with the key it belongs to: when the key
 * changes (a different deck) we reload that key's draft instead of carrying
 * the previous deck's text over — and, importantly, instead of writing the
 * previous deck's draft into the new deck's slot. */
export function useDraft<T>(key: string, initial: T) {
  const [entry, setEntry] = useState<{ key: string; value: T }>(() => ({
    key,
    value: read(key, initial),
  }))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (entry.key !== key) {
    // Adjusting state during render (the documented React pattern) so the
    // very first render for the new key already shows that key's draft.
    setEntry({ key, value: read(key, initial) })
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(entry.key, JSON.stringify(entry.value))
      } catch {
        /* storage full/unavailable: draft just won't persist */
      }
    }, DEBOUNCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [entry])

  const setValue = (updater: (prev: T) => T) => {
    setEntry((prev) => ({ key: prev.key, value: updater(prev.value) }))
  }

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    localStorage.removeItem(key)
  }

  return [entry.value, setValue, clear] as const
}
