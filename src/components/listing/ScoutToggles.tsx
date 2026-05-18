import { UserCheck, HandHelping } from 'lucide-react';

interface Props {
  scoutNeeded: boolean;
  scoutsAvailable: boolean;
  onChange: (v: { scout_needed: boolean; scouts_available: boolean }) => void;
}

export default function ScoutToggles({ scoutNeeded, scoutsAvailable, onChange }: Props) {
  return (
    <div style={st.wrap}>
      <label style={st.label}>Scout Coordination</label>
      <button
        type="button"
        onClick={() => onChange({ scout_needed: !scoutNeeded, scouts_available: scoutsAvailable })}
        style={{ ...st.toggleCard, ...(scoutNeeded ? st.toggleCardOn : {}) }}
      >
        <HandHelping size={18} style={{ color: scoutNeeded ? 'var(--color-warning-600)' : 'var(--color-neutral-500)' }} />
        <div style={st.toggleText}>
          <span style={st.toggleTitle}>Need a Scout</span>
          <span style={st.toggleSub}>Nearby scouts can offer pickup or inspection help</span>
        </div>
        <span style={{ ...st.pill, ...(scoutNeeded ? st.pillOn : {}) }}>
          {scoutNeeded ? 'ON' : 'OFF'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onChange({ scout_needed: scoutNeeded, scouts_available: !scoutsAvailable })}
        style={{ ...st.toggleCard, ...(scoutsAvailable ? st.toggleCardOn : {}) }}
      >
        <UserCheck size={18} style={{ color: scoutsAvailable ? 'var(--color-success-600)' : 'var(--color-neutral-500)' }} />
        <div style={st.toggleText}>
          <span style={st.toggleTitle}>Scouts Available Nearby</span>
          <span style={st.toggleSub}>You can offer local pickup or transport assistance</span>
        </div>
        <span style={{ ...st.pill, ...(scoutsAvailable ? st.pillOnGreen : {}) }}>
          {scoutsAvailable ? 'ON' : 'OFF'}
        </span>
      </button>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  label: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
  },
  toggleCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  },
  toggleCardOn: { borderColor: 'var(--color-primary-300)', backgroundColor: 'var(--color-primary-50)' },
  toggleText: { display: 'flex', flexDirection: 'column', flex: 1, gap: '2px' },
  toggleTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  toggleSub: { fontSize: '11px', color: 'var(--color-neutral-500)' },
  pill: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-500)',
  },
  pillOn: { backgroundColor: 'var(--color-warning-500)', color: 'var(--color-neutral-0)' },
  pillOnGreen: { backgroundColor: 'var(--color-success-500)', color: 'var(--color-neutral-0)' },
};
