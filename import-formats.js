// PERF (perf-2 #3): lazy O(1) DMC lookup maps shared by all parsers in this
// file, replacing repeated O(n) DMC.find() scans during import.
var _IMPORT_DMC_BY_ID = null, _IMPORT_DMC_BY_NAME = null;
function _importDmcById(id) {
  if (!_IMPORT_DMC_BY_ID) {
    _IMPORT_DMC_BY_ID = Object.create(null);
    if (typeof DMC !== 'undefined') {
      for (var i = 0; i < DMC.length; i++) _IMPORT_DMC_BY_ID[String(DMC[i].id).toLowerCase()] = DMC[i];
    }
  }
  return id == null ? null : (_IMPORT_DMC_BY_ID[String(id).toLowerCase()] || null);
}
function _importDmcByName(name) {
  if (!_IMPORT_DMC_BY_NAME) {
    _IMPORT_DMC_BY_NAME = Object.create(null);
    if (typeof DMC !== 'undefined') {
      for (var j = 0; j < DMC.length; j++) _IMPORT_DMC_BY_NAME[String(DMC[j].name).toLowerCase()] = DMC[j];
    }
  }
  return name == null ? null : (_IMPORT_DMC_BY_NAME[String(name).toLowerCase()] || null);
}

function parseHexColor(hex) {
  if (!hex || typeof hex !== 'string') return null;
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return [r, g, b];
    }
  }
  return null;
}

