import { useState, useEffect } from 'react';
import {
  ArrowLeft, Target, Zap, Trophy, Users, Clock, Star,
  MapPin, Crown, Shield, Award, TrendingUp, Play, Lock,
  ChevronRight, Eye,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGuestAction } from '../components/GuestGate';
import { supabase } from '../lib/supabase';
import { TreasureChestLogo } from '../components/TreasureChestLogo';

type HubView = 'main' | 'missions' | 'events' | 'leaderboards' | 'activity' | 'clubs';

interface Mission {
  id: string;
  title: string;
  description: string;
  type: string;
  rarity: string;
  xp_reward: number;
  coin_reward: number;
  difficulty: string;
  category: string;
  region: string;
  participant_count: number;
  total_steps: number;
  ends_at: string | null;
  status: string;
  rarity_multiplier: number;
  pro_exclusive: boolean;
}

interface LiveEvent {
  id: string;
  title: string;
  description: string;
  type: string;
  image_url: string | null;
  region: string;
  starts_at: string;
  ends_at: string | null;
  participant_count: number;
  rarity_boost: number;
  reward_tier: string;
  reward_xp: number;
  status: string;
  featured: boolean;
  pro_exclusive: boolean;
}

interface ClubRank {
  id: string;
  club_name: string;
  xp_total: number;
  member_count: number;
  rank: number;
  icon: string;
  color: string;
}

interface ActivityEntry {
  id: string;
  activity_type: string;
  content: string;
  region: string;
  rarity_level: string;
  created_at: string;
}

