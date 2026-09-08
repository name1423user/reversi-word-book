import { describe, expect, it } from 'vitest'
import { isQuotaError, storageErrorMessage } from './storageError'

describe('isQuotaError', () => {
  it('detects a DOMException-style quota error by name', () => {
    const e = new Error('boom')
    e.name = 'QuotaExceededError'
    expect(isQuotaError(e)).toBe(true)
  })

  it('detects the Firefox spelling', () => {
    const e = new Error('boom')
    e.name = 'NS_ERROR_DOM_QUOTA_REACHED'
    expect(isQuotaError(e)).toBe(true)
  })

  it('unwraps a Dexie error that nests the real cause in `inner`', () => {
    const inner = new Error('out of space')
    inner.name = 'QuotaExceededError'
    const wrapper = Object.assign(new Error('AbortError'), {
      name: 'AbortError',
      inner,
    })
    expect(isQuotaError(wrapper)).toBe(true)
  })

  it('falls back to matching the message', () => {
    expect(isQuotaError(new Error('The quota has been exceeded.'))).toBe(true)
  })

  it('does not flag unrelated errors', () => {
    expect(isQuotaError(new Error('network down'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
    expect(isQuotaError(undefined)).toBe(false)
  })

  it('survives a self-referencing error chain without hanging', () => {
    const e = new Error('loop') as Error & { inner?: unknown }
    e.inner = e
    expect(isQuotaError(e)).toBe(false)
  })
})

describe('storageErrorMessage', () => {
  it('gives actionable advice for a quota failure', () => {
    const e = new Error('full')
    e.name = 'QuotaExceededError'
    const message = storageErrorMessage(e, 'カードの登録')
    expect(message).toContain('カードの登録に失敗しました')
    expect(message).toContain('保存容量')
    expect(message).toContain('バックアップ')
  })

  it('includes the underlying message for other failures', () => {
    expect(storageErrorMessage(new Error('disk on fire'), '保存')).toBe(
      '保存に失敗しました（disk on fire）',
    )
  })

  it('handles a non-Error value', () => {
    expect(storageErrorMessage('oops', '保存')).toBe('保存に失敗しました')
  })
})
