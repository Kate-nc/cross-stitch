/* Seeded random projects for the TrackingSync tests: malformed and legacy
   metadata, shared registers, typed and plain done arrays, and edits between
   saves. Shared by trackingSyncEquivalence.test.js and progressDelta.test.js. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const ACTORS = ['tab-a', 'tab-b', 'progress-x', 'progress-legacy'];

function clock(r) {
  const c = {}, n = Math.floor(r() * 3);
  for (let i = 0; i < n; i++) c[pick(r, ACTORS)] = 1 + Math.floor(r() * 4);
  if (r() < 0.03) c['tab-bad'] = pick(r, [0, -1, 1.5, 'x']);          // invalid counters
  return c;
}
function register(r) {
  if (r() < 0.02) return 'not-an-array';
  const n = r() < 0.8 ? 1 : 1 + Math.floor(r() * 3), out = [];
  for (let i = 0; i < n; i++) out.push(r() < 0.03 ? { value: 2, clock: {} } : { value: r() < 0.8 ? 1 : 0, clock: clock(r) });
  return out;
}
function metadata(r, len) {
  const roll = r();
  if (roll < 0.15) return undefined;
  if (roll < 0.2) return { version: 99, marks: { 'd:0': [{ value: 0, clock: { a: 1 } }] } };
  const marks = {};
  const keys = Math.floor(r() * len);
  for (let i = 0; i < keys; i++) {
    const k = pick(r, ['d:' + Math.floor(r() * len), 'h:' + Math.floor(r() * len) + ':fwd', 'q:1:TL', 'k:3,3', 'b:0,0,1,2,310', 'e:bead1', 's:p1', 'x:bad', 'd:-1']);
    marks[k] = register(r);
  }
  // A shared register, as read back from storage written by the new code.
  if (r() < 0.5) { const shared = [{ value: 1, clock: {} }]; for (let i = 0; i < len; i += 3) marks['d:' + i] = shared; }
  return { version: 1, marks: JSON.parse(JSON.stringify(marks).replace('"x:bad"', '"__proto__"')) };
}
function project(r, len) {
  const typed = r() < 0.5, d = typed ? new Uint8Array(len) : new Array(len).fill(0);
  for (let i = 0; i < len; i++) if (r() < 0.5) d[i] = 1;
  const p = {
    name: pick(r, ['A', 'B']), settings: { sW: len, fabricCt: pick(r, [14, 16]) },
    pattern: new Array(len).fill({ id: '310' }),
    done: r() < 0.05 ? undefined : d,
    halfDone: r() < 0.1 ? undefined : [[1, { fwd: 1 }], ['2', { bck: r() < 0.5 ? 1 : 0 }], [' ', { fwd: 1 }], [false, { bck: 1 }], 'junk'],
    partialDone: r() < 0.2 ? undefined : [[1, ['TL', r() < 0.5 ? 'BR' : 'TR']]],
    knotsDone: r() < 0.2 ? undefined : (r() < 0.5 ? ['3,3'] : ['3,3', 5]),
    bsDone: r() < 0.2 ? undefined : (r() < 0.5 ? ['0,0,1,2,310'] : []),
    beadsDone: r() < 0.3 ? undefined : ['bead1'],
    specialtyDone: r() < 0.3 ? undefined : (r() < 0.5 ? ['p1'] : []),
    statsSessions: [{ id: 's1', date: '2026-01-01', stitches: Math.floor(r() * 9), totalAtEnd: 3 }],
  };
  const meta = metadata(r, len);
  if (meta) p.trackingSync = meta;
  if (r() < 0.3) p.valueSync = { version: 1, fields: { name: [{ value: 'A', clock: { 'tab-a': 1 } }] } };
  return p;
}
function edit(r, p) {
  const n = Object.assign({}, p);
  if (p.done && r() < 0.9) {
    const d = ArrayBuffer.isView(p.done) ? new Uint8Array(p.done) : p.done.slice();
    const k = 1 + Math.floor(r() * 4);
    for (let i = 0; i < k; i++) { const j = Math.floor(r() * d.length); d[j] = d[j] ? 0 : 1; }
    if (r() < 0.05) n.done = Array.from(d).concat([1]); else n.done = d;
  }
  if (r() < 0.2) n.halfDone = [[1, { fwd: r() < 0.5 ? 1 : 0 }]];
  if (r() < 0.15) n.knotsDone = r() < 0.5 ? [] : ['3,3'];
  if (r() < 0.1) n.specialtyDone = undefined;
  if (r() < 0.1) n.name = 'C';
  return n;
}

module.exports = { rng, pick, ACTORS, project, edit };
