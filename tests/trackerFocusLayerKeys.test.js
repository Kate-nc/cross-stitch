/** @jest-environment jsdom */
// UX-004 (F key): F used to blank the chart (it toggled the full-stitch layer) while a second, raw window listener also
// toggled focus mode. Now the bare F belongs to focus mode alone, the layer toggles are Shift+F/H/K/L, and a hidden layer is
// signposted by a chip in the progress strip and the focus bar.
const fs = require('fs');
const path = require('path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server.node');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

global.React = React;
window.React = React;
eval(read('icons.js'));
eval(read('shortcuts.js'));
const chipCore = require('../tracker-layer-chip.js');
const Chip = window.TrackerHiddenLayersChip;

const trackerSrc = read('tracker-app.js');

// The registered tracker shortcuts, parsed from the source: [{ id, keys[], scope }].
function registry() {
  const re = /\{\s*id:\s*"(tracker\.[^"]+)",\s*keys:\s*(\[[^\]]*\]|"[^"]*"),\s*scope:\s*"([^"]+)"/g;
  const out = [];
  let m;
  while ((m = re.exec(trackerSrc))) {
    const keys = m[2].charAt(0) === '[' ? m[2].slice(1, -1).split(',').map(k => k.trim().slice(1, -1)) : [m[2].slice(1, -1)];
    out.push({ id: m[1], keys: keys, scope: m[3] });
  }
  return out;
}

// useEffect blocks that both add a keydown listener and call setFocusMode.
function offendingEffects(src) {
  return src.split(/(?=\buseEffect\()/).filter(chunk => {
    const body = chunk.slice(0, chunk.search(/\n\},\[[^\]]*\]\);/) + 1 || 2000);
    return /addEventListener\(\s*["']keydown["']/.test(body) && /setFocusMode/.test(body);
  });
}

