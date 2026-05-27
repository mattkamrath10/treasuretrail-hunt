import { useState } from 'react';
import { Store, ArrowRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Dismissible "Become a Host" CTA shown to seeker accounts on Home and
 * Profile. We deliberately do NOT force a picker on existing users — the
 * upgrade is opt-in via this card or the Profile settings.
 *
 * Dismissals are scoped by `surface` so dismissing on Home doesn't hide
 * the same card on Profile (and vice versa).
 */
export function BecomeHostCard({ surface }: { surface: 'home' | 'profile' }) {
  const { profile, updateProfile } = useAuth();
  const storageKey = `tt_become_host_dismissed:${surface}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === '1'; } catch { return false; }
  });
  const [upgrading, setUpgrading] = useState(false);
  const navigate = useNavigate();

  // Hide for holders and for users who've dismissed it this session.
  if (!profile || profile.account_type === 'holder' || dismissed) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(storageKey, '1'); } catch {}
    setDismissed(true);
  };

  const becomeHost = async () => {
    setUpgrading(true);
    const { error } = await updateProfile({ account_type: 'holder' });
    setUpgrading(false);
    if (error) {
      console.error('[BECOME_HOST] updateProfile failed', error);
      return;
    }
    // Send them to their new dashboard right away.
    navigate('/seller');
  };

  return (
    <div style={styles.card}>
      <button onClick={dismiss} style={styles.dismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
      <div style={styles.iconWrap}>
        <Store size={20} style={{ color: 'var(--color-primary-600)' }} />
      </div>
      <div style={styles.body}>
        <h3 style={styles.title}>Hosting an event?</h3>
        <p style={styles.subtitle}>
          List your estate sale, yard sale, flea market or auction and reach
          local buyers. Free to publish.
        </p>
        <button onClick={becomeHost} disabled={upgrading} style={styles.cta}>
          {upgrading ? 'Setting up…' : 'Become a Host'}
          {!upgrading && <ArrowRight size={14} />}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    position: 'relative',
    display: 'flex',
    gap: 'var(--space-3)',
    margin: '0 var(--space-4) var(--space-3)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-primary-50, #fff8e1)',
    border: '1px solid var(--color-primary-100, #ffe69c)',
    borderRadius: 'var(--radius-md)',
  },
  dismiss: {
    position: 'absolute', top: 6, right: 6,
    width: 24, height: 24, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none',
    color: 'var(--color-neutral-500)', cursor: 'pointer',
  },
  iconWrap: {
    flexShrink: 0,
    width: 40, height: 40, borderRadius: 'var(--radius-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'var(--color-neutral-0)',
  },
  body: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  title: {
    margin: 0,
    fontSize: 'var(--font-size-sm)',
    fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  subtitle: {
    margin: 0,
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
    lineHeight: 1.4,
  },
  cta: {
    alignSelf: 'flex-start',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    marginTop: 4,
    padding: 'var(--space-2) var(--space-3)',
    border: 'none', borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-600, #d97706)',
    color: '#fff',
    fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer',
  },
};
