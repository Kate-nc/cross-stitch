/* tests/import/uiReviewModalStyling.test.js
 *
 * Visual-regression tests for the Import Review modal: ensures it uses the
 * canonical Workshop button classes (.g-btn / .g-btn primary) instead of the
 * bespoke .btn-primary / .btn-secondary classes that made it look like it
 * belonged to a different application.
 *
 * Also asserts the styles.css block uses real Workshop tokens (--s-N, --line)
 * rather than the bogus --space-N / --surface-2 tokens that previously
 * resolved to nothing.
 */

const fs = require('fs');
const path = require('path');

describe('Import review modal — button class regression', () => {
  let modalSrc;
  beforeAll(() => {
    modalSrc = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'import-engine', 'ui', 'ImportReviewModal.js'),
      'utf8'
    );
  });

  it('uses .g-btn primary for the "Use this pattern" confirm button', () => {
    // The exact attribute string from the source.
    expect(modalSrc).toMatch(/className:\s*'g-btn primary'[^,]*,\s*\n[^\n]*onClose\s*&&\s*props\.onClose\('confirm'/);
  });

  it('uses .g-btn for Cancel and the optional "Open guided wizard" button', () => {
    // Two .g-btn (non-primary) usages: Cancel and the wizard branch.
    const matches = modalSrc.match(/className:\s*'g-btn'(?!\s*\+)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('does not reintroduce the deprecated .btn-primary / .btn-secondary classes', () => {
    expect(modalSrc).not.toMatch(/className:\s*'btn-primary'/);
    expect(modalSrc).not.toMatch(/className:\s*'btn-secondary'/);
  });

  it('attaches an Escape-to-close handler', () => {
    expect(modalSrc).toMatch(/Escape['"]\s*&&\s*props\.onClose/);
  });
});

describe('Import review modal — CSS token regression', () => {
  let css;
  beforeAll(() => {
    css = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'styles.css'),
      'utf8'
    );
  });

  // Extract just the Import Review Modal block to scope the assertions.
  function importReviewBlock() {
    const start = css.indexOf('.import-review-modal-overlay');
    expect(start).toBeGreaterThan(-1);
    // Find the next major section divider after the import block. The
    // block ends just before the next "/* -----" banner OR end of file.
    const after = css.indexOf('/* -----', start + 1);
    return after === -1 ? css.slice(start) : css.slice(start, after);
  }

  it('does not reference the bogus --space-N tokens', () => {
    const block = importReviewBlock();
    expect(block).not.toMatch(/var\(--space-\d/);
  });

  it('does not reference the bogus --surface-2 token', () => {
    const block = importReviewBlock();
    expect(block).not.toMatch(/var\(--surface-2[^-]/);
  });

  it('uses canonical --s-N spacing tokens', () => {
    const block = importReviewBlock();
    expect(block).toMatch(/var\(--s-\d\)/);
  });

  it('uses --line and --surface design tokens for borders and backgrounds', () => {
    const block = importReviewBlock();
    expect(block).toMatch(/var\(--line\)/);
    expect(block).toMatch(/var\(--surface\)/);
  });

  it('uses the canonical --z-modal-equivalent z-index (not 10000)', () => {
    const block = importReviewBlock();
    // The block should not pin itself above coachmarks/toasts at 10000.
    expect(block).not.toMatch(/z-index:\s*10000/);
  });

  it('uses the canonical scrim colour (rgba 15,23,42, .45)', () => {
    const block = importReviewBlock();
    expect(block).toMatch(/rgba\(15,\s*23,\s*42,\s*0?\.45\)/);
  });

  it('includes a mobile-collapse media query', () => {
    const block = importReviewBlock();
    expect(block).toMatch(/@media\s*\([^)]*max-width:\s*720px/);
  });
});
