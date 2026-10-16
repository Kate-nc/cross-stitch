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
 *   window.ZipBundle._serializeOxs(project)   // { width, height, pattern, bsLines, palette?, knots? }
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

  // Use the same writer as standalone export so bundles keep thread assignments
  // and fractional stitches. Callers must surface every returned warning.
  function _serializeOxs(project, onWarnings) {
    if (typeof generateOXS !== 'function') throw new Error('OXS export is not available');
    var result = generateOXS(project);
    if (result.warnings.length) {
      if (typeof onWarnings !== 'function') throw new Error(result.warnings.join(' '));
      onWarnings(result.warnings);
    }
    return result.xml;
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
