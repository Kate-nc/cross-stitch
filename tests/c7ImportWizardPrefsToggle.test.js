// tests/c7ImportWizardPrefsToggle.test.js — verifies the preferences modal
// exposes the experimental.importWizard toggle in the Pattern Creator panel,
// and that the pref is registered with a default of false in user-prefs.js.

const fs = require("fs");
const path = require("path");

const PREFS_MODAL = fs.readFileSync(
  path.join(__dirname, "..", "preferences-modal.js"),
  "utf8"
);
const USER_PREFS = fs.readFileSync(
  path.join(__dirname, "..", "user-prefs.js"),
  "utf8"
);

describe("experimental.importWizard preference", () => {
  test("registered in user-prefs.js DEFAULTS, default false", () => {
    expect(USER_PREFS).toMatch(/"experimental\.importWizard"\s*:\s*false/);
  });

  test("exposed via usePref in CreatorPanel", () => {
    expect(PREFS_MODAL).toMatch(/usePref\(\s*"experimental\.importWizard"\s*,\s*false\s*\)/);
  });

  test("rendered as a Switch row with descriptive label", () => {
    // Label and the Switch wiring should appear together in the Experimental section.
    expect(PREFS_MODAL).toMatch(/Use guided import wizard \(experimental\)/);
    expect(PREFS_MODAL).toMatch(/h\(Switch,\s*\{\s*checked:\s*importWiz\[0\]/);
  });

  test("under an 'Experimental' section heading", () => {
    expect(PREFS_MODAL).toMatch(/title:\s*"Experimental"/);
  });
});
