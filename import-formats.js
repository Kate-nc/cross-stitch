function parseHexColor(hex) {
  if (!hex || typeof hex !== 'string') return null;
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return [r, g, b];
    }
  }
  return null;
}

function importResultToProject(result, fabricCt = 14) {
  return {
    v: 8,
    w: result.width,
    h: result.height,
    settings: { sW: result.width, sH: result.height, fabricCt: fabricCt },
    pattern: result.pattern.map(m => {
      if (m.id === "__skip__") return { id: "__skip__" };
      return { id: m.id, type: m.type || "solid", rgb: m.rgb };
    }),
    bsLines: result.bsLines || [],
    done: null,
    parkMarkers: [],
    totalTime: 0,
    sessions: [],
    threadOwned: {}
  };
}

function detectImportFormat(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.oxs') || name.endsWith('.xml')) return "oxs";
  if (name.endsWith('.json')) return "json";
  if (name.endsWith('.pdf')) return "pdf";
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') ||
      name.endsWith('.gif') || name.endsWith('.bmp') || name.endsWith('.webp')) return "image";

  const mime = file.type.toLowerCase();
  if (mime === 'application/json') return "json";
  if (mime === 'application/pdf') return "pdf";
  if (mime.includes('xml')) return "oxs";
  if (mime.startsWith('image/')) return "image";

  return "unknown";
}

/**
 * PDF Parsing Foundation
 */

