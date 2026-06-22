import { chromium } from 'playwright';

const EXEC = '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium';
const BASE = 'http://127.0.0.1:5000';
const OUT = '/tmp/shots';
const EVENT_ID = '12e6fc40-09e9-4a25-9368-ca13907930a6'; // A&W Surplus Auction (has both links → shows the button fix)

// Screens to capture (Discover is shot first, right after guest entry).
const pages = [
  { path: '/events',                 name: 'events',       wait: 4500 },
  { path: `/event/${EVENT_ID}`,      name: 'event-detail', wait: 5000 },
  { path: '/marketplace',            name: 'marketplace',  wait: 4000 },
  { path: '/map',                    name: 'map',          wait: 5500 },
  { path: '/pro',                    name: 'pro',          wait: 3500 },
];

const devices = [
  { id: 'iphone-6.5', vw: 414,  vh: 896,  dsf: 3, mobile: true  }, // 1242x2688
  { id: 'ipad-12.9',  vw: 1024, vh: 1366, dsf: 2, mobile: false }, // 2048x2732
];

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });

for (const d of devices) {
  const ctx = await browser.newContext({
    viewport: { width: d.vw, height: d.vh },
    deviceScaleFactor: d.dsf,
    isMobile: d.mobile,
    hasTouch: d.mobile,
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('tt_onboarded', 'true'); } catch {} });
  const page = await ctx.newPage();

  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  try {
    await page.getByText('Browse as Guest', { exact: false }).click({ timeout: 8000 });
    console.log(`[${d.id}] entered guest mode`);
  } catch {
    console.log(`[${d.id}] no guest button`);
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/${d.id}__01-discover.png`, type: 'png' });
  console.log(`[${d.id}] saved discover`);

  let i = 2;
  for (const p of pages) {
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, p.path);
    // Detail pages also scroll to top so the CTA row is in frame.
    await page.evaluate(() => { try { window.scrollTo(0, 0); } catch {} });
    await page.waitForTimeout(p.wait);
    const num = String(i).padStart(2, '0');
    await page.screenshot({ path: `${OUT}/${d.id}__${num}-${p.name}.png`, type: 'png' });
    console.log(`[${d.id}] saved ${p.name}`);
    i++;
  }
  await ctx.close();
}

await browser.close();
console.log('done');
