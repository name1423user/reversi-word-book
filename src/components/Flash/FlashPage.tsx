import { useMemo, useRef, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../../db'
import type { AnswerFormat, Card, SessionMode, SessionResult, StudyOrder } from '../../types'
import { shuffled } from '../../lib/shuffle'
import { byDifficulty } from '../../lib/difficulty'
import { choiceModeAvailable } from '../../lib/choices'
import { todayKey } from '../../lib/date'
import { useToast } from '../common/ToastProvider'
import { FlashCard } from './FlashCard'
import { TypeCard } from './TypeCard'
import { ChoiceCard } from './ChoiceCard'
import { SummaryScreen } from './SummaryScreen'
import { FirstTimeGuide } from './FirstTimeGuide'
import type { RoundJudgment, RoundResult } from './flashTypes'

const GUIDE_KEY = 'wordbook:seenFlashGuide'
const ORDER_KEY = 'wordbook:studyOrder'
const MODE_KEY = 'wordbook:sessionMode'
const FORMAT_KEY = 'wordbook:answerFormat'
const TEST_COUNT_KEY = 'wordbook:testCount'
const DEFAULT_TEST_COUNT = 10

type Phase = 'setup' | 'playing' | 'summary'

const ORDER_OPTIONS: { value: StudyOrder; label: string; hint: string }[] = [
  { value: 'shuffle', label: 'シャッフル', hint: '毎回ランダムな順番' },
  { value: 'sequential', label: '順番どおり', hint: '追加した順に出題' },
  { value: 'difficulty', label: '苦手優先', hint: '間違えたカードから出題' },
]

const MODE_OPTIONS: { value: SessionMode; label: string; hint: string }[] = [
  { value: 'flip', label: 'めくって確認', hint: 'カードをめくって自己採点' },
  { value: 'study', label: '学習モード', hint: 'すべてのカードを出題' },
  { value: 'test', label: 'テストモード', hint: '好きな問題数をランダム出題' },
]

/** 学習モード・テストモードいずれでも選べる回答方式。 */
const FORMAT_OPTIONS: { value: AnswerFormat; label: string; hint: string }[] = [
  { value: 'type', label: '入力', hint: '答えを入力して確認' },
  { value: 'choice', label: '選択肢', hint: '4択から選ぶ' },
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

function loadSessionMode(): SessionMode {
  const saved = localStorage.getItem(MODE_KEY)
  return saved === 'flip' || saved === 'study' || saved === 'test' ? saved : 'flip'
}

function loadAnswerFormat(): AnswerFormat {
  const saved = localStorage.getItem(FORMAT_KEY)
  return saved === 'type' || saved === 'choice' ? saved : 'type'
}

function loadTestCount(): number {
  const saved = Number(localStorage.getItem(TEST_COUNT_KEY))
  return Number.isFinite(saved) && saved > 0 ? Math.floor(saved) : DEFAULT_TEST_COUNT
}

function clampTestCount(count: number, deckSize: number): number {
  return Math.min(Math.max(1, Math.floor(count) || 1), Math.max(1, deckSize))
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
  const [sessionMode, setSessionMode] = useState<SessionMode>(loadSessionMode)
  const [answerFormat, setAnswerFormat] = useState<AnswerFormat>(loadAnswerFormat)
  const [testCount, setTestCount] = useState<number>(loadTestCount)
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

  // 選択肢（4択）needs at least two distinct answers in the deck to build a
  // real question. Fall back to 入力 rather than offering a format that
  // can't actually ask anything.
  const choiceAvailable = useMemo(() => choiceModeAvailable(cards ?? []), [cards])
  const activeFormat: AnswerFormat = answerFormat === 'choice' && !choiceAvailable ? 'type' : answerFormat
  const deckSize = cards?.length ?? 0
  const effectiveTestCount = clampTestCount(testCount, deckSize)

  /** 学習モード/めくって確認 quiz the whole deck in the chosen order;
   * テストモード draws a random subset sized by the user instead. */
  const buildQueue = (): Card[] => {
    if (!cards || cards.length === 0) return []
    if (sessionMode === 'test') return shuffled(cards).slice(0, clampTestCount(testCount, cards.length))
    return applyOrder(cards, studyOrder)
  }

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
    const q = buildQueue()
    if (q.length === 0) return
    setOverallCompleted(0)
    setOverallTotal(0)
    setFrozenBaseline(latestPrimarySession)
    beginRound(q, 1, q.length)
    // The guide only covers めくって確認's swipe/tap gestures, so it's
    // irrelevant (and shouldn't get marked "seen") in the other modes.
    if (sessionMode === 'flip' && !localStorage.getItem(GUIDE_KEY)) {
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
    // テストモード re-rolls a fresh random subset, same as a first start —
    // reusing the just-finished round's cards would defeat "test again".
    const q = buildQueue()
    if (q.length === 0) {
      setPhase('setup')
      return
    }
    setOverallCompleted(0)
    setOverallTotal(0)
    setFrozenBaseline(latestPrimarySession)
    beginRound(q, 1, q.length)
  }

  const finishSession = () => {
    setPhase('setup')
  }

  useEffect(() => {
    // Arrow/space judging is めくって確認-only: 学習モード has a text input
    // to type into, and テストモード is judged by clicking an option, so
    // hijacking arrow keys there would fight the user rather than help.
    if (phase !== 'playing' || sessionMode !== 'flip') return
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
  }, [phase, sessionMode, queue, index])

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
        {phase === 'playing' && sessionMode === 'flip' && (
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
                <p className="text-3xl font-extrabold">
                  {sessionMode === 'test' ? effectiveTestCount : (cards?.length ?? 0)}問
                </p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {sessionMode === 'test'
                    ? `全${deckSize}枚からランダムに出題します`
                    : 'のカードを学習します'}
                </p>
              </div>
              <fieldset className="w-full max-w-md">
                <legend className="q-label mb-2 w-full text-center">モード</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {MODE_OPTIONS.map((opt) => {
                    const active = sessionMode === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setSessionMode(opt.value)
                          localStorage.setItem(MODE_KEY, opt.value)
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

              {sessionMode !== 'flip' && (
                <fieldset className="w-full max-w-md">
                  <legend className="q-label mb-2 w-full text-center">回答方式</legend>
                  <div className="grid gap-2 grid-cols-2">
                    {FORMAT_OPTIONS.map((opt) => {
                      const active = answerFormat === opt.value
                      const disabled = opt.value === 'choice' && !choiceAvailable
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setAnswerFormat(opt.value)
                            localStorage.setItem(FORMAT_KEY, opt.value)
                          }}
                          disabled={disabled}
                          aria-pressed={active}
                          className="q-tile px-3 py-3 text-center"
                          style={
                            disabled
                              ? { opacity: 0.5, cursor: 'not-allowed' }
                              : active
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
                            style={{ color: !disabled && active ? 'var(--accent)' : 'var(--text)' }}
                          >
                            {opt.label}
                          </span>
                          <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {disabled ? '答えの種類が2つ以上必要です' : opt.hint}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )}

              {sessionMode === 'test' ? (
                <fieldset className="w-full max-w-md">
                  <legend className="q-label mb-2 w-full text-center">問題数</legend>
                  <div className="flex items-center justify-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={deckSize}
                      value={testCount}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        setTestCount(n)
                        localStorage.setItem(TEST_COUNT_KEY, String(n))
                      }}
                      className="q-field text-center"
                      style={{ width: '6rem' }}
                      aria-label="問題数"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      問（最大{deckSize}問）
                    </span>
                    <button
                      onClick={() => {
                        setTestCount(deckSize)
                        localStorage.setItem(TEST_COUNT_KEY, String(deckSize))
                      }}
                      className="q-btn q-btn-ghost q-btn-sm"
                    >
                      全部
                    </button>
                  </div>
                </fieldset>
              ) : (
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
              )}
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
            {sessionMode === 'flip' && (
              <FlashCard
                key={currentCard.id}
                card={currentCard}
                isFlipped={isFlipped}
                onFlip={() => setIsFlipped((f) => !f)}
                onJudge={handleJudge}
              />
            )}
            {sessionMode !== 'flip' && activeFormat === 'type' && (
              <TypeCard key={currentCard.id} card={currentCard} onJudge={handleJudge} />
            )}
            {sessionMode !== 'flip' && activeFormat === 'choice' && (
              <ChoiceCard
                key={currentCard.id}
                card={currentCard}
                pool={cards ?? []}
                onJudge={handleJudge}
              />
            )}
          </div>

          {/* Bottom control bar: judge either side, flip in the middle.
              学習モード/テストモード judge from inside their own card
              (typed self-check / choice click), so this bar is めくって
              確認-only. */}
          {sessionMode === 'flip' && (
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
          )}

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
