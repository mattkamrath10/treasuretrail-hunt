import { useMemo, useState } from 'react';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import {
  ArrowLeft,
  Sparkles,
  ChartBar as BarChart3,
  Share2,
  Bookmark,
  Send,
  Eye,
  Zap,
  CircleCheck as CheckCircle,
  Loader,
  TriangleAlert as AlertTriangle,
  Check,
} from 'lucide-react';
import {
  buildIntelligence,
  type ConditionKey,
  type ItemIntelligence,
} from '../lib/itemIntelligence';

export type AiActionKey =
  | 'post_flash_finds'
  | 'share_rare_radar'
  | 'save_analysis'
  | 'watch_trends'
  | 'share';

export interface AnalysisEditableForm {
  title: string;
  category: string;
  condition: ConditionKey | null;
  price: string;
  notes: string;
}

export interface AnalysisDonePayload {
  editedForm: AnalysisEditableForm;
  actions: AiActionKey[];
  intelligence: ItemIntelligence;
}

interface AnalysisProps {
  photoUrl: string | null;
  form: {
    title: string;
    category: string;
    notes: string;
    price: string;
    location: string;
  };
  onDone: (payload: AnalysisDonePayload) => void;
  onBack: () => void;
  submitting?: boolean;
  submitError?: string;
}

const CATEGORIES = [
  'Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques',
  'Art', 'Jewelry', 'Watches', 'Sneakers', 'Toys', 'Tools', 'Clothing', 'Other',
];

const CONDITIONS: { key: ConditionKey; label: string; desc: string }[] = [
  { key: 'mint',  label: 'Mint',         desc: 'Like new, no flaws' },
  { key: 'good',  label: 'Good',         desc: 'Used, fully working' },
  { key: 'fair',  label: 'Fair',         desc: 'Visible wear or minor issues' },
  { key: 'parts', label: 'For parts',    desc: 'Not working / repair needed' },
];

const ACTIONS: { key: AiActionKey; label: string; description: string; Icon: typeof Zap; color: string }[] = [
  { key: 'post_flash_finds', label: 'Post to Flash Finds', description: 'Share with the community feed', Icon: Zap,       color: 'var(--color-primary-600)'   },
  { key: 'share_rare_radar', label: 'Share to Rare Radar', description: 'Add as a reference for hunters',  Icon: Eye,       color: 'var(--color-secondary-600)' },
  { key: 'save_analysis',    label: 'Save Analysis',       description: 'Keep this for later editing',     Icon: Bookmark,  color: 'var(--color-success-600)'   },
  { key: 'watch_trends',     label: 'Watch Trends',        description: 'Track this category over time',   Icon: BarChart3, color: 'var(--color-warning-600)'   },
  { key: 'share',            label: 'Share',               description: 'Native share / copy link',        Icon: Share2,    color: 'var(--color-neutral-700)'   },
];

