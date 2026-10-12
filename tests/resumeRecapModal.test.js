// A3 / TRACK-05 — the Tracker resume recap. It began as a modal (A3, UX Phase 5); since Phase 4 it is a
// banner that never blocks the chart. tracker-app.js contains JSX so we assert against the source.
const fs = require('fs');
const path = require('path');

const trackerSrc = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

describe('resume recap — wiring', () => {
  test('declares resumeRecap state and one-shot ref', () => {
    expect(trackerSrc).toMatch(/setResumeRecap\s*\]\s*=\s*useState\(null\)/);
    expect(trackerSrc).toMatch(/resumeRecapShownRef\s*=\s*useRef\(new Set\(\)\)/);
  });

  test('triggers recap after setStatsSessions when prior sessions exist', () => {
    expect(trackerSrc).toMatch(/setStatsSessions\(rawStatsSessions\);[\s\S]{0,400}resumeRecapShownRef\.current\.has/);
    expect(trackerSrc).toMatch(/lastSessionSummary\(\{statsSessions:rawStatsSessions\}\)/);
  });

  test('renders a banner with the welcome-back line and Stats / Switch project actions', () => {
    expect(trackerSrc).toMatch(/Welcome back to \{r\.projectName\}/);
    expect(trackerSrc).toMatch(/className="resume-recap-banner"/);
    expect(trackerSrc).toMatch(/>Switch project</);
    expect(trackerSrc).toMatch(/>Stats</);
  });

  test('is not a dialog: no modal overlay, no aria-modal', () => {
    const slice = trackerSrc.split('className="resume-recap-banner"')[1].split('modal==="about"')[0];
    expect(slice).not.toMatch(/modal-overlay|aria-modal/);
    expect(slice).toMatch(/role="status"/);
  });

  test('the first mark, or twenty seconds, dismisses it', () => {
    expect(trackerSrc).toMatch(/resumeRecap&&trackHistory\.length>0\)setResumeRecap\(null\)/);
    expect(trackerSrc).toMatch(/setTimeout\(\(\)=>setResumeRecap\(null\),20000\)/);
  });

  test('uses Icons.x() for the dismiss button', () => {
    expect(trackerSrc.split('resume-recap-banner-close')[1]).toMatch(/Icons\.x\(\)/);
  });
});

describe('resume recap — CSS', () => {
  test('the banner is fixed-position, tokenised, and not a full-screen overlay', () => {
    const block = cssSrc.match(/\.resume-recap-banner\s*\{[^}]*\}/)[0];
    expect(block).toMatch(/position:\s*fixed/);
    expect(block).toMatch(/var\(--surface\)/);
    expect(block).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
