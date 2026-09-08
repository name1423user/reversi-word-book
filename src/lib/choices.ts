// Building blocks for the 4択 (multiple-choice) practice mode: turning one
// card's answer plus the rest of the deck into a set of answer buttons.
import type { Card } from '../types'
import { shuffled } from './shuffle'

const MAX_DISTRACTORS = 3

export interface ChoiceOption {
  /** The source card's id (unique per option, including distractors). */
  id: string
  text: string
  image: string | null
  correct: boolean
}

/** A key that identifies a card's *answer* content (not the card itself),
 * so two cards that happen to share an answer never appear as separate
 * options. Text wins when present; an image-only back falls back to its
 * image reference. `null` means the card has no usable answer at all. */
function answerKey(card: Card): string | null {
  const text = card.back.trim().toLowerCase()
  if (text) return `t:${text}`
  if (card.backImage) return `i:${card.backImage}`
  return null
}

/**
 * Build the option set for one question: the card's own answer plus up to
 * three distractors drawn randomly from the rest of `pool` (typically the
 * whole deck). Distractors are deduped by answer content and never repeat
 * the correct answer, so a deck with few distinct answers naturally yields
 * a smaller — but still valid — option set instead of a broken one.
 */
export function buildChoices(card: Card, pool: Card[]): ChoiceOption[] {
  const correctKey = answerKey(card)
  const seen = new Set<string>(correctKey ? [correctKey] : [])
  const candidates: Card[] = []
  for (const c of pool) {
    if (c.id === card.id) continue
    const key = answerKey(c)
    if (!key || seen.has(key)) continue
    seen.add(key)
    candidates.push(c)
  }

  const distractors = shuffled(candidates).slice(0, MAX_DISTRACTORS)
  const options: ChoiceOption[] = [
    { id: card.id, text: card.back, image: card.backImage, correct: true },
    ...distractors.map((c) => ({ id: c.id, text: c.back, image: c.backImage, correct: false })),
  ]
  return shuffled(options)
}

/** Whether a deck has enough distinct answers for 4択 mode to be worth
 * offering at all (every question needs at least one distractor). */
export function choiceModeAvailable(cards: Card[]): boolean {
  const distinct = new Set<string>()
  for (const c of cards) {
    const key = answerKey(c)
    if (key) distinct.add(key)
  }
  return distinct.size >= 2
}
