/* creator/CompareStrip.js — Compare options under the Convert preview
 * (audit IMG-05).
 *
 * Three thumbnails for a chosen dimension, Size (−25 %, current, +25 %) or
 * Threads (−5, current, +5), each with its stitches, threads, estimated
 * hours and confetti tier. Choosing one applies its values.
 *
 * The thumbnails are rendered at reduced size (CompareOptions.js
 * comparePreviewDims) by a generate-worker.js of their own, one job at a
 * time. Results are cached by compareCacheKey. A change of settings starts a
 * new batch: older results are ignored, and a job still running for an old
 * batch is stopped by terminating the worker (the genReqIdRef pattern in
 * useCreatorState.generate). Without workers the jobs run on the page with
 * runCleanupPipeline.
 *
 * Props: img, settings (conversionSettings), sW, sH, maxC, arLock,
 *        stitchSpeed, compact, onApply({ sW, sH } | { maxC }).
 * On phones (compact) the strip is collapsed behind "Compare options".
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */
(function () {
  var imgIds = typeof WeakMap === "function" ? new WeakMap() : null;
  var nextImgId = 1;
  function imgKey(img) {
    if (!img) return "none";
    if (!imgIds) return String(img.src || "").length + ":" + (img.width || 0) + "x" + (img.height || 0);
    if (!imgIds.has(img)) imgIds.set(img, nextImgId++);
    return "img" + imgIds.get(img);
  }

  var CACHE_LIMIT = 24;

  // Picture pixels at pw × ph with the picture adjustments, as generate does.
  function picturePixels(img, pw, ph, s) {
    var c = document.createElement("canvas"); c.width = pw; c.height = ph;
    var cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in cx) cx.imageSmoothingQuality = "high";
    if (s.bri || s.con || s.sat) cx.filter = "brightness(" + (100 + (s.bri || 0)) + "%) contrast(" + (100 + (s.con || 0)) + "%) saturate(" + (100 + (s.sat || 0)) + "%)";
    var src = s.preSharpen && typeof applyPreSharpenCanvas === "function" ? applyPreSharpenCanvas(img, pw, ph, { amount: s.preSharpenAmount }) : img;
    cx.drawImage(typeof prescaleForGrid === "function" ? prescaleForGrid(src, pw, ph) : src, 0, 0, pw, ph);
    cx.filter = "none";
    return cx.getImageData(0, 0, pw, ph);
  }

  function pipelineSettings(s, values) {
    return {
      maxC: values.maxC != null ? values.maxC : s.maxC,
      dith: s.dith, dithStrength: s.dithStrength, dithAlgo: s.dithAlgo, dithBayerSize: s.dithBayerSize,
      allowBlends: s.allowBlends, allowedPalette: s.allowedPalette,
      skipBg: s.skipBg, bgCol: s.bgCol, bgTh: s.bgTh,
      minSt: s.minSt, smooth: s.smooth, smoothType: s.smoothType,
      stitchCleanup: s.stitchCleanup, orphans: s.orphans, seed: s.seed
    };
  }

  function renderUrl(mapped, pw, ph) {
    var c = document.createElement("canvas"); c.width = pw; c.height = ph;
    var cx = c.getContext("2d"); var data = cx.createImageData(pw, ph); var d = data.data;
    for (var i = 0; i < mapped.length; i++) {
      var m = mapped[i], k = i * 4;
      if (!m || m.id === "__skip__") { d[k] = 240; d[k + 1] = 240; d[k + 2] = 240; }
      else { d[k] = m.rgb[0]; d[k + 1] = m.rgb[1]; d[k + 2] = m.rgb[2]; }
      d[k + 3] = 255;
    }
    cx.putImageData(data, 0, 0);
    return c.toDataURL();
  }

  function fmtHours(h) {
    if (h == null) return "";
    if (h < 1) return "under 1 hr";
    return "about " + Math.round(h) + " hr" + (Math.round(h) === 1 ? "" : "s");
  }

  window.CreatorCompareStrip = function CreatorCompareStrip(props) {
    var h = React.createElement;
    var _dim = React.useState("size"); var dimension = _dim[0], setDimension = _dim[1];
    var _open = React.useState(!props.compact); var open = _open[0], setOpen = _open[1];
    var _res = React.useState({}); var results = _res[0], setResults = _res[1];
    var cacheRef = React.useRef(new Map());
    var batchRef = React.useRef(0);
    var workerRef = React.useRef(null);   // null | Worker | 'unavailable'
    var busyRef = React.useRef(false);

    var s = props.settings;
    var options = window.compareOptionsFor(dimension, { sW: props.sW, sH: props.sH, maxC: props.maxC });
    var ik = imgKey(props.img);
    var keys = options.map(function (o) {
      var settings = Object.assign({}, s || {}, o.values);
      return window.compareCacheKey(ik, settings, o.values);
    });

    function getWorker() {
      if (workerRef.current === "unavailable") return null;
      if (workerRef.current) return workerRef.current;
      try { workerRef.current = new Worker("generate-worker.js"); }
      catch (_) { workerRef.current = "unavailable"; return null; }
      return workerRef.current;
    }
    function stopWorker() {
      if (workerRef.current && workerRef.current !== "unavailable") {
        try { workerRef.current.terminate(); } catch (_) {}
        workerRef.current = null;
      }
      busyRef.current = false;
    }
    React.useEffect(function () { return stopWorker; }, []);

    function runJob(job) {
      return new Promise(function (resolve, reject) {
        var dims = job.dims;
        var px = picturePixels(props.img, dims.pw, dims.ph, s);
        var w = getWorker();
        if (!w) {
          // No workers: run on the page, after the current frame.
          setTimeout(function () {
            try {
              var raw = px.data;
              if (s.smooth > 0) {
                if (s.smoothType === "gaussian") applyGaussianBlur(raw, dims.pw, dims.ph, s.smooth);
                else if (s.smoothType === "bilateral" && typeof applyBilateralFilter === "function") applyBilateralFilter(raw, dims.pw, dims.ph);
                else applyMedianFilter(raw, dims.pw, dims.ph, s.smooth);
              }
              var r = window.runCleanupPipeline(raw, dims.pw, dims.ph, pipelineSettings(s, job.values));
              if (!r) { reject(new Error("no result")); return; }
              resolve({ mapped: r.mapped, pal: buildPalette(r.mapped).pal, confettiPct: (r.confettiClean || r.confettiRaw || {}).pct });
            } catch (err) { reject(err); }
          }, 0);
          return;
        }
        var reqId = job.batch * 10 + job.index;
        w.onmessage = function (e) {
          var msg = e.data || {};
          if (msg.reqId !== reqId) return;
          if (msg.type === "result") resolve({ mapped: msg.mapped, pal: msg.pal, confettiPct: msg.confettiData && msg.confettiData.clean ? msg.confettiData.clean.pct : null });
          else if (msg.type === "error") reject(new Error(msg.message));
        };
        w.onerror = function (err) { reject(err); };
        w.postMessage({ type: "generate", reqId: reqId, pixels: px.data.buffer, width: dims.pw, height: dims.ph,
          settings: pipelineSettings(s, job.values) }, [px.data.buffer]);
      });
    }

    var keySig = keys.join("\n");
    React.useEffect(function () {
      if (!open || !props.img || !props.img.src || !s) return undefined;
      var batch = ++batchRef.current;
      // A job from an older batch is still running: stop it.
      if (busyRef.current) stopWorker();
      var timer = setTimeout(function () {
        var jobs = [];
        options.forEach(function (o, i) {
          var cached = cacheRef.current.get(keys[i]);
          if (cached) return;
          var full = o.values.sW ? { w: o.values.sW, h: o.values.sH } : { w: props.sW, h: props.sH };
          jobs.push({ batch: batch, index: i, key: keys[i], values: o.values, full: full, dims: window.comparePreviewDims(full.w, full.h) });
        });
        setResults(function () {
          var r = {};
          keys.forEach(function (k) { var c = cacheRef.current.get(k); if (c) r[k] = c; });
          return r;
        });
        (function next() {
          if (batch !== batchRef.current || !jobs.length) { if (batch === batchRef.current) busyRef.current = false; return; }
          var job = jobs.shift();
          busyRef.current = true;
          runJob(job).then(function (r) {
            if (batch !== batchRef.current) return;
            var stitched = 0;
            for (var i = 0; i < r.mapped.length; i++) if (r.mapped[i] && r.mapped[i].id !== "__skip__") stitched++;
            var entry = {
              url: renderUrl(r.mapped, job.dims.pw, job.dims.ph),
              stats: window.compareStats(r.pal, stitched, r.confettiPct, job.full, job.dims, props.stitchSpeed)
            };
            cacheRef.current.set(job.key, entry);
            if (cacheRef.current.size > CACHE_LIMIT) cacheRef.current.delete(cacheRef.current.keys().next().value);
            setResults(function (prev) { var n = Object.assign({}, prev); n[job.key] = entry; return n; });
            next();
          }, function (err) {
            console.warn("[compare] preview failed", err);
            if (batch === batchRef.current) next();
          });
        })();
      }, 500);
      return function () { clearTimeout(timer); };
    }, [open, keySig, props.img, props.stitchSpeed]); // eslint-disable-line react-hooks/exhaustive-deps

    var dims = [{ id: "size", label: "Size" }, { id: "threads", label: "Threads" }];
    var dimSwitch = h("div", { className: "lp-segmented compare-strip__dim", role: "radiogroup", "aria-label": "Compare by" },
      dims.map(function (d, i) {
        var on = dimension === d.id;
        return h("button", {
          key: d.id, type: "button", role: "radio", "aria-checked": on ? "true" : "false",
          className: "lp-seg" + (on ? " lp-seg--on" : ""), "data-compare-dim": d.id, tabIndex: on ? 0 : -1,
          onClick: function () { setDimension(d.id); },
          onKeyDown: function (e) {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) === -1) return;
            e.preventDefault();
            var next = dims[1 - i].id;
            setDimension(next);
            var sib = e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector('[data-compare-dim="' + next + '"]');
            if (sib) sib.focus();
          }
        }, d.label);
      })
    );

    var cards = options.map(function (o, i) {
      var r = results[keys[i]];
      var size = o.values.sW ? o.values.sW + " × " + o.values.sH : props.sW + " × " + props.sH;
      var lines = r ? [
        r.stats.stitches.toLocaleString("en-GB") + " stitches (" + size + ")",
        r.stats.threads + " thread" + (r.stats.threads === 1 ? "" : "s") + " · " + fmtHours(r.stats.hours),
        r.stats.tier ? "Confetti: " + r.stats.tier : ""
      ] : [size + " stitches", "Working…"];
      var disabled = o.current || o.same || !r;
      return h("button", {
        key: o.id, type: "button", className: "compare-strip__option" + (o.current ? " compare-strip__option--current" : "") + (o.same ? " compare-strip__option--same" : ""),
        "data-compare-option": o.id, disabled: disabled, "aria-pressed": o.current ? "true" : undefined,
        "aria-label": o.label + ": " + lines.filter(Boolean).join(", "),
        onClick: function () { if (!disabled && props.onApply) props.onApply(o.values); }
      },
        h("span", { className: "compare-strip__label" }, o.label),
        h("span", { className: "compare-strip__thumb" },
          r ? h("img", { src: r.url, alt: "", draggable: false }) : h("span", { className: "compare-strip__pending", "aria-hidden": "true" })),
        lines.filter(Boolean).map(function (t, j) { return h("span", { key: j, className: "compare-strip__stat" }, t); })
      );
    });

    return h("div", { className: "card compare-strip" + (open ? " compare-strip--open" : "") },
      h("div", { className: "compare-strip__head" },
        h("button", { type: "button", className: "compare-strip__toggle", "aria-expanded": open ? "true" : "false",
          onClick: function () { setOpen(!open); } },
          window.Icons && window.Icons.chevronDown ? h("span", { className: "compare-strip__chev", "aria-hidden": "true" }, window.Icons.chevronDown()) : null,
          "Compare options"),
        open ? dimSwitch : null
      ),
      open ? h("div", { className: "compare-strip__row", role: "group", "aria-label": "Options to compare" }, cards) : null
    );
  };
})();
