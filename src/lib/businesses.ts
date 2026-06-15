import { supabase } from './supabase';
import { extractStoragePath } from './moderation';

/**
 * Data layer for businesses on the Treasure Map (Phase 1).
 *
 * Mirrors the conventions in `events.ts`: typed row/upsert shapes, a small
 * fetch/create/update/delete surface, and graceful degradation when the
 * Supabase migration hasn't been applied yet. The `businesses` table is new,
 * so the only realistic schema-drift error is "table doesn't exist" (42P01) —
 * fetchers swallow it and return empty so the app never hard-crashes before the
 * user runs the migration. Column-drift (42703 / PGRST204) is also tolerated on
 * writes by stripping the offending optional column and retrying.
 */

const LOG = '[BUSINESSES]';
const STORAGE_BUCKET = 'avatars';

export type BusinessCategory =
  | 'antique_store'
  | 'thrift_store'
  | 'pawn_shop'
  | 'estate_sale_company'
  | 'auction_house'
  | 'consignment_store'
  | 'flea_market'
  | 'vintage_store';

export type BusinessStatus = 'draft' | 'published' | 'cancelled';

export interface BusinessPhoto {
  url: string;
  thumb_url?: string | null;
}

export interface BusinessRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  category: BusinessCategory;
  address: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  facebook_url: string | null;
  hours: string | null;
  logo_url: string | null;
  logo_thumb_url: string | null;
  photos: BusinessPhoto[];
  status: BusinessStatus;
  verified: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessUpsert {
  name: string;
  description: string;
  category: BusinessCategory;
  address: string | null;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  facebook_url: string | null;
  hours: string | null;
  logo_url: string | null;
  logo_thumb_url: string | null;
  photos: BusinessPhoto[];
  status: BusinessStatus;
}

/** Per-category label + map-pin color. Single source of truth for the map,
 *  the filter chips, the detail page badge, and the create form. */
export const BUSINESS_CATEGORY_META: Record<
  BusinessCategory,
  { label: string; color: string }
> = {
  antique_store:       { label: 'Antique Store',        color: '#b45309' },
  thrift_store:        { label: 'Thrift Store',         color: '#0e7490' },
  pawn_shop:           { label: 'Pawn Shop',            color: '#6d28d9' },
  estate_sale_company: { label: 'Estate Sale Company',  color: '#9f1239' },
  auction_house:       { label: 'Auction House',        color: '#1e3a8a' },
  consignment_store:   { label: 'Consignment Store',    color: '#15803d' },
  flea_market:         { label: 'Flea Market',          color: '#c2410c' },
  vintage_store:       { label: 'Vintage Store',        color: '#a21caf' },
};

export const BUSINESS_CATEGORIES = Object.keys(
  BUSINESS_CATEGORY_META,
) as BusinessCategory[];

/** Normalize a raw Supabase row into a typed BusinessRow. `photos` is stored
 *  as jsonb and may come back as anything, so we defensively coerce it. */
