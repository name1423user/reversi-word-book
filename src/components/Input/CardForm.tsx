import { useEffect, useRef, useState } from 'react'
import { db, newId } from '../../db'
import type { Card } from '../../types'
import { useDraft } from '../../hooks/useDraft'
import { draftKeyFor } from '../../lib/draft'
import { useToast } from '../common/ToastProvider'
import { ImageDropZone } from './ImageDropZone'

interface DraftShape {
  front: string
  frontImage: string | null
  back: string
  backImage: string | null
}

const EMPTY: DraftShape = { front: '', frontImage: null, back: '', backImage: null }

export function CardForm({
  deckId,
  editingCard,
  onDoneEditing,
}: {
  deckId: string
  editingCard: Card | null
  onDoneEditing: () => void
}) {
  const { reportError } = useToast()
  const draftKey = draftKeyFor(deckId)
  const [draft, setDraft, clearDraft] = useDraft<DraftShape>(draftKey, EMPTY)
  const [edit, setEdit] = useState<DraftShape>(EMPTY)
  const frontRef = useRef<HTMLTextAreaElement>(null)
  // Guards against a second submit landing before the first finishes: both
  // would read the same draft and create two cards pointing at one image
  // blob, so deleting either would blank the other's image.
  const submitting = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pending debounced write, keyed by the card id it targets — independent
  // of whichever card is currently selected, so switching cards can never
  // clobber a still-pending write for the *previous* one (a real bug this
  // fixes: editing card A, switching to card B within the 500ms debounce
  // window, and editing B used to cancel A's unsaved timer outright).
  const pendingSave = useRef<{ id: string; data: DraftShape } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushPendingSave = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (pendingSave.current) {
      const { id, data } = pendingSave.current
      pendingSave.current = null
      // `reportError` is referentially stable, so the unmount-time flush
      // (captured on first render) still reports through the live provider.
      db.cards
        .update(id, { ...data, updatedAt: Date.now() })
        .catch((e) => reportError(e, '変更の保存'))
    }
  }

  // Load the selected card into the edit buffer whenever selection changes,
  // flushing any not-yet-written edit on the card we're navigating away from.
  useEffect(() => {
    flushPendingSave()
    if (editingCard) {
      setEdit({
        front: editingCard.front,
        frontImage: editingCard.frontImage,
        back: editingCard.back,
        backImage: editingCard.backImage,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCard?.id])

  // Flush on unmount too (e.g. navigating away from the input page). This
  // deliberately runs only on unmount: `flushPendingSave` reads everything it
  // needs from refs, so the first render's closure stays correct.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flushPendingSave(), [])

  const current = editingCard ? edit : draft
  const setCurrent = (updater: (prev: DraftShape) => DraftShape) => {
    if (editingCard) {
      setEdit((prev) => {
        const next = updater(prev)
        pendingSave.current = { id: editingCard.id, data: next }
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(flushPendingSave, 500)
        return next
      })
    } else {
      setDraft(updater)
    }
  }

  const isEmpty = (d: DraftShape) => !d.front.trim() && !d.frontImage && !d.back.trim() && !d.backImage

  const submitNew = async () => {
    if (isEmpty(draft) || submitting.current) return
    submitting.current = true
    setIsSubmitting(true)
    const now = Date.now()
    const card: Card = {
      id: newId(),
      deckId,
      front: draft.front.trim(),
      frontImage: draft.frontImage,
      back: draft.back.trim(),
      backImage: draft.backImage,
      lastResponseTimeMs: 0,
      history: [],
      createdAt: now,
      updatedAt: now,
    }
    try {
      await db.cards.add(card)
    } catch (e) {
      reportError(e, 'カードの登録')
      return
    } finally {
      submitting.current = false
      setIsSubmitting(false)
    }
    clearDraft()
    setDraft(() => EMPTY)
    frontRef.current?.focus()
  }

  const finishEditing = () => {
    flushPendingSave()
    onDoneEditing()
  }

  return (
    <div className="q-card p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold">
          {editingCard ? 'カードを編集' : 'カードを追加'}
        </h2>
        {editingCard && (
          <button onClick={finishEditing} className="q-btn q-btn-ghost q-btn-sm" style={{ color: 'var(--accent)' }}>
            編集を終了
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <span className="q-label">表（おもて）</span>
          <textarea
            ref={frontRef}
            value={current.front}
            onChange={(e) => setCurrent((p) => ({ ...p, front: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !editingCard) {
                e.preventDefault()
                submitNew()
              }
            }}
            placeholder="表面のテキスト"
            rows={3}
            className="q-field q-field-underline resize-none"
          />
          <ImageDropZone
            label="表"
            value={current.frontImage}
            onChange={(v) => setCurrent((p) => ({ ...p, frontImage: v }))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="q-label">裏（うら）</span>
          <textarea
            value={current.back}
            onChange={(e) => setCurrent((p) => ({ ...p, back: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !editingCard) {
                e.preventDefault()
                submitNew()
              }
            }}
            placeholder="裏面のテキスト"
            rows={3}
            className="q-field q-field-underline resize-none"
          />
          <ImageDropZone
            label="裏"
            value={current.backImage}
            onChange={(v) => setCurrent((p) => ({ ...p, backImage: v }))}
          />
        </div>
      </div>

      {!editingCard && (
        <div className="flex items-center gap-3">
          <button
            onClick={submitNew}
            disabled={isEmpty(draft) || isSubmitting}
            className="q-btn q-btn-primary"
          >
            このカードを登録（Enter）
          </button>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            下書きは自動保存されます
          </span>
        </div>
      )}
      {editingCard && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          変更は自動的に保存されます
        </p>
      )}
    </div>
  )
}
