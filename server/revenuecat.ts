/**
 * RevenueCat server helpers — webhook auth, event classification, and REST
 * verification. This module performs NO database writes; it only reads from
 * RevenueCat and tells server/index.ts what to grant/revoke. The single writer
 * of paid state remains server/grants.ts (service-role).
 *
 * Trust model:
 *   - Webhook calls are authenticated by a shared secret you set in the
 *     RevenueCat dashboard (Authorization header), compared here.
 *   - Boost confirmation NEVER trusts a client-supplied transaction id: the
 *     server fetches the buyer's subscriber record from RevenueCat over REST
 *     and reads the verified non-subscription transactions itself.
 */

export const PRO_PRODUCT_ID = 'com.treasuretrail.hunt.pro.monthly';
export const BOOST_PRODUCT_ID = 'com.treasuretrail.hunt.boost.event72h';
export const PRO_ENTITLEMENT = 'pro';

const REST_KEY = process.env.REVENUECAT_REST_API_KEY;
const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;
const REST_BASE = 'https://api.revenuecat.com/v1';

/** Whether the REST API key (needed for /sync + boost confirm) is configured. */
export function hasRevenueCatRest(): boolean {
  return Boolean(REST_KEY);
}

/**
 * Verifies the webhook Authorization header against REVENUECAT_WEBHOOK_SECRET.
 * RevenueCat sends exactly the value you type in the dashboard, so we accept
 * either the raw secret or a "Bearer <secret>" form.
 */
export function verifyWebhookAuth(header?: string): boolean {
  if (!WEBHOOK_SECRET || !header) return false;
  return header === WEBHOOK_SECRET || header === `Bearer ${WEBHOOK_SECRET}`;
}

export interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
}

export type WebhookAction = 'grant' | 'revoke' | 'ignore';

export interface ClassifiedEvent {
  action: WebhookAction;
  appUserId: string | null;
  eventId: string | null;
  productId: string | null;
  eventType: string | null;
}

const GRANT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
]);
const REVOKE_TYPES = new Set(['EXPIRATION']);

/**
 * Maps a RevenueCat webhook event to a Pro grant/revoke/ignore decision.
 * Only events that concern the Pro subscription (by product id or the "pro"
 * entitlement) ever grant/revoke; boost (NON_RENEWING_PURCHASE) and
 * informational events (CANCELLATION, BILLING_ISSUE, …) are ignored — boosts
 * are applied through /api/iap/boost/confirm, not the webhook.
 */
export function classifyWebhookEvent(event: RevenueCatEvent): ClassifiedEvent {
  const eventType = event.type ?? null;
  const appUserId = event.app_user_id ?? null;
  const eventId = event.id ?? null;
  const productId = event.product_id ?? null;

  const concernsPro =
    productId === PRO_PRODUCT_ID ||
    (Array.isArray(event.entitlement_ids) &&
      event.entitlement_ids.includes(PRO_ENTITLEMENT));

  let action: WebhookAction = 'ignore';
  if (eventType && concernsPro) {
    if (GRANT_TYPES.has(eventType)) action = 'grant';
    else if (REVOKE_TYPES.has(eventType)) action = 'revoke';
  }

  return { action, appUserId, eventId, productId, eventType };
}

interface RcSubscriber {
  entitlements?: Record<string, { expires_date?: string | null }>;
  non_subscriptions?: Record<
    string,
    Array<{ id?: string; store_transaction_id?: string | null }>
  >;
}

/**
 * Fetches a subscriber record from RevenueCat. Returns null on any non-2xx
 * (including 404 for an unknown user) so callers degrade gracefully.
 */
export async function fetchSubscriber(
  appUserId: string,
): Promise<RcSubscriber | null> {
  if (!REST_KEY) return null;
  try {
    const resp = await fetch(
      `${REST_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${REST_KEY}` } },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { subscriber?: RcSubscriber };
    return json.subscriber ?? null;
  } catch {
    return null;
  }
}

/** Whether the subscriber currently has an active Pro entitlement. */
export function isProActive(subscriber: RcSubscriber): boolean {
  const ent = subscriber.entitlements?.[PRO_ENTITLEMENT];
  if (!ent) return false;
  if (!ent.expires_date) return true; // lifetime / non-expiring
  return new Date(ent.expires_date).getTime() > Date.now();
}

/**
 * All verified Event Boost transaction identifiers for this subscriber, most
 * recent first. Used to find an unredeemed boost purchase to apply.
 */
export function boostTransactionIds(subscriber: RcSubscriber): string[] {
  const list = subscriber.non_subscriptions?.[BOOST_PRODUCT_ID] ?? [];
  const ids: string[] = [];
  for (const txn of list) {
    const id = txn.store_transaction_id || txn.id;
    if (id) ids.push(id);
  }
  return ids.reverse();
}
