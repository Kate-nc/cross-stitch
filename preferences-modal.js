/* preferences-modal.js — Global Preferences overlay.
 *
 * Available on Creator, Tracker and Manager pages. Reads/writes via window.UserPrefs.
 * Three panels: Your profile (designer branding), PDF export defaults, Preview defaults.
 *
 * Exposes window.PreferencesModal as a React function component:
 *   <PreferencesModal onClose={...} />
 */
(function () {
  "use strict";
  var React = window.React;
  if (!React) return;
  var h = React.createElement;
  var useState = React.useState;

  function UP_get(key, fallback) {
    if (window.UserPrefs && typeof window.UserPrefs.get === "function") {
      var v = window.UserPrefs.get(key);
      return (v === undefined || v === null) ? fallback : v;
    }
    return fallback;
  }
  function UP_set(key, value) {
    if (window.UserPrefs && typeof window.UserPrefs.set === "function") {
      window.UserPrefs.set(key, value);
    }
  }

  // Downscale a logo so localStorage doesn't blow up.
  function downscaleImage(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("Failed to read file")); };
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var maxDim = 600;
          var w = img.naturalWidth, hgt = img.naturalHeight;
          if (w > maxDim || hgt > maxDim) {
            var ratio = w / hgt;
            if (ratio >= 1) { w = maxDim; hgt = Math.round(maxDim / ratio); }
            else { hgt = maxDim; w = Math.round(maxDim * ratio); }
          }
          var c = document.createElement("canvas");
          c.width = w; c.height = hgt;
          var ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, w, hgt);
          var isPng = (file.type === "image/png");
          resolve(c.toDataURL(isPng ? "image/png" : "image/jpeg", 0.9));
        };
        img.onerror = function () { reject(new Error("Failed to decode image")); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ─── Reusable form atoms ──────────────────────────────────────────────
  var labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 };
  var inputStyle = { width: "100%", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
  var sectionTitle = { margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#0f172a", borderBottom: "1px solid #e2e8f0", paddingBottom: 6 };
  var checkboxRow = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155", cursor: "pointer", padding: "4px 0" };

  function Field(props) {
    return h("div", { style: { marginBottom: 10 } },
      h("label", { style: labelStyle }, props.label),
      props.children,
      props.hint ? h("div", { style: { fontSize: 11, color: "#94a3b8", marginTop: 3 } }, props.hint) : null
    );
  }

  // ─── Profile panel ────────────────────────────────────────────────────
  function ProfilePanel() {
    var _n = useState(UP_get("designerName", ""));            var name = _n[0], setName = _n[1];
    var _l = useState(UP_get("designerLogo", null));          var logo = _l[0], setLogo = _l[1];
    var _p = useState(UP_get("designerLogoPosition", "top-right")); var pos = _p[0], setPos = _p[1];
    var _c = useState(UP_get("designerCopyright", ""));       var copyright = _c[0], setCopyright = _c[1];
    var _e = useState(UP_get("designerContact", ""));         var contact = _e[0], setContact = _e[1];
    var _err = useState(null); var err = _err[0], setErr = _err[1];

    function commit(key, val, setter) { setter(val); UP_set(key, val); }
    function onLogoFile(ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      setErr(null);
      downscaleImage(f).then(function (dataUrl) {
        commit("designerLogo", dataUrl, setLogo);
      }).catch(function (e) { setErr(e.message || "Could not load logo"); });
      ev.target.value = "";
    }
    function clearLogo() { commit("designerLogo", null, setLogo); }

    return h("div", null,
      h("h3", { style: sectionTitle }, "Your profile"),
      h("p", { style: { margin: "0 0 12px", fontSize: 12, color: "#64748b" } },
        "These details are added to PDF exports as designer branding. They are stored only in this browser."),
      h(Field, { label: "Designer name" },
        h("input", { type: "text", style: inputStyle, value: name, placeholder: "e.g. Katie's Stitches",
          onChange: function (e) { commit("designerName", e.target.value, setName); } })),
      h(Field, { label: "Copyright line", hint: "Appears in the PDF footer." },
        h("input", { type: "text", style: inputStyle, value: copyright, placeholder: "© 2025 Your Name",
          onChange: function (e) { commit("designerCopyright", e.target.value, setCopyright); } })),
      h(Field, { label: "Contact / website", hint: "Email or URL shown in the PDF cover." },
        h("input", { type: "text", style: inputStyle, value: contact, placeholder: "hello@example.com",
          onChange: function (e) { commit("designerContact", e.target.value, setContact); } })),
      h(Field, { label: "Logo" },
        h("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
          logo ? h("img", { src: logo, alt: "Logo preview", style: { maxHeight: 60, maxWidth: 180, border: "1px solid #e2e8f0", borderRadius: 4, background: "#fff" } })
               : h("div", { style: { fontSize: 12, color: "#94a3b8", padding: "12px 0" } }, "No logo uploaded"),
          h("label", { style: { padding: "6px 12px", borderRadius: 6, background: "#f1f5f9", border: "1px solid #cbd5e1", fontSize: 12, fontWeight: 600, color: "#334155", cursor: "pointer" } },
            logo ? "Replace" : "Upload",
            h("input", { type: "file", accept: "image/png,image/jpeg", style: { display: "none" }, onChange: onLogoFile })),
          logo ? h("button", { onClick: clearLogo, style: { padding: "6px 12px", borderRadius: 6, background: "#fff", border: "1px solid #cbd5e1", fontSize: 12, fontWeight: 600, color: "#dc2626", cursor: "pointer" } }, "Remove") : null
        ),
        err ? h("div", { style: { fontSize: 11, color: "#dc2626", marginTop: 6 } }, err) : null
      ),
      h(Field, { label: "Logo position on PDF cover" },
        h("select", { style: inputStyle, value: pos, onChange: function (e) { commit("designerLogoPosition", e.target.value, setPos); } },
          h("option", { value: "top-left" }, "Top-left"),
          h("option", { value: "top-right" }, "Top-right")
        ))
    );
  }

  // ─── PDF export defaults panel ────────────────────────────────────────
  function PdfDefaultsPanel() {
    var _preset = useState(UP_get("exportPreset", "patternKeeper"));         var preset = _preset[0], setPreset = _preset[1];
    var _page   = useState(UP_get("exportPageSize", "auto"));                var pageSize = _page[0], setPageSize = _page[1];
    var _marg   = useState(UP_get("exportMarginsMm", 12));                   var marg = _marg[0], setMarg = _marg[1];
    var _spp    = useState(UP_get("exportStitchesPerPage", "medium"));       var spp = _spp[0], setSpp = _spp[1];
    var _bw     = useState(!!UP_get("exportChartModeBw", true));             var bw = _bw[0], setBw = _bw[1];
    var _col    = useState(!!UP_get("exportChartModeColour", true));         var col = _col[0], setCol = _col[1];
    var _ovl    = useState(!!UP_get("exportOverlap", true));                 var ovl = _ovl[0], setOvl = _ovl[1];
    var _cov    = useState(!!UP_get("exportIncludeCover", true));            var cov = _cov[0], setCov = _cov[1];
    var _info   = useState(!!UP_get("exportIncludeInfo", true));             var info = _info[0], setInfo = _info[1];
    var _idx    = useState(!!UP_get("exportIncludeIndex", true));            var idx = _idx[0], setIdx = _idx[1];
    var _mini   = useState(!!UP_get("exportMiniLegend", true));              var mini = _mini[0], setMini = _mini[1];

    function bind(key, setter) {
      return function (val) { setter(val); UP_set(key, val); };
    }
    var setPresetP = bind("exportPreset", setPreset);
    var setPageP   = bind("exportPageSize", setPageSize);
    var setMargP   = bind("exportMarginsMm", setMarg);
    var setSppP    = bind("exportStitchesPerPage", setSpp);
    var setBwP     = bind("exportChartModeBw", setBw);
    var setColP    = bind("exportChartModeColour", setCol);
    var setOvlP    = bind("exportOverlap", setOvl);
    var setCovP    = bind("exportIncludeCover", setCov);
    var setInfoP   = bind("exportIncludeInfo", setInfo);
    var setIdxP    = bind("exportIncludeIndex", setIdx);
    var setMiniP   = bind("exportMiniLegend", setMini);

    return h("div", null,
      h("h3", { style: sectionTitle }, "PDF export defaults"),
      h("p", { style: { margin: "0 0 12px", fontSize: 12, color: "#64748b" } },
        "Preferred settings used when exporting a pattern to PDF. You can still override per-export from the Export panel."),
      h(Field, { label: "Preset" },
        h("select", { style: inputStyle, value: preset, onChange: function (e) { setPresetP(e.target.value); } },
          h("option", { value: "patternKeeper" }, "Pattern Keeper compatible"),
          h("option", { value: "homePrinting" }, "Home printing")
        )),
      h(Field, { label: "Page size" },
        h("select", { style: inputStyle, value: pageSize, onChange: function (e) { setPageP(e.target.value); } },
          h("option", { value: "auto" }, "Auto"),
          h("option", { value: "a4" }, "A4"),
          h("option", { value: "letter" }, "US Letter")
        )),
      h(Field, { label: "Page margins (mm)" },
        h("input", { type: "number", min: 0, max: 50, step: 1, style: inputStyle, value: marg,
          onChange: function (e) { setMargP(parseInt(e.target.value, 10) || 0); } })),
      h(Field, { label: "Stitches per page" },
        h("select", { style: inputStyle, value: spp, onChange: function (e) { setSppP(e.target.value); } },
          h("option", { value: "small" }, "Small (more pages)"),
          h("option", { value: "medium" }, "Medium"),
          h("option", { value: "large" }, "Large (fewer pages)"),
          h("option", { value: "custom" }, "Custom")
        )),
      h("div", { style: { marginTop: 14 } },
        h("div", { style: { fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 } }, "Include in PDF"),
        h("label", { style: checkboxRow }, h("input", { type: "checkbox", checked: bw,   onChange: function (e) { setBwP(e.target.checked); } }), "B&W chart"),
        h("label", { style: checkboxRow }, h("input", { type: "checkbox", checked: col,  onChange: function (e) { setColP(e.target.checked); } }), "Colour chart"),
        h("label", { style: checkboxRow }, h("input", { type: "checkbox", checked: ovl,  onChange: function (e) { setOvlP(e.target.checked); } }), "Overlap pages (helps with seams)"),
        h("label", { style: checkboxRow }, h("input", { type: "checkbox", checked: cov,  onChange: function (e) { setCovP(e.target.checked); } }), "Cover page"),
        h("label", { style: checkboxRow }, h("input", { type: "checkbox", checked: info, onChange: function (e) { setInfoP(e.target.checked); } }), "Project info page"),
        h("label", { style: checkboxRow }, h("input", { type: "checkbox", checked: idx,  onChange: function (e) { setIdxP(e.target.checked); } }), "Page index"),
        h("label", { style: checkboxRow }, h("input", { type: "checkbox", checked: mini, onChange: function (e) { setMiniP(e.target.checked); } }), "Mini legend on each page")
      )
    );
  }

  // ─── Preview defaults panel ───────────────────────────────────────────
  function PreviewDefaultsPanel() {
    var _fab = useState(UP_get("fabricColour", "#F5F0E6"));               var fab = _fab[0], setFab = _fab[1];
    var _lvl = useState(UP_get("preferredPreviewLevel", "level2"));       var lvl = _lvl[0], setLvl = _lvl[1];
    var _grid= useState(!!UP_get("gridOverlayEnabled", false));           var grid= _grid[0], setGrid = _grid[1];
    var _spl = useState(!!UP_get("splitPaneEnabled", false));             var spl = _spl[0], setSpl = _spl[1];

    function bind(key, setter) { return function (v) { setter(v); UP_set(key, v); }; }
    var setFabP = bind("fabricColour", setFab);
    var setLvlP = bind("preferredPreviewLevel", setLvl);
    var setGridP = bind("gridOverlayEnabled", setGrid);
    var setSplP  = bind("splitPaneEnabled", setSpl);

    return h("div", null,
      h("h3", { style: sectionTitle }, "Preview defaults"),
      h("p", { style: { margin: "0 0 12px", fontSize: 12, color: "#64748b" } },
        "Defaults applied when opening a pattern. Per-pattern overrides still take precedence."),
      h(Field, { label: "Default preview level" },
        h("select", { style: inputStyle, value: lvl, onChange: function (e) { setLvlP(e.target.value); } },
          h("option", { value: "level1" }, "Level 1 — Chart only"),
          h("option", { value: "level2" }, "Level 2 — Standard preview"),
          h("option", { value: "level3" }, "Level 3 — Realistic"),
          h("option", { value: "level4" }, "Level 4 — Hoop / framed")
        )),
      h(Field, { label: "Default fabric colour" },
        h("div", { style: { display: "flex", gap: 8, alignItems: "center" } },
          h("input", { type: "color", value: fab, onChange: function (e) { setFabP(e.target.value); }, style: { width: 44, height: 32, padding: 0, border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer" } }),
          h("input", { type: "text", value: fab, onChange: function (e) { setFabP(e.target.value); }, style: Object.assign({}, inputStyle, { flex: 1 }) })
        )),
      h("div", { style: { marginTop: 14 } },
        h("label", { style: checkboxRow }, h("input", { type: "checkbox", checked: grid, onChange: function (e) { setGridP(e.target.checked); } }), "Show grid overlay by default"),
        h("label", { style: checkboxRow }, h("input", { type: "checkbox", checked: spl,  onChange: function (e) { setSplP(e.target.checked); } }), "Open patterns in split-pane view")
      )
    );
  }

  // ─── Modal shell ──────────────────────────────────────────────────────
  function TutorialsPanel() {
    var _msg = useState(null);
    var msg = _msg[0], setMsg = _msg[1];
    // Count per-pattern view-state preferences (cs_pview_*) — these are
    // dismissible UI state that some users may want to clear in bulk.
    function countPviewKeys() {
      var n = 0;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf("cs_pview_") === 0) n++;
        }
      } catch (_) {}
      return n;
    }
    var _pv = useState(countPviewKeys); var pviewCount = _pv[0], setPviewCount = _pv[1];
    // Resolved name preview for the per-pattern view-state keys. Async-loaded
    // from ProjectStorage so users can see what they're about to clear instead
    // of staring at an opaque count.
    var _pvNames = useState([]); var pviewNames = _pvNames[0], setPviewNames = _pvNames[1];
    var _showPv = useState(false); var showPviewList = _showPv[0], setShowPviewList = _showPv[1];
    React.useEffect(function () {
      if (typeof window === "undefined") return;
      if (!window.UserPrefs || typeof window.UserPrefs.listPatternStateIds !== "function") return;
      var ids = window.UserPrefs.listPatternStateIds();
      if (!ids.length) { setPviewNames([]); return; }
      // Fast path: if ProjectStorage isn't available, surface raw IDs.
      if (typeof ProjectStorage === "undefined" || typeof ProjectStorage.listProjects !== "function") {
        setPviewNames(ids.map(function (e) { return { id: e.id, name: e.id }; }));
        return;
      }
      var cancelled = false;
      ProjectStorage.listProjects().then(function (meta) {
        if (cancelled) return;
        var byId = {};
        (meta || []).forEach(function (m) { if (m && m.id) byId[m.id] = m.name || "Untitled"; });
        setPviewNames(ids.map(function (e) {
          return { id: e.id, name: byId[e.id] || "(deleted) " + e.id };
        }));
      }).catch(function () {
        if (!cancelled) setPviewNames(ids.map(function (e) { return { id: e.id, name: e.id }; }));
      });
      return function () { cancelled = true; };
    }, [pviewCount]);
    var _hint = useState(function () {
      try { return !!localStorage.getItem("cs_help_hint_dismissed"); } catch (_) { return false; }
    });
    var hintDismissed = _hint[0], setHintDismissed = _hint[1];
    function clearAll() {
      try { if (window.WelcomeWizard && window.WelcomeWizard.resetAll) window.WelcomeWizard.resetAll(); } catch (_) {}
      try { if (window.HelpHintBanner && window.HelpHintBanner.reset) window.HelpHintBanner.reset(); } catch (_) {}
      setHintDismissed(false);
      setMsg("All tutorials reset. Refresh any open page to see the wizards again.");
    }
    function clearOne(page) {
      try { if (window.WelcomeWizard && window.WelcomeWizard.reset) window.WelcomeWizard.reset(page); } catch (_) {}
      if (page === "tracker") { try { localStorage.removeItem("cs_styleOnboardingDone"); } catch (_) {} }
      setMsg("Reset the " + page + " tutorial. Reload " + (page === "creator" ? "the home page" : page === "manager" ? "the Stash Manager" : "the Stitch Tracker") + " to see it again.");
    }
    function clearPviews() {
      try {
        var toDel = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf("cs_pview_") === 0) toDel.push(k);
        }
        toDel.forEach(function (k) { localStorage.removeItem(k); });
      } catch (_) {}
      setPviewCount(0);
      setPviewNames([]);
      setShowPviewList(false);
      setMsg("Cleared per-pattern view preferences. Defaults will apply next time you open a pattern.");
    }
    function clearHint() {
      try { if (window.HelpHintBanner && window.HelpHintBanner.reset) window.HelpHintBanner.reset(); } catch (_) {}
      setHintDismissed(false);
      setMsg("Help hint reset. It will reappear on your next visit.");
    }
    var rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" };
    var btn = { padding: "4px 12px", fontSize: 12, borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", color: "#475569", fontFamily: "inherit" };
    var btnDis = Object.assign({}, btn, { color: "#94a3b8", cursor: "not-allowed" });
    return h("div", null,
      h("h3", { style: sectionTitle }, "Restore tutorials"),
      h("p", { style: { margin: "0 0 12px", fontSize: 12, color: "#64748b" } },
        "Replay any first-visit walkthrough or the Stitching Style picker. Reset flags only \u2014 your project data is unaffected."),
      h("div", { style: rowStyle },
        h("span", null, "Pattern Creator welcome"),
        h("button", { style: btn, onClick: function () { clearOne("creator"); } }, "Reset")
      ),
      h("div", { style: rowStyle },
        h("span", null, "Stash Manager welcome"),
        h("button", { style: btn, onClick: function () { clearOne("manager"); } }, "Reset")
      ),
      h("div", { style: rowStyle },
        h("span", null, "Stitch Tracker welcome + style picker"),
        h("button", { style: btn, onClick: function () { clearOne("tracker"); } }, "Reset")
      ),
      h("div", { style: rowStyle },
        h("span", null, "Help-hint banner ", h("em", { style: { color: "#94a3b8", fontStyle: "normal", fontSize: 11 } }, hintDismissed ? "(dismissed)" : "(visible)")),
        h("button", { style: hintDismissed ? btn : btnDis, disabled: !hintDismissed, onClick: clearHint }, "Reset")
      ),
      h("div", { style: rowStyle },
        h("span", null, "Per-pattern view preferences ", h("em", { style: { color: "#94a3b8", fontStyle: "normal", fontSize: 11 } }, "(" + pviewCount + " saved)")),
        h("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
          pviewCount > 0 && h("button", {
            style: Object.assign({}, btn, { padding: "4px 10px" }),
            onClick: function () { setShowPviewList(function (v) { return !v; }); }
          }, showPviewList ? "Hide" : "Preview"),
          h("button", { style: pviewCount > 0 ? btn : btnDis, disabled: pviewCount === 0, onClick: clearPviews }, "Clear")
        )
      ),
      // Inline preview list — collapsed by default so the panel stays compact.
      showPviewList && pviewNames.length > 0 && h("ul", {
        style: { margin: "4px 0 8px", padding: "8px 12px 8px 28px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 11, color: "#475569", maxHeight: 160, overflowY: "auto" }
      },
        pviewNames.map(function (e) {
          return h("li", { key: e.id, style: { padding: "1px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, title: e.id }, e.name);
        })
      ),
      h("div", { style: { marginTop: 14 } },
        h("button", {
          onClick: clearAll,
          style: { padding: "8px 16px", fontSize: 13, borderRadius: 6, border: "none", background: "#0d9488", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }
        }, "Reset all tutorials")
      ),
      msg && h("div", { style: { marginTop: 12, padding: "8px 12px", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 6, fontSize: 12, color: "#065f46" } }, msg)
    );
  }

  function PreferencesModal(props) {
    var onClose = props.onClose;
    var _tab = useState("profile"); var tab = _tab[0], setTab = _tab[1];    function tabBtn(id, label) {
      var active = tab === id;
      return h("button", {
        onClick: function () { setTab(id); },
        style: {
          padding: "8px 14px", border: "none", background: "transparent",
          borderBottom: active ? "2px solid #0d9488" : "2px solid transparent",
          color: active ? "#0d9488" : "#64748b",
          fontWeight: active ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit"
        }
      }, label);
    }

    window.useEscape(function () { onClose && onClose(); });

    return h("div", {
      onClick: onClose,
      style: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }
    },
      h("div", {
        onClick: function (e) { e.stopPropagation(); },
        style: { background: "#fff", borderRadius: 12, width: "100%", maxWidth: 620, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }
      },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0" } },
          h("h2", { style: { margin: 0, fontSize: 18, color: "#0f172a" } }, "Preferences"),
          h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#64748b", padding: "0 4px" }, "aria-label": "Close" }, "×")
        ),
        h("div", { style: { display: "flex", gap: 4, padding: "8px 20px 0", borderBottom: "1px solid #e2e8f0" } },
          tabBtn("profile", "Your profile"),
          tabBtn("pdf", "PDF defaults"),
          tabBtn("preview", "Preview defaults"),
          tabBtn("tutorials", "Tutorials")
        ),
        h("div", { style: { padding: 20, overflowY: "auto", flex: 1 } },
          tab === "profile" ? h(ProfilePanel) :
          tab === "pdf"     ? h(PdfDefaultsPanel) :
          tab === "preview" ? h(PreviewDefaultsPanel) :
                              h(TutorialsPanel)
        ),
        h("div", { style: { padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 8 } },
          h("div", { style: { flex: 1, fontSize: 11, color: "#94a3b8", alignSelf: "center" } }, "Changes save automatically."),
          h("button", { onClick: onClose, style: { padding: "8px 18px", borderRadius: 6, border: "none", background: "#0d9488", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } }, "Done")
        )
      )
    );
  }

  window.PreferencesModal = PreferencesModal;
})();
