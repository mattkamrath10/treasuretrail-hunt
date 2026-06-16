import { chromium } from 'playwright';

const EXEC = '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium';
const BASE = 'http://127.0.0.1:5000';
// iPhone 6.5" App Store size: 414x896 @3x => 1242x2688
const VW = 414, VH = 896, DSF = 3;

// The 5 main bottom-nav buttons. Discover is captured first (right after guest entry).
const navPages = [
  { path: '/live',    file: 'screenshots/appstore/02-events.png',  wait: 4000 },
  { path: '/map',     file: 'screenshots/appstore/03-map.png',     wait: 5000 },
  { path: '/sell',    file: 'screenshots/appstore/04-create.png',  wait: 3000 },
  { path: '/profile', file: 'screenshots/appstore/05-profile.png', wait: 3500 },
];

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true,
});
await ctx.addInitScript(() => { try { localStorage.setItem('tt_onboarded', 'true'); } catch {} });
const page = await ctx.newPage();

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
try {
  await page.getByText('Browse as Guest', { exact: false }).click({ timeout: 8000 });
  console.log('entered guest mode');
} catch {
  console.log('no guest button (already in app)');
}
await page.waitForTimeout(4000);
await page.screenshot({ path: 'screenshots/appstore/01-discover.png', type: 'png' });
console.log('saved discover');

for (const p of navPages) {
  // Client-side route change (no reload) so guest state survives.
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, p.path);
  await page.waitForTimeout(p.wait);
  await page.screenshot({ path: p.file, type: 'png' });
  console.log('saved', p.file);
}
await browser.close();
console.log('done');
