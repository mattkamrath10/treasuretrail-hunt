import { useState, useEffect, useRef } from 'react';
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
  Crown,
} from 'lucide-react';
import { compressImage } from '../lib/imageCompress';
import {
  runAiScan,
  AiScanError,
  type AiAnalysisResult,
  type AiScanResponse,
} from '../lib/aiAnalysis';

type AnalysisView = 'loading' | 'results' | 'error';

interface AnalysisProps {
  photoUrl: string | null;
  form: {
    title: string;
    category: string;
    notes: string;
    price: string;
    location: string;
  };
  onDone: () => void;
  onBack: () => void;
  onUsageUpdate?: (info: { tier: 'free' | 'pro'; used: number; limit: number; remaining: number }) => void;
  submitting?: boolean;
  submitError?: string;
}

const LOADING_STAGES = [
  'Compressing image',
  'Identifying item',
  'Detecting brand & era',
  'Estimating resale value',
  'Scoring rarity',
  'Drafting reseller tips',
];

export default function AiAnalysis({
  photoUrl,
  form,
  onDone,
  onBack,
  onUsageUpdate,
  submitting,
  submitError,
}: AnalysisProps) {
  const [view, setView] = useState<AnalysisView>('loading');
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [meta, setMeta] = useState<{
    cached: boolean;
    tier: 'free' | 'pro';
    used: number;
    limit: number;
    remaining: number;
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    message: string;
    limitHit?: boolean;
    needsAuth?: boolean;
    tier?: 'free' | 'pro';
    used?: number;
    limit?: number;
  } | null>(null);

  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    async function run() {
      if (!photoUrl) {
        setErrorState({ message: 'No photo to analyze. Please go back and add a photo.' });
        setView('error');
        return;
      }

      try {
        const compressed = await compressImage(photoUrl, 1024, 0.82);

        const userContext = [
          form.title && `User titled it: "${form.title}".`,
          form.category && `User category: ${form.category}.`,
          form.location && `Found at: ${form.location}.`,
          form.price && `Acquired for: $${form.price}.`,
          form.notes && `Notes: ${form.notes}.`,
        ]
          .filter(Boolean)
          .join(' ');

        const response: AiScanResponse = await runAiScan(compressed, userContext);
        setResult(response.result);
        setMeta({
          cached: response.cached,
          tier: response.tier,
          used: response.used,
          limit: response.limit,
          remaining: response.remaining,
        });
        onUsageUpdate?.({
          tier: response.tier,
          used: response.used,
          limit: response.limit,
          remaining: response.remaining,
        });
        setView('results');
      } catch (err: any) {
        if (err instanceof AiScanError) {
          if (err.status === 401) {
            setErrorState({ message: err.message, needsAuth: true });
          } else if (err.status === 429) {
            setErrorState({
              message: err.message,
              limitHit: true,
              tier: err.usage?.tier,
              used: err.usage?.used,
              limit: err.usage?.limit,
            });
            if (err.usage) onUsageUpdate?.(err.usage);
          } else {
            setErrorState({ message: err.message });
          }
        } else {
          setErrorState({ message: err?.message || 'AI scan failed. Please try again.' });
        }
        setView('error');
      }
    }

    run();
  }, [photoUrl, form, onUsageUpdate]);

  if (view === 'loading') return <LoadingExperience photoUrl={photoUrl} />;

  if (view === 'error') {
    return (
      <ErrorScreen
        onBack={onBack}
        message={errorState?.message ?? 'AI scan failed.'}
        limitHit={errorState?.limitHit}
        used={errorState?.used}
        limit={errorState?.limit}
        tier={errorState?.tier}
      />
    );
  }

  return (
    <ResultsScreen
      photoUrl={photoUrl}
      form={form}
      result={result!}
      meta={meta!}
      onDone={onDone}
      onBack={onBack}
      submitting={submitting}
      submitError={submitError}
    />
  );
}

