---
name: Demand intelligence privacy + gating
description: How aggregate buyer-demand capture/exposure is kept privacy-safe and Pro-gated.
---

# Demand intelligence (search_demand)

No-result searches and Wanted Requests are folded into an aggregate counter
table `search_demand`, keyed by `(term, category, geocell)` where geocell is the
searcher's lat/lng rounded to 1 decimal (~7 mi). Counts increment via upsert;
individual users are never stored.

**Rule:** never expose individuals. Capture goes through a SECURITY DEFINER RPC
`record_search_demand` (granted anon+authenticated) so the table stays RLS-on
with NO policies (no direct REST access). Reads go through Pro-gated definer RPCs
`fetch_demand_by_item` / `fetch_local_demand` that raise `PRO_REQUIRED` for
non-Pro callers — identical entitlement shape to `fetch_seller_reach`.

**Why:** UI-only gating is bypassable; a free user could hand-craft the REST
call. Coarse geocell rounding means even the aggregate radius query can't
pinpoint a person. This mirrors `reach-analytics-data-gate` and
`escalation-guard-privileged-columns` — entitlement and privacy live in the DB.

**How to apply:** any new demand/insight read must be a definer RPC with the
same Pro check; any new capture must keep location coarse (round, never store
raw user coords against identity). Client lib (`src/lib/demand.ts`) treats a
missing RPC as empty/no-op (migration-gated fetcher pattern) and is best-effort
on capture so a tracking failure never breaks search or the wizard.
