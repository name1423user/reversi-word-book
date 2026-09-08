import { useMemo, useRef, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../../db'
import type { Card, SessionResult, StudyOrder } from '../../types'
import { shuffled } from '../../lib/shuffle'
import { byDifficulty } from '../../lib/difficulty'
import { todayKey } from '../../lib/date'
import { useToast } from '../common/ToastProvider'
import { FlashCard } from './FlashCard'
import { SummaryScreen } from './SummaryScreen'
import { FirstTimeGuide } from './FirstTimeGuide'
import type { RoundJudgment, RoundResult } from './flashTypes'

const GUIDE_KEY = 'wordbook:seenFlashGuide'
const ORDER_KEY = 'wordbook:studyOrder'

type Phase = 'setup' | 'playing' | 'summary'

const ORDER_OPTIONS: { value: StudyOrder; label: string; hint: string }[] = [
  { value: 'shuffle', label: 'シャッフル', hint: '毎回ランダムな順番' },
  { value: 'sequential', label: '順番どおり', hint: '追加した順に出題' },
  { value: 'difficulty', label: '苦手優先', hint: '間違えたカードから出題' },
]

function orderedByCreation(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.createdAt - b.createdAt)
}

/** Apply the chosen study order. 苦手優先 shuffles first so that cards with
 * identical scores (e.g. a deck of all-new cards) don't always appear in the
 * same order. */
function applyOrder(cards: Card[], order: StudyOrder): Card[] {
  const base = orderedByCreation(cards)
  if (order === 'sequential') return base
  if (order === 'shuffle') return shuffled(base)
  return byDifficulty(shuffled(base))
}

function loadStudyOrder(): StudyOrder {
  const saved = localStorage.getItem(ORDER_KEY)
  return saved === 'sequential' || saved === 'shuffle' || saved === 'difficulty'
    ? saved
    : 'shuffle'
}

