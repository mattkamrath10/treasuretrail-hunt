import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ImagePlus, Loader2, Save, Trash2, X, Store, Plus, Pencil,
  Sparkles, Camera, Globe, Link2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMyBusiness, createBusiness, updateBusiness, deleteBusiness,
  fetchBusinessFeaturedItems, addBusinessFeaturedItem,
  updateBusinessFeaturedItem, deleteBusinessFeaturedItem,
  BUSINESS_CATEGORY_META, BUSINESS_CATEGORIES,
  BUSINESS_AVAILABILITY_META, BUSINESS_FEATURED_ITEM_CAP,
  type BusinessCategory, type BusinessStatus, type BusinessPhoto, type BusinessRow,
  type BusinessFeaturedItem, type BusinessAvailability,
} from '../lib/businesses';
import { analyzeBusinessCard, importBusinessFromUrl, type ImportedBusiness } from '../lib/businessImport';
import { geocodeEventLocation } from '../lib/geocode';
import { uploadCompressedImage } from '../lib/uploadImage';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { MediaFallback } from '../components/ui/MediaFallback';
import { AccountRequired } from '../components/AccountRequired';
import { PageScroll } from '../components/ui/PageScroll';
import { flashToast } from '../lib/toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const LOG = '[BUSINESS_FORM]';

/**
 * Create + edit form for a business on the Treasure Map. Two routes share it:
 *   /business/new        → create
 *   /business/:id/edit   → edit
 *
 * Any signed-in user may create a business (no holder gate). On save we
 * geocode the address → lat/lng (best-effort; a failed geocode just leaves the
 * pin off the map rather than blocking the save). Logo + photos use the shared
 * compressed-image pipeline (full + thumb to the avatars bucket).
 */

const STATUSES: { value: BusinessStatus; label: string; hint: string }[] = [
  { value: 'published', label: 'Published', hint: 'Visible on the map and in search' },
  { value: 'draft',     label: 'Draft',     hint: 'Only visible to you'              },
  { value: 'cancelled', label: 'Hidden',    hint: 'Kept for records, off the map'    },
];

