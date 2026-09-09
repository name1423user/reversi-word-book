/**
 * 回帰テスト（docs/qa-report.md の BUG-001..003 / POT-001..005 に対応）
 *
 * 破壊的QAで実際に再現させたバグを、修正後も再発しないよう固定するもの。
 * いずれも「壊れていた頃は失敗し、修正後は成功する」ことを確認済み。
 */
import { expect, test } from '@playwright/test'
import { createDeck, gotoDeckInput, importCards, readStores } from './helpers'

type Card = {
  id: string
  front: string
  frontImage: string | null
  history: { correct: boolean }[]
}

const FIXTURE = 'e2e/fixtures/sample.png'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** 画像を1枚アップロードしてトリミングを確定する（未登録の下書き状態になる）。 */
async function attachImage(page: import('@playwright/test').Page) {
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(FIXTURE)
  await page.getByRole('button', { name: 'この範囲で確定' }).click()
  await expect(page.getByRole('button', { name: 'この範囲で確定' })).toBeHidden()
}

/** 1周目で apple を間違え、banana を正解する。 */
async function studyMissingFirstCard(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: '学習へ' }).click()
  await page.getByRole('button', { name: /順番どおり/ }).click()
  await page.getByRole('button', { name: '学習をはじめる' }).click()
  const guide = page.getByRole('button', { name: 'はじめる' })
  if (await guide.isVisible().catch(() => false)) await guide.click()

  await page.keyboard.press('ArrowLeft') // apple: 不正解
  await page.waitForTimeout(400)
  await page.keyboard.press('ArrowRight') // banana: 正解
  await expect(page.getByRole('heading', { name: /お疲れさまでした/ })).toBeVisible()
}

test.describe('BUG-001 再挑戦ラウンドで1周目の履歴が消える', () => {
  test('再挑戦後、履歴に「不正解→正解」の2件が残る', async ({ page }) => {

    await createDeck(page, 'bug001')
    await gotoDeckInput(page, 'bug001')
    await importCards(page, [
      { front: 'apple', back: 'りんご' },
      { front: 'banana', back: 'バナナ' },
    ])
    await studyMissingFirstCard(page)

    const round1 = await readStores<{ cards: Card[] }>(page, ['cards'])
    expect(round1.cards.find((c) => c.front === 'apple')!.history).toHaveLength(1)

    await page.getByRole('button', { name: /不正解だったカードだけもう一度/ }).click()
    await page.waitForTimeout(300)
    await page.keyboard.press('ArrowRight') // apple: 今度は正解
    await expect(page.getByRole('heading', { name: /お疲れさまでした/ })).toBeVisible()

    const round2 = await readStores<{ cards: Card[] }>(page, ['cards'])
    expect(
      round2.cards.find((c) => c.front === 'apple')!.history.map((h) => h.correct),
      '1周目の不正解と2周目の正解が両方残るべき',
    ).toEqual([false, true])
  })

  test('間違えたカードは苦手順で正答率50%として扱われる', async ({ page }) => {

    await createDeck(page, 'bug001b')
    await gotoDeckInput(page, 'bug001b')
    await importCards(page, [
      { front: 'apple', back: 'りんご' },
      { front: 'banana', back: 'バナナ' },
    ])
    await studyMissingFirstCard(page)

    await page.getByRole('button', { name: /不正解だったカードだけもう一度/ }).click()
    await page.waitForTimeout(300)
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('heading', { name: /お疲れさまでした/ })).toBeVisible()

    await page.getByRole('button', { name: '終了する' }).click()
    await page.getByRole('link', { name: '入力へ' }).click()
    await page.selectOption('select >> nth=0', 'difficultyDesc')

    const appleRow = page.getByRole('listitem').filter({ hasText: 'apple' }).first()
    await expect(appleRow, '1回間違えて1回正解なので 1/2 と出るべき').toContainText('1/2')
  })
})

test.describe('BUG-002 下書きの画像がリロードで削除される', () => {
  test('登録前の下書きの画像が、リロード後も残る', async ({ page }) => {

    await createDeck(page, 'bug002')
    await gotoDeckInput(page, 'bug002')
    await attachImage(page)
    await page.fill('textarea[placeholder="表面のテキスト"]', '書きかけのカード')
    await page.waitForTimeout(800) // 下書きの debounce 保存を待つ

    const before = await readStores<{ images: unknown[] }>(page, ['images'])
    expect(before.images, '前提: 画像が1枚保存されている').toHaveLength(1)

    await page.reload()
    await page.waitForTimeout(1200) // 起動時 sweep を待つ

    // 下書きのテキストは仕様どおり残る
    await expect(page.locator('textarea').first()).toHaveValue('書きかけのカード')

    const after = await readStores<{ images: unknown[] }>(page, ['images'])
    expect(after.images, '下書きが参照している画像が消えてはいけない').toHaveLength(1)
    await expect(page.getByText('画像が読み込めません')).toBeHidden()
  })
})

