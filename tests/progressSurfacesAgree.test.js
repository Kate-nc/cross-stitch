/**
 * @jest-environment jsdom
 *
 * UX-019: one truth for progress numbers. After stitches are marked, the Tracker, Home, the Library card and the
 * Stats totals must give the same figures for the same project, because they all come from ProgressUnits. Also: the
 * Library card shows progress once, and every time estimate reads in the one wording.
 */
const fs = require('fs');
const path = require('path');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
global.structuredClone = v => require('v8').deserialize(require('v8').serialize(v));
global.IS_REACT_ACT_ENVIRONMENT = true;
window.React = React;

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// eslint-disable-next-line no-eval
eval(read('constants.js') + '\nwindow.DEFAULT_STITCH_SPEED = DEFAULT_STITCH_SPEED;');
// eslint-disable-next-line no-eval
eval(read('helpers.js'));
// eslint-disable-next-line no-eval
eval(read('project-storage.js') + '\nwindow.ProjectStorage = ProjectStorage;');
// eslint-disable-next-line no-eval
eval(read('useStitchCounts.js'));
// eslint-disable-next-line no-eval
eval(read('home-screen.js'));

const W = 100, H = 170;          // 17,000 stitchable cells, the size of the project in the report
const TOTAL = W * H;
const patternOf = () => Array.from({ length: TOTAL }, () => ({ id: '310', type: 'solid' }));
const project = (over) => Object.assign({
  id: 'proj_ux019', name: 'Big sampler', settings: { sW: W, sH: H, fabricCt: 14 },
  pattern: patternOf(), done: new Array(TOTAL).fill(0),
  halfStitches: [], halfDone: [], statsSessions: []
}, over);

beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  ProjectStorage._deletedIds.clear();
});

// Mark `n` stitches the way the Tracker does: through the real counter hook, one incremental delta per mark.
function trackerAfterMarking(n, extra) {
  const pat = patternOf(), done = new Int8Array(TOTAL);
  const hs = new Map((extra && extra.halfStitches) || []);
  const hd = new Map((extra && extra.halfDone) || []);
  const el = document.createElement('div'), root = createRoot(el);
  let counts;
  function Harness() { counts = window.useStitchCounts({ pat, done, halfStitches: hs, halfDone: hd }); return null; }
  act(() => root.render(React.createElement(Harness)));
  for (let i = 0; i < n; i++) { done[i] = 1; act(() => counts.applyDoneCountsDelta([{ idx: i, oldVal: 0 }], pat, done)); }
  // The strip's own arithmetic (tracker-app.js progAll), from the counters.
  let halfTotal = 0, halfDone = 0;
  hs.forEach((v, idx) => { ['fwd', 'bck'].forEach(s => { if (v[s]) { halfTotal++; if ((hd.get(idx) || {})[s]) halfDone++; } }); });
  const prog = ProgressUnits.progressUnits({ full: { done: counts.doneCountRef.current, total: TOTAL }, half: { done: halfDone, total: halfTotal } });
  act(() => root.unmount());
  return { prog, done: Array.from(done) };
}

function renderCard(proj) {
  const el = document.createElement('div'); document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(React.createElement(ProjectCard, { proj, onOpen() {}, onChangeState() {}, payloadCache: new Map([[proj.id, {}]]) })));
  const out = { text: el.textContent, html: el.innerHTML, el };
  return { out, unmount() { act(() => root.unmount()); el.remove(); } };
}

