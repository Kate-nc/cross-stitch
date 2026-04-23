/* Regression test: styles.css must define modal-box / modal-header / modal-title.
   ConvertPaletteModal (and other class-based modals) rely on these classes; when
   they were missing the modal rendered transparent and effectively invisible. */
const fs = require('fs');
const path = require('path');

describe('Modal CSS classes', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

  test('.modal-box rule exists', () => {
    expect(css).toMatch(/\.modal-box\s*\{[^}]*background\s*:/);
  });

  test('.modal-header rule exists', () => {
    expect(css).toMatch(/\.modal-header\s*\{[^}]*display\s*:\s*flex/);
  });

  test('.modal-title rule exists', () => {
    expect(css).toMatch(/\.modal-title\s*\{[^}]*font-weight\s*:/);
  });

  test('.modal-overlay still defines fixed positioning', () => {
    expect(css).toMatch(/\.modal-overlay\s*\{[^}]*position\s*:\s*fixed/);
  });
});
