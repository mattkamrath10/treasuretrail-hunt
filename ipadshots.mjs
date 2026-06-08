import { chromium } from 'playwright';

const EXEC = '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium';
const BASE = 'http://127.0.0.1:5000';
const VW = 1024, VH = 1366, DSF = 2; // 12.9" iPad Pro portrait => 2048x2732

// Skip the first page (Discover) — captured right after guest entry.
const navPages = [
  { path: '/marketplace', file: 'ios-screenshots/ipad-2-marketplace.png' },
  { path: '/live',        file: 'ios-screenshots/ipad-3-live.png' },
  { path: '/pro',         file: 'ios-screenshots/ipad-4-pro.png' },
];

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH }, deviceScaleFactor: DSF, isMobile: false,
});
await ctx.addInitScript(() => { try { localStorage.setItem('tt_onboarded', 'true'); } catch {} });
const page = await ctx.newPage();

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
await page.getByText('Browse as Guest', { exact: false }).click({ timeout: 8000 });
console.log('entered guest mode');
await page.waitForTimeout(3500);
await page.screenshot({ path: 'ios-screenshots/ipad-1-discover.png', type: 'png' });
console.log('saved discover');

for (const p of navPages) {
  // Client-side route change (no reload) so guest state survives.
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, p.path);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: p.file, type: 'png' });
  console.log('saved', p.file);
}
await browser.close();
