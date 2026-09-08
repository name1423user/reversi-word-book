import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(v: boolean) => void>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (result: boolean) => {
    setOptions(null)
    resolver.current?.(result)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'var(--overlay)' }}
          onClick={() => close(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-xl p-5"
            style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title" className="text-lg font-semibold mb-2">
              {options.title}
            </h2>
            {options.message && (
              <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
                {options.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
                onClick={() => close(false)}
                autoFocus
              >
                {options.cancelLabel ?? 'キャンセル'}
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: options.danger ? 'var(--danger)' : 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
                onClick={() => close(true)}
              >
                {options.confirmLabel ?? '実行する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
