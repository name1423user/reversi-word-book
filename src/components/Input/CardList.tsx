import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../../db'
import type { Card, SortKey } from '../../types'
import { deleteImageRefs, duplicateImageRef } from '../../lib/imageStore'
import { cardStats, difficultyScore } from '../../lib/difficulty'
import { useConfirm } from '../common/ConfirmProvider'
import { useToast } from '../common/ToastProvider'
import { SmartImage } from '../common/SmartImage'

const SORT_LABEL: Record<SortKey, string> = {
  createdDesc: '追加日時（新しい順）',
  createdAsc: '追加日時（古い順）',
  textAsc: 'テキスト（昇順）',
  textDesc: 'テキスト（降順）',
  difficultyDesc: '苦手順',
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
    case 'difficultyDesc':
      return sorted.sort(
        (a, b) => difficultyScore(b) - difficultyScore(a) || b.createdAt - a.createdAt,
      )
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
  const [selectMode, setSelectMode] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const confirm = useConfirm()
  const { reportError } = useToast()

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
    if (!ok) return
    try {
      await db.cards.delete(card.id)
      await deleteImageRefs([card.frontImage, card.backImage])
    } catch (e) {
      reportError(e, 'カードの削除')
    }
  }

  const duplicateCard = async (card: Card) => {
    const now = Date.now()
    try {
      // Copy the blobs too — sharing them would make deleting either card
      // break the image on the other.
      const [frontImage, backImage] = await Promise.all([
        duplicateImageRef(card.frontImage),
        duplicateImageRef(card.backImage),
      ])
      await db.cards.add({
        ...card,
        id: newId(),
        frontImage,
        backImage,
        lastResponseTimeMs: 0,
        history: [],
        createdAt: now,
        updatedAt: now,
      })
    } catch (e) {
      reportError(e, 'カードの複製')
    }
  }

  const toggleChecked = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setChecked(new Set())
  }

  const deleteChecked = async () => {
    const targets = filtered.filter((c) => checked.has(c.id))
    if (targets.length === 0) return
    const ok = await confirm({
      title: `${targets.length}枚のカードを削除しますか？`,
      message: 'この操作は取り消せません。',
      confirmLabel: '削除する',
      danger: true,
    })
    if (!ok) return
    try {
      await db.cards.bulkDelete(targets.map((c) => c.id))
      await deleteImageRefs(targets.flatMap((c) => [c.frontImage, c.backImage]))
    } catch (e) {
      reportError(e, 'カードの削除')
      return
    }
    exitSelectMode()
  }

  const allVisibleChecked = filtered.length > 0 && filtered.every((c) => checked.has(c.id))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="表・裏のテキストで検索"
          className="q-field flex-1"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="q-field"
          style={{ width: 'auto' }}
        >
          {Object.entries(SORT_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length}枚 {query && `（全${cards?.length ?? 0}枚中）`}
        </p>
        {selectMode ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setChecked(allVisibleChecked ? new Set() : new Set(filtered.map((c) => c.id)))
              }
              className="q-btn q-btn-ghost q-btn-sm"
              style={{ color: 'var(--accent)' }}
            >
              {allVisibleChecked ? '全解除' : '全選択'}
            </button>
            <button
              onClick={deleteChecked}
              disabled={checked.size === 0}
              className="q-btn q-btn-danger q-btn-sm"
            >
              {checked.size}枚を削除
            </button>
            <button onClick={exitSelectMode} className="q-btn q-btn-ghost q-btn-sm">
              やめる
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSelectMode(true)}
            className="q-btn q-btn-ghost q-btn-sm"
          >
            選択して削除
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-0.5">
        {filtered.map((card) => {
          const stats = cardStats(card)
          return (
            <li
              key={card.id}
              className="q-card p-3 flex gap-3 cursor-pointer"
              style={
                selectedId === card.id
                  ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
                  : undefined
              }
              onClick={() => (selectMode ? toggleChecked(card.id) : onSelect(card))}
            >
              {selectMode && (
                <input
                  type="checkbox"
                  checked={checked.has(card.id)}
                  onChange={() => toggleChecked(card.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="self-start mt-1 shrink-0"
                  aria-label="このカードを選択"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="grid grid-cols-2">
                  <div className="pr-3">
                    <CardFace text={card.front} image={card.frontImage} label="表" />
                  </div>
                  <div className="pl-3" style={{ borderLeft: '1px solid var(--border)' }}>
                    <CardFace text={card.back} image={card.backImage} label="裏" />
                  </div>
                </div>
                {stats.attempts > 0 && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    正答 {stats.correct}/{stats.attempts}（
                    {Math.round((stats.accuracy ?? 0) * 100)}%）
                  </p>
                )}
              </div>
              {!selectMode && (
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      duplicateCard(card)
                    }}
                    className="q-btn q-btn-ghost q-btn-sm"
                    style={{ padding: '0.25rem 0.4rem' }}
                    aria-label="カードを複製"
                    title="複製"
                  >
                    <CopyIcon />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteCard(card)
                    }}
                    className="q-btn q-btn-ghost q-btn-sm"
                    style={{ padding: '0.25rem 0.4rem', color: 'var(--danger)' }}
                    aria-label="カードを削除"
                    title="削除"
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </li>
          )
        })}
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
      <span className="q-label">{label}</span>
      {image && (
        <SmartImage src={image} alt={label} className="w-full h-16 object-cover rounded mt-1" />
      )}
      <p className="text-sm font-medium truncate mt-0.5">{text || (image ? '' : '(空)')}</p>
    </div>
  )
}

/* Inline icons: emoji and the ⧉ glyph fall back to tofu in some system fonts,
   and they can't inherit the button's colour. */
function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
