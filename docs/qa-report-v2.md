# 破壊的QA v2 報告

> **状態：未修正（本ラウンドは調査のみ）。** 対象は `docs/qa-report.md`
> （既存バグ8件の修正）以降に入った変更 —「UIをQuizlet風に刷新」
> （複合状態遷移を持つ画面を広く書き換え）と「AIに勉強資料からカードを
> 作らせるプロンプトを追加」（JSON一括登録の強化）。
> 前回と同じ観点（「どうすれば壊せるか」）で、既存の確定済み修正が壊れて
> いないか・新しい変更が新しい壊れ方を持ち込んでいないかを再攻撃した。
>
> 再現テストは `e2e/known-bugs-v2.spec.ts` に `test.fail()` 付きで記録した
> （前回と同じ運用：失敗することを期待するテストとして残し、修正が入った
> 時点で Playwright が "expected to fail but passed" で知らせる）。

---

## 確認済みバグ

### BUG-V2-001 「JSON一括登録：既存を置き換え」の実行中、まったく無関係な「カードを追加」フォームで登録したカードが無言で消える

- **分類**: Confirmed Bug
- **Severity**: Critical / 信頼度: High / 再現性: 100%（`e2e/known-bugs-v2.spec.ts` で確定的に再現）
- **再現条件**: 同一デッキの入力画面で、`BulkPanel`（JSON一括登録）と
  `CardForm`（通常のカード追加フォーム）が常に同時に表示・操作可能である
  こと（`src/components/Input/InputPage.tsx:33-46` の2カラムレイアウト）。
- **操作手順**:
  1. デッキの入力画面を開く。
  2. JSON一括登録パネルで、画像付きカードを何十件か含むJSONを貼り付け、
     「**既存を置き換え**」→確認ダイアログで「置き換える」を押す。
  3. その処理が終わるのを待たず、画面左の通常の「カードを追加」フォームに
     テキストを入力し、「**このカードを登録**」を押す。
  4. 一括置き換えの完了を待つ。
- **期待される結果**: 手順3で登録したカードは、手順2の一括置き換えとは
  無関係な独立した操作なので、そのまま残る。
- **実際の結果**: 手順3のカードはいったんIndexedDBに書き込まれる
  （書き込み自体は成功する）が、一括置き換えの完了後には**跡形もなく
  消える**。エラーも警告も出ない。一括置き換え側の完了通知は
  「60件を登録しました」とだけ表示し、ユーザーが手動で追加したカードが
  消えたことには一切触れない。
- **コード上の根拠**:
  `src/components/Input/BulkPanel.tsx:121-134`
  ```ts
  const { cards: newCards, warnings } = await buildCards(deckId, incoming) // ①数十件×画像処理で数百ms〜数秒かかる
  if (mode === 'replace') {
    const existing = await db.cards.where('deckId').equals(deckId).toArray() // ②①の後に「現在の」デッキの中身を読む
    await db.transaction('rw', db.cards, async () => {
      await db.cards.where('deckId').equals(deckId).delete() // ③deckIdに一致する現在の全カードを問答無用で削除
      await db.cards.bulkAdd(newCards)
    })
    await deleteImageRefs(existing.flatMap((c) => [c.frontImage, c.backImage]))
  }
  ```
  `buildCards`（`src/lib/exportImport.ts:274-303`）は1件ずつ
  `importImageField` → `toWebpBlob`（`Image.onload` → `canvas.toBlob` →
  `db.images.add`、いずれも実イベントループを介する非同期処理。
  `src/lib/image.ts:26-58`、`src/lib/imageStore.ts:99-113`）を直列await
  するため、画像入りカードが多いほど①は長時間ブロッキングなしで進行する
  ——つまりこの間ずっと、ブラウザは他のUIイベント（＝手順3のクリック）を
  処理できる。
  一方 `CardForm.submitNew`（`src/components/Input/CardForm.tsx:100-129`）は
  `db.cards.add(card)` を即座に実行するだけで、一括置き換えの進行状況とは
  一切連動していない（ロックも排他制御も無い）。
  結果として、②で読む `existing` および③の `delete()` はどちらも
  「一括置き換えを確認した時点のデッキの中身」ではなく「削除トランザクション
  実行時点でのデッキの中身」を対象にしてしまい、手順3で追加された
  カードも②に含まれ、③で一緒に削除される。削除後に呼ばれる
  `deleteImageRefs(existing.flatMap(...))` も②のスナップショットを見るだけ
  なので画像Blobのリークにも気づけない（カード本体はDBから消えるが、
  画像があった場合そのBlobは孤児として残り、次回起動時の
  `sweepOrphanImages()` に回収されるだけ＝データはさらに見えなくなる）。
