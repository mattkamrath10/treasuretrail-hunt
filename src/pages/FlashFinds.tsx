import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, ArrowRight, X, MapPin, DollarSign, Tag, Sparkles, Eye, CircleCheck as CheckCircle, Image, Pencil, Plus, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GuestOverlay } from '../components/GuestGate';
import AiAnalysisPage from './AiAnalysis';
import { createCommunityPost, createFlashFind } from '../lib/database';
import { supabase } from '../lib/supabase';

type FlowStep = 'main' | 'photo' | 'details' | 'ai-analysis' | 'confirmation';

const CATEGORIES = [
  'Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques',
  'Art', 'Jewelry', 'Watches', 'Toys', 'Tools', 'Clothing', 'Other',
];

const MARKETPLACES: { key: string; label: string }[] = [
  { key: 'facebook_marketplace', label: 'Facebook Marketplace' },
  { key: 'ebay',                 label: 'eBay' },
  { key: 'whatnot',              label: 'Whatnot' },
  { key: 'offerup',              label: 'OfferUp' },
  { key: 'craigslist',           label: 'Craigslist' },
  { key: 'mercari',              label: 'Mercari' },
  { key: 'poshmark',             label: 'Poshmark' },
  { key: 'hibid',                label: 'HiBid' },
  { key: 'maxsold',              label: 'MaxSold' },
  { key: 'etsy',                 label: 'Etsy' },
  { key: 'bonanza',              label: 'Bonanza' },
  { key: 'local_auction_house',  label: 'Local Auction House' },
  { key: 'other',                label: 'Other' },
];

