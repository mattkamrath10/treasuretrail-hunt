import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Calendar, MapPin, ImagePlus, Loader2, Plus, Trash2, Save,
  Eye, X, Store, Radio, Video, Zap, Repeat,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMyEvent, createEvent, updateEvent, countActiveLocalEvents,
  fetchEventFeaturedItems, addEventFeaturedItem, deleteEventFeaturedItem,
  deleteEvent, importEventFromUrl,
  PLATFORM_META, SHOW_CATEGORY_LABELS,
  type EventCategory, type EventStatus, type EventUpsert, type EventFeaturedItem,
  type EventKind, type EventPlatform, type ShowCategory, type EventRow,
} from '../lib/events';
import {
  describeRecurrence,
  type RecurrenceFreq, type MonthlyMode,
} from '../lib/recurrence';
import { geocodeEventLocation } from '../lib/geocode';
import { uploadCompressedImage } from '../lib/uploadImage';
import { toThumbUrl } from '../lib/imageCompress';
import { ImageWithFade } from '../components/ui/ImageWithFade';
import { EmptyState } from '../components/ui/EmptyState';
import { AccountRequired } from '../components/AccountRequired';
import { PageScroll } from '../components/ui/PageScroll';
import { UpgradeProCard } from '../components/ui/UpgradeProCard';
import { isProUser, FREE_TIER_EVENT_LIMIT } from '../lib/entitlements';
import { monetizationHidden } from '../lib/platform';
import { flashToast } from '../lib/toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';

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

// 0=Sun … 6=Sat, matching JS Date.getDay() and the recurrence engine.
const WEEKDAYS: { value: number; short: string }[] = [
  { value: 0, short: 'Sun' },
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
];

const NTH_OPTIONS: { value: number; label: string }[] = [
  { value: 1,  label: 'First'  },
  { value: 2,  label: 'Second' },
  { value: 3,  label: 'Third'  },
  { value: 4,  label: 'Fourth' },
  { value: -1, label: 'Last'   },
];

const FREQ_OPTIONS: { value: RecurrenceFreq; label: string }[] = [
  { value: 'none',    label: 'Does not repeat' },
  { value: 'daily',   label: 'Daily'   },
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
];

