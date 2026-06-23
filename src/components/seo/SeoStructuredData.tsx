import { useEffect } from 'react';

export type SeoStructuredDataNode = Record<string, unknown>;

type SeoStructuredDataProps = {
  nodes?: SeoStructuredDataNode[] | null;
};

function serialize(nodes: SeoStructuredDataNode[]): string {
  const payload = nodes.length === 1 ? nodes[0] : nodes;
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

export default function SeoStructuredData({ nodes }: SeoStructuredDataProps) {
  useEffect(() => {
    if (typeof document === 'undefined' || !nodes?.length) return;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.ttSeo = 'jsonld';
    script.text = serialize(nodes);
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [nodes]);

  return null;
}
