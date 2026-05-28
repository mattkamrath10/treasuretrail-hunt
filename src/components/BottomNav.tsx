import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, Radio, Search, Plus, User } from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: typeof Compass;
  match?: (pathname: string) => boolean;
  primary?: boolean;
}

const navItems: NavItem[] = [
  { path: '/',        label: 'Discover', icon: Compass, match: (p) => p === '/' || p === '/flash-finds' || p === '/events' },
  { path: '/live',    label: 'Live',     icon: Radio },
  { path: '/sell',    label: 'Sell',     icon: Plus, primary: true, match: (p) => p.startsWith('/sell') || p.startsWith('/seller') },
  { path: '/wanted',  label: 'Wanted',   icon: Search },
  { path: '/profile', label: 'Profile',  icon: User,  match: (p) => p === '/profile' || p.startsWith('/profile/') },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav style={styles.nav}>
      {navItems.map((item) => {
        const isActive = item.match ? item.match(location.pathname) : location.pathname === item.path;
        const Icon = item.icon;
        const accent = item.primary
          ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
          : undefined;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              ...styles.button,
              ...(item.primary ? styles.primaryButton : {}),
            }}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span
              style={{
                ...styles.iconWrap,
                ...(item.primary ? { ...styles.iconWrapPrimary, background: accent } : {}),
              }}
            >
              <Icon
                size={item.primary ? 22 : 22}
                strokeWidth={isActive ? 2.4 : 1.9}
                style={{
                  color: item.primary
                    ? '#fff'
                    : isActive
                      ? 'var(--color-primary-500)'
                      : 'var(--color-neutral-400)',
                  transition: 'color var(--transition-fast)',
                }}
              />
            </span>
            <span
              style={{
                ...styles.label,
                color: item.primary
                  ? 'var(--color-primary-700)'
                  : isActive
                    ? 'var(--color-primary-600)'
                    : 'var(--color-neutral-500)',
                fontWeight: isActive || item.primary ? 700 : 500,
              }}
            >
              {item.label}
            </span>
            {isActive && !item.primary && <span style={styles.indicator} />}
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
    gap: 2,
    padding: 'var(--space-2) var(--space-3)',
    position: 'relative',
    minWidth: 56,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  primaryButton: {},
  iconWrap: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 10,
  },
  iconWrapPrimary: {
    width: 44, height: 44, borderRadius: 14,
    boxShadow: '0 6px 16px rgba(217, 119, 6, 0.45)',
    marginTop: -10,
  },
  label: {
    fontSize: 'var(--font-size-xs)',
    lineHeight: 1,
    transition: 'color var(--transition-fast)',
    whiteSpace: 'nowrap' as const,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 24,
    height: 3,
    borderRadius: '0 0 var(--radius-full) var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
  },
};
