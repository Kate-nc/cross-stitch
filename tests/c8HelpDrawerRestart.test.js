// tests/c8HelpDrawerRestart.test.js — source-level guarantee that
// help-drawer.js wires a "Restart guided tours" button to window.resetCoaching.
//
// The drawer's GettingStartedSection runs only when actually rendered; this
// test does not boot React. It instead inspects the source so the call site
// cannot silently regress.

const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "help-drawer.js"), "utf8");

describe("help-drawer.js — Restart guided tours integration (C8)", () => {
  test("references window.resetCoaching", () => {
    expect(src).toMatch(/window\.resetCoaching\s*\(\s*\)/);
  });

  test("renders a button with the documented label", () => {
    expect(src).toMatch(/Restart guided tours/);
  });

  test("uses the data-action='restart-tours' marker", () => {
    expect(src).toMatch(/data-action[^"]*"\s*:\s*"restart-tours"/);
  });

  test("uses Icons.replay (with a guard) rather than an emoji", () => {
    expect(src).toMatch(/Icons\.replay/);
    expect(src).not.toMatch(/\u{1F504}/u);  // 🔄
    expect(src).not.toMatch(/\u{21BB}/u);   // ↻
  });
});

describe("user-prefs.js — onboarding.coached.* DEFAULTS (C8)", () => {
  const prefsSrc = fs.readFileSync(path.join(__dirname, "..", "user-prefs.js"), "utf8");
  test("declares Phase 1 keys", () => {
    expect(prefsSrc).toMatch(/onboarding\.coached\.firstStitch_creator/);
    expect(prefsSrc).toMatch(/onboarding\.coached\.firstStitch_tracker/);
  });
  test("reserves Phase 2 keys", () => {
    expect(prefsSrc).toMatch(/onboarding\.coached\.import/);
    expect(prefsSrc).toMatch(/onboarding\.coached\.undo/);
    expect(prefsSrc).toMatch(/onboarding\.coached\.progress/);
    expect(prefsSrc).toMatch(/onboarding\.coached\.save/);
  });
});

describe("HTML pages — coaching.js script tag", () => {
  ["index.html", "stitch.html", "manager.html"].forEach(file => {
    test(file + " loads coaching.js", () => {
      const html = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
      expect(html).toMatch(/<script src="coaching\.js"><\/script>/);
    });
  });
});
