import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Card } from '../../types'
import { CardForm } from './CardForm'
import { CardList } from './CardList'
import { BulkPanel } from './BulkPanel'

export function InputPage() {
  const { deckId } = useParams<{ deckId: string }>()
  const deck = useLiveQuery(() => (deckId ? db.decks.get(deckId) : undefined), [deckId])
  const [editingCard, setEditingCard] = useState<Card | null>(null)

  if (!deckId) return null

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 flex-1">
      <header className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← デッキ一覧
        </Link>
        <h1 className="text-lg font-bold truncate">{deck?.name ?? ''} の入力</h1>
        <Link
          to={`/decks/${deckId}/flash`}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
        >
          学習へ
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          <CardForm
            deckId={deckId}
            editingCard={editingCard}
            onDoneEditing={() => setEditingCard(null)}
          />
          <BulkPanel deckId={deckId} deckName={deck?.name ?? ''} />
        </div>
        <CardList
          deckId={deckId}
          selectedId={editingCard?.id ?? null}
          onSelect={(card) => setEditingCard(card)}
        />
      </div>
    </div>
  )
}
