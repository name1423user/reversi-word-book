import type { Page } from '@playwright/test'

/** Read object stores straight out of IndexedDB, to assert on what was
 * actually persisted rather than what the UI happens to be showing. */
export async function readStores<T = Record<string, unknown[]>>(
  page: Page,
  stores: string[],
): Promise<T> {
  return page.evaluate(async (stores) => {
    return await new Promise((resolve, reject) => {
      const req = indexedDB.open('reversi-word-book')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(stores, 'readonly')
        const out: Record<string, unknown[]> = {}
        for (const name of stores) {
          const r = tx.objectStore(name).getAll()
          r.onsuccess = () => {
            out[name] = r.result
          }
        }
        tx.oncomplete = () => resolve(out)
        tx.onerror = () => reject(tx.error)
      }
    })
  }, stores) as Promise<T>
}

export async function createDeck(page: Page, name: string): Promise<void> {
  await page.fill('input[placeholder*="デッキ名"]', name)
  await page.getByRole('button', { name: '追加', exact: true }).click()
  await page.getByRole('listitem').filter({ hasText: name }).first().waitFor()
}

/** Add cards through the JSON bulk importer — the quickest way to get a deck
 * into a known state. */
export async function importCards(
  page: Page,
  cards: { front: string; back: string }[],
): Promise<void> {
  const panel = page.locator('div').filter({ hasText: 'JSON一括登録' }).last()
  const toggle = panel.getByRole('button', { name: '開く' })
  if (await toggle.isVisible()) await toggle.click()
  await page.fill('textarea[placeholder="JSONをここに貼り付け"]', JSON.stringify(cards))
  await page.getByRole('button', { name: '既存に追加' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '追加する' }).click()
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' })
}

export async function gotoDeckInput(page: Page, deckName: string): Promise<void> {
  await page
    .getByRole('listitem')
    .filter({ hasText: deckName })
    .getByRole('link', { name: '入力' })
    .click()
  await page.getByRole('heading', { name: /の入力/ }).waitFor()
}
