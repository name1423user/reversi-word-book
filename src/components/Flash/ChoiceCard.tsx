import { useMemo, useState } from 'react'
import type { Card } from '../../types'
import { buildChoices } from '../../lib/choices'
import { SmartImage } from '../common/SmartImage'
import styles from './PracticeCard.module.css'

/** How long the picked answer stays highlighted before advancing, so the
 * right/wrong feedback actually registers. */
const SETTLE_MS = 700

interface Props {
  card: Card
  /** The rest of the deck, used to draw distractors from. */
  pool: Card[]
  onJudge: (correct: boolean) => void
}

/** テストモード（4択）: pick the right answer out of up to 4 buttons (the
 * correct one plus random distractors from the same deck). Grading is
 * automatic — no self-report needed. Remount this per-card (parent passes
 * `key={card.id}`) so the options are fresh and unpicked each time. */
export function ChoiceCard({ card, pool, onJudge }: Props) {
  const options = useMemo(() => buildChoices(card, pool), [card, pool])
  const [pickedId, setPickedId] = useState<string | null>(null)

  const pick = (opt: (typeof options)[number]) => {
    if (pickedId) return
    setPickedId(opt.id)
    window.setTimeout(() => onJudge(opt.correct), SETTLE_MS)
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
                decided && opt.correct ? styles.choiceCorrect : '',
                decided && isPicked && !opt.correct ? styles.choiceIncorrect : '',
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
