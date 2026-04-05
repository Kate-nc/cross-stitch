// home-screen.js
// Dashboard Hub — rendered by UnifiedApp when showHome === true.
// Depends on: ProjectStorage, StashBridge, Header, SharedModals (all globals set before this script).

(function () {
  'use strict';

  // ── Utilities ────────────────────────────────────────────────────────────

  function genThumb(pat, sW, sH) {
    if (!pat || !sW || !sH) return null;
    try {
      const c = document.createElement('canvas');
      c.width = sW; c.height = sH;
      const ctx = c.getContext('2d');
      const imgData = ctx.createImageData(sW, sH);
      const d = imgData.data;
      for (let i = 0; i < pat.length; i++) {
        const m = pat[i];
        const ix = i * 4;
        if (!m || m.id === '__skip__' || m.id === '__empty__' || !m.rgb) {
          d[ix] = 255; d[ix+1] = 255; d[ix+2] = 255; d[ix+3] = 255;
        } else {
          d[ix] = m.rgb[0]; d[ix+1] = m.rgb[1]; d[ix+2] = m.rgb[2]; d[ix+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return c.toDataURL('image/jpeg', 0.85);
    } catch (e) { return null; }
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return '';
    const diff = Date.now() - then;
    if (diff < 0) return 'just now';
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 86400000 * 2) return 'yesterday';
    if (diff < 86400000 * 7) return Math.floor(diff / 86400000) + ' days ago';
    return new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  }

  function greeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function projectColor(id) {
    let hash = 0;
    for (let i = 0; i < (id || '').length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return 'hsl(' + hue + ', 45%, 58%)';
  }

  // ── Component ─────────────────────────────────────────────────────────────

  function HomeScreen(props) {
    const {
      onOpenCreatorBlank,
      onOpenCreatorWithImage,
      onOpenFile,
      onImportFile,
      onOpenProject,
      onNavigateToStash,
    } = props;

    const { useState, useEffect, useRef } = React;

    const [projects, setProjects] = useState([]);
    const [stash, setStash] = useState(null);
    const [heroThumb, setHeroThumb] = useState(null);
    const [lowCount, setLowCount] = useState(0);
    const [conflictCount, setConflictCount] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [modal, setModal] = useState(null);

    const imageInputRef = useRef(null);
    const openFileInputRef = useRef(null);
    const importInputRef = useRef(null);

    // ── Data loading ──

    useEffect(function () {
      let alive = true;

      async function load() {
        let projs = [];
        try { projs = (await ProjectStorage.listProjects()) || []; } catch (e) {}
        if (!alive) return;
        setProjects(projs);

        let stashData = null;
        try {
          const raw = await StashBridge.getGlobalStash();
          if (raw && Object.keys(raw).length > 0) stashData = raw;
        } catch (e) {}
        if (!alive) return;
        setStash(stashData);

        if (stashData) {
          const low = Object.values(stashData).filter(function (s) {
            const owned = s.owned || 0;
            return owned > 0 && owned <= 1;
          }).length;
          setLowCount(low);

          try {
            const conflicts = await StashBridge.detectConflicts();
            if (!alive) return;
            if (conflicts && conflicts.length > 0) {
              const names = new Set();
              conflicts.forEach(function (c) {
                (c.patterns || []).forEach(function (p) { names.add(p.title); });
              });
              setConflictCount(names.size);
            }
          } catch (e) {}
        }

        setLoaded(true);

        if (projs.length > 0) {
          try {
            const hero = await ProjectStorage.get(projs[0].id);
            if (!alive) return;
            if (hero && hero.pattern && hero.settings) {
              setHeroThumb(genThumb(hero.pattern, hero.settings.sW, hero.settings.sH));
            }
          } catch (e) {}
        }
      }

      load();
      return function () { alive = false; };
    }, []);

    // ── Derived values ──

    const heroProject = projects[0] || null;
    const recentProjects = projects.slice(1, 6);
    const projectCount = projects.length;

    const totalStitches = projects.reduce(function (s, p) { return s + (p.totalStitches || 0); }, 0);
    const completedStitches = projects.reduce(function (s, p) { return s + (p.completedStitches || 0); }, 0);
    const activeProgress = totalStitches > 0 ? Math.round(completedStitches / totalStitches * 100) : 0;
    const skeinCount = stash ? Object.keys(stash).filter(function (id) { return (stash[id].owned || 0) > 0; }).length : null;
    const stitchedHours = completedStitches > 0 ? Math.max(1, Math.round(completedStitches / 200)) : null;

    const heroProgress = heroProject && heroProject.totalStitches > 0
      ? Math.min(100, Math.round(heroProject.completedStitches / heroProject.totalStitches * 100))
      : 0;

    const showStashAlert = stash !== null && loaded && (lowCount > 0 || conflictCount > 0);

    // Determine hero button primary/secondary based on last-opened page
    const heroLastPage = heroProject ? (heroProject.source || 'tracker') : 'tracker';
    const heroPrimaryMode = heroLastPage === 'creator' ? 'design' : 'track';
    const heroSecondaryMode = heroLastPage === 'creator' ? 'track' : 'design';
    const heroPrimaryLabel = heroPrimaryMode === 'track' ? 'Track' : 'Edit';
    const heroSecondaryLabel = heroSecondaryMode === 'track' ? 'Track' : 'Edit';

    // ── File handlers ──

    function handleImageChange(e) {
      const f = e.target.files[0];
      if (!f) return;
      e.target.value = '';
      if (f.size > 5 * 1024 * 1024) {
        alert('File too large. Please select an image under 5MB.');
        return;
      }
      const rd = new FileReader();
      rd.onload = function (ev) { onOpenCreatorWithImage(ev.target.result); };
      rd.readAsDataURL(f);
    }

    function handleOpenFileChange(e) {
      const f = e.target.files[0];
      if (!f) return;
      e.target.value = '';
      if (f.name.toLowerCase().endsWith('.json')) {
        const rd = new FileReader();
        rd.onload = function (ev) {
          try {
            const proj = JSON.parse(ev.target.result);
            onOpenFile(proj);
          } catch (err) {
            alert('Could not open file: ' + err.message);
          }
        };
        rd.readAsText(f);
      } else {
        onImportFile(f);
      }
    }

    function handleImportChange(e) {
      const f = e.target.files[0];
      if (!f) return;
      e.target.value = '';
      onImportFile(f);
    }

    // ── Loading state — show header only until data arrives ──

    const headerEl = typeof Header !== 'undefined'
      ? React.createElement(Header, {
          page: 'creator',
          tab: null,
          onPageChange: function () {},
          setModal: setModal,
          onNewProject: onOpenCreatorBlank,
        })
      : null;

    if (!loaded) {
      return React.createElement('div', { className: 'home-wrap' }, headerEl);
    }

    // ── Actions panel (shared between first-time and returning layouts) ──

    const startNewPanel = React.createElement('div', { className: 'home-panel' },
      React.createElement('div', { className: 'home-panel-header' }, 'START NEW'),
      React.createElement('div', { className: 'home-action-list', role: 'list' },
        React.createElement('button', {
          className: 'home-action-row', role: 'listitem',
          onClick: function () { imageInputRef.current && imageInputRef.current.click(); },
        },
          React.createElement('span', { className: 'home-action-icon', 'aria-hidden': 'true' }, '🖼'),
          React.createElement('span', null, 'From image')
        ),
        React.createElement('button', {
          className: 'home-action-row', role: 'listitem',
          onClick: onOpenCreatorBlank,
        },
          React.createElement('span', { className: 'home-action-icon', 'aria-hidden': 'true' }, '✏️'),
          React.createElement('span', null, 'From scratch')
        ),
        React.createElement('button', {
          className: 'home-action-row', role: 'listitem',
          onClick: function () { openFileInputRef.current && openFileInputRef.current.click(); },
        },
          React.createElement('span', { className: 'home-action-icon', 'aria-hidden': 'true' }, '📂'),
          React.createElement('span', null, 'Open file')
        ),
        React.createElement('button', {
          className: 'home-action-row', role: 'listitem',
          onClick: function () { importInputRef.current && importInputRef.current.click(); },
        },
          React.createElement('span', { className: 'home-action-icon', 'aria-hidden': 'true' }, '📥'),
          React.createElement('span', null, 'Import .oxs / .pdf')
        )
      ),
      // Hidden file inputs
      React.createElement('input', {
        ref: imageInputRef, type: 'file', accept: 'image/jpeg,image/png',
        style: { display: 'none' }, onChange: handleImageChange,
        'aria-label': 'Select image file',
      }),
      React.createElement('input', {
        ref: openFileInputRef, type: 'file', accept: '.json,.oxs,.pdf,.png',
        style: { display: 'none' }, onChange: handleOpenFileChange,
        'aria-label': 'Open project file',
      }),
      React.createElement('input', {
        ref: importInputRef, type: 'file', accept: '.oxs,.pdf',
        style: { display: 'none' }, onChange: handleImportChange,
        'aria-label': 'Import pattern file',
      })
    );

    // ── Recent panel ──

    const recentPanel = React.createElement('div', { className: 'home-panel' },
      React.createElement('div', { className: 'home-panel-header' }, 'RECENT'),
      recentProjects.length > 0
        ? React.createElement(React.Fragment, null,
            recentProjects.map(function (proj) {
              const pct = proj.totalStitches > 0
                ? Math.min(100, Math.round(proj.completedStitches / proj.totalStitches * 100))
                : 0;
              const displayName = proj.name && proj.name.length > 22
                ? proj.name.slice(0, 20) + '…'
                : (proj.name || 'Untitled');
              const lastMode = proj.source === 'creator' ? 'design' : 'track';
              return React.createElement('button', {
                key: proj.id, className: 'home-recent-row',
                onClick: function () { onOpenProject(proj.id, lastMode); },
              },
                React.createElement('div', {
                  className: 'home-recent-swatch',
                  style: { background: projectColor(proj.id) },
                  'aria-hidden': 'true',
                },
                  React.createElement('span', { style: { color: '#fff', fontSize: 10, fontWeight: 700 } },
                    (proj.name || '?')[0].toUpperCase()
                  )
                ),
                React.createElement('span', { className: 'home-recent-name' }, displayName),
                React.createElement('span', {
                  className: 'home-recent-pct' + (pct >= 100 ? ' home-recent-done' : ''),
                }, pct >= 100 ? 'Done' : pct + '%')
              );
            }),
            projects.length > 6 && React.createElement('button', {
              className: 'home-view-all',
              onClick: onNavigateToStash,
            }, 'View all →')
          )
        : React.createElement('p', { className: 'home-empty-msg' }, 'No other projects yet.')
    );

    // ── Main render ──

    return React.createElement('div', { className: 'home-wrap' },
      headerEl,

      React.createElement('div', { className: 'home-content' },
        React.createElement('div', { className: 'home-inner' },

          // Greeting
          React.createElement('h1', { className: 'home-greeting' },
            greeting() + ' ',
            React.createElement('span', { 'aria-hidden': 'true', className: 'home-greeting-emoji' }, '✨')
          ),

          // Stats Row (only when there are projects)
          projectCount > 0 && React.createElement('div', {
            className: 'home-stats',
            role: 'group',
            'aria-label': 'Project statistics',
          },
            React.createElement('div', {
              className: 'home-stat-card',
              'aria-label': projectCount + ' projects',
            },
              React.createElement('div', { className: 'home-stat-num' }, projectCount),
              React.createElement('div', { className: 'home-stat-lbl' }, 'projects')
            ),
            skeinCount !== null && React.createElement('div', {
              className: 'home-stat-card',
              'aria-label': skeinCount + ' skeins in stash',
            },
              React.createElement('div', { className: 'home-stat-num' }, skeinCount),
              React.createElement('div', { className: 'home-stat-lbl' }, 'skeins')
            ),
            React.createElement('div', {
              className: 'home-stat-card',
              'aria-label': activeProgress + '% average progress',
            },
              React.createElement('div', { className: 'home-stat-num home-stat-accent' }, activeProgress + '%'),
              React.createElement('div', { className: 'home-stat-lbl' }, 'active progress')
            ),
            stitchedHours !== null && React.createElement('div', {
              className: 'home-stat-card',
              'aria-label': stitchedHours + ' hours stitched',
            },
              React.createElement('div', { className: 'home-stat-num' }, stitchedHours + 'h'),
              React.createElement('div', { className: 'home-stat-lbl' }, 'stitched')
            )
          ),

          // Hero Card (only when a project exists)
          heroProject && React.createElement('div', { className: 'home-hero-card' },
            React.createElement('div', { className: 'home-hero-thumb-wrap' },
              heroThumb
                ? React.createElement('img', {
                    src: heroThumb, alt: '',
                    className: 'home-hero-thumb',
                    'aria-hidden': 'true',
                  })
                : React.createElement('div', {
                    className: 'home-hero-thumb home-hero-thumb-placeholder',
                    style: { background: projectColor(heroProject.id) },
                    'aria-hidden': 'true',
                  },
                    React.createElement('span', { style: { color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1 } },
                      (heroProject.name || '?')[0].toUpperCase()
                    )
                  )
            ),
            React.createElement('div', { className: 'home-hero-body' },
              React.createElement('div', { className: 'home-hero-label' }, 'Continue stitching'),
              React.createElement('div', { className: 'home-hero-name' },
                heroProject.name || 'Untitled'
              ),
              React.createElement('div', { className: 'home-hero-progress-row' },
                React.createElement('div', {
                  className: 'home-progress-bar',
                  role: 'progressbar',
                  'aria-valuenow': heroProgress,
                  'aria-valuemin': 0,
                  'aria-valuemax': 100,
                  'aria-label': heroProgress + '% complete',
                },
                  React.createElement('div', {
                    className: 'home-progress-fill',
                    style: { width: heroProgress + '%' },
                  })
                ),
                React.createElement('span', { className: 'home-hero-pct' }, heroProgress + '%'),
                heroProject.updatedAt && React.createElement('span', {
                  className: 'home-hero-time',
                }, timeAgo(heroProject.updatedAt))
              ),
              React.createElement('div', { className: 'home-hero-actions' },
                React.createElement('button', {
                  className: 'home-btn-primary',
                  onClick: function () { onOpenProject(heroProject.id, heroPrimaryMode); },
                }, heroPrimaryLabel),
                React.createElement('button', {
                  className: 'home-btn-secondary',
                  onClick: function () { onOpenProject(heroProject.id, heroSecondaryMode); },
                }, heroSecondaryLabel)
              )
            )
          ),

          // Start New + Recent (side-by-side, or Start New full-width for first-time)
          projectCount === 0
            ? startNewPanel
            : React.createElement('div', { className: 'home-panels' }, startNewPanel, recentPanel),

          // Empty state message for first-time users
          projectCount === 0 && React.createElement('p', { className: 'home-firsttime-msg' },
            'No projects yet — start your first one above!'
          ),

          // Stash Alert Bar
          showStashAlert && React.createElement('div', {
            className: 'home-stash-alert',
            role: 'alert',
          },
            React.createElement('span', { className: 'home-stash-alert-text' },
              React.createElement('span', { 'aria-hidden': 'true' }, '⚠ '),
              lowCount > 0
                ? lowCount + ' thread' + (lowCount !== 1 ? 's' : '') + ' running low'
                : null,
              lowCount > 0 && conflictCount > 0 ? '  ·  ' : null,
              conflictCount > 0
                ? conflictCount + ' project' + (conflictCount !== 1 ? 's' : '') + ' need thread'
                : null
            ),
            React.createElement('button', {
              className: 'home-stash-link',
              onClick: onNavigateToStash,
            }, 'Open stash manager →')
          )
        )
      ),

      // Shared modals
      modal === 'help' && typeof SharedModals !== 'undefined'
        ? React.createElement(SharedModals.Help, { onClose: function () { setModal(null); } })
        : null,
      modal === 'about' && typeof SharedModals !== 'undefined'
        ? React.createElement(SharedModals.About, { onClose: function () { setModal(null); } })
        : null,
      modal === 'calculator' && typeof SharedModals !== 'undefined'
        ? React.createElement(SharedModals.Calculator, { onClose: function () { setModal(null); } })
        : null
    );
  }

  window.HomeScreen = HomeScreen;
})();