function normalizeRow(r: any): BusinessRow {
  let photos: BusinessPhoto[] = [];
  if (Array.isArray(r?.photos)) {
    photos = r.photos
      .filter((p: any) => p && typeof p.url === 'string')
      .map((p: any) => ({ url: p.url, thumb_url: p.thumb_url ?? null }));
  }
  return {
    id: r.id,
    owner_id: r.owner_id,
    name: r.name ?? '',
    description: r.description ?? '',
    category: r.category,
    address: r.address ?? null,
    city: r.city ?? null,
    region: r.region ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    phone: r.phone ?? null,
    website: r.website ?? null,
    facebook_url: r.facebook_url ?? null,
    hours: r.hours ?? null,
    logo_url: r.logo_url ?? null,
    logo_thumb_url: r.logo_thumb_url ?? null,
    photos,
    status: r.status ?? 'published',
    verified: !!r.verified,
    featured: !!r.featured,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** True when the error means the `businesses` table hasn't been created yet
 *  (migration not applied). We treat this as "no businesses" rather than an
 *  error so the map and search keep working pre-migration. */
function isTableMissing(error: any): boolean {
  return error?.code === '42P01' || /relation .*businesses.* does not exist/i.test(error?.message ?? '');
}

const SELECT_COLS =
  'id, owner_id, name, description, category, address, city, region, lat, lng, ' +
  'phone, website, facebook_url, hours, logo_url, logo_thumb_url, photos, ' +
  'status, verified, featured, created_at, updated_at';

// Minimal column set guaranteed to exist on the earliest businesses schema.
// Used as a fallback select when a partial migration leaves optional columns
// absent so reads degrade gracefully (a missing column otherwise 400s the whole
// SELECT). normalizeRow defaults every absent field, so reduced rows are safe.
const CORE_SELECT_COLS =
  'id, owner_id, name, description, category, address, city, region, ' +
  'status, created_at, updated_at';

/** True when the error means a selected column doesn't exist yet (partial
 *  migration). Raw Postgres returns 42703; PostgREST's schema cache returns
 *  PGRST204. Either way we retry with the minimal column set. */
function isColumnMissing(error: any): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

/** Run a businesses read built by `build(cols)`. On a column-missing error we
 *  retry once with the minimal column set so a half-applied migration never
 *  breaks the map/search/detail reads. */
async function readWithColumnFallback(
  build: (cols: string) => PromiseLike<{ data: any; error: any }>,
): Promise<{ data: any; error: any }> {
  let res = await build(SELECT_COLS);
  if (res.error && isColumnMissing(res.error)) {
    console.warn(LOG, 'optional businesses column(s) missing — retrying with core columns. Apply the migration to enable all fields.');
    res = await build(CORE_SELECT_COLS);
  }
  return res;
}

/** All published businesses (for the map + search). Returns [] if the table
 *  doesn't exist yet. */
export async function fetchPublishedBusinesses(): Promise<BusinessRow[]> {
  const { data, error } = await readWithColumnFallback((cols) =>
    supabase
      .from('businesses')
      .select(cols)
      .eq('status', 'published')
      .order('created_at', { ascending: false }),
  );
  if (error) {
    if (isTableMissing(error)) {
      console.warn(LOG, 'businesses table missing — run the migration. Returning [].');
      return [];
    }
    console.error(LOG, 'fetchPublishedBusinesses', error);
    throw error;
  }
  return (data ?? []).map(normalizeRow);
}

/** Single business by id (public detail page). Owner can see their own
 *  draft/cancelled rows via RLS. Returns null if missing. */
export async function fetchBusiness(id: string): Promise<BusinessRow | null> {
  const { data, error } = await readWithColumnFallback((cols) =>
    supabase
      .from('businesses')
      .select(cols)
      .eq('id', id)
      .maybeSingle(),
  );
  if (error) {
    if (isTableMissing(error)) return null;
    console.error(LOG, 'fetchBusiness', error);
    throw error;
  }
  return data ? normalizeRow(data) : null;
}

/** Owner-scoped fetch for the edit form. Returns null when the row isn't the
 *  caller's (RLS) or doesn't exist. */
export async function fetchMyBusiness(id: string, ownerId: string): Promise<BusinessRow | null> {
  const { data, error } = await readWithColumnFallback((cols) =>
    supabase
      .from('businesses')
      .select(cols)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .maybeSingle(),
  );
  if (error) {
    if (isTableMissing(error)) return null;
    console.error(LOG, 'fetchMyBusiness', error);
    throw error;
  }
  return data ? normalizeRow(data) : null;
}

/** All of a user's businesses (any status), for a future "my businesses" list. */
export async function fetchMyBusinesses(ownerId: string): Promise<BusinessRow[]> {
  const { data, error } = await readWithColumnFallback((cols) =>
    supabase
      .from('businesses')
      .select(cols)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false }),
  );
  if (error) {
    if (isTableMissing(error)) return [];
    console.error(LOG, 'fetchMyBusinesses', error);
    throw error;
  }
  return (data ?? []).map(normalizeRow);
}