test.describe('BUG-003 登録の二重押下でBlobを共有するカードができる', () => {
  /** 同一tickで2回クリック（モバイルのダブルタップ相当）。 */
  async function doubleSubmit(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('このカードを登録'),
      ) as HTMLButtonElement
      button.click()
      button.click()
    })
    await page.waitForTimeout(800)
  }

  test('二重押下でも登録は1枚だけ', async ({ page }) => {

    await createDeck(page, 'bug003')
    await gotoDeckInput(page, 'bug003')
    await attachImage(page)
    await page.fill('textarea[placeholder="表面のテキスト"]', 'double')
    await page.waitForTimeout(700)
    await doubleSubmit(page)

    const db = await readStores<{ cards: Card[] }>(page, ['cards'])
    expect(db.cards, '1回の意図した操作で1枚だけ登録されるべき').toHaveLength(1)
  })

  test('画像Blobを共有するカードがあっても、片方の削除でもう片方が壊れない', async ({ page }) => {
    // 二重押下は塞いだので、この状況はもう作れない。ただし修正前に作られた
    // 「同じ image:<id> を指す2枚」は既存ユーザーの手元に残りうるため、
    // 参照カウント方式の削除がそれを守れることを直接確認する。
    await createDeck(page, 'shared-blob')
    await gotoDeckInput(page, 'shared-blob')
    await attachImage(page)
    await page.fill('textarea[placeholder="表面のテキスト"]', 'original')
    await page.getByRole('button', { name: /このカードを登録/ }).click()
    await page.waitForTimeout(600)

    // 同じ画像参照を持つ2枚目を、DBに直接作る（修正前のデータを再現）
    await page.evaluate(async () => {
      const req = indexedDB.open('reversi-word-book')
      await new Promise<void>((r) => { req.onsuccess = () => r() })
      const tx = req.result.transaction(['cards'], 'readwrite')
      const store = tx.objectStore('cards')
      const all: Card[] = await new Promise((r) => {
        const q = store.getAll()
        q.onsuccess = () => r(q.result)
      })
      store.add({ ...all[0], id: crypto.randomUUID(), front: 'copy' })
      await new Promise<void>((r) => { tx.oncomplete = () => r() })
    })
    await page.reload()
    await page.waitForTimeout(1000)

    const before = await readStores<{ cards: Card[]; images: unknown[] }>(page, ['cards', 'images'])
    expect(before.cards, '前提: 2枚が同じ画像を共有している').toHaveLength(2)
    expect(new Set(before.cards.map((c) => c.frontImage)).size).toBe(1)

    await page.getByRole('listitem').filter({ hasText: 'copy' })
      .getByRole('button', { name: 'カードを削除' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click()
    await page.waitForTimeout(800)

    const after = await readStores<{ cards: Card[]; images: unknown[] }>(page, ['cards', 'images'])
    expect(after.cards).toHaveLength(1)
    expect(after.images, 'まだ参照されている画像は消してはいけない').toHaveLength(1)
    await expect(page.getByText('画像が読み込めません')).toBeHidden()
  })
})

test.describe('POT-001 削除前バックアップと削除の競合', () => {
  test('書き出し中は削除を確定できない', async ({ page }) => {
    await createDeck(page, 'pot001')
    await gotoDeckInput(page, 'pot001')
    await importCards(page, [{ front: 'ext1', back: 'a' }, { front: 'ext2', back: 'b' }])

    // 外部URL画像に差し替えて、書き出しに時間がかかる状態を作る（リンク切れ想定）
    await page.evaluate(async () => {
      const req = indexedDB.open('reversi-word-book')
      await new Promise<void>((r) => { req.onsuccess = () => r() })
      const tx = req.result.transaction(['cards'], 'readwrite')
      const store = tx.objectStore('cards')
      const all: Card[] = await new Promise((r) => {
        const q = store.getAll()
        q.onsuccess = () => r(q.result)
      })
      for (const c of all) {
        store.put({ ...c, frontImage: 'https://example.invalid/dead-link.png' })
      }
      await new Promise<void>((r) => { tx.oncomplete = () => r() })
    })

    await page.getByRole('link', { name: 'デッキ一覧' }).click()
    await page.getByRole('listitem').filter({ hasText: 'pot001' })
      .getByRole('button', { name: 'デッキを削除' }).click()

    const download = page.waitForEvent('download')
    await page.getByRole('alertdialog').getByRole('button', { name: /先にJSONで書き出す/ }).click()

    // 書き出しが終わるまで破壊操作はロックされる
    await expect(
      page.getByRole('alertdialog').getByRole('button', { name: '削除する' }),
    ).toBeDisabled()

    await download
    await expect(
      page.getByRole('alertdialog').getByRole('button', { name: '削除する' }),
    ).toBeEnabled()
  })
})

