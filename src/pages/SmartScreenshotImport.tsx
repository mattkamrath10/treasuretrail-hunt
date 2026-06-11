import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Camera, Image as ImageIcon, Sparkles, Loader2, RefreshCw,
  CheckCircle2, AlertTriangle, ExternalLink, Gavel, Tag, Copy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AccountRequired } from '../components/AccountRequired';
import { uploadCompressedImage } from '../lib/uploadImage';
import { createMarketplaceListing } from '../lib/database';
import { MARKETPLACE_CREATE_ENABLED } from '../lib/featureFlags';
import {
  analyzeScreenshot,
  parsePriceInput,
  normalizeCategory,
  composeListingDescription,
  draftToPlainText,
  BLANK_IMPORTED_LISTING,
  IMPORT_LISTING_TYPES,
  IMPORT_CATEGORIES,
  type ImportedListing,
  type ListingType,
} from '../lib/screenshotImport';

type Step = 'pick' | 'analyzing' | 'review' | 'done';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Smart Screenshot Import — upload a screenshot of a marketplace/auction
 * listing, let the AI extract a draft, review/edit every field, then publish
 * manually. Publishing is gated by MARKETPLACE_CREATE_ENABLED (beta); the
 * extraction + review flow is always available.
 */
export default function SmartScreenshotImport() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [form, setForm] = useState<ImportedListing>(BLANK_IMPORTED_LISTING);
  const [sourceUrl, setSourceUrl] = useState('');
  const [warning, setWarning] = useState('');
  const [pickError, setPickError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof ImportedListing>(key: K, value: ImportedListing[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setPickError('');
    if (!file.type.startsWith('image/')) {
      setPickError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setPickError('Image is too large (max 8 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        setPickError("Couldn't read that file. Try another screenshot.");
        return;
      }
      setImageDataUrl(dataUrl);
      void runAnalyze(dataUrl);
    };
    reader.onerror = () => setPickError("Couldn't read that file. Try another screenshot.");
    reader.readAsDataURL(file);
  };

  const runAnalyze = async (dataUrl: string) => {
    setStep('analyzing');
    setWarning('');
    const result = await analyzeScreenshot(dataUrl);
    if (result) {
      setForm(result);
    } else {
      setForm({ ...BLANK_IMPORTED_LISTING });
      setWarning("We couldn't read that screenshot automatically. Fill in the details below — your image is still attached.");
    }
    setStep('review');
  };

  const reanalyze = () => {
    if (imageDataUrl) void runAnalyze(imageDataUrl);
  };

  const startOver = () => {
    setStep('pick');
    setImageDataUrl('');
    setForm(BLANK_IMPORTED_LISTING);
    setSourceUrl('');
    setWarning('');
    setPickError('');
    setPublishError('');
    setCopied(false);
  };

  const isAuction = form.listingType === 'Auction';

  const onCopyDetails = async () => {
    try {
      await navigator.clipboard.writeText(draftToPlainText(form, sourceUrl));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setPublishError("Couldn't copy to clipboard on this device.");
    }
  };

  const onPublish = async () => {
    if (!MARKETPLACE_CREATE_ENABLED) return;
    setPublishError('');
    if (!user) {
      setPublishError('You need to be signed in to publish.');
      return;
    }
    if (!form.title.trim()) {
      setPublishError('Add a title before publishing.');
      return;
    }
    setPublishing(true);

    let imageUrl = '';
    if (imageDataUrl) {
      try {
        const up = await uploadCompressedImage(imageDataUrl, { userId: user.id, folder: 'listings' });
        imageUrl = up.url;
      } catch {
        /* image upload is non-fatal — publish without it */
      }
    }

    const priceNum = isAuction
      ? parsePriceInput(form.currentBid) || parsePriceInput(form.price)
      : parsePriceInput(form.price);

    const { error } = await createMarketplaceListing({
      seller_id: user.id,
      title: form.title.trim(),
      description: composeListingDescription(form, sourceUrl),
      price: priceNum,
      condition: form.condition.trim() || undefined,
      category: normalizeCategory(form.category) || undefined,
      image_url: imageUrl || undefined,
      auction_enabled: isAuction,
      general_location: form.location.trim() || undefined,
      marketplace_found: form.marketplaceSource.trim() ? `custom:${form.marketplaceSource.trim()}` : undefined,
    });

    setPublishing(false);
    if (error) {
      setPublishError(error);
      return;
    }
    setStep('done');
  };

  if (!user) {
    return <AccountRequired message="Create a free account to import listings from a screenshot." />;
  }

  const validSourceUrl = /^https?:\/\/\S+$/i.test(sourceUrl.trim());
  const categoryOptions = IMPORT_CATEGORIES.includes(form.category as (typeof IMPORT_CATEGORIES)[number]) || !form.category
    ? [...IMPORT_CATEGORIES]
    : [form.category, ...IMPORT_CATEGORIES];

  return (
    <div style={st.page}>
      <header style={st.header}>
        <button onClick={() => (step === 'review' ? startOver() : navigate(-1))} style={st.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 style={st.title}>Import From Screenshot</h1>
      </header>

      <div style={st.body}>
        {step === 'pick' && (
          <>
            <section style={st.hero}>
              <span style={st.heroIcon}><Sparkles size={22} style={{ color: 'var(--color-primary-600)' }} /></span>
              <h2 style={st.heroTitle}>Turn a screenshot into a listing</h2>
              <p style={st.heroSub}>
                Snap or upload a screenshot of any marketplace or auction listing. Our AI reads it and
                fills in a draft you can review and edit before posting.
              </p>
            </section>

            <button onClick={() => cameraRef.current?.click()} style={st.pickPrimary}>
              <Camera size={18} />
              Take a Photo
            </button>
            <button onClick={() => galleryRef.current?.click()} style={st.pickSecondary}>
              <ImageIcon size={18} />
              Choose from Gallery
            </button>

            {pickError && (
              <p style={{ ...st.msg, color: 'var(--color-error-600)' }}>{pickError}</p>
            )}

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </>
        )}

        {step === 'analyzing' && (
          <div style={st.analyzing}>
            {imageDataUrl && <img src={imageDataUrl} alt="Screenshot" style={st.analyzingImg} />}
            <div style={st.analyzingRow}>
              <Loader2 size={18} style={{ color: 'var(--color-primary-600)', animation: 'spin 0.8s linear infinite' }} />
              <span>Reading your screenshot…</span>
            </div>
            <p style={st.heroSub}>This usually takes a few seconds.</p>
          </div>
        )}

        {step === 'review' && (
          <>
            {warning && (
              <div style={st.warnBox}>
                <AlertTriangle size={16} style={{ color: 'var(--color-warning-600)', flexShrink: 0 }} />
                <span>{warning}</span>
              </div>
            )}

            {imageDataUrl && (
              <div style={st.previewWrap}>
                <img src={imageDataUrl} alt="Imported screenshot" style={st.previewImg} />
                <button onClick={reanalyze} style={st.reanalyzeBtn}>
                  <RefreshCw size={14} />
                  Re-scan
                </button>
              </div>
            )}

            <div style={st.metaRow}>
              <span style={st.typePill}>
                {isAuction ? <Gavel size={13} /> : <Tag size={13} />}
                {form.listingType}
              </span>
              {form.confidenceScore > 0 && (
                <span
                  style={{
                    ...st.confPill,
                    background:
                      form.confidenceScore >= 75 ? 'var(--color-success-50)'
                        : form.confidenceScore >= 50 ? 'var(--color-warning-50)'
                          : 'var(--color-error-50)',
                    color:
                      form.confidenceScore >= 75 ? 'var(--color-success-600)'
                        : form.confidenceScore >= 50 ? 'var(--color-warning-600)'
                          : 'var(--color-error-600)',
                  }}
                >
                  <Sparkles size={12} />
                  {form.confidenceScore}% confident
                </span>
              )}
            </div>

            <SelectField
              label="Listing type"
              value={form.listingType}
              onChange={(v) => set('listingType', v as ListingType)}
              options={[...IMPORT_LISTING_TYPES]}
            />
            <TextField label="Title" value={form.title} onChange={(v) => set('title', v)} placeholder="What is it?" />
            <SelectField
              label="Category"
              value={form.category}
              onChange={(v) => set('category', v)}
              options={categoryOptions}
              placeholder="Select a category"
            />
            <div style={st.twoCol}>
              <TextField
                label={isAuction ? 'Current bid ($)' : 'Price ($)'}
                value={isAuction ? form.currentBid : form.price}
                onChange={(v) => set(isAuction ? 'currentBid' : 'price', v)}
                placeholder="0.00"
                inputMode="decimal"
              />
              <TextField label="Condition" value={form.condition} onChange={(v) => set('condition', v)} placeholder="e.g. Good" />
            </div>
            <div style={st.twoCol}>
              <TextField label="Brand" value={form.brand} onChange={(v) => set('brand', v)} placeholder="Optional" />
              <TextField label="Subcategory" value={form.subcategory} onChange={(v) => set('subcategory', v)} placeholder="Optional" />
            </div>

            {isAuction && (
              <div style={st.twoCol}>
                <TextField label="Lot #" value={form.lotNumber} onChange={(v) => set('lotNumber', v)} placeholder="Optional" />
                <TextField label="Auction ends" value={form.auctionEndDate} onChange={(v) => set('auctionEndDate', v)} placeholder="e.g. Jun 20, 7pm" />
              </div>
            )}

            <div style={st.twoCol}>
              <TextField label="Marketplace source" value={form.marketplaceSource} onChange={(v) => set('marketplaceSource', v)} placeholder="e.g. eBay" />
              <TextField label="Seller" value={form.sellerName} onChange={(v) => set('sellerName', v)} placeholder="Optional" />
            </div>
            <TextField label="Location" value={form.location} onChange={(v) => set('location', v)} placeholder="City, State or ZIP" />
            <TextField label="Original listing link" value={sourceUrl} onChange={setSourceUrl} placeholder="https:// (optional)" inputMode="url" />

            {validSourceUrl && (
              <a href={sourceUrl.trim()} target="_blank" rel="noopener noreferrer" style={st.viewOriginal}>
                <ExternalLink size={15} />
                {isAuction ? 'View Original Auction' : 'View Original Listing'}
              </a>
            )}

            <TextArea label="Description" value={form.description} onChange={(v) => set('description', v)} placeholder="Describe the item…" />

            {publishError && <p style={{ ...st.msg, color: 'var(--color-error-600)' }}>{publishError}</p>}

            {MARKETPLACE_CREATE_ENABLED ? (
              <button onClick={onPublish} disabled={publishing} style={st.publishBtn}>
                {publishing ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : <CheckCircle2 size={16} />}
                {publishing ? 'Publishing…' : 'Publish Listing'}
              </button>
            ) : (
              <>
                <div style={st.betaBox}>
                  <AlertTriangle size={16} style={{ color: 'var(--color-warning-600)', flexShrink: 0 }} />
                  <span>
                    Publishing marketplace listings is in beta and turned off for now. Your draft is ready —
                    copy the details to finish posting elsewhere, or check back once publishing is enabled.
                  </span>
                </div>
                <button onClick={onCopyDetails} style={st.publishBtn}>
                  {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy Details'}
                </button>
              </>
            )}
          </>
        )}

        {step === 'done' && (
          <div style={st.done}>
            <span style={st.doneIcon}><CheckCircle2 size={28} style={{ color: 'var(--color-success-600)' }} /></span>
            <h2 style={st.heroTitle}>Listing published</h2>
            <p style={st.heroSub}>Your imported listing is now live on the Marketplace.</p>
            <button onClick={() => navigate('/marketplace')} style={st.publishBtn}>View Marketplace</button>
            <button onClick={startOver} style={st.pickSecondary}>
              <RefreshCw size={16} />
              Import Another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder, inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'text' | 'decimal' | 'url' | 'numeric';
}) {
  return (
    <label style={st.field}>
      <span style={st.fieldLabel}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        style={st.input}
      />
    </label>
  );
}

function TextArea({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={st.field}>
      <span style={st.fieldLabel}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        style={{ ...st.input, resize: 'vertical', minHeight: 92 }}
      />
    </label>
  );
}

function SelectField({
  label, value, onChange, options, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}): ReactNode {
  return (
    <label style={st.field}>
      <span style={st.fieldLabel}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={st.input}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

const st: Record<string, CSSProperties> = {
  page: { minHeight: '100%', background: 'var(--color-neutral-0)', color: 'var(--color-neutral-900)' },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    background: 'var(--color-neutral-0)', borderBottom: '1px solid var(--color-neutral-100)',
  },
  backBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 40, height: 40, borderRadius: 'var(--radius-full)',
    border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-neutral-700)',
  },
  title: { margin: 0, fontSize: 18, fontWeight: 700 },
  body: { padding: '16px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' },

  hero: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    gap: 8, padding: '8px 4px 4px',
  },
  heroIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 52, height: 52, borderRadius: 'var(--radius-full)',
    background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-100)',
  },
  heroTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  heroSub: { margin: 0, fontSize: 13, color: 'var(--color-neutral-500)', lineHeight: 1.5, textAlign: 'center' },

  pickPrimary: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600)', color: '#fff', fontSize: 15, fontWeight: 700,
  },
  pickSecondary: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 16px', borderRadius: 12, cursor: 'pointer',
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)', fontSize: 15, fontWeight: 700,
  },

  analyzing: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 0' },
  analyzingImg: { maxWidth: 200, maxHeight: 200, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--color-neutral-100)' },
  analyzingRow: { display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700 },

  warnBox: {
    display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10,
    background: 'var(--color-warning-50)', border: '1px solid var(--color-neutral-100)',
    color: 'var(--color-warning-600)', fontSize: 13, lineHeight: 1.4,
  },
  betaBox: {
    display: 'flex', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10,
    background: 'var(--color-warning-50)', border: '1px solid var(--color-neutral-100)',
    color: 'var(--color-warning-600)', fontSize: 13, lineHeight: 1.45,
  },

  previewWrap: { position: 'relative', alignSelf: 'flex-start' },
  previewImg: { maxWidth: '100%', maxHeight: 220, borderRadius: 12, border: '1px solid var(--color-neutral-100)', display: 'block' },
  reanalyzeBtn: {
    position: 'absolute', bottom: 8, right: 8,
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px',
    borderRadius: 'var(--radius-full)', border: 'none', cursor: 'pointer',
    background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: 700,
  },

  metaRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typePill: {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
    borderRadius: 'var(--radius-full)', background: 'var(--color-primary-50)',
    color: 'var(--color-primary-700)', fontSize: 12, fontWeight: 700,
  },
  confPill: {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
    borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 700,
  },

  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: 700, color: 'var(--color-neutral-600)' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10,
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)', fontSize: 16, outline: 'none',
  },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },

  viewOriginal: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '11px 16px', borderRadius: 10, textDecoration: 'none',
    border: '1px solid var(--color-neutral-200)', background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-900)', fontSize: 14, fontWeight: 700,
  },

  publishBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600)', color: '#fff', fontSize: 15, fontWeight: 700,
  },

  done: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '24px 0' },
  doneIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 60, height: 60, borderRadius: 'var(--radius-full)',
    background: 'var(--color-success-50)', border: '1px solid var(--color-neutral-100)',
  },

  msg: { margin: 0, fontSize: 13, fontWeight: 600, textAlign: 'center' },
};
