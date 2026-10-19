// UX-032: the fabric count is edited in the Creator's one Fabric block (Convert, Canvas, Edit > Project);
// Materials shows it read-only with an Edit link, and the Convert card no longer shrinks and clips it.

const fs = require('fs');
const path = require('path');

function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

function loadFabricBlock() {
  const win = { fabricShortLabel: ct => ct + 'ct' + (ct >= 25 ? ' over 2' : '') };
  const h = (type, props, ...kids) => ({ type, props: props || {}, kids });
  // eslint-disable-next-line no-new-func
  new Function('window', 'React', read('creator/FabricBlock.js'))(win, { createElement: h });
  return win;
}

describe('read-only fabric summary', () => {
  const win = loadFabricBlock();

  test('shows the count as text, not a select, with an Edit button', () => {
    const el = win.CreatorFabricSummary({ fabricCt: 28, app: {} });
    const flat = JSON.stringify(el);
    expect(flat).toContain('28ct over 2');
    expect(flat).not.toContain('"type":"select"');
    const edit = el.kids.find(k => k && k.type === 'button');
    expect(edit.props.className).toBe('fabric-summary__edit');
    expect(edit.props['aria-label']).toBe('Edit fabric count in Edit, Project');
    expect(edit.kids).toEqual(['Edit']);
  });

  test('the Edit button opens Edit > Project, where the count is edited', () => {
    const calls = [];
    const app = {
      setTab: v => calls.push(['tab', v]), setAppMode: v => calls.push(['mode', v]),
      setSidebarTab: v => calls.push(['sidebarTab', v]), setSidebarOpen: v => calls.push(['sidebar', v]),
      setPanelOpen: v => calls.push(['panel', v]),
    };
    const el = win.CreatorFabricSummary({ fabricCt: 14, app });
    el.kids.find(k => k && k.type === 'button').props.onClick();
    expect(calls).toEqual([['tab', 'pattern'], ['mode', 'edit'], ['sidebarTab', 'project'], ['sidebar', true], ['panel', true]]);
  });

  test('does nothing without an app context', () => {
    expect(() => win.creatorOpenFabricSettings(null)).not.toThrow();
  });
});

describe('where the count is editable', () => {
  const sidebar = read('creator/Sidebar.js');

  test('Convert, Canvas and Edit > Project all render the one Fabric block', () => {
    expect((sidebar.match(/fabricBlock\(\)/g) || []).length).toBe(4); // definition + three call sites
    expect(sidebar).toMatch(/function fabricBlock\(\) \{\s*return h\(window\.CreatorFabricBlock, \{\s*fabricCt: ctx\.fabricCt, setFabricCt: ctx\.setFabricCt,/);
  });

  test('Materials only reads it', () => {
    const review = read('creator/ReadyReview.js');
    const legend = read('creator/LegendTab.js');
    expect(review).toContain('h(window.CreatorFabricSummary, { fabricCt: ctx.fabricCt, app: app })');
    expect(legend).toContain('h(window.CreatorFabricSummary, { fabricCt: ctx.fabricCt, app: app })');
    expect(review).not.toMatch(/ctx\.setFabricCt/);
    expect(legend).not.toMatch(/ctx\.setFabricCt/);
  });

  test('only FabricBlock, the shared setter and the new-design sheet set the count', () => {
    const files = fs.readdirSync(path.join(__dirname, '..', 'creator'))
      .filter(f => f.endsWith('.js') && !/bundle/.test(f));
    const setters = files.filter(f => /setFabricCt\(Number\(/.test(read('creator/' + f)));
    expect(setters).toEqual(['FabricBlock.js']);
  });
});

describe('Section card', () => {
  test('does not shrink inside the Convert panel\'s scrolling column (UX-032)', () => {
    const src = read('components.js');
    const section = src.slice(src.indexOf('function Section('), src.indexOf('var SliderRow'));
    expect(section).toMatch(/overflow:"hidden",flexShrink:0\}/);
  });
});