test.describe('POT-003 空になったデッキでのやり直し', () => {
  test('別タブでカードが全部消されても操作不能な画面にならない', async ({ page, context }) => {
    await createDeck(page, 'pot003')
    await gotoDeckInput(page, 'pot003')
    await importCards(page, [{ front: 'only', back: 'ひとつだけ' }])

    await page.getByRole('link', { name: '学習へ' }).click()
    await page.getByRole('button', { name: '学習をはじめる' }).click()
    const guide = page.getByRole('button', { name: 'はじめる' })
    if (await guide.isVisible().catch(() => false)) await guide.click()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('heading', { name: /お疲れさまでした/ })).toBeVisible()

    // 別タブで同じデッキのカードを全部削除する（Dexieの変更通知が飛ぶ本物の経路）
    const other = await context.newPage()
    await other.goto('/')
    await gotoDeckInput(other, 'pot003')
    await other.getByRole('button', { name: '選択して削除' }).click()
    await other.getByRole('button', { name: '全選択' }).click()
    await other.getByRole('button', { name: /枚を削除/ }).click()
    await other.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click()
    await other.waitForTimeout(500)
    await other.close()

    // サマリー画面に残っている元のタブで「最初から全部やり直す」
    await page.waitForTimeout(700) // 変更通知の伝播を待つ
    await page.getByRole('button', { name: '最初から全部やり直す' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'やり直す' }).click()

    // 空白の学習画面ではなく、開始画面（カード追加への導線）に戻る
    await expect(page.getByText('このデッキにはまだカードがありません')).toBeVisible()
  })
})

test.describe('POT-005 デッキをまたいだ下書きの混線', () => {
  test('別デッキの入力画面へ直接移動しても下書きが混ざらない', async ({ page }) => {
    await createDeck(page, 'deckA')
    await createDeck(page, 'deckB')

    await gotoDeckInput(page, 'deckA')
    const deckAUrl = page.url()
    await page.fill('textarea[placeholder="表面のテキスト"]', 'deckAの書きかけ')
    await page.waitForTimeout(800)

    // URL直接指定でデッキBの入力画面へ（コンポーネントは再マウントされない経路）
    await page.getByRole('link', { name: 'デッキ一覧' }).click()
    await gotoDeckInput(page, 'deckB')
    const deckBUrl = page.url()
    await page.goto(deckAUrl)
    await page.waitForTimeout(300)
    await expect(page.locator('textarea').first()).toHaveValue('deckAの書きかけ')
    await page.goto(deckBUrl)
    await page.waitForTimeout(800)

    // デッキBの入力欄は空のままで、デッキAの下書きも無傷
    await expect(page.locator('textarea').first()).toHaveValue('')
    const drafts = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([k]) => k.startsWith('wordbook:draft:'))
        .map(([, v]) => v as string),
    )
    expect(
      drafts.filter((d) => d.includes('deckAの書きかけ')),
      'deckAの下書きが他デッキへコピーされていない',
    ).toHaveLength(1)
  })
})

test.describe('POT-004 学習中に別タブでカードが削除された場合', () => {
  test('記録できなかったことがユーザーに伝わる', async ({ page, context }) => {
    await createDeck(page, 'pot004')
    await gotoDeckInput(page, 'pot004')
    await importCards(page, [{ front: 'gone', back: '消される' }])

    await page.getByRole('link', { name: '学習へ' }).click()
    await page.getByRole('button', { name: '学習をはじめる' }).click()
    const guide = page.getByRole('button', { name: 'はじめる' })
    if (await guide.isVisible().catch(() => false)) await guide.click()

    // カードを表示したまま、別タブで当該カードを削除する
    const other = await context.newPage()
    await other.goto('/')
    await gotoDeckInput(other, 'pot004')
    await other.getByRole('button', { name: 'カードを削除' }).first().click()
    await other.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click()
    await other.waitForTimeout(500)
    await other.close()

    // 既に消えたカードに対して判定する
    await page.keyboard.press('ArrowRight')

    // 黙って失われるのではなく、記録できなかったことが表示される
    await expect(page.getByRole('alert')).toContainText('記録できませんでした')
  })
})

