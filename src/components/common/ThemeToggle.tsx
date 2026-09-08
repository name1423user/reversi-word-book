import { useTheme } from '../../hooks/useTheme'

const ICON = { system: '🖥️', light: '☀️', dark: '🌙' } as const
const LABEL = { system: 'システム', light: 'ライト', dark: 'ダーク' } as const

export function ThemeToggle() {
  const { pref, cycle } = useTheme()
  return (
    <button
      onClick={cycle}
      className="q-btn q-btn-outline q-btn-sm"
      title="表示テーマを切り替え"
      aria-label={`テーマ: ${LABEL[pref]}`}
    >
      <span aria-hidden>{ICON[pref]}</span>
      {LABEL[pref]}
    </button>
  )
}
