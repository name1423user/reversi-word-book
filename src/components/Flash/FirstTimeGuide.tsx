export function FirstTimeGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xs rounded-xl p-5 flex flex-col gap-4 text-center"
        style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">使い方</h2>
        <div className="flex flex-col gap-3 text-sm text-left">
          <p>
            <b>中央をタップ</b> — カードを裏返す
          </p>
          <p>
            <b>右端／右へスワイプ</b> — 正解 ○
          </p>
          <p>
            <b>左端／左へスワイプ</b> — 不正解 ✕
          </p>
          <p style={{ color: 'var(--text-muted)' }}>
            PCではキーボードの ← → で判定、スペースで裏返せます。
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
        >
          はじめる
        </button>
      </div>
    </div>
  )
}
