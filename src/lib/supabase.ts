import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  username: string;
  bio: string;
  avatar_url: string | null;
  favorite_categories: string[];
  treasure_rank: string;
  xp: number;
  level: number;
  reputation_score: number;
  scout_verified: boolean;
  pro_member: boolean;
  role: 'user' | 'admin';
  membership_tier: 'free' | 'pro';
  follower_count: number;
  following_count: number;
  // Phase 1 — seller-driven marketplace. Everyone defaults to 'seeker';
  // a user becomes a 'holder' (event host) by flipping this from the
  // Profile page. Holder-only UI gates on this flag.
  account_type: 'seeker' | 'holder';
  business_name: string | null;
  business_bio: string | null;
  business_logo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityPost = {
  id: string;
  user_id: string;
  type: string;
  caption: string;
  description?: string | null;
  image_url: string | null;
  tags: string[];
  location: string;
  rarity_score: number | null;
  estimated_value: number | null;
  scout_assisted: boolean;
  for_sale: boolean;
  category: string;
  like_count: number;
  comment_count: number;
  share_count: number;
  // Phase 1 monetization — boost + moderation columns. Optional so
  // existing query paths that don't SELECT them still typecheck.
  boosted_at?: string | null;
  boost_expires_at?: string | null;
  boost_type?: 'paid' | 'pro' | null;
  priority_score?: number | null;
  is_hidden?: boolean | null;
  report_count?: number | null;
  created_at: string;
  profiles?: Pick<Profile, 'username' | 'avatar_url' | 'treasure_rank' | 'scout_verified'>;
};

export type MarketplaceListing = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number;
  condition: string;
  category: string;
  image_url: string | null;
  auction_enabled: boolean;
  local_pickup: boolean;
  status: string;
  created_at: string;
  general_location?: string | null;
  shipping_available?: boolean | null;
  scout_needed?: boolean | null;
  marketplace_found?: string | null;
  // Phase 1 monetization — boost + moderation columns.
  boosted_at?: string | null;
  boost_expires_at?: string | null;
  boost_type?: 'paid' | 'pro' | null;
  priority_score?: number | null;
  is_hidden?: boolean | null;
  report_count?: number | null;
  profiles?: Pick<Profile, 'username' | 'avatar_url' | 'treasure_rank' | 'scout_verified'>;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  content: string;
  read_status: boolean;
  created_at: string;
  actor_user_id?: string | null;
  related_item_id?: string | null;
  related_item_type?: string | null;
  metadata?: Record<string, unknown> | null;
};
