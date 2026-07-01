import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { FeaturedSlideshow } from './FeaturedSlideshow';
import type { FeaturedSlide } from '../../lib/discoverFeatured';

function slide(over: Partial<FeaturedSlide> = {}): FeaturedSlide {
  return {
    id: over.id ?? 's1',
    kind: 'event',
    title: 'Slide',
    subtitle: 'Somewhere',
    category: null,
    image: null,
    imageFull: null,
    accent: '#000',
    badge: null,
    to: over.to ?? '/event/1',
    lat: null,
    lng: null,
    distanceMi: null,
    priority: 3,
    sortTime: 0,
    fallbackKind: 'event',
    fallbackCategory: null,
    searchText: 'slide',
    online: false,
    recurring: false,
    recurrenceLabel: null,
    ended: false,
    ...over,
  };
}

const two = [
  slide({ id: 'a', to: '/event/a', title: 'Alpha' }),
  slide({ id: 'b', to: '/event/b', title: 'Bravo' }),
];

/** Current slide index, parsed from the track's translateX transform. */
function activeIndex(container: HTMLElement): number {
  const track = container.firstChild!.firstChild!.firstChild as HTMLElement;
  const m = track.style.transform.match(/-(\d+)%/);
  return m ? Number(m[1]) / 100 : 0;
}

function viewportEl(container: HTMLElement): HTMLElement {
  return container.firstChild!.firstChild as HTMLElement;
}

describe('FeaturedSlideshow — tap vs swipe suppression', () => {
  afterEach(() => cleanup());

  it('opens the current slide on a tap (no drag)', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <FeaturedSlideshow slides={two} filterKey="all" onOpen={onOpen} />,
    );
    const vp = viewportEl(container);

    fireEvent.touchStart(vp, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(vp, { changedTouches: [{ clientX: 100, clientY: 100 }] });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('/event/a');
  });

  it('advances on a horizontal swipe without opening the slide', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <FeaturedSlideshow slides={two} filterKey="all" onOpen={onOpen} />,
    );
    const vp = viewportEl(container);

    expect(activeIndex(container)).toBe(0);
    // Drag left by 100px → next slide.
    fireEvent.touchStart(vp, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(vp, { touches: [{ clientX: 120, clientY: 100 }] });
    fireEvent.touchEnd(vp, { changedTouches: [{ clientX: 100, clientY: 100 }] });

    expect(onOpen).not.toHaveBeenCalled();
    expect(activeIndex(container)).toBe(1);
  });

  it('does not treat a vertical drag as a swipe or a tap', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <FeaturedSlideshow slides={two} filterKey="all" onOpen={onOpen} />,
    );
    const vp = viewportEl(container);

    fireEvent.touchStart(vp, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(vp, { touches: [{ clientX: 100, clientY: 200 }] });
    fireEvent.touchEnd(vp, { changedTouches: [{ clientX: 100, clientY: 200 }] });

    expect(onOpen).not.toHaveBeenCalled();
    expect(activeIndex(container)).toBe(0);
  });

  it('suppresses the synthetic click fired after a swipe, then re-allows it', () => {
    vi.useFakeTimers();
    try {
      const onOpen = vi.fn();
      const { container } = render(
        <FeaturedSlideshow slides={two} filterKey="all" onOpen={onOpen} />,
      );
      const vp = viewportEl(container);
      const firstSlideBtn = container.querySelector(
        'button[aria-label="Open Alpha"]',
      ) as HTMLElement;

      act(() => {
        fireEvent.touchStart(vp, { touches: [{ clientX: 200, clientY: 100 }] });
        fireEvent.touchEnd(vp, { changedTouches: [{ clientX: 100, clientY: 100 }] });
      });

      // The browser fires a synthetic click right after the swipe — it must be
      // swallowed so the swipe doesn't also open a slide.
      fireEvent.click(firstSlideBtn);
      expect(onOpen).not.toHaveBeenCalled();

      // After the 350ms guard window, a real click works again.
      act(() => { vi.advanceTimersByTime(400); });
      fireEvent.click(firstSlideBtn);
      expect(onOpen).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('FeaturedSlideshow — pause/resume auto-advance timing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('auto-advances every 4s', () => {
    const { container } = render(
      <FeaturedSlideshow slides={two} filterKey="all" onOpen={vi.fn()} />,
    );
    expect(activeIndex(container)).toBe(0);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(activeIndex(container)).toBe(1);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(activeIndex(container)).toBe(0); // wraps around
  });

  it('pauses while the pointer hovers and resumes after leaving', () => {
    const { container } = render(
      <FeaturedSlideshow slides={two} filterKey="all" onOpen={vi.fn()} />,
    );
    const vp = viewportEl(container);

    act(() => { fireEvent.mouseEnter(vp); });
    act(() => { vi.advanceTimersByTime(8000); });
    expect(activeIndex(container)).toBe(0); // paused — no advance

    act(() => { fireEvent.mouseLeave(vp); });
    // Resume timer is 5s; only after that does auto-advance kick back in.
    act(() => { vi.advanceTimersByTime(5000); });
    expect(activeIndex(container)).toBe(0);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(activeIndex(container)).toBe(1);
  });

  it('pauses on touch interaction and resumes ~5s after it ends', () => {
    const { container } = render(
      <FeaturedSlideshow slides={two} filterKey="all" onOpen={vi.fn()} />,
    );
    const vp = viewportEl(container);

    // A tap pauses (touchStart) then schedules resume (touchEnd).
    act(() => {
      fireEvent.touchStart(vp, { touches: [{ clientX: 100, clientY: 100 }] });
    });
    act(() => { vi.advanceTimersByTime(4000); });
    expect(activeIndex(container)).toBe(0); // paused mid-interaction

    act(() => {
      fireEvent.touchEnd(vp, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    });
    act(() => { vi.advanceTimersByTime(5000); }); // resume window elapses
    act(() => { vi.advanceTimersByTime(4000); }); // next auto-advance
    expect(activeIndex(container)).toBe(1);
  });
});
