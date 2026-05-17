import { useLocation, useNavigate } from 'react-router-dom';
import { Hop as Home, Zap, Radar, Bell, User } from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: typeof Home;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/flash-finds', label: 'Flash Finds', icon: Zap },
  { path: '/rare-radar', label: 'Rare Radar', icon: Radar },
  { path: '/alerts', label: 'Alerts', icon: Bell },
  { path: '/profile', label: 'Profile', icon: User },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav style={styles.nav}>
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        const Icon = item.icon;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              ...styles.button,
              ...(isActive ? styles.active : {}),
            }}
            aria-label={item.label}
          >
            <Icon
              size={22}
              strokeWidth={isActive ? 2.5 : 1.8}
              style={{
                color: isActive ? 'var(--color-primary-500)' : 'var(--color-neutral-400)',
                transition: 'color var(--transition-fast), transform var(--transition-fast)',
                transform: isActive ? 'scale(1.1)' : 'scale(1)',
              }}
            />
            <span
              style={{
                ...styles.label,
                color: isActive ? 'var(--color-primary-600)' : 'var(--color-neutral-400)',
                fontWeight: isActive ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
              }}
            >
              {item.label}
            </span>
            {isActive && <span style={styles.indicator} />}
          </button>
        );
      })}
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 'var(--nav-height)',
    backgroundColor: 'var(--color-neutral-0)',
    borderTop: '1px solid var(--color-neutral-100)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    position: 'relative',
    zIndex: 100,
    boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.04)',
  },
  button: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    padding: 'var(--space-2) var(--space-3)',
    position: 'relative',
    minWidth: '56px',
    transition: 'transform var(--transition-fast)',
  },
  active: {},
  label: {
    fontSize: 'var(--font-size-xs)',
    lineHeight: '1',
    transition: 'color var(--transition-fast)',
    whiteSpace: 'nowrap' as const,
  },
  indicator: {
    position: 'absolute',
    top: '0',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '24px',
    height: '3px',
    borderRadius: '0 0 var(--radius-full) var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
  },
};
