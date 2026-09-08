import { describe, expect, it } from 'vitest'
import { answersMatch, normalizeAnswer } from './gradeAnswer'

describe('normalizeAnswer', () => {
  it('trims and casefolds', () => {
    expect(normalizeAnswer('  Banana  ')).toBe('banana')
  })

  it('folds full-width alphanumerics to half-width', () => {
    expect(normalizeAnswer('Ｂａｎａｎａ')).toBe('banana')
  })

  it('collapses internal whitespace, including full-width spaces', () => {
    expect(normalizeAnswer('big  apple')).toBe('bigapple')
    expect(normalizeAnswer('big　apple')).toBe('bigapple')
  })
})

describe('answersMatch', () => {
  it('matches exact text', () => {
    expect(answersMatch('りんご', 'りんご')).toBe(true)
  })

  it('is lenient about case, whitespace, and full-width/half-width', () => {
    expect(answersMatch('banana', 'Banana')).toBe(true)
    expect(answersMatch(' banana ', 'banana')).toBe(true)
    expect(answersMatch('ｂａｎａｎａ', 'banana')).toBe(true)
  })

  it('rejects a genuinely wrong answer', () => {
    expect(answersMatch('apple', 'banana')).toBe(false)
  })

  it('treats hiragana/katakana as distinct, not interchangeable', () => {
    expect(answersMatch('ばなな', 'バナナ')).toBe(false)
  })

  it('rejects a blank answer even against an image-only (blank-text) card', () => {
    expect(answersMatch('', '')).toBe(false)
    expect(answersMatch('   ', '')).toBe(false)
  })

  it('accepts any non-blank attempt against an image-only card, since text can\'t be compared', () => {
    expect(answersMatch('something', '')).toBe(true)
  })
})
