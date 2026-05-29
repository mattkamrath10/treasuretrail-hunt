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
  const { error } = await admin()
    .from('profiles')
    .update({ membership_tier: 'pro', pro_member: true })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { tier: 'pro' } };
}

export async function revokePro(userId: string): Promise<GrantResult<{ tier: 'free' }>> {
  const { error } = await admin()
    .from('profiles')
    .update({ membership_tier: 'free', pro_member: false })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { tier: 'free' } };
}

export async function applyBoost(args: {
  targetKind: BoostTargetKind;
  targetId: string;
  boostType?: BoostType;
}): Promise<GrantResult<{ targetId: string }>> {
  const { targetKind, targetId, boostType = 'paid' } = args;
  const table = TARGET_TABLE[targetKind];
  if (!table) return { ok: false, error: `Unknown boost target: ${targetKind}` };

  const { error } = await admin()
    .from(table)
    .update({
      boosted_at: new Date().toISOString(),
      boost_expires_at: boostExpiryFromNow(),
      boost_type: boostType,
      priority_score: priorityFor(boostType),
    })
    .eq('id', targetId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { targetId } };
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
