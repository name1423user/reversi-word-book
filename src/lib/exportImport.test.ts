import { describe, expect, it } from 'vitest'
import { duplicateKey, exportFilename, formatBytes, parseImportJson } from './exportImport'

describe('parseImportJson', () => {
  it('reads the spec bare-array shape as a single unnamed deck', () => {
    const parsed = parseImportJson(
      JSON.stringify([{ front: 'apple', back: 'りんご' }]),
    )
    expect(parsed.kind).toBe('cards')
    expect(parsed.totalCards).toBe(1)
    expect(parsed.decks[0].cards[0]).toEqual({
      front: 'apple',
      back: 'りんご',
      frontImage: null,
      backImage: null,
    })
  })

  it('reads a multi-deck backup', () => {
    const parsed = parseImportJson(
      JSON.stringify({
        format: 'reversi-word-book',
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        decks: [
          { name: '英単語', cards: [{ front: 'a', back: 'あ' }] },
          { name: '漢字', cards: [{ front: 'b', back: 'い' }] },
        ],
      }),
    )
    expect(parsed.kind).toBe('backup')
    expect(parsed.decks.map((d) => d.name)).toEqual(['英単語', '漢字'])
    expect(parsed.totalCards).toBe(2)
  })

  it('keeps image fields that are strings and nulls anything else', () => {
    const parsed = parseImportJson(
      JSON.stringify([
        { front: 'a', back: 'b', frontImage: 'https://x/y.png', backImage: 42 },
      ]),
    )
    expect(parsed.decks[0].cards[0].frontImage).toBe('https://x/y.png')
    expect(parsed.decks[0].cards[0].backImage).toBeNull()
  })

  it('names unnamed decks inside a backup', () => {
    const parsed = parseImportJson(
      JSON.stringify({ decks: [{ name: '   ', cards: [] }] }),
    )
    expect(parsed.decks[0].name).toBe('デッキ1')
  })

  it('rejects a card missing front/back', () => {
    expect(() => parseImportJson(JSON.stringify([{ front: 'a' }]))).toThrow(/front \/ back/)
  })

  it('rejects JSON that is neither shape', () => {
    expect(() => parseImportJson(JSON.stringify({ hello: 'world' }))).toThrow()
  })

  it('rejects invalid JSON', () => {
    expect(() => parseImportJson('{oops')).toThrow()
  })
})

describe('duplicateKey', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(duplicateKey('  Apple ')).toBe(duplicateKey('apple'))
  })

  it('keeps distinct words distinct', () => {
    expect(duplicateKey('apple')).not.toBe(duplicateKey('apples'))
  })
})

describe('exportFilename', () => {
  it('keeps Japanese deck names and appends the suffix', () => {
    expect(exportFilename('英単語', 'backup')).toBe('英単語-backup.json')
  })

  it('keeps digits and ordinary punctuation', () => {
    expect(exportFilename('TOEIC 900点', 'text')).toBe('TOEIC 900点-text.json')
  })

  it('strips characters that are illegal in filenames', () => {
    expect(exportFilename('a/b:c*d?', 'backup')).toBe('abcd-backup.json')
  })

  it('falls back to a generic stem when nothing usable is left', () => {
    expect(exportFilename('///', 'backup')).toBe('wordbook-backup.json')
    expect(exportFilename('', 'backup')).toBe('wordbook-backup.json')
  })

  it('caps very long names', () => {
    const name = exportFilename('あ'.repeat(100), 'backup')
    expect(name).toBe(`${'あ'.repeat(40)}-backup.json`)
  })
})

describe('formatBytes', () => {
  it('formats across units', () => {
    expect(formatBytes(512)).toBe('512B')
    expect(formatBytes(2048)).toBe('2.0KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0MB')
  })
})