export default function LiveHub({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<HubView>('main');

  if (view === 'main') return <MainHub onBack={onBack} onNavigate={setView} />;
  if (view === 'missions') return <MissionsView onBack={() => setView('main')} />;
  if (view === 'events') return <EventsView onBack={() => setView('main')} />;
  if (view === 'leaderboards') return <LeaderboardsView onBack={() => setView('main')} />;
  if (view === 'activity') return <ActivityView onBack={() => setView('main')} />;
  if (view === 'clubs') return <ClubsView onBack={() => setView('main')} />;
  return <MainHub onBack={onBack} onNavigate={setView} />;
}

function MainHub({ onBack, onNavigate }: { onBack: () => void; onNavigate: (v: HubView) => void }) {
  const { profile } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    supabase.from('hunt_missions').select('*').eq('status', 'active').order('ends_at', { ascending: true }).limit(3).then(({ data }) => {
      if (data) setMissions(data);
    });
    supabase.from('live_events').select('*').in('status', ['active', 'upcoming']).order('starts_at', { ascending: true }).limit(2).then(({ data }) => {
      if (data) setEvents(data);
    });
    supabase.from('live_activity_feed').select('*').order('created_at', { ascending: false }).limit(5).then(({ data }) => {
      if (data) setActivity(data);
    });
  }, []);

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Live Hub</span>
        <div style={st.xpPill}><Zap size={10} style={{ color: 'var(--color-primary-700)' }} /><span style={st.xpText}>{profile?.xp || 0} XP</span></div>
      </header>

      <div style={st.scrollContent}>
        {/* Live pulse banner */}
        <div style={st.liveBanner}>
          <div style={st.liveDot} />
          <span style={st.liveText}>2 events active now - 656 hunters competing</span>
        </div>

        {/* Quick nav */}
        <div style={st.quickNav}>
          <button onClick={() => onNavigate('missions')} style={st.qnBtn}>
            <div style={{ ...st.qnIcon, backgroundColor: 'var(--color-primary-50)' }}><Target size={18} style={{ color: 'var(--color-primary-600)' }} /></div>
            <span style={st.qnLabel}>Missions</span>
          </button>
          <button onClick={() => onNavigate('events')} style={st.qnBtn}>
            <div style={{ ...st.qnIcon, backgroundColor: 'var(--color-error-50)' }}><Play size={18} style={{ color: 'var(--color-error-500)' }} /></div>
            <span style={st.qnLabel}>Events</span>
          </button>
          <button onClick={() => onNavigate('leaderboards')} style={st.qnBtn}>
            <div style={{ ...st.qnIcon, backgroundColor: 'var(--color-warning-50)' }}><Trophy size={18} style={{ color: 'var(--color-warning-600)' }} /></div>
            <span style={st.qnLabel}>Ranks</span>
          </button>
          <button onClick={() => onNavigate('clubs')} style={st.qnBtn}>
            <div style={{ ...st.qnIcon, backgroundColor: 'var(--color-secondary-50)' }}><Users size={18} style={{ color: 'var(--color-secondary-500)' }} /></div>
            <span style={st.qnLabel}>Clubs</span>
          </button>
          <button onClick={() => onNavigate('activity')} style={st.qnBtn}>
            <div style={{ ...st.qnIcon, backgroundColor: 'var(--color-success-50)' }}><TrendingUp size={18} style={{ color: 'var(--color-success-500)' }} /></div>
            <span style={st.qnLabel}>Feed</span>
          </button>
        </div>

        {/* Active missions preview */}
        <div style={st.section}>
          <div style={st.sectionRow}>
            <h3 style={st.sectionTitle}>Active Missions</h3>
            <button onClick={() => onNavigate('missions')} style={st.seeAll}><span style={st.seeAllText}>See All</span><ChevronRight size={12} style={{ color: 'var(--color-primary-600)' }} /></button>
          </div>
          {missions.map((m) => <MissionCard key={m.id} mission={m} compact />)}
        </div>

        {/* Featured events */}
        <div style={st.section}>
          <div style={st.sectionRow}>
            <h3 style={st.sectionTitle}>Live Events</h3>
            <button onClick={() => onNavigate('events')} style={st.seeAll}><span style={st.seeAllText}>See All</span><ChevronRight size={12} style={{ color: 'var(--color-primary-600)' }} /></button>
          </div>
          {events.map((e) => <EventCard key={e.id} event={e} />)}
        </div>

        {/* Activity stream */}
        <div style={st.section}>
          <div style={st.sectionRow}>
            <h3 style={st.sectionTitle}>Live Activity</h3>
            <button onClick={() => onNavigate('activity')} style={st.seeAll}><span style={st.seeAllText}>See All</span><ChevronRight size={12} style={{ color: 'var(--color-primary-600)' }} /></button>
          </div>
          <div style={st.activityStream}>
            {activity.map((a) => <ActivityRow key={a.id} entry={a} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

const HUB_LEVELS = [
  { name: 'Rookie Hunter', minXp: 0, maxXp: 500 },
  { name: 'Treasure Scout', minXp: 500, maxXp: 1500 },
  { name: 'Elite Picker', minXp: 1500, maxXp: 4000 },
  { name: 'Master Collector', minXp: 4000, maxXp: 8000 },
  { name: 'Legendary Hunter', minXp: 8000, maxXp: 15000 },
];
function getHubLevel(xp: number) {
  const level = HUB_LEVELS.find((l) => xp >= l.minXp && xp < l.maxXp) || HUB_LEVELS[HUB_LEVELS.length - 1];
  const progress = Math.min(((xp - level.minXp) / (level.maxXp - level.minXp)) * 100, 100);
  const xpToNext = Math.max(level.maxXp - xp, 0);
  return { name: level.name, progress, xpToNext };
}

function MissionsView({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    supabase.from('hunt_missions').select('*').eq('status', 'active').order('ends_at', { ascending: true }).then(({ data }) => {
      if (data) setMissions(data);
    });
  }, []);

  const filtered = filter === 'all' ? missions : missions.filter((m) => m.type === filter);
  const filters = ['all', 'daily', 'weekly', 'seasonal', 'limited', 'team'];
  const xp = profile?.xp ?? 0;
  const { name: levelName, progress: levelProgress, xpToNext } = getHubLevel(xp);

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Hunt Missions</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        {/* Level progress */}
        <div style={st.levelBanner}>
          <TreasureChestLogo size={28} glow />
          <div style={st.levelInfo}>
            <span style={st.levelTitle}>{levelName}</span>
            <div style={st.levelBar}><div style={{ ...st.levelFill, width: `${levelProgress}%` }} /></div>
            <span style={st.levelSub}>{xpToNext > 0 ? `${xpToNext.toLocaleString()} XP to next level` : 'Max level reached'}</span>
          </div>
        </div>

        {/* Filters */}
        <div style={st.filterRow}>
          {filters.map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{ ...st.filterChip, ...(filter === f ? st.filterActive : {}) }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Mission list */}
        {filtered.map((m) => <MissionCard key={m.id} mission={m} />)}
      </div>
    </div>
  );
}

