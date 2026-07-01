/**
 * Recurring-events engine.
 *
 * Design: a recurring event is ONE row in `events`. The anchor `starts_at` /
 * `ends_at` define the very first occurrence — its calendar date, its
 * wall-clock time-of-day, and (via ends_at − starts_at) its duration. We never
 * materialize one row per occurrence. Instead, at the read boundary we compute
 * the *next* upcoming occurrence and overwrite `starts_at` / `ends_at` so every
 * downstream consumer (status badges, map haversine, Discover ranking, list
 * sorting) keeps reading the same two fields and needs no change.
 *
 * All math is done in LOCAL wall-clock time so "every Wednesday at 9am" stays
 * 9am across DST. Iteration is bounded so a misconfigured row can never spin.
 *
 * This module is pure (no IO) and safe to import anywhere.
 */

import type { EventRow } from './events';

export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly';
export type MonthlyMode = 'day_of_month' | 'nth_weekday';

/** Subset of EventRow that carries recurrence config. */
export interface RecurrenceFields {
  recurrence?: RecurrenceFreq | null;
  /** Weekly: weekday numbers, 0=Sun … 6=Sat. */
  recurrence_days?: number[] | null;
  recurrence_monthly_mode?: MonthlyMode | null;
  /** Monthly day_of_month mode: 1–31. */
  recurrence_day_of_month?: number | null;
  /** Monthly nth_weekday mode: 1=First, 2=Second, 3=Third, 4=Fourth, -1=Last. */
  recurrence_nth?: number | null;
  /** Monthly nth_weekday mode: weekday number, 0=Sun … 6=Sat. */
  recurrence_weekday?: number | null;
  /** ISO date; null/undefined = repeats forever. */
  recurrence_until?: string | null;
}

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NTH_LABEL: Record<number, string> = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', [-1]: 'Last' };

// Bounded iteration caps — generous enough for any real schedule, small enough
// to never hang on a malformed row (e.g. weekly with no matching weekday).
const MAX_DAY_STEPS = 366 * 2;
const MAX_MONTH_STEPS = 48;

export function isRecurring(e: RecurrenceFields | null | undefined): boolean {
  return !!e && !!e.recurrence && e.recurrence !== 'none';
}

/** Local end-of-day epoch ms for the given date. */
function endOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/** A date at midnight local (date-only), for day-stepping. */
function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Compose a Date from `base`'s calendar day + `anchor`'s wall-clock time. */
function atAnchorTime(base: Date, anchor: Date): Date {
  return new Date(
    base.getFullYear(), base.getMonth(), base.getDate(),
    anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds(),
  );
}

/**
 * Date of the nth (or last) `weekday` in a given month. Returns null when the
 * occurrence doesn't exist (e.g. a 5th Saturday in a month that has only four).
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date | null {
  if (nth === -1) {
    const last = new Date(year, month + 1, 0); // last day of this month
    const diff = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month, last.getDate() - diff);
  }
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const dt = new Date(year, month, day);
  return dt.getMonth() === month ? dt : null;
}

/** Inclusive upper bound (local end-of-day) for the recurrence, or +Infinity. */
function untilMs(e: RecurrenceFields): number {
  if (!e.recurrence_until) return Infinity;
  const u = new Date(e.recurrence_until);
  if (Number.isNaN(u.getTime())) return Infinity;
  return endOfLocalDay(u);
}

/**
 * The next occurrence whose window has not fully ended at `fromMs`. For a
 * currently-running occurrence this returns that running occurrence (so a
 * live event still surfaces). Returns null when the series has no remaining
 * occurrence (past its end date) or the anchor is unparseable.
 *
 * Non-recurring events resolve to their own anchor window unchanged.
 */
