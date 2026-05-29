/**
 * Payments boundary — client side.
 *
 * The client used to write Pro/boost state directly here ("mocked"
 * payments), which meant anyone could grant themselves paid benefits for
 * free. That is now closed: the database rejects client writes to paid
 * columns (migration 20260529000002_revenue_lockdown.sql), and granting
 * paid state is exclusively a server-side, service-role operation
 * (server/grants.ts), triggered by a verified payment.
 *
 * Until Stripe Checkout is wired (next phase) these initiators perform NO
 * privileged writes — they return a "coming soon" result so the UI can
 * show a clear placeholder instead of silently granting anything.
 */

export type BoostTargetKind = 'event' | 'wanted' | 'find' | 'listing';
export type BoostType = 'paid' | 'pro';

export type PaymentResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; comingSoon?: boolean };

/** Whether a real payment surface is wired yet. Flips true with Stripe. */
export const PAYMENTS_ENABLED = false;

const COMING_SOON = 'Payments are being set up — this will be available soon.';

export interface StartBoostArgs {
  targetKind: BoostTargetKind;
  targetId: string;
  /** Defaults to 'paid'. 'pro' is reserved for the Pro-tier boost path. */
  boostType?: BoostType;
}

/**
 * Initiates a boost purchase. No-op until Stripe lands: boosts are
 * granted server-side only, so the client never writes boost columns.
 */
export async function startBoostPurchase(
  _args: StartBoostArgs,
): Promise<PaymentResult<{ targetId: string }>> {
  return { ok: false, error: COMING_SOON, comingSoon: true };
}

/**
 * Initiates a Pro upgrade. No-op until Stripe lands: the Pro tier is
 * granted server-side only, so the client never writes membership_tier.
 */
export async function startProUpgrade(): Promise<PaymentResult<{ tier: 'pro' }>> {
  return { ok: false, error: COMING_SOON, comingSoon: true };
}
