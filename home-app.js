// home-app.js — UX-12 Phase 7 PR #13
// Cross-mode landing page (`/home`). Mounts to #root in home.html.
//
// Renders, top-to-bottom:
//   1. Shared <Header page="home"> (tabs + project switcher).
//   2. Greeting hero with quick "New" / "Import" / "Stash" actions.
//   3. Active-project resume card (if ProjectStorage.getActiveProject() returns one).
//   4. Recent-projects grid (top 6 by updatedAt, links into Tracker).
//   5. Four Workshop quick-action tiles.
//   6. Stash summary card (read from stash-bridge.js when available).
//   7. Footer links (Help, Preferences, About).
//
// Workshop tokens only — no raw hex outside box-shadow rgba(). 44px touch
// targets on coarse pointers; reduced-motion suppression handled via styles.css.
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

  // ── Sections ───────────────────────────────────────────────────────────
  function GreetingHero(props) {
    var name = props.activeProject && props.activeProject.name;
    var sub = name
      ? 'Last opened ' + (props.activeProject.updatedAt ? timeAgo(props.activeProject.updatedAt) : 'recently') + ' \u00b7 ' + name
      : 'Pick a project below, or start something new.';
    return h('section', { className: 'home-hero' },
      h('div', { className: 'home-hero__copy' },
        h('h1', { className: 'home-hero__title' }, getGreeting() + ', ready to stitch?'),
        h('p', { className: 'home-hero__sub' }, sub)
      )
    );
  }

  function ResumeCard(props) {
    var p = props.project;
    if (!p) return null;
    var pct = projectPct(p);
    var dim = p.settings && (p.settings.sW + '\u00d7' + p.settings.sH);
    return h('section', { className: 'home-resume', 'aria-labelledby': 'home-resume-title' },
      h('h2', { id: 'home-resume-title', className: 'home-section__title' }, 'Pick up where you left off'),
      h('div', { className: 'home-resume__card' },
        h('div', { className: 'home-resume__avatar', 'aria-hidden': 'true' }, projectInitials(p.name)),
        h('div', { className: 'home-resume__info' },
          h('div', { className: 'home-resume__name' }, p.name || 'Untitled project'),
          h('div', { className: 'home-resume__meta' },
            dim ? h('span', null, dim) : null,
            pct !== null ? h('span', null, pct + '% complete') : null,
            p.updatedAt ? h('span', null, 'Updated ' + timeAgo(p.updatedAt)) : null
          ),
          pct !== null && h('div', { className: 'home-resume__bar', 'aria-hidden': 'true' },
            h('div', { className: 'home-resume__bar-fill', style: { width: pct + '%' } })
          )
        ),
        h('div', { className: 'home-resume__actions' },
          h('button', {
            type: 'button',
            className: 'btn btn-primary home-resume__btn',
            onClick: function () { activateAndGo(p.id, 'stitch.html'); }
          }, 'Resume tracking'),
          h('button', {
            type: 'button',
            className: 'btn home-resume__btn',
            onClick: function () { activateAndGo(p.id, 'index.html'); }
          }, 'Edit pattern')
        )
      )
    );
  }

  function RecentGrid(props) {
    var list = (props.projects || []).slice(0, 6);
    if (!list.length) return null;
    return h('section', { className: 'home-recent', 'aria-labelledby': 'home-recent-title' },
      h('h2', { id: 'home-recent-title', className: 'home-section__title' }, 'Your projects'),
      h('div', { className: 'home-recent__grid' },
        list.map(function (p) {
          var pct = projectPct(p);
          return h('button', {
            key: p.id,
            type: 'button',
            className: 'home-pj-card',
            onClick: function () { activateAndGo(p.id, 'stitch.html'); },
            'aria-label': 'Open ' + (p.name || 'Untitled')
          },
            h('span', { className: 'home-pj-card__avatar', 'aria-hidden': 'true' }, projectInitials(p.name)),
            h('span', { className: 'home-pj-card__body' },
              h('span', { className: 'home-pj-card__name' }, p.name || 'Untitled'),
              h('span', { className: 'home-pj-card__meta' },
                p.updatedAt ? timeAgo(p.updatedAt) : '',
                pct !== null ? ' \u00b7 ' + pct + '%' : ''
              ),
              pct !== null && h('span', { className: 'home-pj-card__bar', 'aria-hidden': 'true' },
                h('span', { className: 'home-pj-card__bar-fill', style: { width: pct + '%' } })
              )
            )
          );
        })
      )
    );
  }

  function QuickTiles() {
    var Icons = window.Icons || {};
    var tiles = [
      { key: 'image', title: 'New from image', sub: 'Convert a photo into stitches', href: 'index.html?action=new-from-image', icon: Icons.image, primary: true },
      { key: 'blank', title: 'New from scratch', sub: 'Start with a blank grid', href: 'index.html?action=new-blank', icon: Icons.plus },
      { key: 'stash', title: 'Open Stash Manager', sub: 'Threads, patterns, shopping list', href: 'manager.html?from=home', icon: Icons.box || Icons.layers },
      { key: 'track', title: 'Open Tracker', sub: 'Mark stitches as you go', href: 'stitch.html?from=home', icon: Icons.check }
    ];
    return h('section', { className: 'home-quick', 'aria-labelledby': 'home-quick-title' },
      h('h2', { id: 'home-quick-title', className: 'home-section__title' }, 'Quick actions'),
      h('div', { className: 'home-quick__grid' },
        tiles.map(function (t) {
          return h('a', {
            key: t.key,
            href: t.href,
            className: 'home-quick__tile' + (t.primary ? ' home-quick__tile--primary' : '')
          },
            h('span', { className: 'home-quick__icon', 'aria-hidden': 'true' },
              typeof t.icon === 'function' ? t.icon() : null),
            h('span', { className: 'home-quick__copy' },
              h('strong', null, t.title),
              h('span', null, t.sub)
            )
          );
        })
      )
    );
  }

  function StashSummary(props) {
    var s = props.stash;
    if (!s) return null;
    var rows = [
      { label: 'Owned skeins', value: s.ownedSkeins },
      { label: 'Unique threads', value: s.uniqueThreads },
      { label: 'Patterns saved', value: s.patternCount }
    ].filter(function (r) { return typeof r.value === 'number'; });
    if (!rows.length) return null;
    return h('section', { className: 'home-stash', 'aria-labelledby': 'home-stash-title' },
      h('h2', { id: 'home-stash-title', className: 'home-section__title' },
        'Stash at a glance',
        h('a', { href: 'manager.html?from=home', className: 'home-section__more' }, 'Manage')
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

  function HomeFooter() {
    return h('footer', { className: 'home-footer' },
      h('button', {
        type: 'button',
        className: 'home-footer__link',
        onClick: function () {
          try { window.dispatchEvent(new CustomEvent('cs:openHelp')); } catch (_) {}
        }
      }, 'Help'),
      h('button', {
        type: 'button',
        className: 'home-footer__link',
        onClick: function () {
          try { window.dispatchEvent(new CustomEvent('cs:openPreferences')); } catch (_) {}
        }
      }, 'Preferences'),
      h('a', { href: 'https://github.com/', className: 'home-footer__link', rel: 'noopener' }, 'About')
    );
  }

  // ── Root component ─────────────────────────────────────────────────────
  function HomeApp() {
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
      // Defer to tracker: it owns the picker. Sending the user there with a
      // ?picker hint preserves the existing flow without duplicating the modal.
      window.location.href = 'stitch.html?picker=1&from=home';
    }

    var Header = window.Header;
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
      h('div', { className: 'home-page' },
        h(GreetingHero, { activeProject: active }),
        active ? h(ResumeCard, { project: active }) : null,
        h(RecentGrid, { projects: list.filter(function (p) { return !active || p.id !== active.id; }) }),
        h(QuickTiles, null),
        stash ? h(StashSummary, { stash: stash }) : null,
        h(HomeFooter, null)
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