export function FlashPage() {
  const { deckId } = useParams<{ deckId: string }>()
  const deck = useLiveQuery(() => (deckId ? db.decks.get(deckId) : undefined), [deckId])
  const cards = useLiveQuery(
    () => db.cards.where('deckId').equals(deckId ?? '').toArray(),
    [deckId],
  )
  const sessionsForDeck = useLiveQuery(
    () =>
      db.sessions.where('deckId').equals(deckId ?? '').and((s) => s.isPrimaryRound).toArray(),
    [deckId],
  )

  const { reportError, show } = useToast()
  const [studyOrder, setStudyOrder] = useState<StudyOrder>(loadStudyOrder)
  const [phase, setPhase] = useState<Phase>('setup')
  const [queue, setQueue] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [roundNumber, setRoundNumber] = useState(1)
  const [overallTotal, setOverallTotal] = useState(0)
  const [overallCompleted, setOverallCompleted] = useState(0)
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null)
  const [frozenBaseline, setFrozenBaseline] = useState<SessionResult | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [canUndo, setCanUndo] = useState(false)

  const roundJudgmentsRef = useRef<RoundJudgment[]>([])
  const roundStartedAtRef = useRef(0)
  const cardShownAtRef = useRef(0)

  const latestPrimarySession = useMemo(() => {
    if (!sessionsForDeck || sessionsForDeck.length === 0) return null
    return [...sessionsForDeck].sort((a, b) => b.finishedAt - a.finishedAt)[0]
  }, [sessionsForDeck])

  const beginRound = (roundCards: Card[], nextRoundNumber: number, extraTotal: number) => {
    roundJudgmentsRef.current = []
    roundStartedAtRef.current = Date.now()
    cardShownAtRef.current = Date.now()
    setQueue(roundCards)
    setIndex(0)
    setIsFlipped(false)
    setRoundNumber(nextRoundNumber)
    setOverallTotal((t) => t + extraTotal)
    setCanUndo(false)
    setPhase('playing')
  }

  const startSession = () => {
    if (!cards || cards.length === 0) return
    const q = applyOrder(cards, studyOrder)
    setOverallCompleted(0)
    setOverallTotal(0)
    setFrozenBaseline(latestPrimarySession)
    beginRound(q, 1, q.length)
    if (!localStorage.getItem(GUIDE_KEY)) {
      setShowGuide(true)
      localStorage.setItem(GUIDE_KEY, '1')
    }
  }

  const finishRound = async (judgments: RoundJudgment[], roundQueue: Card[]) => {
    const correct = judgments.filter((j) => j.correct).length
    const incorrect = judgments.length - correct
    let maxStreak = 0
    let cur = 0
    for (const j of judgments) {
      if (j.correct) {
        cur++
        maxStreak = Math.max(maxStreak, cur)
      } else {
        cur = 0
      }
    }
    let mostHesitant: Card | null = null
    let mostHesitantMs = -1
    for (const j of judgments) {
      if (j.responseTimeMs > mostHesitantMs) {
        mostHesitantMs = j.responseTimeMs
        mostHesitant = roundQueue.find((c) => c.id === j.cardId) ?? null
      }
    }
    const wrongIds = new Set(judgments.filter((j) => !j.correct).map((j) => j.cardId))
    const wrongCards = roundQueue.filter((c) => wrongIds.has(c.id))
    const durationMs = Date.now() - roundStartedAtRef.current

    const result: RoundResult = {
      correct,
      incorrect,
      total: judgments.length,
      durationMs,
      maxStreak,
      mostHesitant,
      mostHesitantMs: Math.max(0, mostHesitantMs),
      wrongCards,
    }
    setLastRoundResult(result)

    if (roundNumber === 1 && deckId) {
      const sr: SessionResult = {
        id: newId(),
        deckId,
        finishedAt: Date.now(),
        correct,
        incorrect,
        total: judgments.length,
        durationMs,
        maxStreak,
        isPrimaryRound: true,
      }
      try {
        await db.sessions.add(sr)
        const date = todayKey()
        await db.studyDays.put({ id: `${deckId}:${date}`, deckId, date })
      } catch (e) {
        reportError(e, '学習記録の保存')
      }
    }
    setPhase('summary')
  }

  const handleJudge = (correct: boolean) => {
    const card = queue[index]
    if (!card) return
    const responseTimeMs = Date.now() - cardShownAtRef.current
    roundJudgmentsRef.current.push({ cardId: card.id, correct, responseTimeMs })
    // Append inside a transaction, reading the *stored* history rather than
    // the one on `card`. `queue` is a snapshot taken when the round started,
    // so building the array from it would silently drop everything written
    // since — notably the previous round's result when retrying wrong cards.
    db.cards
      .where(':id')
      .equals(card.id)
      .modify((stored) => {
        stored.history = [
          ...stored.history,
          { timestamp: Date.now(), correct, responseTimeMs },
        ]
        stored.lastResponseTimeMs = responseTimeMs
        stored.updatedAt = Date.now()
      })
      .then((modified) => {
        if (modified === 0) {
          show('このカードは削除されているため、結果を記録できませんでした', 'error')
        }
      })
      .catch((e) => reportError(e, '学習結果の保存'))
    setOverallCompleted((c) => c + 1)
    setCanUndo(true)

    if (index + 1 < queue.length) {
      setIndex((i) => i + 1)
      setIsFlipped(false)
      cardShownAtRef.current = Date.now()
    } else {
      finishRound(roundJudgmentsRef.current, queue)
    }
  }

  const handleUndo = async () => {
    const judgments = roundJudgmentsRef.current
    if (judgments.length === 0) return
    const last = judgments.pop()!
    try {
      // Read-modify-write in one transaction so this can't interleave with
      // the judgment write it is undoing. lastResponseTimeMs is derived from
      // what remains rather than from a value captured off the snapshot.
      await db.cards
        .where(':id')
        .equals(last.cardId)
        .modify((stored) => {
          stored.history = stored.history.slice(0, -1)
          stored.lastResponseTimeMs = stored.history.at(-1)?.responseTimeMs ?? 0
          stored.updatedAt = Date.now()
        })
    } catch (e) {
      reportError(e, '判定の取り消し')
    }
    setOverallCompleted((c) => Math.max(0, c - 1))
    setIndex((i) => Math.max(0, i - 1))
    setIsFlipped(false)
    cardShownAtRef.current = Date.now()
    setCanUndo(judgments.length > 0)
  }

  const retryWrong = async () => {
    if (!lastRoundResult) return
    // Re-read from the DB instead of reusing the finished round's snapshot,
    // so the retry round sees current content and skips anything deleted
    // meanwhile.
    const ids = lastRoundResult.wrongCards.map((c) => c.id)
    const fresh = (await db.cards.bulkGet(ids)).filter((c): c is Card => !!c)
    if (fresh.length === 0) {
      setPhase('setup')
      return
    }
    // The order setting carries into retry rounds (per spec).
    const q = applyOrder(fresh, studyOrder)
    beginRound(q, roundNumber + 1, q.length)
  }

  const restartAll = () => {
    if (!cards || cards.length === 0) {
      setPhase('setup')
      return
    }
    const q = applyOrder(cards, studyOrder)
    setOverallCompleted(0)
    setOverallTotal(0)
    setFrozenBaseline(latestPrimarySession)
    beginRound(q, 1, q.length)
  }

  const finishSession = () => {
    setPhase('setup')
  }

  useEffect(() => {
    if (phase !== 'playing') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleJudge(true)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleJudge(false)
      } else if (e.key === ' ') {
        e.preventDefault()
        setIsFlipped((f) => !f)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, queue, index])

  if (!deckId) return null

  const currentCard = queue[index]

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 flex-1 flex flex-col">
      <header className="flex items-center gap-3 mb-6">
        <Link to="/" className="q-btn q-btn-ghost q-btn-sm">
          ← デッキ一覧
        </Link>
        <h1 className="text-xl font-extrabold truncate">{deck?.name ?? ''}</h1>
        <Link to={`/decks/${deckId}/input`} className="q-btn q-btn-outline q-btn-sm ml-auto">
          入力へ
        </Link>
        {phase === 'playing' && (
          <button
            onClick={() => setShowGuide(true)}
            className="q-btn q-btn-ghost"
            style={{ width: '2rem', height: '2rem', padding: 0 }}
            aria-label="使い方を表示"
          >
            ?
          </button>
        )}
      </header>

      {phase === 'setup' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12">
          {cards && cards.length === 0 ? (
            <div className="q-card px-8 py-10 text-center max-w-sm">
              <p className="text-5xl mb-3" aria-hidden>
                🗂
              </p>
              <p className="text-base font-bold mb-1">このデッキにはまだカードがありません</p>
              <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
                カードを追加すると学習をはじめられます。
              </p>
              <Link to={`/decks/${deckId}/input`} className="q-btn q-btn-primary">
                カードを追加する
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-3xl font-extrabold">{cards?.length ?? 0}枚</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  のカードを学習します
                </p>
              </div>
              <fieldset className="w-full max-w-md">
                <legend className="q-label mb-2 w-full text-center">出題順</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ORDER_OPTIONS.map((opt) => {
                    const active = studyOrder === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setStudyOrder(opt.value)
                          localStorage.setItem(ORDER_KEY, opt.value)
                        }}
                        aria-pressed={active}
                        className="q-tile px-3 py-3 text-center"
                        style={
                          active
                            ? {
                                borderColor: 'var(--accent)',
                                background: 'var(--accent-soft)',
                                boxShadow: 'none',
                              }
                            : undefined
                        }
                      >
                        <span
                          className="block text-sm font-bold"
                          style={{ color: active ? 'var(--accent)' : 'var(--text)' }}
                        >
                          {opt.label}
                        </span>
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {opt.hint}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              <button onClick={startSession} className="q-btn q-btn-primary px-8 py-3 text-base">
                学習をはじめる
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'playing' && currentCard && (
        <div className="flex-1 flex flex-col gap-5">
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl font-extrabold tabular-nums">
              {Math.min(index + 1, queue.length)}
            </span>
            <span className="text-lg" style={{ color: 'var(--text-muted)' }}>
              / {queue.length}
            </span>
            {roundNumber > 1 && <span className="q-chip q-chip-accent">再挑戦 {roundNumber}回目</span>}
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--surface-2)' }}
          >
            <div
              className="h-full transition-all"
              style={{ width: `${(index / queue.length) * 100}%`, background: 'var(--accent)' }}
            />
          </div>

          <div className="flex-1 flex items-center justify-center">
            <FlashCard
              key={currentCard.id}
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={() => setIsFlipped((f) => !f)}
              onJudge={handleJudge}
            />
          </div>

          {/* Bottom control bar: judge either side, flip in the middle. */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => handleJudge(false)}
              className="q-btn"
              style={{
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                width: '3.25rem',
                height: '3.25rem',
                fontSize: '1.25rem',
              }}
              aria-label="まだ覚えていない（不正解）"
            >
              ✕
            </button>
            <button
              onClick={() => setIsFlipped((f) => !f)}
              className="q-btn q-btn-outline"
              aria-label="カードを裏返す"
            >
              裏返す
            </button>
            <button
              onClick={() => handleJudge(true)}
              className="q-btn"
              style={{
                background: 'var(--success-bg)',
                color: 'var(--success)',
                width: '3.25rem',
                height: '3.25rem',
                fontSize: '1.25rem',
              }}
              aria-label="覚えた（正解）"
            >
              ○
            </button>
          </div>

          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>通算 {Math.min(overallCompleted + 1, overallTotal)}/{overallTotal}</span>
            <button onClick={handleUndo} disabled={!canUndo} className="q-btn q-btn-ghost q-btn-sm">
              ↺ 元に戻す
            </button>
          </div>
        </div>
      )}

      {phase === 'summary' && lastRoundResult && (
        <SummaryScreen
          result={lastRoundResult}
          previous={frozenBaseline}
          onRetryWrong={retryWrong}
          onRestartAll={restartAll}
          onFinish={finishSession}
        />
      )}

      {showGuide && <FirstTimeGuide onClose={() => setShowGuide(false)} />}
    </div>
  )
}
