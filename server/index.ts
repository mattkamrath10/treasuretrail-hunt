import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { lookup as dnsLookup } from 'node:dns/promises';
import {
  grantPro,
  revokePro,
  grantFoundingPartner,
  revokeFoundingPartner,
  grantBusinessFoundingPartner,
  revokeBusinessFoundingPartner,
  applyBoost,
  removeBoost,
  deleteUserAccount,
  hasServiceRole,
  getServiceClient,
  verifyBoostOwnership,
  webhookEventSeen,
  recordWebhookEvent,
  claimBoostTransaction,
  releaseBoostTransaction,
  type BoostTargetKind,
} from './grants';
import {
  verifyWebhookAuth,
  classifyWebhookEvent,
  fetchSubscriber,
  isProActive,
  boostTransactionIds,
  hasRevenueCatRest,
  type RevenueCatEvent,
} from './revenuecat';
import { sendGoLivePush, sendNotificationPush, hasPush } from './push';

// Deployment (Autoscale/VM) injects PORT; bind it in production. In dev the
// server keeps using AI_SERVER_PORT (3001) so the Vite /api proxy resolves.
const PORT = Number(process.env.PORT ?? process.env.AI_SERVER_PORT ?? 3001);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[ai-server] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const FREE_DAILY_LIMIT = 5;
const PRO_DAILY_SOFT_CAP = 100;
const MODEL = 'gpt-5.4';

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

function supabaseForUser(accessToken: string) {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const SYSTEM_PROMPT = `You are an expert reseller-appraiser for second-hand goods, antiques, and collectibles. Given a single photograph plus optional user-supplied context, you identify the item and give a realistic resale outlook based on your training knowledge of secondary-market platforms (eBay, Facebook Marketplace, Whatnot, Mercari, etc.). You do NOT have live internet access; your price ranges are reasoned estimates, not live comps.

Always return a SINGLE JSON object matching the schema exactly. No prose, no markdown fences. Be concise. If you cannot identify the item, set "identified": false and explain in "summary".

JSON schema:
{
  "identified": boolean,
  "title": string,           // short product title, e.g. "1970s Pyrex Spring Blossom Casserole Dish"
  "category": string,        // best category from: Electronics, Furniture, Books, Collectibles, Antiques, Art, Jewelry, Watches, Toys, Tools, Clothing, Other
  "brand": string|null,
  "model": string|null,      // specific model name or number if identifiable, else null
  "era": string|null,        // e.g. "1970s", "Mid-Century", "Modern"
  "condition_estimate": string, // one of: "Mint", "Good", "Fair", "For parts"
  "rarity_score": number,    // 1-10, 10 = extremely rare
  "confidence": number,      // 0-100 your confidence in the identification
  "estimated_value": { "low": number, "high": number, "currency": "USD" },
  "suggested_price": number, // recommended single listing price in USD, within estimated_value range
  "keywords": string[],      // 4-8 search keywords/tags a buyer would type to find this item
  "summary": string,         // 2-3 sentence buyer-facing description of the item
  "highlights": string[],    // 2-4 bullets: notable features, markings, or value drivers
  "selling_tips": string[],  // 2-3 short reseller tips (best platform, listing angle, photo advice)
  "watch_outs": string[]     // 1-3 things to verify before listing (damage, repros, authenticity)
}`;

async function callOpenAIVision(dataUrl: string, userContext: string) {
  const resp = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    max_completion_tokens: 1500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userContext || 'Identify and appraise this item for resale.' },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
        ],
      },
    ],
  });
  const raw = resp.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw);
}

app.get('/api/ai-scan/usage', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const accessToken = auth.slice(7);
    const sb = supabaseForUser(accessToken);

    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const { data: profile } = await sb
      .from('profiles')
      .select('membership_tier')
      .eq('id', userData.user.id)
      .maybeSingle();

    const tier = (profile?.membership_tier === 'pro' ? 'pro' : 'free') as 'free' | 'pro';
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await sb
      .from('ai_scans_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userData.user.id)
      .gte('created_at', since);

    const used = count ?? 0;
    const limit = tier === 'pro' ? PRO_DAILY_SOFT_CAP : FREE_DAILY_LIMIT;
    res.json({ tier, used, limit, remaining: Math.max(0, limit - used) });
  } catch (err: any) {
    console.error('[ai-scan/usage]', err);
    res.status(500).json({ error: 'failed to load usage' });
  }
});

app.post('/api/ai-scan', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Create a free account to use AI Treasure Scan.' });
    }
    const accessToken = auth.slice(7);
    const sb = supabaseForUser(accessToken);

    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) {
      return res.status(401).json({ error: 'Create a free account to use AI Treasure Scan.' });
    }
    const userId = userData.user.id;

    const { image, context } = req.body as { image?: string; context?: string };
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'A valid image is required.' });
    }

    // Profile + tier
    const { data: profile } = await sb
      .from('profiles')
      .select('membership_tier')
      .eq('id', userId)
      .maybeSingle();
    const tier = (profile?.membership_tier === 'pro' ? 'pro' : 'free') as 'free' | 'pro';
    const limit = tier === 'pro' ? PRO_DAILY_SOFT_CAP : FREE_DAILY_LIMIT;

    // Cache lookup (cache hits are free, do not count toward limit)
    const imageHash = crypto
      .createHash('sha256')
      .update(image.split(',')[1] || image)
      .digest('hex');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: cacheRow } = await sb
      .from('ai_scans_log')
      .select('result_json')
      .eq('user_id', userId)
      .eq('image_hash', imageHash)
      .not('result_json', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cacheRow?.result_json) {
      const { count: usedNow } = await sb
        .from('ai_scans_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since);
      const used = usedNow ?? 0;
      return res.json({
        result: cacheRow.result_json,
        cached: true,
        tier,
        used,
        limit,
        remaining: Math.max(0, limit - used),
      });
    }

    // Atomic slot claim — inserts placeholder row inside per-user advisory lock.
    const { data: claim, error: claimErr } = await sb
      .rpc('claim_ai_scan_slot', { p_limit: limit })
      .single();

    if (claimErr || !claim) {
      console.error('[ai-scan] claim failed:', claimErr?.message);
      return res.status(500).json({ error: 'AI scan failed. Please try again.' });
    }

    const claimRow = claim as { allowed: boolean; used: number; scan_id: string | null };
    if (!claimRow.allowed) {
      const message = tier === 'pro'
        ? `You've hit today's safety cap of ${limit} AI scans. Limits reset in 24 hours.`
        : `You've used all ${limit} free AI scans for today. Upgrade to Pro for unlimited scans, or come back tomorrow.`;
      return res.status(429).json({
        error: message,
        tier,
        used: claimRow.used,
        limit,
        remaining: 0,
      });
    }

    const scanId = claimRow.scan_id!;
    let result;
    try {
      result = await callOpenAIVision(image, context ?? '');
    } catch (err) {
      // Release the reserved slot on failure so user isn't charged a scan
      await sb.from('ai_scans_log').delete().eq('id', scanId);
      throw err;
    }

    const { error: updateErr } = await sb
      .from('ai_scans_log')
      .update({ image_hash: imageHash, result_json: result })
      .eq('id', scanId);
    if (updateErr) console.error('[ai-scan] result persist failed:', updateErr.message);

    res.json({
      result,
      cached: false,
      tier,
      used: claimRow.used,
      limit,
      remaining: Math.max(0, limit - claimRow.used),
    });
  } catch (err: any) {
    console.error('[ai-scan] error:', err?.message || err);
    res.status(500).json({ error: 'AI scan failed. Please try again.' });
  }
});

// =====================================================================
// Admin-only grant surface
// ---------------------------------------------------------------------
// The ONLY way Pro/boost state is written. Service-role backed (bypasses
// the escalation triggers). Gated behind an admin-role check so there is
// no self-serve path — this exists for testing + customer support, and is
// where the Stripe webhook will plug in next phase.
// =====================================================================

async function requireAdmin(
  req: express.Request,
  res: express.Response,
): Promise<{ userId: string } | null> {
  if (!hasServiceRole()) {
    res.status(503).json({ error: 'Grant service is not configured.' });
    return null;
  }
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthenticated' });
    return null;
  }
  const sb = supabaseForUser(auth.slice(7));
  const { data: userData } = await sb.auth.getUser();
  if (!userData?.user) {
    res.status(401).json({ error: 'unauthenticated' });
    return null;
  }
  const { data: profile } = await sb
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return { userId: userData.user.id };
}

const VALID_TARGET_KINDS: BoostTargetKind[] = ['event', 'wanted', 'find', 'listing'];

app.post('/api/admin/pro', async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const { userId, action } = req.body as { userId?: string; action?: 'grant' | 'revoke' };
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required.' });
    }
    const result = action === 'revoke' ? await revokePro(userId) : await grantPro(userId);
    if (!result.ok) return res.status(500).json({ error: result.error });
    return res.json(result.data);
  } catch (err: any) {
    console.error('[admin/pro]', err?.message || err);
    return res.status(500).json({ error: 'Grant failed.' });
  }
});

// Founding Partner grant/revoke for a seller (kind 'user') or a business
// (kind 'business'). Admin-gated; writes go through the trusted grant module.
app.post('/api/admin/founding-partner', async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const { kind, id, action } = req.body as {
      kind?: 'user' | 'business';
      id?: string;
      action?: 'grant' | 'revoke';
    };
    if (kind !== 'user' && kind !== 'business') {
      return res.status(400).json({ error: "kind must be 'user' or 'business'." });
    }
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id is required.' });
    }
    if (action !== 'grant' && action !== 'revoke') {
      return res.status(400).json({ error: "action must be 'grant' or 'revoke'." });
    }
    const revoke = action === 'revoke';
    let result;
    if (kind === 'business') {
      result = revoke
        ? await revokeBusinessFoundingPartner(id)
        : await grantBusinessFoundingPartner(id);
    } else {
      result = revoke ? await revokeFoundingPartner(id) : await grantFoundingPartner(id);
    }
    if (!result.ok) return res.status(500).json({ error: result.error });
    return res.json(result.data);
  } catch (err: any) {
    console.error('[admin/founding-partner]', err?.message || err);
    return res.status(500).json({ error: 'Founding Partner grant failed.' });
  }
});

