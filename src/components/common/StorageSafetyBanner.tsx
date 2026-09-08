import { useState } from 'react'
import { useStoragePersistence } from '../../hooks/useStoragePersistence'
import { useToast } from './ToastProvider'

const DISMISS_KEY = 'wordbook:dismissedStorageWarning'

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac, but has touch points.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/**
 * Warns when the browser may evict our data. Only shown when there is
 * something to lose (`hasData`) and storage isn't already persistent.
 */
export function StorageSafetyBanner({ hasData }: { hasData: boolean }) {
  const { status, isInstalled, request } = useStoragePersistence()
  const toast = useToast()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1',
  )

  if (!hasData || dismissed) return null
  if (status === 'checking' || status === 'persisted') return null
  // An installed app is exempt from iOS's eviction sweep, so don't nag.
  if (isInstalled) return null

  const ios = isIos()

  const onRequest = async () => {
    const granted = await request()
    toast.show(
      granted
        ? 'この端末にデータを保存する設定になりました。'
        : 'ブラウザが許可しませんでした。ホーム画面に追加すると確実に保存されます。',
      granted ? 'info' : 'error',
    )
  }

  return (
    <section
      className="rounded-xl p-4 mb-5 text-sm"
      style={{
        background: 'var(--danger-bg)',
        color: 'var(--text)',
        border: '1px solid var(--danger)',
      }}
      role="status"
    >
      <p className="font-semibold mb-1" style={{ color: 'var(--danger)' }}>
        ⚠ データが自動的に削除される可能性があります
      </p>
      <p className="mb-3" style={{ color: 'var(--text-muted)' }}>
        {ios
          ? 'iPhone / iPadのSafariは、しばらく開かなかったサイトの保存データを自動で削除することがあります。共有ボタンから「ホーム画面に追加」しておくと、この削除の対象外になります。'
          : 'ブラウザの空き容量が減ると、保存したカードが自動的に削除されることがあります。下のボタンで保存を優先する設定にできます。'}
      </p>
      <div className="flex flex-wrap gap-2">
        {!ios && status === 'transient' && (
          <button
            onClick={onRequest}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ background: 'var(--danger)', color: 'var(--accent-contrast)' }}
          >
            データを保護する
          </button>
        )}
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1')
            setDismissed(true)
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
        >
          あとで
        </button>
      </div>
      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        いずれの場合も、ときどき「全体を書き出す」でバックアップを保存しておくと安心です。
      </p>
    </section>
  )
}
