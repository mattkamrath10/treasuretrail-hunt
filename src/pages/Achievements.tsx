import { useState } from 'react';
import {
  ArrowLeft, Trophy, Star, Zap, Shield, Clock, TrendingUp,
  Eye, Users, MapPin, Flame,
} from 'lucide-react';

type AchievementsTab = 'badges' | 'showcase' | 'challenges';

interface Badge {
  id: string;
  label: string;
  description: string;
  icon: typeof Trophy;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  earned: boolean;
  progress?: number;
  maxProgress?: number;
  earnedDate?: string;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  xp: number;
  progress: number;
  total: number;
  type: 'daily' | 'weekly' | 'seasonal';
  timeLeft?: string;
}


const badges: Badge[] = [
  { id: '1', label: 'First Find', description: 'Post your first discovery', icon: Zap, tier: 'bronze', earned: false },
  { id: '3', label: 'Auction Winner', description: 'Win your first auction', icon: Trophy, tier: 'bronze', earned: false },
  { id: '4', label: 'Rare Item Hunter', description: 'Find an item with 9+ rarity score', icon: Eye, tier: 'gold', earned: false },
  { id: '5', label: 'Estate Sale Expert', description: 'Complete 25 estate sale finds', icon: MapPin, tier: 'silver', earned: false, progress: 0, maxProgress: 25 },
  { id: '6', label: 'Luxury Watch Specialist', description: 'Identify 5 luxury watches', icon: Clock, tier: 'gold', earned: false, progress: 0, maxProgress: 5 },
  { id: '7', label: 'Top Seller', description: 'Maintain 4.8+ rating for 30 days', icon: Shield, tier: 'platinum', earned: false },
  { id: '8', label: 'Fast Responder', description: 'Average response time under 15 min', icon: Clock, tier: 'silver', earned: false },
  { id: '9', label: 'Top Flipper', description: 'Achieve $5,000+ in flip profits', icon: TrendingUp, tier: 'gold', earned: false, progress: 0, maxProgress: 5000 },
  { id: '10', label: 'Power Collector', description: 'Save 100 items to collection', icon: Star, tier: 'platinum', earned: false, progress: 0, maxProgress: 100 },
];

const challenges: Challenge[] = [
  { id: '1', title: 'Daily Discovery', description: 'Post 1 Flash Find today', xp: 50, progress: 0, total: 1, type: 'daily', timeLeft: '18h' },
  { id: '2', title: 'Sale Streak', description: 'Make 3 sales this week', xp: 200, progress: 0, total: 3, type: 'weekly', timeLeft: '4d' },
  { id: '3', title: 'Auction Hunter', description: 'Win 2 auctions this week', xp: 300, progress: 0, total: 2, type: 'weekly', timeLeft: '4d' },
  { id: '4', title: 'Market Maven', description: 'Save 10 items from AI analysis', xp: 150, progress: 0, total: 10, type: 'weekly', timeLeft: '4d' },
  { id: '5', title: 'Summer Treasure Hunt', description: 'Find 20 items at estate sales this season', xp: 1000, progress: 0, total: 20, type: 'seasonal', timeLeft: '62d' },
  { id: '6', title: 'Rare Earth Collection', description: 'Discover 5 items with 8+ rarity', xp: 500, progress: 0, total: 5, type: 'seasonal', timeLeft: '62d' },
];


const tierColors: Record<string, { bg: string; border: string; text: string }> = {
  bronze: { bg: 'rgba(180, 130, 70, 0.1)', border: 'rgba(180, 130, 70, 0.4)', text: '#8B6914' },
  silver: { bg: 'rgba(160, 170, 180, 0.1)', border: 'rgba(160, 170, 180, 0.5)', text: '#5A6673' },
  gold: { bg: 'rgba(234, 179, 8, 0.1)', border: 'rgba(234, 179, 8, 0.4)', text: '#A16207' },
  platinum: { bg: 'rgba(20, 184, 166, 0.1)', border: 'rgba(20, 184, 166, 0.4)', text: '#0F766E' },
};

export default function Achievements({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<AchievementsTab>('badges');

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <h1 style={styles.title}>Achievements</h1>
        <div style={{ width: 36 }} />
      </header>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['badges', 'showcase', 'challenges'] as AchievementsTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {tab === 'badges' && <BadgesTab />}
        {tab === 'showcase' && <ShowcaseTab />}
        {tab === 'challenges' && <ChallengesTab />}
      </div>
    </div>
  );
}


