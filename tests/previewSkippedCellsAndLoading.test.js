/**
 * Convert preview fidelity (usePreview.js, useCreatorState.js).
 *
 * - Brightness / contrast / saturation (`_applyImageFilters`) follow the CSS
 *   filter formulas, clamping after each step. gridPixels applies them on every
 *   browser, so there is no ctx.filter detection or fallback any more.
 * - usePreview must never leave the spinner running, must not let a queued
 *   full pass land after the settings changed, and must publish the preview
 *   size with the fast-pass picture.
 *
 * Same extract-and-eval approach as previewReactivity.test.js: the sources
 * are plain browser scripts, so they are run against small fakes.
 */
const fs = require('fs');
const path = require('path');

const usePrevSrc = fs.readFileSync(path.join(__dirname, '..', 'creator', 'usePreview.js'), 'utf8');
const stateSrc = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');

describe('_applyImageFilters (the CSS filter formulas)', () => {
  const src = /function _applyImageFilters\(imageData, bri, con, sat\) \{[\s\S]*?\n\}/.exec(stateSrc)[0];
  const apply = (rgb, bri, con, sat) => {
    const id = { data: new Uint8ClampedArray([...rgb, 255]) };
    new Function(src + '\nreturn _applyImageFilters;')()(id, bri, con, sat);
    return Array.from(id.data.slice(0, 3));
  };

  test('no adjustment changes nothing', () => { expect(apply([12, 130, 250], 0, 0, 0)).toEqual([12, 130, 250]); });
  test('brightness multiplies', () => { expect(apply([100, 50, 10], 20, 0, 0)).toEqual([120, 60, 12]); });
  test('contrast pivots on mid-grey', () => { expect(apply([127, 128, 255], 0, 50, 0)).toEqual([127, 128, 255]); expect(apply([100, 100, 100], 0, 50, 0)).toEqual([86, 86, 86]); });
  test('saturation 0 is the Rec. 709 grey', () => { expect(apply([255, 0, 0], 0, 0, -100)).toEqual([54, 54, 54]); });
  test('each step clamps, as CSS does: a brightened white stays white under contrast', () => {
    // 250 x 1.5 clips to 255 before contrast; clamping only at the end would give 255 too,
    // but a darkening contrast after it must start from 255, not 375.
    expect(apply([250, 250, 250], 50, -50, 0)).toEqual([191, 191, 191]);
  });
});