export default function SellerEventForm({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const { profile, user } = useAuth();
  const isEdit = !!id;
  const isHolder = profile?.account_type === 'holder';

  // form state
  const [loading, setLoading]   = useState(isEdit);
  const [saving,  setSaving]    = useState(false);
  const [err,     setErr]       = useState<string | null>(null);
  // Free-tier cap: when a free user tries to publish a 2nd active local
  // event we surface an inline upgrade prompt instead of a raw error.
  const [capBlocked, setCapBlocked] = useState(false);

  const [title,        setTitle]       = useState('');
  const [description,  setDescription] = useState('');
  const [eventUrl,     setEventUrl]    = useState('');
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

  // Phase 2 — online live event fields.
  const [eventKind,    setEventKind]    = useState<EventKind>('local');
  const [platform,     setPlatform]     = useState<EventPlatform>('whatnot');
  const [livestreamUrl,setLivestreamUrl]= useState('');
  const [sellerHandle, setSellerHandle] = useState('');
  const [showCategory, setShowCategory] = useState<ShowCategory | ''>('');

  // Recurrence — a recurring event is one row; these drive the repeat rule.
  const [recurrence,    setRecurrence]    = useState<RecurrenceFreq>('none');
  const [recurrenceDays,setRecurrenceDays]= useState<number[]>([]);
  const [monthlyMode,   setMonthlyMode]   = useState<MonthlyMode>('day_of_month');
  const [monthlyDom,    setMonthlyDom]     = useState<number>(1);
  const [monthlyNth,    setMonthlyNth]     = useState<number>(1);
  const [monthlyWeekday,setMonthlyWeekday]= useState<number>(6);
  const [endsMode,      setEndsMode]      = useState<'never' | 'on'>('never');
  const [recurrenceUntil, setRecurrenceUntil] = useState(''); // date input (YYYY-MM-DD)

  // Import-from-URL (create flow only).
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // featured items (edit only)
  const [items, setItems] = useState<EventFeaturedItem[] | null>(null);

  // Destructive-action confirmation state. Featured-item removal and whole-
  // event deletion both route through <ConfirmDialog> (App Store requires an
  // explicit confirm before any destructive action).
  const [pendingDeleteItem, setPendingDeleteItem] = useState<string | null>(null);
  const [removingItem, setRemovingItem] = useState(false);
  const [showDeleteEvent, setShowDeleteEvent] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);

  // Copy a loaded event's fields into form state. Shared by the edit-load and
  // the "Duplicate Event" flow. For duplicates we append "(Copy)" to the title
  // and force draft status; recurrence config is carried over verbatim.
  const prefillForm = (e: EventRow, opts?: { duplicate?: boolean }) => {
    setTitle(opts?.duplicate ? `${e.title} (Copy)`.slice(0, 120) : e.title);
    setDescription(e.description);
    setEventUrl(e.event_url ?? '');
    setCategory(e.category);
    setStartsAt(toLocalInput(e.starts_at));
    setEndsAt(e.ends_at ? toLocalInput(e.ends_at) : '');
    setAddress(e.address ?? '');
    setCity(e.city ?? '');
    setRegion(e.region ?? '');
    setCoverUrl(e.cover_image_url);
    setCoverThumb(e.cover_thumb_url);
    setStatus(opts?.duplicate ? 'draft' : e.status);
    setEventKind(e.event_kind);
    setPlatform(e.platform ?? 'whatnot');
    setLivestreamUrl(e.livestream_url ?? '');
    setSellerHandle(e.seller_handle ?? '');
    setShowCategory(e.show_category ?? '');
    // recurrence
    setRecurrence((e.recurrence ?? 'none') as RecurrenceFreq);
    setRecurrenceDays(e.recurrence_days ?? []);
    setMonthlyMode((e.recurrence_monthly_mode ?? 'day_of_month') as MonthlyMode);
    if (e.recurrence_day_of_month != null) setMonthlyDom(e.recurrence_day_of_month);
    if (e.recurrence_nth != null) setMonthlyNth(e.recurrence_nth);
    if (e.recurrence_weekday != null) setMonthlyWeekday(e.recurrence_weekday);
    if (e.recurrence_until) { setEndsMode('on'); setRecurrenceUntil(toDateInput(e.recurrence_until)); }
    else { setEndsMode('never'); setRecurrenceUntil(''); }
  };

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
        prefillForm(e);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id, user]);

  // Duplicate flow — /seller/new?duplicate=<id> prefills from an existing event
  // (owner-scoped), strips the id and forces draft so the user reviews & saves a
  // brand-new row. Featured items are NOT copied (they belong to the source).
  const duplicateId = searchParams.get('duplicate');
  const duplicatedRef = useRef(false);
  useEffect(() => {
    if (isEdit || !duplicateId || !user || duplicatedRef.current) return;
    duplicatedRef.current = true;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetchMyEvent(duplicateId, user.id)
      .then((e) => {
        if (cancelled) return;
        if (e) prefillForm(e, { duplicate: true });
        else setErr('Could not load the event to duplicate.');
        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setErr(e?.message ?? 'Failed to load event to duplicate');
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, duplicateId, user]);

  // Weekday of the chosen start, used to seed sensible recurrence defaults.
  const anchorWeekday = startsAt ? new Date(startsAt).getDay() : null;
  const anchorDom     = startsAt ? new Date(startsAt).getDate() : null;

  // Switching frequency seeds defaults from the start date so a user who picks
  // "Weekly" immediately sees the start's weekday selected, etc.
  const onChangeFrequency = (v: RecurrenceFreq) => {
    setRecurrence(v);
    if (v === 'weekly' && recurrenceDays.length === 0 && anchorWeekday != null) {
      setRecurrenceDays([anchorWeekday]);
    }
    if (v === 'monthly') {
      if (anchorDom != null) setMonthlyDom(anchorDom);
      if (anchorWeekday != null) setMonthlyWeekday(anchorWeekday);
    }
  };

  const toggleWeekday = (d: number) => {
    setRecurrenceDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  };

  // Build the recurrence slice of the upsert payload. When not repeating we
  // explicitly null every column so editing a recurring event back to one-off
  // clears the old rule.
  const buildRecurrencePayload = (): Partial<EventUpsert> => {
    if (recurrence === 'none') {
      return {
        recurrence: 'none',
        recurrence_days: null,
        recurrence_monthly_mode: null,
        recurrence_day_of_month: null,
        recurrence_nth: null,
        recurrence_weekday: null,
        recurrence_until: null,
      };
    }
    const until = endsMode === 'on' && recurrenceUntil
      ? new Date(`${recurrenceUntil}T23:59:59`).toISOString()
      : null;
    const out: Partial<EventUpsert> = {
      recurrence,
      recurrence_until: until,
      recurrence_days: null,
      recurrence_monthly_mode: null,
      recurrence_day_of_month: null,
      recurrence_nth: null,
      recurrence_weekday: null,
    };
    if (recurrence === 'weekly') {
      out.recurrence_days = recurrenceDays.length > 0
        ? [...recurrenceDays].sort((a, b) => a - b)
        : (anchorWeekday != null ? [anchorWeekday] : null);
    } else if (recurrence === 'monthly') {
      out.recurrence_monthly_mode = monthlyMode;
      if (monthlyMode === 'day_of_month') out.recurrence_day_of_month = monthlyDom;
      else { out.recurrence_nth = monthlyNth; out.recurrence_weekday = monthlyWeekday; }
    }
    return out;
  };

  // Live human-readable preview of the configured repeat rule.
  const recurrencePreview = recurrence === 'none'
    ? null
    : describeRecurrence({
        starts_at: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
        recurrence,
        recurrence_days: recurrence === 'weekly'
          ? (recurrenceDays.length > 0 ? recurrenceDays : (anchorWeekday != null ? [anchorWeekday] : []))
          : null,
        recurrence_monthly_mode: monthlyMode,
        recurrence_day_of_month: monthlyDom,
        recurrence_nth: monthlyNth,
        recurrence_weekday: monthlyWeekday,
      });

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

  const onImport = async () => {
    setErr(null);
    setImportMsg(null);
    const u = importUrl.trim();
    if (!u) { setImportMsg('Paste an event link first.'); return; }
    if (!isValidHttpUrl(u)) { setImportMsg('Enter a valid link starting with http:// or https://'); return; }

    setImporting(true);
    try {
      const d = await importEventFromUrl(u);

      // Always capture the link + platform routing. These are derived from the
      // pasted URL itself (not "extracted" content), so they DON'T count toward
      // import success — otherwise a link that yields no real data would still
      // show a misleading "imported" message.
      if (d.event_url) setEventUrl(d.event_url);
      setEventKind(d.event_kind);
      if (d.event_kind === 'online') {
        if (d.platform) setPlatform(d.platform);
        if (d.livestream_url) setLivestreamUrl(d.livestream_url);
      }

      // Count only substantive, genuinely-extracted fields.
      let filled = 0;

      if (d.title) { setTitle(d.title.slice(0, 120)); filled++; }

      // Fold seller/auctioneer name and lot count into the description since
      // the form has no dedicated field for them on local events.
      let desc = d.description ?? '';
      if (d.seller_name && !desc.toLowerCase().includes(d.seller_name.toLowerCase())) {
        desc = desc ? `${desc}\n\nHosted by ${d.seller_name}.` : `Hosted by ${d.seller_name}.`;
      }
      if (d.lot_count && d.lot_count > 0) {
        desc = `${desc}${desc ? '\n' : ''}Approx. ${d.lot_count} lots.`;
      }
      if (desc.trim()) { setDescription(desc.trim().slice(0, 2000)); filled++; }

      if (d.category) { setCategory(d.category); filled++; }
      if (d.starts_at) { const v = toLocalInput(d.starts_at); if (v) { setStartsAt(v); filled++; } }
      if (d.ends_at) { const v = toLocalInput(d.ends_at); if (v) setEndsAt(v); }

      if (d.event_kind === 'local') {
        if (d.address) { setAddress(d.address); filled++; }
        if (d.city) { setCity(d.city); filled++; }
        if (d.region) { setRegion(d.region); filled++; }
      }

      if (d.cover_image_url) { setCoverUrl(d.cover_image_url); setCoverThumb(null); filled++; }

      if (filled === 0) {
        setImportMsg("We couldn't pull details from that link — it may block automated reads. The link is saved; please fill in the event manually below.");
      } else {
        setImportMsg(`Imported ${filled} field${filled === 1 ? '' : 's'} — review everything below, then publish.`);
        flashToast('Event details imported — review & publish', 'success');
      }
    } catch (e: any) {
      setImportMsg(e?.message ?? 'Import failed. Enter the event manually below.');
    } finally {
      setImporting(false);
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

    // Optional Event URL — validate only when provided. Must be a real
    // http(s) link so the EventDetail "Visit Event Page" button never
    // opens a broken or javascript: URL.
    const cleanEventUrl = eventUrl.trim();
    if (cleanEventUrl && !isValidHttpUrl(cleanEventUrl)) {
      setErr('Event URL must be a valid link starting with http:// or https://');
      return;
    }

    // Online-event validation — mirror of DB CHECK constraint. If we let
    // a bad URL through, the DB throws a cryptic CHECK error; better to
    // catch it inline.
    if (eventKind === 'online') {
      const url = livestreamUrl.trim();
      if (!url) { setErr('Livestream URL is required for online events'); return; }
      if (!PLATFORM_META[platform].urlPattern.test(url)) {
        setErr(`That URL doesn\'t look like a ${PLATFORM_META[platform].label} link.`);
        return;
      }
      if (sellerHandle.trim() && !/^@?[A-Za-z0-9_.-]{1,40}$/.test(sellerHandle.trim())) {
        setErr('Seller handle can only contain letters, numbers, dots, dashes and underscores.');
        return;
      }
    }

    // Recurrence — when the event repeats, validate the bounded end date.
    if (recurrence !== 'none' && endsMode === 'on') {
      if (!recurrenceUntil) {
        setErr('Choose a repeat end date or set the event to never end.'); return;
      }
      if (new Date(`${recurrenceUntil}T23:59:59`) < new Date(startsAt)) {
        setErr('Repeat end date must be on or after the start date.'); return;
      }
    }

    const isOnline = eventKind === 'online';
    const payload: EventUpsert = {
      title: title.trim(),
      description: description.trim(),
      category,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      // Address fields are local-only; null them out for online so the
      // DB shape-integrity CHECK doesn't complain on a kind switch.
      address: isOnline ? null : (address.trim() || null),
      city:    isOnline ? null : (city.trim()    || null),
      region:  isOnline ? null : (region.trim()  || null),
      cover_image_url: coverUrl,
      cover_thumb_url: coverThumb,
      status,
      event_url:      cleanEventUrl || null,
      event_kind:     eventKind,
      platform:       isOnline ? platform : null,
      livestream_url: isOnline ? livestreamUrl.trim() : null,
      seller_handle:  isOnline ? (sellerHandle.trim() || null) : null,
      show_category:  isOnline ? (showCategory || null) : null,
      ...buildRecurrencePayload(),
    };

    // Geocode local events to a coordinate so they show up in the Local
    // Events location search (which filters on lat/lng within a radius).
    // Online shows have no physical location, so their coordinates are
    // always cleared. Geocoding is best-effort: if the provider can't
    // resolve the address we keep the existing coordinates on edit (and
    // leave them null on create) and warn, rather than failing the save.
    // Tracks whether a local event couldn't be geocoded so we can warn the
    // user — but only AFTER the save actually succeeds (warning before the
    // DB write would falsely claim "Saved" if the cap check blocks it or the
    // write fails).
    let geocodeMissed = false;
    if (isOnline) {
      payload.lat = null;
      payload.lng = null;
    } else {
      try {
        const point = await geocodeEventLocation({
          address: address.trim(),
          city: city.trim(),
          region: region.trim(),
        });
        if (point) {
          payload.lat = point.lat;
          payload.lng = point.lng;
        } else {
          if (!isEdit) { payload.lat = null; payload.lng = null; }
          geocodeMissed = true;
        }
      } catch (e: any) {
        console.warn(LOG, 'geocode:failed', e?.message);
        if (!isEdit) { payload.lat = null; payload.lng = null; }
        geocodeMissed = true;
      }
    }

    // Free-tier cap: a free user may keep only FREE_TIER_EVENT_LIMIT active
    // local events. Online live shows don't count, and cancelled events are
    // free. We only check when this save would *result in* an active local
    // event — drafts/cancelled and online events are always allowed. The DB
    // trigger is the real backstop; this is the friendly pre-save guard.
    const willBeActiveLocal = !isOnline && payload.status !== 'cancelled';
    if (willBeActiveLocal && !isProUser(profile)) {
      try {
        const active = await countActiveLocalEvents(user.id, isEdit ? id : undefined);
        if (active >= FREE_TIER_EVENT_LIMIT) {
          setCapBlocked(true);
          setErr(
            monetizationHidden()
              ? `You can have ${FREE_TIER_EVENT_LIMIT} active local event at a time. ` +
                `Cancel or delete your existing event to create a new one.`
              : `Free accounts can have ${FREE_TIER_EVENT_LIMIT} active local event at a time. ` +
                `Cancel or delete your existing event, or upgrade to Pro for unlimited events.`,
          );
          flashToast(
            monetizationHidden()
              ? 'Event limit reached — cancel or delete an existing event first'
              : 'Free plan limit reached — upgrade to Pro for unlimited events',
            'error',
            4000,
          );
          return;
        }
      } catch (e: any) {
        // If the count query fails we don't hard-block on the client — the
        // DB trigger still enforces the cap, so let the save attempt proceed
        // and surface any trigger error normally.
        console.warn(LOG, 'cap:check:failed', e?.message);
      }
    }
    setCapBlocked(false);

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
        if (geocodeMissed) {
          flashToast(
            "Saved, but we couldn't pin this address on the map — add a city and state so it shows up in location search.",
            'error',
            4500,
          );
        }
      } else {
        console.log(LOG, 'save:create');
        const row = await createEvent(user.id, payload);
        console.log(LOG, 'save:create:ok', { id: row.id });
        flashToast('Event created', 'success');
        if (geocodeMissed) {
          flashToast(
            "Created, but we couldn't pin this address on the map — add a city and state so it shows up in location search.",
            'error',
            4500,
          );
        }
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

  // Step 1: open the styled confirm modal for a featured item.
  const onRemoveItem = (itemId: string) => setPendingDeleteItem(itemId);

  // Step 2: user confirmed — remove from DB + storage, then drop from the UI.
  const confirmRemoveItem = async () => {
    const itemId = pendingDeleteItem;
    if (!itemId) return;
    setRemovingItem(true);
    try {
      console.log(LOG, 'removeItem', { itemId });
      await deleteEventFeaturedItem(itemId);
      setItems((prev) => (prev ?? []).filter((i) => i.id !== itemId));
      setPendingDeleteItem(null);
      flashToast('Item removed', 'success');
    } catch (e: any) {
      console.error(LOG, 'removeItem:error', e);
      flashToast(`Couldn't remove item: ${e?.message ?? 'unknown error'}`, 'error', 4000);
    } finally {
      setRemovingItem(false);
    }
  };

  // Permanently delete the whole event. The featured-item ROWS are removed by
  // the ON DELETE CASCADE on event_featured_items.event_id; deleteEvent()
  // additionally purges the cover + per-item storage images. On success we
  // return to My Events (Profile) with a confirmation toast.
  const confirmDeleteEvent = async () => {
    if (!id) return;
    setDeletingEvent(true);
    try {
      console.log(LOG, 'deleteEvent', { id });
      await deleteEvent(id);
      setShowDeleteEvent(false);
      flashToast('Event deleted', 'success');
      navigate('/profile');
    } catch (e: any) {
      console.error(LOG, 'deleteEvent:error', e);
      flashToast(`Couldn't delete event: ${e?.message ?? 'unknown error'}`, 'error', 4000);
      setDeletingEvent(false);
    }
  };

  /* --------------- render --------------- */

  // A guest (no signed-in user) reaching the event form gets the Account
  // Required screen instead of a never-ending spinner — guests have no
  // profile, so the old `if (!profile)` spinner hung forever (the blank
  // pink screen bug).
  if (!user) {
    return <AccountRequired message="Create a free account to host events on TreasureTrail Marketplace." />;
  }
  if (!profile) {
    return (
      <PageScroll style={s.container}>
        <Header onBack={onBack} title={isEdit ? 'Edit event' : 'New event'} />
        <div style={s.loadingWrap}><Loader2 size={22} className="spin" /></div>
      </PageScroll>
    );
  }
  if (!isHolder) {
    return (
      <PageScroll style={s.container}>
        <Header onBack={onBack} title="New event" />
        <EmptyState
          icon={Store}
          title="Holder account required"
          body="Switch to a host account to create and edit events."
          action={<button onClick={() => navigate('/events')} style={s.primaryBtn}>Go to events</button>}
        />
      </PageScroll>
    );
  }

  return (
    <div style={s.page}>
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
          <PageScroll style={s.scrollBody}>
          {/* Import from URL — primary fast path (create flow only) */}
          {!isEdit && (
            <section style={s.importCard}>
              <h3 style={s.importTitle}>
                <Zap size={16} style={{ verticalAlign: -3, color: 'var(--color-primary-600, #d97706)' }} /> Import Event From URL
              </h3>
              <p style={s.importHint}>
                Paste a HiBid, Whatnot, eBay Live, Facebook Event, Poshmark Live, AuctionZip, or
                EstateSales.net link and we'll fill in the details for you.
              </p>
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onImport(); } }}
                placeholder="Paste event URL here"
                style={s.input}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={importing}
              />
              <button
                type="button"
                onClick={onImport}
                disabled={importing}
                style={{ ...s.importBtn, opacity: importing ? 0.7 : 1 }}
              >
                {importing ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                {importing ? 'Importing…' : 'Import Event'}
              </button>
              {importMsg && <p style={s.importMsg}>{importMsg}</p>}
              <div style={s.importDivider}><span style={s.importDividerText}>or create event manually</span></div>
            </section>
          )}

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

          {/* Kind toggle — local vs online live show */}
          <section style={s.section}>
            <h3 style={s.sectionTitle}>Event type</h3>
            <div style={s.kindRow}>
              <button
                type="button"
                onClick={() => setEventKind('local')}
                style={{ ...s.kindCard, ...(eventKind === 'local' ? s.kindCardActive : {}) }}
              >
                <MapPin size={18} />
                <span style={s.kindLabel}>Local sale</span>
                <span style={s.kindHint}>Estate, yard, flea, in-person auction</span>
              </button>
              <button
                type="button"
                onClick={() => setEventKind('online')}
                style={{ ...s.kindCard, ...(eventKind === 'online' ? s.kindCardActive : {}) }}
              >
                <Radio size={18} />
                <span style={s.kindLabel}>Online live show</span>
                <span style={s.kindHint}>Whatnot, Poshmark Live, eBay Live</span>
              </button>
            </div>
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

            <label style={s.label}>Event URL (optional)</label>
            <input
              value={eventUrl}
              onChange={(e) => setEventUrl(e.target.value)}
              placeholder="https://facebook.com/events/… or estate-sale / auction page"
              style={s.input}
              inputMode="url"
              spellCheck={false}
              maxLength={500}
            />
            <p style={s.sectionHint}>
              Link a Facebook event, estate-sale site, HiBid auction, Whatnot stream, or any external event page. Opens in a new tab — keep links out of the description.
            </p>
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

          {/* Repeats */}
          <section style={s.section}>
            <h3 style={s.sectionTitle}><Repeat size={14} style={{ verticalAlign: -2 }} /> Repeats</h3>
            <label style={s.label}>Frequency</label>
            <select
              value={recurrence}
              onChange={(e) => onChangeFrequency(e.target.value as RecurrenceFreq)}
              style={s.input}
            >
              {FREQ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {recurrence === 'weekly' && (
              <>
                <label style={s.label}>Repeat on</label>
                <div style={s.dayRow}>
                  {WEEKDAYS.map((d) => {
                    const on = recurrenceDays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleWeekday(d.value)}
                        style={{ ...s.dayChip, ...(on ? s.dayChipOn : {}) }}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {recurrence === 'monthly' && (
              <>
                <label style={s.label}>Monthly pattern</label>
                <select
                  value={monthlyMode}
                  onChange={(e) => setMonthlyMode(e.target.value as MonthlyMode)}
                  style={s.input}
                >
                  <option value="day_of_month">On a day of the month</option>
                  <option value="nth_weekday">On a weekday of the month</option>
                </select>
                {monthlyMode === 'day_of_month' ? (
                  <>
                    <label style={s.label}>Day of month</label>
                    <select
                      value={monthlyDom}
                      onChange={(e) => setMonthlyDom(Number(e.target.value))}
                      style={s.input}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div style={s.row2}>
                    <select
                      value={monthlyNth}
                      onChange={(e) => setMonthlyNth(Number(e.target.value))}
                      style={s.input}
                    >
                      {NTH_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <select
                      value={monthlyWeekday}
                      onChange={(e) => setMonthlyWeekday(Number(e.target.value))}
                      style={s.input}
                    >
                      {WEEKDAYS.map((d) => (
                        <option key={d.value} value={d.value}>{d.short}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {recurrence !== 'none' && (
              <>
                <label style={s.label}>Ends</label>
                <select
                  value={endsMode}
                  onChange={(e) => setEndsMode(e.target.value as 'never' | 'on')}
                  style={s.input}
                >
                  <option value="never">Never</option>
                  <option value="on">On a date</option>
                </select>
                {endsMode === 'on' && (
                  <input
                    type="date"
                    value={recurrenceUntil}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    style={s.input}
                  />
                )}
                {recurrencePreview && (
                  <p style={s.recurrenceHint}>{recurrencePreview}</p>
                )}
              </>
            )}
          </section>

          {/* Where (local) / Live show details (online) */}
          {eventKind === 'local' ? (
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
          ) : (
            <section style={s.section}>
              <h3 style={s.sectionTitle}><Video size={14} style={{ verticalAlign: -2 }} /> Live show details</h3>

              <label style={s.label}>Platform <span style={s.req}>*</span></label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as EventPlatform)}
                style={s.input}
              >
                {(Object.keys(PLATFORM_META) as EventPlatform[]).map((p) => (
                  <option key={p} value={p}>{PLATFORM_META[p].label}</option>
                ))}
              </select>

              <label style={s.label}>Livestream URL <span style={s.req}>*</span></label>
              <input
                value={livestreamUrl}
                onChange={(e) => setLivestreamUrl(e.target.value)}
                placeholder={PLATFORM_META[platform].placeholderUrl}
                style={s.input}
                inputMode="url"
                spellCheck={false}
              />
              <p style={s.sectionHint}>
                Must be a public link on {PLATFORM_META[platform].label}. We open it in a new tab — TreasureTrail never hosts the stream.
              </p>

              <label style={s.label}>Your handle on {PLATFORM_META[platform].label} (optional)</label>
              <input
                value={sellerHandle}
                onChange={(e) => setSellerHandle(e.target.value)}
                placeholder="@yourhandle"
                style={s.input}
                spellCheck={false}
                maxLength={40}
              />

              <label style={s.label}>What you're selling (optional)</label>
              <select
                value={showCategory}
                onChange={(e) => setShowCategory(e.target.value as ShowCategory | '')}
                style={s.input}
              >
                <option value="">— Choose a category —</option>
                {(Object.keys(SHOW_CATEGORY_LABELS) as ShowCategory[]).map((c) => (
                  <option key={c} value={c}>{SHOW_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </section>
          )}

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

          {!monetizationHidden() && capBlocked && (
            <div style={{ margin: '0 var(--space-4) var(--space-3)' }}>
              <UpgradeProCard onUpgrade={() => navigate('/pro')} />
            </div>
          )}

          {/* Danger Zone — destructive event deletion, edit mode only */}
          {isEdit && id && (
            <section style={s.dangerZone}>
              <h3 style={s.dangerTitle}>Danger Zone</h3>
              <p style={s.dangerHint}>
                Deleting this event is permanent and removes all of its featured items.
              </p>
              <button
                onClick={() => setShowDeleteEvent(true)}
                style={s.deleteEventBtn}
              >
                <Trash2 size={15} />
                Delete Event
              </button>
            </section>
          )}
          </PageScroll>

          {/* Sticky footer — Cancel + Create/Save stay reachable above the
              BottomNav + safe area and are never hidden by the keyboard. */}
          <footer style={s.footer}>
            {err && <div style={s.errorBanner}>{err}</div>}
            <div style={s.saveBar}>
              <button onClick={onBack} style={s.ghostBtnLg}>Cancel</button>
              <button onClick={onSave} disabled={saving} style={s.primaryBtnLg}>
                {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
              </button>
            </div>
          </footer>
        </>
      )}

      {pendingDeleteItem && (
        <ConfirmDialog
          title="Delete this item?"
          message="This item will be removed from the event."
          confirmLabel="Delete"
          busy={removingItem}
          onConfirm={confirmRemoveItem}
          onCancel={() => setPendingDeleteItem(null)}
        />
      )}

      {showDeleteEvent && (
        <ConfirmDialog
          title="Delete Event?"
          message="This action cannot be undone and will permanently remove this event and all associated featured items."
          confirmLabel="Delete Event"
          busy={deletingEvent}
          onConfirm={confirmDeleteEvent}
          onCancel={() => setShowDeleteEvent(false)}
        />
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
  onRemove: (id: string) => void;
}) {
  const [title, setTitle]       = useState('');
  const [price, setPrice]       = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [busy, setBusy]         = useState(false);
  const [err,  setErr]          = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasDraft = title.trim().length > 0 || price.trim().length > 0 || !!file;

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
          <p style={s.addItemHeading}>
            Add a new item — fill in below, then click <strong>Add item</strong> to save it to this event.
          </p>
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
            <button
              onClick={submit}
              disabled={busy}
              style={{
                ...s.primaryBtnLg,
                marginLeft: 'auto',
                ...(hasDraft && !busy ? s.addItemBtnHighlight : {}),
              }}
            >
              {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
              {busy ? 'Adding…' : 'Add item'}
            </button>
          </div>
          {/* When the user has typed something but hasn't clicked Add yet,
              call it out — this is the single most common pitfall, where
              "Save changes" gets clicked with an in-progress draft and the
              item is silently dropped. */}
          {hasDraft && !busy && (
            <p style={s.draftWarn}>
              ⚠ You have an unsaved item draft. Click <strong>Add item</strong> above, or it won't be saved with this event.
            </p>
          )}
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

/** True only for well-formed http(s) URLs. Rejects javascript:, data:,
 *  bare strings, and other non-web schemes. */
function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Convert ISO → value accepted by <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert ISO → value accepted by <input type="date"> (local calendar day). */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

/* --------------- Styles --------------- */

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    backgroundColor: 'var(--color-neutral-50)',
    // Clear the fixed BottomNav (var(--nav-height) 64px) + the iOS home-indicator
    // safe-area inset so the final "Create event" / "Save changes" button is
    // always scrollable into view and never sits behind the nav bar on iPhone.
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)',
  },
  // Page is a flex column inside AppShell's fixed-height content slot: a static
  // header, a scrollable body (flex:1), and a sticky footer. This keeps the
  // Cancel/Create-Event buttons pinned above the BottomNav and visible when the
  // webview resizes for the keyboard, on every screen size and orientation.
  page: {
    height: '100%',
    display: 'flex', flexDirection: 'column',
    backgroundColor: 'var(--color-neutral-50)',
  },
  scrollBody: {
    flex: 1, minHeight: 0, height: 'auto',
    backgroundColor: 'var(--color-neutral-50)',
    paddingBottom: 'var(--space-4)',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--space-4))',
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

  // Import-from-URL card — visually primary above the manual form.
  importCard: {
    margin: 'var(--space-3) var(--space-4) 0',
    padding: 'var(--space-4)',
    background: 'linear-gradient(135deg, var(--color-primary-50, #fff7ed), var(--color-neutral-0))',
    border: '1px solid var(--color-primary-200, #fed7aa)',
    borderRadius: 'var(--radius-md)',
  },
  importTitle: {
    margin: '0 0 6px',
    fontSize: 'var(--font-size-base)', fontWeight: 800,
    color: 'var(--color-neutral-900)',
  },
  importHint: {
    margin: '0 0 var(--space-3)',
    fontSize: 'var(--font-size-xs)', color: 'var(--color-neutral-600)',
    lineHeight: 1.45,
  },
  importBtn: {
    marginTop: 8, width: '100%', minHeight: 44,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
    background: 'var(--color-primary-600, #d97706)', color: '#fff',
    fontSize: 'var(--font-size-sm)', fontWeight: 700,
  },
  importMsg: {
    margin: '10px 0 0',
    fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-700, #b45309)',
    lineHeight: 1.45,
  },
  importDivider: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginTop: 'var(--space-3)',
  },
  importDividerText: {
    fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--color-neutral-400)', fontWeight: 700,
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

  // recurrence
  dayRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  dayChip: {
    minWidth: 44,
    padding: 'var(--space-2) var(--space-2)',
    border: '1px solid var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-xs)', fontWeight: 600,
    color: 'var(--color-neutral-700)',
    backgroundColor: 'var(--color-neutral-0)',
    cursor: 'pointer',
  },
  dayChipOn: {
    borderColor: 'var(--color-primary-500, #2563eb)',
    backgroundColor: 'var(--color-primary-50, #eff6ff)',
    color: 'var(--color-primary-700, #1d4ed8)',
  },
  recurrenceHint: {
    margin: 'var(--space-3) 0 0',
    fontSize: 'var(--font-size-xs)', fontWeight: 600,
    color: 'var(--color-primary-700, #1d4ed8)',
  },

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
  kindRow: {
    display: 'flex', gap: 8,
  },
  kindCard: {
    flex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-neutral-200)',
    background: 'var(--color-neutral-0)',
    color: 'var(--color-neutral-700)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  kindCardActive: {
    borderColor: 'var(--color-primary-500)',
    background: 'var(--color-primary-50, #fff7ed)',
    color: 'var(--color-primary-700)',
    boxShadow: '0 0 0 2px rgba(217,119,6,0.15)',
  },
  kindLabel: { fontSize: 13, fontWeight: 700, marginTop: 4 },
  kindHint: { fontSize: 11, color: 'var(--color-neutral-500)', lineHeight: 1.3 },
  addItemBox: {
    padding: 'var(--space-3)',
    border: '1px dashed var(--color-neutral-200)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-neutral-50)',
  },
  addItemHeading: {
    margin: '0 0 8px',
    fontSize: 12,
    color: 'var(--color-neutral-600)',
    lineHeight: 1.4,
  },
  addItemBtnHighlight: {
    boxShadow: '0 0 0 3px rgba(217, 119, 6, 0.25)',
    transform: 'scale(1.02)',
  },
  draftWarn: {
    margin: '8px 0 0',
    padding: '8px 10px',
    borderRadius: 6,
    backgroundColor: 'var(--color-warning-50, #fffbeb)',
    border: '1px solid var(--color-warning-200, #fde68a)',
    color: 'var(--color-warning-700, #b45309)',
    fontSize: 12,
    lineHeight: 1.4,
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
  // Sticky footer container. The BottomNav sits directly below this footer and
  // already pads the home-indicator safe area, so we deliberately do NOT add
  // safe-area-inset-bottom here (that would double the gap on iPhone).
  footer: {
    flexShrink: 0,
    background: 'var(--color-neutral-0)',
    borderTop: '1px solid var(--color-neutral-100)',
  },
  saveBar: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
    padding: 'var(--space-3) var(--space-4) var(--space-4)',
  },
  dangerZone: {
    margin: 'var(--space-2) var(--space-4) var(--space-6)',
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-error-200, #fecaca)',
    background: 'var(--color-error-50, #fef2f2)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
  },
  dangerTitle: {
    margin: 0,
    fontSize: 'var(--font-size-sm)', fontWeight: 700,
    color: 'var(--color-error-700, #b91c1c)',
  },
  dangerHint: {
    margin: 0,
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-error-600, #dc2626)',
    lineHeight: 1.5,
  },
  deleteEventBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'flex-start',
    marginTop: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: 'none', cursor: 'pointer',
    background: 'var(--color-error-600, #dc2626)',
    color: '#fff',
    fontSize: 'var(--font-size-sm)', fontWeight: 700,
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
