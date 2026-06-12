import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, ArrowRight, X, MapPin, DollarSign, Tag, Sparkles, Eye, CircleCheck as CheckCircle, Image, Pencil, Plus, ShoppingBag, Loader, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GuestOverlay } from '../components/GuestGate';
import AiAnalysisPage, { type AnalysisDonePayload } from './AiAnalysis';
import { createCommunityPost, createFlashFind } from '../lib/database';
import { type CommunityPost } from '../lib/supabase';
import {
  createCanonicalFlashFindPayload,
  toCommunityPostInsert,
  toOptimisticCommunityPost,
  validateFeedItem,
  logFieldTypes,
} from '../lib/flashFindPayload';
import {
  shareToRareRadar,
  saveAnalysis,
  watchTrend,
  shareItem,
  buildIntelligence,
  type ConditionKey,
} from '../lib/itemIntelligence';
import { publicWebUrl } from '../lib/apiBase';
import {
  runAiScan,
  fetchAiScanUsage,
  AiScanError,
  type AiScanUsage,
  type AiAnalysisResult,
} from '../lib/aiAnalysis';
import { compressImage } from '../lib/imageCompress';

type FlowStep = 'main' | 'photo' | 'details' | 'ai-review' | 'ai-analysis' | 'confirmation';

// Condition chips shared by the AI review surface. Mirrors the keys used by
// itemIntelligence / AiAnalysis so a posted find carries a consistent label.
const CONDITIONS: { key: ConditionKey; label: string; desc: string }[] = [
  { key: 'mint',  label: 'Mint',      desc: 'Like new, no flaws' },
  { key: 'good',  label: 'Good',      desc: 'Used, fully working' },
  { key: 'fair',  label: 'Fair',      desc: 'Visible wear' },
  { key: 'parts', label: 'For parts', desc: 'Repair needed' },
];

function conditionLabel(key: ConditionKey | null): string {
  return CONDITIONS.find((c) => c.key === key)?.label ?? '';
}

// Map the model's free-text condition estimate onto one of our chip keys so
// the review surface can pre-select it. Defaults to 'good' when ambiguous.
function mapAiCondition(text: string | undefined | null): ConditionKey | null {
  const t = (text || '').toLowerCase();
  if (!t) return null;
  if (/parts|repair|broken|not working|salvage|damaged/.test(t)) return 'parts';
  if (/mint|new|excellent|pristine|unused/.test(t)) return 'mint';
  if (/fair|worn|poor|rough|heavy wear/.test(t)) return 'fair';
  return 'good';
}

// Editable AI-derived fields that don't map to a FlashFindForm/DB column.
// They are surfaced as individual editable inputs on the AI review step and
// folded into the post's description (notes) at submit time.
interface AiReviewFields {
  condition: ConditionKey | null;
  brand: string;
  model: string;
  keywords: string;        // comma-separated for easy editing
  estLow: string;
  estHigh: string;
  suggestedPrice: string;
}

const EMPTY_AI_FIELDS: AiReviewFields = {
  condition: null, brand: '', model: '', keywords: '', estLow: '', estHigh: '', suggestedPrice: '',
};

const CATEGORIES = [
  'Electronics', 'Furniture', 'Books', 'Collectibles', 'Antiques',
  'Art', 'Jewelry', 'Watches', 'Toys', 'Tools', 'Clothing', 'Other',
];

// Map the model's free-text category onto one of our chips. The AI prompt
// is constrained to this exact list, but we normalize defensively (case +
// trim) and fall back to 'Other' so an unexpected value never leaves the
// category blank.
function normalizeAiCategory(c: string): string {
  if (!c) return '';
  const found = CATEGORIES.find((cat) => cat.toLowerCase() === c.trim().toLowerCase());
  return found || 'Other';
}

// Compose an editable, buyer-facing Description from the structured AI result
// (summary + highlight bullets). This becomes the editable "Description" field
// on the AI review step. Structured facts (brand/model/condition/value/price/
// keywords) are kept in their OWN editable fields and only merged back into the
// final notes at post time — see composeFinalNotes.
function buildDescriptionFromAi(r: AiAnalysisResult): string {
  const parts: string[] = [];
  if (r.summary) parts.push(r.summary.trim());
  if (r.highlights?.length) parts.push(r.highlights.map((h) => `• ${h}`).join('\n'));
  return parts.join('\n\n').trim();
}

