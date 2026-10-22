// Characterises scripts/lint-css-tokens.js: what it flags, what it exempts,
// and the CLI output/exit contract. Advisory by default; --strict fails.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { lint } = require('../scripts/lint-css-tokens.js');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'lint-css-tokens.js');

let tmpDir;
beforeAll(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-css-')); });
afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

// lint() resolves its argument against the repo root, so hand it a relative path.
function lintCss(css) {
  const file = path.join(tmpDir, 'fixture.css');
  fs.writeFileSync(file, css, 'utf8');
  return lint(path.relative(ROOT, file));
}

function runCli(args) {
  return spawnSync(process.execPath, [SCRIPT].concat(args), { cwd: ROOT, encoding: 'utf8' });
}

describe('lint-css-tokens: real violations', () => {
  test('reports a raw hex in a component rule with its position and selector', () => {
    const found = lintCss('.btn {\n  color: #fff;\n}\n');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      line: 2, column: 10, rule: 'no-raw-hex', selector: '.btn', source: 'color: #fff;',
    });
    expect(found[0].message).toBe('Raw hex `#fff` outside token block. Use var(--…).');
  });

  test('flags 3, 6 and 8 digit hex and every hex on a line', () => {
    const found = lintCss('.a { color: #abc; background: #A1B2C3; border-color: #11223344; }\n');
    expect(found.map((f) => f.message.match(/`(#[0-9A-Fa-f]+)`/)[1])).toEqual(['#abc', '#A1B2C3', '#11223344']);
  });

  test('a marker exempts only its own line', () => {
    const found = lintCss(
      '.a {\n  color: #111; /* css-tokens-lint-allow: reason */\n  background: #222;\n}\n');
    expect(found.map((f) => f.line)).toEqual([3]);
  });

  test('a high-contrast override outside :root/[data-theme] is still reported', () => {
    const found = lintCss('html.pref-high-contrast {\n  --line: #1B1814;\n}\n');
    expect(found).toHaveLength(1);
    expect(found[0].selector).toBe('html.pref-high-contrast');
  });
});

describe('lint-css-tokens: allowed cases', () => {
  test.each([
    [':root block', ':root {\n  --accent: #B85C38;\n}\n'],
    ['[data-theme] block', '[data-theme="dark"] {\n  --accent: #E2865B;\n}\n'],
    ['box-shadow line', '.a { box-shadow: 0 1px 0 #000; }\n'],
    ['inline SVG data URI', ".a { background: url(\"data:image/svg+xml;utf8,<svg fill='#fff'/>\"); }\n"],
    ['var() fallback', '.a { color: var(--accent, #B85C38); }\n'],
    ['comment line', '/* #fff is fine in prose */\n.a { color: var(--text-primary); }\n'],
    ['marker with reason', '.a { mask-image: linear-gradient(#000, transparent); /* css-tokens-lint-allow: alpha mask */ }\n'],
  ])('%s is not reported', (_name, css) => {
    expect(lintCss(css)).toEqual([]);
  });

  test('values the script documents as unchecked are not reported', () => {
    expect(lintCss('.a { margin: 13px; color: rgb(1, 2, 3); background: rgba(0,0,0,.5); border-color: white; }\n')).toEqual([]);
  });
});

describe('lint-css-tokens: CLI contract', () => {
  const real = lint('styles.css');

  test('default run is advisory and exits 0', () => {
    const r = runCli([]);
    expect(r.status).toBe(0);
    if (real.length === 0) {
      expect(r.stdout).toContain('[lint-css-tokens] No raw-hex findings outside token blocks.');
    } else {
      expect(r.stdout).toContain('[lint-css-tokens] ' + real.length + ' advisory finding(s):');
      expect(r.stdout).toContain('Non-blocking by default. Run with --strict to fail CI.');
    }
  });

  test('--strict exits 1 only when there are findings', () => {
    expect(runCli(['--strict']).status).toBe(real.length > 0 ? 1 : 0);
  });

  test('--json prints { count, findings } matching lint()', () => {
    const r = runCli(['--json']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Object.keys(parsed)).toEqual(['count', 'findings']);
    expect(parsed.count).toBe(real.length);
    expect(parsed.findings).toEqual(real);
  });
});

describe('lint-css-tokens: styles.css exceptions', () => {
  const lines = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').split(/\r?\n/);
  const marked = lines.filter((l) => l.includes('css-tokens-lint-allow'));

  test('every exception states a reason', () => {
    expect(marked.length).toBeGreaterThan(0);
    for (const l of marked) {
      expect(l).toMatch(/css-tokens-lint-allow:\s+\S.*\*\//);
    }
  });

  test('the scroll-fade masks are exempt as functional alpha masks', () => {
    const masks = lines.filter((l) => /mask-image:.*#000/.test(l));
    expect(masks.length).toBeGreaterThanOrEqual(2);
    for (const l of masks) expect(l).toContain('css-tokens-lint-allow');
    expect(lint('styles.css').filter((f) => /mask-image/.test(f.source))).toEqual([]);
  });
});
