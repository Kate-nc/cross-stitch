/* import-engine/pipeline/materialise.js — Build a v8 project from a raw extraction.
 *
 * Output shape MUST match `importResultToProject` exactly so that downstream
 * code (PDF export, ProjectStorage, tracker) treats it identically.
 *
 * Optional: attach the original file bytes (compressed via pako.deflate) so
 * the user can re-export / re-edit later.
 */

(function () {
  'use strict';

  // raw extraction shape:
  //   { width, height, cells: [{col,row,code,color,type,matchConfidence}],
  //     legend: { rows, byGlyph, ... }, palette? }
  // ctx (optional):
  //   { fabricCt, name, originalFile: {name,type,bytes}, pako, perCellConfidence? }
  function materialiseProject(raw, ctx) {
    ctx = ctx || {};
    if (!raw) throw new Error('materialiseProject: raw extraction is null');

    // Legacy strategies provide a complete project under raw._legacyProject.
    // The pipeline already passes that through via defaultMaterialise; we
    // honour the same shortcut here so callers can use this module directly.
    if (raw._legacyProject) {
      const proj = raw._legacyProject;
      return attachOriginalFile(proj, ctx);
    }

    const w = raw.width | 0, h = raw.height | 0;
    if (w <= 0 || h <= 0) throw new Error(`materialiseProject: invalid dimensions ${w}×${h}`);

    const pattern = new Array(w * h);
    // Initialise all cells to skip; we'll overwrite from `cells`.
    for (let i = 0; i < pattern.length; i++) pattern[i] = { id: '__skip__' };

    const codeRgb = new Map();
    const cells = raw.cells || [];
    for (const c of cells) {
      const idx = c.row * w + c.col;
      if (idx < 0 || idx >= pattern.length) continue;
      if (!c.code) continue;
      pattern[idx] = {
        id: c.code,
        type: c.type === 'half' || c.type === 'quarter' || c.type === 'threequarter' || c.type === 'petite'
          ? c.type
          : (c.type === 'bs' ? 'bs' : 'solid'),
        rgb: c.color || [0, 0, 0],
      };
      if (!codeRgb.has(c.code) && Array.isArray(c.color)) codeRgb.set(c.code, c.color);
    }

    const project = {
      v: 8,
      w, h,
      name: ctx.name || '',
      settings: { sW: w, sH: h, fabricCt: ctx.fabricCt || 14 },
      pattern,
      bsLines: raw.bsLines || [],
      done: null,
      parkMarkers: [],
      totalTime: 0,
      sessions: [],
      threadOwned: {},
    };

    // Attach per-cell confidence array (parallel to pattern) for the review UI.
    if (ctx.perCellConfidence !== false) {
      const conf = new Array(w * h).fill(0);
      for (const c of cells) {
        const idx = c.row * w + c.col;
        if (idx >= 0 && idx < conf.length) {
          conf[idx] = Math.max(0, Math.min(1, c.matchConfidence || 0));
        }
      }
      project._import = { perCellConfidence: conf };
    }

    return attachOriginalFile(project, ctx);
  }

  function attachOriginalFile(project, ctx) {
    if (!ctx || !ctx.originalFile || !ctx.originalFile.bytes) return project;
    const bytes = ctx.originalFile.bytes;
    let payload = bytes, encoding = 'raw';
    try {
      const pako = ctx.pako || (typeof window !== 'undefined' ? window.pako : null);
      if (pako && typeof pako.deflate === 'function') {
        payload = pako.deflate(bytes);
        encoding = 'pako-deflate';
      }
    } catch (_) { /* fall back to raw bytes */ }
    project.meta = project.meta || {};
    project.meta.attachments = project.meta.attachments || {};
    project.meta.attachments.originalFile = {
      name: ctx.originalFile.name || 'original',
      type: ctx.originalFile.type || 'application/octet-stream',
      encoding,
      bytes: payload,
    };
    return project;
  }

  const api = { materialiseProject, attachOriginalFile };
  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