export function nextOccurrence(
  e: EventRow,
  fromMs: number = Date.now(),
): { start: Date; end: Date | null } | null {
  const anchorStart = new Date(e.starts_at);
  if (Number.isNaN(anchorStart.getTime())) return null;

  const anchorEnd = e.ends_at ? new Date(e.ends_at) : null;
  const durationMs =
    anchorEnd && !Number.isNaN(anchorEnd.getTime())
      ? anchorEnd.getTime() - anchorStart.getTime()
      : null;

  const mkEnd = (start: Date): Date | null =>
    durationMs != null ? new Date(start.getTime() + durationMs) : null;

  if (!isRecurring(e)) {
    return { start: anchorStart, end: anchorEnd };
  }

  const cap = untilMs(e);
  // An occurrence is still "current/upcoming" if its window-end >= fromMs.
  // When the event has no explicit duration we treat its whole local day as
  // the window so today's occurrence stays selected until end of day.
  const windowEnd = (start: Date): number =>
    durationMs != null ? start.getTime() + durationMs : endOfLocalDay(start);

  const freq = e.recurrence;

  // Look back far enough to catch a still-running occurrence that started before
  // `fromMs` — at least a full local day, more for long-duration events.
  const lookbackMs = Math.max(durationMs ?? 0, 24 * 3600_000);

  if (freq === 'daily') {
    let cursor = localMidnight(new Date(Math.max(anchorStart.getTime(), fromMs - lookbackMs)));
    const anchorDay = localMidnight(anchorStart).getTime();
    for (let i = 0; i < MAX_DAY_STEPS; i++) {
      if (cursor.getTime() >= anchorDay) {
        const start = atAnchorTime(cursor, anchorStart);
        if (start.getTime() > cap) return null;
        if (windowEnd(start) >= fromMs) return { start, end: mkEnd(start) };
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    return null;
  }

  if (freq === 'weekly') {
    const days = (e.recurrence_days && e.recurrence_days.length > 0)
      ? new Set(e.recurrence_days)
      : new Set([anchorStart.getDay()]);
    let cursor = localMidnight(new Date(Math.max(anchorStart.getTime(), fromMs - lookbackMs)));
    const anchorDay = localMidnight(anchorStart).getTime();
    for (let i = 0; i < MAX_DAY_STEPS; i++) {
      if (cursor.getTime() >= anchorDay && days.has(cursor.getDay())) {
        const start = atAnchorTime(cursor, anchorStart);
        if (start.getTime() > cap) return null;
        if (windowEnd(start) >= fromMs) return { start, end: mkEnd(start) };
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    return null;
  }

  if (freq === 'monthly') {
    const mode: MonthlyMode = e.recurrence_monthly_mode ?? 'day_of_month';
    const fromDate = new Date(fromMs);
    let year = Math.max(anchorStart.getFullYear(), fromDate.getFullYear());
    let month = year === fromDate.getFullYear()
      ? Math.max(
          year === anchorStart.getFullYear() ? anchorStart.getMonth() : 0,
          fromDate.getMonth(),
        )
      : anchorStart.getMonth();

    for (let i = 0; i < MAX_MONTH_STEPS; i++) {
      let occDay: Date | null = null;
      if (mode === 'nth_weekday') {
        const nth = e.recurrence_nth ?? 1;
        const weekday = e.recurrence_weekday ?? anchorStart.getDay();
        occDay = nthWeekdayOfMonth(year, month, weekday, nth);
      } else {
        const dom = e.recurrence_day_of_month ?? anchorStart.getDate();
        const lastOfMonth = new Date(year, month + 1, 0).getDate();
        if (dom <= lastOfMonth) occDay = new Date(year, month, dom);
        // Months too short for the chosen day-of-month are skipped.
      }
      if (occDay && occDay.getTime() >= localMidnight(anchorStart).getTime()) {
        const start = atAnchorTime(occDay, anchorStart);
        if (start.getTime() > cap) return null;
        if (windowEnd(start) >= fromMs) return { start, end: mkEnd(start) };
      }
      month += 1;
      if (month > 11) { month = 0; year += 1; }
    }
    return null;
  }

  return { start: anchorStart, end: anchorEnd };
}

/**
 * Return a copy of the event with `starts_at` / `ends_at` overwritten by its
 * next occurrence. Non-recurring events (and series with no remaining
 * occurrence) are returned unchanged. Recurrence config fields are preserved.
 */
export function applyNextOccurrence(e: EventRow, fromMs: number = Date.now()): EventRow {
  if (!isRecurring(e)) return e;
  const occ = nextOccurrence(e, fromMs);
  if (!occ) return e;
  return {
    ...e,
    starts_at: occ.start.toISOString(),
    ends_at: occ.end ? occ.end.toISOString() : e.ends_at,
  };
}

/**
 * Normalize a list of events to their next occurrence and re-sort soonest
 * first. Use this at public read boundaries (feeds, map, search) so recurring
 * events appear on their upcoming date, not their original anchor date.
 */
export function normalizeEvents(rows: EventRow[], fromMs: number = Date.now()): EventRow[] {
  return rows
    .map((r) => applyNextOccurrence(r, fromMs))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Join weekday names: "Wednesday", "Saturday and Sunday", "Mon, Wed and Fri". */
function joinDays(days: number[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => WEEKDAY_LONG[d]).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Human description of the repeat rule, e.g.
 *   "Repeats Daily"
 *   "Repeats Weekly Every Wednesday"
 *   "Repeats Weekly Every Saturday and Sunday"
 *   "Repeats Monthly on the 15th"
 *   "Repeats Monthly on the First Saturday"
 * Returns null for non-recurring events.
 */
export function describeRecurrence(e: RecurrenceFields & { starts_at: string }): string | null {
  if (!isRecurring(e)) return null;
  const anchor = new Date(e.starts_at);
  const anchorDay = Number.isNaN(anchor.getTime()) ? 0 : anchor.getDay();

  switch (e.recurrence) {
    case 'daily':
      return 'Repeats Daily';
    case 'weekly': {
      const days = (e.recurrence_days && e.recurrence_days.length > 0)
        ? e.recurrence_days
        : [anchorDay];
      return `Repeats Weekly Every ${joinDays(days)}`;
    }
    case 'monthly': {
      if ((e.recurrence_monthly_mode ?? 'day_of_month') === 'nth_weekday') {
        const nth = e.recurrence_nth ?? 1;
        const weekday = e.recurrence_weekday ?? anchorDay;
        return `Repeats Monthly on the ${NTH_LABEL[nth] ?? 'First'} ${WEEKDAY_LONG[weekday] ?? ''}`.trim();
      }
      const dom = e.recurrence_day_of_month ?? (Number.isNaN(anchor.getTime()) ? 1 : anchor.getDate());
      return `Repeats Monthly on the ${ordinal(dom)}`;
    }
    default:
      return null;
  }
}

/**
 * Short, badge-friendly frequency word for a recurring event: "Daily",
 * "Weekly" or "Monthly". Returns null for non-recurring events. Used by the
 * green recurring badge on Discover so users immediately see how often an
 * event repeats.
 */
export function recurrenceFrequencyLabel(e: RecurrenceFields | null | undefined): string | null {
  if (!isRecurring(e)) return null;
  switch (e?.recurrence) {
    case 'daily':   return 'Daily';
    case 'weekly':  return 'Weekly';
    case 'monthly': return 'Monthly';
    default:        return null;
  }
}
