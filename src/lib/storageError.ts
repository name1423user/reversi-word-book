// Classifying storage write failures. The one that actually bites an
// image-heavy local-first app is running out of quota: without this, a failed
// save looks exactly like a successful one.

/** Dexie wraps the underlying DOMException, so check the inner error too. */
function errorNames(error: unknown): string[] {
  const names: string[] = []
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { name?: unknown; inner?: unknown; cause?: unknown }
    if (typeof e.name === 'string') names.push(e.name)
    current = e.inner ?? e.cause
  }
  return names
}

export function isQuotaError(error: unknown): boolean {
  const names = errorNames(error)
  if (names.includes('QuotaExceededError') || names.includes('NS_ERROR_DOM_QUOTA_REACHED')) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /quota|storage.*full|exceeded the quota/i.test(message)
}

/** A message the user can act on, not a stack trace. */
export function storageErrorMessage(error: unknown, action: string): string {
  if (isQuotaError(error)) {
    return `${action}に失敗しました：端末の保存容量がいっぱいです。バックアップを書き出してから、不要なカードや画像を削除してください。`
  }
  const detail = error instanceof Error && error.message ? `（${error.message}）` : ''
  return `${action}に失敗しました${detail}`
}
