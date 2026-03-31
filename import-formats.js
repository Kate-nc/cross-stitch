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
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') ||
      name.endsWith('.gif') || name.endsWith('.bmp') || name.endsWith('.webp')) return "image";
  if (name.endsWith('.pdf')) return "pdf";

  const mime = file.type.toLowerCase();
  if (mime === 'application/json') return "json";
  if (mime.includes('xml')) return "oxs";
  if (mime.startsWith('image/')) return "image";
  if (mime === 'application/pdf') return "pdf";

  return "unknown";
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
