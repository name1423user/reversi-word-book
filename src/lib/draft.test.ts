import { afterEach, describe, expect, it } from 'vitest'
import { DRAFT_KEY_PREFIX, draftImageValues, draftKeyFor } from './draft'

/** Minimal localStorage stand-in: data keys are enumerable, methods are not,
 * so Object.keys() sees only the stored entries (as in a real browser). */
function stubStorage(entries: Record<string, string>) {
  const store: Record<string, string> = { ...entries }
  Object.defineProperty(store, 'getItem', {
    value: (key: string) => (key in store ? store[key] : null),
    enumerable: false,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    value: store,
    configurable: true,
  })
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('draftKeyFor', () => {
  it('namespaces the key by deck', () => {
    expect(draftKeyFor('deck-1')).toBe(`${DRAFT_KEY_PREFIX}deck-1`)
    expect(draftKeyFor('a')).not.toBe(draftKeyFor('b'))
  })
})

describe('draftImageValues', () => {
  it('collects image values from every deck draft', () => {
    stubStorage({
      [draftKeyFor('a')]: JSON.stringify({ frontImage: 'image:1', backImage: null }),
      [draftKeyFor('b')]: JSON.stringify({ frontImage: null, backImage: 'image:2' }),
    })
    expect(draftImageValues().sort()).toEqual(['image:1', 'image:2'])
  })

  it('ignores unrelated localStorage entries', () => {
    stubStorage({
      'wordbook:theme': 'dark',
      [draftKeyFor('a')]: JSON.stringify({ frontImage: 'image:1' }),
    })
    expect(draftImageValues()).toEqual(['image:1'])
  })

  // This is the safety-critical case: the result decides which image blobs get
  // deleted, so one unreadable draft must not hide the others' references.
  it('keeps scanning when one draft is malformed', () => {
    stubStorage({
      [draftKeyFor('broken')]: '{not json',
      [draftKeyFor('ok')]: JSON.stringify({ frontImage: 'image:kept' }),
    })
    expect(draftImageValues()).toContain('image:kept')
  })

  it('skips non-string image fields', () => {
    stubStorage({
      [draftKeyFor('a')]: JSON.stringify({ frontImage: 42, backImage: { nope: true } }),
    })
    expect(draftImageValues()).toEqual([])
  })

  it('returns nothing when storage is unavailable', () => {
    expect(draftImageValues()).toEqual([])
  })
})
