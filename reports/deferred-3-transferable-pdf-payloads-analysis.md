# Deferred Item 3 — Transferable PDF payloads

## Background

Audit `reports/perf-6-payload-serialization.md` item #4 flagged the
PDF export worker handoff as a perf hotspot. Two transfer paths sit
on the worker boundary:

- **Main → Worker** (`{ project, options }`) — large, mostly the
  pattern array
- **Worker → Main** (`{ pdfBytes }`) — the produced PDF (often 1–10 MB)

This item was deferred because Transferable mechanics are easy to get
wrong: once an `ArrayBuffer` is in the transfer list, the source side's
view becomes a zero-length, neutered buffer. Any subsequent read
silently returns nothing.

## What the code does today

[pdf-export-worker.js](pdf-export-worker.js#L85)

```js
buildPdf(msg.project, msg.options || {}, reqId).then(function (bytes) {
  var ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  self.postMessage({ type: "result", reqId: reqId, pdfBytes: ab }, [ab]);
});
```

`bytes` is the `Uint8Array` returned by `pdf-lib`'s `save()`. The line
above:

1. **Allocates a new ArrayBuffer** the same size as the PDF and copies
   every byte from `bytes` into it (`bytes.buffer.slice(...)`).
2. Posts that copy with the buffer in the transfer list.

Net effect: the PDF is duplicated in worker memory before transfer.
For a 5 MB chart that's a wasted 5 MB allocation/copy on top of the
already-finished pdf-lib output.

The receiver in [creator/pdfExport.js](creator/pdfExport.js#L42):

```js
slot.resolve(new Uint8Array(msg.pdfBytes));
```

`msg.pdfBytes` is an `ArrayBuffer`; wrapping it in `new Uint8Array(buf)`
is a zero-copy view, which is fine.

## Risks (why this was deferred)

1. The `.slice()` is acting as a defensive isolation barrier. If we
   transfer `bytes.buffer` directly and any subsequent line in the
   worker (logging, retry, error handler, future feature) tries to
   read `bytes`, that read will silently return zeros.
2. pdf-lib *could* in principle return a `Uint8Array` that is a view
   into a larger buffer (`byteOffset > 0`). Transferring its full
   `.buffer` would then transfer extra bytes the receiver doesn't
   expect, and corrupt whatever else lives in that buffer (in
   practice pdf-lib doesn't do this, but we shouldn't assume).
3. The audit's broader recommendation to also convert the inbound
   `pattern` array to `Uint16Array` palette indices and transfer it
   (Main → Worker) requires a substantial worker refactor — out of
   scope for a "targeted optimization".

## Design

### Narrow change: skip the redundant `.slice()` copy

If `bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength`,
we can transfer `bytes.buffer` directly with no copy. Otherwise we
fall back to the `.slice()` path (correctness over speed).

Either way, `bytes` is the **last reference** in the worker — the
function returns immediately after `postMessage`, so the
`Promise.then` callback's local goes out of scope. The defensive
isolation is unnecessary here.

### Helper

`buildResultMessage(reqId, bytes, opts)` returns
`{ message, transferList }`. Pulled out so it's unit-testable:

- decides whether the buffer is "whole" (and thus safe to transfer
  directly) or needs slicing
- honours the feature flag

### Feature flag

`self.PERF_FLAGS.transferablePdfResult` (default **true**). When
false, falls back to the byte-for-byte legacy `.slice()` path.

The flag lives on `self` because the worker doesn't share `window`.
It can be set by injecting `self.PERF_FLAGS = ...` before the
`importScripts` line, but in practice the default is the right
value and we don't expose it through the UI.

### Out of scope

The Main → Worker direction (pattern + palette payload) is **not**
changed. That's a format refactor, not a transferable opt — call
sites and the entire worker chart-rendering loop would need rewriting
to consume `Uint16Array` palette indices instead of `{id,type,rgb}`
objects. Captured as a follow-up below.

## Expected gain

Eliminates one full copy of the produced PDF inside the worker. For a
typical Pattern Keeper export of a 200×200 pattern (~3 MB PDF) that is:

- one fewer 3 MB allocation
- one fewer 3 MB byte-copy (~5–10 ms on a typical laptop)
- correspondingly less GC pressure inside the worker

Receiver-side throughput is unchanged — both paths end up with a
`Uint8Array` view on a transferred `ArrayBuffer`.

## Implementation summary

- [pdf-export-worker.js](pdf-export-worker.js):
  - `self.PERF_FLAGS.transferablePdfResult` default true
  - `buildResultMessage(reqId, bytes)` helper exported for tests
    via `self.__pdfWorkerInternals = { buildResultMessage }`
  - `self.onmessage` `result` path uses the helper
- No change in [creator/pdfExport.js](creator/pdfExport.js): the
  `new Uint8Array(msg.pdfBytes)` receiver works for both paths

Tests added (`tests/pdfWorkerTransferable.test.js`):

- whole-buffer Uint8Array → transfers `bytes.buffer` directly,
  transfer list contains exactly that buffer, message
  `pdfBytes === bytes.buffer`
- view Uint8Array (byteOffset > 0) → falls back to `.slice()`
- flag OFF → always uses the legacy `.slice()` path
- bytes that round-trip through a transfer give back identical contents
- error case (null bytes) → throws / does not post

## Validation

- Full Jest suite (62 suites / 678 tests) passes both with the flag
  on and off.
- The receiver code path is unchanged (`new Uint8Array(msg.pdfBytes)`
  works for both `ArrayBuffer` argument shapes).

## Caveats / follow-ups

- Main → Worker payload optimisation (Uint16Array palette index +
  transferable pattern buffer) remains a worthwhile but architectural
  change. Recommended only when the worker code is restructured for
  another reason.
- The flag stays in place. If a future pdf-lib upgrade returns a
  view-into-shared-buffer Uint8Array, the helper's whole-buffer
  detection prevents corruption automatically.
