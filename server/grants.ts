/**
 * Trusted grant module — the SINGLE place paid state is written.
 *
 * Pro tier and content boosts are revenue-bearing benefits. The database
 * now forbids JWT clients from writing those columns (see migration
 * 20260529000002_revenue_lockdown.sql), so the only way to grant them is
 * through this module, which uses the Supabase service-role key and
 * therefore bypasses the escalation triggers (no JWT context).
 *
 * This is where the Stripe webhook will call in the next phase. Until
 * then the only caller is an admin-gated manual endpoint for testing and
 * customer support — there is NO self-serve / unauthenticated surface.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: SupabaseClient | null = null;

/** Whether the service-role key is configured. Endpoints should 503 if false. */
export function hasServiceRole(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

/** Service-role Supabase client (bypasses RLS). Callers MUST gate access. */
export function getServiceClient(): SupabaseClient {
  return admin();
}

function admin(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      'Service role not configured: missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export type BoostTargetKind = 'event' | 'wanted' | 'find' | 'listing';
export type BoostType = 'paid' | 'pro';

const TARGET_TABLE: Record<BoostTargetKind, string> = {
  event: 'events',
  wanted: 'wanted_items',
  find: 'community_posts',
  listing: 'marketplace_listings',
};

// Column that holds the owning user's id on each boostable table. Used to
// verify a buyer can only boost their OWN content (service-role bypasses RLS,
// so ownership must be checked explicitly).
const OWNER_COLUMN: Record<BoostTargetKind, string> = {
  event: 'holder_id',
  wanted: 'user_id',
  find: 'user_id',
  listing: 'seller_id',
};

// Mirrors src/lib/boost.ts (kept tiny + duplicated so the server has no
// dependency on the client bundle).
const BOOST_DURATION_HOURS = 72;

function boostExpiryFromNow(durationHours = BOOST_DURATION_HOURS): string {
  return new Date(Date.now() + durationHours * 3_600_000).toISOString();
}

function priorityFor(boostType: BoostType): number {
  return boostType === 'pro' ? 80 : 100;
}

export type GrantResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function grantPro(userId: string): Promise<GrantResult<{ tier: 'pro' }>> {
  const { data, error } = await admin()
    .from('profiles')
    .update({ membership_tier: 'pro', pro_member: true })
    .eq('id', userId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  // PostgREST treats an UPDATE matching 0 rows as success; without this check a
  // mismatched/unknown app_user_id would silently "succeed" and never grant Pro
  // (the buyer paid but stays free). Surface it so the webhook/sync 500s + retries.
  if (!data || data.length === 0) {
    return { ok: false, error: `No profile matched id ${userId} for Pro grant.` };
  }
  return { ok: true, data: { tier: 'pro' } };
}

export async function revokePro(userId: string): Promise<GrantResult<{ tier: 'free' }>> {
  const { data, error } = await admin()
    .from('profiles')
    .update({ membership_tier: 'free', pro_member: false })
    .eq('id', userId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  // 0 rows on a revoke means the app_user_id mapped to no profile — e.g. an
  // id mismatch where the user is still Pro under a DIFFERENT id. Failing here
  // (rather than silently "succeeding") surfaces the mismatch instead of
  // letting someone keep Pro for free after their subscription expired.
  if (!data || data.length === 0) {
    return { ok: false, error: `No profile matched id ${userId} for Pro revoke.` };
  }
  return { ok: true, data: { tier: 'free' } };
}

// =====================================================================
// Founding Partner program (invite-only recognition badge)
// ---------------------------------------------------------------------
// Privileged columns guarded at the DB level (founding_partner on profiles
// and businesses), so the ONLY way to flip them is through this service-role
// module. Every writer .select('id') and fails on 0 rows because PostgREST
// treats a 0-row UPDATE as success — without it a bad id would silently
// "succeed" and never grant the badge.
// =====================================================================

export async function grantFoundingPartner(
  userId: string,
): Promise<GrantResult<{ founding_partner: true }>> {
  const { data, error } = await admin()
    .from('profiles')
    .update({ founding_partner: true, founding_partner_since: new Date().toISOString() })
    .eq('id', userId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: `No profile matched id ${userId} for Founding Partner grant.` };
  }
  return { ok: true, data: { founding_partner: true } };
}

export async function revokeFoundingPartner(
  userId: string,
): Promise<GrantResult<{ founding_partner: false }>> {
  const { data, error } = await admin()
    .from('profiles')
    .update({ founding_partner: false, founding_partner_since: null })
    .eq('id', userId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: `No profile matched id ${userId} for Founding Partner revoke.` };
  }
  return { ok: true, data: { founding_partner: false } };
}

export async function grantBusinessFoundingPartner(
  businessId: string,
): Promise<GrantResult<{ founding_partner: true }>> {
  const { data, error } = await admin()
    .from('businesses')
    .update({ founding_partner: true, founding_partner_since: new Date().toISOString() })
    .eq('id', businessId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: `No business matched id ${businessId} for Founding Partner grant.` };
  }
  return { ok: true, data: { founding_partner: true } };
}

export async function revokeBusinessFoundingPartner(
  businessId: string,
): Promise<GrantResult<{ founding_partner: false }>> {
  const { data, error } = await admin()
    .from('businesses')
    .update({ founding_partner: false, founding_partner_since: null })
    .eq('id', businessId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: `No business matched id ${businessId} for Founding Partner revoke.` };
  }
  return { ok: true, data: { founding_partner: false } };
}

