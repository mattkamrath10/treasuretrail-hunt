---
name: Migration-gated fetcher pattern
description: How to ship public fetchers that depend on a not-yet-applied Postgres column without breaking the app on first deploy.
---

# Rule
When adding a new column-dependent filter (e.g. `.eq('is_hidden', false)`) to a public-fetcher in this codebase, write the query as a `build(withFilter: boolean)` closure and **retry without the filter on `error.code === '42703'`**, but ONLY when `/columnName/i.test(error.message)`. Log a `[FETCH_X] column missing — apply migration <file>` warning on the fallback path.

**Why:** We don't apply Supabase migrations from the agent environment (no DDL path via REST, no DB password for `pg`). The migration file ships in the same PR as the fetcher change, but the user applies it manually in the Supabase SQL editor minutes-to-hours later. Without the retry, every public feed (Discover, Wanted, etc.) goes blank during that window and looks like a hard regression.

**How to apply:** Mirror the shape used in `fetchPublishedEvents`, `fetchOpenWantedItems`, `fetchCommunityPosts`, `fetchMarketplaceListings`. Do NOT broaden the 42703 catch — scoping the message regex to the specific column name keeps unrelated undefined-column errors loud. Once the migration is applied everywhere the project runs, the fallback branch is dead code and can be removed.

# Write-side variant (insert/update of a new column)
The same hazard hits **writes**, and worse: if a create/update payload includes a column that doesn't exist yet, the *entire* write fails — so adding an optional field can break ALL record creation/editing until the migration is applied. Use the same `build(withField)` closure that `delete payload.field` + retries on the missing-column error.

**Critical difference from the read side:** writes go through PostgREST, which for an unknown payload column returns **`PGRST204`** ("Could not find the 'field' column in the schema cache"), NOT Postgres `42703`. A retry guard that only checks `42703` will silently fail to fire on the write path. Match **both** codes (`42703` || `PGRST204`), still scoped to the column name (check `message` AND `details`).

**Why:** raw Postgres DDL/undefined-column → `42703`; the supabase-js data API surfaces schema-cache misses as `PGRST204`. The two paths emit different codes for the same "column not there yet" condition.

# Supabase migration apply note
For this external Supabase project (no Replit-managed DB), no auto-apply path exists. Migrations under `supabase/migrations/` must be opened in the Supabase dashboard SQL editor and run manually, OR applied via `supabase db push` from a workstation with the project linked. The agent cannot do this itself — surface a clear "apply this file in Supabase" instruction whenever a new migration ships.