// Initialize PDF.js worker
if (typeof window !== 'undefined' && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * @typedef {Object} VectorPath
 * @property {'line' | 'rect' | 'path'} type
 * @property {Array<{x: number, y: number}>} points
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
 * @property {Object} cmap
 */

/**
 * @typedef {Object} PdfPageData
 * @property {number} pageIndex
 * @property {number} width
 * @property {number} height
 * @property {VectorPath[]} vectorPaths
 * @property {TextItem[]} textItems
 * @property {FontInfo[]} fonts
 */

class PdfLoader {
  /**
   * Loads a PDF file and parses its pages.
   * @param {File|ArrayBuffer} fileOrBuffer
   * @returns {Promise<PdfPageData[]>}
   */
  static async load(fileOrBuffer) {
    if (!window.pdfjsLib) throw new Error("PDF.js library not loaded.");

    let typedArray;
    if (fileOrBuffer instanceof File) {
      const buffer = await fileOrBuffer.arrayBuffer();
      typedArray = new Uint8Array(buffer);
    } else if (fileOrBuffer instanceof ArrayBuffer) {
      typedArray = new Uint8Array(fileOrBuffer);
    } else {
      typedArray = new Uint8Array(fileOrBuffer);
    }

    const loadingTask = window.pdfjsLib.getDocument({ data: typedArray });
    const pdf = await loadingTask.promise;

    const pagesData = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const data = await this.extractPageContent(page, i);
      pagesData.push(data);
    }

    return pagesData;
  }

  /**
   * Extracts text, vectors, and font data from a single PDF page.
   * @param {any} page
   * @param {number} pageIndex
   * @returns {Promise<PdfPageData>}
   */
  static async extractPageContent(page, pageIndex) {
    const viewport = page.getViewport({ scale: 1.0 });

    // Extract text and basic font mapping
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map(item => {
      // transform represents [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const transform = item.transform;
      return {
        str: item.str,
        x: transform[4],
        y: transform[5],
        width: item.width,
        height: item.height,
        fontName: item.fontName,
        fontSize: Math.abs(transform[0]) // roughly scaleX
      };
    });

    const fonts = [];
    for (const [fontName, fontData] of Object.entries(textContent.styles)) {
        fonts.push({
            name: fontName,
            cmap: fontData // minimal representation, we might need actual PDF font objects for deep cmap
        });
    }

    // Extract vectors
    const operatorList = await page.getOperatorList();
    const vectorPaths = this.parseVectorPaths(operatorList);

    return {
      pageIndex,
      width: viewport.width,
      height: viewport.height,
      vectorPaths,
      textItems,
      fonts
    };
  }

  /**
   * Parses PDF operator list into generic vector paths.
   * Simplified parser focusing on rectangles and lines.
   * @param {any} operatorList
   * @returns {VectorPath[]}
   */
  static parseVectorPaths(operatorList) {
    const OPS = window.pdfjsLib.OPS || {};
    const paths = [];
    let currentPath = [];
    let currentLineWidth = 1;
    let strokeColor = '#000000';
    let fillColor = '#000000';

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];

      if (fn === OPS.setLineWidth) {
        currentLineWidth = args[0];
      } else if (fn === OPS.setStrokeRGBColor) {
        strokeColor = `rgb(${Math.round(args[0]*255)},${Math.round(args[1]*255)},${Math.round(args[2]*255)})`;
      } else if (fn === OPS.setFillRGBColor) {
        fillColor = `rgb(${Math.round(args[0]*255)},${Math.round(args[1]*255)},${Math.round(args[2]*255)})`;
      } else if (fn === OPS.moveTo) {
        currentPath.push({ x: args[0], y: args[1] });
      } else if (fn === OPS.lineTo) {
        currentPath.push({ x: args[0], y: args[1] });
      } else if (fn === OPS.constructPath) {
        const ops = args[0];
        const coords = args[1];
        let coordIdx = 0;
        for (let j = 0; j < ops.length; j++) {
            const op = ops[j];
            if (op === 1) { // moveTo
                currentPath.push({ x: coords[coordIdx], y: coords[coordIdx+1] });
                coordIdx += 2;
            } else if (op === 2) { // lineTo
                currentPath.push({ x: coords[coordIdx], y: coords[coordIdx+1] });
                coordIdx += 2;
            } else if (op === 3) { // curveTo
                currentPath.push({ x: coords[coordIdx+4], y: coords[coordIdx+5] });
                coordIdx += 6;
            } else if (op === 4) { // curveTo2
                currentPath.push({ x: coords[coordIdx+2], y: coords[coordIdx+3] });
                coordIdx += 4;
            } else if (op === 5) { // curveTo3
                currentPath.push({ x: coords[coordIdx+2], y: coords[coordIdx+3] });
                coordIdx += 4;
            } else if (op === 6) { // closePath
                 if (currentPath.length > 0) currentPath.push(currentPath[0]);
            }
        }
      } else if (fn === OPS.rectangle) {
        const x = args[0], y = args[1], w = args[2], h = args[3];
        currentPath = [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y }
        ];
        paths.push({ type: 'rect', points: currentPath, lineWidth: currentLineWidth, strokeColor, fillColor });
        currentPath = [];
      } else if (fn === OPS.stroke) {
        if (currentPath.length > 0) {
            paths.push({ type: 'path', points: currentPath, lineWidth: currentLineWidth, strokeColor });
            currentPath = [];
        }
      } else if (fn === OPS.fill) {
         if (currentPath.length > 0) {
            paths.push({ type: 'path', points: currentPath, lineWidth: currentLineWidth, fillColor });
            currentPath = [];
         }
      }
    }

    return paths;
  }
}

class PdfClassifier {
  /**
   * Classifies each page as 'chart', 'legend', 'cover', or 'info'
   * @param {PdfPageData[]} pages
   * @returns {{ chartPages: PdfPageData[], legendPages: PdfPageData[], otherPages: PdfPageData[] }}
   */
  static classifyPages(pages) {
    const chartPages = [];
    const legendPages = [];
    const otherPages = [];

    for (const page of pages) {
      // Heuristic 1: Chart pages have a dense set of vector lines (the grid)
      // and a high number of single-character text items
      let totalPaths = page.vectorPaths.length;
      let singleCharTextCount = 0;
      let dmcKeywordCount = 0;
      let legendKeywordCount = 0;

      for (const text of page.textItems) {
        if (text.str.trim().length === 1) {
          singleCharTextCount++;
        }
        const strLower = text.str.toLowerCase();
        if (strLower.includes('dmc')) dmcKeywordCount++;
        if (['symbol', 'color', 'colour', 'thread', 'stitches', 'strand'].includes(strLower)) {
          legendKeywordCount++;
        }
      }

      const isChart = totalPaths > 100 && singleCharTextCount > 100;
      const isLegend = (dmcKeywordCount > 0 || legendKeywordCount >= 2) && singleCharTextCount < totalPaths && !isChart;

      if (isChart) {
        chartPages.push(page);
      } else if (isLegend) {
        legendPages.push(page);
      } else {
        otherPages.push(page);
      }
    }

    return { chartPages, legendPages, otherPages };
  }
}

