import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Ban, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { blockUser, isUserBlocked, unblockUser } from '../../lib/blocks';
import { flashToast } from '../../lib/toast';

interface Props {
  targetUserId: string;
  targetName?: string;
  /** Render style: a full-width row button, or a compact pill. */
  variant?: 'row' | 'pill';
  onChange?: (blocked: boolean) => void;
}

/**
 * Block / unblock a user (Apple Guideline 1.2 — a mechanism for users to block
 * abusive users). Blocking hides the user's content from the blocker's feeds
 * (filtering is applied client-side via fetchBlockedIds) and disables messaging.
 */
export default function BlockUserButton({
  targetUserId,
  targetName,
  variant = 'row',
  onChange,
}: Props) {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user || user.id === targetUserId) {
      setLoaded(true);
      return;
    }
    isUserBlocked(user.id, targetUserId).then((b) => {
      if (active) {
        setBlocked(b);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [user, targetUserId]);

  if (!user || user.id === targetUserId || !loaded) return null;

  const toggle = async () => {
    if (busy) return;
    if (!blocked) {
      const ok = window.confirm(
        `Block ${targetName || 'this user'}? You won't see their content and they can't message you.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    const res = blocked
      ? await unblockUser(user.id, targetUserId)
      : await blockUser(user.id, targetUserId);
    setBusy(false);
    if (res.error) {
      flashToast(res.error, 'error');
      return;
    }
    const next = !blocked;
    setBlocked(next);
    onChange?.(next);
    flashToast(
      next ? `Blocked ${targetName || 'user'}.` : `Unblocked ${targetName || 'user'}.`,
      'info',
    );
  };

  const content: ReactNode = (
    <>
      {blocked ? <ShieldOff size={variant === 'pill' ? 12 : 16} /> : <Ban size={variant === 'pill' ? 12 : 16} />}
      <span>{blocked ? 'Unblock' : 'Block'}</span>
    </>
  );

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      style={variant === 'pill' ? st.pill : st.row}
    >
      {content}
    </button>
  );
}

const st: Record<string, CSSProperties> = {
  row: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    cursor: 'pointer',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-600)',
    fontSize: '11px',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
};
