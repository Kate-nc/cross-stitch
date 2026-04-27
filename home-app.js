// home-app.js — Combo A (tab bar + project hub)
// Cross-mode landing page (`/home`). Mounts to #root in home.html.
//
// Tabs: Projects (default) | Create new | Stash | Stats
//
// Projects tab renders, top-to-bottom:
//   1. Shared <Header page="home"> — Help + File menu live there; no duplication.
//   2. HomeTabBar — Projects / Create new / Stash / Stats.
//   3. Greeting row — time-aware greeting + "New project" button.
//   4. ActiveProjectCard — merges old GreetingHero + ResumeCard into one card.
//   5. ProjectsList — all projects with per-row Track + Edit buttons.
//
// Create new tab: two creation tiles (image + blank).
// Stash tab: stash stats + Open Stash Manager link.
// Stats tab: link to stats page.
//
// Help and Preferences are in the shared Header — HomeFooter shows About only.
// No emojis or unicode glyphs — every icon comes from window.Icons.

(function () {
  if (typeof window === 'undefined' || typeof React === 'undefined') return;
  var h = React.createElement;

  // ── Helpers ────────────────────────────────────────────────────────────
  // Inlined from home-screen.js so /home no longer depends on the legacy
  // bundle (Tier 2 of the homepage-predominance audit retired the in-Creator
  // HomeScreen). window.timeAgo / window.getGreeting remain the canonical
  // implementations when home-screen.js is also loaded (e.g. on manager.html).
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
  function getGreeting() {
    if (typeof window.getGreeting === 'function') return window.getGreeting();
    var hr = new Date().getHours();
    if (hr >= 5 && hr <= 11) return 'Good morning';
    if (hr >= 12 && hr <= 16) return 'Good afternoon';
    return 'Good evening';
  }

  function projectInitials(name) {
    var s = String(name || '').trim();
    if (!s) return '?';
    var parts = s.split(/\s+/);
    if (parts.length === 1) return s.slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function projectPct(p) {
    if (!p || !p.pattern) return null;
    var total = 0;
    for (var i = 0; i < p.pattern.length; i += 1) {
      var c = p.pattern[i];
      if (c && c.id !== '__skip__' && c.id !== '__empty__') total += 1;
    }
    if (total <= 0) return null;
    var done = 0;
    if (p.done) {
      for (var j = 0; j < p.done.length; j += 1) if (p.done[j] === 1) done += 1;
    }
    return Math.round(done / total * 100);
  }

  function activateAndGo(id, href) {
    try {
      if (window.ProjectStorage && window.ProjectStorage.setActiveProject) {
        window.ProjectStorage.setActiveProject(id);
      }
    } catch (_) {}
    // ?from=home tells the per-tool page's redirect-to-home guard to stand down.
    var sep = href.indexOf('?') === -1 ? '?' : '&';
    window.location.href = href + sep + 'from=home';
  }

  // ── HomeTabBar ──────────────────────────────────────────────────────────
  function HomeTabBar(props) {
    var tab = props.tab;
    var onTab = props.onTab;
    var projectCount = props.projectCount;
    var tabs = [
      { key: 'projects', label: 'Projects', badge: projectCount > 0 ? projectCount : null },
      { key: 'create',   label: 'Create new' },
      { key: 'stash',    label: 'Stash' },
      { key: 'stats',    label: 'Stats' },
    ];
    return h('div', { className: 'home-tabs', role: 'tablist', 'aria-label': 'Home sections' },
      tabs.map(function (t) {
        return h('button', {
          key: t.key,
          role: 'tab',
          type: 'button',
          className: 'home-tab' + (tab === t.key ? ' home-tab--active' : ''),
          'aria-selected': tab === t.key ? 'true' : 'false',
          onClick: function () { onTab(t.key); }
        },
          t.label,
          t.badge ? h('span', { className: 'home-tab__badge', 'aria-hidden': 'true' }, t.badge) : null
        );
      })
    );
  }

  // ── GreetingRow ─────────────────────────────────────────────────────────
  // Greeting text + single "New project" button. Replaces standalone GreetingHero.
  function GreetingRow(props) {
    var list = props.list || [];
    var sub = list.length
      ? list.length + ' project' + (list.length !== 1 ? 's' : '')
      : 'No projects yet — create one to get started.';
    return h('div', { className: 'home-greeting-row' },
      h('div', null,
        h('h1', { className: 'home-greeting-row__title' }, getGreeting() + ', ready to stitch?'),
        h('p', { className: 'home-greeting-row__sub' }, sub)
      ),
      h('button', {
        type: 'button',
        className: 'btn btn-primary home-greeting-row__new-btn',
        // The greeting "+ New project" button used to navigate to
        // create.html?action=new-from-image, which dropped users on the
        // welcome card with no image picked yet — different from clicking
        // the "New from image" tile on the Create tab. Switching the tab
        // in-page makes both entry points converge on the same UI.
        onClick: function () {
          if (typeof props.onTab === 'function') props.onTab('create');
        }
      }, '+ New project')
    );
  }

  // ── ActiveProjectCard ───────────────────────────────────────────────────
  // Merges the old GreetingHero + ResumeCard into one prominent card.
  function ActiveProjectCard(props) {
    var p = props.activeProject;
    if (!p) {
      return h('div', { className: 'home-active-card home-active-card--empty' },
        h('div', { className: 'home-active-card__band' }, 'No active project'),
        h('div', { className: 'home-active-card__body' },
          h('p', { className: 'home-active-card__empty-msg' }, 'Pick a project below, or start something new.')
        )
      );
    }
    var pct = projectPct(p);
    var dim = p.settings && (p.settings.sW + '×' + p.settings.sH);
    var metaParts = [
      dim || null,
      p.updatedAt ? ('Updated ' + timeAgo(p.updatedAt)) : null,
      pct !== null ? (pct + '% complete') : null
    ].filter(Boolean);
    return h('section', {
      className: 'home-active-card',
      'aria-labelledby': 'home-active-card-title'
    },
      h('div', { className: 'home-active-card__band', 'aria-hidden': 'true' },
        'Active — pick up where you left off'
      ),
      h('div', { className: 'home-active-card__body' },
        h('div', { className: 'home-active-card__avatar', 'aria-hidden': 'true' }, projectInitials(p.name)),
        h('div', { className: 'home-active-card__info' },
          h('div', {
            id: 'home-active-card-title',
            className: 'home-active-card__name'
          }, p.name || 'Untitled project'),
          h('div', { className: 'home-active-card__meta' }, metaParts.join(' · ')),
          pct !== null && h('div', { className: 'home-active-card__bar', 'aria-hidden': 'true' },
            h('div', { className: 'home-active-card__bar-fill', style: { width: pct + '%' } })
          )
        ),
        h('div', { className: 'home-active-card__actions' },
          h('button', {
            type: 'button',
            className: 'btn btn-primary',
            onClick: function () { activateAndGo(p.id, 'stitch.html'); }
          }, 'Resume tracking'),
          h('button', {
            type: 'button',
            className: 'btn',
            onClick: function () { activateAndGo(p.id, 'create.html'); }
          }, 'Edit pattern')
        )
      )
    );
  }

  // ── ProjectsList ────────────────────────────────────────────────────────
  // Replaces RecentGrid. Each row exposes both Track and Edit so the user
  // chooses their destination — no silent redirect to the Tracker.
  // Plan B Phase 3: name + meta now open a metadata popover (powered by the
  // shared AppInfoPopover). Track and Edit stay as inline primary actions —
  // collapsing them into a `⋯` overflow menu would silently drop the
  // one-click Track CTA most users rely on, which we'd rather not regress
  // without explicit feedback.
  function ProjectsList(props) {
    var list = (props.projects || []).slice(0, 8);
    var openState = React.useState(null);
    var openFor = openState[0];
    var setOpenFor = openState[1];
    var triggerRefs = React.useRef({});
    if (!list.length) return null;

    function metadataPopover(p) {
      if (!window.AppInfoPopover) return null;
      var dim = p.settings && (p.settings.sW + ' × ' + p.settings.sH + ' stitches');
      var fabric = p.settings && p.settings.fabricCt ? (p.settings.fabricCt + ' ct Aida') : null;
      var pct = projectPct(p);
      var stitchable = 0;
      var done = 0;
      if (p.pattern) {
        for (var i = 0; i < p.pattern.length; i += 1) {
          var c = p.pattern[i];
          if (c && c.id !== '__skip__' && c.id !== '__empty__') stitchable += 1;
        }
      }
      if (p.done) {
        for (var j = 0; j < p.done.length; j += 1) if (p.done[j] === 1) done += 1;
      }
      var distinctColours = 0;
      if (p.pattern) {
        var seen = {};
        for (var k = 0; k < p.pattern.length; k += 1) {
          var pc = p.pattern[k];
          if (pc && pc.id && pc.id !== '__skip__' && pc.id !== '__empty__' && !seen[pc.id]) {
            seen[pc.id] = 1;
            distinctColours += 1;
          }
        }
      }
      var totalSec = (typeof p.totalTime === 'number') ? p.totalTime : 0;
      var fmtL = window.fmtTimeL || function (s) { return Math.round(s/3600) + 'h'; };
      var patternRows = [];
      if (dim) patternRows.push(['Dimensions', dim]);
      if (fabric) patternRows.push(['Fabric', fabric]);
      if (stitchable > 0) patternRows.push(['Stitchable', stitchable.toLocaleString()]);
      if (distinctColours > 0) patternRows.push(['Colours', String(distinctColours)]);
      if (pct !== null) patternRows.push(['Progress', pct + '% (' + done.toLocaleString() + '/' + stitchable.toLocaleString() + ')']);
      var metaRows = [];
      if (p.createdAt) metaRows.push(['Created', new Date(p.createdAt).toLocaleDateString()]);
      if (p.updatedAt) metaRows.push(['Last edited', timeAgo(p.updatedAt)]);
      if (totalSec > 0) metaRows.push(['Time spent', fmtL(totalSec)]);
      var children = [
        h(window.AppInfoSection, { key: 'pat', title: 'Pattern' }, h(window.AppInfoGrid, { rows: patternRows }))
      ];
      if (metaRows.length) {
        children.push(h(window.AppInfoDivider, { key: 'd1' }));
        children.push(h(window.AppInfoSection, { key: 'meta', title: 'Metadata' }, h(window.AppInfoGrid, { rows: metaRows })));
      }
      var ref = { current: triggerRefs.current[p.id] || null };
      return h(window.AppInfoPopover, {
        open: true,
        onClose: function () { setOpenFor(null); },
        triggerRef: ref,
        ariaLabel: (p.name || 'Project') + ' details',
        className: 'app-info-popover--left'
      }, children);
    }

    return h('section', {
      className: 'home-proj-list',
      'aria-labelledby': 'home-proj-list-title'
    },
      h('h2', { id: 'home-proj-list-title', className: 'home-section__title' }, 'All projects'),
      h('div', { className: 'home-proj-list__rows' },
        list.map(function (p) {
          var pct = projectPct(p);
          var dim = p.settings && (p.settings.sW + '×' + p.settings.sH);
          var metaParts = [
            dim || null,
            p.updatedAt ? timeAgo(p.updatedAt) : null,
            pct !== null ? pct + '%' : null
          ].filter(Boolean);
          var isOpen = openFor === p.id;
          return h('div', {
            key: p.id,
            className: 'home-proj-row'
          },
            h('div', { className: 'home-proj-row__avatar', 'aria-hidden': 'true' }, projectInitials(p.name)),
            h('div', { className: 'home-proj-row__body app-info-chip-wrap' },
              h('button', {
                type: 'button',
                ref: function (el) { triggerRefs.current[p.id] = el; },
                className: 'home-proj-row__name home-proj-row__name--button',
                'aria-haspopup': 'dialog',
                'aria-expanded': isOpen ? 'true' : 'false',
                onClick: function () { setOpenFor(isOpen ? null : p.id); },
                title: 'Project details'
              }, p.name || 'Untitled'),
              h('div', { className: 'home-proj-row__meta' }, metaParts.join(' · ')),
              pct !== null && h('div', { className: 'home-proj-row__bar', 'aria-hidden': 'true' },
                h('div', { className: 'home-proj-row__bar-fill', style: { width: pct + '%' } })
              ),
              isOpen && metadataPopover(p)
            ),
            h('div', { className: 'home-proj-row__actions' },
              h('button', {
                type: 'button',
                className: 'btn btn-primary btn-sm',
                onClick: function () { activateAndGo(p.id, 'stitch.html'); }
              }, 'Track'),
              h('button', {
                type: 'button',
                className: 'btn btn-sm',
                onClick: function () { activateAndGo(p.id, 'create.html'); }
              }, 'Edit')
            )
          );
        })
      )
    );
  }

  // ── CreatePanel ─────────────────────────────────────────────────────────
  // "Create new" tab content.
  //
  // "New from image": triggers the file picker in the same user-gesture as the
  // button click (so the browser allows it), serialises the selected file to
  // sessionStorage as a data URL, then navigates to
  // create.html?action=home-image-pending where creator-main.js reconstructs
  // the File object and passes it to the Creator without a second click.
  //
  // "New from scratch": navigates to create.html?action=new-blank which already
  // sets mode='design' + pendingCreatorAction='scratch' in one step.
  //
  // "Embroidery planner (beta)": optional third tile, only rendered when the
  // experimental.embroideryTool pref is on. Goes to embroidery.html (a
  // separate prototype page).
  function CreatePanel() {
    var Icons = window.Icons || {};
    var fileInputRef = React.useRef(null);
    var pendingState = React.useState(false);
    var pending = pendingState[0]; var setPending = pendingState[1];

    // Read the embroidery beta flag synchronously. UserPrefs.get returns the
    // default (false) when the pref hasn't been set, so this is safe even on
    // a first visit. We don't need a re-render listener here — the user
    // toggling the flag in another tab/page won't move them mid-render of
    // the Home Create panel; they'll see the new tile next time they land
    // on /home, which matches every other UserPrefs surface.
    var embroideryEnabled = false;
    try {
      embroideryEnabled = !!(window.UserPrefs && window.UserPrefs.get &&
        window.UserPrefs.get('experimental.embroideryTool'));
    } catch (_) { embroideryEnabled = false; }

    // bfcache restore: if the user lands back on /home via the browser back
    // button after a successful image handoff, the spinner state from the
    // previous render must not persist. `pageshow` fires whether the page
    // came from bfcache or a fresh navigation.
    React.useEffect(function () {
      function reset() { setPending(false); }
      window.addEventListener('pageshow', reset);
      return function () { window.removeEventListener('pageshow', reset); };
    }, []);

    function handleNewFromImage() {
      var input = fileInputRef.current;
      if (input) input.click();
    }

    function navigateAfterPaint(href) {
      // Two rAFs guarantee the spinner has actually painted before the
      // browser commits the navigation, so the visual hand-off feels
      // continuous instead of a blank flash.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { window.location.href = href; });
      });
    }

    function handleFileChange(e) {
      var file = e.target.files && e.target.files[0];
      // Reset so the same file can be re-selected if needed
      e.target.value = '';
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var dataUrl = ev.target.result;
        try {
          sessionStorage.setItem('cs_pending_image_dataurl', dataUrl);
          sessionStorage.setItem('cs_pending_image_name', file.name);
          sessionStorage.setItem('cs_pending_image_type', file.type || 'image/jpeg');
          setPending(true);
          navigateAfterPaint('create.html?action=home-image-pending&from=home');
        } catch (_) {
          // sessionStorage quota exceeded (very large image): the in-page
          // file -> Creator handoff is impossible. Surface the failure
          // immediately instead of bouncing through create.html with no
          // image, which would just round-trip back to here.
          setPending(false);
          alert('That image is too large to hand off (over the browser session limit). Try a smaller file (under ~5 MB).');
        }
      };
      reader.onerror = function () {
        setPending(false);
        alert('Could not read the image file. Please try again or pick a different file.');
      };
      reader.readAsDataURL(file);
    }

    return h('section', {
      className: 'home-create-panel',
      'aria-labelledby': 'home-create-panel-title'
    },
      h('h2', { id: 'home-create-panel-title', className: 'home-section__title' }, 'Start a new pattern'),
      h('input', {
        ref: fileInputRef,
        type: 'file',
        accept: 'image/*',
        className: 'home-create-file-input',
        onChange: handleFileChange,
        'aria-hidden': 'true',
        tabIndex: -1
      }),
      h('div', { className: 'home-create-panel__grid' },
        h('button', {
          type: 'button',
          className: 'home-create-tile home-create-tile--primary',
          onClick: handleNewFromImage,
          disabled: pending
        },
          h('span', { className: 'home-create-tile__icon', 'aria-hidden': 'true' },
            typeof Icons.image === 'function' ? Icons.image() : null),
          h('span', { className: 'home-create-tile__copy' },
            h('strong', null, 'New from image'),
            h('span', null, 'Convert a photo into stitches')
          )
        ),
        h('a', {
          href: 'create.html?action=new-blank',
          className: 'home-create-tile' + (pending ? ' home-create-tile--disabled' : ''),
          'aria-disabled': pending ? 'true' : undefined,
          onClick: pending ? function (e) { e.preventDefault(); } : undefined
        },
          h('span', { className: 'home-create-tile__icon', 'aria-hidden': 'true' },
            typeof Icons.plus === 'function' ? Icons.plus() : null),
          h('span', { className: 'home-create-tile__copy' },
            h('strong', null, 'New from scratch'),
            h('span', null, 'Start with a blank grid')
          )
        ),
        // Embroidery planner: experimental third tile, only rendered when the
        // user has opted in via Preferences -> Creator -> Experimental. Carries a
        // "Beta" badge so users know this lives outside the supported flows.
        embroideryEnabled && h('a', {
          href: 'embroidery.html?from=home',
          className: 'home-create-tile' + (pending ? ' home-create-tile--disabled' : ''),
          'aria-disabled': pending ? 'true' : undefined,
          onClick: pending ? function (e) { e.preventDefault(); } : undefined
        },
          h('span', { className: 'home-create-tile__icon', 'aria-hidden': 'true' },
            typeof Icons.thread === 'function' ? Icons.thread()
              : (typeof Icons.image === 'function' ? Icons.image() : null)),
          h('span', { className: 'home-create-tile__copy' },
            h('strong', null, 'Embroidery planner ',
              h('span', { className: 'home-create-tile__badge' }, 'Beta')),
            h('span', null, 'Sketch a freehand embroidery layout (experimental)')
          )
        )
      ),
      // Transitional overlay shown between FileReader-load and the Creator
      // page taking over. Stops the page change feeling like a teleport.
      pending && h('div', {
        className: 'home-create-pending',
        role: 'status',
        'aria-live': 'polite'
      },
        h('div', { className: 'home-create-pending__spinner', 'aria-hidden': 'true' }),
        h('div', { className: 'home-create-pending__msg' }, 'Preparing your image\u2026')
      )
    );
  }

  // ── StashPanel ──────────────────────────────────────────────────────────
  // "Stash" tab content. Reuses the stash data loaded in HomeApp.
  function StashPanel(props) {
    var s = props.stash;
    if (!s) {
      return h('div', { className: 'home-stash-panel home-stash-panel--empty' },
        h('p', null, 'No stash data yet. Add threads in the Stash Manager.'),
        h('a', { href: 'manager.html?from=home', className: 'btn btn-primary', style: { marginTop: '12px', display: 'inline-flex' } }, 'Open Stash Manager')
      );
    }
    var rows = [
      { label: 'Owned skeins',   value: s.ownedSkeins },
      { label: 'Unique threads', value: s.uniqueThreads },
      { label: 'Patterns saved', value: s.patternCount }
    ].filter(function (r) { return typeof r.value === 'number'; });
    if (!rows.length) return null;
    return h('section', {
      className: 'home-stash-panel',
      'aria-labelledby': 'home-stash-panel-title'
    },
      h('div', { className: 'home-stash-panel__head' },
        h('h2', { id: 'home-stash-panel-title', className: 'home-section__title' }, 'Stash at a glance'),
        h('a', { href: 'manager.html?from=home', className: 'home-section__more' }, 'Open Stash Manager')
      ),
      h('div', { className: 'home-stash__card' },
        rows.map(function (r) {
          return h('div', { key: r.label, className: 'home-stash__row' },
            h('span', null, r.label),
            h('span', { className: 'home-stash__value' }, r.value)
          );
        })
      )
    );
  }

  // ── StatsPanel ──────────────────────────────────────────────────────────
  function StatsPanel() {
    var Icons = window.Icons || {};
    return h('section', { className: 'home-stats-panel' },
      h('p', { className: 'home-stats-panel__sub' }, 'View stitching statistics and your pattern showcase.'),
      h('a', {
        href: 'index.html?mode=stats&from=home',
        className: 'home-stats-panel__link'
      },
        h('span', null, 'Open Stats & Showcase'),
        h('span', { className: 'home-stats-panel__link-icon', 'aria-hidden': 'true' },
          typeof Icons.pointing === 'function' ? Icons.pointing() : null)
      )
    );
  }

  // ── HomeFooter ──────────────────────────────────────────────────────────
  // Simplified — Help is the header Help button; Preferences is File > Preferences.
  function HomeFooter() {
    return h('footer', { className: 'home-footer' },
      h('a', { href: 'https://github.com/', className: 'home-footer__link', rel: 'noopener' }, 'About')
    );
  }

  // ── Root component ──────────────────────────────────────────────────────
  function HomeApp() {
    // Honour ?tab= so external entry points (Header "Create", manager.html
    // "Add new", anywhere else in the app that wants to start a new pattern)
    // can land directly on the Create tab. Keeping a single canonical Create
    // surface stops the welcome card on create.html from being reachable via
    // navigation — it now only shows defensively for direct URL hits.
    var tabState = React.useState(function () {
      try {
        var p = new URLSearchParams(window.location.search);
        var t = p.get('tab');
        if (t === 'create' || t === 'stash' || t === 'stats' || t === 'projects') return t;
      } catch (_) {}
      return 'projects';
    });
    var tab = tabState[0]; var setTab = tabState[1];
    var activeState = React.useState(null);
    var active = activeState[0]; var setActive = activeState[1];
    var listState = React.useState([]);
    var list = listState[0]; var setList = listState[1];
    var stashState = React.useState(null);
    var stash = stashState[0]; var setStash = stashState[1];
    var prefsState = React.useState(false);
    var prefsOpen = prefsState[0]; var setPrefsOpen = prefsState[1];

    // Listen for cs:openPreferences from the footer link, command palette, and Header.
    React.useEffect(function () {
      var open = function () { if (typeof window.PreferencesModal !== 'undefined') setPrefsOpen(true); };
      window.addEventListener('cs:openPreferences', open);
      return function () { window.removeEventListener('cs:openPreferences', open); };
    }, []);

    // Load patterns directly from the manager IndexedDB. StashBridge has no
    // public read for the pattern library, so mirror what home-screen.js does
    // (raw IndexedDB) — keeps /home decoupled from manager-app.js state.
    function loadManagerPatterns() {
      return new Promise(function (resolve) {
        try {
          var req = indexedDB.open('stitch_manager_db', 1);
          req.onsuccess = function (e) {
            var db = e.target.result;
            try {
              if (!db.objectStoreNames.contains('manager_state')) { resolve([]); return; }
              var tx = db.transaction('manager_state', 'readonly');
              var store = tx.objectStore('manager_state');
              var r = store.get('patterns');
              r.onsuccess = function () { resolve(Array.isArray(r.result) ? r.result : []); };
              r.onerror = function () { resolve([]); };
            } catch (_) { resolve([]); }
          };
          req.onerror = function () { resolve([]); };
        } catch (_) { resolve([]); }
      });
    }

    var refreshAllRef = React.useRef(function () {});
    React.useEffect(function () {
      var cancelled = false;
      function refreshAll() {
        if (window.ProjectStorage && window.ProjectStorage.getActiveProject) {
          window.ProjectStorage.getActiveProject().then(function (p) {
            if (!cancelled) setActive(p || null);
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
          }).catch(function () {});
        }
        // Threads (StashBridge.getGlobalStash) + patterns (raw IDB read).
        // The previous build called a non-existent StashBridge API so both
        // numbers were always missing and the panel rendered the empty state
        // regardless of what was actually in the manager DB.
        var threadsPromise = (window.StashBridge && typeof window.StashBridge.getGlobalStash === 'function')
          ? window.StashBridge.getGlobalStash().catch(function () { return {}; })
          : Promise.resolve({});
        Promise.all([threadsPromise, loadManagerPatterns()]).then(function (parts) {
          if (cancelled) return;
          var threads = parts[0] || {};
          var patterns = parts[1] || [];
          var owned = 0, unique = 0;
          Object.keys(threads).forEach(function (k) {
            var t = threads[k];
            // Stash entries use { owned: number } (see stash-bridge.js
            // updateThreadOwned); keep the legacy { skeins } fallback for any
            // older data still in users' IndexedDB.
            var n = 0;
            if (t && typeof t.owned === 'number') n = t.owned;
            else if (t && typeof t.skeins === 'number') n = t.skeins;
            else if (t && t.owned) n = 1;
            if (n > 0) { owned += n; unique += 1; }
          });
          setStash({
            ownedSkeins: owned,
            uniqueThreads: unique,
            patternCount: patterns.length
          });
        }).catch(function () {});
      }
      refreshAllRef.current = refreshAll;
      refreshAll();
      return function () { cancelled = true; };
    }, []);

    // Live refresh: keep /home in sync with changes made elsewhere in the app
    // (Tracker saves, backup restore, manager edits in another tab, etc.).
    React.useEffect(function () {
      function reload() { try { refreshAllRef.current(); } catch (_) {} }
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

    function onOpenProject() {
      window.location.href = 'stitch.html?from=home';
    }

    var Header = window.Header;
    // Projects tab excludes active project from "All projects" list since it
    // already appears in ActiveProjectCard above.
    var otherProjects = list.filter(function (p) { return !active || p.id !== active.id; });

    return h('div', { className: 'home-shell' },
      Header
        ? h(Header, {
            page: 'home',
            tab: 'home',
            activeProject: active,
            onOpenProject: onOpenProject,
            onPreferences: function () {
              try { window.dispatchEvent(new CustomEvent('cs:openPreferences')); } catch (_) {}
            }
          })
        : null,
      h(HomeTabBar, { tab: tab, onTab: setTab, projectCount: list.length }),
      h('div', { className: 'home-page', role: 'tabpanel' },
        tab === 'projects' && h(React.Fragment, null,
          h(GreetingRow, { list: list, onTab: setTab }),
          h(ActiveProjectCard, { activeProject: active }),
          h(ProjectsList, { projects: otherProjects }),
          h(HomeFooter, null)
        ),
        tab === 'create' && h(React.Fragment, null,
          h(CreatePanel, null),
          h(HomeFooter, null)
        ),
        tab === 'stash' && h(React.Fragment, null,
          h(StashPanel, { stash: stash }),
          h(HomeFooter, null)
        ),
        tab === 'stats' && h(React.Fragment, null,
          h(StatsPanel, null),
          h(HomeFooter, null)
        )
      ),
      prefsOpen && typeof window.PreferencesModal !== 'undefined'
        ? h(window.PreferencesModal, { onClose: function () { setPrefsOpen(false); } })
        : null
    );
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
})();
