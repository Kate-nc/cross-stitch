// sync-attachment-codec.js
// Manifest validation and sequential binary decoding for .csync attachments.
// The engine retains transport, storage, conflict policy and protocol status ownership.
// Dependencies are passed through its adapter; no extra async boundary or byte copy.
const SyncAttachmentCodec = (() => {
  async function verify(syncObj, owner, decodeBase64, contentId, protocolError, maxSyncBytes) {
    if (!syncObj) return [];
    var a = syncObj.attachments;
    if (!a) {
      if (syncObj._version >= 2) throw protocolError('failed','Sync file is missing its attachment manifest.');
      return []; // Legacy completeness is unknown; absence is never deletion.
    }
    if (a.version !== 1 || !Array.isArray(a.manifest) || a.manifest.length > 10000 || !a.blobs || !a.optional || !['included','excluded'].includes(a.optional.sourceImages)) throw protocolError('failed','Invalid attachment manifest.');
    var ids = syncObj.projects.map(function(p) { return p.id; }), seen = new Set(), used = new Set(), decoded = [], total = 0;
    for (var e of a.manifest) {
      if (!e || typeof e.id !== 'string' || seen.has(e.id) || owner(e.id,ids) !== e.projectId) throw protocolError('failed','Duplicate or orphaned attachment.');
      seen.add(e.id);
      if (e.optional === true && e.excluded === true && e.id === 'source:' + e.projectId) continue;
      if (e.deleted === true) { decoded.push(e); continue; }
      if (e.required !== true || !/^sha256:[a-f0-9]{64}$/.test(e.contentId) || !Number.isSafeInteger(e.bytes) || e.bytes < 0 || !e.record || e.record.id !== e.id || e.record.projectId && e.record.projectId !== e.projectId) throw protocolError('failed','Invalid attachment identity: ' + e.id);
      var data = a.blobs[e.contentId];
      if (typeof data !== 'string') throw protocolError('pending','Missing required attachment: ' + e.id + '. Retry with the complete sync file.');
      var bytes;
      try { bytes = decodeBase64(data); } catch (_) { throw protocolError('failed','Invalid attachment encoding: ' + e.id); }
      total += bytes.length;
      if (total > maxSyncBytes * 0.75 || bytes.length !== e.bytes || await contentId(bytes) !== e.contentId) throw protocolError('failed','Attachment integrity check failed: ' + e.id);
      if (e.id === 'source:' + e.projectId) {
        if (a.optional.sourceImages !== 'included') throw protocolError('failed','Source image exclusion contradicts its manifest.');
        var sourceProject = syncObj.projects.find(function(p) { return p.id === e.projectId; });
        if (sourceProject.data.imgData !== new TextDecoder().decode(bytes)) throw protocolError('failed','Source image does not match its manifest.');
        used.add(e.contentId); continue;
      }
      used.add(e.contentId); decoded.push(Object.assign({},e,{blob:new Blob([bytes],{type:e.type || ''})}));
    }
    if (Object.keys(a.blobs).some(function(k) { return !used.has(k); })) throw protocolError('failed','Unreferenced attachment content.');
    for (var p of syncObj.projects) {
      if (p.data.settings && p.data.settings.traceImage && !a.manifest.some(function(e) { return e.id === 'trace:' + p.id && !e.deleted; })) throw protocolError('pending','Missing required tracing picture: ' + p.id);
    }
    for (var e of a.manifest) {
      if (e.deleted) continue;
      var partner = e.id.indexOf('photo:') === 0 ? e.id.replace(/^photo:/,'photothumb:') : e.id.indexOf('photothumb:') === 0 ? e.id.replace(/^photothumb:/,'photo:') : null;
      if (partner && !a.manifest.some(function(p) { return p.id === partner && !p.deleted; })) throw protocolError('pending','Missing required photo pair: ' + e.id);
    }
    return decoded;
  }

  return {verify:verify};
})();

if (typeof window !== "undefined") window.SyncAttachmentCodec = SyncAttachmentCodec;
if (typeof module !== "undefined" && module.exports) module.exports = SyncAttachmentCodec;
