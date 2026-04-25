// command-palette.js — Brief C: Global Command Palette (Ctrl/Cmd+K).
//
// A plain-JS overlay (no React, no JSX) so it works identically on
// index.html, stitch.html, and manager.html. Self-registers a global keydown
// handler. Action wiring is done via:
//
//   - CommandPalette.register(actions)        — append page-specific actions
//   - CommandPalette.registerPage(id, actions)— replace all actions for a page
//   - CommandPalette.open() / close()         — programmatic toggle
//
// Page-specific behaviours are bridged via existing CustomEvents:
//   cs:openHelp        (tracker + manager listeners)
//   cs:openHelpDesign  (creator listener)
//   cs:openShortcuts   (new — added by each page in this phase)
//   cs:openBulkAdd     (new — listened to by manager-app.js)
//
// We deliberately call e.preventDefault() on Ctrl/Cmd+K (overrides the
// browser's address-bar focus, matches Notion/Linear/GitHub conventions).
//
// Mitigations encoded here:
//   - Async project list is cached in window.__cachedProjectList so the
//     palette can render Recent immediately when the home screen has
//     already loaded it.
//   - Every action is wrapped to call close() before its handler so
//     same-page actions tear the overlay down. Navigation actions
//     naturally close because the page unloads.
//   - Rapid open/close is idempotent: openPalette() is a no-op when the
//     overlay is already mounted.

