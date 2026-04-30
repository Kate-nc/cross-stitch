/* import-engine/classifier/sniffMagic.js — format detection.
 *
 * Looks at the first ~256 bytes plus the file extension/MIME to guess the
 * file format. Returns { format, confidence }.
 *
 * Confidence ladder:
 *   1.0  — magic bytes are unambiguous (e.g. "%PDF-")
 *   0.9  — magic bytes match + extension agrees
 *   0.7  — extension only (no magic match)
 *   0.6  — MIME only
 *   0    — nothing matched
 */

(function () {
  'use strict';

  // Magic-byte signatures. Order matters: more specific first.
  const SIGNATURES = [
    { fmt: 'pdf',   bytes: [0x25, 0x50, 0x44, 0x46, 0x2D] },                    // "%PDF-"
    { fmt: 'image', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },  // PNG
    { fmt: 'image', bytes: [0xFF, 0xD8, 0xFF] },                                // JPEG
    { fmt: 'image', bytes: [0x47, 0x49, 0x46, 0x38] },                          // GIF
    { fmt: 'image', bytes: [0x42, 0x4D] },                                      // BMP
    { fmt: 'image', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0,                 // RIFF…WEBP
                    requireFollowing: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
  ];

  function sniffMagic(probe) {
    if (!probe) return { format: 'unknown', confidence: 0 };
    const bytes = probe.bytes || new Uint8Array(0);
    const ext = extOf(probe.fileName || '');
    const mime = (probe.mimeType || '').toLowerCase();

    // 1. Try magic bytes.
    let magicFmt = null;
    for (const sig of SIGNATURES) {
      if (matches(bytes, sig)) { magicFmt = sig.fmt; break; }
    }

    // Text-y formats need a textual sniff.
    if (!magicFmt) {
      const head = decodeAscii(bytes, 0, 256).trimStart();
      if (head.startsWith('<?xml') || /^<chart\b|^<oxs\b|^<pattern\b/i.test(head)) magicFmt = 'oxs';
      else if (head.startsWith('{') || head.startsWith('[')) magicFmt = 'json';
    }

    // 2. Extension hint.
    const extFmt = extToFormat(ext);
    // 3. MIME hint.
    const mimeFmt = mimeToFormat(mime);

    if (magicFmt) {
      const conf = (extFmt === magicFmt) ? 1.0 : 0.9;
      return { format: magicFmt, confidence: conf };
    }
    if (extFmt) return { format: extFmt, confidence: 0.7 };
    if (mimeFmt) return { format: mimeFmt, confidence: 0.6 };
    return { format: 'unknown', confidence: 0 };
  }

  function matches(bytes, sig) {
    const off = sig.offset || 0;
    if (bytes.length < off + sig.bytes.length) return false;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (bytes[off + i] !== sig.bytes[i]) return false;
    }
    if (sig.requireFollowing) {
      return matches(bytes, sig.requireFollowing);
    }
    return true;
  }

  function decodeAscii(bytes, start, len) {
    const end = Math.min(bytes.length, start + len);
    let s = '';
    for (let i = start; i < end; i++) {
      const b = bytes[i];
      // Stop at NUL.
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s;
  }

  function extOf(name) {
    const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function extToFormat(ext) {
    if (!ext) return null;
    if (ext === 'pdf') return 'pdf';
    if (ext === 'oxs' || ext === 'xml') return 'oxs';
    if (ext === 'json') return 'json';
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].indexOf(ext) >= 0) return 'image';
    return null;
  }

  function mimeToFormat(mime) {
    if (!mime) return null;
    if (mime === 'application/pdf') return 'pdf';
    if (mime === 'application/json') return 'json';
    if (mime.indexOf('xml') >= 0) return 'oxs';
    if (mime.indexOf('image/') === 0) return 'image';
    return null;
  }

  const api = { sniffMagic };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
