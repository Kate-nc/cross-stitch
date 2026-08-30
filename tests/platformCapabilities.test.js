/**
 * @jest-environment jsdom
 *
 * tests/platformCapabilities.test.js
 *
 * Covers the Platform capability module in helpers.js and the iPad sync
 * workflow that depends on it.
 *
 * The premise these guard: every browser on iOS/iPadOS is WebKit. Chrome,
 * Edge and Firefox there are Safari with a different badge, so any check that
 * keys on the browser *name* will classify an iPad as a desktop Chromium
 * machine and hand it capabilities it does not have. That is exactly the bug
 * the old eviction-risk detector had.
 */

const { loadSource } = require('./_helpers/loadSource');

const HELPERS = loadSource('helpers.js');

// Slice named regions out of helpers.js rather than eval-ing the whole file,
// which would also register its window 'load' listener and pull in React hooks.
function slice(startMarker, endMarker) {
  const start = HELPERS.indexOf(startMarker);
  const end = HELPERS.indexOf(endMarker);
  if (start === -1) throw new Error(`start marker not found: ${startMarker}`);
  if (end === -1 || end < start) throw new Error(`end marker not found: ${endMarker}`);
  return HELPERS.slice(start, end);
}

const PLATFORM_SRC = slice(
  'var Platform = (function () {',
  "if (typeof window !== 'undefined') window.Platform = Platform;"
);
const EVICTION_SRC = slice(
  '// Safari (non-standalone) evicts IDB/localStorage',
  '// Kick off the check shortly after page load'
);

function makePlatform() {
  // eslint-disable-next-line no-eval
  return eval(`${PLATFORM_SRC}; Platform;`);
}

function setNavigator(props) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(window.navigator, key, { value, configurable: true, writable: true });
  }
}

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadLegacy: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ requests desktop sites by default and reports a Macintosh UA.
  ipadDesktopUA: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  // Chrome on iPad — Blink nowhere in sight, this is WebKit.
  ipadChrome: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  ipadFirefox: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  ipadEdge: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/126.0 Mobile/15E148 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

describe('Platform.isIOS', () => {
  let Platform;
  beforeEach(() => { Platform = makePlatform(); });

  it.each([
    ['iPhone', UA.iphone, 0],
    ['iPad (mobile UA)', UA.ipadLegacy, 5],
    ['Chrome on iPad', UA.ipadChrome, 5],
    ['Firefox on iPad', UA.ipadFirefox, 5],
    ['Edge on iPad', UA.ipadEdge, 5],
  ])('detects %s', (_label, userAgent, maxTouchPoints) => {
    setNavigator({ userAgent, maxTouchPoints });
    expect(Platform.isIOS()).toBe(true);
  });

  it('detects an iPad that reports a desktop Macintosh UA, via maxTouchPoints', () => {
    setNavigator({ userAgent: UA.ipadDesktopUA, maxTouchPoints: 5 });
    expect(Platform.isIOS()).toBe(true);
  });

  it('does not mistake a real Mac for an iPad — a Mac reports maxTouchPoints 0', () => {
    setNavigator({ userAgent: UA.macSafari, maxTouchPoints: 0 });
    expect(Platform.isIOS()).toBe(false);
  });

  it.each([
    ['Windows Chrome', UA.winChrome],
    ['Windows Edge', UA.winEdge],
    ['Windows Firefox', UA.winFirefox],
    ['Mac Chrome', UA.macChrome],
  ])('is false on %s', (_label, userAgent) => {
    setNavigator({ userAgent, maxTouchPoints: 0 });
    expect(Platform.isIOS()).toBe(false);
  });

  it('does not throw when maxTouchPoints is absent', () => {
    setNavigator({ userAgent: UA.ipadDesktopUA, maxTouchPoints: undefined });
    expect(Platform.isIOS()).toBe(false);
  });
});