app.post('/api/admin/boost', async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const { targetKind, targetId, boostType, action } = req.body as {
      targetKind?: BoostTargetKind;
      targetId?: string;
      boostType?: 'paid' | 'pro';
      action?: 'apply' | 'remove';
    };
    if (!targetKind || !VALID_TARGET_KINDS.includes(targetKind)) {
      return res.status(400).json({ error: 'Valid targetKind is required.' });
    }
    if (!targetId || typeof targetId !== 'string') {
      return res.status(400).json({ error: 'targetId is required.' });
    }
    const result =
      action === 'remove'
        ? await removeBoost({ targetKind, targetId })
        : await applyBoost({ targetKind, targetId, boostType });
    if (!result.ok) return res.status(500).json({ error: result.error });
    return res.json(result.data);
  } catch (err: any) {
    console.error('[admin/boost]', err?.message || err);
    return res.status(500).json({ error: 'Boost grant failed.' });
  }
});

// =====================================================================
// Blog / SEO content engine (admin-only, AI-assisted)
// ---------------------------------------------------------------------
// Two surfaces, both gated behind requireAdmin (profiles.role='admin'):
//   * /api/blog/generate → calls the model to draft a full article as JSON.
//     Returns a draft ONLY; nothing is persisted. The OpenAI key never
//     leaves the server.
//   * /api/blog/save → writes a draft/published row via the service-role
//     client (bypasses RLS; the blog_posts table has no end-user write
//     policy). Upserts by slug so re-saving edits an existing post.
// =====================================================================
const BLOG_CATEGORY_SLUGS = [
  'estate-sales', 'garage-sales', 'flea-markets', 'auctions', 'collectibles',
  'hot-wheels', 'vintage-toys', 'reselling', 'treasure-hunting', 'event-hosting',
];

const BLOG_SYSTEM_PROMPT = `You are an expert SEO content writer for TreasureTrail, an app for finding estate sales, garage sales, flea markets, auctions, and collectibles. You write helpful, accurate, genuinely useful articles for treasure hunters and resellers, with a primary geographic focus on California's Central Valley (Madera, Fresno, Kings, Tulare, and Kern counties) when a location is provided.

Write in a warm, practical, expert tone. Use real, actionable advice — no fluff, no keyword stuffing. Target ~900-1300 words. Use markdown for the body (## and ### headings, short paragraphs, bullet lists). Naturally encourage readers to use TreasureTrail to find local events, but do not be salesy.

Return a SINGLE JSON object matching this schema exactly. No prose, no markdown fences:
{
  "title": string,            // compelling, specific H1 (<= 65 chars ideal)
  "slug": string,             // url-safe kebab-case, lowercase, no stop-word filler
  "seo_title": string,        // <= 60 chars, includes primary keyword
  "meta_description": string, // 140-160 chars, compelling, includes location if given
  "excerpt": string,          // 1-2 sentence summary for the article card
  "body_md": string,          // the full article in markdown (## headings, lists)
  "tags": string[],           // 4-8 lowercase topical tags
  "faq": [ { "q": string, "a": string } ]  // 3-5 relevant Q&As
}`;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

app.post('/api/blog/generate', async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const { topic, category, county, city } = req.body as {
      topic?: string; category?: string; county?: string; city?: string;
    };
    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
      return res.status(400).json({ error: 'A topic is required.' });
    }
    const cat = category && BLOG_CATEGORY_SLUGS.includes(category) ? category : 'treasure-hunting';
    const locParts = [city, county].filter(Boolean).join(', ');
    const userPrompt =
      `Topic: ${topic.trim()}\n` +
      `Category (slug): ${cat}\n` +
      (locParts ? `Location focus: ${locParts}, California Central Valley\n` : '') +
      `Write the article now as the JSON object.`;

    const resp = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_completion_tokens: 3500,
      messages: [
        { role: 'system', content: BLOG_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });
    const raw = resp.choices[0]?.message?.content ?? '{}';
    let draft: any;
    try {
      draft = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Model returned malformed JSON. Try again.' });
    }
    // Normalize + guarantee a valid slug and category.
    draft.slug = slugify(draft.slug || draft.title || topic);
    draft.category = cat;
    draft.county = county || null;
    draft.city = city || null;
    if (!Array.isArray(draft.tags)) draft.tags = [];
    if (!Array.isArray(draft.faq)) draft.faq = [];
    const words = String(draft.body_md || '').trim().split(/\s+/).filter(Boolean).length;
    draft.read_minutes = Math.max(1, Math.round(words / 200));
    return res.json({ draft });
  } catch (err: any) {
    console.error('[blog/generate]', err?.message || err);
    return res.status(500).json({ error: 'Article generation failed. Please try again.' });
  }
});

app.post('/api/blog/save', async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    if (!hasServiceRole()) {
      return res.status(503).json({ error: 'Blog service is not configured.' });
    }
    const p = (req.body?.post ?? {}) as Record<string, any>;
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'title is required.' });
    const category = BLOG_CATEGORY_SLUGS.includes(p.category) ? p.category : 'treasure-hunting';
    const status = p.status === 'published' ? 'published' : 'draft';
    const slug = slugify(p.slug || title);
    if (!slug) return res.status(400).json({ error: 'A valid slug is required.' });

    const row: Record<string, any> = {
      slug,
      title,
      seo_title: p.seo_title ?? null,
      meta_description: p.meta_description ?? null,
      excerpt: p.excerpt ?? null,
      body_md: typeof p.body_md === 'string' ? p.body_md : '',
      category,
      tags: Array.isArray(p.tags) ? p.tags : [],
      cover_image_url: p.cover_image_url ?? null,
      cover_thumb_url: p.cover_thumb_url ?? null,
      county: p.county ?? null,
      city: p.city ?? null,
      faq: Array.isArray(p.faq) ? p.faq : [],
      author: typeof p.author === 'string' && p.author.trim() ? p.author.trim() : 'TreasureTrail',
      read_minutes: typeof p.read_minutes === 'number' ? p.read_minutes : null,
      status,
      published_at: status === 'published' ? (p.published_at || new Date().toISOString()) : null,
    };

    const sb = getServiceClient();
    const { data, error } = await sb
      .from('blog_posts')
      .upsert(row, { onConflict: 'slug' })
      .select('id, slug, status')
      .maybeSingle();
    if (error) {
      console.error('[blog/save] db error:', error.message);
      return res.status(500).json({ error: error.message });
    }
    return res.json({ post: data });
  } catch (err: any) {
    console.error('[blog/save]', err?.message || err);
    return res.status(500).json({ error: 'Saving the article failed.' });
  }
});

// =====================================================================
// Pro included boost
// ---------------------------------------------------------------------
// A Pro member redeems one of their INCLUDED boosts (Pro advertises
// "unlimited event & live-stream boosts"). No Apple purchase is involved —
// so the server is the sole authority that the caller is actually Pro. We
// re-read the tier from the DB (never trust the client) and gate ownership
// exactly like the paid path before applying a 'pro'-type boost.
// =====================================================================
app.post('/api/boost/pro', async (req, res) => {
  try {
    if (!hasServiceRole()) {
      return res.status(503).json({ error: 'Boosting is not configured.' });
    }
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });
    const userId = userData.user.id;

    const { targetKind, targetId } = req.body as {
      targetKind?: BoostTargetKind;
      targetId?: string;
    };
    if (!targetKind || !VALID_TARGET_KINDS.includes(targetKind)) {
      return res.status(400).json({ error: 'Valid targetKind is required.' });
    }
    if (!targetId || typeof targetId !== 'string') {
      return res.status(400).json({ error: 'targetId is required.' });
    }

    // Server-side entitlement check — the client claiming Pro is not enough.
    const { data: profile } = await sb
      .from('profiles')
      .select('membership_tier, pro_member')
      .eq('id', userId)
      .maybeSingle();
    const isPro = profile?.membership_tier === 'pro' || profile?.pro_member === true;
    if (!isPro) {
      return res
        .status(403)
        .json({ error: 'Event Boosts are included with Pro. Upgrade to Pro to boost for free.' });
    }

    // Ownership gate — service-role writes bypass RLS, so a member must not be
    // able to boost someone else's content.
    const own = await verifyBoostOwnership({ userId, targetKind, targetId });
    if (!own.ok) return res.status(500).json({ error: own.error ?? 'Ownership check failed.' });
    if (!own.found) return res.status(404).json({ error: 'That item no longer exists.' });
    if (!own.owned) {
      return res.status(403).json({ error: 'You can only boost your own items.' });
    }

    const result = await applyBoost({ targetKind, targetId, boostType: 'pro' });
    if (!result.ok) return res.status(500).json({ error: result.error });
    return res.json({ ok: true, targetId });
  } catch (err: any) {
    console.error('[boost/pro]', err?.message || err);
    return res.status(500).json({ error: 'Boost could not be applied.' });
  }
});

