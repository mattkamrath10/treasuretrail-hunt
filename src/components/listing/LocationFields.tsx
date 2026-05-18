import { MapPin, Lock, Info } from 'lucide-react';

export interface LocationValue {
  general_location: string;
  exact_address_private: string;
  address_reveal_policy: 'on_contact' | 'on_appointment' | 'on_purchase' | 'never';
}

interface Props {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  required?: boolean;
  hint?: string;
}

/**
 * Validates the public general location field:
 *   - 5-digit US ZIP, OR
 *   - "City, ST" / "City, State" pattern
 */
export function isValidGeneralLocation(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (/^\d{5}(-\d{4})?$/.test(s)) return true;
  if (/^[\p{L}\p{M} .'-]{2,},\s*[\p{L} .]{2,}$/u.test(s)) return true;
  return false;
}

export default function LocationFields({ value, onChange, required = true, hint }: Props) {
  const set = <K extends keyof LocationValue>(k: K, v: LocationValue[K]) =>
    onChange({ ...value, [k]: v });
  const showExact = value.exact_address_private !== undefined;

  return (
    <div style={st.wrap}>
      <label style={st.label}>
        General Location {required && <span style={st.req}>*</span>}
        <span style={st.hint}> · ZIP or City, State</span>
      </label>
      <div style={st.inputWrap}>
        <MapPin size={16} style={{ color: 'var(--color-neutral-400)' }} />
        <input
          type="text"
          inputMode="text"
          placeholder="e.g. 85001  or  Phoenix, AZ"
          value={value.general_location}
          onChange={(e) => set('general_location', e.target.value)}
          style={st.input}
          maxLength={80}
        />
      </div>
      {hint && <span style={st.helper}>{hint}</span>}
      {value.general_location && !isValidGeneralLocation(value.general_location) && (
        <span style={st.error}>Use a 5-digit ZIP or "City, ST" format.</span>
      )}

      <div style={st.privateBlock}>
        <div style={st.privateHeader}>
          <Lock size={13} style={{ color: 'var(--color-neutral-500)' }} />
          <span style={st.privateTitle}>Exact Pickup Address</span>
          <span style={st.privateBadge}>Private</span>
        </div>
        <p style={st.privateHelp}>
          <Info size={11} style={{ color: 'var(--color-neutral-400)', flexShrink: 0 }} />
          Hidden from public listings. Shared with buyers only after approval.
        </p>
        <input
          type="text"
          placeholder="123 Main St, Phoenix AZ 85001 (optional)"
          value={value.exact_address_private || ''}
          onChange={(e) => set('exact_address_private', e.target.value)}
          style={st.input}
          maxLength={160}
        />
        {showExact && value.exact_address_private && (
          <>
            <label style={{ ...st.label, marginTop: 12 }}>Reveal Address</label>
            <div style={st.policyRow}>
              {[
                { id: 'on_contact', label: 'After Contact' },
                { id: 'on_appointment', label: 'On Appointment' },
                { id: 'on_purchase', label: 'After Purchase' },
                { id: 'never', label: 'Never Share' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set('address_reveal_policy', p.id as LocationValue['address_reveal_policy'])}
                  style={{
                    ...st.policyChip,
                    ...(value.address_reveal_policy === p.id ? st.policyChipActive : {}),
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  label: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
    display: 'block',
  },
  req: { color: 'var(--color-error-500)' },
  hint: { fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-400)' },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: '10px 12px',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-0)',
  },
  input: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'transparent',
    padding: '10px 0',
  },
  helper: { fontSize: '11px', color: 'var(--color-neutral-500)' },
  error: { fontSize: '11px', color: 'var(--color-error-500)' },
  privateBlock: {
    marginTop: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px dashed var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  privateHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  privateTitle: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  privateBadge: {
    padding: '1px 6px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-900)',
    color: 'var(--color-neutral-0)',
    fontSize: '9px',
    fontWeight: 'var(--font-weight-bold)',
    letterSpacing: '0.4px',
  },
  privateHelp: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: 'var(--color-neutral-500)',
    lineHeight: 'var(--line-height-snug)',
  },
  policyRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  policyChip: {
    padding: '4px 10px',
    fontSize: '11px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-600)',
    cursor: 'pointer',
    fontWeight: 'var(--font-weight-medium)',
  },
  policyChipActive: {
    backgroundColor: 'var(--color-primary-500)',
    borderColor: 'var(--color-primary-500)',
    color: 'var(--color-neutral-0)',
  },
};
