# TreasureTrail — Apple App Store Compliance Report

**Date:** June 02, 2026
**Scope:** Full source audit for Apple Guideline 3.1.1 (In-App Purchase) and
Guideline 1.2 (User-Generated Content), plus Terms of Service implementation.
**Platforms:** React + Vite frontend, Express backend (`server/`), Supabase
(Postgres) database, Capacitor v8 native shell (iOS appId `com.treasuretrail.hunt`).

---

## Compliance status at a glance

| Guideline | Area | Status |
|-----------|------|--------|
| 3.1.1 | In-App Purchase | ✅ **Compliant** — no purchasable digital goods exposed on iOS; no external/Stripe checkout exists anywhere |
| 1.2 | Report objectionable content | ✅ Implemented |
| 1.2 | Block abusive users | ✅ Implemented |
| 1.2 | Content filtering on publish | ✅ Implemented |
| 1.2 | Content removal (owner/admin) | ✅ Implemented |
| 1.2 | Admin moderation queue | ✅ Implemented |
| 1.2 | User suspension / ban | ⚠️ **Not implemented** (residual — see risks) |
| — | Terms of Service acceptance at signup | ✅ Implemented + stored in DB |
| — | Privacy Policy accessible | ✅ Implemented |
| — | Community Guidelines page | ✅ Implemented |
| 5.1.1(v) | Account deletion | ✅ Implemented (server-side, cascading) |

---

## ISSUE #1 — Guideline 3.1.1 (In-App Purchase)

### Finding: there is NO payment mechanism of any kind currently active, and NONE is exposed on iOS.

**Search performed** for: `stripe`, `checkout`, `subscription`, `membership`,
`pro`, `premium`, `upgrade`, `billing`, `payment`, `paypal`, `square`,
`purchase`, `buy`, `pricing`, `plan`.

#### 1. No third-party / external checkout exists
- **No Stripe, PayPal, or Square integration is wired.** Every reference to
  "Stripe" in the codebase is a *comment describing future work*, not active
  code:
  - `src/lib/payments.ts:11,23` — "Until Stripe Checkout is wired (next phase)…"
  - `server/grants.ts:10` — "This is where the Stripe webhook will call in the next phase."
  - `src/lib/entitlements.ts:8`, `src/pages/Pro.tsx:137-141`,
    `src/pages/EventDetail.tsx:871`, `src/pages/LiveHub.tsx:1400` — all comments.
- There is **no `stripe`, `@stripe/*`, `paypal`, or `square` dependency** in
  `package.json`.

#### 2. The payment boundary is a hard no-op
- `src/lib/payments.ts:24` — `export const PAYMENTS_ENABLED = false;`
- `src/lib/payments.ts:39-43` — `startBoostPurchase()` returns
  `{ ok: false, error: "Payments are being set up…", comingSoon: true }`.
- `src/lib/payments.ts:49-51` — `startProUpgrade()` returns the same no-op.
- These initiators perform **no privileged writes**. Paid columns are locked at
  the database level (migration `20260529000002_revenue_lockdown.sql`); the only
  path to grant paid state is the **service-role server** (`server/grants.ts`),
  triggered by admin-only endpoints (`server/index.ts:285 /api/admin/pro`,
  `:301 /api/admin/boost`). There is **no public payment route**.

#### 3. iOS hides all prices and purchase CTAs
Platform detection: `src/lib/platform.ts` — `isIOS()` (line 13) /
`iosPaymentsBlocked()` (line 28). On native iOS, every purchase surface is
suppressed:
- `src/pages/Pro.tsx:135,216,272-315` — `hidePurchase` removes all prices and
  upgrade buttons; iOS sees an information-only screen.
- `src/components/ui/UpgradeProCard.tsx:21` — returns `null` on iOS.
- `src/pages/EventDetail.tsx:883` — boost row returns `null` on iOS.
- `src/pages/WantedDetail.tsx:427` — boost row returns `null` on iOS.

#### 4. Pricing constants exist but are not actionable on iOS
- `src/lib/entitlements.ts:76-87` — `BOOST_PRODUCT` ($3 / 72h) and
  `PRO_PRODUCT` ($9/mo) are display/config constants. On iOS they are never
  rendered (see §3); on web/Android they render but lead only to the
  "coming soon" no-op (§2).

#### 5. Digital features and whether they require payment
- **AI Treasure Scan** (`server/index.ts:92 /api/ai-scan/usage`,
  `:125 /api/ai-scan`) is **free to all signed-in users** with a daily soft cap
  (`FREE_DAILY_LIMIT` vs `PRO_DAILY_SOFT_CAP`). It is **not sold** — there is no
  purchase to lift the cap on iOS, so no IAP is required.
- **Analytics / Pro features** (`src/lib/entitlements.ts`) are tier-gated, but
  the Pro tier **cannot be purchased on iOS**, so no digital good is sold.

