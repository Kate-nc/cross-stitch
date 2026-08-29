/**
 * Manager DOM size — reports/mobile-experience-audit.md item 10 / C2.
 *
 * The thread grid renders ~1,200 cards. Each carried a 4-segment fill gauge
 * built from five DOM nodes (a track plus four <div class="seg">), which was
 * 4,892 nodes on its own — a third of the manager's entire 14,341-node DOM,
 * and the page with the worst blocking time in the app.
 *
 * The gauge is now a single element whose box-shadow copies paint the other
 * three pills. Pixel equivalence is proved in
 * tests/mobile-audit/desktop-gauge-equivalence.spec.js (0 differing pixels at
 * DPR 1); these are the structural guards that keep it that way.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(ROOT, 'manager-app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const createHtml = fs.readFileSync(path.join(ROOT, 'create.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('thread card gauge is a single element', () => {
  test('the card renders one gauge node carrying the level as data', () => {
    expect(manager).toMatch(/<div className="gauge" data-level=\{gaugeLevel\} \/>/);
  });

  test('the four-segment loop is gone from the card', () => {
    // The old markup was `{[0,1,2,3].map(s => <div className={"seg"...} />)}`
    // inside `.gauge`. The detail-panel gauge (.gauge-lg) still uses .seg and
    // is deliberately untouched — it renders once, not 1,200 times.
    const grid = manager.slice(manager.indexOf('thread-grid'), manager.indexOf('gauge-lg'));
    expect(grid).not.toMatch(/\[0,1,2,3\]\.map/);
    expect(grid).not.toMatch(/className=\{"seg"/);
  });

  test('all four pills are painted from the one element', () => {
    const rule = css.match(/\.tcard \.gauge\{[^}]*\}/);
    expect(rule).not.toBeNull();
    // Box shadows at 6/12/18px reproduce segments 2-4; zero spread means they
    // inherit the element's border-radius, so the pill shape is preserved.
    expect(rule[0]).toMatch(/box-shadow:6px 0 0 [^,]+,12px 0 0 [^,]+,18px 0 0 [^;]+;/);
    expect(rule[0]).toMatch(/border-radius:2px/);
    // width 4 + margin-right 18 reserves the same 22px the flex track did.
    expect(rule[0]).toMatch(/width:4px/);
    expect(rule[0]).toMatch(/margin-right:18px/);
  });

  test('every fill level from the old class logic has a rule', () => {
    // 0 = empty (base rule), 1 = one warning pill, 2-4 = n accent pills.
    expect(css).toMatch(/\.tcard \.gauge\[data-level="1"\]\{background:var\(--warning\);\}/);
    for (const lvl of [2, 3, 4]) {
      expect(css).toMatch(new RegExp(`\\.tcard \\.gauge\\[data-level="${lvl}"\\]\\{background:var\\(--accent\\);box-shadow:`));
    }
  });

  test('the old per-segment rules are gone', () => {
    expect(css).not.toMatch(/\.tcard \.gauge \.seg\{/);
    expect(css).not.toMatch(/\.tcard \.gauge \.seg\.full\{/);
    // ...but the detail-panel gauge keeps its own.
    expect(css).toMatch(/\.gauge-lg \.seg\{/);
  });
});

describe('speculative prefetch is gated on the connection', () => {
  for (const [name, html] of [['create.html', createHtml], ['index.html', indexHtml]]) {
    test(`${name} does not hard-code prefetch links`, () => {
      // 1.3 MB decoded / 345 KB over the wire of OTHER pages' assets. Static
      // <link rel=prefetch> cannot be conditional, so it is built at runtime.
      expect(html).not.toMatch(/<link rel="prefetch"/);
      expect(html).toMatch(/rel = 'prefetch'/);
    });

    test(`${name} skips prefetch on slow links and touch devices`, () => {
      expect(html).toMatch(/navigator\.connection/);
      expect(html).toMatch(/saveData === true/);
      expect(html).toMatch(/2g\|slow-2g/);
      expect(html).toMatch(/\(pointer: coarse\)/);
    });

    test(`${name} still prefetches the same six assets`, () => {
      for (const a of ['compiled/tracker-app.compiled.js', 'pdf-lib.min.js',
        'pdf-export-worker.js', 'compiled/creator-main.compiled.js',
        'stats-page.js', 'stats-activity.js']) {
        expect(html).toContain(a);
      }
    });

    test(`${name} never lets a prefetch failure break the page`, () => {
      const block = html.slice(html.indexOf('Speculative prefetch'), html.indexOf('</script>', html.indexOf('Speculative prefetch')));
      expect(block).toMatch(/try \{/);
      expect(block).toMatch(/catch \(_\)/);
    });
  }
});

describe('the dev server approximates production', () => {
  const serve = fs.readFileSync(path.join(ROOT, 'serve.js'), 'utf8');

  test('text responses are gzipped', () => {
    // Without this the harness measures ~4x the real transfer size and any
    // conclusion drawn about bytes vs round trips is wrong.
    expect(serve).toMatch(/require\('zlib'\)/);
    expect(serve).toMatch(/Content-Encoding'\] = 'gzip'/);
    expect(serve).toMatch(/createGzip\(\)/);
  });

  test('responses carry a validator so no-cache can revalidate to 304', () => {
    expect(serve).toMatch(/headers\.ETag = etag/);
    expect(serve).toMatch(/if-none-match/);
    expect(serve).toMatch(/writeHead\(304/);
  });
});
