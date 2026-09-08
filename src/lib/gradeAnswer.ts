// Lenient text comparison for auto-grading a typed answer (テストモード's
// 入力 format — see TypeCard). Self-graded typing (学習モード) never uses
// this: the user compares their own answer to the reveal and judges ○/✕.

/** Normalize for comparison: trim, collapse internal whitespace, casefold,
 * and fold full-width alphanumerics/punctuation to half-width (NFKC) so
 * common IME differences — "Ｂａｎａｎａ" vs "Banana", a stray full-width
 * space — don't register as wrong answers. Hiragana/katakana are left
 * alone: they're distinct characters, not compatibility variants, so a
 * kana-mismatched answer still counts as wrong. */
export function normalizeAnswer(text: string): string {
  return text.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/**
 * Whether a typed answer matches a card's back text. An image-only back
 * (no text to compare against) can't be graded by text at all — treated as
 * correct once the user has typed *something*, rather than marking an
 * unanswerable question wrong.
 */
export function answersMatch(typed: string, correctText: string): boolean {
  const correct = normalizeAnswer(correctText)
  if (!correct) return normalizeAnswer(typed).length > 0
  return normalizeAnswer(typed) === correct
}
