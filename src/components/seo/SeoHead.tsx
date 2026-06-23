import { useEffect } from 'react';

export type PublicSeoMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
  robots?: string;
  imagePath?: string;
  imageAlt?: string;
  siteName?: string;
  ogType?: 'website' | 'article';
  locale?: string;
};

type SeoHeadProps = {
  metadata?: PublicSeoMetadata | null;
};

const SITE_NAME = 'TreasureTrail';
const DEFAULT_IMAGE_PATH = '/og-image.jpg';
const DEFAULT_ROBOTS = 'index, follow';
const DEFAULT_LOCALE = 'en_US';

function absoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): (() => void) | null {
  if (typeof document === 'undefined') return null;
  const selector = `meta[data-tt-seo="${attr}:${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.dataset.ttSeo = `${attr}:${key}`;
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute('content');
  el.setAttribute('content', content);
  return () => {
    if (!el) return;
    if (prev == null) el.removeAttribute('content');
    else el.setAttribute('content', prev);
  };
}

function upsertLink(rel: string, href: string): (() => void) | null {
  if (typeof document === 'undefined') return null;
  const selector = `link[data-tt-seo="link:${rel}"]`;
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement('link');
    el.dataset.ttSeo = `link:${rel}`;
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute('href');
  el.setAttribute('href', href);
  return () => {
    if (!el) return;
    if (prev == null) el.removeAttribute('href');
    else el.setAttribute('href', prev);
  };
}

export default function SeoHead({ metadata }: SeoHeadProps) {
  useEffect(() => {
    if (typeof document === 'undefined' || !metadata) return;

    const cleanups: Array<(() => void) | null> = [];
    const title = `${metadata.title} | ${metadata.siteName ?? SITE_NAME}`;
    const description = metadata.description;
    const canonicalUrl = absoluteUrl(metadata.canonicalPath);
    const imageUrl = absoluteUrl(metadata.imagePath ?? DEFAULT_IMAGE_PATH);
    const robots = metadata.robots ?? DEFAULT_ROBOTS;
    const siteName = metadata.siteName ?? SITE_NAME;
    const ogType = metadata.ogType ?? 'website';
    const locale = metadata.locale ?? DEFAULT_LOCALE;
    const imageAlt = metadata.imageAlt ?? metadata.title;

    document.title = title;
    cleanups.push(upsertMeta('name', 'title', title));
    cleanups.push(upsertMeta('name', 'description', description));
    cleanups.push(upsertMeta('name', 'robots', robots));
    cleanups.push(upsertMeta('property', 'og:type', ogType));
    cleanups.push(upsertMeta('property', 'og:site_name', siteName));
    cleanups.push(upsertMeta('property', 'og:url', canonicalUrl));
    cleanups.push(upsertMeta('property', 'og:title', title));
    cleanups.push(upsertMeta('property', 'og:description', description));
    cleanups.push(upsertMeta('property', 'og:image', imageUrl));
    cleanups.push(upsertMeta('property', 'og:image:alt', imageAlt));
    cleanups.push(upsertMeta('property', 'og:locale', locale));
    cleanups.push(upsertMeta('name', 'twitter:card', 'summary_large_image'));
    cleanups.push(upsertMeta('property', 'twitter:url', canonicalUrl));
    cleanups.push(upsertMeta('property', 'twitter:title', title));
    cleanups.push(upsertMeta('property', 'twitter:description', description));
    cleanups.push(upsertMeta('property', 'twitter:image', imageUrl));
    cleanups.push(upsertMeta('property', 'twitter:image:alt', imageAlt));
    cleanups.push(upsertLink('canonical', canonicalUrl));

    return () => {
      for (let i = cleanups.length - 1; i >= 0; i -= 1) {
        cleanups[i]?.();
      }
    };
  }, [metadata]);

  return null;
}
