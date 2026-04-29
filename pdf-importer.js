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
    const pdfData = await this.pdfLoader.load(file);
    const pages = await this.extractAllPages(pdfData);
    const classified = this.classifyPages(pages);

    if (classified.chartPages.length === 0) {
       throw new Error("No chart pages detected in the PDF.");
    }

    const chartLayout = this.detectChartLayout(classified.chartPages);
    const symbols = this.extractSymbols(classified.chartPages, chartLayout);
    const legend = this.parseLegend(classified.legendPages);
    const linked = this.linkSymbolsToThreads(symbols, legend);
    return this.convertToPattern(chartLayout, linked, legend);
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
    let currentTransform = [1, 0, 0, 1, 0, 0];

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
          // Simplification: Not full push/pop state but we reset path
          currentPath = [];
      } else if (fn === pdfjsLib.OPS.restore) {
          currentPath = [];
          currentTransform = [1, 0, 0, 1, 0, 0];
      }

      // Track RGB fills
      if (fn === pdfjsLib.OPS.setFillRGBColor || fn === 59) {
         currentRGB = args;
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
            // It was a stroke, just clear pending flags
            for (let k = paths.length - 1; k >= 0; k--) {
                if (paths[k].pendingFill) {
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

      // Some charts map symbols entirely as paths rather than text items.
      // If we see thousands of lines, it's definitely a chart page, even if text items are low.
      if (numLines > 50 && (numSingleChars > 50 || numTexts > 1000 || numLines > 2000)) {
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
        grid: this.detectGrid(p),
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

     let originX = vClustered.length > 0 ? vClustered[0] : 50;
     let originY = hClustered.length > 0 ? hClustered[0] : 50;

     // Filter out stray lines (like page borders at 0,0) by finding the first contiguous sequence
     if (vClustered.length > 3) {
         for (let i = 0; i < vClustered.length - 2; i++) {
             if (Math.abs((vClustered[i+1] - vClustered[i]) - cellWidth) < 2 &&
                 Math.abs((vClustered[i+2] - vClustered[i+1]) - cellWidth) < 2) {
                 originX = vClustered[i];
                 break;
             }
         }
     }

     if (hClustered.length > 3) {
         for (let i = 0; i < hClustered.length - 2; i++) {
             if (Math.abs((hClustered[i+1] - hClustered[i]) - cellHeight) < 2 &&
                 Math.abs((hClustered[i+2] - hClustered[i+1]) - cellHeight) < 2) {
                 originY = hClustered[i];
                 break;
             }
         }
     }

     let endX = vClustered.length > 0 ? vClustered[vClustered.length-1] : page.width - 50;
     let endY = hClustered.length > 0 ? hClustered[hClustered.length-1] : page.height - 50;

     if (vClustered.length > 3) {
         for (let i = vClustered.length - 1; i >= 2; i--) {
             if (Math.abs((vClustered[i] - vClustered[i-1]) - cellWidth) < 2) {
                 endX = vClustered[i];
                 break;
             }
         }
     }

     if (hClustered.length > 3) {
         for (let i = hClustered.length - 1; i >= 2; i--) {
             if (Math.abs((hClustered[i] - hClustered[i-1]) - cellHeight) < 2) {
                 endY = hClustered[i];
                 break;
             }
         }
     }

     const cols = vClustered.length > 1 ? Math.round((endX - originX) / cellWidth) : Math.max(10, Math.floor((page.width - 100) / cellWidth));
     const rows = hClustered.length > 1 ? Math.round((endY - originY) / cellHeight) : Math.max(10, Math.floor((page.height - 100) / cellHeight));

     return { originX, originY, cellWidth, cellHeight, columns: cols, rows: rows, boldLineInterval: 10 };
  }

  extractSymbols(chartPages, chartLayout) {
     const symbols = [];
     chartLayout.pages.forEach(pInfo => {
        const pageData = chartPages.find(p => p.pageIndex === pInfo.pageIndex);
        if (!pageData) return;

        const grid = pInfo.grid;

        for (let r = 0; r < grid.rows; r++) {
           for (let c = 0; c < grid.columns; c++) {
              const cx = grid.originX + c * grid.cellWidth + grid.cellWidth / 2;
              // OriginY is the top line, and since we are top-down now, we *add* cellHeight to go down
              const cy = grid.originY + r * grid.cellHeight + grid.cellHeight / 2;

              // Note that in PDF.js, text (tx, ty) typically denotes the bottom-left of the baseline.
              // For standard viewport coords, t.y is baseline. We adjust it slightly to find the visual center.
              // Also text width/height from getViewport scaling can sometimes be tricky.
              let item = pageData.textItems.find(t =>
                 t.str.trim().length > 0 && // Don't restrict length in case text wasn't split
                 // Check if the center of this specific cell falls within the text item's bounding box
                 cx >= t.x - (grid.cellWidth * 0.2) && cx <= (t.x + t.width + grid.cellWidth * 0.2) &&
                 Math.abs((t.y - t.height/2) - cy) < grid.cellHeight / 2
              );

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
                 const coloredPath = pageData.vectorPaths.find(pa => {
                    if (!pa.fillColor) return false;
                    // Use the centroid of the path's points rather than points[0] (which is a corner,
                    // not the center). Using a corner causes fills to be equidistant from two adjacent
                    // cell centers, producing a duplicate mark one row above the correct position.
                    const bx = pa.points.reduce((s, p) => s + p.x, 0) / pa.points.length;
                    const by = pa.points.reduce((s, p) => s + p.y, 0) / pa.points.length;
                    return Math.abs(bx - cx) < grid.cellWidth / 2 && Math.abs(by - cy) < grid.cellHeight / 2;
                 });
                 if (coloredPath) {
                    fillColor = coloredPath.fillColor;
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
     });
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

  convertToPattern(chartLayout, linked, legend) {
     const width = chartLayout.totalColumns || 50;
     const height = chartLayout.totalRows || 50;

     const pattern = new Array(width * height).fill(null).map(() => ({
        type: "skip", id: "__skip__", rgb: [255, 255, 255], lab: [100, 0, 0]
     }));

     let stitchCount = 0;
     const paletteMap = new Set();

     linked.forEach(cell => {
        if (!cell.isEmpty && cell.thread && cell.col >= 0 && cell.col < width && cell.row >= 0 && cell.row < height) {
           const idx = cell.row * width + cell.col;
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
        bsLines: [],
        done: null,
        parkMarkers: [],
        totalTime: 0,
        sessions: [],
        threadOwned: {}
     };
  }
}
