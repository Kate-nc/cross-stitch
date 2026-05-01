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

  // fmtNum and threadKm are shared globals from helpers.js

  // Build the points string for a 120×32 sparkline from a daily-stitch
  // log array ([{date:'YYYY-MM-DD', count:n}, ...]). Missing days = 0.
  // Returns { points: 'x,y x,y …', total, activeDays, max }.
  function buildSpark(daily, days) {
    var byDate = {};
    (daily || []).forEach(function (e) { if (e && e.date) byDate[e.date] = e.count || 0; });
    var pts = [];
    var total = 0;
    var active = 0;
    var max = 1;
    var today = new Date();
    for (var i = days - 1; i >= 0; i -= 1) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      var k = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
      var v = byDate[k] || 0;
      pts.push(v);
      total += v;
      if (v > 0) active += 1;
      if (v > max) max = v;
    }
    var W = 120, H = 32;
    var step = pts.length > 1 ? W / (pts.length - 1) : 0;
    var coords = pts.map(function (v, i) {
      var x = (i * step).toFixed(1);
      var y = (H - (v / max) * (H - 4) - 2).toFixed(1);
      return x + ',' + y;
    }).join(' ');
    return { points: coords, total: total, activeDays: active, max: max };
  }

  // "47 days ago" / "yesterday" / "today" — short form for card footers.
  function daysAgo(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (!t) return '';
    var diff = Date.now() - t;
    var d = Math.floor(diff / 86400000);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 30) return d + ' days ago';
    var m = Math.floor(d / 30);
    if (m === 1) return '1 month ago';
    return m + ' months ago';
  }

  // Estimated completion date helper — returns a human-readable string like
  // "Est. Nov 2026" or "Est. 3 weeks" based on velocity and remaining stitches.
  // Returns null when there is insufficient data to project a date.
  function etaLabel(stitchesPerHour, completedStitches, totalStitches) {
    if (!stitchesPerHour || stitchesPerHour <= 0) return null;
    var remaining = (totalStitches || 0) - (completedStitches || 0);
    if (remaining < 50) return null; // too close / already done
    var msRemaining = (remaining / stitchesPerHour) * 3600000;
    var d = new Date(Date.now() + msRemaining);
    var diffDays = Math.round(msRemaining / 86400000);
    if (diffDays < 1) return 'Est. today';
    if (diffDays === 1) return 'Est. tomorrow';
    if (diffDays < 14) return 'Est. ' + diffDays + ' days';
    if (diffDays < 60) return 'Est. ' + Math.round(diffDays / 7) + ' weeks';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var curYear = new Date().getFullYear();
    return 'Est. ' + months[d.getMonth()] + (d.getFullYear() !== curYear ? ' ' + d.getFullYear() : '');
  }

  function rgbCss(rgb) {
    if (!Array.isArray(rgb) || rgb.length < 3) return 'var(--surface-tertiary, #ddd)';
    return 'rgb(' + (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) + ')';
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
    // Compute velocity from full project data for ETA projection (R14).
    var activeEta = null;
    if (p.totalTime && p.totalTime > 0 && p.pattern && p.done) {
      var _total = 0, _done = 0;
      for (var _i = 0; _i < p.pattern.length; _i++) {
        var _c = p.pattern[_i];
        if (_c && _c.id !== '__skip__' && _c.id !== '__empty__') _total++;
      }
      for (var _j = 0; _j < p.done.length; _j++) { if (p.done[_j] === 1) _done++; }
      if (_done > 50) activeEta = etaLabel(_done / (p.totalTime / 3600), _done, _total);
    }
    var metaParts = [
      dim || null,
      p.updatedAt ? ('Updated ' + timeAgo(p.updatedAt)) : null,
      pct !== null ? (pct + '% complete') : null,
      activeEta || null
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
            pct !== null ? pct + '%' : null,
            etaLabel(p.stitchesPerHour, p.completedStitches, p.totalStitches) || null
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
      // Route non-image pattern files through the new import engine.
      var name = (file.name || '').toLowerCase();
      var isImage = (file.type || '').indexOf('image/') === 0;
      var isPattern = /\.(oxs|xml|json|pdf)$/i.test(name);
      if (!isImage && isPattern && window.ImportEngine && typeof window.ImportEngine.openImportPicker === 'function') {
        // We already have the file — call importAndReview directly so the
        // user doesn't have to pick it again.
        try { console.log('[home] routing pattern file to ImportEngine:', name, '— ImportEngine.__build =', window.ImportEngine.__build || 'unknown'); } catch (_) {}
        setPending(true);
        window.ImportEngine.importAndReview(file).catch(function (err) {
          console.error('[home] importAndReview rejected:', err);
          if (window.Toast && window.Toast.show) {
            window.Toast.show({ message: 'Could not import: ' + (err && err.message || err), type: 'error', duration: 10000 });
          } else {
            alert('Could not import: ' + (err && err.message || err));
          }
        }).finally(function () { setPending(false); });
        return;
      }
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
        accept: 'image/*,.oxs,.xml,.json,.pdf',
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
            h('strong', null, 'New from pattern file'),
            h('span', null, 'Image, .oxs, .json or .pdf')
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
  // "Stash" tab content. Reuses the stash data + shopping/ready lists loaded
  // in HomeApp. Renders an at-a-glance dashboard rather than a deep-link.
  function StashPanel(props) {
    var s = props.stash;
    var shopping = props.shopping || [];
    var ready = props.ready || [];

    if (!s) {
      return h('div', { className: 'home-stash-panel home-stash-panel--empty' },
        h('p', null, 'No stash data yet. Add threads in the Stash Manager.'),
        h('a', { href: 'manager.html?from=home', className: 'btn btn-primary', style: { marginTop: '12px', display: 'inline-flex' } }, 'Open Stash Manager')
      );
    }

    var hasAny = (s.ownedSkeins || 0) > 0 || (s.uniqueThreads || 0) > 0 || (s.patternCount || 0) > 0 || shopping.length > 0 || ready.length > 0;
    if (!hasAny) {
      return h('div', { className: 'home-stash-panel home-stash-panel--empty' },
        h('p', null, 'Your stash is empty. Add threads in the Stash Manager to start tracking what you own.'),
        h('a', { href: 'manager.html?from=home', className: 'btn btn-primary', style: { marginTop: '12px', display: 'inline-flex' } }, 'Open Stash Manager')
      );
    }

    var shoppingTop = shopping.slice(0, 3);
    var shoppingMore = Math.max(0, shopping.length - shoppingTop.length);
    var readyTop = ready.slice(0, 3);
    var readyMore = Math.max(0, ready.length - readyTop.length);

    return h('section', {
      className: 'home-stash-panel',
      'aria-labelledby': 'home-stash-panel-title'
    },
      h('div', { className: 'home-stash-panel__head' },
        h('h2', { id: 'home-stash-panel-title', className: 'home-section__title' }, 'Stash at a glance'),
        h('a', { href: 'manager.html?from=home', className: 'home-section__more' }, 'Open Stash Manager')
      ),

      // KPI strip
      h('div', { className: 'home-kpi-grid' },
        h('div', { className: 'home-kpi' },
          h('span', { className: 'home-kpi__num' }, fmtNum(s.ownedSkeins || 0)),
          h('span', { className: 'home-kpi__lbl' }, (s.ownedSkeins === 1 ? 'Skein' : 'Skeins'))
        ),
        h('div', { className: 'home-kpi' },
          h('span', { className: 'home-kpi__num' }, fmtNum(s.uniqueThreads || 0)),
          h('span', { className: 'home-kpi__lbl' }, 'Colours')
        ),
        h('div', { className: 'home-kpi' },
          h('span', { className: 'home-kpi__num' }, fmtNum(s.patternCount || 0)),
          h('span', { className: 'home-kpi__lbl' }, (s.patternCount === 1 ? 'Pattern' : 'Patterns'))
        )
      ),

      // Shopping list + Ready to start
      h('div', { className: 'home-stash-grid' },
        h('article', { className: 'home-stash-card' },
          h('header', { className: 'home-stash-card__head' },
            h('h3', { className: 'home-stash-card__title' }, 'Shopping list'),
            shopping.length > 0
              ? h('a', { href: 'manager.html?tab=shopping&from=home', className: 'home-stash-card__more' }, 'Open')
              : null
          ),
          shopping.length === 0
            ? h('p', { className: 'home-stash-card__empty' }, 'Nothing on your shopping list.')
            : h(React.Fragment, null,
                h('ul', { className: 'home-stash-list' },
                  shoppingTop.map(function (row) {
                    return h('li', { key: row.key, className: 'home-stash-list__item' },
                      h('span', {
                        className: 'home-stash-list__sw',
                        style: { background: rgbCss(row.rgb) },
                        'aria-hidden': 'true'
                      }),
                      h('span', { className: 'home-stash-list__name' },
                        (row.brand && row.brand !== 'dmc' ? row.brand.toUpperCase() + ' ' : 'DMC ') + row.id +
                        (row.name && row.name !== row.id ? ' — ' + row.name : '')
                      ),
                      row.tobuyQty > 0
                        ? h('span', { className: 'home-stash-list__qty' }, '×' + row.tobuyQty)
                        : null
                    );
                  })
                ),
                h('p', { className: 'home-stash-card__foot' },
                  shopping.length + (shopping.length === 1 ? ' colour' : ' colours') +
                  (shoppingMore > 0 ? ' · +' + shoppingMore + ' more' : '')
                )
              )
        ),
        h('article', { className: 'home-stash-card' },
          h('header', { className: 'home-stash-card__head' },
            h('h3', { className: 'home-stash-card__title' }, 'Ready to start')
          ),
          ready.length === 0
            ? h('p', { className: 'home-stash-card__empty' }, 'No patterns are fully covered by your stash yet.')
            : h(React.Fragment, null,
                h('p', { className: 'home-stash-card__lead' },
                  h('strong', null, fmtNum(ready.length) + (ready.length === 1 ? ' pattern' : ' patterns')),
                  ' in your library can be stitched entirely from your current stash.'
                ),
                h('ul', { className: 'home-stash-chips' },
                  readyTop.map(function (p) {
                    return h('li', { key: p.id, className: 'home-stash-chips__item' },
                      h('span', null, p.title || 'Untitled')
                    );
                  }),
                  readyMore > 0
                    ? h('li', { key: '__more', className: 'home-stash-chips__item home-stash-chips__item--more' },
                        h('a', { href: 'manager.html?from=home' }, '+' + readyMore + ' more')
                      )
                    : null
                )
              )
        )
      )
    );
  }

  // ── StatsPanel ──────────────────────────────────────────────────────────
  // Mini-dashboard mirroring the look of stats-page.js's Showcase, but
  // computed from the cheap aggregate APIs already loaded on /home.
  function StatsPanel(props) {
    var lifetimeStitches = props.lifetimeStitches || 0;
    var dailyLog = props.dailyLog || [];
    var oldestWip = props.oldestWip || null;

    var hasLifetime = lifetimeStitches > 0;
    var spark = buildSpark(dailyLog, 30);

    return h('section', {
      className: 'home-stats-panel',
      'aria-labelledby': 'home-stats-panel-title'
    },
      h('div', { className: 'home-stash-panel__head' },
        h('h2', { id: 'home-stats-panel-title', className: 'home-section__title' }, 'Your stitching'),
        h('a', {
          href: 'index.html?mode=stats&from=home',
          className: 'home-section__more'
        }, 'Full dashboard')
      ),

      // Hero: lifetime stitches
      h('div', { className: 'home-stats-hero' },
        hasLifetime
          ? h(React.Fragment, null,
              h('div', { className: 'home-stats-hero__num' }, fmtNum(lifetimeStitches)),
              h('div', { className: 'home-stats-hero__sub' },
                'lifetime stitches \u00b7 \u2248 ' + threadKm(lifetimeStitches) + ' km of thread'
              )
            )
          : h(React.Fragment, null,
              h('div', { className: 'home-stats-hero__num' }, '0'),
              h('div', { className: 'home-stats-hero__sub' },
                'Mark a stitch in the Tracker and your lifetime total will start counting here.'
              )
            )
      ),

      // Card grid: 30-day sparkline + oldest WIP
      h('div', { className: 'home-stats-grid' },
        h('article', { className: 'home-stats-card' },
          h('h3', { className: 'home-stats-card__title' }, 'Last 30 days'),
          spark.total > 0
            ? h(React.Fragment, null,
                h('svg', {
                  className: 'home-spark',
                  viewBox: '0 0 120 32',
                  preserveAspectRatio: 'none',
                  role: 'img',
                  'aria-label': fmtNum(spark.total) + ' stitches in the last 30 days'
                },
                  h('polyline', {
                    points: spark.points,
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: '1.6',
                    strokeLinejoin: 'round',
                    strokeLinecap: 'round'
                  })
                ),
                h('p', { className: 'home-stats-card__foot' },
                  h('strong', null, fmtNum(spark.total)),
                  ' stitches \u00b7 ' + spark.activeDays + (spark.activeDays === 1 ? ' active day' : ' active days')
                )
              )
            : h('p', { className: 'home-stats-card__empty' },
                'No stitches logged in the last 30 days.'
              )
        ),
        oldestWip
          ? h('button', {
              type: 'button',
              className: 'home-stats-card home-stats-card--link',
              onClick: function () {
                activateAndGo(oldestWip.id, 'stitch.html');
              }
            },
              h('h3', { className: 'home-stats-card__title' }, 'Oldest WIP'),
              h('p', { className: 'home-stats-card__name' }, oldestWip.name || 'Untitled'),
              h('p', { className: 'home-stats-card__foot' },
                'Last touched ' + daysAgo(oldestWip.lastTouchedAt) +
                  ' \u00b7 ' + (oldestWip.pct || 0) + '% done'
              )
            )
          : h('article', { className: 'home-stats-card' },
              h('h3', { className: 'home-stats-card__title' }, 'Oldest WIP'),
              h('p', { className: 'home-stats-card__empty' }, 'No active works in progress.')
            )
      )
    );
  }

  // ── HomeFooter ──────────────────────────────────────────────────────────
  // Simplified — Help is the header Help button; Preferences is File > Preferences.
  // About is a real modal (SharedModals.About) so the link opens an in-app
  // dialog rather than navigating off-site to a placeholder URL.
  function HomeFooter(props) {
    return h('footer', { className: 'home-footer' },
      h('button', {
        type: 'button',
        className: 'home-footer__link',
        onClick: function () { if (typeof props.onAbout === 'function') props.onAbout(); }
      }, 'About')
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
    var statsState = React.useState({ lifetimeStitches: 0, dailyLog: [], oldestWip: null });
    var stats = statsState[0]; var setStats = statsState[1];
    var shoppingState = React.useState([]);
    var shopping = shoppingState[0]; var setShopping = shoppingState[1];
    var readyState = React.useState([]);
    var ready = readyState[0]; var setReady = readyState[1];
    var prefsState = React.useState(false);
    var prefsOpen = prefsState[0]; var setPrefsOpen = prefsState[1];
    var aboutState = React.useState(false);
    var aboutOpen = aboutState[0]; var setAboutOpen = aboutState[1];

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
    var refreshStashRef = React.useRef(function () {});
    var refreshStatsRef = React.useRef(function () {});
    // Track current tab in a ref so event-handler closures can read it without
    // needing to be recreated on every tab change.
    var tabRef = React.useRef(tab);
    React.useEffect(function () { tabRef.current = tab; }, [tab]);

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
            if (!p && window.ProjectStorage.getActiveProjectId &&
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
          }).catch(function () {});
        }
        // Threads (StashBridge.getGlobalStash) + patterns (raw IDB read) are
        // loaded lazily when the Stash tab is opened; skip here to keep the
        // Projects tab refresh fast.
      }
      function refreshStash() {
        // Threads (StashBridge.getGlobalStash) + patterns (raw IDB read).
        // The previous build called a non-existent StashBridge API so both
        // numbers were always missing and the panel rendered the empty state
        // regardless of what was actually in the manager DB.
        var threadsPromise = (window.StashBridge && typeof window.StashBridge.getGlobalStash === 'function')
          ? window.StashBridge.getGlobalStash().catch(function () { return {}; })
          : Promise.resolve({});
        var SB = window.StashBridge;
        var PS = window.ProjectStorage;
        var shoppingP = (SB && typeof SB.getShoppingList === 'function')
          ? SB.getShoppingList().catch(function () { return []; })
          : Promise.resolve([]);
        var readyP = (PS && typeof PS.getProjectsReadyToStart === 'function')
          ? PS.getProjectsReadyToStart().catch(function () { return []; })
          : Promise.resolve([]);
        Promise.all([threadsPromise, loadManagerPatterns(), shoppingP, readyP]).then(function (parts) {
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
          setShopping(parts[2] || []);
          // Match the Showcase definition: only count patterns where the
          // current stash covers every required colour (pct === 100).
          setReady((parts[3] || []).filter(function (p) { return p && p.pct >= 100; }));
        }).catch(function () {});
      }
      function refreshStats() {
        // Stats summaries (lifetime + daily log + oldest WIP). These scan
        // across projects/IDB and are loaded lazily when the Stats tab opens.
        var PS = window.ProjectStorage;
        var lifetimeP = (PS && typeof PS.getLifetimeStitches === 'function')
          ? PS.getLifetimeStitches().catch(function () { return 0; })
          : Promise.resolve(0);
        var dailyP = (PS && typeof PS.getStitchLogByDay === 'function')
          ? PS.getStitchLogByDay(30).catch(function () { return []; })
          : Promise.resolve([]);
        var oldestP = (PS && typeof PS.getOldestWIP === 'function')
          ? PS.getOldestWIP().catch(function () { return null; })
          : Promise.resolve(null);
        Promise.all([lifetimeP, dailyP, oldestP]).then(function (r) {
          if (cancelled) return;
          setStats({ lifetimeStitches: r[0] || 0, dailyLog: r[1] || [], oldestWip: r[2] || null });
        }).catch(function () {});
      }
      refreshAllRef.current = refreshAll;
      refreshStashRef.current = refreshStash;
      refreshStatsRef.current = refreshStats;
      refreshAll();
      return function () { cancelled = true; };
    }, []);

    // Lazy-load Stash/Stats tab data only when those tabs are opened, so the
    // Projects tab refresh stays fast (avoids IDB aggregation scans on every
    // refreshAll call).
    React.useEffect(function () {
      if (tab === 'stash') try { refreshStashRef.current(); } catch (_) {}
      if (tab === 'stats') try { refreshStatsRef.current(); } catch (_) {}
    }, [tab]);

    // Live refresh: keep /home in sync with changes made elsewhere in the app
    // (Tracker saves, backup restore, manager edits in another tab, etc.).
    React.useEffect(function () {
      function reload() { try { refreshAllRef.current(); } catch (_) {} }
      function reloadCurrentTab() {
        reload();
        if (tabRef.current === 'stash') try { refreshStashRef.current(); } catch (_) {}
        if (tabRef.current === 'stats') try { refreshStatsRef.current(); } catch (_) {}
      }
      function onVisibility() { if (document.visibilityState === 'visible') reloadCurrentTab(); }
      window.addEventListener('cs:projectsChanged', reloadCurrentTab);
      window.addEventListener('cs:backupRestored', reloadCurrentTab);
      window.addEventListener('cs:patternsChanged', reloadCurrentTab);
      window.addEventListener('cs:stashChanged', reloadCurrentTab);
      document.addEventListener('visibilitychange', onVisibility);
      return function () {
        window.removeEventListener('cs:projectsChanged', reloadCurrentTab);
        window.removeEventListener('cs:backupRestored', reloadCurrentTab);
        window.removeEventListener('cs:patternsChanged', reloadCurrentTab);
        window.removeEventListener('cs:stashChanged', reloadCurrentTab);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }, []);

    function onOpenProject() {
      window.location.href = 'stitch.html?from=home';
    }

    var Header = window.Header;
    // Projects tab excludes active project from "All projects" list since it
    // already appears in ActiveProjectCard above. The `homeShowCompleted`
    // preference can additionally hide 100%-complete projects.
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
    var otherProjects = list.filter(function (p) {
      if (active && p.id === active.id) return false;
      if (!showCompleted && projectPct(p) === 100) return false;
      return true;
    });

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
          h(HomeFooter, { onAbout: function () { setAboutOpen(true); } })
        ),
        tab === 'create' && h(React.Fragment, null,
          h(CreatePanel, null),
          h(HomeFooter, { onAbout: function () { setAboutOpen(true); } })
        ),
        tab === 'stash' && h(React.Fragment, null,
          h(StashPanel, { stash: stash, shopping: shopping, ready: ready }),
          h(HomeFooter, { onAbout: function () { setAboutOpen(true); } })
        ),
        tab === 'stats' && h(React.Fragment, null,
          h(StatsPanel, {
            lifetimeStitches: stats.lifetimeStitches,
            dailyLog: stats.dailyLog,
            oldestWip: stats.oldestWip
          }),
          h(HomeFooter, { onAbout: function () { setAboutOpen(true); } })
        )
      ),
      prefsOpen && typeof window.PreferencesModal !== 'undefined'
        ? h(window.PreferencesModal, { onClose: function () { setPrefsOpen(false); } })
        : null,
      aboutOpen && typeof SharedModals !== 'undefined' && SharedModals.About
        ? h(SharedModals.About, { onClose: function () { setAboutOpen(false); } })
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
