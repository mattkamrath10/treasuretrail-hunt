import type { ReactNode, CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  style,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-8) var(--space-4)',
        gap: 'var(--space-2)',
        color: 'var(--color-neutral-600)',
        ...style,
      }}
    >
      {Icon && (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            backgroundColor: 'var(--color-neutral-50)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-2)',
          }}
        >
          <Icon size={26} style={{ color: 'var(--color-neutral-400)' }} />
        </div>
      )}
      <p
        style={{
          fontSize: 'var(--font-size-base)',
          fontWeight: 600,
          color: 'var(--color-neutral-800)',
          margin: 0,
        }}
      >
        {title}
      </p>
      {body && (
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-neutral-600)',
            margin: 0,
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
      )}
      {action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
    </div>
  );
}
