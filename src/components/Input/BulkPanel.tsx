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
import {
  AI_PROMPT_STEPS,
  CARD_STYLE_LABEL,
  buildAiPrompt,
  type CardStyle,
} from '../../lib/aiPrompt'
import { useConfirm } from '../common/ConfirmProvider'
import { useToast } from '../common/ToastProvider'

export function BulkPanel({ deckId, deckName }: { deckId: string; deckName: string }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiCount, setAiCount] = useState(20)
  const [aiStyle, setAiStyle] = useState<CardStyle>('termToMeaning')
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const confirm = useConfirm()
  const { reportError, show } = useToast()

  const aiPrompt = buildAiPrompt({ count: aiCount, style: aiStyle })

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiPrompt)
      show('プロンプトをコピーしました。AIに貼り付けて、続けて資料を送ってください。')
    } catch {
      // Clipboard access can be blocked (permissions, insecure context);
      // select the text so the user can copy it by hand instead of failing.
      promptRef.current?.select()
      show('自動コピーできませんでした。選択した文字をコピーしてください。', 'error')
    }
  }

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
      // Pin exactly which cards "replace" is allowed to remove *before*
      // buildCards runs. buildCards processes images sequentially and can
      // take real wall-clock time, during which the ordinary add-card form
      // on the same page stays fully usable. Deleting by this fixed id list
      // — instead of re-querying `deckId` when the transaction finally runs
      // — means a card added while the import was still processing can
      // never be swept up by it.
      const existing =
        mode === 'replace' ? await db.cards.where('deckId').equals(deckId).toArray() : []
      const { cards: newCards, warnings } = await buildCards(deckId, incoming)

      if (mode === 'replace') {
        const existingIds = existing.map((c) => c.id)
        await db.transaction('rw', db.cards, async () => {
          await db.cards.bulkDelete(existingIds)
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
    } catch (e) {
      reportError(e, 'カードの一括登録')
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
    } catch (e) {
      reportError(e, 'カードの書き出し')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="q-card p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold">JSON一括登録 / エクスポート</h2>
        <button onClick={() => setOpen((o) => !o)} className="q-btn q-btn-ghost q-btn-sm">
          {open ? '閉じる' : '開く'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => doExport('backup')}
          disabled={busy}
          className="q-btn q-btn-outline q-btn-sm"
          title="画像をWebPとして埋め込み、外部URLの画像も可能な範囲で取り込みます"
        >
          書き出す（画像込み）
        </button>
        <button
          onClick={() => doExport('text')}
          disabled={busy}
          className="q-btn q-btn-ghost q-btn-sm"
          title="画像を含まない軽量なJSON（外部URLのリンクは残ります）"
        >
          書き出す（テキストのみ）
        </button>
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold">🤖 AIにカードを作ってもらう</h3>
          <button onClick={() => setAiOpen((o) => !o)} className="q-btn q-btn-ghost q-btn-sm">
            {aiOpen ? '閉じる' : '開く'}
          </button>
        </div>

        {aiOpen && (
          <div className="mt-3 flex flex-col gap-3">
            <ol className="text-xs pl-5 list-decimal" style={{ color: 'var(--text-muted)' }}>
              {AI_PROMPT_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <span className="q-label">枚数</span>
                <select
                  value={aiCount}
                  onChange={(e) => setAiCount(Number(e.target.value))}
                  className="q-field"
                  style={{ width: 'auto', padding: '0.3rem 0.5rem', fontSize: '0.8125rem' }}
                >
                  {[10, 20, 30, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}枚
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <span className="q-label">形式</span>
                <select
                  value={aiStyle}
                  onChange={(e) => setAiStyle(e.target.value as CardStyle)}
                  className="q-field"
                  style={{ width: 'auto', padding: '0.3rem 0.5rem', fontSize: '0.8125rem' }}
                >
                  {Object.entries(CARD_STYLE_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={copyPrompt} className="q-btn q-btn-primary q-btn-sm">
                プロンプトをコピー
              </button>
            </div>

            <textarea
              ref={promptRef}
              readOnly
              value={aiPrompt}
              rows={10}
              onFocus={(e) => e.target.select()}
              className="q-field text-xs resize-y"
              aria-label="AIに渡すプロンプト"
            />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              返ってきたJSONは、``` で囲まれていたり前置きが付いていてもそのまま貼り付けて大丈夫です。
            </p>
          </div>
        )}
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
            className="q-field font-mono text-xs resize-y"
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
              className="q-btn q-btn-outline q-btn-sm"
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
              className="q-btn q-btn-primary q-btn-sm"
            >
              {busy ? '処理中…' : '既存に追加'}
            </button>
            <button
              onClick={() => doImport('replace')}
              disabled={busy}
              className="q-btn q-btn-danger q-btn-sm"
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
