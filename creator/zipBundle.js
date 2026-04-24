/* creator/zipBundle.js — C6: pack PDF + OXS + PNG + JSON + manifest into a single .zip
 *
 * Public surface:
 *   window.ZipBundle.build(inputs, options) → Promise<Blob>
 *     inputs = {
 *       projectName:    string,
 *       schemaVersion:  number,           // typically 11
 *       pdfBytes:       Uint8Array|null,  // omit if PDF unavailable
 *       oxsString:      string|null,
 *       pngBlob:        Blob|null,
 *       projectJson:    object|string|null,
 *       appVersion:     string|undefined  // optional
 *     }
 *     options = { onProgress?: fn(stage,msg) }
 *
 *   window.ZipBundle._slugify(name)
 *   window.ZipBundle._filename(projectName, schemaVersion, date)
 *   window.ZipBundle._buildManifest({projectName, schemaVersion, generatedAt, files, appVersion})
 *   window.ZipBundle._serializeOxs(project)   // { width, height, pattern, bsLines, palette? }
 *
 * Pure helpers are exported via module.exports for Jest tests; window
 * assignments handle the browser-side surface.
 *
 * JSZip is loaded lazily via window.loadScript (CDN script tag in index.html
 * also makes it available eagerly on the Creator page).
 */