// =====================================================================
// Go-live push fan-out
// ---------------------------------------------------------------------
// Fired by viewer surfaces right after the in-app `notify_followers_go_live`
// RPC, so native push is tied to the SAME go-live event. Any authenticated
// user may call it; the DB-side atomic claim + eligibility gate in
// sendGoLivePush() is the real authority (truthful, once-only, followers-only),
// exactly like the in-app RPC. No-ops quietly when push isn't configured.
// =====================================================================
app.post('/api/push/go-live', async (req, res) => {
  try {
    if (!hasPush()) return res.json({ sent: 0, claimed: false, configured: false });
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const { eventId } = req.body as { eventId?: string };
    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({ error: 'eventId is required.' });
    }
    const result = await sendGoLivePush(eventId);
    return res.json({ ...result, configured: true });
  } catch (err: any) {
    console.error('[push/go-live]', err?.message || err);
    return res.status(500).json({ error: 'push failed' });
  }
});

// =====================================================================
// Transactional notification push fan-out
// ---------------------------------------------------------------------
// Fired best-effort by the client right after a transactional in-app
// notification is created (new message, follow, listing save, wanted-post
// response). The server claims `notifications.pushed_at` atomically and fans
// the push out to the recipient's devices, honouring their push preference —
// the DB claim is the once-only authority, exactly like the go-live push.
// The actor is always the verified caller; a caller can only push a
// notification they authored. No-ops quietly when push isn't configured.
// =====================================================================
app.post('/api/push/notify', async (req, res) => {
  try {
    if (!hasPush()) return res.json({ sent: 0, claimed: false, configured: false });
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const { type, recipientId, relatedItemId } = req.body as {
      type?: string;
      recipientId?: string | null;
      relatedItemId?: string | null;
    };
    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: 'type is required.' });
    }
    const result = await sendNotificationPush({
      actorId: userData.user.id,
      recipientId: typeof recipientId === 'string' ? recipientId : null,
      type,
      relatedItemId: typeof relatedItemId === 'string' ? relatedItemId : null,
    });
    return res.json({ ...result, configured: true });
  } catch (err: any) {
    console.error('[push/notify]', err?.message || err);
    return res.status(500).json({ error: 'push failed' });
  }
});

// =====================================================================
// Permanent account deletion (Apple Guideline 5.1.1(v))
// ---------------------------------------------------------------------
// A signed-in user deletes their OWN account. We verify the caller's JWT,
// then use the service-role admin API to delete the auth user. Every app
// table referencing auth.users(id) ON DELETE CASCADE is wiped by the DB,
// so the account and its associated data are removed together. There is no
// way to delete another user's account here — the id always comes from the
// verified token, never the request body.
// =====================================================================
app.post('/api/account/delete', async (req, res) => {
  try {
    if (!hasServiceRole()) {
      return res.status(503).json({ error: 'Account deletion is not configured.' });
    }
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const result = await deleteUserAccount(userData.user.id);
    if (!result.ok) {
      console.error('[account/delete] failed:', result.error);
      return res.status(500).json({ error: 'Account deletion failed. Please try again.' });
    }
    return res.json({ deleted: true });
  } catch (err: any) {
    console.error('[account/delete]', err?.message || err);
    return res.status(500).json({ error: 'Account deletion failed. Please try again.' });
  }
});

// =====================================================================
// Apple In-App Purchase (RevenueCat)
// ---------------------------------------------------------------------
// Three surfaces, all of which make paid state authoritative server-side via
// the same trusted grant module — the client never writes paid columns:
//   * POST /api/iap/webhook       RevenueCat -> grant/revoke Pro (source of
//                                 truth for renewals & expirations).
//   * POST /api/iap/sync          signed-in user reconciles their own Pro
//                                 entitlement with RevenueCat (post-purchase /
//                                 restore / self-heal).
//   * POST /api/iap/boost/confirm signed-in user redeems a purchased boost; the
//                                 server verifies the transaction with
//                                 RevenueCat and claims it exactly once.
// =====================================================================

// Webhook: authenticated by the shared secret configured in the RevenueCat
// dashboard. Pro grants are idempotent, so duplicate deliveries are harmless;
// we also dedupe by event id. A failed grant returns 500 so RevenueCat retries.
app.post('/api/iap/webhook', async (req, res) => {
  try {
    if (!hasServiceRole()) {
      return res.status(503).json({ error: 'Grant service is not configured.' });
    }
    if (!verifyWebhookAuth(req.headers.authorization)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const event = (req.body?.event ?? {}) as RevenueCatEvent;
    const c = classifyWebhookEvent(event);
    if (c.action === 'ignore' || !c.appUserId) {
      return res.json({ ok: true, ignored: true });
    }
    if (c.eventId && (await webhookEventSeen(c.eventId))) {
      return res.json({ ok: true, duplicate: true });
    }
    const result =
      c.action === 'grant' ? await grantPro(c.appUserId) : await revokePro(c.appUserId);
    if (!result.ok) {
      console.error('[iap/webhook] grant failed:', result.error);
      return res.status(500).json({ error: 'grant failed' });
    }
    if (c.eventId) {
      await recordWebhookEvent(c.eventId, {
        userId: c.appUserId,
        productId: c.productId,
        eventType: c.eventType,
      });
    }
    return res.json({ ok: true, action: c.action });
  } catch (err: any) {
    console.error('[iap/webhook]', err?.message || err);
    return res.status(500).json({ error: 'webhook failed' });
  }
});

// Sync: the caller's own JWT identifies the user; we read their RevenueCat
// subscriber record and grant/revoke Pro to match. Never trusts request body.
app.post('/api/iap/sync', async (req, res) => {
  try {
    if (!hasServiceRole() || !hasRevenueCatRest()) {
      return res.status(503).json({ error: 'IAP is not configured.' });
    }
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });
    const userId = userData.user.id;

    const subscriber = await fetchSubscriber(userId);
    if (!subscriber) return res.json({ pro: false, synced: false });

    const pro = isProActive(subscriber);
    const result = pro ? await grantPro(userId) : await revokePro(userId);
    if (!result.ok) return res.status(500).json({ error: result.error });
    return res.json({ pro, synced: true });
  } catch (err: any) {
    console.error('[iap/sync]', err?.message || err);
    return res.status(500).json({ error: 'sync failed' });
  }
});

// Boost confirm: redeems a purchased Event Boost against a specific item. The
// server fetches the buyer's verified boost transactions from RevenueCat and
// claims one atomically (UNIQUE rc_transaction_id) so a single purchase is
// applied exactly once. If applyBoost fails the claim is released for retry.
app.post('/api/iap/boost/confirm', async (req, res) => {
  try {
    if (!hasServiceRole() || !hasRevenueCatRest()) {
      return res.status(503).json({ error: 'IAP is not configured.' });
    }
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });
    const userId = userData.user.id;

    const { targetKind, targetId } = req.body as {
      targetKind?: BoostTargetKind;
      targetId?: string;
    };
    if (!targetKind || !VALID_TARGET_KINDS.includes(targetKind)) {
      return res.status(400).json({ error: 'Valid targetKind is required.' });
    }
    if (!targetId || typeof targetId !== 'string') {
      return res.status(400).json({ error: 'targetId is required.' });
    }

    // Ownership gate FIRST — service-role writes bypass RLS, so a buyer must
    // not be able to boost someone else's content (and we avoid burning a
    // purchase against a missing/foreign target).
    const own = await verifyBoostOwnership({ userId, targetKind, targetId });
    if (!own.ok) return res.status(500).json({ error: own.error ?? 'Ownership check failed.' });
    if (!own.found) return res.status(404).json({ error: 'That item no longer exists.' });
    if (!own.owned) {
      return res.status(403).json({ error: 'You can only boost your own items.' });
    }

    const subscriber = await fetchSubscriber(userId);
    const txnIds = subscriber ? boostTransactionIds(subscriber) : [];
    if (!txnIds.length) {
      return res
        .status(409)
        .json({ error: 'No boost purchase found yet. Please try again in a moment.' });
    }

    let claimedTxn: string | null = null;
    for (const txnId of txnIds) {
      const claim = await claimBoostTransaction({ userId, txnId, targetKind, targetId });
      // A DB error is operational, not "already redeemed" — surface it as 500
      // rather than masking it as a used boost.
      if (claim.error) {
        return res.status(500).json({ error: 'Could not record your boost. Please try again.' });
      }
      if (claim.claimed) {
        claimedTxn = txnId;
        break;
      }
    }
    if (!claimedTxn) {
      return res
        .status(409)
        .json({ error: 'This boost has already been used on another item.' });
    }

    const result = await applyBoost({ targetKind, targetId, boostType: 'paid' });
    if (!result.ok) {
      await releaseBoostTransaction(claimedTxn);
      return res.status(500).json({ error: result.error });
    }
    return res.json({ ok: true, targetId });
  } catch (err: any) {
    console.error('[iap/boost/confirm]', err?.message || err);
    return res.status(500).json({ error: 'Boost could not be applied.' });
  }
});

// =====================================================================
// AI Wanted Wizard (Phase 7) — category detection + question generation
// ---------------------------------------------------------------------
// These power the no-results "Wanted Request" wizard. The OpenAI key stays
// server-side; the client calls them via apiUrl() and ALWAYS has a
// deterministic fallback (rule-based inference / the static question config),
// so a slow or failing AI can never block request creation. Output is
// validated/normalized to the client's category enum + question schema, calls
// are time-boxed, and common terms are cached in-memory to bound cost/latency.
// On any failure these return `{ fallback: true }` (HTTP 200) so the client
// quietly uses its local path.
// =====================================================================
const WANTED_CATEGORIES = [
  'collectibles', 'furniture', 'electronics', 'vintage', 'cards', 'jewelry',
  'art', 'fashion', 'toys', 'tools', 'books', 'music', 'sports', 'home', 'other',
] as const;
type WantedCategoryServer = (typeof WANTED_CATEGORIES)[number];
const WANTED_CATEGORY_SET = new Set<string>(WANTED_CATEGORIES);

