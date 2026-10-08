// tests/onboardingFlow.test.js — guards for the pop-up tutorial fixes
// (reports/tutorial-popups-analysis.md). Source-level: the walkthroughs and
// tips are wired through JSX that the unit-test harness doesn't render.

const fs = require("fs");
const path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

function loadSteps() {
  const win = {};
  const React = { createElement: () => ({}), useState: (v) => [v, () => {}] };
  const doc = { getElementById: () => ({}), createElement: () => ({}), head: { appendChild: () => {} } };
  new Function("window", "React", "document", "localStorage", read("onboarding-wizard.js"))(win, React, doc, {});
  return win.WelcomeWizard.STEPS;
}

describe("welcome walkthrough targets exist on their own page", () => {
  const STEPS = loadSteps();
  // Where each page's walkthrough is mounted, and the files that render it.
  const PAGE_SOURCES = {
    creator: ["creator/Sidebar.js", "creator/ActionBar.js", "header.js", "creator-main.js"],
    manager: ["manager-app.js"],
    tracker: ["tracker-app.js"]
  };
  Object.keys(STEPS).forEach(page => {
    test(page + ": every data-onboard target is rendered by that page", () => {
      const src = PAGE_SOURCES[page].map(read).join("\n");
      STEPS[page].filter(s => s.target).forEach(s => {
        const m = s.target.match(/data-onboard="([^"]+)"/);
        expect(m).not.toBeNull();
        // JSX (data-onboard="x") or createElement ("data-onboard": "x").
        const re = new RegExp("data-onboard['\"]?\\s*[:=]\\s*['\"]" + m[1] + "['\"]");
        expect(src).toMatch(re);
      });
    });
  });

  test("the Creator walkthrough no longer describes Home", () => {
    const text = JSON.stringify(STEPS.creator);
    expect(text).not.toMatch(/Projects tab|Create new tab|home-from-image/);
  });
});

describe("Tracker: Skip tour skips", () => {
  const src = read("tracker-app.js");

  test("closing the walkthrough does not open the style picker", () => {
    const start = src.indexOf("{welcomeOpen&&window.WelcomeWizard&&React.createElement(window.WelcomeWizard,{");
    const end = src.indexOf("{styleOnboardingOpen&&", start);
    const block = src.slice(start, end);
    expect(block).toMatch(/onClose:\(\)=>\{/);
    expect(block).not.toMatch(/setStyleOnboardingOpen\(true\)/);
  });

  test("the standalone style picker can be closed", () => {
    const start = src.indexOf("function StitchingStyleOnboarding(");
    const block = src.slice(start, src.indexOf("\n}\n", start));
    expect(block).toMatch(/className="modal-close"/);
    expect(block).toMatch(/useEscape/);
    expect(block).toMatch(/overlayOpened/);
  });

  test("tips are gated on the page being active and wait for a pause", () => {
    expect(src).toMatch(/const _trCoachBlocked = !isActive \|\|/);
    expect(src).toMatch(/_rectSelectThresholdMet=liveAutoStitches>=/);
  });
});

describe("Creator tips only follow a pattern made in this visit", () => {
  const src = read("creator-main.js");
  const stateSrc = read("creator/useCreatorState.js");
  test("toolsTab_unlocked needs a fresh generation", () => {
    expect(src).toMatch(/toolsTab_unlocked: state\.patternGeneratedThisVisit &&/);
    expect(stateSrc).toMatch(/setPatternGeneratedThisVisit\(true\)/);
  });
  test("firstStitch_creator needs a fresh pattern or newly created blank grid", () => {
    expect(src).toMatch(/const _freshPattern = state\.patternCreatedThisVisit/);
    expect(stateSrc).toMatch(/function startScratch\(\)[\s\S]*?setPatternCreatedThisVisit\(true\)/);
    expect(stateSrc).toMatch(/setPatternCreatedThisVisit\(true\);\s*setPatternGeneratedThisVisit\(true\)/);
  });
  test("tips can be skipped as a set", () => {
    expect((src.match(/onSkipAll: \(\)=>_coach\.skipAll\(\)/g) || []).length).toBe(2);
  });
});

describe("one reset for every tutorial", () => {
  test("Preferences' reset uses resetCoaching, which also clears walkthroughs", () => {
    expect(read("preferences-modal.js")).toMatch(/function clearAllTutorials\(\) \{\s*if \(typeof window\.resetCoaching === "function"\)/);
    const coaching = read("coaching.js");
    const reset = coaching.slice(coaching.indexOf("function resetCoaching"));
    expect(reset).toMatch(/WelcomeWizard\.resetAll/);
    expect(reset).toMatch(/cs_styleOnboardingDone/);
    expect(reset).toMatch(/HelpHintBanner\.reset/);
  });
});