- **実際の実行による確認**: Yes（`e2e/known-bugs-v2.spec.ts` の
  `BUG-V2-001` で、`RACE-CARD` が一括置き換え実行中にDBへ書き込まれた
  ことを確認した直後、置き換え完了後には存在しないことを直接IndexedDB
  から検証済み）。
- **原因**: 「削除対象は確認ダイアログを出した時点の一覧」という
  ユーザーの前提と、実装が「削除トランザクションを実行する瞬間の
  デッキの中身」を対象にしているという実装の前提がズレている。加えて、
  一括置き換え中も無関係なフォームがロックされずに操作可能。
- **ユーザーへの影響**: 「カードを追加」という、一見データ消失とは
  無縁な操作の結果が、裏で進行中の別操作によって無言で巻き戻される。
  ユーザーは自分が追加したカードが消えたことに気づく手段が無い
  （成功トーストは出ているため、正常に登録されたと信じたままになる）。
- **再現性**: 100%（画像付きカードを一定数含む「置き換え」を使えば、
  手動操作でも確実に再現できる時間差が生まれる。E2Eでは60枚の
  1x1画像で確定的に再現）。
- **外部環境への依存**: なし（単一タブ・単一ウィンドウ内で完結する）。
- **推奨される修正方針**: 「置き換え」トランザクションが対象にする
  カードIDの集合を、確認ダイアログを出す前（またはbuildCards開始前）に
  確定させ、`delete()` を `deckId` の等値条件ではなくその確定IDリストに
  対して行う。加えて、一括登録処理中は `CardForm` 側の登録操作も
  ロックする（少なくとも同一デッキに対しては）ことが望ましい。

### BUG-V2-002 ラウンド最後の1枚を判定した直後に「元に戻す」を押すと、カードの学習履歴は正しく巻き戻るのに、保存済みのセッション成績（次回比較の基準）だけ巻き戻らず永久にズレる

- **分類**: Confirmed Bug
- **Severity**: Medium / 信頼度: High / 再現性: 100%（`e2e/known-bugs-v2.spec.ts` で確定的に再現。手動操作では極めて短い時間窓のためタイミング次第）
- **再現条件**: 1周目（`roundNumber === 1`）のラウンドの**最後の1枚**を
  判定した直後、`finishRound` の内部処理（`db.sessions.add` /
  `db.studyDays.put`）が完了する前に「元に戻す」を押す。
- **操作手順**:
  1. カード1枚のデッキで学習を開始する（＝そのカードがラウンドの
     最初かつ最後の1枚になる）。
  2. 「覚えた（正解）」を押した直後、間を置かず「↺ 元に戻す」を押す。
- **期待される結果**: そのカードの学習履歴（`card.history`）と、
  今回のセッションとして保存される成績（`sessions` テーブル）の
  両方が「未判定」の状態に一致して巻き戻る。
- **実際の結果**: `card.history` は正しく空になる（Undo自体は
  DB上も正しく動く）。しかし `sessions` テーブルに保存された
  レコードは `correct: 1` のまま——**取り消したはずの判定を
  含んだ数値で永久に固定される**。この `sessions` レコードは
  そのデッキの次回以降すべての学習セッションで「直近セッション比」
  （`SummaryScreen.tsx:22-24,50-61` の `prevAccuracy` / `delta`）の
  比較基準として使われ続けるため、実際には0/0だったはずの回が
  「前回100%」として表示され続ける。UI上これを訂正する手段は無い。