describe('Platform.isWebKit', () => {
  let Platform;
  beforeEach(() => { Platform = makePlatform(); });

  // The regression this module exists for: the previous UA test excluded
  // CriOS/FxiOS/EdgA, which silenced the storage-eviction warning on exactly
  // the iPad browsers that needed it.
  it.each([
    ['Chrome on iPad', UA.ipadChrome],
    ['Firefox on iPad', UA.ipadFirefox],
    ['Edge on iPad', UA.ipadEdge],
  ])('treats %s as WebKit despite the browser badge', (_label, userAgent) => {
    setNavigator({ userAgent, maxTouchPoints: 5 });
    expect(Platform.isWebKit()).toBe(true);
  });

  it('is true for desktop Safari', () => {
    setNavigator({ userAgent: UA.macSafari, maxTouchPoints: 0 });
    expect(Platform.isWebKit()).toBe(true);
  });

  it.each([
    ['Mac Chrome', UA.macChrome],
    ['Windows Chrome', UA.winChrome],
    ['Windows Edge', UA.winEdge],
    ['Windows Firefox', UA.winFirefox],
  ])('is false for %s', (_label, userAgent) => {
    setNavigator({ userAgent, maxTouchPoints: 0 });
    expect(Platform.isWebKit()).toBe(false);
  });
});

describe('Platform.fileAccept', () => {
  let Platform;
  beforeEach(() => { Platform = makePlatform(); });

  function onIPad() { setNavigator({ userAgent: UA.ipadLegacy, maxTouchPoints: 5 }); }
  function onDesktop() { setNavigator({ userAgent: UA.winChrome, maxTouchPoints: 0 }); }

  it('drops .csync on iOS — the UTI is unregistered, so the filter matches nothing', () => {
    onIPad();
    expect(Platform.fileAccept('.csync')).toBeUndefined();
  });

  it('drops a spec containing .oxs on iOS', () => {
    onIPad();
    expect(Platform.fileAccept('.oxs,.pdf')).toBeUndefined();
    expect(Platform.fileAccept('.json,.oxs,.pdf,.png')).toBeUndefined();
  });

  it('keeps specs made only of extensions iOS can resolve', () => {
    onIPad();
    expect(Platform.fileAccept('.json')).toBe('.json');
    expect(Platform.fileAccept('.pdf,.png')).toBe('.pdf,.png');
    expect(Platform.fileAccept('application/json,.json')).toBe('application/json,.json');
  });

  it('keeps MIME specs on iOS — image/* gives the photo-library picker', () => {
    onIPad();
    expect(Platform.fileAccept('image/*')).toBe('image/*');
    expect(Platform.fileAccept('image/jpeg,image/png')).toBe('image/jpeg,image/png');
  });

  it('is case-insensitive about extensions', () => {
    onIPad();
    expect(Platform.fileAccept('.JSON')).toBe('.JSON');
    expect(Platform.fileAccept('.CSYNC')).toBeUndefined();
  });

  it('tolerates whitespace between tokens', () => {
    onIPad();
    expect(Platform.fileAccept('.json, .pdf')).toBe('.json, .pdf');
    expect(Platform.fileAccept('.json, .csync')).toBeUndefined();
  });

  it('leaves every spec untouched off iOS', () => {
    onDesktop();
    expect(Platform.fileAccept('.csync')).toBe('.csync');
    expect(Platform.fileAccept('.oxs,.pdf')).toBe('.oxs,.pdf');
  });

  it('passes through empty and missing specs unchanged', () => {
    onIPad();
    expect(Platform.fileAccept('')).toBe('');
    expect(Platform.fileAccept(undefined)).toBeUndefined();
  });
});

