import { useEffect, useId, useRef } from 'react';
import { Lock, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { TreasureChestLogo } from './TreasureChestLogo';

interface GuestGateProps {
  children: React.ReactNode;
  action?: string;
  feature?: string;
}

export function GuestGate({ children, action, feature }: GuestGateProps) {
  const { isGuest } = useAuth();
  if (!isGuest) return <>{children}</>;
  return <GuestPromptInline action={action} feature={feature} />;
}

export function GuestPromptInline({ action, feature }: { action?: string; feature?: string }) {
  const { exitGuestMode } = useAuth();

  return (
    <div style={styles.inlinePrompt}>
      <Lock size={14} style={{ color: 'var(--color-primary-500)' }} />
      <span style={styles.inlineText}>
        {action || 'Create a free account'} to {feature || 'unlock this feature'}
      </span>
      <button onClick={exitGuestMode} style={styles.inlineBtn}>
        <span style={styles.inlineBtnText}>Sign Up</span>
      </button>
    </div>
  );
}

export function GuestOverlay({ title, subtitle }: { title: string; subtitle: string }) {
  const { exitGuestMode } = useAuth();
  const titleId = useId();
  const descId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);

  // This is a hard gate (no Esc-to-dismiss): guests must either sign up
  // or navigate away via the BottomNav. We still trap focus to the CTA
  // and lock background scroll so screen-reader / keyboard users aren't
  // stranded behind the modal.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    btnRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Big, centered, yellow "Get started on TreasureTrail" card shown
  // whenever a guest tries to use an account-only feature (FlashFinds,
  // RareRadar, Live Events, Profile, etc). The 3-step list previews
  // what they'll be able to do once they sign up.
  return (
    <div style={styles.overlay}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        style={styles.yellowCard}
      >
        <TreasureChestLogo size={44} glow />
        <h3 id={titleId} style={styles.yellowTitle}>Get started on TreasureTrail</h3>
        <p id={descId} style={styles.yellowSubtitle}>{subtitle || title}</p>
        <ol style={styles.yellowList}>
          <li style={styles.yellowItem}>
            <span style={styles.yellowNum}>1</span>
            <span style={styles.yellowItemText}>Complete your profile</span>
          </li>
          <li style={styles.yellowItem}>
            <span style={styles.yellowNum}>2</span>
            <span style={styles.yellowItemText}>Share your first find</span>
          </li>
          <li style={styles.yellowItem}>
            <span style={styles.yellowNum}>3</span>
            <span style={styles.yellowItemText}>Follow your first scout</span>
          </li>
        </ol>
        <button ref={btnRef} onClick={exitGuestMode} style={styles.yellowBtn}>
          <UserPlus size={16} style={{ color: 'var(--color-neutral-900)' }} />
          <span style={styles.yellowBtnText}>Create Free Account</span>
        </button>
        <p style={styles.yellowNote}>It's free — takes under a minute</p>
      </div>
    </div>
  );
}

export function GuestBlurOverlay({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  const { isGuest, exitGuestMode } = useAuth();

  if (!isGuest) return <>{children}</>;

  return (
    <div style={styles.blurWrap}>
      <div style={styles.blurContent}>{children}</div>
      <div style={styles.blurOverlay}>
        <TreasureChestLogo size={32} glow />
        <h3 style={styles.blurTitle}>{title}</h3>
        <p style={styles.blurSubtitle}>{subtitle}</p>
        <button onClick={exitGuestMode} style={styles.blurBtn}>
          <span style={styles.blurBtnText}>Unlock with Free Account</span>
        </button>
      </div>
    </div>
  );
}

export function useGuestAction() {
  const { isGuest, exitGuestMode } = useAuth();

  const requireAuth = (callback: () => void) => {
    if (isGuest) {
      exitGuestMode();
      return;
    }
    callback();
  };

  return { isGuest, requireAuth };
}

const styles: Record<string, React.CSSProperties> = {
  inlinePrompt: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-100)',
    borderRadius: 'var(--radius-md)',
  },
  inlineText: {
    flex: 1,
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-700)',
  },
  inlineBtn: {
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
  },
  inlineBtnText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 1000,
    padding: 'var(--space-6)',
  },
  yellowCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 'var(--space-3)',
    width: '100%',
    maxWidth: 360,
    padding: 'var(--space-6)',
    borderRadius: 'var(--radius-xl)',
    backgroundColor: '#FEF3C7',
    border: '2px solid #FBBF24',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  yellowTitle: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: '#78350F',
    margin: 0,
  },
  yellowSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: '#92400E',
    lineHeight: 1.4,
    margin: 0,
  },
  yellowList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-2)',
  },
  yellowItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 'var(--radius-md)',
  },
  yellowNum: {
    width: 24,
    height: 24,
    borderRadius: 'var(--radius-full)',
    backgroundColor: '#F59E0B',
    color: '#FFFFFF',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  yellowItemText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: '#78350F',
  },
  yellowBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-6)',
    width: '100%',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: '#FBBF24',
    border: '2px solid #F59E0B',
    boxShadow: '0 4px 12px rgba(251,191,36,0.35)',
    marginTop: 'var(--space-3)',
    cursor: 'pointer',
  },
  yellowBtnText: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: '#78350F',
  },
  yellowNote: {
    fontSize: 'var(--font-size-xs)',
    color: '#92400E',
    margin: 0,
  },
  overlayContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 'var(--space-3)',
    maxWidth: '280px',
  },
  overlayTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  overlaySubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    lineHeight: '1.5',
  },
  overlayBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-5)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
    marginTop: 'var(--space-2)',
  },
  overlayBtnText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
  },
  overlayNote: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  blurWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  blurContent: {
    filter: 'blur(6px)',
    pointerEvents: 'none',
    opacity: 0.6,
  },
  blurOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    textAlign: 'center',
    padding: 'var(--space-4)',
    zIndex: 10,
  },
  blurTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  blurSubtitle: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
    maxWidth: '240px',
    lineHeight: '1.4',
  },
  blurBtn: {
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    boxShadow: '0 4px 12px rgba(234, 179, 8, 0.25)',
    marginTop: 'var(--space-2)',
  },
  blurBtnText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
  },
};
