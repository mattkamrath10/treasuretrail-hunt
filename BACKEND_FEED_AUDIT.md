# Backend Feed Audit — May 19, 2026

## TL;DR

Two production-schema mismatches were silently breaking the Home feed and
making Flash Find uploads appear "lost." Both are now patched in code so
the app works without the migrations applied. One migration still needs
to be run on your Supabase project to enable Phase 5 event scheduling
writes for new uploads.

---

## Findings

### 1. PRIMARY: `community_posts → profiles` FK does not exist in production

**Error surfaced:**
```
PGRST200: Could not find a relationship between 'community_posts' and 'profiles'
```

**Why it happened:** `community_posts.user_id` references `auth.users(id)`
(per `20260517081256_add_profile_fields_and_core_tables.sql`), NOT
`profiles(id)`. PostgREST's auto-embed `select('*, profiles(...)')` can
only follow direct foreign keys. There is no FK chain it can resolve from
`community_posts` to `profiles`, so every fetch threw.

**Why it was invisible:** `fetchCommunityPosts` had
`if (error) return [];` — it silently swallowed the error and returned an
empty array. The Home feed has rendered empty for **every** community
post since the embed was added. Flash Find uploads succeeded (writes hit
`flash_finds` + `community_posts`) but the post never re-appeared because
the read query was broken.

**Fix (code, shipped):** `src/lib/database.ts` now uses a two-query join.
A new `attachProfiles(rows, userIdField)` helper does one bulk
`profiles.select(...).in('id', ids)` and merges results in JS. This is
resilient to any FK configuration and to PostgREST schema-cache
staleness.

Applied to:
- `fetchCommunityPosts` (`user_id`)
- `fetchMarketplaceListings` (`seller_id`)
- `src/pages/Auctions.tsx` initial load and post-insert select
  (embed removed; client renders without the username pill until next
  refetch, which is acceptable since `attachProfiles` runs on the
  shared lib path)

### 2. SECONDARY: `external_listings.start_at` column does not exist in production

**Error surfaced:**
```
42703: column external_listings.start_at does not exist
```

**Why it happened:** Phase 5 added a migration
(`20260518000007_external_listings_start_at.sql`) that adds the
`start_at` column, but it was never run on the live Supabase project.
The Home, LiveHub, and Auctions queries explicitly listed `start_at` in
their SELECT column lists, so the entire `external_listings` query
failed before returning any rows.

**Why it stayed broken:** The error was logged but the Home loader still
set `loadError = 'Some items could not load.'`. Without the underlying
query succeeding, no upcoming/live events ever appeared and the user saw
a persistent "could not load" banner.

**Fix (code, shipped):**
- All `external_listings.select(...)` calls now use `select('*')`.
  Missing columns are no longer fatal — `eventSchedule.ts` already falls
  back to `created_at` when `start_at` is null/undefined.
- Home's `loadAll` classifies the following PostgreSQL/PostgREST error
  codes as **soft** (don't show user-facing banner, don't trigger backoff,
  log at `warn` level): `PGRST205`, `PGRST204`, `42703`, `42P01`.
- Hard failures still surface the banner. Community-post failures (the
  primary feed) still throw so `useLiveFeed` engages exponential backoff.

**Fix (database, still required from you):** Run
`SUPABASE_PASTE_THIS.sql` in the Supabase SQL Editor. The Phase 5 block
is already appended at the end of the file. Until then:
- READ paths work (we `select('*')` and fall back to `created_at`)
- New event WRITE paths from `LiveHub.UploadEventModal` and `Auctions`
  will fail at insert time because the payload includes `start_at`. The
  user-facing error message ("could not submit") will surface honestly.

---

## Structured Log Prefixes (new)

All feed-layer errors now use grep-able prefixes:

| Prefix                    | Meaning                                          |
|---------------------------|--------------------------------------------------|
| `[SUPABASE_QUERY_FAIL]`   | Real query failure (table, source, code, msg)   |
| `[HOME_FEED_FETCH]`       | Soft-skipped optional source (e.g. missing col) |

Example:
```
[SUPABASE_QUERY_FAIL] table=community_posts source=fetchCommunityPosts {code, message}
[HOME_FEED_FETCH] external_listings soft-skip 42703 column ... does not exist
```

---

## Silent-Failure Audit

| Function                       | Before                  | After                                |
|--------------------------------|-------------------------|--------------------------------------|
| `fetchCommunityPosts`          | `if (error) return [];` | Throws with `[SUPABASE_QUERY_FAIL]`; backoff engages |
| `fetchMarketplaceListings`     | `if (error) return [];` | PGRST205 → []; everything else logged at warn        |
| Home `loadAll` external_listings | `console.error` every 10s | Soft-skipped if 42703/PGRST205/PGRST204/42P01  |
| Home `loadAll` marketplace     | Same                    | Same soft-skip taxonomy                              |
| Auctions list                  | `.then(({data}) ...)` no error path | Errors now logged with `[SUPABASE_QUERY_FAIL]`       |
| LiveHub `fetchListings`        | Plain `.select(...)`    | `select('*')`, throws on error so backoff engages    |

---

## Filter-Hidden Post UX

Not yet observed — the empty-feed reports were caused by the two schema
bugs above, not filter logic. If, after applying the migration, a user
uploads to a category currently filtered out, the existing
`activeFilters` UI in `Home.tsx` is the surface that should add a "Show
all" affordance. Out of scope for this fix.

---

## Action Required From You

1. Open the Supabase dashboard → SQL Editor.
2. Paste the contents of `SUPABASE_PASTE_THIS.sql` and run it. The Phase 5
   `ALTER TABLE external_listings ADD COLUMN ... start_at` block is at
   the bottom and is idempotent (uses `IF NOT EXISTS`).
3. After running, hard-refresh the app. New event uploads will then
   persist `start_at` and the Phase 5 scheduling features (Live Now /
   Ending Soon badges, countdowns) will activate for those rows.

The community-feed fix and Flash Find visibility do **not** require any
database change — those are pure code fixes that ship now.
