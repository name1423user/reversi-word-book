import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import type { Card, SortKey } from '../../types'
import { useConfirm } from '../common/ConfirmProvider'
import { SmartImage } from '../common/SmartImage'

const SORT_LABEL: Record<SortKey, string> = {
  createdDesc: '追加日時（新しい順）',
  createdAsc: '追加日時（古い順）',
  textAsc: 'テキスト（昇順）',
  textDesc: 'テキスト（降順）',
}

function sortCards(cards: Card[], key: SortKey): Card[] {
  const sorted = [...cards]
  switch (key) {
    case 'createdAsc':
      return sorted.sort((a, b) => a.createdAt - b.createdAt)
    case 'textAsc':
      return sorted.sort((a, b) => a.front.localeCompare(b.front, 'ja'))
    case 'textDesc':
      return sorted.sort((a, b) => b.front.localeCompare(a.front, 'ja'))
    case 'createdDesc':
    default:
      return sorted.sort((a, b) => b.createdAt - a.createdAt)
  }
}

export function CardList({
  deckId,
  selectedId,
  onSelect,
}: {
  deckId: string
  selectedId: string | null
  onSelect: (card: Card) => void
}) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('createdDesc')
  const confirm = useConfirm()

  const cards = useLiveQuery(
    () => db.cards.where('deckId').equals(deckId).toArray(),
    [deckId],
  )

  const filtered = useMemo(() => {
    if (!cards) return []
    const q = query.trim().toLowerCase()
    const matched = q
      ? cards.filter(
          (c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q),
        )
      : cards
    return sortCards(matched, sortKey)
  }, [cards, query, sortKey])

  const deleteCard = async (card: Card) => {
    const ok = await confirm({
      title: 'このカードを削除しますか？',
      message: `「${card.front || '(画像のみ)'}」を削除します。`,
      confirmLabel: '削除する',
      danger: true,
    })
    if (ok) await db.cards.delete(card.id)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="表・裏のテキストで検索"
          className="flex-1 rounded-lg px-3 py-2 text-sm border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg px-2 py-2 text-sm border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {Object.entries(SORT_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {filtered.length}枚 {query && `（全${cards?.length ?? 0}枚中）`}
      </p>

      <ul className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-0.5">
        {filtered.map((card) => (
          <li
            key={card.id}
            className="rounded-lg p-2.5 flex gap-2 cursor-pointer border"
            style={{
              background: selectedId === card.id ? 'var(--surface-2)' : 'var(--surface)',
              borderColor: selectedId === card.id ? 'var(--accent)' : 'var(--border)',
            }}
            onClick={() => onSelect(card)}
          >
            <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
              <CardFace text={card.front} image={card.frontImage} label="表" />
              <CardFace text={card.back} image={card.backImage} label="裏" />
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                deleteCard(card)
              }}
              className="self-start shrink-0 text-xs px-1.5 py-1 rounded"
              style={{ color: 'var(--danger)' }}
              aria-label="カードを削除"
            >
              🗑
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
            カードがありません
          </li>
        )}
      </ul>
    </div>
  )
}

function CardFace({ text, image, label }: { text: string; image: string | null; label: string }) {
  return (
    <div className="min-w-0">
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      {image && (
        <SmartImage src={image} alt={label} className="w-full h-14 object-cover rounded mt-0.5" />
      )}
      <p className="text-xs truncate mt-0.5">{text || (image ? '' : '(空)')}</p>
    </div>
  )
}
