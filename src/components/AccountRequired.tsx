import { useNavigate } from 'react-router-dom';
import { LogIn, UserPlus, Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { TreasureChestLogo } from './TreasureChestLogo';

/**
 * Full-screen "Account Required" gate for guest users who reach an
 * authenticated-only page (Create Event, Seller Dashboard, etc.).
 *
 * Replaces the old infinite spinner those pages showed when `profile`
 * was null — a guest never gets a profile, so the spinner never resolved
 * (the reported blank pink screen). Here we offer a clear path forward
 * instead of a dead end.
 *
 * Sign Up / Log In stash the desired auth view in sessionStorage and
 * call exitGuestMode(), which flips App.tsx out of guest mode and into
 * the Login/SignUp screen. navigate('/') leaves the gated route so the
 * user isn't dropped back onto it after authenticating.
 */
export function AccountRequired({ message }: { message?: string }) {
  const { exitGuestMode } = useAuth();
  const navigate = useNavigate();

  const goAuth = (view: 'login' | 'signup') => {
    try { sessionStorage.setItem('tt_auth_view', view); } catch {}
    exitGuestMode();
    navigate('/');
  };

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <TreasureChestLogo size={48} glow />
        <h1 style={styles.title}>Account Required</h1>
        <p style={styles.message}>
          {message ||
            'You must create a free TreasureTrail Marketplace account to create events, post listings, save favorites, send messages, and access seller features.'}
        </p>

        <button onClick={() => goAuth('signup')} style={styles.primaryBtn}>
          <UserPlus size={16} />
          <span>Sign Up</span>
        </button>
        <button onClick={() => goAuth('login')} style={styles.secondaryBtn}>
          <LogIn size={16} />
          <span>Log In</span>
        </button>
        <button onClick={() => navigate('/')} style={styles.ghostBtn}>
          <Compass size={16} />
          <span>Continue Browsing</span>
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  screen: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-5)',
    backgroundColor: 'var(--color-neutral-50)',
    overflowY: 'auto',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-5)',
    backgroundColor: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-lg)',
  },
  title: {
    margin: 0,
    fontSize: 'var(--font-size-xl)',
    fontWeight: 800,
    color: 'var(--color-neutral-900)',
  },
  message: {
    margin: 0,
    fontSize: 'var(--font-size-sm)',
    lineHeight: 1.5,
    color: 'var(--color-neutral-600)',
  },
  primaryBtn: {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-full)',
    border: 'none',
    cursor: 'pointer',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 700,
  },
  secondaryBtn: {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)',
    cursor: 'pointer',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-800)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 700,
  },
  ghostBtn: {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-full)',
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: 'var(--color-neutral-500)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
  },
};