(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.CommandPalette) return; // double-load guard

  // ── Page detection ─────────────────────────────────────────────────────
  // Pages that need to override the pathname heuristic (e.g. when served
  // from file:// with a renamed copy) can set window.__csPageKind to
  // 'creator' | 'tracker' | 'manager' before this script runs.
  function pageKind() {
    if (window.__csPageKind === 'creator' || window.__csPageKind === 'tracker' || window.__csPageKind === 'manager') {
      return window.__csPageKind;
    }
    var p = (location.pathname || '').toLowerCase();
    if (p.indexOf('manager') !== -1) return 'manager';
    if (p.indexOf('stitch') !== -1) return 'tracker';
    return 'creator';
  }

  // ── Action registries ──────────────────────────────────────────────────
  // Static actions are always available; page actions are keyed by page id
  // and replaced wholesale by registerPage(); ad-hoc actions appended via
  // register() merge in addition.
  var STATIC_ACTIONS = [];
  var PAGE_ACTIONS = { creator: [], tracker: [], manager: [] };
  var EXTRA_ACTIONS = [];

  function _navigate(href, sameDocFn) {
    if (typeof sameDocFn === 'function' && location.pathname.toLowerCase().indexOf('index.html') !== -1) {
      try { sameDocFn(); return; } catch (_) { console.warn('CommandPalette: same-doc nav failed, falling back to full nav', _); }
    }
    location.href = href;
  }

  // Build the static action set. We construct it lazily per-open so action
  // availability (e.g. `condition`) reflects current state.
  function buildStaticActions() {
    return [
      {
        id: 'nav_home', label: 'Go Home', section: 'navigate',
        keywords: ['home', 'dashboard', 'hub'],
        action: function () {
          if (typeof window.__goHome === 'function') return window.__goHome();
          location.href = 'index.html';
        }
      },
      {
        id: 'nav_creator', label: 'Switch to Creator', section: 'navigate',
        keywords: ['creator', 'create', 'design', 'new', 'pattern', 'image'],
        action: function () {
          if (typeof window.__switchToCreate === 'function') return window.__switchToCreate();
          location.href = 'index.html';
        }
      },
      {
        id: 'nav_editor', label: 'Switch to Editor', section: 'navigate',
        keywords: ['editor', 'edit', 'modify', 'paint'],
        action: function () {
          if (typeof window.__switchToEdit === 'function') return window.__switchToEdit();
          location.href = 'index.html';
        }
      },
      {
        id: 'nav_tracker', label: 'Switch to Tracker', section: 'navigate',
        keywords: ['tracker', 'track', 'stitch', 'mark'],
        action: function () {
          if (typeof window.__switchToTrack === 'function') return window.__switchToTrack();
          location.href = 'stitch.html';
        }
      },
      {
        id: 'nav_manager', label: 'Open Stash Manager', section: 'navigate',
        keywords: ['stash', 'inventory', 'thread', 'manager', 'manage'], // terminology-lint-allow
        action: function () { location.href = 'manager.html'; }
      },
      {
        id: 'nav_stats', label: 'View Stats', section: 'navigate',
        keywords: ['stats', 'statistics', 'dashboard', 'progress'],
        action: function () {
          if (typeof window.__switchToStats === 'function') return window.__switchToStats();
          location.href = 'index.html?mode=stats';
        }
      },
      {
        id: 'nav_showcase', label: 'View Showcase', section: 'navigate',
        keywords: ['showcase', 'journey', 'share'],
        action: function () { location.href = 'index.html?mode=stats&tab=showcase'; }
      },
      {
        id: 'act_backup', label: 'Export Backup', section: 'action',
        keywords: ['backup', 'export', 'download', 'save'],
        condition: function () { return typeof window.BackupRestore !== 'undefined' && typeof window.BackupRestore.downloadBackup === 'function'; },
        action: function () {
          try {
            window.BackupRestore.downloadBackup().catch(function (e) {
              if (window.Toast && window.Toast.show) window.Toast.show({ message: 'Backup failed: ' + e.message, type: 'error' });
            });
          } catch (e) {
            console.error('CommandPalette: backup failed', e);
          }
        }
      },
      {
        id: 'act_import', label: 'Import Pattern (.oxs / .pdf / .json)', section: 'action',
        keywords: ['import', 'open', 'oxs', 'pdf', 'json', 'pattern', 'file'],
        action: function () {
          // Open a transient file picker. The Creator's home screen exposes
          // an importInputRef but it isn't globally addressable; we trigger
          // a generic picker and dispatch a CustomEvent the page can handle.
          var input = document.createElement('input');
          input.type = 'file';
          input.accept = '.oxs,.pdf,.json';
          input.style.display = 'none';
          input.onchange = function (e) {
            var f = e.target.files && e.target.files[0];
            if (f) window.dispatchEvent(new CustomEvent('cs:paletteImportFile', { detail: { file: f } }));
            document.body.removeChild(input);
          };
          document.body.appendChild(input);
          input.click();
        }
      },
      {
        id: 'act_help', label: 'Help', section: 'action',
        keywords: ['help', 'guide', 'faq'],
        action: function () {
          // Dispatch the event matching the active page's modal plumbing.
          var kind = pageKind();
          var evtName = (kind === 'creator') ? 'cs:openHelpDesign' : 'cs:openHelp';
          window.dispatchEvent(new CustomEvent(evtName));
        }
      },
      {
        id: 'act_shortcuts', label: 'Keyboard Shortcuts', section: 'action',
        keywords: ['keyboard', 'shortcut', 'keys', 'hotkey'],
        action: function () { window.dispatchEvent(new CustomEvent('cs:openShortcuts')); }
      },
      {
        id: 'act_preferences', label: 'Open Preferences', section: 'settings',
        keywords: ['preferences', 'settings', 'options', 'profile', 'theme'],
        action: function () { window.dispatchEvent(new CustomEvent('cs:openPreferences')); }
      },
      {
        id: 'act_rename', label: 'Rename current project\u2026', section: 'action',
        keywords: ['rename', 'name', 'title', 'project', 'edit'],
        // Only meaningful on Creator and Tracker — Manager has no active
        // project to rename.
        condition: function () { var k = pageKind(); return k === 'creator' || k === 'tracker'; },
        action: function () { window.dispatchEvent(new CustomEvent('cs:openRename')); }
      }
      // [B6] Removed 'act_reset_tour' — onboarding.js retired; the per-page
      // WelcomeWizard replays now live under HelpDrawer → Getting Started.
    ];
  }
  STATIC_ACTIONS = buildStaticActions();

  // ── Recent projects (async, with cache) ───────────────────────────────
  function recentProjectActions(cb) {
    var cached = window.__cachedProjectList;
    function buildFrom(list) {
      list = (list || []).slice().sort(function (a, b) {
        var at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        var bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bt - at;
      }).slice(0, 5);
      return list.map(function (p) {
        var pct = p.totalStitches > 0 ? Math.round((p.completedStitches || 0) / p.totalStitches * 100) : 0;
        return {
          id: 'recent_' + p.id,
          label: p.name || 'Untitled',
          subtitle: pct + '% · Continue tracking',
          keywords: [(p.name || '').toLowerCase(), 'project', 'continue'],
          section: 'recent',
          action: (function (id) {
            return function () {
              if (typeof ProjectStorage !== 'undefined' && ProjectStorage.setActiveProject) {
                ProjectStorage.setActiveProject(id);
              }
              location.href = 'stitch.html';
            };
          })(p.id)
        };
      });
    }
    if (cached) { cb(buildFrom(cached)); return; }
    if (typeof ProjectStorage === 'undefined' || !ProjectStorage.listProjects) { cb([]); return; }
    ProjectStorage.listProjects().then(function (list) {
      window.__cachedProjectList = list;
      cb(buildFrom(list));
    }).catch(function () { cb([]); });
  }

  // ── Fuzzy scoring ──────────────────────────────────────────────────────
  function fuzzyScore(query, action) {
    var q = (query || '').toLowerCase().trim();
    if (!q) return 1; // no query: keep everything (sort by section)
    var best = 0;
    var kws = action.keywords || [];
    for (var i = 0; i < kws.length; i++) {
      var kw = String(kws[i] || '').toLowerCase();
      if (!kw) continue;
      if (kw === q) return 100;
      if (kw.indexOf(q) === 0 && best < 80) best = 80;
      else if (kw.indexOf(q) !== -1 && best < 60) best = 60;
    }
    var label = String(action.label || '').toLowerCase();
    if (label.indexOf(q) !== -1 && best < 50) best = 50;
    return best;
  }

  var SECTION_ORDER = { recent: 0, navigate: 1, action: 2, settings: 3 };
  var SECTION_LABEL = { recent: 'Recent Projects', navigate: 'Navigate', action: 'Actions', settings: 'Settings' };

  function filterAndSort(actions, query) {
    var scored = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (typeof a.condition === 'function' && !a.condition()) continue;
      var s = fuzzyScore(query, a);
      if (s > 0) scored.push({ a: a, s: s });
    }
    scored.sort(function (x, y) {
      if (y.s !== x.s) return y.s - x.s;
      var sx = SECTION_ORDER[x.a.section] || 9;
      var sy = SECTION_ORDER[y.a.section] || 9;
      if (sx !== sy) return sx - sy;
      return (x.a.label || '').localeCompare(y.a.label || '');
    });
    return scored.map(function (r) { return r.a; });
  }

  // ── DOM construction ───────────────────────────────────────────────────
  var overlayEl = null;
  var inputEl = null;
  var listEl = null;
  var hintEl = null;
  var currentResults = [];
  var highlightIdx = 0;
  var loadingRecent = false;

  function injectStyles() {
    if (document.getElementById('cs-cmdp-styles')) return;
    // Workshop-tokenised palette (UX-12 Phase 6 PR #11). The
    // [data-theme="dark"] selectors at the top of styles.css already
    // override the relevant tokens, so dark mode falls out for free.
    // The legacy prefers-color-scheme block is retained as a fallback
    // for users without an explicit data-theme attribute.
    var css = [
      '.cs-cmdp-overlay{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,0.5);display:flex;align-items:flex-start;justify-content:center;padding:max(20vh, env(safe-area-inset-top, 0px) + 12px) 16px 16px;}',
      '.cs-cmdp-dialog{width:100%;max-width:min(520px, calc(100vw - 32px));max-height:calc(100vh - max(20vh, env(safe-area-inset-top, 0px) + 12px) - 16px);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg, 14px);box-shadow:var(--shadow-lg, 0 24px 48px rgba(0,0,0,0.18));overflow:hidden;display:flex;flex-direction:column;font-family:inherit;color:var(--text-primary);}',
      '.cs-cmdp-input-wrap{display:flex;align-items:center;gap:10px;padding:0 16px;height:48px;border-bottom:1px solid var(--border);}',
      '.cs-cmdp-input-wrap svg{flex-shrink:0;color:var(--text-tertiary);}',
      '.cs-cmdp-input{flex:1;border:none;outline:none;background:transparent;font-size:16px;font-family:inherit;color:var(--text-primary);height:100%;}',
      '.cs-cmdp-input:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}',
      '@media (max-width:480px){.cs-cmdp-input:focus-visible{outline-offset:0;}}',
      '.cs-cmdp-list{max-height:360px;overflow-y:auto;padding:8px 0;}',
      '.cs-cmdp-section{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-tertiary);padding:8px 16px 4px;}',
      '.cs-cmdp-row{display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;font-size:14px;color:var(--text-primary);}',
      '.cs-cmdp-row:hover,.cs-cmdp-row[aria-selected="true"]{background:var(--accent-soft, var(--accent-light, var(--surface-tertiary)));}',
      '.cs-cmdp-row .cs-cmdp-icon{width:18px;text-align:center;color:var(--text-tertiary);flex-shrink:0;}',
      '.cs-cmdp-row .cs-cmdp-text{flex:1;min-width:0;}',
      '.cs-cmdp-row .cs-cmdp-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.cs-cmdp-row .cs-cmdp-sub{font-size:11px;color:var(--text-tertiary);margin-top:2px;}',
      '.cs-cmdp-empty{padding:24px 16px;text-align:center;color:var(--text-tertiary);font-size:13px;}',
      '.cs-cmdp-hint{display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);padding:8px 16px;border-top:1px solid var(--border);background:var(--surface-secondary, var(--surface-tertiary));}',
      '.cs-cmdp-hint kbd{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-family:inherit;font-size:11px;color:var(--text-secondary);}',
      '@media (pointer: coarse){.cs-cmdp-row{min-height:44px;}}',
      '@media (prefers-reduced-motion: reduce){.cs-cmdp-row{transition:none;}}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'cs-cmdp-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'cs-cmdp-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Command palette');
    overlay.addEventListener('pointerdown', function (e) {
      if (e.target === overlay) closePalette();
    });

    var dialog = document.createElement('div');
    dialog.className = 'cs-cmdp-dialog';
    dialog.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    var inputWrap = document.createElement('div');
    inputWrap.className = 'cs-cmdp-input-wrap';
    inputWrap.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>';
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'cs-cmdp-input';
    input.placeholder = 'Search actions…';
    input.setAttribute('aria-label', 'Search actions');
    input.addEventListener('input', function (e) {
      // Skip while an IME composition is active so we don't search on partial
      // characters (Japanese, Chinese, Korean keyboards etc.).
      if (e && e.isComposing) return;
      renderResults();
    });
    input.addEventListener('keydown', onInputKey);
    inputWrap.appendChild(input);

    var list = document.createElement('div');
    list.className = 'cs-cmdp-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Available actions');

    var hint = document.createElement('div');
    hint.className = 'cs-cmdp-hint';
    hint.innerHTML =
      '<span><kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>↵</kbd> select</span><span><kbd>Esc</kbd> close</span>';

    dialog.appendChild(inputWrap);
    dialog.appendChild(list);
    dialog.appendChild(hint);
    overlay.appendChild(dialog);

    overlayEl = overlay;
    inputEl = input;
    listEl = list;
    hintEl = hint;
  }

  function onInputKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
      return;
    }
    if (e.key === 'Tab') {
      // Focus trap: there is only one focusable element in the dialog (the
      // input), so Tab and Shift+Tab both keep focus on the input itself.
      e.preventDefault();
      try { inputEl.focus(); } catch (_) { /* race: input may be unmounted */ }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentResults.length === 0) return;
      highlightIdx = (highlightIdx + 1) % currentResults.length;
      paintHighlight();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentResults.length === 0) return;
      highlightIdx = (highlightIdx - 1 + currentResults.length) % currentResults.length;
      paintHighlight();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      var a = currentResults[highlightIdx];
      if (a) executeAction(a);
      return;
    }
  }

  function executeAction(a) {
    closePalette();
    try { a.action(); } catch (e) {
      console.error('CommandPalette action failed', e);
      try { window.Toast && window.Toast.show && window.Toast.show({message: 'Action failed: ' + (e && e.message || 'unknown error'), type: 'error'}); } catch(_){}
    }
  }

  function paintHighlight() {
    if (!listEl) return;
    var rows = listEl.querySelectorAll('.cs-cmdp-row');
    for (var i = 0; i < rows.length; i++) {
      var idx = parseInt(rows[i].getAttribute('data-idx'), 10);
      if (idx === highlightIdx) {
        rows[i].setAttribute('aria-selected', 'true');
        // scroll into view if needed
        var rect = rows[i].getBoundingClientRect();
        var lrect = listEl.getBoundingClientRect();
        if (rect.bottom > lrect.bottom) listEl.scrollTop += rect.bottom - lrect.bottom;
        else if (rect.top < lrect.top) listEl.scrollTop -= lrect.top - rect.top;
      } else {
        rows[i].removeAttribute('aria-selected');
      }
    }
  }

  function renderResults() {
    if (!listEl || !inputEl) return;
    var q = inputEl.value;
    var actions = []
      .concat(currentRecentActions)
      .concat(STATIC_ACTIONS)
      .concat(PAGE_ACTIONS[pageKind()] || [])
      .concat(EXTRA_ACTIONS);
    currentResults = filterAndSort(actions, q);
    highlightIdx = 0;

    listEl.innerHTML = '';
    if (currentResults.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cs-cmdp-empty';
      empty.textContent = loadingRecent && !q ? 'Loading…' : 'No matching actions.';
      listEl.appendChild(empty);
      return;
    }

    var lastSection = null;
    for (var i = 0; i < currentResults.length; i++) {
      var a = currentResults[i];
      if (a.section !== lastSection) {
        var sec = document.createElement('div');
        sec.className = 'cs-cmdp-section';
        sec.textContent = SECTION_LABEL[a.section] || a.section || 'Other';
        listEl.appendChild(sec);
        lastSection = a.section;
      }
      var row = document.createElement('div');
      row.className = 'cs-cmdp-row';
      row.setAttribute('role', 'option');
      row.setAttribute('data-idx', String(i));
      if (i === highlightIdx) row.setAttribute('aria-selected', 'true');
      var icon = document.createElement('span');
      icon.className = 'cs-cmdp-icon';
      // No emoji fallback — leave the slot blank when an action has no
      // explicit icon (avoids unicode glyphs in user-facing UI).
      icon.textContent = a.icon || '';
      var text = document.createElement('span');
      text.className = 'cs-cmdp-text';
      var label = document.createElement('div');
      label.className = 'cs-cmdp-label';
      label.textContent = a.label || a.id;
      text.appendChild(label);
      if (a.subtitle) {
        var sub = document.createElement('div');
        sub.className = 'cs-cmdp-sub';
        sub.textContent = a.subtitle;
        text.appendChild(sub);
      }
      row.appendChild(icon);
      row.appendChild(text);
      (function (action) {
        row.addEventListener('pointerdown', function (e) {
          e.preventDefault(); // keep input focus
        });
        row.addEventListener('click', function () {
          executeAction(action);
        });
        row.addEventListener('mouseenter', function () {
          highlightIdx = parseInt(row.getAttribute('data-idx'), 10) || 0;
          paintHighlight();
        });
      })(a);
      listEl.appendChild(row);
    }
  }

  // Recent project actions are async; we fetch them on open and inject when ready.
  var currentRecentActions = [];
  // Element that had focus before the palette opened. Restored on close.
  var lastActiveElement = null;

  function openPalette() {
    if (overlayEl && overlayEl.parentNode) return; // already open
    // Capture focus for restoration on close.
    try { lastActiveElement = document.activeElement; } catch (_) { lastActiveElement = null; }
    injectStyles();
    if (!overlayEl) buildOverlay();
    document.body.appendChild(overlayEl);
    inputEl.value = '';
    currentRecentActions = [];
    loadingRecent = true;
    renderResults();
    // focus after attach so the autofocus actually takes
    setTimeout(function () { try { inputEl.focus(); inputEl.select(); } catch (_) { /* race: input may be unmounted */ } }, 0);
    recentProjectActions(function (acts) {
      loadingRecent = false;
      currentRecentActions = acts;
      // Only re-render if still open + user hasn't typed yet
      if (overlayEl && overlayEl.parentNode && inputEl.value === '') renderResults();
    });
  }

  function closePalette() {
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    // Restore focus to whatever had it before we opened. Defer one tick
    // so any modal the action just opened gets its autofocus first (M7).
    var toFocus = lastActiveElement;
    lastActiveElement = null;
    if (toFocus && typeof toFocus.focus === 'function') {
      setTimeout(function () {
        // Only restore if nothing else took focus in the meantime.
        try {
          if (document.activeElement === document.body || document.activeElement === null) {
            toFocus.focus();
          }
        } catch (_) { console.warn('CommandPalette: close DOM error', _); }
      }, 0);
    }
  }

  function togglePalette() {
    if (overlayEl && overlayEl.parentNode) closePalette(); else openPalette();
  }

  // ── Global keydown ─────────────────────────────────────────────────────
  // Standard command-palette pattern: override Ctrl/Cmd+K everywhere
  // (including inside text inputs). Matches Notion / Linear / GitHub.
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return;
    var isK = (e.key === 'k' || e.key === 'K');
    if (!isK) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.altKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    togglePalette();
  }, true);

  // M10: Global "?" → open keyboard shortcuts, but only on the manager page
  // where the central registry is not handling it. Creator and Tracker have
  // their own cs:openShortcuts listeners; manager does too.
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return;
    if (e.key !== '?') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (pageKind() !== 'manager') return;
    // Skip when typing in any editable surface.
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT')) return;
    // Skip when palette is open — input swallows keys there.
    if (overlayEl && overlayEl.parentNode) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('cs:openShortcuts'));
  });

  // ── Public API ─────────────────────────────────────────────────────────
  window.CommandPalette = {
    open: openPalette,
    close: closePalette,
    toggle: togglePalette,
    /** Append ad-hoc actions (rarely needed; prefer registerPage). */
    register: function (actions) {
      if (!Array.isArray(actions)) return;
      EXTRA_ACTIONS = EXTRA_ACTIONS.concat(actions);
    },
    /** Replace all actions for a given page id ('creator' | 'tracker' | 'manager'). */
    registerPage: function (pageId, actions) {
      PAGE_ACTIONS[pageId] = Array.isArray(actions) ? actions.slice() : [];
    },
    /** Test/inspection helpers. */
    _staticActions: function () { return STATIC_ACTIONS.slice(); },
    _pageActions: function (pageId) { return (PAGE_ACTIONS[pageId] || []).slice(); },
    _fuzzyScore: fuzzyScore,
    _filterAndSort: filterAndSort
  };
})();
