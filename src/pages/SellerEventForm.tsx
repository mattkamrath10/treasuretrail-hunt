import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Calendar, MapPin, ImagePlus, Loader2, Plus, Trash2, Save,
  Eye, X, Store,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMyEvent, createEvent, updateEvent,
  fetchEventFeaturedItems, addEventFeaturedItem, deleteEventFeaturedItem,
  type EventCategory, type EventStatus, type EventUpsert, type EventFeaturedItem,
} from '../lib/events';
import { uploadCompressedImage } from '../lib/uploadImage';
import { toThumbUrl } from '../lib/imageCompress';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { EmptyState } from '../components/ui/EmptyState';
import { flashToast } from '../lib/toast';

const LOG = '[SELLER_FORM]';

/**
 * Holder-only event create + edit form. Two routes share this component:
 *   /seller/new            → create new event
 *   /seller/event/:id      → edit existing event
 *
 * Featured-items management is inlined under the form on edit. We can't
 * attach featured items to an event until the parent event row exists
 * (FK), so the items section is hidden on /seller/new and appears only
 * after first save.
 */

const CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'estate_sale',       label: 'Estate Sale' },
  { value: 'yard_sale',         label: 'Yard Sale' },
  { value: 'flea_market',       label: 'Flea Market' },
  { value: 'auction',           label: 'Auction' },
  { value: 'pop_up',            label: 'Pop-up' },
  { value: 'collectibles_show', label: 'Collectibles Show' },
  { value: 'other',             label: 'Other' },
];

const STATUSES: { value: EventStatus; label: string; hint: string }[] = [
  { value: 'draft',     label: 'Draft',     hint: 'Only visible to you'        },
  { value: 'published', label: 'Published', hint: 'Visible in the public feed' },
  { value: 'cancelled', label: 'Cancelled', hint: 'Hidden but kept for records'},
];

