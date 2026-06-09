/**
 * One-time (resumable) backfill: populate lat/lng for marketplace_listings and
 * wanted_items created before geocode-on-write existed. Without coordinates a
 * row can't be distance-sorted by Local-First Search — it falls into the
 * "More TreasureTrail Results" bucket and never shows "N miles away".
 *
 * Safe + idempotent: only touches rows with NULL lat/lng, geocodes their stored
 * location text via the same free providers the app uses (zippopotam for ZIP,
 * nominatim for free-form), and PATCHes the row. Re-running only processes
 * whatever is still missing coordinates, so it's safe to stop and resume.
 *
 * Requires the Phase-3 migration (20260609000200_local_first_search_geo.sql)
 * to have been applied first — otherwise the lat/lng columns don't exist.
 *
 * Run with: node scripts/backfill-coords.mjs
 */
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZIP_RE = /^\d{5}$/;

async function geocodeOne(q) {
  const s = (q ?? '').trim();
  if (!s) return null;
  try {
    if (ZIP_RE.test(s)) {
      const res = await fetch(`https://api.zippopotam.us/us/${s}`);
      if (!res.ok) return null;
      const data = await res.json();
      const p = data?.places?.[0];
      const lat = Number(p?.latitude), lng = Number(p?.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }
    const u =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' +
      encodeURIComponent(s);
    const res = await fetch(u, {
      headers: { Accept: 'application/json', 'User-Agent': 'TreasureTrail-backfill/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    const lat = Number(hit?.lat), lng = Number(hit?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch (e) {
    console.warn('geocode error for', JSON.stringify(s), e?.message);
    return null;
  }
}

/** Try the most specific location string first, then coarser fallbacks. */
async function geocodeFromCandidates(candidates) {
  const seen = new Set();
  for (const raw of candidates) {
    const q = (raw ?? '').trim();
    if (!q) continue;
    const k = q.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const p = await geocodeOne(q);
    await sleep(1200); // be polite to nominatim (≈1 req/sec)
    if (p) return { point: p, via: q };
  }
  return null;
}

async function patchRow(table, id, point) {
  const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ lat: point.lat, lng: point.lng }),
  });
  return res;
}

const PAGE = 500;

async function backfill({ table, select, candidatesOf, labelOf }) {
  // Cursor pagination by id: PATCHed rows gain coords and drop out of the
  // NULL-coord filter, while unresolvable rows stay; an offset would skip or
  // re-scan rows as the set shifts. Walking id ascending visits every NULL-coord
  // row exactly once, so large datasets are fully covered (and it stays resumable).
  let cursor = '';
  let total = 0, fixed = 0, skipped = 0;
  console.log(`\n[${table}] scanning rows with NULL coordinates…`);
  for (;;) {
    const cursorFilter = cursor ? `&id=gt.${encodeURIComponent(cursor)}` : '';
    const res = await fetch(
      `${url}/rest/v1/${table}?select=${select}&or=(lat.is.null,lng.is.null)${cursorFilter}&order=id.asc&limit=${PAGE}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const rows = await res.json();
    if (!Array.isArray(rows)) {
      console.error(`[${table}] fetch failed:`, res.status, JSON.stringify(rows));
      return;
    }
    if (rows.length === 0) break;
    for (const r of rows) {
      total++;
      cursor = r.id;
      const g = await geocodeFromCandidates(candidatesOf(r));
      if (!g) {
        skipped++;
        console.log(`  SKIP "${labelOf(r).slice(0, 40)}" — no resolvable location.`);
        continue;
      }
      const patch = await patchRow(table, r.id, g.point);
      if (!patch.ok) {
        skipped++;
        console.log(`  FAIL "${labelOf(r).slice(0, 40)}" — PATCH ${patch.status}: ${await patch.text()}`);
        continue;
      }
      fixed++;
      console.log(`  OK   "${labelOf(r).slice(0, 40)}" → ${g.point.lat.toFixed(4)},${g.point.lng.toFixed(4)} (via "${g.via}")`);
    }
    if (rows.length < PAGE) break;
  }
  console.log(`[${table}] done. Scanned ${total}, fixed ${fixed}, skipped ${skipped}.`);
}

async function main() {
  await backfill({
    table: 'marketplace_listings',
    select: 'id,title,general_location,lat,lng',
    candidatesOf: (r) => [r.general_location],
    labelOf: (r) => r.title || '',
  });
  await backfill({
    table: 'wanted_items',
    select: 'id,title,city,region,lat,lng',
    candidatesOf: (r) => [
      [r.city, r.region].filter(Boolean).join(', '),
      r.city,
      r.region,
    ],
    labelOf: (r) => r.title || '',
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
