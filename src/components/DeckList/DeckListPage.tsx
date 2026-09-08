import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../../db'
import type { Deck, DeckSortKey } from '../../types'
import { computeStreak } from '../../lib/date'
import { deleteImageRefs } from '../../lib/imageStore'
import {
  buildCards,
  downloadJson,
  exportAllDecks,
  exportDeck,
  exportFilename,
  formatBytes,
  parseImportJson,
} from '../../lib/exportImport'
import { useConfirm } from '../common/ConfirmProvider'
import { useToast } from '../common/ToastProvider'
import { StorageMeter } from '../common/StorageMeter'
import { StorageSafetyBanner } from '../common/StorageSafetyBanner'
import { StreakCalendar } from '../Streak/StreakCalendar'
import { ThemeToggle } from '../common/ThemeToggle'
import { OverviewPanel } from './OverviewPanel'

const SORT_KEY_STORAGE = 'wordbook:deckSort'

const DECK_SORT_LABEL: Record<DeckSortKey, string> = {
  manual: '手動（↑↓で並び替え）',
  createdDesc: '作成日（新しい順）',
  nameAsc: '名前順',
  countDesc: 'カード枚数順',
}

function loadDeckSort(): DeckSortKey {
  const saved = localStorage.getItem(SORT_KEY_STORAGE)
  return saved === 'manual' || saved === 'createdDesc' || saved === 'nameAsc' || saved === 'countDesc'
    ? saved
    : 'manual'
}

