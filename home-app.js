// home-app.js — Home (`/home`), "Ask what they have" layout.
// Mounts to #root in home.html. Design and reasoning:
// reports/home-redesign-proposals.md (Option 1) and the new-user walkthrough in
// reports/home-page-audit/README.md (findings F1 to F16, referenced below).
//
// One page, no tabs. Top to bottom:
//   1. Shared <Header page="home"> — Home / Stash / Stats links, Help, File.
//      Home shows no project switcher: the Continue card is the one place the
//      open project appears (F16).
//   First visit (no projects):
//   2. Hero — what stitchx is, plus the free / on this device promise (F1).
//   3. "What are you starting with?" — three cards named after what the user
//      has, not which tool they need (F5): a pattern / a picture / a blank canvas.
//      "Which files work?" explains formats once (F6).
//   4. Practice pattern card — visible, not hidden in a disclosure (F8).
//   5. "How stitchx fits together" — names the three tools once (F1).
//   Returning (one or more projects):
//   2. Start something new — the same three cards, compact.
//   3. Continue card — one primary action for the open project (F12).
//   4. Your projects — cards with a preview, size, progress and status, one
//      action each plus a More menu (F12, F13), filters, "Show all" (F14).
//
// Files can be dropped anywhere on the page. A picture whose purpose is
// unclear (dropped, or chosen under "A pattern I already have") gets one
// question: something to turn into a pattern, or a printed chart?
// No emojis or unicode glyphs — every icon comes from window.Icons.

