// The unsaved card draft kept in localStorage. Its key shape lives here (and
// nowhere else) because the image garbage collector needs to find drafts to
// treat them as roots — a duplicated prefix string is exactly how drafts got
// collected out from under the user before.

export const DRAFT_KEY_PREFIX = 'wordbook:draft:'

export function draftKeyFor(deckId: string): string {
  return `${DRAFT_KEY_PREFIX}${deckId}`
}

/** Every image value referenced by a saved draft, across all decks. Returns
 * raw field values; the caller decides which are blob references.
 *
 * Robustness matters here: this feeds a delete decision, so one unreadable
 * draft must not cut the scan short and make live images look unreferenced. */
export function draftImageValues(): (string | null)[] {
  const values: (string | null)[] = []
  let keys: string[]
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(DRAFT_KEY_PREFIX))
  } catch {
    // Storage unavailable (private mode, blocked cookies): report no roots
    // rather than pretending we scanned successfully.
    return values
  }
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const draft = JSON.parse(raw) as { frontImage?: unknown; backImage?: unknown }
      for (const value of [draft?.frontImage, draft?.backImage]) {
        if (typeof value === 'string') values.push(value)
      }
    } catch {
      // A single malformed draft shouldn't stop us collecting the rest.
    }
  }
  return values
}
