// Every page that loads a script which reads progress through progress-units.js loads it first, and the service
// worker precaches it. (Stats and the Tracker load their scripts lazily, so the page load order is what matters.)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

const USERS = ['project-storage.js', 'helpers.js', 'components-stats.js', 'components.js', 'insights-engine.js', 'stash-bridge.js', 'stats-page.js', 'stats-activity.js', 'stats-insights.js'];
const usesUnits = f => { const html = fs.readFileSync(path.join(ROOT, f), 'utf8'); return USERS.some(u => html.includes('src="' + u + '"')); };

// Nothing reads it while the scripts load (every use is inside a function), so presence is what matters, plus
// coming before project-storage.js, which a page may call straight away.
test.each(pages.filter(usesUnits))('%s loads progress-units.js (before project-storage.js where it has it)', page => {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const pu = html.indexOf('src="progress-units.js"');
  expect(pu).toBeGreaterThan(-1);
  const ps = html.indexOf('src="project-storage.js"');
  if (ps > -1) expect(pu).toBeLessThan(ps);
});

test('the service worker precaches progress-units.js', () => {
  expect(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')).toMatch(/'\.\/progress-units\.js'/);
});