// Merge the edited Description with the edited structured fields into a single
// notes block for posting. There are no DB columns for brand/model/condition/
// keywords/value/suggested-price, so they are appended to the description in a
// readable form. We deliberately do NOT write the AI value into form.price —
// FlashFindForm.price is the "Price Found At" (what the user PAID), distinct
// from the AI's resale estimate / suggested listing price.
function composeFinalNotes(description: string, f: AiReviewFields): string {
  const parts: string[] = [];
  if (description.trim()) parts.push(description.trim());
  const facts: string[] = [];
  if (f.brand.trim()) facts.push(`Brand: ${f.brand.trim()}`);
  if (f.model.trim()) facts.push(`Model: ${f.model.trim()}`);
  if (f.condition) facts.push(`Condition: ${conditionLabel(f.condition)}`);
  if (f.estLow.trim() || f.estHigh.trim()) {
    facts.push(`Est. value: $${f.estLow.trim() || '?'}–$${f.estHigh.trim() || '?'}`);
  }
  if (f.suggestedPrice.trim()) facts.push(`Suggested listing price: $${f.suggestedPrice.trim()}`);
  if (facts.length) parts.push(facts.join(' · '));
  if (f.keywords.trim()) parts.push(`Keywords: ${f.keywords.trim()}`);
  return parts.join('\n\n').trim();
}

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
  meetup_notes: string;
}

