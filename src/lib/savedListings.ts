import { supabase } from './supabase';
import type { ListingKind } from './messaging';

export interface SavedListingRow {
  user_id: string;
  listing_id: string;
  listing_kind: ListingKind;
  created_at: string;
}

/**
 * Persist a save server-side (subject to RLS). The caller is expected to
 * pass their own auth uid; we still rely on the WITH CHECK policy to
 * prevent forgery.
 */
export async function saveListing(
  userId: string,
  listingId: string,
  listingKind: ListingKind,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('saved_listings')
    .upsert({ user_id: userId, listing_id: listingId, listing_kind: listingKind }, {
      onConflict: 'user_id,listing_id,listing_kind',
      ignoreDuplicates: true,
    });
  if (error) return { error: error.message };
  return { error: null };
}

export async function unsaveListing(
  userId: string,
  listingId: string,
  listingKind: ListingKind,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('saved_listings')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .eq('listing_kind', listingKind);
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Fetch every listing the user has saved. Returns rows so the caller can
 * group by kind and hydrate from the originating table.
 */
export async function fetchSavedListings(userId: string): Promise<SavedListingRow[]> {
  const { data, error } = await supabase
    .from('saved_listings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data as SavedListingRow[];
}

/** A hydrated saved item ready to render as a card on the profile. */
export interface SavedFindCard {
  key: string;
  id: string;
  title: string;
  imageUrl: string | null;
  kind: ListingKind;
  /** Internal route to open (finds + marketplace). */
  to?: string;
  /** External URL to open in a new tab (external listings). */
  externalUrl?: string | null;
}

/**
 * Build the full "Saved Finds" list shown on the profile. Combines two
 * stores that the rest of the app actually writes to:
 *   - community-post finds bookmarked to localStorage ('tt_saved_posts'),
 *     written by FindDetail / Home / Community save buttons.
 *   - marketplace / external / community listings saved server-side in
 *     `saved_listings` (subject to RLS).
 * Each kind is hydrated from its originating table so we can show a real
 * thumbnail + title. Rows whose source item was deleted are skipped, and
 * the same item saved via both stores is de-duped by kind:id.
 */
export async function fetchSavedFinds(userId: string): Promise<SavedFindCard[]> {
  const cards: SavedFindCard[] = [];
  const seen = new Set<string>();

  // 1) Local community-post bookmarks (the "finds" most users save).
  let localPostIds: string[] = [];
  try {
    const raw = localStorage.getItem('tt_saved_posts');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) localPostIds = arr.filter((x): x is string => typeof x === 'string');
    }
  } catch { /* ignore corrupt localStorage */ }

  // 2) Server-side saves, grouped by the table they live in.
  const rows = await fetchSavedListings(userId);
  const postIds = new Set<string>(localPostIds);
  const marketIds = new Set<string>();
  const externalIds = new Set<string>();
  for (const r of rows) {
    if (r.listing_kind === 'community_post') postIds.add(r.listing_id);
    else if (r.listing_kind === 'marketplace') marketIds.add(r.listing_id);
    else if (r.listing_kind === 'external_listing') externalIds.add(r.listing_id);
  }

  const push = (card: SavedFindCard) => {
    if (seen.has(card.key)) return;
    seen.add(card.key);
    cards.push(card);
  };

  const tasks: Promise<void>[] = [];

  if (postIds.size > 0) {
    tasks.push((async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('id, caption, image_url')
        .in('id', [...postIds]);
      if (error) console.warn('[fetchSavedFinds] community_posts hydrate failed', error.code, error.message);
      for (const p of (data ?? []) as Array<Record<string, any>>) {
        push({
          key: `community_post:${p.id}`,
          id: p.id,
          title: p.caption || 'Untitled find',
          imageUrl: p.image_url ?? null,
          kind: 'community_post',
          to: `/find/${p.id}`,
        });
      }
    })());
  }

  if (marketIds.size > 0) {
    tasks.push((async () => {
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('id, title, image_url')
        .in('id', [...marketIds]);
      if (error) console.warn('[fetchSavedFinds] marketplace_listings hydrate failed', error.code, error.message);
      for (const m of (data ?? []) as Array<Record<string, any>>) {
        push({
          key: `marketplace:${m.id}`,
          id: m.id,
          title: m.title || 'Untitled listing',
          imageUrl: m.image_url ?? null,
          kind: 'marketplace',
          to: `/listing/${m.id}`,
        });
      }
    })());
  }

  if (externalIds.size > 0) {
    tasks.push((async () => {
      // SELECT * mirrors Home's external_listings fetch so an optional
      // column missing on older rows can't 400 the whole query.
      const { data, error } = await supabase
        .from('external_listings')
        .select('*')
        .in('id', [...externalIds]);
      if (error) console.warn('[fetchSavedFinds] external_listings hydrate failed', error.code, error.message);
      for (const e of (data ?? []) as Array<Record<string, any>>) {
        push({
          key: `external_listing:${e.id}`,
          id: e.id,
          title: e.title || 'External listing',
          imageUrl: e.image_url ?? null,
          kind: 'external_listing',
          externalUrl: e.external_url ?? null,
        });
      }
    })());
  }

  await Promise.all(tasks);
  return cards;
}

/**
 * Lightweight existence check used by detail pages to render the
 * Save / Unsave toggle without fetching the whole list.
 */
export async function isListingSaved(
  userId: string,
  listingId: string,
  listingKind: ListingKind,
): Promise<boolean> {
  const { count } = await supabase
    .from('saved_listings')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .eq('listing_kind', listingKind);
  return (count ?? 0) > 0;
}
