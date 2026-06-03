import { type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Radio, Sparkles, Search, ChevronRight } from 'lucide-react';
import { PageScroll } from '../components/ui/PageScroll';
import { monetizationHidden } from '../lib/platform';

type Tile = {
  id: string;
  icon: typeof Calendar;
  title: string;
  desc: string;
  accent: string;
  to: string;
};

const TILES: Tile[] = [
  {
    id: 'local',
    icon: Calendar,
    title: 'Local event',
    desc: 'Yard sale, estate sale, flea market, auction.',
    accent: '#f59e0b',
    to: '/seller/new',
  },
  {
    id: 'live',
    icon: Radio,
    title: 'Livestream show',
    desc: 'Cross-promote Whatnot, Poshmark Live, or eBay Live.',
    accent: '#ef4444',
    to: '/seller/new',
  },
  {
    id: 'find',
    icon: Sparkles,
    title: 'Flash find',
    desc: 'Share a treasure or product photo with the community.',
    accent: '#8b5cf6',
    to: '/flash-finds',
  },
  {
    id: 'wanted',
    icon: Search,
    title: 'Wanted post',
    desc: 'Tell sellers exactly what you\'re looking for.',
    accent: '#10b981',
    to: '/sell/wanted',
  },
];

export default function Sell({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  return (
    <PageScroll style={s.page}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 style={s.headerTitle}>Create</h1>
        <span style={{ width: 36 }} />
      </header>

      <section style={s.hero}>
        <h2 style={s.heroTitle}>What do you want to post?</h2>
        <p style={s.heroSub}>One flow for events, livestreams, finds and wanted items.</p>
      </section>

      <div style={s.tiles}>
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => { console.log('[SELL] pick', t.id); navigate(t.to); }}
              style={s.tile}
            >
              <span style={{ ...s.tileIcon, background: t.accent + '22', color: t.accent, boxShadow: `inset 0 0 0 1px ${t.accent}55` }}>
                <Icon size={22} strokeWidth={2.2} />
              </span>
              <span style={s.tileText}>
                <span style={s.tileTitle}>{t.title}</span>
                <span style={s.tileDesc}>{t.desc}</span>
              </span>
              <ChevronRight size={18} style={{ color: 'rgba(245,245,247,0.45)', flexShrink: 0 }} />
            </button>
          );
        })}
      </div>

      {monetizationHidden() ? (
        <p style={s.footnote}>All posts are free.</p>
      ) : (
        <p style={s.footnote}>All posts are free. Boost any event or livestream from <a onClick={() => navigate('/pro')} style={s.link}>Membership</a>.</p>
      )}
    </PageScroll>
  );
}

const s: Record<string, CSSProperties> = {
  page: { background: '#0b0b10', color: '#f5f5f7', paddingBottom: 24 },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
    background: 'rgba(11,11,16,0.92)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff', cursor: 'pointer',
  },
  headerTitle: { margin: 0, fontSize: 16, fontWeight: 800 },
  hero: { padding: '24px 20px 8px', textAlign: 'center' },
  heroTitle: { margin: 0, fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' },
  heroSub: { margin: '6px auto 0', maxWidth: 380, fontSize: 13, color: 'rgba(245,245,247,0.6)' },
  tiles: {
    display: 'grid', gridTemplateColumns: '1fr', gap: 10,
    padding: '16px',
    maxWidth: 640, margin: '0 auto',
  },
  tile: {
    display: 'flex', alignItems: 'center', gap: 14,
    minHeight: 76, padding: '14px 16px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    color: '#fff', textAlign: 'left', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  tileIcon: {
    flexShrink: 0, width: 44, height: 44, borderRadius: 12,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  tileText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  tileTitle: { fontSize: 15, fontWeight: 800, color: '#fff' },
  tileDesc: { fontSize: 12, color: 'rgba(245,245,247,0.6)', lineHeight: 1.35 },
  footnote: {
    margin: '8px auto 0', maxWidth: 480, padding: '0 20px',
    textAlign: 'center', fontSize: 11, color: 'rgba(245,245,247,0.45)',
  },
  link: { color: '#fbbf24', textDecoration: 'underline', cursor: 'pointer' },
};
