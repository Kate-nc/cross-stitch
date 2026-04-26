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
  function timeAgo(d) {
    if (typeof window.timeAgo === 'function') return window.timeAgo(d);
    return '';
  }
  function getGreeting() {
    if (typeof window.getGreeting === 'function') return window.getGreeting();
    return 'Hello';
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
      h('a', {
        href: 'index.html?action=new-from-image',
        className: 'btn btn-primary home-greeting-row__new-btn'
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
            onClick: function () { activateAndGo(p.id, 'index.html'); }
          }, 'Edit pattern')
        )
      )
    );
  }

  // ── ProjectsList ────────────────────────────────────────────────────────
  // Replaces RecentGrid. Each row exposes both Track and Edit so the user
  // chooses their destination — no silent redirect to the Tracker.
  function ProjectsList(props) {
    var list = (props.projects || []).slice(0, 8);
    if (!list.length) return null;
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
          return h('div', {
            key: p.id,
            className: 'home-proj-row'
          },
            h('div', { className: 'home-proj-row__avatar', 'aria-hidden': 'true' }, projectInitials(p.name)),
            h('div', { className: 'home-proj-row__body' },
              h('div', { className: 'home-proj-row__name' }, p.name || 'Untitled'),
              h('div', { className: 'home-proj-row__meta' }, metaParts.join(' · ')),
              pct !== null && h('div', { className: 'home-proj-row__bar', 'aria-hidden': 'true' },
                h('div', { className: 'home-proj-row__bar-fill', style: { width: pct + '%' } })
              )
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
                onClick: function () { activateAndGo(p.id, 'index.html'); }
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
  // index.html?action=home-image-pending where creator-main.js reconstructs the
  // File object and passes it to the Creator without a second click.
  //
  // "New from scratch": navigates to index.html?action=new-blank which already
  // sets mode='design' + pendingCreatorAction='scratch' in one step.
  function CreatePanel() {
    var Icons = window.Icons || {};
    var fileInputRef = React.useRef(null);

    function handleNewFromImage() {
      var input = fileInputRef.current;
      if (input) input.click();
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
          window.location.href = 'index.html?action=home-image-pending&from=home';
        } catch (_) {
          // sessionStorage quota exceeded (very large image) — fall back to the
          // existing two-click flow rather than silently failing.
          window.location.href = 'index.html?action=new-from-image';
        }
      };
      reader.onerror = function () {
        window.location.href = 'index.html?action=new-from-image';
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
          onClick: handleNewFromImage
        },
          h('span', { className: 'home-create-tile__icon', 'aria-hidden': 'true' },
            typeof Icons.image === 'function' ? Icons.image() : null),
          h('span', { className: 'home-create-tile__copy' },
            h('strong', null, 'New from image'),
            h('span', null, 'Convert a photo into stitches')
          )
        ),
        h('a', {
          href: 'index.html?action=new-blank',
          className: 'home-create-tile'
        },
          h('span', { className: 'home-create-tile__icon', 'aria-hidden': 'true' },
            typeof Icons.plus === 'function' ? Icons.plus() : null),
          h('span', { className: 'home-create-tile__copy' },
            h('strong', null, 'New from scratch'),
            h('span', null, 'Start with a blank grid')
          )
        )
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
    return h('section', { className: 'home-stats-panel' },
      h('p', { className: 'home-stats-panel__sub' }, 'View stitching statistics and your pattern showcase.'),
      h('a', {
        href: 'index.html?mode=stats',
        className: 'home-stats-panel__link'
      }, 'Open Stats & Showcase →')
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
    var tabState = React.useState('projects');
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

    React.useEffect(function () {
      var cancelled = false;
      if (window.ProjectStorage && window.ProjectStorage.getActiveProject) {
        window.ProjectStorage.getActiveProject().then(function (p) {
          if (!cancelled && p) setActive(p);
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
      if (window.StashBridge && typeof window.StashBridge.loadStash === 'function') {
        Promise.resolve(window.StashBridge.loadStash()).then(function (data) {
          if (cancelled || !data) return;
          var threads = data.threads || {};
          var owned = 0, unique = 0;
          Object.keys(threads).forEach(function (k) {
            var t = threads[k];
            var n = (t && typeof t.skeins === 'number') ? t.skeins : (t && t.owned ? 1 : 0);
            if (n > 0) { owned += n; unique += 1; }
          });
          setStash({
            ownedSkeins: owned,
            uniqueThreads: unique,
            patternCount: Array.isArray(data.patterns) ? data.patterns.length : 0
          });
        }).catch(function () {});
      }
      return function () { cancelled = true; };
    }, []);

    function onOpenProject() {
      window.location.href = 'stitch.html?picker=1&from=home';
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
          h(GreetingRow, { list: list }),
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
