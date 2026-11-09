/* Opening a project that nothing has changed writes nothing — and everything that
   does change on open is still written.
   ═══════════════════════════════════════════════════════════════════════════
   reports/track-mode-performance-baseline.md, finding 1 and the re-validated
   "opening a project schedules a full save" hypothesis. The Tracker's autosave
   treated its first run after a load as a change, so every open was followed
   ~5 s later by a full save of the whole project (seconds of main thread on a
   phone for a large chart), and ProjectStorage.get() rewrote the whole project
   whenever the recovery journal every unload leaves behind was still there,
   even when it held exactly the marks already stored.

   A full-project write is counted as a put to the `projects` store
   (trackProbes.js). Desktop, no throttle: these are counts, not times. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { waitForSaved } = require('../_helpers/perfProbes');
const { installTrackProbes, readTrackProbes } = require('../_helpers/trackProbes');
const { fixtureWith } = require('../_helpers/panProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');

// Longer than the 5 s debounce and the 10 s cap on small charts (20 s on large
// ones is not needed: a save that was going to happen has started by 12 s).
const WATCH_MS = 12000;

async function setup(page) {
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  await installTrackProbes(page);
}
async function importFixture(page, file, id) {
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.waitForSelector('.tracker-chart-layer canvas', { timeout: 120000 });
  // A page that already shows a project has a chart and a "Saved" badge before
  // this import is even read: wait for this project to be stored and open.
  if (id) {
    for (let i = 0; ; i++) {
      const ok = await page.evaluate(async (pid) => ProjectStorage.getActiveProjectId() === pid && !!(await ProjectStorage.get(pid)), id);
      if (ok) break;
      if (i > 600) throw new Error('the import of ' + id + ' was never stored');
      await page.waitForTimeout(100);
    }
  }
  // An import is a new project: it is saved. Wait for that save, and then let
  // any write that follows it finish too.
  await waitForSaved(page, 120000);
  await page.waitForTimeout(1500);
}
async function reopen(page) {
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__tp.fullPaints.length > 0, null, { timeout: 120000, polling: 100 });
}
const writes = (r) => r.idb.filter((e) => e.store === 'projects' && e.op === 'put').length;
const saves = (r) => r.spans.filter((s) => s.name === 'ProjectStorage.save').length;
/** Stitches whose stored mark differs from `before` (an array of 0/1). */
const changedSince = (page, before) => page.evaluate(async (b) => {
  const p = await ProjectStorage.get(ProjectStorage.getActiveProjectId());
  let n = 0; for (let i = 0; i < b.length; i++) if ((p.done[i] ? 1 : 0) !== b[i]) n++;
  return n;
}, before);
const storedDone = (page, id) => page.evaluate(async (pid) => Array.from((await ProjectStorage.get(pid || ProjectStorage.getActiveProjectId())).done, (v) => (v ? 1 : 0)), id || null);
const stored = (page, field) => page.evaluate(async (f) => {
  const p = await ProjectStorage.get(ProjectStorage.getActiveProjectId());
  return f === 'doneCount' ? p.done.reduce((n, v) => n + (v ? 1 : 0), 0) : p[f];
}, field);

for (const size of ['small', 'large']) {
  test(`reopening an unchanged ${size} project writes nothing`, async ({ page }) => {
    test.setTimeout(180000);
    await setup(page);
    await importFixture(page, fixtureFor(size, { doneFraction: 0.5 }));
    const done0 = await stored(page, 'doneCount');
    await reopen(page);
    await page.waitForTimeout(WATCH_MS);
    const r = await readTrackProbes(page, 0);
    console.log(`OPEN_UNCHANGED_${size.toUpperCase()} ` + JSON.stringify({ projectPuts: writes(r), fullSaves: saves(r), gets: r.spans.filter((s) => s.name === 'ProjectStorage.get').length }));
    expect(r.reactWrapped, 'the probes did not install').toBe(true);
    expect(saves(r), 'the Tracker saved a project nobody changed').toBe(0);
    expect(writes(r), 'the whole project was written on open, with nothing to write').toBe(0);
    expect(await stored(page, 'doneCount'), 'the marks changed on open').toBe(done0);
  });
}

