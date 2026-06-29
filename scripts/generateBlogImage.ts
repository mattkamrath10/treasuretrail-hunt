// =====================================================================
// Blog cover-image generator
// ---------------------------------------------------------------------
// Generates a cover image for ONE blog post with OpenAI (gpt-image-1),
// uploads it to the public `avatars` storage bucket, and writes the URL
// onto the post's cover_image_url / cover_thumb_url columns. Talks to
// OpenAI + Supabase directly (no web server needed), same as the
// autopilot publisher.
//
// Run (newest post — Porterville reseller guide is the default):
//   tsx scripts/generateBlogImage.ts
// Pick a specific post by slug:
//   tsx scripts/generateBlogImage.ts profitable-reseller-steps-porterville
//   tsx scripts/generateBlogImage.ts --slug=some-other-post
// Override the art direction:
//   tsx scripts/generateBlogImage.ts --prompt="a vintage flea market at dawn"
// Preview the prompt without spending anything:
//   tsx scripts/generateBlogImage.ts --dry-run
//
// Needs env: AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL,
//            VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =====================================================================
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const IMAGE_MODEL = 'gpt-image-1';
const BUCKET = 'avatars';
// One year, immutable — every upload uses a timestamped path, so the URL
// is its own version. Matches src/lib/uploadImage.ts.
const IMMUTABLE_CACHE = '31536000, immutable';
// Newest post at time of writing. Override with a positional arg or --slug=.
const DEFAULT_SLUG = 'profitable-reseller-steps-porterville';

function getArg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

// Builds the art direction from the post. We ask for a clean editorial
// illustration with NO text/letters baked in (generators render garbled
// type, and the page already shows the title over the image).
function buildPrompt(post: { title: string; category: string; excerpt: string | null }): string {
  const subject = post.excerpt?.trim() || post.title;
  return [
    `Editorial blog cover illustration for an article titled "${post.title}".`,
    `Topic: ${subject}.`,
    'Warm, optimistic, modern flat-illustration style with a treasure-hunting / reselling theme',
    '(garage sales, estate sales, flea markets, vintage finds, California Central Valley).',
    'Inviting natural daylight, friendly color palette with warm oranges and earthy tones.',
    'Wide 3:2 landscape composition with clear focal point and breathing room.',
    'Absolutely NO text, NO words, NO letters, NO logos, NO watermarks anywhere in the image.',
  ].join(' ');
}

async function main() {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[blog-image] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    console.error('[blog-image] Missing AI_INTEGRATIONS_OPENAI_API_KEY');
    process.exit(1);
  }

  const positional = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const slug = (getArg('slug') || positional || DEFAULT_SLUG).trim();

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: post, error: findErr } = await sb
    .from('blog_posts')
    .select('id, slug, title, category, excerpt, cover_image_url')
    .eq('slug', slug)
    .maybeSingle();
  if (findErr) {
    console.error('[blog-image] lookup failed:', findErr.message);
    process.exit(1);
  }
  if (!post) {
    console.error(`[blog-image] No blog post with slug "${slug}".`);
    const { data: recent } = await sb
      .from('blog_posts')
      .select('slug, title')
      .order('published_at', { ascending: false })
      .limit(10);
    if (recent?.length) {
      console.error('[blog-image] Recent slugs:');
      for (const r of recent) console.error(`  - ${r.slug}  (${r.title})`);
    }
    process.exit(1);
  }

  const prompt = getArg('prompt') || buildPrompt(post);
  console.log(`[blog-image] post: "${post.title}" (${post.slug})`);
  console.log(`[blog-image] prompt: ${prompt}`);

  if (dryRun) {
    console.log('[blog-image] dry run — not generating or uploading.');
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  console.log('[blog-image] generating with', IMAGE_MODEL, '…');
  const gen = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: '1536x1024',
    n: 1,
  });
  const b64 = gen.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image generation returned no data.');
  const bytes = Buffer.from(b64, 'base64');
  console.log(`[blog-image] generated ${(bytes.length / 1024).toFixed(0)} KB`);

  const path = `blog/${post.slug}-${Date.now()}.png`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
    upsert: true,
    contentType: 'image/png',
    cacheControl: IMMUTABLE_CACHE,
  });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);
  const publicUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  console.log(`[blog-image] uploaded → ${publicUrl}`);

  // Point both the full cover and the thumb at the new image. .select()
  // so a 0-row update (id mismatch) fails loudly instead of silently.
  const { data: updated, error: updErr } = await sb
    .from('blog_posts')
    .update({ cover_image_url: publicUrl, cover_thumb_url: publicUrl })
    .eq('id', post.id)
    .select('id')
    .maybeSingle();
  if (updErr) throw new Error(`db update failed: ${updErr.message}`);
  if (!updated) throw new Error('db update matched 0 rows — cover not saved.');

  console.log(
    `[blog-image] done → https://treasuretrail-hunt.com/blog/${post.slug}`,
  );
}

main().catch((err) => {
  console.error('[blog-image] failed:', err?.message || err);
  process.exit(1);
});
