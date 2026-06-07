import { ArrowLeft } from 'lucide-react';

const EFFECTIVE_DATE = 'May 29, 2026';
const CONTACT_EMAIL = 'mkkamrarath@gmail.com';

export default function PrivacyPolicy({ onBack }: { onBack: () => void }) {
  return (
    <div style={st.container}>
      <header style={st.header}>
        <button onClick={onBack} style={st.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={st.headerTitle}>Privacy Policy</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={st.scrollContent}>
        <p style={st.meta}>Effective {EFFECTIVE_DATE}</p>

        <p style={st.lead}>
          This Privacy Policy explains how TreasureTrail (“we”, “us”) collects, uses, and protects
          your information when you use the TreasureTrail mobile app and website (the “Service”). By
          using the Service you agree to the practices described here.
        </p>

        <Section title="1. Information We Collect">
          <P><b>Account information.</b> When you create an account we collect your email address and a
          securely hashed password (handled by our authentication provider, Supabase). You may also
          add a username, bio, profile photo, and favorite categories.</P>
          <P><b>Content you create.</b> Listings, wanted posts, finds, event details, messages, photos,
          and other content you submit to the Service.</P>
          <P><b>Photos and images.</b> Images you upload (profile photos, item photos) are stored in
          our hosted storage and may be processed to generate thumbnails.</P>
          <P><b>AI Treasure Scan.</b> When you use AI item identification, the photo you submit is sent
          to our AI provider (OpenAI) solely to return an identification and resale estimate. We log
          scan metadata to enforce usage limits.</P>
          <P><b>Location.</b> Event and listing features may use approximate location you provide to
          show nearby sales and events. We do not continuously track your device location.</P>
          <P><b>Device and push tokens.</b> If you enable notifications, we store a push notification
          token for your device so we can deliver alerts (for example, when a seller you follow goes
          live). A push token is not a phone number.</P>
          <P><b>Usage data.</b> Basic technical data such as app interactions and error logs used to
          operate and improve the Service.</P>
        </Section>

        <Section title="2. How We Use Information">
          <Bullet>Provide, maintain, and improve the Service.</Bullet>
          <Bullet>Authenticate you and keep your account secure.</Bullet>
          <Bullet>Display your profile and content to other users as you direct.</Bullet>
          <Bullet>Deliver notifications you have enabled.</Bullet>
          <Bullet>Detect, prevent, and address fraud, abuse, and safety issues.</Bullet>
          <Bullet>Comply with legal obligations.</Bullet>
        </Section>

        <Section title="3. How We Share Information">
          <P>We do not sell your personal information. We share information only with:</P>
          <Bullet><b>Service providers</b> that operate the app on our behalf — Supabase (database,
          authentication, storage), OpenAI (AI item identification), and Firebase Cloud Messaging
          (push delivery) — under agreements that limit their use of your data.</Bullet>
          <Bullet><b>Other users</b>, for the content and profile details you choose to make public.</Bullet>
          <Bullet><b>Legal authorities</b>, when required by law or to protect rights and safety.</Bullet>
        </Section>

        <Section title="4. Data Retention">
          <P>We keep your information for as long as your account is active. When you delete your
          account, your profile and associated data are permanently removed from our systems, except
          where we must retain limited records to comply with legal obligations or resolve disputes.</P>
        </Section>

        <Section title="5. Your Choices and Rights">
          <Bullet><b>Access and update</b> your profile information at any time in the app.</Bullet>
          <Bullet><b>Delete your account</b> from Profile → Settings → Delete Account. This permanently
          removes your account and associated data.</Bullet>
          <Bullet><b>Notifications</b> can be turned off in your device settings.</Bullet>
          <Bullet>Depending on where you live, you may have additional rights (access, correction,
          deletion, portability). Contact us to exercise them.</Bullet>
        </Section>

        <Section title="6. Security">
          <P>We use industry-standard measures to protect your information, including encrypted
          connections and row-level access controls. No method of transmission or storage is 100%
          secure, but we work to protect your data.</P>
        </Section>

        <Section title="7. Children’s Privacy">
          <P>The Service is not directed to children under 13 (or the minimum age required in your
          jurisdiction), and we do not knowingly collect their personal information.</P>
        </Section>

        <Section title="8. Changes to This Policy">
          <P>We may update this Policy from time to time. We will revise the “Effective” date above and,
          where appropriate, notify you in the app.</P>
        </Section>

        <Section title="9. Contact Us">
          <P>Questions about this Policy or your data? Email us at <b>{CONTACT_EMAIL}</b>.</P>
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
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
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
