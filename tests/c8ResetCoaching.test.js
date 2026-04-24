// tests/c8ResetCoaching.test.js — resetCoaching() clears all
// onboarding.coached.* prefs, fires a Toast, and dispatches cs:prefsChanged.

const fs = require("fs");
const path = require("path");

function load() {
  const prefStore = {
    "onboarding.coached.firstStitch_creator": true,
    "onboarding.coached.firstStitch_tracker": true,
    "onboarding.coached.import": true,
    "onboarding.coached.undo": true,
    "onboarding.coached.progress": true,
    "onboarding.coached.save": true,
    "trackerCelebrate": true   // unrelated key — must NOT be touched
  };
  const events = [];
  const toasts = [];
  const UserPrefs = {
    DEFAULTS: {
      "onboarding.coached.firstStitch_creator": false,
      "onboarding.coached.firstStitch_tracker": false,
      "onboarding.coached.import":   false,
      "onboarding.coached.undo":     false,
      "onboarding.coached.progress": false,
      "onboarding.coached.save":     false,
      trackerCelebrate: true
    },
    get: function (k) { return Object.prototype.hasOwnProperty.call(prefStore, k) ? prefStore[k] : false; },
    set: function (k, v) { prefStore[k] = v; }
  };
  const win = {
    UserPrefs: UserPrefs,
    React: { useState: function (i) { return [i, function () {}]; }, useMemo: function (f) { return f(); }, useRef: function (v) { return { current: v }; }, useCallback: function (f) { return f; }, useEffect: function () {}, createElement: function () { return {}; } },
    Toast: { show: function (o) { toasts.push(o); } },
    addEventListener: function () {}, removeEventListener: function () {},
    dispatchEvent: function (e) { events.push(e); return true; },
    innerWidth: 1024, innerHeight: 768
  };
  global.window = win;
  global.React = win.React;
  global.document = { addEventListener: function () {}, removeEventListener: function () {}, activeElement: null, querySelector: function () { return null; } };
  global.CustomEvent = function (t, i) { this.type = t; this.detail = i && i.detail; };
  global.navigator = { userAgent: "jest" };
  const src = fs.readFileSync(path.join(__dirname, "..", "coaching.js"), "utf8");
  new Function("window", src)(win);
  return { win: win, prefStore: prefStore, events: events, toasts: toasts };
}

describe("resetCoaching()", () => {
  test("is exposed on window", () => {
    const { win } = load();
    expect(typeof win.resetCoaching).toBe("function");
  });

  test("clears every onboarding.coached.* pref to false", () => {
    const { win, prefStore } = load();
    win.resetCoaching();
    expect(prefStore["onboarding.coached.firstStitch_creator"]).toBe(false);
    expect(prefStore["onboarding.coached.firstStitch_tracker"]).toBe(false);
    expect(prefStore["onboarding.coached.import"]).toBe(false);
    expect(prefStore["onboarding.coached.undo"]).toBe(false);
    expect(prefStore["onboarding.coached.progress"]).toBe(false);
    expect(prefStore["onboarding.coached.save"]).toBe(false);
  });

  test("does NOT touch unrelated prefs", () => {
    const { win, prefStore } = load();
    win.resetCoaching();
    expect(prefStore.trackerCelebrate).toBe(true);
  });

  test("dispatches a cs:prefsChanged CustomEvent", () => {
    const { win, events } = load();
    win.resetCoaching();
    const evt = events.find(e => e.type === "cs:prefsChanged");
    expect(evt).toBeDefined();
    expect(evt.detail && evt.detail.reset).toBe(true);
  });

  test("calls Toast.show with the reset copy", () => {
    const { win, toasts } = load();
    win.resetCoaching();
    expect(toasts.length).toBe(1);
    expect(toasts[0].message).toMatch(/Tutorials reset/);
    expect(toasts[0].type).toBe("info");
  });

  test("returns the list of cleared keys", () => {
    const { win } = load();
    const cleared = win.resetCoaching();
    expect(Array.isArray(cleared)).toBe(true);
    expect(cleared).toEqual(expect.arrayContaining([
      "onboarding.coached.firstStitch_creator",
      "onboarding.coached.firstStitch_tracker"
    ]));
  });
});
