// Audit B-03: home.html loaded the import engine but not import-formats.js,
// so every .oxs import from Home failed with "parseOXS not loaded". Any page
// that can run the import engine must get the parsers, either from its own
// <script> tag or from the lazy shim fetching them.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const shim = fs.readFileSync(path.join(ROOT, 'import-engine', 'lazy-shim.js'), 'utf8');
const shimLoadsFormats = /['"]import-formats\.js['"]/.test(shim) && /window\.parseOXS/.test(shim);

const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const enginePages = pages.filter((f) =>
  /<script[^>]+src=["'](\.\/)?import-engine\/lazy-shim\.js["']/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));

describe('pages that run the import engine have the import parsers', () => {
  test('at least the known import pages are covered', () => {
    expect(enginePages).toEqual(expect.arrayContaining(['home.html', 'create.html']));
  });

  test.each(enginePages)('%s includes import-formats.js or the shim loads it', (page) => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const pageLoadsFormats = /<script[^>]+src=["'](\.\/)?import-formats\.js["']/.test(html);
    expect(pageLoadsFormats || shimLoadsFormats).toBe(true);
  });

  test('import-formats.js stays in the service-worker precache', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    expect(sw).toMatch(/['"]\.?\/?import-formats\.js['"]/);
  });
});
