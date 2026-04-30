// Quick text-only dump of additional PDFs for cross-publisher comparison.
// Extends Phase 1.2 corpus beyond DMC.
'use strict';
const fs = require('fs');
const path = require('path');

const FILES = [
  'TestUploads/Books and Blossoms.pdf',
  'TestUploads/Books and Blossoms - 5mm color.pdf',
  'TestUploads/exported_pattern.pdf',
];
const OUT_DIR = 'reports/import-2-raw';

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  for (const f of FILES) {
    if (!fs.existsSync(f)) { console.warn('skip:', f); continue; }
    try {
    const data = new Uint8Array(fs.readFileSync(f));
    const pdf = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true }).promise;
    const meta = await pdf.getMetadata().catch(() => ({}));
    let txt = `# ${f} (${pdf.numPages} pages)\n`;
    txt += `producer: ${meta.info?.Producer || '?'} | creator: ${meta.info?.Creator || '?'}\n\n`;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const text = await page.getTextContent();
      const ops = await page.getOperatorList();
      const OPS = pdfjs.OPS;
      const counts = { fills: 0, strokes: 0, lineTo: 0, rect: 0, images: 0, fillCols: 0 };
      for (let j = 0; j < ops.fnArray.length; j++) {
        const fn = ops.fnArray[j];
        if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke) counts.fills++;
        else if (fn === OPS.stroke || fn === OPS.closeStroke) counts.strokes++;
        else if (fn === OPS.setFillRGBColor || fn === OPS.setFillColor || fn === OPS.setFillColorN) counts.fillCols++;
        else if (fn === OPS.paintImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintInlineImageXObject) counts.images++;
        else if (fn === OPS.constructPath) {
          const arg = ops.argsArray[j] && ops.argsArray[j][0];
          if (Array.isArray(arg)) {
            for (const o of arg) {
              if (o === OPS.lineTo) counts.lineTo++;
              else if (o === OPS.rectangle) counts.rect++;
            }
          }
        }
      }
      const all = text.items.map(t => t.str).filter(Boolean);
      const longs = all.filter(s => s.trim().length > 1).slice(0, 60);
      const singles = text.items.filter(t => t.str && t.str.trim().length === 1);
      txt += `\n---- Page ${i} (${vp.width.toFixed(0)}x${vp.height.toFixed(0)}) `
           + `text=${all.length} singleChars=${singles.length} `
           + `lineTo=${counts.lineTo} rect=${counts.rect} fills=${counts.fills} strokes=${counts.strokes} `
           + `fillCols=${counts.fillCols} images=${counts.images}\n`;
      txt += longs.join(' | ').slice(0, 1800) + '\n';
      if (singles.length) {
        const sample = singles.slice(0, 25).map(t => `"${t.str}"@${t.transform[4].toFixed(0)},${t.transform[5].toFixed(0)} fs=${t.transform[3].toFixed(1)}`);
        txt += 'singles: ' + sample.join(' ') + '\n';
      }
    }
    const out = path.join(OUT_DIR, path.basename(f).replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_') + '.text.txt');
    fs.writeFileSync(out, txt);
    console.log('->', out);
    await pdf.cleanup();
    } catch (e) {
      console.warn('failed:', f, '-', e.message);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
