// Bridges Card.frontImage/backImage (a plain string field) to the `images`
// table of binary blobs. A card's image field is one of:
//   - null                      -> no image
//   - "http(s)://..."           -> external URL, used as-is
//   - "image:<id>"              -> a blob stored in db.images
//
// Keeping blobs out of the card row (instead of embedding base64 data URLs)
// avoids the ~33% base64 size tax and keeps card records small and fast to
// query/sort, which matters once a deck has many image-heavy cards.
import { db, newId } from '../db'
import { isHttpUrl, toWebpBlob } from './image'

const PREFIX = 'image:'

export function isImageRef(value: string | null | undefined): value is string {
  return !!value && value.startsWith(PREFIX)
}

function refId(ref: string): string {
  return ref.slice(PREFIX.length)
}

function makeRef(id: string): string {
  return `${PREFIX}${id}`
}

export async function storeImageBlob(blob: Blob): Promise<string> {
  const id = newId()
  await db.images.add({ id, blob, createdAt: Date.now() })
  return makeRef(id)
}

/** Delete any blobs referenced among `refs` (non-image-ref values, e.g. URLs
 * or null, are silently ignored). Safe to call speculatively. */
export async function deleteImageRefs(
  refs: (string | null | undefined)[],
): Promise<void> {
  const ids = refs.filter(isImageRef).map(refId)
  if (ids.length > 0) await db.images.bulkDelete(ids)
}

export async function getImageBlob(ref: string): Promise<Blob | null> {
  if (!isImageRef(ref)) return null
  const row = await db.images.get(refId(ref))
  return row?.blob ?? null
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/**
 * Normalize one image field from an imported JSON card: external URLs pass
 * through untouched, `data:` URLs are re-encoded through the same
 * downscale/compress pipeline as uploads (so a huge pasted screenshot can't
 * bloat storage) and stored as a blob, and anything else is dropped with a
 * warning rather than failing the whole import.
 */
export async function importImageField(
  value: string | null | undefined,
): Promise<{ ref: string | null; warning?: string }> {
  if (!value) return { ref: null }
  if (isHttpUrl(value)) return { ref: value }
  if (value.startsWith('data:image/')) {
    try {
      const blob = await toWebpBlob(value)
      return { ref: await storeImageBlob(blob) }
    } catch {
      return { ref: null, warning: '画像を読み込めなかったため空にしました' }
    }
  }
  return { ref: null, warning: '未対応の画像形式のため空にしました' }
}

/** Delete any stored blobs that no card currently references — a safety net
 * for images left behind by abandoned drafts or interrupted edits (normal
 * deletes/replacements already clean up their own images immediately). */
export async function sweepOrphanImages(): Promise<number> {
  const [cards, imageIds] = await Promise.all([
    db.cards.toArray(),
    db.images.toCollection().primaryKeys(),
  ])
  const used = new Set<string>()
  for (const c of cards) {
    if (isImageRef(c.frontImage)) used.add(refId(c.frontImage))
    if (isImageRef(c.backImage)) used.add(refId(c.backImage))
  }
  const orphanIds = (imageIds as string[]).filter((id) => !used.has(id))
  if (orphanIds.length > 0) await db.images.bulkDelete(orphanIds)
  return orphanIds.length
}