// Optional columns that may be absent on an older partial schema. If a write
// fails with 42703 / PGRST204 naming one of these, we strip it and retry so a
// half-applied migration still lets the core row save.
const OPTIONAL_WRITE_COLS = [
  'facebook_url', 'hours', 'logo_thumb_url', 'photos', 'phone', 'website', 'region',
];

function classifyMissingColumn(error: any): string | null {
  if (!error) return null;
  if (error.code !== '42703' && error.code !== 'PGRST204') return null;
  const msg = error.message ?? '';
  for (const col of OPTIONAL_WRITE_COLS) {
    if (new RegExp(`\\b${col}\\b`).test(msg)) return col;
  }
  return null;
}

/** Insert/update with column-drift retry. `mode` selects insert vs update. */
async function writeBusinessRow(
  payload: Record<string, any>,
  mode: { kind: 'insert' } | { kind: 'update'; id: string; ownerId: string },
): Promise<BusinessRow> {
  let body = { ...payload };
  for (let attempt = 0; attempt < OPTIONAL_WRITE_COLS.length + 1; attempt++) {
    const q =
      mode.kind === 'insert'
        ? supabase.from('businesses').insert(body).select(SELECT_COLS).single()
        : supabase
            .from('businesses')
            .update(body)
            .eq('id', mode.id)
            .eq('owner_id', mode.ownerId)
            .select(SELECT_COLS)
            .single();
    const { data, error } = await q;
    if (!error) return normalizeRow(data);
    const miss = classifyMissingColumn(error);
    if (miss && miss in body) {
      console.warn(LOG, `column '${miss}' missing — retrying without it`);
      delete body[miss];
      continue;
    }
    console.error(LOG, `writeBusinessRow:${mode.kind}`, error);
    throw error;
  }
  throw new Error('writeBusinessRow: exhausted column-drift retries');
}

export async function createBusiness(ownerId: string, input: BusinessUpsert): Promise<BusinessRow> {
  return writeBusinessRow({ owner_id: ownerId, ...input }, { kind: 'insert' });
}

export async function updateBusiness(
  id: string,
  ownerId: string,
  input: BusinessUpsert,
): Promise<BusinessRow> {
  return writeBusinessRow({ ...input }, { kind: 'update', id, ownerId });
}

/** Best-effort removal of a business's stored images (logo + thumb + photos).
 *  Mirrors events.ts: runs BEFORE the row delete and never blocks it. */
async function removeStorageImages(urls: (string | null | undefined)[]) {
  const byBucket = new Map<string, string[]>();
  for (const url of urls) {
    const loc = extractStoragePath(url);
    if (!loc) continue;
    const list = byBucket.get(loc.bucket) ?? [];
    list.push(loc.path);
    byBucket.set(loc.bucket, list);
  }
  for (const [bucket, paths] of byBucket) {
    try {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) console.warn(LOG, 'storage remove failed (continuing)', { bucket, message: error.message });
    } catch (e) {
      console.warn(LOG, 'storage remove threw (continuing)', e);
    }
  }
}

export async function deleteBusiness(id: string, ownerId: string): Promise<void> {
  // Collect image URLs first so we can purge storage after the row is gone.
  const row = await fetchMyBusiness(id, ownerId);
  const { error } = await supabase
    .from('businesses')
    .delete()
    .eq('id', id)
    .eq('owner_id', ownerId);
  if (error) {
    console.error(LOG, 'deleteBusiness', error);
    throw error;
  }
  if (row) {
    const urls: (string | null | undefined)[] = [
      row.logo_url, row.logo_thumb_url,
      ...row.photos.flatMap((p) => [p.url, p.thumb_url]),
    ];
    await removeStorageImages(urls);
  }
}

export { STORAGE_BUCKET as BUSINESS_STORAGE_BUCKET };
