// Validate the measurement transport and attribution without claiming to run a browser.
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const path = require('path');
// Pure helper tests run against the checkout and need no generated dist/.
process.env.ROOT = 'source';
const { serve, traceSummary } = require('./perf/stitch-startup.cjs');
delete process.env.ROOT;
function response(url, gzip = false) {
  const headers = {};
  let bytes, status = 200;
  serve({ url, headers: { 'accept-encoding': gzip ? 'gzip' : '' } }, {
    setHeader(k, v) { headers[k] = v; }, writeHead(s) { status = s; }, end(b) { bytes = b; }
  });
  return { status, headers, bytes };
}
test.each(['react.production.min.js', 'react-dom.production.min.js', 'pako.min.js'])('CDN mirror preserves pinned SRI after HTTP decompression: %s', name => {
  const r = response('/__cdn/' + name, true);
  const raw = zlib.gunzipSync(r.bytes);
  const integrity = 'sha384-' + crypto.createHash('sha384').update(raw).digest('base64');
  expect(fs.readFileSync(path.join(__dirname, '../stitch.html'), 'utf8')).toContain(integrity);
  expect(r.headers['Cache-Control']).toBe('max-age=3600');
  expect(r.headers['Content-Length']).toBe(r.bytes.length);
});
test('normal app scripts are byte-identical; mirror permits an actual warm HTTP cache', () => {
  const r = response('/compiled/tracker-app.compiled.js', true);
  expect(zlib.gunzipSync(r.bytes)).toEqual(fs.readFileSync(path.join(__dirname, '../compiled/tracker-app.compiled.js')));
  expect(r.headers['Cache-Control']).toBe('max-age=3600');
});
test('candidate adds only a preload; it preserves every existing script and its ordering', () => {
  const baseline = response('/stitch.html').bytes.toString();
  process.env.CANDIDATE = '1';
  try {
    const candidate = response('/stitch.html').bytes.toString();
    const link = '<link rel="preload" as="script" href="compiled/tracker-app.compiled.js">';
    expect(candidate.replace(link, '')).toBe(baseline);
    expect(candidate.indexOf(link)).toBeLessThan(candidate.indexOf('recovery-storage.js'));
  } finally { delete process.env.CANDIDATE; }
});
test('compile is reported as a subset of evaluation, rendering excludes worker threads', () => {
  const e = (name, dur, tid = 1, url = '') => ({ name, dur, tid, ph: 'X', args: { data: { url } } });
  const r = traceSummary([e('EvaluateScript', 10000, 1, 'compiled/tracker-app.compiled.js'),
    e('EvaluateScript', 30000, 2, 'analysis-worker.js'), e('v8.compile', 3000), e('v8.compile', 9000, 2), e('Layout', 4000), e('Paint', 1000), e('Paint', 50000, 2)]);
  expect(r.evaluateInclusiveMs).toBe(10);
  expect(r.mainThreadCompileMs).toBe(3);
  expect(r.renderingMs).toBe(5);
});

test('missing tracker trace is unavailable attribution, not zero work', () => {
  expect(() => traceSummary([])).toThrow('Tracker evaluation missing');
});
