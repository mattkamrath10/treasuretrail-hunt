// Image compression helpers. We run everything through a canvas so the
// browser handles HEIC/HEIF → JPEG conversion on iOS, EXIF orientation,
// and downscaling in one pass.
//
// Defaults are tuned for marketplace photos: 1200px long edge at q=0.7
// brings a typical 5–8 MB phone capture down to ~120–250 KB while still
// looking sharp on a retina detail view.
//
// Per-feed thumbnails (400px @ q=0.65) cut bandwidth by ~10x on grid
// cards. Originals are never loaded in the feed.

export const MAX_FULL_DIM = 1200;
export const FULL_QUALITY = 0.7;
export const MAX_THUMB_DIM = 400;
export const THUMB_QUALITY = 0.65;

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function drawToBlob(
  img: HTMLImageElement,
  maxDim: number,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas unavailable'));
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Legacy API kept for callers that want a data URL back. Prefer
 * compressToBlob — it skips the round-trip through dataURL → fetch →
 * blob that the upload sites used to do.
 */
export async function compressImage(
  src: string,
  maxDim = MAX_FULL_DIM,
  quality = FULL_QUALITY,
): Promise<string> {
  if (!src.startsWith('data:image/') && !src.startsWith('blob:') && !src.startsWith('http')) {
    return src;
  }
  const img = await loadImage(src);
  const blob = await drawToBlob(img, maxDim, quality);
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function compressToBlob(
  src: string,
  maxDim = MAX_FULL_DIM,
  quality = FULL_QUALITY,
): Promise<Blob> {
  const img = await loadImage(src);
  return drawToBlob(img, maxDim, quality);
}

/**
 * Compress + thumbnail in a SINGLE image decode. Cheaper than calling
 * compressToBlob twice because mobile Safari is slow to decode HEIC.
 */
export async function compressWithThumbnail(
  src: string,
): Promise<{ full: Blob; thumb: Blob }> {
  const img = await loadImage(src);
  const [full, thumb] = await Promise.all([
    drawToBlob(img, MAX_FULL_DIM, FULL_QUALITY),
    drawToBlob(img, MAX_THUMB_DIM, THUMB_QUALITY),
  ]);
  return { full, thumb };
}

/**
 * Deterministic URL transform: <path>.<ext> → <path>.thumb.jpg
 *
 * We use this on the read side so feed cards can request the small
 * thumbnail file without the database having to store a second URL
 * column. If the thumb doesn't exist yet (legacy data uploaded before
 * thumbs were introduced), the consumer should fall back to the full
 * URL on <img onError>.
 */
export function toThumbUrl(url?: string | null): string | null {
  if (!url) return null;
  // Only rewrite URLs that are clearly Supabase Storage public objects
  // hosted on a *.supabase.co host. Matching just the path substring
  // would risk false positives if an external image (Pexels, scraped
  // marketplace) happened to contain `/storage/v1/object/public/` in
  // its path. Anchoring on the supabase.co host eliminates that.
  try {
    const u = new URL(url);
    if (!/\.supabase\.co$/i.test(u.hostname)) return url;
    if (!u.pathname.startsWith('/storage/v1/object/public/')) return url;
  } catch {
    return url;
  }
  return url.replace(/\.(jpe?g|png|webp|gif|heic|heif)(\?.*)?$/i, '.thumb.jpg$2');
}
