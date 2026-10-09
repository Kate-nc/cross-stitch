// Shared helpers for the Creator e2e specs.
//
// The touch-tablet project runs as an iPad Mini, so a spec that only sets a
// viewport still has a touch screen. DESKTOP turns touch off so "desktop"
// really means a mouse and a fine pointer.
const path = require('path');
const { devices } = require('@playwright/test');

const LOGO = path.join(__dirname, '..', 'fixtures', 'logo.png');
const DESKTOP = { viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 };

// devices[] entries carry defaultBrowserType, which test.use() can't change
// inside a describe; the projects run Chromium anyway.
function device(name) {
  if (name === 'desktop') return DESKTOP;
  const d = Object.assign({}, devices[name]);
  delete d.defaultBrowserType;
  return d;
}

async function quietOnboarding(page) {
  await page.addInitScript(function() {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
      ['firstStitch_creator', 'toolsTab_unlocked', 'import', 'undo', 'progress', 'save'].forEach(function(k) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      });
    } catch (e) {}
  });
}

async function skipTourIfShown(page) {
  const skip = page.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible().catch(function() { return false; })) await skip.click();
}

// Home › Create › New from pattern file with logo.png; ends on Convert.
async function openConvertWithLogo(page) {
  await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await skipTourIfShown(page);
  await page.locator('input.home-create-file-input').setInputFiles(LOGO);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('.rpanel', { state: 'attached' });
  await skipTourIfShown(page);
}

// Phones (under 900px) have the compact top bar's Generate; wider screens
// the action bar's.
async function clickGenerate(page) {
  const btn = page.locator('.cc-generate:visible, .creator-actionbar [aria-label="Generate pattern"]:visible, .creator-actionbar [aria-label="Regenerate pattern"]:visible').first();
  await btn.click();
}

// Generated and in Edit. The settings drawer is hidden on phones until it is
// opened, so wait for the edit tools instead.
async function waitForEdit(page) {
  await page.waitForSelector('.rpanel--edit', { state: 'attached', timeout: 20000 });
  await page.waitForSelector('.creator-rail, .toolbar-row', { timeout: 20000 });
  await page.waitForTimeout(300);
}

async function generateLogo(page) {
  await openConvertWithLogo(page);
  await clickGenerate(page);
  await waitForEdit(page);
}

const isCompact = (page) => page.evaluate(function() { return document.body.classList.contains('creator-compact'); });

async function closeMorePanel(page) {
  if (await page.locator('.tb-more-panel').count()) {
    await page.locator('.tb-overflow-wrap > button[aria-label="More tools"]').click();
  }
}

// Zoom the chart in until it overflows its scroll box, then centre it.
// Returns the scroll box.
async function zoomUntilScrollable(page) {
  const box = page.locator('.cs-chart-scroll');
  const overflows = () => box.evaluate(function(el) {
    return el.scrollWidth > el.clientWidth + 40 && el.scrollHeight > el.clientHeight + 40;
  });
  if (await isCompact(page)) {
    await page.locator('.creator-rail button[aria-label="More tools"]').click();
    for (let i = 0; i < 12 && !(await overflows()); i++) {
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await page.waitForTimeout(60);
    }
    await closeMorePanel(page);
  } else {
    await page.locator('.tb-zoom-grp input[type=range]').fill('1.5');
  }
  await box.evaluate(function(el) {
    el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2);
    el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
  });
  return box;
}

// Pick a palette colour that isn't (near) white from the swatch strip. On
// phones the strip is off by default: More › Show colour strip.
async function pickDarkSwatch(page) {
  if (await isCompact(page)) {
    await page.locator('.creator-rail button[aria-label="More tools"]').click();
    const strip = page.getByRole('checkbox', { name: 'Show colour strip' });
    if (!(await strip.isChecked())) await strip.check();
    await closeMorePanel(page);
  }
  const swatches = page.locator('.swatch-scroll-inner button');
  const idx = await swatches.evaluateAll(function(els) {
    return els.findIndex(function(el) {
      const rgb = (getComputedStyle(el).backgroundColor.match(/\d+/g) || []).map(Number);
      // Tapping the selected swatch deselects it, so skip that one.
      return rgb.length >= 3 && (rgb[0] + rgb[1] + rgb[2]) < 600 && el.getAttribute('aria-pressed') !== 'true';
    });
  });
  if (idx < 0) throw new Error('No dark swatch found');
  await swatches.nth(idx).click();
}

const undoButton = (page) => page.getByRole('button', { name: 'Undo', exact: true }).first();

module.exports = {
  LOGO, DESKTOP, device, quietOnboarding, skipTourIfShown, openConvertWithLogo,
  clickGenerate, waitForEdit, generateLogo, isCompact, closeMorePanel,
  zoomUntilScrollable, pickDarkSwatch, undoButton,
};
