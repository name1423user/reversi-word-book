# QA報告：破壊的テストで見つかった既知バグ

破壊的QA（正常系ではなく「どうすれば壊せるか」を探す観点）での調査結果。
確認済みバグはすべて実際に再現させ、ユーザーへの実害まで確認している。

再現テストは `e2e/known-bugs.spec.ts` にある。各テストは `test.fail()` で
「失敗が期待される」と印をつけてあるため、

- バグが残っている間：失敗する → 期待どおりなのでCIはグリーン
- バグを修正した時点：成功する → Playwrightが "expected to fail but passed" で
  赤くなるので、`test.fail()` を外す作業を忘れずに済む

つまりこのファイルは未修正バグの一覧であり、修正の完了判定でもある。

---

## 確認済みバグ

### BUG-001 「不正解だけもう一度」で1周目の学習履歴が消える

- **Severity: High** / 信頼度: High / 再現性: 100%
- **現象**：1周目に間違えたカードを再挑戦ラウンドで正解すると、1周目の
  「不正解」履歴が消え、`history` が `[正解]` の1件だけになる。
- **原因**：`src/components/Flash/FlashPage.tsx` の `queue` はラウンド開始時の
  スナップショット（`useLiveQuery` の更新を受けない）。再挑戦ラウンドは
  `finishRound` が作った `wrongCards`（同じ古いオブジェクト参照）を再利用するため、
  `handleJudge` の `history: [...card.history, 新エントリ]` が
  セッション開始時点の配列に追記してDBを上書きし、1周目の書き込みを失う（lost update）。

  ```
  FlashPage.tsx:131  wrongCards = roundQueue.filter(...)      // 古いスナップショット
  FlashPage.tsx:219  applyOrder(lastRoundResult.wrongCards)   // それをそのまま次ラウンドへ
  FlashPage.tsx:170  const card = queue[index]                // 古い history を持つ
  FlashPage.tsx:183  history: [...card.history, 新エントリ]    // 古い配列に追記して上書き
  ```

- **実害**：間違えた直後に正解したカードが「正答 1/1（100%）」と表示され、
  苦手順では最初から正解し続けたカードより下に並ぶ。
  **苦手優先出題が、本来狙うべきカードに対してだけ機能しなくなる。**
- **修正方針**：`handleJudge` で `queue` の history を使わず、DBから最新を読んで
  追記する（Dexieの `modify` でアトミックに追記するのが確実）。再挑戦ラウンド開始時に
  DBから取り直すだけでは、ラウンド内で連続再挑戦した場合に同じ問題が残る。

### BUG-002 下書きの画像がリロードで削除される（spec違反）

- **Severity: Medium** / 信頼度: High / 再現性: 100%
- **現象**：画像をアップロードして登録前にリロードすると、画像Blobが削除され、
  下書きは存在しないBlobを指したまま残る（「画像が読み込めません」表示）。
  構想メモの「入力途中の内容は自動保存、画面遷移しても下書きが消えない」に反する。
- **原因**：`src/App.tsx:15` の起動時 `sweepOrphanImages()` が、
  `src/lib/imageStore.ts:96` で **cardsテーブルのみ**を到達可能ルートとして走査しており、
  localStorage の下書き（`wordbook:draft:*`）が持つ `image:<id>` 参照を見ていない。
  GCのルート集合が不完全。
- **修正方針**：sweepのルートに下書きを含める（`wordbook:draft:*` を走査して参照を集める）。
- **補足**：以前のE2Eは、この破壊的挙動を「正しい」としてアサートしていた。
  テストが存在することは安全を意味しない実例。

### BUG-003 登録ボタンの二重押下でBlobを共有するカードができる

- **Severity: Medium** / 信頼度: High / 再現性: 高（ダブルタップ相当で100%）
- **現象**：画像付きカードの「登録」を素早く2回押すと、同じ `image:<id>` を共有する
  2枚が生成される。後日その片方を削除すると、**残った方の画像が壊れる**。
- **原因**：①`src/components/Input/CardForm.tsx:94` の `submitNew` に実行中ガードが無く
  （`disabled={isEmpty(draft)}` のみ）、`await db.cards.add()` 完了前の2回目が同じ
  `draft.frontImage` を読む。②Blob削除が参照カウントを持たない
  （`duplicateCard` ではBlobを複製して回避しているのに、この経路だけ抜けている）。
- **修正方針**：`submitNew` にin-flightガード（refのbusyフラグ＋ボタンdisabled）。
  加えてBlob削除を参照カウント化するか、削除前に他カードからの参照有無を確認する。

---

## バグ候補（コード上の因果は追えたが、実行では未再現）

| ID | 内容 | 顕在化時のSeverity |
|---|---|---|
| POT-001 | 「先にJSONで書き出す」と「削除する」の競合。`ConfirmProvider.tsx:71` は `extraAction.run()` をawaitせず、進行中表示も無く削除ボタンは押せたまま。`exportDeck` はカードを先に読むが画像Blobは後から非同期に読むため、その間に削除が走ると画像がnullのバックアップになりうる。実測：外部URL画像2枚で書き出しに約1秒、その間ずっと削除可能。`fetchAsDataUrl`（`exportImport.ts:35`）にタイムアウトが無いため、リンク切れ次第で窓はさらに伸びる | High |
| POT-002 | 判定直後のUndo。`handleJudge` のDB更新はfire-and-forget、`handleUndo` は非同期のread-modify-write。順序が入れ替わると履歴が壊れる | Medium |
| POT-003 | 別タブでデッキを空にした後の「最初から全部やり直す」。`startSession` は0枚を弾くが `restartAll` は弾かないため、操作不能な空白画面になりうる | Medium |
| POT-004 | 学習中に別タブでカードを削除。Dexieの `update` は存在しないキーでもエラーにならないため、その判定が無言で失われる | Low |
| POT-005 | URL直接操作で別デッキの入力画面へ遷移すると、`useDraft` のkey変更時に旧デッキの下書きが新デッキのkeyへ書き込まれる。UI内に該当遷移経路は無い | Low |

## 調査したが問題が無かった点

- **XSS**：`useImageSrc` は `http(s)` か内部 `image:` 参照しか `<img src>` に渡さない。
  `javascript:` 等はプレースホルダ表示になる。
- **プロトタイプ汚染**：インポートはオブジェクトリテラルを再構築しているため不成立。
- **削除前バックアップの素直な競合**：書き出しが先に完了し、再現しなかった（POT-001参照）。

## テストの盲点

- 単体テストは純粋関数のみ。DB書き込み・React状態・非同期の順序を一切カバーしていない。
- E2Eは正常系中心で、「Aの処理中にBをする」複合シーケンスが手薄。
- 未検証領域：実機iOS/iPad、複数タブ同時操作、大量データ、Service Worker更新、オフライン復帰。
