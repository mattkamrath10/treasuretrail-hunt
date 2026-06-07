import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {
  grantPro,
  revokePro,
  applyBoost,
  removeBoost,
  deleteUserAccount,
  hasServiceRole,
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
import { sendGoLivePush, hasPush } from './push';

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
  "era": string|null,        // e.g. "1970s", "Mid-Century", "Modern"
  "condition_estimate": string, // e.g. "Good", "Fair", "Excellent"
  "rarity_score": number,    // 1-10, 10 = extremely rare
  "confidence": number,      // 0-100 your confidence in the identification
  "estimated_value": { "low": number, "high": number, "currency": "USD" },
  "summary": string,         // 1-2 sentence reseller-focused summary
  "highlights": string[],    // 2-4 bullets: notable features, markings, or value drivers
  "selling_tips": string[],  // 2-3 short reseller tips (best platform, listing angle, photo advice)
  "watch_outs": string[]     // 1-3 things to verify before listing (damage, repros, authenticity)
}`;

async function callOpenAIVision(dataUrl: string, userContext: string) {
  const resp = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    max_completion_tokens: 1200,
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
