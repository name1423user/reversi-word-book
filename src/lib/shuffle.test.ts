import { describe, expect, it } from 'vitest'
import { shuffled } from './shuffle'

describe('shuffled', () => {
  it('returns a new array and leaves the original untouched', () => {
    const input = [1, 2, 3, 4, 5]
    const result = shuffled(input)
    expect(result).not.toBe(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps exactly the same elements', () => {
    const input = Array.from({ length: 50 }, (_, i) => i)
    expect([...shuffled(input)].sort((a, b) => a - b)).toEqual(input)
  })

  it('handles empty and single-element arrays', () => {
    expect(shuffled([])).toEqual([])
    expect(shuffled(['only'])).toEqual(['only'])
  })

  it('actually reorders across repeated runs', () => {
    const input = Array.from({ length: 20 }, (_, i) => i)
    const anyReordered = Array.from({ length: 10 }, () => shuffled(input)).some(
      (r) => r.some((v, i) => v !== input[i]),
    )
    expect(anyReordered).toBe(true)
  })
})
