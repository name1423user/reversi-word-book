import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createDeck, gotoDeckInput, importCards, readStores } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('デッキを作成・並び替え・削除できる', async ({ page }) => {
  for (const name of ['デッキA', 'デッキB', 'デッキC']) {
    await createDeck(page, name)
  }

  const deckNames = () =>
    page.getByRole('listitem').locator('button.text-base').allTextContents()

  // Newest deck goes to the top of the manual order.
  expect(await deckNames()).toEqual(['デッキC', 'デッキB', 'デッキA'])

  await page
    .getByRole('listitem')
    .filter({ hasText: 'デッキC' })
    .getByRole('button', { name: '下へ移動' })
    .click()
  await expect.poll(deckNames).toEqual(['デッキB', 'デッキC', 'デッキA'])

  await page.selectOption('select[aria-label="デッキの並び順"]', 'nameAsc')
  await expect.poll(deckNames).toEqual(['デッキA', 'デッキB', 'デッキC'])

  // Deleting asks first, and offers a backup on the way out.
  await page
    .getByRole('listitem')
    .filter({ hasText: 'デッキA' })
    .getByRole('button', { name: 'デッキを削除' })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText('先にJSONで書き出す')
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click()
  await expect.poll(deckNames).toEqual(['デッキB', 'デッキC'])
})

test('一括登録は重複をスキップし、複製と一括削除ができる', async ({ page }) => {
  await createDeck(page, '英単語')
  await gotoDeckInput(page, '英単語')

  await importCards(page, [
    { front: 'apple', back: 'りんご' },
    { front: 'Apple', back: '大文字違いの重複' },
    { front: 'banana', back: 'バナナ' },
  ])

  let db = await readStores<{ cards: { front: string }[] }>(page, ['cards'])
  expect(db.cards.map((c) => c.front).sort()).toEqual(['apple', 'banana'])

  // Duplicate one card.
  await page.getByRole('button', { name: 'カードを複製' }).first().click()
  await expect.poll(async () => (await readStores<{ cards: [] }>(page, ['cards'])).cards.length).toBe(3)

  // Select everything and delete in one go.
  await page.getByRole('button', { name: '選択して削除' }).click()
  await page.getByRole('button', { name: '全選択' }).click()
  await page.getByRole('button', { name: /枚を削除/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click()
  await expect.poll(async () => (await readStores<{ cards: [] }>(page, ['cards'])).cards.length).toBe(0)
})

test('学習を一周するとサマリーが出て、苦手順に反映される', async ({ page }) => {
  await createDeck(page, '英単語')
  await gotoDeckInput(page, '英単語')
  await importCards(page, [
    { front: 'apple', back: 'りんご' },
    { front: 'banana', back: 'バナナ' },
    { front: 'cherry', back: 'さくらんぼ' },
  ])

  await page.getByRole('link', { name: '学習へ' }).click()
  await expect(page.getByRole('button', { name: /苦手優先/ })).toBeVisible()
  await page.getByRole('button', { name: /順番どおり/ }).click()
  await page.getByRole('button', { name: '学習をはじめる' }).click()

  // First-run guide appears once.
  await page.getByRole('button', { name: 'はじめる' }).click()

  // Miss the first card, get the rest right.
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(400)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  await page.keyboard.press('ArrowRight')

  await expect(page.getByRole('heading', { name: /お疲れさまでした/ })).toBeVisible()
  await expect(page.getByText('正解率')).toBeVisible()
  await expect(page.getByRole('button', { name: /不正解だったカードだけもう一度/ })).toBeVisible()

  // The missed card should now rank first under 苦手順.
  await page.getByRole('button', { name: '終了する' }).click()
  await page.getByRole('link', { name: '入力へ' }).click()
  await page.selectOption('select >> nth=0', 'difficultyDesc')
  await expect(page.getByRole('listitem').first()).toContainText('apple')
  await expect(page.getByRole('listitem').first()).toContainText('正答')
})

test('全デッキのバックアップを書き出して読み込める', async ({ page }) => {
  await createDeck(page, '英単語')
  await gotoDeckInput(page, '英単語')
  await importCards(page, [{ front: 'apple', back: 'りんご' }])
  await page.getByRole('link', { name: 'デッキ一覧' }).click()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /全体を書き出す/ }).click(),
  ])
  const path = await download.path()
  expect(path).toBeTruthy()

  const backup = JSON.parse(await readFile(path!, 'utf-8'))
  expect(backup.format).toBe('reversi-word-book')
  expect(backup.decks).toHaveLength(1)
  expect(backup.decks[0].cards[0].front).toBe('apple')

  // Re-importing adds a second copy rather than clobbering the original.
  await page.setInputFiles('input[type="file"][accept*="json"]', path!)
  await page.getByRole('alertdialog').getByRole('button', { name: '読み込む' }).click()
  await expect
    .poll(async () => (await readStores<{ decks: [] }>(page, ['decks'])).decks.length)
    .toBe(2)
})

test('保存に失敗したら理由が画面に出る（容量オーバー）', async ({ page }) => {
  // Make every write to the `cards` store fail the way a full disk does.
  await page.addInitScript(() => {
    const originalAdd = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...args: unknown[]) {
      if (this.name === 'cards') {
        throw new DOMException('simulated', 'QuotaExceededError')
      }
      // eslint-disable-next-line prefer-spread
      return originalAdd.apply(this, args as never)
    } as typeof IDBObjectStore.prototype.add
  })
  await page.goto('/')

  await createDeck(page, '英単語')
  await gotoDeckInput(page, '英単語')

  await page.fill('textarea[placeholder="表面のテキスト"]', 'apple')
  await page.fill('textarea[placeholder="裏面のテキスト"]', 'りんご')
  await page.getByRole('button', { name: /このカードを登録/ }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('保存容量')
  await expect(alert).toContainText('バックアップ')

  // And the failure didn't silently look like success: nothing was stored.
  const db = await readStores<{ cards: [] }>(page, ['cards'])
  expect(db.cards).toHaveLength(0)
})

test('データが消える可能性を警告し、保護を要求できる', async ({ page }) => {
  await page.addInitScript(() => {
    let persisted = false
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => persisted,
        persist: async () => {
          persisted = true
          return true
        },
        estimate: async () => ({ usage: 1024, quota: 1024 * 1024 }),
      },
    })
  })
  await page.goto('/')

  // No data yet, so nothing to warn about.
  await expect(page.getByText('データが自動的に削除される可能性があります')).toBeHidden()

  await createDeck(page, '英単語')
  const banner = page.getByText('データが自動的に削除される可能性があります')
  await expect(banner).toBeVisible()

  await page.getByRole('button', { name: 'データを保護する' }).click()
  await expect(page.getByRole('status').filter({ hasText: '保存する設定になりました' })).toBeVisible()
  await expect(banner).toBeHidden()
})