test('reopening an unchanged mixed-stitch project writes nothing', async ({ page }) => {
  test.setTimeout(180000);
  await setup(page);
  await importFixture(page, fixtureFor('medium', { doneFraction: 0.5, mixed: true }));
  await reopen(page);
  await page.waitForTimeout(WATCH_MS);
  const r = await readTrackProbes(page, 0);
  console.log('OPEN_UNCHANGED_MIXED ' + JSON.stringify({ projectPuts: writes(r), fullSaves: saves(r) }));
  // Half stitches, knots, beads, backstitch, petites and long stitches all
  // normalise on load; a project the Tracker saved is already normal.
  expect(saves(r), 'the Tracker saved a mixed project nobody changed').toBe(0);
  expect(writes(r)).toBe(0);
});

/* What does change on open must still be written. Records are staged from
   home.html: same storage, and no Tracker on the page whose unload handler
   would write over them. */
async function stage(page, fn, arg) {
  await page.goto('/home.html', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof ProjectStorage !== 'undefined');
  await page.waitForTimeout(500);
  return page.evaluate(fn, arg);
}
async function openStored(page) {
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__tp.fullPaints.length > 0, null, { timeout: 120000, polling: 100 });
}

test('a project saved in an older format is migrated on open', async ({ page }) => {
  test.setTimeout(180000);
  await setup(page);
  await importFixture(page, fixtureFor('small', { doneFraction: 0.5 }));
  await stage(page, async () => {
    const id = ProjectStorage.getActiveProjectId();
    const p = await ProjectStorage.get(id);
    delete p.originalPaletteState;      // created on load since v9
    p.version = 8;
    // A v8 session without durationSeconds (patched on load).
    p.statsSessions = [{ id: 'sess_old', date: '2026-01-02', startTime: '2026-01-02T10:00:00.000Z', durationMinutes: 30, netStitches: 10, stitchesCompleted: 10, totalAtEnd: 10 }];
    await ProjectStorage.save(p);
    localStorage.removeItem('crossstitch_progress_recovery:' + id);
  });
  await openStored(page);
  await page.waitForTimeout(WATCH_MS);
  const r = await readTrackProbes(page, 0);
  const after = await page.evaluate(async () => {
    const p = await ProjectStorage.get(ProjectStorage.getActiveProjectId());
    return { version: p.version, hasPalette: Array.isArray(p.originalPaletteState), session: (p.statsSessions || []).find((s) => s.id === 'sess_old') };
  });
  console.log('OPEN_LEGACY ' + JSON.stringify({ fullSaves: saves(r), after }));
  expect(saves(r), 'a migrated project was not saved').toBeGreaterThanOrEqual(1);
  expect(after.version).toBe(11);
  expect(after.hasPalette, 'the original palette created on load was not kept').toBe(true);
  expect(after.session && after.session.durationSeconds, 'the patched session was not kept').toBe(1800);
});

test('marks only a progress record held are folded into a full save, and survive a reload', async ({ page }) => {
  test.setTimeout(180000);
  await setup(page);
  await importFixture(page, fixtureFor('small', { doneFraction: 0.5 }));
  const expected = await stage(page, async () => {
    const id = ProjectStorage.getActiveProjectId();
    const p = await ProjectStorage.get(id);
    const done = Array.from(p.done);
    let added = 0;
    for (let i = 0; i < done.length && added < 7; i++) if (!done[i]) { done[i] = 1; added++; }
    // Another tab's progress write that never reached a full save.
    await ProjectStorage.saveProgress(id, { done, baseWriteAt: p.lastWriteAt, tabId: 'other-tab' });
    localStorage.removeItem('crossstitch_progress_recovery:' + id);
    return done.reduce((n, v) => n + v, 0);
  });
  await openStored(page);
  await page.waitForTimeout(WATCH_MS);
  const r = await readTrackProbes(page, 0);
  console.log('OPEN_PROGRESS ' + JSON.stringify({ fullSaves: saves(r), projectPuts: writes(r) }));
  expect(saves(r), 'marks from a progress record were not folded into a full save').toBeGreaterThanOrEqual(1);
  const full = await page.evaluate(async () => {
    const db = await getDB();
    const id = ProjectStorage.getActiveProjectId();
    const rec = await new Promise((res) => { const q = db.transaction('projects').objectStore('projects').get(id); q.onsuccess = () => res(q.result); });
    return rec.done.reduce((n, v) => n + (v ? 1 : 0), 0);
  });
  expect(full, 'the full record does not hold the recovered marks').toBe(expected);
  await reopen(page);
  expect(await stored(page, 'doneCount')).toBe(expected);
});

