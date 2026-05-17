import { useState, useEffect } from 'react';
import { Zap, Target, Trophy, TrendingUp, MapPin, Users, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'rarity' | 'mission' | 'rank' | 'event' | 'scout' | 'auction';
}

const toastMessages: Omit<Toast, 'id'>[] = [
  { message: 'Rare Radar Spike: Vintage watches trending nearby', type: 'rarity' },
  { message: 'Auction ending in 5 min - Eames Chair at $1,200', type: 'auction' },
  { message: 'Your Club reached #2 ranking this week!', type: 'rank' },
  { message: 'Limited-Time Hunt: Midnight Drop started!', type: 'event' },
  { message: 'Scout needed in Brooklyn - Furniture pickup', type: 'scout' },
  { message: 'New Rare Find detected in your area', type: 'rarity' },
  { message: 'Mission Complete: +150 XP earned!', type: 'mission' },
];

const typeConfig: Record<string, { icon: typeof Zap; color: string; bg: string }> = {
  rarity: { icon: Zap, color: 'var(--color-primary-600)', bg: 'var(--color-primary-50)' },
  mission: { icon: Target, color: 'var(--color-success-600)', bg: 'var(--color-success-50)' },
  rank: { icon: Trophy, color: 'var(--color-warning-600)', bg: 'var(--color-warning-50)' },
  event: { icon: TrendingUp, color: 'var(--color-error-500)', bg: 'var(--color-error-50)' },
  scout: { icon: MapPin, color: 'var(--color-secondary-500)', bg: 'var(--color-secondary-50)' },
  auction: { icon: Users, color: 'var(--color-accent-600)', bg: 'var(--color-accent-50)' },
};

export default function LiveToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const random = toastMessages[Math.floor(Math.random() * toastMessages.length)];
      const newToast: Toast = { ...random, id: Date.now().toString() };
      setToasts((prev) => [...prev.slice(-2), newToast]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 5000);
    }, 15000);

    // Show first toast after 8 seconds
    const firstTimer = setTimeout(() => {
      const random = toastMessages[0];
      const newToast: Toast = { ...random, id: 'first' };
      setToasts([newToast]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== 'first')), 5000);
    }, 8000);

    return () => { clearInterval(interval); clearTimeout(firstTimer); };
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div style={styles.container}>
      {toasts.map((toast) => {
        const config = typeConfig[toast.type] || typeConfig.rarity;
        const Icon = config.icon;
        return (
          <div key={toast.id} style={{ ...styles.toast, backgroundColor: config.bg, borderColor: `color-mix(in srgb, ${config.color} 20%, transparent)` }}>
            <Icon size={14} style={{ color: config.color, flexShrink: 0 }} />
            <span style={styles.toastText}>{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} style={styles.dismissBtn}><X size={12} style={{ color: 'var(--color-neutral-400)' }} /></button>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 'var(--space-4)',
    left: 'var(--space-4)',
    right: 'var(--space-4)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
    pointerEvents: 'auto',
    animation: 'slideDown 0.3s ease',
  },
  toastText: {
    flex: 1,
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-800)',
    lineHeight: '1.3',
  },
  dismissBtn: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
};