export default function AiAnalysis({
  photoUrl,
  form,
  onDone,
  onBack,
  submitting,
  submitError,
}: AnalysisProps) {
  const [edited, setEdited] = useState<AnalysisEditableForm>({
    title: form.title,
    category: form.category || 'Other',
    condition: null,
    price: form.price,
    notes: form.notes,
  });
  const [selected, setSelected] = useState<Set<AiActionKey>>(
    new Set<AiActionKey>(['post_flash_finds']),
  );

  const purchasePrice = useMemo(() => {
    const n = parseFloat(edited.price);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [edited.price]);

  const intelligence = useMemo(
    () =>
      buildIntelligence({
        title: edited.title,
        category: edited.category,
        notes: edited.notes,
        purchasePrice,
        condition: edited.condition,
      }),
    [edited.title, edited.category, edited.notes, purchasePrice, edited.condition],
  );

  const toggleAction = (key: AiActionKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = () => {
    if (selected.size === 0) return;
    onDone({
      editedForm: edited,
      actions: Array.from(selected),
      intelligence,
    });
  };

  const ev = intelligence.resale;
  const midValue = ev?.mid ?? null;
  const profitLow  = purchasePrice !== null && ev ? ev.low  - purchasePrice : null;
  const profitHigh = purchasePrice !== null && ev ? ev.high - purchasePrice : null;
  const primaryFee = midValue !== null && intelligence.fees[0] ? intelligence.fees[0] : null;
  const shipping = intelligence.shipping;
  const netLow  = profitLow  !== null && primaryFee && shipping.high
    ? profitLow  - primaryFee.feeAmount - shipping.high
    : null;
  const netHigh = profitHigh !== null && primaryFee && shipping.low
    ? profitHigh - primaryFee.feeAmount - shipping.low
    : null;

  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Reseller Assist</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.resultsContent}>
        <div style={styles.resultHero}>
          <div style={{ ...styles.resultImage, overflow: 'hidden' }}>
            <ImageWithFade
              src={photoUrl}
              alt={edited.title || 'Your find'}
              fallback={<MediaFallback kind="find" seed={photoUrl || edited.title || 'ai-result'} label={edited.title?.slice(0, 14) || 'FIND'} />}
            />
          </div>
        </div>

        <div style={styles.resultBody}>
          <div style={styles.usageBanner}>
            <Sparkles size={12} style={{ color: 'var(--color-primary-500)' }} />
            <span style={styles.usageBannerText}>Lightweight assist · no scan limits</span>
          </div>

          {/* Editable item fields */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Item details</h3>

            <label style={styles.fieldLabel} htmlFor="ai-title">Title</label>
            <input
              id="ai-title"
              style={styles.input}
              value={edited.title}
              onChange={(e) => setEdited({ ...edited, title: e.target.value })}
              placeholder="e.g. Vintage Omega Seamaster 1968"
            />

            <label style={styles.fieldLabel}>Category</label>
            <div style={styles.chipRow}>
              {CATEGORIES.map((c) => {
                const active = edited.category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEdited({ ...edited, category: c })}
                    style={{ ...styles.chip, ...(active ? styles.chipActive : {}) }}
                    aria-pressed={active}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            <label style={styles.fieldLabel}>Condition</label>
            <div style={styles.conditionGrid}>
              {CONDITIONS.map((c) => {
                const active = edited.condition === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() =>
                      setEdited({ ...edited, condition: active ? null : c.key })
                    }
                    style={{ ...styles.conditionBtn, ...(active ? styles.conditionBtnActive : {}) }}
                    aria-pressed={active}
                  >
                    <span style={styles.conditionLabel}>{c.label}</span>
                    <span style={styles.conditionDesc}>{c.desc}</span>
                    {active && (
                      <span style={styles.conditionCheck}>
                        <Check size={12} style={{ color: 'var(--color-neutral-0)' }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <label style={styles.fieldLabel} htmlFor="ai-price">Purchase price (USD)</label>
            <input
              id="ai-price"
              style={styles.input}
              inputMode="decimal"
              value={edited.price}
              onChange={(e) =>
                setEdited({ ...edited, price: e.target.value.replace(/[^\d.]/g, '') })
              }
              placeholder="e.g. 25"
            />

            <label style={styles.fieldLabel} htmlFor="ai-notes">Notes (optional)</label>
            <textarea
              id="ai-notes"
              style={styles.textarea}
              rows={3}
              value={edited.notes}
              onChange={(e) => setEdited({ ...edited, notes: e.target.value })}
              placeholder="Brand, era, serial, flaws, anything that helps buyers..."
            />
          </section>

          {/* Pricing intelligence */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Pricing estimate</h3>
            {ev && purchasePrice !== null ? (
              <>
                <div style={styles.metricsGrid}>
                  <div style={styles.metricCard}>
                    <span style={styles.metricLabel}>Est. Resale</span>
                    <span style={styles.metricValueGreen}>
                      ${formatMoney(ev.low)} – ${formatMoney(ev.high)}
                    </span>
                  </div>
                  <div style={styles.metricCard}>
                    <span style={styles.metricLabel}>Multiplier</span>
                    <span style={styles.metricValueNeutral}>
                      {ev.multiplierLow.toFixed(1)}× – {ev.multiplierHigh.toFixed(1)}×
                    </span>
                  </div>
                </div>

                <div style={styles.profitCard}>
                  <div style={styles.profitRow}>
                    <span style={styles.profitLabel}>Purchase price</span>
                    <span style={styles.profitValue}>-${formatMoney(purchasePrice)}</span>
                  </div>
                  <div style={styles.profitRow}>
                    <span style={styles.profitLabel}>Est. resale (mid)</span>
                    <span style={styles.profitValueGreen}>+${formatMoney(ev.mid)}</span>
                  </div>
                  {primaryFee && (
                    <div style={styles.profitRow}>
                      <span style={styles.profitLabel}>
                        {primaryFee.marketplace} fees ({primaryFee.feePct}%)
                      </span>
                      <span style={styles.profitValue}>-${formatMoney(primaryFee.feeAmount)}</span>
                    </div>
                  )}
                  {(shipping.low > 0 || shipping.high > 0) && (
                    <div style={styles.profitRow}>
                      <span style={styles.profitLabel}>Est. shipping</span>
                      <span style={styles.profitValue}>
                        -${formatMoney(shipping.low)} to -${formatMoney(shipping.high)}
                      </span>
                    </div>
                  )}
                  <div style={styles.profitDivider} />
                  <div style={styles.profitRow}>
                    <span style={styles.profitLabelBold}>Projected gross profit</span>
                    <span style={styles.profitTotal}>
                      {fmtSigned(profitLow)} to {fmtSigned(profitHigh)}
                    </span>
                  </div>
                  {netLow !== null && netHigh !== null && (
                    <div style={styles.profitRow}>
                      <span style={styles.profitLabel}>After fees + shipping</span>
                      <span style={styles.profitValueGreen}>
                        {fmtSigned(netLow)} to {fmtSigned(netHigh)}
                      </span>
                    </div>
                  )}
                </div>
                <p style={styles.disclaimer}>
                  Estimates based on category averages. Always check recent sold comps before pricing.
                </p>
              </>
            ) : (
              <p style={styles.helperText}>
                Enter a purchase price above to see resale range, marketplace fees, and projected profit.
              </p>
            )}
          </section>

          {/* Marketplace suggestions */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Recommended marketplaces</h3>
            <div style={styles.marketplaceList}>
              {intelligence.marketplaces.map((m) => (
                <div key={m.key} style={styles.marketplaceCard}>
                  <div style={styles.marketplaceHeader}>
                    <span style={styles.marketplaceName}>{m.label}</span>
                    <span style={styles.marketplaceFee}>{m.feePct}% fees</span>
                  </div>
                  <span style={styles.marketplaceReason}>{m.reason}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Shipping note */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Shipping & logistics</h3>
            <div style={styles.shippingCard}>
              <span style={styles.shippingRange}>
                {shipping.low === 0 && shipping.high === 0
                  ? 'Local pickup recommended'
                  : `~$${formatMoney(shipping.low)} – $${formatMoney(shipping.high)}`}
              </span>
              <span style={styles.shippingNote}>{shipping.note}</span>
            </div>
          </section>

          {/* Keywords */}
          {intelligence.keywords.length > 0 && (
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>Suggested keywords</h3>
              <div style={styles.keywordRow}>
                {intelligence.keywords.map((k) => (
                  <span key={k} style={styles.keywordChip}>{k}</span>
                ))}
              </div>
              <p style={styles.helperText}>Use these in your title and tags for better search visibility.</p>
            </section>
          )}

          {/* Tips */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Reseller tips</h3>
            <div style={styles.attributesList}>
              {intelligence.tips.map((t, i) => (
                <div key={i} style={styles.bulletRow}>
                  <span style={{ ...styles.bulletDot, backgroundColor: 'var(--color-success-500)' }} />
                  <span style={styles.bulletText}>{t}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Watch-outs */}
          {intelligence.watchOuts.length > 0 && (
            <section style={styles.section}>
              <h3 style={styles.sectionTitle}>Watch-outs</h3>
              <div style={styles.attributesList}>
                {intelligence.watchOuts.map((w, i) => (
                  <div key={i} style={styles.bulletRow}>
                    <AlertTriangle
                      size={12}
                      style={{ color: 'var(--color-warning-500)', flexShrink: 0, marginTop: 3 }}
                    />
                    <span style={styles.bulletText}>{w}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Action chips */}
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Choose your next steps</h3>
            <p style={styles.helperText}>
              Tap any combination — they all run when you press "Post This Find".
            </p>
            <div style={styles.actionsGrid}>
              {ACTIONS.map(({ key, label, description, Icon, color }) => {
                const active = selected.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleAction(key)}
                    style={{ ...styles.actionCard, ...(active ? styles.actionCardActive : {}) }}
                    aria-pressed={active}
                  >
                    {active && (
                      <span style={styles.actionCheck}>
                        <Check size={12} style={{ color: 'var(--color-neutral-0)' }} />
                      </span>
                    )}
                    <Icon size={20} style={{ color: active ? 'var(--color-primary-700)' : color }} />
                    <span style={styles.actionLabel}>{label}</span>
                    <span style={styles.actionDesc}>{description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {submitError && <p style={styles.errorText}>{submitError}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            style={{
              ...styles.primaryBtn,
              opacity: submitting || selected.size === 0 ? 0.6 : 1,
              cursor: submitting || selected.size === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? (
              <Loader
                size={18}
                style={{ color: 'var(--color-neutral-0)', animation: 'spin 1s linear infinite' }}
              />
            ) : (
              <CheckCircle size={18} style={{ color: 'var(--color-neutral-0)' }} />
            )}
            <span style={styles.primaryBtnText}>
              {submitting
                ? 'Running actions…'
                : selected.size === 0
                ? 'Select at least one action'
                : `Post This Find · ${selected.size} action${selected.size > 1 ? 's' : ''}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtSigned(n: number | null): string {
  if (n === null) return '$0';
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${formatMoney(Math.abs(n))}`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-600)',
  },
  stepLabel: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  resultsContent: { flex: 1, overflow: 'auto' },
  resultHero: { position: 'relative', aspectRatio: '16/9', overflow: 'hidden' },
  resultImage: { width: '100%', height: '100%', objectFit: 'cover' },
  resultBody: { padding: 'var(--space-4)' },

  usageBanner: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-full)',
    marginBottom: 'var(--space-4)',
  },
  usageBannerText: {
    fontSize: '11px',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
  },

  section: { marginBottom: 'var(--space-5)' },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    marginBottom: 'var(--space-3)',
  },

  fieldLabel: {
    display: 'block',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-600)',
    marginBottom: 'var(--space-1)',
    marginTop: 'var(--space-3)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-900)',
    minHeight: '44px',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-900)',
    fontFamily: 'inherit',
    resize: 'vertical',
  },

  chipRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: 'var(--space-2)' },
  chip: {
    padding: '8px 12px',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
    minHeight: '36px',
  },
  chipActive: {
    backgroundColor: 'var(--color-primary-600)',
    color: 'var(--color-neutral-0)',
    border: '1px solid var(--color-primary-600)',
    fontWeight: 'var(--font-weight-semibold)',
  },

  conditionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  conditionBtn: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '2px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    textAlign: 'left',
    minHeight: '64px',
  },
  conditionBtnActive: {
    border: '2px solid var(--color-primary-500)',
    backgroundColor: 'var(--color-primary-50)',
    boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.12)',
  },
  conditionLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  conditionDesc: { fontSize: '11px', color: 'var(--color-neutral-500)' },
  conditionCheck: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '18px',
    height: '18px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-600)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },
  metricCard: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  metricLabel: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-400)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'block',
    marginBottom: '4px',
  },
  metricValueGreen: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-600)',
  },
  metricValueNeutral: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-800)',
  },

  profitCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  profitRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) 0',
    gap: 'var(--space-2)',
  },
  profitLabel: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)' },
  profitLabelBold: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  profitValue: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  profitValueGreen: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-success-600)',
  },
  profitDivider: {
    height: '1px',
    backgroundColor: 'var(--color-neutral-200)',
    margin: 'var(--space-2) 0',
  },
  profitTotal: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-600)',
  },

  disclaimer: {
    marginTop: 'var(--space-2)',
    fontSize: '11px',
    color: 'var(--color-neutral-500)',
  },
  helperText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    marginBottom: 'var(--space-2)',
  },

  marketplaceList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  marketplaceCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  marketplaceHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  marketplaceName: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  marketplaceFee: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
    backgroundColor: 'var(--color-primary-50)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
  },
  marketplaceReason: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
    lineHeight: 'var(--line-height-snug)',
  },

  shippingCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  shippingRange: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  shippingNote: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
  },

  keywordRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  keywordChip: {
    padding: '4px 10px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
  },

  attributesList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  bulletRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    alignItems: 'flex-start',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-sm)',
  },
  bulletDot: {
    width: '6px',
    height: '6px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-500)',
    marginTop: '6px',
    flexShrink: 0,
  },
  bulletText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-700)',
    lineHeight: 'var(--line-height-snug)',
  },

  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-2)',
  },
  actionCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '2px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    textAlign: 'left',
    minHeight: '88px',
    transition: 'all 0.15s ease',
  },
  actionCardActive: {
    border: '2px solid var(--color-primary-500)',
    backgroundColor: 'var(--color-primary-50)',
    boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.18)',
  },
  actionCheck: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '18px',
    height: '18px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-600)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  actionDesc: {
    fontSize: '11px',
    color: 'var(--color-neutral-500)',
    lineHeight: 'var(--line-height-snug)',
  },

  primaryBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-500)',
    border: 'none',
    marginTop: 'var(--space-2)',
    minHeight: '48px',
  },
  primaryBtnText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
  },
  errorText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error-500)',
    marginBottom: 'var(--space-2)',
  },
};
