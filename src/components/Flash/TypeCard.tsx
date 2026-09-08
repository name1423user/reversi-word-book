import { useState } from 'react'
import type { Card } from '../../types'
import { answersMatch } from '../../lib/gradeAnswer'
import { SmartImage } from '../common/SmartImage'
import styles from './PracticeCard.module.css'

/** How long the "回答を記録しました" confirmation stays up in autoGrade
 * mode before advancing — just enough to register the submit landed. */
const SUBMIT_SETTLE_MS = 400

interface Props {
  card: Card
  onJudge: (correct: boolean) => void
  /** テストモード: grade the typed answer automatically (lenient text
   * compare) and never reveal the correct answer mid-round — the point is
   * to see the score only after every question is answered. 学習モード
   * (the default) instead reveals the correct answer immediately and lets
   * the user self-judge ○/✕. */
  autoGrade?: boolean
}

/** Type an answer, then either self-judge against the reveal (学習モード)
 * or get graded automatically with no reveal (テストモード). Remount this
 * per-card (parent passes `key={card.id}`) so the input always starts
 * empty. */
export function TypeCard({ card, onJudge, autoGrade = false }: Props) {
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const submit = () => {
    if (revealed || submitted) return
    if (autoGrade) {
      setSubmitted(true)
      window.setTimeout(() => onJudge(answersMatch(answer, card.back)), SUBMIT_SETTLE_MS)
    } else {
      setRevealed(true)
    }
  }

  return (
    <div className={styles.stage}>
      <div className={styles.face}>
        <span className={styles.faceLabel}>表</span>
        <div className={styles.faceContent}>
          {card.frontImage && (
            <SmartImage src={card.frontImage} alt="" className={styles.faceImage} />
          )}
          {card.front && <p className={styles.faceText}>{card.front}</p>}

          {submitted ? (
            <p className={styles.revealAnswer} style={{ color: 'var(--text-muted)' }}>
              回答を記録しました
            </p>
          ) : !revealed ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
              className={styles.answerForm}
            >
              <input
                autoFocus
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="答えを入力"
                aria-label="答えを入力"
                className="q-field text-center"
              />
              <button type="submit" className="q-btn q-btn-primary">
                回答する
              </button>
            </form>
          ) : (
            <div className={styles.reveal}>
              <div className={styles.revealSection}>
                <p className="q-label">あなたの回答</p>
                <p className={styles.revealAnswer}>{answer.trim() || '（未回答）'}</p>
              </div>
              <div className={styles.revealSection}>
                <p className="q-label">正解</p>
                {card.backImage && (
                  <SmartImage src={card.backImage} alt="" className={styles.faceImage} />
                )}
                <p className={styles.revealAnswer}>{card.back || '(画像のみ)'}</p>
              </div>
              <div className="flex items-center justify-center gap-3 mt-1">
                <button
                  onClick={() => onJudge(false)}
                  className="q-btn"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                >
                  ✕ 不正解
                </button>
                <button
                  onClick={() => onJudge(true)}
                  className="q-btn"
                  style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                >
                  ○ 正解
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
