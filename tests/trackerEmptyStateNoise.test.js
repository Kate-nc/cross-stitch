// Normal tracker empty-state path should not emit a console warning just
// because no active project exists. Diagnostics are still desirable when the
// app actually tried to load a specific project id or found malformed data.

const fs = require('fs');
const path = require('path');

const trackerSrc = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

describe('Tracker empty-state console noise', () => {
  test('mount-failure warning is gated behind a real load attempt', () => {
    expect(trackerSrc).toMatch(/var shouldWarn = !!\(_urlId2 \|\| activeId \|\| projectIfAny\);/);
    expect(trackerSrc).toMatch(/if \(shouldWarn && ProjectStorage && ProjectStorage\.listProjects\)/);
    expect(trackerSrc).toMatch(/else if \(shouldWarn\) \{/);
  });
});