test.describe('BUG-V2-001 一括置き換え中に別フォームで追加したカードが消える', () => {
  const PNG_1PX =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

  test('置き換えの完了を待たずに追加したカードが生き残る', async ({ page }) => {
    await createDeck(page, 'v2-001')
    await gotoDeckInput(page, 'v2-001')
    await importCards(page, [{ front: 'old', back: 'old-back' }])

    // 画像付きカードを多数含む「置き換え」は、buildCards が1件ずつ
    // Image.onload → canvas.toBlob → IndexedDB書き込み を直列に待つため
    // 実時間がかかる。その間に別フォームでの追加が割り込めることを確認する。
    const bulk = Array.from({ length: 60 }, (_, i) => ({
      front: `bulk-${i}`,
      back: `bulk-back-${i}`,
      frontImage: PNG_1PX,
      backImage: null,
    }))
    await page.fill('textarea[placeholder="JSONをここに貼り付け"]', JSON.stringify(bulk))
    await page.getByRole('button', { name: '既存を置き換え' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '置き換える' }).click()

    // 置き換えの完了を待たず、無関係な「カードを追加」フォームで登録する
    await page.fill('textarea[placeholder="表面のテキスト"]', 'RACE-CARD')
    await page.fill('textarea[placeholder="裏面のテキスト"]', 'RACE-CARD-BACK')
    await page.getByRole('button', { name: 'このカードを登録（Enter）' }).click()

    // Poll IndexedDB directly rather than the UI notice: buildCards()
    // round-trips 60 images through Image.onload/canvas.toBlob, and how long
    // that actually takes depends on machine load, not just this test.
    await expect
      .poll(
        async () => {
          const { cards } = await readStores<{ cards: unknown[] }>(page, ['cards'])
          return cards.length
        },
        { timeout: 60_000 },
      )
      .toBe(61)

    const { cards } = await readStores<{ cards: { front: string }[] }>(page, ['cards'])
    expect(cards.map((c) => c.front)).toContain('RACE-CARD')
  })
})

test.describe('BUG-V2-002 ラウンド最後の1枚での判定直後Undo', () => {
  test('カードの履歴とセッション記録が食い違わない', async ({ page }) => {
    await createDeck(page, 'v2-002')
    await gotoDeckInput(page, 'v2-002')
    await importCards(page, [{ front: 'only-card', back: 'only-back' }])

    await page.getByRole('link', { name: '学習へ' }).click()
    await page.getByRole('button', { name: '学習をはじめる' }).click()
    const guide = page.getByRole('button', { name: 'はじめる' })
    if (await guide.isVisible().catch(() => false)) await guide.click()

    // ラウンド最後(かつ唯一)の1枚を判定した直後にUndoを、Playwrightの
    // actionabilityチェックより速いページ内発火で連続ディスパッチし、
    // finishRoundの結果確定〜永続化完了までの窓を突く。
    const dispatch = await page.evaluate(async () => {
      function clickByLabel(label: string): boolean {
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
        ) as HTMLButtonElement | undefined
        if (!btn) return false
        btn.click()
        return true
      }
      const judged = clickByLabel('覚えた（正解）')
      for (let i = 0; i < 50; i++) await Promise.resolve()
      const undone = clickByLabel('↺ 元に戻す')
      return { judged, undone }
    })
    expect(dispatch.judged, 'judge click should have landed').toBe(true)

    await page.waitForTimeout(1000)

    const { cards, sessions } = await readStores<{
      cards: { front: string; history: unknown[] }[]
      sessions: { correct: number; incorrect: number; total: number }[]
    }>(page, ['cards', 'sessions'])

    // Undoが間に合って巻き戻ったか(0/0)、間に合わずロックされて判定のまま
    // 残ったか(1/1)のどちらであっても構わない。壊れていたのは「カードの
    // 履歴だけ巻き戻り、保存済みセッションだけ古い値のまま食い違う」状態
    // だったので、ここではその一致だけを固定する。
    expect(sessions[0]?.correct).toBe(cards[0]?.history.length)
  })
})
