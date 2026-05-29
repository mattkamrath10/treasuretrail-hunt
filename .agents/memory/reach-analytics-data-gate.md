---
name: Reach analytics data-layer Pro gate
description: How the Pro Reach Analytics feature is gated at the DB layer, not just UI, and why the count views are no longer authenticated-readable.
---

# Reach analytics is gated at the data layer, not just the UI

The Pro "Reach Analytics" dashboard aggregates per-event views/saves/CTA taps.
It must be a real Pro entitlement, so gating lives in the database:

- `fetch_seller_reach(p_event_ids uuid[])` is a `SECURITY DEFINER` RPC that
  raises `PRO_REQUIRED` unless the caller's profile is Pro, and filters to
  `holder_id = auth.uid()` (ownership). It is the ONLY app read path for reach.
- The underlying count views (`event_view_counts`, `event_save_counts`,
  `event_click_counts`) had blanket `GRANT SELECT ... TO authenticated`, which
  let any logged-in holder pull reach via the REST API and bypass the gate.
  The RPC migration **revokes** that direct SELECT from `authenticated, anon`.
  The definer RPC runs as its owner, so it keeps working after the revoke.

**Why:** UI-only gating is not an entitlement — a free holder could hand-craft
an API call. Two architect reviews FAILed until the grants were revoked.

**How to apply:**
- Client (`src/lib/eventAnalytics.ts → fetchSellerReach`) calls the RPC first
  and only falls back to direct count reads when the function is *missing*
  (`PGRST202` / "does not exist"). Any other error (incl. `PRO_REQUIRED`)
  propagates — never silently report 0 reach. This is the migration-gated
  fetcher pattern: works today, becomes a hard gate once DDL is applied.
- `fetchEventEngagement` (single-event) reads the same views and is currently
  unused; after the revoke it will fail. If a per-event card returns,
  reimplement it as a definer RPC with an ownership (and tier, if Pro) check.
- Agent cannot apply Supabase DDL; user runs the migration manually.
