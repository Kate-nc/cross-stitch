// tests/homeBulkDelete.test.js — fix-3.5 + fix-3.7
// Source-contract checks for:
//   • Styled BulkDeleteModal replacing window.confirm
//   • Persistent "Cancel selection" affordance during selection mode

const fs = require('fs');
const path = require('path');
function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

describe('fix-3.5 — Bulk delete uses styled modal (not window.confirm)', () => {
  const src = read('home-screen.js');

  it('home-screen.js does not call window.confirm inside handleBulkDelete', () => {
    // Slice the function source so we don't accidentally match window.confirm
    // elsewhere in the file.
    const m = src.match(/function handleBulkDelete\(\) \{[\s\S]*?\n  \}/);
    expect(m).toBeTruthy();
    expect(m[0]).not.toMatch(/window\.confirm/);
  });

  it('declares a BulkDeleteModal component', () => {
    expect(src).toMatch(/function BulkDeleteModal\(/);
  });

  it('BulkDeleteModal closes on Escape', () => {
    expect(src).toMatch(/e\.key === 'Escape'/);
  });

  it('BulkDeleteModal autofocuses the Cancel button', () => {
    expect(src).toMatch(/cancelRef\.current\.focus/);
  });

  it('BulkDeleteModal lists project names with "and N more" overflow', () => {
    expect(src).toMatch(/\\u2026 and ' \+ extra \+ ' more/);
  });

  it('uses a separate doBulkDelete() that performs the actual deletion', () => {
    expect(src).toMatch(/function doBulkDelete\(\)/);
    expect(src).toMatch(/ProjectStorage\.deleteMany/);
  });

  it('BulkDeleteModal is rendered when confirmDelete is true', () => {
    expect(src).toMatch(/confirmDelete && h\(BulkDeleteModal/);
  });
});

describe('fix-3.7 — persistent Cancel selection affordance', () => {
  const src = read('home-screen.js');

  it('renames the bulk-bar Clear button to "Cancel selection"', () => {
    expect(src).toMatch(/'Cancel selection'/);
    // The literal string "Clear" should no longer label the bulk-bar button.
    const clearMatch = src.match(/onClick:\s*clearSelection[\s\S]{0,80}'Clear'/);
    expect(clearMatch).toBeNull();
  });

  it('renders a persistent selection-mode banner where the Continue bar would be', () => {
    expect(src).toMatch(/className:\s*'mpd-selection-cancel-bar'/);
    expect(src).toMatch(/Selection mode active/);
  });

  it('persistent banner offers a Cancel selection button', () => {
    // Match within the banner block.
    const block = src.match(/'mpd-selection-cancel-bar'[\s\S]{0,400}/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/Cancel selection/);
  });
});

describe('fix-3.5 / 3.7 — supporting CSS', () => {
  const css = read('styles.css');
  it('defines .mpd-bulk-delete-modal', () => {
    expect(css).toMatch(/\.mpd-bulk-delete-modal/);
  });
  it('defines .mpd-selection-cancel-bar', () => {
    expect(css).toMatch(/\.mpd-selection-cancel-bar/);
  });
});
