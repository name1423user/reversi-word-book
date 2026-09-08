import { describe, expect, it } from 'vitest'
import type { Card, CardHistoryEntry } from '../types'
import { byDifficulty, cardStats, difficultyScore } from './difficulty'

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

function history(results: boolean[]): CardHistoryEntry[] {
  return results.map((correct, i) => ({
    timestamp: i,
    correct,
    responseTimeMs: 1000,
  }))
}

describe('difficultyScore', () => {
  it('ranks a never-seen card between always-wrong and always-right', () => {
    const unseen = difficultyScore(card())
    const alwaysWrong = difficultyScore(card({ history: history([false, false, false]) }))
    const alwaysRight = difficultyScore(card({ history: history([true, true, true]) }))

    expect(alwaysWrong).toBeGreaterThan(unseen)
    expect(unseen).toBeGreaterThan(alwaysRight)
  })

  it('gives a perfect card the lowest possible score', () => {
    expect(difficultyScore(card({ history: history([true, true]) }))).toBe(0)
  })

  it('weights a recent mistake above an old one at equal accuracy', () => {
    const recentlyWrong = difficultyScore(card({ history: history([true, false]) }))
    const recentlyRight = difficultyScore(card({ history: history([false, true]) }))
    expect(recentlyWrong).toBeGreaterThan(recentlyRight)
  })

  it('nudges the score up when the last answer took a long time', () => {
    const base = card({ history: history([true, true]) })
    const hesitated = card({ history: history([true, true]), lastResponseTimeMs: 12_000 })
    expect(difficultyScore(hesitated)).toBeGreaterThan(difficultyScore(base))
  })
})

describe('byDifficulty', () => {
  it('orders hardest first and keeps ties in their incoming order', () => {
    const wrong = card({ id: 'wrong', history: history([false, false]) })
    const right = card({ id: 'right', history: history([true, true]) })
    const unseenA = card({ id: 'unseenA' })
    const unseenB = card({ id: 'unseenB' })

    const ordered = byDifficulty([right, unseenA, wrong, unseenB]).map((c) => c.id)
    expect(ordered).toEqual(['wrong', 'unseenA', 'unseenB', 'right'])
  })

  it('does not mutate the input array', () => {
    const input = [card({ id: 'a', history: history([true]) }), card({ id: 'b' })]
    const before = input.map((c) => c.id)
    byDifficulty(input)
    expect(input.map((c) => c.id)).toEqual(before)
  })
})

describe('cardStats', () => {
  it('reports null accuracy for an unattempted card', () => {
    expect(cardStats(card())).toEqual({ attempts: 0, correct: 0, accuracy: null })
  })

  it('counts attempts and correct answers', () => {
    expect(cardStats(card({ history: history([true, false, true, true]) }))).toEqual({
      attempts: 4,
      correct: 3,
      accuracy: 0.75,
    })
  })
})
