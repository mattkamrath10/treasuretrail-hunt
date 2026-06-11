import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Calendar, MapPin, Eye, Pencil, Trash2,
  Store, Save, X, Loader2, Radio, ExternalLink, BarChart3, TrendingUp, Repeat, Copy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMyEvents, deleteEvent, PLATFORM_META,
  type EventRow, type EventStatus,
} from '../lib/events';
import { describeRecurrence } from '../lib/recurrence';
import { isProUser } from '../lib/entitlements';
import { monetizationHidden } from '../lib/platform';
import { SkeletonList } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { AccountRequired } from '../components/AccountRequired';
import { Badge } from '../components/ui/Badge';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { AvatarFallback } from '../components/ui/MediaFallback';
import { toThumbUrl } from '../lib/imageCompress';

/**
 * Holder dashboard. Gated to account_type='holder' — seekers are redirected
 * to /events with the Become-a-Host CTA visible there. Lists the holder's
 * own events (any status), surfaces quick stats, and exposes edit/delete
 * plus a "New event" entry that points at /seller/new (Step 5 form).
 */
export default function SellerDashboard({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  const isHolder = profile?.account_type === 'holder';
  const isPro = isProUser(profile);

  useEffect(() => {
    if (!user || !isHolder) return;
    let cancelled = false;
    setLoadError(null);
    fetchMyEvents(user.id)
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch((e: any) => { if (!cancelled) { setEvents([]); setLoadError(e?.message ?? 'Failed to load events'); } });
    return () => { cancelled = true; };
  }, [user, isHolder]);

  const stats = useMemo(() => {
    const all = events ?? [];
    return {
      total:     all.length,
      published: all.filter((e) => e.status === 'published').length,
      drafts:    all.filter((e) => e.status === 'draft').length,
    };
  }, [events]);

  const onDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await deleteEvent(id);
      setEvents((prev) => (prev ?? []).filter((e) => e.id !== id));
    } catch (e: any) {
      alert(`Couldn't delete: ${e?.message ?? 'unknown error'}`);
    } finally {
      setBusyId(null);
    }
  };

  // Gate: a guest (no signed-in user) gets the Account Required screen
  // instead of an infinite spinner — a guest never receives a profile.
  if (!user) {
    return <AccountRequired message="Create a free account to manage your host dashboard and publish events." />;
  }
  // Signed in but profile still loading: short spinner.
  if (!profile) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} />
        <div style={s.loadingWrap}><Loader2 size={22} className="spin" /></div>
      </div>
    );
  }
  if (!isHolder) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} />
        <EmptyState
          icon={Store}
          title="Holder account required"
          body="Switch to a host account to publish and manage events."
          action={
            <button onClick={() => navigate('/events')} style={s.primaryBtn}>
              Go to events
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div style={s.container}>
      <Header onBack={onBack} />

      {/* Business profile summary card */}
      <section style={s.businessCard}>
        <div style={s.businessRow}>
          <div style={s.logoWrap}>
            <ImageWithFade
              src={toThumbUrl(profile.business_logo_url)}
              fallbackSrc={profile.business_logo_url}
              alt={profile.business_name ?? 'logo'}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={
                <AvatarFallback
                  name={profile.business_name || profile.username || 'Shop'}
                  seed={profile.id || profile.username || 'shop'}
                  style={{ borderRadius: 0 }}
                />
              }
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={s.bizName}>
              {profile.business_name || profile.username || 'Your business'}
            </h2>
            <p style={s.bizBio}>
              {profile.business_bio || 'Add a short bio so buyers know who you are.'}
            </p>
          </div>
          <button onClick={() => setEditingProfile(true)} style={s.iconBtnSm} aria-label="Edit business profile">
            <Pencil size={16} />
          </button>
        </div>
      </section>

      {/* Stats */}
      <section style={s.statRow}>
        <StatTile label="Total"     value={stats.total} />
        <StatTile label="Published" value={stats.published} />
        <StatTile label="Drafts"    value={stats.drafts} />
      </section>

      {/* My events */}
      <section style={s.section}>
        <div style={s.sectionHeader}>
          <h3 style={s.sectionTitle}>My events</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Pro-only insights are hidden while monetization is gated for review. */}
            {isPro && !monetizationHidden() && (
              <>
                <button onClick={() => navigate('/seller/demand')} style={s.ghostBtn}>
                  <TrendingUp size={13} /> Demand
                </button>
                <button onClick={() => navigate('/seller/analytics')} style={s.ghostBtn}>
                  <BarChart3 size={13} /> Analytics
                </button>
              </>
            )}
            <button onClick={() => navigate('/seller/new')} style={s.primaryBtn}>
              <Plus size={14} /> New event
            </button>
          </div>
        </div>

        {loadError && <div style={s.errorBanner}>{loadError}</div>}

        {events === null ? (
          <SkeletonList count={2} />
        ) : events.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No events yet"
            body="Create your first event — estate sale, yard sale, flea market or auction."
            action={
              <button onClick={() => navigate('/seller/new')} style={s.primaryBtn}>
                <Plus size={14} /> Create event
              </button>
            }
          />
        ) : (
          <div style={s.list}>
            {events.map((e) => (
              <EventRowCard
                key={e.id}
                event={e}
                busy={busyId === e.id}
                onEdit={() => navigate(`/seller/event/${e.id}`)}
                onView={() => navigate(`/event/${e.id}`)}
                onDelete={() => onDelete(e.id, e.title)}
                onDuplicate={() => navigate(`/seller/new?duplicate=${e.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {editingProfile && (
        <BusinessProfileEditor onClose={() => setEditingProfile(false)} />
      )}
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
        <h1 style={s.headerTitle}>Host Dashboard</h1>
        <p style={s.headerSubtitle}>Manage your events and reach local buyers</p>
      </div>
    </header>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div style={s.statTile}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

const STATUS_BADGE: Record<EventStatus, { label: string; variant: 'shipping' | 'warning' | 'neutral' }> = {
  published: { label: 'Published', variant: 'shipping' },
  draft:     { label: 'Draft',     variant: 'warning'  },
  cancelled: { label: 'Cancelled', variant: 'neutral'  },
};

function EventRowCard({
  event, busy, onEdit, onView, onDelete, onDuplicate,
}: {
  event: EventRow;
  busy: boolean;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const badge = STATUS_BADGE[event.status];
  const isOnline = event.event_kind === 'online';
  const platformMeta = isOnline && event.platform ? PLATFORM_META[event.platform] : null;
  const recurrenceLabel = describeRecurrence(event);
  const location = isOnline
    ? (event.seller_handle ?? platformMeta?.label ?? 'Online live show')
    : ([event.city, event.region].filter(Boolean).join(', ') || event.address || '');
  return (
    <article style={s.eventRow}>
      <button onClick={onView} style={s.thumbBtn} aria-label="View event">
        {event.cover_thumb_url || event.cover_image_url ? (
          <ImageWithFade
            src={toThumbUrl(event.cover_thumb_url || event.cover_image_url)}
            fallbackSrc={event.cover_image_url}
            alt={event.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Calendar size={22} style={{ color: 'var(--color-neutral-300)' }} />
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.eventTopRow}>
          <h4 style={s.eventTitle} onClick={onView}>{event.title}</h4>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        {platformMeta && (
          <div style={{ marginTop: 2, marginBottom: 4 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 999,
              background: platformMeta.color, color: '#fff',
              fontSize: 10, fontWeight: 700,
            }}>
              <Radio size={10} /> {platformMeta.label}
            </span>
          </div>
        )}
        <div style={s.eventMeta}>
          <Calendar size={12} />
          <span>{formatDate(event.starts_at)}</span>
        </div>
        {recurrenceLabel && (
          <div style={{ ...s.eventMeta, color: 'var(--color-primary-700, #1d4ed8)', fontWeight: 700 }}>
            <Repeat size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recurrenceLabel}</span>
          </div>
        )}
        {location && (
          <div style={s.eventMeta}>
            {isOnline
              ? <ExternalLink size={12} />
              : <MapPin       size={12} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{location}</span>
          </div>
        )}
        <div style={s.eventActions}>
          <button onClick={onView}   style={s.ghostBtn}><Eye size={13} /> View</button>
          <button onClick={onEdit}   style={s.ghostBtn}><Pencil size={13} /> Edit</button>
          <button onClick={onDuplicate} style={s.ghostBtn}><Copy size={13} /> Duplicate</button>
          <button onClick={onDelete} disabled={busy} style={{ ...s.ghostBtn, color: 'var(--color-error-700, #b91c1c)' }}>
            <Trash2 size={13} /> {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </article>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
}

/* ---------------- Business profile editor ---------------- */

function BusinessProfileEditor({ onClose }: { onClose: () => void }) {
  const { profile, updateProfile } = useAuth();
  const [name, setName] = useState(profile?.business_name ?? '');
  const [bio,  setBio]  = useState(profile?.business_bio ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    setSaving(true);
    const { error } = await updateProfile({
      business_name: name.trim() || null,
      business_bio:  bio.trim()  || null,
    });
    setSaving(false);
    if (error) { setErr(error); return; }
    onClose();
  };

  return (
    <div style={s.modalBackdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 700 }}>Business profile</h3>
          <button onClick={onClose} style={s.iconBtnSm} aria-label="Close"><X size={16} /></button>
        </div>
        <label style={s.label}>Business name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rosie's Estate Sales"
          style={s.input}
        />
        <label style={s.label}>Short bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="What kinds of events do you run? Where do you usually operate?"
          style={{ ...s.input, minHeight: 90, resize: 'vertical' }}
        />
        {err && <p style={s.errorText}>{err}</p>}
        <div style={s.modalActions}>
          <button onClick={onClose} style={s.ghostBtnLg}>Cancel</button>
          <button onClick={save} disabled={saving} style={s.primaryBtnLg}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
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
  iconBtnSm: {
    width: 28, height: 28, borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: '1px solid var(--color-neutral-200)',
    cursor: 'pointer', color: 'var(--color-neutral-700)',
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
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flex: 1,
  },

  businessCard: {
    margin: 'var(--space-3) var(--space-4) 0',
    padding: 'var(--space-3)',
    background: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
  },
  businessRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' },
  logoWrap: {
    width: 48, height: 48, borderRadius: 12, overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bizName: {
    margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  bizBio: {
    margin: '2px 0 0', fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)', lineHeight: 1.35,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },

  statRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4) 0',
  },
  statTile: {
    background: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)',
    textAlign: 'center',
  },
  statValue: {
    fontSize: 'var(--font-size-xl)', fontWeight: 800,
    color: 'var(--color-neutral-900)',
  },
  statLabel: {
    fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)',
    marginTop: 2,
  },

  section: { padding: 'var(--space-4)' },
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  sectionTitle: {
    margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 700,
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

  list: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  eventRow: {
    display: 'flex', gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    background: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
  },
  thumbBtn: {
    width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-100)',
    border: 'none', cursor: 'pointer', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  eventTopRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 4,
  },
  eventTitle: {
    margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 700,
    color: 'var(--color-neutral-900)', cursor: 'pointer',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
  },
  eventMeta: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
    marginTop: 2,
  },
  eventActions: {
    display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap',
  },
  ghostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 8px', borderRadius: 6,
    border: '1px solid var(--color-neutral-200)',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 11, fontWeight: 600, cursor: 'pointer',
  },
  ghostBtnLg: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
  },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600, #d97706)',
    color: '#fff',
    fontSize: 'var(--font-size-xs)', fontWeight: 700,
  },
  primaryBtnLg: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600, #d97706)',
    color: '#fff',
    fontSize: 'var(--font-size-sm)', fontWeight: 700,
  },

  modalBackdrop: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 50, padding: 'var(--space-4)',
  },
  modal: {
    width: '100%', maxWidth: 420,
    background: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 'var(--font-size-xs)', fontWeight: 600,
    color: 'var(--color-neutral-700)', marginTop: 6,
  },
  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    fontFamily: 'inherit',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'var(--color-neutral-0)',
    outline: 'none', boxSizing: 'border-box',
  },
  errorText: {
    margin: '6px 0 0',
    padding: '6px 8px',
    borderRadius: 6,
    backgroundColor: 'var(--color-error-50, #fef2f2)',
    color: 'var(--color-error-700, #b91c1c)',
    fontSize: 'var(--font-size-xs)',
  },
  modalActions: {
    display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'var(--space-3)',
  },
};
