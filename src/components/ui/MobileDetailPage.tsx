import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { PageScroll } from './PageScroll';

/**
 * MobileDetailPage — viewport-locked scroll container for any "detail
 * page" route (FindDetail, ListingDetail, WantedDetail, EventDetail,
 * PublicProfile, etc.). Wraps PageScroll with the extra containment
 * rules a detail page needs on iPhone Safari:
 *
 *   - width:100% + maxWidth:100vw → no horizontal bleed
 *   - overflowX:hidden + touchAction:'pan-y' → page only scrolls vertically
 *   - paddingBottom honors the iOS home-indicator safe area
 *
 * Use this instead of <PageScroll> on every page that previously felt
 * like "Safari opened a raw image URL" — i.e. anywhere a single big
 * media asset (hero image, avatar, cover) sits above body content.
 *
 *   <MobileDetailPage style={{ background: '#0b0b10' }}>
 *     <Header />
 *     …body…
 *   </MobileDetailPage>
 *
 * Caller-provided `style` merges AFTER defaults so per-page background
 * / color overrides work, but the containment invariants are kept by
 * always re-applying them last.
 */
const DETAIL_PAGE_DEFAULTS: CSSProperties = {
  width: '100%',
  maxWidth: '100vw',
  backgroundColor: 'var(--color-neutral-50)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

// Containment invariants reapply AFTER the caller style, but we
// intentionally do NOT pin maxWidth here — callers like PublicProfile
// legitimately want a 480px cap, and the global `html,body {
// overflow-x: hidden }` + the `overflowX:'hidden'` below already
// prevent horizontal page-pan even if a child overflows its box.
const DETAIL_PAGE_LOCK: CSSProperties = {
  overflowX: 'hidden',
  touchAction: 'pan-y',
};

type MobileDetailPageProps = {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  'aria-label'?: string;
};

export const MobileDetailPage = forwardRef<HTMLDivElement, MobileDetailPageProps>(
  function MobileDetailPage({ children, style, className, ...rest }, ref) {
    return (
      <PageScroll
        ref={ref}
        className={className}
        style={{ ...DETAIL_PAGE_DEFAULTS, ...style, ...DETAIL_PAGE_LOCK }}
        {...rest}
      >
        {children}
      </PageScroll>
    );
  },
);
