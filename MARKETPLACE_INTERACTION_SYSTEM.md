# Marketplace Interaction System

PHASE 8 ships the core conversion loop for TreasureTrail:

```
Home Feed Card
  → Listing Detail (/listing/:id)
    → Seller Profile (/profile/:username)
    → Message Seller (/messages/:id)
```

It also adds DB-backed Save and Scout actions and a real direct-message
inbox, replacing the previous placeholder UI.

---

## 1. Routing Architecture

| Route                  | Component        | Purpose                                                      |
| ---------------------- | ---------------- | ------------------------------------------------------------ |
| `/listing/:id`         | `ListingDetail`  | Marketplace listing detail (mirror of `/find/:id`)           |
| `/find/:id`            | `FindDetail`     | Community-post detail (Flash Find / Rare Radar)              |
| `/messages`            | `Messages`       | Inbox — list of conversations the signed-in user is in       |
| `/messages/:id`        | `Messages`       | Same component; branches on `useParams()` into chat view     |
| `/profile/:username`   | `PublicProfile`  | Public seller profile (already shipped)                      |

`/listing/:id` and `/find/:id` are deliberately separate. Marketplace
items live in `marketplace_listings` and Flash Finds / Rare Radar live
in `community_posts`. Two tables, two ids → two routes. There is no
unified id namespace and therefore no collision risk.

All routes are lazy-loaded via `lazy(() => import(...))` in
`AppShell.tsx`, so each page is its own Vite chunk.

---

## 2. Conversion Flow

1. User scrolls Home feed and taps a marketplace card.
2. `navigate('/listing/:id')` opens `ListingDetail`, which fetches
   the full row + joined seller profile.
3. Tapping the uploader row navigates to `/profile/:username`.
4. Tapping **Message Seller** calls
   `getOrCreateConversation({ otherUserId, listingId, listingKind })`.
   The RPC enforces pair-ordering and uniqueness server-side; it
   returns an existing conversation when one already exists for the
   same `(pair, listing)` tuple.
5. The client navigates to `/messages/:conversationId` and the chat
   view renders, polls for new messages every 5s, and marks them read.

---

## 3. Database Schema

Migration: `supabase/migrations/20260519000002_marketplace_interaction_system.sql`
(also appended to `SUPABASE_PASTE_THIS.sql`).

### `conversations`
| column                | type        | notes                                            |
| --------------------- | ----------- | ------------------------------------------------ |
| `id`                  | uuid PK     |                                                  |
| `user_a_id`           | uuid        | always `LEAST(uid, other)` — ordering invariant  |
| `user_b_id`           | uuid        | always `GREATEST(uid, other)`                    |
| `listing_id`          | uuid NULL   | optional listing context                         |
| `listing_kind`        | text NULL   | `marketplace` \| `community_post` \| `external_listing` |
| `last_message_at`     | timestamptz | bumped on each insert via client                  |
| `last_message_preview`| text        | first 140 chars of latest message                |
| `created_at`          | timestamptz |                                                  |

A partial-unique index over `(user_a_id, user_b_id, COALESCE(listing_id,'00..'), COALESCE(listing_kind,''))` guarantees one conversation per `(pair, listing)`.

### `messages` (extended)
Existing `messages` table is amended with:
- `conversation_id uuid` (FK → conversations, ON DELETE CASCADE)
- `listing_id uuid`
- `listing_kind text`

Legacy rows are back-filled into conversations via a `DO $$ ... $$` block.

### `saved_listings`
Composite PK `(user_id, listing_id, listing_kind)`. RLS gates every
operation by `auth.uid() = user_id`.

### `scout_requests`
`(id, listing_id, listing_kind, requester_id, seller_id, status, message, created_at, updated_at)`.
Statuses: `pending | accepted | declined | completed | cancelled`.

---

## 4. Ownership & Permissions

| Action                        | Allowed when                                            |
| ----------------------------- | ------------------------------------------------------- |
| Read conversation             | `auth.uid() IN (user_a_id, user_b_id)` OR admin         |
| Insert conversation           | **Blocked**. Use `get_or_create_conversation` RPC only. |
| Send message                  | Caller is sender AND member of the conversation         |
| Mark message read             | Caller is receiver (existing UPDATE policy)             |
| Save listing                  | `auth.uid() = user_id`                                  |
| Create scout request          | `auth.uid() = requester_id`                             |
| Update scout request          | Participant (`requester_id` or `seller_id`)             |
| Edit / Delete listing         | `seller_id = auth.uid()` (owner) OR `is_admin()`        |

The Listing Detail page surfaces the owner / non-owner action sets
based on `listing.seller_id === user.id`:

| Owner view                 | Other-user view              |
| -------------------------- | ---------------------------- |
| Edit Listing (Coming Soon) | Message Seller               |
| View Public Link           | Scout This Item              |
| Delete Listing             | Follow Seller                |
|                            | Save Listing                 |
|                            | Share                        |
|                            | Report (Coming Soon)         |

Admins see the Delete button on any listing, styled distinctly
(amber) and labelled "Admin Delete".

---

## 5. Realtime Strategy

**V1**: short-interval polling — small, predictable, no socket budget.
- Inbox list: refetched every **15 seconds** while mounted.
- Open chat: delta poll every **5 seconds** using `created_at >
  lastSeen` so payloads stay small after the initial load.

