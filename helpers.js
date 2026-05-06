var _ckCache={sz:0,canvas:null};
function drawCk(ctx,x,y,s){
  if(s<=0)return;
  if(_ckCache.sz!==s){
    var c=document.createElement("canvas");c.width=s;c.height=s;
    var cx=c.getContext("2d");
    for(var cy2=0;cy2<s;cy2+=CK)for(var cx2=0;cx2<s;cx2+=CK){cx.fillStyle=((Math.floor(cx2/CK)+Math.floor(cy2/CK))%2===0)?"#f0f0f0":"#dcdcdc";cx.fillRect(cx2,cy2,Math.min(CK,s-cx2),Math.min(CK,s-cy2));}
    _ckCache.sz=s;_ckCache.canvas=c;
  }
  ctx.drawImage(_ckCache.canvas,x,y);
}

function fmtTime(s){let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`;}
function fmtTimeL(s){let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return`${h} hr${h>1?"s":""} ${m} min`;return`${m} min`;}
function fmtNum(n){return(n||0).toLocaleString('en-GB');}
// threadKm: 14ct cross stitch ≈ 4mm of thread per stitch (0.004 m). Result in km, 1 d.p.
function threadKm(stitches){return Math.round((stitches||0)*0.004/1000*10)/10;}

// useProjectsAll — React hook returning { metas, fulls, loading } for every
// project in IndexedDB. Action plan §3.3 (Option B). Wraps the cached
// ProjectStorage.getProjectsAll() so multiple effects/components on a page
// share a single IndexedDB read, and re-fetches whenever the
// `cs:projectsChanged` event fires (dispatched by ProjectStorage on save /
// delete and indirectly by SyncEngine writes).
//
// Returns the same { metas, fulls } shape the underlying API returns, plus
// `loading` for convenience. `fulls` and `metas` are aligned by id (not by
// index) — callers that need them paired should index `fulls` by id.
//
// Safe to call on pages that don't ship ProjectStorage (returns the empty
// shape with loading:false); the hook never throws.
function useProjectsAll() {
  if (typeof React === 'undefined') return { metas: [], fulls: [], loading: false };
  var EMPTY = { metas: [], fulls: [], loading: true };
  var stateRef = React.useState(EMPTY);
  var data = stateRef[0];
  var setData = stateRef[1];
  React.useEffect(function() {
    if (typeof window === 'undefined' || !window.ProjectStorage) {
      setData({ metas: [], fulls: [], loading: false });
      return;
    }
    var cancelled = false;
    function load() {
      if (typeof window.ProjectStorage.getProjectsAll !== 'function') {
        setData({ metas: [], fulls: [], loading: false });
        return;
      }
      window.ProjectStorage.getProjectsAll().then(function(out) {
        if (cancelled) return;
        setData({ metas: out.metas || [], fulls: out.fulls || [], loading: false });
      }).catch(function() {
        if (cancelled) return;
        setData({ metas: [], fulls: [], loading: false });
      });
    }
    load();
    function onChange() { load(); }
    window.addEventListener('cs:projectsChanged', onChange);
    return function() {
      cancelled = true;
      window.removeEventListener('cs:projectsChanged', onChange);
    };
  }, []);
  return data;
}
if (typeof window !== 'undefined') window.useProjectsAll = useProjectsAll;


// A3 (UX Phase 5) — pure helper used by the Tracker resume modal recap.
// Returns a short summary of the most recent stitching session, or null when
// no sessions exist. Pure: takes a project object, touches no globals.
//
// Returned shape (or null when project.statsSessions is empty / missing):
//   {
//     count:                 stitches in the last session (number, may be 0),
//     ms:                    duration of the last session in ms,
//     perHour:               stitches per hour for the last session, or null
//                            when duration is zero,
//     perHourAvg:            stitches-per-hour averaged across all recorded
//                            sessions (excluding the last one) — null when
//                            fewer than 3 prior sessions exist,
//     dominantThreadId:      always null today (per-stitch thread tracking is
//                            not stored; reserved for a future schema bump),
//     dominantThreadCount:   always null today.
//   }
//
// Sessions array shape (compatible with both Tracker `statsSessions` and
// older `sessions` arrays): { netStitches?, stitchesCompleted?,
// durationSeconds?, durationMinutes?, ... }.
function lastSessionSummary(project) {
  if (!project || typeof project !== 'object') return null;
  var sessions = project.statsSessions || project.sessions;
  if (!Array.isArray(sessions) || sessions.length === 0) return null;
  function _sessionStitches(s) {
    if (!s || typeof s !== 'object') return 0;
    if (typeof s.netStitches === 'number') return s.netStitches;
    if (typeof s.stitchesCompleted === 'number') return s.stitchesCompleted;
    return 0;
  }
  function _sessionSeconds(s) {
    if (!s || typeof s !== 'object') return 0;
    if (typeof s.durationSeconds === 'number') return s.durationSeconds;
    if (typeof s.durationMinutes === 'number') return s.durationMinutes * 60;
    return 0;
  }
  var last = sessions[sessions.length - 1];
  var count = _sessionStitches(last);
  var seconds = _sessionSeconds(last);
  var ms = Math.round(seconds * 1000);
  var perHour = (seconds > 0 && count > 0) ? Math.round(count / (seconds / 3600)) : null;
  var perHourAvg = null;
  // Only meaningful when there are at least 3 prior sessions to average over,
  // matching the spec ("omit comparison when fewer than 3 sessions").
  if (sessions.length >= 4) {
    var prior = sessions.slice(0, -1);
    var sumSt = 0, sumSec = 0;
    for (var i = 0; i < prior.length; i++) {
      sumSt += _sessionStitches(prior[i]);
      sumSec += _sessionSeconds(prior[i]);
    }
    if (sumSec > 0 && sumSt > 0) perHourAvg = Math.round(sumSt / (sumSec / 3600));
  }
  return {
    count: count,
    ms: ms,
    perHour: perHour,
    perHourAvg: perHourAvg,
    dominantThreadId: null,
    dominantThreadCount: null
  };
}

// Hoisted shared regexes (avoid recompiling per call).
var CSV_QUOTE_RE=/"/g;
var FILENAME_SAFE_RE=/[^a-zA-Z0-9]/g;

// Lazily-built lookup maps for thread palettes; avoids O(n) Array.find per call.
// PERF (perf-4 #1): public getDmcById() and getDmcByIdCI() replace DMC.find() across manager-app, pdf-importer, SubstituteFromStashModal.
var _DMC_BY_ID=null,_DMC_BY_ID_CI=null,_ANCHOR_BY_ID=null;
function _getDmcById(){
  if(_DMC_BY_ID)return _DMC_BY_ID;
  if(typeof DMC==='undefined')return null;
  _DMC_BY_ID=Object.create(null);
  for(var i=0;i<DMC.length;i++)_DMC_BY_ID[DMC[i].id]=DMC[i];
  return _DMC_BY_ID;
}
function getDmcById(id){var m=_getDmcById();return (m&&id!=null)?(m[id]||null):null;}
function getDmcByIdCI(id){
  if(id==null)return null;
  if(!_DMC_BY_ID_CI){
    if(typeof DMC==='undefined')return null;
    _DMC_BY_ID_CI=Object.create(null);
    for(var k=0;k<DMC.length;k++)_DMC_BY_ID_CI[String(DMC[k].id).toLowerCase()]=DMC[k];
  }
  return _DMC_BY_ID_CI[String(id).toLowerCase()]||null;
}
if(typeof window!=='undefined'){window.getDmcById=getDmcById;window.getDmcByIdCI=getDmcByIdCI;}
function _getAnchorById(){
  if(_ANCHOR_BY_ID)return _ANCHOR_BY_ID;
  if(typeof ANCHOR==='undefined')return null;
  _ANCHOR_BY_ID=Object.create(null);
  for(var j=0;j<ANCHOR.length;j++)_ANCHOR_BY_ID[ANCHOR[j].id]=ANCHOR[j];
  return _ANCHOR_BY_ID;
}
// PERF (action plan §2E.1): public getAnchorById() replaces the remaining
// ANCHOR.find() scans across creator/* and stash-bridge.
function getAnchorById(id){var m=_getAnchorById();return (m&&id!=null)?(m[id]||null):null;}
if(typeof window!=='undefined'){window.getAnchorById=getAnchorById;}

function skeinEst(stitchCount,fabricCt){if(typeof stitchesToSkeins==='function'){const result=stitchesToSkeins({stitchCount:stitchCount,fabricCount:fabricCt,strandsUsed:2,wasteFactor:0.20});return Math.max(1,result.skeinsToBuy);}return 1;}

function confettiTier(pct){
  if(pct<2)return{color:"var(--success)",label:"Excellent"};
  if(pct<5)return{color:"var(--success)",label:"Good"};
  if(pct<8)return{color:"#A06F2D",label:"Moderate"};
  if(pct<15)return{color:"var(--accent-hover)",label:"Challenging"};
  return{color:"var(--danger)",label:"High confetti"};
}

function gridCoord(canvasRef,e,cellSize,gutter,snap=false){
  if(!canvasRef.current)return null;
  let rect=canvasRef.current.getBoundingClientRect();
  let mx=e.clientX-rect.left,my=e.clientY-rect.top;
  let gx=snap?Math.round((mx-gutter)/cellSize):Math.floor((mx-gutter)/cellSize);
  let gy=snap?Math.round((my-gutter)/cellSize):Math.floor((my-gutter)/cellSize);
  return{gx,gy};
}

// Difficulty rating — Weighted Linear (Proposal A) with confetti soft floor (Proposal E edge case X-2).
// opts = { fabricCt, bsCount, confettiScore, changeScore }
// Returns { label, color, stars, score, factors } — score 0–100; factors array for the breakdown UI.
// The 3-arg form remains fully supported (opts optional) for backward compat and stats-page use.
function calcDifficulty(palLen,blendCount,totalSt,opts){
  var o=opts||{};
  var fabricCt=typeof o.fabricCt==='number'?o.fabricCt:14;
  var bsCount=typeof o.bsCount==='number'?o.bsCount:0;
  // ── Factor 1: Colour complexity (0–1) ──────────────────────────────────────
  var colRaw=palLen<=5?0.05:palLen<=15?0.05+(palLen-5)*0.027:palLen<=30?0.32+(palLen-15)*0.022:palLen<=50?0.65+(palLen-30)*0.012:Math.min(1,0.89+(palLen-50)*0.006);
  // Blend bonus uses blendCount directly (not a ratio) so colScore stays monotonic in palLen.
  var blendBonus=blendCount<=0?0:blendCount<=3?0.08:blendCount<=8?0.15:0.22;
  var colScore=Math.min(1,colRaw*0.78+blendBonus*0.22);
  // ── Factor 2: Confetti density (0–1) ──────────────────────────────────────
  // Proxy (when confettiScore not provided): use palette size as a stand-in.
  // Must stay monotonic in palLen only (not totalSt) so property tests pass.
  var confScore=typeof o.confettiScore==='number'?Math.min(1,Math.max(0,o.confettiScore)):Math.min(1,palLen<=5?0.04:palLen<=15?0.08:palLen<=30?0.16:palLen<=50?0.28:0.40);
  // ── Factor 3: Colour change rate (0–1) ────────────────────────────────────
  var chgScore=typeof o.changeScore==='number'?Math.min(1,Math.max(0,o.changeScore)):Math.min(1,palLen<=5?0.05:palLen<=15?0.13:palLen<=30?0.24:palLen<=50?0.35:0.46);
  // ── Factor 4: Size & duration (0–1) ───────────────────────────────────────
  var sizeRaw=totalSt<=1000?0.02:totalSt<=5000?0.02+Math.log10(totalSt/1000)*0.12:totalSt<=20000?0.10+Math.log10(totalSt/5000)*0.35:totalSt<=80000?0.35+Math.log10(totalSt/20000)*0.45:Math.min(1,0.75+Math.log10(totalSt/80000)*0.40);
  var fabBonus=fabricCt<=14?0:fabricCt<=18?(fabricCt-14)*0.040:fabricCt<=22?0.16+(fabricCt-18)*0.060:Math.min(0.50,0.40+(fabricCt-22)*0.030);
  var sizeScore=Math.min(1,sizeRaw*0.80+fabBonus*0.20);
  // ── Factor 5: Technique load (0–1) ────────────────────────────────────────
  var bsScore=bsCount<=0?0:bsCount<=10?bsCount*0.020:bsCount<=50?0.20+(bsCount-10)*0.012:Math.min(1,0.68+(bsCount-50)*0.004);
  var precBonus=fabricCt>=25?0.20:fabricCt>=20?0.10:0;
  var techScore=Math.min(1,bsScore*0.70+precBonus*0.30);
  // ── Weighted average: colour 25% · confetti 28% · changes 17% · size 15% · technique 15% ──
  var composite=colScore*0.25+confScore*0.28+chgScore*0.17+sizeScore*0.15+techScore*0.15;
  // ── Soft floor (Proposal E edge case X-2) ─────────────────────────────────
  // Extreme confetti cannot be diluted by easy factors — floor at Intermediate.
  if(confScore>0.70&&composite<0.30)composite=0.30;
  var score=Math.min(100,Math.max(0,Math.round(composite*100)));
  // ── Tier ──────────────────────────────────────────────────────────────────
  var label,color,stars;
  if(score<=25){label='Beginner';color='var(--success)';stars=1;}
  else if(score<=50){label='Intermediate';color='#C49A2B';stars=2;}
  else if(score<=75){label='Advanced';color='var(--accent-hover)';stars=3;}
  else{label='Expert';color='var(--danger)';stars=4;}
  // ── Factor breakdown for UI ────────────────────────────────────────────────
  var factors=[
    {label:'Colour complexity',weight:0.25,score:colScore},
    {label:'Confetti density', weight:0.28,score:confScore},
    {label:'Colour changes',   weight:0.17,score:chgScore},
    {label:'Size & duration',  weight:0.15,score:sizeScore},
    {label:'Technique load',   weight:0.15,score:techScore},
  ];
  return{label:label,color:color,stars:stars,score:score,factors:factors};
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

var _helpersCachedDB = null;
function getDB() {
  if (_helpersCachedDB) {
    try { _helpersCachedDB.transaction(STORE_NAME); return Promise.resolve(_helpersCachedDB); } catch(_) { _helpersCachedDB = null; }
  }
  return new Promise((resolve, reject) => {
    ensurePersistence().catch(() => {});
    let request = indexedDB.open(DB_NAME, 4);
    request.onupgradeneeded = (e) => {
      let db = e.target.result;
      let oldVersion = e.oldVersion;
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_NAME)) { db.createObjectStore(STORE_NAME); }
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains("project_meta")) { db.createObjectStore("project_meta"); }
      }
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains("stats_summaries")) { db.createObjectStore("stats_summaries"); }
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains("sync_snapshots")) { db.createObjectStore("sync_snapshots"); }
      }
    };
    request.onblocked = () => {
      console.warn("CrossStitchDB (helpers) open was blocked by another connection at an older version.");
      reject(new Error("CrossStitchDB open blocked — another tab may be holding an old connection open."));
    };
    request.onsuccess = () => {
      let db = request.result;
      db.onversionchange = () => {
        try { db.close(); } catch(_) {}
        if (_helpersCachedDB === db) _helpersCachedDB = null;
      };
      _helpersCachedDB = db;
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

// Throttle save-failure toasts so a persistent error (e.g. quota exceeded)
// doesn't spam the user once per autosave tick.
let __lastSaveErrorToastAt = 0;
function __surfaceSaveError(err) {
  console.error("Failed to save project to IndexedDB", err);
  try {
    if (typeof window === 'undefined' || !window.Toast || !window.Toast.show) return;
    const now = Date.now();
    if (now - __lastSaveErrorToastAt < 30000) return; // 30s cooldown
    __lastSaveErrorToastAt = now;
    const name = err && err.name ? err.name : '';
    const isQuota = name === 'QuotaExceededError' || /quota/i.test(String(err && err.message || ''));
    const msg = isQuota
      ? "Couldn't save: storage quota exceeded. Free up space or export a backup."
      : "Couldn't save your project. Changes may be lost on reload.";
    window.Toast.show({ message: msg, type: "error", duration: 10000 });
  } catch (_) { /* never let toast surface throw */ }
}

async function saveProjectToDB(project) {
  // Skip saving if the project was deleted during this page session
  if (project && project.id && typeof ProjectStorage !== 'undefined' && ProjectStorage.isDeleted(project.id)) return;
  try {
    const db = await getDB();
    return await new Promise((resolve, reject) => {
      let tx = db.transaction(STORE_NAME, "readwrite");
      let store = tx.objectStore(STORE_NAME);
      let request = store.put(project, "auto_save");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    __surfaceSaveError(err);
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

// ═══ Partial-stitch analysis and drawing helpers ═══
// Composite stitch detection and industry-standard rendering.
//
// analysePartialStitches() converts raw quadrant data into high-level stitch
// instructions (three-quarter, quarter, half) used by both the canvas renderer
// and PDF exporter.
//
// Visual convention (¾+¼ pair tiles the cell exactly along one diagonal):
//   ¾ stitch: half-cell triangle fill + full diagonal + short leg to centre
//   ¼ stitch: complementary half-cell triangle + short corner→centre line
//   ½ stitch: both diagonal quadrant triangles + full diagonal line
//
// Corner coordinates:
//   TL=(px,   py),      TR=(px+cSz, py)
//   BL=(px,   py+cSz),  BR=(px+cSz, py+cSz)
//   Centre = (px+cSz/2, py+cSz/2)

// Analyse a partialStitches entry and return rendering instructions.
// @param {object} psEntry   – {TL?,TR?,BL?,BR?} from partialStitches Map
// @param {object} baseCell  – pat[] entry for the underlying cell (may be skip/empty)
// @returns {Array}          – StitchInstruction objects
function analysePartialStitches(psEntry, baseCell) {
  if (!psEntry) return [];
  var quadrants = ["TL", "TR", "BL", "BR"];
  var filled = {};
  quadrants.forEach(function(q) {
    var src = psEntry[q];
    if (!src && baseCell && baseCell.id !== "__skip__" && baseCell.id !== "__empty__") {
      src = { id: baseCell.id, rgb: baseCell.rgb };
    }
    if (src) filled[q] = src;
  });
  var filledList = quadrants.filter(function(q) { return !!filled[q]; });
  if (filledList.length === 0) return [];
  // Group quadrants by colour ID
  var colourGroups = {};
  filledList.forEach(function(q) {
    var id = filled[q].id;
    if (!colourGroups[id]) colourGroups[id] = { colour: filled[q], corners: [] };
    colourGroups[id].corners.push(q);
  });
  var instructions = [];
  var handled = {};
  // ¾ pattern: exactly 3 quadrants of same colour
  Object.keys(colourGroups).forEach(function(id) {
    var group = colourGroups[id];
    if (group.corners.length === 3) {
      // PERF (perf-4 #9): O(1) Set membership beats Array.indexOf scan.
      var cornerSet = new Set(group.corners);
      var emptyCorner = quadrants.filter(function(q) { return !cornerSet.has(q); })[0];
      instructions.push({ type: "three-quarter", colour: group.colour, emptyCorner: emptyCorner });
      group.corners.forEach(function(q) { handled[q] = true; });
    }
  });
  // ½ pattern: exactly 2 quadrants of same colour on a diagonal
  Object.keys(colourGroups).forEach(function(id) {
    var group = colourGroups[id];
    if (group.corners.length !== 2) return;
    if (group.corners.some(function(q) { return handled[q]; })) return;
    var sorted = group.corners.slice().sort().join(",");
    var dir = null;
    if (sorted === "BL,TR") dir = "fwd";   // / diagonal
    if (sorted === "BR,TL") dir = "bck";   // \ diagonal
    if (dir) {
      instructions.push({ type: "half", colour: group.colour, direction: dir });
      group.corners.forEach(function(q) { handled[q] = true; });
    }
  });
  // Remaining unhandled explicit overrides → ¼ stitches
  quadrants.forEach(function(q) {
    if (handled[q] || !psEntry[q]) return;
    instructions.push({ type: "quarter", colour: filled[q], corner: q });
  });
  return instructions;
}

// Fill the two diagonal quadrant areas for a half stitch (subtle colour hint).
// direction: "fwd" (BL+TR, / diagonal) or "bck" (TL+BR, \ diagonal)
function drawHalfTriangle(ctx, px, py, cSz, direction, rgb, alpha) {
  if (alpha <= 0) return;
  var tintAlpha = alpha * 0.28;
  ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + tintAlpha + ")";
  var mx = px + cSz / 2, my = py + cSz / 2;
  if (direction === "fwd") {
    ctx.beginPath();
    ctx.moveTo(px, py + cSz); ctx.lineTo(mx, py + cSz); ctx.lineTo(mx, my); ctx.lineTo(px, my);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px + cSz, py); ctx.lineTo(px + cSz, my); ctx.lineTo(mx, my); ctx.lineTo(mx, py);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(px, py); ctx.lineTo(mx, py); ctx.lineTo(mx, my); ctx.lineTo(px, my);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px + cSz, py + cSz); ctx.lineTo(mx, py + cSz); ctx.lineTo(mx, my); ctx.lineTo(px + cSz, my);
    ctx.closePath(); ctx.fill();
  }
}

// Draw the full diagonal line for a half stitch.
// direction: "fwd" (BL→TR, /) or "bck" (TL→BR, \). lw: explicit line width.
function drawHalfLine(ctx, px, py, cSz, direction, rgb, alpha, lw) {
  if (alpha <= 0) return;
  var pad = Math.max(1, cSz * 0.07);
  ctx.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
  ctx.lineWidth = lw || Math.max(1, cSz * 0.13);
  ctx.lineCap = "round";
  ctx.beginPath();
  if (direction === "fwd") {
    ctx.moveTo(px + pad, py + cSz - pad); ctx.lineTo(px + cSz - pad, py + pad);
  } else {
    ctx.moveTo(px + pad, py + pad); ctx.lineTo(px + cSz - pad, py + cSz - pad);
  }
  ctx.stroke();
}

// Draw a symbol centred on the half stitch cell.
function drawHalfSymbol(ctx, px, py, cSz, direction, symbol, color) {
  ctx.fillStyle = color;
  ctx.font = "bold " + Math.max(4, cSz * 0.32) + "px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol, px + cSz / 2, py + cSz / 2);
}

// Draw a ¾ stitch: half-cell triangle + full diagonal + short leg from third corner.
// emptyCorner: the corner NOT covered — the complementary ¼ sits there.
function drawThreeQuarterStitch(ctx, px, py, cSz, colour, emptyCorner, alpha, view, symbol) {
  if (alpha <= 0) return;
  var rgb = colour.rgb;
  var mx = px + cSz / 2, my = py + cSz / 2;
  // Step 1: Fill the ¾ area (half-cell triangle on the ¾ side of the diagonal)
  ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
  ctx.beginPath();
  switch (emptyCorner) {
    case "TL": // lower-right / triangle: TR→BR→BL→centre
      ctx.moveTo(px + cSz, py);       ctx.lineTo(px + cSz, py + cSz);
      ctx.lineTo(px, py + cSz);       ctx.lineTo(mx, my);      break;
    case "TR": // lower-left \ triangle: TL→centre→BR→BL
      ctx.moveTo(px, py);             ctx.lineTo(mx, my);
      ctx.lineTo(px + cSz, py + cSz); ctx.lineTo(px, py + cSz); break;
    case "BL": // upper-right \ triangle: TL→TR→BR→centre
      ctx.moveTo(px, py);             ctx.lineTo(px + cSz, py);
      ctx.lineTo(px + cSz, py + cSz); ctx.lineTo(mx, my);      break;
    case "BR": // upper-left / triangle: TL→TR→centre→BL
      ctx.moveTo(px, py);             ctx.lineTo(px + cSz, py);
      ctx.lineTo(mx, my);             ctx.lineTo(px, py + cSz); break;
  }
  ctx.closePath();
  ctx.fill();
  // Step 2: Draw stitch lines
  if (cSz >= 5) {
    var lw = Math.max(1, cSz * 0.12);
    var pad = Math.max(1, cSz * 0.07);
    ctx.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + Math.min(1, alpha + 0.2) + ")";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    // Full diagonal leg (does NOT touch the empty corner)
    ctx.beginPath();
    switch (emptyCorner) {
      case "TL": case "BR": // full leg = / (BL→TR)
        ctx.moveTo(px + pad, py + cSz - pad); ctx.lineTo(px + cSz - pad, py + pad); break;
      case "TR": case "BL": // full leg = \ (TL→BR)
        ctx.moveTo(px + pad, py + pad); ctx.lineTo(px + cSz - pad, py + cSz - pad); break;
    }
    ctx.stroke();
    // Short leg: third corner → centre
    ctx.beginPath();
    switch (emptyCorner) {
      case "TL": ctx.moveTo(px + cSz - pad, py + cSz - pad); ctx.lineTo(mx, my); break; // BR→ctr
      case "TR": ctx.moveTo(px + pad,       py + cSz - pad); ctx.lineTo(mx, my); break; // BL→ctr
      case "BL": ctx.moveTo(px + cSz - pad, py + pad);       ctx.lineTo(mx, my); break; // TR→ctr
      case "BR": ctx.moveTo(px + pad,       py + pad);       ctx.lineTo(mx, my); break; // TL→ctr
    }
    ctx.stroke();
  }
  // Step 3: Symbol in ¾ centroid (true quadrilateral centroid)
  if (cSz >= 10 && symbol && (view === "symbol" || view === "both")) {
    var sx, sy;
    switch (emptyCorner) {
      case "TL": sx = px + cSz * 0.625; sy = py + cSz * 0.625; break;
      case "TR": sx = px + cSz * 0.375; sy = py + cSz * 0.625; break;
      case "BL": sx = px + cSz * 0.625; sy = py + cSz * 0.375; break;
      case "BR": sx = px + cSz * 0.375; sy = py + cSz * 0.375; break;
    }
    var lum = luminance(rgb);
    ctx.fillStyle = view === "both" ? (lum > 128 ? "#000" : "#fff") : "#333";
    var fontSize = Math.max(5, Math.round(cSz * 0.32));
    ctx.font = "bold " + fontSize + "px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol, sx, sy);
  }
  if (view === "symbol" && cSz >= 8) {
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    switch (emptyCorner) {
      case "TL":
        ctx.moveTo(px + cSz, py);
        ctx.lineTo(px + cSz, py + cSz);
        ctx.lineTo(px, py + cSz);
        ctx.lineTo(mx, my);
        break;
      case "TR":
        ctx.moveTo(px, py);
        ctx.lineTo(mx, my);
        ctx.lineTo(px + cSz, py + cSz);
        ctx.lineTo(px, py + cSz);
        break;
      case "BL":
        ctx.moveTo(px, py);
        ctx.lineTo(px + cSz, py);
        ctx.lineTo(px + cSz, py + cSz);
        ctx.lineTo(mx, my);
        break;
      case "BR":
        ctx.moveTo(px, py);
        ctx.lineTo(px + cSz, py);
        ctx.lineTo(mx, my);
        ctx.lineTo(px, py + cSz);
        break;
    }
    ctx.closePath();
    ctx.stroke();
  }
}

// Draw a ¼ stitch: complementary half-cell triangle + short corner→centre line.
// corner: "TL"|"TR"|"BL"|"BR" — which corner this ¼ occupies.
function drawQuarterStitch(ctx, px, py, cSz, colour, corner, alpha, view, symbol) {
  if (alpha <= 0) return;
  var rgb = colour.rgb;
  var mx = px + cSz / 2, my = py + cSz / 2;
  // Step 1: Fill the ¼ area (complementary half-cell triangle)
  ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha + ")";
  ctx.beginPath();
  switch (corner) {
    case "TL": // upper-left / triangle: TL→TR→centre→BL
      ctx.moveTo(px, py);         ctx.lineTo(px + cSz, py);
      ctx.lineTo(mx, my);         ctx.lineTo(px, py + cSz);   break;
    case "TR": // upper-right \ triangle: TR→BR→centre→TL
      ctx.moveTo(px + cSz, py);   ctx.lineTo(px + cSz, py + cSz);
      ctx.lineTo(mx, my);         ctx.lineTo(px, py);          break;
    case "BL": // lower-left \ triangle: BL→TL→centre→BR
      ctx.moveTo(px, py + cSz);   ctx.lineTo(px, py);
      ctx.lineTo(mx, my);         ctx.lineTo(px + cSz, py + cSz); break;
    case "BR": // lower-right / triangle: BR→BL→centre→TR
      ctx.moveTo(px + cSz, py + cSz); ctx.lineTo(px, py + cSz);
      ctx.lineTo(mx, my);             ctx.lineTo(px + cSz, py); break;
  }
  ctx.closePath();
  ctx.fill();
  // Step 2: Stitch line from corner to centre
  if (cSz >= 5) {
    var pad = Math.max(1, cSz * 0.07);
    ctx.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + Math.min(1, alpha + 0.2) + ")";
    ctx.lineWidth = Math.max(1, cSz * 0.1);
    ctx.lineCap = "round";
    ctx.beginPath();
    switch (corner) {
      case "TL": ctx.moveTo(px + pad,       py + pad);       ctx.lineTo(mx, my); break;
      case "TR": ctx.moveTo(px + cSz - pad, py + pad);       ctx.lineTo(mx, my); break;
      case "BL": ctx.moveTo(px + pad,       py + cSz - pad); ctx.lineTo(mx, my); break;
      case "BR": ctx.moveTo(px + cSz - pad, py + cSz - pad); ctx.lineTo(mx, my); break;
    }
    ctx.stroke();
  }
  // Step 3: Symbol in corner quadrant (inward-nudged centroid)
  if (cSz >= 14 && symbol && (view === "symbol" || view === "both")) {
    var sx, sy;
    switch (corner) {
      case "TL": sx = px + cSz * 0.29; sy = py + cSz * 0.29; break;
      case "TR": sx = px + cSz * 0.71; sy = py + cSz * 0.29; break;
      case "BL": sx = px + cSz * 0.29; sy = py + cSz * 0.71; break;
      case "BR": sx = px + cSz * 0.71; sy = py + cSz * 0.71; break;
    }
    var lum = luminance(rgb);
    ctx.fillStyle = view === "both" ? (lum > 128 ? "#000" : "#fff") : "#333";
    var fontSize = Math.max(5, Math.round(cSz * 0.24));
    ctx.font = "bold " + fontSize + "px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol, sx, sy);
  }
  if (view === "symbol" && cSz >= 8) {
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    switch (corner) {
      case "TL": ctx.moveTo(px, py); ctx.lineTo(mx, my); ctx.lineTo(px, my); break;
      case "TR": ctx.moveTo(px + cSz, py); ctx.lineTo(mx, my); ctx.lineTo(px + cSz, my); break;
      case "BL": ctx.moveTo(px, py + cSz); ctx.lineTo(mx, my); ctx.lineTo(px, my); break;
      case "BR": ctx.moveTo(px + cSz, py + cSz); ctx.lineTo(mx, my); ctx.lineTo(px + cSz, my); break;
    }
    ctx.closePath();
    ctx.stroke();
  }
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

function getSessionSeconds(s) {
  return s.durationSeconds != null ? s.durationSeconds : (s.durationMinutes || 0) * 60;
}

function computeWeightedPace(sessions, daysWindow) {
  daysWindow = daysWindow || 14;
  if (!sessions || sessions.length === 0) return null;
  var dailyTotals = {};
  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    dailyTotals[s.date] = (dailyTotals[s.date] || 0) + s.netStitches;
  }
  var dates = Object.keys(dailyTotals).sort().reverse().slice(0, daysWindow);
  if (dates.length === 0) return null;
  var weightedSum = 0;
  var totalWeight = 0;
  for (var j = 0; j < dates.length; j++) {
    var weight = dates.length - j;
    weightedSum += dailyTotals[dates[j]] * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}

function computeOverviewStats(statsSessions, totalCompleted, totalStitches, useActiveDays) {
  var totalSeconds = statsSessions.reduce(function(sum, s) { return sum + getSessionSeconds(s); }, 0);
  var totalHours = totalSeconds / 3600;
  var totalMinutes = Math.round(totalSeconds / 60);
  var totalNetStitches = statsSessions.reduce(function(sum, s) { return sum + s.netStitches; }, 0);
  var stitchesPerHour = totalHours > 0 ? Math.round(totalNetStitches / totalHours) : 0;
  var uniqueDays = new Set(statsSessions.map(function(s) { return s.date; })).size;
  var sortedDates = Array.from(new Set(statsSessions.map(function(s) { return s.date; }))).sort();
  var firstDate = sortedDates.length > 0 ? new Date(sortedDates[0] + 'T12:00:00') : null;
  var elapsedDays = firstDate ? Math.max(1, Math.ceil((Date.now() - firstDate.getTime()) / 86400000)) : uniqueDays;
  var avgPerActiveDay = uniqueDays > 0 ? Math.round(totalNetStitches / uniqueDays) : 0;
  var avgPerCalendarDay = elapsedDays > 0 ? Math.round(totalNetStitches / elapsedDays) : 0;
  var avgPerDay = (useActiveDays !== false) ? avgPerActiveDay : avgPerCalendarDay;
  var remaining = totalStitches - totalCompleted;
  var recentPace = computeWeightedPace(statsSessions, 14);
  var paceForEstimate = recentPace || avgPerDay;
  var daysRemaining = paceForEstimate > 0 ? Math.ceil(remaining / paceForEstimate) : null;
  var estimatedDate = daysRemaining ? new Date(Date.now() + daysRemaining * 86400000) : null;
  var hoursRemaining = (stitchesPerHour > 0 && remaining > 0) ? remaining / stitchesPerHour : null;
  return {
    percent: totalStitches > 0 ? Math.round((totalCompleted / totalStitches) * 1000) / 10 : 0,
    stitchesPerHour: stitchesPerHour,
    totalTimeFormatted: formatStatsDuration(totalSeconds),
    estimatedCompletion: estimatedDate
      ? estimatedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—',
    daysRemaining: daysRemaining,
    hoursRemaining: hoursRemaining,
    remaining: remaining,
    avgPerDay: avgPerDay,
    avgPerActiveDay: avgPerActiveDay,
    avgPerCalendarDay: avgPerCalendarDay,
    recentPace: recentPace,
    totalMinutes: totalMinutes,
    totalSeconds: totalSeconds,
    uniqueDays: uniqueDays,
    activeDays: uniqueDays,
    elapsedDays: elapsedDays
  };
}

// Shared helper: filter sessions by a date matcher and sum netStitches.
function filterSessionsByDateRange(sessions, matcher) {
  return (sessions || []).filter(matcher).reduce(function(sum, s) { return sum + s.netStitches; }, 0);
}

function getStatsTodayStitches(sessions, dayEndHour) {
  var today = getStitchingDate(new Date(), dayEndHour || 0);
  return filterSessionsByDateRange(sessions, function(s) { return s.date === today; });
}

function getStatsTodaySeconds(sessions, dayEndHour) {
  var today = getStitchingDate(new Date(), dayEndHour || 0);
  return (sessions || []).filter(function(s) { return s.date === today; }).reduce(function(sum, s) { return sum + getSessionSeconds(s); }, 0);
}

function getStatsThisWeekStitches(sessions, dayEndHour) {
  var todayStr = getStitchingDate(new Date(), dayEndHour || 0);
  var today = new Date(todayStr + 'T00:00:00');
  var dayOfWeek = today.getDay();
  var mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  var monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  var mondayStr = formatLocalDateYYYYMMDD(monday);
  return filterSessionsByDateRange(sessions, function(s) { return s.date >= mondayStr; });
}

function getStatsThisMonthStitches(sessions, dayEndHour) {
  var today = getStitchingDate(new Date(), dayEndHour || 0);
  var monthPrefix = today.slice(0, 7);
  return filterSessionsByDateRange(sessions, function(s) { return s.date && s.date.startsWith(monthPrefix); });
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

function formatStatsDuration(seconds) {
  var minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1m';
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
    var d = new Date(today + 'T12:00:00');
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
  if ((dayEndHour || 0) > 0 && yesterdayD.getHours() < (dayEndHour || 0)) {
    yesterdayD.setDate(yesterdayD.getDate() - 1);
  }
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
    (projectName || 'Cross Stitch Project') + ' — Progress Update',
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    '[x] ' + totalCompleted.toLocaleString() + ' / ' + totalStitches.toLocaleString() + ' stitches (' + percent + '%)',
    'Time: ' + formatStatsDuration(stats.totalSeconds) + ' across ' + sessions.length + ' session' + (sessions.length !== 1 ? 's' : ''),
    'Speed: ' + stats.stitchesPerHour + ' stitches/hour · ' + stats.avgPerDay + '/day average'
  ];

  if (streaks.current > 0 || streaks.longest > 0) {
    lines.push('Streak: ' + streaks.current + ' day' + (streaks.current !== 1 ? 's' : '') + ' (longest: ' + streaks.longest + ')');
  }

  if (bestDay) {
    lines.push('Best day: ' + bestDay.stitches + ' stitches (' + formatShortDate(bestDay.date) + ')');
  }

  if (stats.estimatedCompletion && stats.estimatedCompletion !== '\u2014') {
    var etaLine = 'Est. completion: ' + stats.estimatedCompletion;
    if (stats.hoursRemaining != null) {
      var hr = stats.hoursRemaining;
      var hrStr = hr < 1 ? '< 1' : '~' + Math.ceil(hr);
      etaLine += ' (' + hrStr + (Math.ceil(hr) === 1 ? ' hr' : ' hrs') + ' stitching remaining)';
    }
    lines.push(etaLine);
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
    var note = (s.note || '').replace(CSV_QUOTE_RE, '""');
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
  var safeName = (projectName || 'cross-stitch').replace(FILENAME_SAFE_RE, '_');
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
    .filter(function(s) { return getSessionSeconds(s) >= 600 && s.netStitches > 0; })
    .map(function(s) {
      return {
        date: s.date,
        speed: Math.round(s.netStitches / (getSessionSeconds(s) / 3600))
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

// Merge two selection masks using the given operation mode.
function mergeMasks(existing, newMask, opMode, size) {
  var out = new Uint8Array(size);
  for (var i = 0; i < size; i++) {
    var e = existing ? existing[i] : 0;
    var n = newMask[i];
    if (opMode === "add")        out[i] = (e || n) ? 1 : 0;
    else if (opMode === "subtract")  out[i] = (e && !n) ? 1 : 0;
    else if (opMode === "intersect") out[i] = (e && n) ? 1 : 0;
    else                         out[i] = n; // replace
  }
  return out;
}

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

// ═══ Visual Progress: Section colour helper ═══
function sectionColor(pct){
  if(pct>=100)return'var(--success)';
  if(pct>=75)return'var(--success)';
  if(pct>=50)return'#A06F2D';
  if(pct>=25)return'var(--accent-hover)';
  if(pct>0)return'#C77878';
  return'var(--border)';
}

// ═══ Visual Progress: Comparison canvas renderers ═══
// Renders a mini-canvas showing the done-state of a pattern.
// doneArray: Uint8Array (or array-like) of 0/1 values, same length as pat.
function renderComparisonCanvas(canvas,pat,sW,sH,doneArray){
  var cSz=Math.min(3,Math.floor(300/Math.max(sW,sH)));if(cSz<1)cSz=1;
  canvas.width=sW*cSz;canvas.height=sH*cSz;
  var ctx=canvas.getContext('2d');
  for(var y=0;y<sH;y++){for(var x=0;x<sW;x++){
    var idx=y*sW+x;var m=pat[idx];
    if(!m||m.id==='__skip__'||m.id==='__empty__'){ctx.fillStyle='#f8f8f8';}
    else if(doneArray&&doneArray[idx]){ctx.fillStyle='rgb('+m.rgb[0]+','+m.rgb[1]+','+m.rgb[2]+')';}
    else{ctx.fillStyle='#e8e8e8';}
    ctx.fillRect(x*cSz,y*cSz,cSz,cSz);
  }}
}

// Renders a diff canvas: new stitches in full colour, already-done in grey, undone in off-white.
function renderDiffCanvas(canvas,pat,sW,sH,oldDone,newDone){
  var cSz=Math.min(3,Math.floor(300/Math.max(sW,sH)));if(cSz<1)cSz=1;
  canvas.width=sW*cSz;canvas.height=sH*cSz;
  var ctx=canvas.getContext('2d');
  for(var idx=0;idx<pat.length;idx++){
    var x=idx%sW,y=Math.floor(idx/sW);var m=pat[idx];
    if(!m||m.id==='__skip__'||m.id==='__empty__'){ctx.fillStyle='#f8f8f8';}
    else if(!oldDone[idx]&&newDone[idx]){ctx.fillStyle='rgb('+m.rgb[0]+','+m.rgb[1]+','+m.rgb[2]+')';}
    else if(newDone[idx]){ctx.fillStyle='#e0e0e0';}
    else{ctx.fillStyle='#f8f8f8';}
    ctx.fillRect(x*cSz,y*cSz,cSz,cSz);
  }
}

// ═══ Global Stats Dashboard helpers ═══
function formatYMD(date){var y=date.getFullYear(),m=('0'+(date.getMonth()+1)).slice(-2),d=('0'+date.getDate()).slice(-2);return y+'-'+m+'-'+d;}
function formatDurationCompact(seconds){return formatStatsDuration(seconds);}
function subtractOneDay(dateStr){var d=new Date(dateStr+'T12:00:00');d.setDate(d.getDate()-1);return formatYMD(d);}
function dayDiff(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000);}
function formatHour(h){if(h===0)return'12am';if(h<12)return h+'am';if(h===12)return'12pm';return(h-12)+'pm';}
function formatDateReadable(dateStr){return new Date(dateStr+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}

// ═══ Thread composite-key helpers ═══
// threadKey('dmc','310') → 'dmc:310'
function threadKey(brand,id){return brand+':'+id;}
if(typeof window!=='undefined')window.threadKey=threadKey;

// parseThreadKey('dmc:310') → {brand:'dmc',id:'310'}
// parseThreadKey('310')     → {brand:'dmc',id:'310'}  ← legacy bare key falls back to DMC
// Note: non-string keys are coerced to strings as a defensive fallback for legacy
// data (numeric ids); callers should pass strings.
function parseThreadKey(key){
  if(typeof key!=='string')return{brand:'dmc',id:String(key)};
  var i=key.indexOf(':');
  if(i<0)return{brand:'dmc',id:key};
  return{brand:key.slice(0,i),id:key.slice(i+1)};
}
if(typeof window!=='undefined')window.parseThreadKey=parseThreadKey;

// Looks up the thread object by composite key; returns null if not found.
function getThreadByKey(key){
  var p=parseThreadKey(key);
  if(p.brand==='anchor'){
    var aMap=_getAnchorById();
    return aMap?(aMap[p.id]||null):null;
  }
  var dMap=_getDmcById();
  return dMap?(dMap[p.id]||null):null;
}
if(typeof window!=='undefined')window.getThreadByKey=getThreadByKey;

// classifyMatch(deltaE, isOfficial)
// Returns {kind, deltaE, label} where kind is 'exact'|'near'|'different'|'distant'.
// Thresholds: exact ≤2, near ≤5 (UNIQUE_THRESHOLD_DE), different ≤10, else distant.
function classifyMatch(deltaE,isOfficial){
  var thresh=typeof UNIQUE_THRESHOLD_DE!=='undefined'?UNIQUE_THRESHOLD_DE:5;
  var kind,label;
  if(isOfficial&&deltaE<=thresh){kind='exact';label='Official match';}
  else if(deltaE<=2){kind='exact';label='Near-identical';}
  else if(deltaE<=thresh){kind='near';label='Close match';}
  else if(deltaE<=10){kind='different';label='Approximate match';}
  else{kind='distant';label='Distant match';}
  return{kind:kind,deltaE:deltaE,label:label};
}
if(typeof window!=='undefined')window.classifyMatch=classifyMatch;

// ═══ Thread catalogue & blend helpers (cross-file consolidation) ═══════════
// Single source of truth for catalogue lookup, brand resolution, blend
// parsing and stash-key normalisation. See reports/code-quality-02-duplication.md.

// Looks up a thread by brand+id in the appropriate catalogue (DMC or ANCHOR).
// Returns the thread object or null. Uses the pre-indexed maps from helpers.js.
function findThreadInCatalog(brand,id){
  if(brand==='anchor'){var aMap=_getAnchorById();return aMap?(aMap[id]||null):null;}
  var dMap=_getDmcById();return dMap?(dMap[id]||null):null;
}
if(typeof window!=='undefined')window.findThreadInCatalog=findThreadInCatalog;

// Determines which brand a bare id belongs to. Tries DMC first, then ANCHOR.
// Returns 'dmc' (default) or 'anchor'.
function resolveBrandForId(id){
  if(typeof DMC!=='undefined'){var dMap=_getDmcById();if(dMap&&dMap[id])return 'dmc';}
  if(typeof ANCHOR!=='undefined'){var aMap=_getAnchorById();if(aMap&&aMap[id])return 'anchor';}
  return 'dmc';
}
if(typeof window!=='undefined')window.resolveBrandForId=resolveBrandForId;

// True if the id contains a '+' indicating a 2-thread blend (e.g. '310+550').
function isBlendId(id){return typeof id==='string'&&id.indexOf('+')>=0;}
if(typeof window!=='undefined')window.isBlendId=isBlendId;

// Splits a blend id into its component base ids; returns [id] for non-blends.
// Trims whitespace and drops empty parts so '310 + 550' → ['310','550'].
function splitBlendId(id){
  if(typeof id!=='string'||id.indexOf('+')<0)return[String(id||'')];
  return id.split('+').map(function(s){return s.trim();}).filter(Boolean);
}
if(typeof window!=='undefined')window.splitBlendId=splitBlendId;

// Normalises any thread reference (bare id or composite key) to a composite
// stash key. Bare ids fall back to the 'dmc' brand. Returns null for null/undefined.
function normaliseStashKey(idOrKey){
  if(idOrKey==null)return null;
  var s=String(idOrKey);
  return s.indexOf(':')<0?('dmc:'+s):s;
}
if(typeof window!=='undefined')window.normaliseStashKey=normaliseStashKey;

// ── Premium feature gate ─────────────────────────────────────────
// Stub: always returns true. Flip this to add gating later.
function isPremium(){return true;}
if(typeof window!=='undefined')window.isPremium=isPremium;

// ═══ PERF (deferred-1): rgb-stripping save helper ════════════════════════════
// See reports/deferred-1-rgb-stripping-analysis.md.
//
// Rationale: every saved snapshot stores a redundant rgb triple per cell.
// For a 200x200 / 20-colour pattern this is ~240 KB of pure duplication on
// every autosave. The Creator/Tracker load path (`restoreStitch` in
// colour-utils.js) already hydrates rgb from the DMC catalogue, so we can
// safely drop rgb on disk for any cell whose colour can be reconstructed.
//
// Safety rule: only strip when the catalogue can reproduce the rgb exactly.
// Cells whose stored rgb has drifted from the catalogue (e.g. after a
// palette swap) keep their explicit rgb so colour data is never lost.
//
// Feature flag: window.PERF_FLAGS.stripRgbOnSave (default true). Setting it
// to false restores the legacy {id, type, rgb} shape byte-for-byte. Both
// shapes load identically via restoreStitch — no migration needed.
if(typeof window!=='undefined'){
  window.PERF_FLAGS=window.PERF_FLAGS||{};
  if(window.PERF_FLAGS.stripRgbOnSave===undefined)window.PERF_FLAGS.stripRgbOnSave=true;
}

function _rgbEq(a,b){
  return !!(a&&b&&a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]);
}

// Returns the on-disk shape for a single pattern cell.
function stripCellForSave(m){
  if(!m)return m;
  // Skip / empty placeholders are already minimal — rgb is fixed at load time.
  if(m.id==='__skip__'||m.id==='__empty__')return{id:m.id};
  // Honour the kill-switch: emit the legacy shape when stripping is disabled.
  var flags=(typeof window!=='undefined'&&window.PERF_FLAGS)||{};
  if(flags.stripRgbOnSave===false){
    return{id:m.id,type:m.type,rgb:m.rgb};
  }
  // Cell already lacks rgb (nothing to strip; pass through cleanly).
  if(!m.rgb)return{id:m.id,type:m.type};
  var mr=m.rgb;
  // Blends: only safe to strip when both halves are DMC and the stored rgb
  // matches the per-channel average — that is exactly what restoreStitch
  // reconstructs.
  if(m.type==='blend'&&typeof m.id==='string'&&m.id.indexOf('+')>=0){
    var ids=splitBlendId(m.id);
    if(ids.length===2){
      var t0=findThreadInCatalog('dmc',ids[0]);
      var t1=findThreadInCatalog('dmc',ids[1]);
      if(t0&&t1){
        var ar=Math.round((t0.rgb[0]+t1.rgb[0])/2);
        var ag=Math.round((t0.rgb[1]+t1.rgb[1])/2);
        var ab=Math.round((t0.rgb[2]+t1.rgb[2])/2);
        if(ar===mr[0]&&ag===mr[1]&&ab===mr[2])return{id:m.id,type:m.type};
      }
    }
    return{id:m.id,type:m.type,rgb:m.rgb};
  }
  // Solids: strip iff the DMC catalogue has a byte-identical rgb.
  var dmc=findThreadInCatalog('dmc',m.id);
  if(dmc&&dmc.rgb&&dmc.rgb[0]===mr[0]&&dmc.rgb[1]===mr[1]&&dmc.rgb[2]===mr[2])return{id:m.id,type:m.type};
  return{id:m.id,type:m.type,rgb:m.rgb};
}
if(typeof window!=='undefined')window.stripCellForSave=stripCellForSave;

// Convenience wrapper for the common pat.map(...) site.
function serializePattern(pat){
  if(!pat||!pat.map)return pat;
  return pat.map(stripCellForSave);
}
if(typeof window!=='undefined'){
  window.serializePattern=serializePattern;
  window.PatternIO=window.PatternIO||{};
  window.PatternIO.stripCellForSave=stripCellForSave;
  window.PatternIO.serializePattern=serializePattern;
}
