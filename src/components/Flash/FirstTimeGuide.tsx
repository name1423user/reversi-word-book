export function FirstTimeGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="q-card w-full max-w-xs p-6 flex flex-col gap-4 text-center"
        style={{ boxShadow: 'var(--shadow-lift)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-extrabold">使い方</h2>
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
          className="q-btn q-btn-primary"
        >
          はじめる
        </button>
      </div>
    </div>
  )
}
