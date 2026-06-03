---
name: Block needs a reachable unblock surface
description: Why blocked-user management must be a standalone list, not just an inline toggle
---

Blocking a user filters their content out of every feed, profile, listing, and
conversation (client-side via `fetchBlockedIds`). That means the inline
block/unblock toggle (`BlockUserButton`) becomes **unreachable** the moment a
block is applied — the user can never get back to the blocked person's surface
to flip it.

**Rule:** any block capability must be paired with a dedicated, always-reachable
"Blocked Users" management screen. In this app it lives at `/blocked`
(`BlockedUsers.tsx`), linked from Profile → Account, backed by
`fetchBlockedUsers()` in `lib/blocks.ts`.

**Why:** Apple Guideline 1.2 expects users to be able to manage blocks, and a
block with no undo is a UX dead-end / support burden.

**How to apply:** when touching blocking/muting/hiding features, confirm there is
a standalone list that enumerates the hidden entities and offers the reverse
action — don't rely on the inline toggle alone.
