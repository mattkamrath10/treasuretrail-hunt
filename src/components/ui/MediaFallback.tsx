import type { CSSProperties, ReactNode } from 'react';
import {
  Calendar, Radio, Sparkles, Heart, Store, Tag, Search,
  Gavel, Sun, Crown, Package, User as UserIcon,
} from 'lucide-react';

/**
 * Centralized, branded "never gray" image fallback system.
 *
 * Every optional-image slot in the app routes through here so that a
 * missing / broken / not-yet-uploaded photo always looks intentional
 * and on-brand instead of rendering as a desaturated gray box.
 *
 * Two surfaces:
 *   - <MediaFallback kind|category|platform> for rectangular media
 *     (card thumbnails, hero images, lightboxes, list rows).
 *   - <AvatarFallback name|seed> for circular profile/comment avatars.
 *
 * Both produce stable per-seed gradients so the same item gets the
 * same color identity across renders and pages.
 *
 * Performance budget: CSS gradient + 1 icon + (optional) 1-line of
 * typography. No canvases, no SVG masks, no animations heavier than a
 * static box-shadow. Mobile-first.
 */

export type FallbackKind =
  | 'event' | 'live' | 'find' | 'wanted' | 'listing' | 'generic'
  | 'auction' | 'yard_sale' | 'estate_sale';

export type FallbackPlatform =
  | 'whatnot' | 'hibid' | 'poshmark' | 'ebay' | 'auctionzip' | 'other' | null | undefined;

type Palette = {
  // Gradient anchor — the second stop of the linear-gradient. The
  // first stop is computed dynamically per-seed (see seedHue + render)
  // so cards stay distinguishable side-by-side. Anchor preserves the
  // brand color of the kind/platform even when the hue shifts.
  to: string;
  icon: typeof Calendar;
  label?: string; // optional typographic identity (e.g. "LIVE AUCTION")
};

// --- Kind palettes -----------------------------------------------------
// Warm, saturated gradients only — never desaturated gray.
const KIND_PALETTES: Record<FallbackKind, Palette> = {
  event:       { to: '#b45309', icon: Calendar, label: 'EVENT' },
  live:        { to: '#7f1d1d', icon: Radio,    label: 'LIVE' },
  find:        { to: '#5b21b6', icon: Sparkles, label: 'FIND' },
  wanted:      { to: '#065f46', icon: Search,   label: 'WANTED' },
  listing:     { to: '#0c4a6e', icon: Store,    label: 'LISTING' },
  generic:     { to: '#92400e', icon: Tag,      label: 'TREASURETRAIL' },
  // Phase-2 additions — used by Auctions, Events with subtype, etc.
  auction:     { to: '#0c1738', icon: Gavel,    label: 'LIVE AUCTION' },
  yard_sale:   { to: '#c2410c', icon: Sun,      label: 'YARD SALE' },
  estate_sale: { to: '#451a03', icon: Crown,    label: 'ESTATE SALE' },
};

// --- Platform palettes -------------------------------------------------
// Override KIND_PALETTES when an external-listing platform is known so
// the empty card still telegraphs "this is a Whatnot show", etc.
const PLATFORM_PALETTES: Partial<Record<NonNullable<FallbackPlatform>, Palette>> = {
  whatnot:    { to: '#a16207', icon: Radio,    label: 'WHATNOT' },
  hibid:      { to: '#0c1e54', icon: Gavel,    label: 'HIBID' },
  poshmark:   { to: '#831843', icon: Store,    label: 'POSHMARK' },
  ebay:       { to: '#7f1d1d', icon: Gavel,    label: 'EBAY' },
  auctionzip: { to: '#0e4f5f', icon: Gavel,    label: 'AUCTIONZIP' },
  other:      { to: '#92400e', icon: Gavel,    label: 'AUCTION' },
};

// --- Category keyword routing -----------------------------------------
// Free-text categories from user content (e.g. event.category="Estate Sale")
// route to a matching kind. Keep the map small and conservative — anything
// unknown falls through to the kind/generic palette.
function categoryToKind(cat?: string | null): FallbackKind | null {
  if (!cat) return null;
  const c = cat.toLowerCase();
  if (c.includes('estate'))   return 'estate_sale';
  if (c.includes('yard') || c.includes('garage')) return 'yard_sale';
  if (c.includes('auction'))  return 'auction';
  if (c.includes('flea') || c.includes('market')) return 'event';
  if (c.includes('live') || c.includes('stream')) return 'live';
  return null;
}

