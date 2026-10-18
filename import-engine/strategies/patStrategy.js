/* PCStitch 7 PAT: independent implementation from published layout observations.
 * Provenance, initial matrix and validation limits: docs/pcstitch-pat-import.md.
 * Never search for embedded palettes, decompress or decode protected variants.
 */
(function () {
  'use strict';
  const E = typeof window !== 'undefined' ? window.ImportEngine : require('../types.js');
  const Reader = typeof window !== 'undefined' ? E.BinaryReader : require('../binary/reader.js').BinaryReader;
  const MAX_BYTES = 16 * 1024 * 1024, MAX_CELLS = 1000000, MAX_OBJECTS = 250000;
  const QUADRANTS = { 2: ['TL','TR','BL'], 3: ['TL','TR','BR'], 4: ['TL','BL','BR'], 5: ['TR','BL','BR'],
    6: ['TL','BR'], 7: ['TR','BL'], 9: ['TL'], 10: ['TR'], 11: ['BL'], 12: ['BR'] };
  function header(bytes) {
    let s = '';
    for (let i = 0; i < Math.min(40, bytes.length); i++) s += String.fromCharCode(bytes[i]);
    return /^PCStitch ([0-9]{1,2}) Pattern File(?=[\x00 \r\n]|$)/.exec(s);
  }
  function parsePAT(bytes, name) {
    const fail = message => { throw E.errors.ParseError(message, { strategy: 'pat' }); };
    const sig = header(bytes);
    if (!sig) fail('Not a recognised PCStitch PAT signature. Other .pat formats are not supported.');
    if (sig[1] !== '7') throw E.errors.UnsupportedError('PCStitch PAT version ' + sig[1] + ' is unsupported. Save an unprotected version 7 copy or export a PDF in the source program.', { strategy: 'pat', version: sig[1] });
    if (bytes.length > MAX_BYTES) fail('PCStitch PAT exceeds the 16 MiB import limit.');
    try {
      const r = new Reader(bytes);
      r.skip(256); r.skip(8);
      const w = r.u16(), h = r.u16(), cells = w * h;
      if (!w || !h || w > 4000 || h > 4000 || cells > MAX_CELLS) fail('Unreasonable PCStitch dimensions; maximum 4,000 per side and 1,000,000 cells.');
      const fabricX = r.u16(), fabricY = r.u16();
      const fabricRgb = [r.u8(), r.u8(), r.u8()]; r.skip(1);
      const metadata = {};
      for (const key of ['author','copyright','title','fabric','instructions','keywords','website']) metadata[key] = r.text(r.u16()).replace(/\x00.*$/s, '');
      const stitchStrands = r.u16(), backstitchStrands = r.u16();
      // The palette marker is exactly 25 bytes, not a searchable offset.
      if (r.text(25) !== 'PCStitch Floss Palette!!!') fail('Unsupported or damaged PCStitch 7 palette layout. Export an unprotected copy from the source program.');
      r.skip(4);
      const nPalette = r.u16();
      if (nPalette > 254) fail('Unsupported PCStitch palette size (maximum 254).');
      r.require(nPalette * 250);
      const notes = new Map();
      function note(key, message, count) {
        const old = notes.get(key);
        notes.set(key, { message, count: (old ? old.count : 0) + (count || 1) });
      }
      const clean = s => s.replace(/\x00.*$/s, '').trim();
      const palette = [];
      for (let i = 0; i < nPalette; i++) {
        const start = r.offset;
        const scheme = clean(r.text(33)), sourceId = clean(r.text(10)), description = clean(r.text(30));
        r.skip(4);
        const rgb = [r.u8(), r.u8(), r.u8()]; r.skip(1);
        r.skip(81 + 30 + 7 + 30 + 4 + 10 + 7);
        if (r.offset - start !== 250) fail('Invalid palette record length.');
        const brand = /^dmc$/i.test(scheme) ? 'dmc' : null;
        const simple = /^(?:[0-9]+|B5200|Blanc|White|Ecru)$/i.test(sourceId) && brand;
        let id = sourceId;
        if (brand === 'dmc') {
          if (/^white$|^blanc$/i.test(id)) id = 'Blanc';
          if (/^5200$|^b5200$/i.test(id)) id = 'B5200';
          if (/^ecru$/i.test(id)) id = 'Ecru';
        }
        // Composite and unknown entries remain explicit placeholders, never a nearest-colour substitution.
        const thread = simple ? { id, type: 'solid', brand, rgb, name: description || id } :
          { id: 'U' + (i + 1), type: 'solid', brand: 'custom', rgb, name: [scheme, sourceId, description].filter(Boolean).join(' ') || 'Unresolved PAT thread' };
        if (!simple) note('palette', 'Unresolved or blended palette entries retained as placeholders; assign their threads after comparing with the source.', 1);
        palette.push({ index: i + 1, scheme, sourceId, description, rgb, thread });
      }
      const full = new Map(), partial = new Map(), bsLines = [];
      let objects = 0, sourceObjects = 0, retainedObjects = 0, runCells = 0;
      function threadAt(index) {
        if (index < 1 || index > palette.length) fail('Invalid PCStitch thread reference ' + index + '.');
        return palette[index - 1].thread;
      }
      function cell(x, y) {
        if (x < 0 || y < 0 || x >= w || y >= h) fail('PCStitch stitch coordinate is outside the chart.');
        return y * w + x;
      }
      function add(x, y, colour, type, count) {
        if (type === 255 && colour === 255) return;
        if (type === 255 || colour === 255) fail('Inconsistent empty PCStitch stitch record.');
        const t = threadAt(colour);
        sourceObjects += count || 1;
        if (++objects > MAX_OBJECTS) fail('Too many PCStitch stitch objects.');
        const index = cell(x, y);
        if (type !== 1 && !QUADRANTS[type]) { note('type-' + type, 'Unsupported PCStitch stitch type ' + type + ' omitted.'); return; }
        if (type === 1) {
          if (full.has(index) || partial.has(index)) fail('Overlapping PCStitch full and fractional stitches cannot be represented without loss.');
          full.set(index, t);
        } else {
          if (full.has(index)) fail('Overlapping PCStitch full and fractional stitches cannot be represented without loss.');
          const old = partial.get(index) || {};
          if (QUADRANTS[type].some(q => old[q])) fail('Overlapping PCStitch fractional quadrants cannot be represented without loss.');
          QUADRANTS[type].forEach(q => { old[q] = t; });
          partial.set(index, old);
        }
        retainedObjects++;
      }
      while (runCells < cells) {
        const n = r.u16(), colour = r.u8(), type = r.u8();
        if (!n || n > cells - runCells) fail('Invalid PCStitch run length.');
        for (let j = 0; j < n; j++) {
          const pos = runCells + j;
          add(Math.floor(pos / h), pos % h, colour, type);
        }
        runCells += n;
      }
      const extras = r.count(12, MAX_OBJECTS);
      for (let i = 0; i < extras; i++) {
        const x = r.u16() - 1, y = r.u16() - 1; cell(x, y);
        for (let j = 0; j < 4; j++) { const colour = r.u8(), type = r.u8(); add(x, y, colour, type); }
      }
      // Knot snap-point semantics are not sufficiently verified for this initial scope.
      const knots = r.count(6, MAX_OBJECTS);
      for (let i = 0; i < knots; i++) {
        const x = r.u16(), y = r.u16(); threadAt(r.u16());
        if (!x || !y || x > 2 * w + 1 || y > 2 * h + 1) fail('Invalid PCStitch knot coordinate.');
      }
      if (knots) note('knots', 'French knots omitted; recover them from the source.', knots);
      const lines = r.count(14, MAX_OBJECTS);
      function point(x, y, snap) {
        if (snap < 1 || snap > 9 || !x || !y) fail('Invalid PCStitch backstitch snap point.');
        const px = x - 1 + ((snap - 1) % 3) / 2, py = y - 1 + Math.floor((snap - 1) / 3) / 2;
        if (px > w || py > h) fail('PCStitch backstitch endpoint is outside the chart.');
        return [px, py];
      }
      for (let i = 0; i < lines; i++) {
        const a = point(r.u16(), r.u16(), r.u16()), b = point(r.u16(), r.u16(), r.u16()), t = threadAt(r.u16());
        if (a[0] === b[0] && a[1] === b[1]) fail('Zero-length PCStitch backstitch.');
        bsLines.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], colorId: t.id, brand: t.brand, rgb: t.rgb,
          color: '#' + t.rgb.map(v => v.toString(16).padStart(2, '0')).join('') });
      }
      if (r.offset < bytes.length) note('trailing', 'Unrecognised trailing bytes retained in the original source; additional objects may be missing.', bytes.length - r.offset);
      if (fabricX !== fabricY || !fabricX) note('fabric', 'Non-square or unspecified fabric count approximated by a single count; check Materials.');
      // Always limited: neither public reader decodes all header/palette fields (including blends).
      const warnings = ['PCStitch 7: header options, symbols, blends and custom palette attributes are unverified. Compare every thread with the source; use an OXS or PDF export for unsupported content.'];
      notes.forEach(n => warnings.push(n.message + ' Count: ' + n.count + '.'));
      // Allocate the canonical dense grid only after all record lengths/counts/coordinates have passed.
      const pattern = Array.from({ length: cells }, () => ({ id: '__skip__' }));
      full.forEach((t, i) => { pattern[i] = Object.assign({}, t); });
      const evidence = { version: 7, sourceCells: cells, decodedCells: runCells, sourceObjects: sourceObjects + knots + lines,
        retainedObjects: retainedObjects + lines, unsupported: Array.from(notes.keys()), paletteVerified: false };
      return { v: 8, w, h, name: metadata.title || name || '', designer: metadata.author,
        settings: { sW: w, sH: h, fabricCt: fabricX || 14 }, pattern, partialStitches: Array.from(partial.entries()),
        bsLines, done: null, sessions: [], parkMarkers: [], threadOwned: {}, totalTime: 0,
        meta: { pcstitch: { version: 7, metadata, fabricX, fabricY, fabricRgb, stitchStrands, backstitchStrands, palette } },
        importReport: { warnings, pat: evidence, placeholders: palette.filter(p => p.thread.brand === 'custom').map(p => ({ id: p.thread.id, name: [p.scheme, p.sourceId].join(' '), rgb: p.rgb })) } };
    } catch (err) {
      if (err.name === 'ImportParseError') throw err;
      fail(err.message || String(err));
    }
  }
  const patStrategy = {
    id: 'pat', formats: ['pat'],
    async canHandle(probe) { return probe && header(probe.bytes || []) ? 1 : 0; },
    async parse(probe) {
      const project = parsePAT(await probe.fullBytes(), (probe.fileName || '').replace(/\.[^.]+$/, ''));
      return { grid: [], legend: [], meta: { publisher: 'PCStitch 7', title: project.name }, flags: { warnings: project.importReport.warnings.slice() }, _legacyProject: project };
    }
  };
  const api = { parsePAT, patStrategy, patHeader: header, PAT_MAX_BYTES: MAX_BYTES };
  if (typeof window !== 'undefined') { Object.assign(E, api); if (E.register) E.register(patStrategy); }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
