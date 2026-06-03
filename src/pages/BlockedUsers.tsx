import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowLeft, ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchBlockedUsers, unblockUser, type BlockedUser } from '../lib/blocks';
import { flashToast } from '../lib/toast';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { AvatarFallback } from '../components/ui/MediaFallback';
import { toThumbUrl } from '../lib/imageCompress';

/**
 * Blocked Users management screen (Apple Guideline 1.2). Because a blocked
 * user's content is hidden everywhere else in the app, this list is the only
 * place a user can find and undo a block. Reachable from Profile → Account.
 */
export default function BlockedUsers({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [list, setList] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) {
      setLoading(false);
      return;
    }
    fetchBlockedUsers(user.id)
      .then((rows) => {
        if (active) setList(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const handleUnblock = async (target: BlockedUser) => {
    if (!user || busyId) return;
    setBusyId(target.id);
    const res = await unblockUser(user.id, target.id);
    setBusyId(null);
    if (res.error) {
      flashToast(res.error, 'error');
      return;
    }
    setList((prev) => prev.filter((u) => u.id !== target.id));
    flashToast(`Unblocked ${target.username ? '@' + target.username : 'user'}.`, 'info');
  };

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={st.headerTitle}>Blocked Users</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        <p style={st.lead}>
          People you've blocked won't appear in your feeds and can't message you.
          Tap <strong>Unblock</strong> to undo a block at any time.
        </p>

        {loading ? (
          <p style={st.empty}>Loading…</p>
        ) : list.length === 0 ? (
          <div style={st.emptyCard}>
            <ShieldOff size={28} style={{ color: 'var(--color-neutral-300)' }} />
            <span style={st.emptyTitle}>No blocked users</span>
            <span style={st.emptyDesc}>
              When you block someone, they'll show up here so you can unblock them later.
            </span>
          </div>
        ) : (
          <div style={st.list}>
            {list.map((u) => (
              <div key={u.id} style={st.row}>
                <div style={st.avatar as CSSProperties}>
                  <ImageWithFade
                    src={toThumbUrl(u.avatar_url) ?? u.avatar_url ?? undefined}
                    fallbackSrc={u.avatar_url ?? undefined}
                    alt={u.username ?? 'user'}
                    fallback={<AvatarFallback name={u.username ?? 'user'} seed={u.username ?? u.id} />}
                  />
                </div>
                <span style={st.name}>{u.username ? `@${u.username}` : 'TreasureTrail user'}</span>
                <button
                  type="button"
                  onClick={() => handleUnblock(u)}
                  disabled={busyId === u.id}
                  style={st.unblockBtn}
                >
                  <ShieldOff size={14} />
                  <span>{busyId === u.id ? 'Unblocking…' : 'Unblock'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-neutral-700)',
    cursor: 'pointer',
  },
  headerTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  scrollContent: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: 'var(--space-4)',
  },
  lead: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: 1.5,
    marginBottom: 'var(--space-4)',
  },
  empty: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    textAlign: 'center',
    padding: 'var(--space-6) 0',
  },
  emptyCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    textAlign: 'center',
    padding: 'var(--space-8) var(--space-4)',
  },
  emptyTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
  },
  emptyDesc: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    maxWidth: 280,
    lineHeight: 1.5,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: 'var(--color-neutral-100)',
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-800)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  unblockBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    cursor: 'pointer',
    flexShrink: 0,
  },
};
