# Scout Approval Flow Audit

_Last updated: 2026-05-19_

## 1. Why the badge was stuck on "Pending review"

The DB side of approval already worked. The frontend was the broken
half:

1. An admin updates `scout_applications.status = 'approved'` (or runs
   `approveScoutApplication(...)` server-side).
2. The `apply_scout_verification` trigger sets
   `profiles.scout_verified = true` immediately.
3. The applicant opens the app. `AuthContext.fetchProfile` only ran at
   sign-in time. The cached `profile.scout_verified` was still `false`.
4. `ScoutsTab` then evaluated:
   - `isVerified = !!profile?.scout_verified` → `false`
   - `app.status === 'pending' | 'approved'` → fell into the status
     card branch
5. Result: user sees "Pending review" (or "approved" label) but **no
   Verified Scout badge** anywhere in the app until a full sign-out /
   sign-in.

The DB was correct. The client was reading stale state.

## 2. Architecture (after fix)

```
        ┌──────────────────────────┐
        │   Admin / Moderator UI   │
        └────────────┬─────────────┘
                     │ approveScoutApplication(id)
                     ▼
     scout_applications.UPDATE status='approved'
                     │
                     │ AFTER UPDATE OF status (trigger)
                     ▼
        apply_scout_verification()
                     │
                     │ profiles.scout_verified = true
                     ▼
              public.profiles
                     │
   ┌─────────────────┼─────────────────┐
   │                 │                 │
   ▼                 ▼                 ▼
Verified badge   Listing detail    Public profile
in ScoutsTab     "Verified         shield + label
                  Seller" tag
```

Server side is the source of truth. The trigger handles the cross-table
sync atomically — clients never write to `scout_verified` directly.

## 3. Frontend state flow

`src/context/AuthContext.tsx` now exposes `refreshProfile()` alongside
`updateProfile()`:

| Action                          | Triggers profile refresh? |
| ------------------------------- | ------------------------- |
| Sign in                         | yes (initial fetch)       |
| Token refresh (onAuthStateChange)| yes                      |
| `refreshProfile()` call         | yes                       |
| `updateProfile(patch)`          | yes (local merge)         |

`src/pages/Profile.tsx` → `ScoutsTab` consumes `refreshProfile` and
re-syncs on three triggers:

1. **Mount** — `fetchMyScoutApplication` + `refreshProfile`.
2. **Window focus** — covers "approve in DB → switch back to tab".
3. **Visibility change** — covers PWA / mobile background → foreground.

The "stuck on Pending review" path is now physically impossible: any
return to the tab pulls a fresh profile row.

## 4. Profile synchronization rules

| Source                        | Writes `scout_verified` |
| ----------------------------- | ----------------------- |
| `apply_scout_verification` trg | yes (the only writer)  |
| Client `updateProfile()`      | no (column not in form) |
| `revokeScoutVerification()` fallback | yes — only when no application row exists (legacy direct grants) |

The trigger is the single canonical writer for the normal lifecycle.
Clients only set `scout_applications.status`; the trigger fans out.

## 5. Cache invalidation

There is no react-query / SWR layer yet — caches are component-local
`useState`. Invalidation strategy:

- **ScoutsTab local cache** — invalidated on `focus`, `visibilitychange`,
  and any moderation helper success (caller can call `refresh()`).
- **AuthContext profile cache** — invalidated by `refreshProfile()` and
  `onAuthStateChange`.
- **Cross-page badges** (PublicProfile, ListingDetail, FindDetail,
  Marketplace cards) — each page re-fetches on mount, so a navigation
  away and back surfaces the new badge. Live-feed pages that poll
  (`useLiveFeed`) pick it up on the next tick.

If we later add react-query, the moderation helpers should call
`queryClient.invalidateQueries(['profile', userId])` and
`['scout_application', userId]` after each write.

## 6. Moderation helpers (`src/lib/scoutApplications.ts`)

All three are admin-only — enforced by `scout_apps_update_admin` RLS
(`USING/WITH CHECK public.is_admin()`) plus the
`guard_scout_application_update` trigger.

```ts
approveScoutApplication(applicationId, { reviewerId?, note? })
rejectScoutApplication(applicationId,  { reviewerId?, note? })
revokeScoutVerification(userId,        { reviewerId?, note? })
```

- `approveScoutApplication` → status='approved'; trigger flips badge;
  sends `scout_application` notification to applicant.
- `rejectScoutApplication` → status='declined'; trigger ensures badge
  is `false`; notifies applicant with optional reviewer note.
- `revokeScoutVerification` → finds the latest approved application
  and flips it to 'declined' (trigger handles the rest). Returns an
  error for legacy direct-grant accounts (no application row) because
  the `prevent_profile_field_escalation` trigger blocks JWT-originated
  writes to `scout_verified`. A SECURITY DEFINER RPC is the planned
  fix and is on the roadmap.

Non-admin callers get an RLS error string back; the helpers do not
throw, so callers can branch on `{ error }`.

## 7. Manual test plan

1. **Apply** — Profile → Scouts tab → "Apply to be a Scout" → submit
   pitch. Expect "Pending review" badge.
2. **Approve** — In SQL editor (as service role, simulating admin):
   ```sql
   update scout_applications set status='approved'
     where applicant_id = '<user-uuid>'
     order by created_at desc limit 1;
   ```
   Or call `approveScoutApplication(id)` from an admin client.
3. **Switch back to the app tab.**
4. **Expected** — within one focus event:
   - Pending badge disappears.
   - "You're a Verified Scout" panel renders.
   - Shield/Verified badge appears next to the username on
     PublicProfile, ListingDetail, FindDetail.
5. **Reload** — verified state persists (it's persisted in the
   `profiles` row, not local state).
6. **Revoke** — call `revokeScoutVerification(userId)`; tab refocus
   removes badge.

## 8. Moderation roadmap

Now that helpers exist, the natural next steps are:

- `/admin/scouts` route gated by `isAdmin`. Lists pending applications
  with approve / decline buttons calling the helpers above.
- Reviewer audit trail — already captured in `reviewer_id` and
  `reviewer_note` columns; surface them on the application detail view.
- Email notification on approval — wire `notifyUser` output into the
  email pipeline once SES/Resend is configured.
- Bulk operations + search by region/specialty.
- Public "Scout directory" page filtering `profiles.scout_verified`.

## 9. Republish requirements

| Change kind                          | Requires republish? |
| ------------------------------------ | ------------------- |
| DB-only approval (`UPDATE` status)   | **No** — handled by client refetch on focus. |
| New moderation helpers + AuthContext.refreshProfile + ScoutsTab refetch | **Yes** — this is frontend code. |
| Future admin UI route                | Yes (frontend)      |
