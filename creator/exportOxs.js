/* creator/exportOxs.js — OXS (Open Cross Stitch) XML export.
   Produces an XML file compatible with the parseOXS importer in import-formats.js.
   Round-trip guarantee: solid stitches survive export → import with identical
   stitch positions and the nearest-matching DMC colour.
   Blend stitches are exported with a colour-averaged palette entry (OXS does not
   natively support blended threads). */

/**
 * Build the OXS XML string from pattern data.
 * Extracted as a pure function so it can be unit-tested without a DOM.
 *
 * @param {Array}  pat       Flat pattern array (length sW * sH)
 * @param {Array}  pal       Palette array of colour entries
 * @param {number} sW        Pattern width in stitches
 * @param {number} sH        Pattern height in stitches
 * @param {number} fabricCt  Fabric count (e.g. 14)
 * @param {Array}  bsLines   Backstitch line objects [{x1,y1,x2,y2}]
 * @param {string} name      Pattern name (used in <properties>)
 * @returns {string}  Complete OXS XML string
 */
window.buildOxsXml = function buildOxsXml(pat, pal, sW, sH, fabricCt, bsLines, name) {
  fabricCt = fabricCt || 14;
  bsLines = bsLines || [];
  name = name || "Cross Stitch Pattern";

  function escapeXml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // Build palette index — one entry per unique stitch ID.
  // Blends are represented by an averaged colour (OXS is single-thread per cell).
  var palIndex = {};   // stitch id → integer index
  var palEntries = []; // [{index, id, displayName, number, rgb}]

  (pal || []).forEach(function(p) {
    var id = p.id;
    if (palIndex.hasOwnProperty(id)) return; // already mapped
    var idx = palEntries.length;
    palIndex[id] = idx;
    if (p.type === "blend" && p.threads && p.threads.length >= 2) {
      var t0 = p.threads[0], t1 = p.threads[1];
      palEntries.push({
        index: idx,
        id: id,
        number: t0.id,                        // first thread's DMC number for import matching
        displayName: t0.name + " + " + t1.name,
        rgb: [
          Math.round((t0.rgb[0] + t1.rgb[0]) / 2),
          Math.round((t0.rgb[1] + t1.rgb[1]) / 2),
          Math.round((t0.rgb[2] + t1.rgb[2]) / 2)
        ]
      });
    } else {
      palEntries.push({
        index: idx,
        id: id,
        number: String(p.id),
        displayName: p.name || "",
        rgb: p.rgb || [0, 0, 0]
      });
    }
  });

  var lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<chart>');
  lines.push('  <properties chartwidth="' + sW + '" chartheight="' + sH +
             '" fabriccount="' + fabricCt + '" name="' + escapeXml(name) + '" />');

  // Palette
  lines.push('  <palette>');
  palEntries.forEach(function(e) {
    lines.push('    <color index="' + e.index +
               '" number="' + escapeXml(e.number) +
               '" name="' + escapeXml(e.displayName) +
               '" red="' + e.rgb[0] +
               '" green="' + e.rgb[1] +
               '" blue="' + e.rgb[2] + '" />');
  });
  lines.push('  </palette>');

  // Full stitches
  lines.push('  <fullstitches>');
  for (var row = 0; row < sH; row++) {
    for (var col = 0; col < sW; col++) {
      var cell = pat[row * sW + col];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      var idx = palIndex[cell.id];
      if (idx === undefined) continue;
      lines.push('    <stitch x="' + col + '" y="' + row + '" palindex="' + idx + '" />');
    }
  }
  lines.push('  </fullstitches>');

  // Backstitch lines
  if (bsLines.length > 0) {
    lines.push('  <backstitches>');
    bsLines.forEach(function(ln) {
      lines.push('    <backstitch x1="' + ln.x1 + '" y1="' + ln.y1 +
                 '" x2="' + ln.x2 + '" y2="' + ln.y2 + '" />');
    });
    lines.push('  </backstitches>');
  }

  lines.push('</chart>');
  return lines.join('\n');
};

/**
 * Export the current pattern as an OXS file and trigger a browser download.
 * @param {object} data  Pattern data snapshot (pat, pal, sW, sH, fabricCt, bsLines, projectName)
 */
window.exportOXS = function exportOXS(data) {
  var pat = data.pat, pal = data.pal;
  var sW = data.sW, sH = data.sH;
  if (!pat || !pal || !sW || !sH) return;

  var fabricCt = data.fabricCt || 14;
  var bsLines = data.bsLines || [];
  var name = data.projectName || data.name || "Cross Stitch Pattern";

  var xml = buildOxsXml(pat, pal, sW, sH, fabricCt, bsLines, name);

  var blob = new Blob([xml], { type: "application/xml" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = (name || "pattern").replace(/[^a-z0-9_\- ]/gi, "_") + ".oxs";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
};
