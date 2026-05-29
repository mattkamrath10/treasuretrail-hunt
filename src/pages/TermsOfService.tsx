import { ArrowLeft } from 'lucide-react';

const EFFECTIVE_DATE = 'May 29, 2026';
const CONTACT_EMAIL = 'support@treasuretrail.app';

export default function TermsOfService({ onBack }: { onBack: () => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={st.headerTitle}>Terms of Service</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        <p style={st.meta}>Effective {EFFECTIVE_DATE}</p>

        <p style={st.lead}>
          Welcome to TreasureTrail. These Terms of Service (“Terms”) govern your use of the
          TreasureTrail mobile app and website (the “Service”). By creating an account or using the
          Service, you agree to these Terms. If you do not agree, do not use the Service.
        </p>

        <Section title="1. Eligibility">
          <P>You must be at least 13 years old (or the minimum age of digital consent in your
          jurisdiction) and able to form a binding contract to use the Service.</P>
        </Section>

        <Section title="2. Your Account">
          <P>You are responsible for your account and for keeping your credentials secure. You agree to
          provide accurate information and to notify us of any unauthorized use of your account.</P>
        </Section>

        <Section title="3. User Content">
          <P>You retain ownership of the content you post (listings, finds, wanted posts, events,
          messages, and photos). By posting, you grant us a non-exclusive, worldwide, royalty-free
          license to host, display, and distribute that content for the purpose of operating the
          Service.</P>
          <P>You are solely responsible for your content and represent that you have the rights to post
          it and that it does not violate any law or third-party rights.</P>
        </Section>

        <Section title="4. Acceptable Use">
          <P>You agree not to:</P>
          <Bullet>Post unlawful, fraudulent, counterfeit, stolen, or prohibited items or content.</Bullet>
          <Bullet>Harass, threaten, scam, or impersonate others.</Bullet>
          <Bullet>Post spam, malware, or attempt to disrupt or gain unauthorized access to the Service.</Bullet>
          <Bullet>Infringe intellectual property or privacy rights.</Bullet>
          <Bullet>Misuse AI features to mislead others about an item’s identity, condition, or value.</Bullet>
        </Section>

        <Section title="5. Marketplace and Transactions">
          <P>TreasureTrail is a platform that connects collectors, sellers, and buyers. We are not a
          party to transactions between users. We do not guarantee the quality, safety, legality, or
          accuracy of any listing, item, AI valuation, or user. You transact at your own risk and
          should use good judgment, especially for in-person meetups and high-value items.</P>
        </Section>

        <Section title="6. AI Features">
          <P>AI Treasure Scan provides automated, estimated identifications and resale ranges generated
          by a third-party model. These are informational estimates only, are not appraisals, and may
          be inaccurate. Do not rely on them as the sole basis for any purchase or sale decision.</P>
        </Section>

        <Section title="7. Paid Features">
          <P>Certain features may be offered as part of a paid membership or as paid promotions. Pricing
          and terms for any paid features will be presented to you before purchase. Paid features are
          not required to use the core Service.</P>
        </Section>

        <Section title="8. Termination and Account Deletion">
          <P>You may delete your account at any time from Profile → Settings → Delete Account, which
          permanently removes your account and associated data. We may suspend or terminate your access
          if you violate these Terms or to protect the Service and its users.</P>
        </Section>

        <Section title="9. Disclaimers">
          <P>The Service is provided “as is” and “as available” without warranties of any kind, whether
          express or implied, to the fullest extent permitted by law.</P>
        </Section>

        <Section title="10. Limitation of Liability">
          <P>To the fullest extent permitted by law, TreasureTrail will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or any loss arising from your use of
          the Service or any user transaction.</P>
        </Section>

        <Section title="11. Changes to These Terms">
          <P>We may update these Terms from time to time. We will revise the “Effective” date above and,
          where appropriate, notify you in the app. Continued use after changes means you accept the
          updated Terms.</P>
        </Section>

        <Section title="12. Contact Us">
          <P>Questions about these Terms? Email us at <b>{CONTACT_EMAIL}</b>.</P>
        </Section>

        <div style={{ height: 'var(--space-8)' }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={st.section}>
      <h2 style={st.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={st.p}>{children}</p>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={st.bulletRow}>
      <span style={st.bulletDot}>•</span>
      <span style={st.bulletText}>{children}</span>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-200)',
    flexShrink: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-neutral-700)',
    cursor: 'pointer',
  },
  headerTitle: {
    fontSize: 'var(--font-size-md)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },
  scrollContent: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: 'var(--space-4)',
  },
  meta: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
    marginBottom: 'var(--space-3)',
  },
  lead: {
    fontSize: 'var(--font-size-sm)',
    lineHeight: 1.6,
    color: 'var(--color-neutral-700)',
    marginBottom: 'var(--space-4)',
  },
  section: { marginBottom: 'var(--space-5)' },
  sectionTitle: {
    fontSize: 'var(--font-size-md)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-2)',
  },
  p: {
    fontSize: 'var(--font-size-sm)',
    lineHeight: 1.6,
    color: 'var(--color-neutral-700)',
    marginBottom: 'var(--space-2)',
  },
  bulletRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },
  bulletDot: { color: 'var(--color-primary-500)', lineHeight: 1.6 },
  bulletText: {
    flex: 1,
    fontSize: 'var(--font-size-sm)',
    lineHeight: 1.6,
    color: 'var(--color-neutral-700)',
  },
};
