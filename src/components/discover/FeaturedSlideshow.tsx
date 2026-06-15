import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Navigation } from 'lucide-react';
import { ImageWithFade } from '../ui/ImageWithFade';
import { MediaFallback } from '../ui/MediaFallback';
import { FEATURED_KIND_LABEL, type FeaturedSlide } from '../../lib/discoverFeatured';

const AUTO_MS = 4000; // auto-advance cadence (#2)
const RESUME_MS = 5000; // how long to stay paused after a user interaction (#5)

function formatDistance(mi: number): string {
  if (mi < 1) return '<1 mi';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

/**
 * "Featured Near You" hero slideshow.
 *  - Auto-advances every 4s (#2)
 *  - Entire slide is clickable (#3)
 *  - Manual swipe left/right + arrows (#4)
 *  - Pauses on interaction, resumes afterwards (#5)
 */
export function FeaturedSlideshow({
  slides,
  filterKey,
  onOpen,
}: {
  slides: FeaturedSlide[];
  filterKey: string;
  onOpen: (to: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const count = slides.length;

  // Reset to the first slide whenever the filter/search/location changes.
  useEffect(() => { setIndex(0); }, [filterKey]);

  // Keep the index valid if the slide set shrinks.
  useEffect(() => {
    setIndex((i) => (count === 0 ? 0 : Math.min(i, count - 1)));
  }, [count]);

  // Auto-advance — disabled while paused or with a single slide.
  useEffect(() => {
    if (paused || count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), AUTO_MS);
    return () => clearInterval(t);
  }, [paused, count]);

  useEffect(() => () => { if (resumeTimer.current) clearTimeout(resumeTimer.current); }, []);

  const pauseNow = () => {
    if (resumeTimer.current) { clearTimeout(resumeTimer.current); resumeTimer.current = null; }
    setPaused(true);
  };
  const scheduleResume = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_MS);
  };

  const go = (dir: 1 | -1) => {
    if (count === 0) return;
    setIndex((i) => (i + dir + count) % count);
  };

  const guardSwipeClick = () => {
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 350);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    pauseNow();
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, moved: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) t.moved = true;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    touch.current = null;
    scheduleResume();
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      guardSwipeClick();
      go(dx < 0 ? 1 : -1);
    } else if (!t.moved) {
      // A tap (no drag) opens the slide; suppress the synthetic click.
      guardSwipeClick();
      const cur = slides[index];
      if (cur) onOpen(cur.to);
    }
  };

  if (count === 0) {
    return (
      <div style={s.empty}>
        <p style={s.emptyTitle}>Nothing featured here yet</p>
        <p style={s.emptyBody}>Try another filter, widen your location, or check back soon.</p>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div
        style={s.viewport}
        onMouseEnter={pauseNow}
        onMouseLeave={scheduleResume}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div style={{ ...s.track, transform: `translateX(-${index * 100}%)` }}>
          {slides.map((sl) => (
            <button
              key={sl.id}
              style={s.slide}
              onClick={() => { if (suppressClick.current) return; onOpen(sl.to); }}
              aria-label={`Open ${sl.title}`}
            >
              <ImageWithFade
                src={sl.image}
                fallbackSrc={sl.imageFull}
                alt={sl.title}
                style={s.img}
                fallback={
                  <MediaFallback
                    kind={sl.fallbackKind}
                    category={sl.fallbackCategory ?? undefined}
                    seed={sl.id}
                  />
                }
              />
              <div style={s.overlay} />
              <div style={s.topRow}>
                <span style={{ ...s.kindPill, background: sl.accent }}>
                  {FEATURED_KIND_LABEL[sl.kind]}
                </span>
                {sl.badge && <span style={s.badge}>{sl.badge}</span>}
                {sl.distanceMi != null && (
                  <span style={s.distance}>
                    <Navigation size={11} /> {formatDistance(sl.distanceMi)}
                  </span>
                )}
              </div>
              <div style={s.caption}>
                <h3 style={s.title}>{sl.title}</h3>
                <p style={s.sub}>
                  <MapPin size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {sl.subtitle}
                </p>
                {sl.category && <p style={s.cat}>{sl.category}</p>}
              </div>
            </button>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              className="tt-carousel-arrow"
              style={{ ...s.arrow, left: 8 }}
              onClick={(e) => { e.stopPropagation(); pauseNow(); scheduleResume(); go(-1); }}
              aria-label="Previous slide"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              className="tt-carousel-arrow"
              style={{ ...s.arrow, right: 8 }}
              onClick={(e) => { e.stopPropagation(); pauseNow(); scheduleResume(); go(1); }}
              aria-label="Next slide"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div style={s.dots}>
          {slides.map((sl, i) => (
            <button
              key={sl.id}
              onClick={() => { pauseNow(); scheduleResume(); setIndex(i); }}
              aria-label={`Go to slide ${i + 1}`}
              style={{ ...s.dot, ...(i === index ? s.dotActive : null) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { padding: '0 16px' },
  viewport: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 10',
    maxHeight: 320,
    borderRadius: 18,
    overflow: 'hidden',
    background: '#15151a',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
  },
  track: {
    display: 'flex',
    height: '100%',
    transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  slide: {
    position: 'relative',
    flex: '0 0 100%',
    width: '100%',
    height: '100%',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    WebkitTapHighlightColor: 'transparent',
    overflow: 'hidden',
  },
  img: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  overlay: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.82) 100%)',
  },
  topRow: {
    position: 'absolute', top: 12, left: 12, right: 12,
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  },
  kindPill: {
    display: 'inline-flex', alignItems: 'center',
    padding: '4px 10px', borderRadius: 999,
    fontSize: 11, fontWeight: 800, color: '#0b0b10', letterSpacing: '0.01em',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', borderRadius: 999,
    fontSize: 11, fontWeight: 800,
    background: 'rgba(249, 115, 22, 0.95)', color: '#1a0c00',
  },
  distance: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 9px', borderRadius: 999,
    fontSize: 11, fontWeight: 700,
    background: 'rgba(34, 211, 238, 0.92)', color: '#04222a',
  },
  caption: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  title: {
    margin: 0, fontSize: 20, fontWeight: 800, color: '#fff',
    letterSpacing: '-0.01em', lineHeight: 1.2,
    textShadow: '0 1px 8px rgba(0,0,0,0.5)',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  sub: {
    margin: '6px 0 0', fontSize: 13, fontWeight: 600,
    color: 'rgba(255,255,255,0.92)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  cat: { margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  arrow: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    zIndex: 4,
    width: 38, height: 38, borderRadius: '50%',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(15,15,20,0.78)',
    border: '1px solid rgba(255,255,255,0.16)',
    color: '#fff', cursor: 'pointer', padding: 0,
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
    backdropFilter: 'blur(6px)',
  },
  dots: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
    padding: '12px 0 2px',
  },
  dot: {
    width: 7, height: 7, borderRadius: 999, padding: 0,
    border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,0.28)',
    transition: 'all 0.2s ease',
  },
  dotActive: { width: 20, background: '#f97316' },
  empty: {
    margin: '0 16px', padding: '32px 20px', borderRadius: 18,
    textAlign: 'center',
    background: 'rgba(255,255,255,0.04)',
    border: '1px dashed rgba(255,255,255,0.12)',
  },
  emptyTitle: { margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' },
  emptyBody: { margin: '6px 0 0', fontSize: 13, color: 'rgba(245,245,247,0.6)' },
};