(function () {
  if (typeof window === 'undefined' || typeof React === 'undefined') return;
  var h = React.createElement;

  // ── Helpers ────────────────────────────────────────────────────────────
  // window.timeAgo is the canonical implementation when home-screen.js is also
  // loaded (manager.html); /home inlines a copy so it doesn't need that bundle.
  function timeAgo(d) {
    if (typeof window.timeAgo === 'function') return window.timeAgo(d);
    if (!d) return '';
    var dt = typeof d === 'string' ? new Date(d) : d;
    var diff = Date.now() - dt.getTime();
    if (diff < 0) return 'just now';
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + ' min ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    var days = Math.floor(hr / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[dt.getMonth()] + ' ' + dt.getDate();
  }

  function icon(name) {
    return window.Icons && typeof window.Icons[name] === 'function' ? window.Icons[name]() : null;
  }

  // Percent for a project: a full record (pattern + done) is measured with the
  // one shared definition; a library row (listProjects) already carries `pct`
  // and the exact unit totals, so it is read straight from those (F13).
  function projectPct(p) {
    if (!p) return null;
    if (p.pattern || p.p) {
      var r = ProgressUnits.fromProject(p);
      return r.totalUnits > 0 ? r.percent : null;
    }
    if (typeof p.pct === 'number') return p.pct;
    if (p.totalStitches > 0) return ProgressUnits.percent(p.completedStitches || 0, p.totalStitches);
    return null;
  }

  // "120 × 90" from a library row (dimensions) or a full record (settings).
  function projectSize(p) {
    if (!p) return null;
    if (p.dimensions && p.dimensions.width) return p.dimensions.width + ' × ' + p.dimensions.height;
    if (p.settings && p.settings.sW) return p.settings.sW + ' × ' + p.settings.sH;
    return null;
  }

  // 'new' (nothing marked), 'wip' or 'done'. One marked stitch is enough to be
  // started, even when the percentage still rounds to 0.
  function projectStatus(p) {
    if (!p) return 'new';
    var pct = projectPct(p);
    if (pct !== null && pct >= 100) return 'done';
    var started = (pct !== null && pct > 0) || p.anyProgress || p.completedStitches > 0;
    if (!started && (p.pattern || p.p)) started = ProgressUnits.fromProject(p).doneUnits > 0;
    return started ? 'wip' : 'new';
  }

  // "42%", or "Started" while a started project still rounds to 0%.
  function pctText(pct) {
    return pct > 0 ? pct + '%' : 'Started';
  }

  // What the main button does, said the way it will happen (borrowed from the
  // Workbench proposal: the label follows the project's state).
  function trackLabel(status) {
    if (status === 'new') return 'Start stitching';
    if (status === 'done') return 'Open in Tracker';
    return 'Continue stitching';
  }

  function lastActivity(p) {
    if (!p) return '';
    if (p.lastSessionDate) return 'Last stitched ' + timeAgo(p.lastSessionDate + 'T12:00:00');
    if (p.updatedAt) return 'Updated ' + timeAgo(p.updatedAt);
    return '';
  }

  // Estimated finish for a library row, from the one estimator (helpers.js), worded as everywhere else (estimateText):
  // "Est. about 424 hours, about 4 weeks at your pace".
  // The row carries what it needs (paceDaily, firstActiveDate, activeDaysTotal); rows saved before that have none
  // until the next refresh and show nothing. Returns null when there is not enough history to say.
  function etaLabel(p) {
    if (!p || !p.paceDaily || typeof estimateFromPace !== 'function') return null;
    var today = getStitchingDate(new Date(), getDayEndHour());
    var pace = paceFromDaily(p.paceDaily, p.firstActiveDate, today, p.activeDaysTotal);
    var remaining = (p.totalStitches || 0) - (p.completedStitches || 0);
    var est = estimateFromPace(pace, remaining, { today: today, percent: p.pct });
    return est.enough ? 'Est. ' + estimateText(p.stitchesPerHour > 0 ? remaining / p.stitchesPerHour : 0, est.calendarDaysRemaining) : null;
  }

  function activateAndGo(id, href) {
    try {
      if (window.ProjectStorage && window.ProjectStorage.setActiveProject) {
        window.ProjectStorage.setActiveProject(id);
      }
    } catch (_) {}
    // Prevent the self-heal in refreshAll from clearing the active-project
    // pointer while the IDB query started by cs:projectsChanged is still
    // in flight (React cleanup doesn't run during window.location.href
    // navigation, so the !cancelled guard alone is not sufficient).
    window.__navigatingAway = true;
    // ?from=home tells the per-tool page's redirect-to-home guard to stand down.
    // ?id=<projectId> is passed as a belt-and-suspenders fallback so the
    // destination page can recover the correct project even if the
    // localStorage active-project pointer is cleared during the async
    // navigation (race between the cs:projectsChanged IDB callback and the
    // page unload).
    var sep = href.indexOf('?') === -1 ? '?' : '&';
    window.location.href = href + sep + 'from=home&id=' + encodeURIComponent(id);
  }

  function activateAndGoExport(id) {
    try {
      if (window.ProjectStorage && window.ProjectStorage.setActiveProject) {
        window.ProjectStorage.setActiveProject(id);
      }
    } catch (_) {}
    try {
      localStorage.setItem('cs_pref_creator.lastPage', JSON.stringify('materials'));
      localStorage.setItem('cs_pref_creator.materialsTab', JSON.stringify('output'));
    } catch (_) {}
    window.__navigatingAway = true;
    window.location.href = 'create.html?from=home&id=' + encodeURIComponent(id);
  }

  function openChartUpdate(id) {
    window.ChartUpdates.open(id).catch(function (e) { window.Toast.show({ message: e.message, type: 'error' }); });
  }

  function openHelp(opts) {
    if (window.HelpDrawer && typeof window.HelpDrawer.open === 'function') window.HelpDrawer.open(opts || {});
  }

  function downloadBackup() {
    if (!window.BackupRestore) return;
    window.BackupRestore.downloadBackup().catch(function (e) {
      if (window.Toast) window.Toast.show({ message: 'Backup failed: ' + e.message, type: 'error' });
    });
  }

  // ── Pattern previews ────────────────────────────────────────────────────
  // Library rows leave out the pattern so listProjects() stays cheap. Each card
  // fetches its project once (the same approach as home-screen.js) and draws it
  // with PartialStitchThumb, which ghosts unstitched cells. Shared across
  // re-renders; cleared when a project changes.
  var thumbPayloads = new Map();
  function HomeThumb(props) {
    var id = props.id;
    var stamp = props.stamp || '';
    var key = id + '|' + stamp;
    var st = React.useState(function () { return thumbPayloads.get(key) || null; });
    var payload = st[0]; var setPayload = st[1];
    React.useEffect(function () {
      var cached = thumbPayloads.get(key);
      if (cached) { setPayload(cached); return; }
      if (!window.ProjectStorage || !window.ProjectStorage.get) return;
      var cancelled = false;
      window.ProjectStorage.get(id).then(function (full) {
        if (cancelled || !full || !full.pattern) return;
        var w = full.w || (full.settings && full.settings.sW) || 0;
        var ht = full.h || (full.settings && full.settings.sH) || 0;
        var p = { pattern: full.pattern, done: full.done, w: w, h: ht };
        thumbPayloads.set(key, p);
        setPayload(p);
      }).catch(function () {});
      return function () { cancelled = true; };
    }, [key]);
    var cls = 'home-thumb' + (props.className ? ' ' + props.className : '');
    if (payload && payload.pattern && payload.w && payload.h && window.PartialStitchThumb) {
      return h('span', { className: cls },
        h(window.PartialStitchThumb, {
          pattern: payload.pattern, done: payload.done, w: payload.w, h: payload.h,
          size: props.size || 240, projectId: id, className: 'home-thumb__img', alt: ''
        }));
    }
    return h('span', { className: cls + ' home-thumb--empty', 'aria-hidden': 'true' }, icon('frame'));
  }

  // ── More menu ───────────────────────────────────────────────────────────
  // A small menu button: Escape and outside clicks close it, arrow keys move
  // between items, and focus goes back to the button when it closes.
  function HomeMenu(props) {
    var st = React.useState(false);
    var open = st[0]; var setOpen = st[1];
    var wrapRef = React.useRef(null);
    var btnRef = React.useRef(null);
    var listRef = React.useRef(null);
    React.useEffect(function () {
      if (!open) return;
      function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
      function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); if (btnRef.current) btnRef.current.focus(); }
      }
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('touchstart', onDoc);
      document.addEventListener('keydown', onKey, true);
      var first = listRef.current && listRef.current.querySelector('[role="menuitem"]');
      if (first) first.focus();
      return function () {
        document.removeEventListener('mousedown', onDoc);
        document.removeEventListener('touchstart', onDoc);
        document.removeEventListener('keydown', onKey, true);
      };
    }, [open]);
    function onListKey(e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      var items = Array.prototype.slice.call(listRef.current.querySelectorAll('[role="menuitem"]'));
      var i = items.indexOf(document.activeElement);
      var next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
        : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      e.preventDefault();
      if (items[next]) items[next].focus();
    }
    return h('div', { className: 'home-menu' + (props.className ? ' ' + props.className : ''), ref: wrapRef },
      h('button', {
        type: 'button',
        ref: btnRef,
        className: 'btn btn-sm home-menu__btn',
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        'aria-label': props.label,
        title: props.label,
        onClick: function () { setOpen(!open); }
      }, icon('more')),
      open && h('div', { className: 'home-menu__list', role: 'menu', 'aria-label': props.label, ref: listRef, onKeyDown: onListKey },
        props.items.filter(Boolean).map(function (it) {
          return h('button', {
            key: it.key || it.label,
            type: 'button',
            role: 'menuitem',
            className: 'home-menu__item',
            onClick: function () { setOpen(false); it.onClick(); }
          },
            h('span', { className: 'home-menu__icon', 'aria-hidden': 'true' }, icon(it.icon)),
            h('span', { className: 'home-menu__text' }, it.label, it.hint ? h('small', null, it.hint) : null)
          );
        })
      )
    );
  }

  function projectMenuItems(p, status, onDetails) {
    return [
      { key: 'track', label: trackLabel(status), icon: 'needle', onClick: function () { activateAndGo(p.id, 'stitch.html'); } },
      { key: 'edit', label: 'Edit pattern', icon: 'pencil', onClick: function () { activateAndGo(p.id, 'create.html'); } },
      { key: 'export', label: 'Export or print', icon: 'printer', onClick: function () { activateAndGoExport(p.id); } },
      { key: 'update', label: 'Update chart', hint: 'Re-import a corrected version of this chart', icon: 'refresh', onClick: function () { openChartUpdate(p.id); } },
      { key: 'details', label: 'Project details', icon: 'info', onClick: function () { onDetails(p); } }
    ];
  }

  // ── Project details dialog ──────────────────────────────────────────────
  function ProjectDetails(props) {
    var p = props.project;
    var pct = projectPct(p);
    var rows = [];
    var size = projectSize(p);
    if (size) rows.push(['Size', size + ' stitches']);
    var fabric = p.fabricCt || (p.settings && p.settings.fabricCt);
    if (fabric) rows.push(['Fabric', fabric + ' count']);
    if (pct !== null && p.totalStitches > 0) {
      rows.push(['Progress', pct + '% (' + ProgressUnits.formatUnits(p.completedStitches || 0) + ' of ' + ProgressUnits.formatUnits(p.totalStitches) + ' stitches)']);
    } else if (pct !== null) {
      rows.push(['Progress', pct + '%']);
    }
    var eta = etaLabel(p);
    if (eta) rows.push(['Estimate', eta.replace(/^Est\. /, '')]);
    if (p.totalMinutes > 0) rows.push(['Time stitched', window.fmtTimeL ? window.fmtTimeL(p.totalMinutes * 60) : Math.round(p.totalMinutes / 60) + ' hours']);
    if (p.lastSessionDate) rows.push(['Last stitched', timeAgo(p.lastSessionDate + 'T12:00:00')]);
    if (p.createdAt) rows.push(['Created', new Date(p.createdAt).toLocaleDateString('en-GB')]);
    if (p.updatedAt) rows.push(['Last saved', timeAgo(p.updatedAt)]);
    return h(window.Overlay, { onClose: props.onClose, variant: 'dialog', maxWidth: 420, labelledBy: 'home-details-title', zIndex: 1200 },
      h('div', { className: 'home-dialog' },
        h('h2', { id: 'home-details-title', className: 'home-dialog__title' }, p.name || 'Untitled project'),
        h('dl', { className: 'home-details' },
          rows.map(function (r) { return h(React.Fragment, { key: r[0] }, h('dt', null, r[0]), h('dd', null, r[1])); })
        )
      ),
      h(window.Overlay.CloseButton, { onClose: props.onClose })
    );
  }

  // ── "What's in this picture?" ───────────────────────────────────────────
  // Asked only when it's unclear what a picture is for: a dropped picture, or
  // one chosen under "A pattern I already have". The printed-chart caveat is
  // shown to the people it applies to, instead of to everyone up front (F6).
  function PhotoQuestion(props) {
    var st = React.useState('ask');
    var step = st[0]; var setStep = st[1];
    var name = (props.file && props.file.name) || 'picture';
    var body;
    if (step === 'ask') {
      body = h(React.Fragment, null,
        h('h2', { id: 'home-photo-q-title', className: 'home-dialog__title' }, 'What’s in this picture?'),
        h('p', { className: 'home-dialog__file' }, h('span', { 'aria-hidden': 'true' }, icon('image')), name),
        h('div', { className: 'home-choice-list' },
          h('button', { type: 'button', className: 'home-choice', onClick: props.onConvert },
            h('span', { className: 'home-choice__art', 'aria-hidden': 'true' }, icon('image')),
            h('span', null, h('strong', null, 'Something to turn into a pattern'), h('small', null, 'A photo, drawing or piece of artwork'))),
          h('button', { type: 'button', className: 'home-choice', onClick: function () { setStep('chart'); } },
            h('span', { className: 'home-choice__art', 'aria-hidden': 'true' }, icon('document')),
            h('span', null, h('strong', null, 'A printed chart'), h('small', null, 'A photo or scan of a pattern from a book, magazine or kit')))
        )
      );
    } else {
      body = h(React.Fragment, null,
        h('h2', { id: 'home-photo-q-title', className: 'home-dialog__title' }, 'Printed charts can’t be read from a photo yet'),
        h('p', { className: 'home-dialog__text' }, 'stitchx can’t pick out the grid, symbols and thread key in a photo. If you bought this pattern as a PDF or chart file, open that instead and every stitch and thread comes across.'),
        h('div', { className: 'home-dialog__actions' },
          h('button', { type: 'button', className: 'btn', onClick: props.onConvert }, 'Convert it as a picture anyway'),
          h('button', { type: 'button', className: 'btn btn-primary', onClick: props.onChooseChart }, 'Choose a chart file')
        )
      );
    }
    return h(window.Overlay, { onClose: props.onClose, variant: 'sheet', maxWidth: 460, labelledBy: 'home-photo-q-title', zIndex: 1200 },
      h('div', { className: 'home-dialog' }, body),
      h(window.Overlay.CloseButton, { onClose: props.onClose })
    );
  }

  // ── Creating: pickers, drops and the hand-off to the Creator ────────────
  // "A photo or picture": opens the picture picker in the same user gesture as
  // the click (so the browser allows it), stores the file in IndexedDB, then
  // navigates to create.html?action=home-image-pending where creator-main.js
  // picks it up without a second click.
  // "A pattern I already have": opens the chart picker; the import engine
  // reviews the file on this page.
  // "A blank canvas": create.html?action=new-blank.
  function useCreateFlow() {
    var fileInputRef = React.useRef(null);
    var importInputRef = React.useRef(null);
    var pendingState = React.useState(false);
    var pending = pendingState[0]; var setPending = pendingState[1];
    var dragState = React.useState(false);
    var dragging = dragState[0]; var setDragging = dragState[1];
    var askState = React.useState(null);
    var askFile = askState[0]; var setAskFile = askState[1];

    // bfcache restore: if the user lands back on /home via the browser back
    // button after a successful image handoff, the spinner state from the
    // previous render must not persist. `pageshow` fires whether the page
    // came from bfcache or a fresh navigation.
    React.useEffect(function () {
      function reset() { setPending(false); }
      window.addEventListener('pageshow', reset);
      return function () { window.removeEventListener('pageshow', reset); };
    }, []);

    function pickPicture() { var input = fileInputRef.current; if (input) input.click(); }
    function pickChart() { var input = importInputRef.current; if (input) input.click(); }

    function navigateAfterPaint(href) {
      // One rAF lets the spinner paint, then queueMicrotask (or setTimeout
      // fallback) defers the navigation until after the paint commits.
      // Double-rAF timing differs between Safari and Chromium; this approach
      // is more consistent across engines.
      requestAnimationFrame(function () {
        if (typeof queueMicrotask === 'function') {
          queueMicrotask(function () { window.location.href = href; });
        } else {
          setTimeout(function () { window.location.href = href; }, 0);
        }
      });
    }

    // Which kind of file this is: 'image', 'pattern' or 'unsupported'
    // (import-engine/ui/importErrors.js), with a fallback by extension.
    function classify(file) {
      var IE = window.ImportEngine;
      if (IE && typeof IE.classifyFileForCreate === 'function') return IE.classifyFileForCreate(file);
      if ((file.type || '').indexOf('image/') === 0) return 'image';
      return /\.(pat|oxs|xml|json|pdf|xsd)$/i.test(file.name || '') ? 'pattern' : 'unsupported';
    }

    // Each card has its own picker (audit COMMON-04). A chart chosen as a
    // picture is offered to the importer rather than silently rerouted; a
    // picture chosen as a chart gets the "What's in this picture?" question.
    function handlePhotoChange(e) { takeFile(e, 'photo'); }
    function handleImportChange(e) { takeFile(e, 'import'); }
    function takeFile(e, tile) {
      var file = e.target.files && e.target.files[0];
      // Reset so the same file can be re-selected if needed
      e.target.value = '';
      if (!file) return;
      routeFile(file, tile);
    }
    function routeFile(file, tile) {
      var kind = classify(file);
      if (kind === 'unsupported') return startFile(file);
      if (kind === 'image' && tile !== 'photo') { setAskFile(file); return; }
      if (tile === 'photo' && kind === 'pattern') {
        var CD = window.ConfirmDialog;
        var msg = 'This looks like a chart file. Import it instead?';
        var answer = CD && typeof CD.show === 'function'
          ? CD.show({ title: 'This looks like a chart file', message: msg, confirmLabel: 'Import', cancelLabel: 'Cancel' })
          : Promise.resolve(window.confirm(msg));
        answer.then(function (ok) { if (ok) startFile(file); });
        return;
      }
      startFile(file);
    }

    function onDragOver(e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
      e.preventDefault();
      if (!dragging) setDragging(true);
    }
    function onDragLeave(e) {
      if (e.currentTarget.contains && e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
      setDragging(false);
    }
    // Dropping a file anywhere on Home: charts are imported, pictures get the
    // "What's in this picture?" question first (routeFile).
    function onDrop(e) {
      e.preventDefault();
      setDragging(false);
      if (pending) return;
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (classify(file) === 'image') { setAskFile(file); return; }
      startFile(file);
    }

    function startFile(file) {
      // Route non-image pattern files through the new import engine. Files
      // from other design programs (.pat, .xsp …) and anything else
      // that isn't an image stay on Home with a plain-English message
      // (audit IMPORT-05) instead of failing in the image converter.
      var name = (file.name || '').toLowerCase();
      var IE = window.ImportEngine;
      if (IE && typeof IE.classifyFileForCreate === 'function' && IE.classifyFileForCreate(file) === 'unsupported') {
        var unsupported = new Error('Unsupported file type: ' + file.name);
        unsupported.name = 'ImportUnsupportedError';
        if (typeof IE.showImportError === 'function') IE.showImportError(unsupported, file.name);
        return;
      }
      var isImage = !/\.(pat|xsd)$/i.test(name) && (file.type || '').indexOf('image/') === 0;
      var isPattern = /\.(pat|oxs|xml|json|pdf|xsd)$/i.test(name);
      if (!isImage && isPattern && window.ImportEngine && typeof window.ImportEngine.openImportPicker === 'function') {
        // We already have the file — call importAndReview directly so the
        // user doesn't have to pick it again.
        try { console.log('[home] routing pattern file to ImportEngine:', name, '— ImportEngine.__build =', window.ImportEngine.__build || 'unknown'); } catch (_) {}
        setPending(true);
        window.ImportEngine.importAndReview(file).catch(function (err) {
          console.error('[home] importAndReview rejected:', err);
          // The engine has usually shown its own friendly toast already.
          if (err && err.__importToastShown) return;
          if (window.ImportEngine && typeof window.ImportEngine.showImportError === 'function') {
            window.ImportEngine.showImportError(err, file.name);
          } else if (window.Toast && window.Toast.show) {
            window.Toast.show({ message: 'Something went wrong importing this file.', type: 'error', duration: 10000 });
          }
        }).finally(function () { setPending(false); });
        return;
      }
      // Hand the picture to the Creator through IndexedDB (audit COMMON-07):
      // no size limit, unlike the old sessionStorage data URL, which is kept
      // below only for browsers without IndexedDB.
      var BS = window.BlobStore;
      if (BS && BS.available()) {
        setPending(true);
        handOffImage(file).catch(function (err) {
          console.warn('[home] IndexedDB handoff failed; using sessionStorage:', err);
          setPending(false);
          handOffViaSession(file);
        });
        return;
      }
      handOffViaSession(file);
    }

    // Very large photos are scaled down before the handoff (conversion never
    // uses more than 500 stitches across, so 4000 px is plenty).
    var MAX_HANDOFF_PX = 4000;
    function downscaleIfHuge(file) {
      if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return Promise.resolve(file);
      return createImageBitmap(file).then(function (bmp) {
        var long = Math.max(bmp.width, bmp.height);
        if (long <= MAX_HANDOFF_PX) { if (bmp.close) bmp.close(); return file; }
        var k = MAX_HANDOFF_PX / long;
        var cnv = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
        cnv.getContext('2d').drawImage(bmp, 0, 0, cnv.width, cnv.height);
        if (bmp.close) bmp.close();
        return cnv.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      }).catch(function () { return file; });
    }

    function handOffImage(file) {
      var BS = window.BlobStore;
      var id = BS.newId('handoff');
      return downscaleIfHuge(file).then(function (blob) {
        return BS.put(id, { blob: blob, name: file.name || 'image.jpg', type: blob.type || file.type || 'image/jpeg', createdAt: Date.now() });
      }).then(function () {
        // Reload-safety marker: lets the Creator find the picture again if a
        // service-worker reload strips ?handoff= from the URL.
        try { sessionStorage.setItem('cs_pending_image_handoff', id); } catch (_) {}
        navigateAfterPaint('create.html?action=home-image-pending&from=home&handoff=' + encodeURIComponent(id));
      });
    }

    function handOffViaSession(file) {
      var reader = new FileReader();
      // Guard against very large images (> 4 MB raw) that would overflow the
      // ~5 MB sessionStorage quota once base64-encoded. Prompt the user to
      // resize before uploading rather than failing silently mid-navigation.
      var MAX_IMAGE_BYTES = 4 * 1024 * 1024;
      if (file.size > MAX_IMAGE_BYTES) {
        if (window.Toast && window.Toast.show) {
          window.Toast.show({ message: 'That image is too large to load from here (over 4 MB). Please resize it first or load it directly from the pattern creator.', type: 'error', duration: 10000 });
        } else {
          alert('That image is too large to load from here (over 4 MB). Please resize it first or load it directly from the pattern creator.');
        }
        return;
      }
      reader.onload = function (ev) {
        var dataUrl = ev.target.result;
        try {
          sessionStorage.setItem('cs_pending_image_dataurl', dataUrl);
          sessionStorage.setItem('cs_pending_image_name', file.name);
          sessionStorage.setItem('cs_pending_image_type', file.type || 'image/jpeg');
          // INT-6: timestamp the handoff so the Creator can reject
          // a stale dataURL that was abandoned in sessionStorage by an
          // earlier navigation the user aborted. Without this, opening
          // create.html via a different entry point hours later would
          // silently consume the old image as if just chosen.
          sessionStorage.setItem('cs_pending_image_ts', String(Date.now()));
          setPending(true);
          navigateAfterPaint('create.html?action=home-image-pending&from=home');
        } catch (_) {
          // sessionStorage quota exceeded (very large image): the in-page
          // file -> Creator handoff is impossible. Surface the failure
          // immediately instead of bouncing through create.html with no
          // image, which would just round-trip back to here.
          setPending(false);
          if (window.Toast && window.Toast.show) {
            window.Toast.show({ message: 'That image is too large to hand off (over the browser session limit). Please use a smaller file.', type: 'error', duration: 10000 });
          } else {
            alert('That image is too large to hand off (over the browser session limit). Try a smaller file (under ~5 MB).');
          }
        }
      };
      reader.onerror = function () {
        setPending(false);
        if (window.Toast && window.Toast.show) {
          window.Toast.show({ message: 'Could not read the image file. Please try again or pick a different file.', type: 'error', duration: 8000 });
        } else {
          alert('Could not read the image file. Please try again or pick a different file.');
        }
      };
      reader.readAsDataURL(file);
    }

    var accept = function (list) { return window.Platform ? window.Platform.fileAccept(list) : list; };
    // One picker per card. ".oxs" resolves to no UTI on iOS and would grey
    // out the whole Files picker; Platform.fileAccept drops the filter
    // there and keeps it everywhere else (tests/platformCapabilities.test.js).
    var inputs = h(React.Fragment, null,
      h('input', {
        ref: fileInputRef, type: 'file', accept: accept('image/*'),
        className: 'home-create-file-input', onChange: handlePhotoChange, 'aria-hidden': 'true', tabIndex: -1
      }),
      h('input', {
        ref: importInputRef, type: 'file', accept: accept('.pdf,.pat,.oxs,.xsd,.xml,.json'),
        className: 'home-import-file-input', onChange: handleImportChange, 'aria-hidden': 'true', tabIndex: -1
      })
    );
    // Shown between the file being read and the Creator taking over, so the
    // page change doesn't feel like a teleport.
    var overlays = h(React.Fragment, null,
      pending && h('div', { className: 'home-create-pending', role: 'status', 'aria-live': 'polite' },
        h('div', { className: 'home-create-pending__spinner', 'aria-hidden': 'true' }),
        h('div', { className: 'home-create-pending__msg' }, 'Preparing your file…')
      ),
      dragging && h('div', { className: 'home-drop-hint', 'aria-hidden': 'true' },
        h('span', null, icon('upload'), 'Drop to open a pattern or a picture')),
      askFile && window.Overlay && h(PhotoQuestion, {
        file: askFile,
        onClose: function () { setAskFile(null); },
        onConvert: function () { var f = askFile; setAskFile(null); startFile(f); },
        onChooseChart: function () { setAskFile(null); pickChart(); }
      })
    );
    return {
      pickPicture: pickPicture,
      pickChart: pickChart,
      pending: pending,
      inputs: inputs,
      overlays: overlays,
      dropProps: { onDragOver: onDragOver, onDragEnter: onDragOver, onDragLeave: onDragLeave, onDrop: onDrop }
    };
  }

  // ── Start cards ─────────────────────────────────────────────────────────
  // Named after what the user has in hand, not which tool they need (F5).
  // Equal weight: Home doesn't know which one they want (F7).
  var INTENTS = [
    { key: 'chart', icon: 'document', title: 'A pattern I already have',
      desc: 'Bought or downloaded a chart? Open it here and tick off stitches as you go.',
      foot: 'PDF and most chart files', go: 'Open a pattern', short: 'PDF and chart files', onboard: 'home-import-chart' },
    { key: 'picture', icon: 'image', title: 'A photo or picture',
      desc: 'Turn it into a pattern using real DMC or Anchor thread colours.',
      foot: 'Photos, drawings, artwork', go: 'Choose a picture', short: 'Turn it into a pattern', onboard: 'home-from-image' },
    { key: 'blank', icon: 'pencil', title: 'A blank canvas',
      desc: 'Design your own pattern stitch by stitch, at any size.',
      foot: 'Pick a size and fabric', go: 'Start drawing', short: 'Draw your own' }
  ];

  function IntentCards(props) {
    var flow = props.flow;
    var compact = !!props.compact;
    return h('div', { className: compact ? 'home-intents home-intents--compact' : 'home-intents' },
      INTENTS.map(function (it) {
        var inner = compact
          ? [h('span', { key: 'a', className: 'home-intent__art', 'aria-hidden': 'true' }, icon(it.icon)),
             h('span', { key: 't', className: 'home-intent__copy' }, h('strong', null, it.title), h('small', null, it.short))]
          : [h('span', { key: 'a', className: 'home-intent__art', 'aria-hidden': 'true' }, icon(it.icon)),
             h('strong', { key: 't', className: 'home-intent__title' }, it.title),
             h('span', { key: 'd', className: 'home-intent__desc' }, it.desc),
             h('span', { key: 'f', className: 'home-intent__foot' },
               h('span', null, it.foot),
               h('span', { className: 'home-intent__go' }, it.go, h('span', { 'aria-hidden': 'true' }, icon('chevronRight'))))];
        var common = { key: it.key, className: 'home-intent' + (flow.pending ? ' home-intent--disabled' : '') };
        if (it.key === 'blank') {
          return h('a', Object.assign(common, {
            href: 'create.html?action=new-blank',
            'aria-disabled': flow.pending ? 'true' : undefined,
            onClick: flow.pending ? function (e) { e.preventDefault(); } : undefined
          }), inner);
        }
        return h('button', Object.assign(common, {
          type: 'button',
          disabled: flow.pending,
          'data-onboard': compact ? undefined : it.onboard,
          onClick: it.key === 'chart' ? flow.pickChart : flow.pickPicture
        }), inner);
      })
    );
  }

  // "Which files work?" — the one place formats and the printed-chart caveat
  // are explained (F6).
  function FilesHelp() {
    var st = React.useState(false);
    var open = st[0]; var setOpen = st[1];
    return h(React.Fragment, null,
      h('div', { className: 'home-below-cards' },
        h('span', { className: 'home-below-cards__drop' }, h('span', { 'aria-hidden': 'true' }, icon('upload')), 'You can also drop a file anywhere on this page.'),
        h('button', {
          type: 'button', className: 'home-link', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'home-files-help',
          onClick: function () { setOpen(!open); }
        }, 'Which files work?')
      ),
      h('dl', { id: 'home-files-help', className: 'home-files-help', hidden: !open },
        h('dt', null, 'Patterns'),
        h('dd', null, 'PDF charts, Open X-Stitch (.oxs), Pattern Maker (.xsd), PCStitch 7 (.pat) and saved stitchx projects (.json).'),
        h('dt', null, 'Pictures'),
        h('dd', null, 'JPG, PNG, GIF, WebP or BMP. A photo of a printed chart can’t be read yet: if you bought the pattern, open the PDF instead.'),
        h('dd', { className: 'home-files-help__more' },
          h('button', { type: 'button', className: 'home-link', onClick: function () { openHelp({ topic: 'creator', section: 'What can I import?' }); } }, 'More about importing'))
      )
    );
  }

  // ── Practice pattern ────────────────────────────────────────────────────
  // Deliberately memory-only: practice never enters project, session, sync or stash storage.
  function SampleProject() {
    var rows = ['..AA....', '.ABBA...', '.ABBA...', '..AA....', '...C..C.', '.C.C.C..', '..CCC...', '...C....'];
    var colours = { A: { id: '321', name: 'Red' }, B: { id: '444', name: 'Lemon' }, C: { id: '700', name: 'Green' } };
    var threadName = function (t) { return window.formatThread ? window.formatThread(t) : 'DMC ' + t.id + ' ' + t.name; };
    var doneState = React.useState([]), done = doneState[0], setDone = doneState[1];
    var historyState = React.useState([]), history = historyState[0], setHistory = historyState[1];
    var selectedState = React.useState('A'), selected = selectedState[0], setSelected = selectedState[1];
    var cells = rows.join('').split('');
    var total = cells.filter(function (c) { return c !== '.'; }).length;
    function mark(i) {
      setHistory(function (h) { return h.concat([done]); });
      setDone(function (d) { return d.indexOf(i) < 0 ? d.concat(i) : d.filter(function (n) { return n !== i; }); });
    }
    var next = cells.findIndex(function (c, i) { return c === selected && done.indexOf(i) < 0; });
    return h('details', { className: 'home-sample' },
      h('summary', { className: 'btn' }, icon('play'), 'Try the practice pattern'),
      h('div', { className: 'home-sample__body' },
        h('h3', null, 'Practice tracking: Little flower'),
        h('p', null, 'Choose a thread, then tap its stitches to mark or unmark them. Or use Mark next stitch. This practice stays on this page only; it never changes your projects, progress, sessions or thread inventory.'),
        h('div', { className: 'home-sample__threads', role: 'group', 'aria-label': 'Sample threads' },
          Object.keys(colours).map(function (key) {
            return h('button', { key: key, type: 'button', className: 'btn', 'aria-pressed': selected === key,
              onClick: function () { setSelected(key); } }, key + ' · ' + threadName(colours[key]));
          })),
        h('div', { className: 'home-sample__chart', role: 'group', 'aria-label': 'Sample chart, 8 by 8 stitches' },
          cells.map(function (c, i) {
            var marked = done.indexOf(i) >= 0;
            if (c === '.') return h('span', { key: i, 'aria-hidden': 'true' });
            return h('button', { key: i, type: 'button', className: 'home-sample__cell home-sample__cell--' + c,
              'aria-label': 'Row ' + (Math.floor(i / 8) + 1) + ', column ' + (i % 8 + 1) + ', ' + threadName(colours[c]),
              'aria-pressed': marked, disabled: c !== selected,
              onClick: function () { mark(i); } }, marked ? h('span', { 'aria-hidden': 'true' }, icon('check')) : c);
          })),
        h('p', { role: 'status', 'aria-live': 'polite' }, done.length + ' of ' + total + ' stitches marked (' + Math.round(done.length / total * 100) + '%).'),
        next < 0 && h('p', null, done.length === total ? 'Sample complete. You can unmark a stitch or undo a mark to practise corrections.' : 'All stitches for ' + selected + ' are marked. Choose another thread to continue.'),
        h('div', { className: 'home-sample__threads' },
          h('button', { type: 'button', className: 'btn btn-primary', disabled: next < 0, onClick: function () { mark(next); } }, 'Mark next stitch'),
          h('button', { type: 'button', className: 'btn', disabled: !history.length, onClick: function () {
            setDone(history[history.length - 1]); setHistory(history.slice(0, -1));
          } }, 'Undo sample mark')),
        h('p', null, 'Ready for your own? Pick one of the three cards above. The Stitch Tracker adds zoom, marking tools, sessions and saved progress.')
      )
    );
  }

  function PracticeCard() {
    return h('section', { className: 'home-card home-practice', 'aria-labelledby': 'home-practice-title' },
      h('div', { className: 'home-practice__head' },
        h('span', { className: 'home-practice__art', 'aria-hidden': 'true' }, icon('needle')),
        h('div', null,
          h('h2', { id: 'home-practice-title', className: 'home-practice__title' }, 'Not sure yet? Try a practice pattern.'),
          h('p', { className: 'home-muted' }, 'A small flower you can mark stitch by stitch, right here. It’s practice only: nothing is saved.')
        )
      ),
      h(SampleProject, null)
    );
  }

  // ── First visit ─────────────────────────────────────────────────────────
  function Hero() {
    return h('section', { className: 'home-hero', 'aria-labelledby': 'home-hero-title' },
      h('h1', { id: 'home-hero-title', className: 'home-hero__title' }, 'Make, follow and track cross-stitch patterns.'),
      h('p', { className: 'home-hero__lede' }, 'Turn a picture into a pattern, stitch from a chart you already own, and keep count of every stitch and every skein.'),
      h('ul', { className: 'home-hero__trust' },
        ['Free, no account needed', 'Saves automatically on this device', 'Nothing is uploaded unless you turn on sync'].map(function (t) {
          return h('li', { key: t }, h('span', { 'aria-hidden': 'true' }, icon('check')), t);
        })
      )
    );
  }

  function HowItFits() {
    var tools = [
      { icon: 'pencil', name: 'Pattern Creator', text: 'Turn pictures into patterns or draw your own, then print or export them.' },
      { icon: 'needle', name: 'Stitch Tracker', text: 'Mark stitches as you go, time your sessions and see how long is left.' },
      { icon: 'thread', name: 'Stash Manager', text: 'Record the threads you own and get a shopping list for each pattern.' }
    ];
    return h('section', { className: 'home-section', 'aria-labelledby': 'home-how-title' },
      h('h2', { id: 'home-how-title', className: 'home-section__heading' }, 'How stitchx fits together'),
      h('div', { className: 'home-how' },
        tools.map(function (t) {
          return h('div', { key: t.name, className: 'home-how__item' },
            h('span', { className: 'home-how__art', 'aria-hidden': 'true' }, icon(t.icon)),
            h('strong', null, t.name),
            h('p', null, t.text));
        })
      )
    );
  }

  // ── Returning: Continue card ────────────────────────────────────────────
  function ContinueCard(props) {
    var p = props.project;
    // The library row knows about half stitches and other marks (anyProgress),
    // so the card and the grid agree on whether a project has been started.
    var status = projectStatus(props.meta || p);
    var r = (p.pattern || p.p) ? ProgressUnits.fromProject(p) : null;
    var pct = projectPct(p);
    // ETA from the full project's sessions, memoised by project id/updatedAt so
    // it only recalculates when the data changes.
    var eta = React.useMemo(function () {
      if (!(p.statsSessions && (p.pattern || p.p)) || typeof estimateCompletion !== 'function') return null;
      var rr = ProgressUnits.fromProject(p);
      var est = estimateCompletion(p.statsSessions, rr.remainingUnits, { percent: rr.percent });
      return est.enough ? estimateText(est.hoursRemaining, est.calendarDaysRemaining) : null;
    }, [p.id, p.updatedAt, p.statsSessions, p.pattern, p.p, p.done]);
    var meta = props.meta || p;
    var bits = [];
    if (pct !== null) {
      bits.push(h('span', { key: 'pct' }, h('strong', null, status === 'wip' ? pctText(pct) : pct + '%'),
        r && r.totalUnits > 0 ? ' · ' + ProgressUnits.formatUnits(r.doneUnits) + ' of ' + ProgressUnits.formatUnits(r.totalUnits) + ' stitches' : null));
    }
    var when = lastActivity(meta);
    if (when) bits.push(h('span', { key: 'when' }, h('span', { 'aria-hidden': 'true' }, icon('clock')), when));
    if (eta && status === 'wip') bits.push(h('span', { key: 'eta' }, eta));
    var eyebrow = status === 'new' ? 'Ready to start' : status === 'done' ? 'Finished' : 'Continue where you left off';
    return h('section', { className: 'home-card home-continue', 'aria-labelledby': 'home-continue-title' },
      h(HomeThumb, { id: p.id, stamp: p.updatedAt, size: 320, className: 'home-continue__thumb' }),
      h('div', { className: 'home-continue__body' },
        h('span', { className: 'home-eyebrow' }, eyebrow),
        h('h2', { id: 'home-continue-title', className: 'home-continue__name' }, p.name || 'Untitled project'),
        h('div', { className: 'home-continue__meta' }, bits),
        pct !== null && h('div', { className: 'home-bar home-continue__bar' + (status === 'done' ? ' home-bar--done' : ''), 'aria-hidden': 'true' },
          h('span', { style: { width: pct + '%' } })),
        h('div', { className: 'home-continue__actions' },
          h('button', { type: 'button', className: 'btn btn-primary', onClick: function () { activateAndGo(p.id, 'stitch.html'); } },
            icon('play'), trackLabel(status)),
          h('button', { type: 'button', className: 'btn', onClick: function () { activateAndGo(p.id, 'create.html'); } },
            icon('pencil'), 'Edit pattern'),
          h(HomeMenu, {
            label: 'More actions for ' + (p.name || 'this project'),
            items: projectMenuItems(meta, status, props.onDetails).filter(function (it) { return it.key !== 'track' && it.key !== 'edit'; })
          })
        )
      )
    );
  }

  // ── Returning: project cards ────────────────────────────────────────────
  var FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'wip', label: 'In progress' },
    { key: 'new', label: 'Not started' },
    { key: 'done', label: 'Finished' }
  ];
  var PAGE = 12;

  function ProjectCard(props) {
    var p = props.project;
    var status = projectStatus(p);
    var pct = projectPct(p);
    var size = projectSize(p);
    var name = p.name || 'Untitled';
    var right;
    if (status === 'done') right = h('span', { className: 'home-chip home-chip--ok' }, icon('check'), 'Finished');
    else if (status === 'new') right = h('span', { className: 'home-chip' }, 'Not started');
    else right = h('span', null, (pct !== null ? pctText(pct) : '') + (p.lastSessionDate || p.updatedAt ? ' · ' + timeAgo(p.lastSessionDate ? p.lastSessionDate + 'T12:00:00' : p.updatedAt) : ''));
    return h('article', { className: 'home-card home-pcard', 'data-status': status },
      h('button', {
        type: 'button', className: 'home-pcard__main', title: trackLabel(status) + ': ' + name,
        onClick: function () { activateAndGo(p.id, 'stitch.html'); }
      },
        h(HomeThumb, { id: p.id, stamp: p.updatedAt, size: 240 }),
        h('span', { className: 'home-pcard__name' }, name),
        h('span', { className: 'home-bar' + (status === 'done' ? ' home-bar--done' : ''), 'aria-hidden': 'true' },
          h('span', { style: { width: (pct || 0) + '%' } })),
        h('span', { className: 'home-pcard__row' }, h('span', null, size || ''), right),
        props.ready && status === 'new' && h('span', { className: 'home-chip home-chip--ok home-pcard__ready' }, icon('thread'), 'You own every thread')
      ),
      h(HomeMenu, {
        className: 'home-pcard__menu',
        label: 'More actions for ' + name,
        items: projectMenuItems(p, status, props.onDetails)
      })
    );
  }

  // Pictures set up in Convert but not generated yet (audit COMMON-07). They
  // live in IndexedDB as draft:<id> records (blob-store.js), not as projects,
  // so stats and sync never see them.
  function DraftCard(props) {
    var d = props.draft;
    var name = String(d.name || 'Picture').replace(/\.[a-z0-9]+$/i, '');
    var when = (d.updatedAt || d.createdAt) ? timeAgo(new Date(d.updatedAt || d.createdAt).toISOString()) : '';
    return h('article', { className: 'home-card home-pcard home-draft-row' },
      h('span', { className: 'home-thumb home-thumb--empty', 'aria-hidden': 'true' }, icon('image')),
      h('span', { className: 'home-pcard__name' }, name),
      h('span', { className: 'home-pcard__row' }, h('span', null, 'Picture, not converted yet'), h('span', null, when)),
      h('div', { className: 'home-draft-row__actions' },
        h('button', {
          type: 'button', className: 'btn btn-primary btn-sm',
          onClick: function () {
            window.__navigatingAway = true;
            window.location.href = 'create.html?action=draft&from=home&draft=' + encodeURIComponent(d.id);
          }
        }, 'Continue'),
        h('button', {
          type: 'button', className: 'btn btn-sm',
          'aria-label': 'Discard draft ' + name,
          onClick: function () { props.onDiscard(d.id); }
        }, 'Discard')
      )
    );
  }

  function ProjectGrid(props) {
    var list = props.projects;
    var drafts = props.drafts || [];
    var filterState = React.useState('all');
    var filter = filterState[0]; var setFilter = filterState[1];
    var allState = React.useState(false);
    var showAll = allState[0]; var setShowAll = allState[1];
    var counts = { all: list.length + drafts.length, wip: 0, new: 0, done: 0 };
    list.forEach(function (p) { counts[projectStatus(p)] += 1; });
    var shown = filter === 'all' ? list : list.filter(function (p) { return projectStatus(p) === filter; });
    var total = shown.length;
    var visible = showAll ? shown : shown.slice(0, PAGE);
    return h('section', { className: 'home-section', id: 'home-projects', 'aria-labelledby': 'home-proj-list-title' },
      h('div', { className: 'home-section__head' },
        h('h2', { id: 'home-proj-list-title', className: 'home-section__heading' }, 'Your projects'),
        h('div', { className: 'home-filters', role: 'group', 'aria-label': 'Show projects' },
          FILTERS.filter(function (f) { return f.key === 'all' || counts[f.key] > 0 || filter === f.key; }).map(function (f) {
            return h('button', {
              key: f.key, type: 'button', className: 'home-filter',
              'aria-pressed': filter === f.key ? 'true' : 'false',
              onClick: function () { setFilter(f.key); setShowAll(false); }
            }, f.label, h('span', { className: 'home-filter__n' }, counts[f.key]));
          })
        )
      ),
      h('div', { className: 'home-grid' },
        visible.map(function (p) {
          return h(ProjectCard, { key: p.id, project: p, ready: props.readyIds && props.readyIds[p.id], onDetails: props.onDetails });
        }),
        filter === 'all' && drafts.map(function (d) { return h(DraftCard, { key: d.id, draft: d, onDiscard: props.onDiscardDraft }); })
      ),
      total > PAGE && !showAll && h('button', { type: 'button', className: 'btn home-show-all', onClick: function () { setShowAll(true); } },
        'Show all ' + total + ' projects'),
      props.hiddenDone > 0 && filter === 'all' && h('p', { className: 'home-muted home-small' },
        plural(props.hiddenDone, 'finished project') + ' hidden (Preferences > Home dashboard > Show finished projects in the home list).')
    );
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  // Restore uses the header's restore flow (header.js restoreBackupFromInput),
  // so Home and File > Restore from Backup behave the same.
  function HomeFooter(props) {
    var restoreRef = React.useRef(null);
    return h('footer', { className: 'home-footer' },
      h('button', { type: 'button', className: 'home-footer__link', onClick: function () { openHelp(); } }, 'Help'),
      props.hasProjects
        ? h('button', { type: 'button', className: 'home-footer__link', onClick: downloadBackup }, 'Back up my projects')
        : h(React.Fragment, null,
            h('button', { type: 'button', className: 'home-footer__link', onClick: function () { if (restoreRef.current) restoreRef.current.click(); } }, 'Restore a backup'),
            h('input', {
              ref: restoreRef, type: 'file', className: 'home-footer__file', 'aria-hidden': 'true', tabIndex: -1,
              accept: window.Platform ? window.Platform.fileAccept('.json,.csb,application/json') : '.json,.csb,application/json',
              onChange: function (e) { if (typeof window.restoreBackupFromInput === 'function') window.restoreBackupFromInput(e); }
            })),
      h('button', { type: 'button', className: 'home-footer__link', onClick: props.onAbout }, 'About')
    );
  }

  // ── Root component ──────────────────────────────────────────────────────
  function HomeApp() {
    var activeState = React.useState(null);
    var active = activeState[0]; var setActive = activeState[1];
    var fallbackState = React.useState(null);
    var fallback = fallbackState[0]; var setFallback = fallbackState[1];
    var listState = React.useState(null);
    var list = listState[0]; var setList = listState[1];
    var draftsState = React.useState([]);
    var drafts = draftsState[0]; var setDrafts = draftsState[1];
    var readyState = React.useState({});
    var readyIds = readyState[0]; var setReadyIds = readyState[1];
    var detailsState = React.useState(null);
    var details = detailsState[0]; var setDetails = detailsState[1];
    var prefsState = React.useState(false);
    var prefsOpen = prefsState[0]; var setPrefsOpen = prefsState[1];
    var aboutState = React.useState(false);
    var aboutOpen = aboutState[0]; var setAboutOpen = aboutState[1];
    var flow = useCreateFlow();

    // Listen for cs:openPreferences from the command palette and the Header.
    React.useEffect(function () {
      var open = function () { if (typeof window.PreferencesModal !== 'undefined') setPrefsOpen(true); };
      window.addEventListener('cs:openPreferences', open);
      return function () { window.removeEventListener('cs:openPreferences', open); };
    }, []);

    var refreshAllRef = React.useRef(function () {});
    React.useEffect(function () {
      var cancelled = false;
      function refreshAll() {
        if (window.ProjectStorage && window.ProjectStorage.getActiveProject) {
          window.ProjectStorage.getActiveProject().then(function (p) {
            if (!cancelled) setActive(p || null);
            // Self-heal: if the active-project pointer in localStorage points
            // at a project that no longer exists in IDB (e.g. it was deleted
            // from the Manager, or the IDB write that minted the pointer was
            // interrupted by a page unload), clear the stale pointer so the
            // index.html redirect guard stops sending users to a tool with
            // no project loaded.
            // Guard with !cancelled: if the user clicked Track/Edit and
            // setActiveProject() ran while this IDB query was in-flight,
            // cancelled will be true and we must NOT clear the fresh pointer.
            if (!cancelled && !p && !window.__navigatingAway &&
                window.ProjectStorage.getActiveProjectId &&
                window.ProjectStorage.getActiveProjectId() &&
                window.ProjectStorage.clearActiveProject) {
              try { window.ProjectStorage.clearActiveProject(); } catch (_) {}
            }
          }).catch(function () {});
        }
        if (window.ProjectStorage && window.ProjectStorage.listProjects) {
          window.ProjectStorage.listProjects().then(function (l) {
            if (cancelled) return;
            var sorted = (l || []).slice().sort(function (a, b) {
              var at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
              var bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
              return bt - at;
            });
            setList(sorted);
            // Rows saved before progress counted half stitches get their figures rewritten once, in idle time.
            if (window.ProjectStorage.refreshProgressRows && !window.__progressRowsRefreshing && sorted.some(function (p) { return p && p.unitsV !== window.ProjectStorage.PROGRESS_ROW_VERSION; })) {
              window.__progressRowsRefreshing = true;
              window.ProjectStorage.refreshProgressRows().then(function (n) {
                window.__progressRowsRefreshing = false;
                if (n > 0 && !cancelled) window.ProjectStorage.listProjects().then(function (l2) { if (!cancelled) setList((l2 || []).slice().sort(function (a, b) { return (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) - (a.updatedAt ? new Date(a.updatedAt).getTime() : 0); })); });
              });
            }
            // Once someone has stitched something worth protecting, offer a backup if it has been a while.
            // Same once-per-session gate as the Tracker's, so it never shows twice in a visit.
            if (window.BackupReminder && sorted.some(function (p) { return p && (p.anyProgress || p.completedStitches > 0); })) {
              setTimeout(function () { window.BackupReminder.maybeRemind(); }, 4000);
            }
          }).catch(function () { if (!cancelled) setList([]); });
        } else {
          setList([]);
        }
        loadDrafts();
      }
      function loadDrafts() {
        var BS = window.BlobStore;
        if (!BS || !BS.available()) return;
        BS.list('draft:').then(function (d) { if (!cancelled) setDrafts(d || []); }).catch(function () { if (!cancelled) setDrafts([]); });
      }
      refreshAllRef.current = refreshAll;
      refreshAll();
      return function () { cancelled = true; };
    }, []);

    // Live refresh: keep /home in sync with changes made elsewhere in the app
    // (Tracker saves, backup restore, manager edits in another tab, etc.).
    React.useEffect(function () {
      function reload() { thumbPayloads.clear(); try { refreshAllRef.current(); } catch (_) {} }
      function onVisibility() { if (document.visibilityState === 'visible') reload(); }
      window.addEventListener('cs:projectsChanged', reload);
      window.addEventListener('cs:backupRestored', reload);
      window.addEventListener('cs:patternsChanged', reload);
      window.addEventListener('cs:stashChanged', reload);
      document.addEventListener('visibilitychange', onVisibility);
      return function () {
        window.removeEventListener('cs:projectsChanged', reload);
        window.removeEventListener('cs:backupRestored', reload);
        window.removeEventListener('cs:patternsChanged', reload);
        window.removeEventListener('cs:stashChanged', reload);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }, []);

    // No open project but some saved: continue the most recent unfinished one.
    React.useEffect(function () {
      if (active || !list || !list.length) { setFallback(null); return; }
      var pick = list.find(function (p) { return projectStatus(p) !== 'done'; }) || list[0];
      var cancelled = false;
      window.ProjectStorage.get(pick.id).then(function (full) { if (!cancelled && full) setFallback(full); }).catch(function () {});
      return function () { cancelled = true; };
    }, [active, list]);

    // "You own every thread" on projects not started yet (borrowed from the
    // Workbench proposal). Ready patterns are Stash Manager library entries;
    // linkedProjectId ties them to a project. Loaded only when it can show.
    var unstarted = list ? list.filter(function (p) { return projectStatus(p) === 'new'; }).length : 0;
    React.useEffect(function () {
      if (!unstarted || !window.ProjectStorage || typeof window.ProjectStorage.getProjectsReadyToStart !== 'function') return;
      var cancelled = false;
      Promise.all([
        window.ProjectStorage.getProjectsReadyToStart().catch(function () { return []; }),
        loadManagerPatterns()
      ]).then(function (parts) {
        if (cancelled) return;
        var ready = {};
        (parts[0] || []).forEach(function (r) { if (r && r.pct >= 100) ready[r.id] = true; });
        var ids = {};
        (parts[1] || []).forEach(function (pat) { if (pat && ready[pat.id] && pat.linkedProjectId) ids[pat.linkedProjectId] = true; });
        setReadyIds(ids);
      }).catch(function () {});
      return function () { cancelled = true; };
    }, [unstarted]);

    // Old links (Header, Manager "Add new", command palette, Creator) use
    // ?tab=create and ?tab=projects. Home has no tabs now, so scroll to the
    // matching section once it has rendered.
    var scrolledRef = React.useRef(false);
    React.useEffect(function () {
      if (scrolledRef.current || list === null) return;
      scrolledRef.current = true;
      var t = null;
      try { t = new URLSearchParams(window.location.search).get('tab'); } catch (_) {}
      var target = t === 'create' ? 'home-start-title' : t === 'projects' && list.length ? 'home-proj-list-title' : null;
      if (!target) return;
      requestAnimationFrame(function () {
        var el = document.getElementById(target);
        if (!el) return;
        el.setAttribute('tabindex', '-1');
        if (list.length) el.scrollIntoView({ block: 'start' });
        try { el.focus({ preventScroll: true }); } catch (_) {}
      });
    }, [list]);

    var showCompletedState = React.useState(function () {
      try { var v = window.UserPrefs && window.UserPrefs.get('homeShowCompleted'); return v !== false; }
      catch (_) { return true; }
    });
    var showCompleted = showCompletedState[0];
    var setShowCompleted = showCompletedState[1];
    React.useEffect(function () {
      function onChange(e) {
        if (!e || !e.detail || e.detail.key !== 'homeShowCompleted') return;
        setShowCompleted(e.detail.value !== false);
      }
      window.addEventListener('cs:prefsChanged', onChange);
      return function () { window.removeEventListener('cs:prefsChanged', onChange); };
    }, []);

    function discardDraft(id) {
      window.BlobStore.delete(id).then(function () {
        setDrafts(function (d) { return d.filter(function (x) { return x.id !== id; }); });
      }, function () {});
    }

    var Header = window.Header;
    var loaded = list !== null;
    var projects = list || [];
    var hasProjects = projects.length > 0;
    var gridProjects = projects.filter(function (p) { return showCompleted || projectStatus(p) !== 'done'; });
    var hiddenDone = projects.length - gridProjects.length;
    var current = active || fallback;
    var currentMeta = current ? (projects.find(function (p) { return p.id === current.id; }) || current) : null;
    var inProgress = projects.filter(function (p) { return projectStatus(p) === 'wip'; }).length;
    var welcomeSub = [
      inProgress ? plural(inProgress, 'project') + ' on the go' : plural(projects.length, 'project'),
      drafts.length ? plural(drafts.length, 'picture') + ' waiting to be converted' : null
    ].filter(Boolean).join(' and ') + '.';

    return h('div', { className: 'home-shell' },
      Header
        ? h(Header, {
            page: 'home',
            tab: 'home',
            activeProject: active,
            onPreferences: function () {
              try { window.dispatchEvent(new CustomEvent('cs:openPreferences')); } catch (_) {}
            }
          })
        : null,
      h('div', Object.assign({ className: 'home-page' }, flow.dropProps),
        flow.inputs,
        loaded && !hasProjects && h(React.Fragment, null,
          h(Hero, null),
          h('section', { className: 'home-section', 'aria-labelledby': 'home-start-title' },
            h('h2', { id: 'home-start-title', className: 'home-section__heading' }, 'What are you starting with?'),
            h(IntentCards, { flow: flow }),
            h(FilesHelp, null)
          ),
          drafts.length > 0 && h('section', { className: 'home-section', 'aria-labelledby': 'home-drafts-title' },
            h('h2', { id: 'home-drafts-title', className: 'home-section__heading' }, 'Pictures not converted yet'),
            h('div', { className: 'home-grid' }, drafts.map(function (d) { return h(DraftCard, { key: d.id, draft: d, onDiscard: discardDraft }); }))
          ),
          h(PracticeCard, null),
          h(HowItFits, null)
        ),
        loaded && hasProjects && h(React.Fragment, null,
          h('section', { className: 'home-welcome' },
            h('h1', { className: 'home-welcome__title' }, 'Welcome back'),
            h('p', { className: 'home-muted' }, welcomeSub)
          ),
          h('section', { className: 'home-section', 'aria-labelledby': 'home-start-title' },
            h('h2', { id: 'home-start-title', className: 'home-section__heading' }, 'Start something new'),
            h(IntentCards, { flow: flow, compact: true }),
            h(FilesHelp, null)
          ),
          current && h(ContinueCard, { project: current, meta: currentMeta, onDetails: setDetails }),
          h(ProjectGrid, {
            projects: gridProjects, drafts: drafts, readyIds: readyIds, hiddenDone: hiddenDone,
            onDetails: setDetails, onDiscardDraft: discardDraft
          })
        ),
        loaded && h(HomeFooter, { hasProjects: hasProjects, onAbout: function () { setAboutOpen(true); } }),
        flow.overlays
      ),
      details && window.Overlay && h(ProjectDetails, { project: details, onClose: function () { setDetails(null); } }),
      prefsOpen && typeof window.PreferencesModal !== 'undefined'
        ? h(window.PreferencesModal, { onClose: function () { setPrefsOpen(false); } })
        : null,
      aboutOpen && typeof SharedModals !== 'undefined' && SharedModals.About
        ? h(SharedModals.About, { onClose: function () { setAboutOpen(false); } })
        : null
    );
  }

  // Patterns live in the manager IndexedDB under manager_state/"patterns".
  // StashBridge has no public read for the pattern library, so read the raw
  // row (as home-screen.js does). The database is opened via the canonical
  // versionless window.openManagerDB() helper (tests/managerDbOpener.test.js).
  function loadManagerPatterns() {
    return new Promise(function (resolve) {
      try {
        window.openManagerDB().then(function (db) {
          try {
            if (!db.objectStoreNames.contains('manager_state')) { resolve([]); return; }
            var tx = db.transaction('manager_state', 'readonly');
            var store = tx.objectStore('manager_state');
            var r = store.get('patterns');
            r.onsuccess = function () { resolve(Array.isArray(r.result) ? r.result : []); };
            r.onerror = function () { resolve([]); };
          } catch (_) { resolve([]); }
        }).catch(function () { resolve([]); });
      } catch (_) { resolve([]); }
    });
  }

  function mount() {
    var root = document.getElementById('root');
    if (!root) return;
    if (window.ReactDOM && window.ReactDOM.createRoot) {
      window.ReactDOM.createRoot(root).render(h(HomeApp));
    } else if (window.ReactDOM && window.ReactDOM.render) {
      window.ReactDOM.render(h(HomeApp), root);
    }
  }

  window.HomeApp = HomeApp;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
  if (typeof SyncEngine !== 'undefined') SyncEngine.registerBeforeUnloadSnapshot();
})();
