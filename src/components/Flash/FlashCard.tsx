import { useRef, useState } from 'react'
import type { Card } from '../../types'
import { SmartImage } from '../common/SmartImage'
import styles from './FlashCard.module.css'

const SWIPE_THRESHOLD = 90
const EDGE_ZONE_RATIO = 0.18
const FLY_DISTANCE = 700
const SETTLE_MS = 240

interface Props {
  card: Card
  isFlipped: boolean
  onFlip: () => void
  onJudge: (correct: boolean) => void
}

/** One flashcard: tap center to flip, tap/drag the edges to judge. Remount
 * this component per-card (parent passes `key={card.id}`) so drag/flip
 * state always starts fresh. */
export function FlashCard({ card, isFlipped, onFlip, onJudge }: Props) {
  const [dx, setDx] = useState(0)
  const [settling, setSettling] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; moved: boolean; active: boolean }>({
    startX: 0,
    startY: 0,
    moved: false,
    active: false,
  })
  const committed = useRef(false)

  const commitJudge = (correct: boolean) => {
    if (committed.current) return
    committed.current = true
    setSettling(true)
    setDx(correct ? FLY_DISTANCE : -FLY_DISTANCE)
    setTimeout(() => onJudge(correct), SETTLE_MS)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (committed.current) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, moved: false, active: true }
    setSettling(false)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragState.current
    if (!s.active || committed.current) return
    const deltaX = e.clientX - s.startX
    const deltaY = e.clientY - s.startY
    if (!s.moved && Math.hypot(deltaX, deltaY) > 6) s.moved = true
    if (s.moved) setDx(deltaX)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const s = dragState.current
    s.active = false
    if (committed.current) return

    if (s.moved) {
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        commitJudge(dx > 0)
      } else {
        setSettling(true)
        setDx(0)
      }
      return
    }

    // Plain tap: decide by horizontal zone within the card.
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    const relX = e.clientX - rect.left
    if (relX < rect.width * EDGE_ZONE_RATIO) {
      commitJudge(false)
    } else if (relX > rect.width * (1 - EDGE_ZONE_RATIO)) {
      commitJudge(true)
    } else {
      onFlip()
    }
  }

  const overlayOpacity = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD)
  const rot = Math.max(-12, Math.min(12, dx / 18))

  return (
    <div ref={stageRef} className={styles.stage}>
      <span className={`${styles.hint} ${styles.hintLeft}`}>✕ 不正解</span>
      <span className={`${styles.hint} ${styles.hintRight}`}>正解 ○</span>
      <div
        className={`${styles.dragLayer} ${settling ? styles.settling : ''}`}
        style={{ '--dx': `${dx}px`, '--rot': `${rot}deg` } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {overlayOpacity > 0 && (
          <div
            className={`${styles.overlay} ${dx > 0 ? styles.overlayCorrect : styles.overlayIncorrect}`}
            style={{ '--overlay-opacity': overlayOpacity } as React.CSSProperties}
          >
            {dx > 0 ? '○' : '✕'}
          </div>
        )}
        <div className={`${styles.flipInner} ${isFlipped ? styles.flipped : ''}`}>
          <div className={styles.face}>
            <Face text={card.front} image={card.frontImage} />
          </div>
          <div className={`${styles.face} ${styles.back}`}>
            <Face text={card.back} image={card.backImage} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Face({ text, image }: { text: string; image: string | null }) {
  return (
    <div className={styles.faceContent}>
      {image && <SmartImage src={image} alt="" className={styles.faceImage} />}
      {text && <p className={styles.faceText}>{text}</p>}
    </div>
  )
}
