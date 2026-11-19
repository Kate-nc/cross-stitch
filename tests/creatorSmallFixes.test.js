/**
 * Stage 1 / Task 7: Small fixes (D2, D4, D5, D6, F2, F3, C4, X7).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('Stage 1 Task 7 small fixes', () => {
  test('D2: five side-panel tabs fit on one row at 280px (no wrap, flex: 1 1 0)', () => {
    const css = read('styles.css');
    expect(css).toMatch(/\.creator-sidebar-tabs\s*\{[^}]*flex-wrap:\s*nowrap;/);
    expect(css).toMatch(/\.creator-sidebar-tab\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/);
  });

  test('D4: View tab renders only one View label', () => {
    const sb = read('creator/Sidebar.js');
    const viewContent = sb.match(/var viewContent = h\(React\.Fragment, null,[\s\S]*?\);/)[0];
    expect(viewContent).not.toMatch(/"View"/);
  });

  test('D5: sentence case for Shift colours and Palette presets', () => {
    const ps = read('palette-swap.js');
    expect(ps).toContain('title: "Shift colours"');
    expect(ps).toContain('title: "Palette presets"');
    expect(ps).not.toContain('title: "Shift Colours"');
    expect(ps).not.toContain('title: "Palette Presets"');
  });

  test('D6: difficulty badge matches Pattern info chip padding, border and font size', () => {
    const css = read('styles.css');
    const chip = css.match(/\.creator-actionbar__difficulty-chip\s*\{[^}]*\}/)[0];
    expect(chip).toContain('padding: 6px 12px;');
    expect(chip).toContain('border: 1px solid currentColor;');
    expect(chip).toContain('font-size: 12px;');
    expect(chip).toContain('line-height: 1;');
  });

  test('F2: Palette instruction paragraphs moved behind InfoIcon button', () => {
    const sb = read('creator/Sidebar.js');
    expect(sb).not.toContain('pal-key-note');
    expect(sb).toMatch(/h\(InfoIcon,\s*\{[\s\S]*?label:\s*"Palette"[\s\S]*?Use Change symbol beside a thread/);
  });

  test('F3: per-thread Change symbol and Replace buttons have visible Tooltip wrappers and accessible names', () => {
    const sb = read('creator/Sidebar.js');
    expect(sb).toMatch(/withTip\("Change symbol",\s*h\("button",[\s\S]*?"aria-label":\s*"Change symbol for "\s*\+\s*formatThread\(p\)/);
    expect(sb).toMatch(/withTip\("Replace colour",\s*h\("button",[\s\S]*?"aria-label":\s*"Replace "\s*\+/);
  });

  test('C4: desktop Paint and Fill buttons use the same Icons.brush and Icons.bucketPour as the touch rail', () => {
    const ts = read('creator/ToolStrip.js');
    expect(ts).toMatch(/"aria-label":"Paint tool"[\s\S]{0,120}Icons\.brush\(\)[^)]*"Paint"/);
    expect(ts).toMatch(/"aria-label":"Fill tool"[\s\S]{0,120}Icons\.bucketPour\(\)[^)]*"Fill"/);
  });

  test('X7: phone Colour button displays active thread code and top menu button is labelled Project', () => {
    const ts = read('creator/ToolStrip.js');
    expect(ts).toMatch(/className:"creator-rail__label"\},\s*selCol \? selCol\.id : "Colour"/);
    const cb = read('creator/CompactBar.js');
    expect(cb).toMatch(/className:\s*"cc-btn cc-mode cc-more"[\s\S]*?"aria-label":\s*"Project"[\s\S]*?"Project"/);
  });
});
