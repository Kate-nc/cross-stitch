function Header({ page, tab, onPageChange, onOpen, onSave, onTrack, onNewProject, onExportPDF, setModal }) {
  const [pageDrop, setPageDrop] = React.useState(false);
  const [fileDrop, setFileDrop] = React.useState(false);
  const dropRef = React.useRef(null);
  const fileDropRef = React.useRef(null);

  React.useEffect(() => {
    if (!pageDrop && !fileDrop) return;
    function close(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setPageDrop(false);
      if (fileDropRef.current && !fileDropRef.current.contains(e.target)) setFileDrop(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pageDrop, fileDrop]);

  const pages = [['pattern','Pattern'],['project','Project'],['legend','Threads']];
  const activeLabel = pages.find(p => p[0] === tab)?.[1] || 'Pattern';

  return React.createElement('header', { className: 'tb-topbar' },
    React.createElement('div', { className: 'tb-topbar-inner' },
      React.createElement('span', {
        className: 'tb-logo',
        onClick: () => { if (page==='creator') window.scrollTo(0,0); else window.location.href='index.html'; }
      }, '×∕× Cross Stitch'),

      React.createElement('div', { ref: fileDropRef, style: { position:'relative', flexShrink:0, marginLeft: 8 } },
        React.createElement('button', { className: 'tb-page-btn', onClick: () => setFileDrop(o => !o) },
          'File',
          React.createElement('span', { style: { fontSize:9, opacity:0.6, marginLeft:1 } }, '▾')
        ),
        fileDrop && React.createElement('div', { className: 'tb-page-dropdown' },
          onNewProject && React.createElement('button', {
            className: 'tb-page-dropdown-item',
            onClick: () => { onNewProject(); setFileDrop(false); }
          }, 'New Project'),
          onOpen && React.createElement('button', {
            className: 'tb-page-dropdown-item',
            onClick: () => { onOpen(); setFileDrop(false); }
          }, 'Open...'),
          onSave && React.createElement('button', {
            className: 'tb-page-dropdown-item',
            onClick: () => { onSave(); setFileDrop(false); }
          }, 'Save (.json)'),
          onTrack && React.createElement('button', {
            className: 'tb-page-dropdown-item',
            onClick: () => { onTrack(); setFileDrop(false); }
          }, 'Open in Tracker'),
          React.createElement('button', {
            className: 'tb-page-dropdown-item',
            onClick: () => { setModal('export'); setFileDrop(false); }
          }, 'Export...')
        )
      ),

      page === 'creator' && React.createElement('div', { className: 'tb-sep', style: { marginLeft: 8, marginRight: 8 } }),

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
      React.createElement('button', { className: 'tb-nav-link', onClick: () => setModal('help') }, 'Help')
    )
  );
}
