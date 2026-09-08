// A prompt the user can hand to any chat AI together with their study
// material. The AI's answer is meant to be pasted straight into the JSON
// bulk importer, so the prompt pins down the exact shape that
// `parseImportJson` accepts — including the image fields, which an AI can
// only fill with something broken and therefore must leave null.

export type CardStyle = 'termToMeaning' | 'questionToAnswer' | 'cloze'

export const CARD_STYLE_LABEL: Record<CardStyle, string> = {
  termToMeaning: '用語 → 意味',
  questionToAnswer: '問い → 答え',
  cloze: '穴埋め',
}

const STYLE_INSTRUCTION: Record<CardStyle, string> = {
  termToMeaning:
    '- front には用語や人名などの「名前」を、back にはその意味・定義・特徴を書いてください。',
  questionToAnswer:
    '- front には資料の内容を問う質問文を、back にはその答えを書いてください。答えが一意に決まる質問にしてください。',
  cloze:
    '- front には資料中の一文の重要語を「____」で隠したものを、back には隠した語だけを書いてください。1文につき隠す箇所は1つにしてください。',
}

export interface PromptOptions {
  count: number
  style: CardStyle
}

/** Build the copy-paste prompt. `material` is left as a placeholder the user
 * replaces with (or appends) their own text. */
export function buildAiPrompt({ count, style }: PromptOptions): string {
  return `あなたは学習用フラッシュカードを作る専門家です。
下の「資料」から暗記用カードを作り、JSONで出力してください。

# 出力形式（厳守）
次の形式のJSON配列**だけ**を出力してください。前置き・解説・\`\`\` などの記号は一切書かないでください。

[
  { "front": "表のテキスト", "frontImage": null, "back": "裏のテキスト", "backImage": null }
]

- front: 覚えるときの手がかり（表面）
- back: 思い出す内容（裏面）
- frontImage / backImage: **必ず null**。画像はアプリ側で後から追加します。

# 作り方のルール
1. カードは${count}枚程度にしてください。
2. 1枚のカードで覚えることは1つだけにしてください（複数の事実を詰め込まない）。
3. front は短く、back は簡潔に（目安40字以内）。長い説明は複数のカードに分けてください。
4. **資料に書かれていないことは書かないでください。** 曖昧な箇所は推測で補わず、そのカードを作らないでください。
5. 同じ内容のカードを重複して作らないでください。
6. front と back は両方とも空にしないでください。
7. 資料が外国語の場合、front に原語、back に日本語訳と意味を書いてください。
${STYLE_INSTRUCTION[style]}

# 資料
ここに資料を貼り付けてください（テキスト・箇条書き・教科書の抜粋など）。
`
}

/** Shown next to the prompt so the user knows what to do with the answer. */
export const AI_PROMPT_STEPS = [
  'このプロンプトをコピーする',
  'ChatGPTなどに貼り付け、末尾に勉強したい資料を続けて送る',
  '返ってきたJSONをコピーして、下の「JSONをここに貼り付け」に貼る',
  '「既存に追加」を押す',
]