test('a session backed up before the tab closed is saved on open, and the backup cleared', async ({ page }) => {
  test.setTimeout(180000);
  await setup(page);
  await importFixture(page, fixtureFor('small', { doneFraction: 0.5 }));
  await stage(page, async () => {
    const id = ProjectStorage.getActiveProjectId();
    localStorage.setItem('cs_pending_session_' + id, JSON.stringify([{ id: 'sess_backup', date: '2026-11-01', startTime: '2026-11-01T09:00:00.000Z', endTime: '2026-11-01T09:20:00.000Z', durationSeconds: 1200, durationMinutes: 20, netStitches: 5, stitchesCompleted: 5, totalAtEnd: 5 }]));
    localStorage.removeItem('crossstitch_progress_recovery:' + id);
  });
  await openStored(page);
  await page.waitForTimeout(WATCH_MS);
  const after = await page.evaluate(async () => {
    const id = ProjectStorage.getActiveProjectId();
    const p = await ProjectStorage.get(id);
    return { kept: (p.statsSessions || []).some((s) => s.id === 'sess_backup'), backup: localStorage.getItem('cs_pending_session_' + id) };
  });
  expect(after.kept, 'the backed-up session was not saved').toBe(true);
  expect(after.backup, 'the backup was not cleared after the save took it in').toBeNull();
});

