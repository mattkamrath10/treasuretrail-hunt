import { useState } from 'react';
import { ArrowLeft, Shield, TriangleAlert as AlertTriangle, Flag, CircleCheck as CheckCircle, Clock, Eye, Users, ChevronRight, Star, Lock, MessageCircle, MapPin, Package, Zap } from 'lucide-react';

type SafetyView = 'hub' | 'report' | 'trust' | 'disputes' | 'admin' | 'education';

type ReportStep = 'reason' | 'details' | 'confirm';
type ReportReason = 'scam' | 'fake_listing' | 'fake_scout' | 'harassment' | 'spam' | 'counterfeit' | 'noshow' | 'misleading_ai' | 'suspicious';

interface DisputeCase {
  id: string;
  type: string;
  status: 'open' | 'investigating' | 'resolved';
  title: string;
  date: string;
  resolution?: string;
}

const reportReasons: { id: ReportReason; label: string; icon: typeof Flag }[] = [
  { id: 'scam', label: 'Scam Attempt', icon: AlertTriangle },
  { id: 'fake_listing', label: 'Fake Listing', icon: Package },
  { id: 'fake_scout', label: 'Fake Scout', icon: Users },
  { id: 'harassment', label: 'Harassment', icon: MessageCircle },
  { id: 'spam', label: 'Spam', icon: Flag },
  { id: 'counterfeit', label: 'Counterfeit Item', icon: Shield },
  { id: 'noshow', label: 'No-Show Pickup', icon: MapPin },
  { id: 'misleading_ai', label: 'Misleading AI Valuation', icon: Zap },
  { id: 'suspicious', label: 'Suspicious Behavior', icon: Eye },
];

const disputeCases: DisputeCase[] = [
  { id: 'D-1042', type: 'Item Not Received', status: 'investigating', title: 'Rolex Submariner order #TT-28491', date: 'May 14, 2026' },
  { id: 'D-1038', type: 'Wrong Item Shipped', status: 'resolved', title: 'Danish Teak Credenza', date: 'May 10, 2026', resolution: 'Full refund issued' },
  { id: 'D-1035', type: 'Scout No-Show', status: 'resolved', title: 'Pickup request #SC-892', date: 'May 8, 2026', resolution: 'Scout suspended, credit issued' },
];

const verificationBadges = [
  { id: 'scout', label: 'Verified Scout', desc: 'Complete 10 successful pickups', progress: 100, earned: true },
  { id: 'seller', label: 'Verified Seller', desc: '20+ sales with 4.5+ rating', progress: 100, earned: true },
  { id: 'pickup', label: 'Pickup Verified', desc: 'ID confirmed for local meetups', progress: 75, earned: false },
  { id: 'highvalue', label: 'High-Value Trusted', desc: 'Handle $5k+ items successfully', progress: 60, earned: false },
  { id: 'identity', label: 'Identity Confirmed', desc: 'Government ID verification', progress: 100, earned: true },
  { id: 'shipper', label: 'Trusted Shipper', desc: '50+ items shipped without issues', progress: 88, earned: false },
  { id: 'auction', label: 'Auction Verified', desc: 'Clean auction history for 30 days', progress: 100, earned: true },
];

