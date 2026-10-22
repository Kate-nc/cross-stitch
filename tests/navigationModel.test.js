// Navigation model (UX-015/017/022/028): source-level guards. Behaviour is covered by
// tests/e2e/navigation-polish.spec.js.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const header = read('header.js');
const css = read('styles.css');
const help = read('help-drawer.js');
const stats = read('components-stats.js');
const home = read('home-app.js');

describe('header tabs list tools, not steps', () => {
  const block = header.slice(header.indexOf('const appSections = ['), header.indexOf('];', header.indexOf('const appSections = [')));
  test('Create, Track, Stash, Stats only', () => {
    const ids = [...block.matchAll(/id: '(\w+)'/g)].map(m => m[1]);
    expect(ids).toEqual(['creator', 'tracker', 'manager', 'stats']);
    expect(block).not.toMatch(/label: 'Edit'/);
  });
  test('the Creator tab is current for both Creator pages', () => {
    expect(header).toMatch(/inCreatorTool = page === 'creator' \|\| page === 'editor'/);
  });
  test('the model is documented where the tabs are defined', () => {
    expect(header).toMatch(/header names the TOOL; the sub-tabs inside a tool\s*\/\/ are STEPS/);
  });
});

describe('dark mode tabs', () => {
  test('tab rules out-rank html.pref-dark a, and inactive tabs use --text-secondary', () => {
    expect(css).toMatch(/\.tb-app-nav \.tb-app-tab\{[^}]*color:var\(--text-secondary\)/);
    expect(css).toMatch(/\.tb-app-nav \.tb-app-tab--active::after\{[^}]*bottom:0/);
    expect(css).toMatch(/html\.pref-dark a \{ color: var\(--accent\); \}/); // the rule the tabs must out-rank
  });
});

describe('tablet chip', () => {
  test('one chip below 1200px, separate badge above', () => {
    expect(header).toMatch(/useMatchMedia\('\(min-width: 600px\) and \(max-width: 1199px\)'\)/);
    expect(header).toMatch(/!compactChip && \(propProjectName \|\| projName\)/);
    expect(css).toMatch(/\.tb-proj-switcher--merged/);
  });
  test('no project: a plain "No project" chip without initials', () => {
    expect(header).toMatch(/projectLabel && h\('span', \{ className: 'tb-proj-switcher__avatar'/);
  });
});

describe('Shortcuts opens on the current tool', () => {
  test('uses __csActiveTool / __csPageKind and collapses the other sections', () => {
    expect(help).toMatch(/window\.__csActiveTool \|\| window\.__csPageKind/);
    expect(help).toMatch(/if \(!ctx && tab === "shortcuts"\) ctx = currentTool\(\)/);
    expect(help).toMatch(/h\("details", \{[\s\S]*?open: expanded/);
  });
  test('the unified page reports the tool it is showing', () => {
    expect(read('creator-main.js')).toMatch(/window\.__csActiveTool=mode==='track'\?'tracker'/);
  });
});

describe('copy', () => {
  test('Back to grid is gone', () => {
    expect(stats).not.toMatch(/Back to grid/);
    expect(stats).toMatch(/Back to projects/);
  });
  test('Home shows the Continue card only once a project exists', () => {
    expect(home).toMatch(/loaded && hasProjects && h\(React\.Fragment[\s\S]*current && h\(ContinueCard/);
  });
  test('Home lists Home, Stash and Stats and has no project switcher', () => {
    expect(header).toMatch(/const navSections = page === 'home' \? homeSections : appSections;/);
    expect(header).toMatch(/page !== 'home' && React\.createElement\(HeaderProjectSwitcher/);
  });
});
