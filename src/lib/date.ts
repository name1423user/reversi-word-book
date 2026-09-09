export function todayKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return todayKey(date)
}

/** Consecutive-day streak ending today (or yesterday, so it doesn't reset
 * to zero the moment you wake up before studying). */
export function computeStreak(studyDates: string[]): number {
  const set = new Set(studyDates)
  let cursor = todayKey()
  if (!set.has(cursor)) {
    cursor = addDays(cursor, -1)
    if (!set.has(cursor)) return 0
  }
  let streak = 0
  while (set.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Human-friendly "when" label for a past session's timestamp, e.g. next to
 * "直近セッション比" — a bare percentage with no date reads as "just now"
 * even when the comparison is from days ago. */
export function formatSessionWhen(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const dayKey = todayKey(d)
  const nowKey = todayKey(new Date(now))
  if (dayKey === nowKey) return `今日 ${time}`
  if (dayKey === addDays(nowKey, -1)) return `昨日 ${time}`
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min <= 0) return `${sec}秒`
  return `${min}分${sec}秒`
}
