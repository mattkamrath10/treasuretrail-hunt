import { useState, useEffect } from 'react';
import {
  ArrowLeft, MapPin, Users, Star, Clock, Trophy, Zap,
  Shield, Award, Crown, Target, Flag, Eye,
  Calendar, TrendingUp, Lock,
} from 'lucide-react';
import { TreasureChestLogo } from '../components/TreasureChestLogo';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type EventsView = 'hub' | 'detail' | 'missions' | 'squads' | 'leaderboards' | 'passport' | 'battle';

interface EventItem {
  id: string;
  title: string;
  type: string;
  image: string;
  location: string;
  date: string;
  time: string;
  attendees: number;
  rarity: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  host: string;
  trending?: boolean;
  vip?: boolean;
}

interface SquadMember {
  name: string;
  role: string;
  avatar: string;
  score: number;
}

const events: EventItem[] = [
  { id: '1', title: 'Brooklyn Thrift Crawl', type: 'Thrift Meetup', image: 'https://images.pexels.com/photos/1058959/pexels-photo-1058959.jpeg?auto=compress&cs=tinysrgb&w=600', location: 'Brooklyn, NY', date: 'May 24', time: '9:00 AM', attendees: 47, rarity: 'Vintage Finds', difficulty: 'Easy', host: '@thrift_queen', trending: true },
  { id: '2', title: 'Luxury Watch Expo 2026', type: 'Watch Expo', image: 'https://images.pexels.com/photos/190819/pexels-photo-190819.jpeg?auto=compress&cs=tinysrgb&w=600', location: 'Manhattan, NY', date: 'Jun 1', time: '10:00 AM', attendees: 234, rarity: 'Luxury Watches', difficulty: 'Expert', host: '@luxury_time', vip: true },
  { id: '3', title: 'Storage Wars: Denver', type: 'Storage Auction', image: 'https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=600', location: 'Denver, CO', date: 'May 20', time: '8:00 AM', attendees: 28, rarity: 'Mystery Units', difficulty: 'Hard', host: '@storage_king' },
  { id: '4', title: 'Estate Sale Route: Westchester', type: 'Estate Crawl', image: 'https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=600', location: 'Westchester, NY', date: 'May 25', time: '7:30 AM', attendees: 19, rarity: 'Mid-Century', difficulty: 'Medium', host: '@estate_maven' },
  { id: '5', title: 'Sneaker Scout Championship', type: 'Competition', image: 'https://images.pexels.com/photos/1598505/pexels-photo-1598505.jpeg?auto=compress&cs=tinysrgb&w=600', location: 'Austin, TX', date: 'Jun 8', time: '11:00 AM', attendees: 89, rarity: 'Deadstock Kicks', difficulty: 'Hard', host: '@sneaker_scout', trending: true },
  { id: '6', title: 'Collector Convention NYC', type: 'Convention', image: 'https://images.pexels.com/photos/1038000/pexels-photo-1038000.jpeg?auto=compress&cs=tinysrgb&w=600', location: 'NYC', date: 'Jun 15', time: '9:00 AM', attendees: 512, rarity: 'All Categories', difficulty: 'Easy', host: '@treasuretrail', vip: true },
];

const EVT_LEVELS = [
  { name: 'Rookie Hunter', minXp: 0, maxXp: 500 },
  { name: 'Treasure Scout', minXp: 500, maxXp: 1500 },
  { name: 'Elite Picker', minXp: 1500, maxXp: 4000 },
  { name: 'Master Collector', minXp: 4000, maxXp: 8000 },
  { name: 'Legendary Hunter', minXp: 8000, maxXp: 15000 },
];
function getEvtLevel(xp: number) {
  const level = EVT_LEVELS.find((l) => xp >= l.minXp && xp < l.maxXp) || EVT_LEVELS[EVT_LEVELS.length - 1];
  const progress = Math.min(((xp - level.minXp) / (level.maxXp - level.minXp)) * 100, 100);
  const xpToNext = Math.max(level.maxXp - xp, 0);
  return { name: level.name, progress, xpToNext };
}

const squadMembers: SquadMember[] = [
  { name: 'luxury_time', role: 'Captain', avatar: 'MC', score: 2840 },
  { name: 'thrift_queen', role: 'Scout', avatar: 'SK', score: 2210 },
  { name: 'storage_king', role: 'Flipper', avatar: 'JM', score: 1890 },
  { name: 'rare_books', role: 'Appraiser', avatar: 'EV', score: 1650 },
];

const passportStamps = [
  { city: 'Brooklyn, NY', event: 'Thrift Crawl', date: 'May 10', icon: Star },
  { city: 'Manhattan, NY', event: 'Watch Expo', date: 'Apr 28', icon: Crown },
  { city: 'Denver, CO', event: 'Storage Wars', date: 'Apr 15', icon: Zap },
  { city: 'Austin, TX', event: 'Sneaker Hunt', date: 'Mar 22', icon: Target },
  { city: 'Chicago, IL', event: 'Estate Route', date: 'Mar 8', icon: MapPin },
];

