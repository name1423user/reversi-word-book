import type { SessionResult } from '../../types'
import { formatDuration } from '../../lib/date'
import { useConfirm } from '../common/ConfirmProvider'
import { SmartImage } from '../common/SmartImage'
import type { RoundResult } from './flashTypes'

export function SummaryScreen({
  result,
  previous,
  onRetryWrong,
  onRestartAll,
  onFinish,
}: {
  result: RoundResult
  previous: SessionResult | null
  onRetryWrong: () => void
  onRestartAll: () => void
  onFinish: () => void
}) {
  const confirm = useConfirm()
  const accuracy = result.total ? Math.round((result.correct / result.total) * 100) : 0
  const prevAccuracy =
    previous && previous.total ? Math.round((previous.correct / previous.total) * 100) : null
  const delta = prevAccuracy === null ? null : accuracy - prevAccuracy

  const restartAll = async () => {
    const ok = await confirm({
      title: '最初から全部やり直しますか？',
      message: 'このセッションの進捗はリセットされ、デッキ全体をもう一度学習します。',
      confirmLabel: 'やり直す',
      danger: true,
    })
    if (ok) onRestartAll()
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 flex-1 overflow-y-auto">
      <h1 className="text-xl font-bold text-center mb-6">お疲れさまでした 🎉</h1>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label="正解" value={`${result.correct}`} color="var(--success)" />
        <Stat label="不正解" value={`${result.incorrect}`} color="var(--danger)" />
        <Stat label="正解率" value={`${accuracy}%`} />
        <Stat label="所要時間" value={formatDuration(result.durationMs)} />
      </div>

      {prevAccuracy !== null && delta !== null && (
        <div
          className="rounded-xl p-3 mb-4 text-sm text-center"
          style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
        >
          直近セッション比:{' '}
          <b style={{ color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : undefined }}>
            {delta > 0 ? '+' : ''}
            {delta}pt
          </b>{' '}
          <span style={{ color: 'var(--text-muted)' }}>（前回 {prevAccuracy}%）</span>
        </div>
      )}

      <div
        className="rounded-xl p-3 mb-4 text-sm flex items-center justify-between"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
      >
        <span>最大連続正解</span>
        <b>🔥 {result.maxStreak}</b>
      </div>

      {result.mostHesitant && (
        <div
          className="rounded-xl p-3 mb-6"
          style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
        >
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            一番迷ったカード（{(result.mostHesitantMs / 1000).toFixed(1)}秒）
          </p>
          <p className="text-sm font-medium truncate">{result.mostHesitant.front || '(画像のみ)'}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 mb-8">
        {result.wrongCards.length > 0 && (
          <button
            onClick={onRetryWrong}
            className="rounded-lg px-4 py-3 text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            不正解だったカードだけもう一度（{result.wrongCards.length}枚）
          </button>
        )}
        <button
          onClick={restartAll}
          className="rounded-lg px-4 py-3 text-sm font-medium"
          style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
        >
          最初から全部やり直す
        </button>
        <button
          onClick={onFinish}
          className="rounded-lg px-4 py-3 text-sm font-medium"
          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
        >
          終了する
        </button>
      </div>

      {result.wrongCards.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">間違えたカード</h2>
          <ul className="flex flex-col gap-2">
            {result.wrongCards.map((c) => (
              <li
                key={c.id}
                className="rounded-lg p-2.5 grid grid-cols-2 gap-2"
                style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
              >
                <MiniFace label="表" text={c.front} image={c.frontImage} />
                <MiniFace label="裏" text={c.back} image={c.backImage} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
    >
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="text-xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

function MiniFace({ label, text, image }: { label: string; text: string; image: string | null }) {
  return (
    <div className="min-w-0">
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      {image && (
        <SmartImage src={image} alt={label} className="w-full h-14 object-cover rounded mt-0.5" />
      )}
      <p className="text-xs truncate mt-0.5">{text}</p>
    </div>
  )
}
