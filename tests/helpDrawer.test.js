// tests/helpDrawer.test.js — B6 Help & Shortcuts drawer.
//
// Loads help-drawer.js in a stubbed window/React/document environment and
// verifies API surface, the pure search filter, contextual defaults,
// content migration coverage, and source-level guarantees (no raw glyphs,
// retired files removed, HTML script tags updated).

const fs = require("fs");
const path = require("path");

// ── Minimal browser shims ──────────────────────────────────────────────
function makeTarget() {
  const map = {};
  return {
    addEventListener(type, fn) { (map[type] = map[type] || []).push(fn); },
    removeEventListener(type, fn) {
      const arr = map[type] || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatchEvent(evt) { (map[evt.type] || []).slice().forEach(fn => fn(evt)); return true; },
    _listeners: map
  };
}
const winTarget = makeTarget();
const docTarget = makeTarget();
const win = Object.assign({}, winTarget, {
  location: { pathname: "/index.html", href: "" },
  Icons: { x: () => ({}), info: () => ({}), keyboard: () => ({}), lightbulb: () => ({}) }
});
// Persisted localStorage stub
const lsStore = {};
win.localStorage = {
  getItem: (k) => Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null,
  setItem: (k, v) => { lsStore[k] = String(v); },
  removeItem: (k) => { delete lsStore[k]; }
};
const doc = Object.assign({}, docTarget, {
  readyState: "complete",
  body: { classList: { contains: () => false }, appendChild: () => {} },
  createElement: () => ({ id: "", appendChild: () => {} }),
  getElementById: () => null
});

global.window = win;
global.document = doc;
global.navigator = { platform: "Win32", userAgent: "jest" };
global.CustomEvent = function (type, init) {
  this.type = type; this.detail = init && init.detail;
};

// Minimal React + ReactDOM stubs sufficient for module load + filter logic.
const React = {
  createElement: () => ({}),
  useState: (init) => [init, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  Fragment: function () {}
};
const ReactDOM = { createRoot: () => ({ render: () => {} }) };
global.React = React;
global.ReactDOM = ReactDOM;
win.React = React;
win.ReactDOM = ReactDOM;

// Load help-drawer.js into the shimmed env.
const drawerSrc = fs.readFileSync(path.join(__dirname, "..", "help-drawer.js"), "utf8");
const fn = new Function("window", "document", "React", "ReactDOM", "navigator", "CustomEvent", "localStorage", drawerSrc);
fn(win, doc, React, ReactDOM, global.navigator, global.CustomEvent, win.localStorage);

const HelpDrawer = win.HelpDrawer;

// ──────────────────────────────────────────────────────────────────────
describe("HelpDrawer — public API", () => {
  test("exposes open / close / toggle / isOpen", () => {
    expect(typeof HelpDrawer.open).toBe("function");
    expect(typeof HelpDrawer.close).toBe("function");
    expect(typeof HelpDrawer.toggle).toBe("function");
    expect(typeof HelpDrawer.isOpen).toBe("function");
  });

  test("isOpen reflects open / close", () => {
    HelpDrawer.close();
    expect(HelpDrawer.isOpen()).toBe(false);
    HelpDrawer.open({ tab: "help" });
    expect(HelpDrawer.isOpen()).toBe(true);
    HelpDrawer.close();
    expect(HelpDrawer.isOpen()).toBe(false);
  });

  test("toggle flips state", () => {
    HelpDrawer.close();
    HelpDrawer.toggle({ tab: "shortcuts" });
    expect(HelpDrawer.isOpen()).toBe(true);
    HelpDrawer.toggle();
    expect(HelpDrawer.isOpen()).toBe(false);
  });

  test("contextual default: open({ context: 'tracker' }) selects Shortcuts tab", () => {
    HelpDrawer.close();
    HelpDrawer.open({ context: "tracker" });
    // Persisted tab should be 'shortcuts' for context-driven opens.
    expect(lsStore["cs_help_drawer_tab"]).toBe("shortcuts");
    HelpDrawer.close();
  });

  test("invalid persisted tab is cleared", () => {
    lsStore["cs_help_drawer_tab"] = "bogus";
    HelpDrawer.close();
    HelpDrawer.open({}); // no opts → reads persisted tab
    expect(["help", "shortcuts", "getting-started"]).toContain(lsStore["cs_help_drawer_tab"]);
  });
});

describe("HelpDrawer — pure search filter (_filter)", () => {
  test("empty query returns all items", () => {
    const items = HelpDrawer._helpItems;
    expect(HelpDrawer._filter(items, "")).toHaveLength(items.length);
    expect(HelpDrawer._filter(items, "   ")).toHaveLength(items.length);
  });

  test("'colour' matches the British-English help topics", () => {
    const hits = HelpDrawer._filter(HelpDrawer._helpItems, "colour");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some(h => /colour/i.test(h.searchText))).toBe(true);
  });

  test("'color' (American) NOW matches via the C11 alias map", () => {
    // C11 / fix-3.1 — the drawer ships a bidirectional spelling alias map
    // so American queries hit the British-English authored content.
    const hits = HelpDrawer._filter(HelpDrawer._helpItems, "color");
    expect(hits.length).toBeGreaterThan(0);
    // The match should be on the British spelling within searchText.
    expect(hits.some(h => /colour/i.test(h.searchText))).toBe(true);
  });

  test("'shortcut' filters to topics mentioning shortcuts", () => {
    const hits = HelpDrawer._filter(HelpDrawer._helpItems, "shortcut");
    // Help items themselves don't all mention "shortcut", but at least one
    // section ("Creator tools") references undo/redo shortcuts.
    expect(hits.every(h => h.searchText.indexOf("shortcut") !== -1)).toBe(true);
  });

  test("shortcut filter narrows by description", () => {
    const items = HelpDrawer._shortcutItems;
    const undoHits = HelpDrawer._filter(items, "undo");
    expect(undoHits.length).toBeGreaterThan(0);
    expect(undoHits.every(s => s.searchText.indexOf("undo") !== -1)).toBe(true);

    const palHits = HelpDrawer._filter(items, "palette");
    // 'Open the command palette' lives in the global shortcuts.
    expect(palHits.some(s => s.scope === "global")).toBe(true);
  });

  test("filter is case-insensitive substring", () => {
    const items = HelpDrawer._shortcutItems;
    const a = HelpDrawer._filter(items, "UNDO").length;
    const b = HelpDrawer._filter(items, "undo").length;
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});

describe("HelpDrawer — content migration coverage", () => {
  test("Help dataset covers all five legacy areas (Creator, Tracker, Manager, Saving, Glossary)", () => {
    const areas = new Set(HelpDrawer._helpItems.map(i => i.area));
    [
      "Pattern Creator",
      "Stitch Tracker",
      "Stash Manager",
      "Saving and Backup",
      "Glossary"
    ].forEach(a => expect(areas.has(a)).toBe(true));
  });

  test("every legacy shortcut description is present in the new dataset", () => {
    const descs = HelpDrawer._shortcutItems.map(s => s.description);
    // Sample of canonical shortcut descriptions migrated from help-content.js.
    const required = [
      "Save project",
      "Undo",
      "Redo",
      "Magic wand (toggle)",
      "Eyedropper",
      "Open the command palette",
      "Switch to Track mode (mark stitches done)",
      "Switch to Navigate mode (crosshair and parking markers)",
      "Toggle the colours drawer",
      "Hold to pan the canvas freely",
      "Open Bulk Add Threads"
    ];
    required.forEach(r => {
      expect(descs.some(d => d === r)).toBe(true);
    });
  });

  test("every getting-started entry has a heading and body", () => {
    HelpDrawer._gettingStarted.forEach(item => {
      expect(typeof item.heading).toBe("string");
      expect(item.heading.length).toBeGreaterThan(0);
      expect(typeof item.body).toBe("string");
      expect(item.body.length).toBeGreaterThan(0);
    });
  });
});

describe("HelpDrawer — source-level guarantees", () => {
  const drawerPath = path.join(__dirname, "..", "help-drawer.js");
  const drawer = fs.readFileSync(drawerPath, "utf8");

  test("uses Icons.x() — no raw ✕ glyph", () => {
    expect(drawer).toMatch(/Icons\.x\s*\(\s*\)/);
    // The source file's own header comment can mention the glyph but no
    // string literal ✕ should appear.
    expect(drawer).not.toMatch(/['"`]\u2715['"`]/);
    expect(drawer).not.toMatch(/['"`]\u00d7['"`]/); // no bare × either
  });

  test("onboarding.js has been deleted", () => {
    expect(fs.existsSync(path.join(__dirname, "..", "onboarding.js"))).toBe(false);
  });

  test("help-content.js has been deleted", () => {
    expect(fs.existsSync(path.join(__dirname, "..", "help-content.js"))).toBe(false);
  });

  test("HTML entry points reference help-drawer.js (not help-content / onboarding)", () => {
    ["index.html", "stitch.html", "manager.html"].forEach(name => {
      const html = fs.readFileSync(path.join(__dirname, "..", name), "utf8");
      expect(html).toMatch(/<script src="help-drawer\.js"><\/script>/);
      expect(html).not.toMatch(/<script src="help-content\.js"><\/script>/);
      expect(html).not.toMatch(/<script src="onboarding\.js"><\/script>/);
      // onboarding-wizard.js is a different file and must remain.
      expect(html).toMatch(/<script src="onboarding-wizard\.js"><\/script>/);
    });
  });
});

describe("HelpDrawer — back-compat shim", () => {
  test("window.HelpCentre exists as a function (shim for legacy SharedModals.Help)", () => {
    expect(typeof win.HelpCentre).toBe("function");
  });

  test("window.HELP_TOPICS exposed for any external consumer", () => {
    expect(Array.isArray(win.HELP_TOPICS)).toBe(true);
    expect(win.HELP_TOPICS.length).toBeGreaterThanOrEqual(5);
  });
});
