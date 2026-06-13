---
name: Event/item deletion storage cleanup
description: How event + featured-item deletion handles DB rows vs storage images, and why best-effort (not a retry queue).
---

# Event & featured-item deletion

`deleteEvent(id)` / `deleteEventFeaturedItem(id)` in `src/lib/events.ts`.

- Featured-item **rows** are removed by `ON DELETE CASCADE` on
  `event_featured_items.event_id` — deleting the event auto-deletes them. Only
  **storage images** need manual cleanup (event cover_image_url/cover_thumb_url
  + per-item image_url/thumb_url, bucket-relative paths via
  `extractStoragePath` from `moderation.ts`).
- Storage purge is **best-effort and runs BEFORE the row delete**, mirroring
  `deletePost()` in `moderation.ts`.

**Why:** best-effort-before-delete is the app-wide convention (deletePost): an
orphaned row must never block a future re-upload to the same path, and the DB
row is the source of truth, so a failed storage `.remove()` is logged and
swallowed, never aborting the delete. A durable retry queue / cron for orphaned
assets was deliberately NOT built — it's disproportionate for this app and
inconsistent with every other delete path. An architect review flagged the lack
of a retry queue as a "FAIL"; that recommendation was intentionally declined for
consistency.

**How to apply:** any new media-bearing delete path should follow the same
shape (gather URLs → best-effort `.remove()` → row delete), not invent a queue.
All destructive UI routes through `src/components/ui/ConfirmDialog.tsx`.
