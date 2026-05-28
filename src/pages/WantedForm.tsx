import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, X, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createWantedItem, WANTED_CATEGORY_LABEL, type WantedCategory } from '../lib/wanted';
import { uploadCompressedImage } from '../lib/uploadImage';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';

const LOG = '[WANTED_FORM]';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export default function WantedForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<WantedCategory>('collectibles');
  const [maxBudget, setMaxBudget] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!user) {
    return (
      <div style={s.gate}>
        <h2>Sign in to post wanted items</h2>
        <button onClick={onBack} style={s.gateBtn}>Back</button>
      </div>
    );
  }

  const onPickImage = async (file: File) => {
    setErr(null);
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const up = await uploadCompressedImage(dataUrl, { userId: user.id, folder: 'wanted' });
      setImageUrl(up.url);
      setThumbUrl(up.thumbUrl);
      console.log(LOG, 'image:upload:ok', up.url);
    } catch (e: any) {
      console.error(LOG, 'image:upload:fail', e);
      setErr(`Image upload failed: ${e?.message ?? 'unknown'}`);
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    setErr(null);
    if (!title.trim()) { setErr('Title is required'); return; }
    if (title.trim().length < 2) { setErr('Title must be at least 2 characters'); return; }
    setSaving(true);
    try {
      const budget = maxBudget.trim() ? Number(maxBudget) : null;
      if (budget != null && !Number.isFinite(budget)) {
        setErr('Budget must be a number'); setSaving(false); return;
      }
      const row = await createWantedItem(user.id, {
        title: title.trim(),
        description: description.trim(),
        category,
        max_budget: budget,
        city: city.trim() || null,
        region: region.trim() || null,
        image_url: imageUrl,
        thumb_url: thumbUrl,
      });
      console.log(LOG, 'save:ok', row.id);
      navigate('/wanted');
    } catch (e: any) {
      console.error(LOG, 'save:fail', e);
      setErr(`Couldn't post: ${e?.message ?? 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button onClick={onBack} style={s.backBtn} aria-label="Back"><ArrowLeft size={20} /></button>
        <h1 style={s.headerTitle}>New wanted post</h1>
        <span style={{ width: 36 }} />
      </header>

      <form style={s.form} onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        {/* Image picker */}
        <label style={s.cover}>
          {imageUrl ? (
            <ImageWithFade
              src={thumbUrl ?? imageUrl}
              fallbackSrc={imageUrl}
              alt="Wanted item"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={<MediaFallback kind="wanted" seed={title || 'wanted'} label={title} />}
            />
          ) : (
            <div style={s.coverPlaceholder}>
              <Camera size={26} />
              <span>{uploading ? 'Uploading…' : 'Add a reference photo (optional)'}</span>
            </div>
          )}
          <input
            type="file" accept="image/*" capture="environment"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); }}
            style={{ display: 'none' }}
            disabled={uploading}
          />
          {imageUrl && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setImageUrl(null); setThumbUrl(null); }}
              style={s.coverClear}
              aria-label="Remove image"
            >
              <X size={14} />
            </button>
          )}
        </label>

        <Field label="What are you looking for?" required>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Vintage Pokémon cards, mid-century chair"
            style={s.input} maxLength={120}
          />
        </Field>

        <Field label="Details">
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Condition, era, brand, any specifics that help sellers find you a match."
            style={{ ...s.input, height: 100, resize: 'vertical' }}
            maxLength={2000}
          />
        </Field>

        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as WantedCategory)} style={s.input}>
            {(Object.entries(WANTED_CATEGORY_LABEL) as [WantedCategory, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>

        <div style={s.row2}>
          <Field label="Max budget ($)">
            <input
              value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)}
              placeholder="Optional"
              inputMode="decimal" style={s.input}
            />
          </Field>
          <Field label="City">
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Optional" style={s.input} />
          </Field>
        </div>

        <Field label="State / region">
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Optional" style={s.input} />
        </Field>

        {err && <p style={s.err}>{err}</p>}

        <button type="submit" disabled={saving || uploading} style={s.cta}>
          <Search size={16} />
          {saving ? 'Posting…' : 'Post wanted item'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={s.field}>
      <span style={s.fieldLabel}>{label}{required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}</span>
      {children}
    </label>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100%', background: '#0b0b10', color: '#f5f5f7', paddingBottom: 40 },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px',
    background: 'rgba(11,11,16,0.92)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff', cursor: 'pointer',
  },
  headerTitle: { margin: 0, fontSize: 16, fontWeight: 800 },
  form: { display: 'flex', flexDirection: 'column', gap: 14, padding: 16, maxWidth: 560, margin: '0 auto' },
  cover: {
    position: 'relative',
    width: '100%', aspectRatio: '16 / 9', overflow: 'hidden',
    borderRadius: 14, cursor: 'pointer',
    background: '#15151a',
    border: '1px dashed rgba(255,255,255,0.18)',
  },
  coverPlaceholder: {
    width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
    color: 'rgba(245,245,247,0.55)', fontSize: 12,
  },
  coverClear: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: '50%',
    background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none',
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: 700, color: 'rgba(245,245,247,0.75)', letterSpacing: '0.02em' },
  input: {
    width: '100%', minHeight: 44, padding: '10px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    color: '#fff', fontSize: 14, outline: 'none',
    fontFamily: 'inherit',
  },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  err: {
    margin: 0, padding: '10px 12px',
    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)',
    borderRadius: 10, color: '#fca5a5', fontSize: 12,
  },
  cta: {
    marginTop: 8, minHeight: 52, padding: '14px 16px',
    background: 'linear-gradient(135deg, #10b981, #047857)',
    color: '#fff', border: 'none', borderRadius: 999,
    fontSize: 14, fontWeight: 800, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  gate: { padding: 24, color: '#fff', textAlign: 'center' },
  gateBtn: { marginTop: 12, padding: '10px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', cursor: 'pointer' },
};
