// Phase 5 batch 4 (COMMON-02): the text and fill tokens clear WCAG AA (4.5:1) on the surfaces they are used on, light and dark.
// Reads the tokens from styles.css, so a palette edit that breaks contrast fails here rather than in an audit.
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

function block(startRe) {
  const m = startRe.exec(css);
  if (!m) throw new Error('no block ' + startRe);
  let i = css.indexOf('{', m.index) + 1, depth = 1, j = i;
  while (depth && j < css.length) { const ch = css[j++]; if (ch === '{') depth++; else if (ch === '}') depth--; }
  return css.slice(i, j - 1);
}
function tokens(src) {
  const out = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi; let m;
  while ((m = re.exec(src))) out[m[1]] = m[2].replace(/\/\*[\s\S]*?\*\//g, '').trim();
  return out;
}
const light = tokens(block(/^:root\s*\{/m));
const dark = Object.assign({}, light, tokens(block(/^\[data-theme="dark"\]\s*\{/m)));
function resolve(t, name) {
  let v = t[name], n = 0;
  while (v && /^var\(/.test(v) && n++ < 5) v = t[v.match(/var\((--[a-z0-9-]+)/i)[1]];
  return v;
}
function lum(hex) {
  const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const c = [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

const SURFACES = ['--surface', '--surface-secondary', '--surface-tertiary'];
for (const [theme, t] of [['light', light], ['dark', dark]]) {
  describe(theme + ' theme tokens', () => {
    const get = n => resolve(t, n);
    test.each(SURFACES)('--text-tertiary on %s is at least 4.5:1', s => {
      expect(ratio(get('--text-tertiary'), get(s))).toBeGreaterThanOrEqual(4.5);
    });
    test.each(['--text-primary', '--text-secondary'])('%s on every surface is at least 4.5:1', n => {
      for (const s of SURFACES) expect(ratio(get(n), get(s))).toBeGreaterThanOrEqual(4.5);
    });
    test.each([...SURFACES, '--accent-soft'])('--accent-text on %s is at least 4.5:1', s => {
      expect(ratio(get('--accent-text'), get(s))).toBeGreaterThanOrEqual(4.5);
    });
    test.each([...SURFACES, '--success-soft', '--accent-soft'])('--success-text on %s is at least 4.5:1', s => {
      expect(ratio(get('--success-text'), get(s))).toBeGreaterThanOrEqual(4.5);
    });
    test('--text-on-accent on --accent (a filled button) is at least 4.5:1', () => {
      expect(ratio(get('--text-on-accent'), get('--accent'))).toBeGreaterThanOrEqual(4.5);
    });
    test('--accent-ink on --accent-soft (a tinted banner) is at least 4.5:1', () => {
      expect(ratio(get('--accent-ink'), get('--accent-soft'))).toBeGreaterThanOrEqual(4.5);
    });
    test('the focus ring colour (--accent) is at least 3:1 against every surface', () => {
      for (const s of SURFACES) expect(ratio(get('--accent'), get(s))).toBeGreaterThanOrEqual(3);
    });
  });
}

describe('rules that must keep using those tokens', () => {
  test('the default accent is not pinned inline over the dark theme\'s', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'apply-prefs.js'), 'utf8');
    expect(src).toMatch(/col\.toLowerCase\(\) !== "#b85c38"/);
    expect(src).toMatch(/removeProperty\("--accent"\)/);
  });
  test('the focus ring for buttons and inputs is the accent, not the pale accent border', () => {
    expect(css).toMatch(/input:focus-visible, select:focus-visible, button:focus-visible \{ outline: 2px solid var\(--accent\);/);
    expect(css).not.toMatch(/button:focus \{ outline: 2px solid var\(--accent-border\)/);
  });
  test('the Stats colour panel uses a defined surface (it used an undefined token that fell back to white)', () => {
    expect(css).not.toMatch(/var\(--surface-primary/);
    expect(css).toMatch(/\.colour-progress \{\n\s+background: var\(--surface\);/);
  });
  test('selected legend tile, milestone states and chart series carry a cue besides colour', () => {
    expect(css).toMatch(/\.ppal-tile--on\{[^}]*box-shadow:inset 4px 0 0/);
    expect(css).toMatch(/\.milestone-badge\.future \{[^}]*border: 1\.5px dashed/);
    expect(css).toMatch(/\.legend-line\.dotted \{/);
    const stats = fs.readFileSync(path.join(__dirname, '..', 'components-stats.js'), 'utf8');
    expect(stats).toMatch(/className:"milestone-mark"/);
    expect(stats).toMatch(/className:"milestone-state"\}, "Next"/);
    expect(stats).not.toMatch(/(stroke|fill):"#534AB7"|stroke:"#CFC4AC"/);   // the progress chart's own colours (PROJECT_COLORS is a different chart)
  });
});
