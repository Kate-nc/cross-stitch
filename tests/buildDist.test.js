// tests/buildDist.test.js — the deployed copy built by scripts/build-dist.js.
// Vercel serves this folder, so it must hold every file the pages and the
// service worker need, minified, with sw.js fingerprints that match the
// minified bytes, and with the Pattern Keeper PDF files untouched.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

let OUT;
let swContext;

beforeAll(() => {
  OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchx-dist-'));
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-dist.js'), OUT], { cwd: ROOT, stdio: 'pipe' });
  const sw = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
  swContext = {};
  vm.runInNewContext(sw.slice(0, sw.indexOf('// END GENERATED BUILD MANIFEST')), swContext);
}, 60000);

afterAll(() => {
  if (OUT) fs.rmSync(OUT, { recursive: true, force: true });
});

const read = rel => fs.readFileSync(path.join(OUT, rel));
const exists = rel => fs.existsSync(path.join(OUT, rel));

describe('dist contents', () => {
  test('leaves out tests, reports, docs, build tools and JSX sources', () => {
    for (const rel of ['tests', 'reports', 'TestUploads', 'docs', 'proposals', 'wiki', 'scripts', 'api', 'node_modules',
      'serve.js', 'build-sw.js', 'package.json', 'vercel.json', 'README.md', 'AGENTS.md',
      'tracker-app.js', 'creator-main.js', 'manager-app.js', 'embroidery.js']) {
      expect([rel, exists(rel)]).toEqual([rel, false]);
    }
  });

  test('has every local script and stylesheet the pages load', () => {
    const pages = ['home.html', 'index.html', 'create.html', 'stitch.html', 'manager.html', 'embroidery.html'];
    for (const page of pages) {
      const html = read(page).toString('utf8');
      for (const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["']/gi)) {
        const url = m[1];
        if (/^https?:/.test(url) || !/\.(js|css)$/.test(url)) continue;
        expect([page, url, exists(url.replace(/^\.\//, ''))]).toEqual([page, url, true]);
      }
      for (const m of html.matchAll(/loadScript\(\s*'([^']+\.js)'/g)) {
        expect([page, m[1], exists(m[1])]).toEqual([page, m[1], true]);
      }
    }
  });

  test('pages are copied unchanged', () => {
    for (const page of ['home.html', 'create.html', 'stitch.html', 'manifest.json']) {
      expect(read(page).equals(fs.readFileSync(path.join(ROOT, page)))).toBe(true);
    }
  });
});

describe('dist service worker', () => {
  test('fingerprints every required file from the minified bytes', () => {
    const local = Object.keys(swContext.BUILD_ASSETS).filter(u => u.startsWith('./'));
    expect(local.length).toBeGreaterThan(100);
    for (const url of local) {
      const rel = url.slice(2);
      expect([url, exists(rel)]).toEqual([url, true]);
      expect([url, swContext.BUILD_ASSETS[url].sha256]).toEqual([url, sha256(read(rel))]);
    }
  });

  test('precaches changelog.js, which Version history loads on demand', () => {
    expect(swContext.REQUIRED_URLS).toContain('./changelog.js');
  });

  test('is otherwise the source worker', () => {
    const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const strip = s => s.slice(0, s.indexOf('// BEGIN GENERATED BUILD MANIFEST')) + s.slice(s.indexOf('// END GENERATED BUILD MANIFEST'));
    expect(strip(read('sw.js').toString('utf8'))).toBe(strip(src));
  });
});

describe('minified output', () => {
  test('scripts are much smaller and still parse', () => {
    const src = fs.statSync(path.join(ROOT, 'creator/bundle.js')).size;
    expect(read('creator/bundle.js').length).toBeLessThan(src * 0.6);
    expect(read('styles.css').length).toBeLessThan(fs.statSync(path.join(ROOT, 'styles.css')).size * 0.85);
    for (const rel of ['creator/bundle.js', 'creator/extras-bundle.js', 'compiled/tracker-app.compiled.js',
      'compiled/creator-main.compiled.js', 'compiled/manager-app.compiled.js', 'sync-engine.js', 'helpers.js',
      'preferences-modal.js', 'generate-worker.js', 'import-engine/bundle.js']) {
      expect(() => new vm.Script(read(rel).toString('utf8'), { filename: rel })).not.toThrow();
    }
  });

  test('keeps the globals other scripts rely on', () => {
    // Run source and minified copies of the data/helper scripts in page order
    // and compare everything they put on window, including computed data.
    // Silence the data files' console.info diagnostics.
    const quiet = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
    const chain = ['constants.js', 'colour-utils.js', 'dmc-data.js', 'anchor-data.js', 'thread-conversions.js', 'changelog.js'];
    function globals(load) {
      const ctx = { console: quiet };
      ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
      vm.createContext(ctx);
      for (const rel of chain) vm.runInContext(load(rel), ctx, { filename: rel });
      const out = {};
      const names = vm.runInContext('Object.getOwnPropertyNames(globalThis)', ctx);
      const builtins = new Set(vm.runInNewContext('Object.getOwnPropertyNames(globalThis)'));
      for (const k of names) {
        if (builtins.has(k) || ['console', 'window', 'self', 'globalThis'].includes(k)) continue;
        const v = ctx[k];
        out[k] = typeof v === 'function' ? 'function' : v;
      }
      // Some scripts keep a reference to the global object; print it once.
      const seen = new WeakSet();
      return JSON.parse(JSON.stringify(out, (key, value) => {
        if (value && typeof value === 'object') {
          if (seen.has(value)) return '[seen]';
          seen.add(value);
        }
        return value;
      }));
    }
    const before = globals(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const after = globals(rel => read(rel).toString('utf8'));
    expect(Object.keys(before).length).toBeGreaterThan(10);
    expect(after).toEqual(before);
  });

  test('minified scripts link a source map', () => {
    const code = read('helpers.js').toString('utf8');
    expect(code).toMatch(/\/\/# sourceMappingURL=helpers\.js\.map\n$/);
    const map = JSON.parse(read('helpers.js.map').toString('utf8'));
    expect(map.sources).toEqual(['helpers.js']);
  });
});

describe('Pattern Keeper PDF export stays bit-stable', () => {
  test('its files are copied byte-for-byte', () => {
    for (const rel of ['pdf-export-worker.js', 'creator/pdfChartLayout.js', 'creator/pdfExport.js']) {
      expect([rel, read(rel).equals(fs.readFileSync(path.join(ROOT, rel)))]).toEqual([rel, true]);
    }
  });

  test('extras-bundle.js keeps its copies verbatim while the rest is minified', () => {
    const bundle = read('creator/extras-bundle.js').toString('utf8');
    for (const rel of ['creator/pdfChartLayout.js', 'creator/pdfExport.js']) {
      expect([rel, bundle.includes(fs.readFileSync(path.join(ROOT, rel), 'utf8').trimEnd())]).toEqual([rel, true]);
    }
    expect(bundle.length).toBeLessThan(fs.statSync(path.join(ROOT, 'creator/extras-bundle.js')).size * 0.75);
  });
});
