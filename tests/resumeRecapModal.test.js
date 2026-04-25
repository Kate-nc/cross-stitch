// A3 (UX Phase 5) — structural assertions for the Tracker resume recap modal.
// tracker-app.js contains JSX so we cannot eval it; we assert against the source
// to lock in the wiring.

const fs = require('fs');
const path = require('path');

const trackerSrc = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

describe('A3 resume recap modal — wiring', () => {
  test('declares resumeRecap state and one-shot ref', () => {
    expect(trackerSrc).toMatch(/setResumeRecap\s*\]\s*=\s*useState\(null\)/);
    expect(trackerSrc).toMatch(/resumeRecapShownRef\s*=\s*useRef\(new Set\(\)\)/);
  });

  test('triggers recap after setStatsSessions when prior sessions exist', () => {
    expect(trackerSrc).toMatch(/setStatsSessions\(rawStatsSessions\);[\s\S]{0,400}resumeRecapShownRef\.current\.has/);
    expect(trackerSrc).toMatch(/lastSessionSummary\(\{statsSessions:rawStatsSessions\}\)/);
  });

  test('renders modal with welcome-back title and three stat cards', () => {
    expect(trackerSrc).toMatch(/Welcome back to \{r\.projectName\}/);
    expect(trackerSrc).toMatch(/className="resume-recap-grid"/);
    expect(trackerSrc).toMatch(/resume-recap-card/);
  });

  test('modal exposes Continue / Switch / Stats actions', () => {
    expect(trackerSrc).toMatch(/Continue stitching</);
    expect(trackerSrc).toMatch(/Switch project</);
    expect(trackerSrc).toMatch(/>Stats</);
  });

  test('modal has accessible dialog markup', () => {
    expect(trackerSrc).toMatch(/role="dialog"/);
    expect(trackerSrc).toMatch(/aria-modal="true"/);
    expect(trackerSrc).toMatch(/aria-labelledby="resume-recap-title"/);
  });

  test('uses Icons.x() for the close button (no raw ✕ glyph)', () => {
    // The modal close button should call Icons.x(), not the raw glyph.
    const modalSlice = trackerSrc.split('resume-recap-overlay')[1] || '';
    const headerSlice = modalSlice.split('resume-recap-body')[0] || '';
    expect(headerSlice).toMatch(/Icons\.x\(\)/);
  });
});

describe('A3 resume recap modal — CSS', () => {
  test('exposes the resume-recap-grid class', () => {
    expect(cssSrc).toMatch(/\.resume-recap-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/);
  });

  test('mobile breakpoint makes the modal full-screen below 480px', () => {
    // The @media block specifically targets resume-recap-modal full-screen.
    const block = cssSrc.match(/@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.resume-recap-modal[\s\S]*?height:\s*100vh/);
    expect(block).not.toBeNull();
  });

  test('progress bar fills with the Workshop accent', () => {
    expect(cssSrc).toMatch(/\.resume-recap-bar-fill[^}]*background:\s*#B85C38/i);
  });
});
