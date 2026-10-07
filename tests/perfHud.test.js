const { loadSource } = require('./_helpers/loadSource');

const source = loadSource('perf-hud.js');

describe('performance HUD', () => {
  test('prunes rolling samples while the panel is collapsed', () => {
    const render = source.slice(source.indexOf('function render()'), source.indexOf('function copy(btn)'));
    expect(render.indexOf('var s = summary();')).toBeGreaterThanOrEqual(0);
    expect(render.indexOf('var s = summary();')).toBeLessThan(render.indexOf('if (collapsed) return;'));
  });

  test('clipboard fallbacks prompt users to copy manually', () => {
    expect(source.match(/fallback\(text\);\s*done\('Copy manually'\)/g)).toHaveLength(2);
  });
});
