// Export/import of decks as JSON.
//
// Two shapes are supported on the way in:
//   1. A bare array of cards (the shape the spec documents) -> one deck
//   2. A BackupJson object with a `decks` array            -> many decks
//
// On the way out the caller picks the mode: "backup" inlines images so the
// file is self-contained (the point of a backup), "text" drops them so the
// file stays small and hand-editable.
import { db, newId } from '../db'
import type { BackupJson, Card, CardJson } from '../types'
import { isHttpUrl } from './image'
import { blobToDataUrl, getImageBlob, importImageField, isImageRef } from './imageStore'

export type ExportMode = 'backup' | 'text'

export interface ExportOptions {
  mode: ExportMode
  /** Best-effort: also fetch external URL images and inline them, so a dead
   * link later doesn't take the image with it. Many hosts block this with
   * CORS, so failures are counted and reported, never fatal. */
  fetchExternal?: boolean
}

export interface ExportReport {
  json: string
  cardCount: number
  /** External URLs we tried but couldn't inline (CORS/offline/404). */
  externalNotFetched: number
  byteSize: number
}

/** A dead host must not stall an export indefinitely — especially since an
 * export can be the last step before a delete. */
const EXTERNAL_FETCH_TIMEOUT_MS = 8000

async function fetchAsDataUrl(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { mode: 'cors', signal: controller.signal })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    return await blobToDataUrl(blob)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function exportImageField(
  ref: string | null,
  options: ExportOptions,
  counters: { externalNotFetched: number },
): Promise<string | null> {
  if (!ref) return null
  if (options.mode === 'text') {
    // Text-only export keeps nothing binary; external links are cheap to
    // keep, so they survive.
    return isHttpUrl(ref) ? ref : null
  }
  if (isImageRef(ref)) {
    const blob = await getImageBlob(ref)
    return blob ? blobToDataUrl(blob) : null
  }
  if (isHttpUrl(ref)) {
    if (!options.fetchExternal) return ref
    const inlined = await fetchAsDataUrl(ref)
    if (inlined) return inlined
    counters.externalNotFetched++
    return ref
  }
  return null
}

async function cardsToJson(
  cards: Card[],
  options: ExportOptions,
  counters: { externalNotFetched: number },
): Promise<CardJson[]> {
  return Promise.all(
    cards.map(async (c) => ({
      front: c.front,
      frontImage: await exportImageField(c.frontImage, options, counters),
      back: c.back,
      backImage: await exportImageField(c.backImage, options, counters),
    })),
  )
}

/** Export one deck in the spec's bare-array shape. */
export async function exportDeck(
  deckId: string,
  options: ExportOptions,
): Promise<ExportReport> {
  const cards = await db.cards.where('deckId').equals(deckId).sortBy('createdAt')
  const counters = { externalNotFetched: 0 }
  const json = JSON.stringify(await cardsToJson(cards, options, counters), null, 2)
  return {
    json,
    cardCount: cards.length,
    externalNotFetched: counters.externalNotFetched,
    byteSize: new Blob([json]).size,
  }
}

/** Export every deck as a single restorable backup. */
export async function exportAllDecks(options: ExportOptions): Promise<ExportReport> {
  const decks = await db.decks.orderBy('order').toArray()
  const counters = { externalNotFetched: 0 }
  let cardCount = 0
  const payload: BackupJson = {
    format: 'reversi-word-book',
    version: 1,
    exportedAt: new Date().toISOString(),
    decks: [],
  }
  for (const deck of decks) {
    const cards = await db.cards.where('deckId').equals(deck.id).sortBy('createdAt')
    cardCount += cards.length
    payload.decks.push({
      name: deck.name,
      cards: await cardsToJson(cards, options, counters),
    })
  }
  const json = JSON.stringify(payload, null, 2)
  return {
    json,
    cardCount,
    externalNotFetched: counters.externalNotFetched,
    byteSize: new Blob([json]).size,
  }
}

