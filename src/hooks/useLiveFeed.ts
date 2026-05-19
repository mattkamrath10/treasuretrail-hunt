import { useEffect, useRef } from 'react';

/**
 * useLiveFeed — shared background polling hook for "live" feeds.
 *
 * Safety guarantees:
 * - Pauses when the browser tab is hidden (saves bandwidth / battery).
 * - Pauses when the browser is offline; auto-resumes on reconnect.
 * - Prevents overlapping fetches (drops a tick if the previous fetcher
 *   hasn't resolved yet).
 * - Exponential backoff on consecutive failures (10s → 20s → 40s →
 *   capped at 5 min) so a flaky network doesn't hammer the API.
 *   Resets to the base interval after the first successful tick.
 * - Cleans up the interval and listeners on unmount.
 * - Re-runs the fetcher once when the tab becomes visible again or the
 *   network reconnects, so users see fresh data immediately.
 *
 * The fetcher is responsible for its own state updates and should perform
 * a *silent* refresh (no global loading spinner) to avoid disrupting the
 * user's scroll position, filters, or search input. To opt into the
 * backoff signal, throw from the fetcher on failure; otherwise resolve
 * normally to keep polling at the base interval.
 */
export function useLiveFeed(
  fetcher: () => Promise<void> | void,
  enabled: boolean = true,
  intervalMs: number = 10_000,
) {
  // Keep the latest fetcher in a ref so the polling loop doesn't need to
  // re-subscribe (and reset the interval) every render.
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  // In-flight guard — prevents overlapping requests if a fetch takes
  // longer than the poll interval.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: number | null = null;
    let consecutiveFailures = 0;
    const MAX_BACKOFF_MS = 5 * 60_000; // cap at 5 minutes

    const computeDelay = () => {
      if (consecutiveFailures === 0) return intervalMs;
      // 10s, 20s, 40s, 80s, 160s, capped.
      return Math.min(intervalMs * 2 ** consecutiveFailures, MAX_BACKOFF_MS);
    };

    const schedule = () => {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(tick, computeDelay());
    };

    const tick = async () => {
      if (cancelled) return;
      // Skip the work, but stay on schedule, when the tab is hidden or
      // the device is offline.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (offline || hidden || inFlightRef.current) {
        schedule();
        return;
      }
      inFlightRef.current = true;
      try {
        await fetcherRef.current();
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures = Math.min(consecutiveFailures + 1, 8);
      } finally {
        inFlightRef.current = false;
        schedule();
      }
    };

    // Start the loop.
    schedule();

    // Immediate refresh when tab returns to foreground or network comes back.
    const onVisibility = () => {
      if (!document.hidden) {
        consecutiveFailures = 0;
        if (timer !== null) window.clearTimeout(timer);
        tick();
      }
    };
    const onOnline = () => {
      consecutiveFailures = 0;
      if (timer !== null) window.clearTimeout(timer);
      tick();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, intervalMs]);
}
