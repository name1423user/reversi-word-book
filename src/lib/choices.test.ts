import { describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { buildChoices, choiceModeAvailable } from './choices'

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: overrides.id ?? 'c1',
    deckId: 'd1',
    front: 'front',
    frontImage: null,
    back: 'back',
    backImage: null,
    lastResponseTimeMs: 0,
    history: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('buildChoices', () => {
  it('always includes exactly one correct option matching the card', () => {
    const target = card({ id: 'apple', back: 'りんご' })
    const pool = [
      target,
      card({ id: 'banana', back: 'バナナ' }),
      card({ id: 'cherry', back: 'さくらんぼ' }),
      card({ id: 'durian', back: 'ドリアン' }),
    ]
    const options = buildChoices(target, pool)
    const correct = options.filter((o) => o.correct)
    expect(correct).toHaveLength(1)
    expect(correct[0].text).toBe('りんご')
  })

  it('caps distractors at 3, for a total of at most 4 options', () => {
    const target = card({ id: 'c0', back: 'ans0' })
    const pool = [
      target,
      ...Array.from({ length: 10 }, (_, i) => card({ id: `c${i + 1}`, back: `ans${i + 1}` })),
    ]
    expect(buildChoices(target, pool)).toHaveLength(4)
  })

  it('dedupes distractors that share an answer, and drops ones matching the correct answer', () => {
    const target = card({ id: 'a', back: 'same' })
    const pool = [
      target,
      card({ id: 'b', back: 'same' }), // matches the correct answer, must be excluded
      card({ id: 'c', back: 'unique1' }),
      card({ id: 'd', back: 'unique1' }), // duplicate of c's answer
      card({ id: 'e', back: 'unique2' }),
    ]
    const options = buildChoices(target, pool)
    const texts = options.map((o) => o.text)
    expect(new Set(texts).size).toBe(texts.length) // no duplicate answer text
    expect(options.filter((o) => o.text === 'same')).toHaveLength(1) // only the correct one
  })

  it('falls back to the image reference when a card has no answer text', () => {
    const target = card({ id: 'a', back: '', backImage: 'image:1' })
    const pool = [
      target,
      card({ id: 'b', back: '', backImage: 'image:2' }),
      card({ id: 'c', back: '', backImage: null }), // no usable answer at all
    ]
    const options = buildChoices(target, pool)
    expect(options.some((o) => o.correct && o.image === 'image:1')).toBe(true)
    expect(options.some((o) => o.image === 'image:2')).toBe(true)
    expect(options).toHaveLength(2) // the answer-less card is never a distractor
  })

  it('degrades gracefully to fewer options when the deck has few distinct answers', () => {
    const target = card({ id: 'a', back: 'only-answer' })
    const options = buildChoices(target, [target])
    expect(options).toHaveLength(1)
    expect(options[0].correct).toBe(true)
  })
})

describe('choiceModeAvailable', () => {
  it('is false with fewer than two distinct answers', () => {
    expect(choiceModeAvailable([])).toBe(false)
    expect(choiceModeAvailable([card({ id: 'a', back: 'x' })])).toBe(false)
    expect(
      choiceModeAvailable([card({ id: 'a', back: 'x' }), card({ id: 'b', back: 'x' })]),
    ).toBe(false)
  })

  it('is true once two cards have distinct answers', () => {
    expect(
      choiceModeAvailable([card({ id: 'a', back: 'x' }), card({ id: 'b', back: 'y' })]),
    ).toBe(true)
  })
})
