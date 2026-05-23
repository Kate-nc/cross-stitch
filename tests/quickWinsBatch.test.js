// Structural assertions for the quick-wins batch (C-8, C-9, CL-3, T-5, INT-6, INT-5).
// Source-shape tests pin invariants that would otherwise need a full React
// renderer to verify behaviourally. See the existing
// workerLifecycleStructure.test.js / generateConfirmGuard.test.js for the
// established pattern.

const fs = require('fs');
const path = require('path');

const useCreatorState = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');
const useCleanupMode = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'useCleanupMode.js'), 'utf8');
const tracker = fs.readFileSync(
  path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const homeApp = fs.readFileSync(
  path.join(__dirname, '..', 'home-app.js'), 'utf8');
const creatorMain = fs.readFileSync(
  path.join(__dirname, '..', 'creator-main.js'), 'utf8');
const useProjectIO = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'useProjectIO.js'), 'utf8');
const stashBridge = fs.readFileSync(
  path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');

describe('C-8: stale worker terminated before new generation', () => {
  test('generate() terminates workerRef before bumping reqId', () => {
    // The C-8 guard must appear between setBusy(true) and the reqId bump.
    const m = useCreatorState.match(
      /setBusy\(true\)[\s\S]{0,800}?var reqId = \+\+genReqIdRef\.current/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/C-8/);
    expect(m[0]).toMatch(/workerRef\.current\.terminate\(\)/);
    expect(m[0]).toMatch(/workerRef\.current = null/);
    expect(m[0]).toMatch(/!== 'unavailable'/);
  });
});

describe('C-9: regenerate clears back-stitches', () => {
  test('applyResultRef clears bsLines and bsStart alongside parkMarkers', () => {
    const m = useCreatorState.match(
      /setParkMarkers\(\[\]\); setTab\("pattern"\); setThreadOwned\(\{\}\);[\s\S]{0,400}?setBsLines\(\[\]\); setBsStart\(null\);/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/C-9/);
  });
});

describe('CL-3: brush mask updates throttled with rAF', () => {
  test('useCleanupMode declares brushRafPendingRef', () => {
    expect(useCleanupMode).toMatch(/brushRafPendingRef\s*=\s*useRef\(false\)/);
    expect(useCleanupMode).toMatch(/CL-3/);
  });
  test('_brushPaint coalesces setCleanupPendingMask through requestAnimationFrame', () => {
    // The rAF guard block must use the pending flag + schedule a slice once per frame.
    const m = useCleanupMode.match(
      /if \(!brushRafPendingRef\.current\)[\s\S]{0,500}?state\.setCleanupPendingMask\(brushMaskRef\.current\.slice\(\)\)/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/requestAnimationFrame/);
    expect(m[0]).toMatch(/brushRafPendingRef\.current = true/);
    expect(m[0]).toMatch(/brushRafPendingRef\.current = false/);
  });
  test('legacy per-move setCleanupPendingMask call is removed', () => {
    // The previous unconditional `state.setCleanupPendingMask(mask.slice());`
    // line must not survive. We allow `brushMaskRef.current.slice()` (new path)
    // but not the bare `mask.slice()` form.
    expect(useCleanupMode).not.toMatch(/\n\s*state\.setCleanupPendingMask\(mask\.slice\(\)\);/);
  });
});

describe('T-5: tracker counter invariant documented', () => {
  test('header comment above doneCountRef explains recompute vs delta rules', () => {
    const m = tracker.match(
      /T-5 invariant[\s\S]{0,1200}?const doneCountRef=useRef\(0\)/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/recomputeAllCounts/);
    expect(m[0]).toMatch(/applyDoneCountsDelta/);
    expect(m[0]).toMatch(/doneCountRef/);
    expect(m[0]).toMatch(/colourDoneCountsRef/);
  });
});

describe('INT-6: pending-image handoff carries a TTL', () => {
  test('home-app writes cs_pending_image_ts alongside the dataURL', () => {
    expect(homeApp).toMatch(/cs_pending_image_ts/);
    expect(homeApp).toMatch(/INT-6/);
    expect(homeApp).toMatch(
      /sessionStorage\.setItem\('cs_pending_image_ts',\s*String\(Date\.now\(\)\)\)/);
  });
  test('creator-main enforces a 30-minute TTL on the handoff', () => {
    expect(creatorMain).toMatch(/PENDING_IMAGE_TTL_MS\s*=\s*30 \* 60 \* 1000/);
    // When stale, clears all four keys and nulls pendingDataUrl.
    const m = creatorMain.match(
      /PENDING_IMAGE_TTL_MS[\s\S]{0,800}?pendingDataUrl = null/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/removeItem\('cs_pending_image_dataurl'\)/);
    expect(m[0]).toMatch(/removeItem\('cs_pending_image_name'\)/);
    expect(m[0]).toMatch(/removeItem\('cs_pending_image_type'\)/);
    expect(m[0]).toMatch(/removeItem\('cs_pending_image_ts'\)/);
  });
  test('useProjectIO clears the ts key after consuming the handoff', () => {
    expect(useProjectIO).toMatch(/removeItem\('cs_pending_image_ts'\)/);
  });
});

describe('INT-5: stash-bridge lifetime invariant documented', () => {
  test('stash-bridge.js header explains the singleton + per-call connection model', () => {
    expect(stashBridge).toMatch(/INT-5 lifetime invariant/);
    expect(stashBridge).toMatch(/module-level singleton/);
    expect(stashBridge).toMatch(/INT-7/);
  });
});
