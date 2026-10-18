/* Bounds-checked little-endian reader. No format-specific layout assumptions. */
(function () {
  'use strict';
  class BinaryReader {
    constructor(bytes) {
      if (!(bytes instanceof Uint8Array)) throw new Error('Expected binary bytes.');
      this.bytes = bytes;
      this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this.offset = 0;
    }
    require(n) {
      if (!Number.isSafeInteger(n) || n < 0 || n > this.bytes.length - this.offset) {
        throw new Error('Truncated binary record at byte ' + this.offset + '.');
      }
    }
    skip(n) { this.require(n); this.offset += n; }
    u8() { this.require(1); return this.view.getUint8(this.offset++); }
    u16() { this.require(2); const v = this.view.getUint16(this.offset, true); this.offset += 2; return v; }
    u32() { this.require(4); const v = this.view.getUint32(this.offset, true); this.offset += 4; return v; }
    text(n) {
      this.require(n);
      let s = '';
      for (let end = this.offset + n; this.offset < end; this.offset++) s += String.fromCharCode(this.bytes[this.offset]);
      return s;
    }
    count(size, limit) {
      const n = this.u32();
      if (n > limit || n > Math.floor((this.bytes.length - this.offset) / size)) throw new Error('Invalid binary record count at byte ' + (this.offset - 4) + '.');
      return n;
    }
  }
  if (typeof window !== 'undefined') window.ImportEngine = Object.assign(window.ImportEngine || {}, { BinaryReader });
  if (typeof module !== 'undefined' && module.exports) module.exports = { BinaryReader };
})();
