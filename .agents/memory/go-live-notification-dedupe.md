---
name: Go-live notification dedupe
description: How fan-out "seller went live" follower notifications avoid duplicates/spam in this Supabase app.
---

# Go-live notification dedupe & spam prevention

Fan-out notifications ("a followed seller's live event started") can be triggered from
multiple client surfaces (Discover, LiveHub, Following), multiple tabs, and multiple
viewers simultaneously. The dedupe MUST be server-side and atomic.

## Pattern
- A SECURITY DEFINER RPC does a single atomic claim:
  `UPDATE events SET <notified_at> = now() WHERE id = $1 AND <notified_at> IS NULL AND <eligibility...> RETURNING ...`
  The `RETURNING` row count is the eligibility gate AND the dedupe — only the first
  caller wins; concurrent callers see 0 rows and insert nothing.
- Notifications are inserted strictly from the `followers` table (`following_id = seller`,
  excluding self), so targeting is followers-only and enforced in SQL, not the client.
- A freshness gate (live-now window + `now() - starts_at <= ~3h`) stops stale events from
  back-firing if the column is reset or the event re-qualifies.

**Why:** A client-side `attempted` Set only prevents repeat calls within one session/tab.
It is an optimization to cut RPC noise, never the real dedupe. The DB claim is the only
cross-tab / cross-viewer / cross-surface safe backstop.

## How to apply
- When adding any "notify followers/subscribers on event X" feature, put the dedupe in an
  atomic `UPDATE ... WHERE flag IS NULL ... RETURNING` claim inside a definer RPC. Do not
  rely on the client to dedupe.
- Client callers should quiet-degrade when the migration isn't applied yet (Postgres
  `42883` undefined_function / `42703` undefined_column, plus message match) so the app
  works before the user runs the migration.
- Guard the RPC call behind an authenticated session client-side (`getSession()` is local,
  no network) — the definer RPC needs `auth.uid()`, so guest calls are pure waste.