function importResultToProject(result, fabricCt = 14, name = "") {
  return {
    v: 8,
    w: result.width,
    h: result.height,
    name: name || "",
    settings: { sW: result.width, sH: result.height, fabricCt: fabricCt },
    pattern: result.pattern.map(m => {
      if (m.id === "__skip__") return { id: "__skip__" };
      return Object.assign({}, m, { type: m.type || "solid" });
    }),
    bsLines: result.bsLines || [],
    partialStitches: result.partialStitches || [],
    specialtyVersion:1, specialtyStitches:result.specialtyStitches||[],
    // French knots (knots.js), when the chart has any.
    knots: result.knots && result.knots.length ? result.knots : undefined,
    // Beads from an OXS chart: kept, drawn, not tracked.
    beads: result.beads && result.beads.length ? result.beads : undefined,
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

function _oxsExtractDimension(doc, chart, sizeEls, attrPair) {
  const props = doc.querySelector("properties") || chart;
  let value = null;
  for (const a of attrPair.props) {
    value = value || props.getAttribute(a);
  }
  for (const a of attrPair.chart) {
    value = value || chart.getAttribute(a);
  }
  if (!value) {
    for (const sel of sizeEls) {
      const el = doc.querySelector(sel);
      if (!el) continue;
      for (const a of attrPair.fallback) {
        value = value || el.getAttribute(a);
      }
      if (value) break;
    }
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  if (parsed > 5000) return { tooLarge: true, value: parsed };
  return { value: parsed };
}

// A thread reference from an OXS palette entry: "DMC 310", "Anchor 403",
// "Madeira 2400", or a bare "310" (brand null, read as DMC). Returns
// { brand, id } or null when the text isn't a reference at all.
function _oxsParseThreadRef(text) {
  if (text == null) return null;
  var t = String(text).trim();
  if (!t) return null;
  if (/^(\d[\w-]*|blanc|ecru|white)$/i.test(t)) return { brand: null, id: t };
  var m = t.match(/^([A-Za-z][A-Za-z&.' ]*?)\s*[:#-]?\s*(\d[\w-]*|blanc|ecru|white)$/i);
  if (!m) return null;
  return { brand: m[1].trim().toLowerCase(), id: m[2] };
}

// Brand named at the start of a palette entry's name ("Anchor dark grey"),
// for files that put the brand there rather than in the number.
function _oxsBrandFromName(name) {
  var m = String(name || '').trim().match(/^(dmc|anchor|madeira|cosmo|sullivans|presencia|olympus|finca)\b/i);
  return m ? m[1].toLowerCase() : null;
}

function _oxsBrandLabel(brand) {
  if (!brand) return 'DMC';
  if (brand === 'dmc') return 'DMC';
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function parseOXS(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid OXS file: malformed XML");
  }

  const chart = doc.querySelector("chart") || doc.documentElement;
  if (!chart) throw new Error("Could not find chart element");

  const sizeEls = ['format', 'size', 'grid'];
  const wResult = _oxsExtractDimension(doc, chart, sizeEls, {
    props: ["chartwidth", "width"], chart: ["width", "w"], fallback: ["width", "w"]
  });
  const hResult = _oxsExtractDimension(doc, chart, sizeEls, {
    props: ["chartheight", "height"], chart: ["height", "h"], fallback: ["height", "h"]
  });

  if (!wResult || !hResult) {
    throw new Error("Could not determine chart dimensions");
  }
  if (wResult.tooLarge || hResult.tooLarge) {
    throw new Error("Chart dimensions too large (max 5000×5000): " + (wResult.value || '?') + "×" + (hResult.value || '?'));
  }
  let width = wResult.value;
  let height = hResult.value;

  // Count every rejected or changed object by type and reason.
  const losses = Object.create(null);
  function loss(type, reason) {
    const key = type + ': ' + reason;
    losses[key] = (losses[key] || 0) + 1;
  }
  function attr(el, names) {
    for (const n of names) {
      const v = el.getAttribute(n);
      if (v != null && v.trim() !== '') return v.trim();
    }
    return null;
  }
  function num(el, names) {
    const v = attr(el, names);
    return v == null ? NaN : Number(v);
  }
  // Parse palette
  const paletteMap = Object.create(null);
  // What the file calls each palette entry (label and colour), before it is matched to a DMC thread: a bead is not a
  // thread, so a bead's own name and colour are what the project keeps.
  const rawPalette = Object.create(null);
  const palContainer = chart.querySelector("palette") || chart.querySelector("Palette") || chart.querySelector("colors") || chart.querySelector("Colors");
  if (palContainer) {
    const colorSelectors = ['palette_item', 'color', 'Color', 'thread', 'Thread', 'entry', 'Entry'];
    let colorEls = [];
    for (const sel of colorSelectors) {
      const els = Array.from(palContainer.children).filter(el => el.tagName === sel);
      if (els.length > 0) {
        colorEls = Array.from(els);
        break;
      }
    }

    colorEls.forEach((el, indexPos) => {
      let index = el.getAttribute("index") || el.getAttribute("idx") || el.getAttribute("id");
      if (index == null) index = indexPos;
      if (!/^\d+$/.test(String(index).trim())) throw new Error('Invalid OXS palette index: ' + index);
      index = String(Number(index));
      if (Object.prototype.hasOwnProperty.call(rawPalette, index)) {
        throw new Error('Invalid OXS palette: duplicate index ' + index);
      }
      // Keep legacy colour index 0 valid; only an explicitly labelled cloth is empty.
      if (/^cloth$/i.test(el.getAttribute('number') || el.getAttribute('name') || '')) {
        rawPalette[index] = { cloth: true };
        return;
      }
      const blends = Array.from(el.children).filter(c => c.tagName === 'blend');
      if (blends.length) {
        const refs = blends.map(c => _oxsParseThreadRef(c.getAttribute('number')));
        const strands = blends.map(c => c.getAttribute('strands') || '1');
        const blendBrand = refs[0] && (refs[0].brand || 'dmc');
        const threads = refs.map(r => r && (r.brand || 'dmc') === blendBrand &&
          (blendBrand === 'dmc' ? _importDmcById(r.id) : blendBrand === 'anchor' && typeof findThreadInCatalog === 'function' ? findThreadInCatalog(blendBrand, r.id) : null));
        if (threads.length === 2 && threads.every(Boolean) && strands[0] === strands[1] &&
            strands.every(n => Number.isInteger(Number(n)) && Number(n) > 0)) {
          const rgb = threads[0].rgb.map((v, i) => Math.round((v + threads[1].rgb[i]) / 2));
          const t = { type: 'blend', id: threads.map(t => t.id).join('+'), rgb: rgb,
            name: el.getAttribute('name') || threads.map(t => t.id).join('+'), threads: threads };
          if (blendBrand !== 'dmc') t.brand = blendBrand;
          paletteMap[index] = { dmcThread: t, rgb: rgb, matchedBy: 'id' };
          rawPalette[index] = { label: t.name, rgb: rgb };
        } else {
          rawPalette[index] = { unsupported: 'blend (requires two known threads of the same brand with equal strands)' };
        }
        return;
      }
      if (el.getAttribute('blendcolor') && el.getAttribute('blendcolor') !== 'nil') {
        rawPalette[index] = { unsupported: 'blendcolor without component thread references' };
        return;
      }

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

      // Brand-aware matching (audit B-09). Only a DMC (or brandless) number is
      // looked up as a DMC id: "Anchor 400" must never match DMC 400.
      const ref = _oxsParseThreadRef(dmcNumber) || (!dmcNumber ? _oxsParseThreadRef(nameStr) : null);
      let brand = ref ? ref.brand : null;
      if (!brand) brand = _oxsBrandFromName(nameStr);
      const isDmc = !brand || brand === 'dmc';
      if (ref && isDmc) {
        matchNumber = ref.id;
        const refLower = ref.id.toLowerCase();
        if (refLower === 'white' || refLower === 'blanc') matchNumber = 'BLANC';
        else if (refLower === 'ecru') matchNumber = 'ECRU';
      }
      const sourceLabel = ref ? (_oxsBrandLabel(brand) + ' ' + ref.id) : (nameStr || dmcNumber || ('palette colour ' + index));
      let matchedBy = null;

      if (isDmc) {
        // Try matching by number
        if (matchNumber) {
          dmcThread = _importDmcById(matchNumber); // PERF (perf-2 #3): O(1) map lookup
          if (dmcThread) matchedBy = 'id';
        }

        // Try matching by name
        if (!dmcThread && nameStr) {
          dmcThread = _importDmcByName(nameStr); // PERF (perf-2 #3): O(1) map lookup
          if (dmcThread) matchedBy = 'name';
        }
      } else if (brand === 'anchor' && ref && typeof getOfficialMatch === 'function') {
        const conv = getOfficialMatch('anchor', ref.id, 'dmc');
        if (conv && conv.id) {
          dmcThread = _importDmcById(conv.id);
          if (dmcThread) matchedBy = 'conversion';
        }
      }

      // Try extraction RGB
      let r = attr(el, ["red", "r"]);
      let g = attr(el, ["green", "g"]);
      let b = attr(el, ["blue", "b"]);

      if (r != null && g != null && b != null) {
        rgb = [Number(r), Number(g), Number(b)];
        if (!rgb.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) rgb = null;
      } else {
        const hex = el.getAttribute("color") || el.getAttribute("hex") || el.getAttribute("rgb");
        if (hex) rgb = parseHexColor(hex);
      }

      rawPalette[index] = { label: nameStr || sourceLabel, rgb: (rgb && !isNaN(rgb[0]) && !isNaN(rgb[1]) && !isNaN(rgb[2])) ? rgb : null };

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
        if (dmcThread) matchedBy = 'colour';
      }

      if (dmcThread) {
        paletteMap[index] = {
          dmcThread: dmcThread,
          rgb: dmcThread.rgb,
          originalId: matchNumber,
          sourceLabel: sourceLabel,
          matchedBy: matchedBy
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
                  originalId: matchNumber,
                  sourceLabel: sourceLabel,
                  matchedBy: 'colour'
                };
            }
         }
      }
    });
  }

  // Dedupe palette entries by DMC id (first-wins). Multiple palette indexes
  // pointing at the same DMC colour can otherwise inflate the reported
  // palette size and hide legitimate colour collisions.
  const _seenPaletteId = Object.create(null);
  const _paletteIndexRedirect = Object.create(null);
  // Every entry that didn't match a DMC id exactly, reported once the
  // stitches show which ones the chart actually uses.
  const _substitutions = Object.create(null);
  for (const _idx in paletteMap) {
    const _e = paletteMap[_idx];
    if (_e.matchedBy && _e.matchedBy !== 'id') _substitutions[_idx] = _e;
  }
  for (const _idx in paletteMap) {
    const _id = (paletteMap[_idx].dmcThread.brand || 'dmc') + ':' + paletteMap[_idx].dmcThread.id;
    if (_seenPaletteId[_id] == null) {
      _seenPaletteId[_id] = _idx;
    } else {
      _paletteIndexRedirect[_idx] = _seenPaletteId[_id];
      delete paletteMap[_idx];
    }
  }

  // Parse stitches
  const pattern = new Array(width * height).fill(null).map(() => ({
    type: "skip", id: "__skip__", rgb: [255, 255, 255], lab: [100, 0, 0]
  }));
  let stitchCount = 0;
  const _usedSubstitutions = {};
  function threadAt(index, type) {
    if (index != null && /^\d+$/.test(String(index))) index = String(Number(index));
    if (rawPalette[index] && rawPalette[index].cloth) return null;
    if (_substitutions[index]) {
      _usedSubstitutions[index] = true;
      loss(type, 'thread reference ' + _substitutions[index].sourceLabel + ' matched to DMC ' + _substitutions[index].dmcThread.id);
    }
    const target = _paletteIndexRedirect[index] != null ? _paletteIndexRedirect[index] : index;
    const entry = paletteMap[target];
    if (!entry) {
      loss(type, rawPalette[index] && rawPalette[index].unsupported || 'missing or unresolved palette reference ' + String(index));
      return null;
    }
    return Object.assign({ type: 'solid' }, entry.dmcThread);
  }
  function validCell(x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
  }
  const specialtyStitches=[];
  const partialMap = new Map();
  function addPartial(x, y, quarters, type) {
    if (!validCell(x, y)) { loss(type, 'invalid or out-of-bounds coordinates'); return; }
    const idx = y * width + x, old = partialMap.get(idx) || {};
    if (Object.keys(quarters).some(q => old[q] && old[q].id !== quarters[q].id)) {
      loss(type, 'overlapping fractional threads cannot share a quadrant'); return;
    }
    if (Object.keys(quarters).some(q => old[q])) loss(type, 'overlapping duplicate quadrants merged');
    partialMap.set(idx, Object.assign({}, old, quarters));
  }


  const stitchContainer = chart.querySelector("fullstitches") || chart.querySelector("Fullstitches") ||
                          chart.querySelector("FullStitches") || chart.querySelector("stitches") ||
                          chart.querySelector("Stitches") || chart.querySelector("crosses") ||
                          chart.querySelector("Crosses") || chart.querySelector("grid") || chart.querySelector("Grid") || chart;

  const stitchEls = stitchContainer.querySelectorAll("stitch, Stitch, cross, Cross, cell, Cell, point, Point");
  stitchEls.forEach(el => {
    let x = num(el, ["x", "col", "column"]);
    let y = num(el, ["y", "row"]);
    let palIdx = el.getAttribute("palindex") || el.getAttribute("palette") || el.getAttribute("color") ||
                 el.getAttribute("colorindex") || el.getAttribute("col_index") || el.getAttribute("index") || el.textContent.trim();

    if (!validCell(x, y)) { loss('full stitch', 'invalid or out-of-bounds coordinates'); return; }
    const t = threadAt(palIdx, 'full stitch');
    if (t) {
      if (pattern[y * width + x].id !== '__skip__') loss('full stitch', 'duplicate cell replaced');
      else stitchCount++;
      pattern[y * width + x] = t;
    }
  });

  // Ursa partstitches: 3=/, 4=\\; 1/2 are three-quarter stitches.
  chart.querySelectorAll('partstitches > partstitch').forEach(el => {
    const x = num(el, ['x']), y = num(el, ['y']), d = num(el, ['direction']);
    const major = num(el, ['major']);
    const a = attr(el, ['palindex1']), b = attr(el, ['palindex2']);
    const t1 = a != null && (a !== '0' || rawPalette[0]) ? threadAt(a, 'partstitch') : null;
    const t2 = b != null && (b !== '0' || rawPalette[0]) && d < 3 ? threadAt(b, 'partstitch') : null;
    let qs = {};
    if (d === 3 || d === 4) {
      if (a == null) loss('partstitch', 'missing primary thread reference');
      if (t1) (d === 3 ? ['BL','TR'] : ['TL','BR']).forEach(q => { qs[q] = t1; });
    } else if (d === 1 || d === 2) {
      if (a == null && b == null) loss('partstitch', 'missing thread references');
      if (t1 && t2 && major !== 1 && major !== 2) {
        loss('partstitch', 'two overlapping three-quarter colours require an explicit major side'); return;
      }
      const left = d === 1 ? 'BL' : 'TL', right = d === 1 ? 'TR' : 'BR';
      if (t1) (t2 && major === 2 ? [left] : ['TL','TR','BL','BR'].filter(q => q !== right)).forEach(q => { qs[q] = t1; });
      if (t2) (t1 && major === 1 ? [right] : ['TL','TR','BL','BR'].filter(q => q !== left)).forEach(q => { qs[q] = t2; });
    } else { loss('partstitch', 'unsupported direction ' + d); return; }
    if (Object.keys(qs).length) addPartial(x, y, qs, 'partstitch');
  });

  // Parse backstitch lines
  const bsLines = [];
  const bsContainer = chart.querySelector("backstitches") || chart.querySelector("Backstitches") ||
                      chart.querySelector("BackStitches") || chart.querySelector("lines") || chart.querySelector("Lines");
  if (bsContainer) {
    const lineEls = bsContainer.querySelectorAll("backstitch, Backstitch, line, Line");
    lineEls.forEach(el => {
      let x1 = num(el, ["x1", "startx"]);
      let y1 = num(el, ["y1", "starty"]);
      let x2 = num(el, ["x2", "endx"]);
      let y2 = num(el, ["y2", "endy"]);
      const kind = attr(el, ['objecttype', 'type']) || 'backstitch';
      if (kind !== 'backstitch' && kind !== 'straightstitch' && kind !== 'longstitch') { loss(kind, 'unsupported line type'); return; }
      if (![x1,y1,x2,y2].every(Number.isFinite)) { loss('backstitch', 'invalid coordinates'); return; }
      // Reject zero-length lines (x1===x2 && y1===y2) and any line whose
      // endpoints fall outside the chart grid.
      if (x1 === x2 && y1 === y2) { loss('backstitch', 'zero-length line'); return; }
      if (x1 < 0 || x2 < 0 || y1 < 0 || y2 < 0) { loss('backstitch', 'out-of-bounds coordinates'); return; }
      if (x1 > width || x2 > width || y1 > height || y2 > height) { loss('backstitch', 'out-of-bounds coordinates'); return; }
      const t = threadAt(attr(el, ['palindex', 'palette', 'color', 'index']), 'backstitch');
      if (t) {
        if(kind==='straightstitch'||kind==='longstitch'){
          if(![x1,y1,x2,y2].every(v=>Number.isInteger(v*2))){loss('long stitch','coordinates must use half-cell units');return;}
          specialtyStitches.push({uid:'oxs-long-'+specialtyStitches.length,type:'long_stitch',thread:t,x1,y1,x2,y2});return;
        }
        const line = {x1, y1, x2, y2, colorId: t.id, rgb: t.rgb,
          color: '#' + t.rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()};
        if (t.brand) line.brand = t.brand;
        bsLines.push(line);
      }
    });
  }

  // French knots. KG-Chart and other OXS writers keep knots and beads as
  // ornaments: <ornaments_inc_knots_and_beads><object x1 y1 palindex
  // objecttype="knot"/>, with x1, y1 in stitches. A knot goes to the nearest
  // grid corner or stitch centre, in half-stitch units (knots.js). Beads are
  // kept the same way, as untracked ornaments (they are not threads and are not
  // counted in the progress); other ornaments have nowhere to go and are reported.
  const knots = [];
  const _knotAt = Object.create(null);
  const beads = [];
  const _beadAt = Object.create(null);
  let otherOrnaments = 0;
  const ornContainer = chart.querySelector("ornaments_inc_knots_and_beads") || chart.querySelector("ornaments") ||
                       chart.querySelector("Ornaments");
  if (ornContainer) {
    ornContainer.querySelectorAll("object, Object, ornament, Ornament").forEach(el => {
      const kind = (el.getAttribute("objecttype") || el.getAttribute("type") || "").toLowerCase();
      if(kind==='petite'||(kind==='quarter'&&el.getAttribute('petit')!=='false')){
        const x=num(el,['x1','x']),y=num(el,['y1','y']);
        if(!Number.isInteger(x*2)||!Number.isInteger(y*2)||x<0||y<0||x+0.5>width||y+0.5>height){loss('petite','invalid or out-of-bounds half-cell coordinates');return;}
        const t=threadAt(attr(el,['palindex','color','index']),'petite');
        if(t)specialtyStitches.push({uid:'oxs-petite-'+specialtyStitches.length,type:'petite',thread:t,x,y});
        return;
      }
      if (kind === 'tent' || (kind === 'quarter' && el.getAttribute('petit') === 'false')) {
        const fx = num(el, ['x1','x']), fy = num(el, ['y1','y']);
        const t = threadAt(attr(el, ['palindex','color','index']), kind);
        if (!t) return;
        let qs = {};
        if (kind === 'tent') {
          const d = num(el, ['direction']);
          if (d !== 1 && d !== 2) { loss(kind, 'unsupported direction ' + d); return; }
          (d === 1 ? ['TL','BR'] : ['BL','TR']).forEach(q => { qs[q] = t; });
          addPartial(fx, fy, qs, kind);
        } else {
          if (!Number.isInteger(fx * 2) || !Number.isInteger(fy * 2)) { loss(kind, 'coordinates must use half-cell units'); return; }
          const q = (fy % 1 ? 'B' : 'T') + (fx % 1 ? 'R' : 'L');
          qs[q] = t;
          addPartial(Math.floor(fx), Math.floor(fy), qs, kind);
        }
        return;
      }
      if (/^bead(?:[0-9.]+mm)?$/.test(kind)) {
        const bx = num(el, ["x1", "x"]);
        const by = num(el, ["y1", "y"]);
        if (!Number.isFinite(bx) || !Number.isFinite(by) || bx < 0 || by < 0 || bx > width || by > height) { otherOrnaments++; loss('bead', 'invalid or out-of-bounds coordinates'); return; }
        const bIdx = el.getAttribute("palindex") || el.getAttribute("color") || el.getAttribute("index");
        const raw = rawPalette[bIdx];
        if (!raw || raw.cloth) { loss('bead', 'missing palette reference ' + bIdx); return; }
        const bcx = Math.round(bx), bcy = Math.round(by);
        const bmx = Math.min(width - 1, Math.floor(bx)), bmy = Math.min(height - 1, Math.floor(by));
        const bCentre = Math.pow(bx - bmx - 0.5, 2) + Math.pow(by - bmy - 0.5, 2) < Math.pow(bx - bcx, 2) + Math.pow(by - bcy, 2);
        const px = bCentre ? 2 * bmx + 1 : 2 * bcx, py = bCentre ? 2 * bmy + 1 : 2 * bcy;
        const bKey = px + "," + py + "," + (raw.label || "") + "," + String(raw.rgb);
        if (_beadAt[bKey]) { loss('bead', 'duplicate object not imported'); return; }
        if (px / 2 !== bx || py / 2 !== by) loss('bead', 'position snapped to nearest corner or centre');
        _beadAt[bKey] = true;
        if (!raw.rgb) loss('bead', 'palette colour unavailable');
        if (kind !== 'bead') loss(kind, 'bead size is not represented in the project model');
        const bead = { x: px, y: py };
        if (raw.label) bead.label = String(raw.label);
        if (raw.rgb) bead.rgb = raw.rgb;
        beads.push(bead);
        return;
      }
      if (kind !== "knot") { otherOrnaments++; loss(kind || 'unknown ornament', 'unsupported ornament type'); return; }
      const fx = num(el, ["x1", "x"]);
      const fy = num(el, ["y1", "y"]);
      if (!Number.isFinite(fx) || !Number.isFinite(fy) || fx < 0 || fy < 0 || fx > width || fy > height) {
        loss('French knot', 'invalid or out-of-bounds coordinates'); return;
      }
      const t = threadAt(attr(el, ['palindex','color','index']), 'French knot');
      if (!t) return;
      const cx = Math.round(fx), cy = Math.round(fy);
      const mx = Math.min(width - 1, Math.floor(fx)), my = Math.min(height - 1, Math.floor(fy));
      const centre = Math.pow(fx - mx - 0.5, 2) + Math.pow(fy - my - 0.5, 2) < Math.pow(fx - cx, 2) + Math.pow(fy - cy, 2);
      const kx = centre ? 2 * mx + 1 : 2 * cx, ky = centre ? 2 * my + 1 : 2 * cy;
      const key = kx + "," + ky;
      if (_knotAt[key]) { loss('French knot', 'duplicate position not imported'); return; }
      _knotAt[key] = true;
      if (kx / 2 !== fx || ky / 2 !== fy) loss('French knot', 'position snapped to nearest corner or centre');
      const knot = { x: kx, y: ky, id: t.id, rgb: t.rgb };
      if (t.brand) knot.brand = t.brand;
      knots.push(knot);
    });
  }

  const partialStitches = Array.from(partialMap.entries());
  if (!stitchCount && !bsLines.length && !partialStitches.length && !knots.length && !beads.length && !specialtyStitches.length) {
    throw new Error('No valid stitches found in pattern' + (Object.keys(losses).length ? ': ' + Object.keys(losses).map(k => losses[k] + ' ' + k).join('; ') : ''));
  }
  // Inventory only: flag sections/objects the existing parser does not read.
  const knownSections = new Set(['properties','palette','fullstitches','stitches','crosses','grid','partstitches','backstitches','lines','ornaments_inc_knots_and_beads','ornaments','title','name','author','copyright','instructions','format','size']);
  Array.from(chart.children).forEach(el => {
    if (!knownSections.has(el.tagName.toLowerCase())) loss(el.tagName, 'unverified source section');
  });
  for (const container of [stitchContainer, bsContainer, ornContainer, chart.querySelector('partstitches')]) {
    if (!container || container === chart) continue;
    const knownObjects = /^(stitch|cross|cell|point|backstitch|line|object|ornament|partstitch)$/i;
    Array.from(container.children).forEach(el => {
      if (!knownObjects.test(el.tagName)) loss(el.tagName, 'unsupported stitch object');
    });
  }
  const warnings = Object.keys(losses).map(k => losses[k] + ' ' + k + '.');
  if (otherOrnaments > 0) {
    warnings.push(otherOrnaments + (otherOrnaments === 1 ? " ornament was" : " ornaments were") +
      " not imported; see type-specific warnings.");
  }
  if (beads.length > 0) {
    warnings.push(beads.length + (beads.length === 1 ? " bead was" : " beads were") +
      " kept with the chart. Track beads separately from stitches in the Tracker Beads list.");
  }
  for (const _idx in _usedSubstitutions) {
    const _e = _substitutions[_idx];
    const how = _e.matchedBy === 'conversion' ? 'official conversion'
      : _e.matchedBy === 'name' ? 'matched by name' : 'closest equivalent';
    warnings.push(_e.sourceLabel + ' was matched to DMC ' + _e.dmcThread.id + ' (' + how + ').');
  }

  return {
    width,
    height,
    pattern,
    bsLines,
    partialStitches,
    specialtyStitches,
    knots,
    beads,
    stitchCount,
    fidelity: { sourceFullCells: stitchEls.length, fullCells: stitchCount, losses: Object.keys(losses) },
    paletteSize: Object.keys(paletteMap).length,
    warnings
  };
}

// OXS interchange: Ursa palette blends/partstitches and XSPro diagonal
// quarters (petit=false). See https://www.ursasoftware.com/OXSFormat/ and
// https://ursasoftware.com/xspro.pdf. Unsupported content is counted explicitly.
function generateOXS(project) {
  project = project || {};
  if(typeof ProgressUnits!=='undefined')project=ProgressUnits.specialty.migrate(project);
  const w = project.w || project.width || (project.settings && project.settings.sW);
  const h = project.h || project.height || (project.settings && project.settings.sH);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0 || w > 5000 || h > 5000) {
    throw new Error('OXS: invalid chart dimensions (expected integers from 1 to 5000)');
  }
  const pattern = Array.isArray(project.pattern) ? project.pattern : [];
  const warnings = [], losses = Object.create(null);
  if (Array.isArray(project.beads) && project.beads.length) warnings.push('OXS preserves bead appearance and position, but omits bead completion and object IDs. Use project saves or backups to retain progress.');
  function warn(type, reason) {
    const k = type + ': ' + reason;
    losses[k] = (losses[k] || 0) + 1;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({
      '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'
    }[c]));
  }
  function brandOf(m) { return m.brand || project.threadBrand || (project.settings && project.settings.threadBrand) || 'dmc'; }
  function rgbOK(rgb) { return Array.isArray(rgb) && rgb.length === 3 && rgb.every(v => Number.isInteger(v) && v >= 0 && v <= 255); }
  function catalog(id, b) {
    return b === 'dmc' ? _importDmcById(id) : (typeof findThreadInCatalog === 'function' ? findThreadInCatalog(b, id) : null);
  }
  function hex(rgb) { return rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase(); }
  const palette = [], palMap = new Map();
  // Index 0 is cloth in standard OXS. Old stitchx exports used 0 for a thread;
  // the reader still accepts those files when 0 is not labelled as cloth.
  function register(m, type) {
    if (!m || m.id == null) { warn(type, 'missing thread reference'); return null; }
    if (m.id === '__skip__' || m.id === '__empty__') return null;
    const id = String(m.id), b = brandOf(m), key = b + ':' + id;
    const info = catalog(id, b);
    const components = id.includes('+') || m.type === 'blend' ? id.split('+') : null;
    let blends = null;
    if (components) {
      if ((m.threads != null && (!Array.isArray(m.threads) || m.threads.some(t => !t || typeof t !== 'object'))) ||
          (m.blendRatio != null && !Array.isArray(m.blendRatio))) {
        warn(type, 'blend ' + id + ' has malformed component data'); return null;
      }
      const weights = m.blendRatio || (m.threads && m.threads.map(t => t.strands == null ? 1 : Number(t.strands)));
      if ((weights && (weights.length !== 2 || Number(weights[0]) !== Number(weights[1]) || !(Number(weights[0]) > 0))) ||
          (m.threads && m.threads.some(t => t.brand && t.brand !== b))) {
        warn(type, 'blend ' + id + ' has unsupported strand proportions or mixed brands'); return null;
      }
      if (components.length !== 2 || components.some(id => !id)) { warn(type, 'blend ' + id + ' requires two thread components'); return null; }
      blends = components.map((id, i) => catalog(id, b) || (m.threads && m.threads[i]));
      if (blends.some(t => !t || !rgbOK(t.rgb))) { warn(type, 'blend ' + id + ' has unavailable component colours'); return null; }
    }
    if (m.rgb != null && !rgbOK(m.rgb)) warn(type, 'invalid colour; using catalogue or component colour where available');
    const rgb = rgbOK(m.rgb) ? m.rgb : info && info.rgb || (blends && blends[0].rgb.map((v,i) => Math.round((v + blends[1].rgb[i]) / 2)));
    if (!rgbOK(rgb)) { warn(type, 'thread ' + id + ' has no valid colour'); return null; }
    if (palMap.has(key)) return palMap.get(key);
    const e = { index: palette.length + 1, id: id, brand: b, name: m.name || info && info.name || id, rgb: rgb, blends: blends };
    palette.push(e); palMap.set(key, e);
    return e;
  }
  function cellOK(x,y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < w && y < h; }
  const full = [], parts = [], back = [], ornaments = [];
  pattern.forEach((m, idx) => {
    if (!m || m.id === '__skip__' || m.id === '__empty__') return;
    if (idx >= w*h) { warn('full stitch', 'outside chart dimensions'); return; }
    const pe = register(m, 'full stitch');
    if (pe) full.push('    <stitch x="' + idx % w + '" y="' + Math.floor(idx/w) + '" palindex="' + pe.index + '" />');
  });
  function entries(value) {
    const all = value instanceof Map ? Array.from(value.entries()) : Array.isArray(value) ? value : [];
    if (value != null && !(value instanceof Map) && !Array.isArray(value)) warn('fractional stitch', 'malformed collection');
    return all.filter(entry => {
      if (!Array.isArray(entry) || entry.length !== 2 || !entry[1] || typeof entry[1] !== 'object') {
        warn('fractional stitch', 'malformed entry not exported'); return false;
      }
      return true;
    });
  }
  // Modern quadrants take precedence; add legacy halves only where no modern
  // definition exists, as saved Tracker projects may carry both representations.
  const partials = new Map();
  entries(project.partialStitches).forEach(entry => {
    if (partials.has(entry[0])) warn('fractional stitch', 'duplicate cell definition replaced');
    partials.set(entry[0], entry[1]);
  });
  entries(project.halfStitches).forEach(entry => {
    if (!Array.isArray(entry) || partials.has(entry[0])) return;
    const v = entry[1] || {}, qs = {};
    if (v.fwd) { qs.BL = v.fwd; qs.TR = v.fwd; }
    if (v.bck) { qs.TL = v.bck; qs.BR = v.bck; }
    partials.set(entry[0], qs);
  });
  partials.forEach((qs, idx) => {
    if (!Number.isInteger(idx) || !cellOK(idx % w, Math.floor(idx/w)) || !qs || typeof qs !== 'object') {
      warn('fractional stitch', 'invalid cell or quadrant definition'); return;
    }
    const x = idx % w, y = Math.floor(idx / w);
    const registered = {};
    if (Object.keys(qs).some(q => !['TL','TR','BL','BR'].includes(q))) warn('fractional stitch', 'unknown quadrant fields not exported');
    ['TL','TR','BL','BR'].forEach(q => { if (qs[q]) registered[q] = register(qs[q], 'quarter stitch'); });
    // Each quadrant is a diagonal segment, not a miniature full cross.
    // Pair identical opposite segments into standard Ursa half stitches.
    [['BL','TR',3],['TL','BR',4]].forEach(pair => {
      const a = registered[pair[0]], b = registered[pair[1]];
      if (a && a === b) {
        parts.push('    <partstitch x="' + x + '" y="' + y + '" palindex1="' + a.index + '" palindex2="0" direction="' + pair[2] + '" />');
        delete registered[pair[0]]; delete registered[pair[1]];
      }
    });
    Object.keys(registered).forEach(q => {
      const pe = registered[q];
      if (!pe) return;
      // XSPro's petit=false distinguishes a diagonal quarter from Ursa's
      // miniature cross. Consumers without this extension may draw a petit.
      ornaments.push('    <object x1="' + (x + (q[1] === 'R' ? 0.5 : 0)) + '" y1="' + (y + (q[0] === 'B' ? 0.5 : 0)) + '" palindex="' + pe.index + '" objecttype="quarter" petit="false" />');
    });
  });
  (Array.isArray(project.bsLines) ? project.bsLines : []).forEach(line => {
    if (!line || !['x1','y1','x2','y2'].every(k => Number.isFinite(line[k])) ||
        line.x1 < 0 || line.x2 < 0 || line.y1 < 0 || line.y2 < 0 ||
        line.x1 > w || line.x2 > w || line.y1 > h || line.y2 > h ||
        (line.x1 === line.x2 && line.y1 === line.y2)) {
      warn('backstitch', 'invalid, zero-length or out-of-bounds line'); return;
    }
    let thread;
    if (line.colorId != null && line.colorId !== '') {
      // Explicit references are independent of all full stitches, including brand.
      thread = { id: line.colorId, brand: brandOf(line), rgb: line.rgb };
    } else {
      thread = pattern[Math.min(h-1, Math.floor(line.y1)) * w + Math.min(w-1, Math.floor(line.x1))];
      if (!thread || thread.id === '__skip__' || thread.id === '__empty__') {
        warn('backstitch', 'legacy line has no thread reference or underlying stitch; not exported'); return;
      }
      warn('backstitch', 'legacy line has no thread reference; inferred from underlying stitch');
    }
    const pe = register(thread, 'backstitch');
    if (pe) back.push('    <backstitch x1="' + line.x1 + '" y1="' + line.y1 + '" x2="' + line.x2 + '" y2="' + line.y2 + '" palindex="' + pe.index + '" objecttype="backstitch" />');
  });
  (Array.isArray(project.knots) ? project.knots : []).forEach(k => {
    if (!k || !Number.isInteger(k.x) || !Number.isInteger(k.y) || k.x < 0 || k.y < 0 || k.x > 2*w || k.y > 2*h || k.x % 2 !== k.y % 2) {
      warn('French knot', 'invalid or unsupported position'); return;
    }
    const pe = register(k, 'French knot');
    if (pe) ornaments.push('    <object x1="' + k.x/2 + '" y1="' + k.y/2 + '" palindex="' + pe.index + '" objecttype="knot" />');
  });
  (Array.isArray(project.beads) ? project.beads : []).forEach(b => {
    if (!b || !Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x < 0 || b.y < 0 || b.x > 2*w || b.y > 2*h) { warn('bead', 'invalid position'); return; }
    if (!rgbOK(b.rgb)) warn('bead', 'missing or invalid colour replaced with grey');
    const pe = { index: palette.length + 1, id: b.label || 'Bead', name: b.label || 'Bead', rgb: rgbOK(b.rgb) ? b.rgb : [128,128,128], brand: 'bead' };
    palette.push(pe);
    ornaments.push('    <object x1="' + b.x/2 + '" y1="' + b.y/2 + '" palindex="' + pe.index + '" objecttype="bead" />');
  });
  (Array.isArray(project.specialtyStitches)?project.specialtyStitches:[]).forEach(o=>{
    if(o.type==='long_stitch'){warn('long stitch','external OXS export is unsupported; retain the native JSON project');return;}
    if(o.type!=='petite'||!Number.isInteger(o.x*2)||!Number.isInteger(o.y*2)||o.x<0||o.y<0||o.x+0.5>w||o.y+0.5>h){warn('specialty stitch','invalid geometry or unsupported type');return;}
    const pe=register(o.thread,'petite');
    if(pe)ornaments.push('    <object x1="'+o.x+'" y1="'+o.y+'" palindex="'+pe.index+'" objecttype="quarter" petit="true" />');
  });
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<chart>'];
  if (project.name) lines.push('  <title>' + esc(project.name) + '</title>');
  lines.push('  <properties chartwidth="' + w + '" chartheight="' + h + '" />', '  <palette>');
  lines.push('    <color index="0" number="cloth" name="cloth" color="FFFFFF" />');
  palette.forEach(e => {
    const number = e.brand === 'dmc' || e.brand === 'bead' ? e.id : _oxsBrandLabel(e.brand) + ' ' + e.id;
    const start = '    <color index="' + e.index + '" name="' + esc(e.name) + '" number="' + esc(number) + '" color="' + hex(e.rgb) + '" red="' + e.rgb[0] + '" green="' + e.rgb[1] + '" blue="' + e.rgb[2] + '"';
    if (!e.blends) lines.push(start + ' />');
    else {
      lines.push(start + '>');
      e.blends.forEach(t => lines.push('      <blend number="' + esc(_oxsBrandLabel(e.brand) + ' ' + t.id) + '" name="' + esc(t.name || t.id) + '" color="' + hex(t.rgb) + '" strands="1" />'));
      lines.push('    </color>');
    }
  });
  function section(tag, objects) {
    lines.push('  <' + tag + '>');
    objects.forEach(line => lines.push(line));
    lines.push('  </' + tag + '>');
  }
  lines.push('  </palette>');
  section('fullstitches', full);
  if (parts.length) section('partstitches', parts);
  section('backstitches', back);
  if (ornaments.length) section('ornaments_inc_knots_and_beads', ornaments);
  lines.push('</chart>');
  Object.keys(losses).forEach(k => warnings.push(losses[k] + ' ' + k + '.'));
  return { xml: lines.join('\n'), warnings: warnings };
}

function parseImagePattern(img, options = {}) {
  const maxWidth    = options.maxWidth    || 200;
  const maxHeight   = options.maxHeight   || 200;
  const maxColours  = options.maxColours  || 30;
  const skipWhiteBg = options.skipWhiteBg || false;
  const bgThreshold = options.bgThreshold || 15;
  const preSmooth   = !!options.preSmooth;
  const dither      = !!options.dither;
  const dithAlgo    = options.dithAlgo || (dither ? 'atkinson' : 'off');

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

  // Apply edge-preserving pre-smooth before quantisation if requested.
  // applyBilateralFilter is defined in colour-utils.js (loaded before this file).
  if (preSmooth && typeof applyBilateralFilter === 'function') {
    applyBilateralFilter(data, targetWidth, targetHeight);
  }

  // quantizeConstrained keeps every centroid on a real DMC colour throughout
  // all iterations (no free-space drift then final snap). Falls back to the
  // legacy quantize if the constrained version is not yet loaded.
  const _quantize = (typeof quantizeConstrained === 'function') ? quantizeConstrained : quantize;
  const pal = _quantize(data, targetWidth, targetHeight, maxColours);

  let mapped;
  if (dithAlgo === 'riemersma' && typeof doRiemersma === 'function') {
    const saliencyMap = typeof generateSaliencyMap === 'function'
      ? generateSaliencyMap(data, targetWidth, targetHeight) : null;
    mapped = doRiemersma(data, targetWidth, targetHeight, pal, false, saliencyMap, {});
  } else if (dither && typeof doDither === 'function') {
    const saliencyMap = typeof generateSaliencyMap === 'function'
      ? generateSaliencyMap(data, targetWidth, targetHeight) : null;
    mapped = doDither(data, targetWidth, targetHeight, pal, false, saliencyMap, {});
  } else {
    mapped = doMap(data, targetWidth, targetHeight, pal);
  }

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
