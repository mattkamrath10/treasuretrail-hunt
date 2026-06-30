import { supabase } from './supabase';
import type { Profile } from './supabase';

/**
 * Fetch profiles for the public "Featured Profiles" directory.
 *
 * Migration-safe: we `select('*')` and order by `follower_count` (a column that
 * has always existed) rather than naming `featured_profile` in the query, then
 * sort featured-first on the client. That way the page keeps working even
 * before the featured_profile migration is applied (the column simply reads as
 * undefined → treated as not-featured) instead of 400-ing the whole select.
 */
export async function fetchDirectoryProfiles(limit = 200): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('follower_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[profiles] directory fetch failed:', error.message);
    return [];
  }

  const rows = ((data ?? []) as Profile[]).filter((p) => !!p.username);

  return rows.slice().sort((a, b) => {
    const fa = (a as any).featured_profile ? 1 : 0;
    const fb = (b as any).featured_profile ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return (b.follower_count || 0) - (a.follower_count || 0);
  });
}

/** Just the featured members (for the Discover strip). */
export async function fetchFeaturedProfiles(limit = 12): Promise<Profile[]> {
  const all = await fetchDirectoryProfiles(200);
  return all.filter((p) => (p as any).featured_profile).slice(0, limit);
}

/**
 * A profile counts as a public "seller" when it has at least one cross-platform
 * selling link filled in (Whatnot / eBay / Poshmark / Facebook Marketplace).
 * This is the self-serve opt-in: setting up your seller profile = adding a link,
 * so we don't need a separate DB flag or migration.
 */
export function hasSellingLinks(p: Profile): boolean {
  const anyP = p as any;
  return ['link_whatnot', 'link_ebay', 'link_poshmark', 'link_facebook_marketplace']
    .some((k) => typeof anyP[k] === 'string' && anyP[k].trim().length > 0);
}

/**
 * Sellers for the Discover "Sellers" carousel + slideshow. Reuses the
 * migration-safe directory fetch, then keeps only profiles with a selling link.
 * Already sorted featured-first (then by followers) by fetchDirectoryProfiles.
 */
export async function fetchSellerProfiles(limit = 24): Promise<Profile[]> {
  const all = await fetchDirectoryProfiles(200);
  return all.filter(hasSellingLinks).slice(0, limit);
}
