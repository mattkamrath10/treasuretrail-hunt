import { supabase } from './supabase';
import type { CommunityPost, MarketplaceListing, Notification, Profile } from './supabase';

type ProfileEmbed = Pick<Profile, 'username' | 'avatar_url' | 'treasure_rank' | 'scout_verified'>;

/**
 * PostgREST's `select('*, profiles(...)')` embed only works when the table
 * has a direct foreign key to `profiles`. Our schema has
 *   community_posts.user_id     -> auth.users(id)
 *   marketplace_listings.seller_id -> auth.users(id)
 *   external_listings.user_id   -> auth.users(id)
 * which means the auto-embed fails with PGRST200 ("Could not find a
 * relationship between '<table>' and 'profiles'"). Instead of guessing FK
 * hints, we fetch profiles in a single bulk query and merge in JS. This is
 * resilient to any FK config and to schema-cache staleness.
 */
export async function attachProfiles<T extends Record<string, unknown>>(
  rows: T[],
  userIdField: keyof T,
): Promise<(T & { profiles?: ProfileEmbed })[]> {
  if (rows.length === 0) return rows as (T & { profiles?: ProfileEmbed })[];
  const ids = Array.from(new Set(rows.map((r) => r[userIdField]).filter(Boolean))) as string[];
  if (ids.length === 0) return rows as (T & { profiles?: ProfileEmbed })[];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, treasure_rank, scout_verified')
    .in('id', ids);
  if (error) {
    console.warn('[SUPABASE_QUERY_FAIL] table=profiles source=attachProfiles', error.code, error.message);
    return rows as (T & { profiles?: ProfileEmbed })[];
  }
  const byId = new Map<string, ProfileEmbed>();
  (data ?? []).forEach((p: { id: string } & ProfileEmbed) => {
    byId.set(p.id, {
      username: p.username,
      avatar_url: p.avatar_url,
      treasure_rank: p.treasure_rank,
      scout_verified: p.scout_verified,
    });
  });
  return rows.map((r) => ({ ...r, profiles: byId.get(r[userIdField] as string) }));
}

export async function fetchCommunityPosts(limit = 20): Promise<CommunityPost[]> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Surface real errors rather than silently returning []. The caller
  // (typically a useLiveFeed-backed feed) can then engage backoff and the
  // user sees an honest banner. Returning [] silently here was masking
  // RLS / connectivity problems as "no posts".
  if (error) {
    console.error('[SUPABASE_QUERY_FAIL] table=community_posts source=fetchCommunityPosts', error);
    throw new Error(`fetchCommunityPosts failed: ${error.message}`);
  }
  const withProfiles = await attachProfiles(data ?? [], 'user_id');
  return withProfiles as CommunityPost[];
}

export async function createCommunityPost(post: {
  user_id: string;
  type: string;
  caption: string;
  description?: string;
  image_url?: string;
  tags?: string[];
  location?: string;
  location_found?: string;
  marketplace_found?: string;
  rarity_score?: number;
  estimated_value?: number;
  scout_assisted?: boolean;
  for_sale?: boolean;
  category?: string;
  general_location?: string;
  exact_address_private?: string;
  address_reveal_policy?: string;
  pickup_type?: string[];
  shipping_available?: boolean;
  scout_needed?: boolean;
  scouts_available?: boolean;
  meetup_notes?: string;
}): Promise<{ data: CommunityPost | null; error: string | null }> {
  // [POST_NORMALIZE] Trim and apply non-empty defaults so the feed
  // renderer never receives a row that would paint a blank card.
  // The H3 title in Home.tsx reads `post.caption` directly — if we let
  // empty / whitespace strings through, the card collapses to just the
  // badge + meta line, which is what the "broken card" report described.
  const trim = (v: string | undefined | null): string => (v ?? '').toString().trim();
  const normCaption = trim(post.caption) || 'Untitled Find';
  const normCategory = trim(post.category) || undefined;
  const normImage = trim(post.image_url) || undefined;

  const payload = {
    ...post,
    caption: normCaption,
    category: normCategory,
    image_url: normImage,
  };
  console.log('[FLASH_UPLOAD] createCommunityPost payload', {
    type: payload.type,
    hasImage: !!normImage,
    captionLen: normCaption.length,
    category: normCategory ?? null,
  });

  const { data, error } = await supabase
    .from('community_posts')
    .insert(payload)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[SUPABASE_QUERY_FAIL] table=community_posts source=createCommunityPost', error);
    return { data: null, error: error.message };
  }
  console.log('[FLASH_UPLOAD] createCommunityPost ok id=', data?.id);
  return { data: data as CommunityPost, error: null };
}

