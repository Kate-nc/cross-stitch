/**
 * Manager DOM size — reports/mobile-experience-audit.md item 10 / C2.
 *
 * The thread grid used to render ~1,200 cards, each with a fill gauge; the
 * gauges alone were a third of the manager's 14,341-node DOM. The Thread
 * Stash is now an owned-first list (docs/stash-redesign/option-1-plan.md);
 * these are the structural guards that keep it small.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(ROOT, 'manager-app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const createHtml = fs.readFileSync(path.join(ROOT, 'create.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('the Thread Stash keeps its DOM small', () => {
  // The old grid drew all ~1,229 catalogue shades on every visit (a third of
  // the manager's DOM was their gauges alone). The rebuilt list opens on the
  // threads you own and pages the full catalogue.
  test('the list opens on owned threads, not the whole catalogue', () => {
    expect(manager).toMatch(/const \[threadFilter, setThreadFilter\] = useState\("owned"\)/);
  });

  test('rows are rendered a page at a time', () => {
    expect(manager).toMatch(/const STASH_PAGE_SIZE = 200;/);
    expect(manager).toMatch(/filteredThreads\.slice\(0, listLimit\)\.map/);
    expect(manager).toMatch(/setListLimit\(n => n \+ STASH_PAGE_SIZE\)/);
  });

  test('rows are memoised and skip off-screen layout', () => {
    expect(manager).toMatch(/const StashRow = React\.memo\(/);
    expect(css).toMatch(/\.stash-row\{[^}]*content-visibility:auto;[^}]*\}/);
  });

  test('the old grid, card gauge and side-panel controls are gone', () => {
    expect(manager).not.toMatch(/className="thread-grid"/);
    expect(manager).not.toMatch(/className="gauge"/);
    expect(css).not.toMatch(/\.tcard\b/);
    expect(css).not.toMatch(/\.gauge-lg\b/);
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
