import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const catalogPath = path.join(projectRoot, 'src', 'lib', 'seo', 'routeCatalog.json');
const outputPath = path.join(projectRoot, 'public', 'sitemap.xml');
const siteOrigin = process.env.SITE_ORIGIN || 'https://treasuretrail-hunt.com';

async function loadDotEnv() {
  const envPath = path.join(projectRoot, '.env');

  try {
    const raw = await fs.readFile(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = value.replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Ignore missing .env files and continue with the ambient environment.
  }
}

const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(loc, changefreq = 'weekly', priority = '0.6') {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
}

await loadDotEnv();

async function fetchActiveListingIds() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const endpoint = new URL('/rest/v1/marketplace_listings', supabaseUrl);
  endpoint.searchParams.set('select', 'id');
  endpoint.searchParams.set('limit', '1000');

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: supabaseAnonKey,
        authorization: `Bearer ${supabaseAnonKey}`,
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows
      .map((row) => row?.id)
      .filter((id) => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

const urls = [];
urls.push(urlEntry(`${siteOrigin}/`, 'daily', '1.0'));
urls.push(urlEntry(`${siteOrigin}/events`, 'daily', '0.9'));
urls.push(urlEntry(`${siteOrigin}/marketplace`, 'daily', '0.9'));
urls.push(urlEntry(`${siteOrigin}/auctions`, 'daily', '0.8'));
urls.push(urlEntry(`${siteOrigin}/community`, 'daily', '0.8'));
urls.push(urlEntry(`${siteOrigin}/seo-preview`, 'monthly', '0.2'));

for (const county of catalog.counties) {
  urls.push(urlEntry(`${siteOrigin}/ca/${county.slug}`, 'weekly', '0.8'));
  for (const city of county.cities) {
    const cityPath = `${siteOrigin}/ca/${county.slug}/${city.slug}`;
    urls.push(urlEntry(cityPath, 'weekly', '0.75'));
    for (const category of catalog.categories) {
      urls.push(urlEntry(`${cityPath}/${category.slug}`, 'weekly', '0.7'));
    }
  }
}

for (const category of catalog.categories) {
  urls.push(urlEntry(`${siteOrigin}/category/${category.slug}`, 'weekly', '0.7'));
}

for (const wanted of catalog.seoPages.wanted) {
  urls.push(urlEntry(`${siteOrigin}/wanted/${wanted.slug}`, 'weekly', '0.65'));
}

for (const seller of catalog.seoPages.sellers) {
  urls.push(urlEntry(`${siteOrigin}/seller/${seller.slug}`, 'weekly', '0.65'));
}

for (const event of catalog.seoPages.events) {
  urls.push(urlEntry(`${siteOrigin}/event/${event.slug}`, 'weekly', '0.75'));
}

for (const id of await fetchActiveListingIds()) {
  urls.push(urlEntry(`${siteOrigin}/listing/${id}`, 'weekly', '0.6'));
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, xml, 'utf8');
console.log(`Wrote ${path.relative(projectRoot, outputPath)}`);