export default function Events({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<EventsView>('hub');

  if (view === 'hub') return <EventsHub onBack={onBack} onNavigate={setView} />;
  if (view === 'detail') return <EventDetail onBack={() => setView('hub')} />;
  if (view === 'missions') return <MissionsPage onBack={() => setView('hub')} />;
  if (view === 'squads') return <SquadsPage onBack={() => setView('hub')} />;
  if (view === 'leaderboards') return <LeaderboardsPage onBack={() => setView('hub')} />;
  if (view === 'passport') return <PassportPage onBack={() => setView('hub')} />;
  if (view === 'battle') return <BattlePage onBack={() => setView('hub')} />;
  return <EventsHub onBack={onBack} onNavigate={setView} />;
}

function EventsHub({ onBack, onNavigate }: { onBack: () => void; onNavigate: (v: EventsView) => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Live Events</span>
        <button onClick={() => onNavigate('passport')} style={st.passportBtn}>
          <Flag size={14} style={{ color: 'var(--color-primary-700)' }} />
        </button>
      </header>

      <div style={st.scrollContent}>
        {/* Story-style event highlights */}
        <div style={st.storyRow}>
          {[
            { label: 'Live Now', color: 'var(--color-error-500)', active: true },
            { label: 'Hunts', color: 'var(--color-primary-500)', active: false },
            { label: 'Battles', color: 'var(--color-accent-500)', active: false },
            { label: 'Meetups', color: 'var(--color-success-500)', active: false },
            { label: 'VIP', color: 'var(--color-secondary-500)', active: false },
          ].map((s) => (
            <div key={s.label} style={{ ...st.storyCircle, borderColor: s.active ? s.color : 'var(--color-neutral-200)', cursor: 'default' }} aria-label={s.label}>
              <span style={{ ...st.storyCircleText, color: s.active ? s.color : 'var(--color-neutral-500)' }}>{s.label.slice(0, 2)}</span>
              {s.active && <div style={st.liveIndicator} />}
            </div>
          ))}
        </div>

        {/* Quick nav */}
        <div style={st.quickNav}>
          <button onClick={() => onNavigate('missions')} style={st.quickNavBtn}>
            <Target size={16} style={{ color: 'var(--color-primary-600)' }} />
            <span style={st.quickNavLabel}>Missions</span>
          </button>
          <button onClick={() => onNavigate('squads')} style={st.quickNavBtn}>
            <Users size={16} style={{ color: 'var(--color-accent-500)' }} />
            <span style={st.quickNavLabel}>Squads</span>
          </button>
          <button onClick={() => onNavigate('battle')} style={st.quickNavBtn}>
            <Zap size={16} style={{ color: 'var(--color-error-500)' }} />
            <span style={st.quickNavLabel}>Battles</span>
          </button>
          <button onClick={() => onNavigate('leaderboards')} style={st.quickNavBtn}>
            <Trophy size={16} style={{ color: 'var(--color-warning-600)' }} />
            <span style={st.quickNavLabel}>Ranks</span>
          </button>
        </div>

        {/* Mission CTA */}
        <div style={st.missionTeaser}>
          <div style={st.missionTeaserLeft}>
            <Target size={14} style={{ color: 'var(--color-primary-600)' }} />
            <div>
              <span style={st.missionTeaserTitle}>Hunt Missions</span>
              <span style={st.missionTeaserProgress}>Complete missions to earn XP and badges</span>
            </div>
          </div>
          <div style={st.missionTeaserBar}>
            <div style={{ ...st.missionTeaserBarFill, width: '0%' }} />
          </div>
        </div>

        {/* Events list */}
        <div style={st.section}>
          <div style={st.sectionHeader}>
            <h3 style={st.sectionTitle}>Upcoming Events</h3>
          </div>

          {events.map((event) => (
            <button key={event.id} onClick={() => onNavigate('detail')} style={st.eventCard}>
              <div style={st.eventImgWrap}>
                <img src={event.image} alt={event.title} style={st.eventImg} />
                <span style={st.eventTypeBadge}>{event.type}</span>
                {event.trending && <span style={st.eventTrendBadge}><TrendingUp size={8} /> Trending</span>}
                {event.vip && <span style={st.eventVipBadge}><Crown size={8} /> VIP</span>}
              </div>
              <div style={st.eventInfo}>
                <span style={st.eventTitle}>{event.title}</span>
                <div style={st.eventMeta}>
                  <span style={st.eventMetaItem}><MapPin size={10} /> {event.location}</span>
                  <span style={st.eventMetaItem}><Calendar size={10} /> {event.date}, {event.time}</span>
                </div>
                <div style={st.eventFooter}>
                  <span style={st.eventAttendees}><Users size={10} /> {event.attendees}</span>
                  <span style={st.eventDifficulty}>{event.difficulty}</span>
                  <span style={st.eventRarity}>{event.rarity}</span>
                </div>
                <div style={st.eventHost}>
                  <span style={st.eventHostText}>Hosted by {event.host}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventDetail({ onBack }: { onBack: () => void }) {
  const event = events[0];

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Event Details</span>
        <button
          style={st.shareBtn}
          aria-label="Share event"
          onClick={async () => {
            const url = typeof window !== 'undefined' ? window.location.href : '';
            const nav: any = typeof navigator !== 'undefined' ? navigator : null;
            if (nav?.share) { try { await nav.share({ title: event.title, text: event.title, url }); return; } catch {} }
            if (nav?.clipboard?.writeText) { try { await nav.clipboard.writeText(url); } catch {} }
          }}
        ><Shield size={16} style={{ color: 'var(--color-secondary-500)' }} /></button>
      </header>

      <div style={st.scrollContent}>
        {/* Hero image */}
        <div style={st.detailHero}>
          <img src={event.image} alt={event.title} style={st.detailHeroImg} />
          <div style={st.detailHeroOverlay}>
            <span style={st.detailHeroType}>{event.type}</span>
          </div>
        </div>

        {/* Info */}
        <div style={st.detailContent}>
          <h2 style={st.detailTitle}>{event.title}</h2>
          <div style={st.detailMetaGrid}>
            <div style={st.detailMetaItem}><Calendar size={14} style={{ color: 'var(--color-primary-500)' }} /><span style={st.detailMetaText}>{event.date} at {event.time}</span></div>
            <div style={st.detailMetaItem}><MapPin size={14} style={{ color: 'var(--color-secondary-500)' }} /><span style={st.detailMetaText}>{event.location}</span></div>
            <div style={st.detailMetaItem}><Users size={14} style={{ color: 'var(--color-accent-500)' }} /><span style={st.detailMetaText}>{event.attendees} attending</span></div>
            <div style={st.detailMetaItem}><Star size={14} style={{ color: 'var(--color-warning-500)' }} /><span style={st.detailMetaText}>{event.rarity}</span></div>
          </div>

          {/* Host */}
          <div style={st.hostCard}>
            <div style={st.hostAvatar}><span style={st.hostAvatarText}>SQ</span></div>
            <div style={st.hostInfo}>
              <span style={st.hostName}>{event.host}</span>
              <span style={st.hostDesc}>Verified Host - 12 events organized</span>
            </div>
            <Shield size={14} style={{ color: 'var(--color-secondary-500)' }} />
          </div>

          {/* Checkpoints */}
          <div style={st.section}>
            <h3 style={st.sectionTitle}>Hunt Checkpoints</h3>
            <div style={st.checkpoints}>
              {['Goodwill Outlet - Start', 'Salvation Army', 'Housing Works', 'Beacon\'s Closet - Finish'].map((cp, i) => (
                <div key={cp} style={st.checkpoint}>
                  <div style={{ ...st.checkpointDot, backgroundColor: i === 0 ? 'var(--color-success-500)' : 'var(--color-neutral-300)' }} />
                  <span style={st.checkpointText}>{cp}</span>
                  {i === 0 && <span style={st.checkpointBadge}>Start</span>}
                  {i === 3 && <span style={st.checkpointBadge}>Finish</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Rewards */}
          <div style={st.section}>
            <h3 style={st.sectionTitle}>Rewards</h3>
            <div style={st.rewardsGrid}>
              <div style={st.rewardCard}>
                <TreasureChestLogo size={24} />
                <span style={st.rewardLabel}>250 XP</span>
              </div>
              <div style={st.rewardCard}>
                <Award size={18} style={{ color: 'var(--color-primary-500)' }} />
                <span style={st.rewardLabel}>Thrift Badge</span>
              </div>
              <div style={st.rewardCard}>
                <Trophy size={18} style={{ color: 'var(--color-warning-500)' }} />
                <span style={st.rewardLabel}>Leaderboard</span>
              </div>
            </div>
          </div>

          {/* Attendees */}
          <div style={st.section}>
            <h3 style={st.sectionTitle}>Attendees</h3>
            <div style={st.attendeeRow}>
              {['MC', 'SK', 'JM', 'EV', 'DH'].map((a) => (
                <div key={a} style={st.attendeeAvatar}><span style={st.attendeeAvatarText}>{a}</span></div>
              ))}
              <span style={st.attendeeMore}>+{event.attendees - 5} more</span>
            </div>
          </div>

          {/* Live activity */}
          <div style={st.section}>
            <h3 style={st.sectionTitle}>Live Activity</h3>
            <div style={st.activityList}>
              <div style={st.activityItem}><span style={st.activityDot} /><span style={st.activityText}>@thrift_queen found a vintage lamp - 2m ago</span></div>
              <div style={st.activityItem}><span style={st.activityDot} /><span style={st.activityText}>@storage_king reached checkpoint 2 - 5m ago</span></div>
              <div style={st.activityItem}><span style={st.activityDot} /><span style={st.activityText}>3 new attendees joined - 8m ago</span></div>
            </div>
          </div>

          {/* Safety */}
          <div style={st.safetyBanner}>
            <Shield size={14} style={{ color: 'var(--color-secondary-600)' }} />
            <span style={st.safetyText}>Guardian Verified Event - Safe Meetup Zone</span>
          </div>

          <button
            style={st.joinBtn}
            onClick={() => {
              try {
                const raw = localStorage.getItem('tt_joined_events');
                const arr: string[] = raw ? JSON.parse(raw) : [];
                if (!arr.includes(event.id)) arr.push(event.id);
                localStorage.setItem('tt_joined_events', JSON.stringify(arr));
                if (typeof window !== 'undefined') window.alert(`You're in! "${event.title}" added to your events.`);
              } catch {}
            }}
            aria-label="Join event"
          >
            <span style={st.joinBtnText}>Join Event</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MissionsPage({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const [missions, setMissions] = useState<{ id: string; title: string; description: string; xp_reward: number; rarity: string; difficulty: string; ends_at: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('hunt_missions')
      .select('id, title, description, xp_reward, rarity, difficulty, ends_at')
      .eq('status', 'active')
      .order('ends_at', { ascending: true })
      .then(({ data }) => {
        if (data) setMissions(data);
        setLoading(false);
      });
  }, []);

  const rarityColors: Record<string, string> = { common: 'var(--color-neutral-500)', rare: 'var(--color-primary-500)', epic: 'var(--color-secondary-500)', legendary: 'var(--color-warning-500)' };
  const rarityBg: Record<string, string> = { common: 'var(--color-neutral-50)', rare: 'var(--color-primary-50)', epic: 'var(--color-secondary-50)', legendary: 'var(--color-warning-50)' };

  const xp = profile?.xp ?? 0;
  const { name: levelName, progress: levelProgress, xpToNext } = getEvtLevel(xp);

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Missions</span>
        <div style={st.xpBadge}><Zap size={10} style={{ color: 'var(--color-primary-700)' }} /><span style={st.xpText}>{xp.toLocaleString()} XP</span></div>
      </header>

      <div style={st.scrollContent}>
        {/* Level progress */}
        <div style={st.levelCard}>
          <div style={st.levelRow}>
            <span style={st.levelLabel}>{levelName}</span>
            <span style={st.levelNext}>{xpToNext > 0 ? `${xpToNext.toLocaleString()} XP to next level` : 'Max level reached'}</span>
          </div>
          <div style={st.levelBar}><div style={{ ...st.levelBarFill, width: `${levelProgress}%` }} /></div>
        </div>

        {/* Active missions */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Active Missions</h3>
          {loading && (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-400)', textAlign: 'center', padding: '24px 0' }}>Loading missions…</p>
          )}
          {!loading && missions.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <Target size={32} style={{ color: 'var(--color-neutral-200)', marginBottom: '8px' }} />
              <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-500)', marginBottom: '4px' }}>No active missions</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' }}>Check back soon — new missions are added regularly.</p>
            </div>
          )}
          {missions.map((m) => (
            <div key={m.id} style={{ ...st.missionCard, borderLeftColor: rarityColors[m.rarity] || 'var(--color-neutral-300)' }}>
              <div style={st.missionHeader}>
                <div>
                  <span style={st.missionTitle}>{m.title}</span>
                  <span style={st.missionDesc}>{m.description}</span>
                </div>
                <span style={{ ...st.missionRarity, color: rarityColors[m.rarity] || 'var(--color-neutral-500)', backgroundColor: rarityBg[m.rarity] || 'var(--color-neutral-50)' }}>{m.rarity}</span>
              </div>
              <div style={st.missionFooter}>
                <span style={st.missionXp}><Zap size={10} /> {m.xp_reward} XP</span>
                {m.ends_at && <span style={st.missionTime}><Clock size={10} /> Ends {new Date(m.ends_at).toLocaleDateString()}</span>}
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' }}>{m.difficulty}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SquadsPage({ onBack }: { onBack: () => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Squads</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        {/* Current squad */}
        <div style={st.squadCard}>
          <div style={st.squadHeader}>
            <div style={st.squadIcon}><Users size={18} style={{ color: 'var(--color-primary-600)' }} /></div>
            <div style={st.squadInfo}>
              <span style={st.squadName}>Treasure Titans</span>
              <span style={st.squadRank}>Rank #12 - Brooklyn Region</span>
            </div>
            <span style={st.squadScore}>8,590 pts</span>
          </div>

          {/* Members */}
          <div style={st.membersList}>
            {squadMembers.map((m) => (
              <div key={m.name} style={st.memberRow}>
                <div style={st.memberAvatar}><span style={st.memberAvatarText}>{m.avatar}</span></div>
                <div style={st.memberInfo}>
                  <span style={st.memberName}>@{m.name}</span>
                  <span style={st.memberRole}>{m.role}</span>
                </div>
                <span style={st.memberScore}>{m.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Squad actions */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Squad Actions</h3>
          <div style={st.squadActions}>
            <div style={{ ...st.squadActionBtn, opacity: 0.5, cursor: 'default' }} title="Coming soon"><Users size={14} /><span style={st.squadActionText}>Invite</span></div>
            <div style={{ ...st.squadActionBtn, opacity: 0.5, cursor: 'default' }} title="Coming soon"><Target size={14} /><span style={st.squadActionText}>Mission</span></div>
            <div style={{ ...st.squadActionBtn, opacity: 0.5, cursor: 'default' }} title="Coming soon"><Trophy size={14} /><span style={st.squadActionText}>Challenge</span></div>
          </div>
        </div>

        {/* Active competition */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Active Competition</h3>
          <div style={st.compCard}>
            <div style={st.compHeader}>
              <Zap size={14} style={{ color: 'var(--color-error-500)' }} />
              <span style={st.compTitle}>Brooklyn Flip Race</span>
              <span style={st.compTime}><Clock size={10} /> 2d 14h</span>
            </div>
            <div style={st.compTeams}>
              <div style={st.compTeam}>
                <span style={st.compTeamName}>Treasure Titans</span>
                <div style={st.compTeamBar}><div style={{ ...st.compTeamBarFill, width: '72%' }} /></div>
                <span style={st.compTeamScore}>8,590</span>
              </div>
              <div style={st.compTeam}>
                <span style={st.compTeamName}>Rarity Raiders</span>
                <div style={st.compTeamBar}><div style={{ ...st.compTeamBarFill, width: '65%', backgroundColor: 'var(--color-neutral-400)' }} /></div>
                <span style={st.compTeamScore}>7,820</span>
              </div>
              <div style={st.compTeam}>
                <span style={st.compTeamName}>Flip Masters</span>
                <div style={st.compTeamBar}><div style={{ ...st.compTeamBarFill, width: '58%', backgroundColor: 'var(--color-neutral-300)' }} /></div>
                <span style={st.compTeamScore}>6,940</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardsPage({ onBack }: { onBack: () => void }) {
  const leaderboards = [
    { category: 'Top Collectors - Brooklyn', entries: [
      { rank: 1, name: 'luxury_time', score: '42,800 XP', badge: 'Elite' },
      { rank: 2, name: 'thrift_queen', score: '38,200 XP', badge: 'Elite' },
      { rank: 3, name: 'rare_books', score: '35,100 XP', badge: 'Pro' },
      { rank: 4, name: 'storage_king', score: '31,400 XP', badge: 'Pro' },
      { rank: 5, name: 'sneaker_scout', score: '28,900 XP', badge: 'Pro' },
    ]},
    { category: 'Best Scouts This Week', entries: [
      { rank: 1, name: 'vintage_eye', score: '23 pickups', badge: 'Scout' },
      { rank: 2, name: 'dallas_picker', score: '19 pickups', badge: 'Scout' },
      { rank: 3, name: 'chi_scout', score: '15 pickups', badge: 'Scout' },
    ]},
    { category: 'Highest Flip Profits', entries: [
      { rank: 1, name: 'thrift_queen', score: '$18,400', badge: 'Elite' },
      { rank: 2, name: 'storage_king', score: '$12,800', badge: 'Pro' },
      { rank: 3, name: 'luxury_time', score: '$9,200', badge: 'Elite' },
    ]},
  ];

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Leaderboards</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        {leaderboards.map((lb) => (
          <div key={lb.category} style={st.section}>
            <h3 style={st.sectionTitle}>{lb.category}</h3>
            <div style={st.lbList}>
              {lb.entries.map((e) => (
                <div key={`${lb.category}-${e.rank}`} style={st.lbRow}>
                  <span style={{ ...st.lbRank, color: e.rank === 1 ? 'var(--color-primary-500)' : e.rank === 2 ? 'var(--color-neutral-500)' : 'var(--color-accent-600)' }}>#{e.rank}</span>
                  <div style={st.lbAvatar}><span style={st.lbAvatarText}>{e.name[0].toUpperCase()}</span></div>
                  <div style={st.lbInfo}>
                    <span style={st.lbName}>@{e.name}</span>
                    <span style={st.lbBadge}>{e.badge}</span>
                  </div>
                  <span style={st.lbScore}>{e.score}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PassportPage({ onBack }: { onBack: () => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Collector Passport</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        {/* Passport header */}
        <div style={st.passportHeader}>
          <TreasureChestLogo size={48} glow />
          <h2 style={st.passportName}>Marcus Chen</h2>
          <span style={st.passportRank}>Elite Collector - Level 12</span>
          <div style={st.passportStats}>
            <div style={st.passportStat}><span style={st.passportStatVal}>14</span><span style={st.passportStatLbl}>Events</span></div>
            <div style={st.passportStat}><span style={st.passportStatVal}>5</span><span style={st.passportStatLbl}>Cities</span></div>
            <div style={st.passportStat}><span style={st.passportStatVal}>8</span><span style={st.passportStatLbl}>Hunts</span></div>
            <div style={st.passportStat}><span style={st.passportStatVal}>3</span><span style={st.passportStatLbl}>Wins</span></div>
          </div>
        </div>

        {/* City stamps */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>City Stamps</h3>
          <div style={st.stampsGrid}>
            {passportStamps.map((stamp) => {
              const Icon = stamp.icon;
              return (
                <div key={stamp.city + stamp.event} style={st.stampCard}>
                  <Icon size={16} style={{ color: 'var(--color-primary-500)' }} />
                  <span style={st.stampCity}>{stamp.city}</span>
                  <span style={st.stampEvent}>{stamp.event}</span>
                  <span style={st.stampDate}>{stamp.date}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Achievements */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Hunt Achievements</h3>
          <div style={st.achieveList}>
            {[
              { label: 'First Blood', desc: 'Win your first hunt', earned: true },
              { label: 'Team Player', desc: 'Complete 5 squad missions', earned: true },
              { label: 'City Hopper', desc: 'Attend events in 5 cities', earned: true },
              { label: 'Legend', desc: 'Complete a legendary mission', earned: false },
              { label: 'Marathon', desc: 'Attend 50 events total', earned: false },
            ].map((a) => (
              <div key={a.label} style={{ ...st.achieveRow, opacity: a.earned ? 1 : 0.5 }}>
                <div style={{ ...st.achieveIcon, backgroundColor: a.earned ? 'var(--color-primary-50)' : 'var(--color-neutral-50)' }}>
                  {a.earned ? <Award size={14} style={{ color: 'var(--color-primary-500)' }} /> : <Lock size={14} style={{ color: 'var(--color-neutral-400)' }} />}
                </div>
                <div style={st.achieveInfo}>
                  <span style={st.achieveLabel}>{a.label}</span>
                  <span style={st.achieveDesc}>{a.desc}</span>
                </div>
                {a.earned && <span style={st.achieveEarned}>Earned</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BattlePage({ onBack }: { onBack: () => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Live Battles</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        {/* Active battle */}
        <div style={st.battleCard}>
          <div style={st.battleHeader}>
            <Zap size={16} style={{ color: 'var(--color-error-500)' }} />
            <span style={st.battleTitle}>Speed Flip Challenge</span>
            <div style={st.battleLive}><span style={st.battleLiveText}>LIVE</span></div>
          </div>
          <div style={st.battleTimer}>
            <span style={st.battleTimerVal}>01:42:18</span>
            <span style={st.battleTimerLabel}>remaining</span>
          </div>
          <div style={st.battleRanking}>
            {[
              { name: 'thrift_queen', score: 3, emoji: '1st' },
              { name: 'luxury_time', score: 2, emoji: '2nd' },
              { name: 'storage_king', score: 1, emoji: '3rd' },
            ].map((p, i) => (
              <div key={p.name} style={st.battleRankRow}>
                <span style={{ ...st.battleRankNum, color: i === 0 ? 'var(--color-primary-500)' : 'var(--color-neutral-500)' }}>{p.emoji}</span>
                <span style={st.battleRankName}>@{p.name}</span>
                <span style={st.battleRankScore}>{p.score} flips</span>
              </div>
            ))}
          </div>
          <div style={st.battleSpectators}>
            <Eye size={10} style={{ color: 'var(--color-neutral-400)' }} />
            <span style={st.battleSpecText}>23 watching</span>
          </div>
        </div>

        {/* Upcoming battles */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Upcoming Battles</h3>
          {[
            { title: 'Auction Snipe Race', time: 'Tomorrow 2PM', type: 'Speed', participants: 15 },
            { title: 'Mystery Storage Draft', time: 'Sat 10AM', type: 'Strategy', participants: 8 },
            { title: 'Rarity Score Challenge', time: 'Sun 3PM', type: 'Rarity', participants: 32 },
          ].map((b) => (
            <div key={b.title} style={st.upcomingBattle}>
              <div style={st.upcomingBattleInfo}>
                <span style={st.upcomingBattleTitle}>{b.title}</span>
                <span style={st.upcomingBattleMeta}><Clock size={10} /> {b.time} - <Users size={10} /> {b.participants}</span>
              </div>
              <span style={st.upcomingBattleType}>{b.type}</span>
            </div>
          ))}
        </div>

        {/* Trophy case */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Your Trophies</h3>
          <div style={st.trophyGrid}>
            <div style={st.trophyCard}><Trophy size={20} style={{ color: 'var(--color-primary-500)' }} /><span style={st.trophyLabel}>Flip Master</span></div>
            <div style={st.trophyCard}><Award size={20} style={{ color: 'var(--color-secondary-500)' }} /><span style={st.trophyLabel}>Speed Scout</span></div>
            <div style={{ ...st.trophyCard, opacity: 0.4 }}><Lock size={20} style={{ color: 'var(--color-neutral-400)' }} /><span style={st.trophyLabel}>Rarity King</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-neutral-0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  backBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-600)' },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  passportBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  shareBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flex: 1, overflow: 'auto' },

  // Stories
  storyRow: { display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-50)' },
  storyCircle: { width: '48px', height: '48px', borderRadius: 'var(--radius-full)', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
  storyCircleText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)' },
  liveIndicator: { position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-error-500)', border: '2px solid var(--color-neutral-0)' },

  // Quick nav
  quickNav: { display: 'flex', justifyContent: 'space-around', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-neutral-50)' },
  quickNavBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  quickNavLabel: { fontSize: '10px', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-600)' },

  // Mission teaser
  missionTeaser: { margin: 'var(--space-3) var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-100)' },
  missionTeaserLeft: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' },
  missionTeaserTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)' },
  missionTeaserProgress: { fontSize: '10px', color: 'var(--color-primary-600)' },
  missionTeaserBar: { height: '4px', backgroundColor: 'var(--color-primary-200)', borderRadius: 'var(--radius-full)', overflow: 'hidden' },
  missionTeaserBarFill: { height: '100%', backgroundColor: 'var(--color-primary-500)', borderRadius: 'var(--radius-full)' },

  // Section
  section: { padding: 'var(--space-4)' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' },
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)' },
  seeAll: {},
  seeAllText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-600)' },

  // Event card
  eventCard: { borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', overflow: 'hidden', marginBottom: 'var(--space-3)', textAlign: 'left', width: '100%' },
  eventImgWrap: { position: 'relative', height: '120px' },
  eventImg: { width: '100%', height: '100%', objectFit: 'cover' },
  eventTypeBadge: { position: 'absolute', top: 'var(--space-2)', left: 'var(--space-2)', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--color-neutral-0)', fontSize: '10px', fontWeight: 'var(--font-weight-bold)' },
  eventTrendBadge: { position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)', padding: '2px 6px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-500)', color: 'var(--color-neutral-0)', fontSize: '9px', fontWeight: 'var(--font-weight-bold)', display: 'flex', alignItems: 'center', gap: '2px' },
  eventVipBadge: { position: 'absolute', bottom: 'var(--space-2)', right: 'var(--space-2)', padding: '2px 6px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-secondary-500)', color: 'var(--color-neutral-0)', fontSize: '9px', fontWeight: 'var(--font-weight-bold)', display: 'flex', alignItems: 'center', gap: '2px' },
  eventInfo: { padding: 'var(--space-3)' },
  eventTitle: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: '4px' },
  eventMeta: { display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' },
  eventMetaItem: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--color-neutral-500)' },
  eventFooter: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px' },
  eventAttendees: { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: 'var(--color-neutral-500)' },
  eventDifficulty: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-warning-700)', backgroundColor: 'var(--color-warning-50)', padding: '1px 5px', borderRadius: 'var(--radius-full)' },
  eventRarity: { fontSize: '9px', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-primary-700)', backgroundColor: 'var(--color-primary-50)', padding: '1px 5px', borderRadius: 'var(--radius-full)' },
  eventHost: {},
  eventHostText: { fontSize: '10px', color: 'var(--color-neutral-400)' },

  // Detail page
  detailHero: { position: 'relative', height: '180px' },
  detailHeroImg: { width: '100%', height: '100%', objectFit: 'cover' },
  detailHeroOverlay: { position: 'absolute', bottom: 'var(--space-3)', left: 'var(--space-3)' },
  detailHeroType: { padding: '4px 10px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--color-neutral-0)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' },
  detailContent: { padding: 'var(--space-4)' },
  detailTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: 'var(--space-3)' },
  detailMetaGrid: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' },
  detailMetaItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  detailMetaText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)' },

  // Host
  hostCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-50)', marginBottom: 'var(--space-4)' },
  hostAvatar: { width: '36px', height: '36px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  hostAvatarText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)' },
  hostInfo: { flex: 1 },
  hostName: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  hostDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },

  // Checkpoints
  checkpoints: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--color-neutral-200)' },
  checkpoint: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', position: 'relative' },
  checkpointDot: { width: '8px', height: '8px', borderRadius: 'var(--radius-full)', marginLeft: '-19px', flexShrink: 0 },
  checkpointText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-700)' },
  checkpointBadge: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success-700)', backgroundColor: 'var(--color-success-50)', padding: '1px 5px', borderRadius: 'var(--radius-full)' },

  // Rewards
  rewardsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' },
  rewardCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' },
  rewardLabel: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)' },

  // Attendees
  attendeeRow: { display: 'flex', alignItems: 'center', gap: '-4px' },
  attendeeAvatar: { width: '32px', height: '32px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--color-neutral-0)', marginLeft: '-6px' },
  attendeeAvatarText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)' },
  attendeeMore: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginLeft: 'var(--space-2)' },

  // Activity
  activityList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  activityItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  activityDot: { width: '6px', height: '6px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-success-500)', flexShrink: 0 },
  activityText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-600)' },

  // Safety
  safetyBanner: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-secondary-50)', border: '1px solid var(--color-secondary-100)', marginBottom: 'var(--space-4)' },
  safetyText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-secondary-700)' },

  // Join
  joinBtn: { width: '100%', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)' },
  joinBtnText: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-0)' },

  // Missions
  xpBadge: { display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)' },
  xpText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-700)' },
  levelCard: { margin: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-accent-50))', border: '1px solid var(--color-primary-100)' },
  levelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' },
  levelLabel: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  levelNext: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  levelBar: { height: '6px', backgroundColor: 'var(--color-primary-200)', borderRadius: 'var(--radius-full)', overflow: 'hidden' },
  levelBarFill: { height: '100%', background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-600))', borderRadius: 'var(--radius-full)' },
  missionCard: { padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', borderLeftWidth: '3px', borderLeftStyle: 'solid', marginBottom: 'var(--space-3)' },
  missionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' },
  missionTitle: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  missionDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  missionRarity: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', padding: '2px 6px', borderRadius: 'var(--radius-full)', textTransform: 'capitalize' as const },
  missionProgressRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' },
  missionProgressBar: { flex: 1, height: '4px', backgroundColor: 'var(--color-neutral-200)', borderRadius: 'var(--radius-full)', overflow: 'hidden' },
  missionProgressFill: { height: '100%', borderRadius: 'var(--radius-full)' },
  missionProgressText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-500)' },
  missionFooter: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  missionXp: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-600)' },
  missionTime: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--color-neutral-400)' },

  // Squads
  squadCard: { margin: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)' },
  squadHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' },
  squadIcon: { width: '40px', height: '40px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  squadInfo: { flex: 1 },
  squadName: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  squadRank: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  squadScore: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-600)' },
  membersList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  memberRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-neutral-50)' },
  memberAvatar: { width: '32px', height: '32px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  memberAvatarText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)' },
  memberInfo: { flex: 1 },
  memberName: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  memberRole: { fontSize: '10px', color: 'var(--color-neutral-500)' },
  memberScore: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)' },
  squadActions: { display: 'flex', gap: 'var(--space-2)' },
  squadActionBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', color: 'var(--color-neutral-600)' },
  squadActionText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)' },

  // Competition
  compCard: { padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)' },
  compHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' },
  compTitle: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  compTime: { display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--color-neutral-500)' },
  compTeams: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  compTeam: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  compTeamName: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)', width: '100px', flexShrink: 0 },
  compTeamBar: { flex: 1, height: '6px', backgroundColor: 'var(--color-neutral-100)', borderRadius: 'var(--radius-full)', overflow: 'hidden' },
  compTeamBarFill: { height: '100%', backgroundColor: 'var(--color-primary-500)', borderRadius: 'var(--radius-full)' },
  compTeamScore: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)', width: '40px', textAlign: 'right' },

  // Leaderboards
  lbList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  lbRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  lbRank: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', width: '24px' },
  lbAvatar: { width: '28px', height: '28px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  lbAvatarText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)' },
  lbInfo: { flex: 1 },
  lbName: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  lbBadge: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-600)' },
  lbScore: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)' },

  // Passport
  passportHeader: { textAlign: 'center', padding: 'var(--space-5) var(--space-4)', background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-accent-50))', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  passportName: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', margin: 'var(--space-2) 0 2px' },
  passportRank: { fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-600)', marginBottom: 'var(--space-3)' },
  passportStats: { display: 'flex', gap: 'var(--space-4)' },
  passportStat: { textAlign: 'center' },
  passportStatVal: { display: 'block', fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  passportStatLbl: { fontSize: '10px', color: 'var(--color-neutral-500)' },

  // Stamps
  stampsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
  stampCard: { padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-100)', textAlign: 'center' },
  stampCity: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)', margin: '4px 0 2px' },
  stampEvent: { display: 'block', fontSize: '10px', color: 'var(--color-neutral-500)' },
  stampDate: { fontSize: '9px', color: 'var(--color-neutral-400)' },

  // Achievements
  achieveList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  achieveRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  achieveIcon: { width: '32px', height: '32px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  achieveInfo: { flex: 1 },
  achieveLabel: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)' },
  achieveDesc: { fontSize: '10px', color: 'var(--color-neutral-500)' },
  achieveEarned: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success-600)', backgroundColor: 'var(--color-success-50)', padding: '2px 6px', borderRadius: 'var(--radius-full)' },

  // Battle
  battleCard: { margin: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '2px solid var(--color-error-200)', background: 'linear-gradient(135deg, var(--color-error-50), var(--color-neutral-0))' },
  battleHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' },
  battleTitle: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  battleLive: { padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-error-500)' },
  battleLiveText: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-0)' },
  battleTimer: { textAlign: 'center', marginBottom: 'var(--space-4)' },
  battleTimerVal: { display: 'block', fontSize: '24px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', fontFamily: 'monospace' },
  battleTimerLabel: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  battleRanking: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' },
  battleRankRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  battleRankNum: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', width: '24px' },
  battleRankName: { flex: 1, fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)' },
  battleRankScore: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)' },
  battleSpectators: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' },
  battleSpecText: { fontSize: '10px', color: 'var(--color-neutral-400)' },

  // Upcoming battles
  upcomingBattle: { display: 'flex', alignItems: 'center', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', marginBottom: 'var(--space-2)' },
  upcomingBattleInfo: { flex: 1 },
  upcomingBattleTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)' },
  upcomingBattleMeta: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--color-neutral-500)' },
  upcomingBattleType: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-accent-700)', backgroundColor: 'var(--color-accent-50)', padding: '2px 6px', borderRadius: 'var(--radius-full)' },

  // Trophy
  trophyGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' },
  trophyCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' },
  trophyLabel: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-700)' },
};
