/* sync-compress-worker.js: encodes and deflates a sync file off the main thread.
 *
 * SyncEngine.compressAsync() posts the file's JSON text here; this answers with
 * the zlib ("deflate") bytes, the same format pako.deflate() writes and
 * SyncEngine.decompress() (pako.inflate) reads. A large library's file is tens
 * of megabytes of JSON, and encoding plus deflating it took seconds of main
 * thread at phone speed (the automatic folder export, the sync relay, WebDAV).
 *
 * Uses the browser's CompressionStream, so nothing is imported. The engine
 * falls back to pako on the main thread when workers or CompressionStream are
 * missing, or this fails.
 *
 * Message in:  { id, json }       Message out: { id, ok: true, bytes: ArrayBuffer } (transferred)
 *                                               { id, ok: false, error }
 */
/* global self */
self.onmessage = function (event) {
  var msg = event.data || {};
  var id = msg.id;
  Promise.resolve().then(function () {
    if (typeof msg.json !== 'string') throw new Error('Nothing to compress.');
    if (typeof CompressionStream !== 'function') throw new Error('CompressionStream is not available.');
    var bytes = new TextEncoder().encode(msg.json);
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Response(stream).arrayBuffer();
  }).then(function (buffer) {
    self.postMessage({ id: id, ok: true, bytes: buffer }, [buffer]);
  }, function (err) {
    self.postMessage({ id: id, ok: false, error: String((err && err.message) || err) });
  });
};
