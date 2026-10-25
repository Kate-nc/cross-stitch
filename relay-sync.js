// relay-sync.js: automatic sync through the stitchx sync relay (api/relay.js).
//
// Devices that pair share a "sync space" on the relay. Each device uploads its
// own .csync file there and downloads the others'. Files are encrypted on the
// device with a random key that only paired devices hold: the relay stores
// bytes it cannot read. The relay checks an access token derived from the key,
// so knowing a space's ID is not enough to read or overwrite it.
//
// Pairing hands the space ID and key to another device through a short code
// (XXXX-XXXX-XXXX, shown as text and as a QR code). The code never reaches the
// relay: it unlocks a pairing bundle the relay keeps for 10 minutes, encrypted
// under a key derived from the code. QR codes are scanned inside the app, so on
// iPad the pairing lands in the copy of stitchx the stitcher actually uses.
//
// Sync runs while a page is visible and online: it checks for other devices'
// changes about every 90 seconds and when the page comes back into view. It
// uploads 30 seconds after a local change, then at most every 5 minutes while
// changes keep coming, and once more when the page is hidden or closed, which
// is when someone puts this device down to pick up another. Every upload is
// the whole library, so this cadence is what keeps the relay's free storage
// plan (500,000 commands and 10 GB of transfer a month) serving many people.
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var ENDPOINT = 'api/relay';
  var LS_STATE = 'cs_relay_v1';        // { space, key, pairedAt }
  // { space, sentRev, seen: {device: etag}, lastUploadAt, lastDownloadAt,
  //   hadPartner, ownEtag, pendingEtag }
  // hadPartner: this device knows another device shares the space (it joined
  // one, or has seen another device's file). Until then it does not upload:
  // a code shown but never used should not put a library on the relay.
  // ownEtag: the version of this device's file it last wrote. pendingEtag: the
  // version of an upload whose answer has not arrived yet. Anything else in
  // this device's slot was written by another browser using the same device
  // identity (a copied browser profile), which must not be overwritten blindly.
  var LS_PROGRESS = 'cs_relay_progress_v1';
  var POLL_MS = 90000, CHANGE_DELAY_MS = 30000, UPLOAD_COOLDOWN_MS = 5 * 60000, CYCLE_TIMEOUT_MS = 45000;
  var MAX_FILE = 4 * 1024 * 1024;
  var PAIR_TTL_MS = 10 * 60 * 1000;
  var CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
  var QR_PREFIX = 'STITCHX-PAIR:';
  var PBKDF2_ITERATIONS = 310000;

  // ── Small helpers ────────────────────────────────────────────────────────
  var enc = new TextEncoder();
  function b64url(bytes) {
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(str) {
    var s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(str).length + 3) % 4));
    var out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out;
  }
  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function fromB64(str) { var s = atob(str), out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  function hex(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); return s; }
  function random(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function concat(a, b) { var out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; }
  async function sha256(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); }
  function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  function writeJSON(key, value) { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function err(code, extra) { var e = new Error(code); e.code = code; if (extra) Object.assign(e, extra); return e; }

  // ── Pairing codes ────────────────────────────────────────────────────────
  // 12 characters of Crockford base32: 60 random bits.
  function newCode() {
    var bytes = random(12), out = '';
    for (var i = 0; i < 12; i++) out += CODE_ALPHABET[bytes[i] & 31];
    return out;
  }
  // Accepts what a person types or a scanner reads: any case, spaces or
  // dashes, the QR prefix, and the usual look-alikes (O for 0, I and L for 1).
  function normalizeCode(input) {
    var s = String(input || '').toUpperCase().trim();
    if (s.indexOf(QR_PREFIX) === 0) s = s.slice(QR_PREFIX.length);
    s = s.replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (s.length !== 12) return null;
    for (var i = 0; i < s.length; i++) if (CODE_ALPHABET.indexOf(s[i]) === -1) return null;
    return s;
  }
  function formatCode(code) { return code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8); }

  async function pairId(code) { return hex(await sha256(enc.encode('stitchx-relay-pair-id-v1:' + code))); }
  async function pairKey(code) {
    var base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('stitchx-relay-pair-v1'), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function sealBundle(bundle, code) {
    var iv = random(12), key = await pairKey(code);
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(bundle))));
    return b64(concat(iv, ct));
  }
  async function openBundle(blob, code) {
    var bytes = fromB64(blob), key = await pairKey(code);
    var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    var bundle = JSON.parse(new TextDecoder().decode(plain));
    if (!bundle || bundle.v !== 1 || !/^[A-Za-z0-9_-]{22}$/.test(bundle.space) || !/^[A-Za-z0-9_-]{43}$/.test(bundle.key)) throw err('bad-bundle');
    return bundle;
  }

  // ── Space credentials ────────────────────────────────────────────────────
  // The access token and the file passphrase are both derived from the key,
  // so the relay (which sees only the token) cannot decrypt anything.
  var _tokenCache = { key: null, token: null };
  async function accessToken(state) {
    if (_tokenCache.key === state.key) return _tokenCache.token;
    var token = b64url(await sha256(concat(enc.encode('stitchx-relay-v1:access:'), fromB64url(state.key))));
    _tokenCache = { key: state.key, token: token };
    return token;
  }
  function filePassphrase(state) { return 'stitchx-relay-v1:' + state.key; }
  function getState() {
    var s = readJSON(LS_STATE);
    return s && /^[A-Za-z0-9_-]{22}$/.test(s.space) && /^[A-Za-z0-9_-]{43}$/.test(s.key) ? s : null;
  }
  function getProgress(state) {
    var p = readJSON(LS_PROGRESS);
    if (!p || !state || p.space !== state.space) p = { space: state ? state.space : null, sentRev: 0, seen: {}, lastUploadAt: null, lastDownloadAt: null, hadPartner: false };
    if (!p.seen) p.seen = {};
    return p;
  }

  // ── Network ──────────────────────────────────────────────────────────────
  async function api(op, opts) {
    opts = opts || {};
    var url = new URL(ENDPOINT, location.href);
    url.searchParams.set('op', op);
    Object.keys(opts.query || {}).forEach(function (k) { url.searchParams.set(k, opts.query[k]); });
    var headers = Object.assign({}, opts.headers || {});
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    var res;
    try {
      res = await fetch(url.href, { method: opts.method || 'GET', headers: headers, body: opts.body, signal: opts.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
    } catch (e) {
      if (opts.signal && opts.signal.aborted) throw err('cancelled');
      throw err('network');
    }
    if (res.status === 304) return { status: 304, res: res };
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      throw err(body.error || ('http-' + res.status), { status: res.status });
    }
    return { status: res.status, res: res };
  }

  // ── Sync loop ────────────────────────────────────────────────────────────
  var running = null, timer = null, controller = null, paused = false, failures = 0;
  var forceUpload = false, lastUploadStarted = 0;
  var status = { state: 'unpaired', message: 'Not paired. Local work stays on this device.' };

  async function sha256hexOf(bytes) { return hex(await sha256(bytes)); }
  function emit(state, message) {
    status.state = state; status.message = message;
    try { window.dispatchEvent(new CustomEvent('cs:syncStatusChanged', { detail: { reason: 'relay' } })); } catch (_) {}
  }
  function getStatus() {
    var state = getState(), p = getProgress(state);
    return Object.assign({}, status, { paired: !!state, lastUploadAt: state ? p.lastUploadAt : null, lastDownloadAt: state ? p.lastDownloadAt : null });
  }
  function visible() { return document.visibilityState !== 'hidden' && navigator.onLine !== false; }
  var timerAt = 0;
  function stopTimer() { clearTimeout(timer); timer = null; timerAt = 0; }
  function schedule(delay) {
    stopTimer();
    if (getState() && !paused && visible()) { timerAt = Date.now() + delay; timer = setTimeout(function () { run(); }, delay); }
  }
  // Brings the next cycle forward if needed, never pushes it back: a stream of
  // saves must not keep postponing uploads and checks for other devices' work.
  function scheduleNoLaterThan(delay) {
    if (timer && timerAt <= Date.now() + delay) return;
    schedule(delay);
  }
  function uploadWait() { return Math.max(0, UPLOAD_COOLDOWN_MS - (Date.now() - lastUploadStarted)); }
  function localRev() { return (window.SyncEngine && SyncEngine.getLocalChangeRev) ? SyncEngine.getLocalChangeRev() : 0; }
  function needsUpload(p) { return !!p.hadPartner && (forceUpload || localRev() > (p.sentRev || 0) || !p.lastUploadAt); }

  async function ensureSpace(state, token, signal) {
    await api('create', { method: 'POST', token: token, query: { space: state.space }, signal: signal });
  }

  // opts.uploadOnly: the page is being hidden or closed; send this device's
  // changes now, skip the cooldown and do not download.
  async function cycle(state, signal, opts) {
    opts = opts || {};
    var me = SyncEngine.getDeviceId();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(me) || me === 'dev_unknown') throw err('identity');
    var token = await accessToken(state), pass = filePassphrase(state);
    var p = getProgress(state);
    emit('syncing', 'Checking your other devices for changes.');

    var listing;
    try {
      listing = await (await api('list', { token: token, query: { space: state.space }, signal: signal })).res.json();
    } catch (e) {
      // A space left idle for a month is removed. Every paired device holds
      // the key, so whichever comes back first quietly recreates it.
      if (e.code !== 'space-missing') throw e;
      await ensureSpace(state, token, signal);
      p.seen = {};
      listing = { devices: {} };
    }
    var devices = listing.devices || {};
    if (!p.hadPartner && Object.keys(devices).some(function (d) { return d !== me; })) { p.hadPartner = true; writeJSON(LS_PROGRESS, p); }

    // Check this device's own slot before anything else.
    var own = devices[me];
    if (own) {
      if (p.pendingEtag && own.etag === p.pendingEtag) {
        // An upload landed but its answer was lost.
        p.ownEtag = own.etag; p.pendingEtag = null; writeJSON(LS_PROGRESS, p);
      } else if (own.etag !== p.ownEtag) {
        throw err('identity-clash');
      }
    }
    // This device uploaded here before but its file is gone: the space
    // expired and was recreated, or the file was removed. Send it again in
    // full even without new local changes, or work the others never received
    // would stay out of reach. Stays true across reloads until it succeeds.
    var restore = !own && !!(p.ownEtag || p.lastUploadAt);

    // Bring in other devices' changes.
    for (var id of (opts.uploadOnly ? [] : Object.keys(devices).sort())) {
      if (id === me || p.seen[id] === devices[id].etag) continue;
      if (SyncEngine.getPendingPlan()) break; // a review is open: wait for it
      var got;
      try { got = await api('get', { token: token, query: { space: state.space, device: id }, signal: signal }); }
      catch (e) { if (e.code === 'no-file') continue; throw e; }
      var gotTag = /^"([0-9a-f]{64})"$/.exec(got.res.headers.get('ETag') || '');
      var bytes = new Uint8Array(await got.res.arrayBuffer());
      if (bytes.length > MAX_FILE) throw err('too-large');
      var obj = SyncEngine.decompress(bytes.buffer);
      if (obj && obj._encrypted) obj = await SyncEngine.decryptSyncObj(obj, pass);
      if (signal.aborted) throw err('cancelled');
      if (!obj || obj._version !== 2 || !obj._deliveryId || obj._deviceId === me) throw err('file');
      var result = await SyncEngine.receiveAutomatic(obj, 'relay:' + state.space, function () { return !signal.aborted; });
      if (result === 'cancelled') throw err('cancelled');
      if (result === 'review') break;
      // The version actually read, which may be newer than the listing's.
      p.seen[id] = gotTag ? gotTag[1] : devices[id].etag;
      if (result === 'applied') p.lastDownloadAt = new Date().toISOString();
      writeJSON(LS_PROGRESS, p);
    }

    // Send this device's changes.
    if (p.hadPartner && (restore || (needsUpload(p) && (forceUpload || opts.uploadOnly || uploadWait() === 0)))) {
      var snapshot = await SyncEngine.exportSync({ mode: 'full', encryptWith: pass });
      if (signal.aborted) throw err('cancelled');
      var payload = SyncEngine.compress(snapshot);
      if (payload.length > MAX_FILE) throw err('too-large');
      var conditions = { 'Content-Type': 'application/octet-stream' };
      if (own) conditions['If-Match'] = '"' + own.etag + '"'; else conditions['If-None-Match'] = '*';
      p.pendingEtag = await sha256hexOf(payload);
      writeJSON(LS_PROGRESS, p);
      lastUploadStarted = Date.now();
      await api('put', { method: 'PUT', token: token, query: { space: state.space, device: me }, headers: conditions, body: payload, signal: signal });
      forceUpload = false;
      p.ownEtag = p.pendingEtag; p.pendingEtag = null;
      p.sentRev = Math.max(p.sentRev || 0, snapshot._coversChangeRev || 0);
      p.lastUploadAt = new Date().toISOString();
      writeJSON(LS_PROGRESS, p);
      SyncEngine.markDelivered(snapshot);
    }

    failures = 0;
    var review = SyncEngine.getPendingPlan();
    if (!review && !p.hadPartner) { emit('waiting', 'Waiting for another device to join. Show a pairing code on this device and enter it on the other.'); return; }
    emit(review ? 'review' : (needsUpload(p) ? 'pending' : 'idle'),
      review ? 'Changes from another device need review. Open Review sync in the File menu.'
        : (needsUpload(p) ? 'Your latest changes will be sent shortly.' : 'Up to date with your other devices.'));
  }

  function run(opts) {
    opts = opts || {};
    if (running) return running;
    var state = getState();
    if (!state || paused || !window.SyncEngine) return Promise.resolve();
    if (!visible() && !opts.uploadOnly) { emit('paused', 'Paused while this page is hidden or offline.'); return Promise.resolve(); }
    stopTimer();
    controller = new AbortController();
    var signal = controller.signal, timedOut = false;
    var timeout = setTimeout(function () { timedOut = true; controller.abort(); }, CYCLE_TIMEOUT_MS);
    running = (async function () {
      try {
        // One tab per browser does the work.
        if (navigator.locks) await navigator.locks.request('stitchx-relay-sync', { ifAvailable: true }, function (lock) {
          if (lock) return cycle(state, signal, opts);
          emit('paused', 'Another tab is syncing.');
        });
        else await cycle(state, signal, opts);
      } catch (e) {
        var code = e && (e.code || (e.name === 'EncryptionError' ? 'key' : null));
        if (!getState()) return;
        if (code === 'identity-clash') {
          paused = true;
          emit('identity-clash', 'Another browser is syncing as this device, probably a copy of this browser. Choose Give this browser its own identity in Preferences > Sync, backup & data.');
        } else if (code === 'collision') {
          // Something wrote this device's file since the listing. The next
          // cycle's check of this device's slot tells a lost answer from a
          // copied identity.
          failures++;
          emit('retrying', 'Sync clashed with another write. Checking again.');
        } else if (code === 'forbidden') {
          paused = true;
          emit('unpaired-remotely', 'This pairing is no longer valid. Unpair this device and pair it again.');
        } else if (code === 'too-large') {
          failures++;
          emit('too-large', 'Your library is too big for pairing sync (over 4 MB). Turn off Source photos in What to sync, or use folder or file sync.');
        } else if (code === 'too-many-devices') {
          paused = true;
          emit('conflict', 'This pairing already has 10 devices. Unpair one you no longer use.');
        } else if (!timedOut && (code === 'cancelled' || !visible())) {
          emit('paused', 'Paused while this page is hidden or offline.');
        } else {
          failures++;
          emit('retrying', code === 'not-configured' ? 'Pairing sync is not set up on this server.' : 'Could not reach the sync relay. Retrying.');
        }
      } finally {
        clearTimeout(timeout); running = null;
        if (getState() && !paused) {
          var next = failures ? Math.min(300000, 5000 * Math.pow(2, Math.min(failures, 6))) : POLL_MS;
          // Changes made while this cycle ran still go out once the cooldown ends.
          var st = getState(), pp = st && getProgress(st);
          if (!failures && pp && needsUpload(pp)) next = Math.min(next, Math.max(CHANGE_DELAY_MS, uploadWait()));
          schedule(next);
        }
      }
    })();
    return running;
  }

  // Called by SyncEngine.triggerAutoExport for this device's own changes.
  function changed() {
    if (!getState() || paused) return;
    if (!running && visible()) {
      emit('pending', 'Your latest changes will be sent shortly.');
      // After a quiet spell, send soon; during a burst, wait out the cooldown.
      scheduleNoLaterThan(Math.max(CHANGE_DELAY_MS, uploadWait()));
    }
  }
  function syncNow() { paused = false; failures = 0; forceUpload = true; if (running) return running.then(function () { return run(); }); return run(); }

  // After a clash: give this browser a fresh device identity, so it and the
  // copy it was made from each keep their own file.
  function fixIdentity() {
    var state = getState();
    if (!state || !SyncEngine.regenerateDeviceId) return Promise.resolve();
    SyncEngine.regenerateDeviceId();
    var p = getProgress(state);
    p.ownEtag = null; p.pendingEtag = null; p.lastUploadAt = null;
    writeJSON(LS_PROGRESS, p);
    return syncNow();
  }

  // ── Pairing ──────────────────────────────────────────────────────────────
  async function createSpace() {
    var state = { space: b64url(random(16)), key: b64url(random(32)), pairedAt: new Date().toISOString() };
    await api('create', { method: 'POST', token: await accessToken(state), query: { space: state.space } });
    return state;
  }
  function adopt(state, joined) {
    writeJSON(LS_STATE, state);
    writeJSON(LS_PROGRESS, { space: state.space, sentRev: 0, seen: {}, lastUploadAt: null, lastDownloadAt: null, hadPartner: !!joined });
    paused = false; failures = 0; forceUpload = true;
    emit('pending', 'Paired. Syncing with your other devices.');
  }

  // Makes a code another device can use for the next 10 minutes. Pairs this
  // device first if it is not paired yet.
  async function startPairing() {
    var state = getState();
    if (!state) { state = await createSpace(); adopt(state); run(); }
    var code = newCode();
    var blob = await sealBundle({ v: 1, space: state.space, key: state.key }, code);
    await api('pair-put', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: await pairId(code), blob: blob }) });
    return { code: code, display: formatCode(code), qrText: QR_PREFIX + code, expiresAt: Date.now() + PAIR_TTL_MS };
  }

  // Joins the space behind a code. Returns 'joined', 'already' or throws
  // (err.code: 'bad-code', 'pairing-missing', 'bad-bundle', 'rate-limited').
  async function joinWithCode(input) {
    var code = normalizeCode(input);
    if (!code) throw err('bad-code');
    var got = await (await api('pair-get', { query: { id: await pairId(code) } })).res.json();
    var bundle;
    try { bundle = await openBundle(got.blob, code); } catch (_) { throw err('bad-bundle'); }
    var current = getState();
    if (current && current.space === bundle.space) return 'already';
    if (current) await leave(current).catch(function () {});
    adopt({ space: bundle.space, key: bundle.key, pairedAt: new Date().toISOString() }, true);
    // The device that showed the code uploads once it sees this one arrive;
    // look again shortly to pick that up instead of waiting a full interval.
    run().then(function () { schedule(20000); });
    return 'joined';
  }

  async function leave(state) {
    await api('leave', { method: 'DELETE', token: await accessToken(state), query: { space: state.space, device: SyncEngine.getDeviceId() } });
  }
  // Stops syncing and removes this device's file from the relay. Projects on
  // this device are untouched; other paired devices keep syncing.
  async function unpair() {
    var state = getState();
    paused = true; stopTimer();
    if (controller) controller.abort();
    await running;
    if (state) { try { await leave(state); } catch (_) { /* the space may already be gone */ } }
    writeJSON(LS_STATE, null); writeJSON(LS_PROGRESS, null);
    var pending = SyncEngine.getPendingPlan && SyncEngine.getPendingPlan();
    if (pending && String(pending._transportSource || '').indexOf('relay:') === 0) SyncEngine.setPendingPlan(null);
    paused = false;
    emit('unpaired', 'Not paired. Local work stays on this device.');
  }

  // Devices paired in this space, counting this one even before it has
  // uploaded anything (for the pairing dialog).
  async function deviceCount() {
    var state = getState();
    if (!state) return 0;
    var listing;
    try { listing = await (await api('list', { token: await accessToken(state), query: { space: state.space } })).res.json(); }
    catch (e) { if (e.code === 'space-missing') return 1; throw e; }
    var me = SyncEngine.getDeviceId();
    return 1 + Object.keys(listing.devices || {}).filter(function (d) { return d !== me; }).length;
  }

  window.SyncRelay = {
    isPaired: function () { return !!getState(); },
    getStatus: getStatus, changed: changed, syncNow: syncNow, fixIdentity: fixIdentity, startPairing: startPairing,
    joinWithCode: joinWithCode, unpair: unpair, deviceCount: deviceCount,
    _test: { normalizeCode: normalizeCode, formatCode: formatCode, newCode: newCode, sealBundle: sealBundle, openBundle: openBundle, pairId: pairId, accessToken: accessToken, run: run }
  };

  if (typeof document !== 'undefined' && document.addEventListener) {
    // Putting the device down is the moment the other device needs this
    // one's work, so send it then instead of waiting for the cooldown.
    function sendBeforeHiding() {
      var state = getState();
      stopTimer();
      if (!state || paused || running || navigator.onLine === false) return;
      if (needsUpload(getProgress(state))) run({ uploadOnly: true });
    }
    document.addEventListener('visibilitychange', function () {
      if (!getState()) return;
      if (!visible()) sendBeforeHiding();
      else if (!paused) run();
    });
    window.addEventListener('pagehide', function () { if (getState()) sendBeforeHiding(); });
    window.addEventListener('online', function () { if (getState() && !paused) run(); });
    // Settings and attachments do not pass through ProjectStorage.save.
    ['cs:prefchange', 'cs:attachmentsChanged'].forEach(function (name) {
      window.addEventListener(name, function () { if (getState()) { forceUpload = true; changed(); } });
    });
    // Start once the page has settled.
    window.addEventListener('load', function () {
      if (getState()) { emit('pending', 'Connecting to your other devices.'); setTimeout(run, 1500); }
    }, { once: true });
  }

  // ── Dialogs ──────────────────────────────────────────────────────────────
  // Loaded on first use; both are self-hosted in assets/ so they work offline.
  function loadLib(src, test) {
    if (test()) return Promise.resolve();
    if (typeof window.loadScript === 'function') return window.loadScript(src, { test: test });
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  function loadQrGenerator() { return loadLib('assets/qrcode-generator.js', function () { return typeof window.qrcode === 'function'; }); }
  function loadQrScanner() { return loadLib('assets/jsqr.js', function () { return typeof window.jsQR === 'function'; }); }

  function mount(Component, props) {
    return new Promise(function (resolve) {
      if (!window.React || !window.ReactDOM || !window.Overlay) { resolve(null); return; }
      var host = document.createElement('div');
      document.body.appendChild(host);
      var root = ReactDOM.createRoot ? ReactDOM.createRoot(host) : null;
      var settled = false;
      function done(value) {
        if (settled) return; settled = true;
        try { if (root) root.unmount(); else ReactDOM.unmountComponentAtNode(host); } catch (_) {}
        if (host.parentNode) host.parentNode.removeChild(host);
        resolve(value == null ? null : value);
      }
      var el = React.createElement(Component, Object.assign({ onClose: done }, props || {}));
      if (root) root.render(el); else ReactDOM.render(el, host);
    });
  }

  function errorText(e) {
    var code = e && e.code;
    if (code === 'bad-code') return 'That code is not right. It has 12 letters and numbers, like ABCD-EFGH-JKMN.';
    if (code === 'pairing-missing' || code === 'bad-bundle') return 'That code has expired or is not right. Show a new code on your other device and try again.';
    if (code === 'rate-limited') return 'Too many tries. Wait 10 minutes and try again.';
    if (code === 'not-configured') return 'Pairing sync is not set up on this server.';
    if (code === 'network' || /^http-5/.test(code || '') || code === 'store-unavailable') return 'Could not reach the sync relay. Check your connection and try again.';
    return 'Something went wrong. Try again.';
  }

  // Shows a code (and its QR) for another device to join this one.
  function ShowCodeDialog(props) {
    var h = React.createElement, uid = React.useId(), titleId = 'relay-show-' + uid;
    var info = React.useState(null), error = React.useState(null), qr = React.useState(null);
    var devices = React.useState(null), now = React.useState(Date.now());
    React.useEffect(function () {
      var cancelled = false;
      startPairing().then(function (p) {
        if (cancelled) return;
        info[1](p);
        loadQrGenerator().then(function () {
          if (cancelled) return;
          var q = window.qrcode(0, 'M'); q.addData(p.qrText, 'Alphanumeric'); q.make();
          qr[1](q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }));
        }).catch(function () {});
      }).catch(function (e) { if (!cancelled) error[1](errorText(e)); });
      return function () { cancelled = true; };
    }, []);
    // Watch for the other device arriving, and count down the code's life.
    React.useEffect(function () {
      if (!info[0]) return;
      var stop = false;
      var synced = false;
      function poll() {
        deviceCount().then(function (n) {
          if (stop) return;
          devices[1](n);
          if (n > 1 && !synced) { synced = true; syncNow(); }
        }).catch(function () {});
      }
      poll();
      var a = setInterval(poll, 10000), b = setInterval(function () { now[1](Date.now()); }, 1000);
      return function () { stop = true; clearInterval(a); clearInterval(b); };
    }, [info[0]]);
    var left = info[0] ? Math.max(0, info[0].expiresAt - now[0]) : 0;
    var mins = Math.floor(left / 60000), secs = Math.floor(left / 1000) % 60;
    return h(window.Overlay, { onClose: props.onClose, variant: 'dialog', maxWidth: 440, labelledBy: titleId, zIndex: 1200 },
      h(window.Overlay.CloseButton, { onClose: props.onClose }),
      h('div', { className: 'relay-dialog' },
        h('h3', { id: titleId }, 'Pair another device'),
        h('p', { className: 'relay-dialog-lead' }, 'On your other device, open stitchx, go to File > Preferences > Sync, backup & data, choose Enter a pairing code, then scan this code or type it in.'),
        error[0] ? h('p', { className: 'relay-dialog-error', role: 'alert' }, error[0])
          : !info[0] ? h('p', { className: 'relay-dialog-wait' }, 'Making a code…')
          : h(React.Fragment, null,
              qr[0] ? h('div', { className: 'relay-qr', role: 'img', 'aria-label': 'QR code for ' + info[0].display, dangerouslySetInnerHTML: { __html: qr[0] } }) : null,
              h('p', { className: 'relay-code', 'aria-label': 'Pairing code ' + info[0].display.split('').join(' ') }, info[0].display),
              h('p', { className: 'relay-dialog-note' }, left > 0
                ? 'This code works for ' + mins + ':' + (secs < 10 ? '0' : '') + secs + ' more. Anyone with it can join, so only show it to your own devices.'
                : 'This code has expired. Close this and show a new one.'),
              devices[0] != null ? h('p', { className: 'relay-dialog-note', role: 'status' }, devices[0] > 1
                ? devices[0] + ' devices are paired.'
                : 'Waiting for your other device to join.') : null),
        h('div', { className: 'relay-dialog-actions' },
          h('button', { type: 'button', className: 'btn btn-primary', onClick: props.onClose }, 'Done'))));
  }

  // Joins with a code: scans a QR code with the camera, or takes a typed code.
  function JoinDialog(props) {
    var h = React.createElement, uid = React.useId(), titleId = 'relay-join-' + uid;
    var typed = React.useState(''), error = React.useState(null), busy = React.useState(false), scanning = React.useState(false), done = React.useState(null);
    var videoRef = React.useRef(null), streamRef = React.useRef(null), busyRef = React.useRef(false);
    function stopCamera() {
      if (streamRef.current) { streamRef.current.getTracks().forEach(function (t) { t.stop(); }); streamRef.current = null; }
      scanning[1](false);
    }
    React.useEffect(function () { return stopCamera; }, []);
    function join(value) {
      if (busyRef.current) return;
      busyRef.current = true; busy[1](true); error[1](null);
      joinWithCode(value).then(function (result) {
        stopCamera();
        done[1](result === 'already' ? 'This device is already paired with that device.' : 'Paired. Your projects will sync while stitchx is open.');
      }).catch(function (e) { error[1](errorText(e)); })
        .then(function () { busyRef.current = false; busy[1](false); });
    }
    function startCamera() {
      error[1](null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { error[1]('This browser cannot use the camera here. Type the code instead.'); return; }
      Promise.all([loadQrScanner(), navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })]).then(function (r) {
        var stream = r[1]; streamRef.current = stream; scanning[1](true);
        var video = videoRef.current; if (!video) return;
        video.srcObject = stream; video.setAttribute('playsinline', ''); video.play().catch(function () {});
        var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
        (function tick() {
          if (!streamRef.current) return;
          if (video.readyState >= 2 && !busyRef.current) {
            var w = Math.min(640, video.videoWidth), hgt = Math.round(video.videoHeight * (w / video.videoWidth));
            if (w && hgt) {
              canvas.width = w; canvas.height = hgt;
              ctx.drawImage(video, 0, 0, w, hgt);
              var found = window.jsQR(ctx.getImageData(0, 0, w, hgt).data, w, hgt, { inversionAttempts: 'dontInvert' });
              if (found && found.data && normalizeCode(found.data)) { join(found.data); }
            }
          }
          setTimeout(tick, 200);
        })();
      }).catch(function () { stopCamera(); error[1]('Could not use the camera. Allow camera access, or type the code instead.'); });
    }
    return h(window.Overlay, { onClose: function () { stopCamera(); props.onClose(); }, variant: 'dialog', maxWidth: 440, labelledBy: titleId, zIndex: 1200 },
      h(window.Overlay.CloseButton, { onClose: function () { stopCamera(); props.onClose(); } }),
      h('div', { className: 'relay-dialog' },
        h('h3', { id: titleId }, 'Enter a pairing code'),
        done[0] ? h('p', { className: 'relay-dialog-lead', role: 'status' }, done[0]) : h(React.Fragment, null,
          h('p', { className: 'relay-dialog-lead' }, 'On your other device, choose Show a pairing code. Then scan it here, or type it in.'),
          h('div', { className: 'relay-scan' + (scanning[0] ? ' relay-scan--on' : '') },
            h('video', { ref: videoRef, muted: true, playsInline: true, 'aria-label': 'Camera view for scanning the QR code' }),
            !scanning[0] && h('button', { type: 'button', className: 'btn', onClick: startCamera, disabled: busy[0] }, window.Icons && Icons.camera ? Icons.camera() : null, 'Scan the QR code')),
          h('form', { className: 'relay-type', onSubmit: function (e) { e.preventDefault(); join(typed[0]); } },
            h('label', { htmlFor: 'relay-code-' + uid }, 'Or type the code'),
            h('input', { id: 'relay-code-' + uid, value: typed[0], onChange: function (e) { typed[1](e.target.value); }, placeholder: 'ABCD-EFGH-JKMN', autoComplete: 'off', autoCapitalize: 'characters', spellCheck: false, maxLength: 30, disabled: busy[0] }),
            h('button', { type: 'submit', className: 'btn btn-primary', disabled: busy[0] || !normalizeCode(typed[0]) }, busy[0] ? 'Pairing…' : 'Pair'))),
        error[0] ? h('p', { className: 'relay-dialog-error', role: 'alert' }, error[0]) : null,
        done[0] ? h('div', { className: 'relay-dialog-actions' }, h('button', { type: 'button', className: 'btn btn-primary', onClick: props.onClose }, 'Done')) : null));
  }

  window.SyncRelayDialogs = {
    showCode: function () { return mount(ShowCodeDialog); },
    join: function () { return mount(JoinDialog); }
  };
})();
