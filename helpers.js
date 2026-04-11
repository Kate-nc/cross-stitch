function drawCk(ctx,x,y,s){for(let cy=0;cy<s;cy+=CK)for(let cx=0;cx<s;cx+=CK){ctx.fillStyle=((Math.floor(cx/CK)+Math.floor(cy/CK))%2===0)?"#f0f0f0":"#dcdcdc";ctx.fillRect(x+cx,y+cy,Math.min(CK,s-cx),Math.min(CK,s-cy));}}

function fmtTime(s){let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`;}
function fmtTimeL(s){let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return`${h} hr${h>1?"s":""} ${m} min`;return`${m} min`;}

function skeinEst(stitchCount,fabricCt){if(typeof stitchesToSkeins==='function'){const result=stitchesToSkeins({stitchCount:stitchCount,fabricCount:fabricCt,strandsUsed:2,wasteFactor:0.20});return Math.max(1,result.skeinsToBuy);}return 1;}

function confettiTier(pct){
  if(pct<2)return{color:"#16a34a",label:"Excellent"};
  if(pct<5)return{color:"#65a30d",label:"Good"};
  if(pct<8)return{color:"#d97706",label:"Moderate"};
  if(pct<15)return{color:"#ea580c",label:"Challenging"};
  return{color:"#dc2626",label:"High confetti"};
}

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

async function ensurePersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        console.log(`Storage persistence ${granted ? "granted" : "denied"}.`);
        return granted;
      }
      return true;
    }
  } catch (error) {
    console.warn("Storage persistence unavailable.", error);
  }
  return false;
}

function getDB() {
  return new Promise((resolve, reject) => {
    ensurePersistence().catch(() => {});
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

// ═══ Quadrant partial-stitch drawing helpers ═══
// These replace the old half-stitch helpers (drawHalfTriangle, drawHalfLine, etc.)

// Draw a filled triangle for one quadrant of a cell.
// quadrant: "TL" | "TR" | "BL" | "BR"
// The cell is divided by its two diagonals into four triangles:
//   TL = top triangle (apex=top-left corner, base towards centre)
//   TR = right triangle
//   BL = left triangle
//   BR = bottom triangle
function drawQuadrantFill(ctx, px, py, cSz, quadrant, rgb, alpha) {
  if (alpha <= 0) return;
  ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
  var mx = px + cSz / 2, my = py + cSz / 2;
  ctx.beginPath();
  switch (quadrant) {
    case "TL":
      ctx.moveTo(px, py);
      ctx.lineTo(px + cSz, py);
      ctx.lineTo(mx, my);
      ctx.lineTo(px, py + cSz);
      break;
    case "TR":
      ctx.moveTo(px + cSz, py);
      ctx.lineTo(px + cSz, py + cSz);
      ctx.lineTo(mx, my);
      ctx.lineTo(px, py);
      break;
    case "BL":
      ctx.moveTo(px, py + cSz);
      ctx.lineTo(px, py);
      ctx.lineTo(mx, my);
      ctx.lineTo(px + cSz, py + cSz);
      break;
    case "BR":
      ctx.moveTo(px + cSz, py + cSz);
      ctx.lineTo(px, py + cSz);
      ctx.lineTo(mx, my);
      ctx.lineTo(px + cSz, py);
      break;
  }
  ctx.closePath();
  ctx.fill();
}

// Draw the stitch thread line for a quadrant (corner to centre).
function drawQuadrantStitchLine(ctx, px, py, cSz, quadrant, rgb, alpha) {
  if (alpha <= 0) return;
  var mx = px + cSz / 2, my = py + cSz / 2;
  ctx.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
  ctx.lineWidth = Math.max(1, cSz * 0.1);
  ctx.lineCap = "round";
  ctx.beginPath();
  switch (quadrant) {
    case "TL": ctx.moveTo(px + 1, py + 1);           ctx.lineTo(mx, my); break;
    case "TR": ctx.moveTo(px + cSz - 1, py + 1);     ctx.lineTo(mx, my); break;
    case "BL": ctx.moveTo(px + 1, py + cSz - 1);     ctx.lineTo(mx, my); break;
    case "BR": ctx.moveTo(px + cSz - 1, py + cSz - 1); ctx.lineTo(mx, my); break;
  }
  ctx.stroke();
}

// Draw a symbol at the centroid of a quadrant.
function drawQuadrantSymbol(ctx, px, py, cSz, quadrant, symbol, color) {
  ctx.fillStyle = color;
  ctx.font = "bold " + Math.max(5, cSz * 0.35) + "px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  var sx, sy;
  switch (quadrant) {
    case "TL": sx = px + cSz * 0.25; sy = py + cSz * 0.25; break;
    case "TR": sx = px + cSz * 0.75; sy = py + cSz * 0.25; break;
    case "BL": sx = px + cSz * 0.25; sy = py + cSz * 0.75; break;
    case "BR": sx = px + cSz * 0.75; sy = py + cSz * 0.75; break;
  }
  ctx.fillText(symbol, sx, sy);
}

// Determine which quadrant of a cell a click falls in based on local coords.
function hitTestQuadrant(localX, localY, cSz) {
  var mx = cSz / 2, my = cSz / 2;
  // Use both diagonals to determine quadrant:
  // TL diagonal: from (0,0) to (cSz,cSz) — points above/left are "top"
  // TR diagonal: from (cSz,0) to (0,cSz) — split left/right
  var onTLDiag = localY < localX;          // above \ diagonal = TR or TL side
  var onTRDiag = localY < (cSz - localX);  // above / diagonal = TL or TR side
  if (onTLDiag && onTRDiag) return "TL";
  if (!onTLDiag && onTRDiag) return "BL";
  if (onTLDiag && !onTRDiag) return "TR";
  return "BR";
}

// Migrate a legacy halfStitch entry {fwd?, bck?} to the new quadrant format.
function migrateHalfStitch(entry) {
  var result = {};
  if (entry.fwd) {
    result.BL = { id: entry.fwd.id, rgb: entry.fwd.rgb };
    result.TR = { id: entry.fwd.id, rgb: entry.fwd.rgb };
  }
  if (entry.bck) {
    result.TL = { id: entry.bck.id, rgb: entry.bck.rgb };
    result.BR = { id: entry.bck.id, rgb: entry.bck.rgb };
  }
  return result;
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

function formatLocalDateYYYYMMDD(date) {
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function formatRelativeDate(dateStr, dayEndHour) {
  var today = getStitchingDate(new Date(), dayEndHour || 0);
  var todayDate = new Date(today + 'T12:00:00');
  todayDate.setDate(todayDate.getDate() - 1);
  var yesterdayStr = formatLocalDateYYYYMMDD(todayDate);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimeRange(startISO, endISO) {
  var fmt = function(iso) { return new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }); };
  return fmt(startISO) + ' – ' + fmt(endISO);
}

function formatCompact(n) {
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(Math.round(n));
}

function formatShortDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getCumulativeProgressData(sessions) {
  if (!sessions || sessions.length === 0) return [];
  var sorted = sessions.slice().sort(function(a, b) { return new Date(a.startTime) - new Date(b.startTime); });
  var dailyTotals = {};
  for (var i = 0; i < sorted.length; i++) {
    dailyTotals[sorted[i].date] = sorted[i].totalAtEnd;
  }
  var dates = Object.keys(dailyTotals).sort();
  if (dates.length === 0) return [];
  var firstDate = new Date(dates[0] + 'T12:00:00');
  var lastDate = new Date(dates[dates.length - 1] + 'T12:00:00');
  var result = [];
  var lastTotal = 0;
  for (var d = new Date(firstDate); d <= lastDate; d.setDate(d.getDate() + 1)) {
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    var dateStr = y + '-' + m + '-' + day;
    if (dailyTotals[dateStr] !== undefined) {
      lastTotal = dailyTotals[dateStr];
    }
    result.push({ date: dateStr, total: lastTotal });
  }
  return result;
}

function getDailyStitchData(sessions, daysToShow, dayEndHour) {
  daysToShow = daysToShow || 14;
  var today = getStitchingDate(new Date(), dayEndHour || 0);
  var data = [];
  for (var i = daysToShow - 1; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    var dateStr = y + '-' + m + '-' + day;
    var dayStitches = 0;
    if (sessions) {
      for (var j = 0; j < sessions.length; j++) {
        if (sessions[j].date === dateStr) dayStitches += sessions[j].netStitches;
      }
    }
    data.push({ date: dateStr, stitches: dayStitches, isToday: dateStr === today });
  }
  return data;
}

function getMilestones(sessions, totalCompleted, totalStitches, avgPerDay) {
  var percentages = [10, 25, 50, 75, 100];
  var sorted = (sessions && sessions.length > 0)
    ? sessions.slice().sort(function(a, b) { return new Date(a.startTime) - new Date(b.startTime); })
    : [];
  return percentages.map(function(pct) {
    var threshold = Math.floor(totalStitches * pct / 100);
    var achieved = totalCompleted >= threshold && totalStitches > 0;
    var achievedDate = null;
    if (achieved && sorted.length > 0) {
      for (var i = 0; i < sorted.length; i++) {
        if (sorted[i].totalAtEnd >= threshold) {
          achievedDate = sorted[i].date;
          break;
        }
      }
    }
    var estimatedDate = null;
    if (!achieved && avgPerDay > 0) {
      var remaining = threshold - totalCompleted;
      var daysNeeded = Math.ceil(remaining / avgPerDay);
      var est = new Date();
      est.setDate(est.getDate() + daysNeeded);
      var ey = est.getFullYear();
      var em = ('0' + (est.getMonth() + 1)).slice(-2);
      var ed = ('0' + est.getDate()).slice(-2);
      estimatedDate = ey + '-' + em + '-' + ed;
    }
    var isNext = !achieved;
    if (isNext) {
      for (var k = 0; k < percentages.length; k++) {
        if (totalCompleted < Math.floor(totalStitches * percentages[k] / 100)) {
          isNext = (pct === percentages[k]);
          break;
        }
      }
    }
    return { percent: pct, threshold: threshold, achieved: achieved, achievedDate: achievedDate, estimatedDate: estimatedDate, isNext: isNext };
  });
}

// ═══ Phase C helpers ═══

function computeStreaks(sessions, dayEndHour) {
  if (!sessions || sessions.length === 0) return { current: 0, longest: 0 };
  var dates = [];
  var seen = {};
  for (var i = 0; i < sessions.length; i++) {
    var d = sessions[i].date;
    if (d && !seen[d]) { seen[d] = true; dates.push(d); }
  }
  dates.sort();
  if (dates.length === 0) return { current: 0, longest: 0 };

  var longest = 1;
  var streakCount = 1;
  for (var j = 1; j < dates.length; j++) {
    var prev = new Date(dates[j - 1] + 'T12:00:00');
    var curr = new Date(dates[j] + 'T12:00:00');
    var diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) {
      streakCount++;
      if (streakCount > longest) longest = streakCount;
    } else {
      streakCount = 1;
    }
  }

  var today = getStitchingDate(new Date(), dayEndHour || 0);
  var yesterdayD = new Date();
  yesterdayD.setDate(yesterdayD.getDate() - 1);
  var ey = yesterdayD.getFullYear();
  var em = ('0' + (yesterdayD.getMonth() + 1)).slice(-2);
  var ed2 = ('0' + yesterdayD.getDate()).slice(-2);
  var yesterdayStr = ey + '-' + em + '-' + ed2;
  var lastDate = dates[dates.length - 1];
  var currentStreak = 0;

  if (lastDate === today || lastDate === yesterdayStr) {
    currentStreak = 1;
    for (var k = dates.length - 2; k >= 0; k--) {
      var p = new Date(dates[k] + 'T12:00:00');
      var c = new Date(dates[k + 1] + 'T12:00:00');
      if (Math.round((c - p) / 86400000) === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return { current: currentStreak, longest: longest };
}

function findBestDay(sessions) {
  if (!sessions || sessions.length === 0) return null;
  var dailyTotals = {};
  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    dailyTotals[s.date] = (dailyTotals[s.date] || 0) + s.netStitches;
  }
  var bestDate = null;
  var bestCount = 0;
  for (var date in dailyTotals) {
    if (dailyTotals[date] > bestCount) {
      bestDate = date;
      bestCount = dailyTotals[date];
    }
  }
  return bestDate ? { date: bestDate, stitches: bestCount } : null;
}

function checkMilestones(prevTotal, newTotal, totalStitches) {
  var milestones = [];
  var thresholds = [
    { pct: 10, label: '10%' },
    { pct: 25, label: '25%' },
    { pct: 50, label: 'Halfway there!' },
    { pct: 75, label: '75%' },
    { pct: 90, label: 'Almost done!' },
    { pct: 100, label: 'Complete!' }
  ];
  for (var i = 0; i < thresholds.length; i++) {
    var t = thresholds[i];
    var threshold = Math.floor(totalStitches * t.pct / 100);
    if (prevTotal < threshold && newTotal >= threshold) {
      milestones.push(t);
    }
  }
  var prevK = Math.floor(prevTotal / 1000);
  var newK = Math.floor(newTotal / 1000);
  if (newK > prevK) {
    milestones.push({ pct: null, label: (newK * 1000) + ' stitches!' });
  }
  return milestones;
}

function getRequiredPace(remaining, targetDate) {
  var days = Math.ceil((new Date(targetDate) - new Date()) / 86400000);
  return days > 0 ? Math.ceil(remaining / days) : null;
}

// ═══ Phase D: Sharing & Export helpers ═══

function generateShareText(projectName, stats, sessions, totalCompleted, totalStitches, dayEndHour) {
  var streaks = computeStreaks(sessions, dayEndHour);
  var bestDay = findBestDay(sessions);
  var percent = totalStitches > 0
    ? (totalCompleted / totalStitches * 100).toFixed(1)
    : '0.0';

  var lines = [
    '\uD83E\uDDF5 ' + (projectName || 'Cross Stitch Project') + ' \u2014 Progress Update',
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    '\u2705 ' + totalCompleted.toLocaleString() + ' / ' + totalStitches.toLocaleString() + ' stitches (' + percent + '%)',
    '\u23F1\uFE0F ' + formatStatsDuration(stats.totalMinutes) + ' across ' + sessions.length + ' session' + (sessions.length !== 1 ? 's' : ''),
    '\uD83D\uDCC8 ' + stats.stitchesPerHour + ' stitches/hour \u00B7 ' + stats.avgPerDay + '/day average'
  ];

  if (streaks.current > 0 || streaks.longest > 0) {
    lines.push('\uD83D\uDD25 Current streak: ' + streaks.current + ' day' + (streaks.current !== 1 ? 's' : '') + ' (longest: ' + streaks.longest + ')');
  }

  if (bestDay) {
    lines.push('\uD83C\uDFC6 Best day: ' + bestDay.stitches + ' stitches (' + formatShortDate(bestDay.date) + ')');
  }

  if (stats.estimatedCompletion && stats.estimatedCompletion !== '\u2014') {
    lines.push('\uD83D\uDCC5 Est. completion: ' + stats.estimatedCompletion);
  }

  lines.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  lines.push('Tracked with Cross Stitch Studio');

  return lines.join('\n');
}

function generateSessionCSV(sessions) {
  var headers = [
    'Date', 'Start Time', 'End Time', 'Duration (min)',
    'Stitches Completed', 'Stitches Undone', 'Net Stitches',
    'Cumulative Total', 'Percent Complete', 'Note'
  ];
  var rows = [];
  var sorted = (sessions || []).slice().sort(function(a, b) {
    return new Date(a.startTime) - new Date(b.startTime);
  });
  for (var i = 0; i < sorted.length; i++) {
    var s = sorted[i];
    var startT = new Date(s.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    var endT = new Date(s.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    var note = (s.note || '').replace(/"/g, '""');
    rows.push([
      s.date, startT, endT, s.durationMinutes,
      s.stitchesCompleted, s.stitchesUndone, s.netStitches,
      s.totalAtEnd, s.percentAtEnd, '"' + note + '"'
    ].join(','));
  }
  return [headers.join(',')].concat(rows).join('\n');
}

function downloadCSV(sessions, projectName) {
  var csv = generateSessionCSV(sessions);
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var safeName = (projectName || 'cross-stitch').replace(/[^a-zA-Z0-9]/g, '_');
  a.download = safeName + '_sessions.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══ Phase E: Speed Trends & Colour Timeline ═══

function getSpeedTrendData(sessions) {
  if (!sessions || sessions.length === 0) return [];
  var sorted = sessions.slice().sort(function(a, b) {
    return new Date(a.startTime) - new Date(b.startTime);
  });
  return sorted
    .filter(function(s) { return s.durationMinutes >= 10 && s.netStitches > 0; })
    .map(function(s) {
      return {
        date: s.date,
        speed: Math.round(s.netStitches / (s.durationMinutes / 60))
      };
    });
}

function getRollingAverage(data, window) {
  window = window || 7;
  return data.map(function(d, i) {
    var start = Math.max(0, i - window + 1);
    var windowSlice = data.slice(start, i + 1);
    var avg = Math.round(windowSlice.reduce(function(sum, x) { return sum + x.speed; }, 0) / windowSlice.length);
    return { date: d.date, speed: d.speed, smoothedSpeed: avg };
  });
}

function getColourTimeline(sessions) {
  var timeline = {};
  if (!sessions) return timeline;
  for (var i = 0; i < sessions.length; i++) {
    var session = sessions[i];
    if (!session.coloursWorked || session.coloursWorked.length === 0) continue;
    for (var j = 0; j < session.coloursWorked.length; j++) {
      var colour = session.coloursWorked[j];
      if (!timeline[colour]) {
        timeline[colour] = { firstDate: session.date, lastDate: session.date, sessionCount: 0, activeDates: {} };
      }
      timeline[colour].lastDate = session.date;
      timeline[colour].sessionCount++;
      timeline[colour].activeDates[session.date] = true;
    }
  }
  return timeline;
}

// hitTestHalfStitch is replaced by hitTestQuadrant above.

/**
 * Draws geometric shapes for the standard pattern symbols directly onto a jsPDF instance.
 * @param {Object} pdf - The jsPDF instance
 * @param {string} symbol - The symbol character
 * @param {number} cx - Center X coordinate
 * @param {number} cy - Center Y coordinate
 * @param {number} size - Base size/radius for the symbol
 */
function drawPDFSymbol(pdf, symbol, cx, cy, size) {
  let r = size * 0.2;
  let r2 = size * 0.15;
  pdf.setLineWidth(Math.max(0.1, size * 0.05));

  if (symbol === "●") { pdf.circle(cx, cy, r, "F"); }
  else if (symbol === "○") { pdf.circle(cx, cy, r, "S"); }
  else if (symbol === "■") { pdf.rect(cx - r, cy - r, r*2, r*2, "F"); }
  else if (symbol === "□") { pdf.rect(cx - r, cy - r, r*2, r*2, "S"); }
  else if (symbol === "▲") { pdf.triangle(cx, cy - r, cx + r, cy + r, cx - r, cy + r, "F"); }
  else if (symbol === "△") { pdf.triangle(cx, cy - r, cx + r, cy + r, cx - r, cy + r, "S"); }
  else if (symbol === "▼") { pdf.triangle(cx - r, cy - r, cx + r, cy - r, cx, cy + r, "F"); }
  else if (symbol === "▽") { pdf.triangle(cx - r, cy - r, cx + r, cy - r, cx, cy + r, "S"); }
  else if (symbol === "◆" || symbol === "♦" || symbol === "⬥" || symbol === "⬦") {
    pdf.lines([[r, r], [-r, r], [-r, -r], [r, -r]], cx, cy - r, [1, 1], "F", true);
  }
  else if (symbol === "◇" || symbol === "♢") {
    pdf.lines([[r, r], [-r, r], [-r, -r], [r, -r]], cx, cy - r, [1, 1], "S", true);
  }
  else if (symbol === "◄" || symbol === "◁") { pdf.triangle(cx + r, cy - r, cx + r, cy + r, cx - r, cy, "F"); }
  else if (symbol === "►" || symbol === "▷") { pdf.triangle(cx - r, cy - r, cx + r, cy, cx - r, cy + r, "F"); }
  else if (symbol === "★" || symbol === "☆") {
    let pts = [];
    for(let i=0; i<10; i++) {
      let rad = (i%2===0)?r:r*0.4;
      let angle = (i * Math.PI / 5) - Math.PI / 2;
      pts.push([Math.cos(angle)*rad, Math.sin(angle)*rad]);
    }
    let relPts = [];
    for(let i=1; i<10; i++) { relPts.push([pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]]); }
    pdf.lines(relPts, cx+pts[0][0], cy+pts[0][1], [1, 1], symbol === "★" ? "F" : "S", true);
  }
  else if (symbol === "♥" || symbol === "♡") {
    pdf.circle(cx - r2, cy - r2*0.5, r2, symbol === "♥" ? "F" : "S");
    pdf.circle(cx + r2, cy - r2*0.5, r2, symbol === "♥" ? "F" : "S");
    pdf.triangle(cx - r2*2, cy, cx + r2*2, cy, cx, cy + r*1.2, symbol === "♥" ? "F" : "S");
  }
  else if (symbol === "♣" || symbol === "♧") {
    pdf.circle(cx, cy - r2, r2, symbol === "♣" ? "F" : "S");
    pdf.circle(cx - r2, cy + r2*0.5, r2, symbol === "♣" ? "F" : "S");
    pdf.circle(cx + r2, cy + r2*0.5, r2, symbol === "♣" ? "F" : "S");
    pdf.triangle(cx - r2*0.5, cy + r, cx + r2*0.5, cy + r, cx, cy, symbol === "♣" ? "F" : "S");
  }
  else if (symbol === "♠" || symbol === "♤") {
    pdf.circle(cx - r2, cy + r2*0.5, r2, symbol === "♠" ? "F" : "S");
    pdf.circle(cx + r2, cy + r2*0.5, r2, symbol === "♠" ? "F" : "S");
    pdf.triangle(cx - r2*2, cy, cx + r2*2, cy, cx, cy - r*1.2, symbol === "♠" ? "F" : "S");
    pdf.triangle(cx - r2*0.5, cy + r*1.5, cx + r2*0.5, cy + r*1.5, cx, cy, symbol === "♠" ? "F" : "S");
  }
  else if (symbol === "⊕") { pdf.circle(cx, cy, r, "S"); pdf.line(cx - r, cy, cx + r, cy); pdf.line(cx, cy - r, cx, cy + r); }
  else if (symbol === "⊗") { pdf.circle(cx, cy, r, "S"); let r3=r*0.7; pdf.line(cx - r3, cy - r3, cx + r3, cy + r3); pdf.line(cx + r3, cy - r3, cx - r3, cy + r3); }
  else if (symbol === "⊞") { pdf.rect(cx - r, cy - r, r*2, r*2, "S"); pdf.line(cx - r, cy, cx + r, cy); pdf.line(cx, cy - r, cx, cy + r); }
  else if (symbol === "⊠") { pdf.rect(cx - r, cy - r, r*2, r*2, "S"); pdf.line(cx - r, cy - r, cx + r, cy + r); pdf.line(cx + r, cy - r, cx - r, cy + r); }
  else if (symbol === "⊡") { pdf.rect(cx - r, cy - r, r*2, r*2, "S"); pdf.rect(cx - r2*0.5, cy - r2*0.5, r2, r2, "F"); }
  else if (symbol === "⊘") { pdf.circle(cx, cy, r, "S"); pdf.line(cx - r, cy + r, cx + r, cy - r); }
  else if (symbol === "⊙") { pdf.circle(cx, cy, r, "S"); pdf.circle(cx, cy, r*0.2, "F"); }
  else if (symbol === "⊚") { pdf.circle(cx, cy, r, "S"); pdf.circle(cx, cy, r*0.5, "S"); }
  else if (symbol === "⊛") { pdf.circle(cx, cy, r, "S"); let r3=r*0.7; pdf.line(cx - r3, cy - r3, cx + r3, cy + r3); pdf.line(cx + r3, cy - r3, cx - r3, cy + r3); pdf.line(cx - r, cy, cx + r, cy); pdf.line(cx, cy - r, cx, cy + r); }
  else if (symbol === "⊜") { pdf.circle(cx, cy, r, "S"); pdf.line(cx - r*0.8, cy - r*0.3, cx + r*0.8, cy - r*0.3); pdf.line(cx - r*0.8, cy + r*0.3, cx + r*0.8, cy + r*0.3); }
  else if (symbol === "⊝") { pdf.circle(cx, cy, r, "S"); pdf.line(cx - r, cy, cx + r, cy); }
  else if (symbol === "⬡" || symbol === "⬢" || symbol === "⬣") {
    let pts = [];
    for(let i=0; i<6; i++) {
      let angle = (i * Math.PI / 3) - Math.PI / 2;
      pts.push([Math.cos(angle)*r, Math.sin(angle)*r]);
    }
    let relPts = [];
    for(let i=1; i<6; i++) { relPts.push([pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]]); }
    pdf.lines(relPts, cx+pts[0][0], cy+pts[0][1], [1, 1], symbol === "⬡" ? "S" : "F", true);
  }
  else if (symbol === "⬧" || symbol === "⬨" || symbol === "⬩") {
    pdf.lines([[r, r*1.5], [-r, r*1.5], [-r, -r*1.5], [r, -r*1.5]], cx, cy - r*1.5, [1, 1], symbol === "⬧" ? "F" : "S", true);
  }
  else {
    pdf.setFontSize(size * 1.5);
    pdf.text(symbol, cx, cy + size * 0.4, {align:"center"});
  }
}
