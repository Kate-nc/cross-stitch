// tests/c7ImportWizardSteps.test.js — source-level structural assertions for
// the C7 ImportWizard component. Verifies each of the 5 steps is rendered,
// Back/Next controls exist, and step 5 surfaces a "Generate pattern" button
// (not "Next").

const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "creator", "ImportWizard.js"),
  "utf8"
);

describe("ImportWizard source structure", () => {
  test("declares window.ImportWizard component", () => {
    expect(SRC).toMatch(/window\.ImportWizard\s*=\s*ImportWizard/);
  });

  test("renders all five step bodies", () => {
    expect(SRC).toMatch(/Step 1 of 5: Crop/);
    expect(SRC).toMatch(/Step 2 of 5: Choose a palette/);
    expect(SRC).toMatch(/Step 3 of 5: Size/);
    expect(SRC).toMatch(/Step 4 of 5: Preview/);
    expect(SRC).toMatch(/Step 5 of 5: Confirm/);
  });

  test("each step has a renderStep function", () => {
    expect(SRC).toMatch(/function renderStep1\b/);
    expect(SRC).toMatch(/function renderStep2\b/);
    expect(SRC).toMatch(/function renderStep3\b/);
    expect(SRC).toMatch(/function renderStep4\b/);
    expect(SRC).toMatch(/function renderStep5\b/);
  });

  test("footer includes Back and Next buttons", () => {
    // Both labels appear as button bodies.
    expect(SRC).toMatch(/"Back"/);
    expect(SRC).toMatch(/"Next"/);
  });

  test("step 5 surfaces a Generate button (not Next)", () => {
    // The label exists exactly once, in the isLast branch.
    expect(SRC).toMatch(/"Generate pattern"/);
    // And there is no exclamation-mark variant.
    expect(SRC).not.toMatch(/Generate pattern!/);
  });

  test("uses Icons.crop, Icons.palette, Icons.ruler, Icons.eye, Icons.check (no emoji)", () => {
    // Step icon names are referenced by string in STEP_LABELS.
    for (const name of ["crop", "palette", "ruler", "eye", "check"]) {
      expect(SRC).toMatch(new RegExp(`icon:\\s*"${name}"`));
    }
  });

  test("uses British English copy", () => {
    // Should NOT use "color" anywhere in user-visible strings.
    // (The word may appear in CSS class names — our wizard uses only "colour".)
    const userStrings = SRC.match(/"[^"]+"/g) || [];
    const offending = userStrings.filter(s =>
      /\bcolor\b/.test(s) && !/cs-coachmark|sr-only|iw-/.test(s)
    );
    expect(offending).toEqual([]);
  });

  test("contains no emoji-class characters in user-visible copy", () => {
    // Allow box-drawing characters in the file header banner only.
    // Strip the leading comment block, then check the rest.
    const withoutHeader = SRC.replace(/^\s*\/\*[\s\S]*?\*\//, "");
    // Match any character outside the basic latin + common punctuation range
    // that's NOT one of: degree °, multiplication ×, en-dash – em-dash —, etc.
    // We keep this narrow: only flag emoji presentation chars.
    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiRe.test(withoutHeader)).toBe(false);
  });

  test("includes Cancel button that triggers discard confirmation", () => {
    expect(SRC).toMatch(/"Cancel"/);
    expect(SRC).toMatch(/Discard import\?/);
  });
});
