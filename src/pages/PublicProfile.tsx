import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Star, Award, MapPin, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) { setNotFound(true); setLoading(false); return; }
    supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setNotFound(true);
        else setProfile(data);
        setLoading(false);
      });
  }, [username]);

  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  if (loading) {
    return (
      <div style={s.center}>
        <div style={s.spinner} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={s.center}>
        <p style={s.notFoundTitle}>Profile not found</p>
        <p style={s.notFoundSub}>This user doesn't exist or has been removed.</p>
        <button onClick={() => navigate('/')} style={s.ctaBtn}>Open TreasureTrail</button>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button onClick={() => navigate(-1)} style={s.backBtn} aria-label="Go back">
          <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
        </button>
        <span style={s.headerTitle}>Profile</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.content}>
        <div style={s.card}>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.username} style={s.avatar} />
          ) : (
            <div style={s.avatarPlaceholder}>
              <span style={s.avatarInitial}>
                {(profile.username || 'T')[0].toUpperCase()}
              </span>
            </div>
          )}

          <h1 style={s.username}>@{profile.username}</h1>
          {profile.bio && <p style={s.bio}>{profile.bio}</p>}

          <div style={s.badges}>
            <span style={s.rankBadge}>{profile.treasure_rank || 'Hunter'}</span>
            <span style={s.levelBadge}>Lv. {profile.level || 1}</span>
            <span style={s.xpBadge}>{profile.xp || 0} XP</span>
          </div>

          {(profile.location_city || profile.location_state) && (
            <div style={s.locationRow}>
              <MapPin size={12} style={{ color: 'var(--color-neutral-400)' }} />
              <span style={s.locationText}>
                {[profile.location_city, profile.location_state].filter(Boolean).join(', ')}
              </span>
            </div>
          )}

          {joinDate && <span style={s.joinDate}>Member since {joinDate}</span>}

          <div style={s.stats}>
            <div style={s.stat}>
              <span style={s.statNumber}>{profile.follower_count || 0}</span>
              <span style={s.statLabel}>Followers</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.stat}>
              <span style={s.statNumber}>{profile.following_count || 0}</span>
              <span style={s.statLabel}>Following</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.stat}>
              <span style={s.statNumber}>{profile.reputation_score?.toFixed(1) ?? '0.0'}</span>
              <span style={s.statLabel}>Rep ★</span>
            </div>
          </div>
        </div>

        <div style={s.repCard}>
          <Award size={18} style={{ color: 'var(--color-primary-500)' }} />
          <div style={s.repInfo}>
            <span style={s.repTitle}>Reputation Score</span>
            <span style={s.repSub}>
              {(profile.reputation_score ?? 0) >= 4.5 ? 'Top 15% of hunters' : 'Building reputation'}
            </span>
          </div>
          <div style={s.repScore}>
            <span style={s.repNum}>{profile.reputation_score ?? 0}</span>
            <Star size={12} style={{ color: 'var(--color-primary-500)', fill: 'var(--color-primary-500)' }} />
          </div>
        </div>

        {profile.favorite_categories && profile.favorite_categories.length > 0 && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Specialty Categories</h2>
            <div style={s.tags}>
              {profile.favorite_categories.map((cat: string) => (
                <span key={cat} style={s.tag}>{cat}</span>
              ))}
            </div>
          </div>
        )}

        <div style={s.ctaCard}>
          <Shield size={24} style={{ color: 'var(--color-primary-500)', marginBottom: 8 }} />
          <p style={s.ctaTitle}>Join TreasureTrail</p>
          <p style={s.ctaSub}>Discover hidden treasures, follow scouts, and build your own collection.</p>
          <button onClick={() => navigate('/')} style={s.ctaBtn}>Get Started Free</button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: 'var(--color-neutral-50)',
    maxWidth: '480px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
  },
  center: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-6)',
  },
  spinner: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '3px solid var(--color-neutral-200)',
    borderTopColor: 'var(--color-primary-500)',
    animation: 'spin 0.8s linear infinite',
  },
  notFoundTitle: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-800)',
  },
  notFoundSub: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    textAlign: 'center',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  content: {
    flex: 1,
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-6) var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-neutral-100)',
    boxShadow: 'var(--shadow-sm)',
    gap: 'var(--space-2)',
  },
  avatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid var(--color-primary-200)',
    marginBottom: 'var(--space-1)',
  },
  avatarPlaceholder: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary-100)',
    border: '3px solid var(--color-primary-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-1)',
  },
  avatarInitial: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-600)',
  },
  username: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    margin: 0,
  },
  bio: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    textAlign: 'center',
    lineHeight: 'var(--line-height-normal)',
    maxWidth: '280px',
    margin: 0,
  },
  badges: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  rankBadge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
    backgroundColor: 'var(--color-primary-50)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-primary-200)',
  },
  levelBadge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-600)',
    backgroundColor: 'var(--color-neutral-100)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
  },
  xpBadge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-accent-700)',
    backgroundColor: 'var(--color-accent-50)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
  },
  locationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  locationText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  joinDate: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    marginTop: 'var(--space-2)',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  statNumber: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  statLabel: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  statDivider: {
    width: '1px',
    height: '32px',
    backgroundColor: 'var(--color-neutral-200)',
  },
  repCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-primary-100)',
  },
  repInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  repTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  repSub: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  repScore: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  repNum: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    margin: 0,
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },
  tag: {
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-secondary-50)',
    color: 'var(--color-secondary-700)',
    border: '1px solid var(--color-secondary-100)',
  },
  ctaCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-6) var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-neutral-100)',
    textAlign: 'center',
  },
  ctaTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    margin: '0 0 var(--space-1)',
  },
  ctaSub: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    maxWidth: '260px',
    lineHeight: 'var(--line-height-normal)',
    margin: '0 0 var(--space-4)',
  },
  ctaBtn: {
    padding: 'var(--space-3) var(--space-6)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-500)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    cursor: 'pointer',
    border: 'none',
  },
};
