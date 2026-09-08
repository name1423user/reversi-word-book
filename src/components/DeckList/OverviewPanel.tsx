import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { computeStreak, todayKey } from '../../lib/date'
import { StreakHeatmap } from '../Streak/StreakHeatmap'

/** Cross-deck summary: the spec left "全デッキ横断の学習ログを持つか" open, so
 * per-deck records stay the source of truth and this view just aggregates
 * them (a day counts as studied if any deck was studied that day). */
export function OverviewPanel() {
  const summary = useLiveQuery(async () => {
    const [studyDays, cards, decks] = await Promise.all([
      db.studyDays.toArray(),
      db.cards.count(),
      db.decks.count(),
    ])
    const allDates = [...new Set(studyDays.map((s) => s.date))]
    const today = todayKey()
    return {
      allDates,
      streak: computeStreak(allDates),
      cardCount: cards,
      deckCount: decks,
      decksStudiedToday: studyDays.filter((s) => s.date === today).length,
      studiedToday: studyDays.some((s) => s.date === today),
    }
  }, [])

  if (!summary || summary.deckCount === 0) return null

  return (
    <section
      className="q-card p-5 mb-5"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-extrabold">全体の記録</h2>
        <span
          className="q-chip"
          style={
            summary.studiedToday
              ? { background: 'var(--success-bg)', color: 'var(--success)' }
              : undefined
          }
        >
          {summary.studiedToday
            ? `今日は${summary.decksStudiedToday}デッキ学習済み`
            : '今日はまだ学習していません'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="連続学習" value={`🔥 ${summary.streak}日`} />
        <Stat label="デッキ" value={`${summary.deckCount}`} />
        <Stat label="カード" value={`${summary.cardCount}`} />
      </div>

      <StreakHeatmap studyDates={summary.allDates} />
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: 'var(--surface-2)' }}>
      <p className="q-label">{label}</p>
      <p className="text-lg font-extrabold mt-0.5">{value}</p>
    </div>
  )
}
