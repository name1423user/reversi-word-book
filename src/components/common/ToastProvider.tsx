import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { storageErrorMessage } from '../../lib/storageError'
import { ToastContext, type Toast, type Tone } from './ToastContext'

const AUTO_DISMISS_MS = { info: 3500, error: 9000 }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const show = useCallback((message: string, tone: Tone = 'info') => {
    const id = nextId.current++
    setToasts((prev) => {
      // Collapse an identical message that is already showing, so a failure
      // repeating every keystroke doesn't stack up.
      const withoutDupes = prev.filter((t) => t.message !== message)
      return [...withoutDupes, { id, message, tone }]
    })
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, AUTO_DISMISS_MS[tone])
  }, [])

  const reportError = useCallback(
    (error: unknown, action: string) => {
      console.error(`${action} failed`, error)
      show(storageErrorMessage(error, action), 'error')
    },
    [show],
  )

  const api = useMemo(() => ({ show, reportError }), [show, reportError])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="w-full max-w-md rounded-xl px-4 py-3 text-sm font-medium pointer-events-auto"
              style={{
                background: toast.tone === 'error' ? 'var(--danger-bg)' : 'var(--surface)',
                color: toast.tone === 'error' ? 'var(--danger)' : 'var(--text)',
                boxShadow: 'var(--shadow)',
                border: `1px solid ${toast.tone === 'error' ? 'var(--danger)' : 'var(--border)'}`,
              }}
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