function LoadingExperience({ photoUrl }: { photoUrl: string | null }) {
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    let cancelled = false;
    let elapsed = 0;

    const interval = setInterval(() => {
      if (cancelled) return;
      elapsed += 200;
      // Asymptotic crawl toward 92% — we never auto-complete; the parent swaps view.
      setProgress((p) => Math.min(92, p + (92 - p) * 0.05));
      setCurrentStage(() => Math.min(LOADING_STAGES.length - 1, Math.floor(elapsed / 1100)));
    }, 200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={styles.loadingContainer}>
      <div style={styles.loadingContent}>
        <div style={styles.loadingImageWrap}>
          {photoUrl ? (
            <img src={photoUrl} alt="Analyzing" style={styles.loadingImage} />
          ) : (
            <div
              style={{
                ...styles.loadingImage,
                backgroundColor: 'var(--color-neutral-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Sparkles size={48} style={{ color: 'var(--color-primary-400)' }} />
            </div>
          )}
          <div style={styles.scanOverlay}>
            <div style={{ ...styles.scanLine, top: `${(progress % 100) * 0.9}%` }} />
          </div>
        </div>

        <div style={styles.loadingInfo}>
          <div style={styles.sparkleIcon}>
            <Sparkles size={28} style={{ color: 'var(--color-primary-500)' }} />
          </div>
          <h2 style={styles.loadingTitle}>Analyzing Your Find</h2>
          <p style={styles.loadingSubtitle}>AI is examining your item across multiple dimensions</p>
        </div>

        <div style={styles.progressSection}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <span style={styles.progressPercent}>{Math.round(progress)}%</span>
        </div>

        <div style={styles.stagesList}>
          {LOADING_STAGES.map((label, index) => (
            <div
              key={label}
              style={{
                ...styles.stageItem,
                opacity: index <= currentStage ? 1 : 0.3,
              }}
            >
              <div
                style={{
                  ...styles.stageDot,
                  backgroundColor:
                    index < currentStage
                      ? 'var(--color-success-500)'
                      : index === currentStage
                      ? 'var(--color-primary-500)'
                      : 'var(--color-neutral-200)',
                }}
              />
              <span
                style={{
                  ...styles.stageLabel,
                  fontWeight:
                    index === currentStage
                      ? 'var(--font-weight-semibold)'
                      : 'var(--font-weight-medium)',
                  color:
                    index === currentStage
                      ? 'var(--color-neutral-900)'
                      : 'var(--color-neutral-500)',
                }}
              >
                {label}
              </span>
              {index < currentStage && (
                <CheckCircle size={12} style={{ color: 'var(--color-success-500)' }} />
              )}
              {index === currentStage && <div style={styles.stageSpinner} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({
  onBack,
  message,
  limitHit,
  used,
  limit,
  tier,
}: {
  onBack: () => void;
  message: string;
  limitHit?: boolean;
  used?: number;
  limit?: number;
  tier?: 'free' | 'pro';
}) {
  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>AI Analysis</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.errorContent}>
        <div style={styles.errorIconWrap}>
          {limitHit ? (
            <Crown size={36} style={{ color: 'var(--color-primary-500)' }} />
          ) : (
            <AlertTriangle size={36} style={{ color: 'var(--color-warning-500)' }} />
          )}
        </div>
        <h2 style={styles.errorTitle}>
          {limitHit ? 'Daily scan limit reached' : "We couldn't finish that scan"}
        </h2>
        <p style={styles.errorMessage}>{message}</p>

        {limitHit && typeof used === 'number' && typeof limit === 'number' && (
          <div style={styles.usagePill}>
            Used {used} / {limit} {tier === 'pro' ? '(Pro safety cap)' : 'free scans today'}
          </div>
        )}

        <div style={styles.errorActions}>
          <button onClick={onBack} style={styles.errorSecondaryBtn}>
            Back to details
          </button>
          {limitHit && tier !== 'pro' && (
            <button onClick={onBack} style={styles.errorPrimaryBtn}>
              <Crown size={16} style={{ color: 'var(--color-neutral-0)' }} />
              <span style={styles.errorPrimaryText}>Upgrade to Pro</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsScreen({
  photoUrl,
  form,
  result,
  meta,
  onDone,
  onBack,
  submitting,
  submitError,
}: {
  photoUrl: string | null;
  form: AnalysisProps['form'];
  result: AiAnalysisResult;
  meta: { cached: boolean; tier: 'free' | 'pro'; used: number; limit: number; remaining: number };
  onDone: () => void;
  onBack: () => void;
  submitting?: boolean;
  submitError?: string;
}) {
  const purchasePrice = form.price ? parseFloat(form.price) : null;
  const { estimated_value: ev } = result;
  const midValue = ev ? (ev.low + ev.high) / 2 : null;
  const profitLow = purchasePrice !== null && ev ? ev.low - purchasePrice : null;
  const profitHigh = purchasePrice !== null && ev ? ev.high - purchasePrice : null;

  const remainingLabel =
    meta.tier === 'pro'
      ? 'Pro · unlimited scans'
      : `${meta.remaining} of ${meta.limit} free scans left today`;

  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>AI Analysis</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.resultsContent}>
        <div style={styles.resultHero}>
          {photoUrl ? (
            <img src={photoUrl} alt={result.title || 'Your find'} style={styles.resultImage} />
          ) : (
            <div
              style={{
                ...styles.resultImage,
                backgroundColor: 'var(--color-neutral-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={48} style={{ color: 'var(--color-primary-300)' }} />
            </div>
          )}
          <div style={styles.resultHeroOverlay}>
            <div style={styles.aiConfidence}>
              <Sparkles size={12} style={{ color: 'var(--color-primary-400)' }} />
              <span style={styles.confidenceText}>
                {Math.round(result.confidence ?? 0)}% confidence
              </span>
            </div>
          </div>
        </div>

        <div style={styles.resultBody}>
          <div style={styles.usageBanner}>
            <Sparkles size={12} style={{ color: 'var(--color-primary-500)' }} />
            <span style={styles.usageBannerText}>
              {meta.cached ? 'Reused recent scan · ' : ''}
              {remainingLabel}
            </span>
          </div>

          <h2 style={styles.resultTitle}>{result.title || form.title || 'Untitled Item'}</h2>

          <div style={styles.resultTags}>
            {result.category && <span style={styles.resultTag}>{result.category}</span>}
            {result.era && <span style={styles.resultTag}>{result.era}</span>}
            {result.brand && <span style={styles.resultTag}>{result.brand}</span>}
            {result.condition_estimate && (
              <span style={styles.resultTag}>{result.condition_estimate}</span>
            )}
          </div>

          {result.summary && <p style={styles.summaryText}>{result.summary}</p>}

          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>Est. Resale</span>
              <span style={styles.metricValueGreen}>
                {ev ? `$${formatMoney(ev.low)} – $${formatMoney(ev.high)}` : '—'}
              </span>
            </div>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>Rarity</span>
              <div style={styles.scoreRow}>
                <div style={styles.scoreBar}>
                  <div
                    style={{
                      ...styles.scoreFill,
                      width: `${Math.min(100, (result.rarity_score ?? 0) * 10)}%`,
                    }}
                  />
                </div>
                <span style={styles.scoreNum}>{(result.rarity_score ?? 0).toFixed(1)}/10</span>
              </div>
            </div>
          </div>

          {result.highlights?.length > 0 && (
            <div style={styles.attributesSection}>
              <h3 style={styles.sectionTitle}>Why it matters</h3>
              <div style={styles.attributesList}>
                {result.highlights.map((h, i) => (
                  <div key={i} style={styles.bulletRow}>
                    <span style={styles.bulletDot} />
                    <span style={styles.bulletText}>{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={styles.attributesSection}>
            <h3 style={styles.sectionTitle}>Item Details</h3>
            <div style={styles.attributesList}>
              <DetailRow label="Identified" value={result.identified ? 'Yes' : 'Uncertain'} />
              {result.brand && <DetailRow label="Brand" value={result.brand} />}
              {result.era && <DetailRow label="Era" value={result.era} />}
              {result.condition_estimate && (
                <DetailRow label="Condition" value={result.condition_estimate} />
              )}
              {form.location && <DetailRow label="Location" value={form.location} />}
              {form.notes && <DetailRow label="Notes" value={form.notes} />}
            </div>
          </div>

          {(profitLow !== null || midValue !== null) && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Profit Estimator</h3>
              <div style={styles.profitCard}>
                {purchasePrice !== null && (
                  <div style={styles.profitRow}>
                    <span style={styles.profitLabel}>Purchase price</span>
                    <span style={styles.profitValue}>-${formatMoney(purchasePrice)}</span>
                  </div>
                )}
                {ev && (
                  <div style={styles.profitRow}>
                    <span style={styles.profitLabel}>Est. resale (mid)</span>
                    <span style={styles.profitValueGreen}>+${formatMoney(midValue!)}</span>
                  </div>
                )}
                {profitLow !== null && profitHigh !== null && (
                  <>
                    <div style={styles.profitDivider} />
                    <div style={styles.profitRow}>
                      <span style={styles.profitLabelBold}>Projected profit</span>
                      <span style={styles.profitTotal}>
                        {profitLow >= 0 ? '+' : ''}${formatMoney(profitLow)} to{' '}
                        {profitHigh >= 0 ? '+' : ''}${formatMoney(profitHigh)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {result.selling_tips?.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Reseller Tips</h3>
              <div style={styles.attributesList}>
                {result.selling_tips.map((t, i) => (
                  <div key={i} style={styles.bulletRow}>
                    <span style={{ ...styles.bulletDot, backgroundColor: 'var(--color-success-500)' }} />
                    <span style={styles.bulletText}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.watch_outs?.length > 0 && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Watch-outs</h3>
              <div style={styles.attributesList}>
                {result.watch_outs.map((w, i) => (
                  <div key={i} style={styles.bulletRow}>
                    <AlertTriangle
                      size={12}
                      style={{ color: 'var(--color-warning-500)', flexShrink: 0, marginTop: 3 }}
                    />
                    <span style={styles.bulletText}>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Actions</h3>
            <div style={styles.actionsGrid}>
              <button style={styles.actionBtn}>
                <Zap size={16} style={{ color: 'var(--color-primary-600)' }} />
                <span style={styles.actionLabel}>Post to Flash Finds</span>
              </button>
              <button style={styles.actionBtn}>
                <Eye size={16} style={{ color: 'var(--color-secondary-600)' }} />
                <span style={styles.actionLabel}>Share to Rare Radar</span>
              </button>
              <button style={styles.actionBtn}>
                <Send size={16} style={{ color: 'var(--color-accent-600)' }} />
                <span style={styles.actionLabel}>Send to Scouts</span>
              </button>
              <button style={styles.actionBtn}>
                <Bookmark size={16} style={{ color: 'var(--color-success-600)' }} />
                <span style={styles.actionLabel}>Save Analysis</span>
              </button>
              <button style={styles.actionBtn}>
                <BarChart3 size={16} style={{ color: 'var(--color-warning-600)' }} />
                <span style={styles.actionLabel}>Watch Trends</span>
              </button>
              <button style={styles.actionBtn}>
                <Share2 size={16} style={{ color: 'var(--color-neutral-600)' }} />
                <span style={styles.actionLabel}>Share</span>
              </button>
            </div>
          </div>

          {submitError && <p style={styles.errorText}>{submitError}</p>}

          <button
            onClick={onDone}
            disabled={submitting}
            style={{ ...styles.primaryBtn, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? (
              <Loader
                size={18}
                style={{
                  color: 'var(--color-neutral-0)',
                  animation: 'spin 1s linear infinite',
                }}
              />
            ) : (
              <CheckCircle size={18} style={{ color: 'var(--color-neutral-0)' }} />
            )}
            <span style={styles.primaryBtnText}>
              {submitting ? 'Posting…' : 'Post This Find'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.attrRow}>
      <span style={styles.attrLabel}>{label}</span>
      <span style={styles.attrValue}>{value}</span>
    </div>
  );
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const styles: Record<string, React.CSSProperties> = {
  // Loading
  loadingContainer: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--color-neutral-0)',
    padding: 'var(--space-6)',
  },
  loadingContent: {
    width: '100%',
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  loadingImageWrap: {
    position: 'relative',
    width: '120px',
    height: '120px',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    marginBottom: 'var(--space-5)',
    boxShadow: 'var(--shadow-lg)',
  },
  loadingImage: { width: '100%', height: '100%', objectFit: 'cover' },
  scanOverlay: { position: 'absolute', inset: 0, overflow: 'hidden' },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '2px',
    background: 'linear-gradient(90deg, transparent, var(--color-primary-400), transparent)',
    boxShadow: '0 0 8px var(--color-primary-400)',
  },
  loadingInfo: { textAlign: 'center', marginBottom: 'var(--space-5)' },
  sparkleIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 'var(--space-2)',
    animation: 'pulse 2s infinite',
  },
  loadingTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-1)',
  },
  loadingSubtitle: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)' },
  progressSection: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-5)',
  },
  progressBar: {
    flex: 1,
    height: '6px',
    backgroundColor: 'var(--color-neutral-100)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-600))',
    borderRadius: 'var(--radius-full)',
    transition: 'width 0.4s ease',
  },
  progressPercent: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-600)',
    minWidth: '36px',
    textAlign: 'right',
  },
  stagesList: { width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  stageItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    transition: 'opacity 0.3s ease',
  },
  stageDot: {
    width: '8px',
    height: '8px',
    borderRadius: 'var(--radius-full)',
    flexShrink: 0,
    transition: 'background-color 0.3s ease',
  },
  stageLabel: { fontSize: 'var(--font-size-sm)', flex: 1, transition: 'all 0.3s ease' },
  stageSpinner: {
    width: '12px',
    height: '12px',
    borderRadius: 'var(--radius-full)',
    border: '2px solid var(--color-neutral-200)',
    borderTopColor: 'var(--color-primary-500)',
    animation: 'spin 0.8s linear infinite',
  },

  // Error
  errorContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-6)',
    textAlign: 'center',
  },
  errorIconWrap: {
    width: '64px',
    height: '64px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-neutral-100)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-4)',
  },
  errorTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-2)',
  },
  errorMessage: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: 'var(--line-height-snug)',
    maxWidth: '320px',
    marginBottom: 'var(--space-4)',
  },
  usagePill: {
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    marginBottom: 'var(--space-5)',
  },
  errorActions: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%', maxWidth: '320px' },
  errorSecondaryBtn: {
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    cursor: 'pointer',
  },
  errorPrimaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-500)',
    border: 'none',
    cursor: 'pointer',
  },
  errorPrimaryText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
  },

  // Results
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
  resultHeroOverlay: { position: 'absolute', bottom: 'var(--space-3)', right: 'var(--space-3)' },
  aiConfidence: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: 'var(--space-1) var(--space-3)',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 'var(--radius-full)',
    backdropFilter: 'blur(4px)',
  },
  confidenceText: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-0)',
  },
  resultBody: { padding: 'var(--space-4)' },
  usageBanner: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    backgroundColor: 'var(--color-primary-50)',
    borderRadius: 'var(--radius-full)',
    marginBottom: 'var(--space-3)',
  },
  usageBannerText: {
    fontSize: '11px',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-primary-700)',
  },
  resultTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    lineHeight: 'var(--line-height-tight)',
    marginBottom: 'var(--space-2)',
  },
  resultTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },
  resultTag: {
    padding: '2px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-700)',
  },
  summaryText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-700)',
    lineHeight: 'var(--line-height-snug)',
    marginBottom: 'var(--space-4)',
  },

  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-5)',
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
  scoreRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  scoreBar: {
    flex: 1,
    height: '6px',
    backgroundColor: 'var(--color-neutral-200)',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    backgroundColor: 'var(--color-primary-500)',
    borderRadius: 'var(--radius-full)',
  },
  scoreNum: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-700)',
  },

  attributesSection: { marginBottom: 'var(--space-5)' },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    marginBottom: 'var(--space-3)',
  },
  attributesList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  attrRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-sm)',
  },
  attrLabel: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  attrValue: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    textAlign: 'right',
    maxWidth: '60%',
  },

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

  section: { marginBottom: 'var(--space-5)' },

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

  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--space-2)',
  },
  actionBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
  },
  actionLabel: {
    fontSize: '10px',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
    textAlign: 'center',
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
    cursor: 'pointer',
    marginTop: 'var(--space-2)',
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
