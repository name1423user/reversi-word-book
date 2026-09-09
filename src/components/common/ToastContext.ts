import { createContext, useContext } from 'react'

export type Tone = 'info' | 'error'

export interface Toast {
  id: number
  message: string
  tone: Tone
}

export interface ToastApi {
  show: (message: string, tone?: Tone) => void
  /** Report a failed write with a message the user can act on. */
  reportError: (error: unknown, action: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
