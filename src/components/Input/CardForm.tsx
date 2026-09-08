import { useEffect, useRef, useState } from 'react'
import { db, newId } from '../../db'
import type { Card } from '../../types'
import { useDraft } from '../../hooks/useDraft'
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
  const draftKey = `wordbook:draft:${deckId}`
  const [draft, setDraft, clearDraft] = useDraft<DraftShape>(draftKey, EMPTY)
  const [edit, setEdit] = useState<DraftShape>(EMPTY)
  const frontRef = useRef<HTMLTextAreaElement>(null)
  const editSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load the selected card into the edit buffer whenever selection changes.
  useEffect(() => {
    if (editingCard) {
      setEdit({
        front: editingCard.front,
        frontImage: editingCard.frontImage,
        back: editingCard.back,
        backImage: editingCard.backImage,
      })
    }
  }, [editingCard])

  const current = editingCard ? edit : draft
  const setCurrent = (updater: (prev: DraftShape) => DraftShape) => {
    if (editingCard) {
      setEdit((prev) => {
        const next = updater(prev)
        if (editSaveTimer.current) clearTimeout(editSaveTimer.current)
        editSaveTimer.current = setTimeout(() => {
          db.cards.update(editingCard.id, { ...next, updatedAt: Date.now() })
        }, 500)
        return next
      })
    } else {
      setDraft(updater)
    }
  }

  const isEmpty = (d: DraftShape) => !d.front.trim() && !d.frontImage && !d.back.trim() && !d.backImage

  const submitNew = async () => {
    if (isEmpty(draft)) return
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
    await db.cards.add(card)
    clearDraft()
    setDraft(() => EMPTY)
    frontRef.current?.focus()
  }

  const finishEditing = () => {
    if (editSaveTimer.current) clearTimeout(editSaveTimer.current)
    if (editingCard) {
      db.cards.update(editingCard.id, { ...edit, updatedAt: Date.now() })
    }
    onDoneEditing()
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-4"
      style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{editingCard ? 'カードを編集' : 'カードを追加'}</h2>
        {editingCard && (
          <button
            onClick={finishEditing}
            className="text-xs font-medium"
            style={{ color: 'var(--accent)' }}
          >
            編集を終了
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            表（おもて）
          </span>
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
            className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
          />
          <ImageDropZone
            label="表"
            value={current.frontImage}
            onChange={(v) => setCurrent((p) => ({ ...p, frontImage: v }))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            裏（うら）
          </span>
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
            className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
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
            disabled={isEmpty(draft)}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
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
