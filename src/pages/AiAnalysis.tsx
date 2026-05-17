import { useState, useEffect } from 'react';
import { ArrowLeft, Sparkles, ChartBar as BarChart3, Share2, Bookmark, Send, Eye, Zap, CircleCheck as CheckCircle } from 'lucide-react';

type AnalysisView = 'loading' | 'results';

interface AnalysisProps {
  form: { title: string; category: string; notes: string; price: string; location: string };
  onDone: () => void;
  onBack: () => void;
}

const LOADING_STAGES = [
  { label: 'Identifying Item', duration: 800 },
  { label: 'Scanning Marketplace Trends', duration: 700 },
  { label: 'Comparing Similar Finds', duration: 900 },
  { label: 'Estimating Value', duration: 600 },
  { label: 'Detecting Brand & Era', duration: 500 },
  { label: 'Calculating Rarity', duration: 700 },
];



export default function AiAnalysis({ form, onDone, onBack }: AnalysisProps) {
  const [view, setView] = useState<AnalysisView>('loading');

  return view === 'loading'
    ? <LoadingExperience onComplete={() => setView('results')} />
    : <ResultsScreen form={form} onDone={onDone} onBack={onBack} />;
}

function LoadingExperience({ onComplete }: { onComplete: () => void }) {
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const totalDuration = LOADING_STAGES.reduce((sum, s) => sum + s.duration, 0);
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 50;
      setProgress(Math.min((elapsed / totalDuration) * 100, 100));

      let cumulative = 0;
      for (let i = 0; i < LOADING_STAGES.length; i++) {
        cumulative += LOADING_STAGES[i].duration;
        if (elapsed < cumulative) {
          setCurrentStage(i);
          break;
        }
        if (i === LOADING_STAGES.length - 1) {
          setCurrentStage(i);
        }
      }

      if (elapsed >= totalDuration) {
        clearInterval(interval);
        setTimeout(onComplete, 400);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div style={styles.loadingContainer}>
      <div style={styles.loadingContent}>
        <div style={styles.loadingImageWrap}>
          <div style={{ ...styles.loadingImage, backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)' }}>
            <Sparkles size={48} style={{ color: 'var(--color-primary-400)' }} />
          </div>
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
          {LOADING_STAGES.map((stage, index) => (
            <div
              key={stage.label}
              style={{
                ...styles.stageItem,
                opacity: index <= currentStage ? 1 : 0.3,
              }}
            >
              <div
                style={{
                  ...styles.stageDot,
                  backgroundColor: index < currentStage
                    ? 'var(--color-success-500)'
                    : index === currentStage
                    ? 'var(--color-primary-500)'
                    : 'var(--color-neutral-200)',
                }}
              />
              <span
                style={{
                  ...styles.stageLabel,
                  fontWeight: index === currentStage ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
                  color: index === currentStage ? 'var(--color-neutral-900)' : 'var(--color-neutral-500)',
                }}
              >
                {stage.label}
              </span>
              {index < currentStage && (
                <CheckCircle size={12} style={{ color: 'var(--color-success-500)' }} />
              )}
              {index === currentStage && (
                <div style={styles.stageSpinner} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultsScreen({ form, onDone, onBack }: AnalysisProps) {
  const purchasePrice = form.price ? parseFloat(form.price) : null;

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
          <div style={{ ...styles.resultImage, backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={48} style={{ color: 'var(--color-primary-300)' }} />
          </div>
          <div style={styles.resultHeroOverlay}>
            <div style={styles.aiConfidence}>
              <Sparkles size={12} style={{ color: 'var(--color-primary-400)' }} />
              <span style={styles.confidenceText}>94% confidence</span>
            </div>
          </div>
        </div>

        <div style={styles.resultBody}>
          <h2 style={styles.resultTitle}>
            {form.title || 'Untitled Item'}
          </h2>

          {form.category && (
            <div style={styles.resultTags}>
              <span style={styles.resultTag}>{form.category}</span>
            </div>
          )}

          {/* Core metrics */}
          <div style={styles.metricsGrid}>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>Purchase Price</span>
              <span style={styles.metricValue}>{form.price ? `$${form.price}` : '—'}</span>
            </div>
            <div style={styles.metricCard}>
              <span style={styles.metricLabel}>AI Analysis</span>
              <span style={styles.metricValue}>Pending</span>
            </div>
          </div>

          {/* Detail attributes */}
          <div style={styles.attributesSection}>
            <h3 style={styles.sectionTitle}>Item Details</h3>
            <div style={styles.attributesList}>
              {form.category && (
                <div style={styles.attrRow}>
                  <span style={styles.attrLabel}>Category</span>
                  <span style={styles.attrValue}>{form.category}</span>
                </div>
              )}
              {form.location && (
                <div style={styles.attrRow}>
                  <span style={styles.attrLabel}>Location</span>
                  <span style={styles.attrValue}>{form.location}</span>
                </div>
              )}
              {form.notes && (
                <div style={styles.attrRow}>
                  <span style={styles.attrLabel}>Notes</span>
                  <span style={styles.attrValue}>{form.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Marketplace comparison */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Marketplace Comparison</h3>
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.85rem' }}>
              Connect an AI backend to enable live market price comparisons.
            </div>
          </div>

          {/* Profit estimator */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Profit Estimator</h3>
            <div style={styles.profitCard}>
              {purchasePrice !== null && (
                <div style={styles.profitRow}>
                  <span style={styles.profitLabel}>Purchase Price</span>
                  <span style={styles.profitValue}>-${purchasePrice}</span>
                </div>
              )}
              <div style={{ padding: '8px 0', textAlign: 'center', color: 'var(--color-neutral-400)', fontSize: '0.85rem' }}>
                Connect an AI backend to enable profit estimates.
              </div>
            </div>
          </div>

          {/* Actions */}
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

          <button onClick={onDone} style={styles.primaryBtn}>
            <CheckCircle size={18} style={{ color: 'var(--color-neutral-0)' }} />
            <span style={styles.primaryBtnText}>Post This Find</span>
          </button>
        </div>
      </div>
    </div>
  );
}


const styles: Record<string, React.CSSProperties> = {
  // Loading screen
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
  loadingImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  scanOverlay: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '2px',
    background: 'linear-gradient(90deg, transparent, var(--color-primary-400), transparent)',
    boxShadow: '0 0 8px var(--color-primary-400)',
  },
  loadingInfo: {
    textAlign: 'center',
    marginBottom: 'var(--space-5)',
  },
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
  loadingSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
  },
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
    transition: 'width 0.1s linear',
  },
  progressPercent: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-primary-600)',
    minWidth: '36px',
    textAlign: 'right',
  },
  stagesList: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },
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
  stageLabel: {
    fontSize: 'var(--font-size-sm)',
    flex: 1,
    transition: 'all 0.3s ease',
  },
  stageSpinner: {
    width: '12px',
    height: '12px',
    borderRadius: 'var(--radius-full)',
    border: '2px solid var(--color-neutral-200)',
    borderTopColor: 'var(--color-primary-500)',
    animation: 'spin 0.8s linear infinite',
  },

  // Results screen
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
  resultsContent: {
    flex: 1,
    overflow: 'auto',
  },
  resultHero: {
    position: 'relative',
    aspectRatio: '16/9',
    overflow: 'hidden',
  },
  resultImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  resultHeroOverlay: {
    position: 'absolute',
    bottom: 'var(--space-3)',
    right: 'var(--space-3)',
  },
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
  resultBody: {
    padding: 'var(--space-4)',
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
    marginBottom: 'var(--space-4)',
  },
  resultTag: {
    padding: '2px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-100)',
    color: 'var(--color-neutral-600)',
  },

  // Metrics
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
  metricValue: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  metricValueGreen: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-success-600)',
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
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

  // Attributes
  attributesSection: {
    marginBottom: 'var(--space-5)',
  },
  sectionTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    marginBottom: 'var(--space-3)',
  },
  attributesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  attrRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-sm)',
  },
  attrLabel: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  attrValue: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  attrValueTrend: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-success-600)',
  },

  // Sections
  section: {
    marginBottom: 'var(--space-5)',
  },

  // Marketplace
  marketplaceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  mpCard: {
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-100)',
  },
  mpHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  mpDot: {
    width: '8px',
    height: '8px',
    borderRadius: 'var(--radius-full)',
  },
  mpName: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    flex: 1,
  },
  mpBody: {
    display: 'flex',
    gap: 'var(--space-3)',
  },
  mpCol: {
    flex: 1,
  },
  mpLabel: {
    fontSize: '10px',
    color: 'var(--color-neutral-400)',
    display: 'block',
    marginBottom: '1px',
  },
  mpValue: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },

  // Recommendations
  recsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  recCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
  },
  recInfo: {
    flex: 1,
  },
  recLabel: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    display: 'block',
  },
  recDesc: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
  },

  // Profit estimator
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
  profitLabel: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
  },
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

  // Action buttons
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
    lineHeight: '1.3',
  },

  // Primary CTA
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
    marginTop: 'var(--space-4)',
    marginBottom: 'var(--space-4)',
  },
  primaryBtnText: {
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
  },
};
