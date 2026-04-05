function drawCk(ctx,x,y,s){for(let cy=0;cy<s;cy+=CK)for(let cx=0;cx<s;cx+=CK){ctx.fillStyle=((Math.floor(cx/CK)+Math.floor(cy/CK))%2===0)?"#f0f0f0":"#dcdcdc";ctx.fillRect(x+cx,y+cy,Math.min(CK,s-cx),Math.min(CK,s-cy));}}

function fmtTime(s){let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`;}
function fmtTimeL(s){let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return`${h} hr${h>1?"s":""} ${m} min`;return`${m} min`;}

function skeinEst(stitchCount,fabricCt){let fc=FABRIC_COUNTS.find(f=>f.ct===fabricCt)||FABRIC_COUNTS[0];let totalIn=stitchCount*fc.inPerSt*2;return Math.max(1,Math.ceil(totalIn/SKEIN_LENGTH_IN));}

function gridCoord(canvasRef,e,cellSize,gutter,snap=false){
  if(!canvasRef.current)return null;
  let rect=canvasRef.current.getBoundingClientRect();
  let mx=e.clientX-rect.left,my=e.clientY-rect.top;
  let gx=snap?Math.round((mx-gutter)/cellSize):Math.floor((mx-gutter)/cellSize);
  let gy=snap?Math.round((my-gutter)/cellSize):Math.floor((my-gutter)/cellSize);
  return{gx,gy};
}

// Difficulty rating
function calcDifficulty(palLen,blendCount,totalSt){
  let score=0;
  if(palLen<=8)score+=1;else if(palLen<=15)score+=2;else if(palLen<=25)score+=3;else score+=4;
  if(blendCount>0)score+=1;if(blendCount>5)score+=1;
  if(totalSt>10000)score+=1;if(totalSt>30000)score+=1;
  if(score<=2)return{label:"Beginner",color:"#16a34a",stars:1};
  if(score<=4)return{label:"Intermediate",color:"#d97706",stars:2};
  if(score<=6)return{label:"Advanced",color:"#ea580c",stars:3};
  return{label:"Expert",color:"#dc2626",stars:4};
}

// IndexedDB utility functions
const DB_NAME = "CrossStitchDB";
const STORE_NAME = "projects";

function getDB() {
  return new Promise((resolve, reject) => {
    let request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (e) => {
      let db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains("project_meta")) {
        db.createObjectStore("project_meta");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveProjectToDB(project) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      let tx = db.transaction(STORE_NAME, "readwrite");
      let store = tx.objectStore(STORE_NAME);
      let request = store.put(project, "auto_save");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to save project to IndexedDB", err);
  }
}

async function loadProjectFromDB() {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      let tx = db.transaction(STORE_NAME, "readonly");
      let store = tx.objectStore(STORE_NAME);
      let request = store.get("auto_save");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to load project from IndexedDB", err);
    return null;
  }
}

async function clearProjectFromDB() {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      let tx = db.transaction(STORE_NAME, "readwrite");
      let store = tx.objectStore(STORE_NAME);
      let request = store.delete("auto_save");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to clear project from IndexedDB", err);
  }
}

// ═══ Half-stitch drawing helpers ═══

// Draw a triangular fill for one half of a cell.
// dir: "fwd" (/ bottom-left to top-right) or "bck" (\ top-left to bottom-right)
// rgb: [r,g,b], alpha: 0-1
function drawHalfTriangle(ctx, px, py, cSz, dir, rgb, alpha) {
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  ctx.beginPath();
  if (dir === "fwd") {
    // / direction — triangle covers bottom-left half
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + cSz);
    ctx.lineTo(px + cSz, py + cSz);
  } else {
    // \ direction (bck) — triangle covers top-left half
    ctx.moveTo(px, py);
    ctx.lineTo(px + cSz, py);
    ctx.lineTo(px, py + cSz);
  }
  ctx.closePath();
  ctx.fill();
}

// Draw the complementary (opposite) triangle for a half stitch.
function drawHalfTriangleComplement(ctx, px, py, cSz, dir, rgb, alpha) {
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  ctx.beginPath();
  if (dir === "fwd") {
    // Complement of / = top-right triangle
    ctx.moveTo(px, py);
    ctx.lineTo(px + cSz, py);
    ctx.lineTo(px + cSz, py + cSz);
  } else {
    // Complement of \ = bottom-right triangle
    ctx.moveTo(px + cSz, py);
    ctx.lineTo(px + cSz, py + cSz);
    ctx.lineTo(px, py + cSz);
  }
  ctx.closePath();
  ctx.fill();
}

// Draw a diagonal line for a half stitch.
// dir: "fwd" (/) or "bck" (\)
function drawHalfLine(ctx, px, py, cSz, dir, rgb, alpha, lineWidth) {
  if (alpha <= 0) return;
  ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (dir === "fwd") {
    // / from bottom-left to top-right
    ctx.moveTo(px + 1, py + cSz - 1);
    ctx.lineTo(px + cSz - 1, py + 1);
  } else {
    // \ from top-left to bottom-right
    ctx.moveTo(px + 1, py + 1);
    ctx.lineTo(px + cSz - 1, py + cSz - 1);
  }
  ctx.stroke();
}

// Draw a half-stitch symbol centered on the triangle centroid.
function drawHalfSymbol(ctx, px, py, cSz, dir, symbol, color, fontSize, fontWeight) {
  ctx.fillStyle = color;
  ctx.font = (fontWeight ? fontWeight + " " : "") + fontSize + "px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let sx, sy;
  if (dir === "fwd") {
    sx = px + cSz * 0.33;
    sy = py + cSz * 0.67;
  } else {
    sx = px + cSz * 0.33;
    sy = py + cSz * 0.33;
  }
  ctx.fillText(symbol, sx, sy);
}

// ═══ Stats helpers ═══

function getStitchingDate(now, dayEndHour) {
  var d = new Date(now);
  if (dayEndHour > 0 && d.getHours() < dayEndHour) {
    d.setDate(d.getDate() - 1);
  }
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

function computeOverviewStats(statsSessions, totalCompleted, totalStitches) {
  const totalMinutes = statsSessions.reduce(function(sum, s) { return sum + s.durationMinutes; }, 0);
  const totalHours = totalMinutes / 60;
  var totalNetStitches = statsSessions.reduce(function(sum, s) { return sum + s.netStitches; }, 0);
  var stitchesPerHour = totalHours > 0 ? Math.round(totalNetStitches / totalHours) : 0;
  var uniqueDays = new Set(statsSessions.map(function(s) { return s.date; })).size;
  var avgPerDay = uniqueDays > 0 ? Math.round(totalNetStitches / uniqueDays) : 0;
  var remaining = totalStitches - totalCompleted;
  var daysRemaining = avgPerDay > 0 ? Math.ceil(remaining / avgPerDay) : null;
  var estimatedDate = daysRemaining ? new Date(Date.now() + daysRemaining * 86400000) : null;
  return {
    percent: totalStitches > 0 ? Math.round((totalCompleted / totalStitches) * 1000) / 10 : 0,
    stitchesPerHour: stitchesPerHour,
    totalTimeFormatted: formatStatsDuration(totalMinutes),
    estimatedCompletion: estimatedDate
      ? estimatedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—',
    daysRemaining: daysRemaining,
    avgPerDay: avgPerDay,
    totalMinutes: totalMinutes,
    uniqueDays: uniqueDays
  };
}

function getStatsTodayStitches(sessions, dayEndHour) {
  var today = getStitchingDate(new Date(), dayEndHour || 0);
  return sessions.filter(function(s) { return s.date === today; }).reduce(function(sum, s) { return sum + s.netStitches; }, 0);
}

function getStatsTodayMinutes(sessions, dayEndHour) {
  var today = getStitchingDate(new Date(), dayEndHour || 0);
  return sessions.filter(function(s) { return s.date === today; }).reduce(function(sum, s) { return sum + s.durationMinutes; }, 0);
}

function groupSessionsByDate(sessions) {
  var grouped = {};
  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    if (!grouped[s.date]) grouped[s.date] = [];
    grouped[s.date].push(s);
  }
  return grouped;
}

function formatStatsDuration(minutes) {
  if (minutes < 1) return '0m';
  if (minutes < 60) return minutes + 'm';
  var h = Math.floor(minutes / 60);
  var m = minutes % 60;
  return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
}

function formatRelativeDate(dateStr, dayEndHour) {
  var today = getStitchingDate(new Date(), dayEndHour || 0);
  var todayDate = new Date(today + 'T12:00:00');
  todayDate.setDate(todayDate.getDate() - 1);
  var yesterdayStr = todayDate.toISOString().slice(0, 10);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimeRange(startISO, endISO) {
  var fmt = function(iso) { return new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }); };
  return fmt(startISO) + ' – ' + fmt(endISO);
}

// Determine which half of a cell a click falls in.
// Returns "fwd", "bck", or "ambiguous".
function hitTestHalfStitch(localX, localY, cSz, ambiguousRadius) {
  ambiguousRadius = ambiguousRadius || 8;
  var cx = cSz / 2, cy = cSz / 2;
  if (Math.abs(localX - cx) < ambiguousRadius && Math.abs(localY - cy) < ambiguousRadius) {
    return "ambiguous";
  }
  // Classify relative to the / diagonal (bottom-left to top-right).
  // localX + localY == cSz lies on the diagonal.
  // Below the / diagonal = fwd triangle, above = bck.
  var diag = localX + localY;
  return diag > cSz ? "fwd" : "bck";
}
