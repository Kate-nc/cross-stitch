/* tracker-notes.js — the Notes and photos section of the Tracker's Session tab (TRACK-14, Phase 6 batch 5).
 *
 * Notes: free text kept with the project (`notes`, up to 20,000 characters), saved by the Tracker's own autosave.
 * Photos: up to 12 compressed pictures from photos.js, in a strip of thumbnails; a tap opens one full size.
 *
 * Nothing here touches IndexedDB until `active` is true (the Controls panel is open on the Session tab), so a project
 * load and the chart never pay for photos. Thumbnails are small separate records; the full picture is read only when
 * opened. Object URLs are revoked when the panel closes or the project changes.
 *
 * Props: projectId, notes, onNotes(text), active.
 * Plain script (window.TrackerNotesPhotos); the helpers it needs are in photos.js.
 */
(function () {
  'use strict';
  var NOTES_MAX = 20000;

  window.TrackerNotesPhotos = function TrackerNotesPhotos(props) {
    var R = window.React, h = R.createElement;
    var useState = R.useState, useEffect = R.useEffect, useRef = R.useRef;
    var pid = props.projectId, active = !!props.active;
    var P = window.ProjectPhotos;

    var textState = useState(props.notes || ''), text = textState[0], setText = textState[1];
    var timerRef = useRef(null), lastSentRef = useRef(props.notes || '');
    // A different project (or notes changed elsewhere, such as the other tab's merge): take them.
    useEffect(function () {
      if ((props.notes || '') !== lastSentRef.current) { lastSentRef.current = props.notes || ''; setText(props.notes || ''); }
    }, [props.notes, pid]);
    function send(v) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (v === lastSentRef.current) return;
      lastSentRef.current = v;
      if (props.onNotes) props.onNotes(v);
    }
    function onChange(e) {
      var v = e.target.value.slice(0, NOTES_MAX);
      setText(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(function () { timerRef.current = null; send(v); }, 500);
    }
    var textRef = useRef(text); textRef.current = text;
    useEffect(function () { return function () { if (timerRef.current) { clearTimeout(timerRef.current); send(textRef.current); } }; }, []);

    var idsState = useState([]), ids = idsState[0], setIds = idsState[1];
    var urlsState = useState({}), urls = urlsState[0], setUrls = urlsState[1];
    var msgState = useState(''), msg = msgState[0], setMsg = msgState[1];
    var viewState = useState(null), view = viewState[0], setView = viewState[1];     // { id, url }
    var confirmState = useState(false), confirmDel = confirmState[0], setConfirmDel = confirmState[1];
    var busyState = useState(false), busy = busyState[0], setBusy = busyState[1];
    var urlsRef = useRef({});
    var inputRef = useRef(null);

    function revokeAll() {
      Object.keys(urlsRef.current).forEach(function (k) { try { URL.revokeObjectURL(urlsRef.current[k]); } catch (_) {} });
      urlsRef.current = {};
    }
    function refresh() {
      if (!P || !pid) { setIds([]); return Promise.resolve(); }
      return P.list(pid).then(function (list) {
        setIds(list);
        return Promise.all(list.filter(function (id) { return !urlsRef.current[id]; }).map(function (id) {
          return P.thumbUrl(pid, id).then(function (u) { if (u) urlsRef.current[id] = u; });
        })).then(function () { setUrls(Object.assign({}, urlsRef.current)); });
      }).catch(function () { setMsg('Photos could not be read on this device.'); });
    }
    useEffect(function () {
      if (!active) { revokeAll(); setUrls({}); setView(null); setConfirmDel(false); return; }
      var alive = true;
      refresh().then(function () { if (!alive) revokeAll(); });
      return function () { alive = false; };
    }, [active, pid]);
    useEffect(function () { return function () { revokeAll(); if (view && view.url) { try { URL.revokeObjectURL(view.url); } catch (_) {} } }; }, []);

    function openPhoto(id) {
      P.fullUrl(pid, id).then(function (u) { if (u) { setView({ id: id, url: u }); setConfirmDel(false); } });
    }
    function closePhoto() {
      if (view && view.url) { try { URL.revokeObjectURL(view.url); } catch (_) {} }
      setView(null); setConfirmDel(false);
    }
    useEffect(function () {
      if (!view) return;
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closePhoto(); } }
      window.addEventListener('keydown', onKey, true);
      return function () { window.removeEventListener('keydown', onKey, true); };
    }, [view]);
    function deleteOpen() {
      if (!view) return;
      var id = view.id;
      P.remove(pid, id).then(function () {
        if (urlsRef.current[id]) { try { URL.revokeObjectURL(urlsRef.current[id]); } catch (_) {} delete urlsRef.current[id]; }
        closePhoto(); refresh();
      });
    }
    function onFiles(e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      setBusy(true); setMsg('');
      files.reduce(function (chain, f) {
        return chain.then(function () { return P.add(pid, f).then(function () { return null; }, function (err) { setMsg(err && err.message ? err.message : 'That picture could not be added.'); }); });
      }, Promise.resolve()).then(function () { return refresh(); }).then(function () { setBusy(false); });
    }

    var label = { fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };
    var full = P && ids.length >= P.MAX_PHOTOS;
    var canPhotos = !!P && !!pid;

    return h('div', { className: 'tracker-notes', style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      h('div', null,
        h('label', { htmlFor: 'tracker-notes-text', style: Object.assign({ display: 'block' }, label) }, 'Notes'),
        h('textarea', {
          id: 'tracker-notes-text', value: text, onChange: onChange, onBlur: function () { send(text); }, rows: 5, maxLength: NOTES_MAX,
          placeholder: 'Where you stopped, thread or fabric changes, things to remember',
          style: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text-primary)', font: 'inherit', fontSize: 'var(--text-sm)', resize: 'vertical' }
        }),
        h('div', { style: { fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 4 } }, 'Kept with the project, and in backups.')
      ),
      h('div', null,
        h('div', { style: label }, 'Photos' + (canPhotos && ids.length ? ' (' + ids.length + ' of ' + (P ? P.MAX_PHOTOS : 12) + ')' : '')),
        canPhotos ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } },
          ids.map(function (id) {
            return h('button', {
              key: id, type: 'button', className: 'tracker-photo-thumb', onClick: function () { openPhoto(id); }, 'aria-label': 'Open photo',
              style: { width: 64, height: 64, padding: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-secondary)', overflow: 'hidden', cursor: 'pointer' }
            }, urls[id] ? h('img', { src: urls[id], alt: '', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } }) : null);
          }),
          h('button', {
            type: 'button', disabled: busy || full, onClick: function () { if (inputRef.current) inputRef.current.click(); },
            style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', cursor: busy || full ? 'default' : 'pointer', opacity: busy || full ? 0.6 : 1 }
          }, window.Icons && window.Icons.camera ? window.Icons.camera() : null, busy ? 'Adding' : 'Add photo'),
          h('input', { ref: inputRef, type: 'file', accept: 'image/*', multiple: true, onChange: onFiles, style: { display: 'none' }, 'aria-label': 'Choose photos to add' })
        ) : h('div', { style: { fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' } }, 'Save the project to add photos.'),
        msg ? h('div', { role: 'status', style: { marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--danger)' } }, msg) : null,
        h('div', { style: { fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 4 } }, 'Shrunk to fit and kept on this device and in backups, up to 12 per project.')
      ),
      view ? h('div', {
        className: 'tracker-photo-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo', onClick: closePhoto,
        style: { position: 'fixed', inset: 0, zIndex: 10050, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }
      },
        h('img', { src: view.url, alt: 'Progress photo', onClick: function (e) { e.stopPropagation(); }, style: { maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' } }),
        h('div', { style: { display: 'flex', gap: 8 }, onClick: function (e) { e.stopPropagation(); } },
          confirmDel
            ? [h('button', { key: 'y', type: 'button', onClick: deleteOpen, style: { padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--danger)', background: 'var(--danger)', color: 'var(--surface)', cursor: 'pointer', fontSize: 'var(--text-sm)' } }, 'Delete this photo'),
               h('button', { key: 'n', type: 'button', onClick: function () { setConfirmDel(false); }, style: { padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 'var(--text-sm)' } }, 'Keep it')]
            : [h('button', { key: 'd', type: 'button', onClick: function () { setConfirmDel(true); }, style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 'var(--text-sm)' } }, window.Icons && window.Icons.trash ? window.Icons.trash() : null, 'Delete'),
               h('button', { key: 'c', type: 'button', autoFocus: true, onClick: closePhoto, style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--surface)', cursor: 'pointer', fontSize: 'var(--text-sm)' } }, window.Icons && window.Icons.x ? window.Icons.x() : null, 'Close')]
        )
      ) : null
    );
  };
})();
