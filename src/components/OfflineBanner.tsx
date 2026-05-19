import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * OfflineBanner — subtle, non-intrusive indicator shown only while
 * `navigator.onLine` reports false. Honest fallback: we surface real
 * connectivity loss rather than silently failing fetches.
 *
 * Mounted once at the AppShell level. Renders nothing while online to
 * avoid layout impact.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div role="status" aria-live="polite" style={styles.banner}>
      <WifiOff size={14} aria-hidden="true" />
      <span>You're offline. Updates will resume when your connection is back.</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 500,
    lineHeight: 1.3,
    flexShrink: 0,
  },
};
