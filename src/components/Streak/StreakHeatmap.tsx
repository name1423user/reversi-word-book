import { useMemo } from 'react'
import { addDays, todayKey } from '../../lib/date'

const WEEKS = 18 // roughly the last four months

/** GitHub-contributions-style grid: one column per week, newest at the right. */
export function StreakHeatmap({ studyDates }: { studyDates: string[] }) {
  const studied = useMemo(() => new Set(studyDates), [studyDates])
  const today = todayKey()

  const columns = useMemo(() => {
    // Walk back to the Sunday on or before today, then fill week columns.
    const todayDow = new Date(`${today}T00:00:00`).getDay()
    const lastSunday = addDays(today, -todayDow)
    const cols: string[][] = []
    for (let w = WEEKS - 1; w >= 0; w--) {
      const weekStart = addDays(lastSunday, -7 * w)
      cols.push(Array.from({ length: 7 }, (_, d) => addDays(weekStart, d)))
    }
    return cols
  }, [today])

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]" style={{ minWidth: 'min-content' }}>
        {columns.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((date) => {
              const future = date > today
              const done = studied.has(date)
              return (
                <div
                  key={date}
                  title={`${date}${done ? '：学習した' : ''}`}
                  className="w-[11px] h-[11px] rounded-[2px]"
                  style={{
                    background: future
                      ? 'transparent'
                      : done
                        ? 'var(--accent)'
                        : 'var(--surface-2)',
                    outline: date === today ? '1.5px solid var(--accent)' : undefined,
                    outlineOffset: 1,
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
