import { useRef, useState } from 'react'
import { db } from '../../db'
import { deleteImageRefs } from '../../lib/imageStore'
import {
  buildCards,
  downloadJson,
  duplicateKey,
  exportDeck,
  exportFilename,
  formatBytes,
  parseImportJson,
  type ExportMode,
} from '../../lib/exportImport'
import { useConfirm } from '../common/ConfirmProvider'

export function BulkPanel({ deckId, deckName }: { deckId: string; deckName: string }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const confirm = useConfirm()

  const doImport = async (mode: 'append' | 'replace') => {
    setError(null)
    setWarning(null)
    setNotice(null)

    let parsed
    try {
      parsed = parseImportJson(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析に失敗しました')
      return
    }
    // A whole-backup file belongs in the deck-list importer, not here.
    if (parsed.kind === 'backup') {
      setError(
        'これは全デッキのバックアップです。デッキ一覧の「読み込む」から復元してください。',
      )
      return
    }
    let incoming = parsed.decks[0].cards
    if (incoming.length === 0) {
      setError('カードが1件もありません')
      return
    }

    // Duplicate detection against existing cards (append only — a replace
    // wipes them anyway) and within the file itself.
    let skipped = 0
    if (skipDuplicates) {
      const seen = new Set<string>()
      if (mode === 'append') {
        const existing = await db.cards.where('deckId').equals(deckId).toArray()
        for (const c of existing) seen.add(duplicateKey(c.front))
      }
      const deduped = incoming.filter((c) => {
        const key = duplicateKey(c.front)
        if (!key) return true // blank fronts (image-only) can't be compared
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      skipped = incoming.length - deduped.length
      incoming = deduped
      if (incoming.length === 0) {
        setError(`${skipped}件すべてが重複のため、追加するカードがありません`)
        return
      }
    }

    const confirmMessage =
      skipped > 0 ? `表のテキストが重複する${skipped}件はスキップされます。` : undefined
    if (mode === 'replace') {
      const ok = await confirm({
        title: '既存のカードを置き換えますか？',
        message: `このデッキの既存カードをすべて削除し、${incoming.length}件で置き換えます。この操作は取り消せません。${confirmMessage ? `\n${confirmMessage}` : ''}`,
        confirmLabel: '置き換える',
        danger: true,
      })
      if (!ok) return
    } else {
      const ok = await confirm({
        title: `${incoming.length}件のカードを追加しますか？`,
        message: confirmMessage,
        confirmLabel: '追加する',
      })
      if (!ok) return
    }

    setBusy(true)
    try {
      const { cards: newCards, warnings } = await buildCards(deckId, incoming)

      if (mode === 'replace') {
        const existing = await db.cards.where('deckId').equals(deckId).toArray()
        await db.transaction('rw', db.cards, async () => {
          await db.cards.where('deckId').equals(deckId).delete()
          await db.cards.bulkAdd(newCards)
        })
        await deleteImageRefs(existing.flatMap((c) => [c.frontImage, c.backImage]))
      } else {
        await db.cards.bulkAdd(newCards)
      }

      setText('')
      const parts: string[] = [`${newCards.length}件を登録しました`]
      if (skipped > 0) parts.push(`重複${skipped}件はスキップ`)
      setNotice(parts.join(' / '))
      if (warnings.length > 0) {
        setWarning(`${warnings.length}件の画像を読み込めませんでした:\n${warnings.join('\n')}`)
      }
    } finally {
      setBusy(false)
    }
  }

  const doExport = async (mode: ExportMode) => {
    setError(null)
    setWarning(null)
    setNotice(null)
    setBusy(true)
    try {
      const report = await exportDeck(deckId, { mode, fetchExternal: mode === 'backup' })
      downloadJson(report.json, exportFilename(deckName, mode === 'backup' ? 'backup' : 'text'))
      const parts = [`${report.cardCount}枚を書き出しました（${formatBytes(report.byteSize)}）`]
      if (report.externalNotFetched > 0) {
        parts.push(
          `外部URLの画像${report.externalNotFetched}件は取り込めずリンクのまま残しました`,
        )
      }
      setNotice(parts.join(' / '))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">JSON一括登録 / エクスポート</h2>
        <button onClick={() => setOpen((o) => !o)} className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {open ? '閉じる' : '開く'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => doExport('backup')}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
          title="画像をWebPとして埋め込み、外部URLの画像も可能な範囲で取り込みます"
        >
          書き出す（画像込み）
        </button>
        <button
          onClick={() => doExport('text')}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
          title="画像を含まない軽量なJSON（外部URLのリンクは残ります）"
        >
          書き出す（テキストのみ）
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {'[{"front":"...","frontImage":null,"back":"...","backImage":null}, ...]'} 形式のJSONを貼り付けるか、ファイルを読み込んでください。
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="JSONをここに貼り付け"
            rows={6}
            className="w-full rounded-lg px-3 py-2 text-xs font-mono border resize-y"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
          />
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
            />
            表のテキストが同じカードはスキップする
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
            >
              ファイルを選択
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json,text/plain"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) setText(await file.text())
                e.target.value = ''
              }}
            />
            <button
              onClick={() => doImport('append')}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
            >
              {busy ? '処理中…' : '既存に追加'}
            </button>
            <button
              onClick={() => doImport('replace')}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
            >
              {busy ? '処理中…' : '既存を置き換え'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs mt-2 whitespace-pre-wrap" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          {notice}
        </p>
      )}
      {warning && (
        <p className="text-xs mt-2 whitespace-pre-wrap" style={{ color: '#b45309' }}>
          ⚠ {warning}
        </p>
      )}
    </div>
  )
}
