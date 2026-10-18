/* Pattern Maker XSD 4.8.4.12 reader. Format provenance and limits: docs/xsd-import.md.
 * Written for stitchx; no third-party parser code is bundled.
 */
(function () {
  'use strict';
  const E = (typeof window !== 'undefined' && window.ImportEngine) || require('../types.js');
  const XSD_LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, cells: 250000, objects: 1000000, palette: 240 });

  function parseXSD(bytes, options) {
    options = options || {};
    let offset = 0;
    function fail(message, unsupported) {
      throw E.errors[unsupported ? 'UnsupportedError' : 'ParseError']('XSD: ' + message,
        { strategy: 'xsd', offset, verification: { status: 'invalid', reason: message } });
    }
    if (!ArrayBuffer.isView(bytes) || Object.prototype.toString.call(bytes) !== '[object Uint8Array]') fail('expected a byte array');
    if (bytes.length > XSD_LIMITS.bytes) fail('file exceeds the 16 MiB input limit');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function need(n) {
      if (!Number.isSafeInteger(n) || n < 0 || n > bytes.length - offset) fail('truncated data at byte ' + offset + ' (need ' + n + ' bytes)');
    }
    function skip(n) { need(n); offset += n; }
    function u8() { need(1); return bytes[offset++]; }
    function u16() { need(2); const v = view.getUint16(offset, true); offset += 2; return v; }
    function u32() { need(4); const v = view.getUint32(offset, true); offset += 4; return v; }
    // Only ASCII identifiers are used for catalogue lookup. Display text uses the
    // Windows Cyrillic encoding used by the compatible reader; see limitations.
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('windows-1251') : null;
    function text(n) {
      need(n); const start = offset; skip(n);
      let end = start; while (end < start + n && bytes[end]) end++;
      const b = bytes.subarray(start, end);
      if (typeof TextDecoder !== 'undefined') { try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (_) {} }
      return decoder ? decoder.decode(b) : Array.from(b, c => c < 128 ? String.fromCharCode(c) : '\uFFFD').join('');
    }
    const lossMap = new Map();
    function loss(kind, reason, count) {
      const key = kind + ': ' + reason;
      lossMap.set(key, (lossMap.get(key) || 0) + (count == null ? 1 : count));
    }
    if (u16() !== 0x0510) fail('not a recognised Pattern Maker binary file; XML Schema documents are not charts', true);
    skip(4);
    const v = [u16(), u16(), u16(), u16()];
    const version = [v[1], v[0], v[3], v[2]].join('.');
    if (version !== '4.8.4.12') fail('unsupported Pattern Maker version ' + version + '; supported version: 4.8.4.12', true);
    skip(727);
    const width = u16(), height = u16(), cells = width * height;
    if (!width || !height || cells > XSD_LIMITS.cells) fail('invalid dimensions ' + width + ' × ' + height + '; limit is 250,000 cells');
    const smallCount = u32(), jointCount = u16();
    if (smallCount > cells) fail('small-stitch buffer count exceeds the grid size');
    const spiX = u16(), spiY = u16();
    if (!spiX || !spiY || spiX > 100 || spiY > 100) fail('invalid fabric counts');
    skip(4);
    if (u16() !== 0x1600) fail('unsupported palette family (expected 0x1600)', true);
    const paletteSize = u16();
    if (!paletteSize || paletteSize > XSD_LIMITS.palette) fail('palette count must be between 1 and 240');
    need(paletteSize * 123);
    const sourcePalette = [];
    for (let i = 0; i < paletteSize; i++) {
      skip(2);
      const brand = u8(), number = text(11), name = text(41), rgb = [u8(), u8(), u8()];
      skip(1);
      const blendCount = u16();
      if (blendCount === 1 || blendCount > 4) fail('invalid blend component count ' + blendCount + ' in palette entry ' + i);
      const components = [];
      for (let j = 0; j < 4; j++) { const b = u8(), id = text(11); if (j < blendCount) components.push({ brand: b, id }); }
      for (let j = 0; j < 4; j++) { const strands = u8(); if (j < blendCount) { if (!strands || strands > 12) fail('invalid blend strand count'); components[j].strands = strands; } }
      const bead = u32();
      if (bead > 1) fail('invalid bead flag');
      const length = u16() / 10, diameter = u16() / 10;
      skip(2);
      sourcePalette.push({ brand, number, name, rgb, components, bead: !!bead, length, diameter });
    }
    // Palette display positions never remap the physical stitch palette indices.
    for (let i = 0; i < paletteSize; i++) { if (u16() >= paletteSize) fail('palette display position outside palette'); }
    for (let i = 0; i < paletteSize * 9; i++) skip(u16());
    skip(paletteSize * 16); // Per-type strand settings retained in original bytes, not the project model.
    skip(240 * 117); // Fixed-capacity display formats, not palette-sized.
    skip(paletteSize * 12); // Six symbols per palette entry; fonts are not portable.
    skip(380); // Pattern and print settings.
    skip(56); // Grid settings.
    const fabricName = text(41), fabricRGB = [u8(), u8(), u8()];
    skip(65);
    const title = text(41), author = text(41), company = text(41), copyright = text(201), notes = text(2049);
    skip(6); const fabricKind = text(41); skip(206);
    skip(52 + 32 + 16412 + 512); // Stitch/symbol settings, library and machine export.

    // Seeds are part of ordinary XSD serialization, not a password or external key.
    const seed = [u32(), u32(), u32(), u32()];
    let key = ((seed[0] & 255) << 24) | (((seed[1] >>> 8) & 255) << 16) | (((seed[2] >>> 16) & 255) << 8) | (seed[3] & 255);
    const shifts = Array.from({ length: 16 }, (_, i) => (seed[i >> 2] >>> (i % 4)) % 32);
    let seq = 0, random = seed[0];
    function word() {
      const value = (u32() ^ key ^ random) >>> 0;
      const shift = shifts[seq++ % 16];
      key = (key << shift) | (key >>> ((32 - shift) % 32));
      random = (random + seed[1]) >>> 0;
      return value;
    }
    const words = new Uint32Array(cells);
    let written = 0;
    while (written < cells) {
      const count = u32();
      if (!count || count > cells * 2) fail('invalid encoded block word count ' + count);
      need(count * 4);
      for (let i = 0; i < count; i++) {
        let value = word(), repeat = 1;
        if (value & 0x40000000) {
          repeat = (value & 0x3FFFFFFF) >>> 16;
          if (!repeat || ++i >= count) fail('invalid or truncated run-length pair');
          value = word();
        }
        if (repeat > cells - written) fail('run-length expansion exceeds declared grid');
        words.fill(value, written, written + repeat); written += repeat;
      }
    }
    need(smallCount * 10);
    const smallOffset = offset; skip(smallCount * 10);
    const modelCountOffset = offset;
    skip(2); const modelCount = u16();
    if (modelCount > 240) fail('special model count exceeds 240');

    let objectCount = 0;
    function object() { if (++objectCount > XSD_LIMITS.objects) fail('stitch object limit exceeded'); }
    const pattern = new Array(cells).fill(null).map(() => ({ id: '__skip__' }));
    const partialMap = new Map(), specialtyStitches = [], bsLines = [], knots = [], beads = [];
    const knotPositions = new Set();
    const catalogues = [options.dmc || [], options.anchor || []];
    const maps = catalogues.map(c => new Map(c.map(t => [String(t.id).toLowerCase(), t])));
    function component(b, id) {
      if (b > 1) return null;
      const t = maps[b].get(id.toLowerCase());
      return t ? Object.assign({}, t, b === 1 ? { brand: 'anchor' } : {}) : null;
    }
    function unresolved(p, reason) { p.unsupported = reason; return null; }
    const palette = sourcePalette.map(p => {
      if (p.bead) return unresolved(p, 'bead material referenced as a thread stitch');
      let t;
      if (p.components.length) {
        const c = p.components;
        if (c.length !== 2) return unresolved(p, 'blend has ' + c.length + ' components; exactly two are supported');
        if (c[0].brand !== c[1].brand) return unresolved(p, 'mixed-brand blend (XSD brands ' + c[0].brand + ' and ' + c[1].brand + ')');
        if (c[0].strands !== c[1].strands) return unresolved(p, 'unequal blend strand proportions ' + c[0].strands + ':' + c[1].strands);
        const threads = c.map(x => component(x.brand, x.id));
        if (threads.some(x => !x)) return unresolved(p, 'unresolved blend components: ' + c.filter((x,i) => !threads[i]).map(x => 'XSD brand ' + x.brand + ' number ' + x.id).join(', '));
        if (threads[0].id === threads[1].id) return unresolved(p, 'duplicate blend component ' + threads[0].id);
        t = { type: 'blend', id: threads.map(x => x.id).join('+'), threads, name: threads.map(x => x.name).join(' + ') };
        if (c[0].brand === 1) t.brand = 'anchor';
      } else {
        if (p.brand > 1) return unresolved(p, 'unsupported thread brand ' + p.brand);
        t = component(p.brand, p.number);
        if (!t) return unresolved(p, (p.brand === 1 ? 'Anchor' : 'DMC') + (maps[p.brand].size ? ' number ' + p.number + ' is unknown' : ' catalogue is unavailable'));
        t.type = 'solid';
      }
      return Object.assign(t, { rgb: p.rgb, lab: options.rgbToLab ? options.rgbToLab(...p.rgb) : p.rgb });
    });
    function thread(index, kind) {
      if (index >= paletteSize) fail(kind + ' palette index ' + index + ' outside palette of ' + paletteSize);
      if (!palette[index]) loss(kind, 'palette ' + index + ' (' + sourcePalette[index].number + '): ' + sourcePalette[index].unsupported);
      return palette[index];
    }
    function point(x, y) { if (x < 0 || y < 0 || x > width || y > height) fail('stitch coordinates outside chart: ' + x + ', ' + y); }
    let fullCells = 0, sourceFullCells = 0, imported = 0, sourceObjects = 0, unknownSmallCells = 0;
    for (let i = 0; i < cells; i++) {
      const w = words[i], kind = w >>> 24, x = i % width, y = Math.floor(i / width);
      if (kind === 15) continue;
      if (kind === 0) {
        object(); sourceObjects++; sourceFullCells++;
        const t = thread((w >>> 16) & 255, 'full cross');
        if (t) { pattern[i] = t; fullCells++; imported++; }
        continue;
      }
      // Small cells carry a 15-bit buffer index. Do not accept unknown high flags.
      if (!(w & 0x80000000)) fail('unsupported cell tag ' + kind + ' at cell ' + i, true);
      const index = (w >>> 16) & 0x7FFF;
      if (index >= smallCount) fail('small-stitch buffer index outside declared count');
      const b = bytes.subarray(smallOffset + index * 10, smallOffset + index * 10 + 10);
      // Bit 6 is the small-cell marker in the sectional interoperability fixture.
      // The fixture independently supplies expected half/quarter/petite geometry.
      if ((b[0] & ~127) || (b[1] & ~15)) {
        unknownSmallCells++;
        loss('fractional cell', 'unknown flags ' + (b[0] & ~127) + '/' + (b[1] & ~15) + '; all stitches in this cell omitted');
        continue;
      }
      const q = {};
      function part(bit, pi, quadrants) {
        if (!(b[0] & bit)) return;
        object(); sourceObjects++;
        const t = thread(b[pi], bit < 4 ? 'half cross' : 'quarter cross');
        if (!t) return;
        if (quadrants.some(k => q[k])) { loss('fractional cross', 'overlapping quadrants omitted'); return; }
        quadrants.forEach(k => { q[k] = t; }); imported++;
      }
      part(1, 2, ['TL','BR']); part(2, 3, ['BL','TR']);
      part(4, 4, ['TL']); part(8, 5, ['BL']); part(16, 6, ['TR']); part(32, 7, ['BR']);
      if (Object.keys(q).length) partialMap.set(i, q);
      for (let j = 0; j < 4; j++) if (b[1] & (1 << j)) {
        object(); sourceObjects++;
        const t = thread(b[4 + j], 'petite cross');
        if (t) { specialtyStitches.push({ uid: 'xsd-petite-' + i + '-' + j, type: 'petite', thread: t, x: x + (j >= 2 ? 0.5 : 0), y: y + (j % 2 ? 0.5 : 0) }); imported++; }
      }
    }

    // Read every variable-size joint, including unsupported objects, so neither
    // a bogus count nor an unknown kind can silently shift the following data.
    function joints(count, model) {
      need(count * 7);
      for (let i = 0; i < count; i++) {
        object();
        if (!model) sourceObjects++;
        const kind = u16();
        if (kind === 3) {
          skip(3); const n = u16(); need(n * 4);
          for (let j = 0; j < n; j++) { const x = u16() / 30, y = u16() / 30; if (!model) point(x, y); }
          if (!model) loss('curve', 'not represented in the canonical project');
          continue;
        }
        if (![1,2,4,5,6].includes(kind)) fail('unknown joint type ' + kind, true);
        if (kind === 4) {
          skip(2); const pi = u8(); skip(4); const x = u16() / 2, y = u16() / 2;
          skip(10); const mi = u16();
          if (!model) { point(x, y); if (pi >= paletteSize || mi >= modelCount) fail('special stitch palette or model index outside declared count'); loss('special stitch', 'motif model ' + mi + ' is not represented in the canonical project'); }
          continue;
        }
        skip(2); const x1 = u16() / 2, y1 = u16() / 2;
        let x2, y2, pi, rotation = 0;
        if (kind === 6) { pi = u8(); skip(1); rotation = u16(); }
        else { x2 = u16() / 2; y2 = u16() / 2; pi = u8(); skip(1); }
        if (model) continue;
        point(x1, y1);
        if (pi >= paletteSize) fail('joint palette index outside declared count');
        if (kind === 6) {
          if (![0,90,180,270].includes(rotation)) fail('unsupported bead rotation ' + rotation, true);
          const p = sourcePalette[pi];
          beads.push({ uid: 'xsd-bead-' + i, x: x1 * 2, y: y1 * 2, rgb: p.rgb, label: 'XSD brand ' + p.brand + ' ' + p.number });
          loss('bead', 'size and rotation are not represented in the canonical project'); imported++; continue;
        }
        if (kind === 2 || kind === 5) { point(x2, y2); if (x1 === x2 && y1 === y2) fail('zero-length line'); }
        const t = thread(pi, kind === 1 ? 'French knot' : kind === 2 ? 'backstitch' : 'straight stitch');
        if (!t) continue;
        if (kind === 1) {
          const pos = x1 + ',' + y1;
          if ((x1 * 2) % 2 !== (y1 * 2) % 2) { loss('French knot', 'edge-midpoint position cannot be retained'); continue; }
          if (knotPositions.has(pos)) { loss('French knot', 'duplicate position cannot be retained'); continue; }
          knotPositions.add(pos); knots.push(Object.assign({ x: x1 * 2, y: y1 * 2 }, t)); imported++;
        } else {
          if (kind === 5) specialtyStitches.push({ uid: 'xsd-long-' + i, type: 'long_stitch', thread: t, x1, y1, x2, y2 });
          else bsLines.push({ x1, y1, x2, y2, colorId: t.id, rgb: t.rgb, brand: t.brand, color: '#' + t.rgb.map(c => c.toString(16).padStart(2,'0')).join('') });
          imported++;
        }
      }
    }
    for (let i = 0; i < modelCount; i++) {
      if (u16() !== 4) fail('unsupported special model header', true);
      skip(2); if (text(4) !== 'sps1') fail('unsupported special model signature', true);
      text(256); text(256); skip(2);
      for (let j = 0; j < 3; j++) {
        skip(10); if (u16() !== 0x0510) fail('invalid special model section signature');
        joints(u16(), true);
      }
    }
    if (modelCount) loss('special stitch definition', 'motif geometry is not represented in the canonical project', modelCount);
    joints(jointCount, false);
    if (offset < bytes.length) loss('trailing data', (bytes.length - offset) + ' bytes are unrecognised; completeness is unverified');
    if (spiX !== spiY) loss('fabric', 'rectangular counts ' + spiX + ' × ' + spiY + ' reduced to horizontal count ' + spiX);
    if (!imported) fail('no supported stitch objects remain; ' + Array.from(lossMap, ([r,n]) => n + ' ' + r).join('; '), true);
    const losses = Array.from(lossMap, ([reason, count]) => ({ reason, count }));
    const warnings = losses.map(x => x.count + ' ' + x.reason + '.');
    warnings.push('XSD display fonts, print settings and per-type strand settings are not imported; undocumented header data is unverified. Compare the imported chart with the original.');
    const audit = { format: 'xsd', version, fullCells, sourceFullCells, sourceObjects, importedObjects: imported,
      unknownSmallCells, smallBuffers: smallCount, joints: jointCount, modelCount, modelCountOffset, losses };
    const project = { v: 8, w: width, h: height, name: title || options.name || '',
      settings: { sW: width, sH: height, fabricCt: spiX }, pattern, bsLines, partialStitches: Array.from(partialMap),
      specialtyVersion: 1, specialtyStitches, knots, beads, done: null, parkMarkers: [], totalTime: 0, sessions: [], threadOwned: {},
      meta: { title, author, company, copyright, notes, fabricName, fabricRGB, fabricKind, xsdPalette: sourcePalette },
      _import: { xsd: audit } };
    return { grid: [], legend: [], meta: { publisher: 'xsd', title }, flags: { warnings, uncertainCells: 0 }, _legacyProject: project, _xsdAudit: audit };
  }
  const api = { parseXSD, XSD_LIMITS };
  if (typeof window !== 'undefined') window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