/**
 * @typedef {Object} GridDefinition
 * @property {number} originX
 * @property {number} originY
 * @property {number} cellWidth
 * @property {number} cellHeight
 * @property {number} columns
 * @property {number} rows
 * @property {number} [boldLineInterval]
 */

class PdfGridDetector {
  /**
   * Detects the underlying stitch grid from a page's vector paths.
   * @param {PdfPageData} page
   * @returns {GridDefinition|null}
   */
  static detectGrid(page) {
    const TOLERANCE = 1.0;
    const hLines = [];
    const vLines = [];

    // 1. Flatten all path segments into horizontal and vertical lines
    for (const path of page.vectorPaths) {
      if (path.points && path.points.length >= 2) {
        for (let i = 0; i < path.points.length - 1; i++) {
          const p1 = path.points[i];
          const p2 = path.points[i+1];
          if (Math.abs(p1.y - p2.y) < TOLERANCE && Math.abs(p1.x - p2.x) > 5) { // min length
            hLines.push({ y: p1.y, minX: Math.min(p1.x, p2.x), maxX: Math.max(p1.x, p2.x) });
          } else if (Math.abs(p1.x - p2.x) < TOLERANCE && Math.abs(p1.y - p2.y) > 5) {
            vLines.push({ x: p1.x, minY: Math.min(p1.y, p2.y), maxY: Math.max(p1.y, p2.y) });
          }
        }
      }
    }

    if (hLines.length < 10 || vLines.length < 10) return null;

    // 2. Cluster lines by position to find unique grid intervals
    const clusterValues = (lines, key) => {
      const sorted = [...lines].sort((a, b) => a[key] - b[key]);
      const clusters = [];
      let currentCluster = [sorted[0]];

      for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i][key] - currentCluster[currentCluster.length - 1][key]) <= TOLERANCE) {
          currentCluster.push(sorted[i]);
        } else {
          const avg = currentCluster.reduce((sum, item) => sum + item[key], 0) / currentCluster.length;
          clusters.push(avg);
          currentCluster = [sorted[i]];
        }
      }
      if (currentCluster.length > 0) {
        const avg = currentCluster.reduce((sum, item) => sum + item[key], 0) / currentCluster.length;
        clusters.push(avg);
      }
      return clusters;
    };

    const uniqueY = clusterValues(hLines, 'y');
    const uniqueX = clusterValues(vLines, 'x');

    if (uniqueY.length < 5 || uniqueX.length < 5) return null;

    // Find the median cell size
    const getMedianInterval = (arr) => {
        const intervals = [];
        for (let i = 0; i < arr.length - 1; i++) intervals.push(arr[i+1] - arr[i]);
        intervals.sort((a, b) => a - b);
        return intervals[Math.floor(intervals.length / 2)];
    };

    const cellWidth = getMedianInterval(uniqueX);
    const cellHeight = getMedianInterval(uniqueY);

    if (cellWidth < 2 || cellHeight < 2) return null; // Cells are too small

    // Verify evenly spaced lines (the grid boundary)
    // Find the largest contiguous block of evenly spaced lines
    const findContiguousGrid = (arr, interval) => {
        let maxCount = 0;
        let bestStart = 0;
        let bestEnd = 0;

        for (let i = 0; i < arr.length; i++) {
            let count = 1;
            let current = arr[i];
            for (let j = i + 1; j < arr.length; j++) {
                if (Math.abs((arr[j] - current) - interval) < TOLERANCE * 2) {
                    count++;
                    current = arr[j];
                } else if (arr[j] - current > interval + TOLERANCE * 2) {
                    break;
                }
            }
            if (count > maxCount) {
                maxCount = count;
                bestStart = arr[i];
                bestEnd = current;
            }
        }
        return { count: maxCount, start: bestStart, end: bestEnd };
    };

    const gridX = findContiguousGrid(uniqueX, cellWidth);
    const gridY = findContiguousGrid(uniqueY, cellHeight);

    // If we didn't find a substantial grid, fail
    if (gridX.count < 5 || gridY.count < 5) return null;

    return {
        originX: gridX.start,
        originY: gridY.start, // Note: PDF coordinates origin is bottom-left
        cellWidth,
        cellHeight,
        columns: gridX.count - 1,
        rows: gridY.count - 1,
        boldLineInterval: 10 // typical, though we could heuristically detect thicker lines
    };
  }
}

