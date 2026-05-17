import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Star, Camera, Heart, Upload, Award, ChevronRight, LogOut, MapPin, Shield, Clock, Package, Truck, MessageCircle, Zap, User, CircleCheck as CheckCircle, Eye, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GuestOverlay } from '../components/GuestGate';

type ProfileTab = 'overview' | 'reputation' | 'activity' | 'scouts';

interface SavedItem {
  id: string;
  image: string;
  title: string;
  price: string;
}

interface ActivityItem {
  id: string;
  type: 'find' | 'scout' | 'auction' | 'match' | 'review';
  title: string;
  timestamp: string;
  detail: string;
}

interface ScoutProfile {
  id: string;
  username: string;
  rating: number;
  region: string;
  specialties: string[];
  completedJobs: number;
  verified: boolean;
}

const savedFinds: SavedItem[] = [
  { id: '1', image: 'https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=300', title: 'Polaroid SX-70', price: '$45' },
  { id: '2', image: 'https://images.pexels.com/photos/1152077/pexels-photo-1152077.jpeg?auto=compress&cs=tinysrgb&w=300', title: 'Teak Sideboard', price: '$180' },
  { id: '3', image: 'https://images.pexels.com/photos/1038000/pexels-photo-1038000.jpeg?auto=compress&cs=tinysrgb&w=300', title: 'Hemingway Set', price: '$320' },
  { id: '4', image: 'https://images.pexels.com/photos/1191531/pexels-photo-1191531.jpeg?auto=compress&cs=tinysrgb&w=300', title: 'Tea Set', price: '$65' },
];

const activityFeed: ActivityItem[] = [
  { id: '1', type: 'find', title: 'Posted a new find: Vintage Brass Lamp', timestamp: '2h ago', detail: 'AI valued at $85-$150' },
  { id: '2', type: 'scout', title: 'Completed scout job for @watch_seeker', timestamp: '1d ago', detail: 'Found Rolex Submariner at estate sale' },
  { id: '3', type: 'review', title: 'Received 5-star review from @collector_mike', timestamp: '2d ago', detail: '"Fast, reliable, great communication"' },
  { id: '4', type: 'auction', title: 'Auction assist: Mid-Century Credenza', timestamp: '3d ago', detail: 'Won at $420 (budget was $500)' },
  { id: '5', type: 'match', title: 'Helped match: Nintendo 64 Complete Set', timestamp: '5d ago', detail: 'Connected buyer with seller in Austin' },
];

const nearbyScouts: ScoutProfile[] = [
  { id: '1', username: 'estate_pro', rating: 4.9, region: 'Brooklyn, NY', specialties: ['Furniture', 'Antiques'], completedJobs: 87, verified: true },
  { id: '2', username: 'thrift_ninja', rating: 4.7, region: 'Austin, TX', specialties: ['Electronics', 'Toys'], completedJobs: 52, verified: true },
  { id: '3', username: 'vintage_eye', rating: 4.8, region: 'Portland, OR', specialties: ['Watches', 'Jewelry'], completedJobs: 114, verified: true },
  { id: '4', username: 'barn_find_bill', rating: 4.6, region: 'Nashville, TN', specialties: ['Tools', 'Collectibles'], completedJobs: 33, verified: false },
];

const verificationBadges = [
  { label: 'Verified Scout', icon: Shield, earned: true },
  { label: 'Pickup Helper', icon: Truck, earned: true },
  { label: 'High Value Specialist', icon: Star, earned: false },
  { label: 'Estate Sale Expert', icon: Award, earned: true },
  { label: 'Auction Runner', icon: Zap, earned: false },
];

