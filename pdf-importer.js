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
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
      const textItems = textContent.items.map(item => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
        fontName: item.fontName,
        fontSize: Math.abs(item.transform[0]) || Math.abs(item.transform[3])
      }));

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

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];

      if (fn === pdfjsLib.OPS.moveTo) {
        currentPath = [{x: args[0], y: args[1]}];
      } else if (fn === pdfjsLib.OPS.lineTo) {
        currentPath.push({x: args[0], y: args[1]});
      } else if (fn === pdfjsLib.OPS.rectangle) {
        currentPath = [
          {x: args[0], y: args[1]},
          {x: args[0] + args[2], y: args[1]},
          {x: args[0] + args[2], y: args[1] + args[3]},
          {x: args[0], y: args[1] + args[3]},
          {x: args[0], y: args[1]}
        ];
        paths.push({
          type: 'rect',
          points: currentPath,
          lineWidth: 1
        });
        currentPath = [];
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
      const numSingleChars = page.textItems.filter(t => t.str.trim().length === 1).length;
      const hasDMC = page.textItems.some(t => t.str.toLowerCase().includes('dmc'));

      if (numLines > 100 && numSingleChars > 100) {
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
        // Simplistic layout mapping
        globalOffsetCol: i * 50,
        globalOffsetRow: 0
      };
    });

    let totalCols = 0;
    let totalRows = 0;
    pages.forEach(p => {
      totalCols = Math.max(totalCols, p.globalOffsetCol + p.grid.columns);
      totalRows = Math.max(totalRows, p.globalOffsetRow + p.grid.rows);
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

     // PDF Y-axis is bottom-up, so larger Y is higher up on the page.
     // Sort hLines descending so row 0 is the top-most line.
     hLines.sort((a, b) => b - a);
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
              // OriginY is the top line, so we subtract cellHeight to go down
              const cy = grid.originY - r * grid.cellHeight - grid.cellHeight / 2;

              const item = pageData.textItems.find(t =>
                 t.str.trim().length === 1 &&
                 Math.abs((t.x + t.width/2) - cx) < grid.cellWidth &&
                 Math.abs((t.y + t.height/2) - cy) < grid.cellHeight
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
         // Sort items primarily by Y, then by X to read top-to-bottom, left-to-right
         const items = [...page.textItems].sort((a,b) => Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x);
         const texts = items.map(t => t.str.trim()).filter(s => s.length > 0);

         for (let i = 0; i < texts.length; i++) {
           const t = texts[i];
           if (t.length === 1 && !/^[A-Za-z0-9]$/.test(t) || (t.length === 1 && i+1 < texts.length && /^\d+$/.test(texts[i+1]))) {
              // Usually a symbol is followed by DMC code and maybe name
              const nextItems = texts.slice(i+1, i+5);
              let code = nextItems.find(n => /^\d{3,4}$/.test(n) || /^(B5200|BLANC|ECRU)$/i.test(n));

              if (code) {
                 legend.entries.push({
                    symbol: t,
                    symbolFontName: "Unknown",
                    threadCode: code,
                    colorName: "Color " + code,
                    stitchCount: 100 // Hard to parse consistently without strict tabular layout
                 });
                 i++; // Skip ahead
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
           // PDF coordinates might go up-is-y, but pattern expects down-is-y.
           // However, if we built the layout sorting properly, rows correspond directly.
           // For now, assume top-down.
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
        width,
        height,
        pattern,
        bsLines: [],
        stitchCount,
        paletteSize: paletteMap.size
     };
  }
}