/**
 * @typedef {Object} CellData
 * @property {number} col
 * @property {number} row
 * @property {string} symbol
 * @property {string} fontName
 * @property {boolean} isEmpty
 * @property {string} [backgroundColor]
 */

class PdfSymbolExtractor {
  /**
   * Maps text items and background fills to grid cells.
   * @param {PdfPageData} page
   * @param {GridDefinition} grid
   * @returns {CellData[]}
   */
  static extractSymbols(page, grid) {
    const cells = [];
    const TOLERANCE = grid.cellWidth * 0.4; // Allow some slop in text positioning

    // Initialize empty grid
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.columns; c++) {
        cells.push({
          col: c,
          row: r,
          symbol: '',
          fontName: '',
          isEmpty: true
        });
      }
    }

    // Map background colors from rects
    // A rect that roughly matches a cell's bounds
    for (const path of page.vectorPaths) {
        if (path.type === 'rect' && path.fillColor) {
            const minX = Math.min(...path.points.map(p => p.x));
            const minY = Math.min(...path.points.map(p => p.y));
            const width = Math.max(...path.points.map(p => p.x)) - minX;
            const height = Math.max(...path.points.map(p => p.y)) - minY;

            if (Math.abs(width - grid.cellWidth) < 2 && Math.abs(height - grid.cellHeight) < 2) {
                // PDF coords: Y is from bottom
                const col = Math.round((minX - grid.originX) / grid.cellWidth);
                const row = Math.round((minY - grid.originY) / grid.cellHeight);
                // Note: PDF origin Y might be bottom or top depending on the transform.
                // Assuming standard PDF (origin bottom-left, y goes up). So row 0 is at grid.originY.
                // But in cross stitch, row 0 is top. We'll flip Y later or handle it here.

                // Let's store it using raw PDF row index for now
                if (col >= 0 && col < grid.columns && row >= 0 && row < grid.rows) {
                     const cellIdx = row * grid.columns + col;
                     if (cells[cellIdx]) cells[cellIdx].backgroundColor = path.fillColor;
                }
            }
        }
    }

    // Map text items to cells
    for (const text of page.textItems) {
      if (text.str.trim() === '') continue;

      // Find the cell this text belongs to
      // text.x and text.y usually represent the baseline of the text
      // Find the cell this text belongs to
      // text.x and text.y usually represent the baseline of the text.
      // Offset Y slightly upward to ensure we hit the center of the cell it visually belongs to.
      const textCenterY = text.y + (text.height * 0.3);

      const col = Math.floor((text.x + (text.width/2) - grid.originX) / grid.cellWidth);
      const row = Math.floor((textCenterY - grid.originY) / grid.cellHeight);

      let placed = false;
      if (col >= 0 && col < grid.columns && row >= 0 && row < grid.rows) {
          const cellIdx = row * grid.columns + col;
          if (cells[cellIdx] && cells[cellIdx].isEmpty) {
              cells[cellIdx].symbol = text.str;
              cells[cellIdx].fontName = text.fontName;
              cells[cellIdx].isEmpty = false;
              placed = true;
          }
      }

      if (!placed) {
          // Fallback: check distance to cell centers if the floor() fails due to baseline offsets
          let bestDist = Infinity;
          let bestCellIdx = -1;

          for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.columns; c++) {
              const cx = grid.originX + c * grid.cellWidth + grid.cellWidth / 2;
              const cy = grid.originY + r * grid.cellHeight + grid.cellHeight / 2;

              // Text x,y is bottom-left usually. Let's approximate center
              const tx = text.x + text.width / 2;
              const ty = text.y + text.height / 2;

              const dist = Math.sqrt(Math.pow(cx - tx, 2) + Math.pow(cy - ty, 2));
              if (dist < bestDist && dist < TOLERANCE) {
                  bestDist = dist;
                  bestCellIdx = r * grid.columns + c;
              }
            }
          }

          if (bestCellIdx !== -1 && cells[bestCellIdx].isEmpty) {
              cells[bestCellIdx].symbol = text.str;
              cells[bestCellIdx].fontName = text.fontName;
              cells[bestCellIdx].isEmpty = false;
          }
      }
    }

    // Flip Y to standard screen coordinates (row 0 = top)
    const finalCells = [];
    for (let r = 0; r < grid.rows; r++) {
        // PDF Y goes up, so highest PDF row is the top visually
        const pdfRow = grid.rows - 1 - r;
        for (let c = 0; c < grid.columns; c++) {
            const cell = cells[pdfRow * grid.columns + c];
            if (cell) {
               finalCells.push({
                   ...cell,
                   row: r // Update to screen row
               });
            }
        }
    }

    return finalCells;
  }
}

