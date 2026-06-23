import { type CSSProperties, type ReactNode, Fragment } from 'react';

/**
 * Markdown — a tiny, dependency-free markdown renderer for admin/AI-authored
 * blog bodies. We deliberately avoid a markdown library (keeps the native
 * bundle small + sidesteps Codemagic lockfile churn) and we DON'T use
 * dangerouslySetInnerHTML — every block is rendered as real React elements, so
 * there is no HTML-injection surface even though the content is trusted.
 *
 * Supported: # / ## / ### headings, paragraphs, `-`/`*` bullet lists,
 * `1.` ordered lists, blockquotes (`>`), **bold**, *italic*, [text](url) links.
 */
function renderInline(
  text: string,
  keyBase: string,
  onNavigate?: (path: string) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokenize on bold, italic, and links in one pass.
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>);
    } else if (m[3]) {
      nodes.push(<em key={`${keyBase}-i${i}`}>{m[4]}</em>);
    } else if (m[5]) {
      const href = m[7];
      const external = /^https?:\/\//i.test(href);
      // Internal links (/path) navigate via the SPA router when a handler is
      // provided — a plain <a href="/x"> would hard-reload, which breaks the
      // Capacitor (HashRouter) webview. External links open in a new tab.
      const internal = !external && href.startsWith('/');
      nodes.push(
        <a
          key={`${keyBase}-a${i}`}
          href={href}
          style={linkStyle}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          {...(internal && onNavigate
            ? {
                onClick: (e: React.MouseEvent) => {
                  e.preventDefault();
                  onNavigate(href);
                },
              }
            : {})}
        >
          {m[6]}
        </a>,
      );
    }
    last = re.lastIndex;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({
  source,
  onNavigate,
}: {
  source: string;
  onNavigate?: (path: string) => void;
}) {
  const inline = (text: string, keyBase: string) => renderInline(text, keyBase, onNavigate);
  const lines = (source || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Headings
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = inline(h[2], `h${key}`);
      if (level === 1) blocks.push(<h2 key={key} style={h2Style}>{content}</h2>);
      else if (level === 2) blocks.push(<h3 key={key} style={h3Style}>{content}</h3>);
      else blocks.push(<h4 key={key} style={h4Style}>{content}</h4>);
      key += 1;
      i += 1;
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={key} style={ulStyle}>
          {items.map((it, idx) => (
            <li key={idx} style={liStyle}>{inline(it, `ul${key}-${idx}`)}</li>
          ))}
        </ul>,
      );
      key += 1;
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={key} style={ulStyle}>
          {items.map((it, idx) => (
            <li key={idx} style={liStyle}>{inline(it, `ol${key}-${idx}`)}</li>
          ))}
        </ol>,
      );
      key += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={key} style={quoteStyle}>
          {inline(quote.join(' '), `q${key}`)}
        </blockquote>,
      );
      key += 1;
      continue;
    }

    // Paragraph (consume until blank line)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key} style={pStyle}>{inline(para.join(' '), `p${key}`)}</p>,
    );
    key += 1;
  }

  return <Fragment>{blocks}</Fragment>;
}

const linkStyle: CSSProperties = {
  color: 'var(--color-primary-600, #c2410c)',
  textDecoration: 'underline',
  fontWeight: 600,
};
const h2Style: CSSProperties = {
  fontSize: 'var(--font-size-xl)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-neutral-900)',
  margin: 'var(--space-6) 0 var(--space-3)',
  lineHeight: 1.25,
};
const h3Style: CSSProperties = {
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--color-neutral-900)',
  margin: 'var(--space-5) 0 var(--space-2)',
  lineHeight: 1.3,
};
const h4Style: CSSProperties = {
  fontSize: 'var(--font-size-base)',
  fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--color-neutral-800)',
  margin: 'var(--space-4) 0 var(--space-2)',
};
const pStyle: CSSProperties = {
  fontSize: 'var(--font-size-base)',
  color: 'var(--color-neutral-700)',
  lineHeight: 1.7,
  margin: '0 0 var(--space-4)',
};
const ulStyle: CSSProperties = {
  margin: '0 0 var(--space-4)',
  paddingLeft: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};
const liStyle: CSSProperties = {
  fontSize: 'var(--font-size-base)',
  color: 'var(--color-neutral-700)',
  lineHeight: 1.6,
};
const quoteStyle: CSSProperties = {
  margin: '0 0 var(--space-4)',
  padding: 'var(--space-3) var(--space-4)',
  borderLeft: '3px solid var(--color-primary-400, #fb923c)',
  background: 'var(--color-neutral-50)',
  color: 'var(--color-neutral-700)',
  fontStyle: 'italic',
  lineHeight: 1.6,
};