function normalizeWantedCategory(raw: unknown): WantedCategoryServer | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return WANTED_CATEGORY_SET.has(v) ? (v as WantedCategoryServer) : null;
}

// Stop waiting on the AI after `ms` and let the caller fall back. The request
// may keep running on OpenAI's side, but the user is never blocked on it.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ai-timeout')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function callOpenAIJSON(system: string, user: string, maxTokens: number, timeoutMs: number) {
  const resp = await withTimeout(
    openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    timeoutMs,
  );
  const raw = resp.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw);
}

// Small in-memory TTL cache for common terms. Resets on restart — that's fine,
// it only shaves repeat cost/latency and is never a source of truth.
const aiWantedCache = new Map<string, { value: unknown; expires: number }>();
const AI_WANTED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const AI_WANTED_CACHE_MAX = 500;
function aiCacheGet(key: string): any | null {
  const hit = aiWantedCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) { aiWantedCache.delete(key); return null; }
  return hit.value;
}
function aiCacheSet(key: string, value: unknown) {
  if (aiWantedCache.size >= AI_WANTED_CACHE_MAX) {
    const oldest = aiWantedCache.keys().next().value;
    if (oldest !== undefined) aiWantedCache.delete(oldest);
  }
  aiWantedCache.set(key, { value, expires: Date.now() + AI_WANTED_CACHE_TTL_MS });
}

const WANTED_CATEGORY_PROMPT = `You classify a shopper's free-text "wanted" search term into exactly ONE marketplace category.
Return a SINGLE JSON object, no prose or markdown: {"category": <category>, "confidence": <number 0..1>}
category MUST be one of: collectibles, furniture, electronics, vintage, cards, jewelry, art, fashion, toys, tools, books, music, sports, home, other.
confidence is your certainty from 0 (no idea) to 1 (certain). Use "other" with a low confidence when nothing fits.
Hints: "cards" = trading/sports/TCG cards; "music" = instruments, vinyl/records, audio gear; "home" = kitchen & household appliances/goods; "vintage" only when the term itself emphasizes vintage/retro and no specific category fits better.`;

const WANTED_QUESTIONS_PROMPT = `You design a SHORT set of smart follow-up questions for a second-hand marketplace "wanted request" wizard, tailored to the shopper's item and category. The answers help sellers know exactly what the buyer wants.
Return a SINGLE JSON object, no prose or markdown: {"questions": WizardQuestion[]}
Rules:
- 3 to 5 questions, ordered most-to-least important. Keep them quick to answer.
- Each WizardQuestion: {"id": string (snake_case, unique), "kind": "text"|"number"|"single", "prompt": string (the step heading, phrased as a question), "summary": string (2-3 word label used when folding the answer into a description, e.g. "Condition"), "label"?: string, "placeholder"?: string, "options"?: [{"value": string (snake_case), "label": string}], "optional"?: boolean, "maps"?: "budget", "inputMode"?: "decimal"|"text"}
- Use "single" (with 3-6 options) for choices, "text" for free-form, "number" for amounts.
- Include exactly ONE budget question: {"id":"budget","kind":"number","summary":"Budget","maps":"budget","inputMode":"decimal","optional":true,...}.
- Make the LAST question a free-form catch-all with "id":"details" and "summary":"Details".
- Every question must be optional (the user may skip it). Be specific to the item, not generic.`;

app.post('/api/wanted/infer-category', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const { term } = req.body as { term?: string };
    const clean = (typeof term === 'string' ? term : '').trim().slice(0, 120);
    if (clean.length < 2) return res.json({ fallback: true });

    const key = `cat:${clean.toLowerCase()}`;
    const cached = aiCacheGet(key);
    if (cached) return res.json({ ...cached, cached: true });

    const out = await callOpenAIJSON(WANTED_CATEGORY_PROMPT, clean, 60, 7000);
    const category = normalizeWantedCategory(out?.category);
    const confidence = Number(out?.confidence);
    if (!category || !Number.isFinite(confidence)) return res.json({ fallback: true });

    const result = { category, confidence: Math.max(0, Math.min(1, confidence)), source: 'ai' as const };
    aiCacheSet(key, result);
    return res.json(result);
  } catch (err: any) {
    console.error('[wanted/infer-category]', err?.message || err);
    return res.json({ fallback: true });
  }
});

// Validate/normalize the model's question array to the client's WizardQuestion
// schema. Anything malformed is dropped; an empty result => null (client uses
// the static set). Every question is forced optional so AI output can never
// block submission.
function sanitizeServerQuestions(raw: unknown): any[] | null {
  if (!Array.isArray(raw)) return null;
  const kinds = new Set(['text', 'number', 'single']);
  const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of raw) {
    if (out.length >= 5) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' ? slug(r.id) : '';
    let kind = typeof r.kind === 'string' ? r.kind.trim().toLowerCase() : '';
    const prompt = typeof r.prompt === 'string' ? r.prompt.trim().slice(0, 160) : '';
    const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 40) : '';
    if (!id || !kinds.has(kind) || !prompt || !summary || seen.has(id)) continue;

    const q: Record<string, unknown> = { id, kind, prompt, summary, optional: true };
    if (typeof r.label === 'string' && r.label.trim()) q.label = r.label.trim().slice(0, 60);
    if (typeof r.placeholder === 'string' && r.placeholder.trim()) q.placeholder = r.placeholder.trim().slice(0, 80);
    if (r.maps === 'budget') { q.maps = 'budget'; kind = 'number'; q.kind = 'number'; q.inputMode = 'decimal'; }
    else if (r.inputMode === 'decimal' || r.inputMode === 'text') q.inputMode = r.inputMode;

    if (kind === 'single') {
      const rawOpts = Array.isArray(r.options) ? r.options : [];
      const options: { value: string; label: string }[] = [];
      const optSeen = new Set<string>();
      for (const o of rawOpts) {
        if (!o || typeof o !== 'object') continue;
        const oo = o as Record<string, unknown>;
        const label = typeof oo.label === 'string' ? oo.label.trim().slice(0, 40) : '';
        let value = typeof oo.value === 'string' ? slug(oo.value) : '';
        if (!value && label) value = slug(label);
        if (!label || !value || optSeen.has(value)) continue;
        optSeen.add(value);
        options.push({ value, label });
        if (options.length >= 6) break;
      }
      if (options.length < 2) continue; // a single-choice needs real options
      q.options = options;
    }

    seen.add(id);
    out.push(q);
  }
  return out.length >= 1 ? out : null;
}

app.post('/api/wanted/questions', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const { term, category } = req.body as { term?: string; category?: string };
    const cleanTerm = (typeof term === 'string' ? term : '').trim().slice(0, 120);
    const cat = normalizeWantedCategory(category) ?? 'other';

    const key = `q:${cat}:${cleanTerm.toLowerCase()}`;
    const cached = aiCacheGet(key);
    if (cached) return res.json({ ...cached, cached: true });

    const userMsg = `Item the shopper is looking for: ${cleanTerm || '(unspecified)'}\nCategory: ${cat}`;
    const out = await callOpenAIJSON(WANTED_QUESTIONS_PROMPT, userMsg, 900, 8000);
    const questions = sanitizeServerQuestions(out?.questions);
    if (!questions) return res.json({ fallback: true });

    const result = { questions, source: 'ai' as const };
    aiCacheSet(key, result);
    return res.json(result);
  } catch (err: any) {
    console.error('[wanted/questions]', err?.message || err);
    return res.json({ fallback: true });
  }
});

// =====================================================================
// Smart Screenshot Import — OCR + AI extraction from a marketplace/auction
// ---------------------------------------------------------------------
// The client uploads a screenshot of a listing from any marketplace/auction
// site (eBay, Facebook Marketplace, Craigslist, OfferUp, Walmart, HiBid,
// Whatnot, EstateSales.net, …). We read all visible text and analyze the
// photo with the vision model, returning a structured draft the user reviews
// and edits before publishing. This NEVER auto-publishes — it is a draft tool.

const IMPORT_LISTING_TYPES = ['Auction', 'Marketplace', 'Estate Sale', 'Yard Sale', 'Swap Meet', 'Other'];
const IMPORT_CATEGORIES = ['Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques', 'Art', 'Jewelry', 'Watches', 'Toys', 'Tools', 'Clothing', 'Home & Garden', 'Sports & Outdoors', 'Other'];

const SMART_IMPORT_PROMPT = `You are an expert reseller assistant. You are given a SCREENSHOT of a single product listing from a marketplace or auction website or app (eBay, Facebook Marketplace, Craigslist, OfferUp, Walmart Marketplace, HiBid, Whatnot, EstateSales.net, yard-sale and estate-sale listings, etc.).

Read ALL visible text in the image (OCR) and analyze the photo, then extract the listing into a SINGLE JSON object matching the schema EXACTLY. No prose, no markdown fences.

Rules:
- If a value is unknown or not visible, use an empty string "" (or 0 for confidenceScore). NEVER invent data.
- Detect whether the source is an AUCTION (bids, lot numbers, "current bid", countdown timers) or a fixed-price MARKETPLACE listing, and set listingType accordingly.
- listingType MUST be exactly one of: ${IMPORT_LISTING_TYPES.join(', ')}.
- category MUST be the closest match from: ${IMPORT_CATEGORIES.join(', ')}.
- marketplaceSource is the website/app the screenshot came from (e.g. "eBay", "Facebook Marketplace", "HiBid"). Infer from branding/layout if it is not written out.
- price is the asking / buy-now price; currentBid is the current auction bid. Output digits and a decimal point only — no currency symbols, no commas.
- description: a concise, clean, factual resale description (1-3 sentences). Do not copy seller fluff, phone numbers, or contact info.
- condition: estimate from the text/photo if possible (New, Like New, Good, Fair, For Parts), else "".
- confidenceScore: integer 0-100 for how confident you are in the overall extraction.

JSON schema:
{
  "title": "",
  "description": "",
  "category": "",
  "subcategory": "",
  "brand": "",
  "condition": "",
  "price": "",
  "currentBid": "",
  "auctionEndDate": "",
  "lotNumber": "",
  "marketplaceSource": "",
  "sellerName": "",
  "location": "",
  "listingType": "",
  "confidenceScore": 0
}`;

