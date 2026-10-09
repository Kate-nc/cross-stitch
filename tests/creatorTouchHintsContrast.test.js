// P0-5 (audit COMMON-06 hint part, COMMON-11 contrast part): touch users get
// touch wording, and the Convert preview labels use theme tokens that pass
// WCAG AA in both themes.
const { loadSource } = require('./_helpers/loadSource');

const css = loadSource('styles.css');

function tokens(selectorRe) {
  const m = css.match(selectorRe);
  const out = {};
  if (!m) return out;
  const block = css.slice(m.index, css.indexOf('}', m.index));
  for (const t of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,6})\b/g)) out[t[1]] = t[2];
  return out;
}
function lum(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('estimate label contrast', () => {
  const light = tokens(/:root\s*\{/);
  const dark = tokens(/\[data-theme="dark"\]\s*\{/);

  test.each([['light', light], ['dark', dark]])('%s: labels and values pass AA on the card', (_name, t) => {
    for (const bg of ['surface', 'surface-secondary']) {
      expect(contrast(t['text-secondary'], t[bg])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t['text-primary'], t[bg])).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the old hard-coded label colour failed AA (regression guard)', () => {
    expect(contrast('#A89E89', '#FBF8F3')).toBeLessThan(4.5);
  });
});

describe('Convert preview block and generating overlay use tokens', () => {
  const main = loadSource('creator-main.js');
  const start = main.indexOf('{!state.pat&&state.img&&<div style={{display:"flex",gap:20');
  // The block ends at the generating progress card (P2-8).
  const end = main.indexOf('<window.CreatorGenerateProgress stage={state.progressStage}');

  test('no raw hex colours and no 10 px labels remain', () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = main.slice(start, end + 40);
    expect(block).not.toMatch(/#[0-9A-Fa-f]{3,6}\b/);
    expect(block).not.toMatch(/fontSize:10\b/);
    expect(block).toMatch(/<div style=\{\{fontSize:"var\(--text-xs\)",color:"var\(--text-secondary\)"\}\}>Skipped<\/div>/);
  });

  test('confetti tier colours still come from confettiTier', () => {
    expect(main).toMatch(/const t=confettiTier\(state\.previewStats\.confettiPct\);/);
    expect(main).toMatch(/color:t\.color/);
  });
});

describe('touch wording', () => {
  test('Platform.isCoarsePointer exists', () => {
    expect(loadSource('helpers.js')).toMatch(/isCoarsePointer: isCoarsePointer,/);
  });

  test('the Creator status line and hints switch on coarse pointers', () => {
    const tab = loadSource('creator/PatternTab.js');
    expect(tab).toMatch(/statusText = "Long-press a stitch for more options\.";/);
    expect(tab).toMatch(/!app\.shortcutsHintDismissed && !coarse && h\("div"/);
    const kb = loadSource('keyboard-utils.js');
    expect(kb).toMatch(/if \(coarse \|\| !visible \|\| typing\) return null;/);
    const main = loadSource('creator-main.js');
    expect(main).toMatch(/!zoomLocked&&!\(window\.Platform&&window\.Platform\.isCoarsePointer&&window\.Platform\.isCoarsePointer\(\)\)&&<span[^>]*>Hold Alt to zoom/);
  });
});
