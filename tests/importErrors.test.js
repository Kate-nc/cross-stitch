// P0-3 (audit IMPORT-05): plain-English import errors and turning away files
// the app can't read before they reach the image converter.
const { loadSource } = require('./_helpers/loadSource');
const IE = require('../import-engine/ui/importErrors.js');

function err(name, message, details) {
  const e = new Error(message);
  e.name = name;
  if (details) e.details = details;
  return e;
}

describe('classifyFileForCreate', () => {
  test.each([
    [{ name: 'IMG_2041.JPG', type: 'image/jpeg' }, 'image'],
    [{ name: 'logo.png', type: '' }, 'image'],
    [{ name: 'photo.webp', type: 'image/webp' }, 'image'],
    [{ name: 'chart.pdf', type: 'application/pdf' }, 'pattern'],
    [{ name: 'chart.oxs', type: '' }, 'pattern'],
    [{ name: 'chart.xml', type: 'text/xml' }, 'pattern'],
    [{ name: 'project.json', type: 'application/json' }, 'pattern'],
    [{ name: 'pattern.xsd', type: '' }, 'unsupported'],
    [{ name: 'PATTERN.PAT', type: '' }, 'unsupported'],
    [{ name: 'design.xsp', type: 'application/octet-stream' }, 'unsupported'],
    [{ name: 'design.saga', type: '' }, 'unsupported'],
    [{ name: 'notes.txt', type: 'text/plain' }, 'unsupported'],
    [{ name: 'noextension', type: '' }, 'unsupported'],
  ])('%o is %s', (file, expected) => {
    expect(IE.classifyFileForCreate(file)).toBe(expected);
  });

  test('an unsupported extension wins over an image MIME type', () => {
    expect(IE.classifyFileForCreate({ name: 'x.pat', type: 'image/x-pict' })).toBe('unsupported');
  });

  test('no file is unsupported', () => {
    expect(IE.classifyFileForCreate(null)).toBe('unsupported');
  });
});

describe('describeImportError', () => {
  test('design-software formats name the program and the way out', () => {
    expect(IE.describeImportError(err('ImportUnsupportedError', 'x'), 'pattern.xsd').message)
      .toBe('Files from Pattern Maker (.xsd) can’t be opened here yet. In Pattern Maker, export the chart as OXS or PDF and import that file.');
    expect(IE.describeImportError(err('ImportParseError', 'x'), 'a.pat').message).toMatch(/^Files from PCStitch \(\.pat\)/);
    expect(IE.describeImportError(err('ImportParseError', 'x'), 'a.xsp').message).toMatch(/^Files from XStitch Pro \(\.xsp\)/);
    expect(IE.describeImportError(err('ImportParseError', 'x'), 'a.saga').message).toMatch(/^Files from other cross-stitch programs \(\.saga\)/);
  });

  test('a PDF that fails to parse', () => {
    const d = IE.describeImportError(err('ImportParseError', 'Failed to parse PDF: Invalid PDF structure.'), 'broken.pdf');
    expect(d.message).toBe('This PDF couldn’t be read. It may be damaged or password-protected.');
    expect(d.copyDetails).toBe(false);
    expect(d.technical).toBe('Failed to parse PDF: Invalid PDF structure.');
  });

  test('a JSON file that is not a pattern', () => {
    const d = IE.describeImportError(err('ImportParseError', "Invalid pattern file: 'pattern' field missing or not an array", { strategy: 'json' }), 'not-a-pattern.json');
    expect(d.message).toBe('This .json file isn’t a stitchx pattern or backup.');
  });

  test('an OXS file with no stitches', () => {
    const d = IE.describeImportError(err('ImportValidateError', 'No stitches were detected.', { code: 'EMPTY_GRID' }), 'empty.oxs');
    expect(d.message).toBe('This .oxs file didn’t contain any stitches we could read.');
  });

  test('anything else gets the generic message and Copy details', () => {
    const d = IE.describeImportError(err('ImportParseError', 'Could not find chart element'), 'odd.oxs');
    expect(d.message).toBe('Something went wrong importing this file.');
    expect(d.copyDetails).toBe(true);
    expect(d.technical).toBe('Could not find chart element');
  });

  test('no message leaks code or file names from the code', () => {
    const cases = [['broken.pdf', 'ImportParseError'], ['x.json', 'ImportParseError'], ['p.xsd', 'ImportUnsupportedError'], ['z.oxs', 'TypeError']];
    for (const [file, name] of cases) {
      const d = IE.describeImportError(err(name, 'at foo (bundle.js:12)'), file);
      expect(d.message).not.toMatch(/\.js\b|Error|undefined/);
    }
  });
});

describe('showImportError', () => {
  beforeEach(() => {
    global.window = global.window || global;
    window.Toast = { show: jest.fn() };
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { console.error.mockRestore(); delete window.Toast; });

  test('every toast offers "What can I import?"; unknown errors add Copy details', () => {
    IE.showImportError(err('ImportParseError', 'x'), 'broken.pdf');
    let opts = window.Toast.show.mock.calls[0][0];
    expect(opts.type).toBe('error');
    expect(opts.actions.map(a => a.label)).toEqual(['What can I import?']);

    IE.showImportError(err('ImportParseError', 'Could not find chart element'), 'odd.oxs');
    opts = window.Toast.show.mock.calls[1][0];
    expect(opts.actions.map(a => a.label)).toEqual(['What can I import?', 'Copy details']);
    expect(opts.actions[1].keepOpen).toBe(true);
  });

  test('the technical message goes to the console', () => {
    IE.showImportError(err('ImportParseError', 'Failed to parse PDF: Invalid PDF structure.'), 'broken.pdf');
    expect(console.error.mock.calls[0][0]).toMatch(/Invalid PDF structure/);
  });
});

describe('wiring', () => {
  test('the module is in the import bundle and loaded on every import page', () => {
    expect(loadSource('build-import-bundle.js')).toMatch(/'ui\/importErrors\.js'/);
    expect(loadSource('import-engine/bundle.js')).toMatch(/classifyFileForCreate/);
    for (const page of ['home.html', 'create.html', 'index.html', 'stitch.html']) {
      expect(loadSource(page)).toMatch(/lazy-shim\.js"><\/script>\n<script src="import-engine\/ui\/importErrors\.js"><\/script>/);
    }
    expect(loadSource('sw.js')).toMatch(/'\.\/import-engine\/ui\/importErrors\.js'/);
  });

  test('Home and the Creator reject unsupported files before the image path', () => {
    const home = loadSource('home-app.js');
    expect(home.indexOf("classifyFileForCreate(file) === 'unsupported'")).toBeGreaterThan(-1);
    expect(home.indexOf("classifyFileForCreate(file) === 'unsupported'")).toBeLessThan(home.indexOf('var reader = new FileReader();'));
    const main = loadSource('creator-main.js');
    expect((main.match(/rejectUnsupportedFile\((f|df)\)/g) || []).length).toBe(3);
  });

  test('the engine no longer shows raw "Import failed:" messages', () => {
    expect(loadSource('import-engine/wireApp.js')).not.toMatch(/'Import failed: ' \+/);
  });

  test('the help drawer can open the "What can I import?" article', () => {
    const help = loadSource('help-drawer.js');
    expect(help).toMatch(/heading: "What can I import\?"/);
    expect(help).toMatch(/topic\.sections\.findIndex\(function \(sec\) \{ return sec\.heading === state\.section; \}\)/);
  });
});