async function callOpenAISmartImport(dataUrl: string) {
  const resp = await withTimeout(
    openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_completion_tokens: 900,
      messages: [
        { role: 'system', content: SMART_IMPORT_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract this marketplace/auction screenshot into the JSON schema.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
    25000,
  );
  const raw = resp.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw);
}

function clampImportStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'unknown' || s.toLowerCase() === 'n/a') return '';
  return s.slice(0, max);
}

function sanitizeImportedListing(out: any) {
  if (!out || typeof out !== 'object') return null;
  const ltRaw = clampImportStr(out.listingType, 40);
  const listingType = IMPORT_LISTING_TYPES.includes(ltRaw) ? ltRaw : 'Marketplace';
  let conf = Number(out.confidenceScore);
  if (!Number.isFinite(conf)) conf = 0;
  conf = Math.max(0, Math.min(100, Math.round(conf)));
  const cleanNum = (v: unknown) => clampImportStr(v, 24).replace(/[^0-9.]/g, '').slice(0, 24);
  const listing = {
    title: clampImportStr(out.title, 140),
    description: clampImportStr(out.description, 1200),
    category: clampImportStr(out.category, 60),
    subcategory: clampImportStr(out.subcategory, 60),
    brand: clampImportStr(out.brand, 80),
    condition: clampImportStr(out.condition, 40),
    price: cleanNum(out.price),
    currentBid: cleanNum(out.currentBid),
    auctionEndDate: clampImportStr(out.auctionEndDate, 60),
    lotNumber: clampImportStr(out.lotNumber, 40),
    marketplaceSource: clampImportStr(out.marketplaceSource, 80),
    sellerName: clampImportStr(out.sellerName, 80),
    location: clampImportStr(out.location, 120),
    listingType,
    confidenceScore: conf,
  };
  // Require at least a title or description to count as a usable extraction.
  if (!listing.title && !listing.description) return null;
  return listing;
}

app.post('/api/import/screenshot', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const { imageDataUrl } = req.body as { imageDataUrl?: string };
    if (typeof imageDataUrl !== 'string' || !/^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,/i.test(imageDataUrl)) {
      return res.status(400).json({ error: 'invalid_image' });
    }
    if (imageDataUrl.length > 11_000_000) return res.status(413).json({ error: 'image_too_large' });

    const out = await callOpenAISmartImport(imageDataUrl);
    const listing = sanitizeImportedListing(out);
    if (!listing) return res.json({ fallback: true });
    return res.json({ data: listing, source: 'ai' });
  } catch (err: any) {
    console.error('[import/screenshot]', err?.message || err);
    return res.json({ fallback: true });
  }
});

// =====================================================================
// Event import from URL — paste an event/auction link, extract fields
// ---------------------------------------------------------------------
// Fetches the page server-side, pulls OpenGraph/JSON-LD metadata, and
// uses the LLM to normalize it into the SellerEventForm field shape so a
// user can paste a HiBid/Whatnot/eBay/Facebook/EstateSales link and get
// the form pre-filled instead of typing everything by hand.

const EVENT_CATEGORIES = ['estate_sale', 'yard_sale', 'flea_market', 'auction', 'pop_up', 'collectibles_show', 'other'];
function normalizeEventCategory(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return EVENT_CATEGORIES.includes(s) ? s : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function pickStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.toLowerCase() !== 'null' ? s.slice(0, 2000) : null;
}
function pickHttpUrl(v: unknown): string | null {
  const s = pickStr(v);
  return s && /^https?:\/\//i.test(s) ? s : null;
}

// Block obviously-internal hosts/IPs to limit SSRF. `value` may be a
// hostname ("localhost") or an IP literal (also used to re-check the
// DNS-resolved address). DNS rebinding isn't fully closed, but the
// common private ranges and loopback are rejected.
function isBlockedHost(value: string): boolean {
  const h = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' || h === '') return true;
  if (h === '::1' || h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

function metaContent(html: string, key: string, attr: 'property' | 'name'): string | null {
  const re1 = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["']`, 'i');
  const mm = html.match(re1) || html.match(re2);
  return mm ? decodeEntities(mm[1].trim()) : null;
}

// Validate a single URL before fetching it: only http(s), and neither the
// hostname nor its first resolved address may be a blocked/internal target.
// Throws on rejection. Called for the initial URL AND every redirect hop so a
// public URL can't 30x-redirect into an internal address (SSRF).
async function assertFetchable(target: URL): Promise<void> {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('blocked scheme');
  const host = target.hostname.toLowerCase();
  if (isBlockedHost(host)) throw new Error('blocked host');
  const { address } = await dnsLookup(host);
  if (isBlockedHost(address)) throw new Error('blocked address');
}

async function fetchPageHtml(startUrl: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let current = startUrl;
    for (let hop = 0; hop < 5; hop++) {
      const target = new URL(current);
      await assertFetchable(target); // re-validate scheme/host/IP on EVERY hop
      const resp = await fetch(target, {
        redirect: 'manual', // follow manually so each hop is re-validated
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TreasureTrailBot/1.0; +https://treasuretrail-hunt.com)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) throw new Error('redirect without location');
        current = new URL(loc, target).toString();
        continue;
      }
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const ct = resp.headers.get('content-type') || '';
      if (ct && !/html|xml|text/i.test(ct)) throw new Error('not html');
      const buf = Buffer.from(await resp.arrayBuffer()).subarray(0, 700_000);
      return buf.toString('utf8');
    }
    throw new Error('too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

const EVENT_IMPORT_PROMPT = `You extract structured event data from a web page's metadata and text for a second-hand marketplace (estate sales, auctions, yard sales, live selling shows). Return a SINGLE JSON object, no prose or markdown fences.
Schema:
{
 "title": string|null,
 "description": string|null,
 "category": one of ["estate_sale","yard_sale","flea_market","auction","pop_up","collectibles_show","other"]|null,
 "starts_at": ISO8601 datetime string|null,
 "ends_at": ISO8601 datetime string|null,
 "city": string|null,
 "region": string|null,
 "address": string|null,
 "seller_name": string|null,
 "lot_count": number|null,
 "cover_image_url": string|null
}
Rules:
- Use ONLY information present in the provided evidence. Never invent details. Use null when unknown.
- title: the event/auction name, concise (no site name suffix).
- description: 1-3 plain sentences summarizing what is being sold. No URLs, no marketing fluff.
- category: best fit; online/in-person auctions => "auction"; estate sales => "estate_sale"; if unsure use "other".
- starts_at / ends_at: parse any date/time you find into ISO 8601. Include a timezone offset only if the page states one; otherwise return local wall-clock time with no offset. Null if no date is present.
- region: US state abbreviation (e.g. "TX") when possible, else the state/region name.
- seller_name: the auction company / seller / host name.
- lot_count: number of lots/items if stated, else null.
- cover_image_url: an absolute http(s) image URL found in the evidence (prefer og:image), else null.`;

app.post('/api/events/import', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Please sign in to import events.' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ ok: false, error: 'Please sign in to import events.' });

    const { url } = req.body as { url?: string };
    const raw = (typeof url === 'string' ? url : '').trim();
    let parsed: URL;
    try { parsed = new URL(raw); } catch { return res.status(400).json({ ok: false, error: 'Enter a valid http:// or https:// link.' }); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ ok: false, error: 'Only http and https links are supported.' });
    }
    const host = parsed.hostname.toLowerCase();
    if (isBlockedHost(host)) return res.status(400).json({ ok: false, error: 'That link is not allowed.' });
    try {
      const { address } = await dnsLookup(host);
      if (isBlockedHost(address)) return res.status(400).json({ ok: false, error: 'That link is not allowed.' });
    } catch {
      return res.status(400).json({ ok: false, error: 'Could not resolve that link. Check the URL and try again.' });
    }

    const cacheKey = `evt:${raw.slice(0, 300)}`;
    const cached = aiCacheGet(cacheKey);
    if (cached) return res.json({ ...(cached as object), cached: true });

    // Deterministic platform mapping — must match PLATFORM_META URL patterns
    // on the client so an imported online show passes form validation.
    let event_kind: 'local' | 'online' = 'local';
    let platform: string | null = null;
    let livestream_url: string | null = null;
    if (host.includes('whatnot.com')) { event_kind = 'online'; platform = 'whatnot'; livestream_url = raw; }
    else if (host.includes('poshmark.com') || host.includes('posh.mk')) { event_kind = 'online'; platform = 'poshmark_live'; livestream_url = raw; }
    else if (host.includes('ebay.') && /live/i.test(parsed.pathname + parsed.search)) { event_kind = 'online'; platform = 'ebay_live'; livestream_url = raw; }

    let html = '';
    try { html = await fetchPageHtml(raw, 9000); }
    catch (e: any) { console.warn('[events/import] fetch failed', host, e?.message); }

    // Deterministic meta fallback (works even if the LLM call fails).
    const ogTitle = html ? (metaContent(html, 'og:title', 'property') || metaContent(html, 'twitter:title', 'name')) : null;
    const ogDesc = html ? (metaContent(html, 'og:description', 'property') || metaContent(html, 'description', 'name') || metaContent(html, 'twitter:description', 'name')) : null;
    const ogImage = html ? (metaContent(html, 'og:image', 'property') || metaContent(html, 'twitter:image', 'name')) : null;
    const siteName = html ? metaContent(html, 'og:site_name', 'property') : null;
    const titleTag = html ? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null) : null;

    let data: any = {
      title: ogTitle || (titleTag ? decodeEntities(titleTag) : null),
      description: ogDesc,
      category: null,
      starts_at: null,
      ends_at: null,
      city: null,
      region: null,
      address: null,
      seller_name: null,
      lot_count: null,
      cover_image_url: ogImage && /^https?:\/\//i.test(ogImage) ? ogImage : null,
    };
    let source: 'ai' | 'meta' = 'meta';

    if (html) {
      const ldBlocks: string[] = [];
      const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let mm: RegExpExecArray | null;
      while ((mm = ldRe.exec(html)) && ldBlocks.length < 4) ldBlocks.push(mm[1].trim().slice(0, 3000));
      const visibleText = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3500);
      const evidence = [
        `URL: ${raw}`,
        `Host: ${host}`,
        siteName ? `Site: ${siteName}` : '',
        ogTitle ? `og:title: ${ogTitle}` : (titleTag ? `title: ${decodeEntities(titleTag)}` : ''),
        ogDesc ? `og:description: ${ogDesc}` : '',
        ogImage ? `og:image: ${ogImage}` : '',
        ldBlocks.length ? `JSON-LD:\n${ldBlocks.join('\n')}` : '',
        `Page text:\n${visibleText}`,
      ].filter(Boolean).join('\n');

      try {
        const out = await callOpenAIJSON(EVENT_IMPORT_PROMPT, evidence, 700, 12000);
        if (out && typeof out === 'object') {
          data = {
            title: pickStr(out.title) || data.title,
            description: pickStr(out.description) || data.description,
            category: normalizeEventCategory(out.category),
            starts_at: pickStr(out.starts_at),
            ends_at: pickStr(out.ends_at),
            city: pickStr(out.city),
            region: pickStr(out.region),
            address: pickStr(out.address),
            seller_name: pickStr(out.seller_name),
            lot_count: Number.isFinite(Number(out.lot_count)) && Number(out.lot_count) > 0 ? Math.floor(Number(out.lot_count)) : null,
            cover_image_url: pickHttpUrl(out.cover_image_url) || data.cover_image_url,
          };
          source = 'ai';
        }
      } catch (e: any) {
        console.warn('[events/import] openai failed', e?.message);
      }
    }

    const result = {
      ok: true,
      source,
      data: { ...data, event_kind, platform, livestream_url, event_url: raw, site_name: siteName },
    };
    if (data.title) aiCacheSet(cacheKey, result); // only cache useful extractions
    return res.json(result);
  } catch (err: any) {
    console.error('[events/import]', err?.message || err);
    return res.status(200).json({ ok: false, error: 'Could not import this event. Try a different link or enter details manually.' });
  }
});

