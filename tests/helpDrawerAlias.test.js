// tests/helpDrawerAlias.test.js — C11 / fix-3.1
// Verifies the American → British spelling alias map exposed by
// help-drawer.js. Mirrors the loader pattern used by helpDrawer.test.js
// so React/ReactDOM globals are available before the source initialises.

const fs = require("fs");
const path = require("path");

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
global.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };

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

const drawerSrc = fs.readFileSync(path.join(__dirname, "..", "help-drawer.js"), "utf8");
new Function(drawerSrc)();
const HelpDrawer = win.HelpDrawer;

describe("HelpDrawer — C11 spelling alias map", () => {
  test("exposes _expandAliases and _SPELLING_ALIASES", () => {
    expect(typeof HelpDrawer._expandAliases).toBe("function");
    expect(typeof HelpDrawer._SPELLING_ALIASES).toBe("object");
  });

  test("alias map is symmetric for the documented pairs", () => {
    const map = HelpDrawer._SPELLING_ALIASES;
    const pairs = [
      ["color", "colour"], ["gray", "grey"], ["customize", "customise"],
      ["organize", "organise"], ["analyze", "analyse"], ["center", "centre"],
      ["behavior", "behaviour"], ["realize", "realise"]
    ];
    pairs.forEach(([a, b]) => {
      expect(map[a]).toBe(b);
      expect(map[b]).toBe(a);
    });
  });

  test("expandAliases produces both spellings when an alias word is in the query", () => {
    const out = HelpDrawer._expandAliases("color palette");
    expect(out).toContain("color palette");
    expect(out).toContain("colour palette");
  });

  test("expandAliases is case-insensitive", () => {
    const out = HelpDrawer._expandAliases("Customize");
    expect(out.some(s => s.toLowerCase().indexOf("customize") >= 0)).toBe(true);
    expect(out.some(s => s.toLowerCase().indexOf("customise") >= 0)).toBe(true);
  });

  test("queries with no alias words pass through unchanged", () => {
    const out = HelpDrawer._expandAliases("undo");
    expect(out).toEqual(["undo"]);
  });

  test("filter matches in either direction (color ↔ colour, gray ↔ grey)", () => {
    const items = [
      { searchText: "use the colour palette to pick threads" },
      { searchText: "convert grey tones into hand-blends" }
    ];
    expect(HelpDrawer._filter(items, "color").length).toBe(1);
    expect(HelpDrawer._filter(items, "colour").length).toBe(1);
    expect(HelpDrawer._filter(items, "gray").length).toBe(1);
    expect(HelpDrawer._filter(items, "grey").length).toBe(1);
  });

  test("word boundary keeps 'colorize' from over-matching 'colour'", () => {
    const out = HelpDrawer._expandAliases("colorize");
    expect(out).toEqual(["colorize"]);
  });
});
