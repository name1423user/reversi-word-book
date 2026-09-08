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
  // `image:<id>` reference into the `images` table (uploaded/pasted), an
  // external http(s) URL, or null.
  frontImage: string | null
  back: string
  backImage: string | null
  lastResponseTimeMs: number
  history: CardHistoryEntry[]
  createdAt: number
  updatedAt: number
}

/** A binary image blob, stored out-of-line from the card row it belongs to
 * (referenced as `image:<id>`) so card records stay small and IndexedDB
 * doesn't pay the ~33% size tax of base64-encoding every image. */
export interface StoredImage {
  id: string
  blob: Blob
  createdAt: number
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
  /** Position under manual ordering. Seeded from createdAt for decks that
   * predate manual sorting. */
  order: number
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

export type SortKey =
  | 'createdDesc'
  | 'createdAsc'
  | 'textAsc'
  | 'textDesc'
  | 'difficultyDesc'

export type DeckSortKey = 'manual' | 'createdDesc' | 'nameAsc' | 'countDesc'

/** Order cards are presented in during a study session. */
export type StudyOrder = 'sequential' | 'shuffle' | 'difficulty'

/** Which cards get quizzed, and how many.
 * - flip / study: the whole deck (flip is the original mode; study is 学習モード)
 * - test:         a random subset, sized by the user (テストモード) */
export type SessionMode = 'flip' | 'study' | 'test'

/** How a question is answered, for 学習モード/テストモード (flip mode always
 * flips a card and self-judges, so this doesn't apply there).
 * - type:   type an answer, then reveal and self-judge
 * - choice: pick from up to 4 answer buttons, graded automatically */
export type AnswerFormat = 'type' | 'choice'

export type Judgment = 'correct' | 'incorrect'

/** Whole-app backup: every deck with its cards. Distinguished from the
 * spec's bare card-array format by the `decks` key. */
export interface BackupJson {
  format: 'reversi-word-book'
  version: 1
  exportedAt: string
  decks: { name: string; cards: CardJson[] }[]
}
