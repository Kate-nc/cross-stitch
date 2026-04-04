function Header({ page, tab, onPageChange, onOpen, onSave, onTrack, onNewProject, onExportPDF, setModal }) {
  const [pageDrop, setPageDrop] = React.useState(false);
  const dropRef = React.useRef(null);
  React.useEffect(() => {
    if (!pageDrop) return;
    function close(e) { if (dropRef.current && !dropRef.current.contains(e.target)) setPageDrop(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pageDrop]);

  const pages = [['pattern','Pattern'],['project','Project'],['legend','Threads'],['export','Export']];
  const activeLabel = pages.find(p => p[0] === tab)?.[1] || 'Pattern';

  return React.createElement('header', { className: 'tb-topbar' },
    React.createElement('div', { className: 'tb-topbar-inner' },
      React.createElement('span', {
        className: 'tb-logo',
        onClick: () => { if (page==='creator') window.scrollTo(0,0); else window.location.href='index.html'; }
      }, '×∕× Cross Stitch'),

      page === 'creator' && React.createElement('div', { ref: dropRef, style: { position:'relative', flexShrink:0 } },
        React.createElement('button', { className: 'tb-page-btn', onClick: () => setPageDrop(o => !o) },
          activeLabel,
          React.createElement('span', { style: { fontSize:9, opacity:0.6, marginLeft:1 } }, '▾')
        ),
        pageDrop && React.createElement('div', { className: 'tb-page-dropdown' },
          pages.map(([id, label]) =>
            React.createElement('button', {
              key: id,
              className: 'tb-page-dropdown-item' + (tab === id ? ' tb-page-dropdown-item--on' : ''),
              onClick: () => { onPageChange(id); setPageDrop(false); }
            }, label)
          )
        )
      ),

      React.createElement('div', { className: 'tb-hgap' }),

      React.createElement('a', { className: 'tb-nav-link', href: 'manager.html' }, 'Stash'),
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
          style: { background:'#ea580c', color:'#fff', borderColor:'#ea580c' }
        }, 'Track'),
      onExportPDF &&
        React.createElement('button', { className: 'tb-action-btn tb-action-btn--orange', onClick: onExportPDF }, 'Export PDF')
    )
  );
}
