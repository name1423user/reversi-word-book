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
import { draftImageValues } from './draft'
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

/** Every image id something still points at: saved cards, plus unsaved
 * drafts (which the spec promises to keep, so they are roots too). */
async function collectUsedImageIds(): Promise<Set<string>> {
  const cards = await db.cards.toArray()
  const used = new Set<string>()
  for (const c of cards) {
    if (isImageRef(c.frontImage)) used.add(refId(c.frontImage))
    if (isImageRef(c.backImage)) used.add(refId(c.backImage))
  }
  for (const value of draftImageValues()) {
    if (isImageRef(value)) used.add(refId(value))
  }
  return used
}

/** Delete blobs referenced among `refs`, but only those nothing else points
 * at any more — call it after removing whatever referenced them.
 *
 * The reference check is what stops one card's deletion from blanking the
 * image of another card that happens to share the blob. Skipping a delete
 * only leaks a blob until the next sweep; deleting a live one loses data,
 * so this errs toward keeping. */
export async function deleteImageRefs(
  refs: (string | null | undefined)[],
): Promise<void> {
  const ids = [...new Set(refs.filter(isImageRef).map(refId))]
  if (ids.length === 0) return
  const used = await collectUsedImageIds()
  const deletable = ids.filter((id) => !used.has(id))
  if (deletable.length > 0) await db.images.bulkDelete(deletable)
}

/** Copy the blob behind `ref` so the copy owns its own row. Used when
 * duplicating a card: sharing one blob between two cards would mean deleting
 * either card yanks the image out from under the other. External URLs are
 * returned unchanged (nothing local to own). */
export async function duplicateImageRef(ref: string | null): Promise<string | null> {
  if (!ref) return null
  if (!isImageRef(ref)) return ref
  const blob = await getImageBlob(ref)
  return blob ? storeImageBlob(blob) : null
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

/** Delete stored blobs that nothing references any more — a safety net for
 * images left behind by interrupted edits. Unsaved drafts count as
 * references, so an in-progress card keeps its image across reloads. */
export async function sweepOrphanImages(): Promise<number> {
  const [used, imageIds] = await Promise.all([
    collectUsedImageIds(),
    db.images.toCollection().primaryKeys(),
  ])
  const orphanIds = (imageIds as string[]).filter((id) => !used.has(id))
  if (orphanIds.length > 0) await db.images.bulkDelete(orphanIds)
  return orphanIds.length
}
