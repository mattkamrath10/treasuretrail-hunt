# Moderation & Delete Permission System

## Overview

Two-tier moderation across every user-content surface (Flash Finds, Marketplace,
Rare Radar, Live Events):

| Role  | Can delete                                                |
|-------|-----------------------------------------------------------|
| user  | Their own posts/listings only.                            |
| admin | Any post/listing on the platform (plus any avatar file).  |

The owner of the platform (Matt) is the bootstrap admin. Future admins can be
promoted by an existing admin (or via service-role SQL) by setting
`profiles.role = 'admin'`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  UI feed (Home / FlashFinds / Marketplace / LiveHub / etc.) │
│  ─ renders Delete button when canDeletePost() is true       │
│  ─ calls deletePost() on confirm                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
              src/lib/moderation.ts
              ─ canDeletePost(user, profile, post) → bool
              ─ deletePost(deletable)             → { ok, error }
                           │
        ┌──────────────────┼──────────────────┐
        ▼                                     ▼
  Supabase Storage                      Supabase Postgres
  remove(image path)                    delete row
  (best-effort)                         (RLS-enforced)
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
         row owner check         public.is_admin()
         (auth.uid() = …)        SECURITY DEFINER
```

All UI is advisory — the actual permission decision is enforced at the database
boundary by RLS, so a tampered client cannot delete content it does not own.

## Database changes (migration `20260519000001_admin_role_and_moderation.sql`)

- **`profiles.role text NOT NULL DEFAULT 'user'`** with
  `CHECK (role IN ('user','admin'))`.
- **Trigger hardening** — `prevent_profile_field_escalation()` now also locks
  `role` against client-side updates, so a logged-in user cannot promote
  themselves by sending `role='admin'` in an UPDATE.
- **`public.is_admin()`** — `SECURITY DEFINER`, `STABLE`, runs as the function
  owner so it can read `profiles` without triggering the `Users can read own
  profile` policy recursion when invoked from another table's RLS check.
  Revoked from `anon`, granted to `authenticated`.
- **DELETE policies rewritten** on:
  - `community_posts`
  - `flash_finds`
  - `marketplace_listings`
  - `external_listings` (guarded by an `IF EXISTS` block in case the table
    isn't provisioned in a given project)

  Each policy uses `USING (auth.uid() = <owner_col> OR public.is_admin())`.
- **Storage** — `Admins can delete any avatar` policy on `storage.objects`
  scoped to the `avatars` bucket. The existing "user can delete own folder"
  policy stays in place for normal owner-deletes.

The migration is also appended verbatim to `SUPABASE_PASTE_THIS.sql` for
projects that don't run the Supabase CLI.

### One-time owner promotion

After applying the migration, run once in the Supabase SQL editor (replace
`matt` with the platform owner's username):

```sql
UPDATE profiles SET role = 'admin' WHERE username = 'matt';
```

## Client helpers (`src/lib/moderation.ts`)

- **`canDeletePost(user, profile, post)`** — accepts a partial post shape
  (`ownerId | user_id | seller_id | submitted_by`) so callers don't have to
  normalize. Returns `true` for any admin, otherwise checks ownership.
- **`isAdmin(profile)`** — convenience boolean.
- **`extractStoragePath(publicUrl)`** — parses Supabase public URLs of the
  form `…/storage/v1/object/public/<bucket>/<path>` and returns
  `{ bucket, path }` for `.remove()` calls.
- **`deletePost(deletable)`** — single entry point:
  1. Best-effort `storage.remove()` for the attached image. A storage failure
     is logged but **does not block** the row delete (an orphaned image is
     much better than a row that can't be re-uploaded over).
  2. `from(table).delete().eq('id', …)`. RLS rejects unauthorized callers.
  3. Returns `{ ok, error?, storageRemoved? }` so the UI can roll back its
     optimistic state.
- Adapters: `communityPostToDeletable`, `marketplaceListingToDeletable`.

The table-mapping (`TABLE_BY_TYPE`) covers the four primary content tables, so
adding moderation to a new feed only requires writing a 5-line adapter — never
new SQL or new RLS.

## UI integration (Home / Flash Finds)

- **AuthContext** now exposes `isAdmin: boolean` derived from `profile.role`.
- **Card-level delete button** appears in the action row when
  `canDeletePost()` returns true. Renders as a red trash icon for owners and a
  warning-amber `Shield` icon labelled "Admin Delete" when an admin acts on
  someone else's content.
- **Detail modal delete button** uses the same colour/icon scheme with a 44px
  tap target and a clearer "Admin Delete" / "Delete" label.

### Optimistic-removal flow

```
click Delete
   ├─ deletingIds.add(id)               (blocks repeat clicks)
   ├─ setPosts(filter id)               (instant disappear)
   ├─ close detail modal if open
   │
   ▼
deletePost()
   ├─ ok  → removedIds.add(id) + toast "Listing deleted"
   └─ err → re-insert row + toast "Couldn't delete: …"
```

`removedIds` is a tombstone set mirrored to a ref so the 10-second
`useLiveFeed` poll cannot resurrect a row that the current user just deleted
before Supabase replication settles. The merge filter is applied to all three
feed sources (`community_posts`, `external_listings`, `marketplace_listings`).

## Security notes

- The client `isAdmin` flag is **never trusted server-side** — it only controls
  whether the UI bothers to render a button. Every privileged action goes
  through Supabase RLS, which re-evaluates `public.is_admin()` against the
  authenticated session.
- `profiles.role` cannot be updated by an authenticated client because the
  `prevent_profile_field_escalation` trigger silently resets it. Promotion
  must happen via service-role or another admin.
- The Storage delete policy is scoped to the `avatars` bucket. If new buckets
  are added later they must opt in to the admin-delete policy explicitly.

## Rollback

To temporarily disable admin-wide delete without rolling back the schema:

```sql
DROP POLICY IF EXISTS "Owner or admin can delete posts"               ON community_posts;
DROP POLICY IF EXISTS "Owner or admin can delete flash finds"         ON flash_finds;
DROP POLICY IF EXISTS "Owner or admin can delete listings"            ON marketplace_listings;
DROP POLICY IF EXISTS "Owner or admin can delete external listings"   ON external_listings;

-- Restore owner-only deletes
CREATE POLICY "Users can delete own posts"
  ON community_posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
-- (repeat for the other three tables with their respective owner columns)
```

`profiles.role`, the trigger update, and `public.is_admin()` can be left in
place — they have no effect on normal users when the admin clause is removed
from the policies.

## Roadmap

Same `deletePost()` helper will back upcoming admin tooling:

- Marketplace delete from Marketplace.tsx + Profile.tsx own-listings list.
- Rare Radar request delete on the Rare Radar feed.
- Live Events / external listings delete from LiveHub.
- Reports queue: admin sees a "Reported" badge and can act with one click.
- Soft-delete + restore window (currently hard delete).
- Bulk actions on the admin moderation dashboard.
