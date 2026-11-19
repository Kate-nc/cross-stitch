// Shared helpers for the Creator e2e specs.
//
// The touch-tablet project runs as an iPad Mini, so a spec that only sets a
// viewport still has a touch screen. DESKTOP turns touch off so "desktop"
// really means a mouse and a fine pointer.
const path = require('path');
const { devices, expect } = require('@playwright/test');

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

// Home › Create › New from pattern file with logo.png. A new picture opens
// on Frame the picture; this continues to Convert's preview and steps unless
// opts.frame (stay on Frame). opts.leaveBackgroundOut: accept the
// plain-background offer (the logo's white background is stitched until the
// stitcher chooses), which also clears its toast.
async function openConvertWithLogo(page, opts) {
  opts = opts || {};
  await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await skipTourIfShown(page);
  await page.locator('input.home-create-file-input').setInputFiles(LOGO);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('[data-frame-view]', { timeout: 15000 });
  if (opts.frame) return;
  await continueFromFrame(page);
  await skipTourIfShown(page);
  if (opts.leaveBackgroundOut) {
    const offer = page.locator('.creator-toast-container > *').filter({ hasText: 'This picture has a plain background' });
    await offer.getByRole('button', { name: 'Leave it unstitched' }).click({ timeout: 15000 });
    await expect(offer).toHaveCount(0);
  }
}

// Frame the picture › Continue (the panel's, or the phone top bar's).
async function continueFromFrame(page) {
  await page.locator('[data-onboard="frame-continue"]:visible, .cc-continue:visible').first().click();
  await page.waitForSelector('.rpanel', { state: 'attached' });
  await expect(page.locator('[data-frame-view]')).toHaveCount(0);
}

// Back to Frame the picture from Convert (Reframe beside the picture).
async function reframe(page) {
  await page.locator('[data-reframe]:visible').first().click();
  await page.waitForSelector('[data-frame-view]');
}

// A blank grid (P2-4): the New design sheet comes first. Opens
// create.html?action=new-blank unless the page is already on its way there
// (opts.navigate === false), picks a size preset if given, then starts.
async function startBlankGrid(page, opts) {
  opts = opts || {};
  if (opts.navigate !== false) await page.goto('/create.html?action=new-blank');
  const sheet = page.getByRole('dialog', { name: 'New design' });
  await expect(sheet).toBeVisible({ timeout: 15000 });
  if (opts.preset) await sheet.getByRole('radio', { name: opts.preset }).click();
  await sheet.getByRole('button', { name: 'Start drawing' }).click();
  await expect(sheet).toHaveCount(0);
}

// Phones (under 900px) have the compact top bar's Generate; wider screens
// the one at the foot of the Convert panel.
async function clickGenerate(page) {
  const btn = page.locator('.cc-generate:visible, .cv-generate:visible').first();
  await btn.click();
}

// Generated and in Edit. The settings drawer is hidden on phones until it is
// opened, so wait for the edit tools instead.
async function waitForEdit(page) {
  await page.waitForSelector('.rpanel--edit', { state: 'attached', timeout: 20000 });
  await page.waitForSelector('.creator-rail, .toolbar-row, .creator-drail', { timeout: 20000 });
  await page.waitForTimeout(300);
}

// The logo generated with its background left out, as most logos are.
async function generateLogo(page) {
  await openConvertWithLogo(page, { leaveBackgroundOut: true });
  await clickGenerate(page);
  await waitForEdit(page);
}

const isCompact = (page) => page.evaluate(function() { return document.body.classList.contains('creator-compact'); });
// Edit with the desktop tool rail (creator.desktopRail, on by default with a mouse).
const isRailLayout = (page) => page.evaluate(function() { return document.body.classList.contains('creator-drail-tools'); });

