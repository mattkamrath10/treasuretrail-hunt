import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import {
  ArrowLeft, Flag, ShieldOff, FileText, ScrollText, CheckCircle2,
  Filter, ChevronRight,
} from 'lucide-react';

/**
 * Review Mode — a single screen that points an App Store reviewer to every
 * User-Generated-Content safeguard required by Guideline 1.2. It does not gate
 * any functionality; it simply documents and links to the moderation tools so
 * they are trivially verifiable during review.
 */
export default function ReviewMode({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();

  const items: Array<{
    icon: typeof Flag;
    title: string;
    body: string;
    action?: { label: string; to: string };
  }> = [
    {
      icon: Flag,
      title: '1. Report objectionable content',
      body:
        'Every listing, find, event, profile, and message has a Report control. Open any item, tap Report, pick a reason, and submit. Reports are written to a moderation queue.',
    },
    {
      icon: ShieldOff,
      title: '2. Block abusive users',
      body:
        'Open any user profile, listing, find, or conversation and tap Block User. Their content is hidden from you and they can no longer message you.',
    },
    {
      icon: CheckCircle2,
      title: '3. Content filtering on publish',
      body:
        'Listings, finds, events, and messages run through a profanity / hate / explicit-language filter at creation. Objectionable text is rejected before it is ever stored.',
    },
    {
      icon: ScrollText,
      title: '4. Terms acceptance at signup',
      body:
        'New accounts must explicitly accept the Terms of Service and Community Guidelines (and confirm they are 17+) before the account can be created.',
    },
    {
      icon: FileText,
      title: '5. Community Guidelines',
      body:
        'A zero-tolerance content policy with clear reporting and blocking instructions and a 24-hour moderation commitment.',
      action: { label: 'Open Community Guidelines', to: '/guidelines' },
    },
    {
      icon: Filter,
      title: '6. Moderation queue (admin)',
      body:
        'Reports flow into an admin-only moderation queue where they can be marked reviewing, actioned, or dismissed.',
      action: { label: 'Open Moderation Queue', to: '/admin/moderation' },
    },
  ];

  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={st.headerTitle}>Review Mode</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        <p style={st.lead}>
          This screen summarizes the User-Generated-Content safeguards in
          TreasureTrail for App Store review (Guideline 1.2). Each item below is a
          live, working feature in the app.
        </p>

        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.title} style={st.card}>
              <div style={st.cardHead}>
                <span style={st.iconWrap}><Icon size={18} /></span>
                <span style={st.cardTitle}>{it.title}</span>
              </div>
              <p style={st.cardBody}>{it.body}</p>
              {it.action && (
                <button onClick={() => navigate(it.action!.to)} style={st.actionBtn}>
                  <span>{it.action.label}</span>
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          );
        })}

        <div style={st.legalRow}>
          <button onClick={() => navigate('/terms')} style={st.legalBtn}>Terms of Service</button>
          <button onClick={() => navigate('/privacy')} style={st.legalBtn}>Privacy Policy</button>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-neutral-0)',
    maxWidth: 'var(--max-width)',
    margin: '0 auto',
    width: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
    borderBottom: '1px solid var(--color-neutral-200)',
    position: 'sticky',
    top: 0,
    backgroundColor: 'var(--color-neutral-0)',
    zIndex: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-700)',
  },
  headerTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  scrollContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    WebkitOverflowScrolling: 'touch',
  },
  lead: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: 'var(--line-height-relaxed)',
    marginBottom: 'var(--space-4)',
  },
  card: {
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    marginBottom: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-primary-100)',
    color: 'var(--color-primary-700)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  cardBody: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: 'var(--line-height-relaxed)',
  },
  actionBtn: {
    marginTop: 'var(--space-3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-primary-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-primary-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
  },
  legalRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    justifyContent: 'center',
    marginTop: 'var(--space-2)',
  },
  legalBtn: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-primary-600)',
    fontWeight: 600,
    textDecoration: 'underline',
  },
};
