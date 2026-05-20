import { useId, useState } from 'react';
import { Lock, UserPlus, X } from 'lucide-react';
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
  // Per-session dismiss: once you close it, it stays closed until the
  // tab is closed. We don't use localStorage so a returning visitor who
  // genuinely needs the sign-up CTA still sees it after a fresh visit.
  // Keyed by feature title so dismissing on FlashFinds doesn't suppress
  // the prompt on Profile, etc.
  const storageKey = `tt_guest_dismissed:${title || 'default'}`;
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(storageKey) === '1'; } catch { return false; }
  });
  const dismiss = () => {
    try { sessionStorage.setItem(storageKey, '1'); } catch {}
    setDismissed(true);
  };

  // Compact, inline (NOT full-screen-modal) prompt. The previous design
  // was a hard-gating yellow modal with a dimming backdrop — users found
  // it too aggressive and intrusive, especially since they often landed
  // on a gated page from BottomNav and just wanted to back out. This
  // smaller card sits in the page flow, can be dismissed with the X,
  // and still surfaces the same sign-up CTA.
  if (dismissed) return null;
  return (
    <div
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descId}
      style={styles.softCard}
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss sign-up prompt"
        style={styles.softDismiss}
      >
        <X size={16} />
      </button>
      <TreasureChestLogo size={32} glow />
      <h3 id={titleId} style={styles.softTitle}>{title || 'Sign up to continue'}</h3>
      <p id={descId} style={styles.softSubtitle}>{subtitle || 'Create a free account to unlock this feature.'}</p>
      <button onClick={exitGuestMode} style={styles.softBtn}>
        <UserPlus size={14} />
        <span style={styles.softBtnText}>Create Free Account</span>
      </button>
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
  softCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 'var(--space-2)',
    margin: 'var(--space-4)',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-100)',
  },
  softDismiss: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-neutral-500)',
    cursor: 'pointer',
  },
  softTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    margin: 0,
  },
  softSubtitle: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
    lineHeight: 1.4,
    margin: 0,
    maxWidth: 280,
  },
  softBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    color: 'var(--color-neutral-0)',
    border: 'none',
    cursor: 'pointer',
    marginTop: 4,
  },
  softBtnText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
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
