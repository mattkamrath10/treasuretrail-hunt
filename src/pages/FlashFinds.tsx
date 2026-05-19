import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, ArrowRight, X, MapPin, DollarSign, Tag, Sparkles, Eye, CircleCheck as CheckCircle, Image, Pencil, Plus, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GuestOverlay } from '../components/GuestGate';
import AiAnalysisPage, { type AnalysisDonePayload } from './AiAnalysis';
import { createCommunityPost, createFlashFind } from '../lib/database';
import { supabase, type CommunityPost } from '../lib/supabase';
import {
  shareToRareRadar,
  saveAnalysis,
  watchTrend,
  shareItem,
} from '../lib/itemIntelligence';

type FlowStep = 'main' | 'photo' | 'details' | 'ai-analysis' | 'confirmation';

const CATEGORIES = [
  'Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques',
  'Art', 'Jewelry', 'Watches', 'Toys', 'Tools', 'Clothing', 'Other',
];

interface FlashFindForm {
  title: string;
  category: string;
  notes: string;
  price: string;
  location: string;
  marketplace: string;
  marketplaceCustom: string;
  general_location: string;
  exact_address_private: string;
  address_reveal_policy: 'on_contact' | 'on_appointment' | 'on_purchase' | 'never';
  pickup_type: string[];
  shipping_available: boolean;
  scout_needed: boolean;
  scouts_available: boolean;
  meetup_notes: string;
}

import LocationFields, { isValidGeneralLocation, type LocationValue } from '../components/listing/LocationFields';
import PickupTypeChips from '../components/listing/PickupTypeChips';
import MarketplaceFoundSelect, { getMarketplaceLabel as _shared_getMarketplaceLabel } from '../components/listing/MarketplaceFoundSelect';
import ScoutToggles from '../components/listing/ScoutToggles';
import SafetyReminder from '../components/listing/SafetyReminder';