/**
 * @typedef {Object} ThreadEntry
 * @property {string} symbol
 * @property {string} threadCode
 * @property {string} colorName
 * @property {string} [hexColor]
 */

class PdfLegendParser {
  /**
   * Parses legend pages to extract thread codes and map them to symbols.
   * @param {PdfPageData[]} legendPages
   * @returns {ThreadEntry[]}
   */
  static parseLegend(legendPages) {
    const entries = [];
    const symbolToThread = new Map();

    for (const page of legendPages) {
      // Very naive tabular extraction: group text by Y coordinate (rows)
      const TOLERANCE = 3.0;
      const rows = [];

      const sortedText = [...page.textItems].sort((a, b) => b.y - a.y); // top to bottom

      let currentRow = [sortedText[0]];
      for (let i = 1; i < sortedText.length; i++) {
          if (Math.abs(sortedText[i].y - currentRow[0].y) <= TOLERANCE) {
              currentRow.push(sortedText[i]);
          } else {
              rows.push(currentRow);
              currentRow = [sortedText[i]];
          }
      }
      if (currentRow.length > 0) rows.push(currentRow);

      // Analyze rows to find thread entries
      for (const row of rows) {
          row.sort((a, b) => a.x - b.x); // left to right

          if (row.length < 2) continue;

          // Look for a symbol (usually length 1 or a specific font) and a number (DMC code)
          let symbol = null;
          let threadCode = null;
          let colorNameParts = [];

          for (const item of row) {
              const str = item.str.trim();
              if (str === '') continue;

              if (!symbol && str.length === 1) {
                  symbol = str;
              } else if (!threadCode && /^\d+$/.test(str)) {
                  threadCode = str;
              } else if (threadCode) {
                  // Text after the thread code is usually the color name
                  colorNameParts.push(str);
              }
          }

          if (symbol && threadCode) {
              // Deduplicate based on symbol (assuming one symbol per color)
              if (!symbolToThread.has(symbol)) {
                  const entry = {
                      symbol,
                      threadCode,
                      colorName: colorNameParts.join(' ')
                  };
                  entries.push(entry);
                  symbolToThread.set(symbol, entry);
              }
          }
      }
    }

    return entries;
  }
}

