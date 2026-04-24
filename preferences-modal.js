/* preferences-modal.js — Sidebar Workbench preferences overlay.
 *
 * Available on Creator, Tracker and Manager pages. Reads/writes via window.UserPrefs.
 * 12 categories shown in a left sidebar; the right pane shows the selected
 * category's settings. Changes save automatically and broadcast a
 * "cs:prefsChanged" CustomEvent so other modules can react.
 *
 * Settings flagged with `_soon: true` are stored in UserPrefs but not yet
 * fully wired to runtime behaviour — they appear with a small "Coming soon"
 * badge so users know the toggle is honest.
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
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;
  // Inline SVG icon library (icons.js). Falls back to a no-op so the modal
  // still renders if icons.js fails to load for any reason.
  var Icons = window.Icons || {};
  function ico(name) {
    return (typeof Icons[name] === "function") ? Icons[name]() : null;
  }

  // ─── UserPrefs bridge ────────────────────────────────────────────────
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
    try {
      window.dispatchEvent(new CustomEvent("cs:prefsChanged", { detail: { key: key, value: value } }));
    } catch (_) {}
  }

  // Helper used by panels to wire a single state hook to a pref key.
  function usePref(key, fallback) {
    var s = useState(function () { return UP_get(key, fallback); });
    function setBoth(v) { s[1](v); UP_set(key, v); }
    return [s[0], setBoth];
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

  // ─── Reusable atoms ──────────────────────────────────────────────────
  var COLOURS = {
    teal: "#0d9488", tealDark: "#0f766e", tealBg: "#f0fdfa", tealBorder: "#99f6e4",
    ink: "#0f172a", slate: "#475569", slate2: "#64748b", hint: "#94a3b8",
    line: "#e2e8f0", line2: "#cbd5e1", bg: "#f8fafc", card: "#fff", danger: "#b91c1c"
  };

  var styles = {
    sectionCard:   { background: COLOURS.card, border: "1px solid " + COLOURS.line, borderRadius: 10, padding: "16px 18px", marginBottom: 14 },
    sectionTitle:  { margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: COLOURS.ink, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid " + COLOURS.line, paddingBottom: 8 },
    row:           { display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "center", padding: "10px 0", borderBottom: "1px dashed " + COLOURS.line },
    rowLast:       { display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "center", padding: "10px 0" },
    label:         { fontWeight: 600, fontSize: 13, color: COLOURS.ink },
    desc:          { fontSize: 12, color: COLOURS.slate2, marginTop: 2 },
    input:         { padding: "7px 10px", border: "1px solid " + COLOURS.line2, borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: "#fff" },
    btn:           { padding: "7px 14px", borderRadius: 7, border: "1px solid " + COLOURS.line2, background: "#fff", fontSize: 13, fontFamily: "inherit", cursor: "pointer", color: COLOURS.slate },
    btnPrimary:    { padding: "7px 14px", borderRadius: 7, border: "1px solid " + COLOURS.teal, background: COLOURS.teal, color: "#fff", fontSize: 13, fontFamily: "inherit", cursor: "pointer", fontWeight: 600 },
    btnDanger:     { padding: "7px 14px", borderRadius: 7, border: "1px solid #fecaca", background: "#fff1f2", color: COLOURS.danger, fontSize: 13, fontFamily: "inherit", cursor: "pointer" },
    pageH:         { fontSize: 20, margin: "0 0 4px", color: COLOURS.ink, fontWeight: 700 },
    pageSub:       { color: COLOURS.slate2, margin: "0 0 18px", fontSize: 13 },
    crumb:         { fontSize: 12, color: COLOURS.hint, marginBottom: 6 }
  };

  function Switch(props) {
    var on = !!props.checked;
    var disabled = !!props.disabled;
    return h("button", {
      type: "button",
      role: "switch",
      "aria-checked": on,
      disabled: disabled,
      onClick: function () { if (!disabled && props.onChange) props.onChange(!on); },
      style: {
        position: "relative", width: 38, height: 22,
        background: on ? COLOURS.teal : "#cbd5e1",
        borderRadius: 999, border: 0, padding: 0, cursor: disabled ? "not-allowed" : "pointer",
        transition: "background .15s", opacity: disabled ? 0.45 : 1, flexShrink: 0
      },
      "aria-label": props["aria-label"] || ""
    },
      h("span", {
        style: {
          position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18,
          background: "#fff", borderRadius: "50%", boxShadow: "0 1px 2px rgba(0,0,0,.2)", transition: "left .15s"
        }
      })
    );
  }

  function Segmented(props) {
    var value = props.value;
    var options = props.options || [];
    return h("div", {
      style: { display: "inline-flex", border: "1px solid " + COLOURS.line2, borderRadius: 7, overflow: "hidden", background: "#fff" }
    }, options.map(function (opt) {
      var isOn = opt.value === value;
      return h("button", {
        key: String(opt.value),
        type: "button",
        onClick: function () { props.onChange && props.onChange(opt.value); },
        style: {
          border: 0,
          background: isOn ? COLOURS.teal : "transparent",
          color: isOn ? "#fff" : COLOURS.slate,
          padding: "6px 12px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", fontWeight: isOn ? 600 : 500
        }
      }, opt.label);
    }));
  }

  function SoonBadge() {
    return h("span", {
      style: {
        marginLeft: 8, fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
        background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", verticalAlign: "middle"
      },
      title: "This setting saves but isn't fully wired to the app yet."
    }, "Coming soon");
  }

  // Render one row: label · description · control. Optional `soon` flag.
  function Row(props) {
    return h("div", { style: props.last ? styles.rowLast : styles.row },
      h("div", { style: { minWidth: 0 } },
        h("div", { style: styles.label }, props.label, props.soon ? h(SoonBadge) : null),
        props.desc ? h("div", { style: styles.desc }, props.desc) : null
      ),
      h("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, props.children)
    );
  }

  function Section(props) {
    return h("section", { style: styles.sectionCard },
      props.title ? h("h3", { style: styles.sectionTitle }, props.title) : null,
      props.children
    );
  }

  function PageHeader(props) {
    return h("div", { style: { marginBottom: 16 } },
      h("div", { style: styles.crumb }, "Settings · ", props.crumb || props.title),
      h("h2", { style: styles.pageH }, props.title),
      props.subtitle ? h("p", { style: styles.pageSub }, props.subtitle) : null
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // PROFILE & BRANDING
  // ════════════════════════════════════════════════════════════════════
  function ProfilePanel() {
    var n = usePref("designerName", "");
    var lg = usePref("designerLogo", null);
    var pos = usePref("designerLogoPosition", "top-right");
    var cp = usePref("designerCopyright", "");
    var ct = usePref("designerContact", "");
    var ac = usePref("appAccentColour", "#0d9488");
    var err = useState(null);

    function onLogoFile(ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      err[1](null);
      downscaleImage(f).then(lg[1]).catch(function (e) { err[1](e.message || "Could not load logo"); });
      ev.target.value = "";
    }

    return h("div", null,
      h(PageHeader, { title: "Your profile", subtitle: "These details are used on PDF exports and stay on this device." }),

      h(Section, { title: "Designer details" },
        h(Row, { label: "Your name or studio name", desc: "Appears on PDF cover pages." },
          h("input", { type: "text", style: Object.assign({}, styles.input, { width: 280 }), value: n[0],
            placeholder: "e.g. Katie's Stitches", onChange: function (e) { n[1](e.target.value); } })
        ),
        h(Row, { label: "Copyright line", desc: "Shown in the PDF footer of every chart." },
          h("input", { type: "text", style: Object.assign({}, styles.input, { width: 280 }), value: cp[0],
            placeholder: "© 2026 Your Name", onChange: function (e) { cp[1](e.target.value); } })
        ),
        h(Row, { label: "Contact or website", desc: "Email or a link printed on PDF cover pages." },
          h("input", { type: "text", style: Object.assign({}, styles.input, { width: 280 }), value: ct[0],
            placeholder: "hello@example.com", onChange: function (e) { ct[1](e.target.value); } })
        ),
        h(Row, { last: true, label: "Logo", desc: "Up to 600 × 600 px. PNG or JPEG." },
          h("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
            lg[0] ? h("img", { src: lg[0], alt: "Logo preview", style: { maxHeight: 44, maxWidth: 140, border: "1px solid " + COLOURS.line, borderRadius: 4, background: "#fff" } })
                  : h("span", { style: { fontSize: 12, color: COLOURS.hint } }, "No logo yet"),
            h("label", { style: Object.assign({}, styles.btn, { display: "inline-flex", alignItems: "center" }) },
              lg[0] ? "Replace…" : "Upload…",
              h("input", { type: "file", accept: "image/png,image/jpeg", style: { display: "none" }, onChange: onLogoFile })
            ),
            lg[0] ? h("button", { style: styles.btnDanger, onClick: function () { lg[1](null); } }, "Remove") : null
          )
        ),
        err[0] ? h("div", { style: { fontSize: 11, color: COLOURS.danger, marginTop: 6 } }, err[0]) : null
      ),

      h(Section, { title: "Logo placement on PDFs" },
        h(Row, { last: true, label: "Logo position on cover page" },
          h(Segmented, { value: pos[0], onChange: pos[1], options: [
            { value: "top-left", label: "Top-left" },
            { value: "top-right", label: "Top-right" }
          ]})
        )
      ),

      // App appearance section commented out — accent-colour tinting is not
      // wired to runtime styles yet, so we hide it from users for now.
      /* h(Section, { title: "App appearance" },
        h(Row, { last: true, label: "Accent colour", desc: "Tints buttons, links and active tabs across the app." },
          h("input", { type: "color", value: ac[0], onChange: function (e) { ac[1](e.target.value); },
            style: { width: 44, height: 30, padding: 0, border: "1px solid " + COLOURS.line2, borderRadius: 6, cursor: "pointer" } })
        )
      ) */ null
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // PATTERN CREATOR
  // ════════════════════════════════════════════════════════════════════
  function CreatorPanel() {
    var pal = usePref("creatorDefaultPaletteSize", 24);
    var fab = usePref("creatorDefaultFabricCount", 16);
    var allowBlend = usePref("creatorAllowBlends", true);
    var stashOnly = usePref("creatorStashOnlyDefault", false);
    var dith = usePref("creatorDefaultDithering", "balanced");
    var smooth = usePref("creatorSmoothDithering", true);
    var orphan = usePref("creatorOrphanRemovalStrength", 2);
    var minStit = usePref("creatorMinStitchesPerColour", 6);
    var protect = usePref("creatorProtectDetails", true);
    var cleanup = usePref("creatorStitchCleanup", true);
    var view = usePref("creatorDefaultViewMode", "colour");
    var grid = usePref("gridOverlayEnabled", false);
    var refOpac = usePref("creatorReferenceOpacity", 35);

    return h("div", null,
      h(PageHeader, { title: "Pattern Creator",
        subtitle: "Defaults used when starting a new pattern. You can still adjust everything per‑project from the Creator's sidebar." }),

      h(Section, { title: "Generation defaults" },
        h(Row, { label: "Maximum colours", desc: "How many DMC colours the Creator may use when matching an image." },
          h("input", { type: "range", min: 6, max: 60, value: pal[0], onChange: function (e) { pal[1](parseInt(e.target.value, 10)); }, style: { width: 160 } }),
          h("input", { type: "number", min: 6, max: 60, value: pal[0], onChange: function (e) { pal[1](Math.max(6, Math.min(60, parseInt(e.target.value, 10) || 24))); }, style: Object.assign({}, styles.input, { width: 64 }) })
        ),
        h(Row, { label: "Fabric count", desc: "How many stitches per inch (Aida count). 14 and 16 are the most common.",
          soon: false },
          h("select", { value: fab[0], onChange: function (e) { fab[1](parseInt(e.target.value, 10)); }, style: styles.input },
            [11, 14, 16, 18, 22, 25, 28, 32].map(function (n) { return h("option", { key: n, value: n }, String(n) + " count"); })
          )
        ),
        h(Row, { label: "Allow blended threads", desc: "Lets the Creator combine two threads in one stitch for richer colour." },
          h(Switch, { checked: allowBlend[0], onChange: allowBlend[1] })
        ),
        h(Row, { last: true, label: "Use only threads from my stash", desc: "Restricts the palette to threads marked as owned in the Stash Manager." },
          h(Switch, { checked: stashOnly[0], onChange: stashOnly[1] })
        )
      ),

      h(Section, { title: "Image preparation" },
        h(Row, { label: "Dithering", desc: "How the Creator blends colours across pixels. Balanced suits most photos." },
          h(Segmented, { value: dith[0], onChange: dith[1], options: [
            { value: "off", label: "Off" }, { value: "weak", label: "Weak" },
            { value: "balanced", label: "Balanced" }, { value: "strong", label: "Strong" }
          ]})
        ),
        h(Row, { label: "Smooth dithering", desc: "Tidies up the speckled look you can get with strong dithering." },
          h(Switch, { checked: smooth[0], onChange: smooth[1] })
        ),
        h(Row, { last: true, label: "Reference image opacity", desc: "How visible your source photo is when overlaid on the chart." },
          h("input", { type: "range", min: 0, max: 100, value: refOpac[0], onChange: function (e) { refOpac[1](parseInt(e.target.value, 10)); }, style: { width: 160 } }),
          h("span", { style: { fontSize: 12, color: COLOURS.slate, width: 36, textAlign: "right" } }, refOpac[0] + "%")
        )
      ),

      h(Section, { title: "Tidying up the pattern" },
        h(Row, { label: "Tidy stray stitches", desc: "Removes lone stitches that don't form a recognisable shape." },
          h(Switch, { checked: cleanup[0], onChange: cleanup[1] })
        ),
        h(Row, { label: "How aggressively to remove strays", desc: "0 keeps everything. 3 removes most isolated stitches." },
          h("input", { type: "range", min: 0, max: 3, value: orphan[0], onChange: function (e) { orphan[1](parseInt(e.target.value, 10)); }, style: { width: 120 } }),
          h("span", { style: { fontSize: 12, color: COLOURS.slate, width: 16, textAlign: "right" } }, String(orphan[0]))
        ),
        h(Row, { label: "Minimum stitches per colour", desc: "Drops any colour used fewer times than this." },
          h("input", { type: "number", min: 0, max: 200, value: minStit[0], onChange: function (e) { minStit[1](Math.max(0, parseInt(e.target.value, 10) || 0)); }, style: Object.assign({}, styles.input, { width: 80 }) })
        ),
        h(Row, { last: true, label: "Protect detailed areas", desc: "Skips tidying around faces, edges and other detail." },
          h(Switch, { checked: protect[0], onChange: protect[1] })
        )
      ),

      h(Section, { title: "Canvas display" },
        h(Row, { label: "Default view", desc: "How a chart opens: by colour, by symbol, or both at once." },
          h(Segmented, { value: view[0], onChange: view[1], options: [
            { value: "colour", label: "Colour" }, { value: "symbol", label: "Symbol" }, { value: "both", label: "Both" }
          ]})
        ),
        h(Row, { last: true, label: "Show grid overlay by default", desc: "Adds 10‑stitch grid lines to the chart canvas." },
          h(Switch, { checked: grid[0], onChange: grid[1] })
        )
      )
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // STITCH TRACKER
  // ════════════════════════════════════════════════════════════════════
  function TrackerPanel() {
    var style = usePref("trackerStitchingStyle", "freestyle");
    var block = usePref("trackerBlockShape", "10x10");
    var corner = usePref("trackerStartCorner", "top-left");
    var halfMode = usePref("trackerHalfStitchMode", "full");
    var parking = usePref("trackerShowParking", true);
    var undoDepth = usePref("trackerUndoDepth", 50);
    var celebrate = usePref("trackerCelebrate", true);
    var dragMark = usePref("trackerDragMark", true);

    return h("div", null,
      h(PageHeader, { title: "Stitch Tracker",
        subtitle: "How the Tracker behaves when you open a pattern. Each project can still override these in its session menu." }),

      h(Section, { title: "Your stitching style" },
        h(Row, { label: "How you stitch", desc: "Block fills small areas at a time · cross‑country follows colour across the chart · freestyle is anything goes." },
          h(Segmented, { value: style[0], onChange: style[1], options: [
            { value: "block", label: "Block" }, { value: "crosscountry", label: "Cross‑country" }, { value: "freestyle", label: "Freestyle" }, { value: "royal", label: "Royal" }
          ]})
        ),
        h(Row, { label: "Block shape", desc: "Width × height of the area you fill at a time." },
          h("select", { value: block[0], onChange: function (e) { block[1](e.target.value); }, style: styles.input },
            h("option", { value: "5x5" },   "5 × 5"),
            h("option", { value: "10x10" }, "10 × 10 (most common)"),
            h("option", { value: "15x15" }, "15 × 15"),
            h("option", { value: "20x20" }, "20 × 20")
          )
        ),
        h(Row, { last: true, label: "Where you start", desc: "The corner you typically begin a new pattern from." },
          h(Segmented, { value: corner[0], onChange: corner[1], options: [
            { value: "TL", label: "Top-left" }, { value: "TR", label: "Top-right" },
            { value: "C", label: "Centre" },
            { value: "BL", label: "Bottom-left" }, { value: "BR", label: "Bottom-right" }
          ]})
        )
      ),

      h(Section, { title: "Counting" },
        // Half-stitch counting and undo-depth rows hidden — not wired yet.
        h(Row, { last: true, label: "Show parking markers", desc: "Small dots that remember where you parked each colour between sessions." },
          h(Switch, { checked: parking[0], onChange: parking[1] })
        )
      ),

      h(Section, { title: "Feedback" },
        h(Row, { label: "Celebrate when a pattern is finished", desc: "Plays a confetti animation and a celebratory toast at 100%." },
          h(Switch, { checked: celebrate[0], onChange: celebrate[1] })
        ),
        h(Row, { last: true, label: "Drag to mark stitches",
          desc: "Click-and-drag (or touch-and-drag) across the chart to mark a run of stitches in one motion. Long-press a cell, then tap the opposite corner to fill a rectangle. Turn off to fall back to plain tap-to-mark." },
          h(Switch, { checked: dragMark[0], onChange: dragMark[1] })
        )
      )
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // STASH MANAGER
  // ════════════════════════════════════════════════════════════════════
  function ManagerPanel() {
    var brand = usePref("stashDefaultBrand", "dmc");
    var lowStock = usePref("stashLowStockThreshold", 1);
    var strands = usePref("stitchStrandsUsed", 2);
    var waste = usePref("stitchWasteFactor", 15);
    var sort = usePref("patternsDefaultSort", "updatedDesc");
    var filter = usePref("patternsDefaultFilter", "all");
    var skeinPrice = usePref("skeinPriceDefault", 0.95);
    var detailGrid = usePref("managerDetailGrid", false);

    return h("div", null,
      h(PageHeader, { title: "Stash Manager",
        subtitle: "Defaults for your thread inventory and pattern library." }),

      h(Section, { title: "Stash defaults" },
        h(Row, { label: "Default thread brand", desc: "Used when adding new threads or browsing the conversion picker." },
          h(Segmented, { value: brand[0], onChange: brand[1], options: [
            { value: "DMC", label: "DMC" }, { value: "Anchor", label: "Anchor" }, { value: "both", label: "Both" }
          ]})
        ),
        h(Row, { last: true, label: "Warn me when a thread runs low", desc: "Show a low‑stock badge when you have this many skeins or fewer." },
          h("input", { type: "number", min: 0, max: 20, step: 1, value: lowStock[0],
            onChange: function (e) { lowStock[1](Math.max(0, parseInt(e.target.value, 10) || 0)); },
            style: Object.assign({}, styles.input, { width: 70 }) }),
          h("span", { style: { fontSize: 12, color: COLOURS.slate2 } }, lowStock[0] === 1 ? "skein" : "skeins")
        )
      ),

      h(Section, { title: "Skein calculations" },
        h(Row, { label: "Strands used per stitch", desc: "Most cross stitch uses 2 strands on 14‑ or 16‑count Aida." },
          h("input", { type: "number", min: 1, max: 6, value: strands[0],
            onChange: function (e) { strands[1](Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 2))); },
            style: Object.assign({}, styles.input, { width: 70 }) })
        ),
        h(Row, { label: "Waste allowance", desc: "Extra thread added to estimates to cover starts, ends and unpicks." },
          h("input", { type: "range", min: 0, max: 50, value: Math.round(waste[0] * 100), onChange: function (e) { waste[1](parseInt(e.target.value, 10) / 100); }, style: { width: 140 } }),
          h("span", { style: { fontSize: 12, color: COLOURS.slate, width: 38, textAlign: "right" } }, Math.round(waste[0] * 100) + "%")
        ),
        h(Row, { last: true, label: "Default skein price", desc: "Used to estimate thread cost. Currency follows your Regional setting." },
          h("input", { type: "number", min: 0, max: 50, step: 0.05, value: skeinPrice[0],
            onChange: function (e) { skeinPrice[1](parseFloat(e.target.value) || 0); },
            style: Object.assign({}, styles.input, { width: 90 }) })
        )
      ),

      h(Section, { title: "Pattern library" },
        h(Row, { label: "Sort patterns by", desc: "How the Patterns list is ordered when you open the Stash Manager." },
          h("select", { value: sort[0], onChange: function (e) { sort[1](e.target.value); }, style: styles.input },
            h("option", { value: "date_desc" }, "Recently updated"),
            h("option", { value: "date_asc" }, "Oldest first"),
            h("option", { value: "title_asc" }, "Title (A → Z)"),
            h("option", { value: "designer_asc" }, "Designer (A → Z)"),
            h("option", { value: "status" }, "Status")
          )
        ),
        h(Row, { label: "Show by default", desc: "Which patterns the library opens with." },
          h("select", { value: filter[0], onChange: function (e) { filter[1](e.target.value); }, style: styles.input },
            h("option", { value: "all" }, "All patterns"),
            h("option", { value: "wishlist" }, "Wishlist"),
            h("option", { value: "owned" }, "Owned"),
            h("option", { value: "inprogress" }, "In progress"),
            h("option", { value: "completed" }, "Completed")
          )
        ),
        // Detailed thread grid toggle hidden — old denser view not implemented.
        null
      )
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // PREVIEW & DISPLAY
  // ════════════════════════════════════════════════════════════════════
  function PreviewPanel() {
    var lvl = usePref("preferredPreviewLevel", "level2");
    var fab = usePref("fabricColour", "#F5F0E6");
    var grid = usePref("gridOverlayEnabled", false);
    var split = usePref("splitPaneEnabled", false);
    var mockup = usePref("preferredMockupType", "hoop");
    var hoop = usePref("preferredHoopStyle", "light-maple");
    var frame = usePref("preferredFrameStyle", "slim-black");
    var mountCol = usePref("preferredMountColour", "#FFFFFF");

    return h("div", null,
      h(PageHeader, { title: "Preview & display",
        subtitle: "How patterns look when you open them. Per‑pattern overrides still take precedence." }),

      h(Section, { title: "Default preview" },
        h(Row, { label: "Preview detail level", desc: "Level 1 is the bare chart; Level 4 shows your work in a hoop or frame." },
          h("select", { value: lvl[0], onChange: function (e) { lvl[1](e.target.value); }, style: styles.input },
            h("option", { value: "level1" }, "Level 1 — Chart only"),
            h("option", { value: "level2" }, "Level 2 — Standard preview"),
            h("option", { value: "level3" }, "Level 3 — Realistic fabric"),
            h("option", { value: "level4" }, "Level 4 — Hoop or frame")
          )
        ),
        h(Row, { label: "Default fabric colour", desc: "Used as the chart background and behind realistic previews." },
          h("input", { type: "color", value: fab[0], onChange: function (e) { fab[1](e.target.value); }, style: { width: 44, height: 30, padding: 0, border: "1px solid " + COLOURS.line2, borderRadius: 6 } }),
          h("input", { type: "text", value: fab[0], onChange: function (e) { fab[1](e.target.value); }, style: Object.assign({}, styles.input, { width: 110 }) })
        ),
        h(Row, { last: true, label: "Show grid overlay by default", desc: "Adds 10‑stitch grid lines to the chart." },
          h(Switch, { checked: grid[0], onChange: grid[1] })
        )
      ),

      h(Section, { title: "Hoop & frame mockups" },
        h(Row, { label: "Default mockup type" },
          h(Segmented, { value: mockup[0], onChange: mockup[1], options: [
            { value: "hoop", label: "Hoop" }, { value: "frame", label: "Frame" }
          ]})
        ),
        h(Row, { label: "Hoop finish" },
          h("select", { value: hoop[0], onChange: function (e) { hoop[1](e.target.value); }, style: styles.input },
            h("option", { value: "light-maple" }, "Light maple"),
            h("option", { value: "dark-walnut" }, "Dark walnut"),
            h("option", { value: "white" }, "White")
          )
        ),
        h(Row, { label: "Frame style" },
          h("select", { value: frame[0], onChange: function (e) { frame[1](e.target.value); }, style: styles.input },
            h("option", { value: "slim-black" }, "Slim black"),
            h("option", { value: "wide-gold" }, "Wide gold"),
            h("option", { value: "natural-wood" }, "Natural wood")
          )
        ),
        h(Row, { last: true, label: "Mount colour" },
          h("input", { type: "color", value: mountCol[0], onChange: function (e) { mountCol[1](e.target.value); }, style: { width: 44, height: 30, padding: 0, border: "1px solid " + COLOURS.line2, borderRadius: 6 } })
        )
      ),

      h(Section, { title: "Layout" },
        h(Row, { last: true, label: "Open patterns in split-pane view", desc: "Shows the chart on the left and a live preview on the right." },
          h(Switch, { checked: split[0], onChange: split[1] })
        )
      )
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // PDF EXPORT
  // ════════════════════════════════════════════════════════════════════
  function PdfPanel() {
    var preset = usePref("exportPreset", "patternKeeper");
    var pageSize = usePref("exportPageSize", "auto");
    var marg = usePref("exportMarginsMm", 12);
    var spp = usePref("exportStitchesPerPage", "medium");
    var bw = usePref("exportChartModeBw", true);
    var col = usePref("exportChartModeColour", true);
    var ovl = usePref("exportOverlap", true);
    var cov = usePref("exportIncludeCover", true);
    var info = usePref("exportIncludeInfo", true);
    var idx = usePref("exportIncludeIndex", true);
    var mini = usePref("exportMiniLegend", true);
    var gridInt = usePref("exportGridInterval", 10);
    var centreMarks = usePref("exportCentreMarks", true);

    return h("div", null,
      h(PageHeader, { title: "PDF export",
        subtitle: "Default settings used when exporting a pattern. You can still change anything per export." }),

      h(Section, { title: "Preset & paper" },
        h(Row, { label: "Preset", desc: "“Pattern Keeper compatible” is best for the popular tracking app on phones and tablets." },
          h("select", { value: preset[0], onChange: function (e) { preset[1](e.target.value); }, style: styles.input },
            h("option", { value: "patternKeeper" }, "Pattern Keeper compatible"),
            h("option", { value: "homePrinting" }, "Home printing")
          )
        ),
        h(Row, { label: "Page size" },
          h(Segmented, { value: pageSize[0], onChange: pageSize[1], options: [
            { value: "auto", label: "Auto" }, { value: "a4", label: "A4" }, { value: "letter", label: "US Letter" }
          ]})
        ),
        h(Row, { label: "Page margins", desc: "Distance between the chart and the edge of the page." },
          h("input", { type: "number", min: 0, max: 50, value: marg[0], onChange: function (e) { marg[1](Math.max(0, parseInt(e.target.value, 10) || 0)); }, style: Object.assign({}, styles.input, { width: 70 }) }),
          h("span", { style: { fontSize: 12, color: COLOURS.slate2 } }, "mm")
        ),
        h(Row, { last: true, label: "Stitches per page" },
          h(Segmented, { value: spp[0], onChange: spp[1], options: [
            { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }
          ]})
        )
      ),

      h(Section, { title: "Chart" },
        h(Row, { label: "Black & white chart" }, h(Switch, { checked: bw[0], onChange: bw[1] })),
        h(Row, { label: "Colour chart" }, h(Switch, { checked: col[0], onChange: col[1] })),
        h(Row, { label: "Show grid lines every…", desc: "Heavier grid lines every N stitches make counting easier." },
          h("input", { type: "number", min: 5, max: 20, value: gridInt[0], onChange: function (e) { gridInt[1](Math.max(5, parseInt(e.target.value, 10) || 10)); }, style: Object.assign({}, styles.input, { width: 70 }) }),
          h("span", { style: { fontSize: 12, color: COLOURS.slate2 } }, "stitches")
        ),
        h(Row, { label: "Centre marks", desc: "Small triangles on each axis showing the chart's centre." }, h(Switch, { checked: centreMarks[0], onChange: centreMarks[1] })),
        h(Row, { last: true, label: "Overlap pages", desc: "Repeats a few stitches on each page so you can line them up." }, h(Switch, { checked: ovl[0], onChange: ovl[1] }))
      ),

      h(Section, { title: "Pages to include" },
        h(Row, { label: "Cover page" }, h(Switch, { checked: cov[0], onChange: cov[1] })),
        h(Row, { label: "Project information page" }, h(Switch, { checked: info[0], onChange: info[1] })),
        h(Row, { label: "Page index map" }, h(Switch, { checked: idx[0], onChange: idx[1] })),
        h(Row, { last: true, label: "Mini legend on every chart page" }, h(Switch, { checked: mini[0], onChange: mini[1] }))
      )
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY
  // ════════════════════════════════════════════════════════════════════
  function AccessibilityPanel() {
    var fs = usePref("a11yFontScale", "m");
    var hc = usePref("a11yHighContrast", false);
    var rm = usePref("a11yReducedMotion", false);
    var cb = usePref("a11yColourBlindAid", "off");
    var symOnly = usePref("a11ySymbolOnly", false);
    var dark = usePref("a11yDarkMode", "system");

    return h("div", null,
      h(PageHeader, { title: "Accessibility",
        subtitle: "Make the app more comfortable to use. Changes apply straight away." }),

      h(Section, { title: "Reading & contrast" },
        h(Row, { label: "Text size", desc: "Scales every label, button and menu in the app." },
          h(Segmented, { value: fs[0], onChange: fs[1], options: [
            { value: "s", label: "Small" }, { value: "m", label: "Medium" },
            { value: "l", label: "Large" }, { value: "xl", label: "Extra large" }
          ]})
        ),
        h(Row, { label: "High contrast", desc: "Uses stronger borders and bolder text colours." },
          h(Switch, { checked: hc[0], onChange: hc[1] })
        ),
        h(Row, { last: true, label: "Appearance", desc: "Override your system light/dark setting." },
          h(Segmented, { value: dark[0], onChange: dark[1], options: [
            { value: "system", label: "Use system" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }
          ]})
        )
      ),

      h(Section, { title: "Motion & colour" },
        // Colour-blind aid hidden — colour-shift logic not wired yet.
        h(Row, { label: "Reduce motion", desc: "Turns off slide and fade animations and the completion confetti." },
          h(Switch, { checked: rm[0], onChange: rm[1] })
        ),
        h(Row, { last: true, label: "Show symbols, not colours, by default", desc: "Some stitchers find symbols easier to follow than colour swatches." },
          h(Switch, { checked: symOnly[0], onChange: symOnly[1] })
        )
      )
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════════
  function NotificationsPanel() {
    var on = usePref("toastsEnabled", true);
    var sound = usePref("notifSound", false);
    var haptic = usePref("notifHaptic", true);
    var milestones = usePref("notifMilestones", true);
    var lowStockNotify = usePref("notifLowStock", true);
    var maxToasts = usePref("toastMaxVisible", 3);

    return h("div", null,
      h(PageHeader, { title: "Notifications",
        subtitle: "Control the small messages and sounds the app uses to keep you informed." }),

      h(Section, { title: "Toast notifications" },
        h(Row, { label: "Show toast notifications", desc: "Brief messages that pop up at the bottom of the screen, e.g. ‘Pattern saved’." },
          h(Switch, { checked: on[0], onChange: on[1] })
        ),
        h(Row, { last: true, label: "How many to show at once" },
          h("input", { type: "number", min: 1, max: 6, value: maxToasts[0],
            onChange: function (e) { maxToasts[1](Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 3))); },
            style: Object.assign({}, styles.input, { width: 70 }) })
        )
      ),

      h(Section, { title: "Milestones & alerts" },
        h(Row, { label: "Celebrate milestones", desc: "Shows toast messages at 25%, 50%, 75% and when you finish a pattern." },
          h(Switch, { checked: milestones[0], onChange: milestones[1] })
        ),
        h(Row, { last: true, label: "Low‑stock alerts", desc: "Show a notice when threads in your stash drop below the warning level." },
          h(Switch, { checked: lowStockNotify[0], onChange: lowStockNotify[1] })
        )
      ),

      // Sound & touch section hidden — audio/haptic feedback not wired yet.
      null
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // REGIONAL & UNITS
  // ════════════════════════════════════════════════════════════════════
  function RegionalPanel() {
    var cur = usePref("currency", "GBP");
    var lenUnit = usePref("threadLengthUnit", "in");
    var fabricUnit = usePref("fabricMeasurementUnit", "in");
    var skeinPrice = usePref("skeinPriceDefault", 0.95);

    return h("div", null,
      h(PageHeader, { title: "Regional & units",
        subtitle: "Currency and measurement units used throughout the app." }),

      h(Section, { title: "Currency" },
        h(Row, { label: "Currency", desc: "Used for thread cost estimates and the stash value summary." },
          h(Segmented, { value: cur[0], onChange: cur[1], options: [
            { value: "GBP", label: "£ GBP" }, { value: "USD", label: "$ USD" }, { value: "EUR", label: "€ EUR" }, { value: "CAD", label: "$ CAD" }, { value: "AUD", label: "$ AUD" }
          ]})
        ),
        h(Row, { last: true, label: "Default skein price", desc: "Cost of a single skein in the currency above." },
          h("input", { type: "number", min: 0, max: 50, step: 0.05, value: skeinPrice[0],
            onChange: function (e) { skeinPrice[1](parseFloat(e.target.value) || 0); },
            style: Object.assign({}, styles.input, { width: 100 }) })
        )
      ),

      h(Section, { title: "Measurements" },
        h(Row, { label: "Thread length", desc: "Used wherever the app shows how much thread you'll need." },
          h(Segmented, { value: lenUnit[0], onChange: lenUnit[1], options: [
            { value: "in", label: "Inches" }, { value: "cm", label: "Centimetres" }
          ]})
        ),
        h(Row, { last: true, label: "Fabric size", desc: "Whether finished sizes show in inches or centimetres." },
          h(Segmented, { value: fabricUnit[0], onChange: fabricUnit[1], options: [
            { value: "in", label: "Inches" }, { value: "cm", label: "Centimetres" }
          ]})
        )
      )
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // SYNC, BACKUP & DATA
  // ════════════════════════════════════════════════════════════════════
  function DataPanel() {
    var autosync = usePref("autoSyncEnabled", true);
    var autoLib = usePref("autoLibraryLink", true);
    var msg = useState(null);
    var busy = useState(false);
    var fileRef = React.useRef ? React.useRef(null) : null;
    if (!fileRef) fileRef = { current: null };

    function downloadBackup() {
      if (!window.BackupRestore || typeof window.BackupRestore.downloadBackup !== "function") {
        msg[1]({ kind: "err", text: "Backup isn't available on this page." });
        return;
      }
      busy[1](true); msg[1](null);
      window.BackupRestore.downloadBackup().then(function () {
        busy[1](false);
        msg[1]({ kind: "ok", text: "Backup downloaded. Keep the file somewhere safe." });
      }).catch(function (e) {
        busy[1](false);
        msg[1]({ kind: "err", text: e && e.message ? e.message : "Could not download the backup." });
      });
    }

    function pickRestoreFile(ev) {
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!f) return;
      if (!window.BackupRestore || typeof window.BackupRestore.restoreBackup !== "function") {
        msg[1]({ kind: "err", text: "Restore isn't available on this page." });
        return;
      }
      var ok = window.confirm("Restoring will replace ALL of your current patterns, stash and settings with the contents of the backup file. Continue?");
      if (!ok) return;
      busy[1](true); msg[1](null);
      window.BackupRestore.restoreBackup(f).then(function () {
        busy[1](false);
        msg[1]({ kind: "ok", text: "Backup restored. Reload any open pages to see the changes." });
      }).catch(function (e) {
        busy[1](false);
        msg[1]({ kind: "err", text: e && e.message ? e.message : "Could not restore the backup." });
      });
    }

    function clearProjects() {
      var ok = window.confirm("This will delete EVERY pattern saved in this browser. Stash and settings will be kept. Are you sure?");
      if (!ok) return;
      try {
        var req = indexedDB.deleteDatabase("CrossStitchDB");
        req.onsuccess = function () { msg[1]({ kind: "ok", text: "All patterns deleted. Reload the page to start fresh." }); };
        req.onerror = function () { msg[1]({ kind: "err", text: "Could not clear the project database." }); };
      } catch (e) { msg[1]({ kind: "err", text: e.message || "Could not clear the database." }); }
    }

    function clearStash() {
      var ok = window.confirm("This will delete your entire thread stash and pattern library. Patterns saved in the Creator are kept. Are you sure?");
      if (!ok) return;
      try {
        var req = indexedDB.deleteDatabase("stitch_manager_db");
        req.onsuccess = function () { msg[1]({ kind: "ok", text: "Stash cleared. Reload the page to start fresh." }); };
        req.onerror = function () { msg[1]({ kind: "err", text: "Could not clear the stash database." }); };
      } catch (e) { msg[1]({ kind: "err", text: e.message || "Could not clear the database." }); }
    }

    return h("div", null,
      h(PageHeader, { title: "Sync, backup & data",
        subtitle: "Keep a safety copy of your work, or start over with a clean slate." }),

      h(Section, { title: "Sync" },
        // Auto-sync stitch progress hidden — multi-device sync not implemented yet.
        h(Row, { last: true, label: "Add new patterns to the library automatically", desc: "When you save a pattern in the Creator, also link it from the Stash Manager." },
          h(Switch, { checked: autoLib[0], onChange: autoLib[1] })
        )
      ),

      h(Section, { title: "Backup" },
        h(Row, { label: "Download a backup", desc: "Saves every pattern, your stash and your settings into a single file." },
          h("button", { style: styles.btn, disabled: busy[0], onClick: downloadBackup }, busy[0] ? "Working…" : "Download backup")
        ),
        h(Row, { last: true, label: "Restore from a backup file", desc: "Replaces everything with the contents of a backup. Choose carefully." },
          h("label", { style: Object.assign({}, styles.btn, { display: "inline-flex", alignItems: "center", cursor: "pointer" }) },
            "Choose file…",
            h("input", { type: "file", accept: "application/json,.json", style: { display: "none" }, onChange: pickRestoreFile })
          )
        )
      ),

      h(Section, { title: "Start over" },
        h(Row, { label: "Delete all patterns", desc: "Clears every pattern saved in the Creator and Tracker." },
          h("button", { style: styles.btnDanger, onClick: clearProjects }, "Delete patterns…")
        ),
        h(Row, { last: true, label: "Delete my stash", desc: "Clears the Stash Manager's thread inventory and pattern library." },
          h("button", { style: styles.btnDanger, onClick: clearStash }, "Delete stash…")
        )
      ),
      msg[0] ? h("div", {
        style: {
          marginTop: 8, padding: "10px 14px", borderRadius: 8, fontSize: 12,
          background: msg[0].kind === "err" ? "#fef2f2" : COLOURS.tealBg,
          border: "1px solid " + (msg[0].kind === "err" ? "#fecaca" : COLOURS.tealBorder),
          color: msg[0].kind === "err" ? COLOURS.danger : COLOURS.tealDark
        }
      }, msg[0].text) : null
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ONBOARDING & HELP
  // ════════════════════════════════════════════════════════════════════
  function OnboardingPanel() {
    var msg = useState(null);
    var hint = useState(function () {
      try { return !!localStorage.getItem("cs_help_hint_dismissed"); } catch (_) { return false; }
    });
    var pview = useState(function () {
      var n = 0;
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf("cs_pview_") === 0) n++; } } catch (_) {}
      return n;
    });
    function clearOne(page, friendly) {
      try { if (window.WelcomeWizard && window.WelcomeWizard.reset) window.WelcomeWizard.reset(page); } catch (_) {}
      if (page === "tracker") { try { localStorage.removeItem("cs_styleOnboardingDone"); } catch (_) {} }
      msg[1]("Reset the " + friendly + " walkthrough. Reload that page to see it again.");
    }
    function clearAllTutorials() {
      try { if (window.WelcomeWizard && window.WelcomeWizard.resetAll) window.WelcomeWizard.resetAll(); } catch (_) {}
      try { if (window.HelpHintBanner && window.HelpHintBanner.reset) window.HelpHintBanner.reset(); } catch (_) {}
      try { localStorage.removeItem("cs_styleOnboardingDone"); } catch (_) {}
      hint[1](false);
      msg[1]("All walkthroughs reset. Reload any open page to see them again.");
    }
    function clearHint() {
      try { if (window.HelpHintBanner && window.HelpHintBanner.reset) window.HelpHintBanner.reset(); } catch (_) {}
      hint[1](false);
      msg[1]("The help hint will reappear next time you visit.");
    }
    function clearPviews() {
      try {
        var toDel = [];
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf("cs_pview_") === 0) toDel.push(k); }
        toDel.forEach(function (k) { localStorage.removeItem(k); });
      } catch (_) {}
      pview[1](0);
      msg[1]("Cleared remembered zoom and scroll positions for every pattern.");
    }

    return h("div", null,
      h(PageHeader, { title: "Onboarding & help",
        subtitle: "Replay any walkthrough or restore dismissed hints. Your patterns and stash are not affected." }),

      h(Section, { title: "Walkthroughs" },
        h(Row, { label: "Pattern Creator welcome" },
          h("button", { style: styles.btn, onClick: function () { clearOne("creator", "Pattern Creator"); } }, "Replay")
        ),
        h(Row, { label: "Stash Manager welcome" },
          h("button", { style: styles.btn, onClick: function () { clearOne("manager", "Stash Manager"); } }, "Replay")
        ),
        h(Row, { last: true, label: "Stitch Tracker welcome & style picker" },
          h("button", { style: styles.btn, onClick: function () { clearOne("tracker", "Stitch Tracker"); } }, "Replay")
        )
      ),

      h(Section, { title: "Hints" },
        h(Row, { label: "Help hint banner",
          desc: hint[0] ? "You've dismissed this hint." : "The hint is currently visible." },
          h("button", { style: hint[0] ? styles.btn : Object.assign({}, styles.btn, { opacity: 0.5, cursor: "not-allowed" }),
            disabled: !hint[0], onClick: clearHint }, "Restore")
        ),
        h(Row, { last: true, label: "Remembered chart positions",
          desc: pview[0] ? ("Stored for " + pview[0] + " patterns.") : "Nothing stored yet." },
          h("button", { style: pview[0] ? styles.btnDanger : Object.assign({}, styles.btn, { opacity: 0.5, cursor: "not-allowed" }),
            disabled: !pview[0], onClick: clearPviews }, "Clear")
        )
      ),

      h("div", { style: { marginTop: 4 } },
        h("button", { style: styles.btnPrimary, onClick: clearAllTutorials }, "Reset every walkthrough")
      ),
      msg[0] ? h("div", {
        style: { marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 12, background: COLOURS.tealBg, border: "1px solid " + COLOURS.tealBorder, color: COLOURS.tealDark }
      }, msg[0]) : null
    );
  }

  // Track narrow viewport so ≤480px gets a stacked single-column layout.
  function useIsMobile() {
    var _m = useState(function () {
      return typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(max-width: 480px)").matches : false;
    });
    var isMobile = _m[0], setIsMobile = _m[1];
    React.useEffect(function () {
      if (typeof window === "undefined" || !window.matchMedia) return;
      var mq = window.matchMedia("(max-width: 480px)");
      function on() { setIsMobile(mq.matches); }
      // Older Safari uses addListener
      if (mq.addEventListener) mq.addEventListener("change", on);
      else if (mq.addListener) mq.addListener(on);
      return function () {
        if (mq.removeEventListener) mq.removeEventListener("change", on);
        else if (mq.removeListener) mq.removeListener(on);
      };
    }, []);
    return isMobile;
  }

  // ════════════════════════════════════════════════════════════════════
  // ADVANCED
  // ════════════════════════════════════════════════════════════════════
  function AdvancedPanel() {
    var palette = usePref("commandPaletteHotkey", "ctrl+k");
    var experimental = usePref("flagExperimentalPreview", false);
    var swStatus = useState("Checking…");
    var msg = useState(null);

    useEffect(function () {
      if (!("serviceWorker" in navigator)) { swStatus[1]("Not supported in this browser"); return; }
      navigator.serviceWorker.getRegistration().then(function (reg) {
        swStatus[1](reg ? "Registered (offline ready)" : "Not registered");
      }).catch(function () { swStatus[1]("Unknown"); });
    }, []);

    function clearCacheAndReload() {
      var ok = window.confirm("This will clear cached app files and reload the page. Your patterns and settings are not affected. Continue?");
      if (!ok) return;
      try {
        if ("caches" in window) {
          caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          }).then(function () {
            if ("serviceWorker" in navigator) {
              navigator.serviceWorker.getRegistrations().then(function (regs) {
                regs.forEach(function (r) { try { r.unregister(); } catch (_) {} });
                window.location.reload();
              });
            } else {
              window.location.reload();
            }
          });
        } else {
          window.location.reload();
        }
      } catch (e) { msg[1]({ kind: "err", text: e.message || "Could not clear caches." }); }
    }

    function factoryReset() {
      var ok = window.confirm("Factory reset will erase ALL preferences, walkthroughs and remembered chart positions, but keep your patterns and stash. Continue?");
      if (!ok) return;
      try {
        if (window.UserPrefs && typeof window.UserPrefs.reset === "function") window.UserPrefs.reset();
        msg[1]({ kind: "ok", text: "Preferences reset to defaults." });
        setTimeout(function () { window.location.reload(); }, 500);
      } catch (e) { msg[1]({ kind: "err", text: e.message || "Could not reset." }); }
    }

    return h("div", null,
      h(PageHeader, { title: "Advanced",
        subtitle: "Settings most stitchers won't need to change. Use these only if you know what you're doing." }),

      // Keyboard hotkey customisation and experimental-preview flag hidden
      // until the underlying features are implemented.

      h(Section, { title: "Storage & cache" },
        h(Row, { label: "Service worker", desc: "Lets the app work offline." },
          h("span", { style: { fontSize: 12, color: COLOURS.slate2 } }, swStatus[0])
        ),
        h(Row, { label: "Clear cached app files", desc: "Forces the browser to download the latest version of the app." },
          h("button", { style: styles.btn, onClick: clearCacheAndReload }, "Clear cache & reload")
        ),
        h(Row, { last: true, label: "Reset all preferences to defaults",
          desc: "Patterns and stash data are kept; everything in this Settings window goes back to its factory value." },
          h("button", { style: styles.btnDanger, onClick: factoryReset }, "Factory reset preferences")
        )
      ),
      msg[0] ? h("div", {
        style: {
          marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 12,
          background: msg[0].kind === "err" ? "#fef2f2" : COLOURS.tealBg,
          border: "1px solid " + (msg[0].kind === "err" ? "#fecaca" : COLOURS.tealBorder),
          color: msg[0].kind === "err" ? COLOURS.danger : COLOURS.tealDark
        }
      }, msg[0].text) : null
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // CATEGORIES INDEX
  // ════════════════════════════════════════════════════════════════════
  // Each category renders an inline-SVG icon from window.Icons (see icons.js).
  // No emoji — we use icons everywhere for visual consistency.
  var CATEGORIES = [
    { group: "General",   id: "profile",  iconName: "user",          label: "Profile & branding",   Panel: ProfilePanel },
    { group: "General",   id: "regional", iconName: "globe",         label: "Regional & units",     Panel: RegionalPanel },
    { group: "General",   id: "notify",   iconName: "bell",          label: "Notifications",        Panel: NotificationsPanel },
    { group: "General",   id: "a11y",     iconName: "accessibility", label: "Accessibility",        Panel: AccessibilityPanel },
    { group: "Workspaces",id: "creator",  iconName: "palette",       label: "Pattern Creator",      Panel: CreatorPanel },
    { group: "Workspaces",id: "tracker",  iconName: "needle",        label: "Stitch Tracker",       Panel: TrackerPanel },
    { group: "Workspaces",id: "manager",  iconName: "box",           label: "Stash Manager",        Panel: ManagerPanel },
    { group: "Output",    id: "preview",  iconName: "frame",         label: "Preview & display",    Panel: PreviewPanel },
    { group: "Output",    id: "pdf",      iconName: "document",      label: "PDF export",           Panel: PdfPanel },
    { group: "System",    id: "data",     iconName: "cloudSync",     label: "Sync, backup & data",  Panel: DataPanel },
    { group: "System",    id: "onboard",  iconName: "gradCap",       label: "Onboarding & help",    Panel: OnboardingPanel },
    { group: "System",    id: "advanced", iconName: "gear",          label: "Advanced",             Panel: AdvancedPanel }
  ];

  // ════════════════════════════════════════════════════════════════════
  // MODAL SHELL
  // ════════════════════════════════════════════════════════════════════
  function PreferencesModal(props) {
    var onClose = props.onClose;
    // Initial category: respect a passed-in `initialCategory`, otherwise default
    // to a sensible page based on which app surface is being used.
    var defaultId = props.initialCategory || (function () {
      try {
        var p = (window.location.pathname || "").toLowerCase();
        if (p.indexOf("stitch") >= 0) return "tracker";
        if (p.indexOf("manager") >= 0) return "manager";
      } catch (_) {}
      return "creator";
    })();
    var t = useState(defaultId); var tab = t[0], setTab = t[1];

    if (window.useEscape) window.useEscape(function () { onClose && onClose(); });

    var groups = useMemo(function () {
      var byGroup = {};
      CATEGORIES.forEach(function (c) {
        if (!byGroup[c.group]) byGroup[c.group] = [];
        byGroup[c.group].push(c);
      });
      return ["General", "Workspaces", "Output", "System"].map(function (g) { return { name: g, items: byGroup[g] || [] }; });
    }, []);

    var current = CATEGORIES.find(function (c) { return c.id === tab; }) || CATEGORIES[0];

    var navBtn = function (cat) {
      var active = cat.id === tab;
      return h("button", {
        key: cat.id, type: "button",
        onClick: function () { setTab(cat.id); },
        style: {
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          textAlign: "left", border: 0, background: active ? "#fff" : "transparent",
          color: active ? COLOURS.ink : COLOURS.slate, padding: "8px 12px",
          borderRadius: 8, font: "inherit", cursor: "pointer",
          fontWeight: active ? 600 : 500,
          boxShadow: active ? ("inset 3px 0 0 " + COLOURS.teal) : "none"
        }
      },
        h("span", { style: { width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", color: active ? COLOURS.teal : COLOURS.slate2, fontSize: 16, lineHeight: 1 }, "aria-hidden": true }, ico(cat.iconName)),
        h("span", null, cat.label)
      );
    };

    var isMobile = useIsMobile();

    return h("div", {
      onClick: onClose,
      "data-pref-modal": true,
      style: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1100, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 }
    },
      h("div", {
        onClick: function (e) { e.stopPropagation(); },
        style: isMobile ? {
          background: COLOURS.card, borderRadius: "12px 12px 0 0",
          width: "100%", maxHeight: "92vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.35)", overflow: "hidden"
        } : {
          background: COLOURS.card, borderRadius: 14,
          width: "100%", maxWidth: 1100, height: "min(92vh, 720px)",
          display: "grid", gridTemplateRows: "auto 1fr auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)", overflow: "hidden"
        }
      },
        // Header
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid " + COLOURS.line } },
          h("h2", { style: { margin: 0, fontSize: 18, color: COLOURS.ink } }, "Settings"),
          h("button", { onClick: onClose, "aria-label": "Close",
            style: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: COLOURS.slate2, padding: "0 4px", minWidth: 44, minHeight: 44 } }, "×")
        ),

        // Body: on mobile stack nav above panel, on desktop use sidebar grid
        h("div", { style: isMobile
          ? { display: "flex", flexDirection: "column", overflowY: "auto", flex: 1 }
          : { display: "grid", gridTemplateColumns: "240px 1fr", minHeight: 0, overflow: "hidden" }
        },
          h("nav", {
            style: isMobile
              ? { borderBottom: "1px solid " + COLOURS.line, background: COLOURS.bg, padding: "6px 8px", display: "flex", flexWrap: "wrap", gap: 2 }
              : { borderRight: "1px solid " + COLOURS.line, background: COLOURS.bg, overflowY: "auto", padding: "10px 8px" }
          },
            groups.map(function (g) {
              return h("div", { key: g.name },
                !isMobile && h("div", { style: { fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: COLOURS.hint, padding: "14px 12px 6px" } }, g.name),
                g.items.map(navBtn)
              );
            })
          ),
          h("main", { style: isMobile ? { overflowY: "auto", padding: "16px 18px" } : { overflowY: "auto", padding: "24px 28px" } },
            h(current.Panel)
          )
        ),

        // Footer
        h("div", {
          style: {
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 22px", borderTop: "1px solid " + COLOURS.line, background: "#fafbfc"
          }
        },
          h("span", { style: { fontSize: 11, color: COLOURS.hint } }, "Changes save automatically. ‘Coming soon’ settings are remembered but not yet active in the app."),
          h("button", { style: styles.btnPrimary, onClick: onClose }, "Done")
        )
      )
    );
  }

  window.PreferencesModal = PreferencesModal;
})();
