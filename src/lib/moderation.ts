import { supabase, type Profile, type CommunityPost, type MarketplaceListing } from './supabase';

export type DeletablePostType =
  | 'community_post'
  | 'flash_find_legacy'
  | 'marketplace_listing'
  | 'external_listing';

export interface DeletablePost {
  id: string;
  type: DeletablePostType;
  ownerId: string;
  imageUrl?: string | null;
}

export function canDeletePost(
  user: { id: string } | null,
  profile: Pick<Profile, 'role'> | null,
  post: { ownerId?: string | null; user_id?: string | null; seller_id?: string | null }
): boolean {
  if (!user) return false;
  if (profile?.role === 'admin') return true;
  const owner =
    post.ownerId ??
    post.user_id ??
    post.seller_id ??
    null;
  return owner === user.id;
}

export function isAdmin(profile: Pick<Profile, 'role'> | null): boolean {
  return profile?.role === 'admin';
}

const TABLE_BY_TYPE: Record<DeletablePostType, string> = {
  community_post: 'community_posts',
  flash_find_legacy: 'flash_finds',
  marketplace_listing: 'marketplace_listings',
  external_listing: 'external_listings',
};

// The Flash Find image upload writes to the `avatars` bucket at
// `<user_id>/finds/<ts>.<ext>`. Public URLs look like
// https://<project>.supabase.co/storage/v1/object/public/avatars/<path>.
// Returns the bucket-relative path to feed into .remove([path]).
export function extractStoragePath(publicUrl: string | null | undefined): { bucket: string; path: string } | null {
  if (!publicUrl) return null;
  const marker = '/storage/v1/object/public/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  const rest = publicUrl.slice(idx + marker.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const bucket = rest.slice(0, slash);
  const path = rest.slice(slash + 1).split('?')[0];
  if (!bucket || !path) return null;
  return { bucket, path };
}

export interface DeletePostResult {
  ok: boolean;
  error?: string;
  storageRemoved?: boolean;
}

// Single entry point for owner/admin deletes across every feed.
// 1. Removes the storage image (best-effort; logs but does not abort if it fails).
// 2. Deletes the DB row. RLS enforces owner-or-admin, so an unauthorized
//    caller will simply receive a permissions error from Supabase.
// 3. Returns a structured result for optimistic-rollback handling.
export async function deletePost(post: DeletablePost): Promise<DeletePostResult> {
  const table = TABLE_BY_TYPE[post.type];
  if (!table) {
    return { ok: false, error: `Unknown post type: ${post.type}` };
  }

  // Best-effort storage cleanup. We attempt BEFORE the DB delete so that
  // an orphaned row never blocks future re-uploads to the same path.
  let storageRemoved = false;
  const storage = extractStoragePath(post.imageUrl);
  if (storage) {
    const { error: storageErr } = await supabase.storage
      .from(storage.bucket)
      .remove([storage.path]);
    if (storageErr) {
      console.warn('[MODERATION_DELETE] storage remove failed (continuing with row delete)', {
        bucket: storage.bucket,
        path: storage.path,
        message: storageErr.message,
      });
    } else {
      storageRemoved = true;
    }
  }

  const { error } = await supabase.from(table).delete().eq('id', post.id);
  if (error) {
    console.error('[MODERATION_DELETE] row delete failed', { table, id: post.id, message: error.message });
    return { ok: false, error: error.message, storageRemoved };
  }
  console.log('[MODERATION_DELETE] ok', { table, id: post.id, storageRemoved });
  return { ok: true, storageRemoved };
}

// Convenience adapter for a CommunityPost row.
export function communityPostToDeletable(p: CommunityPost): DeletablePost {
  return {
    id: p.id,
    type: 'community_post',
    ownerId: p.user_id,
    imageUrl: p.image_url ?? null,
  };
}

// Convenience adapter for a MarketplaceListing row.
export function marketplaceListingToDeletable(l: MarketplaceListing): DeletablePost {
  return {
    id: l.id,
    type: 'marketplace_listing',
    ownerId: l.seller_id,
    imageUrl: l.image_url ?? null,
  };
}

// Future: hideListing, suspendUser, banUser, markCounterfeit, restoreDeleted,
// reviewReportsQueue — all routed through this same helper so feed code never
// has to know who is allowed to do what.
