import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Loader, ShieldAlert, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchReports,
  updateReportStatus,
  type ContentReport,
  type ReportStatus,
} from '../lib/reports';

const STATUS_TABS: Array<{ key: ReportStatus | 'all'; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'actioned', label: 'Actioned' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
];

/**
 * Admin-only moderation queue. Reads content_reports (RLS gated to admins) and
 * lets a moderator mark each report reviewing / actioned / dismissed. Non-admins
 * see an access-denied panel; the data is also protected server-side by RLS.
 */
export default function AdminModeration({ onBack }: { onBack: () => void }) {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<ReportStatus | 'all'>('pending');
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchReports(tab === 'all' ? undefined : tab);
    setReports(res.reports);
    setError(res.error);
    setTableMissing(res.tableMissing);
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const setStatus = async (id: string, status: ReportStatus) => {
    setBusyId(id);
    const { error: err } = await updateReportStatus(id, status);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    load();
  };

  if (!isAdmin) {
    return (
      <div style={st.container}>
        <Header onBack={onBack} onRefresh={null} />
        <div style={st.center}>
          <ShieldAlert size={40} style={{ color: 'var(--color-neutral-400)' }} />
          <p style={st.deniedTitle}>Admin access required</p>
          <p style={st.deniedBody}>
            The moderation queue is restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <Header onBack={onBack} onRefresh={load} />

      <div style={st.tabs}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ ...st.tab, ...(tab === t.key ? st.tabActive : {}) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={st.scrollContent}>
        {loading ? (
          <div style={st.center}>
            <Loader size={22} style={{ color: 'var(--color-primary-500)', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : tableMissing ? (
          <div style={st.center}>
            <p style={st.deniedTitle}>Moderation table not set up yet</p>
            <p style={st.deniedBody}>
              Apply migration 20260602000010_apple_ugc_compliance.sql in Supabase
              to enable the reports queue.
            </p>
          </div>
        ) : error ? (
          <div style={st.center}>
            <p style={st.deniedBody}>{error}</p>
          </div>
        ) : reports.length === 0 ? (
          <div style={st.center}>
            <p style={st.deniedBody}>No reports in this view.</p>
          </div>
        ) : (
          reports.map((r) => (
            <div key={r.id} style={st.card}>
              <div style={st.cardTop}>
                <span style={st.badge}>{r.content_type}</span>
                <span style={{ ...st.statusBadge, ...statusStyle(r.status) }}>{r.status}</span>
              </div>
              <p style={st.category}>{r.category}</p>
              {r.details && <p style={st.details}>{r.details}</p>}
              <p style={st.meta}>
                Content ID: {r.content_id}
                {r.reported_user_id ? ` · User: ${r.reported_user_id.slice(0, 8)}…` : ''}
              </p>
              <p style={st.meta}>{new Date(r.created_at).toLocaleString()}</p>
              <div style={st.actions}>
                <button
                  disabled={busyId === r.id}
                  onClick={() => setStatus(r.id, 'reviewing')}
                  style={st.actBtn}
                >
                  Reviewing
                </button>
                <button
                  disabled={busyId === r.id}
                  onClick={() => setStatus(r.id, 'actioned')}
                  style={{ ...st.actBtn, ...st.actPrimary }}
                >
                  Actioned
                </button>
                <button
                  disabled={busyId === r.id}
                  onClick={() => setStatus(r.id, 'dismissed')}
                  style={st.actBtn}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

function Header({ onBack, onRefresh }: { onBack: () => void; onRefresh: (() => void) | null }) {
  return (
    <header style={st.header}>
      <button onClick={onBack} style={st.backBtn} aria-label="Back">
        <ArrowLeft size={20} />
      </button>
      <span style={st.headerTitle}>Moderation Queue</span>
      {onRefresh ? (
        <button onClick={onRefresh} style={st.backBtn} aria-label="Refresh">
          <RefreshCw size={18} />
        </button>
      ) : (
        <div style={{ width: 36 }} />
      )}
    </header>
  );
}

function statusStyle(status: ReportStatus): CSSProperties {
  switch (status) {
    case 'actioned':
      return { backgroundColor: 'var(--color-success-100)', color: 'var(--color-success-700)' };
    case 'dismissed':
      return { backgroundColor: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' };
    case 'reviewing':
      return { backgroundColor: 'var(--color-warning-100)', color: 'var(--color-warning-700)' };
    default:
      return { backgroundColor: 'var(--color-error-100)', color: 'var(--color-error-700)' };
  }
}

const st: Record<string, CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-neutral-0)',
    maxWidth: 'var(--max-width)',
    margin: '0 auto',
    width: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-200)',
  },
  backBtn: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-700)',
  },
  headerTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  tabs: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    overflowX: 'auto',
    borderBottom: '1px solid var(--color-neutral-200)',
  },
  tab: {
    flexShrink: 0,
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    color: 'var(--color-neutral-500)',
    backgroundColor: 'var(--color-neutral-100)',
  },
  tabActive: {
    color: 'var(--color-neutral-0)',
    backgroundColor: 'var(--color-primary-600)',
  },
  scrollContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    WebkitOverflowScrolling: 'touch',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-8) var(--space-4)',
    textAlign: 'center',
  },
  deniedTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  deniedBody: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    lineHeight: 'var(--line-height-relaxed)',
  },
  card: {
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    marginBottom: 'var(--space-3)',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-2)',
  },
  badge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: 'var(--color-neutral-500)',
    letterSpacing: '0.04em',
  },
  statusBadge: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    textTransform: 'capitalize',
  },
  category: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-1)',
  },
  details: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: 'var(--line-height-relaxed)',
    marginBottom: 'var(--space-2)',
  },
  meta: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
    wordBreak: 'break-all',
  },
  actions: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-3)',
  },
  actBtn: {
    flex: 1,
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
    color: 'var(--color-neutral-700)',
  },
  actPrimary: {
    backgroundColor: 'var(--color-primary-600)',
    borderColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
  },
};
