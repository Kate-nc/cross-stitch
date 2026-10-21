// F-011: what the Tracker rebuilds from a loaded project's sessions (legacy total-time migration, durationSeconds and
// totalAtEnd patching, recovery of a pending session). The expectations in tests/_helpers/trackerLoadSessions.golden.json
// were recorded from the block as it was written inline in processLoadedProject, before it moved.
process.env.TZ = 'Europe/London';
const golden = require('./_helpers/trackerLoadSessions.golden.json');
const { CASES, observe } = require('./_helpers/trackerLoadSessionsObserve');
const { blockRunner, loadSource } = require('./_helpers/trackerLoadSessionsBaseBlock');

describe('session rebuild on project load', () => {
  const run = blockRunner(loadSource('tracker-app.js'));
  CASES.forEach((c) => {
    test(c.name, () => {
      expect(observe(c, run)).toEqual(golden[c.name]);
    });
  });
  test('every recorded case is still exercised', () => {
    expect(Object.keys(golden)).toEqual(CASES.map((c) => c.name));
  });
});