- **コード上の根拠**:
  `src/components/Flash/FlashPage.tsx`
  ```ts
  const handleJudge = (correct: boolean) => {
    ...
    setCanUndo(true)                       // 169-196行目付近: 最後の1枚でも先にtrueにする
    if (index + 1 < queue.length) { ... }
    else {
      finishRound(roundJudgmentsRef.current, queue)  // 203行目: await せず fire-and-forget
    }
  }

  const finishRound = async (judgments, roundQueue) => {
    const correct = judgments.filter((j) => j.correct).length   // ここまでは同期的に即実行される
    ...
    const result: RoundResult = { ... }
    setLastRoundResult(result)
    if (roundNumber === 1 && deckId) {
      const sr: SessionResult = { correct, incorrect, ... }
      await db.sessions.add(sr)            // ← ここが最初のawait。この前に result/sr は確定済み
      await db.studyDays.put(...)
    }
    setPhase('summary')                     // これが呼ばれるまで phase は 'playing' のまま
  }

  const handleUndo = async () => {
    const judgments = roundJudgmentsRef.current
    const last = judgments.pop()!
    await db.cards.where(':id').equals(last.cardId).modify((stored) => {
      stored.history = stored.history.slice(0, -1)   // card側は正しく巻き戻る
      ...
    })
    ...
  }
  ```
  `finishRound` は `async` 関数だが、`correct`/`incorrect`/`result`/`sr`
  の計算は最初の `await db.sessions.add(sr)` より**前**、つまり
  `handleJudge` から呼ばれた同じ同期区間内で確定する。そのため
  `roundJudgmentsRef.current` を後から `pop()` しても、既に確定した
  `sr.correct` の値には影響しない。一方 `phase` が `'summary'` に
  切り替わるのは `await db.sessions.add(sr)` の**後**であり、この間
  ずっと `phase === 'playing'` のまま「↺ 元に戻す」ボタンは
  表示・有効（`canUndo` は `handleJudge` の冒頭で既に `true` に
  設定済み）。この窓の間にUndoを押すと、`card.history` は
  （modify()によるread-modify-writeで）正しく巻き戻るが、
  既に確定してDBに書き込まれる `sessions` レコードはそれと無関係に
  古い（Undo前の）数値のまま保存される。
- **実際の実行による確認**: Yes（`e2e/known-bugs-v2.spec.ts` の
  `BUG-V2-002` で、Undo後に `cards[0].history.length === 0` かつ
  `sessions[0].correct === 1` であることを直接IndexedDBから検証済み。
  手動操作でも再現しうるが、通常のクリック速度では窓が狭いため
  Playwright側はページ内から2クリックを連続ディスパッチして
  再現させている）。
- **原因**: `finishRound` の「結果の確定」と「DBへの永続化」が
  分離されておらず、確定後に永続化を待つ間もUIとUndo操作をロック
  していない（fire-and-forgetかつ排他制御なし）。
- **ユーザーへの影響**: カード自体の苦手優先出題（`difficulty`は
  `card.history`ベース）には影響しないため実害は小さいが、
  「直近セッション比」という明示的な機能の基準値が、ユーザーが
  取り消したはずの判定を含んだまま永久に汚染される。ユーザーからは
  一切気づけず、訂正手段も無い。
- **再現性**: コード上は100%成立するタイミング依存のrace。E2Eでは
  決定的に再現できたが、実機での手動操作の成功率は入力デバイスや
  端末性能に依存する（低スペック端末・IndexedDBの応答が遅い環境
  ほど窓が広がり再現しやすい）。
- **外部環境への依存**: なし（単一タブ内、IndexedDBの書き込み
  レイテンシに依存する時間窓）。
- **推奨される修正方針**: `finishRound` が `db.sessions.add` を
  完了するまで、Undoボタンを無効化する（例えば `canUndo` を
  最後の1枚の判定時には即座に `true` にせず、`finishRound` の
  永続化完了後にまとめて反映する）。あるいは `handleUndo` 側で
  「直前の判定がラウンド最後の1枚であり `finishRound` が進行中」
  であることを検知してブロックする。

---

## 前回（v1）で確定・修正済みのバグの再確認

BUG-001〜003、POT-001〜005はいずれも `e2e/regressions.spec.ts` で
グリーンのままであることを確認した（本ラウンドの `npx playwright test`
実行結果：17件中、新規に追加した`test.fail()`の2件を除きすべて green）。
UI刷新（Quizlet風リニューアル）は見た目の書き換えが中心で、これらの
修正が依拠していたデータフローの骨格（`modify()`によるトランザクション化、
参照カウント方式の画像削除、下書きキーの一元化など）はそのまま残っている。

