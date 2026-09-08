import { useMemo, useState } from 'react'
import type { Card } from '../../types'
import { buildChoices } from '../../lib/choices'
import { SmartImage } from '../common/SmartImage'
import styles from './PracticeCard.module.css'

/** How long the picked answer stays highlighted before advancing, so the
 * right/wrong feedback actually registers. */
const SETTLE_MS = 700
/** テストモード has no right/wrong colors to read — just enough of a pause
 * to confirm the tap landed before the next question appears. */
const SETTLE_MS_NO_FEEDBACK = 300

interface Props {
  card: Card
  /** The rest of the deck, used to draw distractors from. */
  pool: Card[]
  onJudge: (correct: boolean) => void
  /** 学習モード (default) highlights the picked answer green/red before
   * advancing. テストモード passes false: grading still happens the same
   * way underneath, but nothing is revealed mid-round — only the final
   * summary shows the score, once every question has been answered. */
  revealFeedback?: boolean
}

/** 選択肢: pick the right answer out of up to 4 buttons (the correct one
 * plus random distractors from the same deck). Grading is automatic — no
 * self-report needed. Remount this per-card (parent passes
 * `key={card.id}`) so the options are fresh and unpicked each time. */
export function ChoiceCard({ card, pool, onJudge, revealFeedback = true }: Props) {
  const options = useMemo(() => buildChoices(card, pool), [card, pool])
  const [pickedId, setPickedId] = useState<string | null>(null)

  const pick = (opt: (typeof options)[number]) => {
    if (pickedId) return
    setPickedId(opt.id)
    const delay = revealFeedback ? SETTLE_MS : SETTLE_MS_NO_FEEDBACK
    window.setTimeout(() => onJudge(opt.correct), delay)
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

          <div className={styles.choiceGrid}>
            {options.map((opt) => {
              const decided = pickedId !== null
              const isPicked = pickedId === opt.id
              const cls = [
                styles.choiceBtn,
                revealFeedback && decided && opt.correct ? styles.choiceCorrect : '',
                revealFeedback && decided && isPicked && !opt.correct ? styles.choiceIncorrect : '',
                !revealFeedback && isPicked ? styles.choiceSelected : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => pick(opt)}
                  disabled={decided}
                  className={cls}
                >
                  {opt.image && <SmartImage src={opt.image} alt="" className={styles.choiceImage} />}
                  {opt.text && <span>{opt.text}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
