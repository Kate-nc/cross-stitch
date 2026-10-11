// The conflict question announces when it opens and closes, so the Tracker's save badge
// can say "Not saved yet" instead of "Saved" while it is open (tracking audit TRACK-02, BUG-07).
const fs = require('fs');
const path = require('path');
const RES_SRC = fs.readFileSync(path.join(__dirname, '..', 'cross-tab-resolution.js'), 'utf8');

function load(confirmDialog) {
  const events = [];
  const win = {
    ConfirmDialog: confirmDialog,
    UserPrefs: { get: () => 'prompt' },
    CrossTabCoord: { onProjectChanged: () => () => {} },
    dispatchEvent: e => { events.push({ type: e.type, open: e.detail && e.detail.open }); return true; },
    location: { reload: () => {} },
    localStorage: { getItem: () => null }
  };
  const fn = new Function('window', 'localStorage', 'document', 'console', 'CustomEvent', RES_SRC);
  fn(win, win.localStorage, { readyState: 'complete' }, console, class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } });
  return { api: win.CrossTabResolution, events };
}

test('opening the question announces open, answering it announces closed', async () => {
  let answer;
  const { api, events } = load({ show: () => new Promise(r => { answer = r; }) });
  const p = api.handle({ projectId: 'proj_a' });
  expect(events).toEqual([{ type: 'cs:conflictState', open: true }]);
  answer(false);                                   // "Keep my edits"
  expect(await p).toBe('keep');
  expect(events).toEqual([{ type: 'cs:conflictState', open: true }, { type: 'cs:conflictState', open: false }]);
});

test('a dialog that throws or rejects still announces closed', async () => {
  let a = load({ show: () => { throw new Error('no'); } });
  await a.api.handle({});
  expect(a.events.map(e => e.open)).toEqual([true, false]);
  a = load({ show: () => Promise.reject(new Error('no')) });
  await a.api.handle({});
  expect(a.events.map(e => e.open)).toEqual([true, false]);
});

test('with no dialog available nothing is announced (nothing is waiting)', async () => {
  const { api, events } = load(null);
  expect(await api.handle({})).toBe('keep');
  expect(events).toEqual([]);
});
