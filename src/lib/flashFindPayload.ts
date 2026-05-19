/**
 * Flash Finds — canonical payload + validator
 *
 * Single source of truth for the SHAPE of a Flash Find as it moves
 * through the system. Used in three places:
 *
 *   1. Just before the DB insert in FlashFinds.tsx — so the row that
 *      hits Supabase is guaranteed-clean.
 *   2. Just before the optimistic prepend on Home — so the local
 *      `posts` state never accepts a malformed item.
 *   3. In the Home renderer, via `validateFeedItem`, as a final guard:
 *      malformed rows render an error placeholder instead of an empty
 *      white card.
 *
 * Background
 * ----------
 * The "blank card" / "only Found badge shows" bug class was driven by
 * raw form state being threaded into multiple consumers (DB insert,
 * router state, optimistic prepend) with subtly different shapes —
 * arrays where strings were expected, nested objects, undefined vs
 * null vs '', NaN price, invalid image URLs. This module flattens all
 * of that to ONE strict object shape so every consumer downstream can
 * trust the fields it reads.
 */

import type { CommunityPost } from './supabase';

/** Strict canonical shape required by the user spec. */
export type CanonicalFlashFind = {
  title: string;
  caption: string;
  description: string;
  category: string;
  location_found: string | null;
  marketplace_found: string | null;
  price_estimate: number | null;
  scout_needed: boolean;
  image_url: string | null;
  created_at: string;
  user_id: string;
};

/** Loose input shape — accepts whatever the form/AI flow produces. */
export type FlashFindFormLike = {
  title?: unknown;
  category?: unknown;
  notes?: unknown;
  description?: unknown;
  price?: unknown;
  price_estimate?: unknown;
  location?: unknown;
  general_location?: unknown;
  location_found?: unknown;
  marketplace?: unknown;
  marketplaceCustom?: unknown;
  marketplace_found?: unknown;
  scout_needed?: unknown;
  image_url?: unknown;
};

// ---------------------------------------------------------------------------
// Coercion primitives. Each one is intentionally paranoid: objects/arrays/
// NaN/undefined NEVER leak through. This is the layer that prevents
// `[object Object]` titles and array categories from reaching the renderer.
// ---------------------------------------------------------------------------

const toCleanString = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  // Arrays: join scalar elements with comma. This is the bug the user
  // described — `category` arriving as `['Antiques']` would render as
  // an object literal in the H3.
  if (Array.isArray(v)) {
    return v
      .filter((x) => x != null && (typeof x === 'string' || typeof x === 'number'))
      .map((x) => String(x).trim())
      .filter(Boolean)
      .join(', ');
  }
  // Plain objects: refuse — return empty. We deliberately do NOT
  // JSON.stringify here, because that produces visible `{...}` chrome
  // in the UI which is worse than a normalized default.
  return '';
};

const toNullableString = (v: unknown): string | null => {
  const s = toCleanString(v);
  return s.length > 0 ? s : null;
};

const toNullableNumber = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const toBool = (v: unknown): boolean => v === true || v === 'true';

