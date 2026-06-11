-- =============================================================================
-- Recurring Events — one row per series, occurrences computed at read time
-- =============================================================================
-- A recurring event stays a SINGLE row in public.events. The existing
-- starts_at / ends_at define the FIRST occurrence: its calendar date, its
-- wall-clock time-of-day, and (via ends_at - starts_at) its duration. The app
-- computes the next occurrence on read (src/lib/recurrence.ts) and overwrites
-- starts_at / ends_at in memory, so no occurrence rows are ever materialized.
--
-- Frequencies:
--   * daily   — every day
--   * weekly  — on the weekdays listed in recurrence_days (0=Sun .. 6=Sat),
--               supports multiple days
--   * monthly — two modes via recurrence_monthly_mode:
--                 'day_of_month' → recurrence_day_of_month (1..31)
--                 'nth_weekday'  → recurrence_nth (1,2,3,4 or -1=Last) +
--                                  recurrence_weekday (0=Sun .. 6=Sat)
--
-- recurrence_until (date) bounds the series; NULL = repeats forever.
--
-- Design notes
--   * All columns nullable with a 'none' default → every existing event keeps
--     working unchanged (recurrence='none' behaves exactly like a one-off).
--   * No RLS changes — existing holder_id / status policies are unchanged.
--   * CHECK constraints validate enum-ish values + ranges; the form mirrors
--     these client-side so users see friendly errors first.
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recurrence              text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_days         smallint[],
  ADD COLUMN IF NOT EXISTS recurrence_monthly_mode text,
  ADD COLUMN IF NOT EXISTS recurrence_day_of_month smallint,
  ADD COLUMN IF NOT EXISTS recurrence_nth          smallint,
  ADD COLUMN IF NOT EXISTS recurrence_weekday      smallint,
  ADD COLUMN IF NOT EXISTS recurrence_until        timestamptz;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_recurrence_chk;
ALTER TABLE public.events
  ADD CONSTRAINT events_recurrence_chk CHECK (
    recurrence IN ('none', 'daily', 'weekly', 'monthly')
  );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_recurrence_monthly_mode_chk;
ALTER TABLE public.events
  ADD CONSTRAINT events_recurrence_monthly_mode_chk CHECK (
    recurrence_monthly_mode IS NULL
    OR recurrence_monthly_mode IN ('day_of_month', 'nth_weekday')
  );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_recurrence_day_of_month_chk;
ALTER TABLE public.events
  ADD CONSTRAINT events_recurrence_day_of_month_chk CHECK (
    recurrence_day_of_month IS NULL
    OR (recurrence_day_of_month BETWEEN 1 AND 31)
  );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_recurrence_nth_chk;
ALTER TABLE public.events
  ADD CONSTRAINT events_recurrence_nth_chk CHECK (
    recurrence_nth IS NULL
    OR recurrence_nth IN (1, 2, 3, 4, -1)
  );

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_recurrence_weekday_chk;
ALTER TABLE public.events
  ADD CONSTRAINT events_recurrence_weekday_chk CHECK (
    recurrence_weekday IS NULL
    OR (recurrence_weekday BETWEEN 0 AND 6)
  );
