import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Navigation, Trash2 } from 'lucide-react';
import {
  useSavedLocation,
  saveZipLocation,
  requestGpsLocation,
  clearSavedLocation,
} from '../lib/userLocation';

/**
 * "My Location" settings — change the ZIP, use the current GPS position, or
 * clear the saved location. Backed entirely by the client-side userLocation
 * store (no DB), matching how Discover and the Event Map consume location.
 */
export default function LocationSettings() {
  const navigate = useNavigate();
  const saved = useSavedLocation();
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState<null | 'gps' | 'zip'>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const onUseGps = async () => {
    setBusy('gps');
    setMsg(null);
    const r = await requestGpsLocation();
    setBusy(null);
    setMsg(
      r.ok
        ? { kind: 'ok', text: 'Saved your current location.' }
        : {
            kind: 'err',
            text:
              r.reason === 'unsupported'
                ? "Location isn't available on this device."
                : 'Location permission was denied. You can enter a ZIP code instead.',
          },
    );
  };

  const onSaveZip = async () => {
    setBusy('zip');
    setMsg(null);
    const r = await saveZipLocation(zip);
    setBusy(null);
    if (r.ok) {
      setMsg({ kind: 'ok', text: `Saved ZIP ${r.location.zip}.` });
      setZip('');
    } else {
      setMsg({
        kind: 'err',
        text:
          r.reason === 'invalid'
            ? 'Enter a 5-digit ZIP code.'
            : r.reason === 'not_found'
              ? "We couldn't find that ZIP code."
              : "Couldn't look up that ZIP. Try again.",
      });
    }
  };

  const onClear = () => {
    clearSavedLocation();
    setMsg({ kind: 'ok', text: 'Cleared your saved location.' });
  };

  const currentLabel = saved
    ? saved.source === 'zip'
      ? `ZIP ${saved.zip}`
      : 'Current location (GPS)'
    : null;

  return (
    <div style={st.page}>
      <header style={st.header}>
        <button onClick={() => navigate(-1)} style={st.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 style={st.title}>My Location</h1>
      </header>

      <div style={st.body}>
        <section style={st.card}>
          <h2 style={st.cardLabel}>Current location</h2>
          {saved ? (
            <div style={st.currentRow}>
              <MapPin size={18} style={{ color: 'var(--color-primary-600)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <p style={st.currentValue}>{currentLabel}</p>
                <p style={st.currentSub}>
                  {saved.lat.toFixed(3)}, {saved.lng.toFixed(3)}
                </p>
              </div>
            </div>
          ) : (
            <p style={st.empty}>
              No location saved yet. Set one to see nearby events first on Discover.
            </p>
          )}
        </section>

        <section style={st.card}>
          <h2 style={st.cardLabel}>Use a ZIP code</h2>
          <div style={st.zipRow}>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
              onKeyDown={(e) => { if (e.key === 'Enter') onSaveZip(); }}
              placeholder="e.g. 90210"
              inputMode="numeric"
              style={st.zipInput}
              aria-label="ZIP code"
            />
            <button onClick={onSaveZip} disabled={busy === 'zip'} style={st.primaryBtn}>
              {busy === 'zip' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>

        <section style={st.card}>
          <h2 style={st.cardLabel}>Use my current location</h2>
          <button onClick={onUseGps} disabled={busy === 'gps'} style={st.gpsBtn}>
            <Navigation size={16} />
            {busy === 'gps' ? 'Locating…' : 'Use Current Location'}
          </button>
        </section>

        {saved && (
          <button onClick={onClear} style={st.clearBtn}>
            <Trash2 size={16} />
            Clear saved location
          </button>
        )}

        {msg && (
          <p style={{ ...st.msg, color: msg.kind === 'ok' ? 'var(--color-success-600)' : 'var(--color-error-600)' }}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: {
    minHeight: '100%',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)',
  },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: '12px 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    background: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
  },
  backBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 40, height: 40, borderRadius: 'var(--radius-full)',
    border: 'none', background: 'transparent', cursor: 'pointer',
    color: 'var(--color-neutral-700)',
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700 },
  body: { padding: '16px', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' },
  card: {
    padding: 16, borderRadius: 14,
    background: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-100)',
  },
  cardLabel: {
    margin: '0 0 10px', fontSize: 12, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.04em',
    color: 'var(--color-neutral-500)',
  },
  currentRow: { display: 'flex', alignItems: 'center', gap: 10 },
  currentValue: { margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-neutral-900)' },
  currentSub: { margin: '2px 0 0', fontSize: 12, color: 'var(--color-neutral-500)' },
  empty: { margin: 0, fontSize: 13, color: 'var(--color-neutral-500)', lineHeight: 1.4 },
  zipRow: { display: 'flex', gap: 8, alignItems: 'center' },
  zipInput: {
    flex: 1, minWidth: 0,
    padding: '11px 12px', borderRadius: 10,
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)', fontSize: 16, outline: 'none',
  },
  primaryBtn: {
    padding: '11px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600)', color: '#fff', fontSize: 14, fontWeight: 700,
  },
  gpsBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '12px 16px', borderRadius: 10,
    border: '1px solid var(--color-neutral-200)', cursor: 'pointer',
    background: 'var(--color-neutral-0)', color: 'var(--color-neutral-900)',
    fontSize: 14, fontWeight: 700,
  },
  clearBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '12px 16px', borderRadius: 10,
    border: '1px solid rgba(220,38,38,0.25)', cursor: 'pointer',
    background: 'var(--color-error-50)', color: 'var(--color-error-600)',
    fontSize: 14, fontWeight: 700,
  },
  msg: { margin: 0, fontSize: 13, fontWeight: 600, textAlign: 'center' },
};
