// tests/helpDrawerShortcutsSync.test.js — keep the Help drawer's shortcut
// list honest.
//
// help-drawer.js carries a hand-written SHORTCUTS list (it is the only
// shortcut reference users see). It drifted from the real registrations —
// it advertised an "L" lasso key and a Creator "B" key that never existed,
// and missed T / Shift+T / H. This test checks both directions against the
// registries in creator/useKeyboardShortcuts.js, tracker-app.js and
// manager-app.js, by source parsing (no module system to import from).

const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

// ── Documented shortcuts (help-drawer.js SHORTCUTS) ────────────────────
function documented() {
  const src = read("help-drawer.js");
  const start = src.indexOf("var SHORTCUTS = [");
  const end = src.indexOf("];", start);
  const block = src.slice(start, end);
  const re = /\{\s*id:\s*"([^"]+)",\s*scope:\s*"([^"]+)",\s*keys:\s*\[([^\]]*)\]/g;
  const out = [];
  let m;
  while ((m = re.exec(block))) {
    const keys = [];
    const kre = /"((?:[^"\\]|\\.)*)"/g;
    let k;
    while ((k = kre.exec(m[3]))) keys.push(JSON.parse('"' + k[1] + '"'));
    out.push({ id: m[1], scope: m[2], keys: keys });
  }
  return out;
}

// ── Registered shortcuts (registry `keys:` fields) ─────────────────────
function registered(file) {
  const src = read(file);
  const re = /\{\s*id:\s*['"]([^'"]+)['"],\s*keys:\s*(\[[^\]]*\]|"[^"]*"|'[^']*'),\s*scope:\s*['"]([^'"]+)['"]([^}]*)/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const raw = m[2].trim();
    const keys = raw.charAt(0) === "["
      ? (raw.match(/(["'])((?:\\.|(?!\1).)*)\1/g) || []).map(s => s.slice(1, -1).replace(/\\\\/g, "\\"))
      : [raw.slice(1, -1).replace(/\\\\/g, "\\")];
    out.push({ id: m[1], keys: keys, scope: m[3], hidden: /hidden:\s*true/.test(m[4]) });
  }
  return out;
}

const ARROWS = { "←": "arrowleft", "↑": "arrowup", "→": "arrowright", "↓": "arrowdown" };
function normalise(label) {
  return label.split("+").filter((p, i, a) => p !== "" || i === a.length - 1).map(p => {
    if (p === "") return "+";
    const lower = p.toLowerCase();
    if (lower === "ctrl") return "mod";
    if (ARROWS[p]) return ARROWS[p];
    return lower;
  }).join("+");
}

// Labels that describe something other than a registry key: Mac
// duplicates of a Ctrl shortcut, mouse gestures, and keys handled by
// dedicated listeners (tracker guide keys and Shift+F10 in tracker-app.js,
// Space-hold pan, Esc in Navigate mode).
function isRegistryKey(label) {
  if (/^⌘/.test(label)) return false;
  if (label === "Right-click" || label === "Menu" || label === "Shift+F10") return false;
  return true;
}
const NON_REGISTRY_IDS = new Set(["t.guide", "t.guideKeys", "t.park", "t.parkGuide"]);

const FILES = {
  creator: "creator/useKeyboardShortcuts.js",
  tracker: "tracker-app.js",
  manager: "manager-app.js"
};

describe("Help drawer shortcuts match the registered shortcuts", () => {
  const docs = documented();

  test("parsed a sensible number of entries from each source", () => {
    expect(docs.length).toBeGreaterThan(40);
    Object.keys(FILES).forEach(scope => {
      expect(registered(FILES[scope]).length).toBeGreaterThan(0);
    });
  });

  Object.keys(FILES).forEach(scope => {
    test(scope + ": every documented key is registered", () => {
      const regKeys = new Set();
      registered(FILES[scope]).forEach(r => r.keys.forEach(k => regKeys.add(k.toLowerCase())));
      regKeys.add("space (hold)"); // documented label for the "space" hold-to-pan entry
      if (regKeys.has("space")) regKeys.add(normalise("Space (hold)"));
      const missing = [];
      docs.filter(d => d.scope === scope && !NON_REGISTRY_IDS.has(d.id)).forEach(d => {
        d.keys.filter(isRegistryKey).forEach(label => {
          const k = normalise(label);
          if (!regKeys.has(k) && !(k === "esc" && regKeys.has("esc"))) missing.push(d.id + " " + label);
        });
      });
      expect(missing).toEqual([]);
    });
  });

  // Registered, visible keys that are deliberately left out of the drawer.
  // Each needs a reason; remove the entry once it is documented or fixed.
  const KNOWN_UNDOCUMENTED = {
    "tracker.mode.rowmode": "Row mode only ever highlights row 0 (currentRow never advances) - see reports/tutorial-popups-analysis.md",
    "tracker.focus.toggle": "Shadowed by tracker.layer.full: both bind F and the more specific tracker.notedit scope wins",
    "tracker.esc": "Generic dismiss; covered by the global Esc entry",
    "creator.esc": "Generic dismiss; covered by the global Esc entry",
    "creator.shortcuts": "The ? key; covered by the global entry",
    "tracker.shortcuts": "The ? key; covered by the global entry"
  };

  Object.keys(FILES).forEach(scope => {
    test(scope + ": every visible registered key is documented", () => {
      const docKeys = new Set();
      docs.filter(d => d.scope === scope || d.scope === "global")
        .forEach(d => d.keys.forEach(label => docKeys.add(normalise(label))));
      docKeys.add("space");
      const undocumented = [];
      registered(FILES[scope]).forEach(r => {
        if (r.hidden || KNOWN_UNDOCUMENTED[r.id]) return;
        r.keys.forEach(k => { if (!docKeys.has(k.toLowerCase())) undocumented.push(r.id + " " + k); });
      });
      expect(undocumented).toEqual([]);
    });
  });
});