function EventsView({ onBack }: { onBack: () => void }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);

  useEffect(() => {
    supabase.from('live_events').select('*').in('status', ['active', 'upcoming']).order('starts_at', { ascending: true }).then(({ data }) => {
      if (data) setEvents(data);
    });
  }, []);

  const active = events.filter((e) => e.status === 'active');
  const upcoming = events.filter((e) => e.status === 'upcoming');

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Live Events</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        {active.length > 0 && (
          <div style={st.section}>
            <div style={st.sectionRow}>
              <div style={st.liveDot} />
              <h3 style={st.sectionTitle}>Happening Now</h3>
            </div>
            {active.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}

        <div style={st.section}>
          <h3 style={st.sectionTitle}>Upcoming</h3>
          {upcoming.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      </div>
    </div>
  );
}

function LeaderboardsView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'collectors' | 'scouts' | 'flippers'>('collectors');

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Leaderboards</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        <div style={st.tabRow}>
          {(['collectors', 'scouts', 'flippers'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...st.tabBtn, ...(tab === t ? st.tabActive : {}) }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div style={st.lbList}>
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <Trophy size={36} style={{ color: 'var(--color-neutral-200)', marginBottom: '12px' }} />
            <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-500)', marginBottom: '4px' }}>
              No rankings yet
            </p>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' }}>
              Complete missions and activities to appear on the leaderboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityView({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    supabase.from('live_activity_feed').select('*').order('created_at', { ascending: false }).limit(25).then(({ data }) => {
      if (data) setEntries(data);
    });
  }, []);

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Live Activity</span>
        <div style={st.liveDot} />
      </header>

      <div style={st.scrollContent}>
        <div style={st.activityStream}>
          {entries.map((a) => <ActivityRow key={a.id} entry={a} />)}
        </div>
      </div>
    </div>
  );
}

