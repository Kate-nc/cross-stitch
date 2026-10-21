/**
 * Convert preview fidelity (usePreview.js, useCreatorState.js).
 *
 * - `_canvasFilterSupported` must test for the `filter` property itself. A
 *   write-then-read check passes on a context that lacks it, because the
 *   assignment just makes an ordinary property, so Safari without ctx.filter
 *   never reached the pixel fallback and brightness/contrast/saturation did
 *   nothing.
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

describe('_canvasFilterSupported detection', () => {
  const m = /var _canvasFilterSupported = \(function\(\) \{[\s\S]*?\n\}\)\(\);/.exec(stateSrc);
  function detect(documentFake) {
    return new Function('document', m[0] + '\nreturn _canvasFilterSupported;')(documentFake);
  }
  const docWith = (ctx, throws) => ({
    createElement: () => ({ getContext: () => { if (throws) throw new Error('no canvas'); return ctx; } })
  });

  test('the detector is found in the source', () => { expect(m).not.toBeNull(); });

  test('a context without a filter property is not supported, even though writes to it stick', () => {
    // Plain object: assigning ctx.filter would read back, which fooled the old check.
    expect(detect(docWith({ drawImage() {} }))).toBe(false);
  });

  test('a context with a filter property is supported', () => {
    expect(detect(docWith({ filter: 'none' }))).toBe(true);
  });

  test('a missing or throwing context is not supported', () => {
    expect(detect(docWith(null))).toBe(false);
    expect(detect(docWith({}, true))).toBe(false);
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
    global.prescaleForGrid = (s) => s;
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
    ['PreviewUrl', 'PreviewStats', 'PreviewColors', 'PreviewMapped', 'PreviewDims', 'PreviewHeatmap', 'PreviewLoading']
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
    expect(setters.setPreviewStats).not.toHaveBeenCalled();
    cleanup();                              // the effect re-runs: settings changed
    jest.advanceTimersByTime(50);
    expect(setters.setPreviewStats).not.toHaveBeenCalled();
    expect(setters.setPreviewLoading).not.toHaveBeenCalledWith(false);
  });
});
