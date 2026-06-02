# Apple App Store Compliance — TreasureTrail

This document summarizes the changes made to resolve the two App Store review
rejections, the one manual step required before resubmission, and guidance for
the reviewer reply / screen recording.

---

## Rejection 3 — Guideline 3.1.1 (In-App Purchase)

**Apple's issue:** the app exposed purchasable digital goods (Pro membership,
listing/event boosts) without using Apple's In-App Purchase.

**Resolution:** on the **iOS build only**, no purchase mechanism is shown.
Payments were already disabled app-wide (`PAYMENTS_ENABLED=false`, "coming
soon"); on iOS we additionally hide all prices and purchase CTAs.

- `src/lib/platform.ts` — `isIOS()` / `iosPaymentsBlocked()` helpers (native
  Capacitor iOS detection).
- `src/pages/Pro.tsx` — on iOS renders an informational screen with **no
  prices and no purchase buttons**.
- `src/components/ui/UpgradeProCard.tsx` — hidden on iOS.
- `src/pages/EventDetail.tsx`, `src/pages/WantedDetail.tsx` — boost purchase
  rows hidden on iOS.

**Web and Android behavior is unchanged. Stripe was not touched.**

---

## Rejection 4 — Guideline 1.2 (User-Generated Content)

**Apple's issue:** apps with UGC must provide the full safeguard set: a way to
report content, a way to block abusive users, content filtering, and an
agreement to terms with no objectionable content.

**Resolution — all four safeguards implemented:**

1. **Report objectionable content** — a generic Report control on every UGC
   surface (listings, finds, events, live events, profiles, messages). All
   reports flow to a single `content_reports` table.
   - `src/lib/reports.ts` — `submitReport()`, `REPORT_CATEGORIES`, and
     admin-only `fetchReports()` / `updateReportStatus()`.
   - `src/components/moderation/ReportButton.tsx`.
   - Wired into ListingDetail, FindDetail, EventDetail, LiveHub modal,
     PublicProfile, Messages.

2. **Block abusive users** — block from any profile, listing, find, or
   conversation (uses existing `src/lib/blocks.ts`).
   - `src/components/moderation/BlockUserButton.tsx`.

3. **Content filtering on publish** — objectionable text is rejected before it
   is stored (listings, community posts/finds, events, messages).
   - `src/lib/contentFilter.ts` — `containsObjectionable()`, `assertClean()`,
     `GUIDELINE_MESSAGE`.

4. **Terms acceptance at signup** — new accounts must explicitly accept the
   Terms of Service + Community Guidelines (and confirm 17+) before the account
   is created; `profiles.tos_accepted_at` is recorded best-effort.
   - `src/pages/SignUp.tsx`.

**Reviewer-verifiable screens (Profile → Account):**

- `src/pages/CommunityGuidelines.tsx` (`/guidelines`) — zero-tolerance content
  policy + report/block instructions + 24-hour moderation commitment.
- `src/pages/ReviewMode.tsx` (`/review-mode`) — a single screen that documents
  and links to every safeguard for the reviewer.
- `src/pages/AdminModeration.tsx` (`/admin/moderation`) — admin-only moderation
  queue (mark reports reviewing / actioned / dismissed). Gated by `isAdmin` in
  the UI and by RLS in the database.

Routes are registered in `src/components/AppShell.tsx`; links are in the
`Profile.tsx` Account section (Moderation Queue link appears only for admins).

---

## REQUIRED MANUAL STEP — apply the database migration

The agent cannot apply Supabase schema changes. **Before resubmitting**, apply
this migration so reports can be stored and moderated:

`supabase/migrations/20260602000010_apple_ugc_compliance.sql`

It creates:
- `public.content_reports` (the unified report table) + RLS policies
  (any user can insert; reporter-or-admin can select; admin can update) +
  indexes.
- `profiles.tos_accepted_at` column.

**How to apply (Supabase dashboard):**
1. Open your project at https://supabase.com/dashboard.
2. Left sidebar → **SQL Editor** → **New query**.
3. Open the migration file above, copy its entire contents, paste into the
   editor.
4. Click **Run**.
5. Confirm success (no errors). Until this is applied, reporting shows a clear
   "being set up" message and the moderation queue shows a migration hint — the
   app does not crash.

The status values used by the app (`pending`, `reviewing`, `actioned`,
`dismissed`) match the table's CHECK constraint exactly.

---

## Reviewer reply / screen-recording guidance

When replying to Apple in App Store Connect, point them to **Review Mode**:

> Profile tab → Account → **Review Mode**

Suggested recording flow:
1. **Report** — open any listing/find/profile, tap **Report**, choose a reason,
   submit.
2. **Block** — open a user profile or conversation, tap **Block User**.
3. **Content filter** — try posting a listing/message with objectionable text;
   show that it is rejected with the guideline message.
4. **Terms at signup** — show the required Terms + Community Guidelines
   acceptance on the sign-up screen.
5. **Community Guidelines** — Profile → Account → Community Guidelines.
6. (Optional) **Moderation Queue** — sign in as an admin and show
   `/admin/moderation` with status transitions.
7. **No IAP on iOS** — open the Pro screen and item boost rows to show no
   prices or purchase buttons are present on iOS.

---

## Verification status

- `npm run build` (strict `tsc` + Vite) passes.
- Workflow restarts and serves cleanly.
- Architect review: pass, no severe issues.
- Android/web purchase flows and Stripe: unchanged.
