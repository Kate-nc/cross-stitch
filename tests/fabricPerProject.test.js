// Fabric saved with the pattern, in cm and inches (P2-2, audit COMMON-08).
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./_helpers/loadSource');

function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

// constants.js and pattern-size-calc.js share one scope on a page. `nav` and
// `prefs` stand in for navigator and window.UserPrefs.
function makeEnv(lang, unitsPref) {
  const win = { UserPrefs: { get: (k) => (k === 'units' ? unitsPref : null) } };
  // eslint-disable-next-line no-new-func
  return new Function('window', 'navigator',
    read('constants.js') + '\n' + read('pattern-size-calc.js').replace(/if \(typeof module[\s\S]*$/, '') + '\n' +
    'return { defaultUnitsForLocale, preferredUnits, dualSizeText, fabricSizes, finishedSizeText };'
  )(win, { language: lang });
}

describe('units', () => {
  const env = makeEnv('en-GB', null);

  test.each([
    ['en-GB', 'metric'], ['en-AU', 'metric'], ['en-CA', 'metric'], ['en', 'metric'],
    ['fr-FR', 'metric'], ['de', 'metric'], ['ja-JP', 'metric'], ['', 'metric'],
    ['en-US', 'imperial'], ['en-us', 'imperial'],
  ])('%s defaults to %s', (lang, units) => {
    expect(env.defaultUnitsForLocale(lang)).toBe(units);
    expect(makeEnv(lang, null).preferredUnits()).toBe(units);
  });

  test('a chosen setting wins over the locale', () => {
    expect(makeEnv('en-US', 'metric').preferredUnits()).toBe('metric');
    expect(makeEnv('en-GB', 'imperial').preferredUnits()).toBe('imperial');
  });

  test('28-count over two at 80 x 80 reads 14.5 x 14.5 cm (5.7 x 5.7 in) for en-GB', () => {
    expect(makeEnv('en-GB', null).fabricSizes(80, 80, 28).finished).toBe('14.5 × 14.5 cm (5.7 × 5.7 in)');
    expect(makeEnv('en-GB', null).finishedSizeText(80, 80, 28)).toBe('14.5 × 14.5 cm (5.7 × 5.7 in)');
    expect(makeEnv('en-US', null).finishedSizeText(80, 80, 28)).toBe('5.7 × 5.7 in (14.5 × 14.5 cm)');
  });

  test('cut size adds 5 cm (metric) or 2 in (imperial) each side, rounded up', () => {
    // 80 st at 14 count = 5.714 in; + 2 x 1.9685 in = 9.65 in, up to 9.75 in.
    expect(makeEnv('en-GB', null).fabricSizes(80, 80, 14).cut).toBe('24.8 × 24.8 cm (9.8 × 9.8 in)');
    // + 2 x 2 in = 9.714 in, up to 9.75 in.
    expect(makeEnv('en-US', null).fabricSizes(80, 80, 14).cut).toBe('9.8 × 9.8 in (24.8 × 24.8 cm)');
  });
});

describe('fabric colour belongs to the project', () => {
  const io = loadSource('creator/useProjectIO.js');
  const state = loadSource('creator/useCreatorState.js');

  test('every Creator save writes settings.fabricColour', () => {
    expect((io.match(/fabricColour: state\.fabricColour \}/g) || []).length).toBe(3);
    expect(io).toMatch(/state\.symbolOverrides, state\.fabricColour, state\.isActive,/);
  });

  test('loading restores it, and an old project falls back to the preference', () => {
    const block = io.match(/if \(state\.setFabricColour\) \{[\s\S]*?\n {4}\}/)[0];
    const calls = [];
    const run = (settings, pref) => {
      // eslint-disable-next-line no-new-func
      new Function('state', 's', 'window', block)(
        { setFabricColour: (v) => calls.push(v) }, settings, { creatorDefaultFabricColour: () => pref });
      return calls[calls.length - 1];
    };
    expect(run({ fabricColour: '#1A1A1A' }, '#FFFFFF')).toBe('#1A1A1A');
    expect(run({}, '#FAEBD7')).toBe('#FAEBD7');
    expect(run({ fabricColour: 'red' }, '#FFFFFF')).toBe('#FFFFFF');
  });

  test('changing it no longer changes the preference; new patterns start from it', () => {
    const fn = state.match(/function setFabricColour\(v\) \{[\s\S]*?\n {2}\}/)[0];
    expect(fn).not.toMatch(/UserPrefs\.set/);
    expect(state).toMatch(/var _fabCol = useState\(defaultFabricColour\);/);
    expect(state).toMatch(/setSymbolOverrides\(\{\}\);\s*_setFabricColourRaw\(defaultFabricColour\(\)\);/);
  });

  test('the Tracker draws on the project fabric and keeps it when it saves', () => {
    const tracker = loadSource('tracker-app.js');
    expect(tracker).toMatch(/const chartFabricColour=projectFabricColour\|\|trackerFabricColour;/);
    expect(tracker).toMatch(/setProjectFabricColour\(typeof s\.fabricColour==="string"/);
    expect((tracker.match(/fabricColour: ?projectFabricColour ?\|\| ?undefined/g) || []).length).toBe(3);
    expect(tracker).not.toMatch(/fillStyle=trackerFabricColour/);
  });
});