function ClubsView({ onBack }: { onBack: () => void }) {
  const [clubs, setClubs] = useState<ClubRank[]>([]);

  useEffect(() => {
    supabase.from('club_rankings').select('*').order('rank', { ascending: true }).then(({ data }) => {
      if (data) setClubs(data);
    });
  }, []);

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Club Rankings</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        <div style={st.seasonBanner}>
          <Trophy size={14} style={{ color: 'var(--color-warning-600)' }} />
          <span style={st.seasonText}>Spring 2026 Season - 18 days remaining</span>
        </div>

        {clubs.map((club) => (
          <div key={club.id} style={st.clubRow}>
            <span style={{ ...st.clubRank, color: club.rank <= 3 ? 'var(--color-primary-500)' : 'var(--color-neutral-500)' }}>#{club.rank}</span>
            <div style={{ ...st.clubIcon, backgroundColor: `color-mix(in srgb, ${club.color} 12%, transparent)` }}>
              <span style={{ ...st.clubIconText, color: club.color }}>{club.icon}</span>
            </div>
            <div style={st.clubInfo}>
              <span style={st.clubName}>{club.club_name}</span>
              <span style={st.clubMeta}>{club.member_count.toLocaleString()} members</span>
            </div>
            <div style={st.clubXp}>
              <span style={st.clubXpVal}>{(club.xp_total / 1000).toFixed(1)}k</span>
              <span style={st.clubXpLabel}>XP</span>
            </div>
          </div>
        ))}

        {/* Club features */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Club Competition</h3>
          <div style={st.featGrid}>
            {[
              { icon: Target, label: 'Team Missions', color: 'var(--color-primary-500)' },
              { icon: Trophy, label: 'Trophies', color: 'var(--color-warning-500)' },
              { icon: TrendingUp, label: 'XP Races', color: 'var(--color-success-500)' },
              { icon: Award, label: 'Badges', color: 'var(--color-secondary-500)' },
            ].map((f) => (
              <div key={f.label} style={st.featCard}>
                <f.icon size={16} style={{ color: f.color }} />
                <span style={st.featLabel}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Shared components

function MissionCard({ mission, compact }: { mission: Mission; compact?: boolean }) {
  const { requireAuth } = useGuestAction();
  const rarityColors: Record<string, string> = { common: 'var(--color-neutral-500)', rare: 'var(--color-primary-500)', epic: 'var(--color-secondary-500)', legendary: 'var(--color-warning-500)' };
  const rarityBg: Record<string, string> = { common: 'var(--color-neutral-50)', rare: 'var(--color-primary-50)', epic: 'var(--color-secondary-50)', legendary: 'var(--color-warning-50)' };
  const difficultyColors: Record<string, string> = { easy: 'var(--color-success-600)', medium: 'var(--color-warning-600)', hard: 'var(--color-error-500)', expert: 'var(--color-error-600)' };

  const timeLeft = mission.ends_at ? getCountdown(mission.ends_at) : '';

  return (
    <div style={{ ...st.missionCard, borderLeftColor: rarityColors[mission.rarity] || 'var(--color-neutral-300)' }}>
      <div style={st.missionTop}>
        <div style={st.missionTitleRow}>
          <span style={st.missionTitle}>{mission.title}</span>
          {mission.pro_exclusive && <Lock size={10} style={{ color: 'var(--color-secondary-500)' }} />}
        </div>
        <span style={{ ...st.rarityBadge, color: rarityColors[mission.rarity], backgroundColor: rarityBg[mission.rarity] }}>{mission.rarity}</span>
      </div>

      {!compact && <p style={st.missionDesc}>{mission.description}</p>}

      <div style={st.missionMeta}>
        <span style={st.missionMetaItem}><Zap size={10} /> {mission.xp_reward} XP</span>
        {mission.rarity_multiplier > 1 && <span style={st.missionMultiplier}>{mission.rarity_multiplier}x</span>}
        <span style={{ ...st.missionDiff, color: difficultyColors[mission.difficulty] || 'var(--color-neutral-500)' }}>{mission.difficulty}</span>
        <span style={st.missionMetaItem}><Users size={10} /> {mission.participant_count}</span>
      </div>

      <div style={st.missionBottom}>
        {timeLeft && <span style={st.missionTimer}><Clock size={10} /> {timeLeft}</span>}
        <span style={st.missionType}>{mission.type}</span>
        <button onClick={() => requireAuth(() => {})} style={st.joinMissionBtn}><span style={st.joinMissionText}>Join</span></button>
      </div>
    </div>
  );
}

function EventCard({ event }: { event: LiveEvent }) {
  const { requireAuth } = useGuestAction();
  const isLive = event.status === 'active';
  const tierColors: Record<string, string> = { bronze: 'var(--color-accent-600)', silver: 'var(--color-neutral-500)', gold: 'var(--color-primary-500)', platinum: 'var(--color-secondary-500)', legendary: 'var(--color-warning-500)' };

  return (
    <div style={st.eventCard}>
      {event.image_url && (
        <div style={st.eventImgWrap}>
          <img src={event.image_url} alt={event.title} style={st.eventImg} />
          {isLive && <div style={st.eventLiveBadge}><div style={st.eventLiveDot} /><span style={st.eventLiveText}>LIVE</span></div>}
          {event.pro_exclusive && <div style={st.eventProBadge}><Crown size={8} /> PRO</div>}
          <div style={st.eventTierBadge}><Star size={8} style={{ color: tierColors[event.reward_tier] }} /><span style={{ ...st.eventTierText, color: tierColors[event.reward_tier] }}>{event.reward_tier}</span></div>
        </div>
      )}
      <div style={st.eventInfo}>
        <span style={st.eventTitle}>{event.title}</span>
        <div style={st.eventMetaRow}>
          <span style={st.eventMetaItem}><MapPin size={10} /> {event.region}</span>
          <span style={st.eventMetaItem}><Users size={10} /> {event.participant_count}</span>
          <span style={st.eventMetaItem}><Zap size={10} /> {event.reward_xp} XP</span>
        </div>
        {event.rarity_boost > 1 && <span style={st.eventBoost}>{event.rarity_boost}x Rarity Boost</span>}
        <div style={st.eventActions}>
          <span style={st.eventCountdown}><Clock size={10} /> {isLive ? getCountdown(event.ends_at || '') : `Starts ${getRelativeTime(event.starts_at)}`}</span>
          <button onClick={() => requireAuth(() => {})} style={st.joinEventBtn}><span style={st.joinEventText}>{isLive ? 'Join Now' : 'Notify Me'}</span></button>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const typeIcons: Record<string, typeof Star> = { find: Eye, auction: Zap, radar: Target, mission: Award, trending: TrendingUp, event: Play, scout: Shield };
  const rarityDot: Record<string, string> = { common: 'var(--color-neutral-400)', rare: 'var(--color-primary-500)', epic: 'var(--color-secondary-500)', legendary: 'var(--color-warning-500)' };
  const Icon = typeIcons[entry.activity_type] || Star;

  return (
    <div style={st.actRow}>
      <div style={{ ...st.actDot, backgroundColor: rarityDot[entry.rarity_level] || 'var(--color-neutral-400)' }} />
      <Icon size={12} style={{ color: 'var(--color-neutral-400)', flexShrink: 0 }} />
      <span style={st.actText}>{entry.content}</span>
      <span style={st.actRegion}>{entry.region}</span>
    </div>
  );
}

// Helpers

function getCountdown(endStr: string): string {
  const diff = new Date(endStr).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${mins}m`;
}

function getRelativeTime(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'now';
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

const st: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-neutral-0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  backBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-600)' },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  xpPill: { display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)' },
  xpText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-700)' },
  scrollContent: { flex: 1, overflow: 'auto' },

  // Live banner
  liveBanner: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', backgroundColor: 'var(--color-error-50)', borderBottom: '1px solid var(--color-error-100)' },
  liveDot: { width: '8px', height: '8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-error-500)', animation: 'pulse 2s infinite', flexShrink: 0 },
  liveText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-error-700)', fontWeight: 'var(--font-weight-medium)' },

  // Quick nav
  quickNav: { display: 'flex', justifyContent: 'space-around', padding: 'var(--space-4) var(--space-2)', borderBottom: '1px solid var(--color-neutral-50)' },
  qnBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' },
  qnIcon: { width: '40px', height: '40px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qnLabel: { fontSize: '10px', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-600)' },

  // Sections
  section: { padding: 'var(--space-4)' },
  sectionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)', gap: 'var(--space-2)' },
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)' },
  seeAll: { display: 'flex', alignItems: 'center', gap: '2px' },
  seeAllText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-600)' },

  // Mission card
  missionCard: { padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', borderLeftWidth: '3px', borderLeftStyle: 'solid', marginBottom: 'var(--space-3)' },
  missionTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' },
  missionTitleRow: { display: 'flex', alignItems: 'center', gap: '4px' },
  missionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  missionDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginBottom: 'var(--space-2)', lineHeight: '1.4' },
  rarityBadge: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', padding: '2px 6px', borderRadius: 'var(--radius-full)', textTransform: 'capitalize' as const },
  missionMeta: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' },
  missionMetaItem: { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-600)' },
  missionMultiplier: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-warning-600)', backgroundColor: 'var(--color-warning-50)', padding: '1px 5px', borderRadius: 'var(--radius-full)' },
  missionDiff: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', textTransform: 'capitalize' as const },
  missionBottom: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  missionTimer: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--color-error-600)', fontWeight: 'var(--font-weight-medium)' },
  missionType: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-500)', backgroundColor: 'var(--color-neutral-100)', padding: '1px 5px', borderRadius: 'var(--radius-full)', textTransform: 'capitalize' as const },
  joinMissionBtn: { marginLeft: 'auto', padding: '4px 12px', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))' },
  joinMissionText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-0)' },

  // Event card
  eventCard: { borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', overflow: 'hidden', marginBottom: 'var(--space-3)' },
  eventImgWrap: { position: 'relative', height: '100px' },
  eventImg: { width: '100%', height: '100%', objectFit: 'cover' },
  eventLiveBadge: { position: 'absolute', top: 'var(--space-2)', left: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-error-500)' },
  eventLiveDot: { width: '6px', height: '6px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-0)' },
  eventLiveText: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-0)' },
  eventProBadge: { position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 6px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-secondary-500)', color: 'var(--color-neutral-0)', fontSize: '9px', fontWeight: 'var(--font-weight-bold)' },
  eventTierBadge: { position: 'absolute', bottom: 'var(--space-2)', right: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '2px', padding: '2px 6px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(0,0,0,0.7)' },
  eventTierText: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', textTransform: 'capitalize' as const },
  eventInfo: { padding: 'var(--space-3)' },
  eventTitle: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: '4px' },
  eventMetaRow: { display: 'flex', gap: 'var(--space-3)', marginBottom: '4px' },
  eventMetaItem: { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--color-neutral-500)' },
  eventBoost: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-warning-600)', backgroundColor: 'var(--color-warning-50)', padding: '1px 6px', borderRadius: 'var(--radius-full)', display: 'inline-block', marginBottom: '6px' },
  eventActions: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  eventCountdown: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--color-neutral-500)' },
  joinEventBtn: { padding: '5px 14px', borderRadius: 'var(--radius-full)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))' },
  joinEventText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-0)' },

  // Activity
  activityStream: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  actRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-neutral-50)' },
  actDot: { width: '6px', height: '6px', borderRadius: 'var(--radius-full)', flexShrink: 0 },
  actText: { flex: 1, fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-700)', lineHeight: '1.3' },
  actRegion: { fontSize: '9px', color: 'var(--color-neutral-400)', flexShrink: 0 },

  // Leaderboards
  tabRow: { display: 'flex', gap: 'var(--space-1)', padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--color-neutral-50)' },
  tabBtn: { flex: 1, padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-500)', textAlign: 'center' },
  tabActive: { backgroundColor: 'var(--color-neutral-0)', color: 'var(--color-neutral-900)', fontWeight: 'var(--font-weight-bold)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  lbList: { padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  lbRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  lbRank: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', width: '24px' },
  lbAvatar: { width: '28px', height: '28px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  lbAvatarText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)' },
  lbInfo: { flex: 1 },
  lbName: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  lbMeta: { fontSize: '9px', color: 'var(--color-neutral-500)' },
  lbScore: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)' },

  // Level banner
  levelBanner: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', margin: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-accent-50))', border: '1px solid var(--color-primary-100)' },
  levelInfo: { flex: 1 },
  levelTitle: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: '4px' },
  levelBar: { height: '6px', backgroundColor: 'var(--color-primary-200)', borderRadius: 'var(--radius-full)', overflow: 'hidden', marginBottom: '4px' },
  levelFill: { height: '100%', background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-600))', borderRadius: 'var(--radius-full)' },
  levelSub: { fontSize: '10px', color: 'var(--color-neutral-500)' },

  // Filters
  filterRow: { display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', overflow: 'auto', borderBottom: '1px solid var(--color-neutral-50)' },
  filterChip: { padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', backgroundColor: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)', whiteSpace: 'nowrap', flexShrink: 0 },
  filterActive: { backgroundColor: 'var(--color-neutral-900)', color: 'var(--color-neutral-0)' },

  // Clubs
  seasonBanner: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--color-warning-50)', borderBottom: '1px solid var(--color-warning-100)' },
  seasonText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-warning-700)' },
  clubRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-50)' },
  clubRank: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', width: '24px' },
  clubIcon: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  clubIconText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' },
  clubInfo: { flex: 1 },
  clubName: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  clubMeta: { fontSize: '10px', color: 'var(--color-neutral-500)' },
  clubXp: { textAlign: 'right' },
  clubXpVal: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-600)' },
  clubXpLabel: { fontSize: '9px', color: 'var(--color-neutral-400)' },
  featGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
  featCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  featLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)' },
};
