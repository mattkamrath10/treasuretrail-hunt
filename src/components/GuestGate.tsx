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

  return (
    <div style={styles.overlay}>
      <div style={styles.overlayContent}>
        <TreasureChestLogo size={40} glow />
        <h3 style={styles.overlayTitle}>{title}</h3>
        <p style={styles.overlaySubtitle}>{subtitle}</p>
        <button onClick={exitGuestMode} style={styles.overlayBtn}>
          <UserPlus size={16} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={styles.overlayBtnText}>Create Free Account</span>
        </button>
        <p style={styles.overlayNote}>Join 10,000+ treasure hunters</p>
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
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    zIndex: 50,
    padding: 'var(--space-6)',
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
