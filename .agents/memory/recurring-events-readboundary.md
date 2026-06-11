---
name: Recurring events — read-boundary normalization
description: How recurring events stay one row yet surface their next occurrence everywhere; the gotcha when a page consumes a raw row.
---

# Recurring events

A recurring event is ONE row in `events`. The anchor `starts_at`/`ends_at` define the FIRST occurrence (its date, wall-clock time, and duration = ends_at − starts_at). The next occurrence is computed at the READ boundary by `src/lib/recurrence.ts` (`nextOccurrence` / `applyNextOccurrence` / `normalizeEvents`) which overwrites `starts_at`/`ends_at` in memory, so downstream consumers (status badges, haversine, ranking, sorting) need no change.

**Rule:** any list/feed that must show recurring events on their upcoming date MUST normalize. `fetchPublishedEvents` already calls `normalizeEvents`; `followFeed` maps via `applyNextOccurrence`. If you add a NEW reader that fetches the raw row (like `EventDetail` via `fetchEvent`), you must apply `applyNextOccurrence` yourself AND derive time-based status (`isLiveNow`/`isExpiredLive`/`isStartingSoon`) from the normalized object, not the raw anchor — otherwise the date shows "next" but the badge/CTA reflects the long-past anchor.

**Why:** the anchor date can be far in the past for a long-running series, so raw-row status checks are wrong.

**Engine gotchas:**
- All math is LOCAL wall-clock (so "9am every Wed" stays 9am across DST).
- Daily/weekly cursor looks back `max(durationMs, 24h)` from `fromMs` to catch a still-running occurrence that started earlier — don't hardcode 24h or long-duration occurrences vanish.
- Monthly `nth_weekday` supports `-1` = Last; day_of_month skips months too short for the chosen day.
- Iteration is bounded (MAX_DAY_STEPS / MAX_MONTH_STEPS) so a malformed row can't spin.

**Write path:** recurrence columns are applied by hand (`supabase/migrations/20260610000000_recurring_events.sql`). `writeEventRow` in `events.ts` strips the `recurrence`/`event_url` column groups and retries on 42703/PGRST204, so create/edit never breaks before the migration lands.
