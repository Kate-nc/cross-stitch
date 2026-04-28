/* tests/headerProjectSwitcher.test.js
 *
 * Static checks for the UX-12 Phase 6 PR #10 header project switcher.
 * Mirrors the source-inspection style used by tests/creatorActionBar.test.js
 * — we don't mount React here. End-to-end rendering is covered by the
 * existing Playwright smoke pass.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const HEADER_SRC = fs.readFileSync(path.join(REPO_ROOT, 'header.js'), 'utf8');
const STYLES_SRC = fs.readFileSync(path.join(REPO_ROOT, 'styles.css'), 'utf8');
const CREATOR_MAIN_SRC = fs.readFileSync(path.join(REPO_ROOT, 'creator-main.js'), 'utf8');
const TRACKER_SRC = fs.readFileSync(path.join(REPO_ROOT, 'tracker-app.js'), 'utf8');
const MANAGER_SRC = fs.readFileSync(path.join(REPO_ROOT, 'manager-app.js'), 'utf8');

describe('HeaderProjectSwitcher (UX-12 Phase 6 PR #10)', () => {

  test('header.js declares the HeaderProjectSwitcher component', () => {
    expect(HEADER_SRC).toMatch(/function\s+HeaderProjectSwitcher\s*\(/);
  });

  test('component button uses aria-haspopup="menu" and toggles aria-expanded', () => {
    expect(HEADER_SRC).toMatch(/['"]aria-haspopup['"]:\s*['"]menu['"]/);
    expect(HEADER_SRC).toMatch(/['"]aria-expanded['"]:\s*open\s*\?\s*['"]true['"]\s*:\s*['"]false['"]/);
  });

  test('renders role=menu and role=menuitem inside the dropdown', () => {
    expect(HEADER_SRC).toMatch(/role:\s*['"]menu['"]/);
    expect(HEADER_SRC).toMatch(/role:\s*['"]menuitem['"]/);
  });

  test('limits the recent project list to five entries', () => {
    expect(HEADER_SRC).toMatch(/\.slice\(0,\s*5\)/);
  });

  test('"All projects…" entry calls the onOpenAll prop', () => {
    expect(HEADER_SRC).toMatch(/All projects\\u2026|All projects\u2026/);
    expect(HEADER_SRC).toMatch(/onOpenAll/);
  });

  test('Escape and click-outside close handlers are wired', () => {
    expect(HEADER_SRC).toMatch(/e\.key\s*===\s*['"]Escape['"]/);
    expect(HEADER_SRC).toMatch(/document\.addEventListener\(['"]mousedown['"]/);
    expect(HEADER_SRC).toMatch(/wrapRef\.current\.contains/);
  });

  test('ArrowUp / ArrowDown / Home / End roving focus is wired', () => {
    expect(HEADER_SRC).toMatch(/['"]ArrowDown['"]/);
    expect(HEADER_SRC).toMatch(/['"]ArrowUp['"]/);
    expect(HEADER_SRC).toMatch(/['"]Home['"]/);
    expect(HEADER_SRC).toMatch(/['"]End['"]/);
  });

  test('first menuitem is auto-focused on open via requestAnimationFrame', () => {
    expect(HEADER_SRC).toMatch(/querySelector\(['"]\[role="menuitem"\]['"]\)/);
    expect(HEADER_SRC).toMatch(/requestAnimationFrame/);
  });

  test('refreshes the recent list on cs:projectsChanged', () => {
    expect(HEADER_SRC).toMatch(/addEventListener\(['"]cs:projectsChanged['"]/);
    expect(HEADER_SRC).toMatch(/removeEventListener\(['"]cs:projectsChanged['"]/);
  });

  test('reads from ProjectStorage.listProjects (no new state store)', () => {
    expect(HEADER_SRC).toMatch(/window\.ProjectStorage\.listProjects/);
  });

  test('uses Icons.chevronDown() rather than the ▾ glyph', () => {
    // The 2 legacy unicode ▾ chevrons are gone.
    expect(HEADER_SRC).not.toMatch(/[\u25be\u25bc]/);
    // Icons.chevronDown is referenced by the switcher chevron and the
    // existing page/file dropdown chevrons (3+ call sites).
    const matches = HEADER_SRC.match(/Icons\.chevronDown/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  test('switcher is mounted inside the topbar', () => {
    expect(HEADER_SRC).toMatch(/React\.createElement\(HeaderProjectSwitcher/);
  });

  test('Phase 6 CSS section is present with switcher classes', () => {
    expect(STYLES_SRC).toMatch(/Phase 6 \(UX-12\)/);
    expect(STYLES_SRC).toMatch(/\.tb-proj-switcher\b/);
    expect(STYLES_SRC).toMatch(/\.tb-proj-switcher__btn\b/);
    expect(STYLES_SRC).toMatch(/\.tb-proj-switcher__menu\b/);
    expect(STYLES_SRC).toMatch(/\.tb-proj-switcher__item\b/);
  });

  test('Phase 6 CSS uses Workshop tokens (no raw hex on switcher rules)', () => {
    const phase6Idx = STYLES_SRC.indexOf('Phase 6 (UX-12)');
    expect(phase6Idx).toBeGreaterThan(-1);
    const endIdx = STYLES_SRC.indexOf('END Phase 6 (UX-12)', phase6Idx);
    expect(endIdx).toBeGreaterThan(phase6Idx);
    const phase6 = STYLES_SRC.slice(phase6Idx, endIdx);
    // Strip rgba(...) blocks (allowed inside box-shadow) and var(...)
    // fallbacks (e.g. var(--accent-soft, #F4DDCF)) before scanning.
    const stripped = phase6
      .replace(/rgba\([^)]*\)/g, '')
      .replace(/var\([^)]*\)/g, '');
    expect(stripped).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });

  test('Phase 6 CSS bumps min-height to 44px on coarse pointers', () => {
    const phase6 = STYLES_SRC.slice(STYLES_SRC.indexOf('Phase 6 (UX-12)'));
    expect(phase6).toMatch(/@media\s*\(pointer:\s*coarse\)[\s\S]*?min-height:\s*44px/);
  });

  test('Phase 6 CSS suppresses transitions under prefers-reduced-motion', () => {
    const phase6 = STYLES_SRC.slice(STYLES_SRC.indexOf('Phase 6 (UX-12)'));
    expect(phase6).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  test('creator-main.js wires onOpenProject to Header', () => {
    expect(CREATOR_MAIN_SRC).toMatch(/onOpenProject=\{[^}]*ProjectStorage/);
  });

  test('tracker-app.js wires onOpenProject to Header (existing picker)', () => {
    expect(TRACKER_SRC).toMatch(/onOpenProject=\{[^}]*ProjectStorage/);
  });

  test('manager-app.js wires onOpenProject to Header', () => {
    expect(MANAGER_SRC).toMatch(/onOpenProject=\{[^}]*ProjectStorage/);
  });
});
