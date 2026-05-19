import { useEffect, useRef } from 'react';

/**
 * useLiveFeed — shared background polling hook for "live" feeds.
 *
 * Safety guarantees:
 * - Pauses when the browser tab is hidden (saves bandwidth / battery).
 * - Prevents overlapping fetches (drops a tick if the previous fetcher
 *   hasn't resolved yet).
 * - Cleans up the interval and visibility listener on unmount.
 * - Re-runs the fetcher once when the tab becomes visible again after
 *   being hidden, so users see fresh data immediately on return.
 *
 * The fetcher is responsible for its own state updates and should perform
 * a *silent* refresh (no global loading spinner) to avoid disrupting the
 * user's scroll position, filters, or search input.
 *
 * @param fetcher  Async function that performs the silent refresh.
 * @param enabled  When false, the hook is a no-op (e.g. while loading,
 *                 guest mode, or unauthenticated).
 * @param intervalMs  Poll interval in milliseconds. Defaults to 10s.
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

    const tick = async () => {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      inFlightRef.current = true;
      try {
        await fetcherRef.current();
      } catch {
        // Swallow — the underlying fetcher is expected to surface its
        // own errors (e.g. via a loadError state). We don't want a
        // transient network blip to crash the polling loop.
      } finally {
        inFlightRef.current = false;
      }
    };

    const interval = window.setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs]);
}
