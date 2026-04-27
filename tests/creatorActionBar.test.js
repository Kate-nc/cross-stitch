/* tests/creatorActionBar.test.js
 *
 * Static checks for the UX-12 Phase 5 + Option 2 Creator outcome action bar.
 * Renders are not exercised here — those are verified end-to-end by the
 * existing Creator Playwright smoke pass. We assert that:
 *   1. The component file exposes window.CreatorActionBar.
 *   2. Every required prop is accepted and routed to a handler.
 *   3. The visible button labels match the spec (British English).
 *   4. ARIA structure is in place (role=toolbar, role=tablist, role=tab,
 *      role=menu, aria-label).
 *   5. The new mode switch (Create / Edit / Track) and Pattern info chip
 *      are rendered with correct accessibility wiring.
 *   6. The bar is mounted in creator-main.js above the ToolStrip.
 *   7. The Phase 5 CSS section is present in styles.css with the
 *      required tokens, touch-target breakpoint, and reduced-motion
 *      suppression. Option 2 mode-switch + popover CSS is also present.
 *   8. ActionBar.js and PatternInfoPopover.js are both in the
 *      build-creator-bundle.js source list, in the correct order.
 *   9. The Export menu z-index is high enough to clear the toolbar /
 *      topbar (regression guard for the "menu hidden behind toolbar"
 *      bug fixed in Option 2).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const ACTION_BAR_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'creator', 'ActionBar.js'), 'utf8');
const POPOVER_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'creator', 'PatternInfoPopover.js'), 'utf8');
const CREATOR_MAIN_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'creator-main.js'), 'utf8');
const STYLES_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'styles.css'), 'utf8');
const BUILD_SCRIPT_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'build-creator-bundle.js'), 'utf8');
const ICONS_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'icons.js'), 'utf8');

describe('Creator outcome action bar (UX-12 Phase 5 + Option 2)', () => {

  test('exposes window.CreatorActionBar', () => {
    expect(ACTION_BAR_SRC).toMatch(/window\.CreatorActionBar\s*=\s*function/);
  });

  test('accepts the wired-up handler props', () => {
    expect(ACTION_BAR_SRC).toMatch(/props\.onPrintPdf/);
    expect(ACTION_BAR_SRC).toMatch(/props\.onTrackPattern/);
    // Polish 13 step 3 — onSwitchToCreate is gone; the unified sidebar
    // tab strip handles "back to setup" by clicking Image/Dim/Project.
    expect(ACTION_BAR_SRC).not.toMatch(/props\.onSwitchToCreate/);
    expect(ACTION_BAR_SRC).toMatch(/props\.onSaveJson/);
    expect(ACTION_BAR_SRC).toMatch(/props\.onMoreExports/);
    expect(ACTION_BAR_SRC).toMatch(/props\.appMode/);
  });

  test('renders the spec button labels', () => {
    expect(ACTION_BAR_SRC).toMatch(/"Print PDF"/);
    // "Export…" — match either the literal ellipsis or the \u2026 escape.
    expect(ACTION_BAR_SRC).toMatch(/Export(\u2026|\\u2026)/);
    expect(ACTION_BAR_SRC).toMatch(/Save project \(\.json\)/);
    expect(ACTION_BAR_SRC).toMatch(/More export options/);
    // Mode switch (Polish 13 step 3 — phase label + Track button only;
    // the Setup back-button was removed when the sidebar tab strip
    // unified across appModes).
    expect(ACTION_BAR_SRC).not.toMatch(/"Setup"/);
    expect(ACTION_BAR_SRC).toMatch(/"Open in Tracker"/);
    expect(ACTION_BAR_SRC).toMatch(/"Editing pattern"/);
    expect(ACTION_BAR_SRC).toMatch(/"Setting up"/);
    // Pattern info chip.
    expect(ACTION_BAR_SRC).toMatch(/"Pattern info"/);
  });

  test('uses British English ("colour" not "color") in popover trigger', () => {
    // The chip's title attribute references "colours, skeins".
    expect(ACTION_BAR_SRC).toMatch(/colour/);
    const renderedColor = /['"]\d* colors?\b/.test(ACTION_BAR_SRC);
    expect(renderedColor).toBe(false);
  });

  test('uses dimension symbol (×) not "x" in popover (handled in popover)', () => {
    // Encoded as \u00D7 in the source.
    expect(POPOVER_SRC).toMatch(/\\u00D7/);
  });

  test('declares ARIA structure (toolbar + menu + labels)', () => {
    expect(ACTION_BAR_SRC).toMatch(/role:\s*"toolbar"/);
    expect(ACTION_BAR_SRC).toMatch(/role:\s*"group"/);
    expect(ACTION_BAR_SRC).toMatch(/role:\s*"menu"/);
    expect(ACTION_BAR_SRC).toMatch(/role:\s*"menuitem"/);
    expect(ACTION_BAR_SRC).toMatch(/"aria-haspopup":\s*"menu"/);
    expect(ACTION_BAR_SRC).toMatch(/"aria-haspopup":\s*"dialog"/);
    expect(ACTION_BAR_SRC).toMatch(/"aria-expanded"/);
    expect(ACTION_BAR_SRC).toMatch(/"aria-label":\s*"Pattern actions"/);
    expect(ACTION_BAR_SRC).toMatch(/"aria-label":\s*"Pattern phase"/);
    expect(ACTION_BAR_SRC).toMatch(/"aria-live":\s*"polite"/);
  });

  test('Polish 13 step 3 — only Track button + phase label remain (Setup removed)', () => {
    expect(ACTION_BAR_SRC).toMatch(/creator-actionbar__mode-phase/);
    expect(ACTION_BAR_SRC).toMatch(/creator-actionbar__mode-btn--forward/);
    // The Setup back-button is gone.
    expect(ACTION_BAR_SRC).not.toMatch(/creator-actionbar__mode-btn--back/);
    // No more aria-selected / roving tabindex on the mode-switch buttons.
    const oldRovingPattern = /tabIndex:\s*active\s*\?\s*0\s*:\s*-1/;
    expect(oldRovingPattern.test(ACTION_BAR_SRC)).toBe(false);
  });

  test('uses Icons.* helpers (no emoji glyphs)', () => {
    expect(ACTION_BAR_SRC).toMatch(/Icons\.printer/);
    expect(ACTION_BAR_SRC).toMatch(/Icons\.chevronDown/);
    // No raw emoji ranges in the rendered labels.
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiRe.test(ACTION_BAR_SRC)).toBe(false);
  });

  test('renders nothing when props.ready is false', () => {
    expect(ACTION_BAR_SRC).toMatch(/!props\.ready/);
  });

  test('Export menu closes on Escape and outside click', () => {
    expect(ACTION_BAR_SRC).toMatch(/e\.key\s*===\s*"Escape"/);
    expect(ACTION_BAR_SRC).toMatch(/document\.addEventListener\(\s*"mousedown"/);
  });

  test('mounted in creator-main.js above the ToolStrip', () => {
    expect(CREATOR_MAIN_SRC).toMatch(
      /state\.pat\s*&&\s*state\.pal\s*&&\s*window\.CreatorActionBar/);
    const actionBarIdx = CREATOR_MAIN_SRC.indexOf('window.CreatorActionBar');
    const toolStripIdx = CREATOR_MAIN_SRC.indexOf('<window.CreatorToolStrip');
    expect(actionBarIdx).toBeGreaterThan(0);
    expect(toolStripIdx).toBeGreaterThan(0);
    expect(actionBarIdx).toBeLessThan(toolStripIdx);
  });

  test('mount wires every handler and the popover data props', () => {
    expect(CREATOR_MAIN_SRC).toMatch(/onPrintPdf=\{[^}]*exportPDF\(/);
    expect(CREATOR_MAIN_SRC).toMatch(/onTrackPattern=\{io\.handleOpenInTracker\}/);
    expect(CREATOR_MAIN_SRC).toMatch(/onSaveJson=\{io\.saveProject\}/);
    expect(CREATOR_MAIN_SRC).toMatch(/onMoreExports=\{[^}]*setTab\("materials"\)/);
    expect(CREATOR_MAIN_SRC).toMatch(/setMaterialsTab\("output"\)/);
    // Polish 13 step 3 — onSwitchToCreate prop is no longer wired.
    expect(CREATOR_MAIN_SRC).not.toMatch(/onSwitchToCreate=\{/);
    expect(CREATOR_MAIN_SRC).toMatch(/appMode=\{state\.appMode\}/);
    expect(CREATOR_MAIN_SRC).toMatch(/totalStitchable=\{state\.totalStitchable\}/);
    expect(CREATOR_MAIN_SRC).toMatch(/difficulty=\{state\.difficulty\}/);
    expect(CREATOR_MAIN_SRC).toMatch(/stitchSpeed=\{state\.stitchSpeed\}/);
    expect(CREATOR_MAIN_SRC).toMatch(/doneCount=\{state\.doneCount\}/);
  });

  test('ActionBar.js and PatternInfoPopover.js are registered in the bundle', () => {
    expect(BUILD_SCRIPT_SRC).toMatch(/'ActionBar\.js'/);
    expect(BUILD_SCRIPT_SRC).toMatch(/'PatternInfoPopover\.js'/);
    // PatternInfoPopover must precede ActionBar so the popover symbol is
    // defined before ActionBar references it.
    const popoverIdx = BUILD_SCRIPT_SRC.indexOf("'PatternInfoPopover.js'");
    const actionBarIdx = BUILD_SCRIPT_SRC.indexOf("'ActionBar.js'");
    expect(popoverIdx).toBeGreaterThan(0);
    expect(actionBarIdx).toBeGreaterThan(popoverIdx);
  });

  test('Phase 5 CSS section is present and uses Workshop tokens', () => {
    expect(STYLES_SRC).toMatch(/Phase 5 \(UX-12\)[^]*Creator outcome action bar/);
    expect(STYLES_SRC).toMatch(/\.creator-actionbar\s*\{/);
    expect(STYLES_SRC).toMatch(/\.creator-actionbar__btn--primary[\s\S]*?var\(--accent\)/);
  });

  test('Option 2 mode switch + popover CSS is present', () => {
    expect(STYLES_SRC).toMatch(/\.creator-actionbar__mode-switch\s*\{/);
    expect(STYLES_SRC).toMatch(/\.creator-actionbar__mode-btn\b/);
    expect(STYLES_SRC).toMatch(/\.creator-actionbar__info-trigger\s*\{/);
    expect(STYLES_SRC).toMatch(/\.creator-popover-info\s*\{/);
    expect(STYLES_SRC).toMatch(/\.creator-popover-info__grid\s*\{/);
  });

  test('Export menu z-index is above toolbar / topbar (regression guard)', () => {
    // .toolbar-row has z-index 99 and .tb-topbar has z-index 100.
    // The Export menu must sit above both — Option 2 bumped this from 50 to >= 1000.
    const menuRule = STYLES_SRC.match(
      /\.creator-actionbar__menu\s*\{[\s\S]*?\}/);
    expect(menuRule).not.toBeNull();
    const z = menuRule[0].match(/z-index:\s*(\d+)/);
    expect(z).not.toBeNull();
    expect(parseInt(z[1], 10)).toBeGreaterThanOrEqual(1000);
  });

  test('CSS provides 44px touch targets on coarse pointers', () => {
    expect(STYLES_SRC).toMatch(
      /@media \(pointer: coarse\)\s*\{[\s\S]*?\.creator-actionbar__btn[\s\S]*?min-height:\s*44px/);
  });

  test('CSS provides a phone reflow breakpoint for the bar', () => {
    expect(STYLES_SRC).toMatch(
      /@media \(max-width: 599px\)\s*\{[\s\S]*?\.creator-actionbar\b/);
  });

  test('CSS suppresses transitions for prefers-reduced-motion', () => {
    expect(STYLES_SRC).toMatch(
      /prefers-reduced-motion[\s\S]*?\.creator-actionbar__btn[\s\S]*?transition:\s*none/);
  });

  test('icons.js defines the printer + chevronDown icons used by the bar', () => {
    expect(ICONS_SRC).toMatch(/printer:\s*function\s*\(\)/);
    expect(ICONS_SRC).toMatch(/chevronDown:\s*function\s*\(\)/);
  });
});

describe('Pattern info popover (Option 2)', () => {

  test('exposes window.CreatorPatternInfoPopover', () => {
    expect(POPOVER_SRC).toMatch(/window\.CreatorPatternInfoPopover\s*=\s*function/);
  });

  test('renders nothing when props.open is false', () => {
    expect(POPOVER_SRC).toMatch(/!props\.open/);
  });

  test('closes on Escape and outside click', () => {
    expect(POPOVER_SRC).toMatch(/e\.key\s*===\s*"Escape"/);
    expect(POPOVER_SRC).toMatch(/document\.addEventListener\(\s*"mousedown"/);
  });

  test('declares dialog role and aria-label', () => {
    expect(POPOVER_SRC).toMatch(/role:\s*"dialog"/);
    expect(POPOVER_SRC).toMatch(/"aria-label":\s*"Pattern details"/);
  });

  test('uses British English ("colours")', () => {
    expect(POPOVER_SRC).toMatch(/Colours/);
    const renderedColor = /['"]\s*Colors?\s*['"]/.test(POPOVER_SRC);
    expect(renderedColor).toBe(false);
  });

  test('uses fmtTimeL for time estimates', () => {
    expect(POPOVER_SRC).toMatch(/window\.fmtTimeL/);
  });

  test('mobile bottom-sheet variant exists in CSS', () => {
    expect(STYLES_SRC).toMatch(
      /@media \(max-width: 599px\)\s*\{[\s\S]*?\.creator-popover-info\s*\{[\s\S]*?position:\s*fixed/);
  });

  test('no emoji glyphs in the popover source', () => {
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiRe.test(POPOVER_SRC)).toBe(false);
  });
});
