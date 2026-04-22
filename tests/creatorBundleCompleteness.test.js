/* tests/creatorBundleCompleteness.test.js
 * Regression guard for React error #130 ("Element type is invalid: expected a
 * string ... but got: undefined").
 *
 * The Creator main React tree references components via JSX member-expressions
 * like `<window.CreatorPatternTab/>`. If a `creator/<Name>Tab.js` source file
 * exists but is omitted from build-creator-bundle.js's ORDER list (or fails to
 * register its `window.Creator*` global), the rendered tree throws a minified
 * React #130 at runtime — which is hard to diagnose because it has no
 * component name.
 *
 * This test checks three invariants:
 *
 *   1. Every <window.CreatorXxx /> referenced from creator-main.js has a
 *      matching `window.CreatorXxx = …` assignment in creator/bundle.js.
 *   2. Every creator/*.js source file referenced from build-creator-bundle.js's
 *      ORDER constant exists on disk (catches typos / renames / deletions).
 *   3. Every creator/<Name>Tab.js source file is present in the bundle ORDER
 *      list (catches new tabs the maintainer forgot to wire in).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CREATOR_DIR = path.join(ROOT, 'creator');

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

describe('Creator bundle completeness', () => {
  const creatorMain = read('creator-main.js');
  const buildScript = read('build-creator-bundle.js');
  const bundle = read('creator/bundle.js');

  // 1. Every <window.Creator…/> JSX reference must resolve in the bundle.
  test('every <window.Creator*/> JSX usage resolves to a window.* assignment in the bundle', () => {
    const re = /<\s*window\.(Creator[A-Za-z0-9_]+)\b/g;
    const referenced = new Set();
    let m;
    while ((m = re.exec(creatorMain)) !== null) referenced.add(m[1]);

    expect(referenced.size).toBeGreaterThan(0); // sanity

    const missing = [];
    for (const name of referenced) {
      // Look for either window.X = … or self.X = … in the concatenated bundle.
      const reg = new RegExp('\\bwindow\\.' + name + '\\s*=', '');
      if (!reg.test(bundle)) missing.push(name);
    }
    if (missing.length) {
      throw new Error(
        'creator-main.js references these JSX components, but no `window.<Name> =` ' +
        'assignment exists in creator/bundle.js (will cause React error #130 at runtime):\n  - ' +
        missing.join('\n  - ') +
        '\nFix: add the source file to ORDER in build-creator-bundle.js and re-run `node build-creator-bundle.js`.'
      );
    }
  });

  // 2. Every file in ORDER must exist on disk.
  test("every file listed in build-creator-bundle.js's ORDER exists in creator/", () => {
    const orderMatch = buildScript.match(/const\s+ORDER\s*=\s*\[([\s\S]*?)\];/);
    expect(orderMatch).not.toBeNull();
    const filenames = Array.from(orderMatch[1].matchAll(/['"]([^'"\n]+)['"]/g)).map((m) => m[1]);
    expect(filenames.length).toBeGreaterThan(0);
    const missing = filenames.filter((f) => !fs.existsSync(path.join(CREATOR_DIR, f)));
    expect(missing).toEqual([]);
  });

  // 3. Every *Tab.js (and DesignerBrandingSection) source file is wired into the bundle.
  test('every creator/*Tab.js source file is included in the bundle ORDER', () => {
    const orderMatch = buildScript.match(/const\s+ORDER\s*=\s*\[([\s\S]*?)\];/);
    const filenames = new Set(
      Array.from(orderMatch[1].matchAll(/['"]([^'"\n]+)['"]/g)).map((m) => m[1])
    );
    const tabFiles = fs.readdirSync(CREATOR_DIR).filter((f) => /Tab\.js$/.test(f));
    expect(tabFiles.length).toBeGreaterThan(0);
    const missingFromOrder = tabFiles.filter((f) => !filenames.has(f));
    if (missingFromOrder.length) {
      throw new Error(
        'These tab source files exist on disk but are not in build-creator-bundle.js ORDER ' +
        '(rendered tree will throw React #130):\n  - ' + missingFromOrder.join('\n  - ')
      );
    }
  });
});
