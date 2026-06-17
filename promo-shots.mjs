import { chromium } from 'playwright';

const EXEC = '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium';
const BASE = 'http://127.0.0.1:5000';
const EMAIL = 'shotbot.tt@example.com';
const PASS = 'ShotBot!2026xZ';
// iPhone 6.5" App Store size: 414x896 @3x => 1242x2688
const VW = 414, VH = 896, DSF = 3;

// Scenes correlated to the promo script, captured after sign-in.
const scenes = [
  { path: '/',                 file: 'screenshots/promo/01-featured-near-you.png', wait: 5000 },
  { path: '/map',              file: 'screenshots/promo/02-treasure-map.png',      wait: 6000 },
  { path: '/live',             file: 'screenshots/promo/03-events.png',            wait: 4500 },
  { path: '/marketplace',      file: 'screenshots/promo/04-marketplace.png',       wait: 4500 },
  { path: '/rare-radar',       file: 'screenshots/promo/05-ai-identify.png',       wait: 4000 },
  { path: '/import-screenshot',file: 'screenshots/promo/06-smart-import.png',      wait: 4000 },
  { path: '/business/new',     file: 'screenshots/promo/07-add-business.png',      wait: 4000 },
  { path: '/alerts',           file: 'screenshots/promo/08-alerts.png',            wait: 4000 },
  { path: '/profile',          file: 'screenshots/promo/09-profile.png',           wait: 4000 },
];

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true,
});
await ctx.addInitScript(() => { try { localStorage.setItem('tt_onboarded', 'true'); } catch {} });
const page = await ctx.newPage();

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

// Sign in so account-gated AI screens render their real capture UI.
try {
  await page.locator('input[type="email"]').fill(EMAIL, { timeout: 8000 });
  await page.locator('input[type="password"]').fill(PASS, { timeout: 8000 });
  await page.getByRole('button', { name: /log in/i }).click({ timeout: 8000 });
  console.log('submitted login');
} catch (e) {
  console.log('login step issue:', e.message);
}
// Wait for the app shell (Discover) to settle after auth.
await page.waitForTimeout(7000);

for (const s of scenes) {
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, s.path);
  await page.waitForTimeout(s.wait);
  await page.screenshot({ path: s.file, type: 'png' });
  console.log('saved', s.file);
}
await browser.close();
console.log('done');
