/* progress-units.js — the one definition of "how far along".
 *
 * Every progress figure (the Tracker's strip, header and popover, project and global Stats, Home cards, the library,
 * share text, the progress image, the stash completion status) comes from here, so they cannot disagree
 * (tracking audit STATS-01). A project's progress is measured in UNITS: one full cross stitch is one unit, and the
 * other stitch types count for a fraction of one, set in the WEIGHTS table below. Change a weight, or add a type
 * (Phase 6 adds quarter, petite and backstitch tracking), by editing that one table.
 *
 *   counts → { full: {done, total}, half: {done, total}, knot: {done, total}, ... }
 *
 * `half` counts half-stitch SIDES (a cell with both legs is two), as the Tracker's counters do.
 * `quarter` counts quarter stitches (fractional.js), a quarter of a full stitch each. Backstitch is listed separately:
 * it is not part of the percentage.
 *
 * Older sessions mixed units (a half stitch was counted as a whole stitch); they are never rewritten. New
 * sessions carry `units`, and sessionNet() reads `units` when it is there and `netStitches` otherwise.
 *
 * Plain script (window.ProgressUnits) and require()-able for tests.
 */
(function (root) {
  // type → weight in units. One row per stitch type; this is the only place the weights live.
  var WEIGHTS = { full: 1, half: 0.5, quarter: 0.25, petite: 0.25, long_stitch: 0.5, knot: 1 };
  // Short names for "2 half, 1 knot" style breakdowns.
  var LABELS = { full: "full", half: "half", quarter: "quarter", petite: "petite", long_stitch: "long stitch", knot: "knot" };
  var ORDER = ["full", "half", "quarter", "petite", "long_stitch", "knot"];
  // Counted on their own, not in the percentage.
  var SEPARATE = ["backstitch"];

  function num(v) { return typeof v === "number" && isFinite(v) && v > 0 ? v : 0; }

  // opts.include: an array of type names (or an object of name: boolean) limiting which types count, for
  // "visible layers only" figures. Absent means all types.
  function included(type, include) {
    if (!include) return true;
    if (Array.isArray(include)) return include.indexOf(type) !== -1;
    return !!include[type];
  }

  function progressUnits(counts, opts) {
    counts = counts || {};
    var include = opts && opts.include;
    var doneUnits = 0, totalUnits = 0, breakdown = {};
    for (var i = 0; i < ORDER.length; i++) {
      var t = ORDER[i], c = counts[t];
      if (!c) continue;
      var tot = num(c.total), d = Math.min(num(c.done), tot), w = WEIGHTS[t];
      if (!included(t, include)) continue;
      breakdown[t] = { done: d, total: tot, weight: w, doneUnits: d * w, totalUnits: tot * w };
      doneUnits += d * w;
      totalUnits += tot * w;
    }
    var out = { doneUnits: doneUnits, totalUnits: totalUnits, breakdown: breakdown };
    out.remainingUnits = Math.max(0, totalUnits - doneUnits);
    // Presentation only: reserve 100 for exact completion.
    out.percent = percent(doneUnits, totalUnits);
    out.complete = totalUnits > 0 && doneUnits >= totalUnits;
    var sep = {};
    for (var j = 0; j < SEPARATE.length; j++) { var s = counts[SEPARATE[j]]; if (s) sep[SEPARATE[j]] = { done: num(s.done), total: num(s.total) }; }
    out.separate = sep;
    return out;
  }

  function percent(done, total) {
    if (!(total > 0)) return 0;
    if (done >= total) return 100;
    return Math.min(99.9, Math.round(Math.max(0, done) / total * 1000) / 10);
  }
  function colourProgress(c) {
    c = c || {};
    return progressUnits({ full: {done:c.done, total:c.total}, half: {done:c.halfDone, total:c.halfTotal},
      petite:{done:c.petiteDone,total:c.petiteTotal}, long_stitch:{done:c.longDone,total:c.longTotal}, quarter: {done:c.quarterDone, total:c.quarterTotal}, knot: {done:c.knotDone, total:c.knotTotal} });
  }

  // Legacy whole-unit helpers remain for callers requesting whole numbers. Unit text retains fractions.
  function roundUnits(n) { return Math.round(n); }
  // One formatter, built once: toLocaleString builds a new one on every call, which showed up on the tap path.
  var NF = null;
  try { NF = new Intl.NumberFormat("en-GB"); } catch (e) { NF = null; }
  function fmt(n) { return NF ? NF.format(n) : n.toLocaleString("en-GB"); }
  function formatUnits(n) { return fmt(n); }
  // "To go" as a whole number that adds up with the whole "done" and "total" shown beside it (rounding each of
  // the three on its own can leave them one apart).
  function remainingWhole(result) { return Math.max(0, roundUnits(result.totalUnits) - roundUnits(result.doneUnits)); }

  // "2 half, 1 knot done": the non-full types that have anything in the project. `useDone` false lists totals.
  function breakdownText(result, useDone) {
    var parts = [];
    for (var i = 0; i < ORDER.length; i++) {
      var t = ORDER[i];
      if (t === "full") continue;
      var b = result.breakdown[t];
      if (!b || !b.total) continue;
      parts.push(fmt(useDone === false ? b.total : b.done) + " " + LABELS[t]);
    }
    return parts.join(", ");
  }

  // Units for one mark event: change is { full: n, half: n, knot: n ... } with signed counts.
  function sessionUnits(change) {
    var u = 0;
    for (var t in change) if (Object.prototype.hasOwnProperty.call(change, t) && WEIGHTS[t] != null) u += (change[t] || 0) * WEIGHTS[t];
    return u;
  }

  // A session still running (the Tracker's live one): its marks so far, net, in units. Falls back to the stitch
  // counts for a session object without units.
  function liveSessionNet(cur) {
    if (!cur) return 0;
    if (cur.unitsCompleted != null) return (cur.unitsCompleted || 0) - (cur.unitsUndone || 0);
    return (cur.stitchesCompleted || 0) - (cur.stitchesUndone || 0);
  }

  // What a session added, net, in the unit progress uses. Sessions from before this existed have netStitches only.
  function sessionNet(s) {
    if (!s) return 0;
    return s.units != null ? s.units : (s.netStitches || 0);
  }

  // Stitches ADDED by a session, in units: what it marked, leaving out catch-up marks (bulk "mark all" and the
  // like, which raise progress but are not stitching done today) and never reduced by unpicking. This is what
  // Today, speed, pace, goals, best day and streaks read. Sessions from before units existed carry
  // stitchesCompleted; from before that, only a net figure (a negative one means nothing was added).
  function sessionAdded(s) {
    if (!s) return 0;
    var c = s.unitsCompleted != null ? s.unitsCompleted
      : (s.stitchesCompleted != null ? s.stitchesCompleted : Math.max(0, sessionNet(s)));
    return Math.max(0, (c || 0) - (s.catchUp || 0));
  }
  // Stitches taken out again (unpicked), in units, shown on their own line and never netted into pace.
  function sessionUnpicked(s) {
    if (!s) return 0;
    if (s.unitsUndone != null) return s.unitsUndone || 0;
    if (s.stitchesUndone != null) return s.stitchesUndone || 0;
    return Math.max(0, -sessionNet(s));
  }
  // Whether a session counts as stitching activity for streaks and active days: it added something. A session
  // with no stitch figures at all (hand-made or imported with only a duration) still counts, as it always did.
  function sessionActive(s) {
    if (!s) return false;
    if (s.unitsCompleted == null && s.units == null && s.stitchesCompleted == null && s.netStitches == null) return true;
    return sessionAdded(s) > 0;
  }
  // A running session keeps what it has added per stitching day (`byDay`: { date: { uc, uu, cu, sc, su } }), so it
  // can be read for one day or since a day, and saved as one record per day.
  function liveAddedOn(cur, date) {
    if (!cur) return 0;
    if (!cur.byDay) return date === cur.date ? liveSessionAdded(cur) : 0;
    var d = cur.byDay[date];
    return d ? Math.max(0, (d.uc || 0) - (d.cu || 0)) : 0;
  }
  function liveAddedFrom(cur, startDate) {
    if (!cur) return 0;
    if (!cur.byDay) return cur.date >= startDate ? liveSessionAdded(cur) : 0;
    var t = 0;
    for (var k in cur.byDay) if (Object.prototype.hasOwnProperty.call(cur.byDay, k) && k >= startDate) t += Math.max(0, (cur.byDay[k].uc || 0) - (cur.byDay[k].cu || 0));
    return t;
  }
  function sessionCatchUp(s) { return (s && s.catchUp) || 0; }
  // How a session's time was measured: "timer" (the person started and stopped it), "edited" (the person set the
  // minutes), or "auto" (worked out from when stitches were marked; every session from before this existed).
  function sessionBasis(s) { var b = s && s.timingBasis; return b === 'timer' || b === 'edited' ? b : 'auto'; }
  // The live session's additions so far (see sessionAdded).
  function liveSessionAdded(cur) {
    if (!cur) return 0;
    var c = cur.unitsCompleted != null ? cur.unitsCompleted : (cur.stitchesCompleted || 0);
    return Math.max(0, c - (cur.catchUp || 0));
  }

  // ── From a stored project record (Home, library, Stats pages: no Tracker counters there) ──
  // Cached per array reference, like the counts the library always kept, so a save does not rescan an unchanged chart.
  var _totalCache = (typeof WeakMap !== "undefined") ? new WeakMap() : null;
  var _doneCache = (typeof WeakMap !== "undefined") ? new WeakMap() : null;

  function countStitchCells(pat) {
    if (!pat || !pat.length) return 0;
    var cached = _totalCache && _totalCache.get(pat);
    if (cached !== undefined) return cached;
    var n = 0;
    for (var i = 0; i < pat.length; i++) {
      var c = pat[i];
      if (!c) continue;
      // `.p` cells are short arrays like ["310"] or ["310","k"]; "k" is skipped background.
      if (Array.isArray(c)) { if (c[1] !== "k" && c[0] !== "__skip__" && c[0] !== "__empty__") n++; }
      else if (c.id !== "__skip__" && c.id !== "__empty__") n++;
    }
    if (_totalCache) _totalCache.set(pat, n);
    return n;
  }

  // Cache by both references: a saved mark on a cell removed from the chart is not counted.
  function countMarked(done, pat) {
    if (!done || typeof done !== "object") return 0;
    var byPattern = _doneCache && _doneCache.get(done);
    var cached = byPattern && pat && byPattern.get(pat);
    if (cached !== undefined) return cached;
    var n = 0;
    for (var i = 0; i < done.length; i++) {
      var c = pat && pat[i];
      var stitchable = !pat || (c && (Array.isArray(c)
        ? c[1] !== "k" && c[0] !== "__skip__" && c[0] !== "__empty__"
        : c.id !== "__skip__" && c.id !== "__empty__"));
      if (done[i] === 1 && stitchable) n++;
    }
    if (_doneCache && pat) {
      if (!byPattern) { byPattern = new WeakMap(); _doneCache.set(done, byPattern); }
      byPattern.set(pat,n);
    }
    return n;
  }

  // Backstitch lines marked done, counted one by one. The key is the one backstitch.js makes (endpoints in order, then
  // the colour); it is written out here because the Home and Stats pages do not load backstitch.js. A test holds the two
  // together. Lines are only counted when the record has them, so a project without backstitch reports nothing.
  function bsKey(l) {
    var x1 = Number(l.x1), y1 = Number(l.y1), x2 = Number(l.x2), y2 = Number(l.y2);
    if (x2 < x1 || (x2 === x1 && y2 < y1)) { var tx = x1, ty = y1; x1 = x2; y1 = y2; x2 = tx; y2 = ty; }
    var c = l.colorId != null && l.colorId !== "" ? String(l.colorId) : (l.color != null ? String(l.color) : "");
    return x1 + "," + y1 + "," + x2 + "," + y2 + "," + c;
  }
  function countBackstitch(p) {
    var lines = Array.isArray(p.bsLines) ? p.bsLines : [];
    if (!lines.length) return { done: 0, total: 0 };
    var keys = new Set(Array.isArray(p.bsDone) ? p.bsDone : []), total = 0, done = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l || !isFinite(Number(l.x1)) || !isFinite(Number(l.y1)) || !isFinite(Number(l.x2)) || !isFinite(Number(l.y2))) continue;
      if (Number(l.x1) === Number(l.x2) && Number(l.y1) === Number(l.y2)) continue;
      total++;
      if (keys.size && keys.has(bsKey(l))) done++;
    }
    return { done: done, total: total };
  }

  // Equivalent v9 halves and v10 quarters are two encodings of the same work.
  // Retain unrelated quarters, including other threads at the same cell.
  function partialWithoutLegacyHalves(partials, halves, defaultBrand) {
    var ps = partials instanceof Map ? partials : new Map(Array.isArray(partials) ? partials.filter(function(e) { return e && e.length === 2; }) : []);
    var hs = halves instanceof Map ? halves : new Map(Array.isArray(halves) ? halves.filter(function(e) { return e && e.length === 2; }) : []), out = new Map();
    if (!hs.size) return ps;
    ps.forEach(function(cell, idx) {
      if (!cell) return;
      var kept = Object.assign({}, cell), half = hs.get(idx);
      ["fwd", "bck"].forEach(function(side) {
        var thread = half && half[side], pair = side === "fwd" ? ["BL", "TR"] : ["TL", "BR"];
        if (!thread || !pair.every(function(q) { return cell[q] && cell[q].id === thread.id && (cell[q].brand || defaultBrand || "dmc") === (thread.brand || defaultBrand || "dmc"); })) return;
        pair.forEach(function(q) { delete kept[q]; });
      });
      if (Object.keys(kept).length) out.set(idx, kept);
    });
    return out;
  }

  // Saved quarter marks count only where a quarter still holds a thread.
  function countQuarters(p) {
    var ps = Array.from(partialWithoutLegacyHalves(p.partialStitches, p.halfStitches, p.settings && p.settings.threadBrand));
    if (!ps.length) return { done: 0, total: 0 };
    var marks = new Map();
    (Array.isArray(p.partialDone) ? p.partialDone : []).forEach(function (e) {
      if (e && e.length === 2 && Array.isArray(e[1])) marks.set(Number(e[0]), e[1]);
    });
    var POS = ["TL", "TR", "BL", "BR"], total = 0, done = 0;
    for (var i = 0; i < ps.length; i++) {
      var e = ps[i], cell = e && e[1];
      if (!cell) continue;
      var m = marks.get(Number(e[0]));
      for (var j = 0; j < 4; j++) {
        if (!cell[POS[j]]) continue;
        total++;
        if (m && m.indexOf(POS[j]) !== -1) done++;
      }
    }
    return { done: done, total: total };
  }

  function countHalves(p) {
    var marks = new Map(p.halfDone || []), total=0, done=0;
    (p.halfStitches || []).forEach(function(e) {
      ["fwd","bck"].forEach(function(side) { if(e[1] && e[1][side]) {total++; if((marks.get(e[0]) || {})[side])done++;} });
    });
    return {total:total, done:done};
  }

  // Additive v11 extension, specialtyVersion:1. Missing fields mean no objects.
  // Coordinates are in cells on a half-cell grid; petite is a 0.5-cell cross.
  // IDs belong to objects, never to their thread or their coordinates.
  function specialtyValid(o, w, h) {
    if (!o || !o.thread || typeof o.thread.id !== 'string' || !o.thread.id || /^__/.test(o.thread.id)) return false;
    if (!Array.isArray(o.thread.rgb) || o.thread.rgb.length !== 3 || !o.thread.rgb.every(function(v) { return Number.isInteger(v) && v >= 0 && v <= 255; })) return false;
    var keys = o.type === 'petite' ? ['x','y'] : o.type === 'long_stitch' ? ['x1','y1','x2','y2'] : [];
    if (!keys.length || !keys.every(function(k) { return typeof o[k] === 'number' && Number.isFinite(o[k]) && Number.isInteger(o[k]*2) && o[k] >= 0; })) return false;
    if (o.type === 'petite') return o.x + 0.5 <= w && o.y + 0.5 <= h;
    return o.x1 <= w && o.x2 <= w && o.y1 <= h && o.y2 <= h && (o.x1 !== o.x2 || o.y1 !== o.y2);
  }
  function specialtyNormalise(list, w, h, brand) {
    var used = new Set(), reserved = new Set((Array.isArray(list) ? list : []).filter(Boolean).map(function(o) { return o.uid; })), out = [];
    (Array.isArray(list) ? list : []).forEach(function(o, i) {
      if (!specialtyValid(o,w,h)) return;
      var uid = typeof o.uid === 'string' && o.uid ? o.uid : 'specialty-legacy-' + i;
      if (used.has(uid) || !o.uid) { var base = 'specialty-legacy-' + i; uid = base; while (used.has(uid) || reserved.has(uid)) uid += '-copy'; }
      used.add(uid);
      var n = {uid:uid, type:o.type, thread:Object.assign({},o.thread,{brand:o.thread.brand || brand || 'dmc'})};
      (o.type === 'petite' ? ['x','y'] : ['x1','y1','x2','y2']).forEach(function(k) { n[k]=o[k]; });
      out.push(n);
    });
    return out;
  }
  function specialtyLive(done, objects) {
    var ids = new Set(objects.map(function(o) { return o.uid; }));
    return Array.from(new Set(Array.isArray(done) ? done : [])).filter(function(id) { return ids.has(id); }).sort();
  }
  function specialtyCounts(objects, done) {
    var out = {petite:{total:0,done:0},long_stitch:{total:0,done:0}}, marks = new Set(done || []);
    objects.forEach(function(o) { out[o.type].total++; if(marks.has(o.uid))out[o.type].done++; });
    return out;
  }
  function specialtyOffset(objects, dx, dy, w, h) {
    return objects.map(function(o) {
      var n=Object.assign({},o);
      (o.type === 'petite' ? ['x','y'] : ['x1','y1','x2','y2']).forEach(function(k) { n[k]+=k[0]==='x'?dx:dy; });
      return n;
    }).filter(function(o) { return specialtyValid(o,w,h); });
  }
  function specialtySegments(o) {
    return o.type === 'petite' ? [[o.x,o.y,o.x+0.5,o.y+0.5],[o.x,o.y+0.5,o.x+0.5,o.y]] : [[o.x1,o.y1,o.x2,o.y2]];
  }
  function specialtyDraw(ctx, objects, done, x, y, size, visible, selected) {
    if(!objects.length)return;
    var marks=new Set(done || []);
    ctx.save(); ctx.lineCap='round';
    objects.forEach(function(o) {
      if (visible && visible[o.type] === false) return;
      ctx.strokeStyle='rgb('+o.thread.rgb.join(',')+')'; ctx.lineWidth=Math.max(1,size*0.08);
      ctx.globalAlpha=marks.has(o.uid)?0.4:1;
      ctx.setLineDash(marks.has(o.uid)?[2,2]:[]);
      specialtySegments(o).forEach(function(a) {ctx.beginPath();ctx.moveTo(x+a[0]*size,y+a[1]*size);ctx.lineTo(x+a[2]*size,y+a[3]*size);ctx.stroke();});
      if (selected===o.uid) { ctx.setLineDash([3,2]);ctx.lineWidth=1; var a=specialtySegments(o)[0];ctx.strokeRect(x+Math.min(a[0],a[2])*size-3,y+Math.min(a[1],a[3])*size-3,Math.abs(a[2]-a[0])*size+6,Math.abs(a[3]-a[1])*size+6); }
    });
    ctx.restore();
  }
  function specialtyMigrate(p) {
    if(!p || p.specialtyVersion===1)return p;
    var migratedDone=p.done?Array.from(p.done):p.done;
    var pat=p.pattern, objects=(p.specialtyStitches||[]).slice(), marks=(p.specialtyDone||[]).slice(), changed=false;
    if(Array.isArray(pat))pat=pat.map(function(c,i){
      if(!c || c.type!=='petite')return c;
      var w=(p.settings||{}).sW||p.w;
      var uid='legacy-petite-cell-'+i;
      while(objects.some(function(o){return o.uid===uid;}))uid+='-copy';
      var thread=Object.assign({},c,{type:String(c.id).includes('+')?'blend':'solid'});
      if(!thread.rgb&&typeof restoreStitch==='function')thread=restoreStitch(thread,(p.settings||{}).threadBrand||'dmc');
      objects.push({uid:uid,type:'petite',x:i%w,y:Math.floor(i/w),thread:thread});
      if((p.done||[])[i]===1)marks.push(uid);
      if(migratedDone)migratedDone[i]=0;
      changed=true;return {id:'__skip__'};
    });
    return changed?Object.assign({},p,{specialtyVersion:1,pattern:pat,done:migratedDone,specialtyStitches:objects,specialtyDone:marks}):p;
  }
  function specialtyRead(p,w,h,brand) {
    if(p.specialtyVersion!=null&&p.specialtyVersion!==1)throw new Error('Unsupported petite/long stitch schema version '+p.specialtyVersion+'.');
    var list=specialtyNormalise(p.specialtyStitches,w,h,brand), rejected=(Array.isArray(p.specialtyStitches)?p.specialtyStitches.length:0)-list.length;
    if(rejected&&root.Toast&&root.Toast.show)root.Toast.show({message:rejected+' petite or long stitch objects have invalid thread data or geometry and were not loaded.',type:'warning',duration:10000});
    return list;
  }
  var specialty = {read:specialtyRead,migrate:specialtyMigrate,valid:specialtyValid, normalise:specialtyNormalise, live:specialtyLive, counts:specialtyCounts, offset:specialtyOffset, segments:specialtySegments, draw:specialtyDraw};

  function countsFromProject(p) {
    if (!p) return {};
    p=specialtyMigrate(p);
    var pat = p.pattern || p.p;
    var knots = Array.isArray(p.knots) ? p.knots : [];
    var knotKeys = new Set(Array.isArray(p.knotsDone) ? p.knotsDone : []);
    var kd = 0;
    for (var i = 0; i < knots.length; i++) if (knots[i] && knotKeys.has(knots[i].x + "," + knots[i].y)) kd++;
    var fullTotal = (pat && pat.length) ? countStitchCells(pat) : (p.totalStitches || 0);
    var fullDone = p.done ? countMarked(p.done, pat) : (p.completedStitches || 0);
    var special=specialtyCounts(specialtyNormalise(p.specialtyStitches,(p.settings||{}).sW||p.w,(p.settings||{}).sH||p.h),p.specialtyDone);
    return {
      full: { done: fullDone, total: fullTotal },
      half: countHalves(p),
      knot: { done: kd, total: knots.length },
      petite: special.petite,
      long_stitch: special.long_stitch,
      quarter: countQuarters(p),
      backstitch: countBackstitch(p)
    };
  }

  // Used when Stats loads a different saved project, including colours absent from the full grid.
  function coloursFromProject(p) {
    p=specialtyMigrate(p);
    var out = {}, pat = p.pattern || p.p || [], marks = p.done || [];
    function entry(c) {
      var id = c && (Array.isArray(c) ? c[0] : c.id);
      if (!id || id === "__skip__" || id === "__empty__" || (Array.isArray(c) && c[1] === "k")) return null;
      if (!out[id]) out[id] = {thread: Array.isArray(c) ? {id:id} : c, total:0, done:0, halfTotal:0, halfDone:0, quarterTotal:0, quarterDone:0, knotTotal:0, knotDone:0};
      return out[id];
    }
    pat.forEach(function(c,i) { var e=entry(c); if(e) { e.total++; if(marks[i] === 1)e.done++; } });
    var hd = new Map(p.halfDone || []), qd = new Map(p.partialDone || []), kd = new Set(p.knotsDone || []);
    (p.halfStitches || []).forEach(function(pair) { ["fwd","bck"].forEach(function(side) {
      var e=entry(pair[1] && pair[1][side]); if(e) { e.halfTotal++; if((hd.get(pair[0]) || {})[side])e.halfDone++; }
    }); });
    partialWithoutLegacyHalves(p.partialStitches,p.halfStitches,p.settings && p.settings.threadBrand).forEach(function(cell,i) {
      ["TL","TR","BL","BR"].forEach(function(pos) { var e=entry(cell[pos]); if(e) { e.quarterTotal++; if((qd.get(i) || []).indexOf(pos)!==-1)e.quarterDone++; } });
    });
    (p.knots || []).forEach(function(k) { var e=entry(k); if(e) {e.knotTotal++; if(kd.has(k.x+","+k.y))e.knotDone++;} });
    var sm=new Set(p.specialtyDone || []);
    specialtyNormalise(p.specialtyStitches,(p.settings||{}).sW||p.w,(p.settings||{}).sH||p.h).forEach(function(o) {
      var e=entry(o.thread), prefix=o.type==='petite'?'petite':'long';
      if(e) { e[prefix+'Total']=(e[prefix+'Total']||0)+1; if(sm.has(o.uid))e[prefix+'Done']=(e[prefix+'Done']||0)+1; }
    });
    return out;
  }

  function fromProject(p, opts) { return progressUnits(countsFromProject(p), opts); }

  var api = {
    specialty: specialty,
    partialWithoutLegacyHalves: partialWithoutLegacyHalves,
    percent: percent, colourProgress: colourProgress, coloursFromProject: coloursFromProject, WEIGHTS: WEIGHTS, progressUnits: progressUnits, fromProject: fromProject, countsFromProject: countsFromProject,
    sessionUnits: sessionUnits, sessionNet: sessionNet, liveSessionNet: liveSessionNet,
    sessionAdded: sessionAdded, sessionUnpicked: sessionUnpicked, sessionCatchUp: sessionCatchUp, sessionBasis: sessionBasis, sessionActive: sessionActive, liveAddedOn: liveAddedOn, liveAddedFrom: liveAddedFrom, liveSessionAdded: liveSessionAdded, formatUnits: formatUnits, roundUnits: roundUnits, remainingWhole: remainingWhole,
    breakdownText: breakdownText
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ProgressUnits = api;
})(typeof window !== "undefined" ? window : this);
