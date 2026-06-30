import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ImageWithFade } from '../ui/ImageWithFade';
import { AvatarFallback } from '../ui/MediaFallback';
import { toThumbUrl } from '../../lib/imageCompress';
import { fetchFeaturedProfiles } from '../../lib/profiles';
import type { Profile } from '../../lib/supabase';

/**
 * Horizontal strip of featured members for the Discover page. Renders nothing
 * when there are no featured profiles (e.g. before the migration is applied or
 * before any member is featured), so it never leaves an empty header behind.
 */
export function FeaturedProfilesStrip() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchFeaturedProfiles(12);
      if (!cancelled) setProfiles(rows);
    })();
    return () => { cancelled = true; };
  }, []);

  if (profiles.length === 0) return null;

  return (
    <section style={s.wrap}>
      <button style={s.head} onClick={() => navigate('/people')}>
        <div style={{ minWidth: 0 }}>
          <h2 style={s.title}>Featured People</h2>
          <p style={s.sub}>Top sellers and collectors</p>
        </div>
        <span style={s.seeAll}>See all <ChevronRight size={14} /></span>
      </button>

      <div className="tt-hscroll" style={s.row}>
        {profiles.map((p) => (
          <button key={p.id} style={s.item} onClick={() => navigate(`/profile/${p.username}`)}>
            <div style={s.avatar as any}>
              <ImageWithFade
                src={toThumbUrl(p.avatar_url) ?? p.avatar_url ?? undefined}
                fallbackSrc={p.avatar_url ?? undefined}
                alt={p.username}
                fallback={<AvatarFallback name={p.username} seed={p.username} />}
              />
            </div>
            <span style={s.name}>@{p.username}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { margin: '4px 0 8px' },
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    width: '100%', padding: '0 16px 8px', background: 'transparent', border: 'none',
    cursor: 'pointer', textAlign: 'left',
  },
  title: { fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-neutral-900)' },
  sub: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginTop: 1 },
  seeAll: {
    display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
    fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary-600, #d97706)',
  },
  row: { display: 'flex', gap: 14, overflowX: 'auto', padding: '2px 16px 4px' },
  item: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 68,
    flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
  },
  avatar: {
    width: 60, height: 60, borderRadius: 999, overflow: 'hidden',
    border: '2px solid #f59e0b', background: 'var(--color-neutral-100)',
  },
  name: {
    fontSize: 11, fontWeight: 600, color: 'var(--color-neutral-700)', maxWidth: 68,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
};