describe('usePreview scheduling', () => {
  let effects, setters, state, canvasLog;

  function load() {
    effects = [];
    global.window = global;
    global.React = {
      useRef: (v) => ({ current: v }),
      useCallback: (fn) => fn,
      useEffect: (fn) => { effects.push(fn); }
    };
    canvasLog = [];
    global.document = {
      createElement: () => {
        const c = {
          width: 0, height: 0,
          getContext: () => ({
            drawImage() {}, putImageData() {},
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
          }),
          toDataURL: () => 'data:image/png;base64,' + canvasLog.push(1)
        };
        return c;
      }
    };
    global.gridPixels = (s, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    delete global.Worker;   // the page path unless a test supplies a worker
    global.applyPreSharpenCanvas = (s) => s;
    global.skeinEst = () => 1;
    global.isColorOwned = () => true;
    global.runExactPixelPipeline = () => { throw new Error('unused'); };
    global.runCleanupPipeline = jest.fn((raw, w, h) => {
      const mapped = [];
      for (let i = 0; i < w * h; i++) mapped.push({ id: '310', rgb: [0, 0, 0] });
      return { mapped, confettiRaw: { pct: 0, singles: 0, singlesPct: 0 }, confettiClean: null, preCleanupIds: null };
    });
    delete require.cache[require.resolve('../creator/usePreview.js')];
    require('../creator/usePreview.js');

    setters = {};
    ['PreviewUrl', 'PreviewStats', 'PreviewColors', 'PreviewMapped', 'PreviewDims', 'PreviewHeatmap', 'PreviewHighlight', 'PreviewLoading', 'PreviewError']
      .forEach((n) => { setters['set' + n] = jest.fn(); });
    state = Object.assign({
      img: { src: 'data:x', width: 10, height: 10 },
      conversionSettings: { sW: 10, sH: 10, bri: 0, con: 0, sat: 0, smooth: 0, smoothType: 'median', fabricCt: 14, dith: true, maxC: 5 },
      showCleanupDiff: false, globalStash: null, previewTimerRef: { current: null }
    }, setters);
  }

  beforeEach(() => { jest.useFakeTimers(); load(); });
  afterEach(() => { jest.useRealTimers(); });

  // usePreview registers: [0] unmount cleanup, [1] the scheduling effect.
  function schedule() {
    global.window.usePreview(state);
    return effects[1]();
  }

  test('with no usable picture the spinner is cleared, not left running', () => {
    state.img = { src: '' };
    schedule();
    jest.advanceTimersByTime(400);
    expect(setters.setPreviewLoading).toHaveBeenLastCalledWith(false);
    expect(global.runCleanupPipeline).not.toHaveBeenCalled();
  });

  test('with no settings the spinner is cleared', () => {
    state.conversionSettings = null;
    schedule();
    jest.advanceTimersByTime(400);
    expect(setters.setPreviewLoading).toHaveBeenLastCalledWith(false);
  });

  test('a normal pass ends with the spinner off and a full-pass picture', () => {
    schedule();
    jest.advanceTimersByTime(400);
    expect(setters.setPreviewLoading).toHaveBeenLastCalledWith(true); // fast frame shown, full pass pending
    jest.advanceTimersByTime(1);
    expect(setters.setPreviewLoading).toHaveBeenLastCalledWith(false);
    expect(setters.setPreviewStats).toHaveBeenCalled();
  });

  test('the fast pass publishes the preview size along with its picture', () => {
    schedule();
    jest.advanceTimersByTime(400);
    expect(setters.setPreviewUrl).toHaveBeenCalledTimes(1);
    expect(setters.setPreviewDims).toHaveBeenCalledWith({ pw: 10, ph: 10 });
    expect(setters.setPreviewDims.mock.invocationCallOrder[0])
      .toBeLessThan(setters.setPreviewUrl.mock.invocationCallOrder[0]);
  });

  test('settings changing before the queued full pass runs cancels that pass', () => {
    const cleanup = schedule();
    jest.advanceTimersByTime(400);          // fast pass done, full pass queued at 0 ms
    expect(setters.setPreviewStats).toHaveBeenLastCalledWith(null);
    cleanup();                              // the effect re-runs: settings changed
    jest.advanceTimersByTime(50);
    expect(setters.setPreviewStats.mock.calls.every(([stats]) => stats === null)).toBe(true);
    expect(setters.setPreviewLoading).not.toHaveBeenCalledWith(false);
  });

  // ── The preview worker ──────────────────────────────────────────────────
  // With workers the conversion runs in generate-worker.js at the chart's own
  // size, so the page never freezes and the preview is the chart Generate makes.
  function fakeWorkers() {
    const made = [];
    global.Worker = function (src) { this.src = src; this.posted = []; this.terminated = false; made.push(this); };
    global.Worker.prototype.postMessage = function (msg) { this.posted.push(msg); };
    global.Worker.prototype.terminate = function () { this.terminated = true; };
    return made;
  }
  function answer(w, msg, n) {
    const mapped = [];
    for (let i = 0; i < n; i++) mapped.push({ id: '310', rgb: [0, 0, 0] });
    w.onmessage({ data: { type: 'result', reqId: msg.reqId, mapped, confettiData: { raw: { pct: 1, singles: 2, singlesPct: 1 }, clean: { pct: 1, singles: 2, singlesPct: 1 } }, preCleanupIds: null } });
  }

  test('with a worker, a large chart is converted there at its own size, not on the page', () => {
    const made = fakeWorkers();
    state.conversionSettings = Object.assign({}, state.conversionSettings, { sW: 400, sH: 300 });
    schedule();
    jest.advanceTimersByTime(400);
    expect(made).toHaveLength(1);
    expect(made[0].src).toBe('generate-worker.js');
    const msg = made[0].posted[0];
    expect([msg.type, msg.width, msg.height]).toEqual(['generate', 400, 300]);
    expect(global.runCleanupPipeline).not.toHaveBeenCalled();
    expect(setters.setPreviewLoading).toHaveBeenLastCalledWith(true);
    answer(made[0], msg, 400 * 300);
    expect(setters.setPreviewDims).toHaveBeenLastCalledWith({ pw: 400, ph: 300 });
    // Counts are the chart's own, not scaled up from a smaller preview.
    expect(setters.setPreviewStats.mock.calls.at(-1)[0]).toMatchObject({ stitchable: 120000, confettiCleanSingles: null });
    expect(setters.setPreviewLoading).toHaveBeenLastCalledWith(false);
  });

  test('a result for older settings is ignored, and a busy worker is replaced', () => {
    const made = fakeWorkers();
    const preview = global.window.usePreview(state);
    effects[1]();
    jest.advanceTimersByTime(400);
    const first = made[0].posted[0];
    preview.generatePreview();               // settings changed while the first job ran
    expect(made[0].terminated).toBe(true);
    expect(made).toHaveLength(2);
    const urls = setters.setPreviewUrl.mock.calls.length;
    if (made[0].onmessage) answer(made[0], first, 100);
    expect(setters.setPreviewUrl.mock.calls.length).toBe(urls);
    answer(made[1], made[1].posted[0], 100);
    expect(setters.setPreviewUrl.mock.calls.length).toBe(urls + 1);
  });

  test('settings changing during the debounce stop a running job', () => {
    const made = fakeWorkers();
    const cleanup = schedule();
    jest.advanceTimersByTime(400);
    cleanup();
    expect(made[0].terminated).toBe(true);
  });

  test('a worker that fails twice hands the preview back to the page', () => {
    const made = fakeWorkers();
    const preview = global.window.usePreview(state);
    effects[1]();
    jest.advanceTimersByTime(400);
    made[0].onerror({ preventDefault() {} });
    expect(setters.setPreviewError).toHaveBeenLastCalledWith(expect.any(String));
    preview.generatePreview();
    made[1].onerror({ preventDefault() {} });
    preview.generatePreview();
    jest.runAllTimers();
    expect(made).toHaveLength(2);
    expect(global.runCleanupPipeline).toHaveBeenCalled();
    expect(setters.setPreviewError).toHaveBeenLastCalledWith(null);
  });

  function expectCleared() {
    for (const field of ['Url', 'Stats', 'Colors', 'Mapped', 'Dims', 'Heatmap', 'Highlight']) {
      expect(setters['setPreview' + field]).toHaveBeenLastCalledWith(null);
    }
    expect(setters.setPreviewLoading).toHaveBeenLastCalledWith(false);
  }

  test.each(['preparation', 'fast pass', 'full pass', 'encoding'])('%s errors clear all stale results and allow retry', stage => {
    const pipeline = global.runCleanupPipeline.getMockImplementation();
    if (stage === 'preparation') global.gridPixels = () => { throw new Error('decode failed'); };
    if (stage === 'fast pass') global.runCleanupPipeline.mockImplementationOnce(() => { throw new Error('conversion failed'); });
    if (stage === 'full pass') global.runCleanupPipeline.mockImplementationOnce(pipeline).mockImplementationOnce(() => { throw new Error('conversion failed'); });
    if (stage === 'encoding') {
      const makeCanvas = global.document.createElement;
      global.document.createElement = () => { const c = makeCanvas(); c.toDataURL = () => { throw new Error('encoding failed'); }; return c; };
    }
    const preview = global.window.usePreview(state);
    effects[1]();
    expect(() => jest.runAllTimers()).not.toThrow();
    expectCleared();
    expect(setters.setPreviewError).toHaveBeenLastCalledWith(expect.any(String));
    if (stage !== 'encoding') {
      global.gridPixels = (s, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      preview.generatePreview();
      jest.runAllTimers();
      expect(setters.setPreviewError).toHaveBeenLastCalledWith(null);
      expect(setters.setPreviewUrl.mock.calls.at(-1)[0]).toMatch(/^data:/);
    }
  });

  test('removing the source clears stale results and loading without another timer', () => {
    state.img = null;
    schedule();
    expectCleared();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a pipeline returning no result is a recoverable error, not a completed quick preview', () => {
    global.runCleanupPipeline.mockReturnValue(null);
    schedule();
    jest.runAllTimers();
    expectCleared();
    expect(setters.setPreviewError).toHaveBeenLastCalledWith(expect.any(String));
  });

  test('a quick frame never retains the previous frame\'s stats or overlays', () => {
    schedule();
    jest.advanceTimersByTime(400);
    for (const field of ['Stats', 'Colors', 'Mapped', 'Heatmap', 'Highlight']) {
      expect(setters['setPreview' + field]).toHaveBeenLastCalledWith(null);
    }
  });
});
