import { Package, Users, MapPin, Globe, Calendar } from 'lucide-react';

export const PICKUP_TYPES = [
  { id: 'local_pickup',              label: 'Local Pickup',             icon: MapPin },
  { id: 'shipping_available',        label: 'Shipping Available',       icon: Package },
  { id: 'meetup_only',               label: 'Meetup Only',              icon: Users },
  { id: 'nationwide_shipping',       label: 'Nationwide Shipping',      icon: Globe },
  { id: 'appointment_required',      label: 'Appointment Required',     icon: Calendar },
] as const;

export type PickupTypeId = (typeof PICKUP_TYPES)[number]['id'];

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export default function PickupTypeChips({ value, onChange }: Props) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div style={st.wrap}>
      <label style={st.label}>Pickup &amp; Delivery</label>
      <div style={st.grid}>
        {PICKUP_TYPES.map((p) => {
          const active = value.includes(p.id);
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              style={{ ...st.chip, ...(active ? st.chipActive : {}) }}
            >
              <Icon size={13} style={{ color: active ? 'var(--color-neutral-0)' : 'var(--color-neutral-500)' }} />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function getPickupTypeLabel(id: string): string {
  return PICKUP_TYPES.find((p) => p.id === id)?.label || id;
}

const st: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  label: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-700)',
  },
  grid: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: '12px',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  chipActive: {
    backgroundColor: 'var(--color-primary-500)',
    borderColor: 'var(--color-primary-500)',
    color: 'var(--color-neutral-0)',
  },
};
