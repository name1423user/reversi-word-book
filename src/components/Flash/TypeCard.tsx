import { useState } from 'react'
import type { Card } from '../../types'
import { SmartImage } from '../common/SmartImage'
import styles from './PracticeCard.module.css'

interface Props {
  card: Card
  onJudge: (correct: boolean) => void
}

/** 学習モード: type an answer, submit, then compare it against the real
 * answer and self-judge ○/✕ — like FlashCard's flip, but recall is forced
 * by typing instead of just recognizing the back of the card. Remount this
 * per-card (parent passes `key={card.id}`) so the input always starts
 * empty. */
export function TypeCard({ card, onJudge }: Props) {
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)

  return (
    <div className={styles.stage}>
      <div className={styles.face}>
        <span className={styles.faceLabel}>表</span>
        <div className={styles.faceContent}>
          {card.frontImage && (
            <SmartImage src={card.frontImage} alt="" className={styles.faceImage} />
          )}
          {card.front && <p className={styles.faceText}>{card.front}</p>}

          {!revealed ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setRevealed(true)
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
