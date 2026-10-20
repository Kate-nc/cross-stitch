const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawnSync } = require('child_process');
const { promisify } = require('util');
const { BUNDLES, checkBundle } = require('../scripts/check-generated-bundles');

const ROOT = path.join(__dirname, '..');
const run = promisify(execFile);
let fixture;

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-check-fixture-'));
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(fixture, { recursive: true, force: true });
});

function copyBundle(bundle) {
  fs.copyFileSync(path.join(ROOT, bundle.script), path.join(fixture, bundle.script));
  fs.cpSync(path.join(ROOT, bundle.directory), path.join(fixture, bundle.directory), { recursive: true });
}

function snapshot(bundle) {
  return bundle.outputs.map(file => {
    const target = path.join(fixture, file);
    return { target, bytes: fs.readFileSync(target), stat: fs.statSync(target) };
  });
}

function expectUntouched(before) {
  for (const { target, bytes, stat } of before) {
    expect(fs.readFileSync(target).equals(bytes)).toBe(true);
    expect(fs.statSync(target).mtimeMs).toBe(stat.mtimeMs);
    expect(fs.statSync(target).ino).toBe(stat.ino);
  }
}

// This assertion runs inside the generator, after it has written its outputs,
// so a checker that restores the checkout in finally cannot pass it.
function assertUntouchedDuringBuild(bundle, before, fail = false) {
  fs.appendFileSync(path.join(fixture, bundle.script), '\n' + before.map(({ target, bytes }) =>
    `require('assert').deepStrictEqual(fs.readFileSync(${JSON.stringify(target)}), Buffer.from('${bytes.toString('base64')}', 'base64'));`
  ).join('\n') + (fail ? '\nthrow new Error("injected generator failure");\n' : '\n'));
}

function recordDestinations() {
  const makeTemp = fs.mkdtempSync;
  const destinations = [];
  jest.spyOn(fs, 'mkdtempSync').mockImplementation(prefix => {
    const dest = makeTemp(prefix);
    destinations.push(dest);
    return dest;
  });
  return destinations;
}

for (const bundle of BUNDLES) {
  describe(bundle.script, () => {
    beforeEach(() => copyBundle(bundle));

    test('compares current bytes without writing the checkout, and removes its destination', () => {
      const before = snapshot(bundle);
      assertUntouchedDuringBuild(bundle, before);
      const destinations = recordDestinations();
      expect(checkBundle(bundle, fixture)).toEqual([]);
      expect(destinations).toHaveLength(1);
      expect(fs.existsSync(destinations[0])).toBe(false);
      expectUntouched(before);
    });

    test.each(bundle.outputs)('detects stale %s without repairing it, during or after the build', file => {
      fs.appendFileSync(path.join(fixture, file), '\n// stale fixture\n');
      const before = snapshot(bundle);
      assertUntouchedDuringBuild(bundle, before);
      expect(checkBundle(bundle, fixture)).toEqual([file]);
      expectUntouched(before);
    });

    test('detects a missing generated output without creating it', () => {
      const file = bundle.outputs[0];
      fs.unlinkSync(path.join(fixture, file));
      expect(checkBundle(bundle, fixture)).toEqual([file]);
      expect(fs.existsSync(path.join(fixture, file))).toBe(false);
    });

    test('surfaces failure after generation, cleans up and leaves checkout bytes untouched', () => {
      const before = snapshot(bundle);
      assertUntouchedDuringBuild(bundle, before, true);
      const destinations = recordDestinations();
      expect(() => checkBundle(bundle, fixture)).toThrow('injected generator failure');
      expect(destinations).toHaveLength(1);
      expect(fs.existsSync(destinations[0])).toBe(false);
      expectUntouched(before);
    });

    test('cleans up on input-copy failure without removing the source or its neighbours', () => {
      fs.rmSync(path.join(fixture, bundle.directory), { recursive: true });
      const sentinel = path.join(fixture, 'keep.txt');
      fs.writeFileSync(sentinel, 'keep');
      const destinations = recordDestinations();
      expect(() => checkBundle(bundle, fixture)).toThrow();
      expect(destinations).toHaveLength(1);
      expect(fs.existsSync(destinations[0])).toBe(false);
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('keep');
      expect(fs.existsSync(path.join(fixture, bundle.script))).toBe(true);
    });

    test('repeated checks own independent destinations and preserve output metadata', () => {
      const before = snapshot(bundle);
      const destinations = recordDestinations();
      expect(checkBundle(bundle, fixture)).toEqual([]);
      expect(checkBundle(bundle, fixture)).toEqual([]);
      expect(new Set(destinations).size).toBe(2);
      expect(destinations.every(dest => !fs.existsSync(dest))).toBe(true);
      expectUntouched(before);
    });

    test('never writes through a generated-output symlink or deletes its target', () => {
      const file = path.join(fixture, bundle.outputs[0]);
      const sentinel = path.join(fixture, 'outside-output.js');
      fs.writeFileSync(sentinel, 'untouched symlink target');
      fs.unlinkSync(file);
      fs.symlinkSync(sentinel, file);
      expect(checkBundle(bundle, fixture)).toEqual([bundle.outputs[0]]);
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('untouched symlink target');
      expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
    });

    test('keeps a symlinked source directory and its outputs untouched', () => {
      const directory = path.join(fixture, bundle.directory);
      const source = path.join(fixture, 'linked-sources');
      fs.renameSync(directory, source);
      fs.symlinkSync(source, directory, 'dir');
      const before = snapshot(bundle);
      expect(checkBundle(bundle, fixture)).toEqual([]);
      expectUntouched(before);
      expect(fs.lstatSync(directory).isSymbolicLink()).toBe(true);
    });
  });
}