export async function togglePostLike(userId: string, postId: string, liked: boolean): Promise<void> {
  if (liked) {
    await supabase.from('post_likes').delete().eq('user_id', userId).eq('post_id', postId);
    await supabase.rpc('decrement_post_likes', { post_id_input: postId });
  } else {
    await supabase.from('post_likes').insert({ user_id: userId, post_id: postId });
    await supabase.rpc('increment_post_likes', { post_id_input: postId });
  }
}

export async function fetchUserLikes(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId);

  return new Set((data ?? []).map((r) => r.post_id));
}

export async function fetchMarketplaceListings(limit = 20): Promise<MarketplaceListing[]> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    // PGRST205 = table missing in schema cache (marketplace not provisioned)
    if (error.code === 'PGRST205') return [];
    console.warn('[SUPABASE_QUERY_FAIL] table=marketplace_listings source=fetchMarketplaceListings', error.code, error.message);
    return [];
  }
  const withProfiles = await attachProfiles(data ?? [], 'seller_id');
  return withProfiles as MarketplaceListing[];
}

export async function createMarketplaceListing(listing: {
  seller_id: string;
  title: string;
  description?: string;
  price: number;
  condition?: string;
  category?: string;
  image_url?: string;
  auction_enabled?: boolean;
  local_pickup?: boolean;
  general_location?: string;
  exact_address_private?: string;
  address_reveal_policy?: string;
  pickup_type?: string[];
  shipping_available?: boolean;
  scout_needed?: boolean;
  scouts_available?: boolean;
  meetup_notes?: string;
  marketplace_found?: string;
}): Promise<{ data: MarketplaceListing | null; error: string | null }> {
  const { data, error } = await supabase
    .from('marketplace_listings')
    .insert(listing)
    .select()
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as MarketplaceListing, error: null };
}

export async function followUser(followerId: string, followingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('followers')
    .insert({ follower_id: followerId, following_id: followingId });

  if (error) return { error: error.message };

  await supabase.rpc('increment_follower_count', { target_user_id: followingId });
  await supabase.rpc('increment_following_count', { target_user_id: followerId });
  return { error: null };
}

export async function unfollowUser(followerId: string, followingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('followers')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);

  if (error) return { error: error.message };

  await supabase.rpc('decrement_follower_count', { target_user_id: followingId });
  await supabase.rpc('decrement_following_count', { target_user_id: followerId });
  return { error: null };
}

export async function checkIsFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data } = await supabase
    .from('followers')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();

  return !!data;
}

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read_status: true })
    .eq('id', notificationId);
}

export async function fetchUserFlashFinds(userId: string) {
  const { data, error } = await supabase
    .from('flash_finds')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data ?? [];
}

export async function createFlashFind(find: {
  user_id: string;
  title: string;
  description?: string;
  image_url?: string;
  estimated_value?: number;
  rarity_score?: number;
  category?: string;
  location?: string;
}) {
  // [POST_NORMALIZE] Same trim/default treatment as community_posts so
  // downstream UI never has to render a blank title.
  const trim = (v: string | undefined | null): string => (v ?? '').toString().trim();
  const payload = {
    ...find,
    title: trim(find.title) || 'Untitled Find',
    description: trim(find.description) || undefined,
    image_url: trim(find.image_url) || undefined,
    category: trim(find.category) || undefined,
    location: trim(find.location) || undefined,
  };
  const { data, error } = await supabase
    .from('flash_finds')
    .insert(payload)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[SUPABASE_QUERY_FAIL] table=flash_finds source=createFlashFind', error);
    return { data: null, error: error.message };
  }
  return { data, error: null };
}