const MAX_PHOTOS = 8;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function BusinessForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { user } = useAuth();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]       = useState<BusinessCategory>('antique_store');
  const [address, setAddress]         = useState('');
  const [city, setCity]               = useState('');
  const [region, setRegion]           = useState('');
  const [phone, setPhone]             = useState('');
  const [website, setWebsite]         = useState('');
  const [facebook, setFacebook]       = useState('');
  const [hours, setHours]             = useState('');
  const [status, setStatus]           = useState<BusinessStatus>('published');

  const [logoUrl, setLogoUrl]       = useState<string | null>(null);
  const [logoThumb, setLogoThumb]   = useState<string | null>(null);
  const [photos, setPhotos]         = useState<BusinessPhoto[]>([]);
  const [uploadingLogo, setUploadingLogo]     = useState(false);
  const [uploadingPhoto, setUploadingPhoto]   = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  // AI-assisted import (Phase 3 — create flow only). The form below is always
  // the source of truth; importing just pre-fills it and the user reviews/edits.
  const [importMethod, setImportMethod] = useState<'website' | 'facebook' | null>(null);
  const [importUrl, setImportUrl]       = useState('');
  const [importing, setImporting]       = useState(false);
  const [importKind, setImportKind]     = useState<'card' | 'url' | null>(null);
  const [importMsg, setImportMsg]       = useState<string | null>(null);
  const cardInputRef = useRef<HTMLInputElement>(null);

  // Featured items (edit only — needs an existing business row to attach to).
  const [items, setItems]                     = useState<BusinessFeaturedItem[] | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<string | null>(null);
  const [removingItem, setRemovingItem]       = useState(false);
  const [updatingItemId, setUpdatingItemId]   = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Remember the loaded row's coordinates + the address that produced them so
  // a transient geocode failure on edit never silently drops an existing pin.
  const priorCoordsRef = useRef<{ lat: number | null; lng: number | null; sig: string } | null>(null);

  const locationSig = (a: string, c: string, r: string) =>
    [a.trim(), c.trim(), r.trim()].join('|').toLowerCase();

  const prefill = (b: BusinessRow) => {
    priorCoordsRef.current = {
      lat: b.lat,
      lng: b.lng,
      sig: locationSig(b.address ?? '', b.city ?? '', b.region ?? ''),
    };
    setName(b.name);
    setDescription(b.description);
    setCategory(b.category);
    setAddress(b.address ?? '');
    setCity(b.city ?? '');
    setRegion(b.region ?? '');
    setPhone(b.phone ?? '');
    setWebsite(b.website ?? '');
    setFacebook(b.facebook_url ?? '');
    setHours(b.hours ?? '');
    setStatus(b.status);
    setLogoUrl(b.logo_url);
    setLogoThumb(b.logo_thumb_url);
    setPhotos(b.photos);
  };

  useEffect(() => {
    if (!isEdit || !id || !user) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    console.log(LOG, 'load', { id, ownerId: user.id });
    // Featured items degrade independently — a transient fetch failure must not
    // take down the whole edit page (the table-missing case already returns []).
    Promise.all([
      fetchMyBusiness(id, user.id),
      fetchBusinessFeaturedItems(id).catch((e) => {
        console.warn(LOG, 'featured items load failed (non-fatal)', e);
        return [] as BusinessFeaturedItem[];
      }),
    ])
      .then(([b, fItems]) => {
        if (cancelled) return;
        if (!b) { setErr("Business not found or you don't have access to edit it."); setLoading(false); return; }
        prefill(b);
        setItems(fItems);
        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        console.error(LOG, 'load:error', e);
        setErr(e?.message ?? 'Failed to load business');
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id, user]);

  // Guests must create an account first. Keyed on !user (not !profile) so a
  // guest sees the prompt instead of an infinite spinner.
  if (!user) {
    return (
      <PageScroll style={s.container}>
        <Header onBack={onBack} isEdit={isEdit} />
        <AccountRequired message="You must create a free TreasureTrail account to add a business to the map." />
      </PageScroll>
    );
  }

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingLogo(true);
    setErr(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const up = await uploadCompressedImage(dataUrl, { userId: user.id, folder: 'businesses' });
      setLogoUrl(up.url);
      setLogoThumb(up.thumbUrl);
    } catch (e: any) {
      console.error(LOG, 'logo upload', e);
      setErr(e?.message ?? 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
    }
  };

  const onPickPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { flashToast(`Up to ${MAX_PHOTOS} photos`); return; }
    setUploadingPhoto(true);
    setErr(null);
    try {
      const added: BusinessPhoto[] = [];
      for (const file of files.slice(0, room)) {
        const dataUrl = await fileToDataUrl(file);
        const up = await uploadCompressedImage(dataUrl, { userId: user.id, folder: 'businesses' });
        added.push({ url: up.url, thumb_url: up.thumbUrl });
      }
      setPhotos((prev) => [...prev, ...added]);
    } catch (e: any) {
      console.error(LOG, 'photo upload', e);
      setErr(e?.message ?? 'Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = (url: string) => {
    setPhotos((prev) => prev.filter((p) => p.url !== url));
  };

  /* ---------------- AI-assisted import (create only) ---------------- */

  // Pre-fill the form from an extraction. Only non-empty values overwrite, so a
  // partial extraction never wipes a field the user already typed. Returns the
  // number of fields filled so we can give honest feedback.
  const applyImport = (d: ImportedBusiness): number => {
    let n = 0;
    if (d.name)        { setName(d.name.slice(0, 120)); n++; }
    if (d.description) { setDescription(d.description.slice(0, 2000)); n++; }
    if (d.category)    { setCategory(d.category); n++; }
    if (d.address)     { setAddress(d.address); n++; }
    if (d.city)        { setCity(d.city); n++; }
    if (d.region)      { setRegion(d.region); n++; }
    if (d.phone)       { setPhone(d.phone); n++; }
    if (d.website)     { setWebsite(d.website); n++; }
    if (d.facebook_url){ setFacebook(d.facebook_url); n++; }
    if (d.hours)       { setHours(d.hours); n++; }
    if (d.logo_url)    { setLogoUrl(d.logo_url); setLogoThumb(null); n++; }
    return n;
  };

  const filledMsg = (n: number) =>
    `Pre-filled ${n} field${n === 1 ? '' : 's'} — review everything below, then save.`;

  const onPickCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || importing) return;
    setImporting(true);
    setImportKind('card');
    setImportMsg(null);
    setErr(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const d = await analyzeBusinessCard(dataUrl);
      if (!d) { setImportMsg("We couldn't read that card — enter the details manually below."); return; }
      // No dedicated email field on businesses — fold a detected email into the
      // description so it isn't lost (mirrors how event import folds extra
      // contact details into the description).
      if (d.email && !d.description.toLowerCase().includes(d.email.toLowerCase())) {
        d.description = d.description ? `${d.description}\nEmail: ${d.email}` : `Email: ${d.email}`;
      }
      const n = applyImport(d);
      if (n === 0) setImportMsg("We couldn't read that card — enter the details manually below.");
      else { setImportMsg(filledMsg(n)); flashToast('Business card scanned'); }
    } catch (e: any) {
      console.warn(LOG, 'card import failed', e);
      setImportMsg('Card scan failed — enter the details manually below.');
    } finally {
      setImporting(false);
      setImportKind(null);
    }
  };

  const onImportUrl = async () => {
    if (importing) return;
    let u = importUrl.trim();
    if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
    setImportMsg(null);
    setErr(null);
    if (!u) { setImportMsg('Paste a link first.'); return; }
    try { new URL(u); } catch { setImportMsg('That link doesn\u2019t look valid. Check it and try again.'); return; }
    setImporting(true);
    setImportKind('url');
    try {
      const d = await importBusinessFromUrl(u);
      if (!d) {
        setImportMsg(
          importMethod === 'facebook'
            ? "We couldn't pull details from that Facebook page — it may block automated reads. Enter the details manually below."
            : "We couldn't pull details from that link. Enter the details manually below.",
        );
        return;
      }
      const n = applyImport(d);
      if (n === 0) setImportMsg("We couldn't pull details from that link. Enter the details manually below.");
      else { setImportMsg(filledMsg(n)); flashToast('Details imported'); }
    } catch (e: any) {
      console.warn(LOG, 'url import failed', e);
      setImportMsg('Import failed — enter the details manually below.');
    } finally {
      setImporting(false);
      setImportKind(null);
    }
  };

  const onSave = async () => {
    if (saving) return;
    if (!name.trim()) { setErr('Please enter a business name.'); return; }
    setSaving(true);
    setErr(null);
    try {
      // Best-effort geocode → lat/lng. A failure leaves the pin off the map
      // but never blocks the save.
      let lat: number | null = null;
      let lng: number | null = null;
      const hasLocation = !!(address.trim() || city.trim() || region.trim());
      if (hasLocation) {
        try {
          const pt = await geocodeEventLocation({ address, city, region });
          if (pt) { lat = pt.lat; lng = pt.lng; }
        } catch (e) {
          console.warn(LOG, 'geocode failed (continuing)', e);
        }
      }

      // On edit, if the address is unchanged and geocoding produced nothing this
      // time (transient failure / rate limit), keep the previously stored pin
      // instead of silently clearing it.
      if (
        lat == null &&
        hasLocation &&
        priorCoordsRef.current &&
        priorCoordsRef.current.lat != null &&
        priorCoordsRef.current.sig === locationSig(address, city, region)
      ) {
        lat = priorCoordsRef.current.lat;
        lng = priorCoordsRef.current.lng;
      }

      const payload = {
        name: name.trim(),
        description: description.trim(),
        category,
        address: address.trim() || null,
        city: city.trim() || null,
        region: region.trim() || null,
        lat,
        lng,
        phone: phone.trim() || null,
        website: website.trim() || null,
        facebook_url: facebook.trim() || null,
        hours: hours.trim() || null,
        logo_url: logoUrl,
        logo_thumb_url: logoThumb,
        photos,
        status,
      };

      const saved = isEdit && id
        ? await updateBusiness(id, user.id, payload)
        : await createBusiness(user.id, payload);

      flashToast(isEdit ? 'Business updated' : 'Business added');
      if (lat == null && (address.trim() || city.trim() || region.trim())) {
        flashToast("Couldn't pin this address — it won't show on the map yet");
      }
      // On create, hop to the edit page so the owner can add featured items
      // (they need the row to exist first). On edit, go to the detail page.
      navigate(isEdit ? `/business/${saved.id}` : `/business/${saved.id}/edit`, { replace: !isEdit });
    } catch (e: any) {
      console.error(LOG, 'save', e);
      setErr(e?.message ?? 'Failed to save business');
    } finally {
      setSaving(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!isEdit || !id || deleting) return;
    setDeleting(true);
    try {
      await deleteBusiness(id, user.id);
      flashToast('Business deleted');
      navigate('/map');
    } catch (e: any) {
      console.error(LOG, 'delete', e);
      setErr(e?.message ?? 'Failed to delete business');
      setDeleting(false);
      setShowDelete(false);
    }
  };

  /* ---------------- Featured-item operations (edit only) ---------------- */

  const onAddItem = async (input: {
    title: string;
    description: string;
    price: number | null;
    category: string | null;
    availability: BusinessAvailability;
    file: File | null;
  }) => {
    if (!id || !user) throw new Error('Not ready — please reload the page');
    if ((items?.length ?? 0) >= BUSINESS_FEATURED_ITEM_CAP) {
      throw new Error(`Max ${BUSINESS_FEATURED_ITEM_CAP} featured items per business`);
    }
    let image_url: string | null = null;
    let thumb_url: string | null = null;
    if (input.file) {
      const dataUrl = await fileToDataUrl(input.file);
      const up = await uploadCompressedImage(dataUrl, { userId: user.id, folder: 'businesses' });
      image_url = up.url;
      thumb_url = up.thumbUrl;
    }
    try {
      const row = await addBusinessFeaturedItem(id, {
        title: input.title.trim(),
        description: input.description.trim(),
        price: input.price,
        category: input.category,
        availability: input.availability,
        image_url,
        thumb_url,
        position: items?.length ?? 0,
      });
      setItems((prev) => [...(prev ?? []), row]);
      flashToast('Item added', 'success');
    } catch (e: any) {
      console.error(LOG, 'addItem', e);
      flashToast(`Couldn't add item: ${e?.message ?? 'unknown error'}`, 'error', 4000);
      throw e;
    }
  };

  const onUpdateItem = async (itemId: string, input: {
    title: string;
    description: string;
    price: number | null;
    category: string | null;
    availability: BusinessAvailability;
    file: File | null;
  }) => {
    if (!user) throw new Error('Not ready — please reload the page');
    const patch: Partial<{
      title: string; description: string; price: number | null;
      category: string | null; availability: BusinessAvailability;
      image_url: string | null; thumb_url: string | null;
    }> = {
      title: input.title.trim(),
      description: input.description.trim(),
      price: input.price,
      category: input.category,
      availability: input.availability,
    };
    if (input.file) {
      const dataUrl = await fileToDataUrl(input.file);
      const up = await uploadCompressedImage(dataUrl, { userId: user.id, folder: 'businesses' });
      patch.image_url = up.url;
      patch.thumb_url = up.thumbUrl;
    }
    try {
      const row = await updateBusinessFeaturedItem(itemId, patch);
      setItems((prev) => (prev ?? []).map((i) => (i.id === itemId ? row : i)));
      flashToast('Item updated', 'success');
    } catch (e: any) {
      console.error(LOG, 'updateItem', e);
      flashToast(`Couldn't update item: ${e?.message ?? 'unknown error'}`, 'error', 4000);
      throw e;
    }
  };

  const onChangeAvailability = async (itemId: string, availability: BusinessAvailability) => {
    setUpdatingItemId(itemId);
    // Optimistic — revert on failure.
    const prevItems = items;
    setItems((prev) => (prev ?? []).map((i) => (i.id === itemId ? { ...i, availability } : i)));
    try {
      await updateBusinessFeaturedItem(itemId, { availability });
    } catch (e: any) {
      console.error(LOG, 'updateItemAvailability', e);
      setItems(prevItems);
      flashToast(`Couldn't update item: ${e?.message ?? 'unknown error'}`, 'error', 4000);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const onRemoveItem = (itemId: string) => setPendingDeleteItem(itemId);

  const confirmRemoveItem = async () => {
    const itemId = pendingDeleteItem;
    if (!itemId) return;
    setRemovingItem(true);
    try {
      await deleteBusinessFeaturedItem(itemId);
      setItems((prev) => (prev ?? []).filter((i) => i.id !== itemId));
      setPendingDeleteItem(null);
      flashToast('Item removed', 'success');
    } catch (e: any) {
      console.error(LOG, 'removeItem', e);
      flashToast(`Couldn't remove item: ${e?.message ?? 'unknown error'}`, 'error', 4000);
    } finally {
      setRemovingItem(false);
    }
  };

  if (loading) {
    return (
      <PageScroll style={s.container}>
        <Header onBack={onBack} isEdit={isEdit} />
        <div style={s.loadingWrap}><Loader2 size={22} className="spin" /></div>
      </PageScroll>
    );
  }

  return (
    <PageScroll style={s.container}>
      <Header onBack={onBack} isEdit={isEdit} />

      {err && <div style={s.errorBanner}>{err}</div>}

      {/* Quick start — AI-assisted pre-fill (create only). Manual entry is
          always available via the form below; this just saves typing. */}
      {!isEdit && (
        <section style={s.section}>
          <div style={s.importHead}>
            <Sparkles size={16} style={{ color: 'var(--color-primary-600, #2563eb)' }} />
            <h3 style={{ ...s.sectionTitle, margin: 0 }}>Quick start</h3>
          </div>
          <p style={s.hint}>
            Optionally pre-fill from a business card, website, or Facebook page. You'll
            review and can edit everything before saving.
          </p>
          <div style={s.importBtnRow}>
            <button
              type="button"
              style={s.importBtn}
              disabled={importing}
              onClick={() => { setImportMethod(null); setImportMsg(null); cardInputRef.current?.click(); }}
            >
              {importing && importKind === 'card' ? <Loader2 size={16} className="spin" /> : <Camera size={16} />}
              Scan business card
            </button>
            <button
              type="button"
              style={{ ...s.importBtn, ...(importMethod === 'website' ? s.importBtnActive : {}) }}
              disabled={importing}
              onClick={() => { setImportMethod('website'); setImportMsg(null); }}
            >
              <Globe size={16} /> From website
            </button>
            <button
              type="button"
              style={{ ...s.importBtn, ...(importMethod === 'facebook' ? s.importBtnActive : {}) }}
              disabled={importing}
              onClick={() => { setImportMethod('facebook'); setImportMsg(null); }}
            >
              <Link2 size={16} /> From Facebook
            </button>
            <button
              type="button"
              style={s.importBtn}
              disabled={importing}
              onClick={() => { setImportMethod(null); setImportUrl(''); setImportMsg('Just fill in the details below.'); }}
            >
              <Pencil size={16} /> Enter manually
            </button>
          </div>
          {importMethod && (
            <div style={s.importUrlRow}>
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void onImportUrl(); } }}
                placeholder={importMethod === 'facebook' ? 'facebook.com/yourshop' : 'yourshop.com'}
                style={{ ...s.input, flex: 1, marginBottom: 0 }}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button type="button" onClick={() => void onImportUrl()} disabled={importing} style={s.importGoBtn}>
                {importing && importKind === 'url' ? <Loader2 size={14} className="spin" /> : 'Import'}
              </button>
            </div>
          )}
          {importMsg && <p style={s.importMsg}>{importMsg}</p>}
          <input
            ref={cardInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickCard}
            style={{ display: 'none' }}
          />
        </section>
      )}

      {/* Logo */}
      <section style={s.section}>
        <label style={s.label}>Logo</label>
        <div style={s.logoRow}>
          <div style={s.logoPreview}>
            <ImageWithFade
              src={logoThumb || logoUrl || undefined}
              fallbackSrc={logoUrl}
              alt="Logo"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={<MediaFallback kind="listing" seed={name || 'logo'} compact />}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              style={s.ghostBtn}
            >
              {uploadingLogo ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />}
              {logoUrl ? 'Replace logo' : 'Add logo'}
            </button>
            {logoUrl && (
              <button type="button" onClick={() => { setLogoUrl(null); setLogoThumb(null); }} style={s.linkBtn}>
                Remove
              </button>
            )}
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" onChange={onPickLogo} style={{ display: 'none' }} />
        </div>
      </section>

      {/* Basics */}
      <section style={s.section}>
        <label style={s.label}>Business name *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Maple Street Antiques" style={s.input} />

        <label style={s.label}>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as BusinessCategory)} style={s.input}>
          {BUSINESS_CATEGORIES.map((c) => (
            <option key={c} value={c}>{BUSINESS_CATEGORY_META[c].label}</option>
          ))}
        </select>

        <label style={s.label}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What do you sell? What makes you worth a visit?" style={{ ...s.input, resize: 'vertical' }} />
      </section>

      {/* Location */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Location</h3>
        <p style={s.hint}>We'll place your pin on the map from this address.</p>
        <label style={s.label}>Street address</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" style={s.input} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 2 }}>
            <label style={s.label}>City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Springfield" style={s.input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={s.label}>State</label>
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="IL" style={s.input} />
          </div>
        </div>
      </section>

      {/* Contact */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Contact</h3>
        <label style={s.label}>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" style={s.input} />
        <label style={s.label}>Website</label>
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" style={s.input} />
        <label style={s.label}>Facebook page</label>
        <input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="facebook.com/yourshop" style={s.input} />
      </section>

      {/* Hours */}
      <section style={s.section}>
        <label style={s.label}>Hours</label>
        <textarea value={hours} onChange={(e) => setHours(e.target.value)} rows={3} placeholder={'Mon–Fri 10am–6pm\nSat 10am–4pm\nSun closed'} style={{ ...s.input, resize: 'vertical' }} />
      </section>

      {/* Photos */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Photos</h3>
        <div style={s.photoGrid}>
          {photos.map((p) => (
            <div key={p.url} style={s.photoTile}>
              <ImageWithFade
                src={p.thumb_url || p.url || undefined}
                fallbackSrc={p.url}
                alt="Photo"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                fallback={<MediaFallback kind="listing" seed={p.url} compact />}
              />
              <button type="button" onClick={() => removePhoto(p.url)} style={s.photoRemove} aria-label="Remove photo">
                <X size={14} />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} style={s.photoAdd}>
              {uploadingPhoto ? <Loader2 size={18} className="spin" /> : <ImagePlus size={18} />}
            </button>
          )}
        </div>
        <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={onPickPhotos} style={{ display: 'none' }} />
      </section>

      {/* Featured items — only after the business row exists (edit mode) */}
      {isEdit && id && (
        <section style={s.section}>
          <h3 style={s.sectionTitle}>Featured items</h3>
          <p style={s.hint}>
            Up to {BUSINESS_FEATURED_ITEM_CAP} preview items shown on your business page, the map, and search.
          </p>
          <FeaturedItemsEditor
            items={items ?? []}
            onAdd={onAddItem}
            onUpdate={onUpdateItem}
            onRemove={onRemoveItem}
            onChangeAvailability={onChangeAvailability}
            updatingItemId={updatingItemId}
          />
        </section>
      )}

      {/* Visibility */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Visibility</h3>
        {STATUSES.map((st) => (
          <label key={st.value} style={s.radioRow}>
            <input type="radio" name="status" checked={status === st.value} onChange={() => setStatus(st.value)} />
            <span><strong>{st.label}</strong> — <span style={{ color: 'var(--color-neutral-500)' }}>{st.hint}</span></span>
          </label>
        ))}
      </section>

      {/* Save */}
      <section style={s.section}>
        <button onClick={onSave} disabled={saving} style={s.saveBtn}>
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
          {isEdit ? 'Save changes' : 'Add business'}
        </button>
      </section>

      {/* Danger zone */}
      {isEdit && (
        <section style={s.section}>
          <button onClick={() => setShowDelete(true)} style={s.deleteBtn}>
            <Trash2 size={14} /> Delete business
          </button>
        </section>
      )}

      {showDelete && (
        <ConfirmDialog
          title="Delete this business?"
          message="This permanently removes the business, its photos, and its featured items. This can't be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={onConfirmDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}

      {pendingDeleteItem && (
        <ConfirmDialog
          title="Delete this item?"
          message="This item will be removed from your business."
          confirmLabel="Delete"
          busy={removingItem}
          onConfirm={confirmRemoveItem}
          onCancel={() => setPendingDeleteItem(null)}
        />
      )}
    </PageScroll>
  );
}

/* --------------- Featured items editor --------------- */

type ItemDraftInput = {
  title: string;
  description: string;
  price: number | null;
  category: string | null;
  availability: BusinessAvailability;
  file: File | null;
};

function FeaturedItemsEditor({
  items, onAdd, onUpdate, onRemove, onChangeAvailability, updatingItemId,
}: {
  items: BusinessFeaturedItem[];
  onAdd: (input: ItemDraftInput) => Promise<void>;
  onUpdate: (id: string, input: ItemDraftInput) => Promise<void>;
  onRemove: (id: string) => void;
  onChangeAvailability: (id: string, availability: BusinessAvailability) => void;
  updatingItemId: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const atCap = items.length >= BUSINESS_FEATURED_ITEM_CAP;

  return (
    <div>
      {items.length > 0 && (
        <div style={s.itemGrid}>
          {items.map((it) => (
            <div key={it.id} style={s.itemTile}>
              <div style={{ ...s.itemThumb, ...(it.availability !== 'available' ? { opacity: 0.55 } : {}) }}>
                {it.thumb_url || it.image_url ? (
                  <ImageWithFade
                    src={it.thumb_url || it.image_url || undefined}
                    fallbackSrc={it.image_url}
                    alt={it.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    fallback={<MediaFallback kind="listing" seed={it.id} label={it.title?.slice(0, 14) || 'ITEM'} compact />}
                  />
                ) : (
                  <MediaFallback kind="listing" seed={it.id} label={it.title?.slice(0, 14) || 'ITEM'} compact />
                )}
                {it.availability !== 'available' && (
                  <span style={s.availBadge}>{BUSINESS_AVAILABILITY_META[it.availability].label}</span>
                )}
              </div>
              <div style={s.itemBody}>
                <div style={s.itemTitle}>{it.title}</div>
                {it.category && <div style={s.itemCat}>{it.category}</div>}
                {it.price != null && <div style={s.itemPrice}>${Number(it.price).toFixed(2)}</div>}
                <select
                  value={it.availability}
                  disabled={updatingItemId === it.id}
                  onChange={(e) => onChangeAvailability(it.id, e.target.value as BusinessAvailability)}
                  style={s.availSelect}
                >
                  {(Object.keys(BUSINESS_AVAILABILITY_META) as BusinessAvailability[]).map((a) => (
                    <option key={a} value={a}>{BUSINESS_AVAILABILITY_META[a].label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setEditingId(it.id)} style={s.itemEditBtn}>
                  <Pencil size={12} /> Edit
                </button>
              </div>
              <button onClick={() => onRemove(it.id)} style={s.itemRemove} aria-label="Remove">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit panel — appears when an existing item is being edited */}
      {editingId && (() => {
        const editing = items.find((i) => i.id === editingId);
        if (!editing) return null;
        return (
          <ItemDraftForm
            key={editing.id}
            mode="edit"
            initial={editing}
            onSubmit={async (input) => { await onUpdate(editing.id, input); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        );
      })()}

      {/* Add panel */}
      {atCap ? (
        <p style={s.hint}>Maximum reached. Remove an item to add another.</p>
      ) : (
        !editingId && (
          <ItemDraftForm
            mode="add"
            onSubmit={async (input) => { await onAdd(input); }}
          />
        )
      )}
    </div>
  );
}

/** Shared add/edit form for a featured item. In "add" mode it resets after a
 *  successful submit; in "edit" mode it pre-fills and shows Save/Cancel. */
function ItemDraftForm({
  mode, initial, onSubmit, onCancel,
}: {
  mode: 'add' | 'edit';
  initial?: BusinessFeaturedItem;
  onSubmit: (input: ItemDraftInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle]             = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice]             = useState(initial?.price != null ? String(initial.price) : '');
  const [category, setCategory]       = useState(initial?.category ?? '');
  const [availability, setAvailability] = useState<BusinessAvailability>(initial?.availability ?? 'available');
  const [file, setFile]               = useState<File | null>(null);
  const [busy, setBusy]               = useState(false);
  const [err, setErr]                 = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const existingImage = initial?.thumb_url || initial?.image_url || null;
  const hasDraft = mode === 'add' &&
    (title.trim() || description.trim() || price.trim() || category.trim() || !!file);

  const submit = async () => {
    if (!title.trim()) { setErr('Item needs a title'); return; }
    const priceNum = price.trim() ? Number(price) : null;
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0)) {
      setErr('Price must be a positive number'); return;
    }
    setErr(null);
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        price: priceNum,
        category: category.trim() || null,
        availability,
        file,
      });
      if (mode === 'add') {
        setTitle(''); setDescription(''); setPrice(''); setCategory('');
        setAvailability('available'); setFile(null);
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save item');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={s.addItemBox}>
      <p style={s.addItemHeading}>
        {mode === 'add' ? (
          <>Add a new item — fill in below, then click <strong>Add item</strong> to save it.</>
        ) : (
          <>Editing item — change any fields, then click <strong>Save changes</strong>.</>
        )}
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Item title"
        style={s.input}
        maxLength={80}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        style={{ ...s.input, resize: 'vertical', marginTop: 8 }}
        maxLength={400}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (optional)"
          style={{ ...s.input, flex: 1 }}
          maxLength={40}
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price"
          inputMode="decimal"
          style={{ ...s.input, width: 110 }}
        />
      </div>
      <select
        value={availability}
        onChange={(e) => setAvailability(e.target.value as BusinessAvailability)}
        style={{ ...s.input, marginTop: 8 }}
      >
        {(Object.keys(BUSINESS_AVAILABILITY_META) as BusinessAvailability[]).map((a) => (
          <option key={a} value={a}>{BUSINESS_AVAILABILITY_META[a].label}</option>
        ))}
      </select>
      {mode === 'edit' && existingImage && !file && (
        <div style={s.editImgRow}>
          <img src={existingImage} alt="" style={s.editImgThumb} />
          <span style={s.hint}>Current photo — choose a new one to replace it.</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => fileRef.current?.click()} style={s.ghostBtn}>
          <ImagePlus size={13} /> {file ? file.name.slice(0, 18) : (mode === 'edit' && existingImage ? 'Replace photo' : 'Add photo')}
        </button>
        {file && (
          <button type="button" onClick={() => setFile(null)} style={s.ghostBtn}>
            <X size={13} /> Clear
          </button>
        )}
        {mode === 'edit' && onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} style={s.ghostBtn}>
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          style={{ ...s.addItemBtn, marginLeft: 'auto' }}
        >
          {busy ? <Loader2 size={14} className="spin" /> : (mode === 'add' ? <Plus size={14} /> : <Save size={14} />)}
          {busy ? 'Saving…' : (mode === 'add' ? 'Add item' : 'Save changes')}
        </button>
      </div>
      {hasDraft && !busy && (
        <p style={s.draftWarn}>
          ⚠ You have an unsaved item draft. Click <strong>Add item</strong> above to save it.
        </p>
      )}
      {err && <p style={s.itemErr}>{err}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
      />
    </div>
  );
}

/* --------------- Header --------------- */

function Header({ onBack, isEdit }: { onBack: () => void; isEdit: boolean }) {
  return (
    <header style={s.header}>
      <button onClick={onBack} style={s.iconBtn} aria-label="Back">
        <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
      </button>
      <h1 style={s.headerTitle}>
        <Store size={17} style={{ verticalAlign: '-3px', marginRight: 6 }} />
        {isEdit ? 'Edit business' : 'Add a business'}
      </h1>
    </header>
  );
}

/* --------------- styles --------------- */

const s: Record<string, React.CSSProperties> = {
  container: { background: 'var(--color-bg, #fff)', minHeight: '100%', paddingBottom: 40 },
  header: {
    position: 'sticky', top: 0, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 14px',
    background: 'var(--color-bg, #fff)',
    borderBottom: '1px solid var(--color-neutral-200, #e5e7eb)',
  },
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 38, height: 38, borderRadius: 10, border: 'none',
    background: 'transparent', cursor: 'pointer',
  },
  headerTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
  loadingWrap: { display: 'flex', justifyContent: 'center', padding: '48px 0' },
  errorBanner: {
    margin: 16, padding: 12, borderRadius: 10,
    background: '#fef2f2', color: '#991b1b', fontSize: 14,
  },
  section: { padding: '12px 16px' },
  sectionTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 4px' },
  hint: { fontSize: 12, color: 'var(--color-neutral-500)', margin: '0 0 8px' },
  label: { display: 'block', fontSize: 13, fontWeight: 600, margin: '10px 0 4px' },
  input: {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px', borderRadius: 10,
    border: '1px solid var(--color-neutral-300, #d1d5db)',
    fontSize: 14, background: 'var(--color-bg, #fff)',
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 14 },
  logoPreview: {
    width: 80, height: 80, borderRadius: 16, overflow: 'hidden',
    background: '#f3f4f6', flexShrink: 0,
  },
  ghostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 10,
    border: '1px solid var(--color-neutral-300, #d1d5db)',
    background: 'var(--color-bg, #fff)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
  },
  linkBtn: {
    border: 'none', background: 'transparent',
    color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', padding: 0,
  },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 },
  photoTile: {
    position: 'relative', aspectRatio: '1 / 1', borderRadius: 12,
    overflow: 'hidden', background: '#f3f4f6',
  },
  photoRemove: {
    position: 'absolute', top: 4, right: 4,
    width: 26, height: 26, borderRadius: 999, border: 'none',
    background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    aspectRatio: '1 / 1', borderRadius: 12,
    border: '2px dashed var(--color-neutral-300, #d1d5db)',
    background: 'var(--color-bg, #fff)', color: 'var(--color-neutral-500)',
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  radioRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, padding: '6px 0' },
  saveBtn: {
    width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '14px', borderRadius: 12, border: 'none',
    background: 'var(--color-primary-600, #2563eb)', color: '#fff',
    fontWeight: 700, fontSize: 15, cursor: 'pointer',
  },
  deleteBtn: {
    width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '12px', borderRadius: 12,
    border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b',
    fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },

  /* Quick-start AI import (create only) */
  importHead: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 },
  importBtnRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  importBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 13px', borderRadius: 10,
    border: '1px solid var(--color-neutral-300, #d1d5db)',
    background: 'var(--color-bg, #fff)', color: 'var(--color-neutral-700, #374151)',
    fontWeight: 600, fontSize: 13, cursor: 'pointer',
  },
  importBtnActive: {
    borderColor: 'var(--color-primary-600, #2563eb)',
    background: 'var(--color-primary-50, #eff6ff)',
    color: 'var(--color-primary-700, #1d4ed8)',
  },
  importUrlRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 },
  importGoBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 76, padding: '10px 14px', borderRadius: 10, border: 'none',
    background: 'var(--color-primary-600, #2563eb)', color: '#fff',
    fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  importMsg: {
    fontSize: 12, color: 'var(--color-neutral-600, #4b5563)',
    background: 'var(--color-neutral-50, #fafafa)',
    border: '1px solid var(--color-neutral-200, #e5e7eb)',
    borderRadius: 8, padding: '8px 10px', margin: '10px 0 0',
  },

  /* Featured-items editor */
  itemGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10,
    marginBottom: 12,
  },
  itemTile: {
    position: 'relative', borderRadius: 12, overflow: 'hidden',
    border: '1px solid var(--color-neutral-200, #e5e7eb)', background: 'var(--color-bg, #fff)',
  },
  itemThumb: {
    position: 'relative', width: '100%', aspectRatio: '1 / 1',
    background: '#f3f4f6', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  availBadge: {
    position: 'absolute', left: 6, top: 6,
    padding: '2px 7px', borderRadius: 999,
    background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, fontWeight: 700,
  },
  itemBody: { padding: '8px 8px 10px' },
  itemTitle: { fontSize: 13, fontWeight: 700, lineHeight: 1.25 },
  itemCat: { fontSize: 11, color: 'var(--color-neutral-500)', marginTop: 2 },
  itemPrice: { fontSize: 12, fontWeight: 700, color: 'var(--color-primary-600, #2563eb)', marginTop: 2 },
  availSelect: {
    width: '100%', marginTop: 6, padding: '5px 6px', borderRadius: 8,
    border: '1px solid var(--color-neutral-300, #d1d5db)', fontSize: 12,
    background: 'var(--color-bg, #fff)',
  },
  itemEditBtn: {
    width: '100%', marginTop: 6, padding: '5px 6px', borderRadius: 8,
    border: '1px solid var(--color-neutral-300, #d1d5db)',
    background: 'var(--color-bg, #fff)', color: 'var(--color-neutral-700, #374151)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  editImgRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 },
  editImgThumb: {
    width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0,
    border: '1px solid var(--color-neutral-200, #e5e7eb)',
  },
  itemRemove: {
    position: 'absolute', top: 6, right: 6,
    width: 26, height: 26, borderRadius: 999, border: 'none',
    background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  addItemBox: {
    border: '1px dashed var(--color-neutral-300, #d1d5db)', borderRadius: 12,
    padding: 12, background: 'var(--color-neutral-50, #fafafa)',
  },
  addItemHeading: { fontSize: 12, color: 'var(--color-neutral-600)', margin: '0 0 8px' },
  addItemBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 10, border: 'none',
    background: 'var(--color-primary-600, #2563eb)', color: '#fff',
    fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  draftWarn: {
    fontSize: 12, color: '#92400e', background: '#fffbeb',
    border: '1px solid #fde68a', borderRadius: 8, padding: '6px 8px', margin: '8px 0 0',
  },
  itemErr: { fontSize: 12, color: '#991b1b', margin: '8px 0 0' },
};