export default function Profile() {
  const { profile, signOut, isGuest } = useAuth();
  const [tab, setTab] = useState<ProfileTab>('overview');
  const navigate = useNavigate();

  if (isGuest) {
    return (
      <div style={styles.container}>
        <GuestOverlay
          title="Your Treasure Profile"
          subtitle="Create a free account to build your TreasureRank, track finds, and connect with collectors."
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Profile</h1>
        <div style={styles.headerActions}>
          <button onClick={() => navigate('/achievements')} style={styles.achieveBtn}>
            <Trophy size={14} style={{ color: 'var(--color-primary-600)' }} />
            <span style={styles.achieveBtnText}>Rank</span>
          </button>
          <button onClick={() => navigate('/safety')} style={styles.iconBtn}>
            <Shield size={18} style={{ color: 'var(--color-secondary-500)' }} />
          </button>
          <button onClick={signOut} style={styles.iconBtn}>
            <LogOut size={18} style={{ color: 'var(--color-neutral-600)' }} />
          </button>
          <button style={styles.iconBtn}>
            <Settings size={20} style={{ color: 'var(--color-neutral-600)' }} />
          </button>
        </div>
      </header>

      <div style={styles.content}>
        <ProfileHeader profile={profile} />

        <div style={styles.tabs}>
          {(['overview', 'reputation', 'activity', 'scouts'] as ProfileTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab profile={profile} />}
        {tab === 'reputation' && <ReputationTab />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'scouts' && <ScoutsTab />}
      </div>
    </div>
  );
}

function ProfileHeader({ profile }: { profile: any }) {
  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'May 2026';

  return (
    <div style={styles.profileCard}>
      <div style={styles.avatarContainer}>
        <div style={styles.avatar}>
          <Camera size={24} style={{ color: 'var(--color-neutral-400)' }} />
        </div>
        <div style={styles.editBadge}>
          <Camera size={10} style={{ color: 'var(--color-neutral-0)' }} />
        </div>
      </div>
      <h2 style={styles.username}>@{profile?.username || 'treasure_hunter'}</h2>
      {profile?.bio ? (
        <p style={styles.bio}>{profile.bio}</p>
      ) : (
        <p style={styles.bio}>Passionate collector and scout. Finding hidden treasures everywhere.</p>
      )}
      <div style={styles.rankRow}>
        <span style={styles.rankBadge}>{profile?.treasure_rank || 'Hunter'}</span>
        <span style={styles.levelBadge}>Lv. {profile?.level || 1}</span>
        <span style={styles.xpBadge}>{profile?.xp || 0} XP</span>
      </div>
      <div style={styles.locationRow}>
        <MapPin size={12} style={{ color: 'var(--color-neutral-400)' }} />
        <span style={styles.locationText}>Brooklyn, NY</span>
      </div>
      <span style={styles.joinDate}>Member since {joinDate}</span>

      <div style={styles.stats}>
        <div style={styles.stat}>
          <span style={styles.statNumber}>{profile?.follower_count || 0}</span>
          <span style={styles.statLabel}>Followers</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statNumber}>{profile?.following_count || 0}</span>
          <span style={styles.statLabel}>Following</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statNumber}>47</span>
          <span style={styles.statLabel}>Finds</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.stat}>
          <span style={styles.statNumber}>128</span>
          <span style={styles.statLabel}>Saved</span>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ profile }: { profile: any }) {
  const repScore = profile?.reputation_score ?? 5.0;
  return (
    <>
      <div style={styles.reputationCard}>
        <div style={styles.repLeft}>
          <Award size={20} style={{ color: 'var(--color-primary-500)' }} />
          <div>
            <h3 style={styles.repTitle}>Reputation Score</h3>
            <p style={styles.repSubtitle}>{repScore >= 4.5 ? 'Top 15% of hunters' : 'Building reputation'}</p>
          </div>
        </div>
        <div style={styles.repScore}>
          <span style={styles.scoreNumber}>{repScore}</span>
          <Star size={14} style={{ color: 'var(--color-primary-500)', fill: 'var(--color-primary-500)' }} />
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Shield size={16} style={{ color: 'var(--color-secondary-500)' }} />
          <h3 style={styles.sectionTitle}>Verification Badges</h3>
        </div>
        <div style={styles.badgesGrid}>
          {verificationBadges.map((badge) => (
            <div
              key={badge.label}
              style={{
                ...styles.badgeItem,
                ...(badge.earned ? {} : styles.badgeItemLocked),
              }}
            >
              <badge.icon
                size={18}
                style={{
                  color: badge.earned ? 'var(--color-primary-500)' : 'var(--color-neutral-300)',
                }}
              />
              <span
                style={{
                  ...styles.badgeLabel,
                  color: badge.earned ? 'var(--color-neutral-700)' : 'var(--color-neutral-400)',
                }}
              >
                {badge.label}
              </span>
              {badge.earned && (
                <CheckCircle size={12} style={{ color: 'var(--color-success-500)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {profile?.favorite_categories && profile.favorite_categories.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Favorite Categories</h3>
          </div>
          <div style={styles.categoriesList}>
            {profile.favorite_categories.map((cat: string) => (
              <span key={cat} style={styles.categoryTag}>{cat}</span>
            ))}
          </div>
        </div>
      )}

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <Heart size={16} style={{ color: 'var(--color-error-400)' }} />
          <h3 style={styles.sectionTitle}>Saved Finds</h3>
          <ChevronRight size={16} style={{ color: 'var(--color-neutral-400)', marginLeft: 'auto' }} />
        </div>
        <div style={styles.grid}>
          {savedFinds.map((item) => (
            <div key={item.id} style={styles.gridItem}>
              <img src={item.image} alt={item.title} style={styles.gridImage} />
              <div style={styles.gridOverlay}>
                <span style={styles.gridPrice}>{item.price}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ReputationTab() {
  return (
    <>
      <div style={styles.repPanel}>
        <div style={styles.repPanelHeader}>
          <div style={styles.trustedBadge}>
            <Shield size={20} style={{ color: 'var(--color-primary-600)' }} />
            <span style={styles.trustedText}>Trusted Scout</span>
          </div>
          <div style={styles.repScoreLarge}>
            <span style={styles.repScoreNum}>4.8</span>
            <span style={styles.repScoreMax}>/5.0</span>
          </div>
        </div>

        <div style={styles.repMetrics}>
          <div style={styles.repMetric}>
            <div style={styles.repMetricIcon}>
              <Star size={14} style={{ color: 'var(--color-primary-500)' }} />
            </div>
            <div style={styles.repMetricInfo}>
              <span style={styles.repMetricLabel}>Positive Reviews</span>
              <span style={styles.repMetricValue}>96%</span>
            </div>
            <div style={styles.repMetricBar}>
              <div style={{ ...styles.repMetricFill, width: '96%' }} />
            </div>
          </div>

          <div style={styles.repMetric}>
            <div style={styles.repMetricIcon}>
              <Package size={14} style={{ color: 'var(--color-secondary-500)' }} />
            </div>
            <div style={styles.repMetricInfo}>
              <span style={styles.repMetricLabel}>Successful Shipments</span>
              <span style={styles.repMetricValue}>42/44</span>
            </div>
            <div style={styles.repMetricBar}>
              <div style={{ ...styles.repMetricFill, width: '95%', backgroundColor: 'var(--color-secondary-500)' }} />
            </div>
          </div>

          <div style={styles.repMetric}>
            <div style={styles.repMetricIcon}>
              <Zap size={14} style={{ color: 'var(--color-accent-500)' }} />
            </div>
            <div style={styles.repMetricInfo}>
              <span style={styles.repMetricLabel}>Auction Wins</span>
              <span style={styles.repMetricValue}>12</span>
            </div>
            <div style={styles.repMetricBar}>
              <div style={{ ...styles.repMetricFill, width: '60%', backgroundColor: 'var(--color-accent-500)' }} />
            </div>
          </div>

          <div style={styles.repMetric}>
            <div style={styles.repMetricIcon}>
              <MessageCircle size={14} style={{ color: 'var(--color-success-500)' }} />
            </div>
            <div style={styles.repMetricInfo}>
              <span style={styles.repMetricLabel}>Communication Rating</span>
              <span style={styles.repMetricValue}>4.9/5</span>
            </div>
            <div style={styles.repMetricBar}>
              <div style={{ ...styles.repMetricFill, width: '98%', backgroundColor: 'var(--color-success-500)' }} />
            </div>
          </div>

          <div style={styles.repMetric}>
            <div style={styles.repMetricIcon}>
              <Clock size={14} style={{ color: 'var(--color-warning-500)' }} />
            </div>
            <div style={styles.repMetricInfo}>
              <span style={styles.repMetricLabel}>Response Speed</span>
              <span style={styles.repMetricValue}>Under 1 hour</span>
            </div>
            <div style={styles.repMetricBar}>
              <div style={{ ...styles.repMetricFill, width: '92%', backgroundColor: 'var(--color-warning-500)' }} />
            </div>
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Specialty Categories</h3>
        </div>
        <div style={styles.categoriesList}>
          <span style={styles.categoryTag}>Furniture</span>
          <span style={styles.categoryTag}>Antiques</span>
          <span style={styles.categoryTag}>Watches</span>
          <span style={styles.categoryTag}>Estate Sales</span>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <MapPin size={16} style={{ color: 'var(--color-neutral-500)' }} />
          <h3 style={styles.sectionTitle}>Regional Coverage</h3>
        </div>
        <div style={styles.regionCard}>
          <div style={styles.regionRow}>
            <span style={styles.regionLabel}>Primary</span>
            <span style={styles.regionValue}>Brooklyn & Manhattan, NY</span>
          </div>
          <div style={styles.regionRow}>
            <span style={styles.regionLabel}>Secondary</span>
            <span style={styles.regionValue}>Long Island, NJ</span>
          </div>
          <div style={styles.regionRow}>
            <span style={styles.regionLabel}>Range</span>
            <span style={styles.regionValue}>50 mile radius</span>
          </div>
        </div>
      </div>
    </>
  );
}

function ActivityTab() {
  const activityIcons: Record<string, typeof Star> = {
    find: Upload,
    scout: Eye,
    auction: Zap,
    match: CheckCircle,
    review: Star,
  };

  const activityColors: Record<string, string> = {
    find: 'var(--color-secondary-500)',
    scout: 'var(--color-primary-500)',
    auction: 'var(--color-accent-500)',
    match: 'var(--color-success-500)',
    review: 'var(--color-warning-500)',
  };

  return (
    <div style={styles.activityList}>
      {activityFeed.map((item, index) => {
        const Icon = activityIcons[item.type];
        const color = activityColors[item.type];
        return (
          <div
            key={item.id}
            style={{
              ...styles.activityItem,
              animationDelay: `${index * 80}ms`,
            }}
          >
            <div style={{ ...styles.activityIcon, backgroundColor: `${color}15` }}>
              <Icon size={16} style={{ color }} />
            </div>
            <div style={styles.activityContent}>
              <h4 style={styles.activityTitle}>{item.title}</h4>
              <p style={styles.activityDetail}>{item.detail}</p>
              <span style={styles.activityTime}>{item.timestamp}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoutsTab() {
  return (
    <>
      <p style={styles.scoutsIntro}>Discover trusted scouts in your area</p>
      <div style={styles.scoutsList}>
        {nearbyScouts.map((scout, index) => (
          <ScoutCard key={scout.id} scout={scout} delay={index * 80} />
        ))}
      </div>
    </>
  );
}

function ScoutCard({ scout, delay }: { scout: ScoutProfile; delay: number }) {
  return (
    <div style={{ ...styles.scoutCard, animationDelay: `${delay}ms` }}>
      <div style={styles.scoutCardTop}>
        <div style={styles.scoutAvatar}>
          <User size={20} style={{ color: 'var(--color-neutral-400)' }} />
        </div>
        <div style={styles.scoutInfo}>
          <div style={styles.scoutNameRow}>
            <span style={styles.scoutUsername}>@{scout.username}</span>
            {scout.verified && (
              <Shield size={12} style={{ color: 'var(--color-primary-500)' }} />
            )}
          </div>
          <div style={styles.scoutMetaRow}>
            <span style={styles.scoutRating}>
              <Star size={10} style={{ color: 'var(--color-primary-500)', fill: 'var(--color-primary-500)' }} />
              {scout.rating}
            </span>
            <span style={styles.scoutRegion}>
              <MapPin size={10} /> {scout.region}
            </span>
          </div>
        </div>
      </div>

      <div style={styles.scoutSpecialties}>
        {scout.specialties.map((spec) => (
          <span key={spec} style={styles.scoutSpecTag}>{spec}</span>
        ))}
      </div>

      <div style={styles.scoutCardFooter}>
        <span style={styles.scoutJobs}>{scout.completedJobs} jobs completed</span>
        <button style={styles.requestBtn}>Request Help</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  title: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  achieveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
  },
  achieveBtnText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
  },
  iconBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
  },

  // Profile card
  profileCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-5) var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    marginBottom: 'var(--space-4)',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid var(--color-neutral-100)',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 'var(--space-3)',
  },
  avatar: {
    width: '80px',
    height: '80px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '3px solid var(--color-primary-200)',
  },
  editBadge: {
    position: 'absolute',
    bottom: '2px',
    right: '2px',
    width: '24px',
    height: '24px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid var(--color-neutral-0)',
  },
  username: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  bio: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    textAlign: 'center',
    marginTop: 'var(--space-1)',
    lineHeight: 'var(--line-height-normal)',
    maxWidth: '280px',
  },
  rankRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-2)',
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
    marginTop: 'var(--space-2)',
  },
  locationText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  joinDate: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    marginTop: 'var(--space-1)',
    marginBottom: 'var(--space-4)',
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    width: '100%',
    justifyContent: 'center',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  statLabel: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    marginTop: '2px',
  },
  statDivider: {
    width: '1px',
    height: '32px',
    backgroundColor: 'var(--color-neutral-200)',
  },

  // Tabs
  tabs: {
    display: 'flex',
    gap: 'var(--space-1)',
    marginBottom: 'var(--space-4)',
    padding: 'var(--space-1)',
    backgroundColor: 'var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
  },
  tab: {
    flex: 1,
    padding: 'var(--space-2) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-500)',
    textAlign: 'center',
    transition: 'all var(--transition-fast)',
  },
  tabActive: {
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)',
    fontWeight: 'var(--font-weight-semibold)',
    boxShadow: 'var(--shadow-sm)',
  },

  // Reputation card
  reputationCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-primary-100)',
    marginBottom: 'var(--space-5)',
  },
  repLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  repTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  repSubtitle: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  repScore: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  scoreNumber: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },

  // Badges
  badgesGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  badgeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  badgeItemLocked: {
    opacity: 0.5,
  },
  badgeLabel: {
    flex: 1,
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },

  // Sections
  section: {
    marginBottom: 'var(--space-5)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  categoriesList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },
  categoryTag: {
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-secondary-50)',
    color: 'var(--color-secondary-700)',
    border: '1px solid var(--color-secondary-100)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-2)',
  },
  gridItem: {
    position: 'relative',
    aspectRatio: '1',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 'var(--space-2) var(--space-3)',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
  },
  gridPrice: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
  },

  // Reputation panel
  repPanel: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    marginBottom: 'var(--space-5)',
  },
  repPanelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
    paddingBottom: 'var(--space-3)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  trustedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-primary-200)',
  },
  trustedText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  repScoreLarge: {
    display: 'flex',
    alignItems: 'baseline',
  },
  repScoreNum: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  repScoreMax: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-400)',
  },
  repMetrics: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  repMetric: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },
  repMetricIcon: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-neutral-50)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  repMetricInfo: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  repMetricLabel: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
  },
  repMetricValue: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  repMetricBar: {
    width: '100%',
    height: '4px',
    backgroundColor: 'var(--color-neutral-100)',
    borderRadius: 'var(--radius-full)',
    marginTop: 'var(--space-1)',
  },
  repMetricFill: {
    height: '100%',
    backgroundColor: 'var(--color-primary-500)',
    borderRadius: 'var(--radius-full)',
    transition: 'width 0.6s ease',
  },

  // Regional coverage
  regionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  regionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  regionLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-500)',
  },
  regionValue: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-800)',
  },

  // Activity
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  activityItem: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  activityIcon: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityContent: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-800)',
    lineHeight: 'var(--line-height-tight)',
    marginBottom: '2px',
  },
  activityDetail: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    lineHeight: 'var(--line-height-normal)',
    marginBottom: '2px',
  },
  activityTime: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },

  // Scouts tab
  scoutsIntro: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginBottom: 'var(--space-4)',
  },
  scoutsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  scoutCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    boxShadow: 'var(--shadow-sm)',
    animation: 'slideUp 0.4s ease forwards',
    opacity: 0,
    animationFillMode: 'forwards',
  },
  scoutCardTop: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },
  scoutAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scoutInfo: {
    flex: 1,
  },
  scoutNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    marginBottom: '2px',
  },
  scoutUsername: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  scoutMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  scoutRating: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  scoutRegion: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  scoutSpecialties: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },
  scoutSpecTag: {
    padding: '2px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
  },
  scoutCardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  scoutJobs: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  requestBtn: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
  },
};
