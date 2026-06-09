import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, MapPin, Loader2, Crown, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isProUser } from '../lib/entitlements';
import {
  fetchDemandByItem, fetchLocalDemand,
  type ItemDemand, type LocalDemand,
} from '../lib/demand';
import { WANTED_CATEGORY_LABEL, type WantedCategory } from '../lib/wanted';
import { EmptyState } from '../components/ui/EmptyState';
import { AccountRequired } from '../components/AccountRequired';
import { UpgradeProCard } from '../components/ui/UpgradeProCard';

// Reuse the searcher's stored origin (set on the Search screen) as the seller's
// vantage point for "near you" demand. No new location prompt is introduced.
const ORIGIN_KEY = 'tt_search_origin';
const DEMAND_RADIUS_MILES = 25;

function readOrigin(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(ORIGIN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Number.isFinite(p?.lat) && Number.isFinite(p?.lng) ? { lat: p.lat, lng: p.lng } : null;
  } catch {
    return null;
  }
}

function categoryLabel(category: string): string | null {
  if (!category) return null;
  return WANTED_CATEGORY_LABEL[category as WantedCategory] ?? null;
}

/**
 * Demand Insights — a Pro-gated surface that turns the stream of no-result
 * searches and Wanted Requests into "what buyers want" signal. Aggregate-only:
 * the underlying RPCs never expose individual users, and Pro is enforced at the
 * data layer (PRO_REQUIRED), so this React gate is just UX.
 */
export default function SellerDemand({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const isPro = isProUser(profile);

  const [origin] = useState(readOrigin);
  const [local, setLocal] = useState<LocalDemand[] | null>(null);
  const [items, setItems] = useState<ItemDemand[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isPro) return;
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const itemRows = await fetchDemandByItem(20);
        if (!cancelled) setItems(itemRows);
        if (origin) {
          const localRows = await fetchLocalDemand(origin.lat, origin.lng, DEMAND_RADIUS_MILES, 20);
          if (!cancelled) setLocal(localRows);
        } else if (!cancelled) {
          setLocal([]);
        }
      } catch (e: any) {
        if (!cancelled) {
          setItems((prev) => prev ?? []);
          setLocal((prev) => prev ?? []);
          setLoadError(e?.message ?? 'Failed to load demand insights');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user, isPro, origin]);

  if (!user) {
    return <AccountRequired message="Create a free account to see what buyers are looking for." />;
  }
  if (!profile) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} />
        <div style={s.loadingWrap}><Loader2 size={22} className="spin" /></div>
      </div>
    );
  }

  if (!isPro) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} />
        <div style={s.upsellWrap}>
          <div style={s.upsellIcon}><Crown size={26} style={{ color: 'var(--color-primary-600, #d97706)' }} /></div>
          <h2 style={s.upsellTitle}>Demand Insights is a Pro feature</h2>
          <p style={s.upsellBody}>
            See what buyers near you are searching for and can't find — the most
            requested items and categories, plus local demand within {DEMAND_RADIUS_MILES} miles.
            Source your inventory to what people actually want.
          </p>
          <UpgradeProCard onUpgrade={() => navigate('/pro')} style={{ marginTop: 8 }} />
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <Header onBack={onBack} />

      {loadError && <div style={s.errorBanner}>{loadError}</div>}

      {/* Local demand */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>
          <MapPin size={15} style={{ color: 'var(--color-primary-600, #d97706)' }} />
          Wanted near you {origin ? `(within ${DEMAND_RADIUS_MILES} mi)` : ''}
        </h3>
        {!origin ? (
          <EmptyState
            icon={MapPin}
            title="Set your location to see local demand"
            body="Search with a ZIP or City, State on the Search screen — we'll use it to show what buyers near you want."
          />
        ) : local === null ? (
          <div style={s.loadingRow}><Loader2 size={18} className="spin" /></div>
        ) : local.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No local demand yet"
            body="As buyers near you search and post Wanted Requests, the most-wanted items will show up here."
          />
        ) : (
          <div style={s.list}>
            {local.map((d) => (
              <DemandRow
                key={`${d.term}|${d.category}`}
                term={d.term}
                category={d.category}
                count={d.total}
                hint={typeof d.nearestMiles === 'number'
                  ? `nearest ~${Math.max(1, Math.round(d.nearestMiles))} mi`
                  : null}
              />
            ))}
          </div>
        )}
      </section>

      {/* Top demand by item */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>
          <TrendingUp size={15} style={{ color: 'var(--color-primary-600, #d97706)' }} />
          Most wanted overall
        </h3>
        {items === null ? (
          <div style={s.loadingRow}><Loader2 size={18} className="spin" /></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No demand data yet"
            body="When buyers search for items we don't have, or post Wanted Requests, the trends will appear here."
          />
        ) : (
          <div style={s.list}>
            {items.map((d) => (
              <DemandRow
                key={`${d.term}|${d.category}`}
                term={d.term}
                category={d.category}
                count={d.total}
                hint={null}
              />
            ))}
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
        <h1 style={s.headerTitle}>Demand Insights</h1>
        <p style={s.headerSubtitle}>What buyers are looking for</p>
      </div>
    </header>
  );
}

function DemandRow({
  term, category, count, hint,
}: { term: string; category: string; count: number; hint: string | null }) {
  const label = categoryLabel(category);
  const people = `${count.toLocaleString()} ${count === 1 ? 'request' : 'requests'}`;
  return (
    <article style={s.row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.rowTerm}>{term}</div>
        <div style={s.rowMeta}>
          {label && <span style={s.tag}>{label}</span>}
          {hint && <span style={s.rowHint}>{hint}</span>}
        </div>
      </div>
      <div style={s.rowCount}>{people}</div>
    </article>
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
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-4))',
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
  loadingRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-4)',
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

  errorBanner: {
    margin: 'var(--space-4) var(--space-4) 0',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-error-50, #fef2f2)',
    border: '1px solid var(--color-error-200, #fecaca)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-error-700, #b91c1c)',
    fontSize: 'var(--font-size-sm)',
  },

  section: { padding: 'var(--space-4)' },
  sectionTitle: {
    margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-base)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
    display: 'flex', alignItems: 'center', gap: 6,
  },

  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    background: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
  },
  rowTerm: {
    fontSize: 'var(--font-size-sm)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    textTransform: 'capitalize',
  },
  rowMeta: {
    display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap',
  },
  tag: {
    fontSize: 10, fontWeight: 700,
    color: 'var(--color-primary-700, var(--color-primary-600))',
    background: 'var(--color-primary-50, #eef2ff)',
    padding: '2px 7px', borderRadius: 999,
  },
  rowHint: {
    fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)',
  },
  rowCount: {
    flexShrink: 0,
    fontSize: 'var(--font-size-sm)', fontWeight: 800,
    color: 'var(--color-primary-600, #d97706)',
  },
};
