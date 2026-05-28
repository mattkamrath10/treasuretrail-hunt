import { MapPin, ShoppingBag, Package, Truck, Lock } from 'lucide-react';
import { getPickupTypeLabel } from './PickupTypeChips';
import { getMarketplaceLabel } from './MarketplaceFoundSelect';

interface Props {
  generalLocation?: string | null;
  marketplaceFound?: string | null;
  pickupType?: string[] | null;
  shippingAvailable?: boolean;
  meetupNotes?: string | null;
  hasPrivateAddress?: boolean;
  addressRevealPolicy?: string | null;
}

const POLICY_LABEL: Record<string, string> = {
  on_contact: 'Address shared after contact',
  on_appointment: 'Address shared after appointment',
  on_purchase: 'Address shared after purchase',
  never: 'Address kept private',
};

export default function LogisticsBlock(props: Props) {
  const {
    generalLocation,
    marketplaceFound,
    pickupType,
    shippingAvailable,
    meetupNotes,
    hasPrivateAddress,
    addressRevealPolicy,
  } = props;

  const marketplaceLabel = getMarketplaceLabel(marketplaceFound);
  const pickupList = (pickupType || []).filter(Boolean);
  const hasPickup = pickupList.length > 0 || shippingAvailable;

  const isEmpty =
    !generalLocation &&
    !marketplaceLabel &&
    !hasPickup &&
    !meetupNotes &&
    !hasPrivateAddress;
  if (isEmpty) return null;

  return (
    <div style={st.card}>
      <span style={st.heading}>Sourcing &amp; Logistics</span>

      {generalLocation && (
        <Row icon={<MapPin size={14} style={{ color: 'var(--color-primary-500)' }} />} label="Location">
          {generalLocation}
        </Row>
      )}

      {marketplaceLabel && (
        <Row icon={<ShoppingBag size={14} style={{ color: 'var(--color-secondary-500)' }} />} label="Marketplace">
          {marketplaceLabel}
        </Row>
      )}

      {shippingAvailable !== undefined && (
        <Row icon={<Package size={14} style={{ color: 'var(--color-success-500)' }} />} label="Shipping">
          {shippingAvailable ? 'Available' : 'Local only'}
        </Row>
      )}

      {pickupList.length > 0 && (
        <div style={st.row}>
          <div style={st.iconCol}>
            <Truck size={14} style={{ color: 'var(--color-accent-500)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={st.label}>Pickup</span>
            <div style={st.chipRow}>
              {pickupList.map((p) => (
                <span key={p} style={st.chip}>{getPickupTypeLabel(p)}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasPrivateAddress && (
        <Row icon={<Lock size={13} style={{ color: 'var(--color-neutral-500)' }} />} label="Exact Address">
          {POLICY_LABEL[addressRevealPolicy || 'on_contact']}
        </Row>
      )}

      {meetupNotes && (
        <div style={st.notes}>
          <span style={st.notesLabel}>Meetup notes</span>
          <p style={st.notesText}>{meetupNotes}</p>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={st.row}>
      <div style={st.iconCol}>{icon}</div>
      <div style={{ flex: 1 }}>
        <span style={st.label}>{label}</span>
        <span style={st.value}>{children}</span>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  card: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
  heading: {
    fontSize: '11px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  row: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' },
  iconCol: { width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' },
  label: {
    fontSize: '11px',
    color: 'var(--color-neutral-500)',
    display: 'block',
    marginBottom: '2px',
  },
  value: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  chip: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-700)',
    fontSize: '11px',
    fontWeight: 'var(--font-weight-medium)',
  },
  chipWarn: { backgroundColor: 'var(--color-warning-100)', color: 'var(--color-warning-700)' },
  chipGreen: { backgroundColor: 'var(--color-success-100)', color: 'var(--color-success-700)' },
  notes: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-neutral-100)',
  },
  notesLabel: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    display: 'block',
    marginBottom: '4px',
  },
  notesText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
    lineHeight: 'var(--line-height-snug)',
    margin: 0,
  },
};
