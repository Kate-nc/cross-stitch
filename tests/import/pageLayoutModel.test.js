/* tests/import/pageLayoutModel.test.js — the page arrangement behind the
 * review dialog's Pages tab. */

const path = require('path');
const M = require(path.resolve(__dirname, '..', '..', 'import-engine', 'ui', 'pageLayoutModel.js'));

/* gen-3's shape: 6 x 6 pages, 55 x 80 cells, with a 34-wide last column and a
 * 67-tall last row. */
function gen3Session() {
  const pages = [];
  const widths = [55, 55, 55, 55, 55, 34], heights = [80, 80, 80, 80, 80, 67];
  let idx = 2;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      pages.push({ pageIndex: idx++, cols: widths[c], rows: heights[r], reason: null });
    }
  }
  return { pages, layoutSource: 'axis-rulers' };
}

const rulerPlacement = () => {
  const pages = {};
  const colOff = [0, 55, 110, 165, 220, 275], rowOff = [0, 80, 160, 240, 320, 400];
  let idx = 2;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) pages[idx++] = { col: colOff[c], row: rowOff[r] };
  return { pages, manual: false };
};

describe('slotsFromPlacement', () => {
  it('reads a ruler layout back into its grid of pages', () => {
    const s = M.slotsFromPlacement(gen3Session(), rulerPlacement());
    expect(s.across).toBe(6);
    expect(s.order).toHaveLength(36);
    expect(s.order.slice(0, 7)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(s.tray).toEqual([]);
  });

  it('reads the reading-order strip as one row', () => {
    const session = gen3Session();
    const strip = { pages: {} };
    let x = 0;
    session.pages.forEach(p => { strip.pages[p.pageIndex] = { col: x, row: 0 }; x += p.cols; });
    const s = M.slotsFromPlacement(session, strip);
    expect(s.across).toBe(36);
  });

  it('puts unplaced pages in the tray', () => {
    const session = { pages: [{ pageIndex: 1, cols: 10, rows: 10 }, { pageIndex: 2, cols: 10, rows: 10, reason: 'unplaced' }] };
    const s = M.slotsFromPlacement(session, { pages: { 1: { col: 0, row: 0 } } });
    expect(s.tray).toEqual([2]);
  });
});

describe('placementFromSlots', () => {
  it('turns the strip into the right 6 x 6 grid once "pages across" is set', () => {
    // The rulerless case: everything in one row until the stitcher says 6.
    const session = gen3Session();
    const strip = { pages: {} };
    let x = 0;
    session.pages.forEach(p => { strip.pages[p.pageIndex] = { col: x, row: 0 }; x += p.cols; });
    const slots = M.setAcross(M.slotsFromPlacement(session, strip), 6);
    const placed = M.placementFromSlots(session, slots);
    // Same as reading the rulers, remainder column and row included.
    expect(placed.pages).toEqual(rulerPlacement().pages);
    expect(placed.manual).toBe(true);
  });

  it('removes repeated rows and columns at page breaks', () => {
    const session = { pages: [1, 2, 3, 4].map(i => ({ pageIndex: i, cols: 40, rows: 50 })) };
    const slots = M.setOverlap({ across: 2, order: [1, 2, 3, 4], tray: [], overlap: { cols: 0, rows: 0 } }, 3, 2);
    const p = M.placementFromSlots(session, slots).pages;
    expect(p[2]).toEqual({ col: 37, row: 0 });
    expect(p[3]).toEqual({ col: 0, row: 48 });
  });

  it('keeps a page-sized gap for an empty slot', () => {
    // A missing page: page 3 absent, so page 4 still lands bottom-right.
    const session = { pages: [1, 2, 4].map(i => ({ pageIndex: i, cols: 40, rows: 50 })) };
    const p = M.placementFromSlots(session, { across: 2, order: [1, 2, null, 4], tray: [], overlap: {} }).pages;
    expect(p[4]).toEqual({ col: 40, row: 50 });
  });

  it('ignores trailing empty rows', () => {
    const session = { pages: [1, 2].map(i => ({ pageIndex: i, cols: 10, rows: 10 })) };
    const p = M.placementFromSlots(session, { across: 2, order: [1, 2, null, null], tray: [], overlap: {} }).pages;
    expect(Object.keys(p)).toEqual(['1', '2']);
  });
});

describe('editing the arrangement', () => {
  const base = { across: 2, order: [1, 2, 3, 4], tray: [5], overlap: { cols: 0, rows: 0 } };

  it('swaps two pages', () => {
    expect(M.swap(base, 0, 3).order).toEqual([4, 2, 3, 1]);
  });

  it('moves a page into an empty slot', () => {
    expect(M.swap({ across: 2, order: [1, null, 3, 4], tray: [], overlap: {} }, 0, 1).order).toEqual([null, 1, 3, 4]);
  });

  it('reflows when pages across changes, without gathering empty slots', () => {
    const s = M.setAcross(base, 3);
    expect(s.order).toEqual([1, 2, 3, 4, null, null]);
    expect(M.setAcross(s, 2).order).toEqual([1, 2, 3, 4]);
  });

  it('takes a page out to the tray, leaving a gap', () => {
    const s = M.toTray(base, 2);
    expect(s.order).toEqual([1, null, 3, 4]);
    expect(s.tray).toEqual([5, 2]);
  });

  it('places a page from the tray, sending any occupant back', () => {
    const s = M.fromTray(base, 5, 1);
    expect(s.order).toEqual([1, 5, 3, 4]);
    expect(s.tray).toEqual([2]);
  });

  it('places a page from the tray into a new row', () => {
    const s = M.fromTray(base, 5, 5);
    expect(s.order).toEqual([1, 2, 3, 4, null, 5]);
    expect(s.tray).toEqual([]);
  });
});

describe('needsReview', () => {
  const two = (extra) => Object.assign({ pages: [{ pageIndex: 1 }, { pageIndex: 2 }] }, extra);

  it('asks for review when pages were placed without rulers', () => {
    expect(M.needsReview(two({ layoutSource: 'sequential' }))).toBe(true);
  });

  it('does not when every page was placed from its rulers', () => {
    expect(M.needsReview(two({ layoutSource: 'axis-rulers' }))).toBe(false);
  });

  it('does when a page could not be placed', () => {
    const s = two({ layoutSource: 'axis-rulers' });
    s.pages[1].reason = 'unplaced';
    expect(M.needsReview(s)).toBe(true);
  });

  it('does not for a duplicate rendering set aside', () => {
    const s = two({ layoutSource: 'alternate-renderings' });
    s.pages[1].reason = 'duplicate';
    expect(M.needsReview(s)).toBe(false);
  });

  it('does not for a single page', () => {
    expect(M.needsReview({ pages: [{ pageIndex: 1 }], layoutSource: 'sequential' })).toBe(false);
  });
});

describe('samePlacement', () => {
  it('recognises the automatic layout', () => {
    expect(M.samePlacement(rulerPlacement(), rulerPlacement())).toBe(true);
    const moved = rulerPlacement();
    moved.pages[3] = { col: 0, row: 0 };
    expect(M.samePlacement(rulerPlacement(), moved)).toBe(false);
  });
});
