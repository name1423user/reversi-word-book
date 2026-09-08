import { useRef, useState } from 'react'
import { db, newId } from '../../db'
import type { Card, CardJson } from '../../types'
import {
  blobToDataUrl,
  deleteImageRefs,
  getImageBlob,
  importImageField,
  isImageRef,
} from '../../lib/imageStore'
import { useConfirm } from '../common/ConfirmProvider'

function parseCardsJson(text: string): CardJson[] {
  const data = JSON.parse(text)
  if (!Array.isArray(data)) throw new Error('JSONは配列である必要があります')
  return data.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`${i + 1}件目: オブジェクトではありません`)
    }
    const { front, frontImage, back, backImage } = raw as Record<string, unknown>
    if (typeof front !== 'string' || typeof back !== 'string') {
      throw new Error(`${i + 1}件目: front / back は文字列で指定してください`)
    }
    return {
      front,
      back,
      frontImage: typeof frontImage === 'string' ? frontImage : null,
      backImage: typeof backImage === 'string' ? backImage : null,
    }
  })
}

export function BulkPanel({ deckId }: { deckId: string }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const confirm = useConfirm()

  const doImport = async (mode: 'append' | 'replace') => {
    setError(null)
    setWarning(null)
    let parsed: CardJson[]
    try {
      parsed = parseCardsJson(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : '解析に失敗しました')
      return
    }
    if (parsed.length === 0) {
      setError('カードが1件もありません')
      return
    }

    if (mode === 'replace') {
      const ok = await confirm({
        title: '既存のカードを置き換えますか？',
        message: `このデッキの既存カードをすべて削除し、${parsed.length}件で置き換えます。この操作は取り消せません。`,
        confirmLabel: '置き換える',
        danger: true,
      })
      if (!ok) return
    } else {
      const ok = await confirm({
        title: `${parsed.length}件のカードを追加しますか？`,
        confirmLabel: '追加する',
      })
      if (!ok) return
    }

    setBusy(true)
    try {
      // Images travel through the same downscale/compress pipeline as
      // uploads and end up as blob refs — never raw base64 sitting in the
      // card row — so a card pasted with a giant embedded screenshot can't
      // bloat storage. Any image that fails to decode is dropped (with a
      // warning) rather than aborting the whole import.
      const warnings: string[] = []
      const now = Date.now()
      const newCards: Card[] = []
      for (let i = 0; i < parsed.length; i++) {
        const c = parsed[i]
        const [front, back] = await Promise.all([
          importImageField(c.frontImage),
          importImageField(c.backImage),
        ])
        if (front.warning) warnings.push(`${i + 1}件目(表): ${front.warning}`)
        if (back.warning) warnings.push(`${i + 1}件目(裏): ${back.warning}`)
        newCards.push({
          id: newId(),
          deckId,
          front: c.front,
          frontImage: front.ref,
          back: c.back,
          backImage: back.ref,
          lastResponseTimeMs: 0,
          history: [],
          createdAt: now + i,
          updatedAt: now + i,
        })
      }

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
      if (warnings.length > 0) {
        // Keep the panel open so the warning (which only renders inside it)
        // is actually visible instead of vanishing the instant we collapse.
        setWarning(`${warnings.length}件の画像を読み込めませんでした:\n${warnings.join('\n')}`)
      } else {
        setOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }

  const doExport = async () => {
    const cards = await db.cards.where('deckId').equals(deckId).toArray()
    const json: CardJson[] = await Promise.all(
      cards.map(async (c) => ({
        front: c.front,
        frontImage: await resolveForExport(c.frontImage),
        back: c.back,
        backImage: await resolveForExport(c.backImage),
      })),
    )
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wordbook-cards-${deckId.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">JSON一括登録 / エクスポート</h2>
        <div className="flex gap-2">
          <button onClick={doExport} className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
            書き出す
          </button>
          <button onClick={() => setOpen((o) => !o)} className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {open ? '閉じる' : '開く'}
          </button>
        </div>
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
              accept="application/json"
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
          {error && (
            <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          {warning && (
            <p className="text-xs whitespace-pre-wrap" style={{ color: '#b45309' }}>
              ⚠ {warning}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Export wants the spec's portable format (a URL or actual WebP data), not
 * our internal `image:<id>` blob reference. */
async function resolveForExport(ref: string | null): Promise<string | null> {
  if (!ref) return null
  if (!isImageRef(ref)) return ref
  const blob = await getImageBlob(ref)
  return blob ? blobToDataUrl(blob) : null
}
