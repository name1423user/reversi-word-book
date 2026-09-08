import type { Card } from '../../types'

export interface RoundResult {
  correct: number
  incorrect: number
  total: number
  durationMs: number
  maxStreak: number
  mostHesitant: Card | null
  mostHesitantMs: number
  wrongCards: Card[]
}

export interface RoundJudgment {
  cardId: string
  correct: boolean
  responseTimeMs: number
}
