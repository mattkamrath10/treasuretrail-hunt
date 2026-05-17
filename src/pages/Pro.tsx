import { useState } from 'react';
import { ArrowLeft, Zap, Shield, Crown, Star, Eye, TrendingUp, Users, ChevronRight, Check, X, Lock, ChartBar as BarChart3 } from 'lucide-react';
import { TreasureChestLogo } from '../components/TreasureChestLogo';

type ProView = 'landing' | 'compare' | 'upgrade' | 'success' | 'dashboard' | 'locked';
type BillingCycle = 'monthly' | 'yearly';
type Tier = 'free' | 'premium';

interface Feature {
  label: string;
  free: string | boolean;
  premium: string | boolean;
}

const features: Feature[] = [
  { label: 'AI Scans', free: '3/day', premium: 'Unlimited' },
  { label: 'Flash Finds', free: true, premium: true },
  { label: 'Valuation Tools', free: 'Basic', premium: 'Advanced + Forecast' },
  { label: 'Alert Speed', free: 'Standard', premium: 'Priority' },
  { label: 'Scout Matching', free: 'Basic', premium: 'Priority' },
  { label: 'Marketplace Analytics', free: false, premium: true },
  { label: 'Trend Forecasting', free: false, premium: true },
  { label: 'Rarity Alerts', free: false, premium: true },
  { label: 'Auction Sniper Alerts', free: false, premium: true },
  { label: 'Listing Boosts', free: false, premium: '3/month' },
  { label: 'Profile Prestige', free: false, premium: 'Premium Badge' },
  { label: 'Investment AI', free: false, premium: true },
  { label: 'Early Feature Access', free: false, premium: true },
];

const showcaseFeatures = [
  { title: 'AI Rarity Forecasting', desc: 'Predict which items will spike in value before the market catches on', icon: TrendingUp, color: 'var(--color-primary-500)' },
  { title: 'Hidden Value Detection', desc: 'AI scans photos to identify underpriced treasures others miss', icon: Eye, color: 'var(--color-secondary-500)' },
  { title: 'Profit Prediction Engine', desc: 'Calculate flip potential with AI-powered resale estimates', icon: BarChart3, color: 'var(--color-success-500)' },
  { title: 'Live Market Trend Radar', desc: 'Real-time trending categories and demand heatmaps', icon: Zap, color: 'var(--color-accent-500)' },
  { title: 'Auction Sniper Alerts', desc: 'Get notified of undervalued auctions ending soon', icon: Crown, color: 'var(--color-error-500)' },
  { title: 'Elite Scout Matching', desc: 'Priority access to top-rated scouts in your area', icon: Users, color: 'var(--color-primary-600)' },
  { title: 'Heatmap Intelligence', desc: 'See treasure density and scout activity in real-time', icon: Star, color: 'var(--color-warning-500)' },
  { title: 'Luxury Collector Network', desc: 'Exclusive marketplace for high-value verified items', icon: Shield, color: 'var(--color-secondary-600)' },
];

