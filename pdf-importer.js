/**
 * @typedef {Object} PdfPageData
 * @property {number} pageIndex
 * @property {number} width
 * @property {number} height
 * @property {VectorPath[]} vectorPaths
 * @property {TextItem[]} textItems
 * @property {FontInfo[]} fonts
 */

/**
 * @typedef {Object} VectorPath
 * @property {'line' | 'rect' | 'path'} type
 * @property {{x: number, y: number}[]} points
 * @property {string} [strokeColor]
 * @property {string} [fillColor]
 * @property {number} lineWidth
 */

/**
 * @typedef {Object} TextItem
 * @property {string} str
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} fontName
 * @property {number} fontSize
 */

/**
 * @typedef {Object} FontInfo
 * @property {string} name
 */

class PdfLoader {
  constructor() {
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs';
    }
  }

  /**
   * @param {File|ArrayBuffer} file
   * @returns {Promise<any>}
   */
  async load(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error("PDF.js library is not loaded.");
    }
    // OffscreenCanvas is used by PDF.js internally and is not available on
    // Safari <16.4. The import path here only uses getTextContent /
    // getOperatorList (no rendering), so this is typically safe; but log a
    // warning so unexpected parse errors are easier to diagnose.
    if (typeof OffscreenCanvas === 'undefined') {
      console.warn('[pdf-importer] OffscreenCanvas unavailable — PDF import may fail on this browser. Upgrade to Safari 16.4+ for full support.');
    }
    try {
      let data;
      if (file instanceof File) {
        data = await file.arrayBuffer();
      } else {
        data = file;
      }
      const loadingTask = pdfjsLib.getDocument({ data: data });
      const pdfData = await loadingTask.promise;
      if (!pdfData || !pdfData.numPages || pdfData.numPages <= 0) {
        throw new Error("PDF contains no pages.");
      }
      return pdfData;
    } catch (err) {
      // Detect pdf.js password protection so the user gets a clear message
      // instead of "Failed to parse PDF: No password given".
      const name = err && (err.name || (err.constructor && err.constructor.name));
      if (name === "PasswordException" || /password/i.test(err && err.message || "")) {
        throw new Error("This PDF is password-protected. Please unlock it before importing.");
      }
      throw new Error("Failed to parse PDF: " + (err && err.message ? err.message : String(err)));
    }
  }
}

class PatternKeeperImporter {
  /**
   * @param {{canvasFactory?: {create: function(number, number): {canvas, context}}}} [options]
   *   canvasFactory renders a scanned page to pixels; browsers need none.
   */
  constructor(options) {
    this.options = options || {};
    this.pdfLoader = new PdfLoader();
  }

  /**
   * Say how far the import has got, through options.onProgress, as the import
   * engine's progress messages: { stage, label, page?, total? }. A large chart
   * or a scan takes long enough that the stitcher needs to see it moving.
   */
  progress(label, page, total) {
    const cb = this.options.onProgress;
    if (typeof cb !== 'function') return;
    try { cb({ stage: 'extract', label, page, total }); } catch (_) {}
  }

  /**
   * Import a PDF chart.
   *
   * The finished project also carries, as a non-enumerable `_layoutSession`,
   * everything needed to rebuild it with the pages arranged differently — see
   * analyse() and buildFromLayout(). The review dialog uses it to let the
   * stitcher check and correct where each page goes; nothing else sees it, and
   * it is never saved with the project.
   *
   * @param {File|ArrayBuffer} file
   * @returns {Promise<Object>}
   */
  async import(file) {
    const session = await this.analyse(file);
    const project = this.buildFromLayout(session, session.placement);
    Object.defineProperty(project, '_layoutSession', { value: session, enumerable: false });
    return project;
  }

  /**
   * Read a PDF chart without committing to a page layout.
   *
   * Every chart page is read at its own, page-local coordinates — including
   * pages the automatic layout could not place and duplicate renderings it set
   * aside — so they can be moved afterwards without reading the PDF again.
   * Cells are linked to threads in one pass over all pages, so the match report
   * is the same however the pages end up arranged.
   *
   * Returns a session:
   *   pages[]   { pageIndex, cols, rows, cells, bs, initial: {col,row}|null,
   *               reason: null | 'unplaced' | 'duplicate' }
   *   placement the automatic layout, { pages: { [pageIndex]: {col,row} } }
   *   build(placement) -> project
   * A scanned chart's session also carries glyphSamples, a picture of each
   * symbol, and scanned: true.
   */
  async analyse(file) {
    // PERF (Cat B-lite): yield to the event loop between heavy stages so the
    // browser can repaint the import progress UI, dispatch queued clicks
    // (so Cancel works), and avoid a single 20 s+ Long Task for large PDFs.
    // The cost is ~10–20 ms total — negligible vs the work being done.
    const yieldToBrowser = () => new Promise(r => setTimeout(r, 0));

    this.progress('Opening the PDF');
    const pdfData = await this.pdfLoader.load(file);
    this.progress('Reading ' + pdfData.numPages + (pdfData.numPages === 1 ? ' page' : ' pages'));
    const pages = await this.extractAllPages(pdfData);
    await yieldToBrowser();

    const classified = this.classifyPages(pages);
    await yieldToBrowser();

    if (classified.chartPages.length === 0) {
       // No vector chart. A scanned chart, or one printed to an image, is a
       // page that is mostly a single picture: read the picture instead.
       const scanned = this.scannedChartPages(pages);
       if (scanned.length) return this.importScanned(scanned, pages);
       throw new Error("No chart pages detected in the PDF.");
    }

    const chartLayout = this.detectChartLayout(classified.chartPages);
    await yieldToBrowser();

    // The key is read before the chart so cell reading can recognise the key's
    // own swatch colours — BLANC's [252,252,248] is otherwise indistinguishable
    // from bare paper.
    this.progress('Reading the colour key');
    const legend = this.parseLegend(classified.legendPages, classified.chartPages);
    await yieldToBrowser();

    // Each page read at page-local coordinates: the same sampling grid as the
    // automatic layout, with its offset set aside.
    const placedIdx = new Set(chartLayout.pages.map(p => p.pageIndex));
    const duplicates = new Set(chartLayout.droppedAlternates || []);
    const entries = chartLayout.pages.map(pInfo => ({ pInfo, initial: { col: pInfo.globalOffsetCol, row: pInfo.globalOffsetRow }, reason: null }));
    for (const page of classified.chartPages) {
      if (placedIdx.has(page.pageIndex)) continue;
      entries.push({
        pInfo: { pageIndex: page.pageIndex, grid: this.gridOf(page), globalOffsetCol: 0, globalOffsetRow: 0 },
        initial: null,
        reason: duplicates.has(page.pageIndex) ? 'duplicate' : 'unplaced',
      });
    }

    const tagged = [];
    const sessionPages = [];
    for (const e of entries) {
      this.progress('Reading chart page ' + (sessionPages.length + 1) + ' of ' + entries.length, sessionPages.length + 1, entries.length);
      const local = Object.assign({}, e.pInfo, { globalOffsetCol: 0, globalOffsetRow: 0 });
      const grid = this.samplingGrid(local);
      if (!grid || !(grid.columns > 0) || !(grid.rows > 0)) continue;
      const cells = await this.extractSymbols(classified.chartPages, { pages: [local] }, legend);
      for (const c of cells) { c._page = e.pInfo.pageIndex; tagged.push(c); }
      sessionPages.push({
        pageIndex: e.pInfo.pageIndex, cols: grid.columns, rows: grid.rows,
        cells: null, bs: this.collectBackstitch(classified.chartPages, { pages: [local] }),
        initial: e.initial, reason: e.reason,
      });
      await yieldToBrowser();
    }

    const linked = this.linkSymbolsToThreads(tagged, legend);
    const byPage = new Map(sessionPages.map(p => [p.pageIndex, p]));
    for (const p of sessionPages) p.cells = [];
    for (const c of linked) { const p = byPage.get(c._page); if (p) p.cells.push(c); }
    await yieldToBrowser();

    // Layout warnings that are about pages left out are rebuilt for whatever
    // arrangement is finally chosen; the rest stand.
    const leftOutMsg = /could not be placed|repeat page \d+ in another style/;
    let placement = { pages: {}, manual: false };
    for (const p of sessionPages) if (p.initial) placement.pages[p.pageIndex] = p.initial;
    let layoutSource = chartLayout.layoutSource || 'sequential';
    let tiling = chartLayout.tiling || null;

    // No rulers to say where the pages go: rather than leave them in one long
    // strip, work the arrangement out from their sizes and edges.
    let guess = null;
    if (layoutSource === 'sequential') {
      const placed = sessionPages.filter(p => p.initial).sort((a, b) => a.pageIndex - b.pageIndex);
      guess = this.guessPageArrangement(placed);
      if (guess) {
        placement = this.placementFromArrangement(placed, guess);
        layoutSource = 'guessed';
        tiling = { across: guess.across, down: guess.down };
        for (const p of sessionPages) if (placement.pages[p.pageIndex]) p.initial = placement.pages[p.pageIndex];
      }
    }

    const session = {
      kind: 'pdf-pages',
      pages: sessionPages,
      legend,
      stated: this.readStatedFacts(pages),
      layoutSource,
      tiling,
      guess,
      layoutWarnings: (chartLayout.warnings || []).filter(w => !leftOutMsg.test(w)),
      placement,
      build: (pl) => this.buildFromLayout(session, pl),
    };
    return session;
  }

  /**
   * Build the project for a given page arrangement.
   *
   * `placement.pages` maps a page number to the absolute cell at which its
   * top-left corner sits; a page absent from it is left out. Where pages
   * overlap — a chart repeating a row or two at each page break — a stitched
   * reading beats an empty one, so repeats line up rather than double.
   * `placement.manual` marks an arrangement made by hand rather than read from
   * the PDF, which the import report records.
   */
  buildFromLayout(session, placement) {
    const at = (placement && placement.pages) || {};
    const manual = !!(placement && placement.manual);
    const byKey = new Map();
    const bsLines = [];
    let totalCols = 0, totalRows = 0;

    for (const pg of session.pages) {
      const pos = at[pg.pageIndex];
      if (!pos) continue;
      if (pos.col + pg.cols > totalCols) totalCols = pos.col + pg.cols;
      if (pos.row + pg.rows > totalRows) totalRows = pos.row + pg.rows;
      for (const c of pg.cells) {
        const col = c.col + pos.col, row = c.row + pos.row;
        const k = col + ',' + row;
        const prev = byKey.get(k);
        if (!prev || !c.isEmpty) byKey.set(k, Object.assign({}, c, { col, row }));
      }
      for (const l of pg.bs) {
        bsLines.push(Object.assign({}, l, { x1: l.x1 + pos.col, y1: l.y1 + pos.row, x2: l.x2 + pos.col, y2: l.y2 + pos.row }));
      }
    }

    const warnings = session.layoutWarnings.slice();
    const out = session.pages.filter(p => !at[p.pageIndex]);
    const dup = out.filter(p => p.reason === 'duplicate').map(p => p.pageIndex);
    const missing = out.filter(p => p.reason !== 'duplicate').map(p => p.pageIndex);
    if (dup.length) {
      warnings.push((dup.length > 1 ? 'Pages ' + dup.join(', ') + ' repeat' : 'Page ' + dup[0] + ' repeats') +
        ' another page in a different style and ' + (dup.length > 1 ? 'were' : 'was') + ' not imported.');
    }
    if (missing.length) {
      warnings.push(missing.length > 1
        ? 'Pages ' + missing.join(', ') + ' looked like chart pages but were not placed, and were not imported.'
        : 'Page ' + missing[0] + ' looked like a chart page but was not placed, and was not imported.');
    }
    if (manual) warnings.push('The page layout was arranged by hand.');
    else if (session.guess) warnings.push(this.describeGuess(session.guess));

    const layout = {
      totalColumns: totalCols || 1, totalRows: totalRows || 1, pages: [],
      scanned: !!session.scanned,
      layoutSource: manual ? 'manual' : session.layoutSource,
      tiling: manual ? null : session.tiling,
      warnings,
    };
    return this.convertToPattern(layout, Array.from(byKey.values()), session.legend, bsLines, session.stated);
  }

