# PHASE 9 — Trust, Retention & Polish — Audit

Date: 2026-05-19
Migration: `supabase/migrations/20260519000003_trust_polish.sql`
(also appended to `SUPABASE_PASTE_THIS.sql`)

## Scope shipped

### Database (T001)
- `scout_applications` — pitch + region + status
  (`pending|approved|declined|withdrawn`); partial unique index keeps
  **one open application per user** while leaving history queryable.
  Trigger `apply_scout_verification` flips `profiles.scout_verified`
  when a row transitions to `approved`.
- **Two-tier UPDATE policy** for `scout_applications`: applicants may
  only touch their own *pending* row and may only set status to
  `withdrawn`; admins (via `public.is_admin()`) hold the review
  surface. A defense-in-depth `BEFORE UPDATE` trigger
  (`guard_scout_application_update`) re-checks those rules at the
  database level so a future policy regression cannot let an applicant
  self-promote to `approved`.
- `user_blocks` — composite PK `(blocker_id, blocked_id)`; idempotent
  block/unblock via upsert + `ignoreDuplicates`. RLS limits reads to the
  blocker.
- `listing_views` — per-user-per-day dedup of detail-page views.
  Anonymous viewers do **not** write rows (the SECURITY DEFINER RPC
  short-circuits on null `auth.uid()`), so the counter is *signed-in
  unique viewers per day*, not total impressions.
- `listing_view_counts` & `listing_save_counts` views — used by
  `fetchListingEngagement` and the PublicProfile saves-received roll-up.
- `notify_user` allow-list expanded with `scout_request`,
  `scout_application`, `reputation_milestone`.

### Libraries (T002)
- `src/lib/scoutApplications.ts` — submit / fetch latest application,
  with client-side validation (pitch 20–2000 chars).
- `src/lib/blocks.ts` — `blockUser`, `unblockUser`, `isUserBlocked`,
  `fetchBlockedIds` (returns a `Set<string>` for O(1) feed filtering).
- `src/lib/listingViews.ts` — `trackListingView` (best-effort, swallows
  errors), `fetchListingEngagement` (parallel HEAD-count calls).
- `src/lib/reputation.ts` — `profileCompleteness`, `accountAge`,
  `normalizeReputation`, `reputationTier`.
- `src/lib/notifications.ts` — `NotificationType` union extended to
  match the DB allow-list.

### Image pipeline (T003)
- `compressImage` (1600 px @ 0.82) is now invoked on the FlashFinds
  upload path; original `File` is used as a fallback if canvas/decoding
  fails so uploads never fully break.
- Profile avatar runs through a 512 px @ 0.85 FileReader → canvas
  pipeline before upload.
- Image tags throughout the feed already use the project's
  `ImageWithFade` wrapper which sets `loading="lazy"` and
  `decoding="async"`.

### Home onboarding checklist (T004)
- New `tt_home_onboarded` localStorage flag (separate from the
  pre-login `tt_onboarded` splash) gates a dismissible 3-step card
  shown only when the user is signed in: complete profile, share first
  find, follow your first scout. Each row is a touch-target ≥36 px.
  Profile/following checks flip the marker from numeral → check.

### Engagement metrics (T005)
- `ListingDetail.tsx` & `FindDetail.tsx`: `trackListingView` fires once
  on mount when a user is signed in; `fetchListingEngagement` populates
  a chip strip ("N viewers · N saves") that renders only when there's
  at least one count. Saving optimistically bumps the save chip so the
  UI reflects the click immediately.

### PublicProfile (T006)
- Verified Scout badge with tooltip (`title` + `aria-label`) appears
  next to rank/level/XP when `scout_verified = true`.
- New stats grid: Finds / Followers / Saves received / Reputation
  (normalised to 0–5).
- Self-only card to apply (or see "Pending"/"Try again with more
  detail" depending on the last application state), with a 420-px
  modal that posts to `scout_applications` and surfaces the validation
  error inline.
- Non-owner action row: Follow + Message side-by-side, plus a subtle
  "Block User" pill below; blocked state hydrates from
  `isUserBlocked` so re-visiting a blocked profile stays correct.

### Report + Block + Hide (T007)
- `ReportListingButton` was already wired in PHASE 8 — verified.
- Block actions added on `ListingDetail` (Block Seller button) and
  `PublicProfile`; both navigate away after success with a toast.
- Feed-side hide implemented in `Home.tsx` via `fetchBlockedIds` →
  `Set` filter applied inside the `visibleItems` memo against
  `user_id` / `seller_id`.

### Notify dispatch (T008)
- `ListingDetail` save action dispatches `listing_saved` to the seller
  (idempotent at the RPC level; type allow-listed in the migration).
- Follow notification was already wired in `PublicProfile` — verified.

### Share preview / OG (T009)
- `index.html` static OG/Twitter tags polished: new title + description,
  `og:site_name`, `og:image:width/height/alt`, `og:locale`,
  `twitter:image:alt`, `keywords`, and `robots` meta.

#### Known limitation — no SSR
This is a Vite SPA with no server-side rendering, so per-listing
dynamic OG tags (e.g. a marketplace listing's photo + title in a
shared link's preview) cannot be produced. Crawlers see the static
`index.html`. Adding per-listing previews requires either:
1. A serverless edge function that intercepts crawler User-Agents and
   returns prerendered HTML, or
2. Moving the routing layer to Next.js / Remix with route-level
   metadata.

Out of scope for V1; documented here so a future phase can pick it up.

### Feed quality (T010)
- `visibleItems` memo in `Home.tsx` now filters:
  - Posts/listings/marketplace items whose owner id is in `blockedIds`.
  - Cards that have neither a title/caption nor an image (broken rows).
- `blockedIds` is added to the memo's dependency list so unblocks
  re-show content without a full reload.

## Trust model — what *is* and *isn't* guaranteed

- **Block is a soft UX feature.** The DB does not enforce visibility;
  blocked users can still view public listings via direct URL or via
  another account. The block hides them from your feed, your profile
  CTA, and your detail pages. This is documented in `blocks.ts`.
- **Verified Scout is moderator-curated.** Approval flips
  `profiles.scout_verified` via a SECURITY DEFINER trigger; users
  cannot self-approve. The badge is purely cosmetic until other
  surfaces (scout-request priority, etc.) opt in.
- **View counts undercount anonymous traffic.** Only authenticated
  viewers are counted; this is intentional to avoid bot inflation.

## Files changed (highlights)

- New: `src/lib/{scoutApplications,blocks,listingViews,reputation}.ts`,
  `supabase/migrations/20260519000003_trust_polish.sql`,
  this file.
- Modified: `src/pages/{Home,ListingDetail,FindDetail,PublicProfile}.tsx`,
  `src/lib/notifications.ts`, `src/components/FlashFinds*`,
  `index.html`, `SUPABASE_PASTE_THIS.sql`.

## How to apply

```bash
# Apply the new tables, views, RPC and trigger:
psql "$DATABASE_URL" -f supabase/migrations/20260519000003_trust_polish.sql
# (Or paste the appended block from SUPABASE_PASTE_THIS.sql)
```

No env vars, no new third-party services required.
