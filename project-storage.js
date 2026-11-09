// project-storage.js
// Shared multi-project storage built on the existing CrossStitchDB IndexedDB.
// Projects are stored under their own IDs (e.g. "proj_1712345678"), leaving the
// legacy "auto_save" key untouched for backwards compatibility.

const ProjectStorage = (() => {
  const DB_NAME = "CrossStitchDB";
  const STORE_NAME = "projects";
  const META_STORE = "project_meta";
  const STATS_STORE = "stats_summaries";
  // Rows written before progress was counted in units (progress-units.js) have no unitsV; refreshProgressRows()
  // rewrites them once. Bump this if the definition ever changes again.
  const PROGRESS_ROW_VERSION = 4;
  const ACTIVE_KEY = (typeof LOCAL_STORAGE_KEYS !== 'undefined') ? LOCAL_STORAGE_KEYS.activeProject : "crossstitch_active_project";

  // Legacy epoch: same constant as stash-bridge.js for consistent 'before tracking' display
  const LEGACY_EPOCH = '2020-01-01T00:00:00Z';
  const fencePrefix=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36);
  let fenceSequence=0, progressBaseCache=null;
  // The full record a project's small rows (progress, overlay) are based on, as
  // last written or read by this tab: its stamps, marks, sync registers, value
  // fields and chart. Its token must match the metadata read in the SAME
  // transaction as a write that relies on it; any full write, recovery or legacy
  // writer changes that token. The chart and the sync registers are kept by
  // reference, never copied: nothing edits either in place (TrackingSync builds
  // new objects, and the pattern array is the serializer's cached output), and
  // deep-copying them cost a third of a second per save on a large chart.
  function rememberProgressBase(p,fence) {
    if(!p||!fence||!fence.token)return;
    const small={};
    MARK_SETS.forEach(f=>{if(p[f]!==undefined)small[f]=p[f];});
    VALUE_KEYS().forEach(f=>{if(Object.prototype.hasOwnProperty.call(p,f))small[f]=p[f];});
    const base=Object.assign(structuredClone(small),{id:p.id,lastWriteAt:p.lastWriteAt,chartRevision:p.chartRevision,
      pattern:{length:p.pattern?p.pattern.length:p.p?p.p.length:0},done:p.done?Uint8Array.from(p.done):null});
    if(p.trackingSync!==undefined)base.trackingSync=p.trackingSync;
    const chart={};CHART_KEYS.forEach(k=>{if(k in p)chart[k]=p[k];});
    progressBaseCache={id:p.id,token:fence.token,project:base,chart};
  }
  function VALUE_KEYS(){return (typeof TrackingSync!=='undefined'&&TrackingSync.VALUE_KEYS)||[];}

  // ── Overlay ─────────────────────────────────────────────────────────
  // A Tracker save whose chart is unchanged writes everything but the chart to
  // a small "overlay:<id>" row, and the marks to the progress record, instead
  // of rewriting the whole project. Both rows are fenced to the full record:
  // `baseWriteAt` must equal its `lastWriteAt`, so any later full write (a
  // Creator save, a sync import, a restore, a chart update) retires them. Every
  // reader folds the overlay in (storedView), so the project read back is what
  // a full save of the same snapshot would have stored, with the overlay's own
  // write stamps (lastWriteAt / lastWriteTabId) for cross-tab conflicts.
  //
  //   overlay:<id>  { id, projectId, v:1, baseWriteAt, lastWriteAt, lastWriteTabId,
  //                   at, fields, valueSync }
  //     fields     every top-level field of the saved snapshot except the chart
  //                (CHART_KEYS), the marks (in the progress record) and the
  //                sync registers (valueSync beside it; mark registers are the
  //                progress record's delta over the full record's)
  //     at         the progress record's updatedAt written with it; a later
  //                progress write means newer marks than the overlay's save
  //
  // Older builds ignore overlay rows and still apply the progress record's
  // marks: after a downgrade they show the last full save's other fields.
  const OVERLAY_PREFIX = "overlay:";
  // Large fields a Tracker save does not change: compared, not rewritten.
  const CHART_KEYS = ["pattern", "p", "imgData"];
  const MARK_FIELDS = ["done"].concat(["halfDone", "knotsDone", "beadsDone", "bsDone", "partialDone", "specialtyDone"]);
  const OVERLAY_SKIP = new Set(CHART_KEYS.concat(MARK_FIELDS, ["trackingSync", "valueSync", "activeSessionCheckpoint", "sessionCheckpoints", "lastWriteAt", "lastWriteTabId"]));
  function overlayCurrent(project, ov) {
    return !!(project && ov && ov.v === 1 && ov.projectId === project.id && typeof project.lastWriteAt === "number"
      && ov.baseWriteAt === project.lastWriteAt && typeof ov.lastWriteAt === "number" && ov.fields && typeof ov.fields === "object");
  }
  // The project as its last save wrote it, before the progress record's marks:
  // the overlay's fields over the full record's chart and marks. The full
  // record itself when there is no current overlay.
  function overlayBase(project, ov) {
    if (!overlayCurrent(project, ov)) return project;
    const out = Object.assign({}, ov.fields);
    CHART_KEYS.forEach(k => { delete out[k]; if (k in project) out[k] = project[k]; });
    MARK_FIELDS.forEach(f => { delete out[f]; if (project[f] !== undefined) out[f] = project[f]; });
    out.id = project.id;
    if (project.trackingSync !== undefined) out.trackingSync = project.trackingSync; else delete out.trackingSync;
    if (ov.valueSync !== undefined) out.valueSync = ov.valueSync; else delete out.valueSync;
    out.lastWriteAt = ov.lastWriteAt;
    out.lastWriteTabId = ov.lastWriteTabId == null ? null : ov.lastWriteTabId;
    return out;
  }
  // Full record + overlay + progress record: the project as stored.
  function storedView(project, ov, rec, options) {
    const base = overlayBase(project, ov);
    const out = applyProgressRecord(project, rec, base === project ? undefined : base, options);
    return out === project ? base : out;
  }
  function overlayFields(project) {
    const fields = {};
    Object.keys(project).forEach(k => { if (!OVERLAY_SKIP.has(k) && project[k] !== undefined) fields[k] = project[k]; });
    return fields;
  }
  // Equal as stored: the chart a save would write against the full record's.
  function sameValue(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
      return true;
    }
    if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) { const k = ka[i]; if (!Object.prototype.hasOwnProperty.call(b, k) || !sameValue(a[k], b[k])) return false; }
    return true;
  }
  function sameChart(chart, project) {
    for (const k of CHART_KEYS) {
      const has = k in project, had = k in chart;
      if (has !== had) return false;
      if (has && !sameValue(chart[k], project[k])) return false;
    }
    return true;
  }
  // A progress record or navigation journal written by a tab that took the
  // overlay's stamp as the project's write (CrossTabCoord's last-seen write is
  // the stamp get() returns) is based on the overlay's full record.
  function rebase(rec, meta) {
    if (rec && meta && typeof meta.baseWriteAt === "number" && typeof meta.lastWriteAt === "number"
        && meta.lastWriteAt !== meta.baseWriteAt && rec.baseWriteAt === meta.lastWriteAt) {
      return Object.assign({}, rec, { baseWriteAt: meta.baseWriteAt });
    }
    return rec;
  }
  function rebaseOn(rec, ov) {
    if (rec && ov && ov.v === 1 && typeof ov.lastWriteAt === "number" && rec.baseWriteAt === ov.lastWriteAt && ov.baseWriteAt !== ov.lastWriteAt) {
      return Object.assign({}, rec, { baseWriteAt: ov.baseWriteAt });
    }
    return rec;
  }

  // Library thread demand depends on the chart, not on the marks: one result
  // per chart (pattern array and the other stitch lists), so a save of an
  // unchanged chart does not recount every stitch (seconds on a large chart).
  const demandCache = typeof WeakMap === "function" ? new WeakMap() : null;
  function libraryDemand(project, fc) {
    const pat = project.pattern;
    const sig = JSON.stringify([fc, project.threadBrand || (project.settings && project.settings.threadBrand) || null,
      project.halfStitches || null, project.partialStitches || null, project.specialtyStitches || null, project.knots || null, project.bsLines || null]);
    const hit = demandCache && pat && typeof pat === "object" ? demandCache.get(pat) : null;
    if (hit && hit.sig === sig && hit.length === pat.length) return hit.rows;
    const rows = threadDemandRows(projectThreadEntries(project), {fabricCount:fc}).map(r=>({
      id:r.p.id,brand:r.p.brand,name:r.name,stitches:r.threadStitches,skeins:r.needed,rgb:r.p.rgb
    }));
    if (demandCache && pat && typeof pat === "object") demandCache.set(pat, { sig, length: pat.length, rows });
    return rows;
  }

  // Progress for a stored record, from the one shared definition (progress-units.js): full stitches, half
  // stitches and French knots in units. `done` and `total` retain exact fractional units, `complete` is decided on
  // the exact values, and `percent` has one decimal. The counting is cached per array reference there, so a save
  // does not rescan a chart that has not changed.
  function progressOf(p) {
    const r = ProgressUnits.fromProject(p);
    return { total: r.totalUnits, done: r.doneUnits, complete: r.complete, percent: r.percent };
  }

  // Build a lightweight stats summary for the global dashboard.
  // PERF-REVIEW (perf-6 #3): statsSessions duplicates the full project sessions
  // array and palette[].rgb duplicates DMC lookup. Stripping would shrink the
  // stats_summaries store by ~40-60% but consumers (manager-app dashboard, /home)
  // currently read sessions[] directly from the summary. Needs a consumer audit
  // before removal — leaving as-is until then.
  function buildStatsSummary(p) {
    // Knots only add to counts taken from the chart itself, not to stored
    // totals (which already include them).
    const prog = progressOf(p);
    const totalSt = prog.total;
    const completedSt = prog.done;
    return {
      id: p.id,
      name: p.name || 'Untitled',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      totalStitches: totalSt,
      completedStitches: completedSt,
      // Exact percentage (one decimal) from the unrounded units: whole done/total can differ from it by a
      // fraction on very small projects.
      pct: prog.percent,
      isComplete: prog.complete,
      unitsV: PROGRESS_ROW_VERSION,
      // Root cause of S6: finishStatus must flow through to summary consumers so
      // that the engine and stats pages can apply the unified completion rule
      // (exclude if isComplete OR finishStatus === 'completed').
      finishStatus: p.finishStatus || 'active',
      statsSessions: p.statsSessions || [],
      achievedMilestones: p.achievedMilestones || [],
      // Derive palette from p.palette if present (tracker-saved projects), otherwise
      // scan pattern cells (Creator projects embed rgb in cells, no p.palette field).
      // Used by insights-engine for stash-utilisation analysis and by stats-insights
      // for total-colour counting — both only need {id}; rgb is best-effort.
      palette: (function() {
        if (p.palette && p.palette.length > 0) {
          return p.palette.map(function(c) { return { id: c.id, name: c.name, rgb: c.rgb }; });
        }
        var patArr = p.pattern || p.p;
        if (!patArr || patArr.length === 0) return [];
        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < patArr.length; i++) {
          var cell = patArr[i];
          // `.p` entries are short arrays like ["310"] / ["310","b"]; the
          // `k` marker is skipped background.
          if (Array.isArray(cell)) {
            if (!cell[0] || cell[1] === 'k' || cell[0] === '__skip__' || cell[0] === '__empty__') continue;
            var aid = cell[0];
            if (typeof aid === 'string' && aid.indexOf('+') !== -1) {
              var aparts = aid.split('+');
              for (var ai = 0; ai < aparts.length; ai++) {
                var apid = aparts[ai].trim();
                if (apid && !seen[apid]) { seen[apid] = true; out.push({ id: apid, name: apid, rgb: [128,128,128] }); }
              }
            } else if (!seen[aid]) {
              seen[aid] = true;
              out.push({ id: aid, name: aid, rgb: [128,128,128] });
            }
            continue;
          }
          if (!cell || !cell.id || cell.id === '__skip__' || cell.id === '__empty__') continue;
          if (typeof cell.id === 'string' && cell.id.indexOf('+') !== -1) {
            var parts = cell.id.split('+');
            for (var pi2 = 0; pi2 < parts.length; pi2++) {
              var pid = parts[pi2].trim();
              if (pid && !seen[pid]) { seen[pid] = true; out.push({ id: pid, name: pid, rgb: [128,128,128] }); }
            }
          } else if (!seen[cell.id]) {
            seen[cell.id] = true;
            out.push({ id: cell.id, name: cell.name || cell.id, rgb: cell.rgb || [128,128,128] });
          }
        }
        return out;
      })(),
      projectColor: p.projectColor || null,
    };
  }

  const SESSION_PREFIX = 'session:';
  function sessionKey(projectId, sessionId) { return SESSION_PREFIX + projectId + ':' + sessionId; }
  function sessionRange(id) { return IDBKeyRange.bound(SESSION_PREFIX + id + ':', SESSION_PREFIX + id + ':\uffff'); }
  function sessionEnded(project, id) {
    return (project.deletedSessionIds || []).includes(id) || (project.statsSessions || []).some(s => s && (s.id === id || s.groupId === id));
  }
  // Compact session retirement projection. Written atomically with every metadata
  // row, so a checkpoint need not deserialize hundreds of thousands of chart cells.
  // Older metadata falls back to the full record once, inside the same transaction.
  function checkpointFence(p) {
    return {id:p.id, token:fencePrefix+":"+(++fenceSequence), statsSessions:(p.statsSessions||[]).map(s=>s&&({id:s.id,groupId:s.groupId})),
      deletedSessionIds:p.deletedSessionIds||[]};
  }
  function validCheckpoint(cp, id) {
    return cp && cp.v === 1 && cp.projectId === id && typeof cp.sessionId === 'string' &&
      Number.isFinite(cp.checkpointAt) && Array.isArray(cp.records) && cp.records.length &&
      cp.records.every(r => r && (r.id === cp.sessionId || r.groupId === cp.sessionId) && Number.isFinite(r.durationSeconds) && r.durationSeconds >= 0);
  }
  // The closed marker is a fence: a delayed checkpoint cannot resurrect a finalised/deleted run.
  function putCheckpoint(pending, project, cp) {
    if (!validCheckpoint(cp, project.id)) return;
    const key = sessionKey(project.id, cp.sessionId), req = pending.get(key);
    req.onsuccess = () => {
      const prev = req.result;
      if (prev && prev.closed) return;
      if (sessionEnded(project, cp.sessionId)) { pending.put({id:key,projectId:project.id,sessionId:cp.sessionId,closed:true}); return; }
      if (!prev || (prev.revision||prev.checkpointAt) <= (cp.revision||cp.checkpointAt)) pending.put(Object.assign({}, cp, {id:key}));
    };
  }

  // A project's photos (photos.js: "photo:<id>:<n>" and "photothumb:<id>:<n>" in pendingImports) go with it.
  function deletePhotoRecords(store, id) {
    if (typeof IDBKeyRange === "undefined") return;
    store.delete(IDBKeyRange.bound("photo:" + id + ":", "photo:" + id + ":\uffff"));
    store.delete(IDBKeyRange.bound("photothumb:" + id + ":", "photothumb:" + id + ":\uffff"));
  }

  // Extract lightweight metadata from a full project object.
  const PROGRESS_PREFIX = "progress:";
  const RECOVERY_PREFIX = "crossstitch_progress_recovery:";
  function clearProgressRecovery(id) {
    try {
      if (id) localStorage.removeItem(RECOVERY_PREFIX + id);
      else Object.keys(localStorage).filter(k => k.startsWith(RECOVERY_PREFIX)).forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }

  // Whether a progress record (or a recovery journal) holds exactly the marks a
  // project already has: every mark field the record supplies is equal, and it
  // carries no sync registers of its own (a non-empty delta, or a full
  // trackingSync, is new information even when the marks match: it records when
  // and where they changed). Conservative: arrays in another order, a typed
  // `done` against a missing one, anything unexpected all count as different.
  const MARK_SETS = ["halfDone", "knotsDone", "beadsDone", "bsDone", "partialDone", "specialtyDone"];
  function sameMarks(project, rec) {
    if (!project || !rec || !rec.done || !project.done) return false;
    if (rec.trackingSync) return false;
    const delta = rec.trackingSyncDelta;
    if (delta && delta.marks && Object.keys(delta.marks).length) return false;
    const a = project.done, b = rec.done;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if ((a[i] ? 1 : 0) !== (b[i] ? 1 : 0)) return false;
    const norm = v => (Array.isArray(v) && v.length) ? JSON.stringify(v) : "[]";
    for (const f of MARK_SETS) if (Array.isArray(rec[f]) && norm(rec[f]) !== norm(project[f])) return false;
    return true;
  }
  // Projects get() returned with marks or sync registers that only a progress
  // record holds (not yet in the full record). The Tracker folds those into its
  // next full save; a project read with nothing new needs no write (see
  // loadedWithProgress and the Tracker's load baseline).
  const loadedWithProgressSet = new WeakSet();

  // Overlay a progress record onto a project record if, and only if, it is still
  // current: same project write it was based on, and the same pattern size.
  // Returns the project unchanged otherwise. Never mutates its arguments.
  function applyProgressRecord(project, rec, previous, options) {
    if (!project || !rec || rec.v !== 1 || !rec.done) return project;
    const cells = project.pattern ? project.pattern.length : (project.p ? project.p.length : -1);
    if (rec.done.length !== cells) return project;
    const base = rec.baseWriteAt == null ? null : rec.baseWriteAt;
    const current = typeof project.lastWriteAt === "number" ? project.lastWriteAt : null;
    if (base !== current) return project;
    const out = Object.assign({}, previous || project, { done: options&&options.typed ? rec.done : Array.from(rec.done) });
    if (Array.isArray(rec.specialtyDone)) out.specialtyDone=rec.specialtyDone;
    if (Array.isArray(rec.halfDone)) out.halfDone = rec.halfDone;
    if (Array.isArray(rec.beadsDone)) out.beadsDone = rec.beadsDone;
    if (Array.isArray(rec.knotsDone)) out.knotsDone = rec.knotsDone.length ? rec.knotsDone : undefined;
    // Backstitch and quarter-stitch marks (Phase 6): a record from a build that did not know them has no such field,
    // and then the project's own marks stand; a record that has the field (even empty) is the newer truth.
    if (Array.isArray(rec.bsDone)) out.bsDone = rec.bsDone.length ? rec.bsDone : undefined;
    if (Array.isArray(rec.partialDone)) out.partialDone = rec.partialDone.length ? rec.partialDone : undefined;
    // A current progress record can carry removals before the next full save.
    // Legacy records are diffed only for the fields they actually supplied.
    if(options&&options.skipTracking)return out;
    const next = Object.assign({}, out);
    ["halfDone", "knotsDone", "beadsDone", "bsDone", "partialDone", "specialtyDone"].forEach(f => { if (Array.isArray(rec[f])) next[f] = rec[f]; });
    if (rec.trackingSync) return Object.assign(out, { trackingSync: rec.trackingSync });
    // A delta over the project it is based on (TrackingSync.recordDelta): rebuilt
    // over the project's own registers, whatever `previous` holds.
    if (rec.trackingSyncDelta) return Object.assign(out, { trackingSync: TrackingSync.withDelta(Object.assign({}, out, { trackingSync: project.trackingSync }), rec.trackingSyncDelta) });
    const tracked = TrackingSync.record(previous || project, next, "progress-" + (rec.tabId || rec.updatedAt || "legacy"));
    return Object.assign(out, { trackingSync: tracked.trackingSync });
  }

  // stamps (optional): { baseWriteAt, lastWriteAt, lastWriteTabId } when the row
  // describes an overlay save, whose own write stamps differ from its full
  // record's. The meta row is written in the same transaction as every write to
  // the project or its overlay, so these let a conflict check (writeStamp) and
  // a progress write (rebase) read the stamps without loading the project.
  function buildMeta(p, stamps) {
    const s = p.settings || {};
    const st = stamps || {};
    // Progress in units (progress-units.js): the same definition as the Tracker. It reads both the normal
    // `.pattern` and the compact `.p` grid.
    const prog = progressOf(p);
    const totalSt = prog.total;
    const completedSt = prog.done;
    const sessions = p.statsSessions || [];
    const totalSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds != null ? s.durationSeconds : (s.durationMinutes || 0) * 60), 0);
    const totalMinutes = Math.round(totalSeconds / 60);
    const totalNet = sessions.reduce((sum, s) => sum + (ProgressUnits.sessionAdded(s) || 0), 0);
    const uniqueDays = new Set(sessions.filter(ProgressUnits.sessionActive).map(s => s.date).filter(Boolean)).size;
    const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
    // Compute stitches this week and this month for dashboard stats
    const now = new Date();
    // Use local date (not UTC) so comparisons match session dates which are
    // also stored in local time via getStitchingDateLocal.
    const _ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const todayStr = _ymd(now);
    const monthStr = todayStr.slice(0, 7);
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
    const weekStartStr = _ymd(weekStart);
    let stitchesThisWeek = 0, stitchesThisMonth = 0;
    // Per-day breakdown for the most recent 7 days (oldest → newest, ending
    // today). Drives the sparkline rendered on Manager pattern cards.
    const weeklyStitches = [0, 0, 0, 0, 0, 0, 0];
    const dayKeys = [];
    // PERF (perf-5 #12): build dayKey -> idx map once instead of dayKeys.indexOf per session.
    const dayKeyToIdx = Object.create(null);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const k = _ymd(d);
      dayKeys.push(k);
      dayKeyToIdx[k] = 6 - i;
    }
    for (const s2 of sessions) {
      if (s2.date >= weekStartStr) stitchesThisWeek += (ProgressUnits.sessionAdded(s2) || 0);
      if (s2.date && s2.date.slice(0, 7) === monthStr) stitchesThisMonth += (ProgressUnits.sessionAdded(s2) || 0);
      if (s2.date) {
        const idx = dayKeyToIdx[s2.date];
        if (idx !== undefined) weeklyStitches[idx] += (ProgressUnits.sessionAdded(s2) || 0);
      }
    }
    // What the finish estimate needs, without the sessions: what was added on each stitching day within the last 28 calendar
    // days (only the days something was added, so fewer than 28 entries), the first stitching day and how many there have been (see "One estimator" in helpers.js; Home cards use it).
    let paceDaily, firstActiveDate, activeDaysTotal;
    if (typeof dailyAddedMap === 'function') {
      const m = dailyAddedMap(sessions);
      const cutoff = estDateFromNumber(estDayNumber(getStitchingDate(new Date(), getDayEndHour())) - (EST_WINDOW_DAYS - 1));
      paceDaily = {};
      Object.keys(m.daily).forEach(k => { if (k >= cutoff) paceDaily[k] = m.daily[k]; });
      firstActiveDate = m.first;
      activeDaysTotal = m.activeDays;
    }
    return {
      id: p.id,
      name: p.name || `${s.sW || "?"}×${s.sH || "?"} pattern`,
      checkpointFence: checkpointFence(p),
      lastWriteAt: typeof st.lastWriteAt === "number" ? st.lastWriteAt : (typeof p.lastWriteAt === "number" ? p.lastWriteAt : null),
      lastWriteTabId: st.lastWriteTabId !== undefined ? st.lastWriteTabId : (p.lastWriteTabId || null),
      baseWriteAt: typeof st.baseWriteAt === "number" ? st.baseWriteAt : (typeof p.lastWriteAt === "number" ? p.lastWriteAt : null),
      designer: p.designer || "",
      description: p.description || "",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      dimensions: { width: s.sW || 0, height: s.sH || 0 },
      totalStitches: totalSt,
      completedStitches: completedSt,
      pct: prog.percent,
      // Which progress definition these figures use (see refreshProgressRows).
      unitsV: PROGRESS_ROW_VERSION,
      // Any stitching done at all, including half stitches alone (completedStitches counts full stitches and
      // knots only). Used to decide whether a backup reminder is worth showing.
      anyProgress: completedSt > 0 || (Array.isArray(p.halfDone) && p.halfDone.some(e => e && e[1] && (e[1].fwd || e[1].bck))) || (Array.isArray(p.bsDone) && p.bsDone.length > 0) || (Array.isArray(p.partialDone) && p.partialDone.length > 0) || Beads.progress(Beads.normalise(p.beads), p.beadsDone).done > 0,
      source: p.source || p.page || "unknown",
      sessionCount: sessions.length,
      totalMinutes: totalMinutes,
      uniqueActiveDays: uniqueDays,
      stitchesPerHour: totalSeconds > 0 ? Math.round(totalNet / (totalSeconds / 3600)) : 0,
      lastSessionDate: lastSession ? lastSession.date : null,
      lastSessionStitches: lastSession ? (ProgressUnits.sessionAdded(lastSession) || 0) : 0,
      stitchesThisWeek,
      stitchesThisMonth,
      weeklyStitches,
      paceDaily,
      firstActiveDate,
      activeDaysTotal,
      thumbnail: p.thumbnail || null,
      fabricCt: s.fabricCt || 14,
      // Stash-Adapt: surface a tiny pointer to the source project so the
      // pattern library can render the "Adapted from …" badge without having
      // to load the full project payload. Only present on adapted projects.
      adaptation: p.adaptation ? {
        fromProjectId: p.adaptation.fromProjectId || null,
        fromName:      p.adaptation.fromName || null,
        modeAtCreate:  p.adaptation.modeAtCreate || null,
      } : undefined,
    };
  }

  // VER-SYNC-009: persist deletions as tombstones so SyncEngine can tell remote
  // devices "we intentionally deleted this project" and stop it re-appearing on
  // the next sync import. Shared by delete() (one id) and clearAllProjects()
  // when the wipe is a deliberate user action rather than a resync rebuild.
  //
  // Records are { id, deletedAt }; timestamps are display metadata. Offline
  // edits never prove a deletion was undone. Explicit Restore releases evidence.
  // Legacy bare-string entries remain readable.
  const LS_TOMBSTONE_KEY = "cs_deleted_project_ids";
  const TOMBSTONE_MAX = 10000;
  function writeTombstones(ids) {
    try {
      const raw = localStorage.getItem(LS_TOMBSTONE_KEY);
      let tombstones = [];
      tombstones = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(tombstones)) throw new Error('Invalid project deletion history.');
      const deletedAt = new Date().toISOString();
      for (const id of ids) {
        const already = tombstones.some(function (t) {
          return (typeof t === "string") ? t === id : (t && t.id === id);
        });
        if (!already) tombstones.push({ id: id, deletedAt: deletedAt });
      }
      // Cap to avoid unbounded localStorage growth.
      if (tombstones.length > TOMBSTONE_MAX) {
        throw new Error('Deletion record limit reached; explicitly reset sync before deleting more projects.');
      }
      localStorage.setItem(LS_TOMBSTONE_KEY, JSON.stringify(tombstones));
    } catch (e) { throw e; }
  }

  let _cachedDB = null;
  // Set to true once IDB is confirmed unavailable (e.g. Safari private browsing).
  let _idbUnavailable = false;

  function _notifyIdbUnavailable() {
    // Use a window-level flag so this fires at most once even if multiple modules detect IDB failure.
    if (_idbUnavailable || (typeof window !== 'undefined' && window._stitchxIdbUnavailable)) return;
    _idbUnavailable = true;
    if (typeof window !== 'undefined') window._stitchxIdbUnavailable = true;
    console.warn('[ProjectStorage] IndexedDB unavailable — likely private browsing mode. Projects will not persist.');
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('idb-unavailable'));
      }
      if (typeof window !== 'undefined' && window.Toast && window.Toast.show) {
        window.Toast.show({
          message: 'Storage is not available in private browsing mode. Changes will be lost when you close this tab.',
          type: 'warning',
          duration: 12000
        });
      }
    } catch (_) {}
  }

  function getDB() {
    if (_idbUnavailable) return Promise.reject(new Error('IndexedDB unavailable in private browsing mode'));
    if (_cachedDB) {
      try { _cachedDB.transaction(STORE_NAME); return Promise.resolve(_cachedDB); } catch(_) { _cachedDB = null; }
    }
    return new Promise((resolve, reject) => {
      ensurePersistence();
      let request;
      try {
        request = indexedDB.open(DB_NAME, 5);
      } catch (e) {
        _notifyIdbUnavailable();
        reject(e);
        return;
      }
      request.onupgradeneeded = (e) => {
        let db = e.target.result;
        let upgradeTx = e.target.transaction;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          let metaStore = db.createObjectStore(META_STORE);
          // Migrate lightweight metadata from any existing proj_* entries.
          if (e.oldVersion >= 1) {
            let projectsStore = upgradeTx.objectStore(STORE_NAME);
            let cursorReq = projectsStore.openCursor();
            cursorReq.onsuccess = (evt) => {
              let cursor = evt.target.result;
              if (!cursor) return;
              let p = cursor.value;
              if (p && p.id && typeof p.id === "string" && p.id.startsWith("proj_")) {
                metaStore.put(buildMeta(p), p.id);
              }
              cursor.continue();
            };
          }
        }
        if (!db.objectStoreNames.contains(STATS_STORE)) {
          db.createObjectStore(STATS_STORE);
        }
        if (!db.objectStoreNames.contains("sync_snapshots")) {
          db.createObjectStore("sync_snapshots");
        }
        if (!db.objectStoreNames.contains("importerTelemetry")) {
          db.createObjectStore("importerTelemetry", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("pendingImports")) {
          db.createObjectStore("pendingImports", { keyPath: "id" });
        }
      };
      request.onblocked = () => {
        console.warn("ProjectStorage IndexedDB open was blocked by another open connection.");
        reject(new Error("CrossStitchDB open blocked — another tab may be holding an old connection open."));
      };
      request.onsuccess = () => {
        let db = request.result;
        db.onversionchange = () => {
          db.close();
          if (_cachedDB === db) _cachedDB = null;
        };
        _cachedDB = db;
        resolve(db);
      };
      request.onerror = () => {
        const err = request.error;
        const name = err && err.name ? err.name : '';
        if (name === 'SecurityError' || name === 'NotSupportedError' || name === 'UnknownError') {
          _notifyIdbUnavailable();
        }
        reject(err);
      };
    });
  }

  return {
    // Backup uses the same validity checks as get(), without suppressing read errors.
    // Rebuild both summary rows when newer persisted progress is included.
    // overlay: the project's "overlay:<id>" row, when it has one (see Overlay).
    backupProgressRows(project, rec, recovery, overlay) {
      const ov = overlayCurrent(project, overlay) ? overlay : null;
      let current = storedView(project, ov, rec);
      // Navigation journals can be newer than IDB, even if their recovery
      // write failed. Use the same age and revision rules as _recoverProgress.
      if (recovery && recovery.projectId === project.id && recovery.v === 1 && Array.isArray(recovery.done)) {
        const journal = rebaseOn(recovery, ov);
        const recovered = applyProgressRecord(project, journal, current);
        const viaRecord = applyProgressRecord(project, rec) !== project;
        if (recovered !== project && (!viaRecord || !(rec.updatedAt > journal.updatedAt))) current = recovered;
      }
      if (current === project) return null;
      // A backup holds whole records: the overlay's fields and stamps are now the record's.
      return { project: current, meta: buildMeta(current), stats: buildStatsSummary(current) };
    },
    // The current version of the summary-row definition: a row with another value is rewritten by
    // refreshProgressRows(). Home asks this instead of hard-coding it.
    PROGRESS_ROW_VERSION: PROGRESS_ROW_VERSION,
    // Mark projects as synced (sets lastSyncedAt on each).
    async markSynced(projectIds, timestamp) {
      const ts = timestamp || new Date().toISOString();
      const db = await getDB();
      await new Promise((resolve,reject) => {
        const tx = db.transaction([STORE_NAME,META_STORE,STATS_STORE,'pendingImports'],'readwrite');
        const pending = tx.objectStore('pendingImports');
        projectIds.forEach(id => {
          const req = tx.objectStore(STORE_NAME).get(id), pr = pending.get(PROGRESS_PREFIX + id), or = pending.get(OVERLAY_PREFIX + id);
          let ready = 0;
          const done = () => {
            if (++ready !== 3) return;
            const p = req.result;
            if (!p) return; // A concurrent deletion must stay deleted.
            p.syncMeta = Object.assign({},p.syncMeta,{lastSyncedAt:ts});
            tx.objectStore(STORE_NAME).put(p,id);
            // An overlay's fields stand for the record's: it carries syncMeta too.
            const ov = overlayCurrent(p, or.result) ? or.result : null;
            if (ov) { ov.fields.syncMeta = Object.assign({}, ov.fields.syncMeta, {lastSyncedAt:ts}); pending.put(ov); }
            const view = storedView(p, ov, pr.result);
            tx.objectStore(META_STORE).put(buildMeta(view, ov ? {baseWriteAt:p.lastWriteAt,lastWriteAt:ov.lastWriteAt,lastWriteTabId:ov.lastWriteTabId} : undefined),id);
            if (id.startsWith('proj_')) tx.objectStore(STATS_STORE).put(buildStatsSummary(view),id);
          };
          req.onsuccess = done; pr.onsuccess = done; or.onsuccess = done;
        });
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Sync status write failed'));
      });
    },

    // Save a project. Assigns a new ID and createdAt if the project has none.
    // Returns a Promise<string> of the saved project ID.
    //
    // options.preserveUpdatedAt — keep the project's existing `updatedAt`
    // instead of restamping it with this device's wall clock. Sync writes
    // MUST pass this. An imported record's `updatedAt` is the *authoring*
    // device's edit time; overwriting it with "now" destroyed the real edit
    // history and — because executeImport saves newest-first while
    // listProjects() sorts newest-first again — inverted the receiving
    // device's library, surfacing the oldest patterns at the top. It also
    // made the `identical` classification in SyncEngine.classifyProjects
    // unreachable, so every shared project stayed permanently in
    // merge-tracking and re-synced on every watcher tick.
    async save(project, options) {
      const opts = options || {};
      if (Array.isArray(project.beads)) {
        project.beads = Beads.normalise(project.beads);
        if (Array.isArray(project.beadsDone)) project.beadsDone = Beads.live(project.beads, project.beadsDone);
      }
      // A backup is being restored and the page is about to reload: a write now would put the
      // open (old) project back over the restored one (set by BackupRestore.restore).
      if (typeof window !== "undefined" && window.__restoringBackup > Date.now()) return project && project.id;
      if (!project.id) {
        project.id = this.newId();
        project.createdAt = new Date().toISOString();
      }
      // Refuse to save a project that was deleted during this page session —
      // the guard exists to stop an in-flight autosave resurrecting a project
      // the user just deleted. Sync imports and explicit restores pass
      // opts.resurrect to override it: there the (re-)creation IS the intent,
      // and silently returning success here made a delete-all followed by a
      // same-session re-import drop every project while the import reported
      // them as imported.
      if (this._deletedIds.has(project.id)) {
        if (opts.resurrect) {
          this._deletedIds.delete(project.id);
        } else {
          return project.id;
        }
      }
      if (!(opts.preserveUpdatedAt && project.updatedAt)) {
        project.updatedAt = new Date().toISOString();
      }
      // INT-7 Phase B: stamp a numeric (epoch ms) write timestamp and the
      // authoring tab id alongside the existing ISO `updatedAt` string.
      // These power the stale-read conflict detection in Phase B-2:
      // before writing, a future `saveChecked` will compare the in-IDB
      // `lastWriteAt` against what this tab last saw, and a divergence
      // with a different `lastWriteTabId` is a concurrent-write conflict.
      // Stored separately from `updatedAt` so existing serializers,
      // sync-engine fingerprints, and PDF-export bit-stable paths that
      // depend on the ISO string aren't disturbed.
      project.lastWriteAt = Date.now();
      project.lastWriteTabId =
        (typeof window !== 'undefined' && window.CrossTabCoord && window.CrossTabCoord.tabId)
          || null;
      // Invalidate the bulk-hydration cache (action plan H4 = 2C.1) so the
      // next stats render sees this save's data even before metas signature
      // changes propagate.
      this._allFullCache = null;

      // When the marks in this snapshot were read (the Tracker's buildSnapshot
      // stamps navigationAt as it reads them). A progress record this tab wrote
      // later holds newer marks, which an overlay save keeps (see below).
      const capturedAt = typeof opts.capturedAt === "number" ? opts.capturedAt
        : (typeof project.navigationAt === "number" ? project.navigationAt : Date.now());
      const storage = this;
      // Only an opted-in save of an ordinary project may skip the full record:
      // imports, restores and sync writes (preserveUpdatedAt, syncExpected)
      // always write it whole.
      const overlayWanted = !!opts.overlay && !opts.preserveUpdatedAt && !Object.prototype.hasOwnProperty.call(opts, "syncExpected")
        && typeof project.id === "string" && project.id.startsWith("proj_") && Array.isArray(project.pattern);
      let wroteOverlay = false;

      // Fingerprints are computed by sync-specific export/classification flows.
      // Avoid doing expensive whole-project fingerprinting on every normal save.
      try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
          let tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE, "pendingImports"], "readwrite");
          let store = tx.objectStore(STORE_NAME);
          let metaStore = tx.objectStore(META_STORE);
          let statsStore = tx.objectStore(STATS_STORE);
          const pending = tx.objectStore("pendingImports");
          let refusedPatternless = false, refusedSyncRace = false, refusedChartRace = false;
          const putCheckpoints = () => {
            putCheckpoint(pending, project, project.activeSessionCheckpoint);
            const cursor = pending.openCursor(sessionRange(project.id));
            cursor.onsuccess = () => {
              const c = cursor.result;
              if (!c) return;
              if (!c.value.closed && sessionEnded(project, c.value.sessionId)) c.update({id:c.key,projectId:project.id,sessionId:c.value.sessionId,closed:true});
              c.continue();
            };
            // Checkpoints live in the journal; never leave a stale embedded copy in the full record.
            delete project.activeSessionCheckpoint;
            delete project.sessionCheckpoints;
          };
          const putAll = () => {
            putCheckpoints();
            store.put(project, project.id);
            // The overlay (if any) described the record just replaced.
            pending.delete(OVERLAY_PREFIX + project.id);
            const meta=buildMeta(project);
            metaStore.put(meta, project.id);
            rememberProgressBase(project,meta.checkpointFence);
            if (project.id && project.id.startsWith("proj_")) {
              statsStore.put(buildStatsSummary(project), project.id);
            }
          };
          // The overlay save: the full record (`base`, possibly only its cached
          // summary) stays; the snapshot's marks go to the progress record and
          // everything else to the overlay row, both based on that record.
          const putOverlay = (base, prev, prevOverlay) => {
            const baseAt = base.lastWriteAt;
            if (prev && prev.baseWriteAt !== baseAt) prev = null;
            if (prevOverlay && prevOverlay.baseWriteAt !== baseAt) prevOverlay = null;
            // The write stamp only ever moves forward, past the record's and the last overlay's.
            project.lastWriteAt = Math.max(project.lastWriteAt, baseAt + 1, prevOverlay ? prevOverlay.lastWriteAt + 1 : 0);
            putCheckpoints();
            const own = project.lastWriteTabId;
            // Marks: this snapshot's, unless this tab has since written newer
            // ones to the progress record (a mark made while the save waited).
            const keepPrev = !!(prev && own && prev.tabId === own && prev.updatedAt > capturedAt);
            let rec;
            if (keepPrev) {
              rec = Object.assign({}, prev);
            } else {
              rec = {
                id: PROGRESS_PREFIX + project.id, projectId: project.id, v: 1,
                done: Uint8Array.from(project.done || []),
                // Dated when its marks were read, so a progress write this tab
                // captured later (newer marks) still lands after it, and one
                // captured earlier is turned away (see saveProgress).
                baseWriteAt: baseAt, tabId: own || null, updatedAt: Math.max(capturedAt, prev ? prev.updatedAt + 1 : 0)
              };
              MARK_SETS.forEach(f => { rec[f] = Array.isArray(project[f]) ? project[f] : []; });
              // The same registers a full save would write, as a delta over the
              // record's (as saveProgress builds them).
              const previous = applyProgressRecord(base, prev, null, {typed:true,skipTracking:true});
              let delta = null;
              if (previous !== base) delta = prev.trackingSyncDelta || TrackingSync.deltaFrom(previous, applyProgressRecord(base, prev, null, {typed:true}).trackingSync);
              rec.trackingSyncDelta = TrackingSync.recordDelta(previous, delta, Object.assign({}, project, { done: rec.done }));
            }
            // Values: registers over the last save's (the last overlay's, else the record's).
            const valueBase = prevOverlay ? Object.assign({}, prevOverlay.fields, { valueSync: prevOverlay.valueSync }) : base;
            const values = TrackingSync.recordValues(valueBase, project);
            Object.keys(values).forEach(k => { if (k !== "valueSync") project[k] = values[k]; });
            project.valueSync = values.valueSync;
            const ov = { id: OVERLAY_PREFIX + project.id, projectId: project.id, v: 1, baseWriteAt: baseAt,
              lastWriteAt: project.lastWriteAt, lastWriteTabId: own || null, at: rec.updatedAt,
              fields: overlayFields(project), valueSync: project.valueSync };
            pending.put(rec);
            pending.put(ov);
            const viewForMeta = keepPrev ? Object.assign({}, project, { done: rec.done }, MARK_SETS.reduce((o, f) => { o[f] = rec[f]; return o; }, {})) : project;
            const meta = buildMeta(viewForMeta, { baseWriteAt: baseAt, lastWriteAt: project.lastWriteAt, lastWriteTabId: own || null });
            meta.progressAt = rec.updatedAt;
            metaStore.put(meta, project.id);
            statsStore.put(buildStatsSummary(viewForMeta), project.id);
            // Still the same full record: only its fence token moves on.
            if (progressBaseCache && progressBaseCache.id === project.id) progressBaseCache.token = meta.checkpointFence.token;
            wroteOverlay = true;
          };
          // Read the old record and its current small progress overlay in the same
          // transaction as the write. Import/restore already carries peer metadata:
          // never reinterpret a remote absence as a newly authored local removal.
          const metaReq = metaStore.get(project.id);
          const progressReq = pending.get(PROGRESS_PREFIX + project.id);
          const overlayReq = pending.get(OVERLAY_PREFIX + project.id);
          let getReq = null, ready = 0;
          const full = () => {
            getReq = store.get(project.id);
            getReq.onsuccess = finish;
          };
          const finish = () => {
            if (++ready !== 4) return;
            const existing = getReq.result;
            const prevOverlay = overlayCurrent(existing, overlayReq.result) ? overlayReq.result : null;
            if (Object.prototype.hasOwnProperty.call(opts,'syncExpected')) {
              const current = storedView(existing,prevOverlay,progressReq.result);
              const signature = p => p ? TrackingSync.canonical({lastWriteAt:p.lastWriteAt || null,
                marks:TrackingSync.merge(p,{}).trackingSync,values:TrackingSync.mergeValues(p,{}).valueSync}) : null;
              if (signature(current) !== opts.syncExpected) {
                refusedSyncRace = true; tx.abort(); return;
              }
            }
            if (!opts.preserveUpdatedAt && existing && (existing.chartRevision || null) !== (project.chartRevision || null)) {
              refusedChartRace = true; tx.abort(); return;
            }
            // Distinct writes must retire the prior progress overlay even in the
            // same millisecond (imports can otherwise reload stale completion).
            if (existing && typeof existing.lastWriteAt === "number") project.lastWriteAt = Math.max(project.lastWriteAt, existing.lastWriteAt + 1);
            if (prevOverlay) project.lastWriteAt = Math.max(project.lastWriteAt, prevOverlay.lastWriteAt + 1);
            if (!project.pattern && !project.p && existing && (existing.pattern || existing.p)) {
              refusedPatternless = true;
              try { tx.abort(); } catch (_) {}
              return;
            }
            // The record had to be read: an overlay save is still possible when
            // its chart is the snapshot's (compared once; later saves of the same
            // chart find it by identity in the base cache).
            if (overlayWanted && existing && typeof existing.lastWriteAt === "number" && (existing.pattern || existing.p)) {
              const chart = {}; CHART_KEYS.forEach(k => { if (k in existing) chart[k] = existing[k]; });
              if (sameChart(chart, project)) {
                const m = metaReq.result, fence = m && m.checkpointFence && m.checkpointFence.token ? m.checkpointFence : checkpointFence(existing);
                rememberProgressBase(existing, fence);
                if (progressBaseCache) { CHART_KEYS.forEach(k => { if (k in project) progressBaseCache.chart[k] = project[k]; }); }
                putOverlay(existing, progressReq.result, prevOverlay);
                return;
              }
            }
            if (!opts.preserveUpdatedAt) {
              const previous = storedView(existing, prevOverlay, progressReq.result);
              Object.assign(project, TrackingSync.record(previous, project));
            }
            putAll();
          };
          // The metadata token says whether the cached base is still the stored
          // record: then neither the record nor its chart need reading.
          let early = 0;
          const decide = () => {
            if (++early !== 3) return;
            const m = metaReq.result, c = progressBaseCache;
            const ov = overlayReq.result;
            if (overlayWanted && c && c.id === project.id && m && m.checkpointFence && m.checkpointFence.token === c.token
                && typeof c.project.lastWriteAt === "number" && (c.project.chartRevision || null) === (project.chartRevision || null)
                && c.project.pattern.length === project.pattern.length && sameChart(c.chart, project)) {
              // Same chart by content: remember the snapshot's arrays, so the next
              // comparison is by identity.
              CHART_KEYS.forEach(k => { if (k in project) c.chart[k] = project[k]; });
              const base = Object.assign({}, c.project, { id: project.id });
              putOverlay(base, progressReq.result, ov && ov.v === 1 && ov.projectId === project.id && ov.baseWriteAt === base.lastWriteAt ? ov : null);
              return;
            }
            ready = 3;
            full();
          };
          metaReq.onsuccess = decide;
          progressReq.onsuccess = decide;
          overlayReq.onsuccess = decide;
          tx.onabort = () => {
            if (refusedChartRace) {
              reject(new Error('The chart was updated. Reload this project before saving changes.'));
            } else if (refusedSyncRace) {
              const err = new Error('Project changed while sync was saving. Prepare the sync file again.'); err.state = 'conflicted'; reject(err);
            } else if (refusedPatternless) {
              console.error("ProjectStorage.save refused: a record without a pattern would overwrite one that has it", project.id);
              try {
                if (typeof window !== 'undefined' && window.Toast && window.Toast.show) {
                  window.Toast.show({ message: "Couldn't save: that would have erased the pattern. Your stored project was left as it was.", type: "error", duration: 10000 });
                }
              } catch (_) {}
              reject(new Error("Refused to overwrite a patterned project with a patternless record"));
            } else {
              reject(tx.error || new Error("Project save aborted"));
            }
          };
          tx.oncomplete = () => {
            // Only retire backup records actually present in this committed snapshot (or tombstoned).
            // A finalisation arriving while the save awaited IDB keeps its own recovery copy.
            try {
              const key='cs_pending_session_'+project.id,raw=localStorage.getItem(key);
              if(raw){const parsed=JSON.parse(raw),rows=Array.isArray(parsed)?parsed:[parsed];
                const left=rows.filter(r=>{
                  if(!r)return false;
                  if((project.deletedSessionIds||[]).includes(r.groupId||r.id))return false;
                  if(!sessionEnded(project,r.groupId||r.id))return true;
                  // A save started before Undo must not retire a newer correction to the same session ID.
                  const saved=(project.statsSessions||[]).find(s=>s&&s.id===r.id);
                  return (r.historyCorrectionRevision||0)>((saved&&saved.historyCorrectionRevision)||0)&&!(saved&&saved.editedAt&&Date.parse(saved.editedAt)>=r.historyCorrectedAt);
                });
                if(left.length)localStorage.setItem(key,JSON.stringify(left));else localStorage.removeItem(key);
              }
            }catch(_){}
            // Trigger auto-export to sync folder if enabled. opts.syncOrigin
            // ("import") marks a write that applies another device's sync
            // file, so it is not counted as this device's unshared work.
            if (typeof SyncEngine !== "undefined" && SyncEngine.triggerAutoExport) {
              try { SyncEngine.triggerAutoExport(opts.syncOrigin ? { origin: opts.syncOrigin } : undefined); } catch (e) {}
            }
            // Brief D — sync this project's thread requirements into the
            // Stash Manager's pattern library so the inventory & shopping
            // list views stay current without visiting the Manager page.
            // Only sync named projects (proj_*) — skips "auto_save" and
            // similar transient keys.
            if (typeof StashBridge !== "undefined" && StashBridge.syncProjectToLibrary
                && project.id && project.id.startsWith("proj_") && project.pattern && typeof threadDemandRows === "function") {
              try {
                // Physical-thread equivalents include blends, fractional crosses and lines.
                const fc = (project.settings && project.settings.fabricCt) || 14;
                const skeinData = libraryDemand(project, fc);
                StashBridge.syncProjectToLibrary(
                  project.id, project.name || "Untitled pattern", skeinData, "inprogress", fc,
                  opts.syncOrigin ? { syncOrigin: opts.syncOrigin } : undefined
                ).catch(function(err) {
                  // Don't block save on sync errors, but do surface them in
                  // the console so a broken bridge doesn't silently desync
                  // the Stash Manager from the active project list.
                  try { console.warn("ProjectStorage: stash sync failed for", project.id, err); } catch (_) {}
                });
              } catch (e) { /* never block save on sync errors */ }
            }
            // Notify listeners (Home dashboard, Manager pattern library, etc.) that
            // the project list changed so they can refresh without a page reload.
            try {
              if (typeof window !== "undefined" && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent("cs:projectsChanged", {
                  detail: { reason: "save", id: project.id }
                }));
              }
            } catch (e) {}
            // INT-7 (visibility tier): broadcast to other tabs so they can
            // surface a "changed elsewhere" toast. Only meaningful for named
            // projects; ignore the auto_save legacy key. Phase B-1: also
            // pass through lastWriteAt + lastWriteTabId so subscribers can
            // compare versions without re-reading IDB. Phase B-1: note our
            // own write into the last-seen cache so the next save() from
            // this tab has an accurate baseline.
            try {
              if (typeof window !== "undefined" && window.CrossTabCoord
                  && project.id && project.id.indexOf("proj_") === 0) {
                if (typeof window.CrossTabCoord.noteSeen === 'function') {
                  window.CrossTabCoord.noteSeen(
                    project.id, project.lastWriteAt, project.lastWriteTabId);
                }
                window.CrossTabCoord.broadcastProjectSaved(
                  project.id,
                  project.updatedAt || Date.now(),
                  project.lastWriteAt,
                  project.lastWriteTabId);
              }
            } catch (_) {}
            resolve(project.id);
          };
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.error("ProjectStorage.save failed:", err);
        try {
          if (typeof window !== 'undefined' && window.Toast && window.Toast.show) {
            const now = Date.now();
            if (!window.__psSaveToastAt || (now - window.__psSaveToastAt) > 30000) {
              window.__psSaveToastAt = now;
              const isQuota = err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message || '')));
              window.Toast.show({
                message: isQuota
                  ? "Couldn't save: storage quota exceeded. Free up space or export a backup."
                  : "Couldn't save your project. Changes may be lost on reload.",
                type: "error",
                duration: 10000
              });
            }
          }
        } catch (_) {}
        throw err;
      }
    },

    // INT-7 Phase B-2: save with stale-read conflict detection.
    //
    // Returns a discriminated result object:
    //   { ok: true,  id }
    //   { ok: false, reason: 'conflict', id, remoteWriteAt, remoteWriteTabId }
    //
    // A conflict is reported when ALL of the following hold for `project.id`:
    //   • CrossTabCoord.getSeen(id) returned a baseline (we've loaded or
    //     saved this project at least once in this tab).
    //   • The current in-IDB record has a numeric `lastWriteAt` strictly
    //     greater than the baseline (something newer is on disk).
    //   • The on-disk `lastWriteTabId` is a non-empty string and differs
    //     from the baseline's `lastWriteTabId` (a different tab authored
    //     the newer write).
    //
    // If any condition fails we fall through to a regular save() — that
    // covers brand-new projects (no id yet), projects this tab has never
    // loaded (no baseline), legacy records without Phase B fields, and
    // the trivial "we wrote it ourselves between calls" case.
    //
    // The existing save() remains unchanged for back-compat; callers
    // wanting conflict detection must opt in via saveChecked().
    async saveChecked(project, options) {
      if (!project) {
        throw new TypeError("ProjectStorage.saveChecked: project is required");
      }
      if (!project.id || this._deletedIds.has(project.id)) {
        const id = await this.save(project, options);
        return { ok: true, id: id };
      }
      let seen = null;
      let ownTabId = null;
      try {
        if (typeof window !== 'undefined' && window.CrossTabCoord
            && typeof window.CrossTabCoord.getSeen === 'function') {
          seen = window.CrossTabCoord.getSeen(project.id);
          ownTabId = window.CrossTabCoord.tabId || null;
        }
      } catch (_) {}
      if (seen && typeof seen.lastWriteAt === 'number') {
        // Only the stored write stamps are compared: read them from the
        // metadata row (and the overlay's, via its progress-fence fields) rather
        // than loading and assembling the whole project, which on a large chart
        // cost as much as the save itself.
        let current = null;
        try { current = await this.writeStamp(project.id); } catch (_) {}
        if (current
            && typeof current.lastWriteAt === 'number'
            && current.lastWriteAt > seen.lastWriteAt
            && typeof current.lastWriteTabId === 'string'
            && current.lastWriteTabId
            && current.lastWriteTabId !== seen.lastWriteTabId
            // Two saves from this tab can overlap (an autosave while the
            // previous one is still writing); our own write is never a
            // conflict.
            && current.lastWriteTabId !== ownTabId) {
          return {
            ok: false,
            reason: 'conflict',
            id: project.id,
            remoteWriteAt: current.lastWriteAt,
            remoteWriteTabId: current.lastWriteTabId
          };
        }
      }
      const id = await this.save(project, options);
      return { ok: true, id: id };
    },

    // The stamps of the project's last write as get() would report them:
    // { lastWriteAt, lastWriteTabId }, the overlay's when its last save was an
    // overlay save. Read from the metadata row, which every write to the record
    // or its overlay rewrites in the same transaction; a row from an older build
    // (no stamps) falls back to reading the project. null when not stored.
    async writeStamp(id) {
      const db = await getDB();
      const meta = await new Promise((resolve, reject) => {
        const req = db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (meta && typeof meta.lastWriteAt === "number" && typeof meta.baseWriteAt === "number") {
        return { id: id, lastWriteAt: meta.lastWriteAt, lastWriteTabId: meta.lastWriteTabId || null };
      }
      const p = await this.get(id);
      return p ? { id: id, lastWriteAt: p.lastWriteAt, lastWriteTabId: p.lastWriteTabId } : null;
    },

    // Projects whose get() may currently read differently from their stored
    // rows: a navigation journal not yet recovered (get() folds it in), or a
    // session checkpoint still open (get() lists it in sessionCheckpoints,
    // depending on whether a live tab holds its lock). Neither changes the
    // metadata row, so a reader that keys on metadata (the sync export cache)
    // must read these through get(). One read of the session rows.
    async unsettledProjects() {
      const out = new Set();
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(RECOVERY_PREFIX)) out.add(k.slice(RECOVERY_PREFIX.length));
        }
      } catch (_) {}
      const db = await getDB();
      if (!db.objectStoreNames.contains("pendingImports")) return out;
      const rows = await new Promise((resolve, reject) => {
        const q = db.transaction("pendingImports", "readonly").objectStore("pendingImports")
          .getAll(IDBKeyRange.bound(SESSION_PREFIX, SESSION_PREFIX + "\uffff"));
        q.onsuccess = () => resolve(q.result || []); q.onerror = () => reject(q.error);
      });
      rows.forEach(r => { if (r && !r.closed && typeof r.projectId === "string") out.add(r.projectId); });
      return out;
    },

    // Load a single project by ID. Returns null if not found.
    // Read a review base from one consistent transaction, including progress and
    // session journals. The token covers bytes rather than timestamps alone.
    async prepareChartUpdate(id) {
      await this.get(id); // fold any recoverable navigation progress first
      const db=await getDB();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction([STORE_NAME,'pendingImports'],'readonly');
        const p=tx.objectStore(STORE_NAME).get(id), r=tx.objectStore('pendingImports').get(PROGRESS_PREFIX+id);
        const o=tx.objectStore('pendingImports').get(OVERLAY_PREFIX+id);
        const sessions=tx.objectStore('pendingImports').getAll(sessionRange(id));
        tx.oncomplete=()=>{
          if(!p.result){reject(new Error('Project no longer exists.'));return;}
          const ov=overlayCurrent(p.result,o.result)?o.result:null;
          resolve({project:storedView(p.result,ov,r.result),token:TrackingSync.canonical([p.result,r.result||null,sessions.result,ov])});
        };
        tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Chart read aborted'));
      });
    },

    // Snapshot, source, project, progress fence and summaries commit together.
    // No stash/consumption API is called here. A failed transaction publishes nothing.
    async applyChartUpdate(id, token, incoming, options, resolutions, source, restoreId) {
      if(window.__restoringBackup>Date.now())throw Error('Chart updates are paused during backup recovery.');
      const db=await getDB(), storage=this;
      const snapshotId='chart-update:'+id+':'+this.newId();
      const revision=this.newId();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction([STORE_NAME,META_STORE,STATS_STORE,'pendingImports'],'readwrite');
        const store=tx.objectStore(STORE_NAME),pending=tx.objectStore('pendingImports');
        const p=store.get(id),r=pending.get(PROGRESS_PREFIX+id),sessions=pending.getAll(sessionRange(id));
        const o=pending.get(OVERLAY_PREFIX+id);
        const snapshot=restoreId?pending.get(restoreId):null;
        let ready=0,failure;
        function finish() {
          if(++ready!==(snapshot?5:4))return;
          try {
            if(window.__restoringBackup>Date.now())throw Error('Chart updates are paused during backup recovery.');
            if(storage._deletedIds.has(id)||!p.result)throw Error('Project no longer exists.');
            const ov=overlayCurrent(p.result,o.result)?o.result:null;
            if(TrackingSync.canonical([p.result,r.result||null,sessions.result,ov])!==token)throw Error('Project changed during review. Reopen the preview before applying.');
            // Running timers / unflushed consumption must be settled in the Tracker first.
            const before=storedView(p.result,ov,r.result);
            if(sessions.result.some(s=>!s.closed&&!sessionEnded(before,s.sessionId)))throw Error('End the active session in the Tracker before updating this chart.');
            let next,review;
            if(snapshot) {
              if(!snapshot.result||snapshot.result.projectId!==id||!snapshot.result.before)throw Error('Recovery snapshot is missing or belongs to another project.');
              next=structuredClone(snapshot.result.before);
            } else {
              review=window.ChartUpdates.preview(before,incoming,options,resolutions);
              if(!review.ready)throw Error('Resolve every ambiguous match before applying.');
              next=review.result;
            }
            next.id=id;next.chartRevision=revision;
            Object.keys(next.chartAccountingUnits||{}).forEach(k=>{
              if(next.chartAccountingUnits[k].startsWith('pending:'))next.chartAccountingUnits[k]=revision+'|'+k;
            });
            next.updatedAt=new Date().toISOString();next.lastWriteAt=Math.max(Date.now(),(p.result.lastWriteAt||0)+1,(ov?ov.lastWriteAt:0)+1);
            next.lastWriteTabId=window.CrossTabCoord&&window.CrossTabCoord.tabId||null;
            // Registers from the old coordinate system must not seed new marks.
            delete next.trackingSync;delete next.valueSync;
            Object.assign(next,TrackingSync.record(null,next));
            pending.put({id:snapshotId,projectId:id,createdAt:Date.now(),before,after:next,
              originalProject:p.result,progress:r.result||null,overlay:ov,sessionRows:sessions.result,
              incoming:incoming||null,source:source||null,options:options||null,resolutions:resolutions||null,
              restoredFrom:restoreId||null,annotations:review&&review.annotations||[]});
            store.put(next,id);pending.delete(PROGRESS_PREFIX+id);pending.delete(OVERLAY_PREFIX+id);
            tx.objectStore(META_STORE).put(buildMeta(next),id);
            tx.objectStore(STATS_STORE).put(buildStatsSummary(next),id);
          } catch(e){failure=e;tx.abort();}
        }
        p.onsuccess=finish;r.onsuccess=finish;o.onsuccess=finish;sessions.onsuccess=finish;if(snapshot)snapshot.onsuccess=finish;
        tx.onerror=()=>reject(failure||tx.error);
        tx.onabort=()=>reject(failure||tx.error||new Error('Chart update aborted; previous project retained.'));
        tx.oncomplete=()=>{
          storage._allFullCache=null;
          try {
            window.dispatchEvent(new CustomEvent('cs:projectsChanged',{detail:{reason:'chart-update',id}}));
            if(window.CrossTabCoord&&window.CrossTabCoord.notifySaved)window.CrossTabCoord.notifySaved(id,Date.now(),window.CrossTabCoord.tabId);
          } catch(_) { /* A notification failure cannot turn a committed update into a failed save. */ }
          resolve(snapshotId);
        };
      });
    },

    async get(id) {
      try {
        const db = await getDB();
        try { await this._recoverProgress(db, id); } catch (err) { console.warn("Progress recovery deferred:", err); }
        // Read history and its retirement fences together. Separate reads could see old
        // history followed by a newly closed checkpoint and briefly hide the recovered run.
        const loaded = await new Promise((resolve, reject) => {
          const tx = db.transaction([STORE_NAME, 'pendingImports', META_STORE], 'readonly');
          const p = tx.objectStore(STORE_NAME).get(id);
          const meta = tx.objectStore(META_STORE).get(id);
          const pending = tx.objectStore('pendingImports');
          const rows = pending.getAll(sessionRange(id));
          // The small rows a Tracker save leaves beside the record, read in the
          // same transaction so the record, its overlay and its marks agree.
          const named = typeof id === "string" && id.startsWith("proj_");
          const progress = named ? pending.get(PROGRESS_PREFIX + id) : null;
          const overlay = named ? pending.get(OVERLAY_PREFIX + id) : null;
          tx.oncomplete = () => resolve({project:p.result || null,rows:rows.result || [],meta:meta.result,
            progress:progress ? progress.result || null : null, overlay:overlay ? overlay.result || null : null});
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Project read aborted'));
        });
        const raw = loaded.project;
        rememberProgressBase(raw,loaded.meta&&loaded.meta.checkpointFence);
        let project = raw;
        if (raw && typeof id === "string" && id.startsWith("proj_")) {
          // Marks the Tracker wrote to the small progress record but not yet to the
          // full project (see saveProgress), and the overlay of its last save.
          // Applied only when still current.
          const ov = overlayCurrent(raw, loaded.overlay) ? loaded.overlay : null;
          const rec = loaded.progress;
          project = storedView(raw, ov, rec);
          // Newer marks than the stored save holds: the progress record's when there
          // is no overlay (unless they match the record), or marks written after
          // the overlay's save.
          const viaProgress = applyProgressRecord(raw, rec, ov ? overlayBase(raw, ov) : undefined, { skipTracking: true, typed: true }) !== raw;
          if (viaProgress && (ov ? rec.updatedAt !== ov.at : !sameMarks(raw, rec))) loadedWithProgressSet.add(project);
        }
        if (project) project.sessionCheckpoints = await this.readSessionCheckpoints(id, project, loaded.rows);
        // Normalise threadOwned keys to bare DMC IDs ("310" not "dmc:310").
        // Creator and Tracker both key threadOwned by palette entry id, which is
        // always a bare id like "310". Any composite keys written by an older
        // migration are stripped back to bare so lookups work correctly.
        if (project && project.threadOwned) {
          let changed = false;
          const normalised = {};
          for (const [key, val] of Object.entries(project.threadOwned)) {
            const bareKey = key.indexOf(':') >= 0 ? key.slice(key.indexOf(':') + 1) : key;
            if (bareKey !== key) changed = true;
            // If we already have a value for this bare key (composite + bare both exist),
            // prefer the non-empty value so we don't lose owned state.
            if (normalised[bareKey] === undefined || !normalised[bareKey]) {
              normalised[bareKey] = val;
            }
          }
          if (changed) project.threadOwned = normalised;
        }
        return project;
      } catch (err) {
        console.error("ProjectStorage.get failed:", err);
        return null;
      }
    },

    // Small, asynchronous session journal. No pattern clone and no synchronous mark-path I/O.
    async saveSessionCheckpoint(id, checkpoint) {
      if (!validCheckpoint(checkpoint, id)) throw new Error('Invalid session checkpoint');
      if (this._deletedIds.has(id) || (typeof window !== 'undefined' && window.__restoringBackup > Date.now())) throw new Error('Session checkpoint saving is paused');
      const cp = structuredClone(checkpoint);
      const db = await getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME, META_STORE, 'pendingImports'], 'readwrite');
        const metaStore=tx.objectStore(META_STORE);
        const metaReq=metaStore.get(id);
        metaReq.onsuccess=()=>{
          const meta=metaReq.result;
          if(meta&&meta.checkpointFence){putCheckpoint(tx.objectStore('pendingImports'),meta.checkpointFence,cp);return;}
          const req=tx.objectStore(STORE_NAME).get(id);
          req.onsuccess=()=>{
            if(!req.result){tx.abort();return;}
            const fence=checkpointFence(req.result);
            if(meta)metaStore.put(Object.assign({},meta,{checkpointFence:fence}),id);
            putCheckpoint(tx.objectStore('pendingImports'),fence,cp);
          };
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Session checkpoint aborted'));
      });
      return true;
    },

    async retireSessionCheckpoint(id, sessionId) {
      const db=await getDB();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('pendingImports','readwrite');
        tx.objectStore('pendingImports').put({id:sessionKey(id,sessionId),projectId:id,sessionId:sessionId,closed:true});
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Session retirement aborted'));
      });
    },

    async readSessionCheckpoints(id, project, cachedRows) {
      const db = await getDB();
      const rows = cachedRows || await new Promise((resolve, reject) => {
        const q = db.transaction('pendingImports', 'readonly').objectStore('pendingImports').getAll(sessionRange(id));
        q.onsuccess = () => resolve(q.result || []); q.onerror = () => reject(q.error);
      });
      // A live renderer holds a lock for its run. Other tabs must not finalise it while it is still recording.
      // Renderer termination releases the lock without needing any page lifecycle event.
      let held = [];
      if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.query) held = (await navigator.locks.query()).held || [];
      return rows.filter(cp => !cp.closed && validCheckpoint(cp,id) && !sessionEnded(project,cp.sessionId) &&
        !held.some(lock => lock.name === 'cs-session:' + cp.sessionId));
    },

    // ── Progress record ─────────────────────────────────────────────────
    // Saving the whole project (pattern, history, settings) costs up to ~150 ms
    // on a large chart, so the Tracker does it every few seconds. Marked stitches
    // go to this much smaller record, written about every 400 ms: the done
    // array as a typed array (90 KB for a 300x300 chart) plus the half-stitch
    // and knot marks. It lives in the pendingImports store as "progress:<id>"
    // (the same store BlobStore uses for trace pictures), so there is no schema
    // change; backups fold it into the project, and deleting the project deletes it.
    //
    // It is only believed while it is newer than the project record: it carries
    // baseWriteAt, the project's lastWriteAt when it was written. Any later write
    // to the project (the Tracker's own full save, a sync import, a restore, a
    // rename) changes lastWriteAt, which makes the record stale and ignored.
    // data: { done: Uint8Array|Array, halfDone: [[idx,{fwd,bck}]], knotsDone: [], bsDone: [], partialDone: [[idx,[pos]]],
    //         baseWriteAt: number|null, tabId }
    async saveProgress(id, data) {
      if (!id || !data || !data.done || this._deletedIds.has(id)) return false;
      if (typeof window !== "undefined" && window.__restoringBackup > Date.now()) return false;
      try {
        // Capture the marks and their age before yielding; an older call waiting
        // for the DB must not appear newer than a navigation journal.
        const rec = {
          id: PROGRESS_PREFIX + id, projectId: id, v: 1,
          done: Uint8Array.from(data.done),
          halfDone: data.halfDone, knotsDone: data.knotsDone, beadsDone: data.beadsDone,
          bsDone: data.bsDone, partialDone: data.partialDone, specialtyDone:data.specialtyDone,
          baseWriteAt: typeof data.baseWriteAt === "number" ? data.baseWriteAt : null,
          tabId: data.tabId || null, updatedAt: Date.now()
        };
        const db = await getDB();
        if (!db.objectStoreNames.contains("pendingImports")) return false;
        // Whether the marks are now on disk in a form reloading applies. False when the
        // project is not stored yet, or the record's base is not the project's last full
        // save (it would be ignored); the Tracker then stops relying on progress records.
        let applies = false, accepted = false;   // accepted: this record was put (not turned away by a newer one)
        await new Promise((resolve, reject) => {
          const tx = db.transaction(["pendingImports", STORE_NAME, META_STORE], "readwrite");
          const store = tx.objectStore("pendingImports");
          const req = store.get(rec.id);
          const metaStore=tx.objectStore(META_STORE);
          const metaReq=metaStore.get(id);
          let project, metaRow;
          // No full-record request on a token match. A miss reads once, inside
          // this transaction, and upgrades metadata from older app versions.
          metaReq.onsuccess=()=>{
            const meta=metaRow=metaReq.result,fence=meta&&meta.checkpointFence;
            // Marks from a tab that last saw an overlay save name the overlay's
            // stamp; they are based on its full record.
            const rebased=rebase(rec,meta);
            if(rebased!==rec)rec.baseWriteAt=rebased.baseWriteAt;
            if(fence&&fence.token&&progressBaseCache&&progressBaseCache.id===id&&progressBaseCache.token===fence.token){
              project=progressBaseCache.project;finish();return;
            }
            const full=tx.objectStore(STORE_NAME).get(id);
            full.onsuccess=()=>{
              project=full.result;
              if(project){
                const currentFence=fence&&fence.token?fence:checkpointFence(project);
                if(!fence||!fence.token){metaRow=Object.assign({},meta||buildMeta(project),{checkpointFence:currentFence});metaStore.put(metaRow,id);}
                rememberProgressBase(project,currentFence);
              }
              finish();
            };
          };
          let ready = 0;
          const finish = () => {
            if (++ready !== 2) return;
            const prev = req.result;
            if(!project)return;
            if (project && project.chartRevision && rec.baseWriteAt !== project.lastWriteAt) return;
            // The marks of the record this one follows, over the base's trackingSync.
            const previous = applyProgressRecord(project, prev, null, {typed:true,skipTracking:true});
            // Missing fields from an older writer preserve the latest overlay,
            // including a prior unpick represented by an empty/missing list.
            ["halfDone", "knotsDone", "beadsDone", "bsDone", "partialDone", "specialtyDone"].forEach(f => {
              if (!Array.isArray(rec[f]) && previous) rec[f] = Array.isArray(previous[f]) ? previous[f] : [];
            });
            const current = applyProgressRecord(project, rec, null, {typed:true,skipTracking:true});
            if (current !== project) {
              const next = Object.assign({}, current, { halfDone: rec.halfDone, knotsDone: rec.knotsDone, beadsDone: rec.beadsDone, bsDone: rec.bsDone, partialDone: rec.partialDone, specialtyDone:rec.specialtyDone });
              // Only the registers that differ from the base's (TrackingSync.recordDelta):
              // the marks changed since the last full save, not one per finished stitch.
              // A record from an older build holds them all; it is cut down once here.
              let delta = null;
              if (previous !== project) {
                if (prev.trackingSyncDelta) delta = prev.trackingSyncDelta;
                else delta = TrackingSync.deltaFrom(previous, applyProgressRecord(project, prev, null, {typed:true}).trackingSync);
              }
              rec.trackingSyncDelta = TrackingSync.recordDelta(previous, delta, next);
            }
            // A delayed call must not undo a newer navigation recovery (or unpick).
            // Turned away (a newer record stands), nothing of this call is stored: false.
            if (!prev || prev.baseWriteAt !== rec.baseWriteAt || prev.updatedAt <= rec.updatedAt) {
              store.put(rec);
              accepted = true;
              applies = current !== project;
              // The project's stored content changed: say so in its metadata
              // (sync's export cache keys on it). The fence token stays, so the
              // cached base this write relied on remains valid.
              if (metaRow && metaRow.checkpointFence) metaStore.put(Object.assign({}, metaRow, { progressAt: rec.updatedAt }), id);
            }
          };
          req.onsuccess = finish;
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error("Progress save aborted"));
        });
        return applies;
      } catch (err) {
        console.warn("ProjectStorage.saveProgress failed:", err);
        return false;
      }
    },

    // Navigation cannot await IndexedDB. Only the small marks snapshot is journalled
    // synchronously; normal stitching keeps using the throttled IndexedDB writer.
    saveProgressRecovery(id, data) {
      if (!id || !data || !data.done || this._deletedIds.has(id)) return false;
      if (typeof window !== "undefined" && window.__restoringBackup > Date.now()) return false;
      try {
        localStorage.setItem(RECOVERY_PREFIX + id, JSON.stringify(Object.assign({}, data, {
          projectId: id, v: 1, done: Array.from(data.done), updatedAt: Date.now()
        })));
        return true;
      } catch (err) {
        console.warn("ProjectStorage progress recovery unavailable:", err);
        return false;
      }
    },

    async _recoverProgress(db, id) {
      let raw, rec;
      const key = RECOVERY_PREFIX + id;
      try { raw = localStorage.getItem(key); if (!raw) return; rec = JSON.parse(raw); }
      catch (_) { return; }
      if (!rec || rec.projectId !== id || rec.v !== 1 || !Array.isArray(rec.done)) return;
      // Recheck the revision inside the write transaction: a concurrent full save,
      // import or rename must retire the journal just like an ordinary progress row.
      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE, "pendingImports"], "readwrite");
        const store = tx.objectStore(STORE_NAME), pending = tx.objectStore("pendingImports");
        const p = store.get(id), r = pending.get(PROGRESS_PREFIX + id), o = pending.get(OVERLAY_PREFIX + id);
        let ready = 0;
        const recover = () => {
          if (++ready !== 3) return;
          const project = p.result;
          const ov = overlayCurrent(project, o.result) ? o.result : null;
          // A journal written after an overlay save names the overlay's stamp.
          rec = rebaseOn(rec, ov);
          // Every Tracker unload leaves a journal, changed or not. One that holds
          // exactly the marks the project and its progress record already show adds
          // nothing: rewriting the whole project for it cost seconds on every open
          // of a large chart. It is still removed below. (Marks only, no sync
          // registers, so neither check rebuilds them: a journal carries none.
          // `typed` keeps the record's own done array rather than copying it:
          // these results are only compared, never stored.)
          const quick = { skipTracking: true, typed: true };
          if (applyProgressRecord(project, rec, undefined, quick) !== project
              && sameMarks(storedView(project, ov, r.result, quick), rec)) return;
          const view = storedView(project, ov, r.result);
          let next = applyProgressRecord(project, rec, view);
          if (next === project) return;
          // A later normal progress write wins, including an unpick.
          const newer = r.result;
          if (newer && newer.updatedAt > rec.updatedAt && applyProgressRecord(project, newer) !== project) {
            next = storedView(project, ov, newer);
          } else {
            // `next` is also put as the project below, under the same lastWriteAt, so
            // the record differs from its base in no register.
            pending.put(Object.assign({}, rec, { id: PROGRESS_PREFIX + id, baseWriteAt: typeof next.lastWriteAt === "number" ? next.lastWriteAt : rec.baseWriteAt, trackingSyncDelta: {version:1, marks:{}} }));
          }
          // The overlay is folded into the record written below.
          pending.delete(OVERLAY_PREFIX + id);
          // Materialise once on recovery, never on every mark. Keep the full-save
          // revision/tab stamps: this is the same overlay get() normally presents.
          store.put(next, id);
          tx.objectStore(META_STORE).put(buildMeta(next), id);
          if (id.startsWith("proj_")) tx.objectStore(STATS_STORE).put(buildStatsSummary(next), id);
          this._allFullCache = null;
        };
        p.onsuccess = recover; r.onsuccess = recover; o.onsuccess = recover;
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Progress recovery aborted"));
      });
      // Do not erase a newer journal written by another tab while we awaited IDB.
      try { if (localStorage.getItem(key) === raw) localStorage.removeItem(key); } catch (_) {}
    },

    _readProgress(db, id) {
      return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("pendingImports")) { resolve(null); return; }
        const req = db.transaction("pendingImports", "readonly").objectStore("pendingImports").get(PROGRESS_PREFIX + id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },

    // Drop every progress record. A restore calls this: the restored projects
    // carry their own marks, and a record from before the restore must not
    // override them.
    async clearAllProgress() {
      clearProgressRecovery();
      try {
        const db = await getDB();
        if (!db.objectStoreNames.contains("pendingImports")) return 0;
        return await new Promise((resolve, reject) => {
          const tx = db.transaction("pendingImports", "readwrite");
          const store = tx.objectStore("pendingImports");
          const req = store.getAllKeys();
          let n = 0;
          req.onsuccess = () => {
            (req.result || []).forEach(k => {
              if (typeof k === "string" && (k.startsWith(PROGRESS_PREFIX) || k.startsWith(OVERLAY_PREFIX) || k.startsWith(SESSION_PREFIX))) { store.delete(k); n++; }
            });
          };
          tx.oncomplete = () => resolve(n);
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.warn("ProjectStorage.clearAllProgress failed:", err);
        return 0;
      }
    },

    // Return lightweight metadata for all named projects (those with IDs starting "proj_"),
    // sorted newest-first. Reads from the dedicated metadata store — no pattern data is loaded.
    // Rewrites the progress figures in rows saved before progress was counted in units (they counted full
    // stitches and knots only, so a project with half stitches read lower on Home than in the Tracker). Reads old
    // projects sequentially, rechecking inside the write transaction, and writes only their summary rows. Run it
    // when the browser is idle; returns how many rows it rewrote (0 once everything is current).
    async refreshProgressRows(opts) {
      const idle = (opts && opts.idle) || (cb => (typeof requestIdleCallback === "function" ? requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 50)));
      let done = 0;
      try {
        const rows = await this.listProjects();
        const stale = rows.filter(r => r && r.unitsV !== PROGRESS_ROW_VERSION);
        for (const row of stale) {
          await new Promise(res => idle(res));
          const full = await this.get(row.id);
          if (!full || !(full.pattern || full.p)) continue;
          const db = await getDB();
          const refreshed = await new Promise((resolve, reject) => {
            // get() above may recover a navigation journal, but another tab can
            // save or delete before this transaction starts. Build summaries and
            // the checkpoint fence from the current record and overlay together.
            const tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE, "pendingImports"], "readwrite");
            const projectReq=tx.objectStore(STORE_NAME).get(full.id);
            const progressReq=tx.objectStore("pendingImports").get(PROGRESS_PREFIX+full.id);
            const overlayReq=tx.objectStore("pendingImports").get(OVERLAY_PREFIX+full.id);
            let ready=0;
            const finish=()=>{
              if(++ready!==3||!projectReq.result)return;
              const raw=projectReq.result,ov=overlayCurrent(raw,overlayReq.result)?overlayReq.result:null;
              const current=storedView(raw,ov,progressReq.result);
              tx.objectStore(META_STORE).put(buildMeta(current,ov?{baseWriteAt:raw.lastWriteAt,lastWriteAt:ov.lastWriteAt,lastWriteTabId:ov.lastWriteTabId}:undefined),full.id);
              tx.objectStore(STATS_STORE).put(buildStatsSummary(current),full.id);
            };
            projectReq.onsuccess=finish;progressReq.onsuccess=finish;overlayReq.onsuccess=finish;
            tx.oncomplete = () => resolve(!!projectReq.result);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error("Summary refresh aborted"));
          });
          if(refreshed)done++;
        }
      } catch (err) {
        console.warn("ProjectStorage.refreshProgressRows failed:", err);
      }
      return done;
    },

    // Planning must fail on read errors rather than treating an unreadable
    // library as deleted projects and releasing every reservation.
    async listMaterialProjects(ids) {
      const db=await getDB();
      try {return await new Promise((resolve,reject)=>{
        const tx=db.transaction([STORE_NAME,'pendingImports'],'readonly');
        const result=[];
        const store=tx.objectStore(STORE_NAME);
        const collect=p=>{
          if(!p||typeof p.id!=='string'||!p.id.startsWith('proj_'))return;
          const progress=tx.objectStore('pendingImports').get(PROGRESS_PREFIX+p.id);
          const overlay=tx.objectStore('pendingImports').get(OVERLAY_PREFIX+p.id);
          let ready=0;
          const both=()=>{if(++ready===2)result.push(storedView(p,overlayCurrent(p,overlay.result)?overlay.result:null,progress.result));};
          progress.onsuccess=both;overlay.onsuccess=both;
        };
        if(ids)ids.forEach(id=>{const req=store.get(id);req.onsuccess=()=>collect(req.result);});
        else {const req=store.getAll();req.onsuccess=()=>{(req.result||[]).forEach(collect);};}
        tx.oncomplete=()=>resolve(result);
        tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Could not read projects for material planning'));
      });} finally {db.close();}
    },

    async listProjects() {
      try {
        const db = await getDB();
        const all = await new Promise((resolve, reject) => {
          let tx = db.transaction(META_STORE, "readonly");
          let store = tx.objectStore(META_STORE);
          let request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
        return all
          .filter(p => p && p.id && typeof p.id === "string" && p.id.startsWith("proj_"))
          .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      } catch (err) {
        console.error("ProjectStorage.listProjects failed:", err);
        return [];
      }
    },

    // Hydrate the full project body for every project in the library. Used by
    // the stats surface (stats-page.js, stats-activity.js) which previously
    // had ~5 separate useEffect blocks each running their own
    // `Promise.all(metas.map(get))` — that pulled the entire pattern array
    // for every project from IndexedDB up to five times in a row on every
    // mount. Action plan headline H4 (=2C.1).
    //
    // Memoised on `(metas.length, joined updatedAt signature)`. The first
    // call computes the bulk fetch and caches the resolved Promise; later
    // calls within the same browser session return the same Promise instance
    // unless a project was added, removed, or its updatedAt advanced (which
    // is the only way the signature can change). The cache is therefore
    // self-invalidating — no event listeners required.
    //
    // Returns an array of full project objects in the same order as metas
    // (newest-first). Failed individual loads are returned as null so
    // callers retain index alignment with the metas array.
    _allFullCache: null, // { sig: string, promise: Promise<Array> }
    async getAllFull() {
      const metas = await this.listProjects();
      const sig = metas.length + '|' + metas.map(m => m.id + ':' + (m.updatedAt || '')).join(',');
      if (this._allFullCache && this._allFullCache.sig === sig) {
        return this._allFullCache.promise;
      }
      const promise = Promise.all(metas.map(m => this.get(m.id).catch(() => null)));
      this._allFullCache = { sig, promise };
      return promise;
    },

    // Convenience for stats: returns `{ metas, fulls }` together so callers
    // don't list twice. Both arrays are aligned by index.
    async getProjectsAll() {
      const metas = await this.listProjects();
      // Reuse getAllFull's cache so back-to-back consumers share the work.
      const fulls = await this.getAllFull();
      return { metas, fulls };
    },

    // Delete a project by ID. options.syncOrigin ("import") marks a deletion
    // applied from another device's sync file.
    async delete(id, options) {
      const syncOrigin = options && options.syncOrigin;
      writeTombstones([id]);
      try {
        // Record the deletion so in-flight auto-saves from Tracker/Creator
        // don't resurrect the project before the page fully reloads.
        this._deletedIds.add(id);
        clearProgressRecovery(id);
        // Invalidate the bulk-hydration cache (action plan H4 = 2C.1).
        this._allFullCache = null;
        // Clear the active project pointer if it points to this project, so the
        // Creator/Tracker don't try to load a now-deleted project on next open.
        if (this.getActiveProjectId() === id) this.clearActiveProject();
        const db = await getDB();
        return new Promise((resolve, reject) => {
          // A scratch design's tracing picture (P2-4) is kept beside it in
          // pendingImports as trace:<id>; it goes with the project.
          let hasPending = db.objectStoreNames.contains("pendingImports");
          let tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE].concat(hasPending ? ["pendingImports"] : []), "readwrite");
          let store = tx.objectStore(STORE_NAME);
          let metaStore = tx.objectStore(META_STORE);
          let statsStore = tx.objectStore(STATS_STORE);
          // Read legacy auto_save first, then perform deletes in one sequence.
          let autoSaveReq = store.get("auto_save");
          autoSaveReq.onsuccess = () => {
            let autoSave = autoSaveReq.result;
            store.delete(id);
            metaStore.delete(id);
            statsStore.delete(id);
            if (hasPending) { tx.objectStore("pendingImports").delete("trace:" + id); tx.objectStore("pendingImports").delete(PROGRESS_PREFIX + id); tx.objectStore("pendingImports").delete(OVERLAY_PREFIX + id); deletePhotoRecords(tx.objectStore("pendingImports"), id); tx.objectStore("pendingImports").delete(sessionRange(id)); }
            if (autoSave && autoSave.id === id) store.delete("auto_save");
          };
          autoSaveReq.onerror = () => reject(autoSaveReq.error);
          tx.oncomplete = () => {
            // Brief D — remove any auto-synced Manager pattern entry that was
            // linked to this project so the library doesn't show stale entries.
            if (typeof StashBridge !== "undefined" && StashBridge.unlinkProjectFromLibrary) {
              try { StashBridge.unlinkProjectFromLibrary(id, syncOrigin ? { syncOrigin: syncOrigin } : undefined).catch(() => {}); } catch (e) {}
            }
            // The deletion (and its tombstone) is sync content: send it, and
            // count it as unshared work unless it came from an import.
            if (typeof SyncEngine !== "undefined" && SyncEngine.triggerAutoExport) {
              try { SyncEngine.triggerAutoExport(syncOrigin ? { origin: syncOrigin } : undefined); } catch (e) {}
            }
            // Notify listeners (Home dashboard, Manager pattern library, etc.) that
            // the project list changed so they can refresh without a page reload.
            try {
              if (typeof window !== "undefined" && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent("cs:projectsChanged", {
                  detail: { reason: "delete", id: id }
                }));
              }
            } catch (e) {}
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.error("ProjectStorage.delete failed:", err);
        throw err;
      }
    },

    // Check whether a project ID was deleted during this page session.
    isDeleted(id) {
      return this._deletedIds.has(id);
    },

    // Remove every project on this device.
    //
    // Two callers with opposite needs, selected by options.tombstone:
    //
    //   • tombstone: false (default) — "wipe and rebuild from a peer's .csync".
    //     delete() is the wrong tool for that job in three ways: it writes a
    //     tombstone per id, and SyncEngine.classifyProjects uses tombstones to
    //     permanently skip those projects on import; it adds the id to the
    //     session-local _deletedIds guard, which makes save() a silent no-op
    //     for that id until the page reloads; and both survive the wipe, so a
    //     bulk delete followed by a re-sync imports nothing at all and looks
    //     exactly like sync being broken. This mode touches neither.
    //
    //   • tombstone: true — "the user chose Settings ▸ Start over ▸ Delete all
    //     patterns". Here the deletion IS the intent, so it must behave like N
    //     calls to delete(): tombstone every id so a connected sync folder does
    //     not re-import the patterns on its next tick, hold the ids in the
    //     session-delete guard so an in-flight Creator/Tracker autosave can't
    //     write the open project straight back, and drop the auto-synced
    //     Manager library entries that pointed at them.
    //
    // options.includeAutoSave (default true) also drops the legacy "auto_save"
    // record, so a stale single-project autosave can't resurrect wiped work.
    // The thread stash is intentionally left alone — it is device inventory,
    // not synced library content.
    //
    // Returns the number of project records removed.
    async clearAllProjects(options) {
      clearProgressRecovery();
      const opts = options || {};
      const includeAutoSave = opts.includeAutoSave !== false;
      const tombstone = opts.tombstone === true;
      try {
        const db = await getDB();
        const allKeys = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const req = tx.objectStore(STORE_NAME).getAllKeys();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        const projectIds = allKeys.filter(
          k => typeof k === "string" && k.startsWith("proj_"));
        await new Promise((resolve, reject) => {
          const hasPending = db.objectStoreNames.contains("pendingImports");
          if (tombstone) writeTombstones(projectIds);
          const tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE].concat(hasPending ? ["pendingImports"] : []), "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const metaStore = tx.objectStore(META_STORE);
          const statsStore = tx.objectStore(STATS_STORE);
          for (const id of projectIds) {
            store.delete(id);
            metaStore.delete(id);
            statsStore.delete(id);
            if (hasPending) { tx.objectStore("pendingImports").delete("trace:" + id); tx.objectStore("pendingImports").delete(PROGRESS_PREFIX + id); tx.objectStore("pendingImports").delete(OVERLAY_PREFIX + id); deletePhotoRecords(tx.objectStore("pendingImports"), id); tx.objectStore("pendingImports").delete(sessionRange(id)); }
          }
          if (includeAutoSave) store.delete("auto_save");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        this._allFullCache = null;
        this.clearActiveProject();
        if (tombstone) {
          // Deliberate user deletion: make it stick. Tombstones stop a
          // connected sync folder re-importing the patterns, and the session
          // guard stops an autosave already in flight from re-writing one.
          try { for (const id of projectIds) this._deletedIds.add(id); } catch (_) {}
        } else {
          // Release the session-delete guard. It exists to stop an in-flight
          // autosave from resurrecting a just-deleted project, but after a full
          // wipe it would silently no-op save() for any id deleted earlier in
          // this page session — so those patterns would NOT come back on the
          // rebuild, with no error to explain why. Forgetting the deletions is
          // the correct semantic here: we are about to re-import from a peer.
          try { this._deletedIds.clear(); } catch (_) {}
        }
        try { if (typeof window !== 'undefined') window.__csMostUsedCache = null; } catch (_) {}
        // Drop dashboard state for the removed ids so stale entries don't
        // linger for projects that may never come back.
        try {
          const states = this.getProjectStates();
          let changed = false;
          for (const id of projectIds) {
            if (states[id] !== undefined) { delete states[id]; changed = true; }
          }
          if (changed) localStorage.setItem('cs_projectStates', JSON.stringify(states));
        } catch (_) {}
        // Mirror delete(): drop the auto-synced Manager library entries that
        // pointed at these projects, so the pattern library doesn't keep
        // listing patterns the user just deleted. Only on a deliberate
        // deletion — a resync wipe expects the same ids to come back.
        if (tombstone && projectIds.length && typeof StashBridge !== "undefined") {
          try {
            if (StashBridge.unlinkProjectsFromLibrary) {
              StashBridge.unlinkProjectsFromLibrary(projectIds).catch(() => {});
            } else if (StashBridge.unlinkProjectFromLibrary) {
              for (const id of projectIds) {
                StashBridge.unlinkProjectFromLibrary(id).catch(() => {});
              }
            }
          } catch (e) {}
        }
        // A deliberate deletion is sync content (its tombstones travel).
        // A resync wipe is not: the same projects are about to come back.
        if (tombstone && projectIds.length && typeof SyncEngine !== "undefined" && SyncEngine.triggerAutoExport) {
          try { SyncEngine.triggerAutoExport(); } catch (e) {}
        }
        try {
          if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("cs:projectsChanged", {
              detail: { reason: "clearAll", count: projectIds.length }
            }));
          }
        } catch (_) {}
        return projectIds.length;
      } catch (err) {
        console.error("ProjectStorage.clearAllProjects failed:", err);
        throw err;
      }
    },

    // Internal set of project IDs deleted during this page session.
    _deletedIds: new Set(),

    // True when get() returned this project with marks or sync registers taken
    // from its progress record that the full record does not have yet: the
    // Tracker must fold them into a full save. False for a project read as it
    // was stored (or with a progress record that matches it exactly).
    loadedWithProgress(project) { return !!project && loadedWithProgressSet.has(project); },

    // Generate a new unique project ID. Single canonical source — every callsite
    // (Creator, Tracker, importers) should use this rather than re-implementing
    // `"proj_" + Date.now()`. The random suffix prevents the (rare) collision
    // when two projects are created within the same millisecond, e.g. a fast
    // double-click on "Generate" or two simultaneous file imports.
    newId() {
      var rand = Math.random().toString(36).slice(2, 7);
      return "proj_" + Date.now() + "_" + rand;
    },

    // Mark a project as the currently active one (stored in localStorage as a pointer).
    setActiveProject(id) {
      try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {}
      // Notify listeners (header switcher, multi-tab sync) so the UI can
      // refresh without waiting for a full page reload. Wrapped in try/catch
      // so non-browser test environments don't throw on missing CustomEvent.
      try {
        if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
          window.dispatchEvent(new CustomEvent("cs:projectsChanged", {
            detail: { reason: "setActive", id: id }
          }));
        }
      } catch (_) {}
    },

    getActiveProjectId() {
      try { return localStorage.getItem(ACTIVE_KEY); } catch (e) { return null; }
    },

    // Load the currently active project from IndexedDB. Returns null if none set.
    async getActiveProject() {
      const id = this.getActiveProjectId();
      if (!id) return null;
      return this.get(id);
    },

    clearActiveProject() {
      try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
    },

    // Return all stats summaries for the global dashboard.
    async getAllStatsSummaries() {
      try {
        // Stats can be opened directly, without visiting Home's idle migration first.
        await this.refreshProgressRows();
        const db = await getDB();
        const data = await new Promise((resolve, reject) => {
          let tx = db.transaction([STATS_STORE, META_STORE], "readonly");
          let statsStore = tx.objectStore(STATS_STORE);
          let metaStore = tx.objectStore(META_STORE);
          let statsReq = statsStore.getAll();
          let metaReq = metaStore.getAll();
          let stats = null, meta = null, done = false;
          function finish() {
            if (done || stats === null || meta === null) return;
            done = true;
            resolve({ stats, meta });
          }
          statsReq.onsuccess = () => { stats = statsReq.result || []; finish(); };
          metaReq.onsuccess = () => { meta = metaReq.result || []; finish(); };
          statsReq.onerror = () => { if (!done) { done = true; reject(statsReq.error); } };
          metaReq.onerror = () => { if (!done) { done = true; reject(metaReq.error); } };
          tx.onerror = () => { if (!done) { done = true; reject(tx.error); } };
        });
        const validIds = new Set((data.meta || []).map(m => m && m.id).filter(Boolean));
        return (data.stats || []).filter(s => s && s.id && s.id.startsWith("proj_") && validIds.has(s.id));
      } catch (err) {
        console.error("ProjectStorage.getAllStatsSummaries failed:", err);
        return [];
      }
    },

    // Build stats summaries for all existing projects (migration / one-time build).
    async buildAllStatsSummaries() {
      try {
        const db = await getDB();
        const projects = await new Promise((resolve, reject) => {
          let tx = db.transaction([STORE_NAME, "pendingImports"], "readonly");
          let store = tx.objectStore(STORE_NAME);
          let request = store.getAll();
          const out = [];
          // Each record as stored: with its overlay and progress record folded in.
          request.onsuccess = () => (request.result || []).forEach(p => {
            if (!p || typeof p.id !== "string" || !p.id.startsWith("proj_")) { out.push(p); return; }
            const pr = tx.objectStore("pendingImports").get(PROGRESS_PREFIX + p.id), or = tx.objectStore("pendingImports").get(OVERLAY_PREFIX + p.id);
            let ready = 0;
            const both = () => { if (++ready === 2) out.push(storedView(p, overlayCurrent(p, or.result) ? or.result : null, pr.result)); };
            pr.onsuccess = both; or.onsuccess = both;
          });
          tx.oncomplete = () => resolve(out);
          tx.onerror = () => reject(tx.error);
        });
        const summaries = projects
          .filter(p => p && p.id && p.id.startsWith("proj_"))
          .map(buildStatsSummary);
        if (summaries.length > 0) {
          const writeTx = db.transaction(STATS_STORE, "readwrite");
          const statsStore = writeTx.objectStore(STATS_STORE);
          summaries.forEach(s => statsStore.put(s, s.id));
          await new Promise((resolve, reject) => {
            writeTx.oncomplete = () => resolve();
            writeTx.onerror = () => reject(writeTx.error);
          });
        }
        return summaries;
      } catch (err) {
        console.error("ProjectStorage.buildAllStatsSummaries failed:", err);
        return [];
      }
    },

    // Estimate storage used by IndexedDB (requires navigator.storage API).
    // Returns { used: bytes, quota: bytes, persistent: boolean } or null if unsupported.
    async getStorageEstimate() {
      if (navigator.storage && navigator.storage.estimate) {
        try {
          // Request persistence before reading the flag so the result reflects the
          // grant/deny outcome of this session rather than a stale prior check.
          await ensurePersistence();
          const est = await navigator.storage.estimate();
          const persistent = navigator.storage.persisted ? await navigator.storage.persisted() : false;
          return { used: est.usage || 0, quota: est.quota || 0, persistent };
        } catch (e) {}
      }
      return null;
    },

    // V3 migration: adds stitchLog, finishStatus, startedAt, lastTouchedAt to projects.
    // Should be called once after the stash-bridge v3 migration.
    async migrateProjectsToV3() {
      try {
        const migrated = localStorage.getItem('cs_projects_v3_migrated');
        if (migrated === '1') return;
        const db = await getDB();
        const projects = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const req = tx.objectStore(STORE_NAME).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        const toUpdate = projects.filter(p => p && p.id && p.id.startsWith("proj_") && !p.finishStatus);
        if (toUpdate.length > 0) {
          const tx = db.transaction([STORE_NAME, META_STORE, STATS_STORE], "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const metaStore = tx.objectStore(META_STORE);
          const statsStore = tx.objectStore(STATS_STORE);
          for (const p of toUpdate) {
            const hasDone = p.done && (Array.isArray(p.done) || ArrayBuffer.isView(p.done));
            const hasStitches = hasDone && Array.prototype.some.call(p.done, v => v === 1);
            p.startedAt = p.createdAt || LEGACY_EPOCH;
            p.lastTouchedAt = p.updatedAt || LEGACY_EPOCH;
            p.finishStatus = hasStitches ? 'active' : 'planned';
            p.stitchLog = [];
            store.put(p, p.id);
            metaStore.put(buildMeta(p), p.id);
            statsStore.put(buildStatsSummary(p), p.id);
          }
          await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          console.log('Projects migrated to v3 (' + toUpdate.length + ' projects)');
        }
        localStorage.setItem('cs_projects_v3_migrated', '1');
      } catch (e) {
        console.warn('ProjectStorage: v3 project migration failed', e);
      }
    },

    // Append a stitch count to a project's stitchLog for today.
    // Uses local device date (not UTC) so 11pm stitching counts for today.
    // If an entry for today exists, increments its count.
    async appendStitchLog(projectId, count) {
      if (!count || !projectId) return;
      try {
        const project = await this.get(projectId);
        if (!project) return;
        // Use local date, not UTC
        const now = new Date();
        const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        if (!project.stitchLog) project.stitchLog = [];
        const existing = project.stitchLog.find(e => e.date === today);
        if (existing) {
          existing.count += count;
        } else {
          project.stitchLog.push({ date: today, count: count });
        }
        project.lastTouchedAt = now.toISOString();
        // Auto-transition planned → active on first stitch
        if (project.finishStatus === 'planned' && count > 0) {
          project.finishStatus = 'active';
        }
        await this.save(project);
        if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
      } catch (e) {
        console.error('ProjectStorage.appendStitchLog failed:', e);
      }
    },

    // Mark a project as finished (completed).
    async markProjectFinished(projectId) {
      try {
        const project = await this.get(projectId);
        if (!project) return;
        project.finishStatus = 'completed';
        project.completedAt = new Date().toISOString();
        project.lastTouchedAt = project.completedAt;
        await this.save(project);
        if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
      } catch (e) {
        console.error('ProjectStorage.markProjectFinished failed:', e);
      }
    },

    // Mark a project as UFO (unfinished object / abandoned).
    async markProjectUFO(projectId) {
      try {
        const project = await this.get(projectId);
        if (!project) return;
        project.finishStatus = 'UFO';
        project.lastTouchedAt = new Date().toISOString();
        await this.save(project);
        if (typeof invalidateStatsCache === 'function') invalidateStatsCache();
      } catch (e) {
        console.error('ProjectStorage.markProjectUFO failed:', e);
      }
    },

    // Lifetime stitch count: the stitches marked across all projects, in units, summed from each project's own
    // progress row (the figure its Tracker, Home card and Library card show). It used to add up finished session
    // records, which left a project with marks but no finished session at 0 beside "16,934 left".
    async getLifetimeStitches() {
      try {
        return ProgressUnits.sumRows(await this.listProjects()).doneUnits;
      } catch (e) { return 0; }
    },

    // Return aggregated daily stitch totals for charts.
    // Falls back to statsSessions for projects not yet re-saved by the tracker.
    async getStitchLogByDay(days) {
      days = days || 365;
      try {
        const projects = await this.listProjects();
        const daily = {};
        for (const meta of projects) {
          const proj = await this.get(meta.id);
          if (!proj) continue;
          if (proj.stitchLog && proj.stitchLog.length > 0) {
            for (const entry of proj.stitchLog) {
              daily[entry.date] = (daily[entry.date] || 0) + entry.count;
            }
          } else if (proj.statsSessions && proj.statsSessions.length > 0) {
            for (const s of proj.statsSessions) {
              if (!s || !s.date) continue;
              daily[s.date] = (daily[s.date] || 0) + (ProgressUnits.sessionAdded(s) || 0);
            }
          }
        }
        // Filter to last N days
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const result = [];
        for (const [date, count] of Object.entries(daily)) {
          if (date >= cutoffStr) result.push({ date, count });
        }
        result.sort((a, b) => a.date.localeCompare(b.date));
        return result;
      } catch (e) { return []; }
    },

    // Return the oldest WIP (active project with longest time since lastTouchedAt).
    async getOldestWIP() {
      try {
        const projects = await this.listProjects();
        let oldest = null;
        for (const meta of projects) {
          const proj = await this.get(meta.id);
          if (!proj || proj.finishStatus !== 'active') continue;
          // Prefer lastTouchedAt; fall back to updatedAt, then createdAt so
          // long-abandoned projects with no touch/update timestamps still surface.
          const projAge = proj.lastTouchedAt || proj.updatedAt || proj.createdAt || LEGACY_EPOCH;
          if (!oldest || projAge < oldest.lastTouchedAt) {
            const pr = progressOf(proj);
            const totalSt = pr.total;
            const completedSt = pr.done;
            oldest = {
              id: proj.id, name: proj.name || 'Untitled',
              lastTouchedAt: projAge,
              totalStitches: totalSt, completedStitches: completedSt,
              pct: totalSt > 0 ? ProgressUnits.percent(completedSt,totalSt) : 0
            };
          }
        }
        return oldest;
      } catch (e) { return null; }
    },

    // Return most-used colours approximated from stitchLog + pattern palette ratios.
    // Blend cells (id "310+550") credit each component; halfStitches contribute
    // half-weight to their fwd/bck thread ids.
    // M4: Results are memoised per (project count, latest updatedAt, limit)
    // on window.__csMostUsedCache. The key includes max(updatedAt) so any
    // save naturally busts the cache on the next call.
    async getMostUsedColours(limit) {
      limit = limit || 10;
      try {
        const projects = await this.listProjects();
        // Build cache key from project count and latest updatedAt — any
        // save bumps updatedAt so this detects changes cheaply.
        let latest = 0;
        for (const m of projects) {
          const t = Date.parse(m.updatedAt || m.createdAt || 0) || 0;
          if (t > latest) latest = t;
        }
        const cacheKey = projects.length + ':' + latest + ':' + limit;
        if (typeof window !== 'undefined') {
          const cache = window.__csMostUsedCache;
          if (cache && cache.key === cacheKey && Array.isArray(cache.result)) {
            return cache.result;
          }
        }
        const colourTotals = {}; // { threadKey: { count, name, rgb, id } }
        for (const meta of projects) {
          const proj = await this.get(meta.id);
          if (!proj || !proj.pattern) continue;
          // Calculate per-thread ratios from the pattern. Blends are split: a
          // "310+550" cell contributes 0.5 to "310" and 0.5 to "550".
          // Keyed "brand:id" (P4-5): Anchor 310 and DMC 310 are different
          // threads. A saved cell names its brand only when it isn't the
          // project's.
          const projBrand = typeof projectThreadBrand === 'function' ? projectThreadBrand(proj) : 'dmc';
          const keyOf = (m, tid) => String((m && m.brand) || projBrand).toLowerCase() + ':' + tid;
          const threadCounts = {};
          let totalStitchable = 0;
          for (const cell of proj.pattern) {
            if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
            const ids = (typeof cell.id === 'string' && cell.id.indexOf('+') !== -1)
              ? splitBlendId(cell.id)
              : [cell.id];
            const share = ids.length > 1 ? 1 / ids.length : 1;
            for (const tid of ids) {
              const k = keyOf(cell, tid);
              threadCounts[k] = (threadCounts[k] || 0) + share;
            }
            totalStitchable++;
          }
          // Add halfStitches contribution. The shape is [[idx, {fwd, bck}], ...]
          // serialised from a Map. Each half adds 0.5 weight to its thread.
          if (Array.isArray(proj.halfStitches)) {
            for (const entry of proj.halfStitches) {
              if (!entry || !Array.isArray(entry) || entry.length < 2) continue;
              const hs = entry[1];
              if (hs && hs.fwd && hs.fwd.id) {
                const k = keyOf(hs.fwd, hs.fwd.id);
                threadCounts[k] = (threadCounts[k] || 0) + 0.5;
                totalStitchable += 0.5;
              }
              if (hs && hs.bck && hs.bck.id) {
                const k = keyOf(hs.bck, hs.bck.id);
                threadCounts[k] = (threadCounts[k] || 0) + 0.5;
                totalStitchable += 0.5;
              }
            }
          }
          if (totalStitchable === 0) continue;
          // Distribute stitchLog counts across threads proportionally.
          // Fall back to statsSessions for projects not yet re-saved by the tracker.
          const logTotal = (proj.stitchLog && proj.stitchLog.length > 0)
            ? proj.stitchLog.reduce((s, e) => s + e.count, 0)
            : (proj.statsSessions || []).reduce((s, e) => s + (ProgressUnits.sessionNet(e) || 0), 0);
          if (logTotal <= 0) continue;
          // Build a thread-id → {name, rgb} lookup from the palette field if present,
          // falling back to pattern cells (Creator projects embed rgb in each cell,
          // so proj.palette is absent). This is the root cause of grey swatches.
          const palMap = Object.create(null);
          if (proj.palette && proj.palette.length > 0) {
            for (const pe of proj.palette) { if (pe && pe.id) palMap[keyOf(pe, pe.id)] = pe; }
          } else {
            // Derive from pattern cells (first occurrence per solid thread id wins).
            // Blend cells are skipped — their component ids are resolved via the DMC
            // catalogue fallback below, which gives each thread's own colour rather
            // than the averaged blend rgb.
            for (const cell of proj.pattern) {
              if (!cell || !cell.id || cell.id === '__skip__' || cell.id === '__empty__') continue;
              if (cell.id.indexOf('+') !== -1) continue; // components resolved by catalogue
              const pk = keyOf(cell, cell.id);
              if (!palMap[pk]) {
                palMap[pk] = { id: cell.id, name: cell.name || cell.id, rgb: cell.rgb || [128,128,128] };
              }
            }
          }
          for (const [key, tcount] of Object.entries(threadCounts)) {
            const ratio = tcount / totalStitchable;
            const attributed = logTotal * ratio;
            if (!colourTotals[key]) {
              const colon = key.indexOf(':');
              const brand = key.slice(0, colon), tid = key.slice(colon + 1);
              // Prefer the per-project palMap, then that brand's catalogue.
              // PERF (action plan §2E.1): use cached id-map; Array.find left as last fallback.
              let info = palMap[key];
              if (!info && brand !== 'dmc') info = typeof findThreadInCatalog === 'function' ? findThreadInCatalog(brand, tid) : null;
              if (!info && brand === 'dmc' && typeof getDmcById === 'function') info = getDmcById(tid);
              if (!info && brand === 'dmc' && typeof DMC !== 'undefined') {
                const dmcEntry = DMC.find ? DMC.find(d => d.id === tid) : null;
                if (dmcEntry) info = dmcEntry;
              }
              colourTotals[key] = {
                count: 0,
                name: info ? (info.name || tid) : tid,
                rgb:  info ? (info.rgb  || [128,128,128]) : [128,128,128],
                id:   tid
              };
              if (brand !== 'dmc') colourTotals[key].brand = brand;
            }
            colourTotals[key].count += attributed;
          }
        }
        const sorted = Object.values(colourTotals).sort((a, b) => b.count - a.count);
        const totalAll = sorted.reduce((s, c) => s + c.count, 0);
        const result = sorted.slice(0, limit).map(c => ({
          id: c.id, name: c.name, rgb: c.rgb, brand: c.brand,
          count: Math.round(c.count),
          // pct is per-cent (0..100), one decimal place.
          pct: totalAll > 0 ? Math.round(c.count / totalAll * 1000) / 10 : 0
        }));
        if (typeof window !== 'undefined') {
          window.__csMostUsedCache = { key: cacheKey, result: result };
        }
        return result;
      } catch (e) { return []; }
    },

    // Return projects ready to start (wraps StashBridge.whatCanIStart).
    async getProjectsReadyToStart() {
      if (typeof StashBridge === 'undefined' || !StashBridge.whatCanIStart) return [];
      try {
        const results = await StashBridge.whatCanIStart();
        return results;
      } catch (e) { return []; }
    },

    // Return the top-N oldest WIPs (active projects sorted by lastTouchedAt asc).
    // Used by the "Oldest WIPs" leaderboard on the stats page.
    async getOldestWIPs(limit) {
      limit = limit || 5;
      try {
        const metas = await this.listProjects();
        const fulls = await Promise.all(metas.map(m => this.get(m.id).catch(() => null)));
        const wips = [];
        for (const proj of fulls) {
          if (!proj || proj.finishStatus !== 'active') continue;
          const pr = progressOf(proj);
          const totalSt = pr.total;
          const completedSt = pr.done;
          wips.push({
            id: proj.id, name: proj.name || 'Untitled',
            lastTouchedAt: proj.lastTouchedAt || proj.updatedAt || LEGACY_EPOCH,
            totalStitches: totalSt, completedStitches: completedSt,
            pct: totalSt > 0 ? ProgressUnits.percent(completedSt,totalSt) : 0
          });
        }
        wips.sort((a, b) => (a.lastTouchedAt || '').localeCompare(b.lastTouchedAt || ''));
        return wips.slice(0, limit);
      } catch (e) { return []; }
    },

    // Dashboard project state management.
    // States: 'active' | 'queued' | 'paused' | 'complete' | 'design'
    // Stored in localStorage so it's fast to read without loading full project data.
    getProjectStates() {
      try { return JSON.parse(localStorage.getItem('cs_projectStates') || '{}'); }
      catch(e) { console.warn('cs_projectStates corrupted, resetting:', e); try { localStorage.removeItem('cs_projectStates'); } catch(_) {} return {}; }
    },

    setProjectState(id, state) {
      try {
        var s = this.getProjectStates();
        if (state == null) { delete s[id]; } else { s[id] = state; }
        localStorage.setItem('cs_projectStates', JSON.stringify(s));
      } catch(e) {}
    },

    // ── Bulk helpers (B5 — multi-select dashboard) ──
    // Thin wrappers over the per-id methods. Behaviour is identical to a
    // sequential loop; provided so dashboard bulk actions read clearly.
    async deleteMany(ids, options) {
      if (!Array.isArray(ids) || ids.length === 0) return [];
      var results = [];
      for (var i = 0; i < ids.length; i++) {
        try { await this.delete(ids[i], options); results.push({ id: ids[i], ok: true }); }
        catch (e) { results.push({ id: ids[i], ok: false, error: e }); }
      }
      return results;
    },

    setStateMany(ids, state) {
      if (!Array.isArray(ids) || ids.length === 0) return;
      for (var i = 0; i < ids.length; i++) this.setProjectState(ids[i], state);
    },
  };
})();

// Top-level `const` in a classic <script> creates a global binding but does
// NOT attach to `window`. Several callers (notably import-engine/wireApp.js)
// feature-test via `window.ProjectStorage`, so without this assignment they
// silently fall back to the legacy auto_save path and the imported pattern
// never appears in the project library. Mirror onto window explicitly.
try { if (typeof window !== 'undefined') window.ProjectStorage = ProjectStorage; } catch (_) {}
