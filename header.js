// Context bar shown below the header when a project is loaded.
// Props:
//   name        – project name string
//   dimensions  – { width, height } or null
//   palette     – palette array (for colour count) or null
//   pct         – 0-100 completion percentage or null
//   page        – 'creator' | 'tracker'
//   onEdit      – callback to navigate to creator (tracker page only)
//   onTrack     – callback to navigate to tracker (creator page only)
//   onSave      – callback to download JSON
function ContextBar({ name, dimensions, palette, pct, page, onEdit, onTrack, onSave }) {
  if (!name) return null;
  const dimStr = dimensions ? `${dimensions.width}×${dimensions.height}` : null;
  const colStr = palette ? `${palette.length} colour${palette.length !== 1 ? 's' : ''}` : null;
  const meta = [dimStr, colStr].filter(Boolean).join(' · ');

  return React.createElement('div', { className: 'tb-context-bar' },
    React.createElement('div', { className: 'tb-context-bar-inner' },
      React.createElement('span', { className: 'tb-context-name' }, name),
      meta && React.createElement('span', { className: 'tb-context-meta' }, meta),
      pct !== null && React.createElement('span', { className: 'tb-context-pct' },
        React.createElement('span', { className: 'tb-context-pct-bar' },
          React.createElement('span', { className: 'tb-context-pct-fill', style: { width: pct + '%' } })
        ),
        React.createElement('span', { className: 'tb-context-pct-lbl' }, pct + '%')
      ),
      React.createElement('div', { className: 'tb-context-actions' },
        page === 'tracker' && onEdit &&
          React.createElement('button', { className: 'tb-context-btn', onClick: onEdit }, '✏ Edit Pattern'),
        page === 'creator' && onTrack &&
          React.createElement('button', { className: 'tb-context-btn tb-context-btn--primary', onClick: onTrack }, 'Track ›'),
        onSave &&
          React.createElement('button', { className: 'tb-context-btn', onClick: onSave }, 'Save')
      )
    )
  );
}

function Header({ page, tab, onPageChange, onOpen, onSave, onTrack, onExportPDF, setModal, activeProject }) {
  const [pageDrop, setPageDrop] = React.useState(false);
  const dropRef = React.useRef(null);
  React.useEffect(() => {
    if (!pageDrop) return;
    function close(e) { if (dropRef.current && !dropRef.current.contains(e.target)) setPageDrop(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pageDrop]);

  const creatorPages = [['pattern','Pattern'],['project','Project'],['legend','Threads'],['export','Export']];
  const activeLabel = creatorPages.find(p => p[0] === tab)?.[1] || 'Pattern';

  // App-section nav tabs
  const appSections = [
    { id: 'creator', label: 'Create', href: 'index.html' },
    { id: 'tracker', label: 'Track',  href: 'stitch.html' },
    { id: 'manager', label: 'Stash',  href: 'manager.html' },
  ];

  // Active project summary for the badge (consumed from prop or read from ProjectStorage if available)
  const [projSummary, setProjSummary] = React.useState(null);
  React.useEffect(() => {
    // Prefer the passed-in activeProject prop; fall back to ProjectStorage if available
    if (activeProject) {
      setProjSummary(activeProject);
      return;
    }
    if (typeof ProjectStorage !== 'undefined') {
      ProjectStorage.getActiveProject().then(p => {
        if (p) setProjSummary(p);
      }).catch(() => {});
    }
  }, [activeProject]);

  const pct = React.useMemo(() => {
    if (!projSummary || !projSummary.settings) return null;

    let total = 0;
    if (projSummary.pattern) {
      for (let i = 0; i < projSummary.pattern.length; i += 1) {
        const c = projSummary.pattern[i];
        if (c && c.id !== '__skip__' && c.id !== '__empty__') total += 1;
      }
    }

    let done = 0;
    if (projSummary.done) {
      for (let i = 0; i < projSummary.done.length; i += 1) {
        if (projSummary.done[i] === 1) done += 1;
      }
    }

    return total > 0 ? Math.round(done / total * 100) : 0;
  }, [projSummary]);
  const projName = projSummary
    ? (projSummary.name || (projSummary.settings
        ? `${projSummary.settings.sW}×${projSummary.settings.sH}`
        : 'Project'))
    : null;

  return React.createElement(React.Fragment, null,
    React.createElement('header', { className: 'tb-topbar' },
      React.createElement('div', { className: 'tb-topbar-inner' },
        // Logo
        React.createElement('span', {
          className: 'tb-logo',
          onClick: () => { if (page === 'creator') window.scrollTo(0, 0); else window.location.href = 'index.html'; }
        }, '×∕× Cross Stitch'),

        // App-section navigation tabs
        React.createElement('nav', { className: 'tb-app-nav', 'aria-label': 'App sections' },
          appSections.map(({ id, label, href }) =>
            React.createElement('a', {
              key: id,
              href,
              className: 'tb-app-tab' + (page === id ? ' tb-app-tab--active' : ''),
              ...(page === id ? { 'aria-current': 'page' } : {}),
            }, label)
          )
        ),

        // Creator sub-page dropdown (only on creator)
        page === 'creator' && React.createElement('div', { ref: dropRef, style: { position: 'relative', flexShrink: 0, marginLeft: 6 } },
          React.createElement('button', { className: 'tb-page-btn', onClick: () => setPageDrop(o => !o) },
            activeLabel,
            React.createElement('span', { style: { fontSize: 9, opacity: 0.6, marginLeft: 1 } }, '▾')
          ),
          pageDrop && React.createElement('div', { className: 'tb-page-dropdown' },
            creatorPages.map(([id, label]) =>
              React.createElement('button', {
                key: id,
                className: 'tb-page-dropdown-item' + (tab === id ? ' tb-page-dropdown-item--on' : ''),
                onClick: () => { onPageChange(id); setPageDrop(false); }
              }, label)
            )
          )
        ),

        React.createElement('div', { className: 'tb-hgap' }),

        // Active project badge
        projName && React.createElement('div', { className: 'tb-proj-badge' },
          React.createElement('span', { className: 'tb-proj-badge-name' }, projName),
          pct !== null && React.createElement('span', { className: 'tb-proj-badge-pct' }, pct + '%')
        ),

        React.createElement('div', { className: 'tb-sep' }),

        React.createElement('button', { className: 'tb-nav-link', onClick: () => setModal('calculator') }, 'Calculator'),
        React.createElement('button', { className: 'tb-nav-link', onClick: () => setModal('help') }, 'Help'),

        React.createElement('div', { className: 'tb-sep' }),

        onOpen &&
          React.createElement('button', { className: 'tb-action-btn', onClick: onOpen }, 'Open'),
        onSave &&
          React.createElement('button', { className: 'tb-action-btn tb-action-btn--green', onClick: onSave }, 'Save'),
        page === 'creator' && onTrack &&
          React.createElement('button', {
            className: 'tb-action-btn',
            onClick: onTrack,
            style: { background: '#ea580c', color: '#fff', borderColor: '#ea580c' }
          }, 'Track ›'),
        onExportPDF &&
          React.createElement('button', { className: 'tb-action-btn tb-action-btn--orange', onClick: onExportPDF }, 'Export PDF')
      )
    )
  );
}
