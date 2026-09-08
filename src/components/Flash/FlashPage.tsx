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

  const { reportError } = useToast()
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
    const prevLastResponseTimeMs = card.lastResponseTimeMs
    roundJudgmentsRef.current.push({
      cardId: card.id,
      correct,
      responseTimeMs,
      prevLastResponseTimeMs,
    })
    db.cards
      .update(card.id, {
        lastResponseTimeMs: responseTimeMs,
        history: [...card.history, { timestamp: Date.now(), correct, responseTimeMs }],
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
    const freshCard = await db.cards.get(last.cardId)
    if (freshCard) {
      await db.cards.update(last.cardId, {
        history: freshCard.history.slice(0, -1),
        lastResponseTimeMs: last.prevLastResponseTimeMs,
      })
    }
    setOverallCompleted((c) => Math.max(0, c - 1))
    setIndex((i) => Math.max(0, i - 1))
    setIsFlipped(false)
    cardShownAtRef.current = Date.now()
    setCanUndo(judgments.length > 0)
  }

  const retryWrong = () => {
    if (!lastRoundResult) return
    // The order setting carries into retry rounds (per spec).
    const q = applyOrder(lastRoundResult.wrongCards, studyOrder)
    beginRound(q, roundNumber + 1, q.length)
  }

  const restartAll = () => {
    if (!cards) return
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
    <div className="mx-auto w-full max-w-3xl px-4 py-4 flex-1 flex flex-col">
      <header className="flex items-center gap-3 mb-4">
        <Link to="/" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← デッキ一覧
        </Link>
        <h1 className="text-lg font-bold truncate">{deck?.name ?? ''}</h1>
        <Link
          to={`/decks/${deckId}/input`}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
        >
          入力へ
        </Link>
        {phase === 'playing' && (
          <button
            onClick={() => setShowGuide(true)}
            className="rounded-full w-7 h-7 text-xs"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
            aria-label="使い方を表示"
          >
            ?
          </button>
        )}
      </header>

      {phase === 'setup' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12">
          {cards && cards.length === 0 ? (
            <div className="text-center">
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                このデッキにはまだカードがありません。
              </p>
              <Link
                to={`/decks/${deckId}/input`}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                カードを追加する
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {cards?.length ?? 0}枚のカードを学習します
              </p>
              <fieldset className="w-full max-w-xs">
                <legend className="text-xs mb-2 text-center w-full" style={{ color: 'var(--text-muted)' }}>
                  出題順
                </legend>
                <div className="flex flex-col gap-1.5">
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
                        className="rounded-lg px-3 py-2 text-left text-sm border transition-colors"
                        style={{
                          background: active ? 'var(--accent)' : 'var(--surface)',
                          color: active ? 'var(--accent-contrast)' : 'var(--text)',
                          borderColor: active ? 'var(--accent)' : 'var(--border)',
                        }}
                      >
                        <span className="font-medium">{opt.label}</span>
                        <span
                          className="block text-xs"
                          style={{ color: active ? 'var(--accent-contrast)' : 'var(--text-muted)', opacity: active ? 0.8 : 1 }}
                        >
                          {opt.hint}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              <button
                onClick={startSession}
                className="rounded-lg px-6 py-3 text-base font-semibold"
                style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
              >
                学習をはじめる
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'playing' && currentCard && (
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>
              ラウンド {Math.min(index + 1, queue.length)}/{queue.length}
            </span>
            <span>
              通算 {Math.min(overallCompleted + 1, overallTotal)}/{overallTotal}
            </span>
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="rounded-lg px-2.5 py-1 font-medium disabled:opacity-30"
              style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
            >
              ↺ 元に戻す
            </button>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full transition-all"
              style={{
                width: `${(index / queue.length) * 100}%`,
                background: 'var(--accent)',
              }}
            />
          </div>
          <div className="flex-1 flex items-center justify-center py-2">
            <FlashCard
              key={currentCard.id}
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={() => setIsFlipped((f) => !f)}
              onJudge={handleJudge}
            />
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
