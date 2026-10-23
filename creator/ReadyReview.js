/* ReadyReview — inspect the saved chart before committing to materials.
   Uses the editor chart renderer, realistic stitch renderer, confetti count (confettiSummary)
   and Threads shopping calculation. No conversion-thumbnail metrics or score. */
(function () {
  var h = React.createElement;
  function occupied(p) { return p && p.id && p.id.indexOf('__') !== 0; }
  function region(w, hgt, requested) {
    function integer(v, fallback) { return Number.isFinite(Number(v)) ? Math.floor(Number(v)) : fallback; }
    var x = Math.max(0, Math.min(w - 1, integer(requested.x, 0)));
    var y = Math.max(0, Math.min(hgt - 1, integer(requested.y, 0)));
    return { x: x, y: y, w: Math.max(1, Math.min(80, w - x, integer(requested.w, 30))),
      h: Math.max(1, Math.min(80, hgt - y, integer(requested.h, 30))) };
  }
  function crop(pat, w, r) {
    var out = [];
    for (var y = r.y; y < r.y + r.h; y++) {
      for (var x = r.x; x < r.x + r.w; x++) out.push(pat[y * w + x] || { id: '__empty__' });
    }
    return out;
  }
  function metrics(pat, w, hgt) {
    // Derive counts afresh from the actual chart, including manual edits.
    var counts = Object.create(null), total = 0;
    for (var i = 0; i < w * hgt; i++) {
      var p = pat[i];
      if (!occupied(p)) continue;
      total++;
      var key = (p.brand || 'dmc') + ':' + p.id;
      if (!counts[key]) counts[key] = Object.assign({}, p, { count: 0 });
      counts[key].count++;
    }
    var pal = Object.values(counts);
    // The one confetti count (colour-utils.js confettiSummary), the same as Pattern info shows.
    return { total: total, pal: pal, rare: pal.filter(function (p) { return p.count <= 5; }),
      confetti: confettiSummary(pat, w, hgt) };
  }
  function size(w, hgt, ct) {
    var effective = ct / stitchOverFor(ct);
    return (w / effective).toFixed(1) + ' × ' + (hgt / effective).toFixed(1) + ' in (' +
      (w / effective * 2.54).toFixed(1) + ' × ' + (hgt / effective * 2.54).toFixed(1) + ' cm)';
  }
  function clipLine(line, r) {
    var dx = line.x2 - line.x1, dy = line.y2 - line.y1, t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [line.x1 - r.x, r.x + r.w - line.x1, line.y1 - r.y, r.y + r.h - line.y1];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return null; }
      else {
        var t = q[i] / p[i];
        if (p[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
        if (t0 > t1) return null;
      }
    }
    return Object.assign({}, line, { x1: line.x1 + t0 * dx, y1: line.y1 + t0 * dy,
      x2: line.x1 + t1 * dx, y2: line.y1 + t1 * dy });
  }
  function chart(canvas, ctx, fabricColour, r, cell) {
    var gutter = 24;
    canvas.width = r.w * cell + gutter + 2;
    canvas.height = r.h * cell + gutter + 2;
    var g = canvas.getContext('2d');
    if (!g) throw new Error('Chart preview unavailable on this device.');
    // Clip at the chosen bounds; never include edit ghosts, source overlays,
    // selection masks, highlights or uncommitted cleanup in a review/export.
    var snapshot = Object.assign({}, ctx, { view: 'both', fabricColour: fabricColour,
      hiId: null, dimHiId: null, showCtr: false, showOverlay: false, showCleanupDiff: false,
      specialtySelected: null,
      bsLines: (ctx.bsLines || []).map(function (ln) { return clipLine(ln, r); }).filter(Boolean),
      partialStitches: ctx.partialStitches || new Map() });
    window.drawPatternBaseOnCanvas(g, r.x, r.y, r.w, r.h, cell, gutter, snapshot,
      { x0: 0, y0: 0, x1: 0, y1: 0, fill: 'all', lines: false });
    g.save(); g.beginPath(); g.rect(gutter, gutter, r.w * cell, r.h * cell); g.clip();
    window.drawPatternBaseOnCanvas(g, r.x, r.y, r.w, r.h, cell, gutter, snapshot,
      { x0: 0, y0: 0, x1: r.w, y1: r.h, frame: false, fill: false });
    g.restore();
    return canvas;
  }
  window.ReadyReview = { region: region, crop: crop, metrics: metrics, size: size, clipLine: clipLine, chart: chart };

  function Chart(props) {
    var ref = React.useRef(null), error = React.useState('');
    React.useEffect(function () {
      try { chart(ref.current, props.ctx, props.fabric, props.region, props.cell); error[1](''); }
      catch (e) { error[1](e.message); }
    }, [props.ctx, props.fabric, props.region.x, props.region.y, props.region.w, props.region.h, props.cell]);
    return h('div', null, h('canvas', { ref: ref, role: 'img', 'aria-label': props.label }),
      error[0] && h('p', { role: 'alert' }, error[0]));
  }

  window.CreatorReadyReview = function CreatorReadyReview() {
    var ctx = window.usePatternData(), app = window.useApp(), gen = window.useGeneration();
    var request = React.useState({ x: 0, y: 0, w: 30, h: 30 }), requested = request[0];
    var status = React.useState(''), exporting = React.useState(false), enlarged = React.useState(false);
    var m = React.useMemo(function () { return metrics(ctx.pat, ctx.sW, ctx.sH); }, [ctx.pat, ctx.sW, ctx.sH]);
    var r = region(ctx.sW, ctx.sH, requested);
    var sample = React.useMemo(function () {
      return Object.assign({}, ctx, { pat: crop(ctx.pat, ctx.sW, r), sW: r.w, sH: r.h });
    }, [ctx, r.x, r.y, r.w, r.h]);
    var rows = ctx.materialThreadRows || window.buildThreadShoppingRows(m.pal, {fabricCt: ctx.fabricCt, stash: ctx.globalStash, project: ctx});
    var skeins = rows.reduce(function (n, row) { return n + row.needed; }, 0);
    var bounds = { x: 0, y: 0, w: ctx.sW, h: ctx.sH };
    var source = gen.img && gen.img.src;
    var other = (ctx.bsLines || []).length || (ctx.partialStitches && ctx.partialStitches.size) ||
      (ctx.knots || []).length || (ctx.specialtyStitches || []).length;
    var coords = 'Columns ' + (r.x + 1) + '–' + (r.x + r.w) + ', rows ' + (r.y + 1) + '–' + (r.y + r.h);
    var assumptions = ctx.fabricCt + 'ct over ' + stitchOverFor(ctx.fabricCt) + '; crosses: 2 strands; outlines: 1; 20% allowance; skeins by brand';
    function go(sub) { app.setMaterialsTab(sub); }
    function controls() { app.setTab('pattern'); app.setAppMode('edit'); app.setSidebarTab('tools'); app.setSidebarOpen(true); }
    function adjustments() { app.requestBackToConvert(); }
    function field(key, label, value, max, offset) {
      return h('label', { key: key }, label, h('input', { type: 'number', min: 1, max: max, step: 1, value: value + (offset || 0),
        onChange: function (e) { var n = Number(e.target.value) - (offset || 0); request[1](Object.assign({}, r, { [key]: n })); status[1](''); } }));
    }
    function exportSample() {
      exporting[1](true); status[1]('');
      try {
        // Render synchronously from this click's snapshot. Later edits cannot
        // change either the chosen region or the settings printed on the PNG.
        var c = chart(document.createElement('canvas'), ctx, app.fabricColour, r, 20);
        var local = metrics(sample.pat, r.w, r.h).pal;
        var width = Math.max(760, c.width), header = 100;
        var out = document.createElement('canvas'); out.width = width; out.height = c.height + header + 30 + local.length * 24;
        var g = out.getContext('2d'); g.fillStyle = 'white'; g.fillRect(0, 0, out.width, out.height);
        g.fillStyle = 'black'; g.font = '18px sans-serif'; g.fillText('Ready to stitch — sample chart', 16, 26);
        g.font = '14px sans-serif'; g.fillText(coords + ' (' + r.w + ' × ' + r.h + ' stitches)', 16, 50);
        g.fillText(assumptions, 16, 70); g.fillText('Sample finished size: ' + size(r.w, r.h, ctx.fabricCt) + '; no finishing margin', 16, 90);
        g.drawImage(c, 0, header);
        g.fillStyle = 'black'; g.fillText('Screen colours are approximate. Key: thread / blend ID, symbol, full crosses in sample', 16, header + c.height + 22);
        local.forEach(function (p, i) {
          var entry = ctx.cmap[p.id] || p;
          var rowY = header + c.height + 46 + i * 24, idText = p.id + '   ';
          g.fillStyle = 'black'; g.fillText(idText, 16, rowY);
          var symX = 16 + g.measureText(idText).width, oldFont = g.font;
          g.font = chartSymbolFont(14); g.fillText(entry.symbol || '', symX, rowY);
          var symW = g.measureText(entry.symbol || '').width;
          g.font = oldFont; g.fillText('   ' + p.count, symX + symW, rowY);
        });
        out.toBlob(function (blob) {
          exporting[1](false);
          if (!blob) { status[1]('Sample export failed. Try again.'); return; }
          var a = document.createElement('a'), url = URL.createObjectURL(blob);
          a.href = url; a.download = 'stitchx-sample-c' + (r.x + 1) + '-r' + (r.y + 1) + '-' + r.w + 'x' + r.h + '.png';
          a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          status[1]('Sample chart exported. ' + coords + '.');
        }, 'image/png');
      } catch (e) { exporting[1](false); status[1](e.message); }
    }
    function figure(label, child) { return h('figure', null, h('figcaption', null, label), child); }
    function button(label, fn) { return h('button', { type: 'button', onClick: fn }, label); }
    return h('section', { className: 'ready-review', 'aria-label': 'Ready to stitch review' },
      h('h2', null, 'Ready to stitch'),
      h('p', null, 'Review the current chart before buying materials. Check recognisable features, colour relationships and the finished size. There is no overall quality score.'),
      h('div', { className: 'ready-review-images' },
        figure('Original image', source ? h('img', { src: source, alt: 'Original source image' }) : h('p', null, 'No source image. Review the chart and stitch preview for this drawn or imported design.')),
        figure('Current chart', h(Chart, { ctx: ctx, fabric: app.fabricColour, region: bounds, cell: Math.min(12, 1200 / Math.max(ctx.sW, ctx.sH)), label: 'Current generated or drawn chart' })),
        figure('Stitches from the current chart', Math.max(ctx.sW, ctx.sH) <= 1600 ? h(window.CreatorRealisticCanvas, { patternData: ctx, review: true, inputLevel: 2 }) : h('p', null, 'This chart is too large for a full stitch simulation. Inspect the selected sample below.'))),
      h('p', null, 'Overview images are scaled to fit, not shown at physical size. The stitch simulation uses actual full-cross cells and approximate screen thread colours. It cannot calibrate physical colours or predict lighting, tension, fabric coverage or guaranteed results. Blends show component colours where available. Inspect a stitched sample for important colours and detail.'),
      other ? h('p', { className: 'ready-review-note' }, 'This chart also contains other stitch types. The stitch simulation shows full crosses only; inspect the chart and Export for fractional stitches, backstitch, knots and specialty stitches. Material estimates include these objects using approximate thread lengths. Beads and fabric are separate.') : null,
      h('div', { className: 'ready-review-summary' },
        h('div', null, h('h3', null, 'Size and materials'),
          h('p', null, ctx.sW + ' × ' + ctx.sH + ' stitches; finished ' + size(ctx.sW, ctx.sH, ctx.fabricCt) + '.'),
          h('p', null, 'Finished size covers the whole grid, including empty cells. Add your own framing and finishing margins.'),
          h(window.CreatorFabricSummary, { fabricCt: ctx.fabricCt, app: app }),
          h('p', null, assumptions + '. Imported blend strand ratios are used when supplied. Confirm unusual thread requirements.'),
          h('p', null, window.threadCountsShort({ threads: rows.length, symbols: m.pal.length }) + '. Estimated full-project materials: ' + skeins + ' whole skeins, £' + (skeins * ctx.skeinPrice).toFixed(2) + ' at £' + ctx.skeinPrice.toFixed(2) + ' per skein, before stash deductions.'),
          button('Inspect threads and estimates', function () { go('threads'); }), button('Check stash', function () { go('stash'); })),
        h('div', null, h('h3', null, 'Stitching effort and detail'),
          h('p', null, plural(m.total, 'full-cross cell') + ' (' + (m.total / (ctx.sW * ctx.sH) * 100).toFixed(1) + '% of the grid). Empty fabric can be intentional.'),
          h('p', { 'data-testid': 'ready-confetti' }, m.confetti.stitches.toLocaleString('en-GB') + ' confetti stitches (' + m.confetti.pct.toFixed(1) + '% of the chart). Confetti stitches are ' + window.CONFETTI_HELP.definition + ': a cross with no same-colour neighbour above, below, left or right. A further ' + m.confetti.groups.toLocaleString('en-GB') + ' crosses sit in small groups of 2–3. These counts indicate thread changes, not colour fidelity or retained detail.'),
          h('p', null, plural(m.rare.length, 'rarely used symbol') + (m.rare.length === 1 ? ' appears' : ' appear') + ' in 5 or fewer full crosses. They may be intentional highlights, eyes, text or outlines. Compare before simplifying.'),
          m.rare.length ? h('details', null, h('summary', null, 'Inspect rarely used symbols'), h('ul', null, m.rare.map(function (p) { return h('li', { key: (p.brand || 'dmc') + ':' + p.id }, (p.brand || 'dmc').toUpperCase() + ' ' + p.id + ': ' + plural(p.count, 'cross', 'crosses')); }))) : null,
          button('Open adjustment and cleanup tools', controls),
          source && !ctx.isScratchMode ? button('Review conversion settings', adjustments) : null,
          h('p', null, 'In Edit > Tools, inspect Fix outline colours or Reduce confetti, preview proposed changes and use Undo if needed. Cleanup can remove meaningful detail. Conversion settings include grid size, colour limit, dithering and cleanup; regenerating may replace edits.'))),
      h('h3', null, 'Inspect a representative sample'),
      h('p', null, 'Choose a region with an important face, edge, small detail or blend. Compare several regions; one sample cannot establish the quality of the whole design. Coordinates start at 1.'),
      h('div', { className: 'ready-review-fields' }, field('x', 'First column', r.x, ctx.sW, 1), field('y', 'First row', r.y, ctx.sH, 1),
        field('w', 'Width (stitches)', r.w, Math.min(80, ctx.sW - r.x)), field('h', 'Height (stitches)', r.h, Math.min(80, ctx.sH - r.y))),
      h('p', { 'data-testid': 'sample-bounds' }, coords + '; finished ' + size(r.w, r.h, ctx.fabricCt) + '.'),
      h('button', { type: 'button', 'aria-pressed': enlarged[0], onClick: function () { enlarged[1](!enlarged[0]); } }, enlarged[0] ? 'Fit sample to panel' : 'Enlarge sample cells'),
      h('div', { className: 'ready-review-images ready-review-images--sample' + (enlarged[0] ? ' is-enlarged' : '') },
        figure('Sample chart', h(Chart, { ctx: ctx, fabric: app.fabricColour, region: r, cell: 20, label: 'Selected sample chart' })),
        figure('Sample stitches (full crosses)', h(window.CreatorRealisticCanvas, { patternData: sample, review: true, inputLevel: 2 }))),
      h('button', { type: 'button', disabled: exporting[0], onClick: exportSample }, exporting[0] ? 'Exporting sample…' : 'Export sample chart PNG'),
      h('p', null, 'The PNG includes only the chosen chart region, its coordinates, symbol key, finished size and current material assumptions. PNG cell sizes are for reading the chart, not life-size printing. Stitch a sample using the stated fabric count. Use Export for the complete pattern.'),
      h('p', { role: 'status' }, status[0]));
  };
})();
