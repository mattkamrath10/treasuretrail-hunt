// =====================================================================
// Autopilot blog publisher
// ---------------------------------------------------------------------
// Generates ONE SEO article from the curated topic rotation and publishes it
// straight to blog_posts (status='published'). Designed to be run by a Replit
// Scheduled Deployment on a conservative cadence (e.g. weekly) so the blog
// grows hands-free. It does NOT depend on the web server being up — it talks to
// OpenAI and Supabase directly — which is essential on Autoscale (scales to 0).
//
// Run:  tsx scripts/autopublishBlog.ts
// Needs env: AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL,
//            VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =====================================================================
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { generateBlogDraft, saveBlogPost, pickAutopilotTopic } from '../server/blogGen';

const MODEL = 'gpt-5.4';

async function main() {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[autopublish] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  // The model key is only needed for a real run (not --dry-run); fail loudly so
  // a misconfigured Scheduled Deployment doesn't silently produce nothing.
  if (!process.argv.includes('--dry-run') && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    console.error('[autopublish] Missing AI_INTEGRATIONS_OPENAI_API_KEY');
    process.exit(1);
  }

  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const topic = await pickAutopilotTopic(sb);
  console.log(`[autopublish] topic: "${topic.topic}" (${topic.category})`);

  // --dry-run: verify topic selection + DB connectivity without calling the
  // model or writing a post (no OpenAI cost, nothing published).
  if (process.argv.includes('--dry-run')) {
    console.log('[autopublish] dry run — skipping generation + publish.');
    return;
  }

  const draft = await generateBlogDraft(openai, MODEL, {
    topic: topic.topic,
    category: topic.category,
    county: topic.county ?? null,
    city: topic.city ?? null,
  });

  const saved = await saveBlogPost(sb, { ...draft, status: 'published' });
  console.log(
    `[autopublish] published: ${saved.slug} (id=${saved.id}) → https://treasuretrail-hunt.com/blog/${saved.slug}`,
  );
}

main().catch((err) => {
  console.error('[autopublish] failed:', err?.message || err);
  process.exit(1);
});
