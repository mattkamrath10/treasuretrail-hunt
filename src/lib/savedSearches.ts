import { supabase } from './supabase';
import { createNotification } from './notifications';

export type SavedSearch = {
  id: string;
  user_id: string;
  name: string;
  keywords: string;
  categories: string[];
  marketplaces: string[];
  location_text: string;
  last_checked_at: string;
  created_at: string;
};

export type SavedSearchInput = {
  name?: string;
  keywords?: string;
  categories?: string[];
  marketplaces?: string[];
  location_text?: string;
};

export async function createSavedSearch(
  userId: string,
  input: SavedSearchInput
): Promise<{ data: SavedSearch | null; error: string | null }> {
  const name = (input.name && input.name.trim()) || (input.keywords && input.keywords.trim()) || 'Saved search';
  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: userId,
      name,
      keywords: input.keywords ?? '',
      categories: input.categories ?? [],
      marketplaces: input.marketplaces ?? [],
      location_text: input.location_text ?? '',
    })
    .select()
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as SavedSearch, error: null };
}

export async function listSavedSearches(userId: string): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as SavedSearch[];
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await supabase.from('saved_searches').delete().eq('id', id);
}

export async function updateSavedSearchChecked(id: string): Promise<void> {
  await supabase.from('saved_searches').update({ last_checked_at: new Date().toISOString() }).eq('id', id);
}

function buildKeywordFilter(keywords: string): string | null {
  const q = keywords.trim();
  if (!q) return null;
  // PostgREST 'or' filter format: title.ilike.*kw*,description.ilike.*kw*
  const safe = q.replace(/[%,()*]/g, ' ').trim();
  if (!safe) return null;
  return safe;
}

// In-tab guard against concurrent invocations (e.g. mount + realtime).
// Cross-tab races still rely on the per-search last_checked_at bump being eventually consistent;
// at worst a duplicate notification arrives — never a missed match.
const inflight = new Set<string>();

/**
 * For each saved search, count matching community_posts + marketplace_listings created after
 * last_checked_at. If any matches, write a single notification per search and bump last_checked_at.
 * Returns total notifications created.
 */
export async function checkSavedSearchMatches(userId: string): Promise<number> {
  if (inflight.has(userId)) return 0;
  inflight.add(userId);
  try {
    return await runCheck(userId);
  } finally {
    inflight.delete(userId);
  }
}

async function runCheck(userId: string): Promise<number> {
  const searches = await listSavedSearches(userId);
  let created = 0;
  for (const s of searches) {
    const since = s.last_checked_at;
    const kw = buildKeywordFilter(s.keywords);
    let postCount = 0;
    let listingCount = 0;

    // Community posts
    {
      let q = supabase
        .from('community_posts')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', since);
      if (kw) q = q.or(`caption.ilike.%${kw}%,category.ilike.%${kw}%`);
      if (s.categories.length > 0) q = q.in('category', s.categories);
      if (s.marketplaces.length > 0) q = q.in('marketplace_found', s.marketplaces);
      if (s.location_text) q = q.ilike('general_location', `%${s.location_text}%`);
      const { count } = await q;
      postCount = count ?? 0;
    }

    // Marketplace listings
    {
      let q = supabase
        .from('marketplace_listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .gt('created_at', since);
      if (kw) q = q.or(`title.ilike.%${kw}%,description.ilike.%${kw}%`);
      if (s.categories.length > 0) q = q.in('category', s.categories);
      if (s.marketplaces.length > 0) q = q.in('marketplace_found', s.marketplaces);
      if (s.location_text) q = q.ilike('general_location', `%${s.location_text}%`);
      const { count } = await q;
      listingCount = count ?? 0;
    }

    const total = postCount + listingCount;
    if (total > 0) {
      const parts: string[] = [];
      if (postCount > 0) parts.push(`${postCount} new find${postCount === 1 ? '' : 's'}`);
      if (listingCount > 0) parts.push(`${listingCount} new listing${listingCount === 1 ? '' : 's'}`);
      await createNotification({
        user_id: userId,
        type: 'saved_search_match',
        title: `New matches for "${s.name}"`,
        content: parts.join(' · '),
        related_item_id: s.id,
        related_item_type: 'saved_search',
        metadata: { post_count: postCount, listing_count: listingCount },
      });
      created += 1;
    }
    await updateSavedSearchChecked(s.id);
  }
  return created;
}
