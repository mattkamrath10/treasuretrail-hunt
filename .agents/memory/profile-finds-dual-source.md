---
name: Profile "Finds" is a dual-source aggregate
description: Why per-user finds UI must merge community_posts and marketplace_listings
---

The "Finds" number on a profile header is computed as
`count(community_posts where user_id) + count(marketplace_listings where seller_id)`.

**Rule:** any UI that lists a user's "finds" (carousel, grid, tab) must read
BOTH tables and merge them, or it will under-count and contradict the header.

**Why:** the original profile grid queried only `community_posts`, so a user
with 1 community post and many marketplace listings appeared to have a single
find even though the header said "many" — the reported PublicProfile bug.

**How to apply:** the showcase carousel (`UserShowcase.tsx`) merges both sources
sorted by `created_at`, routing each item to `/find/:id` (community) or
`/listing/:id` (marketplace). Keep it the single source of profile "finds"
display to avoid stat/content drift.