// Legacy shape kept for callers that still import it from this file.
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
  const shared = _shared_getMarketplaceLabel(key);
  if (shared && shared !== key) return shared;
  if (!key) return null;
  const match = MARKETPLACES.find((m) => m.key === key);
  if (match && match.key !== 'other') return match.label;
  return key.replace(/^custom:/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FlashFinds() {
  const { isGuest, user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<FlowStep>('main');
  // We keep the full created post (not just the id) so the Home feed
  // can OPTIMISTICALLY prepend it without waiting for the next poll —
  // see Home.tsx navState.newPost handling. This is what makes a
  // freshly-uploaded Flash Find appear "instantly" in the feed.
  const [lastCreatedPost, setLastCreatedPost] = useState<CommunityPost | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [form, setForm] = useState<FlashFindForm>({
    title: '',
    category: '',
    notes: '',
    price: '',
    location: '',
    marketplace: '',
    marketplaceCustom: '',
    general_location: '',
    exact_address_private: '',
    address_reveal_policy: 'on_contact',
    pickup_type: [],
    shipping_available: false,
    scout_needed: false,
    scouts_available: false,
    meetup_notes: '',
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
    // Hard pre-insert validation: title and category are REQUIRED so the
    // resulting post never renders as a near-empty card on the feed. The
    // DB layer still defaults missing values defensively (see
    // createCommunityPost) but blocking here gives the user a clear UI
    // error instead of a silently-renamed "Untitled Find" post.
    if (!form.title.trim()) {
      setSubmitError('Add a title for your find so the community knows what you posted.');
      return;
    }
    if (!form.category.trim()) {
      setSubmitError('Pick a category so your find shows up in the right filters.');
      return;
    }
    if (form.marketplace === 'other' && !form.marketplaceCustom.trim()) {
      setSubmitError('Please enter the marketplace name, or pick a different option.');
      return;
    }
    if (!isValidGeneralLocation(form.general_location)) {
      setSubmitError('Add a general location — a 5-digit ZIP or "City, ST" — so buyers can filter local finds.');
      return;
    }
    setSubmitError('');
    setStep('ai-analysis');
  };

  const handleAiDone = async (payload: AnalysisDonePayload) => {
    if (!user) return;
    setSubmitting(true);
    setSubmitError('');

    const { editedForm, actions, intelligence } = payload;
    const mergedForm: FlashFindForm = {
      ...form,
      title: editedForm.title,
      category: editedForm.category,
      notes: editedForm.notes,
      price: editedForm.price,
      scout_needed: form.scout_needed || actions.includes('send_scouts'),
    };
    setForm(mergedForm);

    const completed: string[] = [];

    try {
      // Upload image once — used by every action that needs it.
      // The upload is best-effort (the post still goes out without an
      // image if storage fails), but we now log the failure with the
      // [FLASH_UPLOAD] prefix so a broken-card report can be traced back
      // to a storage RLS / bucket issue instead of being silent.
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
          if (uploadErr) {
            console.error('[FLASH_UPLOAD] storage upload failed', {
              bucket: 'avatars',
              path,
              code: (uploadErr as { statusCode?: string }).statusCode,
              message: uploadErr.message,
            });
          } else {
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
            imageUrl = urlData.publicUrl;
            console.log('[FLASH_UPLOAD] storage upload ok', { path, url: !!imageUrl });
          }
        } catch (e) {
          console.error('[FLASH_UPLOAD] storage upload threw', e);
        }
      }

      const priceNum = mergedForm.price ? parseFloat(mergedForm.price) : null;
      const priceForDb = priceNum !== null && Number.isFinite(priceNum) ? priceNum : undefined;

      const needsFlashFindPost =
        actions.includes('post_flash_finds') || actions.includes('send_scouts');

      // 1. Post to Flash Finds (also covers Send to Scouts, which needs the post).
      if (needsFlashFindPost) {
        const marketplaceValue =
          mergedForm.marketplace === 'other' && mergedForm.marketplaceCustom.trim()
            ? `custom:${mergedForm.marketplaceCustom.trim()}`
            : mergedForm.marketplace || undefined;

        const { error: ffErr } = await createFlashFind({
          user_id: user.id,
          title: mergedForm.title || 'Untitled Find',
          description: mergedForm.notes || undefined,
          image_url: imageUrl,
          estimated_value: priceForDb,
          category: mergedForm.category || undefined,
          location: mergedForm.location || undefined,
        });
        if (ffErr) throw new Error(ffErr);

        const { data: createdPost, error: postErr } = await createCommunityPost({
          user_id: user.id,
          type: 'flash_find',
          caption: mergedForm.notes || mergedForm.title || 'New find',
          image_url: imageUrl,
          tags: mergedForm.category ? [mergedForm.category] : [],
          location: mergedForm.general_location || mergedForm.location || undefined,
          location_found: mergedForm.general_location || mergedForm.location || undefined,
          marketplace_found: marketplaceValue,
          estimated_value: priceForDb,
          category: mergedForm.category || undefined,
          general_location: mergedForm.general_location || undefined,
          exact_address_private: mergedForm.exact_address_private.trim() || undefined,
          address_reveal_policy: mergedForm.address_reveal_policy,
          pickup_type: mergedForm.pickup_type.length ? mergedForm.pickup_type : undefined,
          shipping_available:
            mergedForm.shipping_available ||
            mergedForm.pickup_type.includes('shipping_available') ||
            mergedForm.pickup_type.includes('nationwide_shipping'),
          scout_needed: mergedForm.scout_needed,
          scouts_available: mergedForm.scouts_available,
          meetup_notes: mergedForm.meetup_notes.trim() || undefined,
        });

        if (postErr) throw new Error(postErr);
        if (createdPost?.id) setLastCreatedPost(createdPost);

        if (actions.includes('post_flash_finds')) completed.push('Posted to Flash Finds');
        if (actions.includes('send_scouts')) completed.push('Scout request flagged');
      }

      // 2. Share to Rare Radar — saves a local draft visible on the Rare Radar page.
      if (actions.includes('share_rare_radar')) {
        shareToRareRadar({
          title: mergedForm.title || 'Untitled Find',
          category: mergedForm.category || 'Other',
          condition: editedForm.condition,
          notes: mergedForm.notes,
          imageUrl: imageUrl ?? photoUrl ?? null,
          budgetLow: intelligence.resale?.low ?? null,
          budgetHigh: intelligence.resale?.high ?? null,
        });
        completed.push('Shared to Rare Radar');
      }

      // 3. Save Analysis — local storage so the user can revisit later.
      if (actions.includes('save_analysis')) {
        saveAnalysis({
          title: mergedForm.title || 'Untitled Find',
          category: mergedForm.category || 'Other',
          condition: editedForm.condition,
          purchasePrice: priceNum,
          notes: mergedForm.notes,
          imageUrl: imageUrl ?? photoUrl ?? null,
          intelligence,
        });
        completed.push('Analysis saved');
      }

      // 4. Watch Trends — keep keyword/category interest.
      if (actions.includes('watch_trends')) {
        watchTrend({
          category: mergedForm.category || 'Other',
          keywords: intelligence.keywords,
        });
        completed.push('Trend tracking on');
      }

      // 5. Share — native share sheet with clipboard fallback.
      if (actions.includes('share')) {
        const summary = [
          mergedForm.title || 'Check out my latest find on TreasureTrail',
          intelligence.resale
            ? `Est. resale: $${intelligence.resale.low} – $${intelligence.resale.high}`
            : '',
          mergedForm.notes,
        ]
          .filter(Boolean)
          .join('\n');
        const result = await shareItem({
          title: mergedForm.title || 'TreasureTrail find',
          text: summary,
          url: typeof window !== 'undefined' ? window.location.origin : undefined,
        });
        if (result.ok) {
          completed.push(result.via === 'native' ? 'Shared via system' : 'Link copied');
        } else if (result.reason === 'cancelled') {
          // User dismissed the native share sheet — not an error.
          completed.push('Share cancelled');
        }
      }

      setStep('confirmation');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to complete actions. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep('main');
    setLastCreatedPost(null);
    setPhotoUrl(null);
    setForm({
      title: '', category: '', notes: '', price: '', location: '', marketplace: '', marketplaceCustom: '',
      general_location: '', exact_address_private: '', address_reveal_policy: 'on_contact',
      pickup_type: [], shipping_available: false, scout_needed: false, scouts_available: false, meetup_notes: '',
    });
    setSubmitError('');
  };

  if (isGuest) {
    return (
      <div style={{ height: '100%', position: 'relative' }}>
        <GuestOverlay
          title="Flash Finds"
          subtitle="Create a free account to use AI Treasure Scan. Snap photos of your finds, get instant AI valuations, and share with the community."
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
          photoUrl={photoUrl}
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
          onViewHomeFeed={() =>
            navigate('/', {
              state: lastCreatedPost
                ? { highlightPostId: lastCreatedPost.id, newPost: lastCreatedPost }
                : undefined,
            })
          }
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
  form: FlashFindForm;
  setForm: (f: FlashFindForm) => void;
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
            <LocationFields
              value={{
                general_location: form.general_location,
                exact_address_private: form.exact_address_private,
                address_reveal_policy: form.address_reveal_policy,
              }}
              onChange={(v: LocationValue) => setForm({
                ...form,
                general_location: v.general_location,
                exact_address_private: v.exact_address_private,
                address_reveal_policy: v.address_reveal_policy,
                location: v.general_location,
              })}
              hint="ZIP/City helps buyers filter local finds; exact address stays private."
            />
          </div>

          <div style={styles.field}>
            <MarketplaceFoundSelect
              value={form.marketplace}
              customValue={form.marketplaceCustom}
              onChange={(key, custom) => setForm({ ...form, marketplace: key, marketplaceCustom: custom })}
            />
          </div>

          <div style={styles.field}>
            <PickupTypeChips
              value={form.pickup_type}
              onChange={(next) => setForm({ ...form, pickup_type: next })}
            />
          </div>

          <div style={styles.field}>
            <ScoutToggles
              scoutNeeded={form.scout_needed}
              scoutsAvailable={form.scouts_available}
              onChange={(v) => setForm({ ...form, scout_needed: v.scout_needed, scouts_available: v.scouts_available })}
            />
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

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Meetup Notes <span style={styles.fieldOptional}>(optional)</span></label>
            <textarea
              placeholder="Best pickup times, parking, gate codes (shared after contact)…"
              value={form.meetup_notes}
              onChange={(e) => setForm({ ...form, meetup_notes: e.target.value })}
              style={styles.textarea}
              rows={2}
            />
          </div>

          <div style={styles.field}>
            <SafetyReminder />
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
  onViewHomeFeed,
  onEdit,
}: {
  photoUrl: string | null;
  form: FlashFindForm;
  onPostAnother: () => void;
  onViewHomeFeed: () => void;
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
          <button onClick={onViewHomeFeed} style={styles.viewFeedBtn}>
            <Eye size={18} />
            <span>View in Home Feed</span>
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