(function () {
  var SCHEMA_DEFAULT = 11;

  // ───────────────────────────────────────── slug + filename ────────────
  function _slugify(name) {
    var s = String(name == null ? '' : name).toLowerCase();
    // Strip diacritics (NFKD normalise, drop combining marks).
    try { s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (s.length > 48) s = s.slice(0, 48).replace(/-+$/, '');
    return s || 'pattern';
  }

  function _pad(n) { return n < 10 ? '0' + n : '' + n; }

  function _filename(projectName, schemaVersion, date) {
    var d = date instanceof Date ? date : new Date();
    var stamp = d.getFullYear() + _pad(d.getMonth() + 1) + _pad(d.getDate())
              + '-' + _pad(d.getHours()) + _pad(d.getMinutes());
    var v = (schemaVersion == null ? SCHEMA_DEFAULT : schemaVersion);
    return _slugify(projectName) + '-' + stamp + '-v' + v + '.zip';
  }

  // ─────────────────────────────────────────── manifest ─────────────────
  function _buildManifest(opts) {
    opts = opts || {};
    var generatedAt = opts.generatedAt || new Date().toISOString();
    var files = (opts.files || []).map(function (f) {
      var entry = { name: f.name, bytes: f.bytes | 0 };
      if (f.format) entry.format = f.format;
      return entry;
    });
    return {
      app: 'cross-stitch',
      appVersion: opts.appVersion || 'unknown',
      bundleVersion: 1,
      generatedAt: generatedAt,
      name: String(opts.projectName == null ? '' : opts.projectName),
      version: opts.schemaVersion == null ? SCHEMA_DEFAULT : opts.schemaVersion,
      files: files
    };
  }

  // ─────────────────────────────────────────── OXS writer ───────────────
  // Minimal XML writer that round-trips through parseOXS in import-formats.js.
  // Emits palette entries (with DMC number + RGB) and fullstitch positions,
  // plus backstitch lines if present. Blend cells are flattened to their first
  // DMC component (parseOXS doesn't model blends as a single cell).
  function _xmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _serializeOxs(project) {
    project = project || {};
    var w = project.width | 0, h = project.height | 0;
    var pattern = project.pattern || [];
    var bsLines = project.bsLines || [];
    if (w <= 0 || h <= 0) throw new Error('OXS: invalid dimensions');

    // Build palette index from cell ids (skip __skip__ / __empty__).
    var palette = [];           // [{id, rgb}]
    var idToIndex = {};         // id → 1-based palette index
    function ensureEntry(id, rgb) {
      if (!id || id === '__skip__' || id === '__empty__') return 0;
      if (idToIndex[id]) return idToIndex[id];
      palette.push({ id: id, rgb: rgb || [0, 0, 0] });
      idToIndex[id] = palette.length;
      return palette.length;
    }
    // Pre-seed with project.palette if supplied (preserves ordering).
    if (project.palette && project.palette.length) {
      for (var p = 0; p < project.palette.length; p++) {
        var pe = project.palette[p];
        if (pe && pe.id) ensureEntry(pe.id, pe.rgb);
      }
    }

    var lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<chart width="' + w + '" height="' + h + '">');
    lines.push('  <format><chartwidth>' + w + '</chartwidth><chartheight>' + h + '</chartheight></format>');

    // First pass — record stitch entries and grow the palette.
    var stitches = [];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var cell = pattern[y * w + x];
        if (!cell) continue;
        var id = cell.id;
        if (!id || id === '__skip__' || id === '__empty__') continue;
        // Flatten blend → first DMC id.
        var primaryId = id, primaryRgb = cell.rgb;
        if (cell.type === 'blend' && id.indexOf('+') >= 0) {
          primaryId = id.split('+')[0];
        }
        var idx = ensureEntry(primaryId, primaryRgb);
        if (idx) stitches.push({ x: x, y: y, palindex: idx });
      }
    }

    // Palette block.
    lines.push('  <palette>');
    for (var i = 0; i < palette.length; i++) {
      var entry = palette[i];
      var rgb = entry.rgb || [0, 0, 0];
      lines.push('    <color index="' + (i + 1) + '"'
        + ' number="' + _xmlEscape(entry.id) + '"'
        + ' name="' + _xmlEscape(entry.id) + '"'
        + ' red="' + (rgb[0] | 0) + '"'
        + ' green="' + (rgb[1] | 0) + '"'
        + ' blue="' + (rgb[2] | 0) + '"/>');
    }
    lines.push('  </palette>');

    // Stitches.
    lines.push('  <fullstitches>');
    for (var s = 0; s < stitches.length; s++) {
      var st = stitches[s];
      lines.push('    <stitch x="' + st.x + '" y="' + st.y + '" palindex="' + st.palindex + '"/>');
    }
    lines.push('  </fullstitches>');

    // Backstitches (optional).
    if (bsLines.length) {
      lines.push('  <backstitches>');
      for (var b = 0; b < bsLines.length; b++) {
        var bl = bsLines[b];
        lines.push('    <backstitch x1="' + bl.x1 + '" y1="' + bl.y1 + '"'
          + ' x2="' + bl.x2 + '" y2="' + bl.y2 + '" palindex="1"/>');
      }
      lines.push('  </backstitches>');
    }

    lines.push('</chart>');
    return lines.join('\n');
  }

  // ─────────────────────────────────────── JSZip lazy loader ────────────
  function _loadJSZip() {
    if (typeof window === 'undefined') return Promise.reject(new Error('JSZip requires a browser'));
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (window.__jszipPromise) return window.__jszipPromise;
    var loader = (typeof window.loadScript === 'function')
      ? window.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')
      : Promise.reject(new Error('window.loadScript unavailable'));
    window.__jszipPromise = loader.then(function () {
      if (!window.JSZip) throw new Error('JSZip failed to load');
      return window.JSZip;
    });
    return window.__jszipPromise;
  }

  // ─────────────────────────────────────────── build ────────────────────
  function build(inputs, options) {
    inputs = inputs || {};
    options = options || {};
    var onProgress = typeof options.onProgress === 'function' ? options.onProgress : function () {};

    return _loadJSZip().then(function (JSZip) {
      var zip = new JSZip();
      var files = [];

      function addText(name, text, format) {
        var bytes = (typeof Blob !== 'undefined') ? new Blob([text]).size : text.length;
        zip.file(name, text);
        files.push({ name: name, bytes: bytes, format: format });
      }
      function addBinary(name, u8, format) {
        zip.file(name, u8);
        files.push({ name: name, bytes: u8.byteLength | 0, format: format });
      }
      function addBlob(name, blob, format) {
        zip.file(name, blob);
        files.push({ name: name, bytes: blob.size | 0, format: format });
      }

      onProgress('collect', 'Collecting files');
      if (inputs.pdfBytes) addBinary('pattern.pdf', inputs.pdfBytes, 'pdf');
      if (inputs.oxsString) addText('pattern.oxs', inputs.oxsString, 'oxs');
      if (inputs.pngBlob) addBlob('preview.png', inputs.pngBlob, 'png');
      if (inputs.projectJson != null) {
        var jsonText = (typeof inputs.projectJson === 'string')
          ? inputs.projectJson
          : JSON.stringify(inputs.projectJson);
        addText('project.json', jsonText, 'json');
      }

      var manifest = _buildManifest({
        projectName: inputs.projectName,
        schemaVersion: inputs.schemaVersion,
        appVersion: inputs.appVersion,
        files: files
      });
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      onProgress('zip', 'Compressing');
      return zip.generateAsync(
        { type: 'blob', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } },
        function (meta) {
          onProgress('zip', 'Compressing ' + (meta.percent | 0) + '%');
        }
      );
    });
  }

  var api = {
    build: build,
    _slugify: _slugify,
    _filename: _filename,
    _buildManifest: _buildManifest,
    _serializeOxs: _serializeOxs,
    _loadJSZip: _loadJSZip
  };

  if (typeof window !== 'undefined') window.ZipBundle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
