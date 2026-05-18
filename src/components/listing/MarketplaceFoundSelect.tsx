import { ChevronDown, ShoppingBag } from 'lucide-react';

export const MARKETPLACE_OPTIONS = [
  { key: 'facebook_marketplace', label: 'Facebook Marketplace' },
  { key: 'ebay',                 label: 'eBay' },
  { key: 'whatnot',              label: 'Whatnot' },
  { key: 'offerup',              label: 'OfferUp' },
  { key: 'craigslist',           label: 'Craigslist' },
  { key: 'mercari',              label: 'Mercari' },
  { key: 'poshmark',             label: 'Poshmark' },
  { key: 'hibid',                label: 'HiBid' },
  { key: 'maxsold',              label: 'MaxSold' },
  { key: 'etsy',                 label: 'Etsy' },
  { key: 'bonanza',              label: 'Bonanza' },
  { key: 'local_auction_house',  label: 'Local Auction House' },
  { key: 'estate_sale',          label: 'Estate Sale' },
  { key: 'yard_sale',            label: 'Yard Sale' },
  { key: 'storage_auction',      label: 'Storage Auction' },
  { key: 'thrift_store',         label: 'Thrift Store' },
  { key: 'other',                label: 'Other' },
] as const;

export type MarketplaceKey = (typeof MARKETPLACE_OPTIONS)[number]['key'];

export function getMarketplaceLabel(key?: string | null): string | null {
  if (!key) return null;
  if (key.startsWith('custom:')) return key.slice(7);
  return MARKETPLACE_OPTIONS.find((m) => m.key === key)?.label ?? key;
}

interface Props {
  value: string;
  customValue: string;
  onChange: (key: string, custom: string) => void;
  required?: boolean;
  label?: string;
}

export default function MarketplaceFoundSelect({
  value,
  customValue,
  onChange,
  required,
  label = 'Marketplace Found',
}: Props) {
  return (
    <div style={st.wrap}>
      <label style={st.label}>
        {label} {required && <span style={st.req}>*</span>}
      </label>
      <div style={st.selectWrap}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value, e.target.value === 'other' ? customValue : '')}
          style={st.select}
        >
          <option value="">— Select source —</option>
          {MARKETPLACE_OPTIONS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        <ChevronDown size={14} style={st.icon} />
      </div>
      {value === 'other' && (
        <div style={st.customWrap}>
          <ShoppingBag size={14} style={{ color: 'var(--color-neutral-400)' }} />
          <input
            type="text"
            placeholder="Where did you source it?"
            value={customValue}
            onChange={(e) => onChange('other', e.target.value)}
            style={st.input}
            maxLength={60}
          />
        </div>
      )}
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
  req: { color: 'var(--color-error-500)' },
  selectWrap: { position: 'relative' },
  select: {
    width: '100%',
    padding: '10px 32px 10px 12px',
    fontSize: 'var(--font-size-sm)',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)',
    appearance: 'none',
    cursor: 'pointer',
  },
  icon: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--color-neutral-400)',
    pointerEvents: 'none',
  },
  customWrap: {
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
  },
};
