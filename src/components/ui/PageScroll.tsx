import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

/**
 * PageScroll — the canonical scrolling container for any route mounted
 * inside AppShell. AppShell's content slot is `overflow:hidden`, so
 * every page MUST own its own vertical scroll or it appears frozen on
 * iPhone Safari + desktop wheel. This component centralizes that
 * pattern so the bug stops recurring per-page.
 *
 *   <PageScroll style={{ background: '#0b0b10' }}>…</PageScroll>
 *
 * Usage notes:
 * - Caller-provided `style` is merged AFTER the scroll defaults so
 *   pages can layer on backgrounds, padding, color, etc.
 * - Do NOT pass `height`, `overflow`, or `WebkitOverflowScrolling`
 *   overrides — that's the whole point of using this wrapper.
 * - Horizontal carousels inside still scroll independently because
 *   they set their own `overflowX:auto` on their row container.
 */
export const PAGE_SCROLL_STYLE: CSSProperties = {
  height: '100%',
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch',
  overscrollBehaviorY: 'contain',
};

type PageScrollProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export const PageScroll = forwardRef<HTMLDivElement, PageScrollProps>(
  function PageScroll({ children, style, ...rest }, ref) {
    return (
      <div ref={ref} {...rest} style={{ ...PAGE_SCROLL_STYLE, ...style }}>
        {children}
      </div>
    );
  },
);
