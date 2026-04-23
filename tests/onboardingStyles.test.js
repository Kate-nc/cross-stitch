const fs = require('fs');
const path = require('path');

// onboarding.js is an IIFE that touches React, ReactDOM, localStorage, document
// and window. We stub the minimum shape it needs and then eval the file in a
// fresh context so we can exercise the per-style sample builders + the
// projectStats helper used by the tour completion checks.
function loadOnboarding() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'onboarding.js'), 'utf8');
  const fakeStorage = (() => {
    const m = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
  })();
  const sandbox = {
    React: { createElement: () => null, useState: v => [typeof v === 'function' ? v() : v, () => {}], useEffect: () => {}, useRef: v => ({ current: v }) },
    ReactDOM: { createRoot: () => ({ render: () => {} }) },
    localStorage: fakeStorage,
    location: { pathname: '/index.html' },
    document: { readyState: 'complete', addEventListener: () => {}, getElementById: () => null, createElement: () => ({ id: '' }), body: { appendChild: () => {} } },
    setTimeout: () => 0,
    clearInterval: () => {},
    setInterval: () => 0,
    console: console
  };
  sandbox.window = sandbox;
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'window', 'React', 'ReactDOM', 'localStorage', 'location', 'document',
    'setTimeout', 'clearInterval', 'setInterval', 'console',
    code + '\nreturn window.OnboardingTour;'
  );
  return fn(
    sandbox.window, sandbox.React, sandbox.ReactDOM, sandbox.localStorage,
    sandbox.location, sandbox.document, sandbox.setTimeout, sandbox.clearInterval,
    sandbox.setInterval, sandbox.console
  );
}

describe('OnboardingTour STYLE_DEFS', () => {
  const O = loadOnboarding();

  it('exposes all four style keys', () => {
    expect(O.STYLE_KEYS).toEqual(['cross_country', 'block', 'parking', 'freestyle']);
    O.STYLE_KEYS.forEach(k => expect(O.STYLE_DEFS[k]).toBeTruthy());
  });

  it('each style builds a v11 project with non-zero stitch count', () => {
    O.STYLE_KEYS.forEach(k => {
      const proj = O._buildSampleFor(k);
      expect(proj).toBeTruthy();
      expect(proj.version).toBe(11);
      expect(proj.id).toBe(O.STYLE_DEFS[k].sampleId);
      expect(proj.w * proj.h).toBe(proj.pattern.length);
      const stitched = proj.pattern.filter(c => c && c.id !== '__skip__' && c.id !== '__empty__');
      expect(stitched.length).toBeGreaterThan(0);
    });
  });

  it('cross_country sample contains at least two distinct DMC ids (so finishing one is meaningful)', () => {
    const proj = O._buildSampleFor('cross_country');
    const ids = new Set(proj.pattern.filter(c => c && c.id !== '__skip__').map(c => c.id));
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });

  it('block + parking samples are 20×20 with focusBlock pre-set to TL', () => {
    ['block', 'parking'].forEach(k => {
      const proj = O._buildSampleFor(k);
      expect(proj.w).toBe(20);
      expect(proj.h).toBe(20);
      expect(proj.focusBlock).toEqual({ bx: 0, by: 0 });
    });
  });

  it('parking sample has stitches in every 10×10 quadrant (so parking pays off)', () => {
    const p = O._buildSampleFor('parking');
    const inQuad = (qx, qy) => p.pattern.some((c, i) => {
      if (!c || c.id === '__skip__') return false;
      const x = i % p.w, y = Math.floor(i / p.w);
      return Math.floor(x / 10) === qx && Math.floor(y / 10) === qy;
    });
    expect(inQuad(0,0)).toBe(true);
    expect(inQuad(1,0)).toBe(true);
    expect(inQuad(0,1)).toBe(true);
    expect(inQuad(1,1)).toBe(true);
  });

  it('block sample has stitches in every quadrant (one colour per quadrant)', () => {
    const p = O._buildSampleFor('block');
    const colourInQuad = (qx, qy) => {
      const ids = new Set();
      p.pattern.forEach((c, i) => {
        if (!c || c.id === '__skip__') return;
        const x = i % p.w, y = Math.floor(i / p.w);
        if (Math.floor(x / 10) === qx && Math.floor(y / 10) === qy) ids.add(c.id);
      });
      return ids;
    };
    expect(colourInQuad(0,0).size).toBeGreaterThan(0);
    expect(colourInQuad(1,0).size).toBeGreaterThan(0);
    expect(colourInQuad(0,1).size).toBeGreaterThan(0);
    expect(colourInQuad(1,1).size).toBeGreaterThan(0);
  });
});

describe('OnboardingTour _projectStats', () => {
  const O = loadOnboarding();

  it('counts per-colour totals/done correctly', () => {
    const p = O._buildSampleFor('cross_country');
    // Mark every red as done.
    const done = new Array(p.pattern.length).fill(0);
    p.pattern.forEach((c, i) => { if (c && c.id === '321') done[i] = 1; });
    p.done = done;
    const s = O._projectStats(p);
    expect(s.perColour['321'].done).toBe(s.perColour['321'].total);
    expect(s.perColour['798'].done).toBe(0);
  });

  it('detects first-block completion for the block sample', () => {
    const p = O._buildSampleFor('block');
    const done = new Array(p.pattern.length).fill(0);
    p.pattern.forEach((c, i) => {
      if (!c || c.id === '__skip__') return;
      const x = i % p.w, y = Math.floor(i / p.w);
      if (x < 10 && y < 10) done[i] = 1;
    });
    p.done = done;
    const s = O._projectStats(p);
    expect(s.firstBlockTotal).toBeGreaterThan(0);
    expect(s.firstBlockDone).toBe(s.firstBlockTotal);
  });

  it('reports parkMarkers length', () => {
    const p = O._buildSampleFor('parking');
    p.parkMarkers = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
    expect(O._projectStats(p).parkMarkers).toBe(2);
  });
});
