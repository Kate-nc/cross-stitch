/**
 * Stash Manager Overview (docs/stash-redesign/hub-and-stock-take-plan.md,
 * Phase 2): the Manager's home page. Source-level guards; the behaviour is
 * covered end to end in tests/e2e/stash-overview.spec.js.
 */
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const manager = read('manager-app.js');
const overview = manager.slice(manager.indexOf('{tab === "overview" && ('), manager.indexOf('{tab === "inventory" && ('));

describe('routing', () => {
  const init = manager.slice(manager.indexOf('const [tab, setTab] = useState(() => {'), manager.indexOf("}); // 'overview' | 'inventory'"));

  test('the Manager opens on the Overview when no tab is asked for', () => {
    expect(init).toMatch(/return "overview";\s*$/);
  });

  test('existing deep links keep their meaning', () => {
    expect(init).toMatch(/if \(p === 'inventory' \|\| p === 'patterns'\) return p;/);
    expect(init).toMatch(/if \(p === 'shopping' \|\| p === 'materials'\) return 'shopping';/);
    expect(init).toMatch(/if \(p === 'overview'\) return 'overview';/);
  });

  test("the Pattern Creator's thread-stash links still open the thread list", () => {
    for (const f of ['creator/LegendTab.js', 'creator/PrepareTab.js']) {
      expect(read(f)).toMatch(/manager\.html\?tab=inventory/);
      expect(read(f)).not.toMatch(/href:\s*["']manager\.html["']/);
    }
  });

  test('the Overview tab comes first and is a walkthrough target', () => {
    const tabs = manager.slice(manager.indexOf('<div className="mgr-tabs">'), manager.indexOf('className="mgr-showcase"'));
    expect(tabs.indexOf('mgr-overview-tab')).toBeGreaterThan(-1);
    expect(tabs.indexOf('mgr-overview-tab')).toBeLessThan(tabs.indexOf('mgr-stash-tab'));
    expect(read('onboarding-wizard.js')).toMatch(/data-onboard=\\"mgr-overview-tab\\"/);
  });
});

describe('tiles', () => {
  test('each tile opens the matching view', () => {
    expect(overview).toMatch(/className="stash-tile" onClick=\{\(\) => goToThreads\("owned"\)\}/);
    expect(overview).toMatch(/className="stash-tile" onClick=\{\(\) => goToThreads\("opened"\)\}/);
    expect(overview).toMatch(/onClick=\{\(\) => goToThreads\("low"\)\}>/);
    expect(overview).toMatch(/onClick=\{\(\) => \{ setTab\("shopping"\); setSearchQuery\(""\); \}\}>\s*<span className="stash-tile-k">To buy/);
  });

  test('counts come from the shared stash rules', () => {
    expect(overview).toMatch(/\{stashCounts\.owned\}/);
    expect(overview).toMatch(/formatSkeins\(stashCounts\.fullSkeins\)/);
    expect(overview).toMatch(/\{shoppingSkeins\}/);
    expect(overview).toMatch(/\{stashCounts\.low\}/);
    const counts = manager.slice(manager.indexOf('const stashCounts = useMemo('), manager.indexOf('// Which active patterns use each thread'));
    expect(counts).toMatch(/if \(isInStash\(t\)\) \{/);
    expect(counts).toMatch(/c\.fullSkeins \+= Number\(t\.owned\) \|\| 0;/);
  });
});

describe('lists', () => {
  test('Buy next shares the Shopping list rows and Bought ticks', () => {
    expect(overview).toMatch(/toBuy\.shopping\.slice\(0, OVERVIEW_BUY_ROWS\)\.map\(renderShopRow\)/);
    expect(overview).toMatch(/\{addTickedButton\}/);
    expect(manager).toMatch(/\{toBuy\.shopping\.map\(renderShopRow\)\}/);
  });

  test('each list is capped and links to its full view', () => {
    expect(manager).toMatch(/const OVERVIEW_BUY_ROWS = 8;/);
    expect(manager).toMatch(/const OVERVIEW_READY_ROWS = 5;/);
    expect(manager).toMatch(/const OVERVIEW_LOW_ROWS = 5;/);
    expect(overview).toMatch(/"See all " \+ shoppingCount \+ " threads"/);
    expect(overview).toMatch(/"See all " \+ lowStockAlerts\.length \+ " running low"/);
  });

  test('Ready to start opens the pattern; Needs attention opens the thread', () => {
    expect(overview).toMatch(/onClick=\{\(\) => openPattern\(r\.id\)\}/);
    expect(overview).toMatch(/onClick=\{\(\) => openThread\(c\.key\)\}/);
    expect(overview).toMatch(/onClick=\{\(\) => openThread\(a\.id\)\}/);
  });

  test('an empty stash gets a way in instead of zeros alone', () => {
    expect(overview).toMatch(/stashCounts\.owned === 0 && \(/);
    expect(overview).toMatch(/Find a thread to add/);
  });
});
