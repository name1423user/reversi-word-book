import { describe, expect, it } from 'vitest'
import { CARD_STYLE_LABEL, buildAiPrompt, type CardStyle } from './aiPrompt'
import { parseImportJson } from './exportImport'

describe('buildAiPrompt', () => {
  it('states the exact schema the importer accepts', () => {
    const prompt = buildAiPrompt({ count: 20, style: 'termToMeaning' })
    for (const field of ['front', 'frontImage', 'back', 'backImage']) {
      expect(prompt).toContain(field)
    }
  })

  it('tells the AI to leave images null (it can only invent broken ones)', () => {
    const prompt = buildAiPrompt({ count: 20, style: 'termToMeaning' })
    expect(prompt).toMatch(/frontImage \/ backImage.*null/s)
  })

  it('asks for raw JSON with no fences or commentary', () => {
    const prompt = buildAiPrompt({ count: 20, style: 'termToMeaning' })
    expect(prompt).toContain('前置き・解説')
  })

  it('guards against making things up, which matters most for study material', () => {
    const prompt = buildAiPrompt({ count: 20, style: 'termToMeaning' })
    expect(prompt).toContain('資料に書かれていないことは書かないでください')
  })

  it('carries the requested card count', () => {
    expect(buildAiPrompt({ count: 30, style: 'cloze' })).toContain('30枚程度')
  })

  it('gives a distinct instruction per card style', () => {
    const prompts = (Object.keys(CARD_STYLE_LABEL) as CardStyle[]).map((style) =>
      buildAiPrompt({ count: 10, style }),
    )
    expect(new Set(prompts).size).toBe(prompts.length)
    expect(buildAiPrompt({ count: 10, style: 'cloze' })).toContain('____')
  })

  it('produces a prompt whose own example payload survives the importer', () => {
    // The schema block in the prompt is the contract; if the importer can't
    // read it, the prompt is lying to the user.
    const example = [
      { front: '表のテキスト', frontImage: null, back: '裏のテキスト', backImage: null },
    ]
    const parsed = parseImportJson(JSON.stringify(example))
    expect(parsed.decks[0].cards[0].front).toBe('表のテキスト')
  })
})