import { uploadCompressedImage } from '../lib/uploadImage';
import LocationFields, { type LocationValue } from '../components/listing/LocationFields';
import PickupTypeChips from '../components/listing/PickupTypeChips';
import MarketplaceFoundSelect, { getMarketplaceLabel as _shared_getMarketplaceLabel } from '../components/listing/MarketplaceFoundSelect';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
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
  // Surfaced on the Confirmation screen when the canonical payload
  // round-trip validates as malformed — see [FLASH_OPTIMISTIC_PREPEND]
  // abort branch. Empty string = no warning.
  const [optimisticWarning, setOptimisticWarning] = useState('');
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
    meetup_notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Real photo-based AI autofill (GPT vision) state. The scan is rate
  // limited server-side (free: 5 / rolling 24h, Pro: unlimited); we mirror
  // the remaining count in the UI and surface a Pro upsell on 429.
  const [aiScanning, setAiScanning] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiLimitReached, setAiLimitReached] = useState(false);
  const [aiUsage, setAiUsage] = useState<AiScanUsage | null>(null);
  const [aiPrefilled, setAiPrefilled] = useState(false);
  // AI-derived editable fields (brand/model/condition/keywords/value/suggested
  // price) shown on the dedicated AI review step. Reset whenever a new photo is
  // picked so a prior scan can't bleed into the next item.
  const [aiFields, setAiFields] = useState<AiReviewFields>(EMPTY_AI_FIELDS);

  // Refresh the remaining-scan counter whenever the photo preview is shown
  // so the AI Autofill button always reflects the live quota.
  useEffect(() => {
    if (step === 'photo' && user) {
      fetchAiScanUsage().then((u) => {
        if (u) setAiUsage(u);
      });
    }
  }, [step, user]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = useCallback((file: File) => {
    // Defensive validation — on desktop the "camera" button just opens
    // the OS file picker, so users can pick non-image files (HEIC,
    // video, anything). Without this guard the next step would render a
    // broken <img>. We log [FLASH_PICK_*] so the cause is visible in
    // the console.
    if (!file.type.startsWith('image/')) {
      console.warn('[FLASH_PICK_REJECTED] not an image', { name: file.name, type: file.type, size: file.size });
      setSubmitError(`That file isn't an image (${file.type || 'unknown type'}). Please pick a JPG, PNG, or HEIC photo.`);
      return;
    }
    if (file.size === 0) {
      console.warn('[FLASH_PICK_REJECTED] empty file', { name: file.name });
      setSubmitError('That file is empty. Please pick another photo.');
      return;
    }
    setSubmitError('');
    // Fresh photo: clear any AI state from a prior attempt so stale error
    // text / prefill banner / limit flag don't carry over to the new image.
    setAiError('');
    setAiPrefilled(false);
    setAiLimitReached(false);
    setAiFields(EMPTY_AI_FIELDS);
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      console.log('[FLASH_PICK_OK]', { type: file.type, size: file.size, urlPrefix: url?.slice(0, 32) });
      setPhotoUrl(url);
      setStep('photo');
    };
    reader.onerror = () => {
      console.error('[FLASH_PICK_READ_FAILED]', { name: file.name, type: file.type });
      setSubmitError("Couldn't read that photo. Please try a different file.");
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

  // Manual path: skip AI and go straight to the (empty) details form.
  const handleManualEntry = () => {
    setAiError('');
    setAiPrefilled(false);
    setStep('details');
  };

  // AI path: compress the captured photo, run the real GPT-vision scan, map
  // the structured result onto the form + the individual editable AI fields,
  // then drop the user on the dedicated AI review step so they can review and
  // edit EVERY field before posting.
  const handleAiAutofill = async () => {
    if (!photoUrl || aiScanning) return;
    setAiScanning(true);
    setAiError('');
    setAiLimitReached(false);
    try {
      const compact = await compressImage(photoUrl, 1024, 0.6);
      const resp = await runAiScan(compact);
      const r = resp.result;
      setForm((prev) => ({
        ...prev,
        title: r.title?.trim() || prev.title,
        category: normalizeAiCategory(r.category) || prev.category,
        notes: buildDescriptionFromAi(r) || prev.notes,
      }));
      const ev = r.estimated_value;
      const mid = ev ? Math.round((ev.low + ev.high) / 2) : 0;
      setAiFields({
        condition: mapAiCondition(r.condition_estimate),
        brand: r.brand?.trim() ?? '',
        model: r.model?.trim() ?? '',
        keywords: (r.keywords ?? []).join(', '),
        estLow: ev?.low ? String(ev.low) : '',
        estHigh: ev?.high ? String(ev.high) : '',
        suggestedPrice: r.suggested_price ? String(r.suggested_price) : (mid ? String(mid) : ''),
      });
      setAiUsage({ tier: resp.tier, used: resp.used, limit: resp.limit, remaining: resp.remaining });
      setAiPrefilled(true);
      setSubmitError('');
      setStep('ai-review');
    } catch (e) {
      if (e instanceof AiScanError) {
        if (e.status === 429) {
          setAiLimitReached(true);
          if (e.usage) setAiUsage(e.usage);
        }
        setAiError(e.message);
      } else {
        console.error('[AI_AUTOFILL] scan failed', e);
        setAiError('AI autofill failed. Please try again, or enter details manually.');
      }
    } finally {
      setAiScanning(false);
    }
  };

  const handleDetailsSubmit = () => {
    // Only TITLE is strictly required — everything else is optional and
    // the canonical payload builder fills safe defaults (category →
    // "Other", location → null, etc.). The previous hard block on
    // category / general_location prevented "title + image only" uploads
    // from completing, which the optional-field spec requires.
    if (!form.title.trim()) {
      setSubmitError('Add a title for your find so the community knows what you posted.');
      return;
    }
    if (form.marketplace === 'other' && !form.marketplaceCustom.trim()) {
      setSubmitError('Please enter the marketplace name, or pick a different option.');
      return;
    }
    setSubmitError('');
    setStep('ai-analysis');
  };

  // AI review path: fold the edited Description + structured AI fields into a
  // single notes block and post directly, reusing the same canonical-payload
  // pipeline as the manual flow (handleAiDone). We skip the heuristic Reseller
  // Assist step entirely — the user has already reviewed real AI output here.
  const handleAiReviewPost = () => {
    if (!form.title.trim()) {
      setSubmitError('Add a title for your find so the community knows what you posted.');
      return;
    }
    const finalNotes = composeFinalNotes(form.notes, aiFields);
    const purchasePrice = form.price ? parseFloat(form.price) : null;
    handleAiDone({
      editedForm: {
        title: form.title.trim(),
        category: form.category || 'Other',
        condition: aiFields.condition,
        price: form.price,
        notes: finalNotes,
      },
      actions: ['post_flash_finds'],
      intelligence: buildIntelligence({
        title: form.title,
        category: form.category,
        notes: finalNotes,
        purchasePrice: Number.isFinite(purchasePrice as number) ? purchasePrice : null,
        condition: aiFields.condition,
      }),
    });
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
    };
    setForm(mergedForm);

    const completed: string[] = [];
    // Captured after the Flash Find row is created so the Share action can
    // link to the SPECIFIC find (/find/:id) instead of the site homepage.
    let createdFindId: string | null = null;

    try {
      // Upload image once — used by every action that needs it.
      // The upload is best-effort (the post still goes out without an
      // image if storage fails), but we now log the failure with the
      // [FLASH_UPLOAD] prefix so a broken-card report can be traced back
      // to a storage RLS / bucket issue instead of being silent.
      let imageUrl: string | undefined;
      // Guard: if the user reached submit without a photoUrl (mobile
      // Safari can evict large DataURLs when the tab is backgrounded
      // during the AI analysis step), STOP. Posting a find with no
      // image is almost never what the user wanted — better to surface
      // the loss loudly than ship a broken-looking card to the feed.
      if (!photoUrl) {
        setSubmitting(false);
        const msg = 'Your photo was lost before the post went out. Please go back, re-attach the photo, and try again.';
        setSubmitError(msg);
        try { window.alert(msg); } catch {}
        return;
      }
      {
        try {
          // Compress + thumbnail in one decode (1200px @ q=0.7 for the
          // full, 400px @ q=0.65 for the feed-card thumb), then upload
          // both with a 1-year immutable Cache-Control so subsequent
          // loads hit the browser / CDN cache directly. The thumb URL
          // is derived deterministically from the full URL on the read
          // side — see toThumbUrl + ImageWithFade.fallbackSrc.
          const uploaded = await uploadCompressedImage(photoUrl, {
            bucket: 'avatars',
            userId: user.id,
            folder: 'finds',
          });
          imageUrl = uploaded.url;
          console.log('[FLASH_UPLOAD] storage upload ok', {
            path: uploaded.path,
            thumbPath: uploaded.thumbPath,
          });
        } catch (e: any) {
          console.error('[FLASH_UPLOAD] storage upload failed', e);
          // Halt: don't post a find with a missing image just because
          // storage rejected the upload. Surface the underlying error
          // (RLS denial, bucket missing, quota) so the user can act.
          setSubmitting(false);
          const msg = `Photo upload failed: ${e?.message ?? 'unknown error'}. Please try again.`;
          setSubmitError(msg);
          try { window.alert(msg); } catch {}
          return;
        }
      }

      const priceNum = mergedForm.price ? parseFloat(mergedForm.price) : null;
      const priceForDb = priceNum !== null && Number.isFinite(priceNum) ? priceNum : undefined;

      const needsFlashFindPost =
        actions.includes('post_flash_finds');

      // 1. Post to Flash Finds.
      if (needsFlashFindPost) {
        // Build ONE canonical payload. Every downstream consumer (DB
        // insert, optimistic prepend, navigation state) reads from this
        // same object — so they can't disagree on the shape.
        // See src/lib/flashFindPayload.ts for the contract.
        logFieldTypes('[FLASH_FORM_STATE]', mergedForm as unknown as Record<string, unknown>);
        const canon = createCanonicalFlashFindPayload(mergedForm, {
          user_id: user.id,
          image_url: imageUrl ?? null,
        });
        logFieldTypes('[FLASH_CANONICAL_PAYLOAD]', canon as unknown as Record<string, unknown>);

        const { error: ffErr } = await createFlashFind({
          user_id: canon.user_id,
          title: canon.title,
          description: canon.description || undefined,
          image_url: canon.image_url ?? undefined,
          estimated_value: canon.price_estimate ?? undefined,
          category: canon.category,
          location: canon.location_found ?? undefined,
        });
        if (ffErr) throw new Error(ffErr);

        // Build the DB-shape insert from the canonical payload, then
        // layer on the FlashFinds-specific extras that aren't part of
        // the canonical contract (pickup/address/etc).
        const dbInsert = {
          ...toCommunityPostInsert(canon),
          general_location: mergedForm.general_location || undefined,
          exact_address_private: mergedForm.exact_address_private.trim() || undefined,
          address_reveal_policy: mergedForm.address_reveal_policy,
          pickup_type: mergedForm.pickup_type.length ? mergedForm.pickup_type : undefined,
          shipping_available:
            mergedForm.shipping_available ||
            mergedForm.pickup_type.includes('shipping_available') ||
            mergedForm.pickup_type.includes('nationwide_shipping'),
          meetup_notes: mergedForm.meetup_notes.trim() || undefined,
          estimated_value: canon.price_estimate ?? priceForDb,
        };
        logFieldTypes('[FLASH_DB_PAYLOAD]', dbInsert as unknown as Record<string, unknown>);

        const { data: createdPost, error: postErr } = await createCommunityPost(dbInsert);

        if (postErr) throw new Error(postErr);

        // Remember the new find's id so the Share action below can deep-link
        // to its detail page (/find/:id) instead of the TreasureTrail homepage.
        if (createdPost?.id) createdFindId = createdPost.id;

        // Optimistic prepend prep: build a CommunityPost-shaped object
        // from the canonical payload, then validate before handing it
        // off to the navigation state. If validation fails we DO NOT
        // pass newPost — Home will fall back to the loadAll() refresh
        // instead of rendering a malformed card.
        const optimistic = toOptimisticCommunityPost(canon, createdPost);
        const validation = validateFeedItem(optimistic);
        logFieldTypes(
          '[FLASH_OPTIMISTIC_PREPEND]',
          optimistic as unknown as Record<string, unknown>,
        );
        if (!validation.ok) {
          // True abort: do NOT pass anything to the navigation state so
          // Home falls back to its loadAll() refresh and never renders
          // a malformed optimistic card. Surface a user-visible warning
          // on the confirmation screen — the post itself DID save, this
          // only affects the instant-prepend UX.
          console.warn('[FLASH_OPTIMISTIC_PREPEND] aborted — invalid', validation.issues);
          setOptimisticWarning(
            `Posted, but the preview couldn't render (${validation.issues.join(', ')}). Pull to refresh on Home.`,
          );
          setLastCreatedPost(null);
        } else {
          setOptimisticWarning('');
          setLastCreatedPost(optimistic);
        }

        if (actions.includes('post_flash_finds')) completed.push('Posted to Flash Finds');
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
        // Deep-link to the specific find when it was just posted; otherwise
        // (e.g. user shared without posting) fall back to the homepage.
        const shareUrl = createdFindId
          ? publicWebUrl(`/find/${createdFindId}`)
          : publicWebUrl('/');
        const result = await shareItem({
          title: mergedForm.title || 'TreasureTrail find',
          text: summary,
          url: shareUrl,
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
    setOptimisticWarning('');
    setPhotoUrl(null);
    setForm({
      title: '', category: '', notes: '', price: '', location: '', marketplace: '', marketplaceCustom: '',
      general_location: '', exact_address_private: '', address_reveal_policy: 'on_contact',
      pickup_type: [], shipping_available: false, meetup_notes: '',
    });
    setSubmitError('');
    setAiError('');
    setAiPrefilled(false);
    setAiLimitReached(false);
    setAiFields(EMPTY_AI_FIELDS);
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
        <MainScreen onCamera={openCamera} onGallery={openGallery} pickerError={submitError} />
      )}

      {step === 'photo' && (
        <PhotoPreview
          photoUrl={photoUrl}
          onAiAutofill={handleAiAutofill}
          onManual={handleManualEntry}
          onRetakeCamera={openCamera}
          onRetakeGallery={openGallery}
          onBack={handleReset}
          aiScanning={aiScanning}
          aiUsage={aiUsage}
          aiError={aiError}
          aiLimitReached={aiLimitReached}
          onUpgrade={() => navigate('/pro')}
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
          aiPrefilled={aiPrefilled}
        />
      )}

      {step === 'ai-review' && (
        <AiReviewForm
          photoUrl={photoUrl}
          form={form}
          setForm={(f) => { setForm(f); if (submitError) setSubmitError(''); }}
          aiFields={aiFields}
          setAiFields={setAiFields}
          usage={aiUsage}
          onPost={handleAiReviewPost}
          onBack={() => setStep('photo')}
          submitting={submitting}
          submitError={submitError}
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
        <>
          {optimisticWarning && (
            <div
              role="alert"
              style={{
                margin: '0 var(--space-4) var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-warning-50, #fff7ed)',
                border: '1px solid var(--color-warning-300, #fdba74)',
                borderRadius: 'var(--radius-md, 8px)',
                color: 'var(--color-warning-800, #9a3412)',
                fontSize: '14px',
              }}
            >
              {optimisticWarning}
            </div>
          )}
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
        </>
      )}
    </>
  );
}

function MainScreen({
  onCamera,
  onGallery,
  pickerError,
}: {
  onCamera: () => void;
  onGallery: () => void;
  pickerError?: string;
}) {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Flash Finds</h1>
        <p style={styles.headerSubtitle}>Snap. Identify. Sell.</p>
      </header>

      <div style={styles.mainContent}>
        {pickerError && (
          <div
            role="alert"
            style={{
              margin: '0 var(--space-4) var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-warning-50, #fff7ed)',
              border: '1px solid var(--color-warning-300, #fdba74)',
              borderRadius: 'var(--radius-md, 8px)',
              color: 'var(--color-warning-800, #9a3412)',
              fontSize: '14px',
            }}
          >
            {pickerError}
          </div>
        )}
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
  onAiAutofill,
  onManual,
  onRetakeCamera,
  onRetakeGallery,
  onBack,
  aiScanning,
  aiUsage,
  aiError,
  aiLimitReached,
  onUpgrade,
}: {
  photoUrl: string | null;
  onAiAutofill: () => void;
  onManual: () => void;
  onRetakeCamera: () => void;
  onRetakeGallery: () => void;
  onBack: () => void;
  aiScanning: boolean;
  aiUsage: AiScanUsage | null;
  aiError: string;
  aiLimitReached: boolean;
  onUpgrade: () => void;
}) {
  const outOfFreeScans = aiUsage?.tier === 'free' && aiUsage.remaining <= 0;
  const showUpgrade = aiLimitReached || outOfFreeScans;
  const aiSubLabel = aiUsage
    ? aiUsage.tier === 'pro'
      ? 'Pro · unlimited scans'
      : `${Math.max(0, aiUsage.remaining)} of ${aiUsage.limit} free scans left today`
    : 'Identify it & fill the details from your photo';
  const [imgErrored, setImgErrored] = useState(false);
  // Reset error state whenever a new photo is loaded so retaking clears
  // the prior failure message.
  const lastSeenUrlRef = useRef<string | null>(null);
  if (lastSeenUrlRef.current !== photoUrl) {
    lastSeenUrlRef.current = photoUrl;
    if (imgErrored) setImgErrored(false);
  }
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
          {photoUrl && !imgErrored ? (
            <>
              <img
                src={photoUrl}
                alt="Captured find"
                style={styles.previewImage}
                onError={() => {
                  console.error('[FLASH_PREVIEW_IMG_ERROR] the captured photo failed to render', {
                    urlPrefix: photoUrl?.slice(0, 64),
                    urlLength: photoUrl?.length,
                  });
                  setImgErrored(true);
                }}
                onLoad={() => {
                  console.log('[FLASH_PREVIEW_IMG_OK]', { urlLength: photoUrl?.length });
                }}
              />
              <div style={styles.photoOverlay}>
                <span style={styles.photoHint}>
                  {aiScanning ? 'Analyzing your photo…' : 'Use AI Autofill or enter details manually'}
                </span>
              </div>
            </>
          ) : photoUrl && imgErrored ? (
            <div style={{ ...styles.cameraPlaceholder, backgroundColor: 'var(--color-neutral-100)' }}>
              <Camera size={48} style={{ color: 'var(--color-warning-500, #f97316)' }} />
              <p style={{ ...styles.placeholderText, color: 'var(--color-neutral-700)', textAlign: 'center', padding: '0 var(--space-4)' }}>
                This photo couldn't be displayed. The format may not be supported in this browser (HEIC, for example).
                Please retake or pick a JPG/PNG.
              </p>
            </div>
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
          {aiError && (
            <div style={styles.aiErrorBox} role="alert">{aiError}</div>
          )}
          {showUpgrade ? (
            <div style={styles.upgradeBox}>
              <p style={styles.upgradeText}>
                You've used all {aiUsage?.limit ?? 5} of your free AI photo scans for today.
                Pro Seller includes <strong>unlimited AI photo scans</strong>.
              </p>
              <button onClick={onUpgrade} style={styles.aiUpgradeBtn}>
                <Sparkles size={18} />
                <span>Upgrade to Pro Seller</span>
              </button>
              <button onClick={onManual} style={styles.manualBtn} disabled={aiScanning}>
                <Pencil size={16} />
                <span>Enter Details Manually</span>
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={onAiAutofill}
                style={{ ...styles.aiAutofillBtn, opacity: photoUrl && !imgErrored && !aiScanning ? 1 : 0.6 }}
                disabled={!photoUrl || imgErrored || aiScanning}
              >
                <span style={styles.aiAutofillTop}>
                  <Sparkles size={18} style={aiScanning ? styles.spin : undefined} />
                  <span>{aiScanning ? 'Analyzing your photo…' : '✨ AI Autofill From Photo'}</span>
                </span>
                {!aiScanning && <span style={styles.aiAutofillSub}>{aiSubLabel}</span>}
              </button>
              <button onClick={onManual} style={styles.manualBtn} disabled={aiScanning}>
                <Pencil size={16} />
                <span>Enter Details Manually</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Dedicated review surface for the AI-autofill path. Every field the model
// returned is shown as an individual EDITABLE input so the user can tweak
// anything before posting. On submit the structured fields are folded into the
// description by the parent (handleAiReviewPost) and posted via the same
// pipeline as the manual flow. This is a step on the SAME page — not a route.
function AiReviewForm({
  photoUrl,
  form,
  setForm,
  aiFields,
  setAiFields,
  usage,
  onPost,
  onBack,
  submitting,
  submitError,
}: {
  photoUrl: string | null;
  form: FlashFindForm;
  setForm: (f: FlashFindForm) => void;
  aiFields: AiReviewFields;
  setAiFields: (f: AiReviewFields) => void;
  usage: AiScanUsage | null;
  onPost: () => void;
  onBack: () => void;
  submitting?: boolean;
  submitError?: string;
}) {
  const usageLabel = usage
    ? usage.tier === 'pro'
      ? 'Pro · unlimited AI scans'
      : `${Math.max(0, usage.remaining)} of ${usage.limit} free scans left today`
    : 'Reviewed from your photo';
  return (
    <div style={styles.container}>
      <header style={styles.stepHeader}>
        <button onClick={onBack} style={styles.backBtn} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span style={styles.stepLabel}>Review AI Details</span>
        <div style={{ width: 36 }} />
      </header>

      <div style={styles.detailsContent}>
        <div style={styles.aiBanner}>
          <Sparkles size={16} style={{ color: '#8b5cf6', flexShrink: 0 }} />
          <span>AI filled these in from your photo. Review and edit anything before posting.</span>
        </div>

        <div style={styles.miniPreview}>
          <div style={{ ...styles.miniImage, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <ImageWithFade
              src={photoUrl}
              alt={form.title || 'Your find'}
              fallback={<MediaFallback kind="find" seed={photoUrl || form.title || 'ai-review'} label={form.title?.slice(0, 14) || 'FIND'} compact />}
            />
          </div>
          <div style={styles.miniMeta}>
            <span style={styles.miniLabel}>Your find</span>
            <span style={styles.miniHint}>{usageLabel}</span>
          </div>
        </div>

        <div style={styles.formFields}>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Title</label>
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
            <label style={styles.fieldLabel}>Condition</label>
            <div style={styles.conditionGrid}>
              {CONDITIONS.map((c) => {
                const active = aiFields.condition === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setAiFields({ ...aiFields, condition: active ? null : c.key })}
                    style={{ ...styles.conditionBtn, ...(active ? styles.conditionBtnActive : {}) }}
                    aria-pressed={active}
                  >
                    <span style={styles.conditionLabel}>{c.label}</span>
                    <span style={styles.conditionDesc}>{c.desc}</span>
                    {active && (
                      <span style={styles.conditionCheck}>
                        <Check size={12} style={{ color: 'var(--color-neutral-0)' }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={styles.aiTwoCol}>
            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.fieldLabel}>Brand</label>
              <input
                type="text"
                placeholder="e.g. Pyrex"
                value={aiFields.brand}
                onChange={(e) => setAiFields({ ...aiFields, brand: e.target.value })}
                style={styles.input}
              />
            </div>
            <div style={{ ...styles.field, flex: 1 }}>
              <label style={styles.fieldLabel}>Model</label>
              <input
                type="text"
                placeholder="e.g. Spring Blossom"
                value={aiFields.model}
                onChange={(e) => setAiFields({ ...aiFields, model: e.target.value })}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Description</label>
            <textarea
              placeholder="What makes this find special…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={styles.textarea}
              rows={4}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Suggested keywords <span style={styles.fieldOptional}>(comma-separated)</span></label>
            <input
              type="text"
              placeholder="vintage, glass, casserole"
              value={aiFields.keywords}
              onChange={(e) => setAiFields({ ...aiFields, keywords: e.target.value })}
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Estimated value range (USD)</label>
            <div style={styles.aiTwoCol}>
              <div style={styles.priceWrapper}>
                <DollarSign size={16} style={{ color: 'var(--color-neutral-400)' }} />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Low"
                  value={aiFields.estLow}
                  onChange={(e) => setAiFields({ ...aiFields, estLow: e.target.value.replace(/[^\d.]/g, '') })}
                  style={styles.priceInput}
                />
              </div>
              <div style={styles.priceWrapper}>
                <DollarSign size={16} style={{ color: 'var(--color-neutral-400)' }} />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="High"
                  value={aiFields.estHigh}
                  onChange={(e) => setAiFields({ ...aiFields, estHigh: e.target.value.replace(/[^\d.]/g, '') })}
                  style={styles.priceInput}
                />
              </div>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Suggested listing price (USD)</label>
            <div style={styles.priceWrapper}>
              <DollarSign size={16} style={{ color: 'var(--color-neutral-400)' }} />
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={aiFields.suggestedPrice}
                onChange={(e) => setAiFields({ ...aiFields, suggestedPrice: e.target.value.replace(/[^\d.]/g, '') })}
                style={styles.priceInput}
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Price Found At <span style={styles.fieldOptional}>(what you paid)</span></label>
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
            <SafetyReminder />
          </div>
        </div>

        {submitError && <div style={styles.detailsError}>{submitError}</div>}

        <button
          onClick={onPost}
          disabled={submitting}
          style={{ ...styles.continueBtn, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
        >
          {submitting ? (
            <Loader size={18} style={{ color: 'var(--color-neutral-0)', ...styles.spin }} />
          ) : (
            <CheckCircle size={18} style={{ color: 'var(--color-neutral-0)' }} />
          )}
          <span style={styles.continueBtnText}>{submitting ? 'Posting…' : 'Post Find'}</span>
        </button>
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
  aiPrefilled,
}: {
  photoUrl: string | null;
  form: FlashFindForm;
  setForm: (f: FlashFindForm) => void;
  onSubmit: () => void;
  onBack: () => void;
  error?: string;
  aiPrefilled?: boolean;
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
        {aiPrefilled && (
          <div style={styles.aiBanner}>
            <Sparkles size={16} style={{ color: '#8b5cf6', flexShrink: 0 }} />
            <span>AI filled these in from your photo. Review and tweak before posting.</span>
          </div>
        )}
        <div style={styles.miniPreview}>
          <div style={{ ...styles.miniImage, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <ImageWithFade
              src={photoUrl}
              alt="Your find"
              fallback={<MediaFallback kind="find" seed={photoUrl || 'find-mini'} label="FIND" compact />}
            />
          </div>
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
          <div style={{ ...styles.postedImage, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <ImageWithFade
              src={photoUrl}
              alt={form.title || 'Your find'}
              fallback={<MediaFallback kind="find" seed={photoUrl || form.title || 'find-posted'} label={form.title?.slice(0, 14) || 'FIND'} compact />}
            />
          </div>
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
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-4))',
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
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-4))',
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
    // minHeight guarantees the image area is visible on viewports where
    // the parent flex chain doesn't resolve to a real height (e.g. when
    // FlashFinds is mounted inside a route that lacks an explicit
    // height — common on desktop). Without this the preview collapses
    // to ~0px and the user sees only a broken-image icon.
    minHeight: '320px',
    backgroundColor: 'var(--color-neutral-100)',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
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
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4) var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  aiAutofillBtn: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: 'var(--color-neutral-0)',
    fontWeight: 'var(--font-weight-semibold)',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  aiAutofillTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--font-size-base)',
  },
  aiAutofillSub: {
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    opacity: 0.9,
  },
  manualBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    cursor: 'pointer',
  },
  aiUpgradeBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: 'var(--color-neutral-0)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    cursor: 'pointer',
  },
  aiErrorBox: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-error-50, #fef2f2)',
    border: '1px solid var(--color-error-200, #fecaca)',
    color: 'var(--color-error-700, #b91c1c)',
    fontSize: 'var(--font-size-xs)',
  },
  aiBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: '#f5f3ff',
    border: '1px solid #ddd6fe',
    color: '#5b21b6',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
  },
  spin: {
    animation: 'spin 1s linear infinite',
  },
  upgradeBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: '#f5f3ff',
    border: '1px solid #ddd6fe',
  },
  upgradeText: {
    margin: 0,
    fontSize: 'var(--font-size-sm)',
    lineHeight: 1.4,
    color: '#5b21b6',
  },
  aiTwoCol: {
    display: 'flex',
    gap: 'var(--space-2)',
  },
  conditionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-2)',
  },
  conditionBtn: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '2px solid var(--color-neutral-200)',
    backgroundColor: 'var(--color-neutral-0)',
    textAlign: 'left',
    minHeight: '60px',
    cursor: 'pointer',
  },
  conditionBtnActive: {
    border: '2px solid var(--color-primary-500)',
    backgroundColor: 'var(--color-primary-50)',
    boxShadow: '0 0 0 3px rgba(79, 70, 229, 0.12)',
  },
  conditionLabel: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
  },
  conditionDesc: { fontSize: '11px', color: 'var(--color-neutral-500)' },
  conditionCheck: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '18px',
    height: '18px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-primary-600)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    width: '120px',
    height: '90px',
    flexShrink: 0,
    objectFit: 'cover',
    borderRadius: 'var(--radius-sm)',
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