const isValidHttpUrl = (s: string): boolean => {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const toValidImageUrl = (v: unknown): string | null => {
  const s = toCleanString(v);
  if (!s) return null;
  return isValidHttpUrl(s) ? s : null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type CanonicalContext = {
  user_id: string;
  image_url?: string | null;
  created_at?: string;
};

/**
 * Build the canonical payload from any loose form-like input. Always
 * returns a fully populated CanonicalFlashFind — required string fields
 * default to safe placeholders so the renderer never collapses.
 */
export function createCanonicalFlashFindPayload(
  form: FlashFindFormLike,
  ctx: CanonicalContext,
): CanonicalFlashFind {
  const title = toCleanString(form.title) || 'Untitled Find';
  const description =
    toCleanString(form.description) || toCleanString(form.notes) || '';
  // The feed card shows `caption` as the headline, so it must always be
  // the short title. The long body lives in `description` (persisted to
  // community_posts.description) and only surfaces on the detail page.
  const caption = title;
  const category = toCleanString(form.category) || 'Other';

  const location_found =
    toNullableString(form.location_found) ??
    toNullableString(form.general_location) ??
    toNullableString(form.location);

  // Marketplace: handle the "other" + custom-text pattern used in the
  // FlashFinds form without leaking the raw "other" sentinel.
  let marketplaceRaw: unknown = form.marketplace_found;
  if (marketplaceRaw == null) {
    const mk = toCleanString(form.marketplace);
    if (mk === 'other') {
      const custom = toCleanString(form.marketplaceCustom);
      marketplaceRaw = custom ? `custom:${custom}` : null;
    } else if (mk) {
      marketplaceRaw = mk;
    }
  }
  const marketplace_found = toNullableString(marketplaceRaw);

  const price_estimate =
    toNullableNumber(form.price_estimate) ?? toNullableNumber(form.price);

  const image_url =
    toValidImageUrl(ctx.image_url) ?? toValidImageUrl(form.image_url);

  return {
    title,
    caption,
    description,
    category,
    location_found,
    marketplace_found,
    price_estimate,
    scout_needed: toBool(form.scout_needed),
    image_url,
    created_at: ctx.created_at ?? new Date().toISOString(),
    user_id: ctx.user_id,
  };
}

/**
 * Build the object accepted by `createCommunityPost` in `lib/database.ts`
 * from a canonical payload. Keeps the DB-layer signature stable while the
 * canonical shape stays UI-facing.
 */
export function toCommunityPostInsert(canon: CanonicalFlashFind) {
  return {
    user_id: canon.user_id,
    type: 'flash_find',
    caption: canon.caption || canon.title,
    description: canon.description || undefined,
    image_url: canon.image_url ?? undefined,
    tags: canon.category ? [canon.category] : [],
    location: canon.location_found ?? undefined,
    location_found: canon.location_found ?? undefined,
    marketplace_found: canon.marketplace_found ?? undefined,
    estimated_value: canon.price_estimate ?? undefined,
    category: canon.category,
    scout_needed: canon.scout_needed,
  };
}

/**
 * Promote a canonical payload to the CommunityPost shape used by the
 * Home feed renderer. When the real DB row is available (after insert),
 * we prefer its id/created_at; otherwise we synthesize defaults.
 */
export function toOptimisticCommunityPost(
  canon: CanonicalFlashFind,
  dbRow?: Partial<CommunityPost> | null,
): CommunityPost {
  return {
    id: dbRow?.id ?? `optimistic-${Date.now()}`,
    user_id: canon.user_id,
    type: 'flash_find',
    caption: canon.caption || canon.title,
    image_url: canon.image_url,
    tags: canon.category ? [canon.category] : [],
    location: canon.location_found ?? '',
    rarity_score: dbRow?.rarity_score ?? null,
    estimated_value: canon.price_estimate,
    scout_assisted: dbRow?.scout_assisted ?? false,
    for_sale: dbRow?.for_sale ?? false,
    category: canon.category,
    like_count: dbRow?.like_count ?? 0,
    comment_count: dbRow?.comment_count ?? 0,
    share_count: dbRow?.share_count ?? 0,
    created_at: dbRow?.created_at ?? canon.created_at,
    profiles: dbRow?.profiles,
  };
}

// ---------------------------------------------------------------------------
// Feed-item validation. Used by the renderer to bail on rows that would
// otherwise paint as blank cards. We are strict about the things the
// renderer needs (id, user_id, type, caption) and lenient about everything
// else (handled by per-field renderer fallbacks).
// ---------------------------------------------------------------------------

export type FeedValidation = { ok: boolean; issues: string[] };

export function validateFeedItem(item: unknown): FeedValidation {
  const issues: string[] = [];
  if (!item || typeof item !== 'object') {
    return { ok: false, issues: ['not_an_object'] };
  }
  const it = item as Record<string, unknown>;
  if (typeof it.id !== 'string' || !it.id) issues.push('missing_id');
  if (typeof it.user_id !== 'string' || !it.user_id) issues.push('missing_user_id');
  if (typeof it.type !== 'string' || !it.type) issues.push('missing_type');
  // caption can be empty in legacy rows; the renderer applies a
  // displayCaption fallback. We only flag if it's a non-string type
  // (object/array) which would crash interpolation.
  if (it.caption != null && typeof it.caption !== 'string') {
    issues.push('caption_not_string');
  }
  if (it.image_url != null && typeof it.image_url !== 'string') {
    issues.push('image_url_not_string');
  }
  if (it.category != null && typeof it.category !== 'string') {
    issues.push('category_not_string');
  }
  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Diagnostic helper. Logs the typeof every interesting optional field
// so production reports include the exact shape that misbehaved.
// ---------------------------------------------------------------------------

export function logFieldTypes(prefix: string, obj: Record<string, unknown>) {
  const types: Record<string, string> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    types[k] = Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v;
  }
  console.log(prefix, types);
}