test('a real Creator input-read failure surfaces without touching outputs or leaking a destination', () => {
  const bundle = BUNDLES[0];
  copyBundle(bundle);
  fs.unlinkSync(path.join(fixture, 'creator/pdfExport.js'));
  const before = snapshot(bundle);
  const destinations = recordDestinations();
  expect(() => checkBundle(bundle, fixture)).toThrow('pdfExport.js');
  expect(destinations.every(dest => !fs.existsSync(dest))).toBe(true);
  expectUntouched(before);
});

test('the CI command runs in parallel from independent destinations without touching checkout outputs', async () => {
  fs.mkdirSync(path.join(fixture, 'scripts'));
  const checker = path.join(fixture, 'scripts/check-generated-bundles.js');
  fs.copyFileSync(path.join(ROOT, 'scripts/check-generated-bundles.js'), checker);
  BUNDLES.forEach(copyBundle);
  const log = path.join(fixture, 'destinations.jsonl');
  const before = BUNDLES.flatMap(bundle => bundle.outputs).map(file => {
    const target = path.join(fixture, file);
    return { target, bytes: fs.readFileSync(target), stat: fs.statSync(target) };
  });
  for (const bundle of BUNDLES) {
    assertUntouchedDuringBuild(bundle, before);
    fs.appendFileSync(path.join(fixture, bundle.script),
      `\nfs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(__dirname) + '\\n');\n`);
  }
  const results = await Promise.all([run(process.execPath, [checker]), run(process.execPath, [checker])]);
  for (const result of results) {
    expect(result.stdout).toBe('Generated bundles are up to date\n');
    expect(result.stderr).toBe('');
  }
  const destinations = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  expect(new Set(destinations).size).toBe(4);
  expect(destinations.every(dest => !fs.existsSync(dest))).toBe(true);
  expectUntouched(before);
}, 15000);

test('the CI command reports stale files and generator failures with a nonzero exit', () => {
  fs.mkdirSync(path.join(fixture, 'scripts'));
  fs.copyFileSync(path.join(ROOT, 'scripts/check-generated-bundles.js'), path.join(fixture, 'scripts/check-generated-bundles.js'));
  BUNDLES.forEach(copyBundle);
  const file = BUNDLES[0].outputs[1];
  fs.appendFileSync(path.join(fixture, file), '\n// stale\n');
  const check = () => spawnSync(process.execPath, ['scripts/check-generated-bundles.js'], { cwd: fixture, encoding: 'utf8' });
  const stale = check();
  expect(stale.status).toBe(1);
  expect(stale.stderr).toContain(file + ' is stale');
  expect(stale.stderr).toContain('Run: node ' + BUNDLES[0].script);
  fs.appendFileSync(path.join(fixture, BUNDLES[1].script), '\nthrow new Error("CI generator failure");\n');
  const failure = check();
  expect(failure.status).toBe(1);
  expect(failure.stderr).toContain('CI generator failure');
});
