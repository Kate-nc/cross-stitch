/* photos.js — progress photos kept with a project (tracking audit TRACK-14, Phase 6 batch 5).
 *
 * A project can carry a few pictures of the work (the fabric, the hoop, a section just finished). They live in the
 * BlobStore (blob-store.js, the `pendingImports` object store), never in the project record, so they cannot slow a
 * project load or the chart: nothing here runs until the person opens the Notes and photos panel.
 *
 *   photo:<projectId>:<id>       the picture, a JPEG compressed in the browser (at most 1600 px on the long side and
 *                                about 700 KB; the quality and then the size are lowered until it fits)
 *   photothumb:<projectId>:<id>  a 240 px thumbnail of it, its own record, so a thumbnail never reads the picture
 *
 * At most 12 photos per project. Backups carry them (backup-restore.js); deleting a project deletes them; sync does not
 * carry them (they stay on the device and in backups).
 *
 *   ProjectPhotos.list(projectId)            → Promise<id[]> oldest first, reading keys only
 *   ProjectPhotos.thumbUrl(projectId, id)    → Promise<object URL | null> (the caller revokes it)
 *   ProjectPhotos.fullUrl(projectId, id)     → Promise<object URL | null>
 *   ProjectPhotos.add(projectId, file)       → Promise<id>; rejects with a message fit to show
 *   ProjectPhotos.remove(projectId, id) / removeAll(projectId)
 *
 * The pure helpers (fitSize, keys) are exported for tests. Plain script; also require()-able.
 */
(function (root) {
  'use strict';
  var MAX_PHOTOS = 12, FULL_MAX_PX = 1600, THUMB_MAX_PX = 240, MAX_BYTES = 700 * 1024;

  function fitSize(w, h, max) {
    if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
    var s = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }

  function fullPrefix(pid) { return 'photo:' + pid + ':'; }
  function thumbPrefix(pid) { return 'photothumb:' + pid + ':'; }
  function newPhotoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function idOf(key, prefix) { return String(key).slice(prefix.length); }

  function store() {
    var B = root.BlobStore;
    if (!B || !B.keys) throw new Error('Photo storage is not available here.');
    return B;
  }

  // Oldest first (the id starts with the time in base 36, so a string sort is a time sort).
  function list(pid) {
    if (!pid) return Promise.resolve([]);
    return store().keys(thumbPrefix(pid)).then(function (ks) {
      return ks.map(function (k) { return idOf(k, thumbPrefix(pid)); }).sort();
    });
  }

  function urlOf(key) {
    return store().get(key).then(function (r) {
      return r && r.blob ? URL.createObjectURL(r.blob) : null;
    });
  }
  function thumbUrl(pid, id) { return urlOf(thumbPrefix(pid) + id); }
  function fullUrl(pid, id) { return urlOf(fullPrefix(pid) + id); }

  function remove(pid, id) {
    var B = store();
    return Promise.all([B.delete(fullPrefix(pid) + id), B.delete(thumbPrefix(pid) + id)]);
  }
  function removeAll(pid) {
    var B = store();
    return Promise.all([B.deletePrefix(fullPrefix(pid)), B.deletePrefix(thumbPrefix(pid))]);
  }

  // ── Compression (browser only) ──
  function decode(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return decodeWithImage(file); });
    }
    return decodeWithImage(file);
  }
  function decodeWithImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('read')); };
      img.src = url;
    });
  }
  function toJpeg(src, w, h, quality) {
    return new Promise(function (resolve, reject) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // a transparent picture would turn black
      ctx.drawImage(src, 0, 0, w, h);
      c.toBlob(function (b) { b ? resolve(b) : reject(new Error('encode')); }, 'image/jpeg', quality);
    });
  }
  function compress(file) {
    return decode(file).then(function (src) {
      var sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
      var size = fitSize(sw, sh, FULL_MAX_PX), qualities = [0.82, 0.72, 0.62, 0.52];
      function attempt(shrink) {
        var w = Math.max(1, Math.round(size.w * shrink)), h = Math.max(1, Math.round(size.h * shrink));
        var chain = Promise.resolve(null);
        qualities.forEach(function (q) {
          chain = chain.then(function (best) {
            if (best && best.size <= MAX_BYTES) return best;
            return toJpeg(src, w, h, q);
          });
        });
        return chain.then(function (b) {
          if (b.size <= MAX_BYTES) return { blob: b, w: w, h: h };
          if (shrink < 0.4) throw new Error('big');
          return attempt(shrink * 0.75);
        });
      }
      return attempt(1).then(function (full) {
        var t = fitSize(sw, sh, THUMB_MAX_PX);
        return toJpeg(src, t.w, t.h, 0.7).then(function (thumb) {
          if (src.close) { try { src.close(); } catch (_) {} }
          return { full: full.blob, thumb: thumb, w: full.w, h: full.h };
        });
      });
    });
  }

  function add(pid, file) {
    if (!pid) return Promise.reject(new Error('Save the project first, then add photos.'));
    if (!file || !/^image\//.test(file.type || '')) return Promise.reject(new Error('That file is not a picture.'));
    var B;
    try { B = store(); } catch (e) { return Promise.reject(e); }
    return list(pid).then(function (ids) {
      if (ids.length >= MAX_PHOTOS) throw new Error('A project keeps up to ' + MAX_PHOTOS + ' photos. Delete one to add another.');
      return compress(file).then(function (c) {
        var id = newPhotoId(), now = Date.now();
        return B.put(fullPrefix(pid) + id, { projectId: pid, type: 'image/jpeg', w: c.w, h: c.h, bytes: c.full.size, blob: c.full, createdAt: now })
          .then(function () { return B.put(thumbPrefix(pid) + id, { projectId: pid, type: 'image/jpeg', blob: c.thumb, createdAt: now }); })
          .then(function () { return id; });
      }, function (err) {
        throw new Error(err && err.message === 'big' ? 'That picture is too large to keep, even compressed.' : 'This picture format cannot be read here. Try a JPEG or PNG.');
      });
    });
  }

  var api = {
    MAX_PHOTOS: MAX_PHOTOS, FULL_MAX_PX: FULL_MAX_PX, THUMB_MAX_PX: THUMB_MAX_PX, MAX_BYTES: MAX_BYTES,
    fitSize: fitSize, fullPrefix: fullPrefix, thumbPrefix: thumbPrefix,
    list: list, thumbUrl: thumbUrl, fullUrl: fullUrl, add: add, remove: remove, removeAll: removeAll
  };
  root.ProjectPhotos = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
