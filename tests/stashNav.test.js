/**
 * Stash Manager navigation (docs/stash-redesign/hub-and-stock-take-plan.md,
 * Phase 3): one <nav> that is a side menu on wide screens and a tab bar on
 * narrow ones, with Custom catalogues and Import and export as pages.
 */
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const manager = read('manager-app.js');
const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

describe('one nav, two layouts', () => {
  test('the sections are links in a labelled nav', () => {
    expect(manager).toMatch(/<nav className="mgr-tab-bar mgr-nav" aria-label="Stash Manager">/);
    const fn = manager.slice(manager.indexOf('function navLink('), manager.indexOf('// Attention line and Shopping list tab.'));
    expect(fn).toMatch(/<a key=\{id\} \{\.\.\.attrs\} href=\{"manager\.html\?from=home&tab=" \+ id\}/);
    expect(fn).toMatch(/aria-current=\{on \? "page" : undefined\}/);
    // Modified clicks (new tab or window) are left to the browser.
    expect(fn).toMatch(/e\.metaKey \|\| e\.ctrlKey \|\| e\.shiftKey/);
  });

  test('it becomes a side menu from 1024px, with the extra pages only there', () => {
    expect(css).toMatch(/\.mgr-nav-secondary\{display:none;\}/);
    const wide = css.slice(css.indexOf('@media (min-width: 1024px){\n  .mgr-shell'));
    expect(wide).toMatch(/\.mgr-shell\{flex-direction:row;\}/);
    expect(wide).toMatch(/\.mgr-nav\.mgr-tab-bar\{[^}]*width:228px;/);
    expect(wide).toMatch(/\.mgr-nav-secondary\{display:flex;/);
  });

  test('the address follows the section', () => {
    expect(manager).toMatch(/u\.searchParams\.set\('tab', tab\);\s*window\.history\.replaceState\(/);
    expect(manager).toMatch(/if \(p === 'overview' \|\| p === 'catalogues' \|\| p === 'transfer'\) return p;/);
  });
});

describe('pages', () => {
  test('Custom catalogues is a page, not a dialog', () => {
    expect(manager).toMatch(/function CataloguePanel\(\{ records, onRecords \}\)/);
    expect(manager).not.toMatch(/CatalogueDialog/);
    expect(manager).toMatch(/\{tab === "catalogues" && \(/);
  });

  test('Import and export gathers bulk add, catalogues, the shopping list and backup', () => {
    const page = manager.slice(manager.indexOf('{tab === "transfer" && ('), manager.indexOf('{/* Overview: the Stash Manager'));
    expect(page).toMatch(/setBulkAddOpen\(true\)/);
    expect(page).toMatch(/downloadCatalogueCSV\(catalogueRecords\)/);
    expect(page).toMatch(/onClick=\{copyShoppingList\}/);
    expect(page).toMatch(/downloadProjectShoppingList\(\)/);
    expect(page).toMatch(/onClick=\{handleBackupDownload\}/);
  });

  test('narrow screens reach both pages from Add threads', () => {
    expect(manager).toMatch(/close\(\); goTab\("catalogues"\);/);
    expect(manager).toMatch(/close\(\); goTab\("transfer"\);/);
  });
});

describe('number keys', () => {
  test('1 to 4 switch sections through the shortcut registry', () => {
    [['1', 'overview'], ['2', 'inventory'], ['3', 'shopping'], ['4', 'patterns']].forEach(([k, t]) => {
      expect(manager).toMatch(new RegExp("keys: '" + k + "', scope: 'global', description: '[^']+', run: \\(\\) => goTab\\('" + t + "'\\)"));
    });
    expect(read('help-drawer.js')).toMatch(/id: "m\.sections", scope: "manager", keys: \["1", "2", "3", "4"\]/);
  });
});
