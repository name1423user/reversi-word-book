import { useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 500

/** Debounced localStorage-backed draft. Survives navigation/reloads until
 * explicitly cleared (on successful submit). */
export function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch {
      return initial
    }
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* storage full/unavailable: draft just won't persist */
      }
    }, DEBOUNCE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, key])

  const clear = () => {
    localStorage.removeItem(key)
  }

  return [value, setValue, clear] as const
}
