const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

describe('tracker timing mode settings wiring', () => {
  it('user-prefs.js declares trackerTimingMode with the classic default', () => {
    const src = read('user-prefs.js');
    expect(src).toMatch(/trackerTimingMode\s*:\s*"classic"/);
    expect(src).toMatch(/classic \| batchAware \| manual/);
  });

  it('preferences-modal.js TrackerPanel registers trackerTimingMode and exposes all options', () => {
    const src = read('preferences-modal.js');
    expect(src).toMatch(/usePref\("trackerTimingMode",\s*"classic"\)/);
    expect(src).toMatch(/Session timing mode/);
    expect(src).toMatch(/Batch-friendly/);
    expect(src).toMatch(/Classic/);
    expect(src).toMatch(/Manual timer/);
  });

  it('components-stats.js exposes a per-project timingMode override with a global fallback option', () => {
    const src = read('components-stats.js');
    expect(src).toMatch(/timingMode:e\.target\.value \|\| null/);
    expect(src).toMatch(/Use global default/);
    expect(src).toMatch(/This project follows the global tracker timing mode from Preferences\./);
    expect(src).toMatch(/value:'manual'/);
  });

  it('tracker-app.js surfaces the resolved timing mode in the live session UI', () => {
    const src = read('tracker-app.js');
    expect(src).toMatch(/formatTimingModeShortLabel\(currentTimingMode\)/);
    expect(src).toMatch(/formatTimingModeLabel\(currentTimingMode\)/);
  });
});