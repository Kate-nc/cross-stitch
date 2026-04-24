/**
 * tests/pdfWorkerTransferable.test.js
 *
 * Safety net for deferred item #3 — Transferable PDF payloads
 * (perf-6). Verifies the worker's buildResultMessage helper:
 *   - whole-buffer Uint8Array transfers bytes.buffer directly
 *   - view Uint8Array (byteOffset > 0) falls back to .slice()
 *   - flag OFF always uses the legacy .slice() path
 *   - the bytes survive a real ArrayBuffer transfer (postMessage
 *     simulator) and decode identically
 */

const fs = require("fs");
const path = require("path");

const workerSrc = fs.readFileSync(
  path.resolve(__dirname, "..", "pdf-export-worker.js"),
  "utf8"
);

// Pull just buildResultMessage out of the worker source. We can't run the
// worker as-is (it calls importScripts), so extract the helper with regex.
function extractFn(src, name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\([\\s\\S]*?\\n\\}", "m");
  const m = src.match(re);
  if (!m) throw new Error("could not extract " + name);
  return m[0];
}

function loadHelper(opts) {
  opts = opts || {};
  // eslint-disable-next-line no-new-func
  return new Function(
    "selfFlags",
    [
      "var self = { PERF_FLAGS: selfFlags || {} };",
      extractFn(workerSrc, "buildResultMessage"),
      "return buildResultMessage;",
    ].join("\n")
  )(opts.flags || {});
}

describe("buildResultMessage — whole buffer", () => {
  test("transfers bytes.buffer directly when buffer is fully owned", () => {
    const buildResultMessage = loadHelper({
      flags: { transferablePdfResult: true },
    });
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const out = buildResultMessage(7, bytes);
    expect(out.message.type).toBe("result");
    expect(out.message.reqId).toBe(7);
    expect(out.message.pdfBytes).toBe(bytes.buffer); // same identity
    expect(out.transferList).toEqual([bytes.buffer]);
  });

  test("returned buffer round-trips through a simulated transfer", () => {
    const buildResultMessage = loadHelper({
      flags: { transferablePdfResult: true },
    });
    const original = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const out = buildResultMessage(1, original);
    // Mimic the receiver: wrap in a Uint8Array view.
    const view = new Uint8Array(out.message.pdfBytes);
    expect(Array.from(view)).toEqual([10, 20, 30, 40, 50, 60]);
  });
});

describe("buildResultMessage — sub-view", () => {
  test("falls back to .slice() when bytes is a view into a larger buffer", () => {
    const buildResultMessage = loadHelper({
      flags: { transferablePdfResult: true },
    });
    const big = new Uint8Array([0, 0, 1, 2, 3, 4, 0, 0]);
    const view = new Uint8Array(big.buffer, 2, 4); // [1,2,3,4]
    const out = buildResultMessage(2, view);
    expect(out.message.pdfBytes).not.toBe(big.buffer);
    expect(out.transferList).toHaveLength(1);
    expect(out.transferList[0]).toBe(out.message.pdfBytes);
    expect(out.message.pdfBytes.byteLength).toBe(4);
    const decoded = new Uint8Array(out.message.pdfBytes);
    expect(Array.from(decoded)).toEqual([1, 2, 3, 4]);
  });
});

describe("buildResultMessage — flag OFF (legacy path)", () => {
  test("always uses .slice() when transferablePdfResult is false", () => {
    const buildResultMessage = loadHelper({
      flags: { transferablePdfResult: false },
    });
    const bytes = new Uint8Array([9, 8, 7, 6]);
    const out = buildResultMessage(3, bytes);
    expect(out.message.pdfBytes).not.toBe(bytes.buffer);
    expect(out.message.pdfBytes.byteLength).toBe(4);
    expect(Array.from(new Uint8Array(out.message.pdfBytes))).toEqual([
      9,
      8,
      7,
      6,
    ]);
  });
});

describe("buildResultMessage — defaults", () => {
  test("flag defaults to true when PERF_FLAGS is absent", () => {
    // Construct without flags; the helper should still treat the flag
    // as enabled (default-on per perf-flag convention).
    const buildResultMessage = loadHelper({ flags: {} });
    const bytes = new Uint8Array([1, 2, 3]);
    const out = buildResultMessage(0, bytes);
    expect(out.message.pdfBytes).toBe(bytes.buffer);
  });
});
