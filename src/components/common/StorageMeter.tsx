import { useStorageEstimate } from '../../hooks/useStorageEstimate'

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  const units = ['KB', 'MB', 'GB']
  let value = n / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)}${units[i]}`
}

/** Small storage-usage readout so images piling up doesn't silently run
 * into the browser's IndexedDB quota. Renders nothing when the estimate
 * API is unsupported or quota is unreported (0). */
export function StorageMeter() {
  const estimate = useStorageEstimate()
  if (!estimate || estimate.quota === 0) return null

  const ratio = estimate.usage / estimate.quota
  const warn = ratio > 0.8

  return (
    <p
      className="text-xs"
      style={{ color: warn ? 'var(--danger)' : 'var(--text-muted)' }}
      title={`${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}`}
    >
      {warn && '⚠ '}使用容量 {formatBytes(estimate.usage)}（{Math.round(ratio * 100)}%）
    </p>
  )
}
