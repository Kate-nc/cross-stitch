// project-library.js — Shared multi-project library for Home + Manager.
//
// Exposes:
//   window.useProjectLibrary({ includeManualOnly })  — React hook returning
//       { projects, manualPatterns, stash, loading, refresh }. Loads from
//       ProjectStorage + the Stash Manager's pattern library, and listens for
//       cs:projectsChanged, cs:backupRestored, and tab-visibility changes so
//       both pages stay in sync without a reload.
//
//   window.ProjectLibrary({ mode, onOpenProject, onAddNew, onOpenGlobalStats,
//                           onDeleteProject })
//       — wraps MultiProjectDashboard from home-screen.js with the unified
//       data source. mode='home' (default) shows only Creator/Tracker projects
//       (matches existing Home behaviour). mode='manager' additionally surfaces
//       manual-only patterns from the Stash Manager as pseudo-projects with a
//       "Stash Manager only" badge so the Pattern Library tab and the Home
//       dashboard stay visually consistent.
//
// The component is intentionally a thin adaptor; the rich card UI, suggestion
// algorithm, state categorisation and styling all live in home-screen.js.

(function () {
  if (typeof window === "undefined" || typeof React === "undefined") return;

  // ─── Data hook ───────────────────────────────────────────────────────────
  function readManagerPatterns() {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open("stitch_manager_db", 1);
        req.onsuccess = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains("manager_state")) { resolve([]); return; }
          var tx = db.transaction("manager_state", "readonly");
          var store = tx.objectStore("manager_state");
          var r = store.get("patterns");
          r.onsuccess = function () { resolve(r.result || []); };
          r.onerror = function () { resolve([]); };
        };
        req.onerror = function () { resolve([]); };
      } catch (e) { resolve([]); }
    });
  }

  function useProjectLibrary(opts) {
    opts = opts || {};
    var _state = React.useState({ projects: [], manualPatterns: [], stash: null, loading: true });
    var state = _state[0], setState = _state[1];

    var load = React.useCallback(function () {
      var projP = (typeof ProjectStorage !== "undefined")
        ? ProjectStorage.listProjects().catch(function () { return []; })
        : Promise.resolve([]);
      var stashP = (typeof StashBridge !== "undefined")
        ? StashBridge.getGlobalStash().catch(function () { return null; })
        : Promise.resolve(null);
      var patP = readManagerPatterns();

      return Promise.all([projP, stashP, patP]).then(function (r) {
        var projects = r[0] || [];
        var allPatterns = r[2] || [];
        var manualOnly = allPatterns.filter(function (p) { return !p.linkedProjectId; });
        setState({
          projects: projects,
          manualPatterns: manualOnly,
          stash: r[1],
          loading: false
        });
      });
    }, []);

    React.useEffect(function () {
      load();
      function onChange() { load(); }
      function onVisibility() { if (document.visibilityState === "visible") load(); }
      window.addEventListener("cs:projectsChanged", onChange);
      window.addEventListener("cs:backupRestored", onChange);
      window.addEventListener("cs:patternsChanged", onChange);
      document.addEventListener("visibilitychange", onVisibility);
      return function () {
        window.removeEventListener("cs:projectsChanged", onChange);
        window.removeEventListener("cs:backupRestored", onChange);
        window.removeEventListener("cs:patternsChanged", onChange);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }, [load]);

    return {
      projects: state.projects,
      manualPatterns: state.manualPatterns,
      stash: state.stash,
      loading: state.loading,
      refresh: load
    };
  }

  // ─── Pseudo-project synthesis (manager mode) ────────────────────────────
  function patternToPseudoProject(p) {
    return {
      id: "mgr:" + p.id,
      _managerPatternId: p.id,
      name: p.title || "Untitled pattern",
      managerOnly: true,
      // Default values so MultiProjectDashboard helpers don't NaN/crash:
      completedStitches: 0,
      totalStitches: 0,
      lastSessionDate: null,
      updatedAt: p.updatedAt || null,
      stitchesThisWeek: 0,
      stitchesThisMonth: 0,
      totalMinutes: 0,
      dimensions: null,
      fabricCt: p.fabricCt || null,
      thumbnail: null
    };
  }

  // ─── Component wrapper ──────────────────────────────────────────────────
  function ProjectLibrary(props) {
    var mode = props.mode || "home";
    // If the parent already owns the project list (e.g. Home, which uses
    // `projects` for many other things), pass it in directly to avoid a
    // duplicate IndexedDB load. Otherwise the component self-loads.
    var hookData = useProjectLibrary();
    var hasExternal = Array.isArray(props.projects);
    var data = hasExternal
      ? { projects: props.projects, manualPatterns: hookData.manualPatterns, stash: props.stash != null ? props.stash : hookData.stash, loading: false }
      : hookData;
    var Dashboard = window.MultiProjectDashboard;
    var h = React.createElement;

    if (data.loading) {
      return h("div", { className: "project-library-loading", style: { padding: 20, color: "#8A8270", fontSize: 13 } },
        "Loading projects\u2026");
    }
    if (!Dashboard) {
      // home-screen.js not loaded — render a minimal fallback so Manager users
      // still see something useful.
      return h("div", { className: "project-library-fallback", style: { padding: 20, color: "#8A8270", fontSize: 13 } },
        "Project Library is unavailable on this page.");
    }

    var projects = data.projects.slice();
    if (mode === "manager") {
      // Append manual-only patterns as pseudo-projects so they show up in the
      // unified card grid alongside Creator/Tracker projects.
      data.manualPatterns.forEach(function (p) { projects.push(patternToPseudoProject(p)); });
    }

    return h(Dashboard, {
      projects: projects,
      stash: data.stash,
      cardExtras: props.cardExtras,
      onOpenProject: function (proj, target) {
        if (proj && proj.managerOnly) {
          // Manager-only entries can't be opened in Creator/Tracker — surface
          // a hint to the caller instead.
          if (typeof props.onOpenManagerOnly === "function") {
            props.onOpenManagerOnly(proj);
          } else if (typeof window.toast === "function") {
            window.toast("This entry was added directly in the Stash Manager and has no linked project.");
          }
          return;
        }
        if (typeof props.onOpenProject === "function") props.onOpenProject(proj, target);
      },
      onOpenGlobalStats: props.onOpenGlobalStats || function () {},
      onAddNew: props.onAddNew || function () {},
      mode: mode
    });
  }

  window.useProjectLibrary = useProjectLibrary;
  window.ProjectLibrary = ProjectLibrary;
})();
