import type { Card } from '../types'

/** How many of the most recent answers count toward "recently wrong". */
const RECENT_WINDOW = 3

/**
 * Priority score for "苦手優先" ordering — higher means it should come up
 * sooner. Built so the ordering reads naturally:
 *
 *   always wrong (2.0+) > never seen (1.5) > sometimes wrong > always right (0)
 *
 * A never-seen card sits above cards you usually get right (you still have to
 * learn it) but below ones you actively keep missing.
 */
export function difficultyScore(card: Card): number {
  const history = card.history
  if (history.length === 0) return 1.5

  const correct = history.filter((h) => h.correct).length
  const accuracy = correct / history.length
  let score = (1 - accuracy) * 2

  // Recent mistakes matter more than old ones.
  const recent = history.slice(-RECENT_WINDOW)
  const lastWrong = recent.length > 0 && !recent[recent.length - 1].correct
  if (lastWrong) score += 1
  if (recent.length >= 2 && recent.slice(-2).every((h) => !h.correct)) score += 0.5

  // Hesitation is a weaker signal than being wrong, so it only nudges.
  if (card.lastResponseTimeMs > 10_000) score += 0.5
  else if (card.lastResponseTimeMs > 5_000) score += 0.3

  return score
}

/** Sort a copy of `cards` hardest-first. Ties keep their incoming order, so
 * callers that want variety should shuffle before sorting. */
export function byDifficulty(cards: Card[]): Card[] {
  return [...cards]
    .map((card, i) => ({ card, i, score: difficultyScore(card) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((e) => e.card)
}

export interface CardStats {
  attempts: number
  correct: number
  accuracy: number | null
}

export function cardStats(card: Card): CardStats {
  const attempts = card.history.length
  const correct = card.history.filter((h) => h.correct).length
  return {
    attempts,
    correct,
    accuracy: attempts > 0 ? correct / attempts : null,
  }
}