export function getMarketplaceLabel(key?: string | null): string | null {
  if (!key) return null;
  const match = MARKETPLACES.find((m) => m.key === key);
  if (match && match.key !== 'other') return match.label;
  return key.replace(/^custom:/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FlashFinds() {
  const { isGuest, user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<FlowStep>('main');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    category: '',
    notes: '',
    price: '',
    location: '',
    marketplace: '',
    marketplaceCustom: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setPhotoUrl(url);
      setStep('photo');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCameraInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = '';
  };

  const openCamera = () => {
    cameraInputRef.current?.click();
  };

  const openGallery = () => {
    galleryInputRef.current?.click();
  };

  const handlePhotoConfirm = () => {
    setStep('details');
  };

  const handleDetailsSubmit = () => {
    if (form.marketplace === 'other' && !form.marketplaceCustom.trim()) {
      setSubmitError('Please enter the marketplace name, or pick a different option.');
      return;
    }
    setSubmitError('');
    setStep('ai-analysis');
  };

  const handleAiDone = async () => {
    if (!user) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      let imageUrl: string | undefined;

      if (photoUrl) {
        try {
          const res = await fetch(photoUrl);
          const blob = await res.blob();
          const ext = blob.type.split('/')[1] || 'jpg';
          const path = `finds/${user.id}/${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from('avatars')
            .upload(path, blob, { upsert: true, contentType: blob.type });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
            imageUrl = urlData.publicUrl;
          }
        } catch {
          // Image upload failed — continue without image URL
        }
      }

      const marketplaceValue =
        form.marketplace === 'other' && form.marketplaceCustom.trim()
          ? `custom:${form.marketplaceCustom.trim()}`
          : form.marketplace || undefined;

      const { error: postErr } = await createCommunityPost({
        user_id: user.id,
        type: 'flash_find',
        caption: form.notes || form.title || 'New find',
        image_url: imageUrl,
        tags: form.category ? [form.category] : [],
        location: form.location || undefined,
        location_found: form.location || undefined,
        marketplace_found: marketplaceValue,
        estimated_value: form.price ? parseFloat(form.price) : undefined,
        category: form.category || undefined,
      });

      if (postErr) throw new Error(postErr);

      await createFlashFind({
        user_id: user.id,
        title: form.title || 'Untitled Find',
        description: form.notes || undefined,
        image_url: imageUrl,
        estimated_value: form.price ? parseFloat(form.price) : undefined,
        category: form.category || undefined,
        location: form.location || undefined,
      });

      setStep('confirmation');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep('main');
    setPhotoUrl(null);
    setForm({ title: '', category: '', notes: '', price: '', location: '', marketplace: '', marketplaceCustom: '' });
    setSubmitError('');
  };

  if (isGuest) {
    return (
      <div style={{ height: '100%', position: 'relative' }}>
        <GuestOverlay
          title="Flash Finds"
          subtitle="Snap photos of your finds, get instant AI valuations, and share with the community."
        />
      </div>
    );
  }

  return (
    <>
      {/* Hidden file inputs — camera capture */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraInputChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      {/* Hidden file input — gallery / file picker */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleCameraInputChange}
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {step === 'main' && (
        <MainScreen onCamera={openCamera} onGallery={openGallery} />
      )}

      {step === 'photo' && (
        <PhotoPreview
          photoUrl={photoUrl}
          onConfirm={handlePhotoConfirm}
          onRetakeCamera={openCamera}
          onRetakeGallery={openGallery}
          onBack={handleReset}
        />
      )}

      {step === 'details' && (
        <DetailsForm
          photoUrl={photoUrl}
          form={form}
          setForm={(f) => { setForm(f); if (submitError) setSubmitError(''); }}
          onSubmit={handleDetailsSubmit}
          onBack={() => setStep('photo')}
          error={submitError}
        />
      )}

      {step === 'ai-analysis' && (
        <AiAnalysisPage
          form={form}
          onDone={handleAiDone}
          onBack={() => setStep('details')}
          submitting={submitting}
          submitError={submitError}
        />
      )}

      {step === 'confirmation' && (
        <Confirmation
          photoUrl={photoUrl}
          form={form}
          onPostAnother={handleReset}
          onViewFeed={() => navigate('/community')}
          onEdit={() => setStep('details')}
        />
      )}
    </>
  );
}

function MainScreen({
  onCamera,
  onGallery,
}: {
  onCamera: () => void;
  onGallery: () => void;
}) {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Flash Finds</h1>
        <p style={styles.headerSubtitle}>Snap. Identify. Sell.</p>
      </header>

      <div style={styles.mainContent}>
        <div style={styles.uploadHero}>
          <div style={styles.uploadRings}>
            <div style={styles.ringOuter} />
            <div style={styles.ringMiddle} />
            <button onClick={onCamera} style={styles.uploadBtn}>
              <Camera size={36} style={{ color: 'var(--color-neutral-0)' }} />
            </button>
          </div>
          <h2 style={styles.heroTitle}>Snap a Find</h2>
          <p style={styles.heroSubtitle}>Photograph any treasure and get instant AI analysis</p>
        </div>

        <div style={styles.quickActions}>
          <button onClick={onCamera} style={styles.quickAction}>
            <div style={styles.quickActionIcon}>
              <Camera size={20} style={{ color: 'var(--color-primary-600)' }} />
            </div>
            <span style={styles.quickActionLabel}>Take Photo</span>
          </button>
          <button onClick={onGallery} style={styles.quickAction}>
            <div style={styles.quickActionIcon}>
              <Image size={20} style={{ color: 'var(--color-secondary-600)' }} />
            </div>
            <span style={styles.quickActionLabel}>From Gallery</span>
          </button>
        </div>

        <div style={styles.tipsSection}>
          <h3 style={styles.tipsTitle}>Tips for best results</h3>
          <div style={styles.tipsList}>
            <div style={styles.tip}>
              <span style={styles.tipNumber}>1</span>
              <span style={styles.tipText}>Good lighting, no shadows</span>
            </div>
            <div style={styles.tip}>
              <span style={styles.tipNumber}>2</span>
              <span style={styles.tipText}>Capture labels and markings</span>
            </div>
            <div style={styles.tip}>
              <span style={styles.tipNumber}>3</span>
              <span style={styles.tipText}>Show front, back, and details</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoPreview({
  photoUrl,
  onConfirm,
  onRetakeCamera,
  onRetakeGallery,
  onBack,
}: {
  photoUrl: string | null;
  onConfirm: () => void;
  onRetakeCamera: () => void;
  onRetakeGallery: () => void;
  onBack: () => void;
}) {
  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Photo Preview</span>
        <button onClick={onBack} style={styles.closeBtn}>
          <X size={20} />
        </button>
      </header>

      <div style={styles.photoContent}>
        <div style={styles.photoPreviewContainer}>
          {photoUrl ? (
            <>
              <img
                src={photoUrl}
                alt="Captured find"
                style={styles.previewImage}
              />
              <div style={styles.photoOverlay}>
                <span style={styles.photoHint}>AI will analyze this image</span>
              </div>
            </>
          ) : (
            <div style={styles.cameraPlaceholder}>
              <Camera size={48} style={{ color: 'var(--color-neutral-400)' }} />
              <p style={styles.placeholderText}>No photo captured</p>
            </div>
          )}
        </div>

        <div style={styles.retakeOptions}>
          <button onClick={onRetakeCamera} style={styles.retakeOptionBtn}>
            <Camera size={16} />
            <span>Retake Photo</span>
          </button>
          <button onClick={onRetakeGallery} style={styles.retakeOptionBtn}>
            <Image size={16} />
            <span>Choose Different</span>
          </button>
        </div>

        <div style={styles.photoActions}>
          <button
            onClick={onConfirm}
            style={{ ...styles.usePhotoBtn, opacity: photoUrl ? 1 : 0.5 }}
            disabled={!photoUrl}
          >
            <CheckCircle size={18} />
            <span>Use This Photo</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailsForm({
  photoUrl,
  form,
  setForm,
  onSubmit,
  onBack,
  error,
}: {
  photoUrl: string | null;
  form: { title: string; category: string; notes: string; price: string; location: string; marketplace: string; marketplaceCustom: string };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  onBack: () => void;
  error?: string;
}) {
  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Item Details</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.detailsContent}>
        <div style={styles.miniPreview}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Your find"
              style={{ ...styles.miniImage, objectFit: 'cover' }}
            />
          ) : (
            <div style={{ ...styles.miniImage, backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
              <Camera size={20} style={{ color: 'var(--color-neutral-400)' }} />
            </div>
          )}
          <div style={styles.miniMeta}>
            <span style={styles.miniLabel}>Your find</span>
            <span style={styles.miniHint}>Add details below</span>
          </div>
        </div>

        <div style={styles.formFields}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Item Title</label>
            <input
              type="text"
              placeholder="What did you find?"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Category</label>
            <div style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setForm({ ...form, category: cat })}
                  style={{
                    ...styles.categoryChip,
                    ...(form.category === cat ? styles.categoryChipActive : {}),
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Price Found At</label>
            <div style={styles.priceWrapper}>
              <DollarSign size={16} style={{ color: 'var(--color-neutral-400)' }} />
              <input
                type="text"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                style={styles.priceInput}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Location Found <span style={styles.fieldOptional}>(optional)</span></label>
            <div style={styles.locationWrapper}>
              <MapPin size={16} style={{ color: 'var(--color-neutral-400)' }} />
              <input
                type="text"
                placeholder="Phoenix AZ, Storage Locker, Estate Sale…"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                style={styles.locationInput}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Marketplace Found <span style={styles.fieldOptional}>(optional)</span></label>
            <div style={styles.categoryGrid}>
              {MARKETPLACES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => {
                    const isClearing = form.marketplace === m.key;
                    setForm({
                      ...form,
                      marketplace: isClearing ? '' : m.key,
                      marketplaceCustom: m.key === 'other' && !isClearing ? form.marketplaceCustom : '',
                    });
                  }}
                  style={{
                    ...styles.categoryChip,
                    ...(form.marketplace === m.key ? styles.categoryChipActive : {}),
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {form.marketplace === 'other' && (
              <div style={{ ...styles.locationWrapper, marginTop: 'var(--space-2)' }}>
                <ShoppingBag size={16} style={{ color: 'var(--color-neutral-400)' }} />
                <input
                  type="text"
                  placeholder="Enter marketplace name"
                  value={form.marketplaceCustom}
                  onChange={(e) => setForm({ ...form, marketplaceCustom: e.target.value })}
                  style={styles.locationInput}
                />
              </div>
            )}
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Notes (optional)</label>
            <textarea
              placeholder="Condition, backstory, anything interesting..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={styles.textarea}
              rows={3}
            />
          </div>
        </div>

        {error && (
          <div style={styles.detailsError}>{error}</div>
        )}

        <button onClick={onSubmit} style={styles.continueBtn}>
          <Sparkles size={18} style={{ color: 'var(--color-neutral-0)' }} />
          <span style={styles.continueBtnText}>Analyze with AI</span>
          <ArrowRight size={18} style={{ color: 'var(--color-neutral-0)' }} />
        </button>
      </div>
    </div>
  );
}

function Confirmation({
  photoUrl,
  form,
  onPostAnother,
  onViewFeed,
  onEdit,
}: {
  photoUrl: string | null;
  form: { title: string; category: string; notes: string; price: string; location: string; marketplace: string; marketplaceCustom: string };
  onPostAnother: () => void;
  onViewFeed: () => void;
  onEdit: () => void;
}) {
  const marketplaceLabel =
    form.marketplace === 'other' && form.marketplaceCustom.trim()
      ? form.marketplaceCustom.trim()
      : getMarketplaceLabel(form.marketplace);
  return (
    <div style={styles.container}>
      <div style={styles.confirmContent}>
        <div style={styles.successHeader}>
          <div style={styles.successIcon}>
            <CheckCircle size={40} style={{ color: 'var(--color-success-500)' }} />
          </div>
          <h2 style={styles.successTitle}>Find Posted!</h2>
          <p style={styles.successSubtitle}>Your treasure is now live in the feed</p>
        </div>

        <div style={styles.postedCard}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={form.title || 'Your find'}
              style={{ ...styles.postedImage, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
            />
          ) : (
            <div style={{ ...styles.postedImage, backgroundColor: 'var(--color-neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
              <Camera size={24} style={{ color: 'var(--color-neutral-400)' }} />
            </div>
          )}
          <div style={styles.postedInfo}>
            <h3 style={styles.postedTitle}>{form.title}</h3>
            <div style={styles.postedMeta}>
              <span style={styles.postedCategory}>
                <Tag size={12} /> {form.category || 'Antiques'}
              </span>
              {form.price && (
                <span style={styles.postedPrice}>
                  <DollarSign size={12} /> {form.price}
                </span>
              )}
              {form.location && (
                <span style={styles.postedLocation}>
                  <MapPin size={12} /> {form.location}
                </span>
              )}
              {marketplaceLabel && (
                <span style={styles.postedLocation}>
                  <ShoppingBag size={12} /> {marketplaceLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={styles.confirmActions}>
          <button onClick={onViewFeed} style={styles.viewFeedBtn}>
            <Eye size={18} />
            <span>View in Feed</span>
          </button>
          <button onClick={onEdit} style={styles.editBtn}>
            <Pencil size={18} />
            <span>Edit Find</span>
          </button>
          <button onClick={onPostAnother} style={styles.postAnotherBtn}>
            <Plus size={18} style={{ color: 'var(--color-neutral-0)' }} />
            <span style={{ color: 'var(--color-neutral-0)' }}>Post Another</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
  },
  header: {
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  headerSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    marginTop: '2px',
  },
  mainContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  uploadHero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-10) 0 var(--space-8)',
  },
  uploadRings: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '140px',
    height: '140px',
    marginBottom: 'var(--space-5)',
  },
  ringOuter: {
    position: 'absolute',
    width: '140px',
    height: '140px',
    borderRadius: 'var(--radius-full)',
    border: '2px solid var(--color-primary-100)',
    animation: 'pulse 2s ease-in-out infinite',
  },
  ringMiddle: {
    position: 'absolute',
    width: '110px',
    height: '110px',
    borderRadius: 'var(--radius-full)',
    border: '2px solid var(--color-primary-200)',
    animation: 'pulse 2s ease-in-out infinite 0.3s',
  },
  uploadBtn: {
    width: '80px',
    height: '80px',
    borderRadius: 'var(--radius-full)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 32px rgba(234, 179, 8, 0.35)',
    transition: 'transform var(--transition-fast)',
    position: 'relative',
    zIndex: 1,
  },
  heroTitle: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-1)',
  },
  heroSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
    textAlign: 'center',
    maxWidth: '260px',
  },
  quickActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    width: '100%',
    marginBottom: 'var(--space-8)',
  },
  quickAction: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-50)',
    transition: 'all var(--transition-fast)',
  },
  quickActionIcon: {
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'var(--shadow-sm)',
  },
  quickActionLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  tipsSection: {
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-100)',
  },
  tipsTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
    marginBottom: 'var(--space-3)',
  },
  tipsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  tip: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  tipNumber: {
    width: '22px',
    height: '22px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-100)',
    color: 'var(--color-primary-700)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-bold)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipText: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
  },

  // Step header
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--color-neutral-100)',
    flexShrink: 0,
  },
  backBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-600)',
  },
  closeBtn: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-neutral-400)',
  },
  stepLabel: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
  },

  // Photo preview
  photoContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  photoPreviewContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 'var(--space-4)',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
    display: 'flex',
    justifyContent: 'center',
  },
  photoHint: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-0)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    backdropFilter: 'blur(4px)',
  },
  cameraPlaceholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-900)',
    height: '100%',
  },
  placeholderText: {
    color: 'var(--color-neutral-400)',
    fontSize: 'var(--font-size-sm)',
  },
  retakeOptions: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4) 0',
    backgroundColor: 'var(--color-neutral-0)',
  },
  retakeOptionBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-600)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    backgroundColor: 'var(--color-neutral-50)',
  },
  photoActions: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4) var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  retakeBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },
  usePhotoBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    transition: 'opacity 0.2s',
  },

  // Details form
  detailsContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
  },
  miniPreview: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-neutral-50)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-5)',
  },
  miniImage: {
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },
  miniMeta: {
    display: 'flex',
    flexDirection: 'column',
  },
  miniLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-800)',
  },
  miniHint: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-400)',
  },
  formFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
    flex: 1,
    marginBottom: 'var(--space-4)',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  fieldLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-700)',
  },
  fieldOptional: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-regular)',
    color: 'var(--color-neutral-400)',
    marginLeft: '4px',
  },
  detailsError: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error-600)',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-error-50)',
    border: '1px solid var(--color-error-200)',
    lineHeight: 1.4,
    marginTop: 'var(--space-3)',
  },
  input: {
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    width: '100%',
  },
  categoryGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },
  categoryChip: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-50)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--color-neutral-600)',
    transition: 'all var(--transition-fast)',
  },
  categoryChipActive: {
    backgroundColor: 'var(--color-primary-50)',
    borderColor: 'var(--color-primary-300)',
    color: 'var(--color-primary-700)',
  },
  priceWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
  },
  priceInput: {
    flex: 1,
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'transparent',
  },
  locationWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
  },
  locationInput: {
    flex: 1,
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'transparent',
  },
  textarea: {
    padding: 'var(--space-3) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
    border: '1px solid var(--color-neutral-200)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-neutral-900)',
    resize: 'none',
    fontFamily: 'inherit',
    width: '100%',
  },
  continueBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    color: 'var(--color-neutral-0)',
    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)',
    marginTop: 'auto',
  },
  continueBtnText: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-0)',
  },

  // Confirmation
  confirmContent: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-6) var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  successHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 'var(--space-6)',
  },
  successIcon: {
    width: '72px',
    height: '72px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-50)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-4)',
  },
  successTitle: {
    fontSize: 'var(--font-size-2xl)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    marginBottom: 'var(--space-1)',
  },
  successSubtitle: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-500)',
  },
  postedCard: {
    display: 'flex',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-50)',
    width: '100%',
    marginBottom: 'var(--space-6)',
  },
  postedImage: {
    width: '64px',
    height: '64px',
    flexShrink: 0,
  },
  postedInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    flex: 1,
    overflow: 'hidden',
  },
  postedTitle: {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-900)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  postedMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    alignItems: 'center',
  },
  postedCategory: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-600)',
  },
  postedPrice: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-success-600)',
    fontWeight: 'var(--font-weight-medium)',
  },
  postedLocation: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-neutral-500)',
  },
  confirmActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    width: '100%',
  },
  viewFeedBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },
  editBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
  },
  postAnotherBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-accent-500))',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
  },
};