function resolvePalette(
  kind: FallbackKind,
  category: string | null | undefined,
  platform: FallbackPlatform,
): Palette {
  if (platform && PLATFORM_PALETTES[platform]) return PLATFORM_PALETTES[platform]!;
  const fromCategory = categoryToKind(category);
  if (fromCategory) return KIND_PALETTES[fromCategory];
  return KIND_PALETTES[kind];
}

/**
 * Branded never-gray image fallback. Use as the `fallback` prop on
 * `ImageWithFade` for any user-facing media slot. Generates a stable
 * gradient from `seed` so each card has its own color identity even
 * when the underlying image fails or is missing.
 */
export function MediaFallback({
  kind = 'generic',
  category,
  platform,
  seed,
  label,
  compact,
  style,
}: {
  kind?: FallbackKind;
  /** Free-text category from row data (e.g. "Estate Sale"). Overrides kind when matched. */
  category?: string | null;
  /** External-listing platform. Overrides kind+category when matched. */
  platform?: FallbackPlatform;
  /** Stable string used to pick a hue (typically the row id or title). */
  seed?: string | null;
  /** Optional label override. Falls back to the palette's brand label. */
  label?: string;
  /** Render in a compact mode (icon only, no label) for tiny thumbs <80px. */
  compact?: boolean;
  style?: CSSProperties;
}): ReactNode {
  const palette = resolvePalette(kind, category, platform);
  const hue = seedHue(seed ?? palette.label ?? kind);
  const Icon = palette.icon;
  const text = (label ?? palette.label ?? '').trim();

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
        // Two-stop gradient: hue-shifted highlight → palette anchor.
        // The hue rotation keeps cards distinguishable side-by-side
        // while the anchor preserves the brand color of the kind.
        background: `linear-gradient(135deg, hsl(${hue} 78% 52%) 0%, ${palette.to} 100%)`,
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.18)',
        ...style,
      }}
    >
      <Icon
        size={compact ? 22 : 32}
        strokeWidth={2.2}
        style={{ opacity: 0.92, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }}
      />
      {!compact && text && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.12em',
            textShadow: '0 1px 2px rgba(0,0,0,0.35)',
            maxWidth: '90%',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

/**
 * Circular avatar fallback — initial(s) on a stable warm gradient.
 * Use for profile/comment/seller avatars whenever `avatar_url` is
 * null OR fails to load. Never renders gray.
 */
export function AvatarFallback({
  name,
  seed,
  size,
  style,
}: {
  /** Display name or handle. First two letters become the initials. */
  name?: string | null;
  /** Stable hue seed; defaults to `name`. */
  seed?: string | null;
  /** Pixel size; defaults to 100% of parent (so callers control sizing). */
  size?: number;
  style?: CSSProperties;
}): ReactNode {
  const trimmed = (name ?? '').trim().replace(/^@/, '');
  const initials = trimmed
    ? trimmed.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    : '';
  const hue = seedHue(seed ?? trimmed ?? 'avatar');
  const dimension = size ? `${size}px` : '100%';

  return (
    <div
      aria-hidden="true"
      style={{
        width: dimension,
        height: dimension,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        background: `linear-gradient(135deg, hsl(${hue} 75% 55%) 0%, hsl(${(hue + 30) % 360} 70% 35%) 100%)`,
        boxShadow: 'inset 0 0 16px rgba(0,0,0,0.16)',
        fontWeight: 800,
        fontSize: size ? Math.max(11, Math.round(size * 0.42)) : 14,
        letterSpacing: '0.04em',
        ...style,
      }}
    >
      {initials || <UserIcon size={size ? Math.round(size * 0.5) : 16} />}
    </div>
  );
}

/**
 * Single helper: returns a ReactNode you can drop into the `fallback`
 * prop of `<ImageWithFade>` or render directly in a placeholder slot.
 * Centralizes the "what fallback should this slot use?" decision so
 * call sites don't sprinkle inline gray boxes.
 */
export function getFallbackVisual(opts: {
  kind?: FallbackKind;
  category?: string | null;
  platform?: FallbackPlatform;
  seed?: string | null;
  label?: string;
  compact?: boolean;
  style?: CSSProperties;
}): ReactNode {
  return <MediaFallback {...opts} />;
}

function seedHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  // Bias toward warm gold/orange/red/violet — never desaturated gray-blue.
  const palette = [18, 28, 38, 48, 358, 12, 268, 285, 320];
  return palette[Math.abs(h) % palette.length];
}

export { Heart, Package };
