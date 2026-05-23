// INT-7 (visibility tier) — structural assertions for the cross-tab
// coordination module and its wire-up across the entry HTMLs.

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const coord = read('cross-tab-coord.js');
const storage = read('project-storage.js');
const sw = read('sw.js');
const plan = read('reports/integration-audit/INT-7-plan.md');

describe('INT-7: cross-tab-coord.js shape', () => {
  test('declares the channel + idempotent install + tab id', () => {
    expect(coord).toMatch(/cs-project-changed/);
    expect(coord).toMatch(/if \(window\.CrossTabCoord\) return/);
    expect(coord).toMatch(/window\.CrossTabCoord\s*=\s*\{/);
    expect(coord).toMatch(/tabId:\s*TAB_ID/);
  });
  test('feature-detects BroadcastChannel and degrades silently', () => {
    expect(coord).toMatch(/typeof BroadcastChannel !== 'undefined'/);
  });
  test('ignores own broadcasts via sourceTabId guard', () => {
    expect(coord).toMatch(/data\.sourceTabId === TAB_ID/);
  });
  test('only nags when active project matches incoming projectId', () => {
    expect(coord).toMatch(/active !== data\.projectId/);
  });
  test('throttles repeated toasts (>=8s)', () => {
    expect(coord).toMatch(/_toastShownAt/);
    expect(coord).toMatch(/8000/);
  });
});

describe('INT-7: ProjectStorage broadcasts after save', () => {
  test('save() calls CrossTabCoord.broadcastProjectSaved', () => {
    expect(storage).toMatch(/CrossTabCoord\.broadcastProjectSaved/);
    expect(storage).toMatch(/project\.id\.indexOf\("proj_"\) === 0/);
  });
});

describe('INT-7: every HTML entry loads cross-tab-coord.js before project-storage.js', () => {
  ['home.html', 'index.html', 'create.html', 'stitch.html', 'manager.html'].forEach(function (file) {
    test(file + ' loads cross-tab-coord.js before project-storage.js', () => {
      var html = read(file);
      var coordIdx = html.indexOf('cross-tab-coord.js');
      var psIdx = html.indexOf('project-storage.js');
      expect(coordIdx).toBeGreaterThan(-1);
      expect(psIdx).toBeGreaterThan(-1);
      expect(coordIdx).toBeLessThan(psIdx);
    });
  });
});

describe('INT-7: service worker precaches the new module', () => {
  test('sw.js includes cross-tab-coord.js in PRECACHE_URLS and bumps cache version', () => {
    expect(sw).toMatch(/'\.\/cross-tab-coord\.js'/);
    expect(sw).toMatch(/CACHE_NAME\s*=\s*'cross-stitch-cache-v46'/);
  });
});

describe('INT-7: plan-of-action document exists and lists the phases', () => {
  test('plan covers detection, resolution, locks, storage-event fallback, stash unification', () => {
    expect(plan).toMatch(/Phase A.*Detection/);
    expect(plan).toMatch(/Phase B.*Resolution/);
    expect(plan).toMatch(/Phase C.*Locks/);
    expect(plan).toMatch(/Phase D.*Storage-event fallback/);
    expect(plan).toMatch(/Phase E.*Stash channel unification/);
  });
});