export async function applyBoost(args: {
  targetKind: BoostTargetKind;
  targetId: string;
  boostType?: BoostType;
}): Promise<GrantResult<{ targetId: string }>> {
  const { targetKind, targetId, boostType = 'paid' } = args;
  const table = TARGET_TABLE[targetKind];
  if (!table) return { ok: false, error: `Unknown boost target: ${targetKind}` };

  const { data, error } = await admin()
    .from(table)
    .update({
      boosted_at: new Date().toISOString(),
      boost_expires_at: boostExpiryFromNow(),
      boost_type: boostType,
      priority_score: priorityFor(boostType),
    })
    .eq('id', targetId)
    .select('id');
  if (error) return { ok: false, error: error.message };
  // PostgREST treats an UPDATE matching 0 rows as success; without this check a
  // bad/nonexistent targetId would silently "succeed" and burn a boost.
  if (!data || data.length === 0) {
    return { ok: false, error: 'Boost target not found.' };
  }
  return { ok: true, data: { targetId } };
}

/**
 * Confirms a target row exists and is owned by `userId`. Service-role writes
 * bypass RLS, so callers MUST gate on this before boosting on a user's behalf.
 */
export async function verifyBoostOwnership(args: {
  userId: string;
  targetKind: BoostTargetKind;
  targetId: string;
}): Promise<{ ok: boolean; found: boolean; owned: boolean; error?: string }> {
  const { userId, targetKind, targetId } = args;
  const table = TARGET_TABLE[targetKind];
  const col = OWNER_COLUMN[targetKind];
  if (!table || !col) {
    return { ok: false, found: false, owned: false, error: `Unknown boost target: ${targetKind}` };
  }
  const { data, error } = await admin()
    .from(table)
    .select(`id, ${col}`)
    .eq('id', targetId)
    .maybeSingle();
  if (error) return { ok: false, found: false, owned: false, error: error.message };
  if (!data) return { ok: true, found: false, owned: false };
  return { ok: true, found: true, owned: (data as Record<string, unknown>)[col] === userId };
}

/**
 * Permanently delete a user account and all associated data.
 *
 * Uses the service-role admin API to delete the auth user. Every app table
 * that references `auth.users(id) ON DELETE CASCADE` is wiped automatically by
 * the database, so this single call removes the account and its data together.
 */
export async function deleteUserAccount(userId: string): Promise<GrantResult<{ userId: string }>> {
  const { error } = await admin().auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { userId } };
}

export async function removeBoost(args: {
  targetKind: BoostTargetKind;
  targetId: string;
}): Promise<GrantResult<{ targetId: string }>> {
  const { targetKind, targetId } = args;
  const table = TARGET_TABLE[targetKind];
  if (!table) return { ok: false, error: `Unknown boost target: ${targetKind}` };

  const { error } = await admin()
    .from(table)
    .update({
      boosted_at: null,
      boost_expires_at: null,
      boost_type: null,
      priority_score: 0,
    })
    .eq('id', targetId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { targetId } };
}

// =====================================================================
// IAP ledger (iap_purchases)
// ---------------------------------------------------------------------
// Idempotency + exactly-once accounting for Apple In-App Purchases:
//   * webhook events are deduped by rc_event_id;
//   * boost consumables are claimed atomically by rc_transaction_id (a UNIQUE
//     column), so one purchased boost can be applied to exactly one item.
// =====================================================================

const UNIQUE_VIOLATION = '23505';

/** Whether this RevenueCat webhook event was already processed. */
export async function webhookEventSeen(eventId: string): Promise<boolean> {
  const { data } = await admin()
    .from('iap_purchases')
    .select('id')
    .eq('rc_event_id', eventId)
    .maybeSingle();
  return Boolean(data);
}

/** Records a processed webhook event. Conflicts are ignored (already recorded). */
export async function recordWebhookEvent(
  eventId: string,
  meta: { userId?: string | null; productId?: string | null; eventType?: string | null },
): Promise<void> {
  const { error } = await admin().from('iap_purchases').insert({
    kind: 'subscription',
    rc_event_id: eventId,
    user_id: meta.userId ?? null,
    product_id: meta.productId ?? null,
    event_type: meta.eventType ?? null,
  });
  if (error && error.code !== UNIQUE_VIOLATION) {
    console.error('[grants] recordWebhookEvent failed:', error.message);
  }
}

/**
 * Atomically claims a boost transaction for redemption. Returns claimed=false
 * when the transaction was already redeemed (UNIQUE violation on
 * rc_transaction_id), which is the once-only guarantee for consumables.
 */
export async function claimBoostTransaction(args: {
  userId: string;
  txnId: string;
  targetKind: BoostTargetKind;
  targetId: string;
  productId?: string;
}): Promise<{ claimed: boolean; error?: string }> {
  const { error } = await admin().from('iap_purchases').insert({
    kind: 'boost',
    rc_transaction_id: args.txnId,
    user_id: args.userId,
    product_id: args.productId ?? null,
    target_kind: args.targetKind,
    target_id: args.targetId,
  });
  if (!error) return { claimed: true };
  if (error.code === UNIQUE_VIOLATION) return { claimed: false };
  return { claimed: false, error: error.message };
}

/** Releases a boost claim so it can be retried (call when applyBoost fails). */
export async function releaseBoostTransaction(txnId: string): Promise<void> {
  const { error } = await admin()
    .from('iap_purchases')
    .delete()
    .eq('rc_transaction_id', txnId);
  if (error) console.error('[grants] releaseBoostTransaction failed:', error.message);
}
