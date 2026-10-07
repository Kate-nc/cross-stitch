/**
 * Analysis worker message protocol — F2 of reports/track-view-performance-plan.md.
 *
 * The tracker used to post the whole pattern, as one {id} object per stitch,
 * to the analysis worker after every stitch mark. It now sends the pattern
 * once (`setPattern`, a transferred Uint16Array) and then only `done`. The
 * worker caches everything that depends on the pattern alone and sends the
 * per-stitch arrays back once per pattern.
 *
 * These tests hold the cached message path to the same output as a full
 * `runAnalysis`, across changing progress and block sizes, and pin the
 * once-per-pattern contract that makes the per-tap cost small.
 */
const { loadSource } = require('./_helpers/loadSource');

const workerSrc = loadSource('analysis-worker.js');
/* global toModel, runAnalysis, handleMessage, SKIP */
eval(workerSrc); // eslint-disable-line no-eval

const trackerSrc = loadSource('tracker-app.js');
const encodeSrc = trackerSrc.match(/function encodeAnalysisPattern\(pat\)\{[\s\S]*?\n\}/);
// eslint-disable-next-line no-new-func
const encodeAnalysisPattern = new Function(encodeSrc[0] + '\nreturn encodeAnalysisPattern;')();

function makePattern(sW, sH, seed) {
  const ids = ['310', '550', 'B5200', 'ecru', '310+550', '__skip__', '__empty__'];
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pat = [];
  for (let i = 0; i < sW * sH; i++) {
    const r = rnd();
    if (i > 0 && r < 0.5) pat.push({ id: pat[i - 1].id });
    else if (i >= sW && r < 0.75) pat.push({ id: pat[i - sW].id });
    else pat.push({ id: ids[Math.floor(rnd() * ids.length)] });
  }
  return pat;
}
function makeDone(n, frac, seed) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Uint8Array.from({ length: n }, () => (rnd() < frac ? 1 : 0));
}
/** Plain-data form for deep comparison (typed arrays -> arrays). */
function plain(v) {
  if (ArrayBuffer.isView(v)) return Array.from(v);
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = plain(v[k]); return o; }
  return v;
}
function withoutPerStitch(r) { const c = Object.assign({}, r); delete c.perStitch; return plain(c); }

/** Drive the worker's handler directly, recording what it posts. */
function session() {
  const posts = [];
  const post = (msg, transfer) => posts.push({ msg, transfer: transfer || [] });
  return { posts, send: (m) => handleMessage(m, post), results: () => posts.filter(p => p.msg.type === 'result') };
}
function setPattern(s, pat, sW, sH, id) {
  const m = toModel(pat, sW, sH);
  s.send({ type: 'setPattern', patternId: id, codes: m.codes, ids: m.ids, sW, sH });
}

describe('setPattern + analyse matches a full runAnalysis', () => {
  test('across changing progress and block sizes on one pattern', () => {
    const sW = 23, sH = 17, pat = makePattern(sW, sH, 7);
    const s = session();
    setPattern(s, pat, sW, sH, 1);
    const runs = [[makeDone(sW * sH, 0.1, 1), 10], [makeDone(sW * sH, 0.5, 2), 10], [null, 5], [makeDone(sW * sH, 0.9, 3), 7], [makeDone(sW * sH, 1, 4), 10]];
    runs.forEach(([done, bs], k) => {
      s.send({ type: 'analyse', patternId: 1, done, sW, sH, requestId: k + 1, blockSize: bs });
      const got = s.results()[k].msg;
      expect(got.requestId).toBe(k + 1);
      expect(got.patternId).toBe(1);
      expect(withoutPerStitch(got.result)).toEqual(withoutPerStitch(runAnalysis(pat, done, sW, sH, bs)));
    });
  });

  test('the per-stitch arrays sent once equal runAnalysis\'s', () => {
    const sW = 19, sH = 11, pat = makePattern(sW, sH, 3), done = makeDone(sW * sH, 0.3, 9);
    const s = session();
    setPattern(s, pat, sW, sH, 1);
    s.send({ type: 'analyse', patternId: 1, done, sW, sH, requestId: 1, blockSize: 10 });
    const ref = plain(runAnalysis(pat, done, sW, sH, 10).perStitch);
    delete ref.isCompleted;   // the main thread supplies this from its own `done`
    expect(plain(s.results()[0].msg.result.perStitch)).toEqual(ref);
  });
});