// Sets creator.desktopRail before the page loads: true for the tool rail,
// false for the toolbar above the chart (the layout kept for one release).
function railPref(page, on) {
  return page.addInitScript(function(v) {
    try { localStorage.setItem('cs_pref_creator.desktopRail', JSON.stringify(v)); } catch (e) {}
  }, on);
}

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
    await page.locator('.tb-zoom-grp input[type=range], .creator-optbar__zoom input[type=range]').first().fill('1.5');
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
  // The tool-rail layout has no swatch strip: choose a row in the Palette tab.
  const rail = await isRailLayout(page);
  if (rail) {
    const tab = page.locator('.creator-sidebar-tab[data-tab-id="palette"]');
    if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  }
  const swatches = page.locator(rail ? '.pal-rows .pal-row' : '.swatch-scroll-inner button');
  const idx = await swatches.evaluateAll(function(els) {
    return els.findIndex(function(el) {
      const sw = el.querySelector('.pal-row__swatch') || el;
      const rgb = (getComputedStyle(sw).backgroundColor.match(/\d+/g) || []).map(Number);
      // Tapping the selected swatch deselects it, so skip that one.
      return rgb.length >= 3 && (rgb[0] + rgb[1] + rgb[2]) < 600 && el.getAttribute('aria-pressed') !== 'true';
    });
  });
  if (idx < 0) throw new Error('No dark swatch found');
  await swatches.nth(idx).click();
}

const undoButton = (page) => page.getByRole('button', { name: 'Undo', exact: true }).first();

// From Edit back to Convert: the side panel's Back to Convert, or with the
// tool rail (which has none) the Convert tab in the top bar.
async function backToConvert(page) {
  const back = page.getByRole('button', { name: 'Back to Convert' });
  if (await back.count()) { await back.click(); return; }
  await page.getByRole('tab', { name: 'Convert' }).click();
}

// Choose a tool by its toolbar name ('Text tool', 'Magic wand', 'Line tool'…):
// on the tool rail when it is there (shapes from its Shapes menu), otherwise
// from More tools.
const RAIL_TOOL = { 'Paint tool': 'paint', 'Fill tool': 'fill', 'Erase tool': 'erase', 'Eyedropper tool': 'pick',
  'Magic wand': 'wand', 'Lasso': 'lasso', 'Text tool': 'text', 'Navigate': 'hand' };
const RAIL_SHAPE = { 'Line tool': 'Line', 'Rectangle tool': 'Rectangle', 'Ellipse tool': 'Ellipse' };
async function chooseTool(page, name) {
  if (await isRailLayout(page)) {
    if (RAIL_TOOL[name]) { await page.locator('.creator-drail [data-tool="' + RAIL_TOOL[name] + '"]').click(); return; }
    if (RAIL_SHAPE[name]) {
      await page.locator('.creator-drail [data-tool="shapes"]').click();
      await page.getByRole('menu', { name: 'Shapes' }).getByRole('menuitemradio', { name: RAIL_SHAPE[name] }).click();
      return;
    }
  }
  await page.getByRole('button', { name: 'More tools' }).click();
  await page.getByRole('button', { name: name }).click();
}

// Crop to the stitches: the Tools tab, or with the tool rail the Pattern menu.
async function cropToStitches(page) {
  if (await isRailLayout(page)) {
    await page.locator('[data-onboard="creator-pages"]').click();
    await page.locator('.tb-page-dropdown [data-command="crop"]').click();
    return;
  }
  await page.locator('.creator-sidebar-tab[data-tab-id="tools"]').click();
  await page.getByRole('button', { name: 'Crop to the stitches' }).click();
}

// Convert's settings are in steps (Picture, Size, Threads, Detail, Project).
// Opens the Settings drawer on phones, then the step.
async function convertStep(page, id) {
  // What the picture is, its background and fixes are in Frame the picture.
  if (id === 'picture') { if (!(await page.locator('[data-frame-view]').count())) await reframe(page); return; }
  if (await page.locator('[data-frame-view]').count()) await continueFromFrame(page);
  const header = page.locator('.rpanel-drawer-header');
  if (await header.isVisible().catch(function() { return false; })) {
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  }
  const tab = page.locator('#convert-tab-' + id);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

// Regenerate asks before replacing a chart that was edited, or reopened (its
// origin is unknown). Answers Regenerate when it asks.
async function confirmReplaceChart(page) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Replace your chart?' });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();
}

// The preview's view: 'stitched' (the default), 'flat' or 'compare'.
async function previewView(page, id) {
  await page.locator('.cvp-views [data-preview-view="' + id + '"]').click();
}

module.exports = {
  LOGO, DESKTOP, device, quietOnboarding, skipTourIfShown, openConvertWithLogo, continueFromFrame, reframe,
  startBlankGrid, clickGenerate, waitForEdit, generateLogo, isCompact, isRailLayout, railPref, closeMorePanel,
  zoomUntilScrollable, pickDarkSwatch, undoButton, backToConvert, cropToStitches, chooseTool, convertStep, previewView, confirmReplaceChart,
};
