/* pdf-picture-pixels.js: the byte-level conversion of a picture pdf.js has decoded into RGBA pixels on white.
 *
 * rawToRgba expands the raw bytes pdf.js hands over in Node (1-bit grey, grey, RGB or RGBA, told apart by the
 * image's kind or, failing that, by how many bytes there are a pixel) into a new RGBA buffer, or returns null
 * when the bytes cannot be read as any of those. onWhite then lays that buffer, however it was got, over white
 * so transparency shows the paper, and returns the opaque { w, h, data } the importer keys and compares symbols by.
 * Both take their inputs as arguments and return a result: they read no pdf.js, DOM, canvas, storage or timer,
 * are not asynchronous, and never write to the image or buffer they are given. Each allocates exactly the one
 * w * h * 4 buffer it returns, and keeps nothing.
 *
 * pdf-importer.js keeps pictureRgba, which checks the size, draws a browser's ImageBitmap through its canvas
 * (the canvas stays there, with the importer's canvasFactory option) and calls these for the rest. Loaded as a
 * plain <script> before pdf-importer.js by every page that lazy-loads the importer and by
 * import-engine/strategies/pdfGlyphStrategy.js, from sw.js's precache list, and by require() in tests.
 */
(function () {

  /**
   * Raw decoded bytes as RGBA, or null if they do not fit any layout.
   *
   * kind 1 is 1 bit a pixel, rows padded to whole bytes, a set bit white; otherwise the channel count is 4 for
   * kind 3, 3 for kind 2, and the bytes per pixel rounded for anything else (1 to 4 are readable). Channels
   * beyond those present repeat the last one, and only four channels carry alpha.
   *
   * The pixel buffer is allocated before the layout is checked, so an absurd w * h throws a RangeError here
   * rather than returning null.
   */
  function rawToRgba(img, w, h) {
    const d = img.data, n = w * h;
    const src = new Uint8ClampedArray(n * 4);
    if (img.kind === 1) {
      // 1 bit per pixel, rows padded to whole bytes; a set bit is white.
      const rowBytes = (w + 7) >> 3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = (d[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
        const o = (y * w + x) * 4;
        src[o] = src[o + 1] = src[o + 2] = v; src[o + 3] = 255;
      }
    } else {
      const ch = img.kind === 3 ? 4 : img.kind === 2 ? 3 : Math.round(d.length / n);
      if (!(ch >= 1 && ch <= 4) || d.length < n * ch) return null;
      for (let i = 0; i < n; i++) {
        src[i * 4] = d[i * ch];
        src[i * 4 + 1] = d[i * ch + Math.min(1, ch - 1)];
        src[i * 4 + 2] = d[i * ch + Math.min(2, ch - 1)];
        src[i * 4 + 3] = ch === 4 ? d[i * ch + 3] : 255;
      }
    }
    return src;
  }

  /** RGBA pixels laid over white: transparency shows the paper. Returns a new opaque { w, h, data }. */
  function onWhite(src, w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const a = src[i * 4 + 3] / 255;
      for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(src[i * 4 + k] * a + 255 * (1 - a));
      data[i * 4 + 3] = 255;
    }
    return { w, h, data };
  }

  var api = { rawToRgba: rawToRgba, onWhite: onWhite };

  if (typeof window !== 'undefined') window.PdfPicturePixels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
