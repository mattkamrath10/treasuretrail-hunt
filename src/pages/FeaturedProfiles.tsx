import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Users, Star } from 'lucide-react';
import { MobileDetailPage } from '../components/ui/MobileDetailPage';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { AvatarFallback } from '../components/ui/MediaFallback';
import { FoundingPartnerBadge } from '../components/ui/FoundingPartnerBadge';
import { toThumbUrl } from '../lib/imageCompress';
import { fetchDirectoryProfiles } from '../lib/profiles';
import type { Profile } from '../lib/supabase';

export default function FeaturedProfiles() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchDirectoryProfiles(200);
      if (!cancelled) setProfiles(rows);
    })();
    return () => { cancelled = true; };
  }, []);

  const featured = (profiles ?? []).filter((p) => (p as any).featured_profile);
  const rest = (profiles ?? []).filter((p) => !(p as any).featured_profile);

  return (
    <MobileDetailPage style={{ maxWidth: 480, margin: '0 auto' }}>
      <header style={s.header}>
        <button
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) navigate(-1);
            else navigate('/');
          }}
          style={s.backBtn}
          aria-label="Go back"
        >
          <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
        </button>
        <span style={s.headerTitle}>People</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.content}>
        <section style={s.intro}>
          <h1 style={s.introTitle}>Discover People</h1>
          <p style={s.introSub}>Find sellers and collectors on TreasureTrail.</p>
        </section>

        {profiles === null ? (
          <div style={s.center}><div style={s.spinner} /></div>
        ) : profiles.length === 0 ? (
          <div style={s.empty}>
            <Users size={28} style={{ color: 'var(--color-neutral-400)' }} />
            <p style={s.emptyTitle}>No members yet</p>
            <p style={s.emptySub}>Check back soon as the community grows.</p>
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <div style={s.group}>
                <div style={s.groupHead}>
                  <Star size={14} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                  <span style={s.groupTitle}>Featured</span>
                </div>
                {featured.map((p) => (
                  <ProfileRow key={p.id} profile={p} onOpen={() => navigate(`/profile/${p.username}`)} featured />
                ))}
              </div>
            )}

            {rest.length > 0 && (
              <div style={s.group}>
                {featured.length > 0 && (
                  <div style={s.groupHead}>
                    <span style={s.groupTitle}>All members</span>
                  </div>
                )}
                {rest.map((p) => (
                  <ProfileRow key={p.id} profile={p} onOpen={() => navigate(`/profile/${p.username}`)} />
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ height: 24 }} />
      </div>
    </MobileDetailPage>
  );
}

function ProfileRow({
  profile,
  onOpen,
  featured = false,
}: {
  profile: Profile;
  onOpen: () => void;
  featured?: boolean;
}) {
  const city = (((profile as any).location || (profile as any).general_location || '') as string).trim();
  return (
    <button onClick={onOpen} style={{ ...s.row, ...(featured ? s.rowFeatured : null) }}>
      <div style={s.avatar as any}>
        <ImageWithFade
          src={toThumbUrl(profile.avatar_url) ?? profile.avatar_url ?? undefined}
          fallbackSrc={profile.avatar_url ?? undefined}
          alt={profile.username}
          fallback={<AvatarFallback name={profile.username} seed={profile.username} />}
        />
      </div>
      <div style={s.rowBody}>
        <div style={s.rowTop}>
          <span style={s.rowName}>@{profile.username}</span>
          {(profile as any).founding_partner && <FoundingPartnerBadge size="sm" />}
        </div>
        {profile.bio ? (
          <span style={s.rowBio}>{profile.bio}</span>
        ) : city ? (
          <span style={s.rowMeta}>
            <MapPin size={11} style={{ color: 'var(--color-neutral-400)' }} /> {city}
          </span>
        ) : null}
      </div>
      <span style={s.rowFollowers}>
        {profile.follower_count || 0}
        <span style={s.rowFollowersLabel}>followers</span>
      </span>
    </button>
  );
}

const s: Record<string, CSSProperties> = {
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-4))',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  backBtn: {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, border: 'none', background: 'var(--color-neutral-100)', cursor: 'pointer',
  },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-neutral-900)' },
  content: { padding: 'var(--space-4)' },
  intro: { marginBottom: 'var(--space-4)' },
  introTitle: { fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-neutral-900)' },
  introSub: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', marginTop: 2 },
  center: { display: 'flex', justifyContent: 'center', padding: 'var(--space-8) 0' },
  spinner: {
    width: 28, height: 28, borderRadius: '50%',
    border: '3px solid var(--color-neutral-200)', borderTopColor: 'var(--color-primary-500)',
    animation: 'spin 0.8s linear infinite',
  },
  empty: { textAlign: 'center', padding: 'var(--space-8) var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-neutral-800)' },
  emptySub: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)' },
  group: { marginBottom: 'var(--space-5)' },
  groupHead: { display: 'flex', alignItems: 'center', gap: 6, margin: '0 4px var(--space-2)' },
  groupTitle: {
    fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-neutral-500)',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    padding: '10px 12px', marginBottom: 8, borderRadius: 14,
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)', cursor: 'pointer',
  },
  rowFeatured: { borderColor: 'rgba(245, 158, 11, 0.45)', background: 'rgba(245, 158, 11, 0.06)' },
  avatar: {
    width: 48, height: 48, borderRadius: 999, overflow: 'hidden', flexShrink: 0,
    background: 'var(--color-neutral-100)',
  },
  rowBody: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowTop: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  rowName: {
    fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-neutral-900)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  rowBio: {
    fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  rowMeta: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  rowFollowers: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
    fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-neutral-800)',
  },
  rowFollowersLabel: { fontSize: 9, fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.03em' },
};
