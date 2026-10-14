// The Stats page is a bento grid: tiles that wrap to fill the width, and each figure lives in one place.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const STATS_PAGE = read('stats-page.js');
const COMPONENTS = read('components-stats.js');
const ACTIVITY = read('stats-activity.js');
const INSIGHTS = read('stats-insights.js');
const CSS = read('styles.css');
const HELP = read('help-drawer.js');

describe('bento layout classes', () => {
  test.each(['.bento {', '.bento-cell {', '.bento-cell--sm', '.bento-cell--md', '.bento-cell--lg', '.bento-cell--xl', '.bento-cell--full', '.bento-cell--stack'])(
    'styles.css defines %s', sel => { expect(CSS).toContain(sel); });

  test('the stats containers use the full width rather than a 700px column', () => {
    expect(CSS).toMatch(/\.stats-container \{\s*max-width: 1280px/);
    expect(CSS).toMatch(/\.stats-dashboard \{\s*max-width: 1280px/);
  });

  test('a phone gets a single column', () => {
    expect(CSS).toMatch(/@media \(max-width: 640px\) \{\s*\.bento-cell,[\s\S]*?flex-basis: 100%/);
  });

  test.each([['components-stats.js', COMPONENTS], ['stats-activity.js', ACTIVITY], ['stats-insights.js', INSIGHTS]])(
    '%s lays its tiles out with .bento / .bento-cell', (_n, src) => {
      expect(src).toMatch(/className: ?['"]bento['"]/);
      expect(src).toMatch(/bento-cell bento-cell--/);
    });
});

describe('merged duplicates: each figure lives in one place', () => {
  test('the Stash tab no longer repeats lifetime stitches, active projects, the weekly streak or the recent pace', () => {
    ['stats-lifetimeStitches', 'stats-activeProjects', 'stats-streak', 'stats-pace'].forEach(id => {
      expect(STATS_PAGE).not.toContain("'" + id + "'");
    });
    ['lifetimeStitches', 'activeProjects', 'streak', 'pace'].forEach(k => {
      expect(STATS_PAGE).not.toMatch(new RegExp("^\\s+" + k + ": '", 'm'));
    });
  });

  test('the Insights tab no longer opens with a weekly summary', () => {
    expect(INSIGHTS).not.toContain('WeeklySummaryCard');
  });

  test('the Stitching tab carries the recent pace and the weekly summary instead', () => {
    expect(COMPONENTS).toContain("label: 'Recent pace'");
    expect(COMPONENTS).toContain('generateWeeklySummary');
    expect(COMPONENTS).toContain('gsd-week-summary');
  });

  test('Showcase stays on the all-projects page only', () => {
    expect(COMPONENTS).not.toMatch(/showcase/i);
    expect(STATS_PAGE).toContain("tab === 'showcase'");
  });
});

describe('project Stats: Overview and Visuals views', () => {
  test('the picture-based stats are on their own Visuals view, not folded into accordions', () => {
    expect(COMPONENTS).toContain('"Visuals"');
    expect(COMPONENTS).toContain("cs_stats_view");
    ['sections', 'comparison'].forEach(id => {
      expect(COMPONENTS).not.toContain('StatsAccordion, {id:"' + id + '"');
    });
    ['SectionGrid', 'ComparisonView', 'ColourProgress'].forEach(c => {
      expect(COMPONENTS).toContain('React.createElement(' + c + ',');
    });
  });
  test('colour progress and the colour timeline are one Colours panel', () => {
    expect(COMPONENTS).not.toContain('function ColourTimeline');
    expect(COMPONENTS).toContain('"Colours"');
    expect(COMPONENTS).toContain('Most remaining');
    expect(COMPONENTS).toContain('Longest untouched');
    expect(CSS).not.toContain('.colour-tl-');
  });
  test('the view switch is styled', () => {
    expect(CSS).toContain('.stats-viewtabs');
    expect(CSS).toContain('.stats-viewtab--on');
  });
});

describe('help', () => {
  test('the in-app help describes the new layout and where each figure lives', () => {
    expect(HELP).toContain('tiles that wrap to fit');
    expect(HELP).toContain('Each figure appears in one place only');
    expect(HELP).toContain('Visuals button');
  });
});
