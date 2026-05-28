---
name: Migration-gated fetcher pattern
description: How to ship public fetchers that depend on a not-yet-applied Postgres column without breaking the app on first deploy.
---

# Rule
When adding a new column-dependent filter (e.g. `.eq('is_hidden', false)`) to a public-fetcher in this codebase, write the query as a `build(withFilter: boolean)` closure and **retry without the filter on `error.code === '42703'`**, but ONLY when `/columnName/i.test(error.message)`. Log a `[FETCH_X] column missing — apply migration <file>` warning on the fallback path.

**Why:** We don't apply Supabase migrations from the agent environment (no DDL path via REST, no DB password for `pg`). The migration file ships in the same PR as the fetcher change, but the user applies it manually in the Supabase SQL editor minutes-to-hours later. Without the retry, every public feed (Discover, Wanted, etc.) goes blank during that window and looks like a hard regression.

**How to apply:** Mirror the shape used in `fetchPublishedEvents`, `fetchOpenWantedItems`, `fetchCommunityPosts`, `fetchMarketplaceListings`. Do NOT broaden the 42703 catch — scoping the message regex to the specific column name keeps unrelated undefined-column errors loud. Once the migration is applied everywhere the project runs, the fallback branch is dead code and can be removed.

# Supabase migration apply note
For this external Supabase project (no Replit-managed DB), no auto-apply path exists. Migrations under `supabase/migrations/` must be opened in the Supabase dashboard SQL editor and run manually, OR applied via `supabase db push` from a workstation with the project linked. The agent cannot do this itself — surface a clear "apply this file in Supabase" instruction whenever a new migration ships.
