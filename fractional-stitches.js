// Fractional stitches helper functions

function isFractional(m) {
  return m && m.type === "fractional";
}

function resolveFractionalComponents(components) {
  // Logic to merge four 1/4 stitches to 1 solid stitch if they are same color
  let byColor = {};
  components.forEach(c => {
    byColor[c.id] = (byColor[c.id] || 0) + (c.type === "quarter" ? 0.25 : 0.5);
  });

  for (let id in byColor) {
    if (byColor[id] >= 1.0) {
      // Find the thread
      let t = components.find(c => c.id === id);
      return { type: "solid", id: id, name: t.name, rgb: t.rgb, lab: t.lab, symbol: t.symbol };
    }
  }

  // Return the components unchanged if no full merge
  return components;
}

// Convert component details to string key to easily detect overlapping paths
function pathKey(start, end) {
  // normalize order so [0,0]->[2,2] is same as [2,2]->[0,0]
  let s = start.slice();
  let e = end.slice();
  if (s[0] > e[0] || (s[0] === e[0] && s[1] > e[1])) {
    let tmp = s; s = e; e = tmp;
  }
  return s[0]+','+s[1]+'-'+e[0]+','+e[1];
}

function computeStitchVolume(components) {
  return components.reduce((sum, c) => sum + (c.type === "quarter" ? 0.25 : 0.5), 0);
}

function getOverlappingComponentIndex(components, newComp) {
  let nk = pathKey(newComp.path.start, newComp.path.end);
  for (let i = 0; i < components.length; i++) {
    let c = components[i];
    let ck = pathKey(c.path.start, c.path.end);

    // Exact same path and same side (for half stitches)
    if (nk === ck) {
       let sameSide = true;
       if (newComp.type === "half" && c.type === "half") {
          let f1 = newComp.path.fillCorner ? newComp.path.fillCorner.join(',') : '';
          let f2 = c.path.fillCorner ? c.path.fillCorner.join(',') : '';
          if (f1 && f2 && f1 !== f2) sameSide = false;
       }
       if (sameSide) return i;
    }

    // Overlap: half stitch covers quarters along its path
    if (newComp.type === "half" && c.type === "quarter") {
      // If half goes from [0,0] to [2,2], the center is [1,1]
      // Quarters are corner to center. So if quarter is on the same diagonal
      if (
        (nk === '0,0-2,2' && (ck === '0,0-1,1' || ck === '1,1-2,2')) ||
        (nk === '0,2-2,0' && (ck === '0,2-1,1' || ck === '1,1-2,0'))
      ) {
        return i; // Conflict
      }
    }
    // Overlap: quarter covers part of half stitch
    if (newComp.type === "quarter" && c.type === "half") {
      if (
        (ck === '0,0-2,2' && (nk === '0,0-1,1' || nk === '1,1-2,2')) ||
        (ck === '0,2-2,0' && (nk === '0,2-1,1' || nk === '1,1-2,0'))
      ) {
        return i; // Conflict
      }
    }
  }
  return -1;
}