// =====================================================================
// Business import (Phase 3) — AI-assisted pre-fill for the create form
// ---------------------------------------------------------------------
// Two extraction paths, mirroring the app's existing AI tools:
//   * POST /api/import/business-card — vision OCR of a business-card photo
//     (mirrors /api/import/screenshot).
//   * POST /api/business/import      — SSRF-protected URL fetch + OG/JSON-LD
//     meta + LLM normalization (mirrors /api/events/import); used for BOTH a
//     website and a Facebook page URL (Facebook usually blocks scraping, so it
//     degrades to meta-only or nothing).
// Both ONLY return a draft the user reviews/edits in the Phase-1 create form —
// a business is never auto-created. Privileged verified/featured fields are
// never produced here. Both consume the user's shared per-user AI scan quota
// (claim_ai_scan_slot) and fail SOFT to manual entry.
// =====================================================================

const BUSINESS_CATEGORIES_SRV = [
  'antique_store', 'thrift_store', 'pawn_shop', 'estate_sale_company',
  'auction_house', 'consignment_store', 'flea_market', 'vintage_store',
];
function normalizeBusinessCategory(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return BUSINESS_CATEGORIES_SRV.includes(s) ? s : null;
}

// Reserve a slot in the shared per-user AI scan quota (same RPC + ai_scans_log
// table used by AI Treasure Scan / smart import). Returns whether the slot was
// granted plus the placeholder row id so a failed AI call can release it.
async function claimAiSlot(
  sb: ReturnType<typeof supabaseForUser>,
  userId: string,
): Promise<{ allowed: boolean; scanId: string | null }> {
  try {
    const { data: profile } = await sb
      .from('profiles')
      .select('membership_tier')
      .eq('id', userId)
      .maybeSingle();
    const tier = profile?.membership_tier === 'pro' ? 'pro' : 'free';
    const limit = tier === 'pro' ? PRO_DAILY_SOFT_CAP : FREE_DAILY_LIMIT;
    const { data: claim, error } = await sb
      .rpc('claim_ai_scan_slot', { p_limit: limit })
      .single();
    if (error || !claim) return { allowed: false, scanId: null };
    const c = claim as { allowed: boolean; scan_id: string | null };
    return { allowed: c.allowed, scanId: c.scan_id };
  } catch {
    return { allowed: false, scanId: null };
  }
}
// Best-effort release of a reserved slot when the AI call fails, so a failed
// extraction isn't charged against the user's daily quota.
async function releaseAiSlot(sb: ReturnType<typeof supabaseForUser>, scanId: string | null) {
  if (!scanId) return;
  try { await sb.from('ai_scans_log').delete().eq('id', scanId); } catch { /* best effort */ }
}

const BUSINESS_CARD_PROMPT = `You read a photo of a BUSINESS CARD (or shop signage / storefront) for a second-hand / antiques / resale business and extract its details into a SINGLE JSON object matching the schema EXACTLY. No prose, no markdown fences.
Read ALL visible text (OCR) and analyze the image.
Schema:
{ "name":"", "description":"", "category":"", "address":"", "city":"", "region":"", "phone":"", "email":"", "website":"", "confidenceScore":0 }
Rules:
- If a value is unknown or not visible, use an empty string "". NEVER invent data.
- category MUST be one of: ${BUSINESS_CATEGORIES_SRV.join(', ')} — choose the closest fit, else "".
- name: the business / shop name.
- description: a concise 1-2 sentence summary if a tagline or services are shown, else "".
- address: street address only. city and region (US state abbreviation when possible) separately.
- phone: digits and standard separators only.
- email: the contact email if present.
- website: a domain or URL if present (no scheme is fine).
- confidenceScore: integer 0-100 for overall extraction confidence.`;

async function callOpenAIBusinessCard(dataUrl: string) {
  const resp = await withTimeout(
    openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_completion_tokens: 600,
      messages: [
        { role: 'system', content: BUSINESS_CARD_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract this business card into the JSON schema.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
    25000,
  );
  const raw = resp.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw);
}

function sanitizeBusinessCard(out: any) {
  if (!out || typeof out !== 'object') return null;
  const card = {
    name: clampImportStr(out.name, 120),
    description: clampImportStr(out.description, 600),
    category: normalizeBusinessCategory(out.category) ?? '',
    address: clampImportStr(out.address, 160),
    city: clampImportStr(out.city, 80),
    region: clampImportStr(out.region, 40),
    phone: clampImportStr(out.phone, 40),
    email: clampImportStr(out.email, 120),
    website: clampImportStr(out.website, 200),
  };
  // Require at least one identifying/contact field to count as usable.
  if (!card.name && !card.phone && !card.website && !card.email && !card.address) return null;
  return card;
}

app.post('/api/import/business-card', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const { imageDataUrl } = req.body as { imageDataUrl?: string };
    if (typeof imageDataUrl !== 'string' || !/^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,/i.test(imageDataUrl)) {
      return res.status(400).json({ error: 'invalid_image' });
    }
    if (imageDataUrl.length > 11_000_000) return res.status(413).json({ error: 'image_too_large' });

    // Consume the shared per-user AI quota. Over limit => soft fallback.
    const slot = await claimAiSlot(sb, userData.user.id);
    if (!slot.allowed) return res.json({ fallback: true, limited: true });

    let out: any;
    try {
      out = await callOpenAIBusinessCard(imageDataUrl);
    } catch (e) {
      await releaseAiSlot(sb, slot.scanId); // don't charge a failed call
      throw e;
    }

    const card = sanitizeBusinessCard(out);
    if (!card) { await releaseAiSlot(sb, slot.scanId); return res.json({ fallback: true }); }
    return res.json({ data: card, source: 'ai' });
  } catch (err: any) {
    console.error('[import/business-card]', err?.message || err);
    return res.json({ fallback: true });
  }
});

// ---------------------------------------------------------------------
// Event screenshot import — vision OCR of a flyer / poster / listing
// screenshot into the SellerEventForm field shape (mirrors
// /api/import/business-card). Returns a draft the user reviews/edits;
// an event is never auto-created. Consumes the shared per-user AI scan
// quota and fails SOFT to manual entry.
// ---------------------------------------------------------------------
function eventScreenshotPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `You read a SCREENSHOT or PHOTO of a flyer/poster/online listing for a sale or auction (estate sale, yard sale, flea market, auction, pop-up, collectibles show) and extract its details into a SINGLE JSON object matching the schema EXACTLY. No prose, no markdown fences.
Read ALL visible text (OCR) and analyze the image. Today's date is ${today}.
Schema:
{ "title":"", "description":"", "category":"", "starts_at":"", "ends_at":"", "address":"", "city":"", "region":"", "confidenceScore":0 }
Rules:
- If a value is unknown or not visible, use an empty string "". NEVER invent data.
- category MUST be one of: ${EVENT_CATEGORIES.join(', ')} — choose the closest fit, else "".
- title: a short event name/headline (e.g. "Estate Sale" or the headline shown).
- description: a concise 1-3 sentence summary of what's being sold or the highlights, if shown, else "".
- starts_at / ends_at: local datetime in EXACT format "YYYY-MM-DDTHH:MM" (24-hour). Use a time only if one is clearly shown; if only a date is shown use "T09:00". If the year is missing, assume the next occurrence on/after today's date. If no date is determinable, "".
- address: street address only. city and region (US state abbreviation when possible) separately.
- confidenceScore: integer 0-100 for overall extraction confidence.`;
}

