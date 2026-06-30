import type { CSSProperties } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Profile } from '../../lib/supabase';

/**
 * Per-profile "link tree" of external selling profiles. Each platform maps to a
 * column on `profiles`. The columns are user-editable (not privileged) and may
 * be absent before the featured_profiles_and_links migration is applied, so
 * everything here treats them as optional.
 */
export type SellingPlatform = {
  key: 'link_facebook_marketplace' | 'link_whatnot' | 'link_poshmark' | 'link_ebay';
  label: string;
  color: string;
  placeholder: string;
};

export const SELLING_LINK_PLATFORMS: SellingPlatform[] = [
  {
    key: 'link_facebook_marketplace',
    label: 'Facebook Marketplace',
    color: '#1877F2',
    placeholder: 'facebook.com/marketplace/profile/...',
  },
  {
    key: 'link_whatnot',
    label: 'Whatnot',
    color: '#FFB200',
    placeholder: 'whatnot.com/user/yourname',
  },
  {
    key: 'link_poshmark',
    label: 'Poshmark',
    color: '#C81E3C',
    placeholder: 'poshmark.com/closet/yourname',
  },
  {
    key: 'link_ebay',
    label: 'eBay',
    color: '#0064D2',
    placeholder: 'ebay.com/usr/yourname',
  },
];

/**
 * Normalize a user-entered link into a safe absolute https URL, or return ''
 * when it can't be made into a valid http(s) link. We only accept http/https so
 * a stored value can never become a `javascript:`/`data:` URL in an href.
 */
export function normalizeSellingUrl(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

/** Returns the platforms this profile actually has a usable link for. */
export function profileSellingLinks(
  profile: Pick<Profile, SellingPlatform['key']>,
): { platform: SellingPlatform; href: string }[] {
  return SELLING_LINK_PLATFORMS.map((platform) => ({
    platform,
    href: normalizeSellingUrl((profile as any)[platform.key]),
  })).filter((x) => x.href !== '');
}

export function SellingLinks({
  profile,
  title = 'Find me on',
}: {
  profile: Pick<Profile, SellingPlatform['key']>;
  title?: string;
}) {
  const links = profileSellingLinks(profile);
  if (links.length === 0) return null;

  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>{title}</h2>
      <div style={styles.list}>
        {links.map(({ platform, href }) => (
          <a
            key={platform.key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.link}
          >
            <span style={{ ...styles.dot, background: platform.color }} />
            <span style={styles.label}>{platform.label}</span>
            <ExternalLink size={15} style={{ color: 'var(--color-neutral-400)', flexShrink: 0 }} />
          </a>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { marginBottom: 'var(--space-5)' },
  title: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 700,
    color: 'var(--color-neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 'var(--space-2)',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    padding: '0 14px',
    borderRadius: 12,
    border: '1px solid var(--color-neutral-200)',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-800)',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 999, flexShrink: 0 },
  label: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
