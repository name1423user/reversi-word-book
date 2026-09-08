import { useMemo, useState } from 'react'
import { todayKey } from '../../lib/date'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function StreakCalendar({ studyDates }: { studyDates: string[] }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const studied = useMemo(() => new Set(studyDates), [studyDates])
  const today = todayKey()

  const { label, cells } = useMemo(() => {
    const base = new Date()
    base.setDate(1)
    base.setMonth(base.getMonth() + monthOffset)
    const year = base.getFullYear()
    const month = base.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: { key: string; day: number | null }[] = []
    for (let i = 0; i < firstWeekday; i++) cells.push({ key: `pad-${i}`, day: null })
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ key, day: d })
    }
    return { label: `${year}年${month + 1}月`, cells }
  }, [monthOffset])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          className="px-2 py-1 rounded text-sm"
          style={{ color: 'var(--text-muted)' }}
          aria-label="前の月"
        >
          ‹
        </button>
        <span className="text-sm font-medium">{label}</span>
        <button
          onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
          className="px-2 py-1 rounded text-sm disabled:opacity-30"
          style={{ color: 'var(--text-muted)' }}
          disabled={monthOffset >= 0}
          aria-label="次の月"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {w}
          </div>
        ))}
        {cells.map((c) => (
          <div
            key={c.key}
            className="aspect-square rounded-md flex items-center justify-center text-[11px]"
            style={
              c.day === null
                ? undefined
                : {
                    background: studied.has(c.key) ? 'var(--accent)' : 'var(--surface-2)',
                    color: studied.has(c.key) ? 'var(--accent-contrast)' : 'var(--text-muted)',
                    outline: c.key === today ? '2px solid var(--accent)' : undefined,
                    outlineOffset: 1,
                  }
            }
          >
            {c.day}
          </div>
        ))}
      </div>
    </div>
  )
}