describe('one owner for F', () => {
  const reg = registry();

  test('the bare F is registered once, for focus mode', () => {
    const owners = reg.filter(r => r.keys.some(k => k.toLowerCase() === 'f'));
    expect(owners.map(r => r.id)).toEqual(['tracker.focusMode']);
  });

  test('no raw window keydown listener toggles focus mode any more', () => {
    // A useEffect that adds a keydown listener and calls setFocusMode would be a second owner of the key.
    expect(offendingEffects(trackerSrc)).toEqual([]);
    // The check must be able to fail: the pre-fix listener is caught.
    expect(offendingEffects('useEffect(()=>{\n  const onKey=e=>{ if(e.key==="f"){setFocusMode(v=>!v);} };\n  window.addEventListener("keydown",onKey);\n  return()=>window.removeEventListener("keydown",onKey);\n},[focusMode]);\n').length).toBe(1);
    expect(trackerSrc).not.toMatch(/e\.key===["']f["']\s*\|\|\s*e\.key===["']F["']/);
  });

  test('layer toggles are Shift+letter; Shift+A stays; none collides with the other Shift bindings', () => {
    const byId = Object.fromEntries(reg.map(r => [r.id, r]));
    expect(byId['tracker.layer.full'].keys).toEqual(['shift+f']);
    expect(byId['tracker.layer.half'].keys).toEqual(['shift+h']);
    expect(byId['tracker.layer.knot'].keys).toEqual(['shift+k']);
    expect(byId['tracker.layer.bs'].keys).toEqual(['shift+l']);
    expect(byId['tracker.layer.all'].keys).toEqual(['shift+a']);
    const shifted = [];
    reg.forEach(r => r.keys.forEach(k => { if (/(^|\+)shift\+/.test(k) && !/mod\+/.test(k)) shifted.push(k); }));
    expect(new Set(shifted).size).toBe(shifted.length);   // every Shift binding is unique (Shift+G is the chart, etc.)
    expect(shifted).toEqual(expect.arrayContaining(['shift+g', 'shift+a', 'shift+f']));
    // The bare layer keys are free for nothing else to claim by accident.
    ['h', 'k', 'l'].forEach(k => expect(reg.filter(r => r.keys.includes(k)).map(r => r.id)).toEqual([]));
  });

  test('Esc leaves focus mode through the single Esc cascade', () => {
    const esc = trackerSrc.slice(trackerSrc.indexOf('id: "tracker.esc"'), trackerSrc.indexOf('id: "tracker.undo"'));
    expect(esc).toMatch(/if\(focusMode\)\{setFocusMode\(false\);return;\}/);
  });

  // Drive the real dispatcher with entries built from the parsed registry, each running a spy.
  describe('through the dispatcher', () => {
    const calls = [];
    const ev = (key, opts) => {
      opts = opts || {};
      const e = { type: 'keydown', key, ctrlKey: false, metaKey: false, shiftKey: !!opts.shift, altKey: false,
        defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
      window.Shortcuts._dispatch(e);
    };
    beforeEach(() => {
      calls.length = 0;
      window.Shortcuts._reset();
      window.Shortcuts.pushScope('tracker');
      window.Shortcuts.pushScope('tracker.notedit');
      window.Shortcuts.register(reg
        .filter(r => /^tracker\.(focusMode|layer\.|focus\.toggle)/.test(r.id))
        .map(r => ({ id: r.id, keys: r.keys, scope: r.scope, run: () => calls.push(r.id) })));
    });
    test('F does exactly one thing', () => {
      ev('f');
      expect(calls).toEqual(['tracker.focusMode']);
    });
    test('Shift+F is the full-stitch layer and not focus mode', () => {
      ev('F', { shift: true });
      expect(calls).toEqual(['tracker.layer.full']);
    });
    test('each layer key does only its own layer', () => {
      ev('H', { shift: true }); ev('K', { shift: true }); ev('L', { shift: true }); ev('A', { shift: true });
      expect(calls).toEqual(['tracker.layer.half', 'tracker.layer.knot', 'tracker.layer.bs', 'tracker.layer.all']);
    });
    test('F and Shift+letter leave a focused <select> to its type-ahead', () => {
      expect(trackerSrc).toContain('const notInSelect=e=>!(e&&e.target&&e.target.tagName==="SELECT");');
      ['tracker.focusMode', 'tracker.layer.full', 'tracker.layer.half', 'tracker.layer.knot', 'tracker.layer.bs'].forEach(id => {
        const at = trackerSrc.indexOf('id: "' + id + '"');
        expect(trackerSrc.slice(at, at + 260)).toContain('when: notInSelect');
      });
    });
    test('the old bare layer keys do nothing', () => {
      ev('h'); ev('k'); ev('l');
      expect(calls).toEqual([]);
    });
  });
});

describe('the hidden-layers chip', () => {
  const ALL = { full: true, half: true, backstitch: true, quarter: true, petite: true, french_knot: true, long_stitch: true };
  const counts = { full: 900, half: 12, backstitch: 40, quarter: 0, petite: 0, french_knot: 3, long_stitch: 0 };
  const html = (vis, c) => renderToStaticMarkup(React.createElement(Chip, { layerVis: vis, counts: c, onShow() {} }));

  test('renders nothing while every layer is visible', () => {
    expect(html(ALL, counts)).toBe('');
  });
  test('hiding the full stitches renders a chip with an accessible name', () => {
    const out = html(Object.assign({}, ALL, { full: false }), counts);
    expect(out).toContain('Full stitches hidden');
    expect(out).toContain('Show');
    expect(out).toContain('aria-label="Full stitches hidden. Show hidden layers"');
    expect(out).toContain('<button type="button"');
  });
  test('names two layers, counts three or more', () => {
    expect(html(Object.assign({}, ALL, { full: false, french_knot: false }), counts)).toContain('Full stitches and French knots hidden');
    expect(html(Object.assign({}, ALL, { full: false, half: false }), counts)).toContain('Full stitches and half stitches hidden');
    expect(html(Object.assign({}, ALL, { full: false, half: false, backstitch: false }), counts)).toContain('3 layers hidden');
  });
  test('a hidden layer with no stitches in this pattern is not worth a chip', () => {
    expect(html(Object.assign({}, ALL, { quarter: false, petite: false, long_stitch: false }), counts)).toBe('');
    expect(chipCore.hiddenLayers({ quarter: false, full: false }, counts).map(l => l.id)).toEqual(['full']);
  });
  test('one click calls onShow', () => {
    const onShow = jest.fn();
    const el = Chip({ layerVis: Object.assign({}, ALL, { half: false }), counts, onShow });
    el.props.onClick();
    expect(onShow).toHaveBeenCalledTimes(1);
  });
  test('eyeOff exists in the icon library', () => {
    expect(typeof window.Icons.eyeOff).toBe('function');
    expect(renderToStaticMarkup(window.Icons.eyeOff())).toContain('<svg');
  });
});

describe('wiring', () => {
  test('the chip is in the progress strip and in the focus bar, and Show restores every layer', () => {
    // The strip's chip lives in tracker-progress-strip.js (extracted from TrackerApp); the focus bar's stays in tracker-app.js.
    const stripSrc = read('tracker-progress-strip.js');
    expect(trackerSrc).toContain('React.createElement(window.TrackerProgressStrip,{progress:progShown,prevBarPct,todayBarPct,bsCounts,layerVis,layerCounts,onShowHiddenLayers:showHiddenLayers');
    expect(stripSrc).toMatch(/window\.TrackerHiddenLayersChip && h\(window\.TrackerHiddenLayersChip, \{ layerVis: layerVis, counts: props\.layerCounts, onShow: props\.onShowHiddenLayers \}\)/);
    expect(stripSrc.indexOf('info-strip-row')).toBeLessThan(stripSrc.indexOf('TrackerHiddenLayersChip, {'));
    expect(trackerSrc).toMatch(/const showHiddenLayers=\(\)=>\{setLayerVis\(ALL_LAYERS_VISIBLE\);/);
    expect(trackerSrc).toMatch(/focusMode&&window\.TrackerHiddenLayersChip&&React\.createElement\(window\.TrackerHiddenLayersChip,\{[^}]*tracker-layers-chip--float/);
    expect(trackerSrc.indexOf('className="info-strip-wrap"')).toBeLessThan(trackerSrc.indexOf('window.TrackerProgressStrip'));
  });
  test('stitch.html and index.html load the chip before tracker-app.js, and the service worker precaches it', () => {
    ['stitch.html', 'index.html'].forEach(f => expect(read(f)).toContain('<script src="tracker-layer-chip.js"></script>'));
    expect(read('sw.js')).toContain("'./tracker-layer-chip.js'");
  });
  test('the toolbar tooltip and the help agree: F is focus mode', () => {
    expect(trackerSrc).toContain('"Enter focus mode (F)"');
    const help = read('help-drawer.js');
    expect(help).toMatch(/id: "t\.focusMode", scope: "tracker", keys: \["F"\]/);
    expect(help).toMatch(/id: "t\.full",\s+scope: "tracker", keys: \["Shift\+F"\]/);
  });
});