class PatternKeeperImporter {
  /**
   * Orchestrates the entire PDF import process.
   * @param {File|ArrayBuffer} file
   * @returns {Promise<Object>} The internal pattern result object
   */
  static async import(file) {
    const pages = await PdfLoader.load(file);
    const classified = PdfClassifier.classifyPages(pages);

    if (classified.chartPages.length === 0) {
      throw new Error("No chart grid could be detected in this PDF.");
    }

    // For this single-page/basic implementation, take the first chart page
    const chartPage = classified.chartPages[0];
    const grid = PdfGridDetector.detectGrid(chartPage);

    if (!grid) {
      throw new Error("Could not detect a uniform grid on the chart page.");
    }

    const cells = PdfSymbolExtractor.extractSymbols(chartPage, grid);
    const legendEntries = PdfLegendParser.parseLegend(classified.legendPages);

    // Map the extracted cells to the application's internal pattern format
    let stitchCount = 0;
    const pattern = new Array(grid.columns * grid.rows).fill(null);

    const symbolMap = new Map();
    for (const entry of legendEntries) {
        symbolMap.set(entry.symbol, entry);
    }

    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.columns; c++) {
        const idx = r * grid.columns + c;
        const cell = cells[idx];

        if (!cell || cell.isEmpty) {
          pattern[idx] = { type: "skip", id: "__skip__", rgb: [255, 255, 255], lab: [100, 0, 0] };
        } else {
          // Look up thread from legend
          let threadCode = null;
          let colorName = cell.symbol;

          const legendEntry = symbolMap.get(cell.symbol);
          if (legendEntry) {
              threadCode = legendEntry.threadCode;
              colorName = legendEntry.colorName;
          }

          // Resolve DMC color
          let dmcThread = null;
          if (threadCode && typeof DMC !== 'undefined') {
              dmcThread = DMC.find(d => String(d.id) === threadCode);
          }

          // Fallback solid color (e.g. black) if unmapped
          if (!dmcThread) {
              dmcThread = { id: threadCode || cell.symbol, name: colorName, rgb: [0, 0, 0], lab: [0, 0, 0] };
          }

          pattern[idx] = {
            type: "solid",
            id: dmcThread.id,
            name: dmcThread.name,
            rgb: dmcThread.rgb,
            lab: dmcThread.lab,
            dist: 0
          };
          stitchCount++;
        }
      }
    }

    if (stitchCount === 0) {
       throw new Error("No stitches found mapping symbols to cells. The PDF might not be Pattern Keeper compatible.");
    }

    return {
      width: grid.columns,
      height: grid.rows,
      pattern: pattern,
      bsLines: [],
      stitchCount: stitchCount,
      paletteSize: symbolMap.size || 1
    };
  }
}

