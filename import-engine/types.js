/* import-engine/types.js — shared type docs + tiny helpers.
 *
 * No runtime types — JSDoc only. The exports are convenience constructors
 * and the typed-error classes used across stages.
 *
 * Loaded as a plain <script>; everything attaches to window.ImportEngine.
 *
 * ════════════════════════════════════════════════════════════════════════
 *   Public surface
 *     window.ImportEngine.errors.UnsupportedError
 *     window.ImportEngine.errors.ParseError
 *     window.ImportEngine.errors.ValidateError
 *     window.ImportEngine.errors.AbortedError
 *     window.ImportEngine.makeAbortToken()
 * ════════════════════════════════════════════════════════════════════════
 *
 * @typedef {Object} FileProbe
 * @property {string} fileName
 * @property {string} mimeType
 * @property {Uint8Array} bytes      first slice (≤1 MB) for cheap inspection
 * @property {function():Promise<Uint8Array>} fullBytes  lazy loader for the rest
 *
 * @typedef {Object} ImportContext
 * @property {{aborted:boolean}} cancelToken
 * @property {(msg:ProgressMessage)=>void} reportProgress
 * @property {(scope:string, ...args:unknown[])=>void} log
 *
 * @typedef {Object} ProgressMessage
 * @property {string} stage    'sniff' | 'classify' | 'extract' | 'assemble' | 'palette' | 'validate' | 'materialise'
 * @property {string} [label]
 * @property {number} [page]
 * @property {number} [total]
 *
 * @typedef {Object} RawCell
 * @property {number} x        grid coordinate (column)
 * @property {number} y        grid coordinate (row)
 * @property {{kind:'dmc',id:string}|{kind:'rgb',r:number,g:number,b:number}|{kind:'glyph',font:string,ch:string}} source
 * @property {number} confidence
 * @property {{type:'half'|'quarter'|'three-quarter',orientation?:string}} [partial]
 *
 * @typedef {Object} RawLegendEntry
 * @property {string} [code]
 * @property {[number,number,number]} [swatchRgb]
 * @property {{font:string,ch:string}} [glyph]
 * @property {string} [name]
 * @property {string} [artLine]
 * @property {string} [stitchType]
 * @property {number} [strands]
 * @property {number} [totalStitches]
 * @property {number} [totalSkeins]
 * @property {number} confidence
 *
 * @typedef {Object} RawMeta
 * @property {string} [publisher]
 * @property {string} [title]
 * @property {string} [designer]
 * @property {string} [copyright]
 * @property {string[]} [languages]
 * @property {number} [fabricCount]
 * @property {string} [fabricSku]
 * @property {string} [finishedSize]
 *
 * @typedef {Object} RawExtraction
 * @property {RawCell[]} grid
 * @property {RawLegendEntry[]} legend
 * @property {RawMeta} meta
 * @property {{warnings:string[], uncertainCells:number}} flags
 * @property {{backstitch?:RawLineSegment[]}} [layers]
 *
 * @typedef {Object} RawLineSegment
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {[number,number,number]} [rgb]
 *
 * @typedef {Object} ImportWarning
 * @property {string} code         machine-readable identifier
 * @property {string} message      human-readable text
 * @property {'info'|'warning'|'error'} severity
 * @property {Object} [target]     { stage, page, cell, paletteEntry } — for jump-to
 *
 * @typedef {Object} ReviewHint
 * @property {string} message
 * @property {Object} [target]
 *
 * @typedef {Object} ImportResult
 * @property {boolean} ok
 * @property {Object} [project]    v8 project object on success
 * @property {Object} [partial]    best-effort project on failure
 * @property {string} [publisher]
 * @property {{overall:number, perCell:Float32Array|number[], perPaletteEntry:number[]}} [confidence]
 * @property {ImportWarning[]} warnings
 * @property {ReviewHint[]} [reviewHints]
 * @property {Object} [error]      typed error on failure
 */

(function () {
  'use strict';

  function makeError(name) {
    function E(message, details) {
      const e = new Error(message);
      e.name = name;
      if (details) e.details = details;
      return e;
    }
    return E;
  }

  const errors = {
    UnsupportedError: makeError('ImportUnsupportedError'),
    ParseError:       makeError('ImportParseError'),
    ValidateError:    makeError('ImportValidateError'),
    AbortedError:     makeError('ImportAbortedError'),
  };

  function makeAbortToken() {
    const token = { aborted: false, abort() { token.aborted = true; } };
    return token;
  }

  function checkAborted(ctx, stage) {
    if (ctx && ctx.cancelToken && ctx.cancelToken.aborted) {
      throw errors.AbortedError('Import aborted at stage: ' + stage, { stage });
    }
  }

  // Combine confidence values. Defaults to min() because confidence chains
  // are bottlenecked by the weakest link, not averaged.
  function combineConfidence(/* ...values */) {
    let lo = 1;
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (typeof v !== 'number' || isNaN(v)) continue;
      if (v < lo) lo = v;
    }
    return lo < 0 ? 0 : (lo > 1 ? 1 : lo);
  }

  // Pick a review mode from an overall confidence + warning array.
  // Thresholds come from import-7 §1 + import-8 §6 (locked).
  function pickReviewMode(overall, warnings) {
    const errs = (warnings || []).filter(w => w && w.severity === 'error');
    if (errs.length) return 'guided';
    if (overall >= 0.95) return 'fast-path';
    if (overall >= 0.80) return 'standard';
    return 'guided';
  }

  const ImportEngine = {
    errors,
    makeAbortToken,
    checkAborted,
    combineConfidence,
    pickReviewMode,
    THRESHOLDS: { fastPath: 0.95, standard: 0.80 },
  };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, ImportEngine);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImportEngine;
  }
})();