async function callOpenAIEventScreenshot(dataUrl: string) {
  const resp = await withTimeout(
    openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_completion_tokens: 600,
      messages: [
        { role: 'system', content: eventScreenshotPrompt() },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract this event flyer/listing into the JSON schema.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
    25000,
  );
  const raw = resp.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw);
}

function sanitizeEventScreenshot(out: any) {
  if (!out || typeof out !== 'object') return null;
  const ev = {
    title: clampImportStr(out.title, 120),
    description: clampImportStr(out.description, 2000),
    category: normalizeEventCategory(out.category) ?? '',
    starts_at: clampImportStr(out.starts_at, 40),
    ends_at: clampImportStr(out.ends_at, 40),
    address: clampImportStr(out.address, 160),
    city: clampImportStr(out.city, 80),
    region: clampImportStr(out.region, 40),
  };
  // Require at least one substantive field to count as usable.
  if (!ev.title && !ev.description && !ev.starts_at && !ev.address) return null;
  return ev;
}

app.post('/api/import/event-screenshot', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const { imageDataUrl } = req.body as { imageDataUrl?: string };
    if (typeof imageDataUrl !== 'string' || !/^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,/i.test(imageDataUrl)) {
      return res.status(400).json({ error: 'invalid_image' });
    }
    if (imageDataUrl.length > 11_000_000) return res.status(413).json({ error: 'image_too_large' });

    const slot = await claimAiSlot(sb, userData.user.id);
    if (!slot.allowed) return res.json({ fallback: true, limited: true });

    let out: any;
    try {
      out = await callOpenAIEventScreenshot(imageDataUrl);
    } catch (e) {
      await releaseAiSlot(sb, slot.scanId);
      throw e;
    }

    const ev = sanitizeEventScreenshot(out);
    if (!ev) { await releaseAiSlot(sb, slot.scanId); return res.json({ fallback: true }); }
    return res.json({ data: ev, source: 'ai' });
  } catch (err: any) {
    console.error('[import/event-screenshot]', err?.message || err);
    return res.json({ fallback: true });
  }
});

// ---------------------------------------------------------------------
// Wanted screenshot import — vision OCR of a photo/screenshot of an item
// the user is looking for (another listing, a photo, a catalog page) into
// the WantedForm field shape (mirrors /api/import/business-card). Returns
// a draft the user reviews/edits; a wanted post is never auto-created.
// Consumes the shared per-user AI scan quota and fails SOFT.
// ---------------------------------------------------------------------
const WANTED_SCREENSHOT_PROMPT = `You read a SCREENSHOT or PHOTO of an item that a buyer wants to find (e.g. a product listing from another site, a catalog page, or a photo of an object) and extract a "wanted" request into a SINGLE JSON object matching the schema EXACTLY. No prose, no markdown fences.
Read ALL visible text (OCR) and analyze the image.
Schema:
{ "title":"", "description":"", "category":"", "budget":"", "confidenceScore":0 }
Rules:
- If a value is unknown or not visible, use an empty string "". NEVER invent data.
- category MUST be one of: ${WANTED_CATEGORIES.join(', ')} — choose the closest fit, else "".
- title: a short name of the item the buyer is looking for (brand + model/name when visible).
- description: a concise 1-3 sentence summary of the item's key specifics (condition, era, color, size, edition) that help a seller find a match.
- budget: if a price is clearly shown, the numeric amount as digits only (no currency symbol, no commas), else "". This becomes a suggested maximum budget.
- confidenceScore: integer 0-100 for overall extraction confidence.`;

async function callOpenAIWantedScreenshot(dataUrl: string) {
  const resp = await withTimeout(
    openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_completion_tokens: 600,
      messages: [
        { role: 'system', content: WANTED_SCREENSHOT_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract this wanted item into the JSON schema.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
    25000,
  );
  const raw = resp.choices[0]?.message?.content ?? '{}';
  return JSON.parse(raw);
}

function sanitizeWantedScreenshot(out: any) {
  if (!out || typeof out !== 'object') return null;
  const budgetStr = clampImportStr(out.budget, 20).replace(/[^0-9.]/g, '');
  const w = {
    title: clampImportStr(out.title, 120),
    description: clampImportStr(out.description, 2000),
    category: normalizeWantedCategory(out.category) ?? '',
    budget: budgetStr && Number.isFinite(Number(budgetStr)) ? budgetStr : '',
  };
  // Require at least one substantive field to count as usable.
  if (!w.title && !w.description) return null;
  return w;
}

app.post('/api/import/wanted-screenshot', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthenticated' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ error: 'unauthenticated' });

    const { imageDataUrl } = req.body as { imageDataUrl?: string };
    if (typeof imageDataUrl !== 'string' || !/^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,/i.test(imageDataUrl)) {
      return res.status(400).json({ error: 'invalid_image' });
    }
    if (imageDataUrl.length > 11_000_000) return res.status(413).json({ error: 'image_too_large' });

    const slot = await claimAiSlot(sb, userData.user.id);
    if (!slot.allowed) return res.json({ fallback: true, limited: true });

    let out: any;
    try {
      out = await callOpenAIWantedScreenshot(imageDataUrl);
    } catch (e) {
      await releaseAiSlot(sb, slot.scanId);
      throw e;
    }

    const w = sanitizeWantedScreenshot(out);
    if (!w) { await releaseAiSlot(sb, slot.scanId); return res.json({ fallback: true }); }
    return res.json({ data: w, source: 'ai' });
  } catch (err: any) {
    console.error('[import/wanted-screenshot]', err?.message || err);
    return res.json({ fallback: true });
  }
});

const BUSINESS_IMPORT_PROMPT = `You extract a physical/online retail business's public profile from a web page's metadata and text, for a second-hand / antiques / resale directory. Return a SINGLE JSON object, no prose or markdown fences.
Schema:
{
 "name": string|null,
 "description": string|null,
 "category": one of ["antique_store","thrift_store","pawn_shop","estate_sale_company","auction_house","consignment_store","flea_market","vintage_store"]|null,
 "address": string|null,
 "city": string|null,
 "region": string|null,
 "phone": string|null,
 "website": string|null,
 "hours": string|null,
 "logo_image_url": string|null
}
Rules:
- Use ONLY information present in the provided evidence. Never invent details. Use null when unknown.
- name: the business name, concise (no tagline / no site-name suffix).
- description: 1-2 plain sentences about what they sell. No URLs, no marketing fluff.
- category: best fit from the list; if unsure use null.
- region: US state abbreviation (e.g. "TX") when possible.
- phone: a single primary phone.
- website: the business's own website URL if evident.
- hours: opening hours as a short plain string if stated, else null.
- logo_image_url: an absolute http(s) image URL for the logo/storefront (prefer og:image), else null.`;

