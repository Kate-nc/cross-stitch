// shortcuts.js — Central keyboard shortcut registry and dispatcher.
//
// Design goals (see reports/shortcuts-4-redesign-spec.md):
//   • One declarative registry of every page-level shortcut.
//   • Hierarchical, dot-separated scopes with most-specific-wins dispatch.
//   • Single canonical input-element guard. Single-key shortcuts never
//     fire while the user is typing; modified shortcuts (mod/shift/alt)
//     do fire from inputs by default (Ctrl+S, Cmd+Z, etc.).
//   • Conflict detection at registration time (console.error for any
//     duplicate (scope, key) pair).
//   • Auto-generated help: SharedModals.Shortcuts reads from .list().
//
// Co-existence:
//   • keyboard-utils.js useEscape stack still owns Escape. We never
//     register Escape here.
//   • command-palette.js still owns Ctrl/Cmd+K. We don't touch it.
//   • Modal-local onKeyDown JSX handlers still own Enter/Esc inside text
//     inputs. Our dispatcher is bubble-phase, so those win first.
//
// API:
//   window.Shortcuts.register(entries)       → unregister fn
//   window.Shortcuts.list()                  → flat array snapshot
//   window.Shortcuts.pushScope(name)
//   window.Shortcuts.popScope(name)
//   window.Shortcuts.getActiveScopes()       → array (most-specific last)
//   window.Shortcuts._dispatch(event)        → test hook
//   window.Shortcuts._reset()                → test hook
//
//   window.useShortcuts(entries, deps)       → React hook
//   window.useScope(name, when)              → React hook
//
// Entry shape:
//   {
//     id:           'tracker.highlight.isolate',  // required, unique
//     keys:         '1' | ['='|'+'] | 'mod+s' | 'mod+shift+z' | 'space',
//     scope:        'tracker.view.highlight',     // dot-separated
//     description:  'Highlight mode: isolate',
//     run:          (e) => {...},                  // required
//     when:         () => focusColour !== null,    // optional runtime guard
//     group:        'Highlight',                   // optional help-modal group
//     hidden:       false,                          // optional
//     allowInInput: false,                          // default: false for unmodified, true for modified
//     preventDefault: true,                         // default true
//   }

