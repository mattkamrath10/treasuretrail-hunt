import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Eye, Heart, MousePointerClick, Loader2, Crown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchMyEvents, type EventRow } from '../lib/events';
import { fetchSellerReach, type SellerReach } from '../lib/eventAnalytics';
import { isProUser } from '../lib/entitlements';
import { SkeletonList } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { UpgradeProCard } from '../components/ui/UpgradeProCard';

/**
 * Reach Analytics — a Pro-gated dashboard that aggregates the engagement
 * data the app already collects (views, saves, CTA taps) across all of a
 * seller's events. Non-Pro users see an upgrade prompt instead of data, so
 * this is a genuine Pro entitlement, not just decoration. No new tracking
 * is introduced here; it reads the same owner-readable count views the
 * single-event card uses (RLS scopes results to the holder's own events).
 */
export default function SellerAnalytics({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const isPro = isProUser(profile);

  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [reach, setReach] = useState<SellerReach | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isPro) return;
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const rows = await fetchMyEvents(user.id);
        if (cancelled) return;
        setEvents(rows);
        const r = await fetchSellerReach(rows.map((e) => e.id));
        if (!cancelled) setReach(r);
      } catch (e: any) {
        // Keep any events we already fetched visible — a reach failure should
        // surface as an error banner, not masquerade as "No events yet".
        if (!cancelled) {
          setEvents((prev) => prev ?? []);
          setLoadError(e?.message ?? 'Failed to load analytics');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user, isPro]);

  const rankedEvents = useMemo(() => {
    if (!events || !reach) return [];
    return [...events].sort((a, b) => {
      const ra = reach.perEvent[a.id];
      const rb = reach.perEvent[b.id];
      return (rb?.views ?? 0) - (ra?.views ?? 0);
    });
  }, [events, reach]);

  if (!profile) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} />
        <div style={s.loadingWrap}><Loader2 size={22} className="spin" /></div>
      </div>
    );
  }

  // Non-Pro: this is the upsell surface. We show what they'd unlock and a
  // single CTA to the Pro page — no data, because analytics is Pro-only.
  if (!isPro) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} />
        <div style={s.upsellWrap}>
          <div style={s.upsellIcon}><Crown size={26} style={{ color: 'var(--color-primary-600, #d97706)' }} /></div>
          <h2 style={s.upsellTitle}>Reach Analytics is a Pro feature</h2>
          <p style={s.upsellBody}>
            See exactly how your events perform — total views, saves, and buyer
            taps across everything you host, plus a per-event breakdown so you
            know what's working.
          </p>
          <UpgradeProCard onUpgrade={() => navigate('/pro')} style={{ marginTop: 8 }} />
        </div>
      </div>
    );
  }

  const totals = reach?.totals ?? { views: 0, saves: 0, taps: 0 };

  return (
    <div style={s.container}>
      <Header onBack={onBack} />

      {/* Summary cards */}
      <section style={s.statRow}>
        <StatTile icon={Eye} label="Views" value={totals.views} loading={reach === null} />
        <StatTile icon={Heart} label="Saves" value={totals.saves} loading={reach === null} />
        <StatTile icon={MousePointerClick} label="Taps" value={totals.taps} loading={reach === null} />
      </section>

      {/* Per-event breakdown */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>By event</h3>

        {loadError && <div style={s.errorBanner}>{loadError}</div>}

        {events === null ? (
          <SkeletonList count={3} />
        ) : events.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No events yet"
            body="Create an event and your reach data will show up here."
          />
        ) : (
          <div style={s.list}>
            {rankedEvents.map((e) => {
              const r = reach?.perEvent[e.id];
              return (
                <article key={e.id} style={s.eventRow}>
                  <h4 style={s.eventTitle} onClick={() => navigate(`/event/${e.id}`)}>{e.title}</h4>
                  <div style={s.metricRow}>
                    <Metric icon={Eye} value={r?.views ?? 0} />
                    <Metric icon={Heart} value={r?.saves ?? 0} />
                    <Metric icon={MousePointerClick} value={r?.taps ?? 0} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header style={s.header}>
      <button onClick={onBack} style={s.iconBtn} aria-label="Back">
        <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={s.headerTitle}>Reach Analytics</h1>
        <p style={s.headerSubtitle}>How buyers are engaging with your events</p>
      </div>
    </header>
  );
}

function StatTile({ icon: Icon, label, value, loading }: {
  icon: typeof Eye; label: string; value: number; loading: boolean;
}) {
  return (
    <div style={s.statTile}>
      <Icon size={16} style={{ color: 'var(--color-primary-600, #d97706)' }} />
      <div style={s.statValue}>{loading ? '—' : value.toLocaleString()}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

function Metric({ icon: Icon, value }: { icon: typeof Eye; value: number }) {
  return (
    <span style={s.metric}>
      <Icon size={13} style={{ color: 'var(--color-neutral-500)' }} />
      {value.toLocaleString()}
    </span>
  );
}

/* ---------------- Styles ---------------- */

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    height: '100%', overflowY: 'auto',
    backgroundColor: 'var(--color-neutral-50)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer',
  },
  headerTitle: {
    margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  headerSubtitle: {
    margin: 0, fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  loadingWrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1,
  },

  upsellWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-6) var(--space-4)',
  },
  upsellIcon: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'rgba(251, 191, 36, 0.16)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  upsellTitle: {
    margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 800,
    color: 'var(--color-neutral-900)',
  },
  upsellBody: {
    margin: 0, fontSize: 'var(--font-size-sm)', lineHeight: 1.5,
    color: 'var(--color-neutral-600)', maxWidth: 360,
  },

  statRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)',
    padding: 'var(--space-4) var(--space-4) 0',
  },
  statTile: {
    background: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  statValue: {
    fontSize: 'var(--font-size-xl)', fontWeight: 800,
    color: 'var(--color-neutral-900)',
  },
  statLabel: {
    fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)',
  },

  section: { padding: 'var(--space-4)' },
  sectionTitle: {
    margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-base)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  errorBanner: {
    margin: '0 0 var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-error-50, #fef2f2)',
    border: '1px solid var(--color-error-200, #fecaca)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-error-700, #b91c1c)',
    fontSize: 'var(--font-size-sm)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  eventRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    background: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
  },
  eventTitle: {
    margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 700,
    color: 'var(--color-neutral-900)', cursor: 'pointer',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    flex: 1, minWidth: 0,
  },
  metricRow: { display: 'flex', gap: 'var(--space-3)', flexShrink: 0 },
  metric: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 'var(--font-size-xs)', fontWeight: 600,
    color: 'var(--color-neutral-700)',
  },
};
