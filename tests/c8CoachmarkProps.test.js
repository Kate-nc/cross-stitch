// tests/c8CoachmarkProps.test.js — Coachmark React component renders the
// expected structure (title, body, buttons, ARIA roles, primary/skip wiring)
// when handed minimal props.

const fs = require("fs");
const path = require("path");

function captureCreateElement() {
  const calls = [];
  function rec(type, props, ...children) {
    const flat = [];
    function walk(arr) {
      for (const c of arr) {
        if (c == null || c === false) continue;
        if (Array.isArray(c)) { walk(c); continue; }
        flat.push(c);
      }
    }
    walk(children);
    const node = { type: type, props: props || {}, children: flat };
    calls.push(node);
    return node;
  }
  return { rec: rec, calls: calls };
}

function loadCoaching() {
  const ce = captureCreateElement();
  const stateCells = [];
  let cellIdx = 0;
  const React = {
    useState: function (init) {
      const i = cellIdx++;
      if (stateCells.length <= i) stateCells.push(typeof init === "function" ? init() : init);
      return [stateCells[i], function (v) { stateCells[i] = typeof v === "function" ? v(stateCells[i]) : v; }];
    },
    useMemo: function (f) { return f(); },
    useRef: function (v) { const i = cellIdx++; if (stateCells.length <= i) stateCells.push({ current: v }); return stateCells[i]; },
    useCallback: function (f) { return f; },
    useEffect: function () {},
    createElement: ce.rec
  };
  const win = {
    React: React,
    Icons: {},
    UserPrefs: { get: function () { return false; }, set: function () {}, DEFAULTS: {} },
    addEventListener: function () {}, removeEventListener: function () {},
    dispatchEvent: function () {},
    innerWidth: 1024, innerHeight: 768
  };
  global.window = win;
  global.React = React;
  global.document = {
    addEventListener: function () {}, removeEventListener: function () {},
    activeElement: null,
    querySelector: function () { return null; }
  };
  global.CustomEvent = function (t, i) { this.type = t; this.detail = i && i.detail; };
  global.navigator = { userAgent: "jest" };
  const src = fs.readFileSync(path.join(__dirname, "..", "coaching.js"), "utf8");
  new Function("window", src)(win);
  return { win: win, calls: ce.calls, resetIdx: function () { cellIdx = 0; ce.calls.length = 0; } };
}

function findFirst(nodes, pred) {
  for (const n of nodes) {
    if (pred(n)) return n;
  }
  return null;
}

describe("Coachmark component", () => {
  test("renders title, body, scrim and primary button", () => {
    const { win, calls, resetIdx } = loadCoaching();
    resetIdx();
    win.Coachmark({
      id: "test1",
      title: "Hello",
      body: "World",
      onComplete: () => {},
      onSkip: () => {}
    });
    // Expect a popover with role="alertdialog".
    const dialog = findFirst(calls, n => n.props && n.props.role === "alertdialog");
    expect(dialog).not.toBeNull();
    expect(dialog.props["aria-labelledby"]).toBe("cs-coach-title-test1");
    expect(dialog.props["aria-describedby"]).toBe("cs-coach-body-test1");

    const title = findFirst(calls, n => n.props && n.props.id === "cs-coach-title-test1");
    expect(title).not.toBeNull();
    expect(title.children).toContain("Hello");

    const body = findFirst(calls, n => n.props && n.props.id === "cs-coach-body-test1");
    expect(body).not.toBeNull();
    expect(body.children).toContain("World");

    // Default buttons: Skip + Got it primary
    const primaryBtn = findFirst(calls, n => n.type === "button" && n.props["data-coach-primary"] === "true");
    expect(primaryBtn).not.toBeNull();
    expect(primaryBtn.children).toContain("Got it");

    const scrim = findFirst(calls, n => n.props && n.props.className && String(n.props.className).indexOf("cs-coachmark-scrim") !== -1);
    expect(scrim).not.toBeNull();
  });

  test("primary button click invokes onComplete; skim/skip click invokes onSkip", () => {
    const { win, calls, resetIdx } = loadCoaching();
    resetIdx();
    let completed = 0, skipped = 0;
    win.Coachmark({
      id: "t2",
      title: "T",
      body: "B",
      onComplete: () => { completed++; },
      onSkip: () => { skipped++; }
    });
    const primaryBtn = findFirst(calls, n => n.type === "button" && n.props["data-coach-primary"] === "true");
    primaryBtn.props.onClick();
    expect(completed).toBe(1);
    expect(skipped).toBe(0);

    const skipBtn = findFirst(calls, n =>
      n.type === "button" && (!n.props || n.props["data-coach-primary"] !== "true")
    );
    skipBtn.props.onClick();
    expect(skipped).toBe(1);
  });

  test("showHighlight=true renders a highlight ring when target resolves", () => {
    const { win, calls, resetIdx } = loadCoaching();
    resetIdx();
    const fakeEl = {
      getBoundingClientRect: function () {
        return { top: 100, left: 100, right: 200, bottom: 200, width: 100, height: 100 };
      }
    };
    win.Coachmark({
      id: "t3", title: "T", body: "B",
      target: fakeEl, showHighlight: true, placement: "bottom",
      onComplete: () => {}, onSkip: () => {}
    });
    const ring = findFirst(calls, n => n.props && n.props.className && String(n.props.className).indexOf("cs-coachmark-highlight-ring") !== -1);
    expect(ring).not.toBeNull();
  });

  test("custom buttons array is honoured", () => {
    const { win, calls, resetIdx } = loadCoaching();
    resetIdx();
    win.Coachmark({
      id: "t4", title: "T", body: "B",
      buttons: [
        { label: "Maybe later", action: "skip" },
        { label: "Try now", action: "complete", primary: true }
      ],
      onComplete: () => {}, onSkip: () => {}
    });
    const primary = findFirst(calls, n => n.type === "button" && n.props["data-coach-primary"] === "true");
    expect(primary.children).toContain("Try now");
    const sec = findFirst(calls, n => n.type === "button" && n.props["data-coach-primary"] !== "true");
    expect(sec.children).toContain("Maybe later");
  });

  test("placement='centre' produces sensible coords", () => {
    const { win } = loadCoaching();
    const r = win.Coaching._resolvePlacement(null, 1024, 768, "centre");
    expect(r.placement).toBe("centre");
  });
});
