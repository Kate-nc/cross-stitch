// onboarding.js — cross-page first-run tour ("First Impression" Brief A.2c).
//
// Persists state in localStorage under cs_onboarding_step. Values:
//   null            — not started
//   'welcome'       — welcome modal seen, persona chosen
//   'style'         — stitching style chosen, sample about to load
//   'sample_loaded' — sample project saved + tracker opened
//   'first_stitches'— user marked >= 10 stitches
//   'manager_visit' — user landed on the Manager
//   'complete'      — tour finished
//
// Designed to coexist with the per-page WelcomeWizard: when a user starts the
// tour we set cs_welcome_creator_done / cs_welcome_tracker_done so the legacy
// wizards don't double-fire. The reset button in the Help modal clears every
// onboarding flag so the tour can be replayed cleanly.
//
// Exposes:
//   window.OnboardingTour.shouldShowWelcome()  → bool
//   window.OnboardingTour.reset()              → clears all flags
//   window.OnboardingTour.mount()              → mounts page-specific UI
//   window.OnboardingTour.STEP_KEY             → 'cs_onboarding_step'

(function () {
  'use strict';

  var STEP_KEY = 'cs_onboarding_step';
  var PERSONA_KEY = 'cs_onboarding_persona';
  var STYLE_KEY = 'cs_user_style';
  // Legacy single-sample id from before per-style samples; kept so reset()
  // still cleans up older installs.
  var SAMPLE_PROJECT_ID = 'proj_onboarding_sample';
  var ALL_SAMPLE_IDS = [
    SAMPLE_PROJECT_ID,
    'proj_onboarding_crosscountry',
    'proj_onboarding_block',
    'proj_onboarding_parking',
    'proj_onboarding_freestyle'
  ];

  // ── localStorage helpers ────────────────────────────────────────────────
  function getStep() { try { return localStorage.getItem(STEP_KEY); } catch (_) { return null; } }
  function setStep(v) { try { if (v) localStorage.setItem(STEP_KEY, v); else localStorage.removeItem(STEP_KEY); } catch (_) {} }

  function reset() {
    try {
      localStorage.removeItem(STEP_KEY);
      localStorage.removeItem(PERSONA_KEY);
      // Note: we don't clear cs_user_style — once the user picks a stitching
      // style we honour it as a real preference, not just an onboarding step.
      // Also clear the legacy welcome wizard flags so the tour starts fresh.
      localStorage.removeItem('cs_welcome_creator_done');
      localStorage.removeItem('cs_welcome_tracker_done');
      localStorage.removeItem('cs_welcome_manager_done');
    } catch (_) {}
    // Best-effort: remove every onboarding sample so the next run loads a
    // clean copy. Failing is fine — the sample save path checks for an
    // existing entry and skips re-saving.
    try {
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.delete) {
        for (var i = 0; i < ALL_SAMPLE_IDS.length; i++) {
          ProjectStorage.delete(ALL_SAMPLE_IDS[i]).catch(function () {});
        }
      }
    } catch (_) {}
  }

  function shouldShowWelcome() {
    return getStep() == null;
  }

  // ── Style definitions ───────────────────────────────────────────────────
  // Each entry describes a working method, the sample project it loads, the
  // tracker prefs to auto-apply, and a "tour script" used by TrackerHints.
  // Method research / rationale:
  //   cross_country  — work one DMC colour to completion across the whole
  //                    canvas. Best demonstrated by a sparse 2-colour scatter
  //                    so the win of "finish a colour" is visible.
  //   block          — work each 10×10 chart square fully before moving on.
  //                    Sample uses 4 single-colour quadrants so completing
  //                    the focus block is fast and obvious.
  //   parking        — variant of block: park each thread at the next chart
  //                    cell where it appears instead of cutting. Sample is
  //                    confetti-heavy so parking pays off.
  //   freestyle      — no fixed method. Same small heart we shipped before.
  // Every sample uses `version: 11` (Creator's save format) so the tracker
  // restores it via the v11 branch instead of the legacy compressed branch.
  var DMC = {
    red:    { id: '321',  rgb: [199, 43, 59]  },
    blue:   { id: '798',  rgb: [70, 106, 162] },
    green:  { id: '471',  rgb: [174, 191, 86] },
    yellow: { id: '743',  rgb: [254, 211, 118] },
    purple: { id: '552',  rgb: [128, 84, 167] },
    pink:   { id: '603',  rgb: [255, 164, 190] }
  };
  function _cell(c) { return { id: c.id, type: 'solid', rgb: c.rgb }; }
  var SKIP = { id: '__skip__' };

  function _projectShell(id, name, w, h, pattern, extras) {
    var p = {
      version: 11,
      id: id, name: name, page: 'creator',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      w: w, h: h,
      settings: { sW: w, sH: h, fabricCt: 14 },
      pattern: pattern,
      bsLines: [], done: null, halfStitches: {}, halfDone: {},
      parkMarkers: [], totalTime: 0, sessions: [], threadOwned: {},
      source: 'onboarding'
    };
    if (extras) for (var k in extras) p[k] = extras[k];
    return p;
  }

  // Cross-country sample — 10×6 scatter of 2 colours so finishing one colour
  // is the satisfying outcome. ~15 stitches per colour (30 total).
  function buildCrossCountrySample() {
    var W = 10, H = 6;
    // r = red, b = blue, . = empty. Scatter chosen so neither colour clusters.
    var rows = [
      'r.b.r.b.r.',
      '.b.r.b.r.b',
      'r.b.r.b.r.',
      '.b.r.b.r.b',
      'r.b.r.b.r.',
      '.b.r.b.r.b'
    ];
    var pat = new Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var c = rows[y].charAt(x);
      pat[y * W + x] = c === 'r' ? _cell(DMC.red)
                     : c === 'b' ? _cell(DMC.blue)
                     : SKIP;
    }
    return _projectShell('proj_onboarding_crosscountry',
      'Welcome sample · One colour at a time', W, H, pat);
  }

  // Block sample — 20×20 with one colour per 10×10 quadrant. Each quadrant
  // contains a small motif (~10 stitches) so completing the focus block is
  // a clear, fast win.
  function buildBlockSample() {
    var W = 20, H = 20;
    var pat = new Array(W * H);
    for (var i = 0; i < pat.length; i++) pat[i] = SKIP;
    // Helper: draw a small + at (cx,cy) using `colour`.
    function plus(cx, cy, colour) {
      var pts = [[0,-2],[0,-1],[0,0],[0,1],[0,2],[-2,0],[-1,0],[1,0],[2,0]];
      for (var k = 0; k < pts.length; k++) {
        var x = cx + pts[k][0], y = cy + pts[k][1];
        if (x>=0&&x<W&&y>=0&&y<H) pat[y*W+x] = _cell(colour);
      }
    }
    plus(4, 4, DMC.red);     // TL block
    plus(14, 4, DMC.blue);   // TR block
    plus(4, 14, DMC.green);  // BL block
    plus(14, 14, DMC.yellow);// BR block
    return _projectShell('proj_onboarding_block',
      'Welcome sample · Section by section', W, H, pat,
      { focusBlock: { bx: 0, by: 0 } });
  }

  // Parking sample — 20×20 confetti so each block contains 4–5 colours.
  // Designed so parking the thread saves a lot of re-threading.
  function buildParkingSample() {
    var W = 20, H = 20;
    var pat = new Array(W * H);
    for (var i = 0; i < pat.length; i++) pat[i] = SKIP;
    var palette = [DMC.red, DMC.blue, DMC.green, DMC.yellow, DMC.purple];
    // Deterministic confetti via a small LCG so each tour run looks the same.
    var seed = 1337;
    function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }
    // Fill ~40% of the canvas (~160 stitches) with random colours from palette.
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (rand() < 0.4) {
        var c = palette[Math.floor(rand() * palette.length)];
        pat[y * W + x] = _cell(c);
      }
    }
    return _projectShell('proj_onboarding_parking',
      'Welcome sample · Parking method', W, H, pat,
      { focusBlock: { bx: 0, by: 0 } });
  }

  // Freestyle sample — original 10×10 red heart.
  function buildFreestyleSample() {
    var W = 10, H = 10;
    var rows = [
      '0110011000','1111111100','1111111110','1111111110',
      '0111111100','0011111000','0001110000','0000100000',
      '0000000000','0000000000'
    ];
    var pat = new Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      pat[y*W+x] = rows[y].charCodeAt(x) === 49 ? _cell(DMC.red) : SKIP;
    }
    return _projectShell('proj_onboarding_freestyle',
      'Welcome sample · Freestyle heart', W, H, pat);
  }

  var STYLE_DEFS = {
    cross_country: {
      label: 'One colour at a time',
      sublabel: 'Cross-country — pick a thread, stitch every X of that colour, then move on. Best for low-confetti charts and traditional samplers.',
      stitchStyle: 'crosscountry',
      sampleId: 'proj_onboarding_crosscountry',
      build: buildCrossCountrySample,
      autoSettings: { cs_focusEnabled: '0', cs_startCorner: 'TL', cs_useParking: '0' }
    },
    block: {
      label: 'Section by section',
      sublabel: '10×10 blocks — work the chart one square at a time. Common for medium-to-busy patterns and gridded fabric.',
      stitchStyle: 'block',
      sampleId: 'proj_onboarding_block',
      build: buildBlockSample,
      autoSettings: { cs_focusEnabled: '1', cs_blockW: '10', cs_blockH: '10', cs_startCorner: 'TL', cs_useParking: '0' }
    },
    parking: {
      label: 'Parking method',
      sublabel: 'For confetti-heavy patterns. Park each thread at the next chart cell it appears in instead of cutting and re-threading.',
      stitchStyle: 'block',
      sampleId: 'proj_onboarding_parking',
      build: buildParkingSample,
      autoSettings: { cs_focusEnabled: '1', cs_blockW: '10', cs_blockH: '10', cs_startCorner: 'TL', cs_useParking: '1' }
    },
    freestyle: {
      label: 'No fixed method',
      sublabel: 'Freestyle — mark stitches as you go. Great for small kits and mixing methods on the fly.',
      stitchStyle: 'freestyle',
      sampleId: 'proj_onboarding_freestyle',
      build: buildFreestyleSample,
      autoSettings: { cs_focusEnabled: '0', cs_useParking: '0' }
    }
  };
  var STYLE_KEYS = ['cross_country', 'block', 'parking', 'freestyle'];

  // Apply each style's auto-settings to localStorage so the tracker boots into
  // the right configuration. Also stamps cs_stitchStyle and cs_user_style.
  function applyStyleSettings(styleKey) {
    var def = STYLE_DEFS[styleKey];
    if (!def) return;
    try {
      localStorage.setItem(STYLE_KEY, styleKey);
      localStorage.setItem('cs_stitchStyle', def.stitchStyle);
      var s = def.autoSettings || {};
      for (var k in s) localStorage.setItem(k, s[k]);
      // Suppress legacy first-visit wizards on every page now that we own
      // the onboarding flow.
      localStorage.setItem('cs_welcome_creator_done', '1');
      localStorage.setItem('cs_welcome_tracker_done', '1');
      localStorage.setItem('cs_welcome_manager_done', '1');
      localStorage.setItem('cs_styleOnboardingDone', '1');
    } catch (_) {}
  }

  function loadSampleProjectFor(styleKey) {
    var def = STYLE_DEFS[styleKey];
    if (!def || typeof ProjectStorage === 'undefined') return Promise.resolve(false);
    return ProjectStorage.get(def.sampleId).then(function (existing) {
      if (existing) return existing.id;
      return ProjectStorage.save(def.build());
    }).then(function (id) {
      ProjectStorage.setActiveProject(id);
      return true;
    }).catch(function (e) {
      console.warn('OnboardingTour: failed to load sample for ' + styleKey, e);
      return false;
    });
  }

  // Back-compat: the original API exposed _buildSampleProject (the freestyle
  // heart). Keep it working so anything still calling it gets the same shape.
  function buildSampleProject() { return buildFreestyleSample(); }
  function loadSampleProject() { return loadSampleProjectFor('freestyle'); }

  function navigateToTracker() {
    // Always navigate via window.location so the welcome modal (mounted on a
    // separate root in the same document) is torn down with the page. Calling
    // window.__switchToTrack() in-place leaves the modal-overlay covering the
    // tracker view, which makes the UI appear frozen.
    window.location.href = 'stitch.html';
  }

  function showToast(message, opts) {
    if (window.Toast && window.Toast.show) {
      window.Toast.show(Object.assign({ message: message, duration: 4000 }, opts || {}));
    }
  }

  // ── Page detection ──────────────────────────────────────────────────────
  function pageKind() {
    var p = (location.pathname || '').toLowerCase();
    if (p.indexOf('manager') !== -1) return 'manager';
    if (p.indexOf('stitch') !== -1) return 'tracker';
    return 'creator';
  }

  // ── Welcome + Style modal (renders on Creator/index) ────────────────────
  function WelcomeModal(props) {
    var h = React.createElement;
    var _phase = React.useState('welcome'); // 'welcome' | 'style'
    var phase = _phase[0], setPhase = _phase[1];
    var _busy = React.useState(false);
    var busy = _busy[0], setBusy = _busy[1];
    var _persona = React.useState(null);
    var persona = _persona[0], setPersonaState = _persona[1];

    function pickPersona(p) {
      try { localStorage.setItem(PERSONA_KEY, p); } catch (_) {}
      setPersonaState(p);
      setStep('welcome');
      setPhase('style');
    }

    function pickStyle(styleKey) {
      if (busy) return;
      var def = STYLE_DEFS[styleKey];
      if (!def) return;
      setBusy(true);
      // Apply settings BEFORE saving the sample so the tracker reads them
      // when it boots.
      applyStyleSettings(styleKey);
      setStep('style');
      loadSampleProjectFor(styleKey).then(function (ok) {
        if (ok) {
          setStep('sample_loaded');
          showToast('Loaded a sample tuned for ' + def.label.toLowerCase() + '.', { type: 'success' });
          if (typeof props.onClose === 'function') props.onClose();
          setTimeout(navigateToTracker, 250);
        } else {
          setStep('complete');
          setBusy(false);
          if (typeof props.onClose === 'function') props.onClose();
        }
      });
    }

    function skip() {
      // Skipping marks the tour complete without loading a sample.
      setStep('complete');
      try {
        localStorage.setItem('cs_welcome_creator_done', '1');
        localStorage.setItem('cs_welcome_tracker_done', '1');
        localStorage.setItem('cs_welcome_manager_done', '1');
      } catch (_) {}
      if (typeof props.onClose === 'function') props.onClose();
    }

    var btnStyle = {
      display: 'block', width: '100%', textAlign: 'left',
      padding: '14px 16px', marginBottom: 10,
      background: 'var(--surface)', border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius-lg)', cursor: 'pointer',
      fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit'
    };

    return h('div', { className: 'modal-overlay' },
      h('div', { className: 'modal-content', style: { maxWidth: 520 } },
        phase === 'welcome'
          ? h('div', null,
              h('h3', { style: { marginTop: 0, fontSize: 22 } }, 'Welcome to Cross Stitch'),
              h('p', { style: { color: 'var(--text-secondary)', fontSize: 14, marginBottom: 18 } },
                'Convert images into cross-stitch patterns and track every stitch in your browser. Let\u2019s set things up.'),
              h('button', { style: btnStyle, onClick: function () { pickPersona('newbie'); } },
                h('div', { style: { fontWeight: 700, marginBottom: 4 } }, 'I\u2019m new to cross stitch'),
                h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'We\u2019ll show extra tips along the way.')
              ),
              h('button', { style: btnStyle, onClick: function () { pickPersona('experienced'); } },
                h('div', { style: { fontWeight: 700, marginBottom: 4 } }, 'I know my way around'),
                h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Skip the basics and dive in.')
              ),
              h('div', { style: { marginTop: 6, textAlign: 'right' } },
                h('button', { className: 'home-view-all', onClick: skip }, 'Skip tour')
              )
            )
          : h('div', null,
              h('h3', { style: { marginTop: 0, fontSize: 20 } }, 'How do you usually stitch?'),
              h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 } },
                'Pick the working method that feels closest. We\u2019ll load a sample project tuned for it and show you the tracker features that style relies on. You can change this later in Preferences.'),
              STYLE_KEYS.map(function (k) {
                var def = STYLE_DEFS[k];
                return h('button', {
                  key: k, style: btnStyle, disabled: busy,
                  onClick: function () { pickStyle(k); }
                },
                  h('div', { style: { fontWeight: 700, marginBottom: 4 } }, def.label),
                  h('div', { style: { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 } }, def.sublabel)
                );
              }),
              busy && h('div', { style: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 } }, 'Loading sample project\u2026'),
              h('div', { style: { marginTop: 6, textAlign: 'right' } },
                h('button', { className: 'home-view-all', onClick: skip, disabled: busy }, 'Skip tour')
              )
            )
      )
    );
  }

  // ── Floating banner used on the Tracker / Manager ──────────────────────
  function FloatingBanner(props) {
    var h = React.createElement;
    return h('div', {
      style: {
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9000, maxWidth: 480, width: 'calc(100% - 32px)',
        background: 'var(--accent)', color: '#fff',
        padding: '10px 14px', borderRadius: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
        fontSize: 13, display: 'flex', alignItems: 'center', gap: 10
      }
    },
      h('span', { style: { flex: 1 } }, props.message),
      props.actionLabel && h('button', {
        onClick: props.onAction,
        style: { background: '#fff', color: 'var(--accent)', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
      }, props.actionLabel),
      h('button', {
        onClick: props.onDismiss, 'aria-label': 'Dismiss',
        style: { background: 'transparent', color: '#fff', border: 'none', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '0 4px' }
      }, '\u00D7')
    );
  }

  // ── Tracker / Manager hint controllers ─────────────────────────────────
  // We mount a tiny React island per page so we can listen for step changes
  // and show the appropriate banner without modifying tracker/manager source.
  // The banner copy and completion criteria branch on cs_user_style so each
  // method is taught using its own technique.
  function _readUserStyle() {
    try { return localStorage.getItem(STYLE_KEY) || 'freestyle'; } catch (_) { return 'freestyle'; }
  }
  function _readPersona() {
    try { return localStorage.getItem(PERSONA_KEY) || 'experienced'; } catch (_) { return 'experienced'; }
  }
  // Persona-aware "long form" addendum for hint copy. Newbies get an extra
  // sentence, experienced users get terse banners.
  function _expand(short, longTip) {
    return _readPersona() === 'newbie' ? short + ' ' + longTip : short;
  }

  // Inspect a project's done array against its pattern to derive technique-
  // specific completion signals.
  function _projectStats(p) {
    var stats = { done: 0, total: 0, perColour: {}, parkMarkers: 0, firstBlockTotal: 0, firstBlockDone: 0 };
    if (!p || !p.pattern) return stats;
    stats.parkMarkers = (p.parkMarkers && p.parkMarkers.length) || 0;
    var W = p.w || 0;
    var done = p.done || [];
    for (var i = 0; i < p.pattern.length; i++) {
      var cell = p.pattern[i];
      if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
      var d = done[i] ? 1 : 0;
      stats.total++;
      stats.done += d;
      if (!stats.perColour[cell.id]) stats.perColour[cell.id] = { total: 0, done: 0 };
      stats.perColour[cell.id].total++;
      stats.perColour[cell.id].done += d;
      // First block = top-left 10×10 cells (matches default focus block).
      var x = i % W, y = Math.floor(i / W);
      if (x < 10 && y < 10) {
        stats.firstBlockTotal++;
        stats.firstBlockDone += d;
      }
    }
    return stats;
  }

  // Per-style tour state machines. Each receives the latest project stats and
  // returns either null (no advance), or a new step name to set.
  function _evalCrossCountryAdvance(stats) {
    // Goal: any single colour reaches 100%.
    var ids = Object.keys(stats.perColour);
    for (var i = 0; i < ids.length; i++) {
      var c = stats.perColour[ids[i]];
      if (c.total > 0 && c.done === c.total) return 'first_stitches';
    }
    return null;
  }
  function _evalBlockAdvance(stats) {
    // Goal: complete the top-left 10×10 block.
    if (stats.firstBlockTotal > 0 && stats.firstBlockDone === stats.firstBlockTotal) return 'first_stitches';
    return null;
  }
  function _evalParkingAdvance(stats, currentStep) {
    // Two sub-steps: 'sample_loaded' → drop a marker; 'parking_marker_set'
    // → finish the focus block.
    if (currentStep === 'sample_loaded') {
      if (stats.parkMarkers >= 1) return 'parking_marker_set';
    } else if (currentStep === 'parking_marker_set') {
      if (stats.firstBlockTotal > 0 && stats.firstBlockDone === stats.firstBlockTotal) return 'first_stitches';
    }
    return null;
  }
  function _evalFreestyleAdvance(stats) {
    if (stats.done >= 10) return 'first_stitches';
    return null;
  }

  // Per-style banner copy. Returns { message, action? } for the given step.
  function _bannerFor(style, step) {
    if (step === 'sample_loaded') {
      if (style === 'cross_country') return {
        message: _expand(
          'Open the Colours drawer at the bottom, pick one colour, then mark every X of it across the canvas.',
          'Tip: clicking a colour highlights only those stitches so you can find them quickly.')
      };
      if (style === 'block') return {
        message: _expand(
          'Focus mode is on — the current 10×10 block is highlighted. Complete every stitch in it.',
          'Tip: when the block is done the focus auto-jumps to the next one.')
      };
      if (style === 'parking') return {
        message: _expand(
          'Switch to Navigate mode (press Space). Pick a colour from the palette, then click the next chart cell where it appears to drop a parking marker.',
          'Tip: parking markers show where each thread is "waiting" so you can stop and start without re-threading.')
      };
      // freestyle (default)
      return {
        message: _expand(
          'Mark your first 10 stitches to complete the tour. Tap any cell to mark it done.',
          'Tip: drag across cells to mark several at once.')
      };
    }
    if (step === 'parking_marker_set') {
      return {
        message: _expand(
          'Marker placed. Switch back to Track mode and finish the highlighted 10×10 block — your "parked" thread is waiting at the marker.',
          'Tip: in a real chart you\u2019d drop a marker for every colour you\u2019re leaving behind.')
      };
    }
    if (step === 'first_stitches') {
      var nextMessage =
        style === 'cross_country' ? 'You finished a colour — that\u2019s cross-country in a nutshell. Visit the Stash tab next to track the threads you own.' :
        style === 'block'         ? 'Block complete! Focus mode just made that easy. Visit the Stash tab next to track your threads.' :
        style === 'parking'       ? 'Block complete with parking — much less re-threading on a real pattern. Visit the Stash tab to track threads.' :
                                    'Your project is saved! Visit the Stash tab to manage your thread inventory.';
      return { message: nextMessage, action: 'Open Stash', onAction: function () { window.location.href = 'manager.html'; } };
    }
    return null;
  }

  function TrackerHints() {
    var h = React.createElement;
    var styleRef = React.useRef(_readUserStyle());
    var _step = React.useState(getStep());
    var step = _step[0], setStepState = _step[1];
    var _dismissed = React.useState(false);
    var dismissed = _dismissed[0], setDismissed = _dismissed[1];

    // Poll active project every 2s; advance via the per-style evaluator.
    React.useEffect(function () {
      if (step !== 'sample_loaded' && step !== 'parking_marker_set') return;
      var alive = true;
      function tick() {
        if (!alive) return;
        if (typeof ProjectStorage === 'undefined') return;
        ProjectStorage.getActiveProject().then(function (p) {
          if (!alive || !p) return;
          var stats = _projectStats(p);
          var style = styleRef.current;
          var next = null;
          if (style === 'cross_country') next = _evalCrossCountryAdvance(stats);
          else if (style === 'block')    next = _evalBlockAdvance(stats);
          else if (style === 'parking')  next = _evalParkingAdvance(stats, step);
          else                           next = _evalFreestyleAdvance(stats);
          if (next && next !== step) {
            setStep(next);
            setStepState(next);
            if (next === 'first_stitches') {
              showToast('Nice work \u2014 tour goal reached! \uD83C\uDF89', { type: 'success' });
            } else if (next === 'parking_marker_set') {
              showToast('Parking marker placed.', { type: 'success' });
            }
          }
        }).catch(function () {});
      }
      var iv = setInterval(tick, 2000);
      tick();
      return function () { alive = false; clearInterval(iv); };
    }, [step]);

    if (dismissed) return null;
    var banner = _bannerFor(styleRef.current, step);
    if (!banner) return null;
    return h(FloatingBanner, {
      message: banner.message,
      actionLabel: banner.action,
      onAction: banner.onAction,
      onDismiss: function () { setDismissed(true); }
    });
  }

  function ManagerHints() {
    React.useEffect(function () {
      var s = getStep();
      if (s === 'first_stitches') {
        setStep('manager_visit');
      }
      if (getStep() === 'manager_visit') {
        showToast("Tour complete! You're all set.", { type: 'success', duration: 5000 });
        setStep('complete');
      }
    }, []);
    return null;
  }

  function CreatorWelcome() {
    var h = React.createElement;
    var _open = React.useState(shouldShowWelcome());
    var open = _open[0], setOpen = _open[1];
    if (!open) return null;
    // Don't pop the welcome modal if the user already has projects — they're
    // a returning user landing fresh after a wipe.
    return h(WelcomeModal, { onClose: function () { setOpen(false); } });
  }

  // ── Mount points ────────────────────────────────────────────────────────
  function ensureRoot(id) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    return el;
  }

  function mount() {
    var kind = pageKind();
    var step = getStep();
    if (kind === 'creator') {
      // Only auto-show the welcome on a clean install. If projects already
      // exist we treat the user as returning and stay quiet.
      if (step != null) return;
      if (typeof ProjectStorage === 'undefined') return;
      ProjectStorage.listProjects().then(function (list) {
        if (list && list.length > 0) return;
        var root = ensureRoot('cs-onboarding-root');
        ReactDOM.createRoot(root).render(React.createElement(CreatorWelcome));
      }).catch(function () {});
    } else if (kind === 'tracker') {
      if (step !== 'sample_loaded' && step !== 'parking_marker_set' && step !== 'first_stitches') return;
      var root = ensureRoot('cs-onboarding-root');
      ReactDOM.createRoot(root).render(React.createElement(TrackerHints));
    } else if (kind === 'manager') {
      if (step !== 'first_stitches' && step !== 'manager_visit') return;
      var root = ensureRoot('cs-onboarding-root');
      ReactDOM.createRoot(root).render(React.createElement(ManagerHints));
    }
  }

  window.OnboardingTour = {
    STEP_KEY: STEP_KEY,
    PERSONA_KEY: PERSONA_KEY,
    STYLE_KEY: STYLE_KEY,
    SAMPLE_PROJECT_ID: SAMPLE_PROJECT_ID,
    SAMPLE_PROJECT_IDS: ALL_SAMPLE_IDS,
    STYLE_DEFS: STYLE_DEFS,
    STYLE_KEYS: STYLE_KEYS,
    shouldShowWelcome: shouldShowWelcome,
    reset: reset,
    mount: mount,
    applyStyleSettings: applyStyleSettings,
    _buildSampleProject: buildSampleProject,
    _buildSampleFor: function (k) { var d = STYLE_DEFS[k]; return d && d.build(); },
    _projectStats: _projectStats
  };

  // Defer until DOM ready so React + ProjectStorage are guaranteed available.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(mount, 50); });
  } else {
    setTimeout(mount, 50);
  }
})();
