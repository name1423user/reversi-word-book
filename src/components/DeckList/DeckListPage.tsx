import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../../db'
import type { Deck } from '../../types'
import { computeStreak } from '../../lib/date'
import { deleteImageRefs } from '../../lib/imageStore'
import { useConfirm } from '../common/ConfirmProvider'
import { StorageMeter } from '../common/StorageMeter'
import { StreakCalendar } from '../Streak/StreakCalendar'
import { ThemeToggle } from '../common/ThemeToggle'

export function DeckListPage() {
  const decks = useLiveQuery(() => db.decks.orderBy('createdAt').reverse().toArray(), [])
  const cardCounts = useLiveQuery(async () => {
    const cards = await db.cards.toArray()
    const map = new Map<string, number>()
    for (const c of cards) map.set(c.deckId, (map.get(c.deckId) ?? 0) + 1)
    return map
  }, [])
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const confirm = useConfirm()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const createDeck = async () => {
    const name = newName.trim()
    if (!name) return
    await db.decks.add({ id: newId(), name, createdAt: Date.now() })
    setNewName('')
  }

  const deleteDeck = async (id: string, name: string) => {
    const ok = await confirm({
      title: `「${name}」を削除しますか？`,
      message: 'このデッキのカード・学習履歴もすべて削除されます。この操作は取り消せません。',
      confirmLabel: '削除する',
      danger: true,
    })
    if (!ok) return
    const deckCards = await db.cards.where('deckId').equals(id).toArray()
    await db.transaction('rw', db.decks, db.cards, db.sessions, db.studyDays, async () => {
      await db.decks.delete(id)
      await db.cards.where('deckId').equals(id).delete()
      await db.sessions.where('deckId').equals(id).delete()
      await db.studyDays.where('deckId').equals(id).delete()
    })
    await deleteImageRefs(deckCards.flatMap((c) => [c.frontImage, c.backImage]))
  }

  const commitRename = async (id: string) => {
    const name = renameValue.trim()
    if (name) await db.decks.update(id, { name })
    setRenaming(null)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 flex-1">
      <header className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">📚 単語帳</h1>
        <ThemeToggle />
      </header>
      <div className="flex justify-end mb-4">
        <StorageMeter />
      </div>

      <div className="flex gap-2 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createDeck()}
          placeholder="新しいデッキ名（例：英単語）"
          className="flex-1 rounded-lg px-3 py-2 text-sm border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        />
        <button
          onClick={createDeck}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
        >
          追加
        </button>
      </div>

      {decks?.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>
          まだデッキがありません。上のフォームから作成してください。
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {decks?.map((deck) => (
          <DeckRow
            key={deck.id}
            deck={deck}
            cardCount={cardCounts?.get(deck.id) ?? 0}
            expanded={expanded === deck.id}
            onToggleExpanded={() => setExpanded(expanded === deck.id ? null : deck.id)}
            onDelete={() => deleteDeck(deck.id, deck.name)}
            renaming={renaming === deck.id}
            renameValue={renameValue}
            onStartRename={() => {
              setRenaming(deck.id)
              setRenameValue(deck.name)
            }}
            onRenameChange={setRenameValue}
            onCommitRename={() => commitRename(deck.id)}
          />
        ))}
      </ul>
    </div>
  )
}

function DeckRow({
  deck,
  cardCount,
  expanded,
  onToggleExpanded,
  onDelete,
  renaming,
  renameValue,
  onStartRename,
  onRenameChange,
  onCommitRename,
}: {
  deck: Deck
  cardCount: number
  expanded: boolean
  onToggleExpanded: () => void
  onDelete: () => void
  renaming: boolean
  renameValue: string
  onStartRename: () => void
  onRenameChange: (v: string) => void
  onCommitRename: () => void
}) {
  const studyDates =
    useLiveQuery(
      () => db.studyDays.where('deckId').equals(deck.id).toArray(),
      [deck.id],
    )?.map((s) => s.date) ?? []
  const streak = computeStreak(studyDates)

  return (
    <li
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCommitRename()}
              onBlur={onCommitRename}
              className="rounded px-2 py-1 text-base font-semibold border w-full"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            />
          ) : (
            <button
              className="text-base font-semibold truncate text-left"
              onClick={onStartRename}
              title="名前を編集"
            >
              {deck.name}
            </button>
          )}
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {cardCount}枚 ・ 🔥{streak}日連続
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            to={`/decks/${deck.id}/input`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
          >
            入力
          </Link>
          <Link
            to={`/decks/${deck.id}/flash`}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          >
            学習
          </Link>
          <button
            onClick={onToggleExpanded}
            className="rounded-lg px-2 py-1.5 text-xs"
            style={{ color: 'var(--text-muted)' }}
            aria-label="カレンダーを表示"
          >
            {expanded ? '▲' : '▼'}
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg px-2 py-1.5 text-xs"
            style={{ color: 'var(--danger)' }}
            aria-label="デッキを削除"
          >
            🗑
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <StreakCalendar studyDates={studyDates} />
        </div>
      )}
    </li>
  )
}
