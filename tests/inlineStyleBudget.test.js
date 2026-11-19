// tests/inlineStyleBudget.test.js
// Stage 3 (D1): Edit's components use the shared classes in styles.css (the
// ones the Convert panel uses) instead of hand-written inline styles. This
// counts the `style: {` objects in each file and fails above its budget, so
// they don't creep back. A dynamic value, such as a swatch's colour, may stay
// inline. Lower a budget when a file loses more; never raise one to make a
// change pass: add a class to styles.css instead.

const fs = require('fs');
const path = require('path');

const BUDGETS = {
  'creator/Sidebar.js': 7,
  'palette-swap.js': 4,
  'creator/ToolStrip.js': 6,
  'creator/PatternTab.js': 2,
  // The reference: Convert's panel and Frame the picture.
  'creator/ConvertPanel.js': 4,
  'creator/FrameView.js': 1,
};

function countInlineStyles(src) {
  return (src.match(/\bstyle\s*:\s*\{/g) || []).length;
}

describe('inline style budget (Stage 3, D1)', () => {
  test.each(Object.keys(BUDGETS))('%s stays within its inline-style budget', (file) => {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const n = countInlineStyles(src);
    if (n > BUDGETS[file]) {
      throw new Error(file + ' has ' + n + ' inline style objects; the budget is ' + BUDGETS[file] +
        '. Use a class in styles.css (with tokens) instead.');
    }
    expect(n).toBeLessThanOrEqual(BUDGETS[file]);
  });

  test('counts the forms used in the codebase', () => {
    expect(countInlineStyles('h("div",{style:{a:1}}); h("b", { style: {b:2} }); x.style = {}; styles:{}')).toBe(2);
  });
});