describe('the same project, after marking stitches, reads the same everywhere', () => {
  test.each([
    ['16 full stitches (0.1%, the report case)', 16, null],
    ['16 full stitches and a half-marked half stitch', 16, { halfStitches: [[20, { fwd: { id: '310' }, bck: { id: '310' } }]], halfDone: [[20, { fwd: true }]] }]
  ])('%s', async (_name, n, extra) => {
    const tracker = trackerAfterMarking(n, extra);
    await ProjectStorage.save(project({ done: tracker.done, halfStitches: extra ? extra.halfStitches : [], halfDone: extra ? extra.halfDone : [] }));

    // Home reads the whole project (home-app.js projectPct is ProgressUnits.fromProject).
    const home = ProgressUnits.fromProject(await ProjectStorage.get('proj_ux019'));
    // The Library card reads the project's metadata row.
    const meta = (await ProjectStorage.listProjects())[0];
    // Stats reads the stats summary row.
    const summary = (await ProjectStorage.buildAllStatsSummaries())[0];

    const expectedDone = n + (extra ? 0.5 : 0);
    expect(tracker.prog.doneUnits).toBe(expectedDone);
    expect(home.doneUnits).toBe(tracker.prog.doneUnits);
    expect(meta.completedStitches).toBe(tracker.prog.doneUnits);
    expect(summary.completedStitches).toBe(tracker.prog.doneUnits);

    expect(home.totalUnits).toBe(tracker.prog.totalUnits);
    expect(meta.totalStitches).toBe(tracker.prog.totalUnits);
    expect(summary.totalStitches).toBe(tracker.prog.totalUnits);

    expect(home.percent).toBe(tracker.prog.percent);
    expect(meta.pct).toBe(tracker.prog.percent);
    expect(summary.pct).toBe(tracker.prog.percent);
    expect(ProgressUnits.percent(meta.completedStitches, meta.totalStitches)).toBe(tracker.prog.percent);

    // "to go" is the same whole number the Tracker strip shows beside "done".
    expect(ProgressUnits.remainingWhole(home)).toBe(ProgressUnits.remainingWhole(tracker.prog));

    // Stats: "Total stitches" (the All time tile) and Lifetime are the marked stitches, not finished sessions.
    expect(ProgressUnits.sumRows([summary]).doneUnits).toBe(tracker.prog.doneUnits);
    expect(await ProjectStorage.getLifetimeStitches()).toBe(tracker.prog.doneUnits);
    // The project card on Stats says "left": the same remaining.
    expect(summary.totalStitches - summary.completedStitches).toBe(tracker.prog.remainingUnits);
  });

  test('a project with marks but no finished session is not "Lifetime 0"', async () => {
    await ProjectStorage.save(project({ done: trackerAfterMarking(16).done, statsSessions: [] }));
    expect(await ProjectStorage.getLifetimeStitches()).toBe(16);
  });

  test('Total stitches sums every project and keeps fractional units', () => {
    const rows = [{ completedStitches: 16, totalStitches: 17000 }, { completedStitches: 0.5, totalStitches: 10 }, null, { totalStitches: 5 }];
    expect(ProgressUnits.sumRows(rows)).toMatchObject({ doneUnits: 16.5, totalUnits: 17015, remainingUnits: 16998.5, count: 3 });
    expect(ProgressUnits.sumRows([]).percent).toBe(0);
  });

  test('the Library card for the same project shows the same percentage, once', async () => {
    const tracker = trackerAfterMarking(16);
    await ProjectStorage.save(project({ done: tracker.done }));
    const meta = (await ProjectStorage.listProjects())[0];
    const card = renderCard(Object.assign({}, meta, { dimensions: { width: W, height: H } }));
    const pctText = tracker.prog.percent + '%';
    // Exactly one visible percentage (the bar's label); the bar carries it as its accessible value, not as more text.
    expect(card.out.text.split(pctText).length - 1).toBe(1);
    expect(card.out.text).not.toMatch(/% stitched/);
    expect(card.out.el.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    expect(card.out.el.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe(String(tracker.prog.percent));
    expect(card.out.el.querySelector('.mpd-card-progress').getAttribute('title')).toBe('16 of 17,000 stitches');
    card.unmount();
  });
});

describe('Library card (manager-only entry)', () => {
  test('an entry with no tracked stitches shows no progress at all', () => {
    const card = renderCard({ id: 'mgr:1', name: 'Imported', managerOnly: true, completedStitches: 0, totalStitches: 0, updatedAt: null });
    expect(card.out.el.querySelector('[role="progressbar"]')).toBeNull();
    expect(card.out.text).not.toMatch(/%/);
    card.unmount();
  });
  test('the manager no longer adds a second "% stitched" chip', () => {
    expect(read('manager-app.js')).not.toMatch(/% stitched/);
  });
});

describe('one time-estimate wording', () => {
  test('estFormatHours and estimateText', () => {
    expect(estFormatHours(0)).toBe('');
    expect(estFormatHours(0.4)).toBe('under an hour');
    expect(estFormatHours(1)).toBe('about 1 hour');
    expect(estFormatHours(423.35)).toBe('about 423 hours');
    expect(estFormatHours(1234.6)).toBe('about 1,235 hours');
    expect(estimateText(423.35, 28)).toBe('about 423 hours, about 4 weeks at your pace');
    expect(estimateText(423.35, 0)).toBe('about 423 hours');
    expect(estimateText(0, 5)).toBe('about 5 days at your pace');
    expect(estimateText(0, 0)).toBe('');
  });

  test('the Library card and the Creator give the same hours for the same chart', async () => {
    const remaining = 17000 - 16;
    // The Creator's slider starts at the default speed; the card, with no history of its own, uses it too.
    expect(window.DEFAULT_STITCH_SPEED).toBe(40);
    const creatorText = estimateText(remaining / window.DEFAULT_STITCH_SPEED);
    const cardProj = { id: 'proj_x', name: 'X', completedStitches: 16, totalStitches: 17000, stitchesPerHour: 0 };
    expect(HomeProjectHelpers.estimateRemainingText(cardProj)).toBe(creatorText);
    expect(creatorText).toBe('about 425 hours');
    const card = renderCard(cardProj);
    expect(card.out.text).toContain('Est. remaining: about 425 hours');
    card.unmount();
  });

  test('with a recent pace the card adds calendar time in the same words', () => {
    const today = getStitchingDate(new Date(), getDayEndHour());
    const d = n => estDateFromNumber(estDayNumber(today) - n);
    const proj = {
      completedStitches: 3000, totalStitches: 17000, stitchesPerHour: 100,
      paceDaily: { [d(0)]: 700, [d(1)]: 700, [d(2)]: 700, [d(3)]: 900 }, firstActiveDate: d(3), activeDaysTotal: 4
    };
    const text = HomeProjectHelpers.estimateRemainingText(proj);
    expect(text).toMatch(/^about 140 hours, about \d+ (days|weeks|months) at your pace$|^about 140 hours, about a day at your pace$/);
  });

  test('no surface still formats an estimate its own way', () => {
    expect(read('home-screen.js')).not.toMatch(/function fmtHours/);
    expect(read('home-screen.js')).not.toMatch(/\bhrs\b/);
    expect(read('home-app.js')).not.toMatch(/estFormatShort/);
    const tracker = read('tracker-app.js');
    expect(tracker).toMatch(/\['Time remaining', estimateText\(/);
    expect(tracker).not.toMatch(/\['Time remaining', fmtL\(/);
    const creator = read('creator/ProjectTab.js') + read('creator/PatternInfoPopover.js');
    expect(creator).not.toMatch(/fmtTimeL\(Math\.round\(/);
    expect(creator).toMatch(/estimateText\(ctx\.totalStitchable/);
    expect(read('creator/CompareStrip.js')).not.toMatch(/ hr"/);
  });
});

describe('Stats totals', () => {
  test('Total stitches and Lifetime count marks, not finished sessions', () => {
    const stats = read('components-stats.js');
    expect(stats).toMatch(/var totalStitches = ProgressUnits\.sumRows\(projectSummaries\)\.doneUnits;/);
    expect(stats).toMatch(/label: 'Total stitches', value: ProgressUnits\.formatUnits\(lifetimeTotals\.totalStitches\), sub: 'marked across '/);
    // Speed still needs the stitches that went with the recorded time.
    expect(stats).toMatch(/Math\.round\(sessionStitches \/ totalHours\)/);
    const storage = read('project-storage.js');
    expect(storage).toMatch(/ProgressUnits\.sumRows\(await this\.listProjects\(\)\)\.doneUnits/);
    expect(storage).not.toMatch(/stitchLog\.length > 0\) \{\s*for \(const entry of proj\.stitchLog\) total/);
  });
});
