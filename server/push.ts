/**
 * Server-side push delivery (Firebase Cloud Messaging via firebase-admin).
 *
 * This is the trusted sender for native push. It is wired to the SAME go-live
 * event as the in-app notification: a viewer surface fires `/api/push/go-live`
 * right after the in-app `notify_followers_go_live` RPC, and this module:
 *
 *   1. Atomically claims `events.go_live_pushed_at` (one UPDATE whose WHERE is
 *      also the full eligibility gate) so the push fans out at most once ever,
 *      no matter how many viewers / tabs trigger it. The DB gate — not the
 *      caller — is the source of truth, exactly like the in-app RPC.
 *   2. Loads the seller's followers and their device tokens via the service
 *      role (bypasses RLS; no client can read another user's token).
 *   3. Sends an FCM multicast and prunes tokens FCM reports as dead.
 *
 * Degrades quietly: if FIREBASE_SERVICE_ACCOUNT (or the migration) is missing,
 * `hasPush()` is false and the endpoint no-ops so the app works pre-setup.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import admin from 'firebase-admin';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;

let adminClient: SupabaseClient | null = null;
let messaging: admin.messaging.Messaging | null = null;
let firebaseTried = false;

/** Whether push can be delivered (service role + Firebase creds configured). */
export function hasPush(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && FIREBASE_SERVICE_ACCOUNT);
}

function db(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Service role not configured for push.');
  }
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

function messagingOrNull(): admin.messaging.Messaging | null {
  if (messaging) return messaging;
  if (firebaseTried) return messaging;
  firebaseTried = true;
  if (!FIREBASE_SERVICE_ACCOUNT) return null;
  try {
    const creds = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(creds) });
    messaging = app.messaging();
    return messaging;
  } catch (err: any) {
    console.error('[push] firebase init failed:', err?.message || err);
    return null;
  }
}

export type GoLivePushResult = { sent: number; claimed: boolean };

/**
 * Claim + fan out the go-live push for an event. Idempotent: returns
 * { claimed: false } when the event was already pushed or is ineligible.
 */
export async function sendGoLivePush(eventId: string): Promise<GoLivePushResult> {
  if (!eventId) return { sent: 0, claimed: false };
  const fcm = messagingOrNull();
  if (!fcm) return { sent: 0, claimed: false };

  // Atomic claim — mirrors the in-app RPC's eligibility gate (see
  // notify_followers_go_live in 20260529000010) EXACTLY so push only ever fires
  // for a genuinely-live, fresh, online, published event, exactly once:
  //   status='published' AND event_kind='online'
  //   AND starts_at <= now()                                  (started)
  //   AND now() < COALESCE(ends_at, starts_at + 2h)           (still in window)
  //   AND now() - starts_at <= 3h                             (fresh)
  // The live-window upper bound is the `.or(...)` below: either ends_at is in
  // the future, or ends_at is null and start is within the last 2h.
  const nowIso = new Date().toISOString();
  const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data: claimed, error: claimErr } = await db()
    .from('events')
    .update({ go_live_pushed_at: nowIso })
    .is('go_live_pushed_at', null)
    .eq('id', eventId)
    .eq('status', 'published')
    .eq('event_kind', 'online')
    .lte('starts_at', nowIso)
    .gte('starts_at', threeHoursAgo)
    .or(`ends_at.gt.${nowIso},and(ends_at.is.null,starts_at.gt.${twoHoursAgo})`)
    .select('id, title, holder_id')
    .maybeSingle();

  if (claimErr) {
    // 42703 = column doesn't exist yet (migration not applied). Degrade quietly.
    if (claimErr.code === '42703') {
      console.warn('[push] go_live_pushed_at missing — apply migration 20260529000020.');
      return { sent: 0, claimed: false };
    }
    console.error('[push] claim failed:', claimErr.message);
    return { sent: 0, claimed: false };
  }
  if (!claimed) return { sent: 0, claimed: false };

  // Seller handle for the notification title.
  const { data: seller } = await db()
    .from('profiles')
    .select('username')
    .eq('id', claimed.holder_id)
    .maybeSingle();
  const handle = seller?.username || 'A seller you follow';
  const title = `${handle} is live now`;
  const body = `${claimed.title || 'Live event'} just started — tap to watch.`;

  // Followers (excluding the seller themselves).
  const { data: followers } = await db()
    .from('followers')
    .select('follower_id')
    .eq('following_id', claimed.holder_id)
    .neq('follower_id', claimed.holder_id);

  const followerIds = (followers ?? []).map((f) => f.follower_id);
  if (followerIds.length === 0) return { sent: 0, claimed: true };

  const { data: tokenRows } = await db()
    .from('device_tokens')
    .select('token')
    .in('user_id', followerIds);

  const tokens = Array.from(new Set((tokenRows ?? []).map((t) => t.token).filter(Boolean)));
  if (tokens.length === 0) return { sent: 0, claimed: true };

  // FCM multicast caps at 500 tokens per call.
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

  let sent = 0;
  let transientFailure = false;
  const deadTokens: string[] = [];
  for (const chunk of chunks) {
    try {
      const resp = await fcm.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: { eventId: claimed.id, type: 'go_live' },
        apns: { payload: { aps: { sound: 'default' } } },
        android: { priority: 'high', notification: { sound: 'default' } },
      });
      sent += resp.successCount;
      resp.responses.forEach((r, idx) => {
        const code = r.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          deadTokens.push(chunk[idx]);
        }
      });
    } catch (err: any) {
      // A thrown multicast is a transient FCM/network failure (the per-token
      // failures above are NOT thrown — they come back in `responses`).
      transientFailure = true;
      console.error('[push] multicast failed:', err?.message || err);
    }
  }

  if (deadTokens.length > 0) {
    await db().from('device_tokens').delete().in('token', deadTokens);
  }

  // If we delivered nothing AND that was due to a transient failure (not simply
  // because every target token was dead), release the claim so a later trigger
  // for the SAME event can retry. Without this, one FCM blip would set
  // go_live_pushed_at and permanently suppress the push. Resetting to null is
  // safe: no notification was delivered, and the next caller re-races the same
  // atomic claim. We only release our own still-held claim.
  if (sent === 0 && transientFailure) {
    await db()
      .from('events')
      .update({ go_live_pushed_at: null })
      .eq('id', claimed.id)
      .eq('go_live_pushed_at', nowIso);
    return { sent: 0, claimed: false };
  }

  return { sent, claimed: true };
}