function parseOXS(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid XML format");
  }

  const chart = doc.querySelector("chart") || doc.documentElement;
  if (!chart) throw new Error("Could not find chart element");

  // Extract dimensions
  let width = null;
  let height = null;

  const props = doc.querySelector("properties") || chart;
  width = props.getAttribute("chartwidth") || props.getAttribute("width") || chart.getAttribute("width") || chart.getAttribute("w");
  height = props.getAttribute("chartheight") || props.getAttribute("height") || chart.getAttribute("height") || chart.getAttribute("h");

  if (!width || !height) {
    const sizeEls = ['format', 'size', 'grid'];
    for (const sel of sizeEls) {
      const el = doc.querySelector(sel);
      if (el) {
        width = width || el.getAttribute("width") || el.getAttribute("w");
        height = height || el.getAttribute("height") || el.getAttribute("h");
      }
    }
  }

  width = parseInt(width);
  height = parseInt(height);

  if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
    throw new Error("Could not determine chart dimensions");
  }

  // Parse palette
  const paletteMap = {};
  const palContainer = chart.querySelector("palette") || chart.querySelector("Palette") || chart.querySelector("colors") || chart.querySelector("Colors");
  if (palContainer) {
    const colorSelectors = ['color', 'Color', 'thread', 'Thread', 'entry', 'Entry'];
    let colorEls = [];
    for (const sel of colorSelectors) {
      const els = palContainer.querySelectorAll(sel);
      if (els.length > 0) {
        colorEls = Array.from(els);
        break;
      }
    }

    colorEls.forEach((el, indexPos) => {
      let index = el.getAttribute("index") || el.getAttribute("idx") || el.getAttribute("id");
      if (index == null) index = indexPos;

      let dmcThread = null;
      let rgb = null;


      const threadChild = el.querySelector("thread");
      let dmcNumber = null;
      if (threadChild) {
        dmcNumber = threadChild.getAttribute("number") || threadChild.getAttribute("code") || threadChild.getAttribute("id");
      }
      if (!dmcNumber) {
        dmcNumber = el.getAttribute("number") || el.getAttribute("code") || el.getAttribute("thread") || el.getAttribute("dmcnumber");
      }

      let nameStr = el.getAttribute("name") || el.getAttribute("description") || "";
      nameStr = nameStr.trim();

      if (dmcNumber && typeof dmcNumber === "string") dmcNumber = dmcNumber.trim();

      // Normalize common names to numbers
      const nameLower = nameStr.toLowerCase();
      let matchNumber = dmcNumber || "";
      if (nameLower === "blanc" || nameLower === "white" || matchNumber.toLowerCase() === "blanc" || matchNumber.toLowerCase() === "white") matchNumber = "BLANC";
      else if (nameLower === "ecru" || matchNumber.toLowerCase() === "ecru") matchNumber = "ECRU";
      else if (nameLower === "black" && !matchNumber) matchNumber = "310";

      // Try matching by number
      if (matchNumber) {
        dmcThread = DMC.find(d => String(d.id).toLowerCase() === matchNumber.toLowerCase());
      }

      // Try matching by name
      if (!dmcThread && nameStr) {
        dmcThread = DMC.find(d => d.name.toLowerCase() === nameStr.toLowerCase());
      }

      // Try extraction RGB
      let r = el.getAttribute("red") || el.getAttribute("r");
      let g = el.getAttribute("green") || el.getAttribute("g");
      let b = el.getAttribute("blue") || el.getAttribute("b");

      if (r != null && g != null && b != null) {
        rgb = [parseInt(r), parseInt(g), parseInt(b)];
      } else {
        const hex = el.getAttribute("color") || el.getAttribute("hex") || el.getAttribute("rgb");
        if (hex) rgb = parseHexColor(hex);
      }

      if (!dmcThread && rgb && !isNaN(rgb[0]) && !isNaN(rgb[1]) && !isNaN(rgb[2])) {
        // Find nearest DMC
        const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
        let minDist = 1e9;
        for (let i = 0; i < DMC.length; i++) {
          const dist = dE(lab, DMC[i].lab);
          if (dist < minDist) {
            minDist = dist;
            dmcThread = DMC[i];
          }
        }
      }

      if (dmcThread) {
        paletteMap[index] = {
          dmcThread: dmcThread,
          rgb: dmcThread.rgb,
          originalId: matchNumber
        };
      } else if (rgb) {
         // Fallback to nearest DMC again just in case
         if (!isNaN(rgb[0]) && !isNaN(rgb[1]) && !isNaN(rgb[2])) {
            const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
            let minDist = 1e9;
            for (let i = 0; i < DMC.length; i++) {
              const dist = dE(lab, DMC[i].lab);
              if (dist < minDist) {
                minDist = dist;
                dmcThread = DMC[i];
              }
            }
            if (dmcThread) {
                paletteMap[index] = {
                  dmcThread: dmcThread,
                  rgb: rgb,
                  originalId: matchNumber
                };
            }
         }
      }
    });
  }

  // Parse stitches
  const pattern = new Array(width * height).fill(null).map(() => ({
    type: "skip", id: "__skip__", rgb: [255, 255, 255], lab: [100, 0, 0]
  }));
  let stitchCount = 0;

  const stitchContainer = chart.querySelector("fullstitches") || chart.querySelector("Fullstitches") ||
                          chart.querySelector("FullStitches") || chart.querySelector("stitches") ||
                          chart.querySelector("Stitches") || chart.querySelector("crosses") ||
                          chart.querySelector("Crosses") || chart.querySelector("grid") || chart.querySelector("Grid") || chart;

  const stitchEls = stitchContainer.querySelectorAll("stitch, Stitch, cross, Cross, cell, Cell, point, Point");
  stitchEls.forEach(el => {
    let x = parseInt(el.getAttribute("x") || el.getAttribute("col") || el.getAttribute("column"));
    let y = parseInt(el.getAttribute("y") || el.getAttribute("row"));
    let palIdx = el.getAttribute("palindex") || el.getAttribute("palette") || el.getAttribute("color") ||
                 el.getAttribute("colorindex") || el.getAttribute("col_index") || el.getAttribute("index") || el.textContent.trim();

    if (isNaN(x) || isNaN(y) || x < 0 || x >= width || y < 0 || y >= height) return;

    const palEntry = paletteMap[palIdx];
    if (palEntry && palEntry.dmcThread) {
      const t = palEntry.dmcThread;
      pattern[y * width + x] = {
        type: "solid",
        id: t.id,
        name: t.name,
        rgb: t.rgb,
        lab: t.lab,
        dist: 0
      };
      stitchCount++;
    }
  });

  if (stitchCount === 0) {
    throw new Error("No valid stitches found in pattern");
  }

  // Parse backstitch lines
  const bsLines = [];
  const bsContainer = chart.querySelector("backstitches") || chart.querySelector("Backstitches") ||
                      chart.querySelector("BackStitches") || chart.querySelector("lines") || chart.querySelector("Lines");
  if (bsContainer) {
    const lineEls = bsContainer.querySelectorAll("backstitch, Backstitch, line, Line");
    lineEls.forEach(el => {
      let x1 = parseFloat(el.getAttribute("x1") || el.getAttribute("startx"));
      let y1 = parseFloat(el.getAttribute("y1") || el.getAttribute("starty"));
      let x2 = parseFloat(el.getAttribute("x2") || el.getAttribute("endx"));
      let y2 = parseFloat(el.getAttribute("y2") || el.getAttribute("endy"));
      if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
        bsLines.push({x1, y1, x2, y2});
      }
    });
  }

  return {
    width,
    height,
    pattern,
    bsLines,
    stitchCount,
    paletteSize: Object.keys(paletteMap).length
  };
}