export function DeckListPage() {
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const cardCounts = useLiveQuery(async () => {
    const cards = await db.cards.toArray()
    const map = new Map<string, number>()
    for (const c of cards) map.set(c.deckId, (map.get(c.deckId) ?? 0) + 1)
    return map
  }, [])
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<DeckSortKey>(loadDeckSort)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const confirm = useConfirm()
  const toast = useToast()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const backupFileRef = useRef<HTMLInputElement>(null)

  const sortedDecks = useMemo(() => {
    if (!decks) return []
    const list = [...decks]
    switch (sortKey) {
      case 'createdDesc':
        return list.sort((a, b) => b.createdAt - a.createdAt)
      case 'nameAsc':
        return list.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      case 'countDesc':
        return list.sort(
          (a, b) => (cardCounts?.get(b.id) ?? 0) - (cardCounts?.get(a.id) ?? 0),
        )
      case 'manual':
      default:
        return list.sort((a, b) => a.order - b.order)
    }
  }, [decks, sortKey, cardCounts])

  const changeSort = (key: DeckSortKey) => {
    setSortKey(key)
    localStorage.setItem(SORT_KEY_STORAGE, key)
  }

  const createDeck = async () => {
    const name = newName.trim()
    if (!name) return
    const now = Date.now()
    // New decks go to the top of the manual order.
    const minOrder = decks?.reduce((min, d) => Math.min(min, d.order), Infinity) ?? 0
    const order = Number.isFinite(minOrder) ? minOrder - 1 : now
    try {
      await db.decks.add({ id: newId(), name, createdAt: now, order })
      setNewName('')
    } catch (e) {
      toast.reportError(e, 'デッキの作成')
    }
  }

  /** Swap manual order with the neighbouring deck in the given direction. */
  const moveDeck = async (deck: Deck, direction: -1 | 1) => {
    const index = sortedDecks.findIndex((d) => d.id === deck.id)
    const neighbour = sortedDecks[index + direction]
    if (!neighbour) return
    try {
      await db.transaction('rw', db.decks, async () => {
        await db.decks.update(deck.id, { order: neighbour.order })
        await db.decks.update(neighbour.id, { order: deck.order })
      })
    } catch (e) {
      toast.reportError(e, 'デッキの並び替え')
    }
  }

  const exportOneDeck = async (deck: Deck) => {
    const report = await exportDeck(deck.id, { mode: 'backup', fetchExternal: true })
    downloadJson(report.json, exportFilename(deck.name, 'backup'))
    return report
  }

  const deleteDeck = async (deck: Deck) => {
    const ok = await confirm({
      title: `「${deck.name}」を削除しますか？`,
      message: 'このデッキのカード・学習履歴もすべて削除されます。この操作は取り消せません。',
      confirmLabel: '削除する',
      danger: true,
      extraAction: {
        label: '⬇ 先にJSONで書き出す',
        run: () => exportOneDeck(deck).then(() => undefined),
      },
    })
    if (!ok) return
    try {
      const deckCards = await db.cards.where('deckId').equals(deck.id).toArray()
      await db.transaction('rw', db.decks, db.cards, db.sessions, db.studyDays, async () => {
        await db.decks.delete(deck.id)
        await db.cards.where('deckId').equals(deck.id).delete()
        await db.sessions.where('deckId').equals(deck.id).delete()
        await db.studyDays.where('deckId').equals(deck.id).delete()
      })
      await deleteImageRefs(deckCards.flatMap((c) => [c.frontImage, c.backImage]))
    } catch (e) {
      toast.reportError(e, 'デッキの削除')
    }
  }

  const commitRename = async (id: string) => {
    const name = renameValue.trim()
    try {
      if (name) await db.decks.update(id, { name })
    } catch (e) {
      toast.reportError(e, 'デッキ名の変更')
    }
    setRenaming(null)
  }

  const exportBackup = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const report = await exportAllDecks({ mode: 'backup', fetchExternal: true })
      downloadJson(
        report.json,
        exportFilename(`wordbook-${new Date().toISOString().slice(0, 10)}`, 'backup'),
      )
      const parts = [
        `全${report.cardCount}枚を書き出しました（${formatBytes(report.byteSize)}）`,
      ]
      if (report.externalNotFetched > 0) {
        parts.push(`外部URLの画像${report.externalNotFetched}件はリンクのまま`)
      }
      setNotice(parts.join(' / '))
    } catch (e) {
      toast.reportError(e, 'バックアップの書き出し')
    } finally {
      setBusy(false)
    }
  }

  const importBackup = async (text: string) => {
    setNotice(null)
    let parsed
    try {
      parsed = parseImportJson(text)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '解析に失敗しました')
      return
    }

    const ok = await confirm({
      title: 'バックアップを読み込みますか？',
      message: `${parsed.decks.length}個のデッキ（${parsed.totalCards}枚）を新しいデッキとして追加します。既存のデッキはそのまま残ります。`,
      confirmLabel: '読み込む',
    })
    if (!ok) return

    setBusy(true)
    try {
      let addedDecks = 0
      let addedCards = 0
      const warnings: string[] = []
      const baseOrder = decks?.reduce((min, d) => Math.min(min, d.order), 0) ?? 0
      for (let i = 0; i < parsed.decks.length; i++) {
        const entry = parsed.decks[i]
        const now = Date.now()
        const deckId = newId()
        await db.decks.add({
          id: deckId,
          name: entry.name || `読み込んだデッキ${i + 1}`,
          createdAt: now,
          order: baseOrder - parsed.decks.length + i,
        })
        addedDecks++
        const { cards, warnings: w } = await buildCards(deckId, entry.cards, now)
        if (cards.length > 0) await db.cards.bulkAdd(cards)
        addedCards += cards.length
        warnings.push(...w)
      }
      const parts = [`${addedDecks}デッキ / ${addedCards}枚を読み込みました`]
      if (warnings.length > 0) parts.push(`画像${warnings.length}件は読み込めませんでした`)
      setNotice(parts.join(' / '))
    } catch (e) {
      toast.reportError(e, 'バックアップの読み込み')
    } finally {
      setBusy(false)
    }
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

      <StorageSafetyBanner hasData={(decks?.length ?? 0) > 0} />

      <OverviewPanel />

      <div className="flex gap-2 mb-3">
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

      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <select
          value={sortKey}
          onChange={(e) => changeSort(e.target.value as DeckSortKey)}
          className="rounded-lg px-2 py-1.5 text-xs border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          aria-label="デッキの並び順"
        >
          {Object.entries(DECK_SORT_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button
            onClick={exportBackup}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
            title="全デッキを1つのJSONにまとめて書き出します（端末の移行・バックアップ用）"
          >
            ⬇ 全体を書き出す
          </button>
          <button
            onClick={() => backupFileRef.current?.click()}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
            title="書き出したJSONを読み込んでデッキを復元します"
          >
            ⬆ 読み込む
          </button>
          <input
            ref={backupFileRef}
            type="file"
            accept=".json,application/json,text/plain"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) await importBackup(await file.text())
            }}
          />
        </div>
      </div>

      {notice && (
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {notice}
        </p>
      )}

      {decks?.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>
          まだデッキがありません。上のフォームから作成してください。
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {sortedDecks.map((deck, i) => (
          <DeckRow
            key={deck.id}
            deck={deck}
            cardCount={cardCounts?.get(deck.id) ?? 0}
            expanded={expanded === deck.id}
            onToggleExpanded={() => setExpanded(expanded === deck.id ? null : deck.id)}
            onDelete={() => deleteDeck(deck)}
            manualSort={sortKey === 'manual'}
            canMoveUp={i > 0}
            canMoveDown={i < sortedDecks.length - 1}
            onMoveUp={() => moveDeck(deck, -1)}
            onMoveDown={() => moveDeck(deck, 1)}
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
  manualSort,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
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
  manualSort: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
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
        {manualSort && (
          <div className="flex flex-col shrink-0">
            <button
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className="text-xs leading-none px-1 disabled:opacity-20"
              style={{ color: 'var(--text-muted)' }}
              aria-label="上へ移動"
            >
              ▲
            </button>
            <button
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className="text-xs leading-none px-1 disabled:opacity-20"
              style={{ color: 'var(--text-muted)' }}
              aria-label="下へ移動"
            >
              ▼
            </button>
          </div>
        )}
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
