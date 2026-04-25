/* tests/commandPalettePhase6.test.js
 *
 * Static checks for the UX-12 Phase 6 PR #11 command-palette polish:
 *   1. New `act_preferences` action exists and dispatches cs:openPreferences.
 *   2. New `act_rename` action exists and dispatches cs:openRename.
 *   3. The 🏠 emoji literal is gone from command-palette.js.
 *   4. The injected stylesheet uses CSS custom properties (var(--…))
 *      rather than raw hex codes for background/color/border.
 *   5. Each of creator-main.js, tracker-app.js, and manager-app.js
 *      registers a cs:openPreferences listener so the palette action
 *      actually opens the modal on every page.
 *   6. Creator + Tracker register a cs:openRename listener.
 *   7. The Ctrl/Cmd+K hotkey override is still in place.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const PALETTE_SRC = fs.readFileSync(path.join(REPO_ROOT, 'command-palette.js'), 'utf8');
const CREATOR_MAIN_SRC = fs.readFileSync(path.join(REPO_ROOT, 'creator-main.js'), 'utf8');
const TRACKER_SRC = fs.readFileSync(path.join(REPO_ROOT, 'tracker-app.js'), 'utf8');
const MANAGER_SRC = fs.readFileSync(path.join(REPO_ROOT, 'manager-app.js'), 'utf8');

describe('Command Palette Phase 6 polish (UX-12 PR #11)', () => {

  test('act_preferences action exists and dispatches cs:openPreferences', () => {
    expect(PALETTE_SRC).toMatch(/id:\s*['"]act_preferences['"]/);
    // Slice from the action's id up to the next id: declaration so we capture
    // the whole entry without getting tripped up by inner object literals.
    const start = PALETTE_SRC.indexOf("id: 'act_preferences'");
    const tail = PALETTE_SRC.slice(start);
    const next = tail.indexOf("id: '", 5);
    const block = next > -1 ? tail.slice(0, next) : tail;
    expect(block).toMatch(/CustomEvent\(['"]cs:openPreferences['"]\)/);
    expect(block).toMatch(/section:\s*['"]settings['"]/);
  });

  test('act_rename action exists and dispatches cs:openRename', () => {
    expect(PALETTE_SRC).toMatch(/id:\s*['"]act_rename['"]/);
    const start = PALETTE_SRC.indexOf("id: 'act_rename'");
    const tail = PALETTE_SRC.slice(start);
    const next = tail.indexOf("id: '", 5);
    const block = next > -1 ? tail.slice(0, next) : tail;
    expect(block).toMatch(/CustomEvent\(['"]cs:openRename['"]\)/);
    // Manager has no project to rename — the action is conditional.
    expect(block).toMatch(/condition:/);
  });

  test('🏠 emoji literal is gone from command-palette.js', () => {
    expect(PALETTE_SRC).not.toMatch(/\u{1F3E0}/u);
  });

  test('emoji-range scan: no pictographic glyphs in the source', () => {
    // Same range used by tests/creatorActionBar.test.js's "no emoji" check.
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiRe.test(PALETTE_SRC)).toBe(false);
  });

  test('injectStyles uses CSS custom properties (var(--…)) for background/color/border', () => {
    const fnIdx = PALETTE_SRC.indexOf('function injectStyles');
    expect(fnIdx).toBeGreaterThan(-1);
    // Slice the function body up to the next top-level function.
    const body = PALETTE_SRC.slice(fnIdx, PALETTE_SRC.indexOf('function ', fnIdx + 20));
    // Strip rgba(...) (allowed inside scrim/box-shadow) before scanning.
    const stripped = body.replace(/rgba\([^)]*\)/g, '');
    // Assert no raw hex on background/color/border declarations.
    const offending = stripped.match(/(background|color|border|border-top-color|border-color)\s*:\s*#[0-9A-Fa-f]{3,8}/g);
    expect(offending).toBeNull();
    // Assert the file at least references the canonical Workshop tokens.
    expect(body).toMatch(/var\(--surface\)/);
    expect(body).toMatch(/var\(--text-primary\)/);
    expect(body).toMatch(/var\(--accent\)/);
    expect(body).toMatch(/var\(--border\)/);
  });

  test('palette injects a coarse-pointer touch-target rule', () => {
    const fnIdx = PALETTE_SRC.indexOf('function injectStyles');
    const body = PALETTE_SRC.slice(fnIdx, PALETTE_SRC.indexOf('function ', fnIdx + 20));
    expect(body).toMatch(/@media\s*\(pointer:\s*coarse\)/);
    expect(body).toMatch(/min-height:\s*44px/);
  });

  test('palette injects a prefers-reduced-motion suppression rule', () => {
    const fnIdx = PALETTE_SRC.indexOf('function injectStyles');
    const body = PALETTE_SRC.slice(fnIdx, PALETTE_SRC.indexOf('function ', fnIdx + 20));
    expect(body).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  test('Ctrl/Cmd+K override is still in place', () => {
    expect(PALETTE_SRC).toMatch(/e\.key\s*===\s*['"]k['"]/);
    expect(PALETTE_SRC).toMatch(/e\.ctrlKey\s*\|\|\s*e\.metaKey/);
    expect(PALETTE_SRC).toMatch(/togglePalette\(\)/);
  });

  test('creator-main.js listens for cs:openPreferences', () => {
    expect(CREATOR_MAIN_SRC).toMatch(/addEventListener\(['"]cs:openPreferences['"]/);
  });

  test('tracker-app.js listens for cs:openPreferences', () => {
    expect(TRACKER_SRC).toMatch(/addEventListener\(['"]cs:openPreferences['"]/);
  });

  test('manager-app.js listens for cs:openPreferences', () => {
    expect(MANAGER_SRC).toMatch(/addEventListener\(['"]cs:openPreferences['"]/);
  });

  test('creator-main.js listens for cs:openRename', () => {
    expect(CREATOR_MAIN_SRC).toMatch(/addEventListener\(['"]cs:openRename['"]/);
  });

  test('tracker-app.js listens for cs:openRename', () => {
    expect(TRACKER_SRC).toMatch(/addEventListener\(['"]cs:openRename['"]/);
  });
});
