import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Tag, Radar, Heart, MessageCircle, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchNotifications } from '../lib/database';
import { GuestOverlay } from '../components/GuestGate';
import type { Notification } from '../lib/supabase';

interface AlertItem {
  id: string;
  type: 'match' | 'price_drop' | 'scout' | 'like' | 'comment' | 'trending';
  title: string;
  description: string;
  timeAgo: string;
  isRead: boolean;
}

const alerts: AlertItem[] = [
  {
    id: '1',
    type: 'match',
    title: 'New Match Found!',
    description: 'An Eames Lounge Chair was posted matching your Rare Radar search.',
    timeAgo: '5 min ago',
    isRead: false,
  },
  {
    id: '2',
    type: 'price_drop',
    title: 'Price Drop Alert',
    description: 'Vintage Polaroid SX-70 dropped from $65 to $45.',
    timeAgo: '1h ago',
    isRead: false,
  },
  {
    id: '3',
    type: 'scout',
    title: 'Scout Activity',
    description: '3 new scouts are watching your Nintendo 64 search.',
    timeAgo: '2h ago',
    isRead: true,
  },
  {
    id: '4',
    type: 'like',
    title: 'New Likes',
    description: 'Your Brass Compass post received 12 new likes.',
    timeAgo: '4h ago',
    isRead: true,
  },
  {
    id: '5',
    type: 'comment',
    title: 'New Comment',
    description: '@vintagehunter commented: "Is this still available?"',
    timeAgo: '6h ago',
    isRead: true,
  },
  {
    id: '6',
    type: 'trending',
    title: 'Trending in Your Area',
    description: 'Mid-century furniture is hot this week. 340% more searches.',
    timeAgo: '8h ago',
    isRead: true,
  },
];

function getAlertTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const alertIcons = {
  match: Radar,
  price_drop: Tag,
  scout: Radar,
  like: Heart,
  comment: MessageCircle,
  trending: TrendingUp,
};

const alertColors = {
  match: 'var(--color-primary-500)',
  price_drop: 'var(--color-success-500)',
  scout: 'var(--color-secondary-500)',
  like: 'var(--color-error-400)',
  comment: 'var(--color-accent-500)',
  trending: 'var(--color-warning-500)',
};

export default function Alerts() {
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const [realNotifs, setRealNotifs] = useState<Notification[]>([]);

  useEffect(() => {
    if (user) {
      fetchNotifications(user.id).then(setRealNotifs).catch(() => {});
    }
  }, [user]);

  const realAlerts: AlertItem[] = realNotifs.map((n) => ({
    id: n.id,
    type: (n.type as AlertItem['type']) || 'match',
    title: n.title,
    description: n.content,
    timeAgo: getAlertTimeAgo(n.created_at),
    isRead: n.read_status,
  }));

  const allAlerts = [...realAlerts, ...alerts];
  const unreadCount = allAlerts.filter((a) => !a.isRead).length;

  if (isGuest) {
    return (
      <div style={styles.container}>
        <GuestOverlay
          title="Real-Time Alerts"
          subtitle="Create a free account to get Rare Radar matches, auction alerts, and price drop notifications."
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div style={styles.titleGroup}>
            <h1 style={styles.title}>Alerts</h1>
            {unreadCount > 0 && (
              <span style={styles.badge}>{unreadCount} new</span>
            )}
          </div>
          <button onClick={() => navigate('/messages')} style={styles.messagesBtn}>
            <MessageCircle size={16} style={{ color: 'var(--color-primary-600)' }} />
            <span style={styles.messagesBtnText}>Messages</span>
            <span style={styles.messagesBadge}>7</span>
          </button>
        </div>
        <p style={styles.subtitle}>Real-time match alerts and activity</p>
      </header>

      <div style={styles.content}>
        {allAlerts.map((alert, index) => {
          const Icon = alertIcons[alert.type] || Bell;
          return (
            <div
              key={alert.id}
              style={{
                ...styles.alertCard,
                ...(!alert.isRead ? styles.unread : {}),
                animationDelay: `${index * 60}ms`,
              }}
            >
              <div
                style={{
                  ...styles.iconCircle,
                  backgroundColor: `${alertColors[alert.type] || 'var(--color-neutral-500)'}15`,
                }}
              >
                <Icon size={18} style={{ color: alertColors[alert.type] || 'var(--color-neutral-500)' }} />
              </div>
              <div style={styles.alertContent}>
                <div style={styles.alertHeader}>
                  <h3 style={styles.alertTitle}>{alert.title}</h3>
                  <span style={styles.alertTime}>{alert.timeAgo}</span>
                </div>
                <p style={styles.alertDesc}>{alert.description}</p>
              </div>
              {!alert.isRead && <span style={styles.dot} />}
            </div>
          );
        })}

        <div style={styles.emptyFooter}>
          <Bell size={24} style={{ color: 'var(--color-neutral-300)' }} />
          <p style={styles.emptyText}>You're all caught up</p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  messagesBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
  },
  messagesBtnText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
  },
  messagesBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
    backgroundColor: 'var(--color-primary-500)',
    width: '16px',
    height: '16px',
    borderRadius: 'var(--radius-full)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  badge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
    backgroundColor: 'var(--color-error-500)',
    padding: '2px var(--space-2)',
    borderRadius: 'var(--radius-full)',
  },
  subtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginTop: '2px',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-2)',
  },
  alertCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    transition: 'background-color var(--transition-fast)',
    animation: 'fadeIn 0.3s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
    position: 'relative',
  },
  unread: {
    backgroundColor: 'var(--color-primary-50)',
  },
  iconCircle: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-full)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertContent: {
    flex: 1,
    minWidth: 0,
  },
  alertHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
    marginBottom: '2px',
  },
  alertTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  alertTime: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  alertDesc: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: 'var(--line-height-normal)',
  },
  dot: {
    position: 'absolute',
    top: 'var(--space-4)',
    right: 'var(--space-4)',
    width: '8px',
    height: '8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
  },
  emptyFooter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-8)',
    marginTop: 'var(--space-4)',
  },
  emptyText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-400)',
  },
};
