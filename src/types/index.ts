// Core data model. Kept close to the spec's JSON shape for cards so that
// JSON import/export round-trips cleanly.

export interface CardHistoryEntry {
  timestamp: number
  correct: boolean
  responseTimeMs: number
}

export interface Card {
  id: string
  deckId: string
  front: string
  frontImage: string | null // data URL (webp) or external http(s) URL
  back: string
  backImage: string | null
  lastResponseTimeMs: number
  history: CardHistoryEntry[]
  createdAt: number
  updatedAt: number
}

/** The subset of Card fields carried by JSON import/export. */
export interface CardJson {
  front: string
  frontImage?: string | null
  back: string
  backImage?: string | null
}

export interface Deck {
  id: string
  name: string
  createdAt: number
}

export interface SessionResult {
  id: string
  deckId: string
  finishedAt: number
  correct: number
  incorrect: number
  total: number
  durationMs: number
  maxStreak: number
  /** Only set for the first (non-retry) round of a study session. */
  isPrimaryRound: boolean
}

export interface StudyDay {
  id: string // `${deckId}:${date}`
  deckId: string
  date: string // YYYY-MM-DD, local time
}

export type SortKey = 'createdDesc' | 'createdAsc' | 'textAsc' | 'textDesc'

export type Judgment = 'correct' | 'incorrect'