export function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  // Attach before clicking (some browsers ignore clicks on detached anchors)
  // and let the object URL outlive the click — revoking it synchronously can
  // cut the transfer short on Safari/iOS.
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Build a download filename from a user-supplied deck name.
 *
 * Deck names are typically Japanese and browsers that support non-ASCII
 * download names show them as-is, which is what we want. Some environments
 * fall back to a generic "download" with no extension, so the import file
 * pickers deliberately accept any file rather than filtering on `.json`. */
export function exportFilename(deckName: string, suffix: string): string {
  // Strip control characters plus the set that is illegal in filenames on
  // Windows/macOS. Unicode (e.g. Japanese deck names) is intentionally kept.
  const cleaned = deckName
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '')
    .trim()
    .slice(0, 40)
  const stem = cleaned || 'wordbook'
  return `${stem}-${suffix}.json`
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  const units = ['KB', 'MB', 'GB']
  let value = n / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)}${units[i]}`
}

// --- import ---------------------------------------------------------------

function parseCard(raw: unknown, label: string): CardJson {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${label}: オブジェクトではありません`)
  }
  const { front, frontImage, back, backImage } = raw as Record<string, unknown>
  if (typeof front !== 'string' || typeof back !== 'string') {
    throw new Error(`${label}: front / back は文字列で指定してください`)
  }
  return {
    front,
    back,
    frontImage: typeof frontImage === 'string' ? frontImage : null,
    backImage: typeof backImage === 'string' ? backImage : null,
  }
}

export interface ParsedImport {
  kind: 'cards' | 'backup'
  /** For 'cards' the single entry has an empty name. */
  decks: { name: string; cards: CardJson[] }[]
  totalCards: number
}

/** Accepts both supported shapes and reports which one it found. */
export function parseImportJson(text: string): ParsedImport {
  const data = JSON.parse(text)

  if (Array.isArray(data)) {
    const cards = data.map((raw, i) => parseCard(raw, `${i + 1}件目`))
    return { kind: 'cards', decks: [{ name: '', cards }], totalCards: cards.length }
  }

  if (typeof data === 'object' && data !== null && Array.isArray((data as BackupJson).decks)) {
    const decks = (data as BackupJson).decks.map((deck, di) => {
      if (typeof deck !== 'object' || deck === null) {
        throw new Error(`${di + 1}個目のデッキ: オブジェクトではありません`)
      }
      const name = typeof deck.name === 'string' && deck.name.trim() ? deck.name : `デッキ${di + 1}`
      const rawCards = Array.isArray(deck.cards) ? deck.cards : []
      return {
        name,
        cards: rawCards.map((raw, i) => parseCard(raw, `${name} の${i + 1}件目`)),
      }
    })
    return {
      kind: 'backup',
      decks,
      totalCards: decks.reduce((sum, d) => sum + d.cards.length, 0),
    }
  }

  throw new Error('カードの配列、またはデッキを含むバックアップJSONを指定してください')
}

/** Case/whitespace-insensitive key for duplicate detection on the front text. */
export function duplicateKey(front: string): string {
  return front.trim().toLowerCase()
}

export interface BuildCardsResult {
  cards: Card[]
  warnings: string[]
}

/** Turn parsed JSON cards into storable Card rows, running every image
 * through the same downscale/compress pipeline as uploads. */
export async function buildCards(
  deckId: string,
  source: CardJson[],
  startAt = Date.now(),
): Promise<BuildCardsResult> {
  const warnings: string[] = []
  const cards: Card[] = []
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const [front, back] = await Promise.all([
      importImageField(c.frontImage),
      importImageField(c.backImage),
    ])
    if (front.warning) warnings.push(`${i + 1}件目(表): ${front.warning}`)
    if (back.warning) warnings.push(`${i + 1}件目(裏): ${back.warning}`)
    cards.push({
      id: newId(),
      deckId,
      front: c.front,
      frontImage: front.ref,
      back: c.back,
      backImage: back.ref,
      lastResponseTimeMs: 0,
      history: [],
      createdAt: startAt + i,
      updatedAt: startAt + i,
    })
  }
  return { cards, warnings }
}
