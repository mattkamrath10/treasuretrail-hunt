import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import PublicSeoPage from '../components/seo/PublicSeoPage';
import type { PublicSeoLink } from '../components/seo/PublicSeoPage';
import type { SeoRouteKind } from '../lib/seo/publicRouteData';
import { buildSeoPage } from '../lib/seo/publicRouteData';
import type { PublicSeoPageProps } from '../components/seo/PublicSeoPage';
import { loadLiveSeoEnhancements } from '../lib/seo/publicLiveData';

type PublicSeoRouteProps = {
  kind: SeoRouteKind;
};

function dedupeLinks(links: PublicSeoLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

export default function PublicSeoRoute({ kind }: PublicSeoRouteProps) {
  const params = useParams();
  const location = useLocation();
  const routeSlug = params.slug ?? params.id;
  const basePage = useMemo(() => buildSeoPage(kind, {
    county: params.county,
    city: params.city,
    category: params.category,
    slug: routeSlug,
    handle: params.handle,
  }, {
    canonicalPath: location.pathname,
  }), [kind, params.county, params.city, params.category, routeSlug, params.handle, location.pathname]);

  const [page, setPage] = useState<PublicSeoPageProps>(basePage);

  useEffect(() => {
    let cancelled = false;
    setPage(basePage);

    if (kind !== 'wanted' && kind !== 'seller' && kind !== 'event') return undefined;

    loadLiveSeoEnhancements(kind, {
      county: params.county,
      city: params.city,
      category: params.category,
      slug: routeSlug,
      handle: params.handle,
    }).then((patch) => {
      if (cancelled) return;
      setPage((current) => ({
        ...current,
        ...patch,
        stats: patch.stats ?? current.stats,
        highlights: patch.highlights ?? current.highlights,
        sections: [
          ...(patch.sections ?? []),
          ...(current.sections ?? []),
        ],
        relatedLinks: patch.relatedLinks || current.relatedLinks
          ? dedupeLinks([...(patch.relatedLinks ?? []), ...(current.relatedLinks ?? [])])
          : undefined,
        faqs: patch.faqs ?? current.faqs,
      }));
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [basePage, kind, params.category, params.city, params.county, params.handle, routeSlug]);

  return <PublicSeoPage {...page} />;
}