export default function Safety({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<SafetyView>('hub');

  if (view === 'hub') return <SafetyHub onBack={onBack} onNavigate={setView} />;
  if (view === 'report') return <ReportFlow onBack={() => setView('hub')} />;
  if (view === 'trust') return <TrustCenter onBack={() => setView('hub')} />;
  if (view === 'disputes') return <DisputeCenter onBack={() => setView('hub')} />;
  if (view === 'admin') return <AdminDashboard onBack={() => setView('hub')} />;
  if (view === 'education') return <SafetyEducation onBack={() => setView('hub')} />;
  return <SafetyHub onBack={onBack} onNavigate={setView} />;
}

function SafetyHub({ onBack, onNavigate }: { onBack: () => void; onNavigate: (v: SafetyView) => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Safety Center</span>
        <div style={st.guardianBadge}>
          <Shield size={12} style={{ color: 'var(--color-secondary-700)' }} />
          <span style={st.guardianText}>Guardian</span>
        </div>
      </header>

      <div style={st.scrollContent}>
        {/* Guardian intro */}
        <div style={st.guardianCard}>
          <Shield size={20} style={{ color: 'var(--color-secondary-500)' }} />
          <div style={st.guardianCardInfo}>
            <span style={st.guardianCardTitle}>TreasureTrail Guardian</span>
            <span style={st.guardianCardDesc}>Protecting our community with AI-powered fraud detection and trusted moderation</span>
          </div>
        </div>

        {/* Platform stats */}
        <div style={st.statsGrid}>
          <div style={st.statCard}>
            <span style={st.statVal}>99.2%</span>
            <span style={st.statLbl}>Safe Transactions</span>
          </div>
          <div style={st.statCard}>
            <span style={st.statVal}>&lt;2h</span>
            <span style={st.statLbl}>Dispute Resolution</span>
          </div>
          <div style={st.statCard}>
            <span style={st.statVal}>847</span>
            <span style={st.statLbl}>Scams Prevented</span>
          </div>
          <div style={st.statCard}>
            <span style={st.statVal}>4.9</span>
            <span style={st.statLbl}>Trust Score</span>
          </div>
        </div>

        {/* Quick actions */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Quick Actions</h3>
          <div style={st.actionList}>
            <button onClick={() => onNavigate('report')} style={st.actionRow}>
              <div style={{ ...st.actionIcon, backgroundColor: 'var(--color-error-50)' }}>
                <Flag size={16} style={{ color: 'var(--color-error-500)' }} />
              </div>
              <div style={st.actionInfo}>
                <span style={st.actionLabel}>Report an Issue</span>
                <span style={st.actionDesc}>Flag scams, fake listings, or bad actors</span>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)' }} />
            </button>
            <button onClick={() => onNavigate('trust')} style={st.actionRow}>
              <div style={{ ...st.actionIcon, backgroundColor: 'var(--color-secondary-50)' }}>
                <Shield size={16} style={{ color: 'var(--color-secondary-500)' }} />
              </div>
              <div style={st.actionInfo}>
                <span style={st.actionLabel}>Trust & Verification</span>
                <span style={st.actionDesc}>Get verified and build trust</span>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)' }} />
            </button>
            <button onClick={() => onNavigate('disputes')} style={st.actionRow}>
              <div style={{ ...st.actionIcon, backgroundColor: 'var(--color-warning-50)' }}>
                <Clock size={16} style={{ color: 'var(--color-warning-600)' }} />
              </div>
              <div style={st.actionInfo}>
                <span style={st.actionLabel}>Disputes</span>
                <span style={st.actionDesc}>Track and resolve transaction issues</span>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)' }} />
            </button>
            <button onClick={() => onNavigate('admin')} style={st.actionRow}>
              <div style={{ ...st.actionIcon, backgroundColor: 'var(--color-primary-50)' }}>
                <Eye size={16} style={{ color: 'var(--color-primary-600)' }} />
              </div>
              <div style={st.actionInfo}>
                <span style={st.actionLabel}>Moderation</span>
                <span style={st.actionDesc}>Platform integrity dashboard</span>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)' }} />
            </button>
            <button onClick={() => onNavigate('education')} style={st.actionRow}>
              <div style={{ ...st.actionIcon, backgroundColor: 'var(--color-success-50)' }}>
                <Star size={16} style={{ color: 'var(--color-success-600)' }} />
              </div>
              <div style={st.actionInfo}>
                <span style={st.actionLabel}>Safety Tips</span>
                <span style={st.actionDesc}>Learn how to stay safe on TreasureTrail</span>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)' }} />
            </button>
          </div>
        </div>

        {/* Active warnings */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Active Fraud Alerts</h3>
          <FraudWarning level="high" title="Price significantly below market" desc="Rolex listed at $2,000 - avg market price is $12,000+" />
          <FraudWarning level="medium" title="New seller warning" desc="Account created 2 days ago, high-value listing" />
          <FraudWarning level="low" title="Location mismatch detected" desc="Seller location doesn't match item shipping origin" />
        </div>

        {/* Safety labels */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Marketplace Safety Labels</h3>
          <div style={st.labelsGrid}>
            <SafetyLabel icon={Zap} label="AI Authenticated" color="var(--color-primary-500)" />
            <SafetyLabel icon={Users} label="Scout Verified" color="var(--color-accent-500)" />
            <SafetyLabel icon={MapPin} label="Safe Meetup Zone" color="var(--color-success-500)" />
            <SafetyLabel icon={Shield} label="Verified Seller" color="var(--color-secondary-500)" />
            <SafetyLabel icon={Lock} label="Buyer Protected" color="var(--color-warning-600)" />
            <SafetyLabel icon={CheckCircle} label="Trusted Pickup" color="var(--color-success-600)" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FraudWarning({ level, title, desc }: { level: 'high' | 'medium' | 'low'; title: string; desc: string }) {
  const colors = {
    high: { bg: 'var(--color-error-50)', border: 'var(--color-error-200)', icon: 'var(--color-error-500)' },
    medium: { bg: 'var(--color-warning-50)', border: 'var(--color-warning-200)', icon: 'var(--color-warning-600)' },
    low: { bg: 'var(--color-neutral-50)', border: 'var(--color-neutral-200)', icon: 'var(--color-neutral-500)' },
  };
  const c = colors[level];

  return (
    <div style={{ ...st.warningCard, backgroundColor: c.bg, borderColor: c.border }}>
      <AlertTriangle size={14} style={{ color: c.icon, flexShrink: 0 }} />
      <div style={st.warningInfo}>
        <span style={st.warningTitle}>{title}</span>
        <span style={st.warningDesc}>{desc}</span>
      </div>
      <span style={{ ...st.warningLevel, color: c.icon }}>{level}</span>
    </div>
  );
}

function SafetyLabel({ icon: Icon, label, color }: { icon: typeof Shield; label: string; color: string }) {
  return (
    <div style={st.safetyLabel}>
      <Icon size={14} style={{ color }} />
      <span style={st.safetyLabelText}>{label}</span>
    </div>
  );
}

function ReportFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<ReportStep>('reason');
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high'>('medium');

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Report Issue</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        {/* Step indicator */}
        <div style={st.stepRow}>
          {['Reason', 'Details', 'Confirm'].map((label, i) => (
            <div key={label} style={st.stepItem}>
              <div style={{
                ...st.stepCircle,
                backgroundColor: i <= ['reason', 'details', 'confirm'].indexOf(step)
                  ? 'var(--color-error-500)' : 'var(--color-neutral-200)',
              }}>
                <span style={st.stepNum}>{i + 1}</span>
              </div>
              <span style={st.stepLabel}>{label}</span>
            </div>
          ))}
        </div>

        {step === 'reason' && (
          <>
            <h3 style={st.formTitle}>What are you reporting?</h3>
            <div style={st.reasonList}>
              {reportReasons.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedReason(r.id)}
                    style={{ ...st.reasonBtn, ...(selectedReason === r.id ? st.reasonBtnActive : {}) }}
                  >
                    <Icon size={16} style={{ color: selectedReason === r.id ? 'var(--color-error-600)' : 'var(--color-neutral-500)' }} />
                    <span style={{ ...st.reasonLabel, ...(selectedReason === r.id ? { color: 'var(--color-error-700)' } : {}) }}>{r.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedReason && (
              <button onClick={() => setStep('details')} style={st.continueBtn}>
                <span style={st.continueBtnText}>Continue</span>
              </button>
            )}
          </>
        )}

        {step === 'details' && (
          <>
            <h3 style={st.formTitle}>Provide Details</h3>

            <div style={st.formGroup}>
              <label style={st.formLabel}>Urgency Level</label>
              <div style={st.urgencyRow}>
                {(['low', 'medium', 'high'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUrgency(u)}
                    style={{
                      ...st.urgencyChip,
                      ...(urgency === u ? {
                        backgroundColor: u === 'high' ? 'var(--color-error-50)' : u === 'medium' ? 'var(--color-warning-50)' : 'var(--color-neutral-100)',
                        borderColor: u === 'high' ? 'var(--color-error-300)' : u === 'medium' ? 'var(--color-warning-300)' : 'var(--color-neutral-300)',
                        color: u === 'high' ? 'var(--color-error-700)' : u === 'medium' ? 'var(--color-warning-700)' : 'var(--color-neutral-700)',
                      } : {}),
                    }}
                  >
                    {u.charAt(0).toUpperCase() + u.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div style={st.formGroup}>
              <label style={st.formLabel}>Description</label>
              <textarea style={st.textarea} placeholder="Describe what happened..." rows={4} />
            </div>

            <div style={st.formGroup}>
              <label style={st.formLabel}>Screenshots (optional)</label>
              <div style={st.uploadArea}>
                <Package size={20} style={{ color: 'var(--color-neutral-300)' }} />
                <span style={st.uploadText}>Tap to upload images</span>
              </div>
            </div>

            <button onClick={() => setStep('confirm')} style={st.continueBtn}>
              <span style={st.continueBtnText}>Submit Report</span>
            </button>
          </>
        )}

        {step === 'confirm' && (
          <div style={st.confirmContent}>
            <div style={st.confirmIcon}>
              <CheckCircle size={32} style={{ color: 'var(--color-success-500)' }} />
            </div>
            <h2 style={st.confirmTitle}>Report Submitted</h2>
            <p style={st.confirmDesc}>Our Guardian team will review this within 2 hours. You'll receive a notification when action is taken.</p>
            <div style={st.confirmCard}>
              <div style={st.confirmRow}><span style={st.confirmLabel}>Report ID</span><span style={st.confirmVal}>RPT-4821</span></div>
              <div style={st.confirmRow}><span style={st.confirmLabel}>Priority</span><span style={st.confirmVal}>{urgency}</span></div>
              <div style={st.confirmRow}><span style={st.confirmLabel}>Status</span><span style={st.confirmValGreen}>Under Review</span></div>
            </div>
            <button onClick={onBack} style={st.continueBtn}>
              <span style={st.continueBtnText}>Done</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TrustCenter({ onBack }: { onBack: () => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Trust & Verification</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        {/* Trust score */}
        <div style={st.trustScoreCard}>
          <div style={st.trustScoreCircle}>
            <span style={st.trustScoreVal}>4.9</span>
          </div>
          <div style={st.trustScoreInfo}>
            <span style={st.trustScoreTitle}>Your Trust Score</span>
            <span style={st.trustScoreDesc}>Excellent - Top 5% of community</span>
          </div>
        </div>

        {/* Reputation protection */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Reputation Summary</h3>
          <div style={st.repGrid}>
            <div style={st.repItem}><span style={st.repLabel}>Strikes</span><span style={st.repValGood}>0</span></div>
            <div style={st.repItem}><span style={st.repLabel}>Warnings</span><span style={st.repValGood}>0</span></div>
            <div style={st.repItem}><span style={st.repLabel}>Disputes Won</span><span style={st.repVal}>3/3</span></div>
            <div style={st.repItem}><span style={st.repLabel}>Appeals</span><span style={st.repVal}>None</span></div>
          </div>
        </div>

        {/* Verification badges */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Verification Badges</h3>
          <div style={st.verifyList}>
            {verificationBadges.map((badge) => (
              <div key={badge.id} style={st.verifyRow}>
                <div style={{ ...st.verifyIcon, backgroundColor: badge.earned ? 'var(--color-secondary-50)' : 'var(--color-neutral-50)' }}>
                  {badge.earned ? (
                    <CheckCircle size={14} style={{ color: 'var(--color-secondary-500)' }} />
                  ) : (
                    <Shield size={14} style={{ color: 'var(--color-neutral-400)' }} />
                  )}
                </div>
                <div style={st.verifyInfo}>
                  <span style={st.verifyLabel}>{badge.label}</span>
                  <span style={st.verifyDesc}>{badge.desc}</span>
                  {!badge.earned && (
                    <div style={st.verifyProgress}>
                      <div style={st.verifyProgressBar}>
                        <div style={{ ...st.verifyProgressFill, width: `${badge.progress}%` }} />
                      </div>
                      <span style={st.verifyProgressText}>{badge.progress}%</span>
                    </div>
                  )}
                </div>
                {badge.earned && <span style={st.verifyEarned}>Earned</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Requirements */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Verification Requirements</h3>
          <div style={st.reqList}>
            <div style={st.reqRow}><CheckCircle size={12} style={{ color: 'var(--color-success-500)' }} /><span style={st.reqText}>Email verified</span></div>
            <div style={st.reqRow}><CheckCircle size={12} style={{ color: 'var(--color-success-500)' }} /><span style={st.reqText}>Phone number confirmed</span></div>
            <div style={st.reqRow}><CheckCircle size={12} style={{ color: 'var(--color-success-500)' }} /><span style={st.reqText}>ID verification complete</span></div>
            <div style={st.reqRow}><CheckCircle size={12} style={{ color: 'var(--color-success-500)' }} /><span style={st.reqText}>10+ successful transactions</span></div>
            <div style={st.reqRow}><Clock size={12} style={{ color: 'var(--color-warning-500)' }} /><span style={st.reqText}>50 shipped items (42/50)</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DisputeCenter({ onBack }: { onBack: () => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Disputes</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        {/* Active disputes */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Your Cases</h3>
          {disputeCases.map((c) => (
            <div key={c.id} style={st.disputeCard}>
              <div style={st.disputeHeader}>
                <span style={st.disputeId}>{c.id}</span>
                <span style={{
                  ...st.disputeStatus,
                  color: c.status === 'resolved' ? 'var(--color-success-600)' : c.status === 'investigating' ? 'var(--color-warning-600)' : 'var(--color-error-600)',
                  backgroundColor: c.status === 'resolved' ? 'var(--color-success-50)' : c.status === 'investigating' ? 'var(--color-warning-50)' : 'var(--color-error-50)',
                }}>
                  {c.status === 'resolved' ? 'Resolved' : c.status === 'investigating' ? 'Investigating' : 'Open'}
                </span>
              </div>
              <span style={st.disputeType}>{c.type}</span>
              <span style={st.disputeTitle}>{c.title}</span>
              <div style={st.disputeFooter}>
                <span style={st.disputeDate}>{c.date}</span>
                {c.resolution && <span style={st.disputeRes}>{c.resolution}</span>}
              </div>

              {/* Timeline */}
              {c.status === 'investigating' && (
                <div style={st.timeline}>
                  <div style={st.timelineItem}>
                    <div style={{ ...st.timelineDot, backgroundColor: 'var(--color-success-500)' }} />
                    <div style={st.timelineContent}>
                      <span style={st.timelineLabel}>Report submitted</span>
                      <span style={st.timelineDate}>May 14</span>
                    </div>
                  </div>
                  <div style={st.timelineItem}>
                    <div style={{ ...st.timelineDot, backgroundColor: 'var(--color-warning-500)' }} />
                    <div style={st.timelineContent}>
                      <span style={st.timelineLabel}>Under investigation</span>
                      <span style={st.timelineDate}>May 15</span>
                    </div>
                  </div>
                  <div style={st.timelineItem}>
                    <div style={{ ...st.timelineDot, backgroundColor: 'var(--color-neutral-300)' }} />
                    <div style={st.timelineContent}>
                      <span style={st.timelineLabel}>Awaiting seller response</span>
                      <span style={st.timelineDate}>Pending</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Dispute types */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>File a New Dispute</h3>
          <div style={st.disputeTypes}>
            {['Item Not Received', 'Wrong Item Shipped', 'Damaged Item', 'Scout No-Show', 'Pickup Failed', 'Counterfeit Dispute'].map((t) => (
              <button
                key={t}
                style={st.disputeTypeBtn}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.alert(`Filing a "${t}" dispute requires a related transaction. Open the order or message thread first, then tap “Report issue” to file this dispute.`);
                  }
                }}
              >
                <span style={st.disputeTypeBtnText}>{t}</span>
                <ChevronRight size={12} style={{ color: 'var(--color-neutral-400)' }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({ onBack }: { onBack: () => void }) {
  const stats = [
    { label: 'Flagged Listings', value: '12', color: 'var(--color-error-500)' },
    { label: 'Reported Users', value: '5', color: 'var(--color-warning-600)' },
    { label: 'Verification Requests', value: '23', color: 'var(--color-secondary-500)' },
    { label: 'Open Disputes', value: '8', color: 'var(--color-primary-600)' },
  ];

  const flaggedListings = [
    { id: 'L-892', title: 'Rolex Daytona at $2,000', risk: 'high', reason: 'Price 85% below market' },
    { id: 'L-887', title: 'Sealed iPhone 1st Gen', risk: 'medium', reason: 'New account, high-value item' },
    { id: 'L-881', title: 'Supreme x LV Bag', risk: 'high', reason: 'Suspected counterfeit' },
  ];

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Moderation</span>
        <div style={st.guardianBadge}>
          <Shield size={12} style={{ color: 'var(--color-secondary-700)' }} />
          <span style={st.guardianText}>Admin</span>
        </div>
      </header>

      <div style={st.scrollContent}>
        {/* Stats */}
        <div style={st.adminStatsGrid}>
          {stats.map((s) => (
            <div key={s.label} style={st.adminStatCard}>
              <span style={{ ...st.adminStatVal, color: s.color }}>{s.value}</span>
              <span style={st.adminStatLbl}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Integrity analytics */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Platform Integrity</h3>
          <div style={st.integrityGrid}>
            <div style={st.integrityItem}>
              <span style={st.integrityVal}>12,489</span>
              <span style={st.integrityLbl}>Successful Transactions</span>
              <div style={st.integrityBar}><div style={{ ...st.integrityBarFill, width: '99%', backgroundColor: 'var(--color-success-500)' }} /></div>
            </div>
            <div style={st.integrityItem}>
              <span style={st.integrityVal}>99.3%</span>
              <span style={st.integrityLbl}>Scam Prevention Rate</span>
              <div style={st.integrityBar}><div style={{ ...st.integrityBarFill, width: '99%', backgroundColor: 'var(--color-secondary-500)' }} /></div>
            </div>
            <div style={st.integrityItem}>
              <span style={st.integrityVal}>342</span>
              <span style={st.integrityLbl}>Trusted Scout Activity</span>
              <div style={st.integrityBar}><div style={{ ...st.integrityBarFill, width: '85%', backgroundColor: 'var(--color-primary-500)' }} /></div>
            </div>
            <div style={st.integrityItem}>
              <span style={st.integrityVal}>1.8h</span>
              <span style={st.integrityLbl}>Avg Resolution Time</span>
              <div style={st.integrityBar}><div style={{ ...st.integrityBarFill, width: '90%', backgroundColor: 'var(--color-accent-500)' }} /></div>
            </div>
          </div>
        </div>

        {/* Flagged listings */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Flagged Listings</h3>
          {flaggedListings.map((l) => (
            <div key={l.id} style={st.flaggedCard}>
              <div style={st.flaggedHeader}>
                <span style={st.flaggedId}>{l.id}</span>
                <span style={{
                  ...st.flaggedRisk,
                  color: l.risk === 'high' ? 'var(--color-error-600)' : 'var(--color-warning-600)',
                  backgroundColor: l.risk === 'high' ? 'var(--color-error-50)' : 'var(--color-warning-50)',
                }}>
                  {l.risk} risk
                </span>
              </div>
              <span style={st.flaggedTitle}>{l.title}</span>
              <span style={st.flaggedReason}>{l.reason}</span>
              <div style={st.flaggedActions}>
                <div style={{ ...st.flaggedActionBtn, opacity: 0.5, cursor: 'default' }} title="Admin tools coming soon"><span style={st.flaggedActionText}>Review</span></div>
                <div style={{ ...st.flaggedActionBtn, ...st.flaggedActionBtnDanger, opacity: 0.5, cursor: 'default' }} title="Admin tools coming soon"><span style={{ ...st.flaggedActionText, color: 'var(--color-error-600)' }}>Remove</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Moderation chart */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Reports This Week</h3>
          <div style={st.chartCard}>
            <div style={st.chartBars}>
              {[18, 12, 22, 8, 15, 10, 6].map((h, i) => (
                <div key={i} style={st.chartBarCol}>
                  <div style={{ ...st.chartBar, height: `${(h / 22) * 100}%` }} />
                  <span style={st.chartBarLabel}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SafetyEducation({ onBack }: { onBack: () => void }) {
  const tips = [
    { title: 'How to Avoid Scams', desc: 'Recognize red flags and protect your purchases', icon: AlertTriangle, color: 'var(--color-error-500)' },
    { title: 'Safe Auction Tips', desc: 'Coordinate auction pickups and payments securely', icon: Shield, color: 'var(--color-secondary-500)' },
    { title: 'Local Pickup Safety', desc: 'Best practices for meeting sellers in person', icon: MapPin, color: 'var(--color-success-500)' },
    { title: 'High-Value Item Safety', desc: 'Extra precautions for luxury and rare items', icon: Star, color: 'var(--color-primary-500)' },
    { title: 'Working with Scouts', desc: 'How to verify and coordinate safely with scouts', icon: Users, color: 'var(--color-accent-500)' },
  ];

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn}><ArrowLeft size={20} /></button>
        <span style={st.headerTitle}>Safety Tips</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        <div style={st.eduIntro}>
          <Shield size={24} style={{ color: 'var(--color-secondary-500)' }} />
          <h2 style={st.eduIntroTitle}>Stay Safe on TreasureTrail</h2>
          <p style={st.eduIntroDesc}>Our Guardian team works 24/7 to keep the platform safe. Follow these tips for the best experience.</p>
        </div>

        {tips.map((tip) => {
          const Icon = tip.icon;
          return (
            <div key={tip.title} style={st.eduCard}>
              <div style={{ ...st.eduIconWrap, backgroundColor: `color-mix(in srgb, ${tip.color} 10%, transparent)` }}>
                <Icon size={18} style={{ color: tip.color }} />
              </div>
              <div style={st.eduCardInfo}>
                <span style={st.eduCardTitle}>{tip.title}</span>
                <span style={st.eduCardDesc}>{tip.desc}</span>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--color-neutral-400)' }} />
            </div>
          );
        })}

        {/* Quick safety checklist */}
        <div style={st.section}>
          <h3 style={st.sectionTitle}>Quick Safety Checklist</h3>
          <div style={st.checkList}>
            <div style={st.checkRow}><CheckCircle size={14} style={{ color: 'var(--color-success-500)' }} /><span style={st.checkText}>Always verify seller trust score before buying</span></div>
            <div style={st.checkRow}><CheckCircle size={14} style={{ color: 'var(--color-success-500)' }} /><span style={st.checkText}>Use AI authentication for high-value items</span></div>
            <div style={st.checkRow}><CheckCircle size={14} style={{ color: 'var(--color-success-500)' }} /><span style={st.checkText}>Meet in designated Safe Meetup Zones</span></div>
            <div style={st.checkRow}><CheckCircle size={14} style={{ color: 'var(--color-success-500)' }} /><span style={st.checkText}>Report suspicious listings immediately</span></div>
            <div style={st.checkRow}><CheckCircle size={14} style={{ color: 'var(--color-success-500)' }} /><span style={st.checkText}>Use Scout Verified inspections for luxury items</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--color-neutral-0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0 },
  backBtn: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-neutral-600)' },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  guardianBadge: { display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-secondary-50)', border: '1px solid var(--color-secondary-200)' },
  guardianText: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-secondary-700)' },
  scrollContent: { flex: 1, overflow: 'auto', padding: 'var(--space-4)' },

  // Guardian card
  guardianCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-secondary-50), var(--color-neutral-50))', border: '1px solid var(--color-secondary-100)', marginBottom: 'var(--space-4)' },
  guardianCardInfo: { flex: 1 },
  guardianCardTitle: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-secondary-700)' },
  guardianCardDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-secondary-600)', lineHeight: '1.4' },

  // Stats
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' },
  statCard: { padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-100)', textAlign: 'center' },
  statVal: { display: 'block', fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  statLbl: { fontSize: '10px', color: 'var(--color-neutral-500)' },

  // Section
  section: { marginBottom: 'var(--space-5)' },
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)', marginBottom: 'var(--space-3)' },

  // Action list
  actionList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  actionRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', textAlign: 'left', width: '100%' },
  actionIcon: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  actionInfo: { flex: 1 },
  actionLabel: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  actionDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },

  // Warning cards
  warningCard: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid', marginBottom: 'var(--space-2)' },
  warningInfo: { flex: 1 },
  warningTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  warningDesc: { fontSize: '10px', color: 'var(--color-neutral-600)' },
  warningLevel: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', textTransform: 'uppercase' as const },

  // Safety labels
  labelsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
  safetyLabel: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  safetyLabelText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)' },

  // Report flow
  stepRow: { display: 'flex', justifyContent: 'center', gap: 'var(--space-6)', marginBottom: 'var(--space-5)' },
  stepItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  stepCircle: { width: '28px', height: '28px', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-0)' },
  stepLabel: { fontSize: '10px', color: 'var(--color-neutral-500)' },
  formTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: 'var(--space-4)' },
  reasonList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' },
  reasonBtn: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', textAlign: 'left' },
  reasonBtnActive: { borderColor: 'var(--color-error-300)', backgroundColor: 'var(--color-error-50)' },
  reasonLabel: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)' },
  formGroup: { marginBottom: 'var(--space-4)' },
  formLabel: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)', marginBottom: 'var(--space-2)' },
  urgencyRow: { display: 'flex', gap: 'var(--space-2)' },
  urgencyChip: { flex: 1, padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', textAlign: 'center', color: 'var(--color-neutral-600)' },
  textarea: { width: '100%', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-200)', fontSize: 'var(--font-size-sm)', resize: 'vertical' as const, fontFamily: 'inherit' },
  uploadArea: { padding: 'var(--space-5)', borderRadius: 'var(--radius-md)', border: '2px dashed var(--color-neutral-200)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' },
  uploadText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-400)' },
  continueBtn: { width: '100%', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-secondary-500), var(--color-secondary-600))', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  continueBtnText: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-0)' },

  // Confirm
  confirmContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-5) 0' },
  confirmIcon: { width: '64px', height: '64px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-success-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-4)' },
  confirmTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', marginBottom: 'var(--space-2)' },
  confirmDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', textAlign: 'center', lineHeight: 'var(--line-height-normal)', marginBottom: 'var(--space-4)' },
  confirmCard: { width: '100%', padding: 'var(--space-4)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' },
  confirmRow: { display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0' },
  confirmLabel: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)' },
  confirmVal: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  confirmValGreen: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success-600)' },

  // Trust center
  trustScoreCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--color-secondary-50), var(--color-neutral-50))', border: '1px solid var(--color-secondary-100)', marginBottom: 'var(--space-5)' },
  trustScoreCircle: { width: '56px', height: '56px', borderRadius: 'var(--radius-full)', border: '3px solid var(--color-secondary-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  trustScoreVal: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-secondary-700)' },
  trustScoreInfo: { flex: 1 },
  trustScoreTitle: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  trustScoreDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-secondary-600)' },

  // Reputation
  repGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' },
  repItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  repLabel: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-600)' },
  repVal: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)' },
  repValGood: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-success-600)' },

  // Verify list
  verifyList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  verifyRow: { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' },
  verifyIcon: { width: '32px', height: '32px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  verifyInfo: { flex: 1 },
  verifyLabel: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  verifyDesc: { fontSize: '10px', color: 'var(--color-neutral-500)' },
  verifyProgress: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: '4px' },
  verifyProgressBar: { flex: 1, height: '3px', backgroundColor: 'var(--color-neutral-200)', borderRadius: 'var(--radius-full)', overflow: 'hidden' },
  verifyProgressFill: { height: '100%', backgroundColor: 'var(--color-secondary-500)', borderRadius: 'var(--radius-full)' },
  verifyProgressText: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-500)' },
  verifyEarned: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-secondary-600)', backgroundColor: 'var(--color-secondary-50)', padding: '2px 6px', borderRadius: 'var(--radius-full)' },

  // Requirements
  reqList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  reqRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  reqText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-700)' },

  // Disputes
  disputeCard: { padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', marginBottom: 'var(--space-3)' },
  disputeHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' },
  disputeId: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-400)' },
  disputeStatus: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', padding: '2px 6px', borderRadius: 'var(--radius-full)' },
  disputeType: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-800)', marginBottom: '2px' },
  disputeTitle: { display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-600)', marginBottom: 'var(--space-2)' },
  disputeFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  disputeDate: { fontSize: '10px', color: 'var(--color-neutral-400)' },
  disputeRes: { fontSize: '10px', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-success-600)' },

  // Timeline
  timeline: { marginTop: 'var(--space-3)', paddingLeft: 'var(--space-3)', borderLeft: '2px solid var(--color-neutral-200)' },
  timelineItem: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', position: 'relative' },
  timelineDot: { width: '8px', height: '8px', borderRadius: 'var(--radius-full)', flexShrink: 0, marginLeft: '-19px' },
  timelineContent: { flex: 1, display: 'flex', justifyContent: 'space-between' },
  timelineLabel: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-700)' },
  timelineDate: { fontSize: '10px', color: 'var(--color-neutral-400)' },

  // Dispute types
  disputeTypes: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  disputeTypeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)' },
  disputeTypeBtnText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-700)' },

  // Admin
  adminStatsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' },
  adminStatCard: { padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-neutral-50)', border: '1px solid var(--color-neutral-100)', textAlign: 'center' },
  adminStatVal: { display: 'block', fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' },
  adminStatLbl: { fontSize: '10px', color: 'var(--color-neutral-500)' },

  // Integrity
  integrityGrid: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },
  integrityItem: { padding: 'var(--space-3)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' },
  integrityVal: { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)' },
  integrityLbl: { display: 'block', fontSize: '10px', color: 'var(--color-neutral-500)', marginBottom: '4px' },
  integrityBar: { height: '3px', backgroundColor: 'var(--color-neutral-200)', borderRadius: 'var(--radius-full)', overflow: 'hidden' },
  integrityBarFill: { height: '100%', borderRadius: 'var(--radius-full)' },

  // Flagged
  flaggedCard: { padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', marginBottom: 'var(--space-2)' },
  flaggedHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' },
  flaggedId: { fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-400)' },
  flaggedRisk: { fontSize: '9px', fontWeight: 'var(--font-weight-bold)', padding: '2px 6px', borderRadius: 'var(--radius-full)', textTransform: 'uppercase' as const },
  flaggedTitle: { display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)', marginBottom: '2px' },
  flaggedReason: { display: 'block', fontSize: '10px', color: 'var(--color-neutral-500)', marginBottom: 'var(--space-2)' },
  flaggedActions: { display: 'flex', gap: 'var(--space-2)' },
  flaggedActionBtn: { flex: 1, padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  flaggedActionBtnDanger: { borderColor: 'var(--color-error-200)', backgroundColor: 'var(--color-error-50)' },
  flaggedActionText: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-neutral-700)' },

  // Chart
  chartCard: { padding: 'var(--space-4)', backgroundColor: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' },
  chartBars: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '80px', gap: 'var(--space-2)' },
  chartBarCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', backgroundColor: 'var(--color-secondary-400)', borderRadius: 'var(--radius-sm)' },
  chartBarLabel: { fontSize: '10px', color: 'var(--color-neutral-400)' },

  // Education
  eduIntro: { textAlign: 'center', padding: 'var(--space-4) 0 var(--space-5)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  eduIntroTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', margin: 'var(--space-2) 0' },
  eduIntroDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', lineHeight: 'var(--line-height-normal)' },
  eduCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-neutral-100)', marginBottom: 'var(--space-2)' },
  eduIconWrap: { width: '36px', height: '36px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  eduCardInfo: { flex: 1 },
  eduCardTitle: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-800)' },
  eduCardDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)' },

  // Checklist
  checkList: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  checkText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-700)' },
};
