/* tests/creatorActionBar.test.js
 *
 * Static checks for the UX-12 Phase 5 Creator outcome action bar.
 * Renders are not exercised here — those are verified end-to-end by
 * the existing Creator Playwright smoke pass. We assert that:
 *   1. The component file exposes window.CreatorActionBar.
 *   2. Every required prop is accepted and routed to a handler.
 *   3. The visible button labels match the spec (British English).
 *   4. ARIA structure is in place (role=toolbar, role=menu, aria-label).
 *   5. Stats text uses the expected ` · ` separator and units.
 *   6. The bar is mounted in creator-main.js above the ToolStrip.
 *   7. The Phase 5 CSS section is present in styles.css with the
 *      required tokens, touch-target breakpoint, and reduced-motion
 *      suppression.
 *   8. ActionBar.js is in the build-creator-bundle.js source list.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const ACTION_BAR_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'creator', 'ActionBar.js'), 'utf8');
const CREATOR_MAIN_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'creator-main.js'), 'utf8');
const STYLES_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'styles.css'), 'utf8');
const BUILD_SCRIPT_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'build-creator-bundle.js'), 'utf8');
const ICONS_SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'icons.js'), 'utf8');

describe('Creator outcome action bar (UX-12 Phase 5)', () => {

  test('exposes window.CreatorActionBar', () => {
    expect(ACTION_BAR_SRC).toMatch(/window\.CreatorActionBar\s*=\s*function/);
  });

  test('accepts the four wired-up handler props', () => {
    expect(ACTION_BAR_SRC).toMatch(/props\.onPrintPdf/);
    expect(ACTION_BAR_SRC).toMatch(/props\.onTrackPattern/);
    expect(ACTION_BAR_SRC).toMatch(/props\.onSaveJson/);
    expect(ACTION_BAR_SRC).toMatch(/props\.onMoreExports/);
  });

  test('renders the four spec button labels', () => {
    expect(ACTION_BAR_SRC).toMatch(/"Print PDF"/);
    expect(ACTION_BAR_SRC).toMatch(/"Track this pattern"/);
    // "Export…" — match either the literal ellipsis or the \u2026 escape.
    expect(ACTION_BAR_SRC).toMatch(/Export(\u2026|\\u2026)/);
    expect(ACTION_BAR_SRC).toMatch(/Save project \(\.json\)/);
    expect(ACTION_BAR_SRC).toMatch(/More export options/);
  });

  test('uses British English in the stats block ("colour" not "color")', () => {
    expect(ACTION_BAR_SRC).toMatch(/colour/);
    // No US "color" in the labels — only inside ARIA strings the catalogue
    // already uses British English. We just assert no rendered "color" text.
    const renderedColor = /['"]\d* colors?\b/.test(ACTION_BAR_SRC);
    expect(renderedColor).toBe(false);
  });

  test('uses the ` · ` middle-dot separator between stats', () => {
    // Encoded as \u00B7 in the source.
    expect(ACTION_BAR_SRC).toMatch(/\\u00B7/);
  });

  test('formats fabric count as "ct" suffix and skeins with ~ prefix', () => {
    expect(ACTION_BAR_SRC).toMatch(/fabricCt\s*\+\s*"ct"/);
    expect(ACTION_BAR_SRC).toMatch(/"~"\s*\+\s*skeinsRounded/);
  });

  test('uses dimension symbol (×) not "x" between width and height', () => {
    // 80 × 80, not 80x80. Encoded as \u00D7.
    expect(ACTION_BAR_SRC).toMatch(/\\u00D7/);
  });

  test('declares ARIA structure (toolbar + menu + labels)', () => {
    expect(ACTION_BAR_SRC).toMatch(/role:\s*"toolbar"/);
    expect(ACTION_BAR_SRC).toMatch(/role:\s*"menu"/);
    expect(ACTION_BAR_SRC).toMatch(/role:\s*"menuitem"/);
    expect(ACTION_BAR_SRC).toMatch(/"aria-haspopup":\s*"menu"/);
    expect(ACTION_BAR_SRC).toMatch(/"aria-expanded"/);
    expect(ACTION_BAR_SRC).toMatch(/"aria-label":\s*"Pattern actions"/);
  });

  test('uses Icons.* helpers (no emoji glyphs)', () => {
    expect(ACTION_BAR_SRC).toMatch(/Icons\.printer/);
    expect(ACTION_BAR_SRC).toMatch(/Icons\.thread/);
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
    // The mount must be conditional on a loaded pattern.
    expect(CREATOR_MAIN_SRC).toMatch(
      /state\.pat\s*&&\s*state\.pal\s*&&\s*window\.CreatorActionBar/);
    // Order check: ActionBar mount precedes the CreatorToolStrip mount.
    const actionBarIdx = CREATOR_MAIN_SRC.indexOf('window.CreatorActionBar');
    const toolStripIdx = CREATOR_MAIN_SRC.indexOf('<window.CreatorToolStrip');
    expect(actionBarIdx).toBeGreaterThan(0);
    expect(toolStripIdx).toBeGreaterThan(0);
    expect(actionBarIdx).toBeLessThan(toolStripIdx);
  });

  test('mount wires the four handlers to existing app/io functions', () => {
    expect(CREATOR_MAIN_SRC).toMatch(/onPrintPdf=\{[^}]*exportPDF\(/);
    expect(CREATOR_MAIN_SRC).toMatch(/onTrackPattern=\{io\.handleOpenInTracker\}/);
    expect(CREATOR_MAIN_SRC).toMatch(/onSaveJson=\{io\.saveProject\}/);
    expect(CREATOR_MAIN_SRC).toMatch(/onMoreExports=\{[^}]*setTab\("materials"\)/);
    expect(CREATOR_MAIN_SRC).toMatch(/setMaterialsTab\("output"\)/);
  });

  test('ActionBar.js is registered in the bundle build order', () => {
    expect(BUILD_SCRIPT_SRC).toMatch(/'ActionBar\.js'/);
  });

  test('Phase 5 CSS section is present and uses Workshop tokens', () => {
    expect(STYLES_SRC).toMatch(/Phase 5 \(UX-12\)[^]*Creator outcome action bar/);
    expect(STYLES_SRC).toMatch(/\.creator-actionbar\s*\{/);
    expect(STYLES_SRC).toMatch(/\.creator-actionbar__btn--primary[\s\S]*?var\(--accent\)/);
    expect(STYLES_SRC).toMatch(/\.creator-actionbar__stats[\s\S]*?var\(--text-muted/);
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

  test('icons.js defines the new printer icon used by the bar', () => {
    expect(ICONS_SRC).toMatch(/printer:\s*function\s*\(\)/);
  });
});
