import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Tag, Radar, Heart, MessageCircle, TrendingUp,
  UserPlus, Calendar, Bookmark, ShoppingBag, CheckCheck, Trash2, Radio,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchNotificationsList, markRead, markAllRead, clearRead, subscribeNotifications,
} from '../lib/notifications';
import { fetchUnreadCount as fetchUnreadMessageCount } from '../lib/messaging';
import { GuestOverlay } from '../components/GuestGate';
import type { Notification } from '../lib/supabase';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function bucketFor(dateStr: string): 'today' | 'yesterday' | 'earlier' {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const t = d.getTime();
  if (t >= startOfToday) return 'today';
  if (t >= startOfYesterday) return 'yesterday';
  return 'earlier';
}

const iconForType: Record<string, typeof Bell> = {
  rare_radar_match: Radar,
  marketplace_match: ShoppingBag,
  scout_response: Radar,
  event_reminder: Calendar,
  saved_search_match: Bookmark,
  message: MessageCircle,
  follow: UserPlus,
  listing_saved: Heart,
  listing_shared: TrendingUp,
  price_drop: Tag,
  go_live: Radio,
  general: Bell,
};

const colorForType: Record<string, string> = {
  rare_radar_match: 'var(--color-primary-500)',
  marketplace_match: 'var(--color-accent-500)',
  scout_response: 'var(--color-secondary-500)',
  event_reminder: 'var(--color-success-500)',
  saved_search_match: 'var(--color-primary-600)',
  message: 'var(--color-accent-500)',
  follow: 'var(--color-secondary-500)',
  listing_saved: 'var(--color-error-400)',
  listing_shared: 'var(--color-warning-500)',
  price_drop: 'var(--color-success-500)',
  go_live: 'var(--color-error-500)',
  general: 'var(--color-neutral-500)',
};

