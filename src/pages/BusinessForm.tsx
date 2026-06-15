import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ImagePlus, Loader2, Save, Trash2, X, Store,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMyBusiness, createBusiness, updateBusiness, deleteBusiness,
  BUSINESS_CATEGORY_META, BUSINESS_CATEGORIES,
  type BusinessCategory, type BusinessStatus, type BusinessPhoto, type BusinessRow,
} from '../lib/businesses';
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
    fetchMyBusiness(id, user.id)
      .then((b) => {
        if (cancelled) return;
        if (!b) { setErr("Business not found or you don't have access to edit it."); setLoading(false); return; }
        prefill(b);
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
      navigate(`/business/${saved.id}`);
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
          message="This permanently removes the business and its photos. This can't be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={onConfirmDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </PageScroll>
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
};
