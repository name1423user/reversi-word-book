import { describe, expect, it, afterEach, vi } from 'vitest'
import { addDays, computeStreak, formatDuration, formatSessionWhen, todayKey } from './date'

afterEach(() => {
  vi.useRealTimers()
})

/** Freeze "today" to a fixed local date so streak maths is deterministic. */
function freezeToday(dateKey: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${dateKey}T12:00:00`))
}

describe('todayKey', () => {
  it('formats as local YYYY-MM-DD with zero padding', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('addDays', () => {
  it('moves forward and backward across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('computeStreak', () => {
  it('is zero with no history', () => {
    freezeToday('2026-03-10')
    expect(computeStreak([])).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    freezeToday('2026-03-10')
    expect(computeStreak(['2026-03-10', '2026-03-09', '2026-03-08'])).toBe(3)
  })

  it('still counts a streak that ends yesterday (today not studied yet)', () => {
    freezeToday('2026-03-10')
    expect(computeStreak(['2026-03-09', '2026-03-08'])).toBe(2)
  })

  it('resets once a day is missed', () => {
    freezeToday('2026-03-10')
    // gap on 03-08 breaks the run
    expect(computeStreak(['2026-03-10', '2026-03-09', '2026-03-07'])).toBe(2)
  })

  it('ignores duplicate dates', () => {
    freezeToday('2026-03-10')
    expect(computeStreak(['2026-03-10', '2026-03-10', '2026-03-09'])).toBe(2)
  })

  it('is zero when the most recent study is two days old', () => {
    freezeToday('2026-03-10')
    expect(computeStreak(['2026-03-08', '2026-03-07'])).toBe(0)
  })
})

describe('formatDuration', () => {
  it('shows seconds under a minute', () => {
    expect(formatDuration(4_400)).toBe('4秒')
  })

  it('shows minutes and seconds above a minute', () => {
    expect(formatDuration(95_000)).toBe('1分35秒')
  })
})

describe('formatSessionWhen', () => {
  it('labels a timestamp from today as "今日"', () => {
    const now = new Date(2026, 2, 10, 18, 0).getTime()
    const ts = new Date(2026, 2, 10, 9, 5).getTime()
    expect(formatSessionWhen(ts, now)).toBe('今日 9:05')
  })

  it('labels a timestamp from yesterday as "昨日"', () => {
    const now = new Date(2026, 2, 10, 8, 0).getTime()
    const ts = new Date(2026, 2, 9, 23, 45).getTime()
    expect(formatSessionWhen(ts, now)).toBe('昨日 23:45')
  })

  it('falls back to a month/day label further back', () => {
    const now = new Date(2026, 2, 10, 8, 0).getTime()
    const ts = new Date(2026, 2, 1, 14, 30).getTime()
    expect(formatSessionWhen(ts, now)).toBe('3/1 14:30')
  })
})
