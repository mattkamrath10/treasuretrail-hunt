import { supabase } from './supabase';
import type { CommunityPost, MarketplaceListing, Notification } from './supabase';

export async function fetchCommunityPosts(limit = 20): Promise<CommunityPost[]> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*, profiles(username, avatar_url, treasure_rank, scout_verified)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as CommunityPost[];
}

export async function createCommunityPost(post: {
  user_id: string;
  type: string;
  caption: string;
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
  const { data, error } = await supabase
    .from('community_posts')
    .insert(post)
    .select()
    .maybeSingle();

  if (error) return { data: null, error: error.message };
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
    .select('*, profiles(username, avatar_url, treasure_rank, scout_verified)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as MarketplaceListing[];
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
  const { data, error } = await supabase
    .from('flash_finds')
    .insert(find)
    .select()
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