## 調査したが問題が無かった点

- **BUG-V2-001と同型の「追加」モード**: `doImport('append')` は
  対象デッキの既存カードを一切削除しないため、同じ競合は成立しない
  （確認済み。`bulkAdd` のみ）。
- **一括置き換えの確認ダイアログとフォーム操作の競合**:
  `ConfirmProvider` の確認モーダルは全画面オーバーレイで背景操作を
  ブロックするため、確認ダイアログが出ている間は`CardForm`を
  操作できない。競合の窓は「確認後、`buildCards`実行中」にのみ
  存在する（本報告のBUG-V2-001はまさにこの窓を突いている）。
- **`CardList.deleteChecked` の選択リストの陳腐化**: `filtered`
  （表示中のカード一覧）はチェック時点のスナップショットではなく
  `useLiveQuery`由来の最新値からその都度計算されるため、選択中に
  他のカードが増減しても選択済みIDの対象がズレることはない
  （コードレビューのみ、実行未確認）。

## 未検証領域・今回のテストの盲点

- BUG-V2-001は画像なしカードでも理論上は成立しうるが、
  純粋な同期処理に近いためブラウザのイベントループが競合クリックを
  挟む余地がほぼ無く、実際には画像を伴わないと再現が難しい
  （＝画像を含まない大量テキストJSONでの再現性は本報告では未検証）。
- BUG-V2-002は他の非1周目ラウンド（`roundNumber > 1`の再挑戦ラウンド）
  では`finishRound`内に`await`が存在しないため成立しない
  （再挑戦ラウンドでは`setPhase('summary')`まで完全に同期実行される）。
  これは今回のコードリーディングで確認済みだが、念のための明示。
- マルチウィンドウ・マルチタブでの`BulkPanel`置き換えの競合、
  Service Workerの更新、実機での指の連打によるタイミング再現は
  本ラウンドでも未検証（前回からの持ち越し）。

## 総合評価

**確認済みバグ**
- Critical: 1（BUG-V2-001）
- High: 0
- Medium: 1（BUG-V2-002）
- Low: 0

**バグ候補**: なし（本ラウンドではコード追跡と実行確認が揃った2件に
絞り、未確認のまま数を水増ししていない）

**理論上のリスク**
- BUG-V2-001の画像なし版（純テキストJSONでの「置き換え」中の競合）。
  イベントループを跨ぐ非同期の隙が小さく、成立しても再現性は低い。

**最も危険なコード**
1. `src/components/Input/BulkPanel.tsx:121-134`（`doImport`の`replace`分岐）
   — 削除対象を確認時ではなく実行時に再評価しており、削除範囲が
   ユーザーの同意した範囲を超えて広がりうる。
2. `src/components/Flash/FlashPage.tsx:109-167`（`finishRound`）
   — 結果の確定と永続化が非同期に分離されたまま、UIロックが
   伴っていない。
3. `src/components/Input/CardForm.tsx:100-129`（`submitNew`）
   — それ自体は健全だが、他の破壊的操作（一括置き換え）と一切
   協調していないため、1.の踏み台になる。

**最も危険な状態遷移**
JSON一括置き換えを実行 → その完了を待たず通常のカード追加フォームを
使う → 一括置き換えの削除トランザクションが「実行時点の現在のデッキ」
を対象に走る → 追加したカードごと削除される

**次に実施すべき破壊テスト**
1. マルチタブで同一デッキに対し「置き換え」を同時に2回実行した場合の
   最終状態（片方が完全に消えるか、部分的にマージされるか）。
2. `finishRound`が`roundNumber > 1`でも将来`await`を挟むよう変更された
   場合に備え、再挑戦ラウンドの最後の1枚に対する同種のUndo競合。
3. `BulkPanel`の「追加」モード中に、同じカードを`CardForm`側でも
   同時に編集・削除した場合の、`bulkAdd`失敗時の部分適用挙動
   （Dexieの`bulkAdd`はデフォルトで全件失敗时の扱いが曖昧なため）。
