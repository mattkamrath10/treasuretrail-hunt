/**
 * One-time backfill: populate lat/lng for local events that were created
 * before the form geocoded on save. Without coordinates these events are
 * invisible to the Local Events location search (it filters on lat/lng
 * within a radius), so events created "from ZIP 93257" never appeared when
 * searching that ZIP.
 *
 * Safe + idempotent: only touches local events with NULL lat/lng, geocodes
 * their stored address/city/region via the same free providers the app uses
 * (zippopotam for ZIP, nominatim for free-form), and PATCHes the row.
 *
 * Run with: node scripts/backfill-event-coords.mjs
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
  const s = q.trim();
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

async function geocodeEvent(r) {
  const address = (r.address ?? '').trim();
  const city = (r.city ?? '').trim();
  const region = (r.region ?? '').trim();
  const candidates = [];
  if (address && (city || region)) candidates.push([address, city, region].filter(Boolean).join(', '));
  if (city && region) candidates.push(`${city}, ${region}`);
  if (city) candidates.push(city);
  if (region) candidates.push(region);
  const seen = new Set();
  for (const q of candidates) {
    const k = q.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const p = await geocodeOne(q);
    await sleep(1200); // be polite to nominatim (≈1 req/sec)
    if (p) return { point: p, via: q };
  }
  return null;
}

async function main() {
  // Events.tsx hides a row when EITHER coordinate is null, so target rows
  // missing either one (not just lat).
  const res = await fetch(
    `${url}/rest/v1/events?select=id,title,event_kind,status,address,city,region,lat,lng&event_kind=eq.local&or=(lat.is.null,lng.is.null)`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    console.error('Fetch failed:', res.status, JSON.stringify(rows));
    process.exit(1);
  }
  console.log(`Found ${rows.length} local event(s) with NULL coordinates.`);
  let fixed = 0, skipped = 0;
  for (const r of rows) {
    const g = await geocodeEvent(r);
    if (!g) {
      skipped++;
      console.log(`  SKIP "${(r.title || '').slice(0, 40)}" — no resolvable location (city=${r.city || '-'}, region=${r.region || '-'})`);
      continue;
    }
    const patch = await fetch(`${url}/rest/v1/events?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ lat: g.point.lat, lng: g.point.lng }),
    });
    if (!patch.ok) {
      skipped++;
      console.log(`  FAIL "${(r.title || '').slice(0, 40)}" — PATCH ${patch.status}: ${await patch.text()}`);
      continue;
    }
    fixed++;
    console.log(`  OK   "${(r.title || '').slice(0, 40)}" → ${g.point.lat.toFixed(4)},${g.point.lng.toFixed(4)} (via "${g.via}")`);
  }
  console.log(`Done. Fixed ${fixed}, skipped ${skipped}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