### 3.1.1 verdict: **Compliant.**
On iOS no purchasable digital goods, prices, or purchase CTAs are presented, and
no external/web checkout exists. Apple has no purchasable item to require IAP
for. **Residual risk: LOW.**

**Recommended follow-up (not a blocker):** when payments are eventually
introduced on iOS, they must go through Apple In-App Purchase (StoreKit), not
Stripe. Until then, keep `iosPaymentsBlocked()` gating in place on every new
purchase surface.

---

## ISSUE #2 — Guideline 1.2 (User-Generated Content)

**Search performed** for: `report`, `flag`, `moderation`, `block`, `blocked`,
`suspend`, `ban`, `abuse`, `content review`, `terms`, `tos`, `eula`,
`community guidelines`.

### a) User reporting system — ✅ EXISTS
- **Core:** `src/lib/reports.ts` — `submitReport()` writes to the unified
  `content_reports` table; `REPORT_CATEGORIES` (Spam, Scam/fraud, Harassment,
  Hate speech, Sexual content, Violence, Copyright, Other). Graceful error if
  the table is missing (`42P01`).
- **UI:** `src/components/moderation/ReportButton.tsx`, wired into:
  - Listings — `src/pages/ListingDetail.tsx:447`
  - Finds — `src/pages/FindDetail.tsx:427`
  - Events — `src/pages/EventDetail.tsx:429`
  - Profiles — `src/pages/PublicProfile.tsx:300`
  - Messages — `src/pages/Messages.tsx:371`
  - Live/external listings — `src/components/listing/ReportListingButton.tsx`
    used in `LiveHub.tsx:904`, `Marketplace.tsx:516`, `Auctions.tsx:575`.
- **How it works:** user taps Report → picks a category/reason → row inserted
  into `content_reports` (reporter_id = `auth.uid()`, enforced by RLS).

### b) User blocking system — ✅ EXISTS
- **Core:** `src/lib/blocks.ts` — `blockUser` / `unblockUser` /
  `fetchBlockedIds` / `isUserBlocked` against the `user_blocks` table
  (idempotent composite PK).
- **UI:** `src/components/moderation/BlockUserButton.tsx`, wired into
  `EventDetail.tsx:436`, `Messages.tsx:368`, `FindDetail.tsx:431`.
- **How it works:** block row upserted; feed queries filter out blocked users'
  content client-side via `fetchBlockedIds()`.

### c) Content removal system — ✅ EXISTS
- **Core:** `src/lib/moderation.ts` — `deletePost()` removes the storage image
  (best-effort) then the DB row; RLS enforces owner-or-admin. `canDeletePost()`
  (line 16) authorizes owner or `role === 'admin'`.
- **How it works:** owners delete their own content anywhere; admins can delete
  any content.

### d) Admin moderation system — ✅ EXISTS
- **Core:** `src/lib/reports.ts` — `fetchReports()` / `updateReportStatus()`
  (admin-only via RLS `is_admin()`).
- **UI:** `src/pages/AdminModeration.tsx` (route `/admin/moderation`) — a queue
  filtered by status (pending / reviewing / actioned / dismissed); non-admins
  get an access-denied panel; database RLS enforces admin access independently.

### e) Content filtering system — ✅ EXISTS
- **Core:** `src/lib/contentFilter.ts` — `containsObjectionable()` /
  `assertClean()` / `GUIDELINE_MESSAGE`; curated profanity/hate/explicit term
  list with word-boundary matching.
- **Wired into create/publish flows:**
  - Events — `src/lib/events.ts:358` (throws `GUIDELINE_MESSAGE`)
  - Community posts/finds — `src/lib/database.ts:109`
  - Marketplace listings — `src/lib/database.ts:208`
  - Messages — `src/lib/messaging.ts:67`
- **How it works:** objectionable text is rejected **before** it is stored; the
  user sees the guideline message.

### f) User suspension / ban system — ⚠️ NOT IMPLEMENTED
- No suspend/ban flow exists. `src/lib/moderation.ts:125-127` documents it as
  future work ("`suspendUser, banUser`"). Admins can **remove content** and
  **triage reports** today, but cannot disable an account from the UI.
- **Impact on 1.2:** Apple's 1.2 requirement is satisfied by reporting,
  blocking, filtering, content removal, and a 24-hour moderation commitment —
  all present. User suspension is a *best-practice enhancement*, not a strict
  1.2 gate. See risks.

### g) Terms of Service acceptance — ✅ EXISTS (see Issue #3)
### h) Community Guidelines — ✅ `src/pages/CommunityGuidelines.tsx` (`/guidelines`)
### i) Account deletion — ✅ EXISTS
- `src/lib/account.ts` → server `POST /api/account/delete`
  (`server/index.ts:368`), service-role delete of the auth user; all tables
  referencing `auth.users(id) ON DELETE CASCADE` are wiped automatically.
### j) Ability to remove objectionable content — ✅ via (c) + (d).