function handleFractionalClick(cell, newComp, conflictAction = "replace") {
  // If cell is not fractional but solid, we first convert to fractional components (if different color)
  let components = [];
  if (cell && cell.type === "solid" && cell.id !== "__skip__") {
     // User requirement: Tap cell with full cross -> briefly flashes red border + tooltip: "Remove the full cross first"
     // We can trigger this by returning a specific error type
     return { changed: false, error: "full_cross_conflict", cell: cell };
  } else if (cell && cell.type === "fractional") {
     components = cell.components.slice();
  }

  // Check if we tapped an existing component of same color (toggle off)
  let exactMatchIdx = -1;
  let nk = pathKey(newComp.path.start, newComp.path.end);
  for (let i = 0; i < components.length; i++) {
    let c = components[i];
    let ck = pathKey(c.path.start, c.path.end);
    // For half stitches, also match the fillCorner if present
    let sameFillCorner = true;
    if (c.type === "half" && newComp.type === "half") {
       let cf1 = c.path.fillCorner ? c.path.fillCorner.join(',') : '';
       let cf2 = newComp.path.fillCorner ? newComp.path.fillCorner.join(',') : '';
       // If fillCorners are provided, they must match to toggle off the specific half
       if (cf1 && cf2 && cf1 !== cf2) sameFillCorner = false;
    }
    if (nk === ck && c.type === newComp.type && c.id === newComp.id && sameFillCorner) {
       exactMatchIdx = i;
       break;
    }
  }

  if (exactMatchIdx !== -1) {
    components.splice(exactMatchIdx, 1);
    if (components.length === 0) return { changed: true, cell: { type: "skip", id: "__skip__", rgb: [255,255,255], lab: [100,0,0] } };
    let resolved = resolveFractionalComponents(components);
    if (resolved.type === "solid") return { changed: true, cell: resolved };
    return { changed: true, cell: { type: "fractional", components: components } };
  }

  // Check overlaps
  let overlapIdx = getOverlappingComponentIndex(components, newComp);

  if (overlapIdx !== -1) {
      if (conflictAction === "prompt") {
          return { changed: false, conflict: true, cell: cell };
      }
      if (conflictAction === "replace") {
          // Remove all overlapping components
          components = components.filter((c, i) => getOverlappingComponentIndex([newComp], c) === -1);
      }
  }

  // Add new component
  // Manage priority: highest priority to newest
  let maxPrio = components.reduce((max, c) => Math.max(max, c.priority || 0), 0);
  newComp.priority = maxPrio + 1;
  components.push(newComp);

  // Enforce volume max 1.0 (if somehow exceeded, though overlaps should prevent it usually)
  // For instance 2 half stitches + 1 quarter? That overlaps, handled above.

  let resolved = resolveFractionalComponents(components);
  if (resolved.type === "solid") return { changed: true, cell: resolved };
  return { changed: true, cell: { type: "fractional", components: components } };
}

function getSubCellCoords(mx, my, cellSize) {
   let hx = mx / cellSize;
   let hy = my / cellSize;
   // Determine if center tap or corner tap
   // center threshold: between 0.35 and 0.65
   let isCenter = (hx >= 0.35 && hx <= 0.65) && (hy >= 0.35 && hy <= 0.65);

   let cornerX = hx < 0.5 ? 0 : 2;
   let cornerY = hy < 0.5 ? 0 : 2;

   return { isCenter, cornerX, cornerY };
}


// Export OXS XML serialization helper
function exportFractionalToOxs(cell, x, y) {
   if (cell.type !== "fractional") return "";
   let xml = "";
   let components = cell.components;

   // Map to oxs fraction types
   // oxs supports <quarter>, <half>, <threequarter>
   // We can translate our components to these tags
   // Group by color to detect 3/4
   let byColor = {};
   components.forEach(c => {
      if (!byColor[c.id]) byColor[c.id] = { quarters: [], halfs: [], colorId: c.id };
      if (c.type === "quarter") byColor[c.id].quarters.push(c);
      if (c.type === "half") byColor[c.id].halfs.push(c);
   });

   for (let id in byColor) {
      let g = byColor[id];
      // 1 half + 1 quarter of same color = threequarter
      if (g.halfs.length === 1 && g.quarters.length === 1) {
          xml += `<threequarter x="${x}" y="${y}" color="${id}" />\n`;
      } else {
          g.halfs.forEach(h => {
             // For oxs, orientation is often needed. We can use path to determine.
             let isFwd = (h.path.start[0]===0 && h.path.start[1]===2 && h.path.end[0]===2 && h.path.end[1]===0) ||
                         (h.path.start[0]===2 && h.path.start[1]===0 && h.path.end[0]===0 && h.path.end[1]===2);
             xml += `<half x="${x}" y="${y}" color="${id}" direction="${isFwd ? '/' : '\\'}" />\n`;
          });
          g.quarters.forEach(q => {
             // determine corner: start is corner, end is center
             let corner = '';
             let sx = q.path.start[0]; let sy = q.path.start[1];
             if (sx===0 && sy===0) corner="top-left";
             else if (sx===2 && sy===0) corner="top-right";
             else if (sx===0 && sy===2) corner="bottom-left";
             else if (sx===2 && sy===2) corner="bottom-right";
             xml += `<quarter x="${x}" y="${y}" color="${id}" corner="${corner}" />\n`;
          });
      }
   }
   return xml;
}


if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isFractional, resolveFractionalComponents, pathKey, getOverlappingComponentIndex, handleFractionalClick, getSubCellCoords, exportFractionalToOxs };
}
