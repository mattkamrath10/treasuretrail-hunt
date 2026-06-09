import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Loader } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageScroll } from '../components/ui/PageScroll';
import { GuestOverlay } from '../components/GuestGate';
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  isChannelEnabled,
  setPref,
  fetchNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
  type NotificationCategory,
} from '../lib/notificationPrefs';

export default function NotificationSettings() {
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    fetchNotificationPrefs(user.id)
      .then((p) => { if (!cancelled) { setPrefs(p); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user]);

  const flash = (m: string) => {
    setNote(m);
    window.setTimeout(() => setNote((t) => (t === m ? null : t)), 2400);
  };

  const toggleInApp = async (category: NotificationCategory) => {
    if (!user || saving) return;
    const next = setPref(prefs, category, 'in_app', !isChannelEnabled(prefs, category, 'in_app'));
    setPrefs(next); // optimistic
    setSaving(true);
    const { error } = await saveNotificationPrefs(user.id, next);
    setSaving(false);
    if (error) {
      setPrefs(prefs); // revert
      flash(error);
    }
  };

  if (isGuest || !user) {
    return (
      <div style={s.guestWrap}>
        <GuestOverlay
          title="Notification Settings"
          subtitle="Create a free account to choose which alerts you receive."
        />
      </div>
    );
  }

  return (
    <PageScroll style={s.page}>
      <header style={s.header}>
        <button onClick={() => navigate(-1)} style={s.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 style={s.headerTitle}>Notifications</h1>
      </header>

      <div style={s.body}>
        <div style={s.intro}>
          <div style={s.introIcon}><Bell size={18} style={{ color: 'var(--color-primary-600)' }} /></div>
          <p style={s.introText}>
            Choose what shows up in your in-app Alerts. Email, SMS, and push are
            coming soon.
          </p>
        </div>

        {loading ? (
          <div style={s.loading}><Loader size={18} className="spin" /> Loading…</div>
        ) : (
          <>
            <div style={s.colHead}>
              <span style={s.colHeadCategory}>Category</span>
              <span style={s.colHeadChannel}>In-App</span>
              <span style={s.colHeadChannelMuted}>Email<br /><span style={s.soon}>Coming soon</span></span>
            </div>

            <div style={s.list}>
              {CATEGORY_ORDER.map((cat) => {
                const meta = CATEGORY_LABELS[cat];
                const on = isChannelEnabled(prefs, cat, 'in_app');
                return (
                  <div key={cat} style={s.row}>
                    <div style={s.rowMain}>
                      <span style={s.rowLabel}>{meta.label}</span>
                      <span style={s.rowDesc}>{meta.description}</span>
                    </div>
                    <div style={s.rowToggle}>
                      <Toggle on={on} disabled={saving} onClick={() => toggleInApp(cat)} ariaLabel={`${meta.label} in-app`} />
                    </div>
                    <div style={s.rowToggle}>
                      <Toggle on={false} disabled comingSoon ariaLabel={`${meta.label} email (coming soon)`} />
                    </div>
                  </div>
                );
              })}
            </div>

            <p style={s.footNote}>
              SMS and push notifications are also on the way. Your choices here
              already carry over to those channels when they launch.
            </p>
          </>
        )}
      </div>

      {note && <div style={s.toast}>{note}</div>}
    </PageScroll>
  );
}

function Toggle({
  on, disabled, comingSoon, onClick, ariaLabel,
}: {
  on: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...s.toggle,
        backgroundColor: on
          ? 'var(--color-primary-500)'
          : comingSoon
            ? 'var(--color-neutral-150, #e5e5e5)'
            : 'var(--color-neutral-200)',
        opacity: disabled && !comingSoon ? 0.6 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ ...s.knob, transform: on ? 'translateX(18px)' : 'translateX(0)' }} />
    </button>
  );
}

const s: Record<string, CSSProperties> = {
  page: { background: 'var(--color-neutral-50)', minHeight: '100%' },
  guestWrap: { height: '100%', display: 'flex', flexDirection: 'column' },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
    background: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  backBtn: {
    flexShrink: 0, width: 36, height: 36, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-700)', cursor: 'pointer',
  },
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--color-neutral-900)' },
  body: { padding: 'var(--space-4)', paddingBottom: 48 },
  intro: {
    display: 'flex', gap: 12, alignItems: 'flex-start',
    padding: 14, borderRadius: 14,
    background: 'var(--color-primary-50)',
    border: '1px solid var(--color-primary-100)',
    marginBottom: 'var(--space-4)',
  },
  introIcon: { flexShrink: 0 },
  introText: { margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--color-neutral-700)' },
  loading: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: 24, color: 'var(--color-neutral-500)', fontSize: 14,
  },
  colHead: {
    display: 'grid', gridTemplateColumns: '1fr 64px 64px',
    alignItems: 'end', gap: 8,
    padding: '0 4px 8px',
  },
  colHeadCategory: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: 'var(--color-neutral-500)',
  },
  colHeadChannel: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: 'var(--color-neutral-700)', textAlign: 'center',
  },
  colHeadChannelMuted: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: 'var(--color-neutral-400)', textAlign: 'center',
    lineHeight: 1.3,
  },
  soon: { fontSize: 9, fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
  list: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--color-neutral-0)',
    borderRadius: 14, border: '1px solid var(--color-neutral-100)',
    overflow: 'hidden',
  },
  row: {
    display: 'grid', gridTemplateColumns: '1fr 64px 64px',
    alignItems: 'center', gap: 8,
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  rowMain: { minWidth: 0 },
  rowLabel: { display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--color-neutral-900)' },
  rowDesc: { display: 'block', fontSize: 12, color: 'var(--color-neutral-500)', marginTop: 2, lineHeight: 1.4 },
  rowToggle: { display: 'flex', justifyContent: 'center' },
  toggle: {
    position: 'relative', width: 40, height: 22, borderRadius: 999,
    border: 'none', padding: 2,
    display: 'inline-flex', alignItems: 'center',
    transition: 'background-color var(--transition-fast)',
  },
  knob: {
    width: 18, height: 18, borderRadius: '50%',
    background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
    transition: 'transform var(--transition-fast)',
  },
  footNote: {
    margin: '16px 4px 0', fontSize: 12, color: 'var(--color-neutral-400)',
    lineHeight: 1.5,
  },
  toast: {
    position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)',
    padding: '10px 16px', borderRadius: 999,
    background: 'rgba(15,15,20,0.95)', color: '#fff',
    fontSize: 13, fontWeight: 600, zIndex: 50, maxWidth: '90%', textAlign: 'center',
  },
};