async function tapChart(page, k) {
  const box = await page.evaluate(() => { const b = document.querySelector('.tracker-chart-scroll').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  await page.mouse.click(Math.round(box.x + box.w * (0.3 + 0.05 * k)), Math.round(box.y + box.h * (0.4 + 0.03 * k)));
}

for (const size of ['small', 'large']) {
  test(`marking straight after opening an unchanged ${size} project is kept`, async ({ page }) => {
    test.setTimeout(180000);
    await setup(page);
    await importFixture(page, fixtureFor(size, { doneFraction: 0.5 }));
    const done0 = await storedDone(page);
    await reopen(page);
    // The first tap lands as soon as the chart is drawn: before the autosave's
    // first run with this project, or just after it.
    await tapChart(page, 0);
    await tapChart(page, 1);
    await page.waitForTimeout(WATCH_MS);
    const r = await readTrackProbes(page, 0);
    console.log(`MARK_AFTER_OPEN_${size.toUpperCase()} ` + JSON.stringify({ fullSaves: saves(r), progress: r.spans.filter((s) => s.name === 'ProjectStorage.saveProgress').length }));
    if (size === 'small') expect(saves(r), 'marks after a clean open were never saved in full').toBeGreaterThanOrEqual(1);
    else expect(r.spans.filter((s) => s.name === 'ProjectStorage.saveProgress').length, 'no progress write for the marks').toBeGreaterThanOrEqual(1);
    await reopen(page);
    expect(await changedSince(page, done0), 'the two marks did not survive a reload').toBe(2);
  });
}

test('switching projects quickly writes only the one that changed, and keeps its marks', async ({ page }) => {
  test.setTimeout(240000);
  await setup(page);
  await importFixture(page, fixtureWith(fixtureFor('small', { doneFraction: 0.5 }), { id: 'proj_switch_a', name: 'Switch A' }), 'proj_switch_a');
  await importFixture(page, fixtureWith(fixtureFor('small', { doneFraction: 0.5 }), { id: 'proj_switch_b', name: 'Switch B' }), 'proj_switch_b');
  await reopen(page);   // B, as stored
  const writeAt = (id) => page.evaluate(async (pid) => {
    const db = await getDB();
    return new Promise((res) => { const q = db.transaction('projects').objectStore('projects').get(pid); q.onsuccess = () => res(q.result && q.result.lastWriteAt); });
  }, id);
  const a0 = { at: await writeAt('proj_switch_a'), done: await storedDone(page, 'proj_switch_a') };
  const b0 = await storedDone(page, 'proj_switch_b');
  const pick = async (name) => {
    await page.locator('.tb-page-btn', { hasText: 'File' }).click();
    await page.getByRole('button', { name: /Switch Project/ }).click();
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.waitForFunction((n) => (document.querySelector('.tb-proj-switcher__name') || {}).textContent === n, name, { timeout: 30000 });
  };
  await tapChart(page, 2);           // an edit to B (it also starts a stitching session) ...
  await pick('Switch A');            // ... then away at once, and back
  await pick('Switch B');
  await page.waitForTimeout(WATCH_MS);
  const after = await page.evaluate(async () => {
    const b = await ProjectStorage.get('proj_switch_b');
    return { sessions: (b.statsSessions || []).length, backup: localStorage.getItem('cs_pending_session_proj_switch_b') };
  });
  console.log('SWITCH ' + JSON.stringify(after));
  // A was opened and left without a change: never written.
  expect(await writeAt('proj_switch_a'), 'opening A wrote it, although nothing in it changed').toBe(a0.at);
  expect(await page.evaluate(async (d) => { const p = await ProjectStorage.get('proj_switch_a'); return p.done.every((v, i) => (v ? 1 : 0) === d[i]); }, a0.done)).toBe(true);
  // B's mark, made just before switching away, is kept; so is the session it
  // started, which was finished when B was left and saved when B came back.
  const bChanged = await page.evaluate(async (d) => { const p = await ProjectStorage.get('proj_switch_b'); let n = 0; d.forEach((v, i) => { if ((p.done[i] ? 1 : 0) !== v) n++; }); return n; }, b0);
  expect(bChanged, 'the mark made just before switching away was lost').toBe(1);
  expect(after.sessions, 'the session the mark started was not saved').toBeGreaterThanOrEqual(1);
  expect(after.backup, 'the session backup was not cleared after the save took it in').toBeNull();
});

test('a failed save keeps the change unsaved until a later save writes it', async ({ page }) => {
  test.setTimeout(180000);
  await setup(page);
  await importFixture(page, fixtureFor('small', { doneFraction: 0.5 }));
  const done0 = await stored(page, 'doneCount');
  await reopen(page);
  // Every write to the projects store fails from here on.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.__failSaves = true;
    IDBObjectStore.prototype.put = function (v, k) { if (window.__failSaves && this.name === 'projects') throw new DOMException('Quota exceeded (test)', 'QuotaExceededError'); return put.apply(this, arguments); };
  });
  await tapChart(page, 3);
  await page.waitForTimeout(WATCH_MS);
  const full = () => page.evaluate(async () => {
    const db = await getDB();
    const rec = await new Promise((res) => { const q = db.transaction('projects').objectStore('projects').get(ProjectStorage.getActiveProjectId()); q.onsuccess = () => res(q.result); });
    return rec.done.reduce((n, v) => n + (v ? 1 : 0), 0);
  });
  expect(await full(), 'the full record changed although every save failed').toBe(done0);
  // Saving works again. Hiding the tab writes only what is unsaved since the last
  // write: a failed save must not have counted the change as written.
  await page.evaluate(() => {
    window.__failSaves = false;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(3000);
  expect(Math.abs((await full()) - done0), 'the change was treated as saved after a failed save').toBe(1);
});
