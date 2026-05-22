import { supabase } from './supabase';
import { compressWithThumbnail, compressToBlob } from './imageCompress';

// One year in seconds. Combined with `immutable` this tells the CDN
// and browser that the bytes at this URL will never change — safe
// because every upload uses a timestamped filename, so the URL itself
// is the version. New uploads write to new paths.
const IMMUTABLE_CACHE = '31536000, immutable';

export type UploadedImage = {
  url: string;
  thumbUrl: string;
  path: string;
  thumbPath: string;
};

export type UploadOpts = {
  bucket?: string; // defaults to 'avatars' (the existing bucket)
  userId: string;
  folder?: string; // e.g. 'finds', 'listings'
};

function publicUrl(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Upload an image as TWO objects: the full 1200px copy used by detail
 * pages, and a 400px thumbnail used by feed cards. Both are written
 * with a 1-year immutable Cache-Control so subsequent loads hit the
 * browser / CDN cache directly and never re-fetch from origin.
 *
 * Caller-side contract: the returned `url` is the only value the DB
 * needs to remember. The thumb URL is derived deterministically by
 * `toThumbUrl(url)`, which means existing rows without thumbs still
 * work (the feed component falls back to the full URL on 404).
 */
export async function uploadCompressedImage(
  src: string,
  opts: UploadOpts,
): Promise<UploadedImage> {
  const bucket = opts.bucket ?? 'avatars';
  const folder = opts.folder ?? 'uploads';
  // Path layout is constrained by the avatars-bucket RLS policy:
  // the FIRST segment MUST equal auth.uid(). Subfolders inside the
  // user's namespace are free-form. See AVATARS_RLS_PATCH.sql.
  const stamp = Date.now();
  const basePath = `${opts.userId}/${folder}/${stamp}`;
  const fullPath = `${basePath}.jpg`;
  const thumbPath = `${basePath}.thumb.jpg`;

  let full: Blob;
  let thumb: Blob;
  try {
    const pair = await compressWithThumbnail(src);
    full = pair.full;
    thumb = pair.thumb;
  } catch {
    // Single-decode pipeline failed (HEIC the browser can't paint,
    // tainted canvas, etc). Fall back to raw fetch for the full size
    // and skip the thumbnail — the feed-side onError fallback will
    // load the full URL instead.
    const res = await fetch(src);
    full = await res.blob();
    thumb = full;
  }

  const [{ error: fullErr }, { error: thumbErr }] = await Promise.all([
    supabase.storage.from(bucket).upload(fullPath, full, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: IMMUTABLE_CACHE,
    }),
    supabase.storage.from(bucket).upload(thumbPath, thumb, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: IMMUTABLE_CACHE,
    }),
  ]);
  if (fullErr) throw new Error(fullErr.message);
  // Thumb failure is non-fatal — the deterministic URL transform will
  // 404 and the feed-side fallback will swap to the full URL. Better
  // than rolling back the entire post.
  if (thumbErr) {
    console.warn('[uploadImage] thumb upload failed; feed will fall back to full', thumbErr.message);
  }

  return {
    url: publicUrl(bucket, fullPath),
    thumbUrl: publicUrl(bucket, thumbPath),
    path: fullPath,
    thumbPath,
  };
}

/**
 * Single-blob upload for paths that don't need a thumbnail (e.g.
 * avatars — they already render at small sizes everywhere).
 */
export async function uploadSingleImage(
  src: string,
  opts: UploadOpts & { maxDim?: number; quality?: number },
): Promise<{ url: string; path: string }> {
  const bucket = opts.bucket ?? 'avatars';
  const folder = opts.folder ?? 'uploads';
  const stamp = Date.now();
  const path = `${opts.userId}/${folder}/${stamp}.jpg`;
  let blob: Blob;
  try {
    blob = await compressToBlob(src, opts.maxDim, opts.quality);
  } catch {
    const res = await fetch(src);
    blob = await res.blob();
  }
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: IMMUTABLE_CACHE,
  });
  if (error) throw new Error(error.message);
  return { url: publicUrl(bucket, path), path };
}