describe('Platform.shareOrDownload', () => {
  let Platform;
  let clicked;

  beforeEach(() => {
    Platform = makePlatform();
    clicked = [];
    // jsdom has no object URL support and would navigate on anchor click.
    window.URL.createObjectURL = jest.fn(() => 'blob:stub');
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clicked.push(this.download);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.navigator.canShare;
    delete window.navigator.share;
  });

  const blob = () => new Blob(['payload']);

  it('uses the share sheet when the platform accepts files', async () => {
    const share = jest.fn(() => Promise.resolve());
    setNavigator({ canShare: jest.fn(() => true), share });

    const result = await Platform.shareOrDownload(blob(), 'sync.csync', 'application/octet-stream');

    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].files[0].name).toBe('sync.csync');
    expect(result).toEqual({ shared: true });
    expect(clicked).toEqual([]); // must not also download
  });

  it('falls back to a download when files cannot be shared', async () => {
    const share = jest.fn();
    setNavigator({ canShare: jest.fn(() => false), share });

    const result = await Platform.shareOrDownload(blob(), 'sync.csync');

    expect(share).not.toHaveBeenCalled();
    expect(clicked).toEqual(['sync.csync']);
    expect(result).toEqual({ shared: false });
  });

  it('downloads when the Share API is absent entirely (desktop)', async () => {
    setNavigator({ canShare: undefined, share: undefined });

    const result = await Platform.shareOrDownload(blob(), 'sync.csync');

    expect(clicked).toEqual(['sync.csync']);
    expect(result).toEqual({ shared: false });
  });

  // Dismissing the sheet is a deliberate "no". Downloading anyway would put a
  // file on the device the user just declined to send.
  it('reports a dismissed share sheet as cancelled and does not download', async () => {
    const abort = Object.assign(new Error('share cancelled'), { name: 'AbortError' });
    setNavigator({ canShare: jest.fn(() => true), share: jest.fn(() => Promise.reject(abort)) });

    const result = await Platform.shareOrDownload(blob(), 'sync.csync');

    expect(result).toEqual({ shared: false, cancelled: true });
    expect(clicked).toEqual([]);
  });

  it('returns activationExpired (no silent download) when the share is blocked by a lapsed user activation', async () => {
    const failure = Object.assign(new Error('nope'), { name: 'NotAllowedError' });
    setNavigator({ canShare: jest.fn(() => true), share: jest.fn(() => Promise.reject(failure)) });

    const result = await Platform.shareOrDownload(blob(), 'sync.csync');

    // Must NOT silently download — caller is responsible for offering a fresh
    // share gesture (e.g. a Toast action) so the user isn't confused.
    expect(result).toEqual({ shared: false, activationExpired: true });
    expect(clicked).toEqual([]);
  });

  it('defers revoking the object URL so the download has time to start', async () => {
    setNavigator({ canShare: undefined, share: undefined });
    await Platform.shareOrDownload(blob(), 'sync.csync');
    // Revoking synchronously aborts the download in Safari.
    expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});

