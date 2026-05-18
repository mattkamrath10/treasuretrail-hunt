import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getUnreadCount, subscribeNotifications } from '../lib/notifications';

type Props = {
  style?: CSSProperties;
  iconColor?: string;
};

export default function NotificationBell({ style, iconColor }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    let cancelled = false;
    getUnreadCount(user.id).then((c) => { if (!cancelled) setUnread(c); }).catch(() => {});
    const sub = subscribeNotifications(user.id, () => {
      getUnreadCount(user.id).then((c) => { if (!cancelled) setUnread(c); }).catch(() => {});
    });
    return () => { cancelled = true; sub.unsubscribe(); };
  }, [user]);

  return (
    <button
      onClick={() => navigate('/alerts')}
      aria-label={unread > 0 ? `Alerts (${unread} unread)` : 'Alerts'}
      style={{ ...styles.bell, ...style }}
    >
      <Bell size={16} style={{ color: iconColor ?? 'var(--color-neutral-700)' }} />
      {unread > 0 && (
        <span style={styles.badge} aria-hidden>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  bell: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
    width: 44,
    height: 44,
    border: '1px solid var(--color-neutral-100)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    padding: 0,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    padding: '0 4px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-500)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    border: '2px solid var(--color-neutral-0)',
  },
};
