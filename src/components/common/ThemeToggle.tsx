import { useTheme } from '../../hooks/useTheme'

const ICON = { system: '🖥️', light: '☀️', dark: '🌙' } as const
const LABEL = { system: 'システム', light: 'ライト', dark: 'ダーク' } as const

export function ThemeToggle() {
  const { pref, cycle } = useTheme()
  return (
    <button
      onClick={cycle}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
      style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
      title="表示テーマを切り替え"
      aria-label={`テーマ: ${LABEL[pref]}`}
    >
      <span aria-hidden>{ICON[pref]}</span>
      {LABEL[pref]}
    </button>
  )
}
