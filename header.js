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
//   onNameChange – callback(newName) when user edits the inline name
function ContextBar({ name, dimensions, palette, pct, page, onEdit, onTrack, onSave, onHome, onNameChange }) {
  if (!name) return null;
  const dimStr = dimensions ? `${dimensions.width}×${dimensions.height}` : null;
  const colStr = palette ? `${palette.length} colour${palette.length !== 1 ? 's' : ''}` : null;
  const meta = [dimStr, colStr].filter(Boolean).join(' · ');

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const inputRef = React.useRef(null);

  React.useEffect(() => { setDraft(name); }, [name]);
  React.useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  function commitName() {
    setEditing(false);
    const trimmed = (draft || '').trim().slice(0, 60);
    if (trimmed && trimmed !== name && onNameChange) onNameChange(trimmed);
    else setDraft(name);
  }

  return React.createElement('div', { className: 'tb-context-bar' },
    React.createElement('div', { className: 'tb-context-bar-inner' },
      React.createElement('div', {
        onClick: !editing ? (onHome || undefined) : undefined,
        style: { display:'flex', alignItems:'center', gap:6, flex:1, cursor: !editing && onHome ? 'pointer' : 'default', minWidth:0 }
      },
        editing
          ? React.createElement('input', {
              ref: inputRef,
              className: 'tb-context-name-input',
              value: draft,
              maxLength: 60,
              onChange: function(e) { setDraft(e.target.value); },
              onBlur: commitName,
              onKeyDown: function(e) {
                if (e.key === 'Enter') { e.target.blur(); }
                else if (e.key === 'Escape') { setDraft(name); setEditing(false); }
              },
              onClick: function(e) { e.stopPropagation(); }
            })
          : onNameChange
            ? React.createElement('button', {
                type: 'button',
                className: 'tb-context-name tb-context-name--editable',
                onClick: function(e) { e.stopPropagation(); setEditing(true); },
                title: 'Click to rename'
              }, name)
            : React.createElement('span', {
                className: 'tb-context-name',
                title: undefined
              }, name),
        meta && React.createElement('span', { className: 'tb-context-meta' }, meta),
        pct !== null && React.createElement('span', { className: 'tb-context-pct' },
          React.createElement('span', { className: 'tb-context-pct-bar' },
            React.createElement('span', { className: 'tb-context-pct-fill', style: { width: pct + '%' } })
          ),
          React.createElement('span', { className: 'tb-context-pct-lbl' }, pct + '%')
        )
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

function Header({ page, tab, onPageChange, onOpen, onSave, onTrack, onExportPDF, onNewProject, setModal, activeProject }) {
  const [pageDrop, setPageDrop] = React.useState(false);
  const dropRef = React.useRef(null);
  React.useEffect(() => {
    if (!pageDrop) return;
    function close(e) { if (dropRef.current && !dropRef.current.contains(e.target)) setPageDrop(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pageDrop]);

  const [fileMenuOpen, setFileMenuOpen] = React.useState(false);
  const fileMenuRef = React.useRef(null);
  React.useEffect(() => {
    if (!fileMenuOpen) return;
    function close(e) { if (fileMenuRef.current && !fileMenuRef.current.contains(e.target)) setFileMenuOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [fileMenuOpen]);

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
          onClick: () => { if (typeof window.__goHome === 'function') { window.__goHome(); } else if (page === 'creator') { window.scrollTo(0, 0); } else { window.location.href = 'index.html'; } }
        }, '×∕× Cross Stitch'),

        // App-section navigation tabs
        React.createElement('nav', { className: 'tb-app-nav', 'aria-label': 'App sections' },
          appSections.map(({ id, label, href }) =>
            React.createElement('a', {
              key: id,
              href,
              className: 'tb-app-tab' + (page === id ? ' tb-app-tab--active' : ''),
              onClick: id === 'tracker' && window.__switchToTrack
                ? (e) => { e.preventDefault(); window.__switchToTrack(); }
                : id === 'creator' && window.__switchToDesign
                  ? (e) => { e.preventDefault(); window.__switchToDesign(); }
                  : undefined,
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

        // File menu dropdown
        (onOpen || onSave || onTrack || onExportPDF || onNewProject) &&
          React.createElement('div', { ref: fileMenuRef, style: { position: 'relative', flexShrink: 0 } },
            React.createElement('button', { className: 'tb-page-btn', onClick: () => setFileMenuOpen(o => !o) },
              'File',
              React.createElement('span', { style: { fontSize: 9, opacity: 0.6, marginLeft: 3 } }, '▾')
            ),
            fileMenuOpen && React.createElement('div', { className: 'tb-page-dropdown', style: { right: 0, left: 'auto', minWidth: 190 } },
              onNewProject && React.createElement('button', {
                className: 'tb-page-dropdown-item',
                onClick: () => { onNewProject(); setFileMenuOpen(false); }
              }, 'New Project'),
              onOpen && React.createElement('button', {
                className: 'tb-page-dropdown-item',
                onClick: () => { onOpen(); setFileMenuOpen(false); }
              }, 'Open…'),
              onSave && React.createElement('button', {
                className: 'tb-page-dropdown-item',
                onClick: () => { onSave(); setFileMenuOpen(false); }
              }, 'Save (.json)'),
              page === 'creator' && onTrack && React.createElement('button', {
                className: 'tb-page-dropdown-item',
                onClick: () => { onTrack(); setFileMenuOpen(false); }
              }, 'Open in Stitch Tracker'),
              onExportPDF && React.createElement('button', {
                className: 'tb-page-dropdown-item',
                onClick: () => { onExportPDF(); setFileMenuOpen(false); }
              }, 'Export PDF…')
            )
          )
      )
    )
  );
}