**Why polling first**: the data contract is the same as it will be
under Supabase Realtime channels (`INSERT` on `messages` filtered by
`conversation_id`). Swapping the transport is a localized change in
`Messages.tsx` once we're ready.

**Send pipeline**:
1. Optimistic push of a `temp-*` message into local state.
2. `insert into messages ... returning *`.
3. On success the temp is replaced in-place with the server row.
4. On failure the temp is rolled back, the draft is restored, and an
   error banner appears for 3s.
5. The next poll filters out the server-echoed copy of any
   already-rendered temp so the user never sees a duplicate bubble.

---

## 6. Admin Moderation Logic

Admin override reuses the existing `public.is_admin()` SECURITY
DEFINER function introduced in
`20260519000001_admin_role_and_moderation.sql`.

- `canDeletePost(user, profile, deletable)` returns `true` when the
  caller is the row owner OR `profile.role === 'admin'`.
- `marketplaceListingToDeletable(listing)` adapts a
  `MarketplaceListing` to the same `DeletablePost` shape used by
  community posts so the moderation helpers are unified.
- The Delete button is visually differentiated for admin-on-someone-
  else (amber, "Admin Delete" + shield icon) vs owner (red, "Delete
  Listing" + trash icon).

Conversations and messages are *not* admin-deletable from the UI in
V1 — RLS still lets admins SELECT them for support / audit, but the
moderation surface is intentionally narrow until we ship a proper
moderation queue.

---

## 7. Mobile Findings

| Concern                              | Resolution                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Sticky composer behind keyboard      | `padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 8px)`             |
| Chat auto-scroll on new messages     | `useEffect` sets `scrollTop = scrollHeight` on `messages.length` change    |
| Card tap target ≥ 44px               | Every action button uses `minHeight: 44` / 56                              |
| Image gallery / zoom                 | Hero image is a `<button>`, opens a full-screen `role="dialog"` lightbox   |
| No dead clicks when profile missing  | Uploader row degrades to a non-interactive `<div>` if `username` is null   |
| Listing share fallback               | Uses Web Share API when available, clipboard otherwise, toast on failure   |

---

## 8. Future Monetization Hooks

The schema and routes are intentionally shaped so the following can
land without a migration:

- **Promoted scouts** — `scout_requests.metadata jsonb` can carry a
  bid amount or fee tier; UI surfaces a "Sponsored" badge.
- **Saved-search alerts** — `saved_listings` already records
  `listing_kind`, so a future job can match new listings against
  saved kinds + categories.
- **Paid Boost on listings** — owner action grid has slots open
  next to Edit / View Public Link.
- **Tipping in chat** — `messages` extended with `metadata jsonb`
  later can carry payment intents; the bubble renderer can switch
  on `metadata.type` without breaking the text path.

---

## 9. Verification Checklist

| Check                                                 | Result                                  |
| ----------------------------------------------------- | --------------------------------------- |
| TypeScript clean (`tsc --noEmit`)                     | ✓                                       |
| Migration appended to `SUPABASE_PASTE_THIS.sql`       | ✓ (2,352 lines total)                   |
| Home marketplace card → `/listing/:id`                | ✓                                       |
| Marketplace page card → `/listing/:id`                | ✓ (legacy ItemDetail kept as dead path) |
| Owner sees Edit/Delete/View Public                    | ✓                                       |
| Non-owner sees Message/Scout/Follow/Save/Share        | ✓                                       |
| Message Seller creates/reuses conversation            | ✓ (via SECURITY DEFINER RPC)            |
| Optimistic send with rollback on failure              | ✓                                       |
| Polling delta updates (no duplicate bubbles)          | ✓                                       |
| Unread badges in inbox                                | ✓                                       |
| Save toggle persists across reload (DB for signed-in) | ✓                                       |
| Scout request fires seller notification               | ✓ (via `notify_user` RPC, type `scout_response`) |

---

## 10. Files Touched

**Added**
- `supabase/migrations/20260519000002_marketplace_interaction_system.sql`
- `src/lib/messaging.ts`
- `src/lib/savedListings.ts`
- `src/lib/scouts.ts`
- `src/pages/ListingDetail.tsx`
- `MARKETPLACE_INTERACTION_SYSTEM.md`

**Changed**
- `src/pages/Messages.tsx` — full rewrite (inbox + chat)
- `src/components/AppShell.tsx` — `/listing/:id` + `/messages/:id` routes
- `src/pages/Home.tsx` — marketplace cards navigate, modal removed
- `src/pages/Marketplace.tsx` — `openDetail` routes to `/listing/:id`
- `SUPABASE_PASTE_THIS.sql` — migration appended

---

## 11. Known Deferred Work

- **Edit Listing UI** — button is rendered disabled with "Coming Soon".
- **listing_views table** — analytics-only, no UX impact in V1.
- **Realtime channels** — polling is in place; channel upgrade is a
  localized change in `Messages.tsx`.
- **Scout acceptance flow** — `scout_requests.status` transitions exist
  in the schema but the seller-side UI for accept / decline is not yet
  surfaced. Notifications already route to the seller.
- **Conversation moderation surface** — admins can read via RLS but
  there is no admin-side message deletion UI.