app.post('/api/business/import', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Please sign in to import.' });
    const sb = supabaseForUser(auth.slice(7));
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return res.status(401).json({ ok: false, error: 'Please sign in to import.' });

    const { url } = req.body as { url?: string };
    const raw = (typeof url === 'string' ? url : '').trim();
    let parsed: URL;
    try { parsed = new URL(raw); } catch { return res.status(400).json({ ok: false, error: 'Enter a valid http:// or https:// link.' }); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ ok: false, error: 'Only http and https links are supported.' });
    }
    const host = parsed.hostname.toLowerCase();
    if (isBlockedHost(host)) return res.status(400).json({ ok: false, error: 'That link is not allowed.' });
    try {
      const { address } = await dnsLookup(host);
      if (isBlockedHost(address)) return res.status(400).json({ ok: false, error: 'That link is not allowed.' });
    } catch {
      return res.status(400).json({ ok: false, error: 'Could not resolve that link. Check the URL and try again.' });
    }

    const cacheKey = `biz:${raw.slice(0, 300)}`;
    const cached = aiCacheGet(cacheKey);
    if (cached) return res.json({ ...(cached as object), cached: true });

    const isFacebook = /(^|\.)facebook\.com$/i.test(host) || /(^|\.)fb\.com$/i.test(host) || /(^|\.)fb\.me$/i.test(host);

    let html = '';
    try { html = await fetchPageHtml(raw, 9000); }
    catch (e: any) { console.warn('[business/import] fetch failed', host, e?.message); }

    // Deterministic meta fallback (works even if the LLM call fails or is skipped).
    const ogTitle = html ? (metaContent(html, 'og:title', 'property') || metaContent(html, 'twitter:title', 'name')) : null;
    const ogDesc = html ? (metaContent(html, 'og:description', 'property') || metaContent(html, 'description', 'name') || metaContent(html, 'twitter:description', 'name')) : null;
    const ogImage = html ? (metaContent(html, 'og:image', 'property') || metaContent(html, 'twitter:image', 'name')) : null;
    const siteName = html ? metaContent(html, 'og:site_name', 'property') : null;
    const titleTag = html ? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null) : null;

    let data: any = {
      name: ogTitle || (titleTag ? decodeEntities(titleTag) : null),
      description: ogDesc,
      category: null,
      address: null,
      city: null,
      region: null,
      phone: null,
      website: isFacebook ? null : (parsed.origin || null),
      facebook_url: isFacebook ? raw : null,
      hours: null,
      logo_url: ogImage && /^https?:\/\//i.test(ogImage) ? ogImage : null,
    };
    let source: 'ai' | 'meta' = 'meta';

    if (html) {
      const ldBlocks: string[] = [];
      const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let mm: RegExpExecArray | null;
      while ((mm = ldRe.exec(html)) && ldBlocks.length < 4) ldBlocks.push(mm[1].trim().slice(0, 3000));
      const visibleText = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3500);
      const evidence = [
        `URL: ${raw}`,
        `Host: ${host}`,
        siteName ? `Site: ${siteName}` : '',
        ogTitle ? `og:title: ${ogTitle}` : (titleTag ? `title: ${decodeEntities(titleTag)}` : ''),
        ogDesc ? `og:description: ${ogDesc}` : '',
        ogImage ? `og:image: ${ogImage}` : '',
        ldBlocks.length ? `JSON-LD:\n${ldBlocks.join('\n')}` : '',
        `Page text:\n${visibleText}`,
      ].filter(Boolean).join('\n');

      // Only consume an AI slot when we actually have content to normalize.
      // Over limit => keep the free deterministic meta extraction (source 'meta').
      const slot = await claimAiSlot(sb, userData.user.id);
      if (slot.allowed) {
        try {
          const out = await callOpenAIJSON(BUSINESS_IMPORT_PROMPT, evidence, 600, 12000);
          if (out && typeof out === 'object') {
            data = {
              name: pickStr(out.name) || data.name,
              description: pickStr(out.description) || data.description,
              category: normalizeBusinessCategory(out.category),
              address: pickStr(out.address),
              city: pickStr(out.city),
              region: pickStr(out.region),
              phone: pickStr(out.phone),
              website: isFacebook ? pickHttpUrl(out.website) : (pickHttpUrl(out.website) || data.website),
              facebook_url: data.facebook_url,
              hours: pickStr(out.hours),
              logo_url: pickHttpUrl(out.logo_image_url) || data.logo_url,
            };
            source = 'ai';
          }
        } catch (e: any) {
          console.warn('[business/import] openai failed', e?.message);
          await releaseAiSlot(sb, slot.scanId); // don't charge a failed call
        }
      }
    }

    const result = { ok: true, source, data: { ...data, site_name: siteName } };
    if (data.name) aiCacheSet(cacheKey, result); // only cache useful extractions
    return res.json(result);
  } catch (err: any) {
    console.error('[business/import]', err?.message || err);
    return res.status(200).json({ ok: false, error: 'Could not import from that link. Try a different one or enter details manually.' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// =====================================================================
// Static frontend (single-domain deployment)
// ---------------------------------------------------------------------
// In production this same Express server serves the built SPA from dist/
// alongside the /api routes above, so the web app and the API share one
// origin (no CORS, one deployment, one bill). Native points VITE_API_BASE at
// this same domain. In dev this block is dormant: Vite serves the web app on
// its own port and only proxies /api here, so the browser never reaches these
// handlers. Guarded on dist/ existing so a missing build can't crash dev.
// =====================================================================
const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  // Content-hashed assets (the JS/CSS/images Vite emits under /assets) are
  // immutable — their filename changes whenever their content does — so cache
  // them aggressively. index.html, by contrast, MUST never be cached: it is the
  // entry point that references the current hashed bundle, and if a browser
  // (mobile Safari especially) holds a stale copy it keeps loading old code and
  // never sees new deploys. That stale-entry-point trap is why prior fixes
  // appeared not to take effect on the published app.
  app.use(
    express.static(distDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  // --- Per-event Open Graph injection ----------------------------------
  // A shared /event/:id link must unfurl into a rich preview (the event's
  // own title + cover photo) on iMessage/WhatsApp/Slack/Facebook. Those
  // crawlers never run our JS, so they only see whatever <meta> tags are in
  // the served HTML. We rewrite the static OG/Twitter tags with the event's
  // details before serving index.html. Humans still get the same SPA — the
  // injected tags are inert to the React app.
  const ogSupabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const SITE_ORIGIN = 'https://treasuretrail-hunt.com';
  const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.jpg`;

  const htmlEscape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const injectEventMeta = (
    html: string,
    meta: { title: string; description: string; image: string; url: string },
  ): string => {
    const title = htmlEscape(meta.title);
    const desc = htmlEscape(meta.description);
    const image = htmlEscape(meta.image);
    const url = htmlEscape(meta.url);
    return html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
      .replace(/(<meta name="title" content=")[^"]*(")/, `$1${title}$2`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`)
      .replace(/(<meta property="og:type" content=")[^"]*(")/, `$1article$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${desc}$2`)
      .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${image}$2`)
      .replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${title}$2`)
      .replace(/(<meta property="twitter:url" content=")[^"]*(")/, `$1${url}$2`)
      .replace(/(<meta property="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
      .replace(/(<meta property="twitter:description" content=")[^"]*(")/, `$1${desc}$2`)
      .replace(/(<meta property="twitter:image" content=")[^"]*(")/, `$1${image}$2`)
      .replace(/(<meta property="twitter:image:alt" content=")[^"]*(")/, `$1${title}$2`)
      .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  };

  app.get('/event/:id', async (req, res, next) => {
    const id = req.params.id;
    // Only handle UUID-shaped ids so we never intercept unrelated routes.
    if (!/^[0-9a-fA-F-]{16,}$/.test(id)) return next();
    try {
      const { data: ev } = await ogSupabase
        .from('events')
        .select('id, title, description, cover_image_url, status, city, region')
        .eq('id', id)
        .eq('status', 'published')
        .maybeSingle();

      const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      if (!ev) return res.send(indexHtml); // unpublished/missing → default OG

      const place = [ev.city, ev.region].filter(Boolean).join(', ');
      const rawDesc = (ev.description || '').trim().replace(/\s+/g, ' ');
      const description =
        (rawDesc ? rawDesc.slice(0, 200) : `An event on TreasureTrail${place ? ` in ${place}` : ''}.`);
      return res.send(
        injectEventMeta(indexHtml, {
          title: ev.title,
          description,
          image: ev.cover_image_url || DEFAULT_OG_IMAGE,
          url: `${SITE_ORIGIN}/event/${ev.id}`,
        }),
      );
    } catch (err) {
      console.error('[ai-server] OG injection failed:', err);
      return next(); // fall through to plain SPA fallback
    }
  });

  // Per-article Open Graph injection for /blog/:slug — same crawler-unfurl
  // technique as /event/:id, but keyed on the post slug.
  app.get('/blog/:slug', async (req, res, next) => {
    const slug = req.params.slug;
    // Skip the category index and any non-slug segment so we never intercept
    // /blog/category/... (handled by the SPA fallback).
    if (!slug || slug === 'category' || !/^[a-z0-9-]+$/.test(slug)) return next();
    try {
      const { data: post } = await ogSupabase
        .from('blog_posts')
        .select('slug, title, seo_title, meta_description, excerpt, cover_image_url')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (!post) return res.send(indexHtml);

      const description = (post.meta_description || post.excerpt || 'A treasure-hunting guide on TreasureTrail.')
        .trim()
        .slice(0, 200);
      return res.send(
        injectEventMeta(indexHtml, {
          title: post.seo_title || post.title,
          description,
          image: post.cover_image_url || DEFAULT_OG_IMAGE,
          url: `${SITE_ORIGIN}/blog/${post.slug}`,
        }),
      );
    } catch (err) {
      console.error('[ai-server] blog OG injection failed:', err);
      return next();
    }
  });

  // Dynamic sitemap.xml — static routes + every published blog post and
  // category. Registered here (after the static index handlers but this route
  // is defined BEFORE the express.static call below at module level via order)
  // so it always wins over any stale public/sitemap.xml.
  app.get('/sitemap.xml', async (_req, res) => {
    const BLOG_CATEGORY_SLUGS = [
      'estate-sales', 'garage-sales', 'flea-markets', 'auctions', 'collectibles',
      'hot-wheels', 'vintage-toys', 'reselling', 'treasure-hunting', 'event-hosting',
    ];
    // Stable public routes. Mirrors (and supersedes) the old static
    // public/sitemap.xml so deleting that file doesn't drop crawl coverage.
    const STATIC_ROUTES = [
      '/', '/home', '/events', '/map', '/marketplace', '/auctions',
      '/community', '/pro', '/safety', '/privacy', '/terms', '/guidelines',
      '/live', '/blog',
    ];
    const urls: { loc: string; lastmod?: string }[] = [
      ...STATIC_ROUTES.map((r) => ({ loc: `${SITE_ORIGIN}${r === '/' ? '/' : r}` })),
      ...BLOG_CATEGORY_SLUGS.map((c) => ({ loc: `${SITE_ORIGIN}/blog/category/${c}` })),
    ];
    try {
      const { data: posts } = await ogSupabase
        .from('blog_posts')
        .select('slug, updated_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(2000);
      for (const p of posts ?? []) {
        urls.push({ loc: `${SITE_ORIGIN}/blog/${p.slug}`, lastmod: p.updated_at });
      }
    } catch (err) {
      console.error('[ai-server] sitemap blog query failed:', err);
    }
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls
        .map(
          (u) =>
            `  <url><loc>${htmlEscape(u.loc)}</loc>` +
            (u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : '') +
            `</url>`,
        )
        .join('\n') +
      `\n</urlset>\n`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(body);
  });

  // SPA fallback: any non-API GET returns index.html so client-side routes
  // (BrowserRouter on web) resolve on hard refresh / deep link. Always served
  // with no-cache so the freshest entry point (and bundle) reaches the client.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ai-server] listening on 0.0.0.0:${PORT}`);
});
