import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type BadgeVariant =
  | 'neutral'
  | 'marketplace'
  | 'scout'
  | 'shipping'
  | 'pickup'
  | 'verified'
  | 'warning'
  | 'event'
  | 'category';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; fg: string }> = {
  neutral:     { bg: 'var(--color-neutral-100)',   fg: 'var(--color-neutral-700)'   },
  marketplace: { bg: 'var(--color-accent-50)',     fg: 'var(--color-accent-700)'    },
  scout:       { bg: 'var(--color-warning-500)',   fg: '#ffffff'                    },
  shipping:    { bg: 'var(--color-success-50)',    fg: 'var(--color-success-700)'   },
  pickup:      { bg: 'var(--color-success-50)',    fg: 'var(--color-success-700)'   },
  verified:    { bg: 'var(--color-primary-50)',    fg: 'var(--color-primary-700)'   },
  warning:     { bg: 'var(--color-warning-50)',    fg: 'var(--color-warning-700)'   },
  event:       { bg: 'var(--color-secondary-50)',  fg: 'var(--color-secondary-700)' },
  category:    { bg: 'var(--color-secondary-50)',  fg: 'var(--color-secondary-700)' },
};

export function Badge({
  variant = 'neutral',
  icon: Icon,
  children,
  size = 'sm',
  style,
}: {
  variant?: BadgeVariant;
  icon?: LucideIcon;
  children: ReactNode;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}) {
  const { bg, fg } = VARIANT_STYLES[variant];
  const isMd = size === 'md';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        backgroundColor: bg,
        color: fg,
        fontSize: isMd ? 'var(--font-size-sm)' : 'var(--font-size-xs)',
        fontWeight: 600,
        padding: isMd ? '5px 10px' : '3px 8px',
        borderRadius: 'var(--radius-sm)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {Icon && <Icon size={isMd ? 13 : 11} />}
      {children}
    </span>
  );
}