export default function SellerEventForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { profile, user } = useAuth();
  const isEdit = !!id;
  const isHolder = profile?.account_type === 'holder';

  // form state
  const [loading, setLoading]   = useState(isEdit);
  const [saving,  setSaving]    = useState(false);
  const [err,     setErr]       = useState<string | null>(null);

  const [title,        setTitle]       = useState('');
  const [description,  setDescription] = useState('');
  const [category,     setCategory]    = useState<EventCategory>('estate_sale');
  const [startsAt,     setStartsAt]    = useState(''); // datetime-local
  const [endsAt,       setEndsAt]      = useState('');
  const [address,      setAddress]     = useState('');
  const [city,         setCity]        = useState('');
  const [region,       setRegion]      = useState('');
  const [coverUrl,     setCoverUrl]    = useState<string | null>(null);
  const [coverThumb,   setCoverThumb]  = useState<string | null>(null);
  const [status,       setStatus]      = useState<EventStatus>('draft');
  const [uploadingCover, setUploadingCover] = useState(false);

  // featured items (edit only)
  const [items, setItems] = useState<EventFeaturedItem[] | null>(null);

  // Load existing event on edit. Owner-scoped — a holder loading another
  // holder's published event URL gets a "not found" rather than silently
  // editing a row they can't actually save (RLS would block on save).
  useEffect(() => {
    if (!isEdit || !id || !user) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    console.log(LOG, 'load', { id, holderId: user.id });
    Promise.all([fetchMyEvent(id, user.id), fetchEventFeaturedItems(id)])
      .then(([e, its]) => {
        if (cancelled) return;
        console.log(LOG, 'load:result', { event: !!e, items: its.length });
        if (!e) { setErr('Event not found or you don\'t have access to edit it.'); setLoading(false); return; }
        setTitle(e.title);
        setDescription(e.description);
        setCategory(e.category);
        setStartsAt(toLocalInput(e.starts_at));
        setEndsAt(e.ends_at ? toLocalInput(e.ends_at) : '');
        setAddress(e.address ?? '');
        setCity(e.city ?? '');
        setRegion(e.region ?? '');
        setCoverUrl(e.cover_image_url);
        setCoverThumb(e.cover_thumb_url);
        setStatus(e.status);
        setItems(its);
        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        console.error(LOG, 'load:error', e);
        setErr(e?.message ?? 'Failed to load event');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isEdit, id, user]);

  const onPickCover = async (file: File) => {
    if (!user) return;
    setErr(null);
    setUploadingCover(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const up = await uploadCompressedImage(dataUrl, {
        userId: user.id,
        folder: 'events',
      });
      setCoverUrl(up.url);
      setCoverThumb(up.thumbUrl);
    } catch (e: any) {
      setErr(`Cover upload failed: ${e?.message ?? 'unknown error'}`);
    } finally {
      setUploadingCover(false);
    }
  };

  const onSave = async () => {
    if (!user) return;
    setErr(null);

    // Minimal client-side validation — server enforces real constraints.
    if (!title.trim())     { setErr('Title is required'); return; }
    if (!startsAt)         { setErr('Start date/time is required'); return; }
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setErr('End must be after start'); return;
    }

    const payload: EventUpsert = {
      title: title.trim(),
      description: description.trim(),
      category,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      address: address.trim() || null,
      city:    city.trim()    || null,
      region:  region.trim()  || null,
      cover_image_url: coverUrl,
      cover_thumb_url: coverThumb,
      status,
    };

    setSaving(true);
    try {
      if (isEdit && id) {
        console.log(LOG, 'save:update', { id, status: payload.status });
        await updateEvent(id, payload);
        // Re-fetch items from DB so we surface any drift between local
        // state and what RLS actually allows us to read back. If the
        // counts disagree, the user gets an immediate visible warning
        // rather than discovering the loss on a later page load.
        const fresh = await fetchEventFeaturedItems(id);
        const localCount = items?.length ?? 0;
        console.log(LOG, 'save:resync', { localCount, dbCount: fresh.length });
        setItems(fresh);
        if (fresh.length !== localCount) {
          flashToast(
            `Saved, but featured items out of sync: ${localCount} local vs ${fresh.length} in DB`,
            'error',
            4000,
          );
        } else {
          flashToast('Changes saved', 'success');
        }
      } else {
        console.log(LOG, 'save:create');
        const row = await createEvent(user.id, payload);
        console.log(LOG, 'save:create:ok', { id: row.id });
        flashToast('Event created', 'success');
        // On create, hop straight to edit URL so user can add featured items
        navigate(`/seller/event/${row.id}`, { replace: true });
      }
    } catch (e: any) {
      console.error(LOG, 'save:error', e);
      setErr(`Save failed: ${e?.message ?? 'unknown error'}`);
      flashToast(`Save failed: ${e?.message ?? 'unknown error'}`, 'error', 4000);
    } finally {
      setSaving(false);
    }
  };

  // Featured-item operations (edit only)
  const onAddItem = async (input: { title: string; price: number | null; coverFile: File | null }) => {
    if (!id || !user) {
      console.warn(LOG, 'addItem:abort', { hasId: !!id, hasUser: !!user });
      throw new Error('Not ready — please reload the page');
    }
    if ((items?.length ?? 0) >= 12) {
      throw new Error('Max 12 featured items per event');
    }
    console.log(LOG, 'addItem:start', {
      eventId: id, title: input.title, price: input.price, hasFile: !!input.coverFile,
    });
    let image_url: string | null = null;
    let thumb_url: string | null = null;
    if (input.coverFile) {
      console.log(LOG, 'addItem:upload:start', { name: input.coverFile.name, bytes: input.coverFile.size });
      const dataUrl = await fileToDataUrl(input.coverFile);
      const up = await uploadCompressedImage(dataUrl, { userId: user.id, folder: 'events' });
      image_url = up.url;
      thumb_url = up.thumbUrl;
      console.log(LOG, 'addItem:upload:ok', { url: image_url });
    }
    try {
      const row = await addEventFeaturedItem(id, {
        title: input.title.trim(),
        price: input.price,
        image_url,
        thumb_url,
        position: (items?.length ?? 0),
      });
      console.log(LOG, 'addItem:insert:ok', { itemId: row.id });
      setItems((prev) => [...(prev ?? []), row]);
      flashToast('Item added', 'success');
    } catch (e: any) {
      // Visible to the user — not just an inline form error — because
      // RLS/trigger errors are subtle and easy to miss.
      console.error(LOG, 'addItem:insert:error', e);
      flashToast(`Couldn't add item: ${e?.message ?? 'unknown error'}`, 'error', 4000);
      throw e;
    }
  };

  const onRemoveItem = async (itemId: string) => {
    if (!confirm('Remove this featured item?')) return;
    try {
      console.log(LOG, 'removeItem', { itemId });
      await deleteEventFeaturedItem(itemId);
      setItems((prev) => (prev ?? []).filter((i) => i.id !== itemId));
      flashToast('Item removed', 'success');
    } catch (e: any) {
      console.error(LOG, 'removeItem:error', e);
      flashToast(`Couldn't remove item: ${e?.message ?? 'unknown error'}`, 'error', 4000);
    }
  };

  /* --------------- render --------------- */

  if (!profile) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} title={isEdit ? 'Edit event' : 'New event'} />
        <div style={s.loadingWrap}><Loader2 size={22} className="spin" /></div>
      </div>
    );
  }
  if (!isHolder) {
    return (
      <div style={s.container}>
        <Header onBack={onBack} title="New event" />
        <EmptyState
          icon={Store}
          title="Holder account required"
          body="Switch to a host account to create and edit events."
          action={<button onClick={() => navigate('/events')} style={s.primaryBtn}>Go to events</button>}
        />
      </div>
    );
  }

  return (
    <div style={s.container}>
      <Header onBack={onBack} title={isEdit ? 'Edit event' : 'New event'} right={
        isEdit && id ? (
          <button onClick={() => navigate(`/event/${id}`)} style={s.ghostBtn}>
            <Eye size={13} /> Preview
          </button>
        ) : null
      } />

      {loading ? (
        <div style={s.loadingWrap}><Loader2 size={22} className="spin" /></div>
      ) : (
        <>
          {/* Cover */}
          <section style={s.section}>
            <h3 style={s.sectionTitle}>Cover photo</h3>
            <CoverPicker
              url={coverUrl}
              thumb={coverThumb}
              uploading={uploadingCover}
              onPick={onPickCover}
              onClear={() => { setCoverUrl(null); setCoverThumb(null); }}
            />
          </section>

          {/* Basics */}
          <section style={s.section}>
            <h3 style={s.sectionTitle}>Basics</h3>

            <label style={s.label}>Title <span style={s.req}>*</span></label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Saturday Estate Sale — Mid-century furniture"
              style={s.input}
              maxLength={120}
            />

            <label style={s.label}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)} style={s.input}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <label style={s.label}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's being sold? Highlights, special instructions, parking notes…"
              style={{ ...s.input, minHeight: 110, resize: 'vertical' }}
              maxLength={2000}
            />
          </section>

          {/* When */}
          <section style={s.section}>
            <h3 style={s.sectionTitle}><Calendar size={14} style={{ verticalAlign: -2 }} /> When</h3>
            <label style={s.label}>Starts <span style={s.req}>*</span></label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={s.input}
            />
            <label style={s.label}>Ends (optional)</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={s.input}
            />
          </section>

          {/* Where */}
          <section style={s.section}>
            <h3 style={s.sectionTitle}><MapPin size={14} style={{ verticalAlign: -2 }} /> Where</h3>
            <label style={s.label}>Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St"
              style={s.input}
            />
            <div style={s.row2}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Portland" style={s.input} />
              </div>
              <div style={{ width: 120 }}>
                <label style={s.label}>State / Region</label>
                <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="OR" style={s.input} />
              </div>
            </div>
          </section>

          {/* Status */}
          <section style={s.section}>
            <h3 style={s.sectionTitle}>Visibility</h3>
            <div style={s.statusGroup}>
              {STATUSES.map((opt) => (
                <label key={opt.value} style={{
                  ...s.statusOption,
                  ...(status === opt.value ? s.statusOptionActive : {}),
                }}>
                  <input
                    type="radio"
                    name="status"
                    value={opt.value}
                    checked={status === opt.value}
                    onChange={() => setStatus(opt.value)}
                    style={{ marginRight: 8 }}
                  />
                  <span style={{ flex: 1 }}>
                    <span style={s.statusLabel}>{opt.label}</span>
                    <span style={s.statusHint}>{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {/* Featured items — only after the event row exists */}
          {isEdit && id && (
            <section style={s.section}>
              <h3 style={s.sectionTitle}>Featured items</h3>
              <p style={s.sectionHint}>
                Up to 12 preview items shown on your event page. Buyers can tap to see them larger.
              </p>
              <FeaturedItemsEditor
                items={items ?? []}
                onAdd={onAddItem}
                onRemove={onRemoveItem}
              />
            </section>
          )}

          {/* Sticky save bar */}
          {err && <div style={s.errorBanner}>{err}</div>}

          <div style={s.saveBar}>
            <button onClick={onBack} style={s.ghostBtnLg}>Cancel</button>
            <button onClick={onSave} disabled={saving} style={s.primaryBtnLg}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* --------------- Header --------------- */

function Header({ onBack, title, right }: { onBack: () => void; title: string; right?: React.ReactNode }) {
  return (
    <header style={s.header}>
      <button onClick={onBack} style={s.iconBtn} aria-label="Back">
        <ArrowLeft size={20} style={{ color: 'var(--color-neutral-700)' }} />
      </button>
      <h1 style={s.headerTitle}>{title}</h1>
      <div style={{ marginLeft: 'auto' }}>{right}</div>
    </header>
  );
}

/* --------------- Cover picker --------------- */

function CoverPicker({
  url, thumb, uploading, onPick, onClear,
}: {
  url: string | null;
  thumb: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const pick = () => ref.current?.click();
  return (
    <div style={s.coverWrap}>
      {url ? (
        <>
          <ImageWithFade
            src={toThumbUrl(thumb || url) ?? undefined}
            fallbackSrc={url}
            alt="Cover"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <button onClick={onClear} style={s.coverRemove} aria-label="Remove cover">
            <X size={14} />
          </button>
          <button onClick={pick} disabled={uploading} style={s.coverReplace}>
            {uploading ? 'Uploading…' : 'Replace'}
          </button>
        </>
      ) : (
        <button onClick={pick} disabled={uploading} style={s.coverEmpty}>
          {uploading ? <Loader2 size={20} className="spin" /> : <ImagePlus size={22} />}
          <span style={{ marginTop: 6, fontSize: 12, fontWeight: 600 }}>
            {uploading ? 'Uploading…' : 'Add cover photo'}
          </span>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/* --------------- Featured items editor --------------- */

const MAX_ITEMS = 12;

function FeaturedItemsEditor({
  items, onAdd, onRemove,
}: {
  items: EventFeaturedItem[];
  onAdd:    (input: { title: string; price: number | null; coverFile: File | null }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [title, setTitle]       = useState('');
  const [price, setPrice]       = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [busy, setBusy]         = useState(false);
  const [err,  setErr]          = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!title.trim()) { setErr('Item needs a title'); return; }
    if (items.length >= MAX_ITEMS) { setErr(`Max ${MAX_ITEMS} items per event`); return; }
    setErr(null);
    setBusy(true);
    try {
      const priceNum = price.trim() ? Number(price) : null;
      if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0)) {
        setErr('Price must be a positive number'); setBusy(false); return;
      }
      await onAdd({ title: title.trim(), price: priceNum, coverFile: file });
      setTitle(''); setPrice(''); setFile(null);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not add item');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {items.length > 0 && (
        <div style={s.itemGrid}>
          {items.map((it) => (
            <div key={it.id} style={s.itemTile}>
              <div style={s.itemThumb}>
                {it.thumb_url || it.image_url ? (
                  <ImageWithFade
                    src={toThumbUrl(it.thumb_url || it.image_url) ?? undefined}
                    fallbackSrc={it.image_url}
                    alt={it.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <ImagePlus size={18} style={{ color: 'var(--color-neutral-300)' }} />
                )}
              </div>
              <div style={s.itemBody}>
                <div style={s.itemTitle}>{it.title}</div>
                {it.price != null && (
                  <div style={s.itemPrice}>${Number(it.price).toFixed(2)}</div>
                )}
              </div>
              <button onClick={() => onRemove(it.id)} style={s.itemRemove} aria-label="Remove">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length >= MAX_ITEMS ? (
        <p style={s.sectionHint}>Maximum reached. Remove an item to add another.</p>
      ) : (
        <div style={s.addItemBox}>
          <div style={s.row2}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Item title"
              style={{ ...s.input, flex: 1 }}
              maxLength={80}
            />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price (optional)"
              inputMode="decimal"
              style={{ ...s.input, width: 130 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button onClick={() => fileRef.current?.click()} style={s.ghostBtn}>
              <ImagePlus size={13} /> {file ? file.name.slice(0, 18) : 'Add photo'}
            </button>
            {file && (
              <button onClick={() => setFile(null)} style={s.ghostBtn}>
                <X size={13} /> Clear
              </button>
            )}
            <button onClick={submit} disabled={busy} style={{ ...s.primaryBtn, marginLeft: 'auto' }}>
              {busy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
              {busy ? 'Adding…' : 'Add item'}
            </button>
          </div>
          {err && <p style={s.errorText}>{err}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
        </div>
      )}
    </div>
  );
}

/* --------------- Helpers --------------- */

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Convert ISO → value accepted by <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* --------------- Styles --------------- */

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    height: '100%', overflowY: 'auto',
    backgroundColor: 'var(--color-neutral-50)',
    paddingBottom: 88,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-neutral-0)',
    borderBottom: '1px solid var(--color-neutral-100)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer',
  },
  headerTitle: {
    margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  loadingWrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-6)',
  },

  section: {
    margin: 'var(--space-3) var(--space-4) 0',
    padding: 'var(--space-4)',
    background: 'var(--color-neutral-0)',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
  },
  sectionTitle: {
    margin: '0 0 var(--space-3)',
    fontSize: 'var(--font-size-base)', fontWeight: 700,
    color: 'var(--color-neutral-900)',
  },
  sectionHint: {
    margin: '0 0 var(--space-2)',
    fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)',
  },
  label: {
    display: 'block',
    marginTop: 'var(--space-3)',
    marginBottom: 4,
    fontSize: 'var(--font-size-xs)', fontWeight: 600,
    color: 'var(--color-neutral-700)',
  },
  req: { color: 'var(--color-error-700, #b91c1c)' },
  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-sm)',
    fontFamily: 'inherit',
    color: 'var(--color-neutral-900)',
    backgroundColor: 'var(--color-neutral-0)',
    outline: 'none', boxSizing: 'border-box',
  },
  row2: { display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' },

  // cover
  coverWrap: {
    position: 'relative',
    width: '100%', aspectRatio: '16 / 9',
    borderRadius: 'var(--radius-md)', overflow: 'hidden',
    background: 'var(--color-neutral-100)',
  },
  coverEmpty: {
    width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: '1px dashed var(--color-neutral-300)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-neutral-600)', cursor: 'pointer',
  },
  coverRemove: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff',
    cursor: 'pointer',
  },
  coverReplace: {
    position: 'absolute', bottom: 8, right: 8,
    padding: '6px 10px', borderRadius: 6,
    background: 'rgba(0,0,0,0.6)', color: '#fff',
    border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },

  // status radios
  statusGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  statusOption: {
    display: 'flex', alignItems: 'center',
    padding: 'var(--space-3)',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    backgroundColor: 'var(--color-neutral-0)',
  },
  statusOptionActive: {
    borderColor: 'var(--color-primary-600, #d97706)',
    backgroundColor: 'var(--color-primary-50, #fffbeb)',
  },
  statusLabel: { display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-neutral-900)' },
  statusHint:  { display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-500)', marginTop: 2 },

  // featured items
  itemGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 'var(--space-2)', marginBottom: 'var(--space-3)',
  },
  itemTile: {
    position: 'relative',
    display: 'flex', flexDirection: 'column',
    border: '1px solid var(--color-neutral-100)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-neutral-0)',
  },
  itemThumb: {
    width: '100%', aspectRatio: '1 / 1',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'var(--color-neutral-100)',
  },
  itemBody: { padding: '6px 8px' },
  itemTitle: {
    fontSize: 12, fontWeight: 600,
    color: 'var(--color-neutral-900)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  itemPrice: {
    fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 2,
  },
  itemRemove: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff',
    cursor: 'pointer',
  },
  addItemBox: {
    padding: 'var(--space-3)',
    border: '1px dashed var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
  },

  // bottom bar
  errorBanner: {
    margin: 'var(--space-3) var(--space-4) 0',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-error-50, #fef2f2)',
    border: '1px solid var(--color-error-200, #fecaca)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-error-700, #b91c1c)',
    fontSize: 'var(--font-size-sm)',
  },
  errorText: {
    margin: '8px 0 0',
    padding: '6px 8px',
    borderRadius: 6,
    backgroundColor: 'var(--color-error-50, #fef2f2)',
    color: 'var(--color-error-700, #b91c1c)',
    fontSize: 'var(--font-size-xs)',
  },
  saveBar: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
    padding: 'var(--space-3) var(--space-4) var(--space-4)',
  },
  ghostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '6px 10px', borderRadius: 6,
    border: '1px solid var(--color-neutral-200)',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  ghostBtnLg: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
  },
  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600, #d97706)',
    color: '#fff',
    fontSize: 'var(--font-size-xs)', fontWeight: 700,
  },
  primaryBtnLg: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600, #d97706)',
    color: '#fff',
    fontSize: 'var(--font-size-sm)', fontWeight: 700,
  },
};
