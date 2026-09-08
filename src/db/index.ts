import Dexie, { type EntityTable } from 'dexie'
import type { Card, Deck, SessionResult, StoredImage, StudyDay } from '../types'

class WordBookDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>
  cards!: EntityTable<Card, 'id'>
  sessions!: EntityTable<SessionResult, 'id'>
  studyDays!: EntityTable<StudyDay, 'id'>
  images!: EntityTable<StoredImage, 'id'>

  constructor() {
    super('reversi-word-book')
    this.version(1).stores({
      decks: 'id, createdAt, name',
      cards: 'id, deckId, createdAt, front, back',
      sessions: 'id, deckId, finishedAt',
      studyDays: 'id, deckId, date',
      images: 'id, createdAt',
    })
  }
}

export const db = new WordBookDB()

export function newId(): string {
  return crypto.randomUUID()
}