function parseImagePattern(img, options = {}) {
  const maxWidth = options.maxWidth || 200;
  const maxHeight = options.maxHeight || 200;
  const maxColours = options.maxColours || 30;
  const skipWhiteBg = options.skipWhiteBg || false;
  const bgThreshold = options.bgThreshold || 15;

  let targetWidth = img.width;
  let targetHeight = img.height;

  if (targetWidth > maxWidth || targetHeight > maxHeight) {
    const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
    targetWidth = Math.max(10, Math.floor(targetWidth * ratio));
    targetHeight = Math.max(10, Math.floor(targetHeight * ratio));
  } else {
    targetWidth = Math.max(10, targetWidth);
    targetHeight = Math.max(10, targetHeight);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.imageSmoothingEnabled = (img.width > targetWidth * 2);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imgData.data;

  const pal = quantize(data, targetWidth, targetHeight, maxColours);
  const mapped = doMap(data, targetWidth, targetHeight, pal);

  let stitchCount = 0;
  const pattern = new Array(targetWidth * targetHeight);

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const idx = y * targetWidth + x;
      const dataIdx = idx * 4;

      const a = data[dataIdx + 3];
      const r = data[dataIdx];
      const g = data[dataIdx + 1];
      const b = data[dataIdx + 2];

      let isSkip = false;

      if (a < 30) {
        isSkip = true;
      } else if (skipWhiteBg) {
        const lab = rgbToLab(r, g, b);
        const whiteLab = [100, 0, 0]; // LAB for pure white
        const dist = dE(lab, whiteLab);
        if (dist <= bgThreshold) {
          isSkip = true;
        }
      }

      if (isSkip) {
        pattern[idx] = { type: "skip", id: "__skip__", rgb: [255, 255, 255], lab: [100, 0, 0] };
      } else {
        const m = mapped[idx];
        pattern[idx] = {
          type: "solid",
          id: m.id,
          name: m.name,
          rgb: m.rgb,
          lab: m.lab,
          dist: m.dist || 0
        };
        stitchCount++;
      }
    }
  }

  if (stitchCount === 0) {
    throw new Error("No stitches produced from image. Adjust background settings or try another image.");
  }

  return {
    width: targetWidth,
    height: targetHeight,
    pattern: pattern,
    bsLines: [],
    stitchCount: stitchCount,
    paletteSize: pal.length
  };
}