describe('the once-per-pattern contract', () => {
  test('per-stitch arrays come with the first result only, transferred', () => {
    const sW = 12, sH = 9, pat = makePattern(sW, sH, 5);
    const s = session();
    setPattern(s, pat, sW, sH, 1);
    for (let k = 1; k <= 3; k++) s.send({ type: 'analyse', patternId: 1, done: makeDone(sW * sH, 0.2 * k, k), sW, sH, requestId: k, blockSize: 10 });
    const [first, second, third] = s.results();
    const ps = first.msg.result.perStitch;
    expect(ps).toBeTruthy();
    expect(first.transfer).toEqual(expect.arrayContaining([ps.nearestDist.buffer, ps.clusterSize.buffer]));
    expect(first.transfer).toHaveLength(5);
    expect(second.msg.result.perStitch).toBeUndefined();
    expect(third.msg.result.perStitch).toBeUndefined();
    expect(second.transfer).toHaveLength(0);
  });

  test('a later result stays small: no array scales with the stitch count', () => {
    const sW = 60, sH = 50, pat = makePattern(sW, sH, 11);
    const s = session();
    setPattern(s, pat, sW, sH, 1);
    s.send({ type: 'analyse', patternId: 1, done: null, sW, sH, requestId: 1, blockSize: 10 });
    s.send({ type: 'analyse', patternId: 1, done: makeDone(sW * sH, 0.5, 1), sW, sH, requestId: 2, blockSize: 10 });
    const r = s.results()[1].msg.result;
    const longest = (function walk(v) {
      if (ArrayBuffer.isView(v) || Array.isArray(v)) return Math.max(v.length, ...Array.from(v).map(walk), 0);
      if (v && typeof v === 'object') return Math.max(0, ...Object.values(v).map(walk));
      return 0;
    })(r);
    // perRegion is (60/10)*(50/10) = 30 entries; nothing is per stitch (3 000).
    expect(longest).toBeLessThan(sW * sH / 10);
  });

  test('a new pattern sends its per-stitch arrays again', () => {
    const s = session();
    setPattern(s, makePattern(8, 8, 1), 8, 8, 1);
    s.send({ type: 'analyse', patternId: 1, done: null, sW: 8, sH: 8, requestId: 1, blockSize: 10 });
    const pat2 = makePattern(10, 6, 2);
    setPattern(s, pat2, 10, 6, 2);
    s.send({ type: 'analyse', patternId: 2, done: null, sW: 10, sH: 6, requestId: 2, blockSize: 10 });
    const second = s.results()[1].msg;
    expect(second.patternId).toBe(2);
    expect(second.result.perStitch.clusterSize).toHaveLength(60);
    expect(withoutPerStitch(second.result)).toEqual(withoutPerStitch(runAnalysis(pat2, null, 10, 6, 10)));
  });

  test('an analyse for a pattern the worker does not hold is an error, not a stale result', () => {
    const s = session();
    setPattern(s, makePattern(5, 5, 1), 5, 5, 1);
    s.send({ type: 'analyse', patternId: 2, done: null, sW: 5, sH: 5, requestId: 9, blockSize: 10 });
    expect(s.results()).toHaveLength(0);
    expect(s.posts.find(p => p.msg.type === 'error').msg.requestId).toBe(9);
  });

  test('the legacy message with an inline pattern still returns the full result', () => {
    const sW = 9, sH = 7, pat = makePattern(sW, sH, 4), done = makeDone(sW * sH, 0.4, 4);
    const s = session();
    s.send({ type: 'analyse', pat, done, sW, sH, requestId: 1, blockSize: 10 });
    expect(plain(s.results()[0].msg.result)).toEqual(plain(runAnalysis(pat, done, sW, sH, 10)));
  });
});

describe('the tracker side', () => {
  test('encodeAnalysisPattern produces exactly what the worker\'s toModel does', () => {
    const pat = makePattern(31, 13, 21);
    pat[3] = null; pat[4] = { id: null };
    const a = encodeAnalysisPattern(pat), b = toModel(pat, 31, 13);
    expect(Array.from(a.codes)).toEqual(Array.from(b.codes));
    expect(a.ids).toEqual(b.ids);
    expect(a.codes[3]).toBe(SKIP);
    expect(a.ids).not.toContain('__skip__');
  });

  test('the analyse post no longer carries the pattern', () => {
    const posts = trackerSrc.match(/postMessage\(\{type:"analyse"[^}]*\}/g) || [];
    expect(posts.length).toBeGreaterThan(0);
    posts.forEach(p => expect(p).not.toMatch(/\bpat:/));
  });

  test('setPattern transfers its buffer rather than cloning it', () => {
    expect(trackerSrc).toMatch(/postMessage\(\{type:"setPattern"[^}]*\},\[enc\.codes\.buffer\]\)/);
  });
});
