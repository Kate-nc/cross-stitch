// tests/c8CoachingSequence.test.js — useCoachingSequence + Coaching helpers.
//
// Loads coaching.js with a stubbed window/React/UserPrefs environment and
// verifies the state machine returns the next un-coached step, advances on
// complete, persists to UserPrefs, and skip skips without persisting.

const fs = require("fs");
const path = require("path");

function loadCoaching(prefStore) {
  const lsStore = {};
  // UserPrefs stub
  const UserPrefs = {
    DEFAULTS: {
      "onboarding.coached.firstStitch_creator": false,
      "onboarding.coached.firstStitch_tracker": false,
      "onboarding.coached.import": false,
      "onboarding.coached.undo": false,
      "onboarding.coached.progress": false,
      "onboarding.coached.save": false
    },
    get: function (k) { return Object.prototype.hasOwnProperty.call(prefStore, k) ? prefStore[k] : (UserPrefs.DEFAULTS[k] !== undefined ? UserPrefs.DEFAULTS[k] : false); },
    set: function (k, v) { prefStore[k] = v; }
  };
  // ── Tiny React shim: useState, useMemo, useRef, useCallback ────────────
  let stateCells = [];
  let cellIdx = 0;
  function reset() { cellIdx = 0; }
  const React = {
    useState: function (init) {
      const i = cellIdx++;
      if (stateCells.length <= i) stateCells.push(typeof init === "function" ? init() : init);
      return [stateCells[i], function (v) {
        stateCells[i] = typeof v === "function" ? v(stateCells[i]) : v;
      }];
    },
    useMemo: function (factory) { return factory(); },
    useRef: function (init) {
      const i = cellIdx++;
      if (stateCells.length <= i) stateCells.push({ current: init });
      return stateCells[i];
    },
    useCallback: function (fn) { return fn; },
    useEffect: function () {},
    createElement: function () { return {}; }
  };
  const win = {
    UserPrefs: UserPrefs,
    React: React,
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () { return true; },
    Icons: {},
    innerWidth: 1024, innerHeight: 768
  };
  global.window = win;
  global.React = React;
  global.document = {
    addEventListener: function () {}, removeEventListener: function () {},
    activeElement: null, querySelector: function () { return null; }
  };
  global.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  global.navigator = { userAgent: "jest" };
  const src = fs.readFileSync(path.join(__dirname, "..", "coaching.js"), "utf8");
  const fn = new Function("window", src);
  fn(win);
  return { win: win, reset: reset, stateCells: stateCells, prefStore: prefStore };
}

describe("Coaching — pure helpers", () => {
  test("_filter returns first un-coached step", () => {
    const { win } = loadCoaching({});
    const C = win.Coaching;
    expect(C._filter(["a", "b", "c"], [])).toBe("a");
    expect(C._filter(["a", "b", "c"], ["a"])).toBe("b");
    expect(C._filter(["a", "b", "c"], ["a", "b"])).toBe("c");
    expect(C._filter(["a", "b"], ["a", "b"])).toBe(null);
    expect(C._filter([], [])).toBe(null);
  });

  test("_SEQUENCES exposes Phase 1 step IDs", () => {
    const { win } = loadCoaching({});
    expect(win.Coaching._SEQUENCES.creator).toContain("firstStitch_creator");
    expect(win.Coaching._SEQUENCES.tracker).toContain("firstStitch_tracker");
  });

  test("_isCoached reads UserPrefs", () => {
    const store = { "onboarding.coached.firstStitch_creator": true };
    const { win } = loadCoaching(store);
    expect(win.Coaching._isCoached("firstStitch_creator")).toBe(true);
    expect(win.Coaching._isCoached("firstStitch_tracker")).toBe(false);
  });

  test("_resolvePlacement falls back to centre when target missing", () => {
    const { win } = loadCoaching({});
    const r = win.Coaching._resolvePlacement(null, 1024, 768, "right");
    expect(r.placement).toBe("centre");
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.left).toBeGreaterThanOrEqual(0);
  });

  test("_resolvePlacement flips to opposite side when no room", () => {
    const { win } = loadCoaching({});
    // Target hugging top-left — bottom should fit, top shouldn't.
    const rect = { top: 5, bottom: 25, left: 5, right: 25, width: 20, height: 20 };
    const r = win.Coaching._resolvePlacement(rect, 1024, 768, "top");
    expect(r.placement).toBe("bottom");
  });
});

describe("useCoachingSequence — state machine", () => {
  test("returns the first un-coached step initially", () => {
    const { win } = loadCoaching({});
    const r = win.useCoachingSequence("creator");
    // Polish 13 step 4b — toolsTab_unlocked precedes firstStitch_creator.
    expect(r.active).toBe("toolsTab_unlocked");
  });

  test("respects existing UserPrefs completion", () => {
    const { win } = loadCoaching({
      "onboarding.coached.toolsTab_unlocked": true,
      "onboarding.coached.firstStitch_creator": true
    });
    const r = win.useCoachingSequence("creator");
    // Polish 13 step 4b — with both creator steps done, active === null.
    expect(r.active).toBe(null);
  });

  test("complete() persists to UserPrefs and advances", () => {
    const store = {};
    const { win } = loadCoaching(store);
    const r = win.useCoachingSequence("creator");
    expect(r.active).toBe("toolsTab_unlocked");
    r.complete("toolsTab_unlocked");
    expect(store["onboarding.coached.toolsTab_unlocked"]).toBe(true);
  });

  test("skip() does NOT persist to UserPrefs", () => {
    const store = {};
    const { win } = loadCoaching(store);
    const r = win.useCoachingSequence("tracker");
    expect(r.active).toBe("firstStitch_tracker");
    r.skip("firstStitch_tracker");
    expect(store["onboarding.coached.firstStitch_tracker"]).toBeUndefined();
  });

  test("unknown mode yields null active", () => {
    const { win } = loadCoaching({});
    const r = win.useCoachingSequence("zzz");
    expect(r.active).toBe(null);
  });
});
