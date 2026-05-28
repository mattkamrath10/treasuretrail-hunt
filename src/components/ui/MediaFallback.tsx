import type { CSSProperties, ReactNode } from 'react';
import { Calendar, Radio, Sparkles, Heart, Store, Tag, Search } from 'lucide-react';

type Kind = 'event' | 'live' | 'find' | 'wanted' | 'listing' | 'generic';

const PALETTES: Record<Kind, { from: string; to: string; icon: typeof Calendar }> = {
  event:   { from: '#f59e0b', to: '#b45309', icon: Calendar },
  live:    { from: '#ef4444', to: '#7f1d1d', icon: Radio    },
  find:    { from: '#8b5cf6', to: '#5b21b6', icon: Sparkles },
  wanted:  { from: '#10b981', to: '#065f46', icon: Search   },
  listing: { from: '#0ea5e9', to: '#0c4a6e', icon: Store    },
  generic: { from: '#64748b', to: '#1e293b', icon: Tag      },
};

/**
 * Branded never-gray image fallback. Use as the `fallback` prop on
 * `ImageWithFade` for any user-facing media slot. Generates a stable
 * gradient from `seed` so each card has its own color identity even
 * when the underlying image fails or is missing.
 */
export function MediaFallback({
  kind = 'generic',
  seed,
  label,
  style,
}: {
  kind?: Kind;
  seed?: string | null;
  label?: string;
  style?: CSSProperties;
}): ReactNode {
  const palette = PALETTES[kind];
  const hue = seedHue(seed ?? kind);
  const Icon = palette.icon;
  const initials = (label ?? '').trim().slice(0, 2).toUpperCase();

  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        color: '#fff',
        background: `linear-gradient(135deg, hsl(${hue} 78% 52%) 0%, ${palette.to} 100%)`,
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.18)',
        ...style,
      }}
    >
      <Icon size={32} strokeWidth={2.2} style={{ opacity: 0.92, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }} />
      {initials && (
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>
          {initials}
        </span>
      )}
    </div>
  );
}

function seedHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  // Bias toward warm gold/orange/red/violet — never desaturated gray-blue.
  const palette = [18, 28, 38, 48, 358, 12, 268, 285, 320];
  return palette[Math.abs(h) % palette.length];
}

export { Heart };