(function () {
  if (typeof window === "undefined") return;

  // ─── Registry state ──────────────────────────────────────────────────
  var _entries = [];        // {id, keys[], scope, description, run, when, group, hidden, allowInInput, preventDefault, _normKeys[]}
  var _activeScopes = [];   // stack; later entries are more specific
  var _installed = false;
  var _nextRegId = 1;

  // ─── Platform detection ──────────────────────────────────────────────
  function isMac() {
    if (typeof navigator === "undefined") return false;
    var ua = navigator.platform || navigator.userAgent || "";
    return /Mac|iPhone|iPad|iPod/i.test(ua);
  }

  // ─── Key parsing ─────────────────────────────────────────────────────
  // Normalise a key string like 'mod+shift+z' → {mod:true, shift:true, alt:false, key:'z'}
  // 'space' / 'esc' / 'enter' / 'arrowleft' / 'arrowright' / 'tab' are special.
  var SPECIAL = { space: " ", esc: "Escape", escape: "Escape", enter: "Enter",
                  arrowleft: "ArrowLeft", arrowright: "ArrowRight",
                  arrowup: "ArrowUp", arrowdown: "ArrowDown", tab: "Tab" };
  function parseKey(spec) {
    if (typeof spec !== "string") return null;
    var parts = spec.toLowerCase().split("+").map(function (s) { return s.trim(); });
    var mods = { mod: false, shift: false, alt: false };
    var key = null;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === "mod" || p === "ctrl" || p === "cmd" || p === "meta") mods.mod = true;
      else if (p === "shift") mods.shift = true;
      else if (p === "alt" || p === "option") mods.alt = true;
      else key = p;
    }
    if (!key) return null;
    return { mod: mods.mod, shift: mods.shift, alt: mods.alt, key: key };
  }
  function normalizeKeys(keys) {
    if (!keys) return [];
    if (!Array.isArray(keys)) keys = [keys];
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var p = parseKey(keys[i]);
      if (p) out.push(p);
    }
    return out;
  }
  // Match a parsed key against a KeyboardEvent.
  function eventMatchesKey(evt, parsed) {
    if (!parsed) return false;
    var modPressed = !!(evt.ctrlKey || evt.metaKey);
    var shiftPressed = !!evt.shiftKey;
    var altPressed = !!evt.altKey;
    if (parsed.mod !== modPressed) return false;
    if (parsed.shift !== shiftPressed) return false;
    if (parsed.alt !== altPressed) return false;
    var k = parsed.key;
    var evtKey = (evt.key || "").toString();
    // Special named keys
    if (SPECIAL[k]) return evtKey === SPECIAL[k];
    // Single-character keys: case-insensitive compare on letter chars.
    if (evtKey.length === 1 && k.length === 1) {
      return evtKey.toLowerCase() === k.toLowerCase();
    }
    // Fallback: literal match
    return evtKey === k;
  }
  function isModified(parsed) {
    return !!(parsed && (parsed.mod || parsed.shift || parsed.alt));
  }

  // ─── Input-element guard (canonical, single source of truth) ─────────
  function isTextInputFocused() {
    if (typeof document === "undefined") return false;
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      var type = ((el.getAttribute && el.getAttribute("type")) || "text").toLowerCase();
      return ["text","search","email","url","tel","password","number"].indexOf(type) !== -1;
    }
    if (el.isContentEditable) return true;
    return false;
  }

  // ─── Scope matching ──────────────────────────────────────────────────
  // A scope is active when it appears in the active-scope stack.
  // 'tracker.view.highlight' matches if any active scope === that string OR starts with that string + '.'.
  function scopeIsActive(scope) {
    if (!scope || scope === "global") return true;
    for (var i = 0; i < _activeScopes.length; i++) {
      var a = _activeScopes[i];
      if (a === scope) return true;
      if (a.length > scope.length && a.indexOf(scope + ".") === 0) return true;
    }
    return false;
  }
  function scopeSpecificity(scope) {
    if (!scope || scope === "global") return 0;
    return scope.split(".").length;
  }

  // ─── Conflict detection ──────────────────────────────────────────────
  function keyFingerprint(parsed) {
    return [parsed.mod ? "M" : "", parsed.shift ? "S" : "", parsed.alt ? "A" : "",
            (parsed.key || "").toLowerCase()].join("|");
  }
  function detectConflicts() {
    var seen = {};
    for (var i = 0; i < _entries.length; i++) {
      var e = _entries[i];
      for (var j = 0; j < e._normKeys.length; j++) {
        var fp = (e.scope || "global") + "::" + keyFingerprint(e._normKeys[j]);
        if (seen[fp] && seen[fp] !== e.id) {
          if (typeof console !== "undefined" && console.error) {
            console.error("[shortcuts] Conflict: '" + (e.keys || "")
              + "' in scope '" + (e.scope || "global") + "' is registered by '"
              + seen[fp] + "' and '" + e.id + "'");
          }
        } else {
          seen[fp] = e.id;
        }
      }
    }
  }

  // ─── Dispatcher ──────────────────────────────────────────────────────
  function dispatch(evt) {
    if (evt.defaultPrevented) return;
    var matches = [];
    for (var i = 0; i < _entries.length; i++) {
      var entry = _entries[i];
      if (entry.disabled) continue;
      if (!scopeIsActive(entry.scope)) continue;
      var matched = null;
      for (var j = 0; j < entry._normKeys.length; j++) {
        if (eventMatchesKey(evt, entry._normKeys[j])) { matched = entry._normKeys[j]; break; }
      }
      if (!matched) continue;
      var allowInput = entry.allowInInput;
      if (typeof allowInput !== "boolean") allowInput = isModified(matched);
      if (!allowInput && isTextInputFocused()) continue;
      if (entry.when && !entry.when(evt)) continue;
      matches.push(entry);
    }
    if (!matches.length) return;
    // Most-specific scope wins; ties resolved by registration order (earliest first).
    matches.sort(function (a, b) {
      var d = scopeSpecificity(b.scope) - scopeSpecificity(a.scope);
      if (d !== 0) return d;
      return (a._regId || 0) - (b._regId || 0);
    });
    var winner = matches[0];
    if (winner.preventDefault !== false) {
      try { evt.preventDefault(); } catch (_) {}
    }
    try { evt.stopPropagation(); } catch (_) {}
    try { winner.run(evt); }
    catch (err) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[shortcuts] Handler '" + winner.id + "' threw:", err);
      }
    }
  }

  function ensureInstalled() {
    if (_installed) return;
    if (typeof document === "undefined") return;
    _installed = true;
    document.addEventListener("keydown", dispatch, false);
  }

  // ─── Public registration API ─────────────────────────────────────────
  function register(entries) {
    if (!entries) return function () {};
    if (!Array.isArray(entries)) entries = [entries];
    var ids = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || !e.id || !e.run || !e.keys) {
        if (typeof console !== "undefined" && console.error) {
          console.error("[shortcuts] Invalid entry (needs id, keys, run):", e);
        }
        continue;
      }
      var prepared = {
        id: e.id,
        keys: e.keys,
        scope: e.scope || "global",
        description: e.description || "",
        run: e.run,
        when: e.when || null,
        group: e.group || null,
        hidden: !!e.hidden,
        allowInInput: typeof e.allowInInput === "boolean" ? e.allowInInput : null,
        preventDefault: e.preventDefault !== false,
        _normKeys: normalizeKeys(e.keys),
        _regId: _nextRegId++
      };
      if (!prepared._normKeys.length) {
        if (typeof console !== "undefined" && console.error) {
          console.error("[shortcuts] Entry '" + e.id + "' has unparseable keys:", e.keys);
        }
        continue;
      }
      _entries.push(prepared);
      ids.push(prepared._regId);
    }
    detectConflicts();
    ensureInstalled();
    return function unregister() {
      for (var k = _entries.length - 1; k >= 0; k--) {
        if (ids.indexOf(_entries[k]._regId) !== -1) _entries.splice(k, 1);
      }
    };
  }

  function list() {
    // Return a deep-ish copy without internal fields.
    var out = [];
    for (var i = 0; i < _entries.length; i++) {
      var e = _entries[i];
      if (e.hidden) continue;
      out.push({
        id: e.id, keys: e.keys, scope: e.scope, description: e.description,
        group: e.group || e.scope
      });
    }
    return out;
  }

  // ─── Scope stack API ─────────────────────────────────────────────────
  function pushScope(name) {
    if (!name) return;
    _activeScopes.push(name);
  }
  function popScope(name) {
    if (!name) return;
    for (var i = _activeScopes.length - 1; i >= 0; i--) {
      if (_activeScopes[i] === name) { _activeScopes.splice(i, 1); return; }
    }
  }
  function getActiveScopes() { return _activeScopes.slice(); }

  // ─── React hooks (only available when React loaded) ──────────────────
  function installHooks() {
    if (typeof React === "undefined") return;

    // useShortcuts: register entries on mount, unregister on unmount.
    // Re-runs when `deps` changes.
    window.useShortcuts = function useShortcuts(entries, deps) {
      React.useEffect(function () {
        var unreg = register(entries);
        return unreg;
      }, deps || []);
    };

    // useScope: push the named scope onto the stack while `when` is true.
    window.useScope = function useScope(name, when) {
      var active = when !== false;
      React.useEffect(function () {
        if (!active) return;
        pushScope(name);
        return function () { popScope(name); };
      }, [name, active]);
    };
  }

  // ─── Reset (tests) ───────────────────────────────────────────────────
  function _reset() {
    _entries = [];
    _activeScopes = [];
    _nextRegId = 1;
  }

  // ─── Export ──────────────────────────────────────────────────────────
  window.Shortcuts = {
    register: register,
    list: list,
    pushScope: pushScope,
    popScope: popScope,
    getActiveScopes: getActiveScopes,
    isMac: isMac,
    // Platform-aware label, e.g. "Ctrl+S" on Windows / "⌘+S" on Mac.
    formatKey: function (spec) {
      var p = parseKey(spec);
      if (!p) return spec || "";
      var parts = [];
      if (p.mod) parts.push(isMac() ? "⌘" : "Ctrl");
      if (p.shift) parts.push(isMac() ? "⇧" : "Shift");
      if (p.alt) parts.push(isMac() ? "⌥" : "Alt");
      var k = p.key;
      if (SPECIAL[k]) {
        var named = { space: "Space", esc: "Esc", escape: "Esc", enter: "Enter",
                      arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓", tab: "Tab" };
        parts.push(named[k] || k);
      } else {
        parts.push(k.length === 1 ? k.toUpperCase() : k);
      }
      return parts.join(isMac() ? "" : "+");
    },
    _dispatch: dispatch,
    _reset: _reset,
    // Expose the input-input guard so other modules can borrow it.
    isTextInputFocused: isTextInputFocused
  };

  installHooks();
})();
