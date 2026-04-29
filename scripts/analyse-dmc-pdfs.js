// One-off script for Phase 1.2 (DMC PDF structural analysis).
// Walks every page of the corpus PDFs and dumps text items + vector op
// summaries into reports/import-2-raw/. Output is consumed manually
// when writing reports/import-2-dmc-file-analysis.md.
//
// Usage:  node scripts/analyse-dmc-pdfs.js
//
// Requires pdfjs-dist (installed without --save for Phase 1 analysis).

'use strict';

const fs = require('fs');
const path = require('path');

const FILES = [
  'TestUploads/PAT1968_2.pdf',
  'TestUploads/PAT2171_2.pdf',
];
const OUT_DIR = 'reports/import-2-raw';

async function loadPdfjs() {
  // pdfjs-dist v4 ships ESM; require the legacy build for Node CJS use.
  return await import('pdfjs-dist/legacy/build/pdf.mjs');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function fmtTransform(t) {
  if (!t) return null;
  // [a, b, c, d, e, f] — e/f are translation; a/d are scale (with possible skew/rotation in b/c).
  return {
    scaleX: +t[0].toFixed(3),
    skewY:  +t[1].toFixed(3),
    skewX:  +t[2].toFixed(3),
    scaleY: +t[3].toFixed(3),
    x:      +t[4].toFixed(2),
    y:      +t[5].toFixed(2),
  };
}

async function analysePage(pdf, pageNum, pdfjs) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  const text = await page.getTextContent({ includeMarkedContent: false });

  // ---- Text items ----
  const items = text.items.map(it => ({
    str: it.str,
    fontName: it.fontName,
    width: +it.width.toFixed(2),
    height: +it.height.toFixed(2),
    transform: fmtTransform(it.transform),
    hasEOL: !!it.hasEOL,
  }));

  // Single-character items are how PatternKeeper renders symbol cells.
  // DMC charts may use the same trick, or may rasterise.
  const singleChars = items.filter(i => i.str && i.str.length === 1 && i.str.trim());

  // Words / longer strings carry the legend, headings, copyright, etc.
  const longText = items.filter(i => i.str && i.str.length > 1).map(i => i.str.trim());

  // ---- Operator list (vector ops + image ops) ----
  const ops = await page.getOperatorList();
  const OPS = pdfjs.OPS;
  const opCounts = {};
  let imageOps = [];
  let lineOps = 0, rectOps = 0, curveOps = 0, fillOps = 0, strokeOps = 0;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const name = Object.keys(OPS).find(k => OPS[k] === fn) || String(fn);
    opCounts[name] = (opCounts[name] || 0) + 1;

    if (fn === OPS.constructPath) {
      const [opsArr] = ops.argsArray[i];
      for (const o of opsArr) {
        if (o === OPS.lineTo) lineOps++;
        else if (o === OPS.rectangle) rectOps++;
        else if (o === OPS.curveTo || o === OPS.curveTo2 || o === OPS.curveTo3) curveOps++;
      }
    } else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke) {
      fillOps++;
    } else if (fn === OPS.stroke || fn === OPS.closeStroke) {
      strokeOps++;
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintInlineImageXObject) {
      imageOps.push(name);
    }
  }

  return {
    pageNum,
    viewport: { width: +viewport.width.toFixed(1), height: +viewport.height.toFixed(1) },
    counts: {
      textItems: items.length,
      singleChars: singleChars.length,
      longText: longText.length,
      lineOps, rectOps, curveOps, fillOps, strokeOps,
      images: imageOps.length,
    },
    opSummary: opCounts,
    images: imageOps,
    // Sample data
    longTextSample: longText.slice(0, 80),
    singleCharSample: singleChars.slice(0, 30).map(i => ({
      ch: i.str, font: i.fontName, x: i.transform?.x, y: i.transform?.y, fs: i.transform?.scaleY,
    })),
    fontsUsed: Array.from(new Set(items.map(i => i.fontName))).filter(Boolean),
  };
}

async function analyseFile(file, pdfjs) {
  const buf = fs.readFileSync(file);
  const u8 = new Uint8Array(buf);
  const pdf = await pdfjs.getDocument({ data: u8, useSystemFonts: false, disableFontFace: true }).promise;
  const meta = await pdf.getMetadata().catch(() => ({}));
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    process.stdout.write(`  page ${i}/${pdf.numPages}\r`);
    pages.push(await analysePage(pdf, i, pdfjs));
  }
  process.stdout.write('\n');
  await pdf.cleanup();
  return {
    file,
    numPages: pdf.numPages,
    info: meta.info || null,
    metadata: meta.metadata ? meta.metadata.getAll() : null,
    pages,
  };
}

(async () => {
  ensureDir(OUT_DIR);
  const pdfjs = await loadPdfjs();
  console.log('pdfjs version:', pdfjs.version);
  for (const f of FILES) {
    if (!fs.existsSync(f)) {
      console.warn('skip (missing):', f);
      continue;
    }
    console.log('Analysing', f);
    const result = await analyseFile(f, pdfjs);
    const out = path.join(OUT_DIR, path.basename(f).replace(/\.pdf$/i, '.analysis.json'));
    fs.writeFileSync(out, JSON.stringify(result, null, 2));
    console.log('  ->', out);

    // Also write a per-page text dump for human reading.
    const txtOut = path.join(OUT_DIR, path.basename(f).replace(/\.pdf$/i, '.text.txt'));
    let txt = `# ${f}  (${result.numPages} pages)\n\n`;
    for (const p of result.pages) {
      txt += `\n========== Page ${p.pageNum}  (${p.viewport.width} x ${p.viewport.height})  ==========\n`;
      txt += `counts: text=${p.counts.textItems} singleChars=${p.counts.singleChars} longText=${p.counts.longText} `;
      txt += `lines=${p.counts.lineOps} rects=${p.counts.rectOps} curves=${p.counts.curveOps} `;
      txt += `fills=${p.counts.fillOps} strokes=${p.counts.strokeOps} images=${p.counts.images}\n`;
      txt += `fonts: ${p.fontsUsed.join(', ')}\n\n`;
      txt += '--- Long text (first 80) ---\n';
      txt += p.longTextSample.join(' | ') + '\n\n';
      txt += '--- Single chars (first 30) ---\n';
      txt += p.singleCharSample.map(s => `${JSON.stringify(s.ch)}@${s.x},${s.y} fs=${s.fs} ${s.font}`).join('\n') + '\n';
    }
    fs.writeFileSync(txtOut, txt);
    console.log('  ->', txtOut);
  }
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
