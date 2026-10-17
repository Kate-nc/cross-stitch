// One optional browser transport. The server owns authentication/ACLs; .csync
// owns merge, attachment integrity and replay. Nothing here stores credentials.
(function () {
  'use strict';
  var POLL = 15000, MAX_FILE = 64 * 1024 * 1024, MAX_JSON = 128 * 1024 * 1024;
  var session = null, running = null, timer = null, controller = null;
  var paused = false, revision = 0, sentRevision = -1, failures = 0;
  var status = { state: 'disconnected', message: 'Disconnected. Local work stays on this device.', lastUploadAt: null, lastDownloadAt: null };
  function emit(state, message) {
    status.state = state; status.message = message;
    window.dispatchEvent(new CustomEvent('cs:syncStatusChanged'));
  }
  function getStatus() { return Object.assign({}, status, { connected: !!session }); }
  function stopTimer() { clearTimeout(timer); timer = null; }
  function visible() { return document.visibilityState !== 'hidden' && navigator.onLine !== false; }
  function active(s) { return session === s && !paused && visible() && !controller.signal.aborted; }
  function error(code) { var e = new Error(code); e.code = code; return e; }
  function endpoint(value) {
    var u = new URL(value);
    if (u.username || u.password || u.search || u.hash ||
        (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) throw error('endpoint');
    if (!u.pathname.endsWith('/')) u.pathname += '/';
    return u.href;
  }
  function auth(user, password) {
    if (!user || user.includes(':') || !password || /[\r\n]/.test(user + password)) throw error('credentials');
    var bytes = new TextEncoder().encode(user + ':' + password), binary = '';
    bytes.forEach(function (b) { binary += String.fromCharCode(b); });
    return 'Basic ' + btoa(binary);
  }
  async function request(s, url, method, headers, body) {
    if (!active(s)) throw error('cancelled');
    var response = await fetch(url, { method: method, headers: Object.assign({Authorization:s.authorization}, headers),
      body: body, signal: controller.signal, credentials:'omit', redirect:'error', cache:'no-store', referrerPolicy:'no-referrer' });
    if (!active(s)) throw error('cancelled');
    if (response.status === 401 || response.status === 403) throw error('auth');
    if (response.status === 412) throw error('collision');
    if (response.status === 429 || response.status >= 500) throw error('temporary');
    return response;
  }
  async function bytes(response, limit) {
    if (Number(response.headers.get('Content-Length')) > limit) throw error('size');
    if (!response.body || !response.body.getReader) throw error('stream');
    var reader = response.body.getReader(), chunks = [], size = 0;
    try {
      for (;;) {
        var part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > limit) throw error('size');
        chunks.push(part.value);
      }
    } catch (e) { await reader.cancel().catch(function () {}); throw e; }
    var out = new Uint8Array(size), offset = 0;
    chunks.forEach(function (c) { out.set(c, offset); offset += c.length; });
    return out;
  }
  function decode(data) {
    // Bound inflated data too: a small malicious file must not allocate an
    // unbounded JSON string before the hardened protocol can validate it.
    var inflate = new pako.Inflate(), chunks = [], size = 0;
    inflate.onData = function (chunk) { size += chunk.length; if (size > MAX_JSON) throw error('size'); chunks.push(chunk); };
    inflate.push(data, true);
    if (inflate.err || !inflate.ended) throw error('file');
    var out = new Uint8Array(size), offset = 0;
    chunks.forEach(function (c) { out.set(c,offset); offset += c.length; });
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(out));
  }
  function files(xml, base) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw error('listing');
    var doc = new DOMParser().parseFromString(xml,'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw error('listing');
    var names = new Set();
    Array.from(doc.getElementsByTagNameNS('DAV:','response')).forEach(function (row) {
      var href = row.getElementsByTagNameNS('DAV:','href')[0]; if (!href) return;
      var u = new URL(href.textContent,base), root = new URL(base);
      if (u.origin !== root.origin || !u.pathname.startsWith(root.pathname) || u.search || u.hash || u.username || u.password) return;
      var name = u.pathname.slice(root.pathname.length);
      // Never follow server-supplied URLs. Construct only immediate, fixed
      // protocol filenames under the authenticated collection.
      if (/^stitchx-[A-Za-z0-9_-]+\.csync$/.test(name)) names.add(name);
    });
    if (names.size > 100) throw error('listing');
    return Array.from(names).sort();
  }
  function strongETag(response) {
    var tag = response.headers.get('ETag');
    if (!tag || !/^"[^"\r\n]+"$/.test(tag)) throw error('etag');
    return tag;
  }
  function schedule(delay) {
    stopTimer();
    if (session && !paused && visible()) timer = setTimeout(function () { run(); }, delay);
  }
  async function cycle(s) {
    emit('syncing','Checking WebDAV and transferring changes.');
    var listing = await request(s,s.url,'PROPFIND',{'Depth':'1','Content-Type':'application/xml'},
      '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>');
    if (listing.status !== 207) throw error('listing');
    var names = files(new TextDecoder().decode(await bytes(listing,1024*1024)),s.url);
    for (var name of names) {
      if (!active(s)) throw error('cancelled');
      // Do not replace a plan being reviewed with another peer's delivery.
      var pending = SyncEngine.getPendingPlan();
      if (pending) break;
      if (name === s.name) continue;
      var response = await request(s,s.url + name,'GET',s.remoteETags[name] ? {'If-None-Match':s.remoteETags[name]} : {});
      if (response.status === 304) continue;
      if (response.status === 404) continue; // removed between listing and GET
      if (!response.ok) throw error('file');
      var data = await bytes(response,MAX_FILE), obj = decode(data);
      if (!active(s)) throw error('cancelled');
      if (obj._version !== 2 || !obj._deliveryId || obj._deviceId === SyncEngine.getDeviceId()) throw error('file');
      if (s.seen[name] === obj._deliveryId) continue;
      var result = await SyncEngine.receiveAutomatic(obj,s.id,function () { return active(s); });
      if (!active(s) || result === 'cancelled') throw error('cancelled');
      if (result === 'review') break;
      s.seen[name] = obj._deliveryId;
      var tag = response.headers.get('ETag');
      if (tag && /^"[^"\r\n]+"$/.test(tag)) s.remoteETags[name] = tag;
      if (result === 'applied') status.lastDownloadAt = new Date().toISOString();
    }
    if (sentRevision !== revision && (s.force || !s.lastUploadStarted || Date.now() - s.lastUploadStarted >= 60000)) {
      s.force = false;
      if (!s.checkedOwn) {
        var own = await request(s,s.url+s.name,'GET',{});
        if (own.ok) { s.etag = strongETag(own); await bytes(own,MAX_FILE); }
        else if (own.status === 404) s.etag = null;
        else throw error('file');
        s.checkedOwn = true;
      }
      var version = revision;
      var snapshot = await SyncEngine.exportSync({mode:'full'});
      if (!active(s)) throw error('cancelled');
      var payload = SyncEngine.compress(snapshot);
      if (payload.length > MAX_FILE) throw error('size');
      var conditions = {'Content-Type':'application/octet-stream'};
      conditions[s.etag ? 'If-Match' : 'If-None-Match'] = s.etag || '*';
      s.lastUploadStarted = Date.now();
      var saved = await request(s,s.url+s.name,'PUT',conditions,payload);
      if (![200,201,204].includes(saved.status)) throw error('write');
      // A lost acknowledgement is safe: next retry first reads the complete
      // resource and repeats a full snapshot; there are no remote commands.
      s.etag = strongETag(saved);
      sentRevision = version; status.lastUploadAt = new Date().toISOString();
    }
    if (!active(s)) throw error('cancelled');
    failures = 0;
    var review = SyncEngine.getPendingPlan(), queued = sentRevision !== revision;
    emit(review ? 'review' : (queued ? 'pending' : 'idle'),review
      ? 'Changes need review. Open Review sync in the File menu.'
      : (queued ? 'Local changes queued for the next upload.' : 'Transfers complete. Peer receipt is not confirmed.'));
  }
  function run() {
    if (running) return running;
    if (!session || paused) return Promise.resolve();
    if (!visible()) { emit('paused','Waiting for this page to be visible and online.'); return Promise.resolve(); }
    var s = session; stopTimer(); controller = new AbortController();
    var timedOut = false;
    var timeout = setTimeout(function () { timedOut = true; controller.abort(); },45000);
    running = (async function () {
      try {
        // Coordinate automatic cycles across tabs. Conditional writes still
        // protect the remote file when Web Locks is unavailable.
        if (navigator.locks) await navigator.locks.request('stitchx-webdav-sync',{ifAvailable:true},function (lock) {
          if (lock) return cycle(s);
          emit('paused','Another tab is synchronising; retrying shortly.');
        });
        else await cycle(s);
      } catch (e) {
        if (session !== s) return;
        s.force = true;
        s.checkedOwn = false; // PUT may have committed before response loss
        if (e.code === 'auth') {
          s.authorization = ''; session = null;
          emit('credentials','Access expired or revoked. Reconnect with a valid app password. Local work is retained.');
        } else if (!timedOut && (paused || !visible() || controller.signal.aborted || e.code === 'cancelled')) {
          emit('paused','Sync paused. Local work is retained; retry when ready.');
        } else if (e.code === 'collision') {
          s.blocked = true; paused = true;
          emit('conflict','Remote writer changed. Disconnect and check for a copied device identity before reconnecting.');
        } else {
          failures++;
          emit('retrying', e.code === 'etag' ? 'Server must expose strong ETags and support conditional PUT. Retrying with backoff.' : (e.name === 'EncryptionError' ? 'Unlock sync encryption in Preferences, then Retry now.' : 'Transfer failed; retrying with backoff. Check the server, CSP, CORS and file validity.'));
        }
      } finally {
        clearTimeout(timeout); running = null;
        if (session === s) schedule(Math.min(300000, failures ? 2000 * Math.pow(2,Math.min(failures,8)) : POLL));
      }
    })();
    return running;
  }
  async function disconnect() {
    var old = session; session = null; paused = true; stopTimer();
    if (old) old.authorization = '';
    if (controller) controller.abort();
    await running;
    var pending = SyncEngine.getPendingPlan();
    if (pending && String(pending._transportSource || '').startsWith('webdav:')) SyncEngine.setPendingPlan(null);
    status.lastUploadAt = null; status.lastDownloadAt = null;
    emit('disconnected','Disconnected. Local work stays on this device.');
  }
  async function connect(options) {
    var url = endpoint(options.url), authorization = auth(options.username,options.password);
    await disconnect();
    if (SyncEngine.SYNC_VERSION !== 2) throw error('protocol');
    var id = SyncEngine.getDeviceId();
    if (!/^[A-Za-z0-9_-]+$/.test(id) || id === 'dev_unknown') throw error('identity');
    session = {url:url,authorization:authorization,name:'stitchx-'+id+'.csync',id:'webdav:'+crypto.randomUUID(),seen:Object.create(null),remoteETags:Object.create(null),force:true,lastUploadStarted:0,etag:null,checkedOwn:false};
    paused = false; revision++; sentRevision = -1; failures = 0;
    return run();
  }
  function cancel() { if (!session || session.blocked) return Promise.resolve(); paused = true; stopTimer(); if (controller) controller.abort(); emit('paused','Sync paused. Local work is retained; retry when ready.'); return running || Promise.resolve(); }
  async function retry() {
    if (!session || session.blocked) return;
    paused = false; failures = 0; session.force = true;
    if (running && controller.signal.aborted) await running;
    return run();
  }
  function changed() {
    revision++;
    if (!session || paused) return;
    if (!running) {
      if (!SyncEngine.getPendingPlan()) emit(visible() ? 'pending' : 'paused',visible() ? 'Local changes queued for upload.' : 'Local changes waiting for this page to be visible and online.');
      if (!timer) schedule(2000);
    }
  }
  window.WebDAVSync = {connect:connect,disconnect:disconnect,cancel:cancel,retry:retry,changed:changed,getStatus:getStatus};
  window.addEventListener('online',function () { if (!paused) retry(); });
  window.addEventListener('offline',function () {
    if (!session) return;
    if (controller) controller.abort();
    emit('paused','Offline. Local changes will sync when this page is online.');
  });
  document.addEventListener('visibilitychange',function () {
    if (!session) return;
    if (!visible()) { stopTimer(); if (controller) controller.abort(); emit('paused','Waiting for this page to be visible and online.'); }
    else if (!paused) { revision++; retry(); }
  });
  window.addEventListener('cs:projectsChanged',changed);
  window.addEventListener('cs:attachmentsChanged',changed);
  window.addEventListener('cs:prefchange',changed);
  window.addEventListener('storage',function (e) { if (e.key && (e.key.startsWith('cs_pref_') || e.key === 'cs_deleted_project_ids')) changed(); });
  window.addEventListener('cs:stashChanged',changed);
  window.addEventListener('cs:backupRestored',changed);

  // Plain-script React panel, mounted only by Preferences. Secrets are read
  // from an uncontrolled field and erased before awaiting network work.
  window.WebDAVSyncPanel = function WebDAVSyncPanel() {
    var h = React.createElement, state = React.useState(getStatus()), st = state[0], refresh = state[1];
    var form = React.useRef(null), busy = React.useState(false), message = React.useState('');
    React.useEffect(function () {
      function update() { refresh(getStatus()); }
      window.addEventListener('cs:syncStatusChanged',update);
      return function () { window.removeEventListener('cs:syncStatusChanged',update); };
    },[]);
    async function submit(e) {
      e.preventDefault(); if (busy[0]) return;
      var fields = form.current.elements;
      var options = {url:fields.url.value,username:fields.username.value,password:fields.password.value};
      fields.password.value = ''; busy[1](true); message[1]('');
      try { await connect(options); } catch (_) { message[1]('Connection refused. Use an HTTPS collection URL, username and app password.'); }
      finally { options.password = ''; busy[1](false); }
    }
    return h('section',{className:'webdav-panel','aria-label':'Automatic WebDAV sync'},
      h('h3',null,'Automatic WebDAV sync'),
      h('p',null,'Connect a private WebDAV folder shared by your own devices. Your deployment must allow its origin in CSP, or proxy it under the app origin. This uploads your entire local library and enabled stash/settings. Server access rules must restrict the folder to your account; use separate app browser profiles for separate accounts.'),
      h('p',null,'Credentials stay in this page’s memory. Reconnect after reloading or changing pages. Sync runs while visible and online; iOS can suspend closed or background apps. Keep separate backups.'),
      h('p',{role:'status'},st.message),
      h('p',null,'Last upload: '+(st.lastUploadAt ? new Date(st.lastUploadAt).toLocaleString('en-GB') : 'None this connection')+'. Last download applied: '+(st.lastDownloadAt ? new Date(st.lastDownloadAt).toLocaleString('en-GB') : 'None this connection')+'.'),
      message[0] && h('p',{role:'alert'},message[0]),
      h('form',{ref:form,onSubmit:submit},
        h('label',null,'Collection URL ',h('input',{name:'url',type:'url',required:true,placeholder:'https://dav.example/stitchx/',disabled:busy[0],autoComplete:'off'})),
        h('label',null,'Username ',h('input',{name:'username',required:true,disabled:busy[0],autoComplete:'off'})),
        h('label',null,'App password ',h('input',{name:'password',type:'password',required:true,disabled:busy[0],autoComplete:'off'})),
        h('button',{type:'submit',disabled:busy[0]},busy[0]?'Connecting…':'Connect and sync')),
      h('div',{className:'webdav-actions'},
        h('button',{type:'button',onClick:retry,disabled:!st.connected || st.state === 'conflict'},'Retry now'),
        h('button',{type:'button',onClick:cancel,disabled:!st.connected},'Cancel sync'),
        h('button',{type:'button',onClick:disconnect,disabled:!st.connected},'Disconnect')),
      h('p',null,'Setup and server requirements: see Automatic WebDAV sync in Help. Disconnect stops this page’s transfers and retains all local projects and attachments. Other connected tabs must be disconnected separately.'));
  };
})();
