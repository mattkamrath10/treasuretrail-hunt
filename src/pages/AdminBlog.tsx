import { useState, type CSSProperties } from 'react';
import { ArrowLeft, ShieldAlert, Loader, Sparkles, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/apiBase';
import { BLOG_CATEGORIES, CENTRAL_VALLEY_COUNTIES, type BlogFaq } from '../lib/blog';

/**
 * Admin-only article composer. Generates a draft via the model
 * (/api/blog/generate), lets an admin edit every field, and publishes or saves
 * a draft via /api/blog/save (service-role write, also admin-gated server-side).
 * Non-admins see an access-denied panel; the endpoints are the real gate.
 */
interface Draft {
  title: string;
  slug: string;
  seo_title: string;
  meta_description: string;
  excerpt: string;
  body_md: string;
  category: string;
  tags: string[];
  county: string | null;
  city: string | null;
  faq: BlogFaq[];
  read_minutes?: number;
}

const EMPTY: Draft = {
  title: '', slug: '', seo_title: '', meta_description: '', excerpt: '',
  body_md: '', category: 'treasure-hunting', tags: [], county: null, city: null, faq: [],
};

async function authedPost(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

export default function AdminBlog({ onBack }: { onBack: () => void }) {
  const { isAdmin } = useAuth();
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('treasure-hunting');
  const [county, setCounty] = useState('');
  const [city, setCity] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div style={st.container}>
        <Header onBack={onBack} />
        <div style={st.center}>
          <ShieldAlert size={40} style={{ color: 'var(--color-neutral-400)' }} />
          <p style={st.deniedTitle}>Admin access required</p>
          <p style={st.deniedBody}>The article composer is restricted to administrators.</p>
        </div>
      </div>
    );
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const generate = async () => {
    if (topic.trim().length < 3) {
      setError('Enter a topic (at least a few words).');
      return;
    }
    setError(null);
    setNotice(null);
    setGenerating(true);
    try {
      const { draft: d } = await authedPost('/api/blog/generate', {
        topic: topic.trim(), category, county: county || undefined, city: city || undefined,
      });
      setDraft({ ...EMPTY, ...d, county: d.county ?? (county || null), city: d.city ?? (city || null) });
      setNotice('Draft generated. Review and edit before publishing.');
    } catch (e: any) {
      setError(e?.message || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const save = async (status: 'draft' | 'published') => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError('A title is required.');
      return;
    }
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const { post } = await authedPost('/api/blog/save', { post: { ...draft, status } });
      setNotice(
        status === 'published'
          ? `Published "${post?.slug}". It is now live at /blog/${post?.slug}.`
          : `Saved draft "${post?.slug}".`,
      );
    } catch (e: any) {
      setError(e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={st.container}>
      <Header onBack={onBack} />
      <div style={st.scroll}>
        <div style={st.inner}>
          {/* Generator */}
          <section style={st.card}>
            <h2 style={st.cardTitle}>Generate an article</h2>
            <label style={st.label}>Topic</label>
            <input
              style={st.input}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Best estate sales in Clovis for vintage tools"
            />
            <div style={st.row}>
              <div style={st.col}>
                <label style={st.label}>Category</label>
                <select style={st.input} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {BLOG_CATEGORIES.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div style={st.col}>
                <label style={st.label}>County (optional)</label>
                <select style={st.input} value={county} onChange={(e) => setCounty(e.target.value)}>
                  <option value="">— None —</option>
                  {CENTRAL_VALLEY_COUNTIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <label style={st.label}>City (optional)</label>
            <input
              style={st.input}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Fresno"
            />
            <button style={st.primaryBtn} onClick={generate} disabled={generating}>
              {generating ? <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkles size={16} />}
              {generating ? 'Generating…' : 'Generate draft'}
            </button>
          </section>

          {error ? <div style={st.errorBox}>{error}</div> : null}
          {notice ? <div style={st.noticeBox}>{notice}</div> : null}

          {/* Editor */}
          {draft ? (
            <section style={st.card}>
              <h2 style={st.cardTitle}>Review &amp; edit</h2>

              <label style={st.label}>Title</label>
              <input style={st.input} value={draft.title} onChange={(e) => set('title', e.target.value)} />

              <label style={st.label}>Slug</label>
              <input style={st.input} value={draft.slug} onChange={(e) => set('slug', e.target.value)} />

              <label style={st.label}>SEO title</label>
              <input style={st.input} value={draft.seo_title} onChange={(e) => set('seo_title', e.target.value)} />

              <label style={st.label}>Meta description</label>
              <textarea
                style={{ ...st.input, minHeight: 64 }}
                value={draft.meta_description}
                onChange={(e) => set('meta_description', e.target.value)}
              />

              <label style={st.label}>Excerpt</label>
              <textarea
                style={{ ...st.input, minHeight: 56 }}
                value={draft.excerpt}
                onChange={(e) => set('excerpt', e.target.value)}
              />

              <label style={st.label}>Body (markdown)</label>
              <textarea
                style={{ ...st.input, minHeight: 320, fontFamily: 'ui-monospace, monospace', fontSize: 'var(--font-size-sm)' }}
                value={draft.body_md}
                onChange={(e) => set('body_md', e.target.value)}
              />

              <label style={st.label}>Tags (comma separated)</label>
              <input
                style={st.input}
                value={draft.tags.join(', ')}
                onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
              />

              <p style={st.faqNote}>
                {draft.faq.length} FAQ {draft.faq.length === 1 ? 'item' : 'items'} included.
              </p>

              <div style={st.actions}>
                <button style={st.secondaryBtn} onClick={() => save('draft')} disabled={saving}>
                  <Save size={16} /> Save draft
                </button>
                <button style={st.primaryBtn} onClick={() => save('published')} disabled={saving}>
                  {saving ? <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={16} />}
                  {saving ? 'Saving…' : 'Publish'}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header style={st.header}>
      <button onClick={onBack} style={st.backBtn} aria-label="Back">
        <ArrowLeft size={20} />
      </button>
      <span style={st.headerTitle}>Article Composer</span>
      <div style={{ width: 36 }} />
    </header>
  );
}

const st: Record<string, CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--color-neutral-0)' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
    borderBottom: '1px solid var(--color-neutral-100)', flexShrink: 0,
  },
  backBtn: {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent', color: 'var(--color-neutral-700)', cursor: 'pointer',
  },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-900)' },
  scroll: { flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  inner: { padding: 'var(--space-4)', maxWidth: 760, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--space-8))' },
  card: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
    padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)',
    background: 'var(--color-neutral-0)', border: '1px solid var(--color-neutral-100)',
  },
  cardTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-neutral-900)', margin: '0 0 var(--space-2)' },
  label: { fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-600)', marginTop: 'var(--space-2)' },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box',
  },
  row: { display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' },
  col: { flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 'var(--space-3)',
    padding: '11px 16px', borderRadius: 'var(--radius-md)', border: 'none',
    background: 'var(--color-primary-600, #c2410c)', color: '#fff',
    fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '11px 16px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-800)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
  },
  actions: { display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap' },
  faqNote: { fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginTop: 'var(--space-2)' },
  errorBox: {
    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-error-50, #fef2f2)', color: 'var(--color-error-700, #b91c1c)',
    fontSize: 'var(--font-size-sm)', border: '1px solid var(--color-error-200, #fecaca)',
  },
  noticeBox: {
    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-neutral-50)', color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)', border: '1px solid var(--color-neutral-200)',
  },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-8) var(--space-4)', textAlign: 'center' },
  deniedTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-neutral-700)' },
  deniedBody: { fontSize: 'var(--font-size-sm)', color: 'var(--color-neutral-500)', maxWidth: 320, lineHeight: 1.5 },
};
