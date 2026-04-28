// tests/c7ImportWizardA11y.test.js — source-level accessibility assertions
// for the C7 ImportWizard. The wizard must be a labelled dialog, manage
// focus on each step change, expose a step list with aria-current, and
// confirm before discarding the user's draft.

const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "creator", "ImportWizard.js"),
  "utf8"
);

describe("ImportWizard accessibility", () => {
  test("root container is role='dialog' with aria-modal", () => {
    expect(SRC).toMatch(/role:\s*"dialog"/);
    expect(SRC).toMatch(/"aria-modal":\s*"true"/);
  });

  test("dialog is labelled and described by ids that match rendered elements", () => {
    expect(SRC).toMatch(/"aria-labelledby":\s*"iw-step-heading"/);
    expect(SRC).toMatch(/"aria-describedby":\s*"iw-wizard-desc"/);
    // The id targets exist in the markup.
    expect(SRC).toMatch(/id:\s*"iw-step-heading"/);
    expect(SRC).toMatch(/id:\s*"iw-wizard-desc"/);
  });

  test("step heading is focusable (tabIndex -1) so focus can be moved", () => {
    expect(SRC).toMatch(/tabIndex:\s*-1/);
    // Heading element holds the ref used to focus on each step change.
    expect(SRC).toMatch(/ref:\s*headingRef/);
  });

  test("focus is moved to the heading on step change via useEffect", () => {
    expect(SRC).toMatch(/headingRef\.current/);
    // The effect depends on wizard.step.
    expect(SRC).toMatch(/\[wizard\.step\]/);
  });

  test("progress strip exposes role='list' and aria-current='step' on active item", () => {
    expect(SRC).toMatch(/role:\s*"list"/);
    expect(SRC).toMatch(/role:\s*"listitem"/);
    expect(SRC).toMatch(/"aria-current"\s*\]\s*=\s*"step"|"aria-current":\s*"step"/);
  });

  test("Escape key opens a discard confirmation prompt (work not lost silently)", () => {
    // ESC is now routed through window.useEscape so it composes with nested
    // overlays (UX-12 Phase 3b). The handler must still call setDiscardOpen.
    expect(SRC).toMatch(/window\.useEscape\s*\(/);
    expect(SRC).toMatch(/setDiscardOpen\(\s*true\s*\)/);
    // Confirm dialog uses role='alertdialog' and labels its title.
    expect(SRC).toMatch(/role:\s*"alertdialog"/);
    expect(SRC).toMatch(/"aria-labelledby":\s*"iw-discard-title"/);
  });

  test("range inputs expose aria-valuemin/max/now (mobile form conventions)", () => {
    expect(SRC).toMatch(/"aria-valuemin"/);
    expect(SRC).toMatch(/"aria-valuemax"/);
    expect(SRC).toMatch(/"aria-valuenow"/);
  });

  test("number inputs use inputMode='numeric' with min/max/step", () => {
    expect(SRC).toMatch(/inputMode:\s*"numeric"/);
    // The size step has at least one numeric input with explicit bounds.
    expect(SRC).toMatch(/min:\s*10,\s*max:\s*300,\s*step:\s*1/);
  });

  test("estimate readout is announced via aria-live polite", () => {
    expect(SRC).toMatch(/"aria-live":\s*"polite"/);
  });

  test("disabled state is mirrored to aria-disabled for assistive tech", () => {
    expect(SRC).toMatch(/"aria-disabled"/);
  });
});
