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
      // Use local bundled worker instead of CDN to avoid CSP/CORS blocks during complex off-main-thread parsing
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
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
  constructor() {
    this.pdfLoader = new PdfLoader();
  }

  /**
   * @param {File} file
   * @returns {Promise<Object>}
   */
  async import(file) {
    // PERF (Cat B-lite): yield to the event loop between heavy stages so the
    // browser can repaint the import progress UI, dispatch queued clicks
    // (so Cancel works), and avoid a single 20 s+ Long Task for large PDFs.
    // The cost is ~10–20 ms total — negligible vs the work being done.
    const yieldToBrowser = () => new Promise(r => setTimeout(r, 0));

    const pdfData = await this.pdfLoader.load(file);
    const pages = await this.extractAllPages(pdfData);
    await yieldToBrowser();

    const classified = this.classifyPages(pages);
    await yieldToBrowser();

    if (classified.chartPages.length === 0) {
       throw new Error("No chart pages detected in the PDF.");
    }

    const chartLayout = this.detectChartLayout(classified.chartPages);
    await yieldToBrowser();

    const symbols = await this.extractSymbols(classified.chartPages, chartLayout);
    await yieldToBrowser();

    const legend = this.parseLegend(classified.legendPages);
    await yieldToBrowser();

    const linked = this.linkSymbolsToThreads(symbols, legend);
    await yieldToBrowser();

    const bsLines = this.collectBackstitch(classified.chartPages, chartLayout);
    await yieldToBrowser();

    return this.convertToPattern(chartLayout, linked, legend, bsLines);
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
          fontSize: fontSize
        };
      });

      // To do advanced CMap extraction, we'd need to hook into the pdfjs font loading.
      // For now, ensuring we capture non-printable characters as distinct hex strings
      // avoids them being swallowed by `trim()` or collapsing into empty strings.

      const vectorPaths = this.extractVectorPaths(opList, viewport);

      const fonts = [];

      return {
        pageIndex: i,
        width: viewport.width,
        height: viewport.height,
        vectorPaths,
        textItems,
        fonts
      };
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
      } else if (numLines > 50 && (numTexts > 1000 || numLines > 2000) &&
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

    return {
      totalColumns: totalCols,
      totalRows: totalRows,
      pages: pages
    };
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
    return !!g && g.columns >= 20 && g.rows >= 20;
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
   * Requiring EVERY chart page to be placed is deliberate: a partial read would
   * silently drop a page's stitches, which is worse than the fallback's
   * predictable (if wrong-shaped) output.
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
      const span = this.rulerCellSpan(p.rawPage, r, limitCols, limitRows);
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
      warnings: layout.warnings || [],
    };
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
    const box = this.chartContentBox(page);
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
   * @returns {{x0:number,x1:number,y0:number,y1:number}|null}
   */
  chartContentBox(page) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let seen = 0;

    const paths = page.vectorPaths || [];
    for (let i = 0; i < paths.length; i++) {
      const pa = paths[i];
      if (!pa.fillColor || !pa.points || !pa.points.length) continue;
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
      // A chart symbol is one glyph. Two-digit ruler labels and prose are not.
      if (s.length !== 1) continue;
      if (t.x < x0) x0 = t.x;
      if (t.x > x1) x1 = t.x;
      const cy = t.y - (t.height || 0) / 2;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      seen++;
    }

    if (!seen || !isFinite(x0) || !isFinite(y0)) return null;
    return { x0, y0, x1, y1 };
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

  async extractSymbols(chartPages, chartLayout) {
     const symbols = [];
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
        const grid = pInfo.ruler
          ? this.gridFromRuler(pInfo.ruler, pInfo.rulerSpan, pInfo.grid)
          : pInfo.grid;

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
          for (let q = 0; q < pa.points.length; q++) { sx += pa.points[q].x; sy += pa.points[q].y; }
          fillPaths.push({ ref: pa, bx: sx / pa.points.length, by: sy / pa.points.length });
        }
        const fillBuckets = this._buildYBuckets(fillPaths, fp => fp.by, grid.cellHeight);

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

              let fillColor = null;
              if (!item) {
                 // Check if the cell is filled with a vector path color instead of a text symbol
                 const fillCands = fillBuckets.lookup(cy);
                 for (let fi = 0; fi < fillCands.length; fi++) {
                    const fp = fillCands[fi];
                    if (Math.abs(fp.bx - cx) < grid.cellWidth / 2 && Math.abs(fp.by - cy) < grid.cellHeight / 2) {
                       fillColor = fp.ref.fillColor;
                       break;
                    }
                 }
              }

              if (item) {
                 symbols.push({
                   col: pInfo.globalOffsetCol + c,
                   row: pInfo.globalOffsetRow + r,
                   symbol: item.str.trim(),
                   fontName: item.fontName,
                   isEmpty: false
                 });
              } else if (fillColor) {
                 symbols.push({
                   col: pInfo.globalOffsetCol + c,
                   row: pInfo.globalOffsetRow + r,
                   symbol: "",
                   fontName: "",
                   isEmpty: false,
                   fillColor: fillColor
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

  parseLegend(legendPages) {
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

  linkSymbolsToThreads(symbols, legend) {
     const linked = [];

     symbols.forEach(cell => {
        if (cell.isEmpty) {
           linked.push({ ...cell, thread: null });
           return;
        }

        let thread = null;

        // 1. Match by exact text symbol first
        let entry = null;
        if (cell.symbol) {
            entry = legend.entries.find(e => e.symbol === cell.symbol);
        }

        if (entry && typeof DMC !== 'undefined') {
            // PERF (perf-4 #1): O(1) cached lookup
            thread = (typeof getDmcByIdCI === 'function') ? getDmcByIdCI(entry.threadCode) : DMC.find(d => String(d.id).toLowerCase() === String(entry.threadCode).toLowerCase());
            if (!thread) {
                thread = { id: entry.threadCode, rgb: [128,128,128], lab: [50,0,0], name: entry.colorName };
            }
        }

        // 2. Fallback: If no symbol text matches, match by color proximity to legend threads
        if (!thread && cell.fillColor && typeof rgbToLab !== 'undefined' && typeof dE !== 'undefined' && typeof DMC !== 'undefined') {
            const lab = rgbToLab(cell.fillColor[0], cell.fillColor[1], cell.fillColor[2]);
            let bestDist = Infinity;
            let bestThread = null;

            let matchedEntry = null;
            if (legend.entries && legend.entries.length > 0) {
                for (const legEntry of legend.entries) {
                    // PERF (perf-4 #1): O(1) cached lookup inside per-legend loop
                    const dmcThread = (typeof getDmcByIdCI === 'function') ? getDmcByIdCI(legEntry.threadCode) : DMC.find(d => String(d.id).toLowerCase() === String(legEntry.threadCode).toLowerCase());
                    if (dmcThread) {
                        const dist = dE(lab, dmcThread.lab);
                        if (dist < bestDist) {
                            bestDist = dist;
                            bestThread = dmcThread;
                            matchedEntry = legEntry;
                        }
                    }
                }
            }

            // Allow matching if it's visually close
            if (bestThread && bestDist < 15) {
                thread = bestThread;
                if (matchedEntry) {
                    cell.symbol = matchedEntry.symbol || cell.symbol;
                }
            } else {
                // Second pass: Match against any DMC color (sometimes the legend parsing failed, but we still have colors)
                bestDist = Infinity;
                bestThread = null;
                for (let i = 0; i < DMC.length; i++) {
                    const dmc = DMC[i];
                    const dist = dE(lab, dmc.lab);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestThread = dmc;
                    }
                }
                thread = bestThread;
                // Since this isn't in the legend natively, assign a proxy symbol if it has none
                if (!cell.symbol) {
                    cell.symbol = bestThread ? bestThread.id : "■";
                }
            }
        }

        // 3. Last resort fallback
        if (!thread) {
           thread = { id: "310", rgb: [0,0,0], lab: [0,0,0], name: "Unknown" };
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
      const grid = pInfo.ruler
        ? this.gridFromRuler(pInfo.ruler, pInfo.rulerSpan, pInfo.grid)
        : pInfo.grid;
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

    const segments = [];
    for (const p of page.vectorPaths) {
      if (!p.stroked || p.type !== 'line' || !p.points || p.points.length !== 2) continue;
      const a = p.points[0], b = p.points[1];
      if (a.x < x0 - pad || a.x > x1 + pad || b.x < x0 - pad || b.x > x1 + pad) continue;
      if (a.y < y0 - pad || a.y > y1 + pad || b.y < y0 - pad || b.y > y1 + pad) continue;
      segments.push(p);
    }
    if (!segments.length) return [];

    // The ink: the stroke colour used for the most segments. Rules and symbols
    // vastly outnumber backstitch, so the mode is the chart's own ink.
    const tally = new Map();
    for (const s of segments) {
      const key = s.strokeColor ? s.strokeColor.join(',') : 'none';
      tally.set(key, (tally.get(key) || 0) + 1);
    }
    let inkKey = null, inkCount = -1;
    for (const [k, n] of tally) {
      if (n > inkCount) { inkCount = n; inkKey = k; }
    }
    // Typical pen width for the ink, to catch backstitch drawn in the same
    // colour — common on charts with no coloured outlining.
    const inkWidths = segments
      .filter(s => (s.strokeColor ? s.strokeColor.join(',') : 'none') === inkKey)
      .map(s => s.lineWidth || 1)
      .sort((a, b) => a - b);
    const inkWidth = inkWidths.length ? inkWidths[Math.floor(inkWidths.length / 2)] : 1;

    const out = [];
    const seen = new Set();
    for (const s of segments) {
      const a = s.points[0], b = s.points[1];
      const lenCells = Math.hypot(a.x - b.x, a.y - b.y) /
        Math.max(1e-6, Math.min(grid.cellWidth, grid.cellHeight));
      // Shorter than most of a cell is a mark inside one — part of a symbol,
      // not a stitch between two corners. Longer than a dozen cells in a
      // straight line is a rule or a border.
      if (lenCells < 0.6 || lenCells > 12) continue;

      const key = s.strokeColor ? s.strokeColor.join(',') : 'none';
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
   * @returns {{offsetCol:number, offsetRow:number, width:number, height:number}}
   */
  stitchedBounds(linked, gridWidth, gridHeight) {
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
    if (!isFinite(c0) || !isFinite(r0) || c1 < c0 || r1 < r0) return full;

    return {
      offsetCol: c0,
      offsetRow: r0,
      width: c1 - c0 + 1,
      height: r1 - r0 + 1,
    };
  }

  convertToPattern(chartLayout, linked, legend, bsLines) {
     const gridWidth = chartLayout.totalColumns || 50;
     const gridHeight = chartLayout.totalRows || 50;

     // Charts are routinely ruled larger than the design they carry, leaving a
     // blank margin of grid cells all round. Importing the ruled area would
     // overstate the finished size and surround the work with empty canvas, so
     // the pattern is trimmed to the stitches themselves — which is the size
     // the designer quotes. On PAT2171_2 that is the difference between the
     // 92x98 ruled grid and the 73x72 design, against a stated 14x13 cm at
     // 5.5 stitches/cm (about 77x72).
     const trim = this.stitchedBounds(linked, gridWidth, gridHeight);
     const width = trim.width;
     const height = trim.height;

     const pattern = new Array(width * height).fill(null).map(() => ({
        type: "skip", id: "__skip__", rgb: [255, 255, 255], lab: [100, 0, 0]
     }));

     // Backstitch sits on the lattice, so it shifts with the trim and is kept
     // only where it still falls inside the trimmed design.
     const trimmedBs = (bsLines || []).map(ln => ({
        x1: ln.x1 - trim.offsetCol, y1: ln.y1 - trim.offsetRow,
        x2: ln.x2 - trim.offsetCol, y2: ln.y2 - trim.offsetRow,
        rgb: ln.rgb,
     })).filter(ln =>
        ln.x1 >= 0 && ln.x1 <= width && ln.x2 >= 0 && ln.x2 <= width &&
        ln.y1 >= 0 && ln.y1 <= height && ln.y2 >= 0 && ln.y2 <= height
     );

     let stitchCount = 0;
     const paletteMap = new Set();

     linked.forEach(cell => {
        const col = cell.col - trim.offsetCol;
        const row = cell.row - trim.offsetRow;
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
        }
     });

     return {
        v: 7, // Not 8, because 8 expects compressed array format (['310', 's']) in Tracker
        w: width,
        h: height,
        settings: { sW: width, sH: height, fabricCt: 14 },
        pattern: pattern,
        bsLines: trimmedBs,
        done: null,
        parkMarkers: [],
        totalTime: 0,
        sessions: [],
        threadOwned: {}
     };
  }
}