export default function Pro({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<ProView>('landing');

  if (view === 'landing') return <ProLanding onBack={onBack} onCompare={() => setView('compare')} onUpgrade={() => setView('upgrade')} onDashboard={() => setView('dashboard')} onLocked={() => setView('locked')} />;
  if (view === 'compare') return <CompareScreen onBack={() => setView('landing')} onUpgrade={() => setView('upgrade')} />;
  if (view === 'upgrade') return <UpgradeFlow onBack={() => setView('landing')} onSuccess={() => setView('success')} />;
  if (view === 'success') return <SuccessScreen onDone={() => setView('dashboard')} />;
  if (view === 'dashboard') return <ProDashboard onBack={onBack} />;
  if (view === 'locked') return <LockedFeature onBack={() => setView('landing')} onUpgrade={() => setView('upgrade')} />;

  return <ProLanding onBack={onBack} onCompare={() => setView('compare')} onUpgrade={() => setView('upgrade')} onDashboard={() => setView('dashboard')} onLocked={() => setView('locked')} />;
}

function ProLanding({ onBack, onCompare, onUpgrade, onDashboard, onLocked }: {
  onBack: () => void;
  onCompare: () => void;
  onUpgrade: () => void;
  onDashboard: () => void;
  onLocked: () => void;
}) {
  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>TreasureTrail Pro</span>
        <button onClick={onDashboard} style={s.dashLink}>
          <BarChart3 size={16} style={{ color: 'var(--color-primary-600)' }} />
        </button>
      </header>

      <div style={s.scrollContent}>
        {/* Hero */}
        <div style={s.hero}>
          <div style={s.heroChest}>
            <TreasureChestLogo size={64} glow />
          </div>
          <h1 style={s.heroTitle}>Unlock the Full<br />Treasure Hunt</h1>
          <p style={s.heroSub}>Advanced AI tools, early alerts, premium scouting, and elite collector status</p>
        </div>

        {/* Tier cards */}
        <div style={s.tiersSection}>
          <TierCard
            tier="free"
            title="Free"
            price="$0"
            description="Get started hunting"
            features={['Basic Flash Finds', 'Limited AI scans (3/day)', 'Basic alerts', 'Community access', 'Scout matching (basic)']}
            isCurrent
          />
          <TierCard
            tier="premium"
            title="Premium Membership"
            price="$9.99"
            period="/mo"
            description="The full treasure hunting experience"
            features={['Unlimited AI scans', 'Advanced valuation + forecast', 'Priority auction alerts', 'Priority scout matching', 'Trend forecasting', 'Marketplace analytics', 'Investment AI', 'Premium badge']}
            highlighted
            onSelect={onUpgrade}
          />
        </div>

        {/* Compare link */}
        <button onClick={onCompare} style={s.compareLink}>
          <span style={s.compareLinkText}>Compare all features</span>
          <ChevronRight size={14} style={{ color: 'var(--color-primary-600)' }} />
        </button>

        {/* Feature showcase */}
        <div style={s.showcaseSection}>
          <h2 style={s.sectionTitle}>Premium Features</h2>
          <div style={s.showcaseGrid}>
            {showcaseFeatures.map((f) => {
              const Icon = f.icon;
              return (
                <button key={f.title} onClick={onLocked} style={s.showcaseCard}>
                  <div style={{ ...s.showcaseIcon, backgroundColor: `${f.color}15` }}>
                    <Icon size={18} style={{ color: f.color }} />
                  </div>
                  <span style={s.showcaseTitle}>{f.title}</span>
                  <span style={s.showcaseDesc}>{f.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <button onClick={onUpgrade} style={s.ctaBtn}>
          <Crown size={18} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={s.ctaBtnText}>Upgrade to Premium</span>
        </button>
      </div>
    </div>
  );
}

function TierCard({ title, price, period, description, features: featureList, highlighted, isCurrent, onSelect }: {
  tier?: Tier;
  title: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  isCurrent?: boolean;
  onSelect?: () => void;
}) {
  return (
    <div style={{
      ...s.tierCard,
      ...(highlighted ? s.tierCardHighlighted : {}),
    }}>
      {highlighted && <span style={s.tierBadge}>Best Value</span>}
      <div style={s.tierHeader}>
        <span style={{ ...s.tierTitle, ...(highlighted ? { color: 'var(--color-primary-700)' } : {}) }}>{title}</span>
        <div style={s.tierPriceRow}>
          <span style={s.tierPrice}>{price}</span>
          {period && <span style={s.tierPeriod}>{period}</span>}
        </div>
        <span style={s.tierDesc}>{description}</span>
      </div>
      <div style={s.tierFeatures}>
        {featureList.map((f) => (
          <div key={f} style={s.tierFeatureRow}>
            <Check size={12} style={{ color: highlighted ? 'var(--color-primary-500)' : 'var(--color-success-500)' }} />
            <span style={s.tierFeatureText}>{f}</span>
          </div>
        ))}
      </div>
      {isCurrent ? (
        <div style={s.currentPlan}><span style={s.currentPlanText}>Current Plan</span></div>
      ) : (
        <button onClick={onSelect} style={{ ...s.tierBtn, ...(highlighted ? s.tierBtnHighlighted : {}) }}>
          <span style={{ ...s.tierBtnText, ...(highlighted ? { color: 'var(--color-neutral-0)' } : {}) }}>
            Get Premium
          </span>
        </button>
      )}
    </div>
  );
}

function CompareScreen({ onBack, onUpgrade }: { onBack: () => void; onUpgrade: () => void }) {
  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>Free vs Premium</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.scrollContent}>
        {/* Table header */}
        <div style={s.compareHeaderRow}>
          <span style={s.compareFeatureLabel}>Feature</span>
          <span style={s.compareColLabel}>Free</span>
          <span style={{ ...s.compareColLabel, color: 'var(--color-primary-600)' }}>Premium</span>
        </div>

        {/* Rows */}
        {features.map((f, i) => (
          <div key={f.label} style={{ ...s.compareRow, backgroundColor: i % 2 === 0 ? 'var(--color-neutral-50)' : 'transparent' }}>
            <span style={s.compareFeature}>{f.label}</span>
            <CompareCell value={f.free} />
            <CompareCell value={f.premium} highlight />
          </div>
        ))}

        <button onClick={onUpgrade} style={{ ...s.ctaBtn, marginTop: 'var(--space-4)' }}>
          <Crown size={18} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={s.ctaBtnText}>Get Premium — $9.99/mo</span>
        </button>
      </div>
    </div>
  );
}

function CompareCell({ value, highlight }: { value: string | boolean; highlight?: boolean }) {
  if (typeof value === 'boolean') {
    return (
      <div style={s.compareCell}>
        {value ? (
          <Check size={12} style={{ color: highlight ? 'var(--color-primary-500)' : 'var(--color-success-500)' }} />
        ) : (
          <X size={12} style={{ color: 'var(--color-neutral-300)' }} />
        )}
      </div>
    );
  }
  return (
    <div style={s.compareCell}>
      <span style={{ ...s.compareCellText, ...(highlight ? { color: 'var(--color-primary-700)', fontWeight: 'var(--font-weight-semibold)' } : {}) }}>
        {value}
      </span>
    </div>
  );
}

function UpgradeFlow({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const [billing, setBilling] = useState<BillingCycle>('monthly');

  const price = billing === 'monthly' ? '$9.99' : '$7.99';
  const annualTotal = '$95.88';

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>Get Premium</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.scrollContent}>
        {/* Plan card */}
        <div style={{ ...s.planCard, ...s.planCardActive, marginBottom: 'var(--space-4)' }}>
          <div style={s.planCardHeader}>
            <Crown size={18} style={{ color: 'var(--color-primary-500)' }} />
            <span style={s.planCardTitle}>Premium Membership</span>
          </div>
          <span style={s.planCardPrice}>{price}<span style={s.planCardPeriod}>/mo</span></span>
          <span style={s.planCardDesc}>Unlimited AI, priority scouts, marketplace intelligence</span>
        </div>

        {/* Billing toggle */}
        <div style={s.billingToggle}>
          <button
            onClick={() => setBilling('monthly')}
            style={{ ...s.billingBtn, ...(billing === 'monthly' ? s.billingBtnActive : {}) }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('yearly')}
            style={{ ...s.billingBtn, ...(billing === 'yearly' ? s.billingBtnActive : {}) }}
          >
            Yearly
            <span style={s.saveBadge}>Save 20%</span>
          </button>
        </div>

        {/* Billing summary */}
        <div style={s.billingSummary}>
          <h3 style={s.billingSummaryTitle}>Billing Summary</h3>
          <div style={s.billingRow}>
            <span style={s.billingLabel}>Premium Membership ({billing})</span>
            <span style={s.billingVal}>{price}/mo</span>
          </div>
          {billing === 'yearly' && (
            <div style={s.billingRow}>
              <span style={s.billingLabel}>Billed annually</span>
              <span style={s.billingVal}>{annualTotal}/yr</span>
            </div>
          )}
          <div style={s.billingDivider} />
          <div style={s.billingRow}>
            <span style={s.billingLabelBold}>Total today</span>
            <span style={s.billingValBold}>{billing === 'yearly' ? annualTotal : price}</span>
          </div>
        </div>

        {/* Protection */}
        <div style={s.guaranteeCard}>
          <Shield size={16} style={{ color: 'var(--color-secondary-500)' }} />
          <div style={s.guaranteeInfo}>
            <span style={s.guaranteeTitle}>7-Day Free Trial</span>
            <span style={s.guaranteeDesc}>Cancel anytime. No charge until trial ends.</span>
          </div>
        </div>

        <button onClick={onSuccess} style={s.ctaBtn}>
          <span style={s.ctaBtnText}>Start Free Trial</span>
        </button>
      </div>
    </div>
  );
}

function SuccessScreen({ onDone }: { onDone: () => void }) {
  return (
    <div style={s.container}>
      <div style={s.successContent}>
        <div style={s.successChest}>
          <TreasureChestLogo size={80} glow />
        </div>
        <h1 style={s.successTitle}>Welcome to Premium!</h1>
        <p style={s.successDesc}>You've unlocked the full treasure hunting experience. Unlimited AI tools, priority alerts, and premium scout matching are now active.</p>

        <div style={s.successFeatures}>
          <div style={s.successFeatureRow}>
            <Check size={14} style={{ color: 'var(--color-success-500)' }} />
            <span style={s.successFeatureText}>Unlimited AI scans activated</span>
          </div>
          <div style={s.successFeatureRow}>
            <Check size={14} style={{ color: 'var(--color-success-500)' }} />
            <span style={s.successFeatureText}>Priority scout matching enabled</span>
          </div>
          <div style={s.successFeatureRow}>
            <Check size={14} style={{ color: 'var(--color-success-500)' }} />
            <span style={s.successFeatureText}>Advanced valuation tools unlocked</span>
          </div>
          <div style={s.successFeatureRow}>
            <Check size={14} style={{ color: 'var(--color-success-500)' }} />
            <span style={s.successFeatureText}>Pro badge added to profile</span>
          </div>
        </div>

        <button onClick={onDone} style={s.ctaBtn}>
          <span style={s.ctaBtnText}>Explore Pro Features</span>
        </button>
      </div>
    </div>
  );
}

function ProDashboard({ onBack }: { onBack: () => void }) {
  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>Pro Dashboard</span>
        <div style={s.proBadge}><Crown size={10} style={{ color: 'var(--color-primary-700)' }} /><span style={s.proBadgeText}>Pro</span></div>
      </header>

      <div style={s.scrollContent}>
        {/* AI Insights */}
        <div style={s.dashSection}>
          <h3 style={s.dashSectionTitle}>AI Insights</h3>
          <div style={s.insightsGrid}>
            <div style={s.insightCard}>
              <TrendingUp size={16} style={{ color: 'var(--color-success-500)' }} />
              <span style={s.insightVal}>+23%</span>
              <span style={s.insightLabel}>Vintage watch demand this week</span>
            </div>
            <div style={s.insightCard}>
              <Eye size={16} style={{ color: 'var(--color-primary-500)' }} />
              <span style={s.insightVal}>$4,200</span>
              <span style={s.insightLabel}>Hidden value detected in watchlist</span>
            </div>
            <div style={s.insightCard}>
              <Zap size={16} style={{ color: 'var(--color-accent-500)' }} />
              <span style={s.insightVal}>3</span>
              <span style={s.insightLabel}>Underpriced auctions found</span>
            </div>
            <div style={s.insightCard}>
              <BarChart3 size={16} style={{ color: 'var(--color-secondary-500)' }} />
              <span style={s.insightVal}>87%</span>
              <span style={s.insightLabel}>Flip success rate (30d)</span>
            </div>
          </div>
        </div>

        {/* Rarity Watchlist */}
        <div style={s.dashSection}>
          <h3 style={s.dashSectionTitle}>Rarity Watchlist</h3>
          <div style={s.watchlist}>
            {[
              { item: 'Rolex Submariner 5513', change: '+12%', direction: 'up' },
              { item: 'Eames Lounge Chair 670', change: '+8%', direction: 'up' },
              { item: 'Nakamichi Dragon', change: '-3%', direction: 'down' },
              { item: 'Hermes Kelly 28', change: '+18%', direction: 'up' },
            ].map((w) => (
              <div key={w.item} style={s.watchlistRow}>
                <span style={s.watchlistItem}>{w.item}</span>
                <span style={{ ...s.watchlistChange, color: w.direction === 'up' ? 'var(--color-success-600)' : 'var(--color-error-500)' }}>{w.change}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Market Trends */}
        <div style={s.dashSection}>
          <h3 style={s.dashSectionTitle}>Market Trends</h3>
          <div style={s.trendChart}>
            <div style={s.trendBars}>
              {[45, 60, 38, 72, 55, 85, 68, 90, 75, 82].map((h, i) => (
                <div key={i} style={{ ...s.trendBar, height: `${h}%`, backgroundColor: i >= 7 ? 'var(--color-primary-500)' : 'var(--color-primary-200)' }} />
              ))}
            </div>
            <div style={s.trendLabel}>
              <span style={s.trendLabelText}>Last 10 weeks - Collectibles market activity</span>
            </div>
          </div>
        </div>

        {/* Premium Alerts */}
        <div style={s.dashSection}>
          <h3 style={s.dashSectionTitle}>Priority Alerts</h3>
          <div style={s.alertsList}>
            <div style={s.alertCard}>
              <div style={{ ...s.alertIcon, backgroundColor: 'var(--color-error-50)' }}>
                <Zap size={12} style={{ color: 'var(--color-error-500)' }} />
              </div>
              <div style={s.alertInfo}>
                <span style={s.alertTitle}>Auction Sniper: Omega Speedmaster</span>
                <span style={s.alertDesc}>Undervalued by 40% - Ends in 2h</span>
              </div>
            </div>
            <div style={s.alertCard}>
              <div style={{ ...s.alertIcon, backgroundColor: 'var(--color-primary-50)' }}>
                <TrendingUp size={12} style={{ color: 'var(--color-primary-600)' }} />
              </div>
              <div style={s.alertInfo}>
                <span style={s.alertTitle}>Trend Alert: Mid-Century Lighting</span>
                <span style={s.alertDesc}>Demand up 340% in your area</span>
              </div>
            </div>
            <div style={s.alertCard}>
              <div style={{ ...s.alertIcon, backgroundColor: 'var(--color-secondary-50)' }}>
                <Users size={12} style={{ color: 'var(--color-secondary-600)' }} />
              </div>
              <div style={s.alertInfo}>
                <span style={s.alertTitle}>Elite Scout Available</span>
                <span style={s.alertDesc}>@vintage_eye - Furniture specialist near you</span>
              </div>
            </div>
          </div>
        </div>

        {/* Performance */}
        <div style={s.dashSection}>
          <h3 style={s.dashSectionTitle}>Your Performance</h3>
          <div style={s.perfGrid}>
            <div style={s.perfCard}>
              <span style={s.perfVal}>$8,420</span>
              <span style={s.perfLabel}>Total savings from AI pricing</span>
            </div>
            <div style={s.perfCard}>
              <span style={s.perfVal}>47</span>
              <span style={s.perfLabel}>Items found with Pro tools</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LockedFeature({ onBack, onUpgrade }: { onBack: () => void; onUpgrade: () => void }) {
  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn}><ArrowLeft size={20} /></button>
        <span style={s.headerTitle}>Premium Feature</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.lockedContent}>
        {/* Blurred preview */}
        <div style={s.blurredPreview}>
          <div style={s.blurOverlay} />
          <div style={s.fakeChart}>
            <div style={s.fakeBar} />
            <div style={{ ...s.fakeBar, height: '60%' }} />
            <div style={{ ...s.fakeBar, height: '80%' }} />
            <div style={{ ...s.fakeBar, height: '45%' }} />
            <div style={{ ...s.fakeBar, height: '90%' }} />
          </div>
          <div style={s.fakeData}>
            <div style={s.fakeLine} />
            <div style={{ ...s.fakeLine, width: '70%' }} />
            <div style={{ ...s.fakeLine, width: '85%' }} />
          </div>
        </div>

        {/* Lock icon */}
        <div style={s.lockIcon}>
          <Lock size={24} style={{ color: 'var(--color-primary-600)' }} />
        </div>

        <h2 style={s.lockedTitle}>AI Investment Forecasting</h2>
        <p style={s.lockedDesc}>
          This premium feature uses advanced AI to predict market movements, identify undervalued items, and forecast investment potential.
        </p>

        <div style={s.lockedFeatures}>
          <div style={s.lockedFeatureRow}>
            <TrendingUp size={14} style={{ color: 'var(--color-primary-500)' }} />
            <span style={s.lockedFeatureText}>Predict value trends 30 days ahead</span>
          </div>
          <div style={s.lockedFeatureRow}>
            <Eye size={14} style={{ color: 'var(--color-primary-500)' }} />
            <span style={s.lockedFeatureText}>Identify hidden investment opportunities</span>
          </div>
          <div style={s.lockedFeatureRow}>
            <BarChart3 size={14} style={{ color: 'var(--color-primary-500)' }} />
            <span style={s.lockedFeatureText}>Portfolio performance tracking</span>
          </div>
        </div>

        <button onClick={onUpgrade} style={s.ctaBtn}>
          <Lock size={16} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={s.ctaBtnText}>Unlock with Premium</span>
        </button>

        <span style={s.trialText}>Start 7-day free trial</span>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-neutral-0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  backBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-600)' },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  dashLink: { width: '36px', height: '36px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flex: 1, overflow: 'auto', padding: 'var(--space-4)' },

  // Hero
  hero: { textAlign: 'center', padding: 'var(--space-6) 0 var(--space-5)', marginBottom: 'var(--space-4)' },
  heroChest: { display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' },
  heroTitle: { fontSize: '24px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', lineHeight: '1.2', marginBottom: 'var(--space-2)' },
  heroSub: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', lineHeight: 'var(--line-height-normal)' },

  // Tiers
  tiersSection: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' },
  tierCard: { padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-neutral-200)', position: 'relative' },
  tierCardHighlighted: { border: '2px solid var(--color-primary-400)', backgroundColor: 'var(--color-primary-50)' },
  tierCardElite: { border: '2px solid var(--color-secondary-400)', background: 'linear-gradient(135deg, var(--color-secondary-50), var(--color-neutral-0))' },
  tierBadge: { position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', padding: '2px 10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-500)', color: 'var(--color-neutral-0)', fontSize: '10px', fontWeight: 'var(--font-weight-bold)', whiteSpace: 'nowrap' },
  tierBadgeElite: { position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', padding: '2px 10px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-secondary-500)', color: 'var(--color-neutral-0)', fontSize: '10px', fontWeight: 'var(--font-weight-bold)', whiteSpace: 'nowrap' },
  tierHeader: { marginBottom: 'var(--space-3)' },
  tierTitle: { display: 'block', fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: '2px' },
  tierPriceRow: { display: 'flex', alignItems: 'baseline', gap: '2px', marginBottom: '4px' },
  tierPrice: { fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  tierPeriod: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  tierDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },
  tierFeatures: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: 'var(--space-3)' },
  tierFeatureRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  tierFeatureText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-700)' },
  tierBtn: { width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-300)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tierBtnHighlighted: { background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', border: 'none' },
  tierBtnText: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)' },
  currentPlan: { width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  currentPlanText: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-500)' },

  // Compare link
  compareLink: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)', padding: 'var(--space-3)', marginBottom: 'var(--space-5)' },
  compareLinkText: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-600)' },

  // Showcase
  showcaseSection: { marginBottom: 'var(--space-5)' },
  sectionTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: 'var(--space-3)' },
  showcaseGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' },
  showcaseCard: { padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', textAlign: 'left' },
  showcaseIcon: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-2)' },
  showcaseTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)', marginBottom: '2px' },
  showcaseDesc: { fontSize: '10px', color: 'var(--color-neutral-500)', lineHeight: '1.4' },

  // CTA
  ctaBtn: { width: '100%', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)' },
  ctaBtnText: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-0)' },

  // Compare screen
  compareHeaderRow: { display: 'flex', alignItems: 'center', padding: 'var(--space-3)', borderBottom: '2px solid var(--color-neutral-200)', marginBottom: 'var(--space-1)' },
  compareFeatureLabel: { flex: 2, fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)' },
  compareColLabel: { flex: 1, fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-600)', textAlign: 'center' },
  compareRow: { display: 'flex', alignItems: 'center', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)' },
  compareFeature: { flex: 2, fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-700)' },
  compareCell: { flex: 1, display: 'flex', justifyContent: 'center' },
  compareCellText: { fontSize: '10px', color: 'var(--color-neutral-600)', textAlign: 'center' },

  // Upgrade flow
  billingToggle: { display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-1)', backgroundColor: 'var(--color-neutral-100)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' },
  billingBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-600)' },
  billingBtnActive: { backgroundColor: 'var(--color-neutral-0)', color: 'var(--color-neutral-900)', boxShadow: 'var(--shadow-sm)', fontWeight: 'var(--font-weight-semibold)' },
  saveBadge: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success-700)', backgroundColor: 'var(--color-success-50)', padding: '1px 5px', borderRadius: 'var(--radius-full)' },
  planCards: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' },
  planCard: { padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '2px solid var(--color-neutral-200)', textAlign: 'left' },
  planCardActive: { borderColor: 'var(--color-primary-400)', backgroundColor: 'var(--color-primary-50)' },
  planCardActiveElite: { borderColor: 'var(--color-secondary-400)', backgroundColor: 'var(--color-secondary-50)' },
  planCardHeader: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' },
  planCardTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  planCardPrice: { display: 'block', fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: '2px' },
  planCardPeriod: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-500)' },
  planCardDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },

  // Billing summary
  billingSummary: { padding: 'var(--space-4)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' },
  billingSummaryTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)', marginBottom: 'var(--space-3)' },
  billingRow: { display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0' },
  billingLabel: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-600)' },
  billingVal: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-800)' },
  billingDivider: { height: '1px', backgroundColor: 'var(--color-neutral-200)', margin: 'var(--space-2) 0' },
  billingLabelBold: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  billingValBold: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },

  // Guarantee
  guaranteeCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', backgroundColor: 'var(--color-secondary-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-secondary-100)', marginBottom: 'var(--space-4)' },
  guaranteeInfo: { flex: 1 },
  guaranteeTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-secondary-700)' },
  guaranteeDesc: { fontSize: '10px', color: 'var(--color-secondary-600)' },

  // Success
  successContent: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' },
  successChest: { marginBottom: 'var(--space-5)' },
  successTitle: { fontSize: '24px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: 'var(--space-2)' },
  successDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', textAlign: 'center', lineHeight: 'var(--line-height-normal)', marginBottom: 'var(--space-5)' },
  successFeatures: { width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' },
  successFeatureRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  successFeatureText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)' },

  // Pro badge
  proBadge: { display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)' },
  proBadgeText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-700)' },

  // Dashboard
  dashSection: { marginBottom: 'var(--space-5)' },
  dashSectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)', marginBottom: 'var(--space-3)' },
  insightsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' },
  insightCard: { padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-100)' },
  insightVal: { display: 'block', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', margin: 'var(--space-1) 0' },
  insightLabel: { fontSize: '10px', color: 'var(--color-neutral-500)', lineHeight: '1.3' },

  // Watchlist
  watchlist: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  watchlistRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  watchlistItem: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-800)' },
  watchlistChange: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' },

  // Trend chart
  trendChart: { padding: 'var(--space-4)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' },
  trendBars: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '80px', gap: '4px', marginBottom: 'var(--space-2)' },
  trendBar: { flex: 1, borderRadius: 'var(--radius-sm)', minHeight: '4px' },
  trendLabel: {},
  trendLabelText: { fontSize: '10px', color: 'var(--color-neutral-400)' },

  // Alerts
  alertsList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  alertCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)' },
  alertIcon: { width: '32px', height: '32px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  alertInfo: { flex: 1 },
  alertTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  alertDesc: { fontSize: '10px', color: 'var(--color-neutral-500)' },

  // Performance
  perfGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' },
  perfCard: { padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-accent-50))', border: '1px solid var(--color-primary-200)', textAlign: 'center' },
  perfVal: { display: 'block', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  perfLabel: { fontSize: '10px', color: 'var(--color-neutral-600)' },

  // Locked feature
  lockedContent: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-4)', overflow: 'auto' },
  blurredPreview: { width: '100%', height: '200px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-50)', position: 'relative', overflow: 'hidden', marginBottom: 'var(--space-4)' },
  blurOverlay: { position: 'absolute', inset: 0, backdropFilter: 'blur(4px)', backgroundColor: 'rgba(255,255,255,0.6)', zIndex: 2 },
  fakeChart: { position: 'absolute', bottom: '20px', left: '20px', right: '20px', height: '100px', display: 'flex', alignItems: 'flex-end', gap: '8px' },
  fakeBar: { flex: 1, height: '70%', backgroundColor: 'var(--color-primary-200)', borderRadius: 'var(--radius-sm)' },
  fakeData: { position: 'absolute', top: '20px', left: '20px', display: 'flex', flexDirection: 'column', gap: '6px' },
  fakeLine: { width: '100px', height: '8px', backgroundColor: 'var(--color-neutral-200)', borderRadius: 'var(--radius-full)' },
  lockIcon: { width: '56px', height: '56px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-50)', border: '2px solid var(--color-primary-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-4)', marginTop: '-28px', zIndex: 3, position: 'relative' },
  lockedTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', textAlign: 'center', marginBottom: 'var(--space-2)' },
  lockedDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', textAlign: 'center', lineHeight: 'var(--line-height-normal)', marginBottom: 'var(--space-4)' },
  lockedFeatures: { width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' },
  lockedFeatureRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  lockedFeatureText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)' },
  trialText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)', marginTop: 'var(--space-3)' },
};