### 1.2 verdict: **Compliant** for the required safeguard set.

---

## ISSUE #3 — Terms of Service

- **Presented before registration & required:** `src/pages/SignUp.tsx` — a
  required acceptance checkbox (`acceptedTerms`, line 22); submission is blocked
  until checked (`if (!acceptedTerms)`, line 45). The label (line 162-163)
  reads "I am 17+ and agree to the TreasureTrail Terms of Service / Community
  Guidelines" with links.
- **Acceptance stored in database:** `src/pages/SignUp.tsx:67` writes
  `tos_accepted_at = now()` to the user's `profiles` row (column added in
  migration `20260602000010_apple_ugc_compliance.sql`).
- **Privacy Policy accessible:** `src/pages/PrivacyPolicy.tsx` (route
  `/privacy`), linked from Profile → Account.
- **Community Guidelines present:** `src/pages/CommunityGuidelines.tsx` (route
  `/guidelines`), linked from Profile → Account and the signup screen.
- **Terms of Service page:** `src/pages/TermsOfService.tsx` (route `/terms`).
- **Reviewer aid:** `src/pages/ReviewMode.tsx` (route `/review-mode`,
  Profile → Account → Review Mode) links to every safeguard for App Review.

---

## ISSUE #4 — Remaining Apple risks & recommended fixes

### Resolved
- ✅ 3.1.1 — no purchasable digital goods on iOS; no external checkout exists.
- ✅ 1.2 — reporting, blocking, filtering, content removal, admin queue,
  Terms acceptance, Community Guidelines, account deletion all implemented.

### Unresolved / residual risks
1. **(Low) User suspension/ban not implemented.** Mitigation: content removal +
   report triage + blocking cover the 1.2 requirement. *Recommended fix:* add an
   admin "suspend user" action routed through `moderation.ts` + a DB flag
   (future enhancement).
2. **(Operational) The database migration must be applied.**
   `supabase/migrations/20260602000010_apple_ugc_compliance.sql` creates
   `content_reports` and `profiles.tos_accepted_at`. If not applied, reporting
   shows a "being set up" message and the admin queue shows a migration hint
   (the app does not crash). **Status: applied by owner on 2026-06-02.**
3. **(Process) New iOS build required.** The Replit Republish button updates the
   website only. The compliance fixes reach Apple via a new Codemagic iOS build
   submitted in App Store Connect, with a reviewer note pointing to
   Profile → Account → **Review Mode**.
4. **(Forward-looking) When iOS payments are added,** they MUST use Apple IAP
   (StoreKit), never Stripe/web checkout, while `iosPaymentsBlocked()` continues
   to gate any non-IAP purchase surface.

---

## Key file index

**Payments / 3.1.1**
- `src/lib/payments.ts`, `src/lib/entitlements.ts`, `src/lib/boost.ts`
- `src/lib/platform.ts` (iOS gating)
- `src/pages/Pro.tsx`, `src/components/ui/UpgradeProCard.tsx`,
  `src/pages/EventDetail.tsx`, `src/pages/WantedDetail.tsx`
- `server/grants.ts`, `server/index.ts` (admin-only grant endpoints)

**Moderation / 1.2**
- `src/lib/reports.ts`, `src/lib/blocks.ts`, `src/lib/moderation.ts`,
  `src/lib/contentFilter.ts`, `src/lib/account.ts`
- `src/components/moderation/ReportButton.tsx`,
  `src/components/moderation/BlockUserButton.tsx`,
  `src/components/listing/ReportListingButton.tsx`
- `src/pages/AdminModeration.tsx`, `src/pages/CommunityGuidelines.tsx`,
  `src/pages/ReviewMode.tsx`
- Wiring: `ListingDetail.tsx`, `FindDetail.tsx`, `EventDetail.tsx`,
  `PublicProfile.tsx`, `Messages.tsx`, `LiveHub.tsx`, `Marketplace.tsx`,
  `Auctions.tsx`
- Filter wiring: `src/lib/events.ts`, `src/lib/database.ts`,
  `src/lib/messaging.ts`

**Terms / signup**
- `src/pages/SignUp.tsx`, `src/pages/TermsOfService.tsx`,
  `src/pages/PrivacyPolicy.tsx`

**Database**
- `supabase/migrations/20260602000010_apple_ugc_compliance.sql`
- `supabase/migrations/20260529000002_revenue_lockdown.sql`

---

## Summary

- **Resolved Apple issues:** Guideline 3.1.1 (no purchasable digital goods on
  iOS, no external checkout) and Guideline 1.2 (full UGC safeguard set:
  reporting, blocking, filtering, content removal, admin moderation, Terms
  acceptance, Community Guidelines, account deletion).
- **Unresolved risks:** only the low-severity absence of a user
  suspension/ban tool (1.2 is still satisfied without it), plus the operational
  steps of applying the migration (done) and producing a new iOS build for
  resubmission.
