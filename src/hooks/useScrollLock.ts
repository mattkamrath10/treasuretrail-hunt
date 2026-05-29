import { useEffect } from 'react';

/**
 * useScrollLock — lock background scrolling while a modal / bottom-sheet is open.
 *
 * Why this isn't just `document.body.style.overflow = 'hidden'`:
 * In this app the page scroll context is a <PageScroll> div (AppShell's
 * content slot is `overflow:hidden`), NOT the document body. So toggling
 * body overflow alone does nothing on the surface that actually scrolls,
 * and on iOS Safari a `position:fixed` overlay still lets touch gestures
 * drag the scroller behind it. We instead intercept `touchmove`/`wheel`
 * at the document level and `preventDefault()` for any gesture that does
 * NOT originate inside an allowed scrollable region — and even inside that
 * region we block the gesture at the top/bottom boundary so momentum can't
 * chain through to the page behind (the classic iOS rubber-band leak).
 *
 * Allowed region = any element inside `[data-scroll-lock-allow]`. Mark the
 * modal's own scroll area (the part with `overflowY:auto`) with that
 * attribute so it keeps scrolling normally while everything behind it is
 * frozen.
 *
 * Pass `active=false` to disable (e.g. when the modal is closed).
 *
 * Note: this never touches `touch-action`. Per the app's scroll rules,
 * `touch-action: pan-y` on html/body/page-scroller breaks horizontal
 * carousels, so we deliberately avoid it.
 */

// Module-level reference count so overlapping locks (e.g. a confirm dialog
// stacked on a sheet) don't restore body/html overflow until the LAST lock
// releases.
let lockCount = 0;
let savedBodyOverflow = '';
let savedHtmlOverflow = '';

function isAllowed(target: EventTarget | null): HTMLElement | null {
  const el = target as HTMLElement | null;
  return el && typeof el.closest === 'function'
    ? el.closest<HTMLElement>('[data-scroll-lock-allow]')
    : null;
}

function atTop(el: HTMLElement): boolean {
  return el.scrollTop <= 0;
}

function atBottom(el: HTMLElement): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
}

export function useScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const body = document.body;
    const html = document.documentElement;

    // Belt-and-suspenders: stop the document itself from scrolling on the
    // rare page where the body is the scroller. Reference-counted so nested
    // locks restore the correct original value.
    if (lockCount === 0) {
      savedBodyOverflow = body.style.overflow;
      savedHtmlOverflow = html.style.overflow;
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';
    }
    lockCount += 1;

    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
    };

    // Touch (iOS Safari): block any drag that isn't inside the modal's
    // scroll area, and block at the scroller's boundary so it can't chain.
    // Multi-finger gestures (pinch-zoom) are left alone.
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      const scroller = isAllowed(e.target);
      if (!scroller) {
        e.preventDefault();
        return;
      }
      if (scroller.scrollHeight <= scroller.clientHeight) {
        e.preventDefault();
        return;
      }
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startY; // dy > 0 → finger moving down → content scrolls toward top
      if ((atTop(scroller) && dy > 0) || (atBottom(scroller) && dy < 0)) {
        e.preventDefault();
      }
    };

    // Wheel/trackpad (desktop / iPad): same allow-list + boundary gate.
    const onWheel = (e: WheelEvent) => {
      const scroller = isAllowed(e.target);
      if (!scroller) {
        e.preventDefault();
        return;
      }
      if (scroller.scrollHeight <= scroller.clientHeight) {
        e.preventDefault();
        return;
      }
      if ((atTop(scroller) && e.deltaY < 0) || (atBottom(scroller) && e.deltaY > 0)) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('wheel', onWheel);
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        body.style.overflow = savedBodyOverflow;
        html.style.overflow = savedHtmlOverflow;
      }
    };
  }, [active]);
}
