/* import-engine/ui/importErrors.js — plain-English import errors (audit IMPORT-05).
 *
 * Two jobs:
 *   - classifyFileForCreate(file) → 'image' | 'pattern' | 'unsupported'
 *     Decides, before anything is read, whether a picked or dropped file goes
 *     to the image converter, the import engine, or is turned away. Files
 *     from other design programs (.xsd, .pat, .xsp …) used to be treated as
 *     images, failed to decode and left the user on an empty screen.
 *   - describeImportError(err, fileName) → { message, technical, copyDetails }
 *     Maps a pipeline error to copy a stitcher can act on. The technical
 *     message is kept for the console and the "Copy details" action.
 *   - showImportError(err, fileName) shows that as a toast with a
 *     "What can I import?" action (and "Copy details" for unknown errors).
 *
 * Loaded twice on purpose: as its own <script> right after lazy-shim.js, so
 * the classifier works before the lazy bundle is fetched, and inside
 * import-engine/bundle.js. Both copies only add keys to window.ImportEngine.
 */

(function () {
  'use strict';

  // Formats from other cross-stitch software that we can't read yet.
  // program: null means "another program" in the message.
  var UNSUPPORTED = {
    xsd: 'Pattern Maker',
    pat: 'PCStitch',
    xsp: 'XStitch Pro',
    saga: null,
    chart: null,
    dize: null,
    hvn: null,
  };
  var PATTERN_EXT = /^(oxs|xml|json|pdf)$/;
  var IMAGE_EXT = /^(jpe?g|png|gif|webp|bmp|avif|heic|heif|tiff?)$/;
  var HELP_QUERY_TOPIC = { topic: 'creator', section: 'What can I import?' };

  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function classifyFileForCreate(file) {
    if (!file) return 'unsupported';
    var ext = extOf(file.name);
    var type = String(file.type || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(UNSUPPORTED, ext)) return 'unsupported';
    if (PATTERN_EXT.test(ext)) return 'pattern';
    if (type === 'application/pdf' || type === 'application/json') return 'pattern';
    if (type.indexOf('image/') === 0 || IMAGE_EXT.test(ext)) return 'image';
    return 'unsupported';
  }

  function unsupportedMessage(ext) {
    var program = UNSUPPORTED[ext];
    if (program) {
      return 'Files from ' + program + ' (.' + ext + ') can’t be opened here yet. In ' + program +
        ', export the chart as OXS or PDF and import that file.';
    }
    if (Object.prototype.hasOwnProperty.call(UNSUPPORTED, ext)) {
      return 'Files from other cross-stitch programs (.' + ext + ') can’t be opened here yet. ' +
        'In that program, export the chart as OXS or PDF and import that file.';
    }
    return (ext ? '.' + ext + ' files' : 'Files of this type') + ' can’t be opened here. ' +
      'You can import PDF charts, .oxs files, stitchx .json files and images.';
  }

  function describeImportError(err, fileName) {
    var name = err && err.name || '';
    var technical = (err && err.message) || String(err || 'Unknown error');
    var details = (err && err.details) || {};
    var ext = extOf(fileName || details.fileName);
    var strategy = details.strategy || '';
    var out = { message: '', technical: technical, copyDetails: false };
    // Couldn't be parsed, or no reader recognised the contents.
    var unreadable = name === 'ImportParseError' || name === 'ImportUnsupportedError';

    if (ext && classifyFileForCreate({ name: 'f.' + ext, type: '' }) === 'unsupported') {
      out.message = unsupportedMessage(ext);
    } else if (unreadable && (ext === 'pdf' || strategy === 'pdf' || strategy === 'pdf-glyph')) {
      out.message = 'This PDF couldn’t be read. It may be damaged or password-protected.';
    } else if (unreadable && (ext === 'json' || strategy === 'json')) {
      out.message = 'This .json file isn’t a stitchx pattern or backup.';
    } else if ((ext === 'oxs' || ext === 'xml' || strategy === 'oxs') && /no stitches|empty|EMPTY_GRID/i.test(technical + ' ' + (details.code || ''))) {
      out.message = 'This .oxs file didn’t contain any stitches we could read.';
    } else {
      out.message = 'Something went wrong importing this file.';
      out.copyDetails = true;
    }
    return out;
  }

  function openWhatCanIImport() {
    if (window.HelpDrawer && typeof window.HelpDrawer.open === 'function') {
      window.HelpDrawer.open({ tab: 'help', topic: HELP_QUERY_TOPIC.topic, section: HELP_QUERY_TOPIC.section });
    }
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
    } catch (_) {}
    return Promise.reject(new Error('Clipboard unavailable'));
  }

  // Show the friendly toast. The technical message stays in the console.
  function showImportError(err, fileName) {
    var d = describeImportError(err, fileName);
    try { console.error('[import] ' + (fileName ? fileName + ': ' : '') + d.technical, err); } catch (_) {}
    var actions = [{ label: 'What can I import?', onClick: openWhatCanIImport }];
    if (d.copyDetails) {
      actions.push({
        label: 'Copy details',
        keepOpen: true,
        onClick: function () {
          var text = (fileName ? fileName + ': ' : '') + d.technical;
          copyText(text).then(function () {
            if (window.Toast) window.Toast.show({ message: 'Details copied.', type: 'success', duration: 2000 });
          }, function () {});
        },
      });
    }
    if (window.Toast && typeof window.Toast.show === 'function') {
      window.Toast.show({ message: d.message, type: 'error', duration: 12000, actions: actions });
    } else if (typeof alert === 'function') {
      alert(d.message);
    }
    return d;
  }

  var api = {
    classifyFileForCreate: classifyFileForCreate,
    describeImportError: describeImportError,
    showImportError: showImportError,
    openWhatCanIImport: openWhatCanIImport,
    _extOf: extOf,
  };
  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
