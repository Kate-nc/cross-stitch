// Creator settings panel on phones and tablets (audit B-01, B-02, B-14).
//
// B-01: a Tracker-era `.rpanel{display:none!important}` inside
//       @media(max-width:899px) hid the Creator's only settings panel.
// B-02: the bottom-drawer rules lived in `(pointer: coarse), (max-width: 899px)`
//       so a touch tablet at 900px+ kept a full-width fixed panel over the chart.
// B-14: fit zoom assumed a 750px-wide view.

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const css = read('styles.css');

// Top-level @media blocks as { query, body }.
function mediaBlocks(src) {
  const out = [];
  const re = /@media([^{]*)\{/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    out.push({ query: m[1].trim(), body: src.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return out;
}

const blocks = mediaBlocks(css);

describe('Creator .rpanel CSS', () => {
  test('no max-width media block hides .rpanel', () => {
    const offenders = blocks.filter((b) => /max-width/.test(b.query) &&
      /(^|[\s,}])\.rpanel\s*\{[^}]*display\s*:\s*none/.test(b.body));
    expect(offenders.map((b) => b.query)).toEqual([]);
  });

  test('the fixed bottom drawer is width-only, not tied to coarse pointers', () => {
    const drawerRule = /(^|[\s,}])\.rpanel\s*\{[^}]*position\s*:\s*fixed/;
    const withDrawer = blocks.filter((b) => drawerRule.test(b.body));
    expect(withDrawer.length).toBeGreaterThan(0);
    withDrawer.forEach((b) => {
      expect(b.query).not.toMatch(/pointer/);
      expect(b.query).toMatch(/max-width\s*:\s*899px/);
    });
  });

  test('the page fade does not leave a transform behind', () => {
    // fill-mode both keeps transform:translateY(0), which turns
    // .cs-page-content into the containing block for the fixed drawer.
    expect(css).toMatch(/\.cs-page-content\{animation:cs-fadein [^;]*backwards;/);
  });

  test('the Convert drawer header is hidden on wide screens', () => {
    expect(css).toMatch(/\.rpanel-drawer-header\{display:none;\}/);
  });
});

describe('Convert mode drawer header', () => {
  const sidebar = read('creator/Sidebar.js');
  test('create mode renders a Settings row that toggles the panel', () => {
    expect(sidebar).toMatch(/className:"rpanel-drawer-header"/);
    expect(sidebar).toMatch(/app\.setPanelOpen\(!drawerOpen\)/);
    expect(sidebar).toMatch(/drawerHeader,\s*createPanel,\s*createActions/);
  });
});

describe('creatorFitZoom', () => {
  const src = read('creator/useCreatorState.js');
  const start = src.indexOf('function creatorFitZoom(');
  const end = src.indexOf('window.creatorFitZoom = creatorFitZoom;');
  // eslint-disable-next-line no-new-func
  const creatorFitZoom = new Function(src.slice(start, end) + '\nreturn creatorFitZoom;')();

  function chartPx(n, zoom) { return n * Math.max(2, Math.round(20 * zoom)) + 28 + 2; }

  test('falls back to the old 750px width without a measured box', () => {
    expect(creatorFitZoom(80, 80, null, null, 28)).toBeCloseTo(750 / (80 * 20), 5);
  });

  test('fits the limiting dimension of a wide box', () => {
    const z = creatorFitZoom(80, 80, 1158, 548, 28);
    expect(chartPx(80, z)).toBeLessThanOrEqual(548 + 4);
    expect(chartPx(80, z)).toBeGreaterThanOrEqual(548 * 0.9);
  });

  test('fits the limiting dimension of a tall box', () => {
    const z = creatorFitZoom(60, 30, 391, 900, 28);
    expect(chartPx(60, z)).toBeLessThanOrEqual(391 + 4);
    expect(chartPx(60, z)).toBeGreaterThanOrEqual(391 * 0.9);
  });

  test('stays inside the zoom limits', () => {
    expect(creatorFitZoom(4, 4, 4000, 4000, 28)).toBe(3);
    expect(creatorFitZoom(2000, 2000, 300, 300, 28)).toBe(0.05);
  });
});
