/* components/WorkAreaPicker.js — choose the Stitch Tracker's work area.
 * ═══════════════════════════════════════════════════════════════════════════
 * An overview of the whole pattern on the Spotlight section grid. A work area
 * is a rectangle of whole sections (see work-area.js), so selection snaps to
 * sections:
 *
 *   - "Area size" picks how many sections an area spans; the overview shows a
 *     grid of areas that size, finished ones shaded, part-done ones with a
 *     progress bar, and a tap selects the area under it.
 *   - Dragging selects any rectangle of sections instead.
 *
 * Plain React.createElement (components/ is not compiled), built on the shared
 * Overlay dialog. Exposes window.WorkAreaPicker.
 *
 * Props:
 *   pat, done, halfStitches, halfDone, sW, sH, blockW, blockH  the pattern and its section grid
 *   current     the project's workArea (active or not) to start from, or null
 *   onConfirm(rect)  rect = {x0,y0,x1,y1,bw,bh}
 *   onClose()
 */
(function () {
  if (typeof window === "undefined" || typeof React === "undefined") return;
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo, useRef = React.useRef;

  var FABRIC = [250, 247, 240];
  var MAX_W = 640;

  function isStitch(m) { return !!m && m.id !== "__skip__" && m.id !== "__empty__"; }

  /* Per-section stitch and done counts, computed once per open. */
  function sectionCounts(pat, done, halfStitches, halfDone, sW, sH, blockW, blockH) {
    var cols = Math.ceil(sW / blockW), rows = Math.ceil(sH / blockH);
    var total = new Float64Array(cols * rows), dn = new Float64Array(cols * rows);
    for (var y = 0; y < sH; y++) {
      var by = (y / blockH) | 0, base = y * sW;
      for (var x = 0; x < sW; x++) {
        if (!isStitch(pat[base + x])) continue;
        var k = by * cols + ((x / blockW) | 0);
        total[k]++;
        if (done && done[base + x]) dn[k]++;
      }
    }
    if (halfStitches && halfStitches.size) {
      halfStitches.forEach(function (hs, i) {
        var x = i % sW, y = (i / sW) | 0;
        if (x >= sW || y >= sH) return;
        var k = ((y / blockH) | 0) * cols + ((x / blockW) | 0);
        var hd = halfDone && halfDone.get(i);
        if (hs.fwd) { total[k] += 0.5; if (hd && hd.fwd) dn[k] += 0.5; }
        if (hs.bck) { total[k] += 0.5; if (hd && hd.bck) dn[k] += 0.5; }
      });
    }
    return { cols: cols, rows: rows, total: total, done: dn };
  }

  /* Stitches and done stitches in a rectangle of sections. */
  function sumSections(sc, bx0, by0, bw, bh) {
    var t = 0, d = 0;
    for (var by = by0; by < Math.min(sc.rows, by0 + bh); by++) {
      for (var bx = bx0; bx < Math.min(sc.cols, bx0 + bw); bx++) {
        t += sc.total[by * sc.cols + bx]; d += sc.done[by * sc.cols + bx];
      }
    }
    return { total: t, done: d };
  }

  /* Area-size choices, in sections: roughly 30, 50, 80 and 100 stitches. */
  function sizeOptions(blockW, blockH) {
    var out = [], seen = {};
    [30, 50, 80, 100].forEach(function (s) {
      var bw = Math.max(1, Math.round(s / blockW)), bh = Math.max(1, Math.round(s / blockH));
      var key = bw + "x" + bh;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ bw: bw, bh: bh, key: key });
    });
    return out;
  }

  function WorkAreaPicker(props) {
    var pat = props.pat, done = props.done, halfStitches = props.halfStitches, halfDone = props.halfDone, sW = props.sW, sH = props.sH;
    var blockW = props.blockW, blockH = props.blockH;
    var WA = window.WorkArea;

    var sc = useMemo(function () { return sectionCounts(pat, done, halfStitches, halfDone, sW, sH, blockW, blockH); }, [pat, done, halfStitches, halfDone, sW, sH, blockW, blockH]);
    var sizes = useMemo(function () { return sizeOptions(blockW, blockH); }, [blockW, blockH]);

    // Starting point: the current (or last) area, else the first unfinished
    // area of about 50 stitches.
    var initial = useMemo(function () {
      var cur = props.current;
      if (cur) {
        var r = WA.sectionRange(cur, blockW, blockH);
        var bw = cur.bw || (r.bx1 - r.bx0), bh = cur.bh || (r.by1 - r.by0);
        var match = sizes.filter(function (s) { return s.bw === bw && s.bh === bh; })[0];
        return { size: match ? match.key : "custom", sel: { bx0: r.bx0, by0: r.by0, bw: bw, bh: bh } };
      }
      var s = sizes[Math.min(1, sizes.length - 1)];
      return { size: s.key, sel: firstUnfinished(s.bw, s.bh) };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    function firstUnfinished(bw, bh) {
      for (var by = 0; by < sc.rows; by += bh) for (var bx = 0; bx < sc.cols; bx += bw) {
        var c = sumSections(sc, bx, by, bw, bh);
        if (c.total > 0 && c.done < c.total) return { bx0: bx, by0: by, bw: bw, bh: bh };
      }
      return { bx0: 0, by0: 0, bw: bw, bh: bh };
    }

    var sizeState = useState(initial.size), sizeKey = sizeState[0], setSizeKey = sizeState[1];
    var selState = useState(initial.sel), sel = selState[0], setSel = selState[1];
    var size = sizes.filter(function (s) { return s.key === sizeKey; })[0] || null;   // null = custom

    // ── Geometry of the overview ─────────────────────────────────────────
    var wrapRef = useRef(null), canvasRef = useRef(null), thumbRef = useRef(null);
    var dimState = useState(null), dim = dimState[0], setDim = dimState[1];
    useEffect(function () {
      function measure() {
        var w = wrapRef.current ? wrapRef.current.clientWidth : MAX_W;
        var availW = Math.min(MAX_W, Math.max(200, w));
        var availH = Math.max(160, Math.min(window.innerHeight * (window.innerWidth < 600 ? 0.4 : 0.5), 520));
        var scale = Math.min(availW / sW, availH / sH);
        setDim({ scale: scale, w: Math.floor(sW * scale), h: Math.floor(sH * scale) });
      }
      measure();
      window.addEventListener("resize", measure);
      return function () { window.removeEventListener("resize", measure); };
    }, [sW, sH]);

    // One pixel per stitch: done stitches in full colour, the rest tinted
    // toward the fabric, so progress reads at a glance. Released on close.
    useEffect(function () {
      var limits = window.canvasSizeLimits ? window.canvasSizeLimits() : { side: 4096, area: 16777216 };
      var scale = Math.min(1, limits.side / sW, limits.side / sH, Math.sqrt(limits.area / (sW * sH)));
      var tw = Math.max(1, Math.floor(sW * scale)), th = Math.max(1, Math.floor(sH * scale));
      var c = document.createElement("canvas");
      c.width = tw; c.height = th;
      var ctx = c.getContext("2d");
      if (!ctx) return;
      var img = ctx.createImageData(tw, th), d = img.data;
      for (var y = 0; y < th; y++) for (var x = 0; x < tw; x++) {
        var i = Math.min(sH - 1, Math.floor((y + 0.5) * sH / th)) * sW + Math.min(sW - 1, Math.floor((x + 0.5) * sW / tw));
        var m = pat[i], o = (y * tw + x) * 4;
        if (!isStitch(m) || !m.rgb) { d[o] = FABRIC[0]; d[o + 1] = FABRIC[1]; d[o + 2] = FABRIC[2]; d[o + 3] = 255; continue; }
        if (done && done[i]) { d[o] = m.rgb[0]; d[o + 1] = m.rgb[1]; d[o + 2] = m.rgb[2]; }
        else { d[o] = (m.rgb[0] + FABRIC[0] * 1.6) / 2.6; d[o + 1] = (m.rgb[1] + FABRIC[1] * 1.6) / 2.6; d[o + 2] = (m.rgb[2] + FABRIC[2] * 1.6) / 2.6; }
        d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      thumbRef.current = c;
      return function () { c.width = 0; c.height = 0; thumbRef.current = null; };
    }, [pat, done, sW, sH]);

    // ── Drawing ──────────────────────────────────────────────────────────
    useEffect(function () {
      var cv = canvasRef.current;
      if (!cv || !dim || !thumbRef.current) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(dim.w * dpr); cv.height = Math.round(dim.h * dpr);
      var ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(thumbRef.current, 0, 0, dim.w, dim.h);
      var s = dim.scale, cs = getComputedStyle(document.documentElement);
      var accent = cs.getPropertyValue("--accent").trim() || "#B85C38";
      var success = cs.getPropertyValue("--success").trim() || "#4F7D3F";

      // Area grid (for the chosen size), with progress per area.
      var gw = size ? size.bw : 1, gh = size ? size.bh : 1;
      var pxW = gw * blockW * s, pxH = gh * blockH * s;
      for (var by = 0; by < sc.rows; by += gh) for (var bx = 0; bx < sc.cols; bx += gw) {
        var c = sumSections(sc, bx, by, gw, gh);
        if (!c.total) continue;
        var x = bx * blockW * s, y = by * blockH * s;
        var w = Math.min(pxW, dim.w - x), hh = Math.min(pxH, dim.h - y);
        if (c.done >= c.total) {
          ctx.globalAlpha = 0.42; ctx.fillStyle = success; ctx.fillRect(x, y, w, hh); ctx.globalAlpha = 1;
        } else if (c.done > 0 && w > 12 && hh > 10) {
          ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(x + 2, y + hh - 6, w - 4, 3);
          ctx.fillStyle = success; ctx.fillRect(x + 2, y + hh - 6, (w - 4) * c.done / c.total, 3);
        }
      }
      // Faint section lines where they are far enough apart to read.
      ctx.lineWidth = 1;
      if (blockW * s >= 6) {
        ctx.beginPath();
        for (var sx = 1; sx < sc.cols; sx++) { var px = Math.round(sx * blockW * s) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, dim.h); }
        for (var sy = 1; sy < sc.rows; sy++) { var py = Math.round(sy * blockH * s) + 0.5; ctx.moveTo(0, py); ctx.lineTo(dim.w, py); }
        ctx.strokeStyle = "rgba(27,24,20,0.12)"; ctx.stroke();
      }
      if (size) {
        ctx.beginPath();
        for (var ax = gw; ax < sc.cols; ax += gw) { var qx = Math.round(ax * blockW * s) + 0.5; ctx.moveTo(qx, 0); ctx.lineTo(qx, dim.h); }
        for (var ay = gh; ay < sc.rows; ay += gh) { var qy = Math.round(ay * blockH * s) + 0.5; ctx.moveTo(0, qy); ctx.lineTo(dim.w, qy); }
        ctx.strokeStyle = "rgba(27,24,20,0.45)"; ctx.stroke();
      }
      // Selection.
      if (sel) {
        var rx = sel.bx0 * blockW * s, ry = sel.by0 * blockH * s;
        var rw = Math.min(sel.bw * blockW * s, dim.w - rx), rh = Math.min(sel.bh * blockH * s, dim.h - ry);
        ctx.globalAlpha = 0.2; ctx.fillStyle = accent; ctx.fillRect(rx, ry, rw, rh); ctx.globalAlpha = 1;
        ctx.lineWidth = 3; ctx.strokeStyle = accent; ctx.strokeRect(rx + 1.5, ry + 1.5, Math.max(0, rw - 3), Math.max(0, rh - 3));
      }
    }, [dim, sel, size, sc, blockW, blockH, pat, done]);

    // ── Input: tap selects the area under it, drag selects sections ─────
    var dragRef = useRef(null);
    function sectionAt(e) {
      var r = canvasRef.current.getBoundingClientRect();
      var bx = Math.floor((e.clientX - r.left) / (blockW * dim.scale));
      var by = Math.floor((e.clientY - r.top) / (blockH * dim.scale));
      return { bx: Math.max(0, Math.min(sc.cols - 1, bx)), by: Math.max(0, Math.min(sc.rows - 1, by)) };
    }
    function onPointerDown(e) {
      if (!dim) return;
      e.preventDefault();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
      var p = sectionAt(e);
      dragRef.current = { start: p, moved: false };
      if (size) {
        setSel({ bx0: Math.floor(p.bx / size.bw) * size.bw, by0: Math.floor(p.by / size.bh) * size.bh, bw: size.bw, bh: size.bh });
      } else {
        setSel({ bx0: p.bx, by0: p.by, bw: 1, bh: 1 });
      }
    }
    function onPointerMove(e) {
      var d = dragRef.current;
      if (!d || !dim) return;
      var p = sectionAt(e);
      if (p.bx === d.start.bx && p.by === d.start.by && !d.moved) return;
      d.moved = true;
      // A drag always selects exactly the sections covered: it is the
      // "custom" size.
      setSizeKey("custom");
      setSel({ bx0: Math.min(p.bx, d.start.bx), by0: Math.min(p.by, d.start.by),
        bw: Math.abs(p.bx - d.start.bx) + 1, bh: Math.abs(p.by - d.start.by) + 1 });
    }
    function onPointerUp() { dragRef.current = null; }
    function onKeyDown(e) {
      if (!sel) return;
      var dx = 0, dy = 0, bw = size ? size.bw : 1, bh = size ? size.bh : 1;
      if (e.key === "ArrowLeft") dx = -bw;
      else if (e.key === "ArrowRight") dx = bw;
      else if (e.key === "ArrowUp") dy = -bh;
      else if (e.key === "ArrowDown") dy = bh;
      else return;
      e.preventDefault();
      setSel({ bx0: Math.max(0, Math.min(Math.floor((sc.cols - 1) / bw) * bw, sel.bx0 + dx)), by0: Math.max(0, Math.min(Math.floor((sc.rows - 1) / bh) * bh, sel.by0 + dy)), bw: bw, bh: bh });
    }

    function chooseSize(s) {
      setSizeKey(s.key);
      // Keep the selection where it is, re-snapped to the new size's grid.
      var bx = sel ? Math.floor(sel.bx0 / s.bw) * s.bw : 0, by = sel ? Math.floor(sel.by0 / s.bh) * s.bh : 0;
      setSel({ bx0: bx, by0: by, bw: s.bw, bh: s.bh });
    }

    // ── Summary ──────────────────────────────────────────────────────────
    var rect = sel ? WA.fromSections(sel.bx0, sel.by0, sel.bw, sel.bh, blockW, blockH, sW, sH) : null;
    var counts = sel ? sumSections(sc, sel.bx0, sel.by0, sel.bw, sel.bh) : { total: 0, done: 0 };
    var colours = useMemo(function () {
      if (!rect) return 0;
      var seen = {}, n = 0;
      for (var y = rect.y0; y < rect.y1; y++) for (var x = rect.x0; x < rect.x1; x++) {
        var m = pat[y * sW + x];
        if (isStitch(m) && !seen[m.id]) { seen[m.id] = 1; n++; }
      }
      return n;
    }, [rect && rect.x0, rect && rect.y0, rect && rect.x1, rect && rect.y1, pat, sW]);
    var pct = counts.total ? Math.floor(counts.done / counts.total * 100) : 100;
    var fmt = function (n) { return n.toLocaleString("en-GB"); };

    function confirm() { if (rect && counts.total > 0) props.onConfirm(rect); }

    var Overlay = window.Overlay;
    // Portalled to <body>: the tracker mounts this inside the chart column,
    // whose ancestors create a containing block for position:fixed, which
    // would otherwise confine the scrim and push the footer off a phone.
    var dialog = h(Overlay, {
      onClose: props.onClose, variant: "dialog", labelledBy: "work-area-picker-title",
      className: "work-area-picker", maxWidth: 720
    },
      h(Overlay.CloseButton, { onClose: props.onClose }),
      h("div", { className: "work-area-picker__body" },
        h("h2", { id: "work-area-picker-title", className: "work-area-picker__title" }, "Pick a work area"),
        h("p", { className: "work-area-picker__lede" },
          "The chart will show only this part of the pattern, and the colour list and counts will cover just it. Tap an area, or drag across sections."),
        h("div", { className: "work-area-picker__controls" },
          h("div", { className: "work-area-seg", role: "group", "aria-label": "Area size" },
            h("span", { className: "work-area-seg__label" }, "Area size"),
            sizes.map(function (s) {
              return h("button", {
                key: s.key, type: "button", "aria-pressed": sizeKey === s.key,
                onClick: function () { chooseSize(s); },
                title: s.bw + " × " + s.bh + " sections"
              }, (s.bw * blockW) + "×" + (s.bh * blockH));
            }),
            sizeKey === "custom" ? h("span", { className: "work-area-seg__custom", "aria-live": "polite" }, "Custom") : null
          ),
          h("div", { className: "work-area-picker__key" },
            h("span", null, h("i", { className: "work-area-key work-area-key--sel" }), "Selected"),
            h("span", null, h("i", { className: "work-area-key work-area-key--done" }), "Finished"),
            h("span", null, h("i", { className: "work-area-key work-area-key--part" }), "In progress"))
        ),
        h("div", { className: "work-area-picker__overview", ref: wrapRef },
          dim ? h("canvas", {
            ref: canvasRef, className: "work-area-picker__canvas",
            style: { width: dim.w, height: dim.h },
            role: "grid", tabIndex: 0, "aria-label": "Pattern overview. " + (rect ? WA.describe(rect) : "No area selected"),
            onPointerDown: onPointerDown, onPointerMove: onPointerMove,
            onPointerUp: onPointerUp, onPointerCancel: onPointerUp,
            onKeyDown: onKeyDown,
            onDoubleClick: confirm
          }) : null
        ),
        rect ? h("div", { className: "work-area-picker__summary", "aria-live": "polite" },
          h("strong", null, WA.describe(rect)),
          h("span", null, fmt(counts.total) + " stitches"),
          h("span", null, pct + "% done · " + fmt(counts.total - counts.done) + " left"),
          h("span", null, colours + (colours === 1 ? " colour" : " colours"))
        ) : null
      ),
      h("div", { className: "work-area-picker__foot" },
        h("button", { type: "button", className: "g-btn", onClick: function () {
          var s = size || sizes[Math.min(1, sizes.length - 1)];
          setSizeKey(s.key); setSel(firstUnfinished(s.bw, s.bh));
        } }, "First unfinished area"),
        h("span", { className: "work-area-picker__spacer" }),
        h("button", { type: "button", className: "g-btn", onClick: props.onClose }, "Cancel"),
        h("button", { type: "button", className: "g-btn g-btn--primary", onClick: confirm,
          disabled: !rect || counts.total === 0 },
          window.Icons && window.Icons.crop ? window.Icons.crop() : null, " Work on this area")
      )
    );
    return (window.ReactDOM && window.ReactDOM.createPortal) ? window.ReactDOM.createPortal(dialog, document.body) : dialog;
  }

  window.WorkAreaPicker = WorkAreaPicker;
})();
