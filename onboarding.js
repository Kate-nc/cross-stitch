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
  var SAMPLE_PROJECT_ID = 'proj_onboarding_sample';

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
    // Best-effort: remove the bundled sample project so the next run loads
    // a clean copy. Failing is fine — the sample save path checks for an
    // existing entry and skips re-saving.
    try {
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.delete) {
        ProjectStorage.delete(SAMPLE_PROJECT_ID).catch(function () {});
      }
    } catch (_) {}
  }

  function shouldShowWelcome() {
    return getStep() == null;
  }

  // ── Sample project (small 10×10 heart) ──────────────────────────────────
  // Cells are { id, type, rgb }. '__skip__' = empty background. The heart uses
  // DMC 321 (red). Pattern is a 10x10 = 100-cell flat array.
  function buildSampleProject() {
    var W = 10, H = 10;
    var RED = '321';                    // DMC 321 — Christmas Red
    var redRgb = [199, 43, 59];
    // Heart silhouette (1 = stitched, 0 = empty)
    var rows = [
      '0110011000',
      '1111111100',
      '1111111110',
      '1111111110',
      '0111111100',
      '0011111000',
      '0001110000',
      '0000100000',
      '0000000000',
      '0000000000'
    ];
    var pattern = new Array(W * H);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var on = rows[y].charCodeAt(x) === 49; // '1'
        pattern[y * W + x] = on
          ? { id: RED, type: 'solid', rgb: redRgb }
          : { id: '__skip__' };
      }
    }
    return {
      v: 8,
      id: SAMPLE_PROJECT_ID,
      name: 'Welcome heart (sample)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      w: W, h: H,
      settings: { sW: W, sH: H, fabricCt: 14 },
      pattern: pattern,
      bsLines: [],
      done: null,
      halfStitches: {},
      halfDone: {},
      parkMarkers: [],
      totalTime: 0,
      sessions: [],
      threadOwned: {},
      source: 'onboarding'
    };
  }

  function loadSampleProject() {
    if (typeof ProjectStorage === 'undefined') return Promise.resolve(false);
    return ProjectStorage.get(SAMPLE_PROJECT_ID).then(function (existing) {
      if (existing) return existing.id;
      return ProjectStorage.save(buildSampleProject());
    }).then(function (id) {
      ProjectStorage.setActiveProject(id);
      return true;
    }).catch(function (e) {
      console.warn('OnboardingTour: failed to load sample project', e);
      return false;
    });
  }

  function navigateToTracker() {
    if (typeof window.__switchToTrack === 'function') {
      try { window.__switchToTrack(); return; } catch (_) {}
    }
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

    function pickPersona(persona) {
      try { localStorage.setItem(PERSONA_KEY, persona); } catch (_) {}
      setStep('welcome');
      setPhase('style');
    }

    function pickStyle(style) {
      if (busy) return;
      setBusy(true);
      try { localStorage.setItem(STYLE_KEY, style); } catch (_) {}
      // Suppress legacy wizards now that the user is in our tour.
      try {
        localStorage.setItem('cs_welcome_creator_done', '1');
        localStorage.setItem('cs_welcome_tracker_done', '1');
        localStorage.setItem('cs_styleOnboardingDone', '1');
        // Map plan-level styles to the tracker's actual stitching style values.
        var styleMap = { traditional: 'crosscountry', modern: 'block', minimal: 'freestyle' };
        localStorage.setItem('cs_stitchStyle', styleMap[style] || 'block');
      } catch (_) {}
      setStep('style');
      loadSampleProject().then(function (ok) {
        if (ok) {
          setStep('sample_loaded');
          showToast("Sample project loaded \u2014 let's stitch!", { type: 'success' });
          setTimeout(navigateToTracker, 250);
        } else {
          // Sample failed (e.g. no IndexedDB). Bail gracefully.
          setStep('complete');
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
      h('div', { className: 'modal-content', style: { maxWidth: 460 } },
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
              h('p', { style: { color: 'var(--text-secondary)', fontSize: 13, marginBottom: 18 } },
                'Pick the style that feels closest \u2014 you can change this later in Preferences.'),
              h('button', { style: btnStyle, onClick: function () { pickStyle('traditional'); }, disabled: busy },
                h('div', { style: { fontWeight: 700, marginBottom: 4 } }, 'Traditional'),
                h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Work colour-by-colour, one shade at a time.')
              ),
              h('button', { style: btnStyle, onClick: function () { pickStyle('modern'); }, disabled: busy },
                h('div', { style: { fontWeight: 700, marginBottom: 4 } }, 'Modern'),
                h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Cross-country \u2014 follow the chart row by row.')
              ),
              h('button', { style: btnStyle, onClick: function () { pickStyle('minimal'); }, disabled: busy },
                h('div', { style: { fontWeight: 700, marginBottom: 4 } }, 'Minimal / Parking'),
                h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'Park threads near where you\u2019ll need them next.')
              ),
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
  function TrackerHints() {
    var h = React.createElement;
    var _step = React.useState(getStep());
    var step = _step[0], setStepState = _step[1];
    var _dismissed = React.useState(false);
    var dismissed = _dismissed[0], setDismissed = _dismissed[1];

    // Poll active project every 2s for done count → advance step.
    React.useEffect(function () {
      if (step !== 'sample_loaded') return;
      var alive = true;
      function tick() {
        if (!alive) return;
        if (typeof ProjectStorage === 'undefined') return;
        ProjectStorage.getActiveProject().then(function (p) {
          if (!alive || !p) return;
          var done = 0;
          if (p.done && typeof p.done.length === 'number') {
            for (var i = 0; i < p.done.length; i++) if (p.done[i]) done++;
          }
          if (done >= 10) {
            setStep('first_stitches');
            setStepState('first_stitches');
            showToast('Nice work \u2014 first 10 stitches done! \uD83C\uDF89', { type: 'success' });
          }
        }).catch(function () {});
      }
      var iv = setInterval(tick, 2000);
      tick();
      return function () { alive = false; clearInterval(iv); };
    }, [step]);

    if (dismissed) return null;
    if (step === 'sample_loaded') {
      return h(FloatingBanner, {
        message: 'Mark your first 10 stitches to complete the tour. Tap any cell to mark it done.',
        onDismiss: function () { setDismissed(true); }
      });
    }
    if (step === 'first_stitches') {
      return h(FloatingBanner, {
        message: 'Your project is saved! Visit the Stash tab to manage your thread inventory.',
        actionLabel: 'Open Stash',
        onAction: function () { window.location.href = 'manager.html'; },
        onDismiss: function () { setDismissed(true); }
      });
    }
    return null;
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
      if (step !== 'sample_loaded' && step !== 'first_stitches') return;
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
    SAMPLE_PROJECT_ID: SAMPLE_PROJECT_ID,
    shouldShowWelcome: shouldShowWelcome,
    reset: reset,
    mount: mount,
    _buildSampleProject: buildSampleProject
  };

  // Defer until DOM ready so React + ProjectStorage are guaranteed available.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(mount, 50); });
  } else {
    setTimeout(mount, 50);
  }
})();