export default function Alerts() {
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  // Unread DM count — drives the badge on the Messages button. We
  // refresh it on the notification realtime channel (which fires on
  // any new `message` notification) and once on mount. A dedicated
  // messages-table subscription would be more precise, but the
  // notification feed already fires on new DMs because of the
  // server-side notify_user trigger, so we piggyback on it.
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    const refresh = () => {
      fetchNotificationsList(user.id, { limit: 100 }).then((rows) => {
        if (!cancelled) setNotifs(rows);
      }).catch(() => {});
      fetchUnreadMessageCount(user.id).then((c) => {
        if (!cancelled) setUnreadMsgs(c);
      }).catch(() => {});
    };
    Promise.all([
      fetchNotificationsList(user.id, { limit: 100 }),
      fetchUnreadMessageCount(user.id),
    ]).then(([rows, c]) => {
      if (cancelled) return;
      setNotifs(rows);
      setUnreadMsgs(c);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    const sub = subscribeNotifications(user.id, () => refresh());
    return () => { cancelled = true; sub.unsubscribe(); };
  }, [user]);

  const grouped = useMemo(() => {
    const today: Notification[] = [];
    const yesterday: Notification[] = [];
    const earlier: Notification[] = [];
    for (const n of notifs) {
      const b = bucketFor(n.created_at);
      if (b === 'today') today.push(n);
      else if (b === 'yesterday') yesterday.push(n);
      else earlier.push(n);
    }
    return { today, yesterday, earlier };
  }, [notifs]);

  const unreadCount = notifs.filter((n) => !n.read_status).length;

  const handleOpen = async (n: Notification) => {
    if (!n.read_status) {
      await markRead(n.id);
      setNotifs((cur) => cur.map((x) => x.id === n.id ? { ...x, read_status: true } : x));
    }
    if (n.related_item_type === 'message') navigate('/messages');
    else if (n.type === 'go_live' && n.related_item_id) navigate(`/event/${n.related_item_id}`);
    else if (n.related_item_type === 'event' && n.related_item_id) navigate(`/event/${n.related_item_id}`);
    else if (n.related_item_type === 'live_event' || n.related_item_type === 'local_event') navigate('/events');
    else if (n.related_item_type === 'saved_search') navigate('/marketplace');
    else if (n.related_item_type === 'marketplace_listing') navigate('/marketplace');
  };

  const handleMarkAll = async () => {
    if (!user) return;
    await markAllRead(user.id);
    setNotifs((cur) => cur.map((n) => ({ ...n, read_status: true })));
  };

  const handleClearRead = async () => {
    if (!user) return;
    await clearRead(user.id);
    setNotifs((cur) => cur.filter((n) => !n.read_status));
  };

  if (isGuest) {
    return (
      <div style={s.container}>
        <GuestOverlay
          title="Real-Time Alerts"
          subtitle="Create a free account to get Rare Radar matches, marketplace alerts, and event reminders."
        />
      </div>
    );
  }

  const renderGroup = (label: string, rows: Notification[]) => {
    if (rows.length === 0) return null;
    return (
      <section key={label} style={s.group}>
        <h2 style={s.groupLabel}>{label}</h2>
        {rows.map((n, i) => {
          const Icon = iconForType[n.type] || Bell;
          const color = colorForType[n.type] || 'var(--color-neutral-500)';
          return (
            <button
              key={n.id}
              onClick={() => handleOpen(n)}
              style={{ ...s.card, ...(n.read_status ? {} : s.cardUnread), animationDelay: `${i * 40}ms` }}
            >
              <div style={{ ...s.iconCircle, backgroundColor: `${color}15` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div style={s.cardBody}>
                <div style={s.cardHead}>
                  <span style={s.cardTitle}>{n.title}</span>
                  <span style={s.cardTime}>{timeAgo(n.created_at)}</span>
                </div>
                {n.content && <p style={s.cardDesc}>{n.content}</p>}
              </div>
              {!n.read_status && <span style={s.dot} aria-hidden />}
            </button>
          );
        })}
      </section>
    );
  };

  return (
    <div style={s.container}>
      <header style={s.header}>
        <div style={s.headerTop}>
          <div style={s.titleGroup}>
            <h1 style={s.title}>Alerts</h1>
            {unreadCount > 0 && <span style={s.badge}>{unreadCount} new</span>}
          </div>
          <button
            onClick={() => navigate('/messages')}
            style={s.messagesBtn}
            aria-label={unreadMsgs > 0 ? `Messages (${unreadMsgs} unread)` : 'Messages'}
          >
            <MessageCircle size={16} style={{ color: 'var(--color-primary-600)' }} />
            <span style={s.messagesBtnText}>Messages</span>
            {unreadMsgs > 0 && (
              <span style={s.msgBadge} aria-hidden>
                {unreadMsgs > 9 ? '9+' : unreadMsgs}
              </span>
            )}
          </button>
        </div>
        <p style={s.subtitle}>Real-time match alerts and activity</p>
        {notifs.length > 0 && (
          <div style={s.actionsRow}>
            <button onClick={handleMarkAll} disabled={unreadCount === 0} style={s.actionBtn}>
              <CheckCheck size={14} /> Mark all read
            </button>
            <button
              onClick={handleClearRead}
              disabled={notifs.every((n) => !n.read_status)}
              style={{ ...s.actionBtn, color: 'var(--color-error-600)' }}
            >
              <Trash2 size={14} /> Clear read
            </button>
          </div>
        )}
      </header>

      <div style={s.content}>
        {loading ? (
          <div style={s.emptyFooter}>
            <Bell size={20} style={{ color: 'var(--color-neutral-300)' }} />
            <p style={s.emptyText}>Loading…</p>
          </div>
        ) : notifs.length === 0 ? (
          <div style={s.emptyFooter}>
            <Bell size={32} style={{ color: 'var(--color-neutral-300)' }} />
            <p style={s.emptyTitle}>No alerts yet</p>
            <p style={s.emptyText}>Save a search or follow a hunter to start getting alerts.</p>
          </div>
        ) : (
          <>
            {renderGroup('Today', grouped.today)}
            {renderGroup('Yesterday', grouped.yesterday)}
            {renderGroup('Earlier', grouped.earlier)}
            <div style={s.emptyFooter}>
              <Bell size={20} style={{ color: 'var(--color-neutral-300)' }} />
              <p style={s.emptyText}>You're all caught up</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  badge: {
    fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)', backgroundColor: 'var(--color-error-500)',
    padding: '2px var(--space-2)', borderRadius: 'var(--radius-full)',
  },
  subtitle: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', marginTop: '2px' },
  messagesBtn: {
    display: 'flex', alignItems: 'center', gap: 4,
    minHeight: 44, padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
    cursor: 'pointer',
  },
  messagesBtnText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-700)' },
  msgBadge: {
    minWidth: 18, height: 18, padding: '0 5px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-error-500)', color: '#fff',
    fontSize: 10, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, marginLeft: 4,
  },
  actionsRow: { display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' },
  actionBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    minHeight: 44, padding: '8px 14px',
    fontSize: 'var(--font-size-xs)', fontWeight: 600,
    backgroundColor: 'transparent',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-full)',
    color: 'var(--color-neutral-700)',
    cursor: 'pointer',
  },
  content: { flex: 1, overflow: 'auto', padding: 'var(--space-2)' },
  group: { marginBottom: 'var(--space-3)' },
  groupLabel: {
    fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: 'var(--color-neutral-500)',
    padding: 'var(--space-2) var(--space-3) var(--space-1)',
  },
  card: {
    display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
    width: '100%', textAlign: 'left',
    padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
    backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
    animation: 'fadeIn 0.3s ease forwards', opacity: 0, animationFillMode: 'forwards',
    position: 'relative',
  },
  cardUnread: { backgroundColor: 'var(--color-primary-50)' },
  iconCircle: {
    width: 40, height: 40, borderRadius: 'var(--radius-full)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: 2 },
  cardTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)' },
  cardTime: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)', whiteSpace: 'nowrap', flexShrink: 0 },
  cardDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)', lineHeight: 'var(--line-height-normal)' },
  dot: {
    position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)',
    width: 8, height: 8, borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
  },
  emptyFooter: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-8)', marginTop: 'var(--space-4)',
  },
  emptyTitle: { fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-neutral-700)' },
  emptyText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-400)', textAlign: 'center' },
};
