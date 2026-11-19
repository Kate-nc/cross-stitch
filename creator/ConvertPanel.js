/* creator/ConvertPanel.js — the Convert settings panel (the right-hand panel
   while a picture is being converted).

   Laid out like the Edit panel: a strip of tabs in the order the choices are
   made (Size, Threads, Detail), flat sections with the Edit panel's
   headings and hints (.cs-toolsec), a Next button at the foot of each step,
   and Generate pinned at the bottom under a one-line summary of what it will
   make. Every setting is shown once. Within a step, a setting comes before
   the ones it limits (the stash before the thread count). The pattern's name
   comes from the picture's file name and shows in the header; designer and
   notes are in Edit's Project tab (reports/create-from-image-workflow).
   What the picture is, its background and fixes (CreatorPictureSections,
   below) are shown in Frame the picture (creator/FrameView.js) instead.

   Sidebar.js renders this in Convert (appMode "create" with a picture); a
   design drawn from scratch has the Canvas panel instead. Reads the Creator
   contexts. Concatenated into creator/bundle.js after Sidebar.js.
   Depends on: SliderRow, InfoIcon, Tooltip (components.js), context.js. */

(function () {
  // The steps, left to right. `next` is the step the Next button opens.
  var CONVERT_TABS = [
    { id: "size",    label: "Size",    icon: "ruler",    next: "threads", lead: "How big the pattern is, and the fabric it is stitched on." },
    { id: "threads", label: "Threads", icon: "palette",  next: "detail",  lead: "Which threads the colours are matched to, and how many." },
    { id: "detail",  label: "Detail",  icon: "sparkles", next: null,      lead: "How much shading and small detail to keep. Tidier charts are quicker to stitch." }
  ];
  var NEXT_LABELS = { size: "Size and fabric", threads: "Threads", detail: "Detail and tidiness" };
  window.CONVERT_TABS = CONVERT_TABS;

  // Hover text for each picture type.
  var PICTURE_TYPE_HINTS = {
    graphic: "A few flat colours: up to 8 threads, no shading or blends, and a plain border left unstitched.",
    photo: "Up to 24 threads and blends, with smooth shading tidied into patches.",
    pixel: "One stitch per pixel at the picture's own size, in its own colours. Every pixel is kept."
  };

  var h = React.createElement;
  // ── Building blocks: the Edit panel's sections, so both read the same ──
  function sec(id, title, info) {
    var kids = Array.prototype.slice.call(arguments, 3);
    return h("section", { key: id, className: "cs-toolsec cv-sec cv-sec--" + id, "data-cv-section": id },
      title ? h("div", { className: "cv-sec__head" },
        h("h3", { className: "cs-toolsec__title cv-sec__title" }, title),
        info ? h(InfoIcon, { label: title, text: info, width: 260 }) : null) : null,
      kids);
  }
  function hint(content, extra) {
    return h("p", Object.assign({ className: "cs-toolsec__hint" }, extra || {}), content);
  }
  function note(level, content, extra) {
    var icon = level === "danger" || level === "warning" ? window.Icons.warning() : window.Icons.info();
    return h("div", Object.assign({ role: "note", className: "cv-note cv-note--" + level }, extra || {}),
      h("span", { className: "cv-note__icon", "aria-hidden": "true" }, icon),
      h("span", null, content));
  }
  // A checkbox with its label; the hint icon sits outside the <label> so
  // pressing it never ticks the box.
  function check(o) {
    return h("div", { className: "convert-label cv-check" },
      h("label", { className: "cs-toolsec__check" + (o.disabled ? " cv-check--disabled" : "") },
        h("input", { type: "checkbox", checked: !!o.checked, disabled: !!o.disabled,
          onChange: function (e) { o.onChange(e.target.checked); } }),
        h("span", null, o.label)),
      o.info ? h(InfoIcon, { label: o.label, text: o.info, width: 260 }) : null);
  }
  // One choice from a row (or grid) of buttons; arrow keys move and choose.
  function seg(o) {
    var opts = o.options;
    var anyOn = opts.some(function (x) { return x.id === o.value && !x.disabled; });
    return h("div", { className: "lp-segmented cv-seg" + (o.className ? " " + o.className : ""), role: "radiogroup", "aria-label": o.label },
      opts.map(function (x, i) {
        var on = x.id === o.value;
        var enabled = opts.filter(function (y) { return !y.disabled; });
        var p = {
          key: x.id, type: "button", role: "radio", "aria-checked": on ? "true" : "false",
          className: "lp-seg" + (on ? " lp-seg--on" : ""), title: x.title, disabled: !!x.disabled,
          tabIndex: (on && !x.disabled) || (!anyOn && i === 0) ? 0 : -1,
          "data-seg-id": x.id,
          onClick: function () { if (!x.disabled) o.onChange(x.id); },
          onKeyDown: function (e) {
            var step = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            var at = enabled.indexOf(x);
            var next = enabled[(at + step + enabled.length) % enabled.length];
            o.onChange(next.id);
            var sib = e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector('[data-seg-id="' + next.id + '"]');
            if (sib) sib.focus();
          }
        };
        if (o.attr) p[o.attr] = x.id;
        return h("button", p, x.label);
      }));
  }


  // A warning when the chosen tidying is a lot for the pattern's size.
  function cleanupWarning(sW, sH, orphans, previewStats) {
    if (orphans === 0) return null;
    var area = sW * sH;
    if (area <= 900) {
      return { level: "danger", message: "Your pattern is very small (" + sW + "\xD7" + sH + "), so merging confetti stitches may remove fine details. Choose More detail, or make the pattern bigger." };
    }
    if (area <= 1600 && orphans >= 2) {
      return { level: "danger", message: "On a " + sW + "\xD7" + sH + " pattern this much tidying may lose eyes, lettering or thin lines. Choose More detail, or make the pattern bigger." };
    }
    if (area <= 2500 && orphans >= 3) {
      return { level: "warning", message: "On a " + sW + "\xD7" + sH + " pattern this much tidying may remove more detail than expected. Try Balanced or More detail." };
    }
    if (previewStats && previewStats.confettiSingles != null && previewStats.confettiCleanSingles != null) {
      var removed = previewStats.confettiSingles - previewStats.confettiCleanSingles;
      var pctRemoved = removed / Math.max(1, previewStats.stitchable) * 100;
      if (pctRemoved > 20) {
        return { level: "danger", message: "Reducing confetti would remove ~" + removed.toLocaleString() + " stitches (" + pctRemoved.toFixed(0) + "% of the pattern). This will likely cause visible detail loss. Try a step towards More detail." };
      }
      if (pctRemoved > 10) {
        return { level: "warning", message: "Reducing confetti would remove ~" + removed.toLocaleString() + " stitches (" + pctRemoved.toFixed(0) + "% of the pattern). Check the preview to make sure you’re happy with the result." };
      }
    }
    return null;
  }
  window.convertCleanupWarning = cleanupWarning;

  // What the footer says about an existing chart (state from
  // useCreatorState convertChartState; edits from the undo history).
  function chartStateText(state, editCount) {
    var edits = editCount > 0 ? " and its " + editCount + " edit" + (editCount === 1 ? "" : "s") : "";
    if (state === "changed") return "The preview shows new settings. Regenerate to replace your chart" + edits + ".";
    if (state === "unknown") return "Regenerate replaces your chart with one made from these settings.";
    if (state === "same") return editCount > 0
      ? "Your chart was made with these settings, then edited. Regenerate starts again from the picture."
      : "Your chart was made with these settings.";
    return null;
  }
  window.convertChartStateText = chartStateText;

  // What the picture is, its background and fixes to the picture itself:
  // Frame the picture's settings (creator/FrameView.js), shown once there.
  // Choosing a type starts the pattern from that type's settings; the type
  // does not change to Custom when one of them is changed afterwards.
  window.CreatorPictureSections = function CreatorPictureSections() {
    var gen = window.useGeneration();
    var Icons = window.Icons;
    var pictureType = (gen.img && gen.img.src && gen.applyPicturePreset && window.PICTURE_PRESET_ORDER) ? sec("picture-type", "Picture type",
      "Picks good starting values for the picture. Graphic or logo: a few flat colours, no shading. Photo: up to 24 threads with smooth shading. Pixel art: one stitch per pixel, every pixel kept. The Creator guesses when you add a picture. Choosing a type starts the threads and detail from its settings; changing them afterwards keeps the type.",
      seg({ label: "What kind of picture is this?", attr: "data-picture-type", className: "cv-seg--wrap", value: gen.pictureType,
        onChange: function (id) { gen.applyPicturePreset(id); },
        options: window.PICTURE_PRESET_ORDER.map(function (id) {
          return { id: id, label: window.PICTURE_PRESETS[id].label, title: PICTURE_TYPE_HINTS[id] };
        }) }),
      hint(!gen.pictureType
        ? "No type chosen: your Preferences defaults are used. Choose one to start from its settings."
        : (PICTURE_TYPE_HINTS[gen.pictureType] || "") + " Choosing a type starts the threads and detail from its settings; you can change them later."),
      // Exact import is a Pixel art option, so it shows for pixel art (or while on).
      (gen.stitchStyleBasis === "pixel" || gen.exactPixelArt) && h("div", { className: "picture-type__exact" },
        check({ checked: gen.exactPixelArt, label: "Exact pixel-art import",
          disabled: (gen.img.naturalWidth || gen.img.width) > 500 || (gen.img.naturalHeight || gen.img.height) > 500,
          onChange: function (v) { gen.setExactPixelArt(v); },
          info: "Turns each pixel into exactly one stitch at the picture's own size, matched to the nearest solid thread. For pixel art up to 500 by 500 pixels. Size, adjustments, shading and tidying are skipped." }),
        hint(gen.exactPixelArt
          ? "One source pixel per stitch. Source alpha below 128 is empty; other pixels are stitched. Size, image adjustments, background removal, colour limit, blends, shading and tidying are ignored. Review source-to-thread mappings in the preview before Generate."
          : "One stitch per pixel, exactly: for pictures up to 500 by 500 pixels. Colours are mapped to solid threads.")),
      hint("Convert matches thread colours to a photograph or artwork. It does not read the symbols or key in a photograph of a printed chart.", { className: "cs-toolsec__hint cv-hint--muted" })
    ) : null;

    function armBgPick() {
      gen.setPickBg(true);
      // Bring the picture into view so it is clear where to click.
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            var el = document.getElementById("bg-pick-target");
            if (el && el.scrollIntoView) {
              try { var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); }
              catch (_) { el.scrollIntoView(); }
            }
          });
        });
      }
    }
    var background = sec("background", "Background",
      "Leaves a plain background unstitched, so the fabric shows through. Only areas of the chosen colour that touch the picture's edge are left out, so the same colour inside the picture is kept. Pick the colour from the picture, then set how close a match counts.",
      check({ checked: gen.skipBg, label: "Leave background unstitched",
        onChange: function (on) {
          gen.setSkipBg(on);
          // The first time it is turned on with no colour chosen, start picking.
          var isDefaultWhite = gen.bgCol[0] === 255 && gen.bgCol[1] === 255 && gen.bgCol[2] === 255;
          if (on && isDefaultWhite) armBgPick();
          else if (!on && gen.pickBg) gen.setPickBg(false);
        } }),
      gen.skipBg ? h(React.Fragment, null,
        h("div", { className: "cv-bgpick" },
          h("button", { type: "button", className: "cv-bgpick__swatch", onClick: armBgPick,
            "aria-label": "Background colour: pick it from the picture",
            style: { background: "rgb(" + gen.bgCol + ")", "--swatch": "rgb(" + gen.bgCol + ")" } }),
          h("button", { type: "button", className: "cs-seltools__btn" + (gen.pickBg ? " cs-seltools__btn--on" : ""), onClick: armBgPick, "aria-pressed": gen.pickBg ? "true" : "false" },
            Icons.eyedropper(), h("span", null, gen.pickBg ? "Click the picture…" : "Pick from picture"))),
        h(SliderRow, { label: "How close a match", value: gen.bgTh, min: 3, max: 50, onChange: gen.setBgTh,
          helpText: "How closely a pixel must match the background colour to be left unstitched. Higher leaves out more." }),
        hint(gen.convertStage === "frame" && !gen.exactPixelArt
          ? "Only plain areas that touch the picture's edge are left unstitched. They are striped on the picture, so you can see what will be left out. Pale parts of the subject that touch a pale background can go with it: lower How close a match if they do."
          : "Only plain areas that touch the picture's edge are left unstitched. Pale parts of the subject that touch a pale background can go with it: check the preview, and lower How close a match if they do.")
      ) : hint("Off: every pixel is stitched, background included.")
    );

    var adjusted = !!(gen.bri || gen.con || gen.sat || gen.smooth || gen.preSharpen);
    // Folded away under "Fix the picture": most pictures need none of these.
    var adjust = sec("adjust", null, null,
      hint("Changes the picture before threads are matched. Most pictures need none of these. Brightness, contrast and saturation show on the picture straight away; sharpening and softening show in the preview."),
      h(SliderRow, { label: "Brightness", value: gen.bri, min: -50, max: 50, onChange: gen.setBri, format: function (v) { return (v > 0 ? "+" : "") + v + "%"; },
        helpText: "Lightens or darkens the picture before threads are chosen. Try it when a photo is too dark or washed out." }),
      h(SliderRow, { label: "Contrast", value: gen.con, min: -50, max: 50, onChange: gen.setCon, format: function (v) { return (v > 0 ? "+" : "") + v + "%"; },
        helpText: "Pushes the lights and darks further apart, or closer together. More contrast gives a crisper, bolder chart; less gives a softer one." }),
      h(SliderRow, { label: "Saturation", value: gen.sat, min: -50, max: 50, onChange: gen.setSat, format: function (v) { return (v > 0 ? "+" : "") + v + "%"; },
        helpText: "Makes the colours more vivid, or more muted, before threads are chosen." }),
      check({ checked: gen.preSharpen, label: "Sharpen details", onChange: function (v) { gen.setPreSharpen(v); },
        info: "Shrinking a picture to stitches blurs its edges: a stitch on an edge comes out between the colours either side. Sharpen details gives that stitch the colour of the side it is closer to, so outlines, eyes and lettering are crisper. It only uses colours already beside each stitch, and the threads are chosen before it sharpens." }),
      gen.preSharpen && h(SliderRow, { label: "Amount", value: Math.min(1, gen.preSharpenAmount != null ? gen.preSharpenAmount : 0.5), min: 0.1, max: 1, step: 0.1,
        onChange: gen.setPreSharpenAmount, format: function (v) { return Math.round(v * 100) + "%"; },
        helpText: "How readily an edge stitch takes a side. Low: only stitches that are nearly one colour already. High: almost every stitch on an edge.",
        inlineHint: "50% suits most pictures. Higher gives crisper edges, but can make soft shading steppy.", helpTopic: "image" }),
      h(SliderRow, { label: "Soften grainy photos", value: gen.smooth, min: 0, max: 4, step: 0.1, onChange: gen.setSmooth,
        format: function (v) { return v === 0 ? "Off" : v.toFixed(1); },
        helpText: "Blurs the picture slightly before threads are chosen: fewer speckled stitches, but softer edges and outlines. Most photos look best at Off.",
        inlineHint: "Blurs the picture at stitch size before threads are matched. Shrinking a photo to stitches already smooths away grain, so most photos look best at Off.",
        helpTopic: "image" }),
      gen.smooth > 0 && h("details", { className: "convert-advanced" },
        h("summary", null, "Advanced"),
        seg({ label: "Softening method", value: gen.smoothType, onChange: function (id) { gen.setSmoothType(id); },
          options: [
            { id: "median", label: "Median", title: "Keeps edges better. Best for most photos." },
            { id: "gaussian", label: "Gaussian", title: "Stronger overall blur. For very grainy or pixelated pictures." } // terminology-lint-allow
          ] })),
      adjusted ? h("button", { type: "button", className: "cs-seltools__btn cv-reset", onClick: function () {
        gen.setBri(0); gen.setCon(0); gen.setSat(0); gen.setSmooth(0); gen.setPreSharpen(false);
      } }, Icons.undo(), h("span", null, "Reset adjustments")) : null
    );

    var adjustOpen = adjusted || undefined;
    return h(React.Fragment, null, pictureType, background,
      h("details", { className: "cv-fix", open: adjustOpen, "data-cv-fix": "" },
        h("summary", null, "Fix the picture", adjusted ? h("span", { className: "cv-fix__on" }, " (changed)") : null),
        adjust));
  };

  // The way from a picture to a pattern, as numbered steps across the top of
  // Frame and Convert: Frame, then Convert's Size, Threads and Detail, then
  // Generate. The step on screen is marked, steps already opened are ticked,
  // and each one (but Generate) opens that step. On phones a Convert step
  // opens the settings sheet on it.
  window.CreatorConvertProgress = function CreatorConvertProgress() {
    var app = window.useApp();
    var gen = window.useGeneration();
    var h = React.createElement;
    var Icons = window.Icons || {};
    var compact = typeof window.useCreatorCompact === "function" ? window.useCreatorCompact() : false;
    if (!gen.img || !gen.img.src) return null;
    var framing = gen.convertStage === "frame";
    var seen = app.convertSeen || {};
    var tab = app.convertTab;
    var steps = [{ id: "frame", label: "Frame" }].concat(CONVERT_TABS.map(function (t) { return { id: t.id, label: t.label }; }))
      .concat([{ id: "generate", label: gen.hasGenerated ? "Regenerate" : "Generate" }]);
    function stateOf(id) {
      if (id === "frame") return framing ? "current" : seen.frame ? "done" : "todo";
      if (id === "generate") return gen.hasGenerated ? "done" : "todo";
      if (!framing && id === tab) return "current";
      return seen[id] ? "done" : "todo";
    }
    function open(id) {
      if (id === "frame") { gen.setConvertStage("frame"); return; }
      // From Frame: Continue (which applies a crop still drawn), then the step.
      if (framing) window.dispatchEvent(new CustomEvent("cs:frameContinue"));
      if (app.setConvertTab) app.setConvertTab(id);
      if (compact && app.setPanelOpen) app.setPanelOpen(true);
    }
    var currentIndex = 0;
    steps.forEach(function (s, i) { if (stateOf(s.id) === "current") currentIndex = i; });
    return h("nav", { className: "cv-progress", "aria-label": "Steps to your pattern", "data-convert-progress": "" },
      h("ol", { className: "cv-progress__list" },
        steps.map(function (s, i) {
          var st = stateOf(s.id);
          var mark = st === "done" && Icons.check ? Icons.check() : h("span", null, i + 1);
          var inner = h(React.Fragment, null,
            h("span", { className: "cv-progress__mark", "aria-hidden": "true" }, mark),
            h("span", { className: "cv-progress__label" }, s.label),
            st === "done" ? h("span", { className: "tracker-sr-only" }, " (done)") : null);
          var clickable = s.id !== "generate" && st !== "current";
          return h("li", { key: s.id, className: "cv-progress__step cv-progress__step--" + st, "data-step": s.id, "data-step-state": st },
            clickable
              ? h("button", { type: "button", className: "cv-progress__btn", onClick: function () { open(s.id); },
                  title: s.id === "frame" ? "Back to Frame the picture" : "Open " + s.label }, inner)
              : h("span", { className: "cv-progress__btn", "aria-current": st === "current" ? "step" : undefined,
                  title: s.id === "generate" ? (gen.hasGenerated ? "Your pattern is made; Regenerate makes it again with new settings" : "Generate makes the pattern, at the foot of the settings") : undefined }, inner));
        })),
      h("span", { className: "cv-progress__count" }, "Step " + (currentIndex + 1) + " of " + steps.length));
  };

  window.CreatorConvertPanel = function CreatorConvertPanel(props) {
    var ctx = window.usePatternData();
    var cv = window.useCanvas();
    var app = window.useApp();
    var gen = window.useGeneration();
    var h = React.createElement;
    var Icons = window.Icons;
    var contentRef = React.useRef(null);
    var _stashExp = React.useState(false); var stashStripExpanded = _stashExp[0], setStashStripExpanded = _stashExp[1];
    var _qaVal = React.useState(""); var qaVal = _qaVal[0], setQaVal = _qaVal[1];
    var _qaLoad = React.useState(false); var qaLoading = _qaLoad[0], setQaLoading = _qaLoad[1];
    var _seedEd = React.useState(false); var seedEditing = _seedEd[0], setSeedEditing = _seedEd[1];
    var _seedTmp = React.useState(""); var seedTmp = _seedTmp[0], setSeedTmp = _seedTmp[1];

    var tab = app.convertTab;
    if (!CONVERT_TABS.some(function (t) { return t.id === tab; })) tab = "size";
    var tabMeta = CONVERT_TABS.filter(function (t) { return t.id === tab; })[0];
    function pickTab(id) { if (app.setConvertTab) app.setConvertTab(id); }
    // A new step starts at its top.
    React.useEffect(function () { if (contentRef.current) contentRef.current.scrollTop = 0; }, [tab]);

    var brandLabel = window.threadBrandLabel ? window.threadBrandLabel(gen.convertBrand) : "DMC";
    var ps = app.previewStats;

    // ═══ Size ══════════════════════════════════════════════════════════════
    var sizeSec = sec("size", null, null,
      window.CreatorSizeField ? h(window.CreatorSizeField, {
        sW: ctx.sW, sH: ctx.sH, chgW: ctx.chgW, chgH: ctx.chgH, arLock: ctx.arLock, setArLock: ctx.setArLock, ar: ctx.ar,
        fabricCt: ctx.fabricCt, origW: gen.origW, origH: gen.origH
      }) : null,
      hint("Between 10 and 500 stitches each way."),
      (ctx.sW > 250 || ctx.sH > 250) && note("info", "Large pattern: 15 to 25 threads keep generation fast and the result clean.")
    );
    var fabricSec = sec("fabric", null, null,
      h(window.CreatorFabricBlock, {
        fabricCt: ctx.fabricCt, setFabricCt: ctx.setFabricCt,
        fabricColour: app.fabricColour, setFabricColour: app.setFabricColour,
        sW: ctx.sW, sH: ctx.sH
      }),
      hint("Skein estimates assume 2 strands and 8 m per skein.")
    );

    // ═══ Threads ═══════════════════════════════════════════════════════════
    var brandSec = (gen.setConvertBrand && window.THREAD_BRANDS) ? sec("brand", "Thread brand",
      "Which brand of stranded cotton the colours are matched to. The key, shopping list, Stitch Tracker and printed chart all use that brand's numbers.",
      seg({ label: "Threads", attr: "data-thread-brand", value: gen.convertBrand, onChange: function (id) { gen.setConvertBrand(id); },
        options: Object.keys(window.THREAD_BRANDS).map(function (id) { return { id: id, label: window.THREAD_BRANDS[id].label }; }) }),
      hint("Colours are matched to " + brandLabel + " stranded cotton.")
    ) : null;

    var used = ps && !app.previewLoading && ps.threadsUsed != null ? ps.threadsUsed : null;
    var countSec = sec("count", "Number of threads", null,
      h(SliderRow, { label: "Threads (max)", value: gen.maxC, min: 2, max: gen.stashConstrained && gen.stashThreadCount ? Math.max(2, gen.stashThreadCount) : 100, onChange: gen.setMaxC,
        helpText: "Each thread is one colour of stranded cotton. This is the most the pattern may use. It is a limit, not a target: simpler pictures use fewer. Fewer threads means less to buy and a calmer chart.",
        inlineHint: "A blend uses two of these threads in one stitch, so the chart can have more symbols than threads.",
        helpTopic: "palette" }),
      // !! so an empty stash (0) renders nothing, not a stray "0".
      !!(gen.stashConstrained && gen.stashThreadCount && gen.maxC > gen.stashThreadCount) && hint("Limited to " + gen.stashThreadCount + ", the threads in your stash."),
      used != null
        ? hint("In the preview: " + used + " thread" + (used === 1 ? "" : "s") + " and " + ps.uniqueColors + " chart symbol" + (ps.uniqueColors === 1 ? "" : "s") + "; " + (ps.blendsUsed || 0) + " blends, " + (ps.blendPct || 0) + "% of stitches. " + (ps.estimated ? "Counts are approximate." : ""), { "data-threads-used": "" })
        : hint("A limit, not a target: simpler pictures use fewer.")
    );

    // Colours to keep: threads picked from the picture that are always in the
    // pattern (useCreatorState addKeepColourAt; quantizeConstrained's reserved).
    var kept = gen.keepColours || [];
    var keptOff = gen.keepUnavailable || [];
    var keptLabel = function (k) { return brandLabel + " " + k.id + (k.name ? " " + k.name : ""); };
    var keepSec = gen.setPickKeep && !gen.exactPixelArt ? sec("keep", "Colours to keep",
      "Makes sure a colour gets a thread of its own, such as skin, eyes or a logo's colour. Threads go to the biggest areas of the picture first, so a small face can come out in the background's colours.",
      h("div", { className: "cv-keep" },
        kept.map(function (k) {
          var off = keptOff.indexOf(k.id) >= 0;
          return h("span", { key: k.id, className: "cv-keep__chip" + (off ? " cv-keep__chip--off" : ""), "data-keep-id": k.id },
            h("span", { className: "cv-keep__swatch", style: { background: "rgb(" + k.rgb.join(",") + ")" }, "aria-hidden": "true" }),
            h("span", { className: "cv-keep__name" }, keptLabel(k)),
            h("button", { type: "button", className: "cv-keep__remove", "aria-label": "Stop keeping " + keptLabel(k), title: "Stop keeping",
              onClick: function () { gen.removeKeepColour(k.id); } }, Icons.x()));
        }),
        h("button", { type: "button", className: "cs-seltools__btn" + (gen.pickKeep ? " cs-seltools__btn--on" : ""), "aria-pressed": gen.pickKeep ? "true" : "false",
          onClick: function () {
            var on = !gen.pickKeep;
            gen.setPickKeep(on);
            // Bring the preview, where the picking happens, into view.
            if (on && typeof window !== "undefined" && window.requestAnimationFrame) {
              window.requestAnimationFrame(function () {
                window.requestAnimationFrame(function () {
                  var el = document.querySelector('[data-testid="cvp-pick"]');
                  if (el && el.scrollIntoView) {
                    try { var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" }); }
                    catch (_) { el.scrollIntoView(); }
                  }
                });
              });
            }
          } },
          Icons.eyedropper(), h("span", null, gen.pickKeep ? "Click a colour in the preview…" : "Pick from picture"))
      ),
      hint(gen.pickKeep
        ? "The preview shows your picture at stitch size. Click the colour to keep; Esc cancels."
        : kept.length ? "Kept threads are always in the pattern and count towards Threads (max)." : "None yet: the threads follow the picture's biggest areas."),
      keptOff.length ? note("info", kept.filter(function (k) { return keptOff.indexOf(k.id) >= 0; }).map(keptLabel).join(", ") +
        (keptOff.length === 1 ? " isn't" : " aren't") + " among the threads this pattern can use, so " + (keptOff.length === 1 ? "it isn't" : "they aren't") + " kept. Pick again to keep the nearest available thread.") : null
    ) : null;

    var blendSec = sec("blends", "Blends", null,
      check({ checked: gen.effectiveAllowBlends, disabled: gen.blendsAutoDisabled, label: "Allow two-thread blends",
        onChange: function (v) { gen.setAllowBlends(v); },
        info: "A blend puts one strand of each of two " + brandLabel + " threads in the needle to make an in-between shade, for smoother gradients." }),
      hint(gen.effectiveAllowBlends
        ? "On: smoother shading, but more chart symbols to follow and two threads in some needles."
        : "Off: every stitch is one thread, so there are fewer symbols, but shading is coarser.", { className: "cs-toolsec__hint convert-blend-effect" }),
      gen.effectiveAllowBlends && h(SliderRow, { label: "Blend recipes (max)", value: gen.maxBlends, min: 0, max: 100, step: 1,
        onChange: gen.setMaxBlends, helpText: "Limits extra two-thread combinations, independently of threads to buy. Default 12. Conversion keeps useful blends with fewer confetti stitches and stays within the printed symbol limit. Manual palette additions are not removed." }),
      window.BlendHelpNote && h(window.BlendHelpNote, { showSetting: false }),
      gen.blendsAutoDisabled && hint("Turned off: your stash has fewer than 2 threads.")
    );

    var rareSec = sec("rare", "Rare colours", null,
      h(SliderRow, { label: "Min stitches per colour", value: gen.minSt, min: 0, max: 500, step: 5, onChange: gen.setMinSt,
        format: function (v) { return v === 0 ? "Off" : v; },
        helpText: "Colours used fewer times than this are merged into a similar neighbour, so there are fewer threads to buy. Off still folds away stray colours automatically, keeping small bright accents.",
        inlineHint: "Merges every colour used fewer times than this into a similar neighbour, reducing your thread count.",
        helpTopic: "palette" }),
      hint(gen.minSt === 0 ? "Off still folds away stray colours, and keeps small bright accents." : "Colours used fewer than " + gen.minSt + " times merge into a similar neighbour.")
    );

    // The stash comes first: it limits the thread count and blends below.
    // Its tools (the threads, adding one, variations) follow the settings.
    // With nothing in the stash the choice can't work: say so, and where to
    // add threads, instead of letting Generate stop on it.
    var stashEmpty = gen.ownedThreadCount === 0;
    var stashLink = h("a", { href: "manager.html", target: "_blank", rel: "noopener", className: "cv-link" }, "Stash Manager");
    var stashSec = (typeof StashBridge !== "undefined") ? sec("stash", "Stash", null,
      check({ checked: gen.stashConstrained, label: "Use only stash threads", onChange: function (v) { gen.setStashConstrained(v); },
        disabled: stashEmpty && !gen.stashConstrained,
        info: "Constrains the palette to the " + brandLabel + " threads you own. Produces a pattern you can stitch immediately without buying anything." }),
      stashEmpty && !gen.stashConstrained && hint(h(React.Fragment, null, "You haven't recorded any " + brandLabel + " threads you own yet. Add them in the ", stashLink, " to make a pattern only from them."), { className: "cs-toolsec__hint", "data-stash-empty": "" }),
      stashEmpty && gen.stashConstrained && note("warning", h(React.Fragment, null, "Your stash has no " + brandLabel + " threads, so Generate can't use only stash threads. Turn this off, or add the threads you own in the ", stashLink, "."), { "data-stash-empty": "" }),
      !stashEmpty && !gen.stashConstrained && hint("Turn on to make the pattern only from threads you already own."),
      gen.stashConstrained && !stashEmpty && h(React.Fragment, null,
        note("info", (gen.stashThreadCount || 0) + " thread" + ((gen.stashThreadCount || 0) !== 1 ? "s" : "") + " in your stash" +
          (gen.effectiveMaxC && gen.effectiveMaxC < gen.maxC ? "; the pattern may use up to " + gen.effectiveMaxC + "." : ".")),
        gen.coverageGaps && gen.coverageGaps.hasGaps && note("warning", h(React.Fragment, null, "Your stash may lack colours in: ",
          gen.coverageGaps.gaps.map(function (g, i) {
            return h("span", { key: g.hue }, (i > 0 ? ", " : ""), h("strong", null, g.hue), g.severity === "high" ? " (significant)" : "");
          }))))
    ) : null;

    var stashToolsSec = (typeof StashBridge !== "undefined" && gen.stashConstrained) ? sec("stash-tools", "Your stash threads", null,
        gen.stashPalette && gen.stashPalette.length > 0 && h("div", { className: "cv-stash-strip" },
          h("div", { className: "cv-stash-strip__chips" },
            (stashStripExpanded ? gen.stashPalette : gen.stashPalette.slice(0, 60)).map(function (t) {
              var label = formatThread({ id: t.id, name: t.name, brand: gen.convertBrand });
              return h(Tooltip, { key: t.id, text: label, width: 180 },
                h("span", { className: "cv-stash-strip__chip", role: "img", "aria-label": label, style: { background: "rgb(" + t.rgb.join(",") + ")" } }));
            })),
          gen.stashPalette.length > 60 && h("button", { type: "button", className: "cv-link", onClick: function () { setStashStripExpanded(function (o) { return !o; }); } },
            stashStripExpanded ? "Show fewer" : "Show " + (gen.stashPalette.length - 60) + " more")),
        h("div", { className: "cv-quickadd" },
          h("label", { className: "cv-field__label", htmlFor: "cv-quickadd" }, "Add a thread to your stash"),
          h("div", { className: "cv-quickadd__row" },
            h("input", { id: "cv-quickadd", type: "text", className: "cv-input", value: qaVal,
              placeholder: brandLabel + " number…", onChange: function (e) { setQaVal(e.target.value); } }),
            (function () {
              var found = findThreadInCatalog(gen.convertBrand || "dmc", qaVal.trim());
              return found ? h(Tooltip, { text: formatThread({ id: found.id, name: found.name, brand: gen.convertBrand }), width: 160 },
                h("span", { className: "cv-quickadd__swatch", style: { background: "rgb(" + found.rgb.join(",") + ")" } })) : null;
            })(),
            h("button", { type: "button", className: "cs-seltools__btn",
              disabled: qaLoading || !findThreadInCatalog(gen.convertBrand || "dmc", qaVal.trim()),
              onClick: function () {
                var trimmed = qaVal.trim(), qaBrand = gen.convertBrand || "dmc";
                if (!trimmed || !findThreadInCatalog(qaBrand, trimmed)) return;
                var qaKey = qaBrand + ":" + trimmed;
                setQaLoading(true);
                StashBridge.addToStash(qaKey, 1).then(function () {
                  setQaVal(""); setQaLoading(false);
                  ctx.setGlobalStash(function (s) {
                    var n = Object.assign({}, s);
                    n[qaKey] = Object.assign({}, n[qaKey] || {}, { owned: ((n[qaKey] && n[qaKey].owned) || 0) + 1 });
                    return n;
                  });
                }).catch(function () { setQaLoading(false); });
              } }, qaLoading ? "Adding…" : h(React.Fragment, null, Icons.plus(), h("span", null, "Add"))))),
        // Variations: other picks of threads from the stash.
        h("div", { className: "cv-variations" },
          h("div", { className: "cv-variations__row" },
            h("button", { type: "button", className: "cs-seltools__btn", onClick: function () { gen.randomise(); },
              disabled: !(gen.stashPalette && gen.stashPalette.length > 0) || !gen.img },
              Icons.shuffle(), h("span", null, "Randomise")),
            gen.variationSeed ? (seedEditing
              ? h("input", { type: "number", className: "cv-input cv-input--seed", value: seedTmp, autoFocus: true, "aria-label": "Variation number",
                  onChange: function (e) { setSeedTmp(e.target.value); },
                  onKeyDown: function (e) {
                    if (e.key === "Enter") { var n = parseInt(seedTmp, 10); if (!isNaN(n) && n > 0) gen.applyVariationSeed(n >>> 0); setSeedEditing(false); }
                    else if (e.key === "Escape") setSeedEditing(false);
                  },
                  onBlur: function () { setSeedEditing(false); } })
              : h("button", { type: "button", className: "cv-link", title: "Enter a variation number",
                  onClick: function () { setSeedEditing(true); setSeedTmp(String(gen.variationSeed)); } }, "#" + gen.variationSeed)) : null),
          gen.variationSeed && gen.variationSubset && gen.stashPalette && gen.stashPalette.length >= 3 &&
            hint(h(React.Fragment, null, Icons.dice(), " Using " + gen.variationSubset.length + " of " + gen.stashPalette.length + " threads")),
          h("button", { type: "button", className: "cv-link cv-disclosure", "aria-expanded": gen.galleryOpen ? "true" : "false",
            onClick: function () { gen.setGalleryOpen(function (o) { return !o; }); if (!gen.galleryOpen) gen.generateGallery(); } },
            h("span", { className: "cv-disclosure__chev", "aria-hidden": "true" }, Icons.chevronRight()), "Explore variations"),
          gen.galleryOpen && h("div", { className: "cv-gallery" },
            h("div", { className: "cv-gallery__grid" },
              gen.gallerySlots.map(function (slot, i) {
                var ready = !slot.loading && slot.url;
                return h("button", { key: i, type: "button", className: "cv-gallery__slot", disabled: !ready,
                  onClick: function () { if (ready) { gen.promoteVariation(slot); gen.setGalleryOpen(false); } } },
                  slot.loading ? h("span", { className: "cv-gallery__wait" }, "…")
                    : slot.url ? h(React.Fragment, null,
                        h("img", { src: slot.url, alt: "" }),
                        h("span", { className: "cv-gallery__cap" }, "#" + slot.seed + " · " + slot.threadCount + " threads"))
                    : h("span", { className: "cv-gallery__wait" }, "Could not make this one"));
              })),
            h("button", { type: "button", className: "cs-seltools__btn", onClick: function () { gen.generateGallery(); } }, "New batch")),
          gen.variationHistory.length > 0 && h("div", { className: "cv-history" },
            hint("Recent variations"),
            h("div", { className: "cv-history__row" },
              gen.variationHistory.map(function (entry, i) {
                return h("button", { key: (entry.timestamp || i) + "-" + i, type: "button", className: "cv-history__item",
                  title: "Variation #" + entry.seed,
                  onClick: function () { gen.applyVariationSeed(entry.seed, entry.subset !== undefined ? entry.subset : null); } },
                  entry.previewUrl ? h("img", { src: entry.previewUrl, alt: "" }) : h("span", { className: "cv-history__blank" }),
                  h("span", null, "#" + entry.seed));
              })))
        )
    ) : null;

    // ═══ Detail ════════════════════════════════════════════════════════════
    var sc2 = gen.stitchCleanup;
    var styleNow = gen.stitchStyle || "custom";
    var styleBasis = gen.stitchStyleBasis || "photo";
    var styleDescs = (window.STITCH_STYLE_DESCRIPTIONS || {})[styleBasis] || {};
    // The finished chart's count (after look-alike separation and the thread limit).
    var confettiNow = ps ? (ps.confettiFinalSingles != null ? ps.confettiFinalSingles
      : ps.confettiCleanSingles != null ? ps.confettiCleanSingles : ps.confettiSingles) : null;
    var warning = sc2.enabled ? cleanupWarning(ctx.sW, ctx.sH, gen.orphans, ps) : null;
    var stepsSec = sec("style", "Detail and tidiness",
      "More detail keeps every shade and small shape, with the most confetti stitches (single stitches of a colour on their own; slow to stitch). Balanced merges most of them and keeps outlines. Tidier merges nearly all. Easiest to stitch gives big blocks of colour.",
      seg({ label: "Detail and tidiness", attr: "data-stitch-style", className: "cv-seg--grid stitch-style__seg", value: styleNow,
        onChange: function (id) { gen.applyStitchStyle(id); },
        options: (window.STITCH_STYLE_ORDER || []).map(function (id) { return { id: id, label: window.STITCH_STYLE_LABELS[id], title: styleDescs[id] }; }) }),
      h("p", { className: "stitch-style__desc" }, styleNow === "custom"
        ? "Custom: your own mix of shading and tidying, set below. Pick a step to start again from it."
        : styleDescs[styleNow]),
      // The count is for the preview on screen: while a new one is worked out
      // it would be the previous step's, so it waits.
      app.previewLoading && ps ? h("p", { className: "stitch-style__outcome", "data-outcome": "updating", "aria-live": "polite" }, "Updating preview…")
        : confettiNow != null && ps.stitchable > 0 && h("p", { className: "stitch-style__outcome", "data-outcome": ps.estimated ? "estimate" : "count", "aria-live": "polite" },
          "In the preview: " + (ps.estimated ? "about " : "") + confettiNow.toLocaleString() + " confetti stitch" + (confettiNow === 1 ? "" : "es") +
          " (" + (confettiNow / ps.stitchable * 100).toFixed(1) + "% of stitches)" + (ps.estimated ? ", estimated from a smaller preview." : ".")),
      // A small grid with heavy tidying can lose eyes and lettering.
      warning && note(warning.level, warning.message)
    );

    var dithCur = gen.dithMode || (gen.dith ? "balanced" : "off");
    var dithAlgo = dithCur === "off" ? "off" : dithCur.indexOf("bayer") === 0 ? "bayer" : "atkinson";
    var shadingSec = sec("shading", "Shading pattern",
      "Mixes colours across neighbouring stitches. This is separate from two-thread blends in one needle. None gives the tidiest chart; more shading means more confetti stitches.",
      hint("The steps above set this and the controls below; changing one here shows Custom."),
      seg({ label: "Shading pattern", value: dithAlgo, onChange: function (algo) {
          if (algo === "off") gen.setDith("off");
          else if (algo === "atkinson" && dithAlgo !== "atkinson") gen.setDith("balanced");
          else if (algo === "bayer" && dithAlgo !== "bayer") gen.setDith("bayer4");
        },
        options: [
          { id: "off", label: "None", title: "Each stitch takes its closest thread or enabled two-thread blend. The tidiest chart and the easiest to stitch." },
          { id: "atkinson", label: "Smooth shading", title: "Mixes neighbouring threads so gradients look smooth, keeping colours in tidy patches. Suits photos." },
          { id: "bayer", label: "Regular pattern", title: "Mixes threads in a regular, repeating pattern. Suits graphics and pixel-style pictures; on a photo it adds many confetti stitches." }
        ] }),
      dithAlgo === "atkinson" && seg({ label: "Smooth shading strength", className: "cv-seg--sub", value: dithCur, onChange: function (id) { gen.setDith(id); },
        options: [{ id: "weak", label: "Subtle", title: "Light blending, with very few confetti stitches." }, { id: "balanced", label: "Balanced", title: "Smoother gradients, with more confetti stitches." }] }),
      dithAlgo === "bayer" && seg({ label: "Pattern size", className: "cv-seg--sub", value: dithCur, onChange: function (id) { gen.setDith(id); },
        options: [{ id: "bayer2", label: "Coarse", title: "A bold, chequered pattern." }, { id: "bayer4", label: "Medium", title: "A balanced, regular pattern." }, { id: "bayer8", label: "Fine", title: "A fine, detailed pattern." }] }),
      h("details", { className: "convert-advanced" },
        h("summary", null, "Advanced"),
        h("p", null, "Smooth shading is Atkinson error diffusion at 50% (Subtle) or 100% (Balanced) strength. Regular pattern is ordered Bayer dithering with a 2×2 (Coarse), 4×4 (Medium) or 8×8 (Fine) matrix.")) // terminology-lint-allow
    );

    var tidied = ps && ps.tidiedStitches != null ? ps.tidiedStitches : null;
    var orphanDesc = null;
    if (sc2.enabled && gen.orphans > 0) {
      orphanDesc = gen.orphans === 1
        ? "Merges confetti stitches, stitches with no same-colour neighbour, into the colour around them. In plain areas, groups of up to 3."
        : gen.orphans === 2
          ? "Merges groups of up to 2 stitches cut off from their colour, and up to 6 in plain areas."
          : "Merges groups of up to 3 stitches cut off from their colour, and up to 9 in plain areas.";
    }
    // Graphics and pixel art also fold blurry edge shades; photos don't
    // (stitchCleanup.foldEdgeShades, useCreatorState.js). Unset folds.
    var foldsEdges = sc2.foldEdgeShades !== false;
    var cleanupOn = !sc2.enabled ? "Off: no tidying. Colours used by only a few stitches still merge into a neighbouring colour, and Threads (max) still applies."
      : foldsEdges ? (gen.orphans > 0 ? "Merges confetti stitches and folds blurry in-between shades along edges into the colours either side." : "Folds blurry in-between shades along edges into the colours either side. Reduce confetti is Off.")
      : (gen.orphans > 0 ? "Merges confetti stitches into the colour around them." : "Nothing is tidied while Reduce confetti is Off.");
    var tidySec = sec("tidying", "Tidying", null,
      check({ checked: sc2.enabled, label: "Stitch Cleanup",
        onChange: function (v) { gen.setStitchCleanup(function (s) { return Object.assign({}, s, { enabled: v }); }); },
        info: "Tidies the chart after colours are matched: confetti stitches (single stitches of a colour on their own) merge into the colour around them" +
          (foldsEdges ? ", and blurry in-between shades along edges fold into the colours either side." : ". Photos keep their in-between shades, which are part of the shading.") +
          " On or off, a colour used by only a few stitches merges into a neighbouring colour unless it stands out (such as a catchlight), and Threads (max) still applies." }),
      hint(cleanupOn),
      sc2.enabled && h(React.Fragment, null,
        h(SliderRow, { label: "Reduce confetti", value: gen.orphans, min: 0, max: 3, onChange: gen.setOrphans,
          format: function (v) { return v === 0 ? "Off" : String(v); },
          helpText: "How big a group of cut-off stitches is merged into the colour around it: 1 merges confetti stitches, 2 groups of up to 2, 3 groups of up to 3 (three times larger in plain areas). Off merges none.",
          inlineHint: "Confetti stitches are " + window.CONFETTI_HELP.definition + ". Each one forces a separate thread change, so reducing them can cut stitching time a lot.",
          helpTopic: "confetti" }),
        orphanDesc && hint(orphanDesc),
        check({ checked: sc2.protectDetails, label: "Protect fine details",
          onChange: function (v) { gen.setStitchCleanup(function (s) { return Object.assign({}, s, { protectDetails: v }); }); },
          info: "Keeps small groups of stitches that touch an outline, such as eyes, lettering and thin lines, out of the tidying. Turn off for the tidiest chart. Bright accents such as a catchlight are kept either way." }),
        tidied != null && !app.previewLoading && h("div", { className: "cv-tidied" },
          hint(tidied === 0 ? "In the preview, Reduce confetti changed no stitches."
            : "In the preview, Reduce confetti changed " + tidied.toLocaleString() + " stitch" + (tidied === 1 ? "" : "es") +
              (ps.stitchable > 0 ? " (" + (tidied / ps.stitchable * 100).toFixed(1) + "%)." : ".")),
          tidied > 0 && app.setShowTidied && h("button", { type: "button", className: "cs-seltools__btn" + (app.showTidied ? " cs-seltools__btn--on" : ""),
            "aria-pressed": app.showTidied ? "true" : "false", onClick: function () { app.setShowTidied(!app.showTidied); } },
            Icons.eye(), h("span", null, "Show them on the preview")))
      )
    );

    var lookSec = sec("lookalike", "Look-alike colours", null,
      check({ checked: gen.disambig, label: "Keep look-alike colours apart", onChange: function (v) { gen.setDisambig(v); },
        info: "After matching, changes a stitch whose neighbour is a thread too similar to tell apart on a printed chart, so the symbols are easier to follow. Those stitches move a little away from the picture's colour." }),
      hint("Makes skies and skin tones easier to read on a printed chart, at some cost to colour accuracy."),
      gen.disambig && h(React.Fragment, null,
        h("div", { className: "cv-sub__head" },
          h("span", { className: "cv-field__label", id: "cv-strict-label" }, "How strict"),
          h(InfoIcon, { label: "How strict", width: 240, text: "Gentle fixes only obvious clashes. Standard fixes colours that are hard to tell apart on a printed chart. Strong keeps them furthest apart, at a small cost to colour accuracy." })),
        seg({ label: "How strict", value: gen.disambigLevel || "standard", onChange: function (id) { gen.setDisambigLevel(id); },
          options: [{ id: "gentle", label: "Gentle" }, { id: "standard", label: "Standard" }, { id: "strong", label: "Strong" }] }),
        gen.disambigData && gen.disambigData.swaps > 0 && hint(h(React.Fragment, null, "Last Generate: ", h("strong", null, gen.disambigData.swaps.toLocaleString()), " stitches changed in ", gen.disambigData.iterations, " pass", gen.disambigData.iterations !== 1 ? "es" : "", ".")),
        gen.disambigData && gen.disambigData.swaps === 0 && hint("Last Generate: no neighbouring stitches needed changing.")
      )
    );

    var content;
    if (tab === "size") content = [sizeSec, fabricSec];
    else if (tab === "threads") content = [stashSec, countSec, keepSec, blendSec, brandSec, stashToolsSec];
    else content = [stepsSec, shadingSec, tidySec, rareSec, lookSec];

    // ── Tab strip (the Edit panel's) ────────────────────────────────────────
    var tabBar = h("div", { role: "tablist", "aria-label": "Convert steps", className: "cv-tabs" },
      h("div", { className: "creator-sidebar-tabs", "data-onboard": "convert-tabs" },
        CONVERT_TABS.map(function (t, i) {
          var on = t.id === tab;
          return h("button", {
            key: t.id, type: "button", role: "tab", id: "convert-tab-" + t.id,
            className: "creator-sidebar-tab", "data-tab-id": t.id,
            "aria-selected": on ? "true" : "false", "aria-controls": "convert-panel",
            tabIndex: on ? 0 : -1, title: t.label,
            onClick: function () { pickTab(t.id); },
            onKeyDown: function (e) {
              var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              var next = CONVERT_TABS[(i + step + CONVERT_TABS.length) % CONVERT_TABS.length];
              pickTab(next.id);
              var sib = document.getElementById("convert-tab-" + next.id);
              if (sib) sib.focus();
            }
          }, Icons[t.icon] ? Icons[t.icon]() : null, h("span", { className: "creator-sidebar-tab__label" }, t.label));
        })));

    var next = tabMeta.next;
    var hasImg = !!(gen.img && gen.img.src);
    var panel = h("div", { ref: contentRef, className: "cv-panel", role: "tabpanel", id: "convert-panel", "aria-labelledby": "convert-tab-" + tab },
      h("p", { className: "cv-lead" }, tabMeta.lead),
      content,
      next && h("div", { className: "cv-next" },
        h("button", { type: "button", className: "cv-next__btn", onClick: function () { pickTab(next); } },
          h("span", null, "Next: " + NEXT_LABELS[next]), Icons.chevronRight())),
      // The last step: what comes next is Generate, just below.
      !next && hasImg && h("div", { className: "cv-next cv-last-step", "data-last-step": "" },
        hint(gen.hasGenerated
          ? "That is every step. Regenerate below when the preview looks right."
          : "That is every step. Generate the pattern below when the preview looks right; you can come back and change any of these."))
    );

    // ── Footer: what Generate will make, and Generate ──────────────────────
    var typeLabel = gen.pictureType && window.PICTURE_PRESETS && window.PICTURE_PRESETS[gen.pictureType] ? window.PICTURE_PRESETS[gen.pictureType].label : null;
    var summary = gen.exactPixelArt
      ? "Exact pixel art · one stitch per pixel"
      : [typeLabel || "Your defaults", ctx.sW + " × " + ctx.sH + " stitches", "up to " + (gen.effectiveMaxC || gen.maxC) + " " + brandLabel + " threads",
         window.STITCH_STYLE_LABELS && window.STITCH_STYLE_LABELS[styleNow] ? window.STITCH_STYLE_LABELS[styleNow] : "Custom detail"].join(" · ");
    var editCount = (cv.editHistory && cv.editHistory.length) || 0;
    var chartState = ctx.pat ? app.convertChartState : null;
    var stateText = chartStateText(chartState, editCount);
    // The tour points at this button on wider screens; on phones, at the
    // compact bar's Generate (the panel is a closed sheet there).
    var compact = typeof window.useCreatorCompact === "function" ? window.useCreatorCompact() : false;
    var footer = h("footer", { className: "cv-footer" },
      hasImg && h("p", { className: "cv-footer__summary", "data-convert-summary": "" }, summary),
      hasImg && stateText && h("p", { className: "cv-footer__state", "data-chart-state": chartState }, stateText),
      hasImg ? h("button", Object.assign(compact ? {} : { "data-onboard": "creator-generate" }, {
        type: "button", className: "cv-generate" + (chartState === "same" ? " cv-generate--quiet" : ""),
        // Generate asks before replacing an edited or unknown chart.
        onClick: function () { gen.generate(); },
        disabled: gen.busy, "aria-label": gen.hasGenerated ? "Regenerate pattern" : "Generate pattern"
      }), gen.busy ? (gen.progressMessage || "Generating…") : h(React.Fragment, null, Icons.refresh(), h("span", null, gen.hasGenerated ? "Regenerate" : "Generate Pattern")))
        : hint("Upload an image to get started", { className: "cs-toolsec__hint cv-footer__empty" })
    );

    return h(React.Fragment, null, props && props.drawerHeader, tabBar, panel, footer);
  };
})();