describe('checkSafariEvictionRisk', () => {
  async function run({ userAgent, maxTouchPoints = 0, standalone = false, persisted = false }) {
    const Platform = makePlatform();
    setNavigator({ userAgent, maxTouchPoints, standalone });
    Object.defineProperty(window.navigator, 'storage', {
      value: { persisted: () => Promise.resolve(persisted) },
      configurable: true,
    });
    window.sessionStorage.clear();

    const shown = [];
    window.Toast = { show: (opts) => shown.push(opts) };

    // eslint-disable-next-line no-eval
    const check = eval(`${EVICTION_SRC}; checkSafariEvictionRisk;`);
    check();

    // The warning path is navigator.storage.persisted() -> _showEvictionWarning
    // -> setTimeout(3000). Flush the microtask queue so the timer is actually
    // scheduled, then run it. Microtasks are not affected by fake timers.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    jest.advanceTimersByTime(5000);
    return shown;
  }

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); delete window.Toast; });

  // The bug: Chrome on iPad is WebKit and evicts storage after ~7 days, but
  // the old /CriOS/ exclusion meant it was the one browser never warned.
  it.each([
    ['Chrome on iPad', UA.ipadChrome],
    ['Firefox on iPad', UA.ipadFirefox],
    ['Edge on iPad', UA.ipadEdge],
    ['Safari on iPad', UA.ipadLegacy],
  ])('warns on %s', async (_label, userAgent) => {
    const shown = await run({ userAgent, maxTouchPoints: 5 });
    expect(shown).toHaveLength(1);
    expect(shown[0].type).toBe('warning');
    // On iOS the message must name the fix the user can actually apply.
    expect(shown[0].message).toMatch(/Add to Home Screen/i);
  });

  it('stays silent when the app is installed to the Home Screen', async () => {
    const shown = await run({ userAgent: UA.ipadChrome, maxTouchPoints: 5, standalone: true });
    expect(shown).toEqual([]);
  });

  it('stays silent when durable storage has already been granted', async () => {
    const shown = await run({ userAgent: UA.ipadChrome, maxTouchPoints: 5, persisted: true });
    expect(shown).toEqual([]);
  });

  it.each([
    ['Windows Chrome', UA.winChrome],
    ['Windows Firefox', UA.winFirefox],
  ])('stays silent on %s, which does not evict', async (_label, userAgent) => {
    const shown = await run({ userAgent });
    expect(shown).toEqual([]);
  });

  it('warns on desktop Safari without the iOS-only install advice', async () => {
    const shown = await run({ userAgent: UA.macSafari });
    expect(shown).toHaveLength(1);
    expect(shown[0].message).not.toMatch(/Add to Home Screen/i);
  });
});

describe('call sites route through Platform', () => {
  it('the .csync import picker sanitises its accept filter', () => {
    const src = loadSource('modals.js');
    expect(src).toMatch(/window\.Platform\.fileAccept\('\.csync'\)/);
    // A bare accept:'.csync' would grey out every file in the iOS picker.
    expect(src).not.toMatch(/accept:\s*'\.csync'\s*,/);
  });

  // Every live pattern-import picker. ".oxs" resolves to no UTI on iOS,
  // so an unsanitised filter greys out the whole Files picker.
  // (home-screen.js also has such inputs, but its HomeScreen component is not
  // mounted by any page — /home.html renders home-app.js instead.)
  it.each([
    ['home-app.js', /fileAccept\('image\/\*,\.oxs,\.xml,\.json,\.pdf'\)/],
    ['creator-main.js', /fileAccept\("image\/\*,\.oxs,\.xml,\.json,\.pdf"\)/],
    ['tracker-app.js', /fileAccept\("\.json,\.oxs,\.xml,\.png/],
  ])('%s sanitises its pattern-open accept filter', (file, pattern) => {
    expect(loadSource(file)).toMatch(pattern);
  });

  it('the compiled bundles carry the sanitised filters too', () => {
    // The JSX sources above are precompiled; a stale bundle would ship the bug.
    expect(loadSource('compiled/tracker-app.compiled.js')).toMatch(/fileAccept\(/);
    expect(loadSource('compiled/creator-main.compiled.js')).toMatch(/fileAccept\(/);
  });

  it('downloadSync offers the share sheet rather than always downloading', () => {
    const src = loadSource('sync-engine.js');
    expect(src).toMatch(/window\.Platform\.shareOrDownload\(/);
  });

  it('a cancelled share does not advance the last-export timestamp', () => {
    const src = loadSource('sync-engine.js');
    // Claiming the device is up to date when nothing was sent is worse than
    // no status at all — it hides the fact that the other device is stale.
    expect(src).toMatch(/if \(!cancelled\) _markExportComplete/);
  });

  it('every entry page ships a PNG apple-touch-icon', () => {
    for (const page of ['home.html', 'index.html', 'create.html', 'stitch.html', 'manager.html']) {
      // iOS ignores SVG here; without a PNG a Home Screen install shows a
      // page screenshot, and installing is how an iPad keeps its library.
      expect(loadSource(page)).toMatch(
        /<link rel="apple-touch-icon" href="\.\/assets\/icons\/app-icon-180\.png">/
      );
    }
  });
});
