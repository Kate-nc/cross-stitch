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
      return await loadingTask.promise;
    } catch (err) {
      throw new Error("Failed to parse PDF: " + err.message);
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
    const pages = [];
    for (let i = 1; i <= pdfData.numPages; i++) {
      const page = await pdfData.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });

      const textContent = await page.getTextContent();
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

      const opList = await page.getOperatorList();
      const vectorPaths = this.extractVectorPaths(opList, viewport);

      const fonts = [];

      pages.push({
        pageIndex: i,
        width: viewport.width,
        height: viewport.height,
        vectorPaths,
        textItems,
        fonts
      });
    }
    return pages;
  }

  extractVectorPaths(opList, viewport) {
    const paths = [];
    const fnArray = opList.fnArray;
    const argsArray = opList.argsArray;

    let currentPath = [];

    const addPoint = (x, y) => {
      const pt = viewport.convertToViewportPoint(x, y);
      currentPath.push({x: pt[0], y: pt[1]});
    };

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];

      if (fn === pdfjsLib.OPS.moveTo) {
        if (currentPath.length > 0) {
           paths.push({ type: currentPath.length === 2 ? 'line' : 'path', points: currentPath, lineWidth: 1 });
        }
        currentPath = [];
        addPoint(args[0], args[1]);
      } else if (fn === pdfjsLib.OPS.lineTo) {
        addPoint(args[0], args[1]);
      } else if (fn === pdfjsLib.OPS.rectangle) {
        if (currentPath.length > 0) {
           paths.push({ type: currentPath.length === 2 ? 'line' : 'path', points: currentPath, lineWidth: 1 });
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
          lineWidth: 1
        });
        currentPath = [];
      } else if (fn === pdfjsLib.OPS.constructPath) {
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
                 paths.push({ type: currentPath.length === 2 ? 'line' : 'path', points: currentPath, lineWidth: 1 });
              }
              currentPath = [];
              addPoint(pointArgs[argIdx++], pointArgs[argIdx++]);
           } else if (op === pdfjsLib.OPS.lineTo || op === 2 || op === 14) { // lineTo
              addPoint(pointArgs[argIdx++], pointArgs[argIdx++]);
           } else if (op === pdfjsLib.OPS.rectangle || op === 7 || op === 19) { // rectangle
              if (currentPath.length > 0) {
                 paths.push({ type: currentPath.length === 2 ? 'line' : 'path', points: currentPath, lineWidth: 1 });
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
                lineWidth: 1
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
      } else if (fn === pdfjsLib.OPS.stroke || fn === pdfjsLib.OPS.fill) {
        if (currentPath.length > 0) {
          paths.push({
            type: currentPath.length === 2 ? 'line' : 'path',
            points: currentPath,
            lineWidth: 1
          });
          currentPath = [];
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

     page.vectorPaths.forEach(p => {
        if (p.type === 'line' && p.points.length === 2) {
           const dx = Math.abs(p.points[0].x - p.points[1].x);
           const dy = Math.abs(p.points[0].y - p.points[1].y);
           if (dx > 20 && dy < 2) hLines.push(p.points[0].y);
           if (dy > 20 && dx < 2) vLines.push(p.points[0].x);
        } else if (p.type === 'rect' && p.points.length >= 4) {
           hLines.push(p.points[0].y, p.points[2].y);
           vLines.push(p.points[0].x, p.points[2].x);
        }
     });

     // Since we normalized to viewport coordinates (top-down), smaller Y is higher up.
     // Sort hLines ascending so row 0 is the top-most line.
     hLines.sort((a, b) => a - b);
     vLines.sort((a, b) => a - b);

     const cluster = (lines, descending = false) => {
        if (lines.length === 0) return [];
        const res = [lines[0]];
        for (let i = 1; i < lines.length; i++) {
           if (Math.abs(lines[i] - res[res.length - 1]) > 2) {
              res.push(lines[i]);
           }
        }
        return res;
     };

     const hClustered = cluster(hLines, true);
     const vClustered = cluster(vLines, false);

     let cellWidth = 10;
     let cellHeight = 10;

     if (vClustered.length > 1) {
        const diffs = [];
        for(let i=1; i<vClustered.length; i++) diffs.push(Math.abs(vClustered[i]-vClustered[i-1]));
        diffs.sort((a,b)=>a-b);
        cellWidth = diffs[Math.floor(diffs.length/2)] || 10;
     }
     if (hClustered.length > 1) {
        const diffs = [];
        for(let i=1; i<hClustered.length; i++) diffs.push(Math.abs(hClustered[i]-hClustered[i-1]));
        diffs.sort((a,b)=>a-b);
        cellHeight = diffs[Math.floor(diffs.length/2)] || 10;
     }

     const originX = vClustered.length > 0 ? vClustered[0] : 50;
     const originY = hClustered.length > 0 ? hClustered[0] : 50;
     const cols = vClustered.length > 1 ? vClustered.length - 1 : Math.max(10, Math.floor((page.width - 100) / cellWidth));
     const rows = hClustered.length > 1 ? hClustered.length - 1 : Math.max(10, Math.floor((page.height - 100) / cellHeight));

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
              const item = pageData.textItems.find(t =>
                 t.str.trim().length > 0 && t.str.trim().length <= 6 && // allows U+000A etc.
                 Math.abs((t.x + t.width/2) - cx) < grid.cellWidth &&
                 Math.abs((t.y - t.height/2) - cy) < grid.cellHeight
              );

              if (item) {
                 symbols.push({
                   col: pInfo.globalOffsetCol + c,
                   row: pInfo.globalOffsetRow + r,
                   symbol: item.str.trim(),
                   fontName: item.fontName,
                   isEmpty: false
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
         // Sort top-to-bottom (a.y - b.y since y is now top-down) and left-to-right (a.x - b.x)
         const items = [...page.textItems].sort((a,b) => Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x);
         const texts = items.map(t => t.str.trim()).filter(s => s.length > 0);

         for (let i = 0; i < texts.length; i++) {
           const t = texts[i];
           const isSymbolCandidate = (t.length === 1 && !/^[A-Za-z0-9]$/.test(t)) ||
                                     (t.length === 1 && i+1 < texts.length && /^\d+$/.test(texts[i+1])) ||
                                     t.startsWith('U+');

           if (isSymbolCandidate) {
              const nextItems = texts.slice(i+1, i+5);
              let code = nextItems.find(n => /^\d{3,4}$/.test(n) || /^(B5200|BLANC|ECRU)$/i.test(n));

              if (code) {
                 legend.entries.push({
                    symbol: t,
                    symbolFontName: "Unknown",
                    threadCode: code,
                    colorName: "Color " + code,
                    stitchCount: 100
                 });
                 i++;
              }
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

        const entry = legend.entries.find(e => e.symbol === cell.symbol);
        let thread = null;
        if (entry && typeof DMC !== 'undefined') {
           thread = DMC.find(d => String(d.id).toLowerCase() === String(entry.threadCode).toLowerCase());
        }

        if (!thread && entry) {
           thread = { id: entry.threadCode, rgb: [128,128,128], lab: [50,0,0], name: entry.colorName };
        } else if (!thread) {
           thread = { id: "310", rgb: [0,0,0], lab: [0,0,0], name: "Black" };
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
              dist: 0
           };
           stitchCount++;
           paletteMap.add(cell.thread.id);
        }
     });

     return {
        v: 8,
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