function BadgesTab() {
  const earned = badges.filter((b) => b.earned);
  const inProgress = badges.filter((b) => !b.earned);

  return (
    <>
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Earned ({earned.length})</h3>
        </div>
        <div style={styles.badgesGrid}>
          {earned.map((badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>In Progress ({inProgress.length})</h3>
        </div>
        <div style={styles.badgesGrid}>
          {inProgress.map((badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </div>
    </>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  const tier = tierColors[badge.tier];
  const Icon = badge.icon;

  return (
    <div
      style={{
        ...styles.badgeCard,
        backgroundColor: tier.bg,
        borderColor: tier.border,
        opacity: badge.earned ? 1 : 0.7,
      }}
    >
      <div style={{ ...styles.badgeIconWrap, borderColor: tier.border }}>
        <Icon size={20} style={{ color: tier.text }} />
      </div>
      <span style={{ ...styles.badgeLabel, color: tier.text }}>{badge.label}</span>
      <span style={styles.badgeDesc}>{badge.description}</span>
      {!badge.earned && badge.progress !== undefined && badge.maxProgress !== undefined && (
        <div style={styles.badgeProgress}>
          <div style={styles.badgeProgressBar}>
            <div style={{ ...styles.badgeProgressFill, width: `${(badge.progress / badge.maxProgress) * 100}%`, backgroundColor: tier.border }} />
          </div>
          <span style={styles.badgeProgressText}>{badge.progress}/{badge.maxProgress}</span>
        </div>
      )}
      {badge.earned && (
        <span style={{ ...styles.badgeTier, color: tier.text }}>
          {badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1)}
        </span>
      )}
    </div>
  );
}


function ShowcaseTab() {
  return (
    <>
      <div style={styles.showcaseStats}>
        <div style={styles.showcaseStat}>
          <span style={styles.showcaseStatVal}>$0</span>
          <span style={styles.showcaseStatLbl}>Total Value Discovered</span>
        </div>
        <div style={styles.showcaseStat}>
          <span style={styles.showcaseStatVal}>—</span>
          <span style={styles.showcaseStatLbl}>Highest Rarity Score</span>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Top Finds Gallery</h3>
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-neutral-400)' }}>
          <p style={{ fontSize: 'var(--font-size-sm)' }}>No finds showcased yet.</p>
          <p style={{ fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>Post your first Flash Find to start building your gallery.</p>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Favorite Categories</h3>
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: 'var(--font-size-sm)' }}>
          Categories will appear after you post finds.
        </div>
      </div>
    </>
  );
}

function ChallengesTab() {
  const daily = challenges.filter((c) => c.type === 'daily');
  const weekly = challenges.filter((c) => c.type === 'weekly');
  const seasonal = challenges.filter((c) => c.type === 'seasonal');

  return (
    <>
      {/* Streak section */}
      <div style={styles.streakCard}>
        <div style={styles.streakCardTop}>
          <Flame size={20} style={{ color: 'var(--color-neutral-300)' }} />
          <div style={styles.streakCardInfo}>
            <span style={styles.streakCardTitle}>No active streak</span>
            <span style={styles.streakCardSub}>Post a Flash Find today to start your streak!</span>
          </div>
        </div>
        <div style={styles.streakCalendar}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} style={styles.streakDay}>
              <div style={{ ...styles.streakDayCircle, backgroundColor: 'var(--color-neutral-200)' }} />
              <span style={styles.streakDayLabel}>{d}</span>
            </div>
          ))}
        </div>
      </div>

      {daily.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>Daily Goals</h3>
            <span style={styles.timeLeft}>Resets in {daily[0].timeLeft}</span>
          </div>
          {daily.map((c) => <ChallengeCard key={c.id} challenge={c} />)}
        </div>
      )}

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Weekly Missions</h3>
          <span style={styles.timeLeft}>{weekly[0]?.timeLeft} left</span>
        </div>
        {weekly.map((c) => <ChallengeCard key={c.id} challenge={c} />)}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Seasonal Events</h3>
          <span style={styles.seasonBadge}>Summer 2026</span>
        </div>
        {seasonal.map((c) => <ChallengeCard key={c.id} challenge={c} />)}
      </div>
    </>
  );
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const pct = (challenge.progress / challenge.total) * 100;
  const complete = challenge.progress >= challenge.total;

  return (
    <div style={{ ...styles.challengeCard, ...(complete ? styles.challengeComplete : {}) }}>
      <div style={styles.challengeTop}>
        <div style={styles.challengeInfo}>
          <span style={styles.challengeTitle}>{challenge.title}</span>
          <span style={styles.challengeDesc}>{challenge.description}</span>
        </div>
        <div style={styles.challengeXp}>
          <Zap size={10} style={{ color: 'var(--color-primary-600)' }} />
          <span style={styles.challengeXpText}>{challenge.xp} XP</span>
        </div>
      </div>
      <div style={styles.challengeBottom}>
        <div style={styles.challengeBar}>
          <div style={{ ...styles.challengeBarFill, width: `${pct}%` }} />
        </div>
        <span style={styles.challengeProgress}>{challenge.progress}/{challenge.total}</span>
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
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-600)',
  },
  title: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
  },

  // Tabs
  tabs: {
    display: 'flex',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-50)',
    flexShrink: 0,
    overflow: 'auto',
  },
  tab: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-500)',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    backgroundColor: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
  },

  // Hero card
  heroCard: {
    margin: 'var(--space-4)',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-lg)',
    background: 'linear-gradient(135deg, var(--color-neutral-900) 0%, #1e293b 100%)',
    flexShrink: 0,
  },
  heroTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
  },
  rankCircle: {
    position: 'relative',
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-full)',
    border: '2px solid var(--color-primary-500)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rankNumber: {
    position: 'absolute',
    bottom: '-4px',
    right: '-4px',
    width: '18px',
    height: '18px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  heroInfo: {
    flex: 1,
  },
  heroLevel: {
    display: 'block',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
  },
  heroRank: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  heroScore: {
    textAlign: 'right',
  },
  heroScoreNum: {
    display: 'block',
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-400)',
  },
  heroScoreLabel: {
    fontSize: '10px',
    color: 'var(--color-neutral-400)',
  },

  // XP
  xpSection: {
    marginBottom: 'var(--space-4)',
  },
  xpLabels: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-1)',
  },
  xpText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-300)',
  },
  xpTarget: {
    fontSize: '10px',
    color: 'var(--color-neutral-500)',
  },
  xpBar: {
    height: '6px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-400))',
    borderRadius: 'var(--radius-full)',
    transition: 'width 0.8s ease',
  },

  // Hero stats
  heroStats: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 'var(--space-3)',
  },
  heroStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  heroStatVal: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
  },
  heroStatLbl: {
    fontSize: '10px',
    color: 'var(--color-neutral-400)',
  },
  heroStatDiv: {
    width: '1px',
    height: '20px',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // Streak
  streakRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderRadius: 'var(--radius-md)',
  },
  streakText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-accent-400)',
    flex: 1,
  },
  streakDots: {
    display: 'flex',
    gap: '3px',
  },
  streakDot: {
    width: '6px',
    height: '6px',
    borderRadius: 'var(--radius-full)',
  },

  // Sections
  section: {
    marginBottom: 'var(--space-5)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },

  // Badges
  badgesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-3)',
  },
  badgeCard: {
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '4px',
  },
  badgeIconWrap: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-full)',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px',
  },
  badgeLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
  },
  badgeDesc: {
    fontSize: '10px',
    color: 'var(--color-neutral-500)',
    lineHeight: '1.3',
  },
  badgeProgress: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    marginTop: '4px',
  },
  badgeProgressBar: {
    flex: 1,
    height: '3px',
    backgroundColor: 'var(--color-neutral-200)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  badgeProgressFill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
  },
  badgeProgressText: {
    fontSize: '9px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-500)',
  },
  badgeTier: {
    fontSize: '9px',
    fontWeight: 'var(--font-weight-bold)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginTop: '2px',
  },

  // Leaderboard
  timeframeTabs: {
    display: 'flex',
    gap: 'var(--space-1)',
    marginBottom: 'var(--space-4)',
  },
  timeframeTab: {
    flex: 1,
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    textAlign: 'center',
    backgroundColor: 'var(--color-neutral-50)',
    color: 'var(--color-neutral-600)',
  },
  timeframeTabActive: {
    backgroundColor: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
  },
  leaderList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-5)',
  },
  leaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
  },
  leaderRowYou: {
    backgroundColor: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-200)',
  },
  leaderRank: {
    width: '28px',
    display: 'flex',
    justifyContent: 'center',
    flexShrink: 0,
  },
  medalCircle: {
    width: '24px',
    height: '24px',
    borderRadius: 'var(--radius-full)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
  },
  rankText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-400)',
  },
  leaderInfo: {
    flex: 1,
  },
  leaderName: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  youBadge: {
    fontSize: '9px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
    backgroundColor: 'var(--color-primary-100)',
    padding: '1px 5px',
    borderRadius: 'var(--radius-full)',
  },
  leaderLevel: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  leaderScore: {
    textAlign: 'right',
  },
  leaderScoreNum: {
    display: 'block',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  leaderScoreLabel: {
    fontSize: '10px',
    color: 'var(--color-neutral-400)',
  },

  // Reputation
  repGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  repItem: {},
  repItemHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '4px',
  },
  repItemLabel: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
  },
  repItemValue: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-800)',
  },
  repBar: {
    height: '4px',
    backgroundColor: 'var(--color-neutral-100)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  repBarFill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
    transition: 'width 0.6s ease',
  },
  trustTier: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-secondary-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-secondary-100)',
    marginTop: 'var(--space-3)',
  },
  trustTierInfo: {
    flex: 1,
  },
  trustTierLabel: {
    display: 'block',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-secondary-700)',
  },
  trustTierDesc: {
    fontSize: '10px',
    color: 'var(--color-secondary-600)',
  },

  // Showcase
  showcaseStats: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-5)',
  },
  showcaseStat: {
    flex: 1,
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-100)',
    textAlign: 'center',
  },
  showcaseStatVal: {
    display: 'block',
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  showcaseStatLbl: {
    fontSize: '10px',
    color: 'var(--color-neutral-500)',
  },
  galleryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-3)',
  },
  galleryCard: {
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    border: '1px solid var(--color-neutral-100)',
  },
  galleryImageWrap: {
    position: 'relative',
    aspectRatio: '1',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  galleryRarity: {
    position: 'absolute',
    top: 'var(--space-2)',
    right: 'var(--space-2)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: 'var(--color-primary-400)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
  },
  galleryTitle: {
    display: 'block',
    padding: 'var(--space-2) var(--space-2) 0',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  galleryValue: {
    display: 'block',
    padding: '0 var(--space-2) var(--space-2)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-600)',
  },
  catsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  catRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  catRank: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-400)',
    width: '20px',
  },
  catName: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-800)',
    width: '80px',
  },
  catBarWrap: {
    flex: 1,
    height: '6px',
    backgroundColor: 'var(--color-neutral-100)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-600))',
    borderRadius: 'var(--radius-full)',
  },

  // Challenges
  streakCard: {
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-accent-50), var(--color-primary-50))',
    border: '1px solid var(--color-accent-200)',
    marginBottom: 'var(--space-5)',
  },
  streakCardTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },
  streakCardInfo: {
    flex: 1,
  },
  streakCardTitle: {
    display: 'block',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  streakCardSub: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
  },
  streakCalendar: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  streakDay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  streakDayCircle: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-full)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakDayLabel: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-500)',
  },
  timeLeft: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  seasonBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-50)',
    color: 'var(--color-accent-700)',
    border: '1px solid var(--color-accent-200)',
  },
  challengeCard: {
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
    marginBottom: 'var(--space-2)',
  },
  challengeComplete: {
    backgroundColor: 'var(--color-success-50)',
    borderColor: 'var(--color-success-200)',
  },
  challengeTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-2)',
  },
  challengeInfo: {
    flex: 1,
  },
  challengeTitle: {
    display: 'block',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-800)',
  },
  challengeDesc: {
    fontSize: '10px',
    color: 'var(--color-neutral-500)',
  },
  challengeXp: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '2px 6px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    flexShrink: 0,
  },
  challengeXpText: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-700)',
  },
  challengeBottom: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  challengeBar: {
    flex: 1,
    height: '4px',
    backgroundColor: 'var(--color-neutral-200)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  challengeBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-600))',
    borderRadius: 'var(--radius-full)',
  },
  challengeProgress: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-500)',
    minWidth: '24px',
    textAlign: 'right',
  },
};
