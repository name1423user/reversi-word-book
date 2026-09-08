// Destructive QA v2 — reproductions for two confirmed, unfixed bugs found by
// attacking state transitions that overlap in time (see docs/qa-report-v2.md
// for the full writeup, root cause, and evidence).
//
// Both tests are marked test.fail(): they currently FAIL to reproduce data
// loss / data corruption as expected. Once the underlying bug is fixed, these
// tests will start passing and Playwright will flag them as
// "expected to fail but passed" — the signal to promote them into regular
// regression tests (same pattern as e2e/regressions.spec.ts).
import { test, expect } from '@playwright/test'
import { readStores, createDeck, gotoDeckInput } from './helpers'

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

test.describe('QA v2: known unfixed bugs', () => {
  test.fail(
    'BUG-V2-001: a card added via the normal "add card" form is silently deleted by a concurrent "replace" bulk import',
    async ({ page }) => {
      await page.goto('/')
      await createDeck(page, 'V2race-import')
      await gotoDeckInput(page, 'V2race-import')

      const panel = page.locator('div').filter({ hasText: 'JSON一括登録' }).last()
      await panel.getByRole('button', { name: '開く' }).click()

      // Seed one card so "replace" has something to replace.
      await page.fill(
        'textarea[placeholder="JSONをここに貼り付け"]',
        JSON.stringify([{ front: 'old', back: 'old-back' }]),
      )
      await page.getByRole('button', { name: '既存に追加' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '追加する' }).click()
      await page.getByRole('alertdialog').waitFor({ state: 'hidden' })

      // A "replace" payload large enough (with real images) that buildCards()
      // must round-trip through Image.onload + canvas.toBlob + an IndexedDB
      // write per card — giving the browser real event-loop yields, unlike a
      // tight microtask-only loop over image-less cards.
      const bulk = Array.from({ length: 60 }, (_, i) => ({
        front: `bulk-${i}`,
        back: `bulk-back-${i}`,
        frontImage: PNG_1PX,
        backImage: null,
      }))
      await page.fill('textarea[placeholder="JSONをここに貼り付け"]', JSON.stringify(bulk))
      await page.getByRole('button', { name: '既存を置き換え' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '置き換える' }).click()

      // Do NOT wait for the replace to finish. While it is still running, use
      // the completely unrelated "add a card" form on the very same page.
      await page.fill('textarea[placeholder="表面のテキスト"]', 'RACE-CARD')
      await page.fill('textarea[placeholder="裏面のテキスト"]', 'RACE-CARD-BACK')
      await page.getByRole('button', { name: 'このカードを登録（Enter）' }).click()

      // Prove the card really was committed mid-import, so what follows is a
      // disappearance, not a submit that silently failed.
      await expect(async () => {
        const { cards } = await readStores<{ cards: { front: string }[] }>(page, ['cards'])
        expect(cards.map((c) => c.front)).toContain('RACE-CARD')
      }).toPass({ timeout: 5000 })

      await expect(page.getByText(/件を登録しました/)).toBeVisible({ timeout: 30_000 })
      await page.waitForTimeout(500)

      const { cards } = await readStores<{ cards: { front: string }[] }>(page, ['cards'])
      // Expected (bug-free) behavior: the card the user explicitly added
      // survives an unrelated bulk-replace of the deck. It doesn't.
      expect(cards.map((c) => c.front)).toContain('RACE-CARD')
    },
  )

  test.fail(
    'BUG-V2-002: undoing the last judgment of round 1 rolls back the card history but leaves the recorded session stats stale',
    async ({ page }) => {
      await page.goto('/')
      await createDeck(page, 'V2race-undo')
      await gotoDeckInput(page, 'V2race-undo')

      const panel = page.locator('div').filter({ hasText: 'JSON一括登録' }).last()
      await panel.getByRole('button', { name: '開く' }).click()
      await page.fill(
        'textarea[placeholder="JSONをここに貼り付け"]',
        JSON.stringify([{ front: 'only-card', back: 'only-back' }]),
      )
      await page.getByRole('button', { name: '既存に追加' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: '追加する' }).click()
      await page.getByRole('alertdialog').waitFor({ state: 'hidden' })

      await page.getByRole('link', { name: '学習へ' }).click()
      await page.getByRole('button', { name: '学習をはじめる' }).click()
      const guideClose = page.getByRole('button', { name: 'はじめる' })
      if (await guideClose.isVisible().catch(() => false)) await guideClose.click()

      // handleJudge() on the *last* card of round 1 fires finishRound()
      // without awaiting it. finishRound is `async` but has no `await`
      // before it computes the round result and calls setLastRoundResult —
      // the only await is `await db.sessions.add(sr)`, which happens *after*
      // that snapshot. Between that await starting and `setPhase('summary')`
      // running, `phase` is still 'playing' and the still-`canUndo`-enabled
      // Undo button is on screen. Fire both clicks back-to-back from inside
      // the page (bypassing Playwright's slower actionability checks) to
      // land inside that window.
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
      expect(dispatch.undone, 'undo click should have landed inside the race window').toBe(true)

      await page.waitForTimeout(1000)

      const { cards, sessions } = await readStores<{
        cards: { front: string; history: unknown[] }[]
        sessions: { correct: number; incorrect: number; total: number }[]
      }>(page, ['cards', 'sessions'])

      expect(cards[0]?.history.length, 'card history should reflect the undo').toBe(0)
      // Expected (bug-free) behavior: the recorded session — which drives the
      // "直近セッション比" baseline shown on every future summary screen for
      // this deck — should match the undo too. It stays stuck at the
      // pre-undo count (correct: 1) forever, permanently disagreeing with the
      // card's own (correctly rolled back) history.
      expect(sessions[0]?.correct, 'session record should also reflect the undo').toBe(0)
    },
  )
})
