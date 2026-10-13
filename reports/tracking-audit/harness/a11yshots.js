// Phase 5 batch 4: screenshots after the contrast and focus fixes (tracker at 200% zoom, Stats, Home, Manager; light and dark).
//   AUDIT_PORT=8000 node a11yshots.js
const fs = require('fs'), path = require('path');
const T = require('./tk');
const OUT = path.join(__dirname, '..', 'screens', 'phase5'); fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
(async () => {
  for (const theme of ['light', 'dark']) {
    const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((theme) => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker','creator','manager','home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); localStorage.setItem('cs_pref_a11yDarkMode', JSON.stringify(theme)); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} }, theme);
    const id = await T.seed(page, 'small.json');
    await page.setViewportSize({ width: 720, height: 450 });
    await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, 'a11y-tracker-200pct-' + theme + '.png') });
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(800);
    await page.evaluate(() => window.__openTrackerStats && window.__openTrackerStats()); await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, 'a11y-stats-' + theme + '.png') });
    await page.goto(BASE + 'home.html'); await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, 'a11y-home-' + theme + '.png') });
    await page.goto(BASE + 'manager.html'); await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, 'a11y-manager-' + theme + '.png') });
    await close();
  }
})();
