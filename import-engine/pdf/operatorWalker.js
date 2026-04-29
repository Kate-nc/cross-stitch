/* import-engine/pdf/operatorWalker.js — pure-function PDF op-stream walker.
 *
 * pdfjsLib returns operator lists as { fnArray:number[], argsArray:any[][] }.
 * fnArray entries are pdfjsLib.OPS enum values. We translate them into a
 * stream of high-level events:
 *
 *   { type: 'fillRect',  ctm, fill, x, y, w, h }
 *   { type: 'fillPath',  ctm, fill, path }     // path = [{op, args}, ...]
 *   { type: 'strokePath',ctm, stroke, lineWidth, path }
 *   { type: 'text',      ctm, font, text, x, y }
 *   { type: 'image',     ctm, name, w, h }
 *
 * The walker maintains a graphics-state stack (CTM, fill/stroke colours,
 * line width) per the PDF 1.7 spec §8.4. It does NOT execute the
 * operations; callers consume the events.
 *
 * The OPS enum is provided by pdfjsLib at runtime. For testing we accept an
 * `opsEnum` argument so the walker can run in Node with a synthetic enum.
 */

(function () {
  'use strict';

  // Default OPS enum drawn from pdfjs-dist. Only the ops we care about.
  const DEFAULT_OPS = {
    save: 10, restore: 11, transform: 12,
    moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17,
    closePath: 18, rectangle: 19,
    stroke: 20, closeStroke: 21, fill: 22, eoFill: 23,
    fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27,
    endPath: 28,
    setLineWidth: 2, setLineCap: 3, setLineJoin: 4, setMiterLimit: 5,
    setStrokeRGBColor: 60, setFillRGBColor: 61,
    setStrokeGray: 56, setFillGray: 57,
    setStrokeCMYKColor: 62, setFillCMYKColor: 63,
    beginText: 31, endText: 32,
    setTextMatrix: 38, moveText: 35, nextLine: 36, setTextRise: 39,
    setFont: 37,
    showText: 44, showSpacedText: 45, nextLineShowText: 46, nextLineSetSpacingShowText: 47,
    paintImageXObject: 85, paintInlineImageXObject: 86, paintImageMaskXObject: 83,
    constructPath: 91,
  };

  function walkOperatorList(opList, opsEnum) {
    opsEnum = opsEnum || (typeof pdfjsLib !== 'undefined' && pdfjsLib.OPS) || DEFAULT_OPS;
    const events = [];
    const state = newState();
    const stack = [];
    const path = [];

    const ops = opList && opList.fnArray || [];
    const args = opList && opList.argsArray || [];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const a = args[i];

      if (op === opsEnum.save) {
        stack.push(cloneState(state));
      } else if (op === opsEnum.restore) {
        const prev = stack.pop();
        if (prev) Object.assign(state, prev);
      } else if (op === opsEnum.transform) {
        state.ctm = matMul(state.ctm, a);
      } else if (op === opsEnum.setFillRGBColor) {
        state.fill = [a[0], a[1], a[2]];
      } else if (op === opsEnum.setStrokeRGBColor) {
        state.stroke = [a[0], a[1], a[2]];
      } else if (op === opsEnum.setFillGray) {
        const g = Math.round((a[0] || 0) * 255);
        state.fill = [g, g, g];
      } else if (op === opsEnum.setStrokeGray) {
        const g = Math.round((a[0] || 0) * 255);
        state.stroke = [g, g, g];
      } else if (op === opsEnum.setLineWidth) {
        state.lineWidth = a[0];
      } else if (op === opsEnum.setFont) {
        state.font = { name: a[0], size: a[1] };
      } else if (op === opsEnum.setTextMatrix) {
        state.textMatrix = a.slice(0, 6);
      } else if (op === opsEnum.moveText) {
        state.textMatrix[4] += a[0];
        state.textMatrix[5] += a[1];
      } else if (op === opsEnum.showText) {
        const text = stringifyShowText(a[0]);
        const pos = textPosition(state);
        events.push({ type: 'text', ctm: state.ctm.slice(), font: state.font, text, x: pos.x, y: pos.y });
      } else if (op === opsEnum.constructPath) {
        // a = [opsArray, argsArray, minMax]
        if (a && a[0] && a[1]) collectPath(path, a[0], a[1], opsEnum);
      } else if (op === opsEnum.rectangle) {
        path.push({ op: 'rectangle', args: a.slice() });
      } else if (op === opsEnum.moveTo) {
        path.push({ op: 'moveTo', args: a.slice() });
      } else if (op === opsEnum.lineTo) {
        path.push({ op: 'lineTo', args: a.slice() });
      } else if (op === opsEnum.closePath) {
        path.push({ op: 'closePath', args: [] });
      } else if (op === opsEnum.fill || op === opsEnum.eoFill) {
        emitFromPath('fill', path, state, events);
        path.length = 0;
      } else if (op === opsEnum.stroke || op === opsEnum.closeStroke) {
        emitFromPath('stroke', path, state, events);
        path.length = 0;
      } else if (op === opsEnum.fillStroke || op === opsEnum.eoFillStroke ||
                 op === opsEnum.closeFillStroke || op === opsEnum.closeEOFillStroke) {
        emitFromPath('fill', path, state, events);
        emitFromPath('stroke', path, state, events);
        path.length = 0;
      } else if (op === opsEnum.endPath) {
        path.length = 0;
      } else if (op === opsEnum.paintImageXObject || op === opsEnum.paintInlineImageXObject || op === opsEnum.paintImageMaskXObject) {
        events.push({ type: 'image', ctm: state.ctm.slice(), name: a && a[0], w: a && a[1], h: a && a[2] });
      }
    }
    return events;
  }

  function newState() {
    return {
      ctm: [1, 0, 0, 1, 0, 0],
      fill: [0, 0, 0],
      stroke: [0, 0, 0],
      lineWidth: 1,
      font: null,
      textMatrix: [1, 0, 0, 1, 0, 0],
    };
  }

  function cloneState(s) {
    return {
      ctm: s.ctm.slice(),
      fill: s.fill.slice(),
      stroke: s.stroke.slice(),
      lineWidth: s.lineWidth,
      font: s.font ? { name: s.font.name, size: s.font.size } : null,
      textMatrix: s.textMatrix.slice(),
    };
  }

  // PDF matrices: [a b c d e f] applied as new = current * mat.
  function matMul(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  }

  function applyCtm(ctm, x, y) {
    return { x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] };
  }

  function textPosition(state) {
    const tm = state.textMatrix;
    const ctm = state.ctm;
    const x = tm[4], y = tm[5];
    return applyCtm(ctm, x, y);
  }

  function stringifyShowText(items) {
    if (typeof items === 'string') return items;
    if (!Array.isArray(items)) return '';
    let s = '';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (typeof it === 'string') s += it;
      else if (it && typeof it.unicode === 'string') s += it.unicode;
    }
    return s;
  }

  function collectPath(out, opsArr, argsArr, opsEnum) {
    let argIdx = 0;
    for (let i = 0; i < opsArr.length; i++) {
      const op = opsArr[i];
      const consume = pathArgsCount(op, opsEnum);
      const args = argsArr.slice(argIdx, argIdx + consume);
      argIdx += consume;
      if (op === opsEnum.moveTo) out.push({ op: 'moveTo', args });
      else if (op === opsEnum.lineTo) out.push({ op: 'lineTo', args });
      else if (op === opsEnum.rectangle) out.push({ op: 'rectangle', args });
      else if (op === opsEnum.closePath) out.push({ op: 'closePath', args: [] });
      else if (op === opsEnum.curveTo) out.push({ op: 'curveTo', args });
      else if (op === opsEnum.curveTo2) out.push({ op: 'curveTo2', args });
      else if (op === opsEnum.curveTo3) out.push({ op: 'curveTo3', args });
    }
  }

  function pathArgsCount(op, opsEnum) {
    if (op === opsEnum.moveTo || op === opsEnum.lineTo) return 2;
    if (op === opsEnum.rectangle) return 4;
    if (op === opsEnum.closePath) return 0;
    if (op === opsEnum.curveTo) return 6;
    if (op === opsEnum.curveTo2 || op === opsEnum.curveTo3) return 4;
    return 0;
  }

  function emitFromPath(kind, path, state, events) {
    if (!path.length) return;
    // Look for simple rectangles (single rectangle op or moveTo+3 lineTo+closePath aligned to axes).
    if (path.length === 1 && path[0].op === 'rectangle') {
      const [x, y, w, h] = path[0].args;
      const p = applyCtm(state.ctm, x, y);
      events.push({
        type: kind === 'fill' ? 'fillRect' : 'strokeRect',
        ctm: state.ctm.slice(),
        fill: state.fill.slice(),
        stroke: state.stroke.slice(),
        x: p.x, y: p.y,
        w: state.ctm[0] * w, h: state.ctm[3] * h,
      });
      return;
    }
    // Line segment? moveTo + lineTo with no other path ops.
    if (kind === 'stroke' && path.length === 2 && path[0].op === 'moveTo' && path[1].op === 'lineTo') {
      const a = applyCtm(state.ctm, path[0].args[0], path[0].args[1]);
      const b = applyCtm(state.ctm, path[1].args[0], path[1].args[1]);
      events.push({
        type: 'line',
        ctm: state.ctm.slice(), stroke: state.stroke.slice(), lineWidth: state.lineWidth,
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      });
      return;
    }
    events.push({
      type: kind === 'fill' ? 'fillPath' : 'strokePath',
      ctm: state.ctm.slice(),
      fill: state.fill.slice(),
      stroke: state.stroke.slice(),
      lineWidth: state.lineWidth,
      path: path.slice(),
    });
  }

  const api = { walkOperatorList, _matMul: matMul, _applyCtm: applyCtm, _DEFAULT_OPS: DEFAULT_OPS };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