  /**
   * @param {any} pdfData
   * @returns {Promise<PdfPageData[]>}
   */
  async extractAllPages(pdfData) {
    // PERF (perf-5 #2): fetch all pages in parallel and run getTextContent + getOperatorList per page concurrently.
    // Sequential await previously cost ~200-500ms per page; parallel cuts a 10-page PDF from 2-5s to ~200-500ms.
    const pageObjects = await Promise.all(
      Array.from({ length: pdfData.numPages }, (_, idx) => pdfData.getPage(idx + 1))
    );
    const pages = await Promise.all(pageObjects.map(async (page, idx) => {
      const i = idx + 1;
      const viewport = page.getViewport({ scale: 1.0 });
      const [textContent, opList] = await Promise.all([
        page.getTextContent({ disableCombineTextItems: true }),
        page.getOperatorList()
      ]);
      const textItems = textContent.items.map(item => {
        // PDF coordinates are bottom-up, and can have an arbitrary transform.
        // We'll use the viewport transform to normalize everything to top-down viewport space.
        // item.transform is [scaleX, skewX, skewY, scaleY, tx, ty]
        const tx = item.transform[4];
        const ty = item.transform[5];

        // Use viewport to map to standard coordinates
        const viewportPt = viewport.convertToViewportPoint(tx, ty);

        // Font size is roughly the scaling factor
        const fontSize = Math.sqrt(item.transform[0]*item.transform[0] + item.transform[1]*item.transform[1]);

        // Some subset fonts map symbols to PUA (Private Use Area) or low ASCII.
        // We'll trust item.str, but if it's not a standard printable char,
        // we might want to store the unicode code point instead.
        // Or if the string is empty but the item exists.

        let charStr = item.str;
        // If it's a known non-printable or generic block, we try to use it directly,
        // but often the text layer extraction of pdf.js handles ToUnicode CMap.
        // If the CMap is missing, pdf.js might return empty or undefined characters.
        // But let's assume item.str is populated correctly for now or fallback to a hex code.
        if (charStr.length > 0 && charStr.charCodeAt(0) < 32) {
          charStr = `U+${charStr.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
        }

        return {
          str: charStr,
          x: viewportPt[0],
          y: viewportPt[1], // Y is now top-down
          width: item.width * (viewport.scale || 1),
          height: item.height * (viewport.scale || 1),
          fontName: item.fontName,
          fontSize: fontSize,
          // Text set at an angle — DMC prints its copyright up the page margin.
          // Its width is measured along the baseline, so read as level text a
          // vertical line of it appears to span half the chart.
          rotated: Math.abs(item.transform[1]) > 1e-3 || Math.abs(item.transform[2]) > 1e-3
        };
      });

      // To do advanced CMap extraction, we'd need to hook into the pdfjs font loading.
      // For now, ensuring we capture non-printable characters as distinct hex strings
      // avoids them being swallowed by `trim()` or collapsing into empty strings.

      const vectorPaths = this.extractVectorPaths(opList, viewport);

      const fonts = [];

      const record = {
        pageIndex: i,
        width: viewport.width,
        height: viewport.height,
        vectorPaths,
        textItems,
        fonts,
        // Images painted on the page: a scanned chart is one big one.
        images: this.findPageImages(opList, viewport)
      };
      // Kept for rendering a scanned page to pixels; not enumerable, so it
      // never travels with anything that copies or serialises the page.
      Object.defineProperty(record, '_pdfPage', { value: page, enumerable: false });
      return record;
    }));
    return pages;
  }

  extractVectorPaths(opList, viewport) {
    const paths = [];
    const fnArray = opList.fnArray;
    const argsArray = opList.argsArray;

    let currentPath = [];
    let currentRGB = null;
    let currentStrokeRGB = null;
    let currentLineWidth = 1;
    let currentTransform = [1, 0, 0, 1, 0, 0];
    // Graphics-state stack for q/Q (PDF 1.7 §8.4.2). `transform` ops multiply
    // into currentTransform cumulatively, so Q has to restore the matrix that
    // was in force at the matching q. Resetting it to the identity instead —
    // as this did — silently drops any enclosing scale and lets the matrix
    // drift for the rest of the page: charts produced by "Microsoft: Print To
    // PDF" wrap their content in a 0.75 (72/96 dpi) scale inside q/Q, so every
    // coordinate came out 4/3 too large and page origins landed thousands of
    // points off the sheet.
    const gsStack = [];

    const addPoint = (x, y) => {
      // Apply current transform before viewport conversion
      const tx = x * currentTransform[0] + y * currentTransform[2] + currentTransform[4];
      const ty = x * currentTransform[1] + y * currentTransform[3] + currentTransform[5];
      const pt = viewport.convertToViewportPoint(tx, ty);
      currentPath.push({x: pt[0], y: pt[1]});
    };

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];

      if (fn === pdfjsLib.OPS.transform) {
          // Multiply current transform matrix with new transform
          const [a, b, c, d, e, f] = args;
          const [a1, b1, c1, d1, e1, f1] = currentTransform;
          currentTransform = [
             a1 * a + c1 * b,
             b1 * a + d1 * b,
             a1 * c + c1 * d,
             b1 * c + d1 * d,
             a1 * e + c1 * f + e1,
             b1 * e + d1 * f + f1
          ];
      } else if (fn === pdfjsLib.OPS.save) {
              gsStack.push({ transform: currentTransform.slice(), rgb: currentRGB,
                         strokeRgb: currentStrokeRGB, lineWidth: currentLineWidth });
          currentPath = [];
      } else if (fn === pdfjsLib.OPS.restore) {
          currentPath = [];
          const prev = gsStack.pop();
          // An unbalanced Q (more restores than saves) is malformed but does
          // occur; leaving the matrix alone is safer than resetting it.
          if (prev) {
            currentTransform = prev.transform;
            currentRGB = prev.rgb;
            currentStrokeRGB = prev.strokeRgb;
            currentLineWidth = prev.lineWidth;
          }
      }

      // Track RGB fills
      if (fn === pdfjsLib.OPS.setFillRGBColor || fn === 59) {
         currentRGB = args;
      }

      // Stroke colour and width. Backstitch is drawn as stroked line work, so
      // without these a backstitch line has no thread colour to match against —
      // only fills were being recorded.
      if (fn === pdfjsLib.OPS.setStrokeRGBColor) {
         currentStrokeRGB = args;
      } else if (fn === pdfjsLib.OPS.setStrokeGray) {
         const gray = Math.round((args && args[0] || 0) * 255);
         currentStrokeRGB = [gray, gray, gray];
      } else if (fn === pdfjsLib.OPS.setLineWidth) {
         currentLineWidth = (args && args[0]) || 1;
      }

      if (fn === pdfjsLib.OPS.constructPath) {
        const ops = args[0];
        const pointArgs = args[1];
        let argIdx = 0;
        // OPS internal mapping for paths: pdfjsLib.OPS.moveTo, pdfjsLib.OPS.lineTo, etc.
        // PDF.js typically emits its OPS constants (13, 14, 19, etc).
        // Some older structures mapped them to 1, 2, 7. We'll support both.
        for (let j = 0; j < ops.length; j++) {
           const op = ops[j];
           if (op === pdfjsLib.OPS.moveTo || op === 1 || op === 13) { // moveTo
              if (currentPath.length > 0) {
                 paths.push({ type: currentPath.length === 2 ? 'line' : 'path', points: currentPath, lineWidth: 1, pendingFill: true });
              }
              currentPath = [];
              addPoint(pointArgs[argIdx++], pointArgs[argIdx++]);
           } else if (op === pdfjsLib.OPS.lineTo || op === 2 || op === 14) { // lineTo
              addPoint(pointArgs[argIdx++], pointArgs[argIdx++]);
           } else if (op === pdfjsLib.OPS.rectangle || op === 7 || op === 19) { // rectangle
              if (currentPath.length > 0) {
                 paths.push({ type: currentPath.length === 2 ? 'line' : 'path', points: currentPath, lineWidth: 1, pendingFill: true });
              }
              currentPath = [];
              const rx = pointArgs[argIdx++];
              const ry = pointArgs[argIdx++];
              const rw = pointArgs[argIdx++];
              const rh = pointArgs[argIdx++];
              addPoint(rx, ry);
              addPoint(rx + rw, ry);
              addPoint(rx + rw, ry + rh);
              addPoint(rx, ry + rh);
              addPoint(rx, ry);
              paths.push({
                type: 'rect',
                points: currentPath,
                lineWidth: 1,
                pendingFill: true
              });
              currentPath = [];
           } else if (op === pdfjsLib.OPS.closePath || op === 6 || op === 18) { // closePath
              if (currentPath.length > 0 && currentPath[0].x !== currentPath[currentPath.length-1].x && currentPath[0].y !== currentPath[currentPath.length-1].y) {
                 currentPath.push({x: currentPath[0].x, y: currentPath[0].y});
              }
           } else if (op === pdfjsLib.OPS.curveTo || op === 3 || op === 15) {
              argIdx += 6;
           } else if (op === pdfjsLib.OPS.curveTo2 || op === pdfjsLib.OPS.curveTo3 || op === 4 || op === 5 || op === 16 || op === 17) {
              argIdx += 4;
           }
        }
      } else if (fn === pdfjsLib.OPS.moveTo) {
        if (currentPath.length > 0) {
           paths.push({ type: currentPath.length === 2 ? 'line' : 'path', points: currentPath, lineWidth: 1, pendingFill: true });
        }
        currentPath = [];
        addPoint(args[0], args[1]);
      } else if (fn === pdfjsLib.OPS.lineTo) {
        addPoint(args[0], args[1]);
      } else if (fn === pdfjsLib.OPS.rectangle) {
        if (currentPath.length > 0) {
           paths.push({ type: currentPath.length === 2 ? 'line' : 'path', points: currentPath, lineWidth: 1, pendingFill: true });
        }
        currentPath = [];
        addPoint(args[0], args[1]);
        addPoint(args[0] + args[2], args[1]);
        addPoint(args[0] + args[2], args[1] + args[3]);
        addPoint(args[0], args[1] + args[3]);
        addPoint(args[0], args[1]);
        paths.push({
          type: 'rect',
          points: currentPath,
          lineWidth: 1,
          pendingFill: true
        });
        currentPath = [];
      } else if (fn === pdfjsLib.OPS.endPath) {
        // "n": end the path WITHOUT painting it — how a clipping path is
        // closed off ("re W n"). Left pending, the shape was painted by the
        // next fill to come along: DMC's page-sized clip rectangles turned into
        // page-sized fills in their brand blue, which then covered every cell.
        if (currentPath.length > 0) currentPath = [];
        for (let k = paths.length - 1; k >= 0; k--) {
          if (!paths[k].pendingFill) break;
          paths.splice(k, 1);
        }
      } else if (fn === pdfjsLib.OPS.fillStroke || fn === pdfjsLib.OPS.eoFillStroke ||
                 fn === pdfjsLib.OPS.closeFillStroke || fn === pdfjsLib.OPS.closeEOFillStroke) {
        // "B", "B*", "b", "b*": fill and stroke in one operator.
        if (currentPath.length > 0) {
          paths.push({ type: currentPath.length === 2 ? 'line' : 'path', points: currentPath, lineWidth: 1, pendingFill: true });
          currentPath = [];
        }
        for (let k = paths.length - 1; k >= 0; k--) {
          if (!paths[k].pendingFill) break;
          paths[k].fillColor = currentRGB ? Array.from(currentRGB) : null;
          paths[k].strokeColor = currentStrokeRGB ? Array.from(currentStrokeRGB) : null;
          paths[k].lineWidth = currentLineWidth;
          paths[k].stroked = true;
          delete paths[k].pendingFill;
        }
      } else if (fn === pdfjsLib.OPS.stroke || fn === pdfjsLib.OPS.fill || fn === pdfjsLib.OPS.eoFill || fn === 20 || fn === 22 || fn === 23) {
        if (currentPath.length > 0) {
          paths.push({
            type: currentPath.length === 2 ? 'line' : 'path',
            points: currentPath,
            lineWidth: 1,
            pendingFill: true
          });
          currentPath = [];
        }
        // Retroactively apply the fill color to all pending paths
        if (fn === pdfjsLib.OPS.fill || fn === pdfjsLib.OPS.eoFill || fn === 22 || fn === 23) {
            for (let k = paths.length - 1; k >= 0; k--) {
                if (paths[k].pendingFill) {
                    // Only apply if it's an actual color array, otherwise leave as null
                    paths[k].fillColor = currentRGB ? Array.from(currentRGB) : null;
                    delete paths[k].pendingFill;
                } else {
                    break;
                }
            }
        } else {
            // A stroke: record the pen that drew it, so backstitch line work can
            // be told apart from grid rules and matched to a thread colour.
            for (let k = paths.length - 1; k >= 0; k--) {
                if (paths[k].pendingFill) {
                    paths[k].strokeColor = currentStrokeRGB ? Array.from(currentStrokeRGB) : null;
                    paths[k].lineWidth = currentLineWidth;
                    paths[k].stroked = true;
                    delete paths[k].pendingFill;
                } else {
                    break;
                }
            }
        }
      }
    }
    return paths;
  }

  /**
   * @param {PdfPageData[]} pages
   */
  classifyPages(pages) {
    const chartPages = [];
    const legendPages = [];
    const coverPages = [];
    const infoPages = [];

    for (const page of pages) {
      const numLines = page.vectorPaths.filter(p => p.type === 'line' || p.type === 'rect').length;
      // Filled cells drawn as general paths rather than rectangles (pdf-lib and
      // several charting programs draw them that way) count as shapes too.
      const numShapes = numLines + page.vectorPaths.filter(p => p.type === 'path' && p.fillColor).length;
      const numTexts = page.textItems.length;
      const numSingleChars = page.textItems.filter(t => t.str.trim().length === 1).length;
      const hasDMC = page.textItems.some(t => t.str.toLowerCase().includes('dmc'));

      // A page printing axis rulers on both edges is a chart page, and nothing
      // else is: a legend, cover or materials sheet has no reason to carry two
      // monotonic numeric scales that fit a straight line. This is the most
      // reliable signal available, so it is tested first.
      const hasRulers = this.pageHasAxisRulers(page);

      // Some charts map symbols entirely as paths rather than text items.
      // If we see thousands of lines, it's definitely a chart page, even if text items are low.
      if (hasRulers) {
        chartPages.push(page);
      // A chart drawn as filled cells with no text needs only enough ruled
      // and filled shapes to be more than a key; the grid-shape test does the
      // real work. The count was 2000, which turned away a 30 x 30 chart.
      } else if ((numTexts > 1000 || numShapes > 200) &&
                 this.looksLikeChartGrid(page)) {
        chartPages.push(page);
      } else if (numLines > 50 && numSingleChars > 50 && this.symbolsLookGridded(page)) {
        chartPages.push(page);
      } else if (hasDMC || page.textItems.some(t => t.str.toLowerCase().includes('stitch count'))) {
        legendPages.push(page);
      } else if (page.pageIndex === 1) {
        coverPages.push(page);
      } else {
        infoPages.push(page);
      }
    }

    return { chartPages, legendPages, coverPages, infoPages };
  }

  detectChartLayout(chartPages) {
    const pages = chartPages.map((p, i) => {
      return {
        pageIndex: p.pageIndex,
        grid: this.gridOf(p),
        globalOffsetCol: 0,
        globalOffsetRow: 0,
        rawPage: p
      };
    });

    if (pages.length === 0) {
      return { totalColumns: 0, totalRows: 0, pages: [] };
    }

    // Sort pages by page index to assume reading order (left-to-right, top-to-bottom)
    pages.sort((a, b) => a.pageIndex - b.pageIndex);

    // Preferred path: read each page's printed axis rulers, which state in
    // absolute design coordinates which slice of the pattern the page covers.
    // That places a multi-page chart as a real 2D tiling — remainder pages,
    // page-edge overlap and non-standard page order all fall out correctly —
    // instead of the single horizontal strip the fallback below produces.
    // See pdf-axis-labels.js for why this beats inferring from the page count.
    const rulerLayout = this.readRulerLayout(pages);
    if (rulerLayout) return rulerLayout;

    // Publishers often print one design twice — a colour chart and a
    // black-and-white symbol chart — and laying those side by side doubles the
    // design. When the pages are alternates rather than tiles, import one.
    const alternates = this.findAlternateRenderings(pages);
    if (alternates) {
      for (const p of pages) if (p !== alternates.keep) delete p.rawPage;
      pages.length = 0;
      pages.push(alternates.keep);
    }

    // Initial naive layout: just put them in a row
    // A more advanced heuristic: Check text items for overlapping row/col numbers
    // For now, we'll try to guess based on standard width.
    // Usually, charts with many pages form a grid. Let's find overlapping symbols.

    let currentCol = 0;
    let currentRow = 0;
    const maxWidthPerPage = pages[0].grid.columns;

    // Pattern Keeper PDFs typically have some margin overlap, e.g., 3 cells.
    // Instead of doing full symbol matching which is error-prone before we normalize viewport coords,
    // we'll place pages sequentially, wrapping when we detect page labels or when a page doesn't seem to have overlap to the left.
    // For a robust implementation without complex symbol matching, we'll arrange them in a single row if we can't detect a multi-row structure.

    // As a better heuristic: assume a 2D layout based on standard page sizes.
    // If a page has overlap on top, it's a new row.

    // Let's implement a simpler approach: we just concatenate horizontally, and if we see a page that is the same size as the first one, it might be a new column. But we don't know the rows.
    // Actually, Pattern Keeper often provides page maps.
    // Let's use a very basic sequential layout for now, assuming no overlap, wrapped at some column limit if we had one.
    // Without full overlap detection, let's just arrange them sequentially horizontally.
    // Wait, the user specifically mentioned:
    // "Pattern Keeper PDFs split large charts across multiple pages with overlapping rows/columns at the edges
    // Detect overlap regions by comparing symbols in the margin areas of adjacent pages"

    // To do this right, we need to extract symbols FIRST, then stitch.
    // But our architecture extracts symbols AFTER layout.
    // Let's just do sequential placement without overlap for the *layout* pass,
    // and if we want overlap, we can do it after extracting symbols.
    // For now, let's just pack them horizontally without the arbitrary 50 limit.

    pages[0].globalOffsetCol = 0;
    pages[0].globalOffsetRow = 0;

    let currentX = pages[0].grid.columns;

    for (let i = 1; i < pages.length; i++) {
        // Just stack them horizontally for now, using the actual grid columns
        pages[i].globalOffsetCol = currentX;
        pages[i].globalOffsetRow = 0;
        currentX += pages[i].grid.columns;
    }

    let totalCols = 0;
    let totalRows = 0;
    pages.forEach(p => {
      totalCols = Math.max(totalCols, p.globalOffsetCol + p.grid.columns);
      totalRows = Math.max(totalRows, p.globalOffsetRow + p.grid.rows);
      delete p.rawPage;
    });

    const out = {
      totalColumns: totalCols,
      totalRows: totalRows,
      pages: pages
    };
    if (alternates) {
      out.layoutSource = 'alternate-renderings';
      out.droppedAlternates = alternates.dropped;
      out.warnings = ['Pages ' + alternates.dropped.join(', ') + ' repeat page ' +
        alternates.keep.pageIndex + ' in another style and were not imported.'];
    }
    return out;
  }

  /**
   * Work out how the pages of a chart with no printed row and column numbers
   * fit together, from their sizes and from what lies along their edges.
   *
   * Two things give the arrangement away:
   *
   *  - Sizes. A design rarely divides evenly into pages, so the last page of
   *    each row is narrower than the rest and the pages of the last row are
   *    shorter. Pages sharing a column of the arrangement share a width, and
   *    pages sharing a row share a height; most arrangements break that.
   *  - Edges. Stitching runs on across a page break, so a page's last column
   *    resembles its right-hand neighbour's first column far more than it does
   *    an unrelated page's. Charts that repeat a few rows or columns at each
   *    break are plainer still: the repeat matches exactly, and its width is
   *    the overlap to remove.
   *
   * Arrangements considered are complete grids in reading order, along rows or
   * down columns. Returns null when nothing beats page order clearly, so the
   * importer keeps it and the stitcher arranges the pages by hand. Otherwise:
   *   { across, down, byColumns, slots: [pageIndex in row-major order],
   *     overlap: { cols, rows }, basis: 'sizes' | 'edges' }
   *
   * @param {Array<{pageIndex:number, cols:number, rows:number, cells:Array}>} pages
   */
  guessPageArrangement(pages) {
    const n = pages.length;
    if (n < 2) return null;
    const MAX_OVERLAP = 6;

    // Each page as thread ids ('' where unstitched) and their colours.
    const grids = pages.map(p => {
      const id = new Array(p.cols * p.rows).fill('');
      const rgb = new Array(p.cols * p.rows).fill(null);
      for (const c of p.cells || []) {
        if (c.isEmpty || !c.thread || c.col < 0 || c.row < 0 || c.col >= p.cols || c.row >= p.rows) continue;
        const k = c.row * p.cols + c.col;
        id[k] = String(c.thread.id);
        rgb[k] = c.thread.rgb || null;
      }
      return { w: p.cols, h: p.rows, id, rgb };
    });

    // Compare line a of page A with line b of page B — columns when `byCol`,
    // otherwise rows — along the length they share. Places where both are
    // unstitched say nothing and are not counted.
    const compare = (A, a, B, b, byCol) => {
      const len = byCol ? Math.min(A.h, B.h) : Math.min(A.w, B.w);
      let same = 0, close = 0, seen = 0;
      for (let t = 0; t < len; t++) {
        const ka = byCol ? t * A.w + a : a * A.w + t;
        const kb = byCol ? t * B.w + b : b * B.w + t;
        const ia = A.id[ka], ib = B.id[kb];
        if (!ia && !ib) continue;
        seen++;
        if (ia === ib) { same++; continue; }
        const ca = A.rgb[ka], cb = B.rgb[kb];
        if (ca && cb) {
          const d = Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]);
          if (d < 40) close++;
        }
      }
      return { same, close, seen };
    };

    // How alike neighbouring columns (and rows) are inside the pages: the
    // yardstick for telling a repeated line from one that merely continues.
    const inside = (byCol) => {
      let same = 0, seen = 0;
      for (const g of grids) {
        const lines = byCol ? g.w : g.h;
        for (let a = 0; a + 1 < lines; a++) {
          const s = compare(g, a, g, a + 1, byCol);
          same += s.same; seen += s.seen;
        }
      }
      return seen ? same / seen : 1;
    };

    // fit[dir][i][j][k]: page j placed after page i (right of it, or below),
    // the two sharing k lines (k = 0: none shared, the edges merely meet).
    const edgeFits = (byCol) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push([]);
        for (let j = 0; j < n; j++) {
          if (i === j) { out[i].push(null); continue; }
          const A = grids[i], B = grids[j];
          const lines = byCol ? Math.min(A.w, B.w) : Math.min(A.h, B.h);
          const ks = [];
          const meet = compare(A, (byCol ? A.w : A.h) - 1, B, 0, byCol);
          ks.push({ fit: meet.same + 0.5 * meet.close, seen: meet.seen });
          for (let k = 1; k <= MAX_OVERLAP && k * 4 <= lines; k++) {
            let same = 0, seen = 0;
            for (let t = 0; t < k; t++) {
              const s = compare(A, (byCol ? A.w : A.h) - k + t, B, t, byCol);
              same += s.same; seen += s.seen;
            }
            ks.push({ fit: same, seen });
          }
          out[i].push(ks);
        }
      }
      return out;
    };
    const fitH = edgeFits(true), fitV = edgeFits(false);
    const baseH = inside(true), baseV = inside(false);

    // Every complete grid, along rows and down columns, once per distinct
    // geometry (a single row reads the same either way).
    const candidates = [];
    const seenShape = new Set();
    for (let across = 1; across <= n; across++) {
      if (n % across) continue;
      const down = n / across;
      for (const byColumns of [false, true]) {
        const slots = new Array(n);
        for (let s = 0; s < n; s++) {
          const col = byColumns ? Math.floor(s / down) : s % across;
          const row = byColumns ? s % down : Math.floor(s / across);
          slots[row * across + col] = s;
        }
        const key = across + ':' + slots.join(',');
        if (seenShape.has(key)) continue;
        seenShape.add(key);
        candidates.push({ across, down, byColumns, slots });
      }
    }

    const sizesFit = (cand) => {
      const { across, down, slots } = cand;
      for (let c = 0; c < across; c++) {
        const ws = [];
        for (let r = 0; r < down; r++) ws.push(grids[slots[r * across + c]].w);
        if (Math.max(...ws) - Math.min(...ws) > 1) return false;
      }
      for (let r = 0; r < down; r++) {
        const hs = [];
        for (let c = 0; c < across; c++) hs.push(grids[slots[r * across + c]].h);
        if (Math.max(...hs) - Math.min(...hs) > 1) return false;
      }
      return true;
    };

    // How alike two unrelated pages' edges are: the level a true neighbour
    // has to rise above.
    const MIN_SEEN = 8;
    const chanceOf = (fits) => {
      let sum = 0, count = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const f = fits[i][j] && fits[i][j][0];
        if (f && f.seen >= MIN_SEEN) { sum += f.fit / f.seen; count++; }
      }
      return count ? sum / count : 0;
    };

    // The evidence for an arrangement along one direction, and the overlap it
    // implies. Each pair of neighbours adds how far its edges agree beyond
    // chance, so the arrangement that puts the most true neighbours together
    // wins — a single strip of pages holds most of the side-by-side pairs of
    // the real grid, and judged on average agreement alone it ties with it.
    //
    // A repeat is believed only when it matches almost exactly and far better
    // than neighbouring lines inside a page do, since some designs have long
    // runs of one colour. A single repeated line is not believed at all: a
    // design that is mirror-symmetric about a page break matches itself
    // exactly there. The stitcher can still set one.
    const scoreDirection = (pairs, fits, base, chance) => {
      let overlap = 0;
      let best = null;
      for (let k = 2; k <= MAX_OVERLAP; k++) {
        let same = 0, seen = 0, ok = true;
        for (const [i, j] of pairs) {
          const f = fits[i][j][k];
          if (!f) { ok = false; break; }
          same += f.fit; seen += f.seen;
        }
        if (!ok || seen < 12) continue;
        const e = same / seen;
        if (!best || e > best.e) best = { k, e };
      }
      if (best && best.e >= 0.97 && (1 - best.e) <= (1 - base) / 3) overlap = best.k;
      let evidence = 0, seen = 0;
      for (const [i, j] of pairs) {
        const f = fits[i][j][overlap];
        seen += f.seen;
        if (f.seen >= MIN_SEEN) evidence += f.fit / f.seen - chance;
      }
      return { overlap, evidence, seen };
    };

    const chanceH = chanceOf(fitH), chanceV = chanceOf(fitV);
    for (const cand of candidates) {
      const { across, down, slots } = cand;
      const hPairs = [], vPairs = [];
      for (let r = 0; r < down; r++) {
        for (let c = 0; c < across; c++) {
          const here = slots[r * across + c];
          if (c + 1 < across) hPairs.push([here, slots[r * across + c + 1]]);
          if (r + 1 < down) vPairs.push([here, slots[(r + 1) * across + c]]);
        }
      }
      const h = scoreDirection(hPairs, fitH, baseH, chanceH);
      const v = scoreDirection(vPairs, fitV, baseV, chanceV);
      cand.overlap = { cols: h.overlap, rows: v.overlap };
      cand.seen = h.seen + v.seen;
      cand.score = cand.seen >= 12 ? h.evidence + v.evidence : null;
      cand.sizesFit = sizesFit(cand);
    }

    const strip = candidates.find(c => c.across === n);
    const fitting = candidates.filter(c => c.sizesFit);
    const answer = (cand, basis) => (cand === strip && !cand.overlap.cols ? null : {
      across: cand.across, down: cand.down, byColumns: cand.byColumns,
      slots: cand.slots.map(s => pages[s].pageIndex),
      overlap: cand.overlap, basis,
    });

    // The sizes alone may allow only one arrangement.
    if (fitting.length === 1) return answer(fitting[0], 'sizes');

    // Otherwise the edges decide, among the arrangements the sizes allow (or
    // all of them, when a page was cut oddly and none fits exactly). The
    // winner needs real evidence, and must stand clear of the runner-up by
    // about one more pair of neighbours that agree.
    const pool = (fitting.length ? fitting : candidates).filter(c => c.score !== null);
    if (!pool.length) return null;
    pool.sort((a, b) => b.score - a.score);
    const top = pool[0], next = pool[1];
    const margin = Math.max(0.3, top.score * 0.1);
    if (top.score < margin) return null;
    if (next && top.score - next.score < margin) return null;
    return answer(top, 'edges');
  }

  /**
   * Absolute offsets for a guessed arrangement: each column as wide as its
   * widest page and each row as tall as its tallest, less any overlap.
   */
  placementFromArrangement(pages, arr) {
    const size = new Map(pages.map(p => [p.pageIndex, p]));
    const colW = new Array(arr.across).fill(0), rowH = new Array(arr.down).fill(0);
    arr.slots.forEach((pi, k) => {
      const p = size.get(pi);
      const c = k % arr.across, r = Math.floor(k / arr.across);
      colW[c] = Math.max(colW[c], p.cols);
      rowH[r] = Math.max(rowH[r], p.rows);
    });
    const colOff = [], rowOff = [];
    let acc = 0;
    for (let c = 0; c < arr.across; c++) { colOff[c] = acc; acc += colW[c] - arr.overlap.cols; }
    acc = 0;
    for (let r = 0; r < arr.down; r++) { rowOff[r] = acc; acc += rowH[r] - arr.overlap.rows; }
    const at = {};
    arr.slots.forEach((pi, k) => { at[pi] = { col: colOff[k % arr.across], row: rowOff[Math.floor(k / arr.across)] }; });
    return { pages: at, manual: false, overlap: { cols: arr.overlap.cols, rows: arr.overlap.rows } };
  }

  /** The import report's account of a guessed arrangement. */
  describeGuess(arr) {
    const plural = (k, one, many) => k + ' ' + (k === 1 ? one : many);
    const how = arr.basis === 'sizes' ? 'from their sizes' : 'by matching their edges';
    let msg = 'The pages carry no row or column numbers, so they were arranged ' +
      plural(arr.across, 'page', 'pages') + ' across ' + how + '.';
    const { cols, rows } = arr.overlap;
    if (cols || rows) {
      const parts = [];
      if (cols) parts.push(plural(cols, 'column', 'columns'));
      if (rows) parts.push(plural(rows, 'row', 'rows'));
      msg += ' Each page repeats ' + parts.join(' and ') + ' of the next, and the repeats were merged.';
    }
    return msg + ' Check that the pages line up.';
  }

  /**
   * Are these chart pages the same design printed in different styles, rather
   * than tiles of one larger design?
   *
   * DMC prints "Moonlight" (PAT1968_2) as a colour chart and again as a
   * black-and-white symbol chart; tiling them side by side imported the design
   * at double width. The two are recognisable without reading any content:
   *   • their grids match in size and sit in the same place on the sheet, and
   *   • one paints many colours inside its grid while the others paint almost
   *     none — PAT1968_2's colour chart paints 9, its symbol chart 3 (ink,
   *     paper and a blue centre marker).
   * Genuine tiles of one design are rendered alike, so they never show that
   * one-rich-the-rest-plain split, and gen1's tiles (one colour each) are left
   * alone.
   *
   * Only reached when the pages carry no axis rulers; ruler-placed tiles have
   * already been laid out.
   *
   * @returns {{keep:Object, dropped:number[]}|null}
   */
  findAlternateRenderings(pages) {
    if (!pages || pages.length < 2) return null;
    const info = pages.map(p => {
      const g = p.grid;
      if (!g || !(g.cellWidth > 0) || !p.rawPage) return null;
      const x0 = g.originX, x1 = x0 + g.columns * g.cellWidth;
      const y0 = g.originY, y1 = y0 + g.rows * g.cellHeight;
      const colours = new Set();
      // Where the page puts its ink, in 4x4-cell blocks: a colour chart's
      // painted cells, a symbol chart's glyphs. Backdrops and bare paper are
      // left out, being the same everywhere.
      const blocks = new Set();
      const gw = x1 - x0, gh = y1 - y0;
      for (const v of p.rawPage.vectorPaths || []) {
        if (!v.fillColor || !v.points || !v.points.length) continue;
        let sx = 0, sy = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (const q of v.points) {
          sx += q.x; sy += q.y;
          if (q.x < bx0) bx0 = q.x; if (q.x > bx1) bx1 = q.x;
          if (q.y < by0) by0 = q.y; if (q.y > by1) by1 = q.y;
        }
        sx /= v.points.length; sy /= v.points.length;
        if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
        colours.add(Math.round(v.fillColor[0]) + ',' + Math.round(v.fillColor[1]) + ',' + Math.round(v.fillColor[2]));
        if (bx1 - bx0 >= gw * 0.3 && by1 - by0 >= gh * 0.3) continue;
        if (v.fillColor[0] >= 248 && v.fillColor[1] >= 248 && v.fillColor[2] >= 248) continue;
        blocks.add(Math.floor((sx - x0) / (g.cellWidth * 4)) + ',' + Math.floor((sy - y0) / (g.cellHeight * 4)));
      }
      return { p, g, colours: colours.size, blocks };
    });
    if (info.some(i => !i)) return null;

    const ref = info[0].g;
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    const alike = info.every(i =>
      near(i.g.columns, ref.columns, Math.max(4, ref.columns * 0.08)) &&
      near(i.g.rows, ref.rows, Math.max(4, ref.rows * 0.08)) &&
      near(i.g.originX, ref.originX, 4 * ref.cellWidth) &&
      near(i.g.originY, ref.originY, 4 * ref.cellHeight));
    if (!alike) return null;

    const richest = info.reduce((a, b) => (b.colours > a.colours ? b : a));
    const others = info.filter(i => i !== richest);
    if (richest.colours < 5) return null;
    if (!others.every(i => i.colours <= 3)) return null;

    // Colour counts alone cannot tell a re-rendering from a genuinely plain
    // tile — a page of sky paints only two or three colours too. A re-rendering
    // puts its ink in the same places as the original; a different tile does
    // not. Require the occupied blocks to largely coincide.
    const overlap = (a, b) => {
      if (!a.size || !b.size) return 0;
      let both = 0;
      for (const k of a) if (b.has(k)) both++;
      return both / (a.size + b.size - both);
    };
    if (!others.every(i => overlap(richest.blocks, i.blocks) >= 0.6)) return null;

    return { keep: richest.p, dropped: others.map(i => i.p.pageIndex) };
  }

  /**
   * Does this page print numeric axis rulers on both axes? Charts do; legend,
   * cover and materials sheets do not. Returns false when the axis-label reader
   * is unavailable, so classification simply falls back to the heuristics.
   */
  pageHasAxisRulers(page) {
    const AX = (typeof window !== 'undefined' && window.PdfAxisLabels) ||
               (typeof PdfAxisLabels !== 'undefined' ? PdfAxisLabels : null);
    if (!AX || typeof AX.readPageRulers !== 'function') return false;
    try {
      return !!AX.readPageRulers(page.textItems, { yDown: true });
    } catch (e) {
      return false;
    }
  }

  /**
   * detectGrid is needed during classification as well as during layout, so
   * memoise it on the page rather than clustering the same lines twice.
   */
  gridOf(page) {
    if (!page._grid) page._grid = this.detectGrid(page);
    return page._grid;
  }

  /**
   * Does the page's ruled content have the proportions of a chart?
   *
   * Used to qualify the "symbols are drawn as paths, not text" branch of
   * classification, which otherwise keys off raw text and line counts. Those
   * counts do not distinguish a chart from a colour key: gen1's key carries 531
   * rectangles and 1059 text items, clearing both thresholds comfortably, and
   * was therefore imported as a chart page — which left the pattern with no
   * colour key parsed at all.
   *
   * A chart is ruled in both directions and tens of cells across. Keys and
   * materials lists are a narrow column or a single band, so a modest floor on
   * both dimensions separates them without needing to know the publisher.
   */
  looksLikeChartGrid(page) {
    const g = this.gridOf(page);
    if (!g) return false;
    // Tens of cells one way and a real span the other. Requiring twenty both
    // ways rejected the narrow remainder page at the end of a multi-page chart
    // (a dozen columns by eighty rows), losing its stitches; a key is still a
    // single band or a handful of cells wide, and fails the second test.
    const long = Math.max(g.columns, g.rows), short = Math.min(g.columns, g.rows);
    return long >= 20 && short >= 6;
  }

  /**
   * Are this page's single-character symbols laid out as a dense 2D grid, or as
   * a sparse list?
   *
   * A colour key defeats the line-and-symbol-count heuristic: its swatches count
   * as rectangles and its symbols as single characters, so a legend page can
   * easily clear "more than 50 of each" and be taken for a chart. gen1's key
   * does exactly that, and because it was claimed as a chart the pattern
   * imported with no colour key parsed at all.
   *
   * The shapes are easy to tell apart by how many symbols share a row: a chart
   * row holds dozens (gen1's chart pages average 86), a key row holds one or
   * two.
   */
  symbolsLookGridded(page) {
    const syms = page.textItems.filter(t => (t.str || '').trim().length === 1);
    if (syms.length < 2) return false;

    // Group by baseline. Rows of a chart share a y to within a fraction of the
    // cell, so an exact-ish bucket is enough and needs no pitch estimate.
    const bands = new Map();
    for (const s of syms) {
      const key = Math.round(s.y);
      bands.set(key, (bands.get(key) || 0) + 1);
    }
    if (!bands.size) return false;

    // Median rather than mean, so a single long caption cannot carry the page.
    const counts = Array.from(bands.values()).sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)];
    return median >= 8;
  }

  /**
   * Place chart pages using their printed axis rulers (pdf-axis-labels.js).
   *
   * Returns a chart layout whose pages each carry a `ruler` — an affine map from
   * page coordinates to absolute design cells — or null when the rulers can't be
   * read, in which case detectChartLayout falls back to sequential placement.
   *
   * A page whose ruler cannot be read is left out, provided the rest still
   * account for most of the chart; it is usually a key or notes page that
   * classification mistook for a chart. If it was a real chart page, its
   * stitches are missing — so every page left out is named in the warnings,
   * and pdf-axis-labels reads narrow remainder pages from as few as two labels
   * before giving up on them.
   *
   * @param {Array} pages pages from detectChartLayout, each with { pageIndex, grid, rawPage }
   * @returns {Object|null}
   */
  readRulerLayout(pages) {
    const AX = (typeof window !== 'undefined' && window.PdfAxisLabels) ||
               (typeof PdfAxisLabels !== 'undefined' ? PdfAxisLabels : null);
    if (!AX || typeof AX.readLayout !== 'function') return null;
    // A single chart page needs no placement; leave it to the existing path so
    // behaviour for single-page charts is untouched.
    if (pages.length < 2) return null;

    let layout;
    try {
      layout = AX.readLayout(
        pages.map(p => ({ pageIndex: p.pageIndex, textItems: p.rawPage.textItems })),
        { yDown: true }
      );
    } catch (e) {
      return null;
    }
    if (!layout || !layout.tiling) return null;

    const byIndex = new Map();
    for (const entry of layout.pages) {
      if (entry.offsets) byIndex.set(entry.pageIndex, entry.offsets);
    }
    // Pages without a ruler are almost always furniture that classifyPages
    // mistook for a chart (a legend sheet dense with symbols, say), so they are
    // dropped rather than allowed to veto the whole layout. But if the rulers
    // only account for a minority of pages, the read is not trustworthy and the
    // fallback is the safer answer.
    const placedPages = pages.filter(p => byIndex.has(p.pageIndex));
    if (placedPages.length < 2) return null;
    const ratio = placedPages.length / pages.length;
    const fillsRectangle = layout.tiling &&
      placedPages.length === layout.tiling.across * layout.tiling.down;
    if (!fillsRectangle && ratio < 0.8) return null;
    const leftOut = pages.filter(p => !byIndex.has(p.pageIndex)).map(p => p.pageIndex);
    pages = placedPages;

    // The rulers bound the design: `total*` is exact when they label their own
    // last cell, and `total*Max` allows for the trailing cells a stride-10 ruler
    // never names. Page content is clamped into that envelope — a content box
    // that maps outside it has picked up prose or furniture, not stitches.
    const limitCols = layout.totalColumnsMax || layout.totalColumns;
    const limitRows = layout.totalRowsMax || layout.totalRows;
    if (!limitCols || !limitRows) return null;

    let totalCols = 0;
    let totalRows = 0;

    for (const p of pages) {
      const r = byIndex.get(p.pageIndex);
      p.ruler = r;
      // Absolute 0-based cell span this page covers, derived from the page's own
      // ruler rather than from detectGrid, whose pitch and origin are unreliable
      // on glyph-style charts.
      // Prefer the grid actually drawn on the page, with the ruler used only to
      // say which absolute column and row it starts at. A grid rebuilt from the
      // ruler's fit is shifted by up to half a cell — label text is positioned
      // by its left edge, not its centre — and on gen-3 that put every cell
      // centre near its right-hand edge, so the text lookup missed most
      // symbols by a fraction of a point.
      const anchored = this.anchorGridToRuler(p.grid, r, limitCols, limitRows);
      const span = anchored || this.rulerCellSpan(p.rawPage, r, limitCols, limitRows);
      p.anchoredToGrid = !!anchored;
      p.globalOffsetCol = span.colStart;
      p.globalOffsetRow = span.rowStart;
      p.rulerSpan = span;
      if (span.colStart + span.columns > totalCols) totalCols = span.colStart + span.columns;
      if (span.rowStart + span.rows > totalRows) totalRows = span.rowStart + span.rows;
      delete p.rawPage;
    }

    if (!totalCols || !totalRows) return null;

    return {
      totalColumns: totalCols,
      totalRows: totalRows,
      pages: pages,
      tiling: layout.tiling,
      layoutSource: 'axis-rulers',
      warnings: (layout.warnings || []).concat(leftOut.length
        ? [(leftOut.length > 1
            ? 'Pages ' + leftOut.join(', ') + ' looked like chart pages but could not be placed, and were not imported.'
            : 'Page ' + leftOut[0] + ' looked like a chart page but could not be placed, and was not imported.')]
        : []),
    };
  }

  /**
   * Give a page's measured grid its absolute position from the ruler labels.
   *
   * Each label is placed in the measured column (or row) under its centre, and
   * the label's value minus that index is a vote for the grid's first column.
   * The most common vote wins, so a stray or misread label cannot move it.
   *
   * Only used when the measured grid agrees with the ruler on cell pitch to
   * within 4% — otherwise the measurement is suspect and the ruler-derived
   * span is used instead.
   *
   * @returns {{colStart,rowStart,columns,rows}|null} 0-based span
   */
  anchorGridToRuler(grid, ruler, limitCols, limitRows) {
    if (!grid || !ruler || !(grid.cellWidth > 0) || !(grid.cellHeight > 0)) return null;
    if (!ruler.colLabels || !ruler.rowLabels) return null;
    if (Math.abs(grid.cellWidth / ruler.pitchX - 1) > 0.04) return null;
    if (Math.abs(grid.cellHeight / ruler.pitchY - 1) > 0.04) return null;

    /* Publishers place labels two ways, and the two read differently:
     *   centred on its cell — gen-3: label N sits in the middle of cell N;
     *   on a ruled line   — gen1: label N sits on the line that ends cell N
     *                        (the bold tenth line).
     * Taking every label as cell-centred put gen1's tiles a row early, since
     * its row labels sit a hair past the line, in the next cell down. The
     * style is read from the labels themselves: where they sit relative to the
     * cell boundaries, on average. */
    const vote = (labels, centreOf, origin, pitch, count) => {
      const pos = [];
      for (const l of labels) {
        const c = centreOf(l);
        if (isFinite(c)) pos.push({ l, p: (c - origin) / pitch });
      }
      if (!pos.length) return null;
      const offLine = pos.reduce((n, e) => n + Math.abs(e.p - Math.round(e.p)), 0) / pos.length;
      const onLines = offLine < 0.15;
      const tally = new Map();
      for (const e of pos) {
        // The cell a label names: under it, or the one ending at its line.
        const idx = onLines ? Math.round(e.p) - 1 : Math.floor(e.p);
        if (idx < 0 || idx >= count) continue;      // a label outside the grid votes for nothing
        const first = e.l.value - idx;               // 1-based absolute index of column/row 0
        tally.set(first, (tally.get(first) || 0) + 1);
      }
      let best = null, bestN = 0;
      for (const [k, n] of tally) if (n > bestN) { bestN = n; best = k; }
      return bestN >= 2 ? best : null;
    };

    // A label's centre. Rotated labels — gen1 prints its row numbers reading
    // upwards — run along y from their origin, so their length is in width.
    const colCentre = l => l.rotated ? l.x - l.height / 2 : l.x + l.width / 2;
    const rowCentre = l => l.rotated ? l.y - l.width / 2 : l.y - l.height / 2;
    const firstCol = vote(ruler.colLabels, colCentre, grid.originX, grid.cellWidth, grid.columns);
    const firstRow = vote(ruler.rowLabels, rowCentre, grid.originY, grid.cellHeight, grid.rows);
    if (firstCol === null || firstRow === null || firstCol < 1 || firstRow < 1) return null;

    const colStart = firstCol - 1, rowStart = firstRow - 1;
    // The ruler can prove a cell the measurement missed. gen1's bottom pages
    // label row 450, but grid detection found 108 rows there (342-449) — the
    // outermost line of a chart is often its border, drawn differently from
    // the rules inside — so the design imported a row short of the 256 x 450
    // it states. A last label up to two cells past the measured grid extends
    // it; further than that, the measurement is trusted over the ruler.
    const lastCol = Math.max.apply(null, ruler.colLabels.map(l => l.value));
    const lastRow = Math.max.apply(null, ruler.rowLabels.map(l => l.value));
    let cols = grid.columns, rowsN = grid.rows;
    if (lastCol - firstCol + 1 > cols && lastCol - firstCol + 1 - cols <= 2) cols = lastCol - firstCol + 1;
    if (lastRow - firstRow + 1 > rowsN && lastRow - firstRow + 1 - rowsN <= 2) rowsN = lastRow - firstRow + 1;
    const columns = Math.max(1, Math.min(cols, limitCols - colStart));
    const rows = Math.max(1, Math.min(rowsN, limitRows - rowStart));
    return { colStart, rowStart, columns, rows };
  }

  /**
   * Work out which absolute cells a ruler-bearing page covers, by mapping the
   * page's drawable area through the ruler and clamping to cells that exist.
   * Coordinates returned are 0-based; the ruler's own labels are 1-based.
   */
  rulerCellSpan(page, ruler, limitCols, limitRows) {
    const colAt = (x) => Math.round(ruler.colBase + x / ruler.pitchX);
    const rowAt = (y) => Math.round(ruler.rowBase + y / ruler.pitchY);

    // Bound the span by the chart's CONTENT, not the sheet. Mapping the whole
    // page box in would pull in margins, rulers and headers — which inflates the
    // finished size and shifts every page's start.
    const box = this.chartContentBox(page, ruler.pitchX, ruler.pitchY);
    const x0 = box ? box.x0 : 0;
    const x1 = box ? box.x1 : (page.width || 612);
    const y0 = box ? box.y0 : 0;
    const y1 = box ? box.y1 : (page.height || 792);

    // Clamp into the design the rulers describe. Labels are 1-based, so there is
    // no column 0 and nothing may extend past the finished size.
    let c0 = Math.min(Math.max(colAt(x0), 1), limitCols);
    let c1 = Math.min(Math.max(colAt(x1), 1), limitCols);
    let r0 = Math.min(Math.max(rowAt(y0), 1), limitRows);
    let r1 = Math.min(Math.max(rowAt(y1), 1), limitRows);
    if (c1 < c0) c1 = c0;
    if (r1 < r0) r1 = r0;
    return {
      colStart: c0 - 1,
      rowStart: r0 - 1,
      columns: c1 - c0 + 1,
      rows: r1 - r0 + 1,
    };
  }

  /**
   * Bounding box of a page's chart content — colour-filled cells and the
   * single-character symbols drawn in them. Multi-character text (titles, ruler
   * labels of two digits or more, page furniture) is excluded, so the box hugs
   * the chart rather than the sheet.
   *
   * Only stitched cells matter: an unstitched margin inside the page's slice
   * carries no data, so a tight box loses nothing and keeps the derived finished
   * size honest.
   *
   * Ruler furniture is kept out as well. gen-3 prints each ruler on a pale
   * band one cell thick running the full length of the chart, with its numbers
   * in white on top; counting the band and the single-digit label "1" as
   * content stretched the sampled grid a column and a row over the rulers,
   * where the band read as 6,499 stitches of DMC 415 and the labels as digits.
   * So a fill one cell thick and twenty or more long is skipped, and a lone
   * digit only counts when it lies among the rest of the content. pitchX and
   * pitchY are optional; without them the band test is skipped.
   *
   * @returns {{x0:number,x1:number,y0:number,y1:number}|null}
   */
  chartContentBox(page, pitchX, pitchY) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let seen = 0;
    const digits = [];

    const paths = page.vectorPaths || [];
    for (let i = 0; i < paths.length; i++) {
      const pa = paths[i];
      if (!pa.fillColor || !pa.points || !pa.points.length) continue;
      if (pitchX > 0 && pitchY > 0) {
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (const pt of pa.points) {
          if (pt.x < bx0) bx0 = pt.x; if (pt.x > bx1) bx1 = pt.x;
          if (pt.y < by0) by0 = pt.y; if (pt.y > by1) by1 = pt.y;
        }
        const bw = bx1 - bx0, bh = by1 - by0;
        if ((bh <= pitchY * 1.5 && bw >= pitchX * 20) || (bw <= pitchX * 1.5 && bh >= pitchY * 20)) continue;
      }
      for (let q = 0; q < pa.points.length; q++) {
        const pt = pa.points[q];
        if (pt.x < x0) x0 = pt.x;
        if (pt.x > x1) x1 = pt.x;
        if (pt.y < y0) y0 = pt.y;
        if (pt.y > y1) y1 = pt.y;
      }
      seen++;
    }

    const texts = page.textItems || [];
    for (let j = 0; j < texts.length; j++) {
      const t = texts[j];
      const s = (t.str || '').trim();
      // A chart symbol is one glyph. Two-digit ruler labels and prose are not,
      // A lone digit is held back for now: it may be a ruler's "1", or a
      // symbol (gen1 uses digits as symbols).
      if (s.length !== 1) continue;
      const cy = t.y - (t.height || 0) / 2;
      if (/^\d$/.test(s)) { digits.push({ x: t.x, cy }); continue; }
      if (t.x < x0) x0 = t.x;
      if (t.x > x1) x1 = t.x;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      seen++;
    }

    // A digit counts as content only if it falls within what everything else
    // already marks out as the chart. A ruler's "1" sits outside, on its band;
    // a digit symbol sits among the other symbols. With nothing else to go by,
    // every digit counts.
    const haveBox = seen > 0 && isFinite(x0) && isFinite(y0);
    const slackX = pitchX > 0 ? pitchX : 0, slackY = pitchY > 0 ? pitchY : 0;
    for (const d of digits) {
      if (haveBox && (d.x < x0 - slackX || d.x > x1 + slackX || d.cy < y0 - slackY || d.cy > y1 + slackY)) continue;
      if (d.x < x0) x0 = d.x;
      if (d.x > x1) x1 = d.x;
      if (d.cy < y0) y0 = d.cy;
      if (d.cy > y1) y1 = d.cy;
      seen++;
    }

    if (!seen || !isFinite(x0) || !isFinite(y0)) return null;
    return { x0, y0, x1, y1 };
  }

  /**
   * Where images are painted on a page, as viewport boxes with their size in
   * pixels. An image is drawn into the unit square under the current matrix, so
   * its box is that square mapped through it.
   */
  findPageImages(opList, viewport) {
    const OPS = pdfjsLib.OPS || {};
    const paintOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject,
                              OPS.paintImageMaskXObject, OPS.paintJpegXObject].filter(v => v !== undefined));
    const out = [];
    let m = [1, 0, 0, 1, 0, 0];
    const stack = [];
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i], args = opList.argsArray[i];
      if (fn === OPS.save) stack.push(m.slice());
      else if (fn === OPS.restore) { const p = stack.pop(); if (p) m = p; }
      else if (fn === OPS.transform) {
        const [a, b, c, d, e, f] = args;
        m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d,
             m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
      } else if (paintOps.has(fn)) {
        const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) =>
          viewport.convertToViewportPoint(m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]));
        const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
        out.push({
          x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys),
          pxW: (args && typeof args[1] === 'number') ? args[1] : 0,
          pxH: (args && typeof args[2] === 'number') ? args[2] : 0,
        });
      }
    }
    return out;
  }

  /**
   * Pages that are mostly one picture — a scan, or a chart printed to an image.
   * Ordered largest picture first.
   */
  scannedChartPages(pages) {
    return (pages || [])
      .map(p => {
        let best = null;
        for (const im of p.images || []) {
          const area = (im.x1 - im.x0) * (im.y1 - im.y0);
          if (!best || area > best.area) best = Object.assign({ area }, im);
        }
        return { page: p, image: best };
      })
      .filter(e => e.image && e.image.area >= e.page.width * e.page.height * 0.4)
      .sort((a, b) => b.image.area - a.image.area);
  }

  /** Render a page to RGBA pixels at the given scale. */
  async renderPagePixels(pdfPage, scale) {
    const viewport = pdfPage.getViewport({ scale });
    const w = Math.ceil(viewport.width), h = Math.ceil(viewport.height);
    let canvas, context;
    if (this.options.canvasFactory) {
      ({ canvas, context } = this.options.canvasFactory.create(w, h));
    } else if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(w, h); context = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      context = canvas.getContext('2d');
    }
    context.fillStyle = '#fff';
    context.fillRect(0, 0, w, h);
    const renderOpts = { canvasContext: context, viewport };
    if (this.options.canvasFactory) renderOpts.canvasFactory = this.options.canvasFactory;
    await pdfPage.render(renderOpts).promise;
    return context.getImageData(0, 0, w, h);
  }

  /**
   * Import a chart that exists only as pictures (pdf-raster-chart.js).
   *
   * Each scanned page is rendered at its own resolution — finer adds nothing a
   * scan did not capture, coarser loses lines — and read for its grid and
   * cells. Pages whose cells are the size of the largest page's are the chart;
   * a scanned cover or key is not. The chart pages' cells are grouped together,
   * so a thread is one group on every page, and the pages are then arranged as
   * any chart without printed row and column numbers is (guessPageArrangement),
   * for the stitcher to check on the review's Pages tab.
   *
   * Coloured cells take the nearest DMC colour, since a scanned key cannot be
   * read; symbol cells are grouped by the shape of their symbol and each group
   * becomes a placeholder thread, so the stitcher has a correct chart and
   * assigns each symbol once rather than re-charting by hand. A picture of each
   * symbol, cut from the scan, goes with the session for the review to show.
   *
   * Returns a session, as analyse() does.
   */
  async importScanned(scanned, pages) {
    const RC = (typeof window !== 'undefined' && window.PdfRasterChart) ||
               (typeof PdfRasterChart !== 'undefined' ? PdfRasterChart : null);
    if (!RC) throw new Error("This PDF is a scanned image, and the scanned-chart reader is not loaded.");
    const yieldToBrowser = () => new Promise(r => setTimeout(r, 0));
    const scaleFor = (im) => {
      const native = im.pxW ? im.pxW / Math.max(1, im.x1 - im.x0) : 2.5;
      return Math.max(1.5, Math.min(4, native));
    };

    // Read each page, keeping only the largest one's pixels — the others are
    // rendered again if a symbol's picture has to come from them.
    const reader = await this.rasterReader(RC);
    const read = [];
    let keptPixels = null;
    try {
      for (let k = 0; k < scanned.length; k++) {
        const s = scanned[k];
        if (!s.page._pdfPage) continue;
        this.progress('Reading scanned page ' + (k + 1) + ' of ' + scanned.length, k + 1, scanned.length);
        const scale = scaleFor(s.image);
        const pixels = await this.renderPagePixels(s.page._pdfPage, scale);
        const cells = await reader.read(pixels);
        if (!keptPixels && cells) keptPixels = { pageIndex: s.page.pageIndex, pixels };
        read.push({ s, scale, cells });
        await yieldToBrowser();
      }
    } catch (err) {
      reader.close();
      throw err;
    }
    const ref = read.find(e => e.cells);
    if (!ref) {
      reader.close();
      throw new Error("This PDF is a scanned image, but no chart grid could be found in it. " +
        "Try a sharper scan, or import the chart as a photo instead.");
    }
    const refPitch = ref.cells.grid.pitchX / ref.scale;
    const chart = read.filter(e => {
      const g = e.cells && e.cells.grid;
      return g && g.columns >= 8 && g.rows >= 8 && Math.abs(g.pitchX / e.scale - refPitch) <= refPitch * 0.15;
    }).sort((a, b) => a.s.page.pageIndex - b.s.page.pageIndex);
    const notChart = read.filter(e => chart.indexOf(e) < 0).map(e => e.s.page.pageIndex).sort((a, b) => a - b);

    this.progress('Grouping the stitches by colour and symbol');
    let grouped;
    try {
      grouped = await reader.group(chart.map(e => e.cells.index));
    } finally {
      reader.close();
    }
    const threads = this.scannedThreads(grouped);
    let colourCells = 0, symbolCells = 0;
    const sessionPages = chart.map((e, i) => {
      const pg = grouped.pages[i];
      const cells = pg.cells.map(c => {
        const thread = c.kind === 'colour' ? threads.colour[c.group]
                     : c.kind === 'symbol' ? threads.symbol[c.group] : null;
        if (c.kind === 'colour') colourCells++;
        if (c.kind === 'symbol') symbolCells++;
        return { col: c.col, row: c.row, isEmpty: !thread, thread: thread || null,
                 symbol: thread && thread.symbol ? thread.symbol : '' };
      });
      return { pageIndex: e.s.page.pageIndex, cols: pg.grid.columns, rows: pg.grid.rows,
               cells, bs: [], initial: null, reason: null };
    });

    const glyphSamples = await this.scannedSamples(chart, grouped, threads, keptPixels);
    const lookAlikes = this.scannedLookAlikes(grouped, threads, RC);

    let placement = { pages: {}, manual: false };
    let layoutSource = 'scanned-image', tiling = null, guess = null;
    if (sessionPages.length === 1) {
      placement.pages[sessionPages[0].pageIndex] = { col: 0, row: 0 };
    } else {
      guess = this.guessPageArrangement(sessionPages);
      if (guess) {
        placement = this.placementFromArrangement(sessionPages, guess);
        layoutSource = 'guessed';
        tiling = { across: guess.across, down: guess.down };
      } else {
        let col = 0;
        for (const p of sessionPages) { placement.pages[p.pageIndex] = { col, row: 0 }; col += p.cols; }
        layoutSource = 'sequential';
      }
    }
    for (const p of sessionPages) p.initial = placement.pages[p.pageIndex] || null;

    const warnings = [];
    if (colourCells) {
      warnings.push('This chart is a scanned image. Its colours were estimated from the scan and ' +
        'matched to the nearest DMC colour, so check them against the printed key.');
    }
    if (symbolCells) {
      warnings.push('This chart is a scanned image. ' + threads.symbol.length + ' different symbols were ' +
        'found and imported as placeholders (Symbol 1 to Symbol ' + threads.symbol.length + ') to be matched to ' +
        'threads from the printed key.');
    }
    if (notChart.length) {
      warnings.push((notChart.length > 1 ? 'Scanned pages ' + notChart.join(', ') + ' were' : 'Scanned page ' + notChart[0] + ' was') +
        ' not read as part of the chart.');
    }

    const session = {
      kind: 'pdf-pages',
      scanned: true,
      pages: sessionPages,
      legend: { entries: [], matchReport: {
        symbol: 0, swatch: 0, nearest: 0, catalogue: colourCells, unresolved: 0, unresolvedSymbols: {},
      } },
      stated: this.readStatedFacts(pages),
      layoutSource, tiling, guess,
      layoutWarnings: warnings,
      placement,
      glyphSamples,
      lookAlikes,
      build: (pl) => this.buildFromLayout(session, pl),
    };
    return session;
  }

  /**
   * Somewhere to read scanned pages: pdf-raster-worker.js, off the main thread,
   * where Web Workers exist and the worker answers; otherwise right here.
   * Reading a page takes a second or two and grouping a large scan several, so
   * the worker keeps the page responsive while they run.
   *
   *   read(pixels) -> { index, grid } | null   (null: no chart grid found)
   *   group(indices) -> the groupPages() result for those pages, in order
   *   close()
   */
  async rasterReader(RC) {
    const inline = () => {
      const reads = [];
      return {
        read: async (px) => { const r = RC.readCells(px); if (!r) return null; reads.push(r); return { index: reads.length - 1, grid: r.grid }; },
        group: async (indices) => RC.groupPages(indices.map(i => reads[i])),
        close: () => {},
      };
    };
    if (this.options.rasterWorker === false || typeof Worker === 'undefined') return inline();
    let worker;
    try { worker = new Worker(this.options.rasterWorkerUrl || 'pdf-raster-worker.js'); } catch (_) { return inline(); }
    let seq = 0;
    const waiting = new Map();
    const failAll = (msg) => { for (const w of waiting.values()) w.reject(new Error(msg)); waiting.clear(); };
    worker.onmessage = (e) => {
      const m = e.data || {};
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.ok) w.resolve(m.result); else w.reject(new Error(m.error || 'The scan reader failed.'));
    };
    worker.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); failAll('The scan reader stopped working.'); };
    const call = (msg) => new Promise((resolve, reject) => {
      const id = ++seq;
      waiting.set(id, { resolve, reject });
      worker.postMessage(Object.assign({ id }, msg));
    });
    // A worker that cannot start — its script missing offline, say — reports
    // only by not answering, so ask first and fall back if it stays quiet.
    const alive = await Promise.race([
      call({ type: 'ping' }).then(() => true, () => false),
      new Promise(r => setTimeout(() => r(false), 4000)),
    ]);
    if (!alive) { worker.terminate(); return inline(); }
    return {
      read: (px) => call({ type: 'read', width: px.width, height: px.height, data: px.data }),
      group: (indices) => call({ type: 'group', indices }),
      close: () => { failAll('The scan reader was closed.'); worker.terminate(); },
    };
  }

  /**
   * Pairs of scanned symbol groups that may be one symbol, for the review to
   * offer: the reader errs towards splitting a symbol rather than mixing two,
   * so a big scan comes out with more groups than symbols. Each group is paired
   * with up to three groups whose average glyphs are nearest, closest pairs
   * first, the larger group first in each pair. On the twelve-page gen1 scan,
   * 0.12 suggests 155 pairs for its 194 groups; the 99 that are right bring it
   * to 116, against 96 symbols. The stitcher judges each by eye.
   */
  scannedLookAlikes(grouped, threads, RC) {
    const G = grouped.symbols;
    const dist = (RC && RC._glyphDist) || null;
    if (!dist || G.length < 2) return [];
    const near = G.map(() => []);
    for (let i = 0; i < G.length; i++) {
      if (!G[i].mean || !threads.symbol[i]) continue;
      for (let j = i + 1; j < G.length; j++) {
        if (!G[j].mean || !threads.symbol[j]) continue;
        const d = dist(G[i].mean, G[j].mean);
        if (d > 0.12) continue;
        near[i].push({ i, j, d }); near[j].push({ i, j, d });
      }
    }
    const keep = new Map();
    near.forEach(list => list.sort((a, b) => a.d - b.d).slice(0, 3).forEach(p => keep.set(p.i + ',' + p.j, p)));
    return Array.from(keep.values()).sort((a, b) => a.d - b.d)
      .map(p => ({ a: threads.symbol[p.i].id, b: threads.symbol[p.j].id, d: Math.round(p.d * 1000) / 1000 }));
  }

  /**
   * A picture of each scanned symbol — the cell that shows it best, cut from
   * the scan — keyed by its placeholder thread's id, as { w, h, data } RGBA.
   * Pages other than the one already in memory are rendered again, one at a
   * time, only if a symbol's best cell is on them.
   */
  async scannedSamples(chart, grouped, threads, keptPixels) {
    const out = {};
    const byPage = new Map();
    grouped.symbols.forEach((g, gi) => {
      if (!g.sample || !threads.symbol[gi]) return;
      const e = chart[g.sample.page];
      if (!e) return;
      if (!byPage.has(e)) byPage.set(e, []);
      byPage.get(e).push({ id: threads.symbol[gi].id, box: g.sample.box });
    });
    for (const [e, list] of byPage) {
      const pixels = keptPixels && keptPixels.pageIndex === e.s.page.pageIndex
        ? keptPixels.pixels : await this.renderPagePixels(e.s.page._pdfPage, e.scale);
      for (const { id, box } of list) {
        const x0 = Math.max(0, Math.floor(box[0]) - 1), y0 = Math.max(0, Math.floor(box[1]) - 1);
        const x1 = Math.min(pixels.width, Math.ceil(box[2]) + 1), y1 = Math.min(pixels.height, Math.ceil(box[3]) + 1);
        const w = x1 - x0, h = y1 - y0;
        if (w <= 0 || h <= 0) continue;
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
          const from = ((y0 + y) * pixels.width + x0) * 4;
          data.set(pixels.data.subarray(from, from + w * 4), y * w * 4);
        }
        out[id] = { w, h, data };
      }
    }
    return out;
  }

  /**
   * Threads for a scanned chart's groups: nearest DMC colour for colour groups
   * (groups that land on the same DMC colour become one thread), and distinct
   * placeholder threads for symbol groups, most-used first.
   */
  scannedThreads(read) {
    const colour = [];
    const byId = new Map();
    for (const g of read.colours) {
      let t = null;
      if (typeof DMC !== 'undefined' && typeof rgbToLab === 'function' && typeof dE === 'function') {
        const lab = rgbToLab(g.rgb[0], g.rgb[1], g.rgb[2]);
        let bestD = Infinity;
        for (const d of DMC) { const dd = dE(lab, d.lab); if (dd < bestD) { bestD = dd; t = d; } }
      }
      if (!t) t = { id: 'C' + (colour.length + 1), rgb: g.rgb.slice(), lab: [50, 0, 0], name: 'Scanned colour ' + (colour.length + 1) };
      if (!byId.has(t.id)) byId.set(t.id, t);
      colour.push(byId.get(t.id));
    }
    const symbol = read.symbols.map((g, i) => {
      // Well-separated hues, so neighbouring placeholders are easy to tell apart.
      const hue = (i * 137.508) % 360;
      const rgb = this.hslToRgb(hue / 360, 0.55, 0.5);
      return { id: 'S' + (i + 1), rgb, lab: (typeof rgbToLab === 'function') ? rgbToLab(rgb[0], rgb[1], rgb[2]) : [50, 0, 0],
               name: 'Symbol ' + (i + 1) + ' (unassigned)', symbol: String(i + 1), placeholder: 'scanned' };
    });
    return { colour, symbol };
  }

  hslToRgb(h, s, l) {
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }

  /**
   * The grid to read a placed page through: the measured grid when the ruler
   * anchored it (trimmed to the design's extent), the ruler-derived grid when
   * only the ruler could be trusted, and otherwise the measured grid as is.
   */
  samplingGrid(pInfo) {
    if (pInfo.ruler && pInfo.anchoredToGrid && pInfo.rulerSpan) {
      return Object.assign({}, pInfo.grid, { columns: pInfo.rulerSpan.columns, rows: pInfo.rulerSpan.rows });
    }
    if (pInfo.ruler) return this.gridFromRuler(pInfo.ruler, pInfo.rulerSpan, pInfo.grid);
    return pInfo.grid;
  }

  /**
   * Build a cell grid from a page's axis rulers. The ruler gives the pitch
   * directly and, with the page's absolute span, fixes the origin: the cell for
   * absolute column N starts where the ruler projects N.
   *
   * `fallback` supplies boldLineInterval only — its geometry is what we are
   * replacing.
   */
  gridFromRuler(ruler, span, fallback) {
    // x of the leading edge of absolute column `col` (1-based), inverting
    // col = colBase + x / pitch.
    const xOfCol = (col) => (col - ruler.colBase) * ruler.pitchX;
    const yOfRow = (row) => (row - ruler.rowBase) * ruler.pitchY;
    return {
      originX: xOfCol(span.colStart + 1) - ruler.pitchX / 2,
      originY: yOfRow(span.rowStart + 1) - ruler.pitchY / 2,
      cellWidth: ruler.pitchX,
      cellHeight: ruler.pitchY,
      columns: span.columns,
      rows: span.rows,
      boldLineInterval: (fallback && fallback.boldLineInterval) || 10,
    };
  }

  detectGrid(page) {
     const hLines = [];
     const vLines = [];

     // Page-furniture filter: reject lines whose endpoints are within 5pt of
     // the page edge AND span > 80% of the page's width/height. These are
     // almost always page borders, header/footer rules, or decorative frames
     // — never the chart grid. Without this filter the bounding-box code
     // below stretches the chart to the full page and pulls in legend rows,
     // page numbers, and adjacent pattern variants as ghost cells.
     const pw = page.width || 612;
     const ph = page.height || 792;
     const edgeMargin = 5;
     const fullSpanFrac = 0.8;

     page.vectorPaths.forEach(p => {
        if (p.type === 'line' && p.points.length === 2) {
           const x0 = p.points[0].x, x1 = p.points[1].x;
           const y0 = p.points[0].y, y1 = p.points[1].y;
           const dx = Math.abs(x0 - x1);
           const dy = Math.abs(y0 - y1);
           // Horizontal page-border / decorative rule
           if (dx > 20 && dy < 2) {
              const ay = (y0 + y1) / 2;
              const isPageEdge = ay < edgeMargin || ay > ph - edgeMargin;
              const spansPage = dx > pw * fullSpanFrac;
              if (!(isPageEdge && spansPage)) hLines.push(y0);
           }
           // Vertical page-border / decorative rule
           if (dy > 20 && dx < 2) {
              const ax = (x0 + x1) / 2;
              const isPageEdge = ax < edgeMargin || ax > pw - edgeMargin;
              const spansPage = dy > ph * fullSpanFrac;
              if (!(isPageEdge && spansPage)) vLines.push(x0);
           }
        } else if (p.type === 'rect' && p.points.length >= 4) {
           const w = Math.abs(p.points[0].x - p.points[2].x);
           const h = Math.abs(p.points[0].y - p.points[2].y);
           // Skip page-bounding rectangles entirely.
           if (w > pw * fullSpanFrac && h > ph * fullSpanFrac) return;
           // Only count large rectangles as grid layout elements (ignore 2x2px cell fills)
           if (w > 20 || h > 20) {
               hLines.push(p.points[0].y, p.points[2].y);
               vLines.push(p.points[0].x, p.points[2].x);
           }
        }
     });

     // Since we normalized to viewport coordinates (top-down), smaller Y is higher up.
     // Sort hLines ascending so row 0 is the top-most line.
     hLines.sort((a, b) => a - b);
     vLines.sort((a, b) => a - b);

     const cluster = (lines) => {
        if (lines.length === 0) return [];
        const res = [lines[0]];
        for (let i = 1; i < lines.length; i++) {
           // Cell spacing can be very small (e.g. 2.14px) depending on the viewport scale mapping.
           // Use > 1 to avoid clustering adjacent lines together while filtering out exact duplicates.
           if (Math.abs(lines[i] - res[res.length - 1]) > 1) {
              res.push(lines[i]);
           }
        }
        return res;
     };

     const hClustered = cluster(hLines);
     const vClustered = cluster(vLines);

     let cellWidth = 10;
     let cellHeight = 10;

     if (vClustered.length > 1) {
        const diffs = [];
        for(let i=1; i<vClustered.length; i++) diffs.push(Math.abs(vClustered[i]-vClustered[i-1]));
        diffs.sort((a,b)=>a-b);
        const valid = diffs.filter(d => d > 1);
        cellWidth = valid[Math.floor(valid.length/2)] || 10;
     }
     if (hClustered.length > 1) {
        const diffs = [];
        for(let i=1; i<hClustered.length; i++) diffs.push(Math.abs(hClustered[i]-hClustered[i-1]));
        diffs.sort((a,b)=>a-b);
        const valid = diffs.filter(d => d > 1);
        cellHeight = valid[Math.floor(valid.length/2)] || 10;
     }

     // Identify the dense band of grid lines by scoring each cluster on
     // how many of its neighbours sit at the expected cell spacing. A
     // cluster is "in-band" if either its previous OR next neighbour is
     // within ±2pt of cellWidth. Outlier lines (page borders, legend
     // separators, decorative rules) get rejected because their
     // neighbours are far away.
     //
     // The in-band set is then split into RUNS, and the largest run wins,
     // rather than spanning from the first in-band cluster to the last. A page
     // can hold more than one ruled block — a chart above a key, or a
     // cross-stitch chart above a backstitch chart — and those blocks are
     // each internally regular, so they all survive the in-band filter.
     // Spanning across them stretches the grid over the gap: on
     // PAT2171_2 the chart ends at y=577 but footer rules near y=739 pulled
     // the box to 131 rows, well past the chart. Runs still tolerate missing
     // lines, because a gap up to a few multiples of the pitch stays inside
     // one run — which is what the span approach was protecting against.
     function denseBounds(clustered, expectedSpacing) {
         if (clustered.length < 2) return { lo: clustered[0] || 0, hi: clustered[clustered.length-1] || 0 };
         const tol = Math.max(2, expectedSpacing * 0.25);
         const inBand = [];
         for (let i = 0; i < clustered.length; i++) {
             const prev = i > 0 ? clustered[i] - clustered[i-1] : Infinity;
             const next = i < clustered.length-1 ? clustered[i+1] - clustered[i] : Infinity;
             // Accept if a direct neighbour matches, OR if the gap is an
             // integer multiple (handles the occasional missing line).
             function nearMultiple(d) {
                 if (!isFinite(d)) return false;
                 const k = Math.round(d / expectedSpacing);
                 return k >= 1 && k <= 4 && Math.abs(d - k * expectedSpacing) < tol;
             }
             if (nearMultiple(prev) || nearMultiple(next)) inBand.push(clustered[i]);
         }
         if (inBand.length < 2) return { lo: clustered[0], hi: clustered[clustered.length-1] };

         // Split into runs, breaking where the gap is too large to be missing
         // lines within one block. Then keep the run holding the most grid
         // lines — the dominant chart — tie-broken by the wider span.
         const runBreak = Math.max(expectedSpacing * 4 + tol, expectedSpacing + 2);
         const runs = [[inBand[0]]];
         for (let i = 1; i < inBand.length; i++) {
             if (inBand[i] - inBand[i-1] > runBreak) runs.push([inBand[i]]);
             else runs[runs.length-1].push(inBand[i]);
         }
         let best = runs[0];
         for (let i = 1; i < runs.length; i++) {
             const r = runs[i];
             const bSpan = best[best.length-1] - best[0];
             const rSpan = r[r.length-1] - r[0];
             if (r.length > best.length || (r.length === best.length && rSpan > bSpan)) best = r;
         }
         return { lo: best[0], hi: best[best.length-1], regions: runs.length };
     }

     const vBounds = denseBounds(vClustered, cellWidth);
     const hBounds = denseBounds(hClustered, cellHeight);

     let originX = vBounds.lo;
     let originY = hBounds.lo;
     let endX    = vBounds.hi;
     let endY    = hBounds.hi;

     const cols = vClustered.length > 1 ? Math.max(1, Math.round((endX - originX) / cellWidth)) : Math.max(10, Math.floor((page.width - 100) / cellWidth));
     const rows = hClustered.length > 1 ? Math.max(1, Math.round((endY - originY) / cellHeight)) : Math.max(10, Math.floor((page.height - 100) / cellHeight));

     return { originX, originY, cellWidth, cellHeight, columns: cols, rows: rows, boldLineInterval: 10 };
  }

  /**
   * Is this filled shape a fractional stitch, and which quarters of which cell
   * does it cover?
   *
   * Charting software draws fractional stitches as triangles in the thread
   * colour:
   *   ¾ stitch  half the cell, its corners on three cell corners. The right-
   *             angled corner is where the quarter leg sits, and the long side
   *             is the half stitch, so it covers every quarter but the one
   *             opposite — which is exactly how this app stores a ¾.
   *   ¼ stitch  a small triangle in one corner, from that corner to the
   *             midpoints of its two sides.
   * A vertex must land on a cell corner, edge midpoint or centre; anything else
   * is the outline of a symbol, not a stitch.
   *
   * @returns {{key:number, quads:string[]}|null}
   */
  fractionalShape(pts, grid) {
    if (!pts || pts.length < 3) return null;
    const uniq = [];
    for (const p of pts) {
      if (!uniq.some(q => Math.abs(q.x - p.x) < 1e-3 && Math.abs(q.y - p.y) < 1e-3)) uniq.push(p);
    }
    if (uniq.length !== 3) return null;
    let cx = 0, cy = 0;
    for (const p of uniq) { cx += p.x / 3; cy += p.y / 3; }
    const col = Math.floor((cx - grid.originX) / grid.cellWidth);
    const row = Math.floor((cy - grid.originY) / grid.cellHeight);
    if (col < 0 || row < 0 || col >= grid.columns || row >= grid.rows) return null;
    const x0 = grid.originX + col * grid.cellWidth, y0 = grid.originY + row * grid.cellHeight;
    // Snap each vertex to the half-cell lattice: 0, 0.5 or 1 on each axis.
    const snapped = [];
    for (const p of uniq) {
      const u = (p.x - x0) / grid.cellWidth * 2, v = (p.y - y0) / grid.cellHeight * 2;
      const su = Math.round(u), sv = Math.round(v);
      if (Math.abs(u - su) > 0.24 || Math.abs(v - sv) > 0.24) return null;
      if (su < 0 || su > 2 || sv < 0 || sv > 2) return null;
      snapped.push(su + ',' + sv);
    }
    const has = (k) => snapped.indexOf(k) >= 0;
    const corners = { TL: '0,0', TR: '2,0', BL: '0,2', BR: '2,2' };
    const opposite = { TL: 'BR', TR: 'BL', BL: 'TR', BR: 'TL' };
    const key = row * grid.columns + col;
    const onCorners = Object.keys(corners).filter(q => has(corners[q]));
    if (onCorners.length === 3) {
      // The right angle is at the corner adjacent to both others; its opposite
      // is the corner left out.
      const missing = Object.keys(corners).find(q => !has(corners[q]));
      const right = opposite[missing];
      return { key, quads: ['TL', 'TR', 'BL', 'BR'].filter(q => q !== opposite[right]) };
    }
    const mids = { TL: ['1,0', '0,1'], TR: ['1,0', '2,1'], BL: ['0,1', '1,2'], BR: ['2,1', '1,2'] };
    for (const q of Object.keys(corners)) {
      if (has(corners[q]) && has(mids[q][0]) && has(mids[q][1])) return { key, quads: [q] };
    }
    return null;
  }

  /** Is this closed point list an axis-aligned rectangle? */
  isAxisRect(pts) {
    if (!pts || pts.length < 4) return false;
    const xs = new Set(), ys = new Set();
    for (const p of pts) { xs.add(Math.round(p.x * 10)); ys.add(Math.round(p.y * 10)); }
    return xs.size <= 2 && ys.size <= 2;
  }

  /** Even-odd point-in-polygon test (ray casting). */
  pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi) inside = !inside;
    }
    return inside;
  }

  /**
   * Build a Y-bucket index for fast row-band lookup. Each item is indexed
   * into bucket k AND its neighbours k-1, k+1 so border-of-row lookups
   * still find candidates without a fallback linear scan. Returns
   * { lookup(y) -> array }. PERF (Cat B-lite): replaces O(N) Array.find
   * scans inside the per-cell loop with O(N/rows) bucket lookups.
   */
  _buildYBuckets(items, getY, cellHeight) {
    const bin = Math.max(1, cellHeight);
    const map = new Map();
    for (let i = 0; i < items.length; i++) {
      const y = getY(items[i]);
      if (!isFinite(y)) continue;
      const k = Math.floor(y / bin);
      // Spread across 3 buckets so the inner search doesn't miss items
      // whose Y is just inside the neighbouring band.
      for (let dk = -1; dk <= 1; dk++) {
        const key = k + dk;
        let arr = map.get(key);
        if (!arr) { arr = []; map.set(key, arr); }
        arr.push(items[i]);
      }
    }
    return {
      lookup(y) {
        if (!isFinite(y)) return [];
        return map.get(Math.floor(y / bin)) || [];
      }
    };
  }

  async extractSymbols(chartPages, chartLayout, legend) {
     const symbols = [];
     // Exact key swatch colours. A near-white that the key itself lists (BLANC,
     // 3865 winter white) is a thread, not paper.
     const swatchKeys = new Set();
     for (const e of ((legend && legend.entries) || [])) {
       if (e.swatchRgb) swatchKeys.add(e.swatchRgb.map(v => Math.round(v)).join(","));
     }
     // PERF (Cat B-lite): yield once between pages for very large patterns
     // so the browser can repaint between bursts of synchronous work.
     const yieldToBrowser = () => new Promise(r => setTimeout(r, 0));
     for (let pageIdx = 0; pageIdx < chartLayout.pages.length; pageIdx++) {
        if (pageIdx > 0) await yieldToBrowser();
        const pInfo = chartLayout.pages[pageIdx];
        const pageData = chartPages.find(p => p.pageIndex === pInfo.pageIndex);
        if (!pageData) continue;

        // When the page's axis rulers were read, they describe the cell grid more
        // accurately than detectGrid does — on glyph-style charts detectGrid can
        // be out by a third on pitch and can even return a negative origin,
        // because it is clustering stroked furniture rather than cells. The
        // ruler is an explicit statement of scale, so prefer it.
        const grid = this.samplingGrid(pInfo);

        // PERF (Cat B-lite): pre-build Y-bucket indices for textItems and
        // colour-filled vector paths. Each cell now scans a ~1-row slice
        // instead of the entire page. Bit-identical results — same find
        // predicate, just smaller candidate set.
        const textBuckets = this._buildYBuckets(
          pageData.textItems,
          t => t.y - t.height / 2,
          grid.cellHeight
        );
        // Pre-compute centroids for fill paths to avoid recomputing inside
        // the inner loop (and so the bucket index can use the centroid Y).
        const fillPaths = [];
        for (let pIdx = 0; pIdx < pageData.vectorPaths.length; pIdx++) {
          const pa = pageData.vectorPaths[pIdx];
          if (!pa.fillColor || !pa.points || pa.points.length === 0) continue;
          let sx = 0, sy = 0;
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (let q = 0; q < pa.points.length; q++) {
            const pt = pa.points[q];
            sx += pt.x; sy += pt.y;
            if (pt.x < x0) x0 = pt.x; if (pt.x > x1) x1 = pt.x;
            if (pt.y < y0) y0 = pt.y; if (pt.y > y1) y1 = pt.y;
          }
          fillPaths.push({ ref: pa, bx: sx / pa.points.length, by: sy / pa.points.length,
                           w: x1 - x0, h: y1 - y0 });
        }

        /* What is painted in each cell, worked out once up front for EVERY cell
         * — not only those without a text symbol — because a glyph chart paints
         * each stitch's cell in its thread colour too, and that colour is the
         * only link to a key entry whose symbol is artwork rather than text (84
         * of gen-3's 102).
         *
         * A cell's colour is the colour covering most of it, measured by AREA.
         * Nothing simpler survives real files:
         *   • Counting fills under the cell centre credits a merged polygon —
         *     one shape for a whole run of same-coloured cells — to one cell.
         *   • Splitting fills into "cell-sized" and "marks" fails on charts
         *     printed through "Microsoft: Print To PDF", which paint colour as
         *     half-cell-high strips (gen-3: 7.1 x 3.6, 21.2 x 3.6 ...).
         *   • Taking every fill alike lets symbol ink pass as a thread: gen-3
         *     draws its symbols in black or white, and this read black ink as
         *     DMC 310 and white as BLANC — 310 came out 27,390 stitches over the
         *     count printed in its own key and BLANC 19,944 over.
         * Ink covers a fraction of a cell; its thread colour covers all of it.
         * The minority colours are kept as "marks": evidence a symbol is drawn
         * there even when it is artwork rather than text. */
        const cellArea = grid.cellWidth * grid.cellHeight;
        const gridW = grid.columns * grid.cellWidth, gridH = grid.rows * grid.cellHeight;
        const coverage = new Map();           // cellKey -> Map(colourKey -> {col, area})
        const cellParts = new Map();          // cellKey -> [{quads, col}] fractional stitches
        const addCover = (key, col, area) => {
          let m = coverage.get(key);
          // Fills are visited in paint order. One covering the whole cell hides
          // everything painted there before it, so it starts the tally afresh:
          // a colour painted into a hole in a larger shape is what shows.
          if (!m || area >= cellArea * 0.95) { m = new Map(); coverage.set(key, m); }
          const ck = Math.round(col[0]) + ',' + Math.round(col[1]) + ',' + Math.round(col[2]);
          const e = m.get(ck);
          if (e) e.area += area; else m.set(ck, { col, area });
        };
        for (let fi = 0; fi < fillPaths.length; fi++) {
          const fp = fillPaths[fi];
          const pts = fp.ref.points;
          if (!pts || pts.length < 3 || fp.w <= 0 || fp.h <= 0) continue;   // degenerate
          const frac = this.fractionalShape(pts, grid);
          if (frac) {
            if (!cellParts.has(frac.key)) cellParts.set(frac.key, []);
            cellParts.get(frac.key).push({ quads: frac.quads, col: fp.ref.fillColor });
          }
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const p of pts) {
            if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
            if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
          }
          // A backdrop spanning a large share of the grid in BOTH directions is
          // ground, not stitching — PAT2171_2 lays a pale blue-grey square under
          // its whole chart. Runs of colour are long in one direction only. It
          // must also span several cells each way, or on a small grid a single
          // filled cell would count as a backdrop.
          if (x1 - x0 >= Math.max(gridW * 0.3, grid.cellWidth * 4) &&
              y1 - y0 >= Math.max(gridH * 0.3, grid.cellHeight * 4)) continue;
          const c0 = Math.max(0, Math.floor((x0 - grid.originX) / grid.cellWidth));
          const c1 = Math.min(grid.columns - 1, Math.floor((x1 - grid.originX) / grid.cellWidth));
          const r0 = Math.max(0, Math.floor((y0 - grid.originY) / grid.cellHeight));
          const r1 = Math.min(grid.rows - 1, Math.floor((y1 - grid.originY) / grid.cellHeight));
          if (c1 < c0 || r1 < r0) continue;
          const rect = this.isAxisRect(pts);
          for (let rr = r0; rr <= r1; rr++) {
            const cy0 = grid.originY + rr * grid.cellHeight, cy1 = cy0 + grid.cellHeight;
            for (let cc = c0; cc <= c1; cc++) {
              const cx0 = grid.originX + cc * grid.cellWidth, cx1 = cx0 + grid.cellWidth;
              let area;
              if (rect) {
                const ow = Math.min(x1, cx1) - Math.max(x0, cx0);
                const oh = Math.min(y1, cy1) - Math.max(y0, cy0);
                if (ow <= 0 || oh <= 0) continue;
                area = ow * oh;
              } else {
                // A non-rectangular shape: sample the cell on a 3x3 lattice.
                let hit = 0;
                for (let sy = 0; sy < 3; sy++) {
                  const py = cy0 + (sy + 0.5) * grid.cellHeight / 3;
                  if (py < y0 || py > y1) continue;
                  for (let sx = 0; sx < 3; sx++) {
                    const px = cx0 + (sx + 0.5) * grid.cellWidth / 3;
                    if (px < x0 || px > x1) continue;
                    if (this.pointInPolygon(px, py, pts)) hit++;
                  }
                }
                if (!hit) continue;
                area = hit / 9 * cellArea;
              }
              addCover(rr * grid.columns + cc, fp.ref.fillColor, area);
            }
          }
        }
        // Paper-white: a cell painted only this, with no symbol or mark on it,
        // is unstitched ground, not a white stitch.
        const isPaper = (c) => c[0] >= 248 && c[1] >= 248 && c[2] >= 248 &&
          !swatchKeys.has(Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]));
        // Per cell: colours by area (largest first), and the strongest
        // minority colour if one covers enough of the cell to be a drawn mark.
        const cellPaint = (key) => {
          const m = coverage.get(key);
          if (!m) return null;
          const list = Array.from(m.values()).sort((a, b) => b.area - a.area);
          const dominant = list[0];
          const mark = list.slice(1).find(e => e.area >= cellArea * 0.03) || null;
          return {
            colours: list.slice(0, 4).map(e => e.col),
            dominant: dominant.area >= cellArea * 0.4 ? dominant.col : null,
            mark: mark ? mark.col : null,
          };
        };

        for (let r = 0; r < grid.rows; r++) {
           for (let c = 0; c < grid.columns; c++) {
              const cx = grid.originX + c * grid.cellWidth + grid.cellWidth / 2;
              // OriginY is the top line, and since we are top-down now, we *add* cellHeight to go down
              const cy = grid.originY + r * grid.cellHeight + grid.cellHeight / 2;

              // Note that in PDF.js, text (tx, ty) typically denotes the bottom-left of the baseline.
              // For standard viewport coords, t.y is baseline. We adjust it slightly to find the visual center.
              // Also text width/height from getViewport scaling can sometimes be tricky.
              const textCands = textBuckets.lookup(cy);
              let item = null;
              for (let ti = 0; ti < textCands.length; ti++) {
                 const t = textCands[ti];
                 // A number of two or more digits is a ruler label, never a
                 // symbol; read one character at a time it became "1" and "0"
                 // stitches along gen-3's page edges.
                 if (/^\d{2,}$/.test(t.str.trim())) continue;
                 if (t.rotated) continue;
                 if (t.str.trim().length > 0 &&
                    cx >= t.x - (grid.cellWidth * 0.2) && cx <= (t.x + t.width + grid.cellWidth * 0.2) &&
                    Math.abs((t.y - t.height/2) - cy) < grid.cellHeight / 2) {
                    item = t;
                    break;
                 }
              }

              // If the matched item is a clump of characters spread out, try to extract just the one under this cell
              if (item && item.str.length > 1 && !item.str.startsWith('U+')) {
                  // We need to find which character in item.str is at cx.
                  // Assuming monospaced or evenly distributed string:
                  const charWidth = item.width / item.str.length;
                  const relativeX = cx - item.x;
                  const charIndex = Math.max(0, Math.min(item.str.length - 1, Math.floor(relativeX / charWidth)));
                  const singleChar = item.str[charIndex];

                  // Clone it so we don't modify the original pageData reference and can assign the single char
                  item = { ...item, str: singleChar.trim() };
              }

              const cellKey = r * grid.columns + c;
              const paint = cellPaint(cellKey);
              // The colours swatch matching may consider. When one colour covers
              // most of the cell, only that one: the symbol drawn on top can
              // exactly equal some OTHER key swatch — DMC draws its symbols in
              // white, which is B5200's swatch, and that claimed every 3860 and
              // E825 cell on PAT2171_2. With no dominant colour, all of them,
              // largest first and paper last.
              let fillColors = paint
                ? (paint.dominant ? [paint.dominant]
                   : paint.colours.filter(f => !isPaper(f)).concat(paint.colours.filter(isPaper)))
                : null;
              if (fillColors && !fillColors.length) fillColors = null;

              // A cell with no text symbol is a stitch when a real colour covers
              // most of it. Covered by paper-white with nothing drawn on it, it
              // is unstitched ground. A drawn mark on bare paper is a symbol-only
              // chart drawn as artwork: its ink is the only colour there is, as
              // before.
              // A symbol cell carries its colours only for EXACT swatch
              // matching, so an unrecognised symbol on a white mono chart is
              // not pulled towards whichever key colour is nearest to white.
              // Fractional stitches: the colour of each quarter, in paint order.
              // Only a cell whose quarters are not all one thread is partial.
              let partial = null;
              const parts = cellParts.get(cellKey);
              if (parts) {
                const q = { TL: null, TR: null, BL: null, BR: null };
                for (const pt of parts) for (const k of pt.quads) q[k] = pt.col;
                const v = [q.TL, q.TR, q.BL, q.BR];
                const same = v.every(c => c && v[0] && c[0] === v[0][0] && c[1] === v[0][1] && c[2] === v[0][2]);
                if (!same) partial = q;
              }

              let fillColor = null;
              if (!item && paint) {
                 if (paint.dominant && !isPaper(paint.dominant)) fillColor = paint.dominant;
                 else if (paint.mark && !isPaper(paint.mark)) fillColor = paint.mark;
              }

              if (item) {
                 const sym = {
                   col: pInfo.globalOffsetCol + c,
                   row: pInfo.globalOffsetRow + r,
                   symbol: item.str.trim(),
                   fontName: item.fontName,
                   isEmpty: false
                 };
                 if (fillColors) sym.fillColors = fillColors;
                 if (partial) sym.partial = partial;
                 symbols.push(sym);
              } else if (partial) {
                 symbols.push({
                   col: pInfo.globalOffsetCol + c,
                   row: pInfo.globalOffsetRow + r,
                   symbol: "",
                   fontName: "",
                   isEmpty: false,
                   partial: partial
                 });
              } else if (fillColor) {
                 symbols.push({
                   col: pInfo.globalOffsetCol + c,
                   row: pInfo.globalOffsetRow + r,
                   symbol: "",
                   fontName: "",
                   isEmpty: false,
                   fillColor: fillColor,
                   fillColors: fillColors
                 });
              } else {
                 symbols.push({
                   col: pInfo.globalOffsetCol + c,
                   row: pInfo.globalOffsetRow + r,
                   symbol: "",
                   fontName: "",
                   isEmpty: true
                 });
              }
           }
        }
     }
     return symbols;
  }

  /**
   * Read the colour key.
   *
   * Each key page is read twice — by the code-anchored reader below, and by the
   * original row/column heuristics — and the reading with more entries wins, so
   * layouts the old reader handled keep working while multi-column keys stop
   * losing most of their entries.
   *
   * A key printed on the same page as the chart (DMC does this) is also read
   * from each chart page, with the chart itself masked out so ruler labels and
   * callouts inside the grid cannot pose as entries.
   */
  parseLegend(legendPages, chartPages) {
     const legend = { entries: [], brand: "DMC" };
     const seen = new Set();
     const add = (entries) => {
       for (const e of entries) {
         const k = [e.kind || 'cross', String(e.threadCode).toLowerCase(), e.symbol || '',
                    e.swatchRgb ? e.swatchRgb.join(',') : ''].join('|');
         if (seen.has(k)) continue;
         seen.add(k);
         legend.entries.push(e);
       }
     };

     const readings = (legendPages || []).map(page => {
       const anchored = this.parseKeyEntries(page, null);
       return {
         anchored,
         anchoredCross: anchored.filter(e => e.kind !== 'backstitch').length,
         legacy: this.parseLegendLegacy([page]).entries,
       };
     });

     for (const page of chartPages || []) {
       const g = this.gridOf(page);
       if (!g || !(g.cellWidth > 0)) continue;
       // Mask the chart and a margin round it: ruler labels sit right against
       // the grid, and a filled cell beside one looks exactly like a swatch.
       const m = Math.max(g.cellWidth, g.cellHeight) * 3;
       const exclude = {
         x0: g.originX - m, y0: g.originY - m,
         x1: g.originX + g.columns * g.cellWidth + m,
         y1: g.originY + g.rows * g.cellHeight + m,
       };
       const found = this.parseKeyEntries(page, exclude);
       const cross = found.filter(e => e.kind !== 'backstitch').length;
       if (cross >= 2) readings.push({ anchored: found, anchoredCross: cross, legacy: [] });
     }

     // Once the code-anchored reader has found a real key anywhere in the
     // document, a page where BOTH readers found next to nothing is not a key
     // page, and a single guess there is noise — on PAT2171_2 the old reader
     // took a product reference on the materials page for a thread. A page the
     // old reader reads as a proper key is still used, whatever else is found.
     const anchoredTotal = readings.reduce((n, r) => n + r.anchoredCross, 0);
     for (const r of readings) {
       if (r.anchoredCross >= 2 && r.anchoredCross >= r.legacy.length) add(r.anchored);
       else if (anchoredTotal >= 2 && r.anchoredCross < 2 && r.legacy.length < 2) continue;
       else add(r.legacy.length >= r.anchoredCross ? r.legacy : r.anchored);
     }

     return legend;
  }

  /**
   * Code-anchored key reader.
   *
   * Every key entry, whatever the publisher's layout, has a thread code, and
   * almost every one has a swatch or a symbol immediately to its left. So rather
   * than treating each printed line as one entry — which is what silently
   * discarded most of a multi-column key — this finds each code and builds its
   * entry from what sits around it:
   *
   *   swatch   the filled square just left of the code. Its exact fill colour
   *            is what the chart's cells are painted with, so it links cells to
   *            threads even when the symbol is drawn as vector art rather than
   *            text — true of 84 of gen-3's 102 key symbols.
   *   symbol   a text glyph inside the swatch, or the nearest one to the left.
   *   sample   for a backstitch entry, the stroked line drawn instead of a swatch.
   *   name     the first descriptive text to the right, before the next entry.
   *   count    "(10511 ct)" or similar, kept apart from the name.
   *
   * A code with none of swatch, symbol or sample beside it is not an entry —
   * which is what rejects page numbers, quantities like "x1" and stray numbers.
   *
   * @param {Object} page
   * @param {{x0:number,y0:number,x1:number,y1:number}|null} exclude region to ignore
   * @returns {Array<Object>} entries
   */
  parseKeyEntries(page, exclude) {
    const inside = (x, y) => !!exclude &&
      x >= exclude.x0 && x <= exclude.x1 && y >= exclude.y0 && y <= exclude.y1;

    // At least two characters: DMC writes its low numbers as 01-09, so a lone
    // digit is always a symbol. gen1 uses digits as symbols, and treating "4"
    // as a code made it block the very entry it belongs to.
    const CODE_RE = /^(?:DMC\s*)?([A-Z]{1,2}\d{1,4}|\d{2,4}|B5200|BLANC|ECRU)$/i;
    const COUNT_RE = /^\(?\s*(\d[\d,.]*)\s*(?:ct|sts?|stitches|pts?)\.?\s*\)?$/i;
    const STRANDS_RE = /^\[(\d)\]$/;
    const SKEIN_RE = /^x\s*\d+$/i;

    const texts = [];
    for (const t of page.textItems || []) {
      const s = (t.str || '').trim();
      if (!s) continue;
      const h = t.height || t.fontSize || 8;
      const cy = t.y - h / 2;
      if (inside(t.x, cy)) continue;
      texts.push({ s, x: t.x, y: t.y, w: t.width || 0, h, cy, font: t.fontName });
    }
    if (!texts.length) return [];

    const boxOf = (pts) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
      return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    };

    const swatches = [];
    const samples = [];
    for (const p of page.vectorPaths || []) {
      if (!p.points || p.points.length < 2) continue;
      const b = boxOf(p.points);
      if (inside(b.cx, b.cy)) continue;
      if (p.fillColor && p.points.length >= 3) {
        const rgb = Array.from(p.fillColor).map(v => Math.round(v));
        // A thin wide bar is a backstitch sample drawn as a filled shape (DMC
        // draws them this way, with rounded ends that leave only 3 points once
        // curves are dropped), not a swatch.
        if (b.h <= 4 && b.w >= 8 && b.w <= 70) { samples.push(Object.assign(b, { rgb })); continue; }
        if (p.points.length < 4) continue;
        if (b.w < 3 || b.h < 3 || b.w > 30 || b.h > 30) continue;
        if (b.w / b.h > 2.2 || b.h / b.w > 2.2) continue;
        swatches.push(Object.assign(b, { rgb }));
      } else if (p.stroked && p.strokeColor && p.points.length === 2) {
        // A key's backstitch sample is a short horizontal stroke.
        if (b.h > 3 || b.w < 8 || b.w > 70) continue;
        samples.push(Object.assign(b, { rgb: Array.from(p.strokeColor).map(v => Math.round(v)) }));
      }
    }

    const sameLine = (a, cy) => Math.abs(a - cy) <= 7;
    const codes = texts.filter(t => CODE_RE.test(t.s));
    const anchored = [];

    for (const c of codes) {
      const onLine = codes.filter(o => o !== c && sameLine(o.cy, c.cy));
      const prevX = onLine.filter(o => o.x < c.x).reduce((m, o) => Math.max(m, o.x + o.w), -Infinity);

      // Swatch: the filled square whose right edge is nearest the code, between
      // the previous code on this line and this one. Publishers space these
      // differently — KG-Chart leaves ~6pt, DMC ~45pt — and the reach is safe to
      // widen because nothing past the previous code can be chosen.
      let swatch = null;
      for (const s of swatches) {
        if (s.x1 > c.x + 1 || s.x0 <= prevX) continue;
        if (c.x - s.x1 > 80) continue;
        if (!sameLine(s.cy, c.cy)) continue;
        if (!swatch || s.x1 > swatch.x1 + 0.5 ||
            (Math.abs(s.x1 - swatch.x1) <= 0.5 && s.w * s.h > swatch.w * swatch.h)) {
          swatch = s;
        }
      }

      // Symbol: a glyph drawn inside the swatch, else the nearest one to the left.
      const glyphs = texts.filter(t => (t.s.length === 1 || /^U\+[0-9A-F]{4}$/.test(t.s)) &&
        t.x < c.x && t.x > prevX && sameLine(t.cy, c.cy));
      // gen1 prints its symbol beside the swatch rather than in it, and its
      // chart is drawn in text alone, so the symbol is the only link for those
      // cells — it must be kept even when a swatch is found.
      let symbol = null;
      if (swatch) {
        symbol = glyphs.find(t => t.x + t.w / 2 >= swatch.x0 - 1 && t.x + t.w / 2 <= swatch.x1 + 1) || null;
      }
      if (!symbol) {
        symbol = glyphs.filter(t => c.x - t.x <= 90).sort((a, b) => b.x - a.x)[0] || null;
      }

      let sample = null;
      if (!swatch && !symbol) {
        sample = samples
          .filter(s => s.x1 <= c.x + 1 && c.x - s.x1 <= 40 && s.x0 > prevX && sameLine(s.cy, c.cy))
          .sort((a, b) => b.x1 - a.x1)[0] || null;
        if (!sample) continue;
      }

      const code = c.s.replace(/^DMC\s*/i, '');
      anchored.push({
        c, code, swatch, symbol, sample,
        prefixX: Math.min(c.x, swatch ? swatch.x0 : Infinity, symbol ? symbol.x : Infinity,
                          sample ? sample.x0 : Infinity),
      });
    }

    const entries = [];
    for (const a of anchored) {
      const next = anchored
        .filter(o => o !== a && sameLine(o.c.cy, a.c.cy) && o.prefixX > a.c.x)
        .reduce((m, o) => Math.min(m, o.prefixX), Infinity);

      let name = null, count = null, strands = null;
      const right = texts
        .filter(t => t !== a.c && t.x > a.c.x && t.x < next && sameLine(t.cy, a.c.cy))
        .sort((p, q) => p.x - q.x);
      for (const t of right) {
        const cm = t.s.match(COUNT_RE);
        if (cm) { if (count === null) count = parseInt(cm[1].replace(/[,.]/g, ''), 10); continue; }
        const sm = t.s.match(STRANDS_RE);
        if (sm) { if (strands === null) strands = parseInt(sm[1], 10); continue; }
        if (SKEIN_RE.test(t.s) || CODE_RE.test(t.s) || /^dmc$/i.test(t.s) || t.s.length === 1) continue;
        if (name === null && t.s.length > 1) name = t.s;
      }
      // Strands are sometimes printed before the code, as in "Ø [2] DMC 155".
      if (strands === null) {
        const before = texts.find(t => STRANDS_RE.test(t.s) && t.x < a.c.x && t.x > a.prefixX - 1 &&
          sameLine(t.cy, a.c.cy));
        if (before) strands = parseInt(before.s.match(STRANDS_RE)[1], 10);
      }

      entries.push({
        kind: a.sample ? 'backstitch' : 'cross',
        symbol: a.symbol ? a.symbol.s : null,
        symbolFontName: a.symbol ? (a.symbol.font || 'Unknown') : null,
        threadCode: a.code,
        colorName: name,
        stitchCount: count,
        strands: strands,
        swatchRgb: a.swatch ? a.swatch.rgb : null,
        lineRgb: a.sample ? a.sample.rgb : null,
      });
    }
    return entries;
  }

  /**
   * The original key reader: one entry per printed line, with header-driven and
   * proximity fallbacks for keys whose lines are broken up. Kept for layouts it
   * already handles; parseLegend prefers the code-anchored reader whenever that
   * finds more.
   */
  parseLegendLegacy(legendPages) {
     const legend = { entries: [], brand: "DMC" };
     if (legendPages.length === 0) return legend;

     for (const page of legendPages) {
         // Option 1: Try row-based clustering (handles 90% of standard patterns)
         const rows = [];
         const items = [...page.textItems].sort((a,b) => a.y - b.y);

         let currentRow = [];
         for (let i = 0; i < items.length; i++) {
             const item = items[i];
             if (item.str.trim().length === 0) continue;

             if (currentRow.length === 0) {
                 currentRow.push(item);
             } else {
                 if (Math.abs(item.y - currentRow[0].y) <= 3) {
                     currentRow.push(item);
                 } else {
                     rows.push(currentRow);
                     currentRow = [item];
                 }
             }
         }
         if (currentRow.length > 0) rows.push(currentRow);

         let foundInRows = false;
         for (const row of rows) {
             row.sort((a,b) => a.x - b.x); // Left to right

             for (let i = 0; i < row.length; i++) {
                 const t = row[i].str.trim();
                 const isSymbolCandidate = (t.length === 1) || t.startsWith('U+');

                 if (isSymbolCandidate) {
                     // Check items to the right AND left (some parsers sort X positions weirdly or symbols are placed after thread code)
                     let adjacentItems = row.filter((r, idx) => idx !== i).map(it => it.str.trim());
                     let code = adjacentItems.find(n => /^\d{1,4}$/.test(n) || /^(B5200|BLANC|ECRU)$/i.test(n) || /^DMC\s+\d{1,4}$/i.test(n) || /^DMC\s+(B5200|BLANC|ECRU)$/i.test(n));

                     if (code) {
                         let cleanCode = code.replace(/^DMC\s+/i, '').trim();
                         let colorName = "Color " + cleanCode;
                         for (let j = i+1; j < row.length; j++) {
                             const rowText = row[j].str.trim();
                             if (rowText !== code && rowText.length > 3 && !/^\d+$/.test(rowText) && !rowText.toLowerCase().includes('dmc')) {
                                 colorName = rowText;
                                 break;
                             }
                         }

                         legend.entries.push({
                            symbol: t,
                            symbolFontName: row[i].fontName || "Unknown",
                            threadCode: cleanCode,
                            colorName: colorName,
                            stitchCount: 100
                         });
                         foundInRows = true;
                         break;
                     }
                 }
             }
         }

         // Option 3 / Enhanced Bounding Box Fallback:
         // If row clustering found nothing, the layout is likely fractured vertically (e.g. PAT1968_2.pdf).
         // We search for single characters and map them to the nearest number physically below/right of it.
         if (!foundInRows) {
             const allSingleChars = items.filter(t => t.str.trim().length === 1 || t.str.startsWith('U+'));
             const numbers = items.filter(t => /^\d{3,4}$/.test(t.str.trim()) || /^(B5200|BLANC|ECRU)$/i.test(t.str.trim()));

             // Extract Headers to help map symbols to codes vertically
             const symbolHeaders = items.filter(t => ['symbol', 'symbole'].includes(t.str.trim().toLowerCase()));
             const codeHeaders = items.filter(t => {
                const s = t.str.trim().toLowerCase();
                return (s === 'colour' || s === 'couleur' || s === 'number' || s === 'code' || s.includes('dmc')) && s.length < 15 && !s.includes('www.');
             });

             const columns = [];
             symbolHeaders.forEach(sh => {
                 const rightHeaders = codeHeaders.filter(ch => Math.abs(ch.y - sh.y) < 10 && ch.x > sh.x);
                 rightHeaders.sort((a, b) => a.x - b.x);
                 if (rightHeaders.length > 0) {
                    columns.push({ symbolX: sh.x, codeX: rightHeaders[0].x, yStart: sh.y });
                 }
             });

             // If headers are found, we map column to column
             if (columns.length > 0) {
                const uniqueCols = [];
                columns.forEach(c => {
                   if (!uniqueCols.find(u => Math.abs(u.symbolX - c.symbolX) < 15)) {
                       uniqueCols.push(c);
                   }
                });

                uniqueCols.forEach(col => {
                    let colSyms = allSingleChars.filter(s => s.y > col.yStart && Math.abs((s.x + s.width/2) - col.symbolX) < 150);
                    // De-duplicate symbols mapped vertically
                    colSyms = colSyms.filter((s, i, arr) => arr.findIndex(t => Math.abs(t.y - s.y) < 5 && t.str === s.str) === i);

                    let colNums = numbers.filter(n => n.y > col.yStart && Math.abs((n.x + n.width/2) - col.codeX) < 100);
                    colNums = colNums.filter((n, i, arr) => arr.findIndex(t => Math.abs(t.y - n.y) < 5 && t.str === n.str) === i);

                    colSyms.sort((a, b) => a.y - b.y);
                    colNums.sort((a, b) => a.y - b.y);

                    for (let i = 0; i < Math.min(colSyms.length, colNums.length); i++) {
                        const sym = colSyms[i];
                        const cleanCode = colNums[i].str.trim().replace(/^DMC\s+/i, '');

                        if (!legend.entries.find(e => e.symbol === sym.str.trim())) {
                            legend.entries.push({
                               symbol: sym.str.trim(),
                               symbolFontName: sym.fontName || "Unknown",
                               threadCode: cleanCode,
                               colorName: "Color " + cleanCode,
                               stitchCount: 100
                            });
                        }
                    }
                });
             } else {
                // Total fallback: Distance-based weighting
                allSingleChars.forEach(sym => {
                   const validNums = numbers.filter(n => n.y > sym.y - 10 && n.y < sym.y + 100);
                   if (validNums.length > 0) {
                      validNums.sort((a, b) => {
                         const dyA = Math.abs(a.y - sym.y);
                         const dyB = Math.abs(b.y - sym.y);
                         const dxA = Math.abs(a.x - sym.x);
                         const dxB = Math.abs(b.x - sym.x);
                         return (dyA * 10 + dxA) - (dyB * 10 + dxB);
                      });

                      const cleanCode = validNums[0].str.trim().replace(/^DMC\s+/i, '');
                      if (!legend.entries.find(e => e.symbol === sym.str.trim())) {
                          legend.entries.push({
                             symbol: sym.str.trim(),
                             symbolFontName: sym.fontName || "Unknown",
                             threadCode: cleanCode,
                             colorName: "Color " + cleanCode,
                             stitchCount: 100
                          });
                      }
                   }
                });
             }
         }
     }

     return legend;
  }

  /**
   * Resolve each chart cell to a thread from the key.
   *
   * In order of trust:
   *   1. symbol  the cell's glyph matches exactly one key entry (or one in the
   *              same font, when a glyph is reused across fonts);
   *   2. swatch  a colour painted in the cell is EXACTLY a key swatch colour —
   *              the same PDF painted both, so this is identity, not similarity,
   *              and it covers key symbols drawn as artwork that no string can
   *              match;
   *   3. nearest a blank coloured cell takes the key entry nearest in colour,
   *              comparing against the swatch actually printed in the key where
   *              there is one;
   *   4. catalogue only when there is NO key at all, the nearest colour in the
   *              whole DMC range — otherwise this invents codes the key never
   *              lists, which is how gen-3 came to use 70 threads absent from
   *              its key;
   *   5. unresolved the previous placeholder, now counted rather than silent.
   *
   * Tallies of how each cell was resolved are left on legend.matchReport so the
   * import can say how much of the result is read rather than guessed.
   */
  linkSymbolsToThreads(symbols, legend) {
     const linked = [];
     const entries = ((legend && legend.entries) || []).filter(e => e.kind !== 'backstitch');
     const report = { symbol: 0, swatch: 0, nearest: 0, catalogue: 0, unresolved: 0, partial: 0, unresolvedSymbols: {} };
     if (legend) legend.matchReport = report;

     const rgbKey = (c) => Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]);
     const hasDmc = typeof DMC !== 'undefined';
     const lookup = (code) => !hasDmc ? null
       : (typeof getDmcByIdCI === 'function') ? getDmcByIdCI(code)
       : DMC.find(d => String(d.id).toLowerCase() === String(code).toLowerCase());
     const toLab = (rgb) => (typeof rgbToLab === 'function') ? rgbToLab(rgb[0], rgb[1], rgb[2]) : [50, 0, 0];

     // A thread per key entry, built once. Codes outside the stranded-cotton
     // table (Light Effects E334, Diamant D225, perlé metallics) take the colour
     // the key actually printed rather than a grey placeholder.
     const threadCache = new Map();
     const threadFor = (entry) => {
        if (threadCache.has(entry)) return threadCache.get(entry);
        let t = lookup(entry.threadCode);
        if (!t) {
           const rgb = entry.swatchRgb || entry.lineRgb || [128, 128, 128];
           t = { id: entry.threadCode, rgb: rgb.slice(), lab: toLab(rgb),
                 name: entry.colorName || ('DMC ' + entry.threadCode) };
        }
        threadCache.set(entry, t);
        return t;
     };

     const placeholders = new Map();
     const placeholderFor = (sym) => {
        if (!placeholders.has(sym)) {
           const i = placeholders.size;
           const rgb = this.hslToRgb(((i * 137.508) % 360) / 360, 0.55, 0.5);
           placeholders.set(sym, {
              id: 'U' + (i + 1), rgb, lab: toLab(rgb), placeholder: 'not-in-key',
              name: (sym === '(colour)' ? 'Unmatched colour' : 'Symbol ' + sym) + ' (not in key)',
           });
        }
        return placeholders.get(sym);
     };

     // Swatch index. A colour shared by two different codes is ambiguous and
     // is left out rather than resolved arbitrarily.
     const bySwatch = new Map();
     for (const e of entries) {
        if (!e.swatchRgb) continue;
        const k = rgbKey(e.swatchRgb);
        const prev = bySwatch.get(k);
        if (prev === undefined) bySwatch.set(k, e);
        else if (prev && String(prev.threadCode).toLowerCase() !== String(e.threadCode).toLowerCase()) bySwatch.set(k, null);
     }
     const bySymbol = new Map();
     for (const e of entries) {
        if (!e.symbol) continue;
        if (!bySymbol.has(e.symbol)) bySymbol.set(e.symbol, []);
        bySymbol.get(e.symbol).push(e);
     }
     // Same colour, allowing for rounding: DMC prints its key swatches one step
     // off the chart's own cells (3860 is 133,110,113 in the key and
     // 134,111,113 on the chart). Within 2 on every channel is the same ink;
     // the nearest such swatch wins, and a tie between different codes is left
     // unresolved here rather than guessed.
     const swatchList = Array.from(bySwatch.entries()).filter(([, e]) => e)
        .map(([k, e]) => ({ e, rgb: k.split(',').map(Number) }));
     const tolerantCache = new Map();
     const swatchFor = (c) => {
        const k = rgbKey(c);
        const exact = bySwatch.get(k);
        if (exact) return exact;
        if (tolerantCache.has(k)) return tolerantCache.get(k);
        let best = null, bestD = Infinity, tie = false;
        for (const s of swatchList) {
           const d = Math.max(Math.abs(s.rgb[0] - c[0]), Math.abs(s.rgb[1] - c[1]), Math.abs(s.rgb[2] - c[2]));
           if (d > 2) continue;
           if (d < bestD) { bestD = d; best = s.e; tie = false; }
           else if (d === bestD && best && String(best.threadCode) !== String(s.e.threadCode)) tie = true;
        }
        const out = tie ? null : best;
        tolerantCache.set(k, out);
        return out;
     };
     const swatchEntryOf = (cell) => {
        const cols = cell.fillColors || (cell.fillColor ? [cell.fillColor] : null);
        if (!cols) return null;
        for (const c of cols) {
           const e = swatchFor(c);
           if (e) return e;
        }
        return null;
     };

     // Comparison colours for nearest matching: the printed swatch when the key
     // has one, else the catalogue colour of the code.
     let nearestTargets = null;
     const nearestEntry = (lab) => {
        if (!nearestTargets) {
           nearestTargets = [];
           for (const e of entries) {
              const rgb = e.swatchRgb || (threadFor(e) && threadFor(e).rgb);
              if (rgb) nearestTargets.push({ e, lab: toLab(rgb) });
           }
        }
        let best = null, bestDist = Infinity;
        for (const t of nearestTargets) {
           const d = (typeof dE === 'function') ? dE(lab, t.lab) : Infinity;
           if (d < bestDist) { bestDist = d; best = t.e; }
        }
        return best && bestDist < 15 ? best : null;
     };

     // A colour to a thread, as for a cell: exact swatch, nearest key colour,
     // and the whole DMC range only when there is no key. Used for the quarters
     // of a fractional stitch, which carry a colour but no symbol of their own.
     const threadForColour = (rgb) => {
        const sw = swatchFor(rgb);
        if (sw) return threadFor(sw);
        if (typeof rgbToLab !== 'function' || typeof dE !== 'function') return null;
        const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
        if (entries.length) { const near = nearestEntry(lab); return near ? threadFor(near) : null; }
        if (!hasDmc) return null;
        let best = null, bestD = Infinity;
        for (const d of DMC) { const dd = dE(lab, d.lab); if (dd < bestD) { bestD = dd; best = d; } }
        return best;
     };

     symbols.forEach(cell => {
        if (cell.isEmpty) {
           linked.push({ ...cell, thread: null });
           return;
        }

        if (cell.partial) {
           const quarters = {};
           let first = null;
           for (const q of ['TL', 'TR', 'BL', 'BR']) {
              if (!cell.partial[q]) continue;
              const t = threadForColour(cell.partial[q]);
              if (t) { quarters[q] = t; if (!first) first = t; }
           }
           if (first) {
              report.partial = (report.partial || 0) + 1;
              linked.push({ ...cell, thread: first, partialThreads: quarters });
              return;
           }
        }

        let thread = null;
        let entry = null;

        // 1. Symbol.
        const cands = cell.symbol ? bySymbol.get(cell.symbol) : null;
        if (cands && cands.length) {
           const sameFont = cell.fontName ? cands.filter(e => e.symbolFontName === cell.fontName) : [];
           const pool = sameFont.length ? sameFont : cands;
           if (pool.length === 1) entry = pool[0];
           else {
              // Several entries share the glyph: let the cell's colour decide.
              const sw = swatchEntryOf(cell);
              entry = (sw && pool.indexOf(sw) >= 0) ? sw : pool[0];
           }
           if (entry) report.symbol++;
        }

        // 2. Exact swatch colour.
        if (!entry) {
           entry = swatchEntryOf(cell);
           if (entry) report.swatch++;
        }

        if (entry) thread = threadFor(entry);

        // 3/4. Colour for blank coloured cells.
        if (!thread && cell.fillColor && typeof rgbToLab !== 'undefined' && typeof dE !== 'undefined' && hasDmc) {
           const lab = rgbToLab(cell.fillColor[0], cell.fillColor[1], cell.fillColor[2]);
           if (entries.length) {
              const near = nearestEntry(lab);
              if (near) {
                 thread = threadFor(near);
                 cell.symbol = near.symbol || cell.symbol;
                 report.nearest++;
              }
           } else {
              let bestDist = Infinity, bestThread = null;
              for (let i = 0; i < DMC.length; i++) {
                 const d = dE(lab, DMC[i].lab);
                 if (d < bestDist) { bestDist = d; bestThread = DMC[i]; }
              }
              thread = bestThread;
              if (!cell.symbol) cell.symbol = bestThread ? bestThread.id : "■";
              if (thread) report.catalogue++;
           }
        }

        // 5. Unresolved: keep the stitch visible, but count it. Each symbol
        //    the key does not list becomes its own placeholder thread, so the
        //    stitcher can assign it in the review; one shared black "Unknown"
        //    merged them past telling apart.
        if (!thread) {
           const s = cell.symbol || '(colour)';
           thread = placeholderFor(s);
           report.unresolved++;
           report.unresolvedSymbols[s] = (report.unresolvedSymbols[s] || 0) + 1;
        }

        linked.push({ ...cell, thread });
     });

     return linked;
  }

  /**
   * Gather backstitch from every chart page, shifted into design coordinates by
   * each page's placement so a multi-page chart's outlines join up across the
   * page breaks.
   */
  collectBackstitch(chartPages, chartLayout) {
    const all = [];
    for (const pInfo of chartLayout.pages) {
      const pageData = chartPages.find(p => p.pageIndex === pInfo.pageIndex);
      if (!pageData) continue;
      const grid = this.samplingGrid(pInfo);
      let lines;
      try {
        lines = this.extractBackstitch(pageData, grid);
      } catch (e) {
        continue;
      }
      for (const ln of lines) {
        all.push({
          x1: ln.x1 + pInfo.globalOffsetCol, y1: ln.y1 + pInfo.globalOffsetRow,
          x2: ln.x2 + pInfo.globalOffsetCol, y2: ln.y2 + pInfo.globalOffsetRow,
          rgb: ln.rgb,
        });
      }
    }
    return all;
  }

  /**
   * Extract backstitch line work from a chart page.
   *
   * Backstitch is outline stitching drawn over the grid rather than inside
   * cells, so it never appears in the cell sampling and was simply discarded —
   * patterns imported with their outlines missing and `bsLines` always empty.
   *
   * It is separated from the rest of the page's line work by the pen that drew
   * it. A chart is ruled, and its symbols drawn, in a single ink; backstitch is
   * drawn in thread colours and with a heavier pen. On PAT2171_2 that divides
   * 1448 stroked segments into 1394 in the ink [44,46,53] and 52 in the two
   * colours its key lists for backstitch, B5200 (white) and D225 (pink).
   *
   * Endpoints are snapped to the lattice — backstitch runs corner to corner, so
   * its coordinates are grid intersections, which is also the space bsLines use.
   *
   * @returns {{x1:number,y1:number,x2:number,y2:number,rgb:number[]}[]} in
   *          page-local lattice coordinates
   */
  extractBackstitch(page, grid) {
    if (!grid || !(grid.cellWidth > 0) || !(grid.cellHeight > 0)) return [];

    const x0 = grid.originX, y0 = grid.originY;
    const x1 = x0 + grid.columns * grid.cellWidth;
    const y1 = y0 + grid.rows * grid.cellHeight;
    const pad = Math.max(grid.cellWidth, grid.cellHeight);

    // Stroked line work inside the chart, as 2-point segments. A polyline —
    // one moveTo then several lineTo, which is how many charts draw a run of
    // outline — is broken into its segments rather than skipped.
    const segments = [];
    const inBox = (pt) => pt.x >= x0 - pad && pt.x <= x1 + pad && pt.y >= y0 - pad && pt.y <= y1 + pad;
    for (const p of page.vectorPaths) {
      if (!p.stroked || !p.points || p.points.length < 2) continue;
      if (p.type !== 'line' && p.points.length > 64) continue;
      for (let i = 1; i < p.points.length; i++) {
        const a = p.points[i - 1], b = p.points[i];
        if (!inBox(a) || !inBox(b)) continue;
        if (a.x === b.x && a.y === b.y) continue;
        segments.push({ points: [a, b], strokeColor: p.strokeColor, lineWidth: p.lineWidth,
                        fromPolyline: p.points.length > 2 });
      }
    }
    if (!segments.length) return [];

    const unit = Math.max(1e-6, Math.min(grid.cellWidth, grid.cellHeight));
    const onLattice = (pt) => {
      const fx = (pt.x - x0) / grid.cellWidth * 2, fy = (pt.y - y0) / grid.cellHeight * 2;
      return Math.abs(fx - Math.round(fx)) <= 0.3 && Math.abs(fy - Math.round(fy)) <= 0.3;
    };
    const lenOf = (sg) => Math.hypot(sg.points[0].x - sg.points[1].x, sg.points[0].y - sg.points[1].y) / unit;
    const colourKey = (sg) => sg.strokeColor ? sg.strokeColor.join(',') : 'none';

    // The ink. Best witnessed by the grid's own rules — straight runs much
    // longer than any stitch — since a chart is ruled in its ink. Only without
    // such rules, the most common stroke colour: there, the main backstitch
    // thread could otherwise be taken for ink and every line in it dropped.
    const tally = new Map();
    const ruleTally = new Map();
    for (const sg of segments) {
      const k = colourKey(sg);
      tally.set(k, (tally.get(k) || 0) + 1);
      if (lenOf(sg) > 12) ruleTally.set(k, (ruleTally.get(k) || 0) + 1);
    }
    const modeOf = (m) => { let best = null, n = -1; for (const [k, c] of m) if (c > n) { n = c; best = k; } return best; };
    const inkKey = ruleTally.size ? modeOf(ruleTally) : modeOf(tally);
    // Typical pen width for the ink, to catch backstitch drawn in the same
    // colour — common on charts with no coloured outlining.
    const inkWidths = segments
      .filter(sg => colourKey(sg) === inkKey)
      .map(sg => sg.lineWidth || 1)
      .sort((a, b) => a - b);
    const inkWidth = inkWidths.length ? inkWidths[Math.floor(inkWidths.length / 2)] : 1;

    const out = [];
    const seen = new Set();
    for (const s of segments) {
      const a = s.points[0], b = s.points[1];
      const lenCells = lenOf(s);
      const key = colourKey(s);
      // Shorter than most of a cell is a mark inside one — part of a symbol,
      // not a stitch between two corners. A long horizontal or vertical run is
      // a rule, whatever its colour: charts draw every tenth line bold and
      // often black, which is both a different colour and a heavier pen than
      // the fine grid (Books and Blossoms: 54 such rules, each 300 rows long).
      // A long diagonal is never a rule, so it is kept as a long stitch.
      if (lenCells < 0.6) continue;
      const axisAligned = Math.abs(a.x - b.x) < unit * 0.1 || Math.abs(a.y - b.y) < unit * 0.1;
      if (lenCells > 12 && (axisAligned || key === inkKey)) continue;
      // A polyline is only stitching if its vertices sit on the stitching
      // lattice — cell corners, or the half-cell points fractional backstitch
      // uses. Symbol outlines are polylines too (DMC draws its symbols as white
      // outlines, near enough to B5200 to pass for it) but their vertices fall
      // anywhere.
      if (s.fromPolyline && !(onLattice(a) && onLattice(b))) continue;
      const colouredDifferently = key !== inkKey;
      const heavierPen = (s.lineWidth || 1) > inkWidth * 1.4;
      if (!colouredDifferently && !heavierPen) continue;

      // Snap to the lattice: 0 is the grid's leading edge, 1 the first line in.
      const lx1 = Math.round((a.x - x0) / grid.cellWidth);
      const ly1 = Math.round((a.y - y0) / grid.cellHeight);
      const lx2 = Math.round((b.x - x0) / grid.cellWidth);
      const ly2 = Math.round((b.y - y0) / grid.cellHeight);
      if (lx1 === lx2 && ly1 === ly2) continue;        // collapsed to a point
      if (lx1 < 0 || ly1 < 0 || lx2 < 0 || ly2 < 0) continue;
      if (lx1 > grid.columns || lx2 > grid.columns) continue;
      if (ly1 > grid.rows || ly2 > grid.rows) continue;

      // Deduplicate, including the same stitch drawn in reverse.
      const fwd = lx1 + ',' + ly1 + ',' + lx2 + ',' + ly2;
      const rev = lx2 + ',' + ly2 + ',' + lx1 + ',' + ly1;
      if (seen.has(fwd) || seen.has(rev)) continue;
      seen.add(fwd);

      out.push({
        x1: lx1, y1: ly1, x2: lx2, y2: ly2,
        rgb: s.strokeColor ? Array.from(s.strokeColor) : null,
      });
    }
    return out;
  }

  /**
   * Bounding box of the stitched cells, used to trim the blank margin a chart's
   * ruling leaves around the design.
   *
   * Returns the full grid when nothing is stitched (so an empty import still
   * produces a sane canvas) and when the margin is negligible, so charts that
   * are already tight are passed through untouched.
   *
   * Backstitch counts as design too: an outline, a caption or whiskers can run
   * past the last cross stitch, and trimming to the crosses alone cut them off.
   * A line runs between lattice points, so it needs the cells on either side of
   * its ends: lattice x from a to b keeps columns a to b-1.
   *
   * @returns {{offsetCol:number, offsetRow:number, width:number, height:number}}
   */
  stitchedBounds(linked, gridWidth, gridHeight, bsLines) {
    const full = { offsetCol: 0, offsetRow: 0, width: gridWidth, height: gridHeight };
    let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (const cell of linked) {
      if (cell.isEmpty || !cell.thread) continue;
      // Skip anything outside the grid rather than clamping it in, so a stray
      // cell cannot drag the design's edge out to meet it.
      if (cell.col < 0 || cell.col >= gridWidth) continue;
      if (cell.row < 0 || cell.row >= gridHeight) continue;
      if (cell.col < c0) c0 = cell.col;
      if (cell.col > c1) c1 = cell.col;
      if (cell.row < r0) r0 = cell.row;
      if (cell.row > r1) r1 = cell.row;
    }
    for (const ln of bsLines || []) {
      const lx0 = Math.min(ln.x1, ln.x2), lx1 = Math.max(ln.x1, ln.x2);
      const ly0 = Math.min(ln.y1, ln.y2), ly1 = Math.max(ln.y1, ln.y2);
      if (lx0 < 0 || ly0 < 0 || lx1 > gridWidth || ly1 > gridHeight) continue;
      const a = Math.min(lx0, gridWidth - 1), b = Math.max(a, lx1 - 1);
      const c = Math.min(ly0, gridHeight - 1), d = Math.max(c, ly1 - 1);
      if (a < c0) c0 = a; if (b > c1) c1 = b;
      if (c < r0) r0 = c; if (d > r1) r1 = d;
    }
    if (!isFinite(c0) || !isFinite(r0) || c1 < c0 || r1 < r0) return full;

    return {
      offsetCol: c0,
      offsetRow: r0,
      width: c1 - c0 + 1,
      height: r1 - r0 + 1,
    };
  }

  convertToPattern(chartLayout, linked, legend, bsLines, stated) {
     const gridWidth = chartLayout.totalColumns || 50;
     const gridHeight = chartLayout.totalRows || 50;

     // Charts are routinely ruled larger than the design they carry, leaving a
     // blank margin of grid cells all round. Importing the ruled area would
     // overstate the finished size and surround the work with empty canvas, so
     // the pattern is trimmed to the stitches themselves — which is the size
     // the designer quotes. On PAT2171_2 that is the difference between the
     // 92x98 ruled grid and the 73x72 design, against a stated 14x13 cm at
     // 5.5 stitches/cm (about 77x72).
     // When the key lists backstitch threads, a stroke matching none of them is
     // page furniture rather than stitching — PAT1968_2's blue centre arrows sit
     // right on the grid's edge and would otherwise widen the design by a column.
     // With no backstitch in the key there is nothing to check against, so
     // everything found is kept.
     const bsKey = ((legend && legend.entries) || []).filter(e => e.kind === 'backstitch' && e.lineRgb);
     const bsFound = (bsLines || []).map(ln => Object.assign({}, ln, { colorId: this.backstitchThreadFor(ln.rgb, bsKey) }))
        .filter(ln => !bsKey.length || ln.colorId);

     const trim = this.stitchedBounds(linked, gridWidth, gridHeight, bsFound);
     const width = trim.width;
     const height = trim.height;

     const pattern = new Array(width * height).fill(null).map(() => ({
        type: "skip", id: "__skip__", rgb: [255, 255, 255], lab: [100, 0, 0]
     }));

     // Backstitch sits on the lattice, so it shifts with the trim. The trim
     // box already includes it, so nothing within the design is lost.
     // The app reads a line's thread from colorId and draws it in color.
     const hex = (c) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
     const trimmedBs = bsFound.map(ln => {
        const out = {
           x1: ln.x1 - trim.offsetCol, y1: ln.y1 - trim.offsetRow,
           x2: ln.x2 - trim.offsetCol, y2: ln.y2 - trim.offsetRow,
        };
        const id = ln.colorId;
        let rgb = ln.rgb;
        if (id) {
           out.colorId = id;
           const t = (typeof getDmcByIdCI === 'function') ? getDmcByIdCI(id) : null;
           if (t && t.rgb) rgb = t.rgb;
        }
        if (rgb) out.color = hex(rgb);
        return out;
     }).filter(ln =>
        ln.x1 >= 0 && ln.x1 <= width && ln.x2 >= 0 && ln.x2 <= width &&
        ln.y1 >= 0 && ln.y1 <= height && ln.y2 >= 0 && ln.y2 <= height
     );

     let stitchCount = 0;
     const paletteMap = new Set();
     const perThread = new Map();
     // Fractional stitches live beside the full-stitch pattern, keyed by cell,
     // with the cell itself left blank: the app fills any quarter it is not
     // given from the full stitch beneath.
     const partialStitches = [];
     const placeholders = new Map();

     linked.forEach(cell => {
        const col = cell.col - trim.offsetCol;
        const row = cell.row - trim.offsetRow;
        if (cell.partialThreads && col >= 0 && col < width && row >= 0 && row < height) {
           const q = {};
           for (const k of Object.keys(cell.partialThreads)) {
              const t = cell.partialThreads[k];
              q[k] = { id: t.id, rgb: t.rgb, name: t.name || ('DMC ' + t.id) };
              paletteMap.add(t.id);
           }
           partialStitches.push([row * width + col, q]);
           stitchCount++;
           return;
        }
        if (!cell.isEmpty && cell.thread && col >= 0 && col < width && row >= 0 && row < height) {
           const idx = row * width + col;
           pattern[idx] = {
              type: "solid",
              id: cell.thread.id,
              name: cell.thread.name || ("DMC " + cell.thread.id),
              rgb: cell.thread.rgb,
              lab: cell.thread.lab || [50,0,0],
              dist: 0,
              symbol: cell.symbol
           };
           stitchCount++;
           paletteMap.add(cell.thread.id);
           const tk = String(cell.thread.id).toLowerCase();
           perThread.set(tk, (perThread.get(tk) || 0) + 1);
           if (cell.thread.placeholder) {
              const ph = placeholders.get(cell.thread.id) ||
                 { id: cell.thread.id, name: cell.thread.name, symbol: cell.symbol || '', reason: cell.thread.placeholder, count: 0 };
              ph.count++;
              placeholders.set(cell.thread.id, ph);
           }
        }
     });

     const project = {
        v: 7, // Not 8, because 8 expects compressed array format (['310', 's']) in Tracker
        w: width,
        h: height,
        // The fabric count the PDF states, where it states one.
        settings: { sW: width, sH: height, fabricCt: (stated && stated.fabricCount) || 14 },
        pattern: pattern,
        bsLines: trimmedBs,
        partialStitches: partialStitches,
        done: null,
        parkMarkers: [],
        totalTime: 0,
        sessions: [],
        threadOwned: {},
        importReport: this.buildImportReport(chartLayout, legend, width, height, stitchCount, paletteMap.size,
          this.validateAgainstStated(stated, {
            w: width, h: height, colours: paletteMap.size,
            keyCounts: ((legend && legend.entries) || [])
              .filter(e => e.kind !== 'backstitch' && e.stitchCount != null)
              .map(e => ({ code: String(e.threadCode), stated: e.stitchCount,
                           imported: perThread.get(String(e.threadCode).toLowerCase()) || 0 })),
          }), stated)
     };
     // Threads the importer had to invent — a symbol missing from the key, or
     // a scanned symbol — for the review to offer up for assignment.
     project.importReport.placeholders = Array.from(placeholders.values());
     return project;
  }

  /**
   * The backstitch key entry a chart stroke belongs to, by nearest colour.
   *
   * Exact matching does not work here the way it does for swatches: a key may
   * draw its sample in a slightly different shade from the chart's stroke (on
   * PAT2171_2 the B5200 sample is a light grey so it shows on white paper,
   * while the chart strokes it pure white). Nearest within a generous bound is
   * enough, because a key lists only a handful of backstitch threads.
   *
   * @returns {string|null} thread code
   */
  backstitchThreadFor(rgb, bsKey) {
     if (!rgb || !bsKey || !bsKey.length) return null;
     let best = null, bestD = Infinity;
     for (const e of bsKey) {
        const d = Math.hypot(rgb[0] - e.lineRgb[0], rgb[1] - e.lineRgb[1], rgb[2] - e.lineRgb[2]);
        if (d < bestD) { bestD = d; best = e; }
     }
     return best && bestD <= 80 ? String(best.threadCode) : null;
  }

  /**
   * What the PDF says about itself: its size in stitches, its physical size,
   * the fabric count, and how many colours it uses. Publishers print these on
   * the cover, materials or key page, and they are the only ground truth an
   * import can be checked against.
   *
   * Recognised (all case-insensitive):
   *   stitches   "Stitch Count: 309w x 467h", "256W x 450H", "220 x 300 stitches"
   *   physical   "14 x 13 cm", "5.51 x 5.11 in"
   *   fabric     "14 ct", "14 count", "Aida 14", "5,5 pts/cm" (= 14 per inch)
   *   colours    "# of colors: 102", "102 colours"
   *
   * @returns {{stitches?:{w,h}, physicalCm?:{w,h}, fabricCount?:number, colours?:number}}
   */
  readStatedFacts(pages) {
     const out = {};
     const num = (s) => parseFloat(String(s).replace(',', '.'));
     for (const page of pages || []) {
        const text = (page.textItems || []).map(t => t.str).join(' ').replace(/\s+/g, ' ');
        if (!out.stitches) {
           const m = text.match(/stitch(?:es)?\s*count\s*:?\s*(\d{1,4})\s*w?\s*[x×]\s*(\d{1,4})\s*h?/i) ||
                     text.match(/\b(\d{1,4})\s*W\s*[x×]\s*(\d{1,4})\s*H\b/) ||
                     text.match(/\b(\d{1,4})\s*[x×]\s*(\d{1,4})\s*stitch(?:es)?\b/i) ||
                     text.match(/stitches\s*:?\s*(\d{1,4})\s*[x×]\s*(\d{1,4})\b/i);
           if (m) out.stitches = { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
        }
        if (!out.physicalCm) {
           const cm = text.match(/\b(\d{1,3}(?:[.,]\d+)?)\s*(?:cm)?\s*[x×]\s*(\d{1,3}(?:[.,]\d+)?)\s*cm\b/i);
           const inch = text.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:in|inches|")(?![a-z])/i);
           if (cm) out.physicalCm = { w: num(cm[1]), h: num(cm[2]) };
           else if (inch) out.physicalCm = { w: num(inch[1]) * 2.54, h: num(inch[2]) * 2.54 };
        }
        if (!out.fabricCount) {
           const ct = text.match(/\b(\d{2})\s*(?:ct|count)\b/i) || text.match(/\baida\s+(\d{2})\b/i);
           const perCm = text.match(/\b(\d{1,2}[.,]\d)\s*p\s*ts\s*\/\s*cm/i);
           if (ct && +ct[1] >= 6 && +ct[1] <= 40) out.fabricCount = parseInt(ct[1], 10);
           else if (perCm) out.fabricCount = Math.round(num(perCm[1]) * 2.54);
        }
        if (!out.colours) {
           const c = text.match(/#\s*of\s*colou?rs\s*:?\s*(\d{1,3})/i) || text.match(/\b(\d{1,3})\s+colou?rs\b/i);
           if (c) out.colours = parseInt(c[1], 10);
        }
     }
     return out;
  }

  /**
   * Check the import against what the PDF states about itself.
   *
   * A stated stitch count is exact and must match. A physical size is rounded
   * by its publisher — PAT2171_2 says "14 x 13 cm" for a design 73 stitches
   * wide, which is 13.3 cm at its stated 5.5 per cm — so it only flags a
   * difference of more than 10%. Where the key prints a stitch count for each
   * thread, every thread is compared.
   *
   * @returns {{checks:Array<{what,stated,imported,ok}>, warnings:string[]}}
   */
  validateAgainstStated(stated, result) {
     const checks = [], warnings = [];
     if (!stated) return { checks, warnings };
     if (stated.stitches) {
        const ok = stated.stitches.w === result.w && stated.stitches.h === result.h;
        checks.push({ what: 'size', stated: stated.stitches.w + ' x ' + stated.stitches.h,
                      imported: result.w + ' x ' + result.h, ok });
        if (!ok) warnings.push('The PDF states a design of ' + stated.stitches.w + ' x ' + stated.stitches.h +
          ' stitches; the import is ' + result.w + ' x ' + result.h + '.');
     } else if (stated.physicalCm && stated.fabricCount) {
        const perCm = stated.fabricCount / 2.54;
        const ew = stated.physicalCm.w * perCm, eh = stated.physicalCm.h * perCm;
        const off = Math.max(Math.abs(result.w - ew) / ew, Math.abs(result.h - eh) / eh);
        const ok = off <= 0.1;
        checks.push({ what: 'physical size', stated: stated.physicalCm.w + ' x ' + stated.physicalCm.h + ' cm',
                      imported: result.w + ' x ' + result.h, ok });
        if (!ok) warnings.push('The PDF states a finished size of about ' + Math.round(ew) + ' x ' + Math.round(eh) +
          ' stitches; the import is ' + result.w + ' x ' + result.h + '.');
     }
     if (stated.colours) {
        const ok = stated.colours === result.colours;
        checks.push({ what: 'colours', stated: stated.colours, imported: result.colours, ok });
        if (!ok) warnings.push('The PDF lists ' + stated.colours + ' colours; ' + result.colours + ' were imported.');
     }
     if (result.keyCounts && result.keyCounts.length) {
        const wrong = result.keyCounts.filter(k => k.stated !== k.imported);
        checks.push({ what: 'per-thread counts', stated: result.keyCounts.length + ' threads',
                      imported: (result.keyCounts.length - wrong.length) + ' match', ok: !wrong.length });
        if (wrong.length) {
           warnings.push(wrong.length + ' of ' + result.keyCounts.length + ' threads differ from the stitch count ' +
             'printed in the key (e.g. ' + wrong.slice(0, 3).map(k => k.code + ': key ' + k.stated + ', imported ' + k.imported).join('; ') + ').');
        }
     }
     return { checks, warnings };
  }

  /**
   * The two key colours nearest to each other, by CIE delta-E, or null when the
   * colour helpers are unavailable or the key has fewer than two colours.
   */
  closestKeyPair(entries) {
     if (typeof rgbToLab !== 'function' || typeof dE !== 'function') return null;
     const cols = [];
     for (const e of entries || []) {
        if (e.kind === 'backstitch') continue;
        let rgb = e.swatchRgb;
        if (!rgb && typeof getDmcByIdCI === 'function') {
           const t = getDmcByIdCI(e.threadCode);
           if (t) rgb = t.rgb;
        }
        if (rgb) cols.push({ code: String(e.threadCode), lab: rgbToLab(rgb[0], rgb[1], rgb[2]) });
     }
     if (cols.length < 2) return null;
     let best = null;
     for (let i = 0; i < cols.length; i++) {
        for (let j = i + 1; j < cols.length; j++) {
           const d = dE(cols[i].lab, cols[j].lab);
           if (!best || d < best.dE) best = { a: cols[i].code, b: cols[j].code, dE: d };
        }
     }
     return best;
  }

  /**
   * A short account of how the import was assembled — what was read from the
   * PDF and what had to be guessed — so the result can be reviewed rather than
   * trusted blindly. Kept small: it travels with the project.
   */
  buildImportReport(chartLayout, legend, width, height, stitchCount, colourCount, validation, stated) {
     const entries = (legend && legend.entries) || [];
     const m = (legend && legend.matchReport) || {};
     const warnings = [].concat((chartLayout && chartLayout.warnings) || []);
     const guessed = (m.nearest || 0) + (m.catalogue || 0);
     // A scanned chart has already said how its colours were found; the
     // generic key warnings would only repeat it.
     const scannedImport = !!(chartLayout && (chartLayout.scanned || chartLayout.layoutSource === 'scanned-image'));
     if (!scannedImport && !entries.filter(e => e.kind !== 'backstitch').length) {
        warnings.push('No colour key was found, so thread colours were estimated from the chart.');
     }
     if (m.unresolved) {
        const syms = Object.keys(m.unresolvedSymbols || {}).slice(0, 8).join(' ');
        warnings.push(m.unresolved + ' stitches use a symbol missing from the key (' + syms +
          ') and were imported as placeholders, one per symbol, to be given a thread.');
     }
     // Matching by similarity is only a risk when the key has colours close
     // enough to mistake for one another — choosing among PAT1968_2's seven
     // well-separated colours is not guesswork, and saying so would be noise.
     // Whether the key's colours are far enough apart for nearest-colour
     // matching to be safe, which the review counts as matched to the key.
     const close = this.closestKeyPair(entries);
     const keyColoursDistinct = !!entries.length && (!close || close.dE >= 10);
     if (!scannedImport && guessed && stitchCount && guessed / stitchCount > 0.05) {
        if (!keyColoursDistinct) {
           warnings.push(Math.round(100 * guessed / stitchCount) + '% of stitches were matched by colour ' +
             'similarity rather than read from the key' +
             (close ? ', and the key lists ' + close.a + ' and ' + close.b + ', which are easily confused.' : '.'));
        }
     }
     if (validation && validation.warnings) warnings.push(...validation.warnings);
     return {
        layout: (chartLayout && chartLayout.layoutSource) || 'sequential',
        scanned: scannedImport,
        keyColoursDistinct: keyColoursDistinct,
        tiling: (chartLayout && chartLayout.tiling) || null,
        size: { w: width, h: height },
        keyEntries: entries.filter(e => e.kind !== 'backstitch').length,
        backstitchKeyEntries: entries.filter(e => e.kind === 'backstitch').length,
        stitches: stitchCount,
        colours: colourCount,
        matched: {
           symbol: m.symbol || 0, swatch: m.swatch || 0, nearest: m.nearest || 0,
           catalogue: m.catalogue || 0, unresolved: m.unresolved || 0, partial: m.partial || 0,
        },
        stated: stated || {},
        checks: (validation && validation.checks) || [],
        warnings: warnings,
     };
  }
}
