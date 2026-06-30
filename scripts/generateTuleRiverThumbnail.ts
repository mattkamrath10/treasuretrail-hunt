// =====================================================================
// Tule River Estate Services — blog thumbnail generator
// ---------------------------------------------------------------------
// Uses YOUR OWN OpenAI account (ChatGPT image model gpt-image-1) to make
// a blog thumbnail that merges the TreasureTrail map-pin logo with the
// red "Tule River Estate Services" badge over a rustic barn-wood theme,
// then uploads it to Supabase storage and sets it as the post's cover.
//
// IMPORTANT: this talks DIRECTLY to api.openai.com with your OPENAI_API_KEY,
// so it bills your OpenAI account — it does NOT use any Replit units / the
// Replit AI integration.
//
// Run it:
//   tsx scripts/generateTuleRiverThumbnail.ts
//   tsx scripts/generateTuleRiverThumbnail.ts --dry-run     # build prompt only, spend nothing
//
// Needs env:
//   OPENAI_API_KEY            (your own OpenAI key)
//   VITE_SUPABASE_URL         (already set)
//   SUPABASE_SERVICE_ROLE_KEY (already set)
// =====================================================================
import fs from 'fs';
import OpenAI, { toFile } from 'openai';
import { createClient } from '@supabase/supabase-js';

const IMAGE_MODEL = 'gpt-image-1';
const BUCKET = 'avatars';
const IMMUTABLE_CACHE = '31536000, immutable';

// The post this thumbnail is for.
const POST_SLUG = 'tule-river-estate-services-springville-tulare-county';

// The two source logos (already in the repo).
const TREASURETRAIL_LOGO = 'attached_assets/IMG_2197_1782832182247.jpeg';
const ESTATE_LOGO = 'attached_assets/IMG_2198_1782832182247.jpeg';

const PROMPT = [
  'Create a polished, wide 3:2 landscape blog thumbnail for an estate-sale article.',
  'Combine the two supplied brand logos into ONE cohesive, balanced composition:',
  'the orange "TreasureTrail" rounded-square map-pin logo and the red',
  '"Tule River Estate Services" hexagon badge.',
  'Keep BOTH logos clearly legible, crisp, and undistorted — do not redraw or',
  'alter their text. Place them as if partnered together (side by side or with',
  'the TreasureTrail pin as a small "powered by / listed on" mark).',
  'Background: warm, rustic weathered blue-gray barn wood matching the estate',
  'badge, with soft natural daylight and a few subtle, tasteful estate-sale /',
  'treasure-hunting touches (vintage finds, antiques) kept faint so the logos',
  'stay the focus. Friendly, trustworthy, modern editorial look with breathing',
  'room around the logos. No extra text, captions, or watermarks beyond what is',
  'already inside the two logos.',
].join(' ');

async function main() {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[thumb] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  console.log(`[thumb] post slug: ${POST_SLUG}`);
  console.log(`[thumb] prompt: ${PROMPT}`);
  if (dryRun) {
    console.log('[thumb] dry run — nothing generated or uploaded.');
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('[thumb] Missing OPENAI_API_KEY (your own OpenAI key).');
    process.exit(1);
  }
  for (const p of [TREASURETRAIL_LOGO, ESTATE_LOGO]) {
    if (!fs.existsSync(p)) {
      console.error(`[thumb] Missing logo file: ${p}`);
      process.exit(1);
    }
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Look up the post first so we fail fast if the slug is wrong.
  const { data: post, error: findErr } = await sb
    .from('blog_posts')
    .select('id, slug, title, cover_image_url')
    .eq('slug', POST_SLUG)
    .maybeSingle();
  if (findErr) {
    console.error('[thumb] post lookup failed:', findErr.message);
    process.exit(1);
  }
  if (!post) {
    console.error(`[thumb] No blog post with slug "${POST_SLUG}".`);
    process.exit(1);
  }
  console.log(`[thumb] post: "${post.title}"`);

  // Direct OpenAI — your key, your bill, NO Replit units.
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const images = await Promise.all([
    toFile(fs.createReadStream(TREASURETRAIL_LOGO), 'treasuretrail.jpeg', { type: 'image/jpeg' }),
    toFile(fs.createReadStream(ESTATE_LOGO), 'tule-river-estate.jpeg', { type: 'image/jpeg' }),
  ]);

  console.log('[thumb] generating with', IMAGE_MODEL, '… (this can take ~30s)');
  const gen = await openai.images.edit({
    model: IMAGE_MODEL,
    image: images,
    prompt: PROMPT,
    size: '1536x1024',
    n: 1,
  });

  const b64 = gen.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image generation returned no data.');
  const bytes = Buffer.from(b64, 'base64');
  console.log(`[thumb] generated ${(bytes.length / 1024).toFixed(0)} KB`);

  const path = `blog/${post.slug}-${Date.now()}.png`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: 'image/png',
    cacheControl: IMMUTABLE_CACHE,
  });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  console.log(`[thumb] uploaded → ${publicUrl}`);

  const { data: updated, error: updErr } = await sb
    .from('blog_posts')
    .update({ cover_image_url: publicUrl, cover_thumb_url: publicUrl })
    .eq('id', post.id)
    .select('id')
    .maybeSingle();
  if (updErr) throw new Error(`db update failed: ${updErr.message}`);
  if (!updated) throw new Error('db update matched 0 rows — cover not saved.');

  console.log(`[thumb] done → https://treasuretrail-hunt.com/blog/${post.slug}`);
}

main().catch((err) => {
  console.error('[thumb] failed:', err?.message || err);
  process.exit(1);
});
