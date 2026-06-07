import { ArrowLeft } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

const CONTACT_EMAIL = 'mkkamrarath@gmail.com';

/**
 * Public Community Guidelines (Apple Guideline 1.2). States the content rules,
 * the zero-tolerance policy for objectionable content, and the exact tools
 * users have to report content and block abusive users. Linked from the
 * Profile → Account section, the signup Terms gate, and Review Mode.
 */
export default function CommunityGuidelines({ onBack }: { onBack: () => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={st.headerTitle}>Community Guidelines</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        <p style={st.lead}>
          TreasureTrail is a community for collectors, sellers, and treasure hunters.
          To keep it safe for everyone, all users must follow these guidelines. We
          have a <strong>zero-tolerance policy for objectionable content and abusive
          behavior</strong>.
        </p>

        <Section title="Content that is never allowed">
          <Bullet>Harassment, bullying, threats, or hate speech of any kind.</Bullet>
          <Bullet>Sexually explicit material, nudity, or content that sexualizes minors.</Bullet>
          <Bullet>Violent, graphic, or otherwise objectionable content.</Bullet>
          <Bullet>Spam, scams, fraud, or counterfeit, stolen, or illegal items.</Bullet>
          <Bullet>Impersonation or sharing another person's private information.</Bullet>
        </Section>

        <Section title="How to report content">
          <P>Every listing, find, event, profile, and message has a <strong>Report</strong>
          control. Tap it, choose a reason, and submit. Reports go to our moderation
          queue and are reviewed promptly.</P>
        </Section>

        <Section title="How to block a user">
          <P>You can block any user from their profile, from a listing or find they
          posted, or from a conversation. Tap <strong>Block User</strong>. Once blocked,
          you will no longer see their content and they cannot message you.</P>
        </Section>

        <Section title="Our moderation commitment">
          <P>We act on reports of objectionable content within 24 hours. Content that
          violates these guidelines is removed and offending accounts may be suspended
          or permanently removed. A built-in filter also blocks objectionable language
          at the moment content is posted.</P>
        </Section>

        <Section title="Contact">
          <P>Questions or urgent concerns? Email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={st.link}>{CONTACT_EMAIL}</a>.</P>
        </Section>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={st.section}>
      <h2 style={st.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p style={st.p}>{children}</p>;
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <div style={st.bulletRow}>
      <span style={st.bulletDot} />
      <span style={st.bulletText}>{children}</span>
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
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-700)',
    lineHeight: 'var(--line-height-relaxed)',
    marginBottom: 'var(--space-4)',
  },
  section: { marginBottom: 'var(--space-5)' },
  sectionTitle: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-2)',
  },
  p: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: 'var(--line-height-relaxed)',
    marginBottom: 'var(--space-2)',
  },
  bulletRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  bulletDot: {
    flexShrink: 0,
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: 'var(--color-primary-500)',
    marginTop: 7,
  },
  bulletText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: 'var(--line-height-relaxed)',
  },
  link: { color: 'var(--color-primary-600)', fontWeight: 600 },
};
