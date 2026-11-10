// Regression coverage for transport, attribution and benchmark isolation.
// These tests do not claim to measure browser performance.
const fs = require('fs'), zlib = require('zlib'), crypto = require('crypto'), path = require('path');
const vm = require('vm'), http = require('http'), { EventEmitter } = require('events');
const { IDBFactory } = require('fake-indexeddb');
const { createHandler, traceSummary, config, startupObserver, resetSeedStorage, projectReadSummary, boundedProbes, median, buildInfo, run } = require('./perf/stitch-startup.cjs');
const source = path.resolve(__dirname, '..');
function response(url, encoding = '', candidate = false, method = 'GET') {
  const headers = {}; let bytes, status = 200;
  createHandler({ deployed: source, candidate })({ url, method, headers: { 'accept-encoding': encoding } }, {
    setHeader(k, v) { headers[k] = v; }, writeHead(s) { status = s; }, end(b) { bytes = b; }
  });
  return { status, headers, bytes };
}
test.each(['react.production.min.js', 'react-dom.production.min.js', 'pako.min.js'])('CDN mirror preserves pinned SRI after decompression: %s', name => {
  const r = response('/__cdn/' + name, 'gzip');
  const integrity = 'sha384-' + crypto.createHash('sha384').update(zlib.gunzipSync(r.bytes)).digest('base64');
  expect(fs.readFileSync(path.join(source, 'stitch.html'), 'utf8')).toContain(integrity);
  expect(r.status).toBe(200);
  expect(r.headers['Cache-Control']).toBe('max-age=3600');
  expect(r.headers.Vary).toBe('Accept-Encoding');
  expect(r.headers['Content-Length']).toBe(r.bytes.length);
});
test('scripts are byte-identical and gzip;q=0 is honoured; HEAD has no body', () => {
  const file = fs.readFileSync(path.join(source, 'compiled/tracker-app.compiled.js'));
  const r = response('/compiled/tracker-app.compiled.js', 'br, gzip;q=0');
  expect(r.bytes).toEqual(file);
  expect(r.headers['Content-Encoding']).toBeUndefined();
  const compressed = response('/compiled/tracker-app.compiled.js', 'gzip;q=0.5');
  expect(zlib.gunzipSync(compressed.bytes)).toEqual(file);
  const head = response('/compiled/tracker-app.compiled.js', 'gzip', false, 'HEAD');
  expect(head.bytes).toBeUndefined();
  expect(head.headers['Content-Length']).toBe(compressed.bytes.length);
});
test('candidate changes only the preload, without changing script order or shared env', () => {
  const baseline = response('/stitch.html').bytes.toString();
  const candidate = response('/stitch.html', '', true).bytes.toString();
  const link = '<link rel="preload" as="script" href="compiled/tracker-app.compiled.js">';
  expect(candidate.replace(link, '')).toBe(baseline);
  expect(candidate.indexOf(link)).toBeLessThan(candidate.indexOf('recovery-storage.js'));
  expect(response('/stitch.html').bytes.toString()).toBe(baseline);
  expect(baseline).toContain('/__cdn/react.production.min.js');
});
test.each(['/__cdn/not-a-library.js', '/__cdn/nested/react.production.min.js', '/.git/config', '/node_modules/react/package.json', '/missing.js'])('unapproved or missing assets return 404: %s', url => {
  expect(response(url).status).toBe(404);
});
const e = (name, ts, dur, extra = {}) => ({ name, ts, dur, pid: 10, tid: 1, ph: 'X', ...extra });
const entry = () => e('EvaluateScript', 2000, 10000, { args: { data: { url: 'http://localhost/compiled/tracker-app.compiled.js' } } });
const markers = () => [e('stitch-startup:begin', 1000, 0, { ph: 'R', cat: 'blink.user_timing' }), e('stitch-startup:usable', 13000, 0, { ph: 'R', cat: 'blink.user_timing' })];
test('trace clips to readiness, excludes other processes/threads, and deduplicates nested compile/render', () => {
  const r = traceSummary([...markers(), entry(), e('EvaluateScript', 0, 500), e('EvaluateScript', 14000, 50000),
    e('EvaluateScript', 2000, 50000, { pid: 11 }), e('EvaluateScript', 2000, 50000, { tid: 2 }),
    e('v8.compile', 3000, 3000), e('V8.CompileScript', 3000, 3000), e('v8.compile', 3000, 50000, { pid: 11 }),
    e('Layout', 0, 4000), e('Paint', 2000, 1000), e('Paint', 12000, 2000), e('Paint', 0, 50000, { tid: 2 })]);
  expect(r.windowMs).toBe(12);
  expect(r.evaluateInclusiveMs).toBe(10);
  expect(r.mainThreadCompileMs).toBe(3);
  expect(r.renderingMs).toBe(4); // 1000..4000 and 12000..13000, not nested sum.
  expect(r.scripts).toHaveLength(1);
});
test('missing window or wrong-thread tracker attribution is unavailable, not zero', () => {
  expect(() => traceSummary([entry()])).toThrow('window missing');
  expect(() => traceSummary(markers())).toThrow('Tracker evaluation missing');
  expect(() => traceSummary([...markers(), { ...entry(), pid: 11 }])).toThrow('Tracker evaluation missing');
});
test('project read excludes failed or post-readiness reads and cannot produce negative hydration', () => {
  const span = { name: 'ProjectStorage.get', t: 10, settled: 20 };
  expect(projectReadSummary([{ ...span, failed: true }, { ...span, t: 100 }, span], 50)).toEqual({ startMs: 10, settledMs: 30, elapsedMs: 20, readToUsableMs: 20 });
  expect(projectReadSummary([{ ...span, settled: 100 }], 50)).toBeNull();
});
test('invalid env fails early and even-repeat medians are correct', () => {
  for (const REPEATS of ['0', '-1', '1.5', 'oops']) expect(() => config({ REPEATS })).toThrow('positive integer');
  expect(() => config({ ROOT: 'soruce' })).toThrow('ROOT');
  expect(() => config({ CANDIDATE: 'yes' })).toThrow('CANDIDATE');
  expect(config({ CANDIDATE: '0' }).candidate).toBe(false);
  expect(config({ CANDIDATE: '1' }).candidate).toBe(true);
  expect(config({}).chrome).toBeUndefined();
  expect(median([20, 10])).toBe(15);
  expect(median([30, 10, 20])).toBe(20);
});
function observerFixture() {
  const frames = [], marks = []; let resolveFont;
  const box = { visible: true, width: 100, height: 100, top: 0, left: 0, bottom: 100, right: 100 };
  const ctx = { location: { pathname: '/stitch.html' }, innerHeight: 900, innerWidth: 1440,
    SymbolGlyphs: { ensureFont: () => new Promise(r => { resolveFont = r; }) },
    __tp: { fullPaints: [5] }, __flushProjectToIDB() {},
    performance: { setResourceTimingBufferSize() {}, mark: n => marks.push(n), now: () => 42 },
    requestAnimationFrame: fn => frames.push(fn),
    document: { addEventListener() {}, querySelector: () => ({ getBoundingClientRect: () => box, checkVisibility: () => box.visible }) } };
  ctx.window = ctx;
  vm.runInNewContext('(' + startupObserver.toString() + ')()', ctx);
  return { ctx, box, marks, resolveFont, frame() { const f = frames.splice(0); f.forEach(fn => fn()); } };
}
test('readiness waits for font and visible chart, then rechecks visibility on presentation frame', async () => {
  const f = observerFixture(); f.frame(); f.frame();
  expect(f.ctx.__startupUsable).toBeUndefined();
  f.resolveFont(true); await Promise.resolve();
  f.box.visible = false; f.frame(); f.frame();
  expect(f.ctx.__startupUsable).toBeUndefined();
  f.box.visible = true; f.frame(); f.box.width = 0; f.frame();
  expect(f.ctx.__startupUsable).toBeUndefined();
  f.box.width = 100; f.frame(); f.frame();
  expect(f.ctx.__startupUsable).toBe(42);
  expect(f.marks).toEqual(['stitch-startup:begin', 'stitch-startup:usable']);
});
test('symbol font failure reports an error, not a usable chart', async () => {
  const f = observerFixture(); f.resolveFont(false); await Promise.resolve(); f.frame();
  expect(f.ctx.__startupError).toBe('Symbol font failed to load');
  expect(f.ctx.__startupUsable).toBeUndefined();
});
function storage(values) {
  const obj = { ...values };
  Object.defineProperties(obj, { clear: { value() { Object.keys(obj).forEach(k => delete obj[k]); } }, setItem: { value(k, v) { obj[k] = v; } } });
  return obj;
}
test('warm seed removes previous sessions, journal databases and transient preferences', async () => {
  const idb = new IDBFactory();
  await new Promise((resolve, reject) => { const r = idb.open('CrossStitchDB'); r.onsuccess = () => { r.result.close(); resolve(); }; r.onerror = () => reject(r.error); });
  const ls = storage({ cs_welcome_tracker_done: '1', cs_stitchStyle: 'block', 'cs_pref_onboarding.coached.undo': 'true', crossstitch_active_project: 'wrong', checkpoint: 'old' });
  const ss = storage({ pending: 'old' });
  await vm.runInNewContext('(' + resetSeedStorage.toString() + ')()', { indexedDB: idb, localStorage: ls, sessionStorage: ss });
  expect(await idb.databases()).toEqual([]);
  expect({ ...ls }).toEqual({ cs_welcome_tracker_done: '1', cs_stitchStyle: 'block', 'cs_pref_onboarding.coached.undo': 'true' });
  expect({ ...ss }).toEqual({});
});
test.each(['launch', 'page', 'browser-close'])('runner closes resources after %s failure', async failure => {
  const server = new EventEmitter(); server.listening = false;
  server.listen = jest.fn((_p, _h, cb) => { server.listening = true; cb(); });
  server.address = () => ({ port: 12345 });
  server.close = jest.fn(cb => { server.listening = false; cb(); });
  const context = { newPage: jest.fn().mockRejectedValue(new Error('page failed')), close: jest.fn() };
  const browser = { newContext: jest.fn().mockResolvedValue(context), close: jest.fn() };
  if (failure === 'browser-close') browser.close.mockRejectedValue(new Error('close failed'));
  const browserType = { launch: jest.fn().mockImplementation(() => failure === 'launch' ? Promise.reject(new Error('launch failed')) : Promise.resolve(browser)) };
  const spy = jest.spyOn(http, 'createServer').mockReturnValue(server);
  try {
    await expect(run(config({ ROOT: 'source', REPEATS: '1' }), browserType)).rejects.toThrow('failed');
    expect(server.close).toHaveBeenCalledTimes(1);
    if (failure !== 'launch') { expect(context.close).toHaveBeenCalledTimes(1); expect(browser.close).toHaveBeenCalledTimes(1); }
  } finally { spy.mockRestore(); }
});

test('snapshot does not attribute async completions after readiness to startup', () => {
  const raw = { spans: [{ t: 10, settled: 20 }, { t: 10, settled: 60 }], tx: [{ t: 5, done: 80, ok: true }] };
  const bounded = boundedProbes(raw, 50);
  expect(bounded.spans.map(s => s.settled)).toEqual([20, null]);
  expect(bounded.tx[0]).toEqual({ t: 5, done: null, ok: null });
  expect(raw.spans[1].settled).toBe(60);
  expect(raw.tx[0].done).toBe(80);
});

test('build fingerprint hashes actual mirrored/candidate HTML bytes', () => {
  for (const candidate of [false, true]) {
    const expected = crypto.createHash('sha256').update(response('/stitch.html', '', candidate).bytes).digest('hex');
    expect(buildInfo({ deployed: source, candidate }).sha256['stitch.html']).toBe(expected);
  }
});
