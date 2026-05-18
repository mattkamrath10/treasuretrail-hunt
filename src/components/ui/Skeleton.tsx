import type { CSSProperties } from 'react';
import { ensureUiKeyframes } from './keyframes';

export function Skeleton({
  width,
  height,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  ensureUiKeyframes();
  return (
    <div
      aria-hidden="true"
      className="tt-shimmer"
      style={{
        width: width ?? '100%',
        height: height ?? 14,
        borderRadius: radius,
        background:
          'linear-gradient(90deg, var(--color-neutral-100) 0px, var(--color-neutral-50) 200px, var(--color-neutral-100) 400px)',
        backgroundSize: '800px 100%',
        animation: 'ttShimmer 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div
      style={{
        backgroundColor: 'var(--color-neutral-0)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--color-neutral-100)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Skeleton height={180} radius={0} />
      <div style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Skeleton height={16} width="70%" />
        <Skeleton height={12} width="90%" />
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <Skeleton height={20} width={60} radius={12} />
          <Skeleton height={20} width={80} radius={12} />
          <Skeleton height={20} width={50} radius={12} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
