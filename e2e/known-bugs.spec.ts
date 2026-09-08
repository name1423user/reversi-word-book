/**
 * 既知バグの再現テスト（docs/qa-report.md に対応）
 *
 * すべて test.fail() で「失敗することが期待される」と印をつけている。
 *   - バグが残っている間: 失敗 → 期待どおりなので CI はグリーン
 *   - バグを修正した時点: 成功 → Playwright が "expected to fail but passed" で
 *     赤くなるので、test.fail() を外す作業を忘れられない
 *
 * つまりこのファイルは「未修正バグの一覧」であり、修正の完了判定でもある。
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
    test.fail() // 既知バグ: FlashPage の queue がラウンド開始時のスナップショットのため上書きされる

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
    test.fail() // 既知バグ: 履歴消失の結果、苦手カードが「正答 1/1（100%）」に化ける

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
    test.fail() // 既知バグ: 起動時の sweepOrphanImages が cards しか参照ルートにしていない

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
    test.fail() // 既知バグ: submitNew に実行中ガードが無い

    await createDeck(page, 'bug003')
    await gotoDeckInput(page, 'bug003')
    await attachImage(page)
    await page.fill('textarea[placeholder="表面のテキスト"]', 'double')
    await page.waitForTimeout(700)
    await doubleSubmit(page)

    const db = await readStores<{ cards: Card[] }>(page, ['cards'])
    expect(db.cards, '1回の意図した操作で1枚だけ登録されるべき').toHaveLength(1)
  })

  test('二重登録された片方を消しても、残った方の画像は生きている', async ({ page }) => {
    test.fail() // 既知バグ: 2枚が同じ image:<id> を共有し、片方の削除でBlobごと消える

    await createDeck(page, 'bug003b')
    await gotoDeckInput(page, 'bug003b')
    await attachImage(page)
    await page.fill('textarea[placeholder="表面のテキスト"]', 'double')
    await page.waitForTimeout(700)
    await doubleSubmit(page)

    const before = await readStores<{ cards: Card[] }>(page, ['cards'])
    expect(before.cards.length, '前提: 二重登録が起きている').toBe(2)

    await page.getByRole('button', { name: 'カードを削除' }).first().click()
    await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click()
    await page.waitForTimeout(800)

    const after = await readStores<{ cards: Card[]; images: unknown[] }>(page, ['cards', 'images'])
    expect(after.cards).toHaveLength(1)
    expect(after.images, '残ったカードの画像Blobが消えてはいけない').toHaveLength(1)
  })
})
