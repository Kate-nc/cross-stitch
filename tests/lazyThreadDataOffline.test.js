const { loadSource } = require('./_helpers/loadSource');

const RUNTIME_LOADERS = loadSource('runtime-loaders.js');
const SW = loadSource('sw.js');

describe('lazy thread data offline contract', () => {
  test('runtime loaders request Anchor and conversion data by local script URL', () => {
    expect(RUNTIME_LOADERS).toContain("window.loadScript('anchor-data.js'");
    expect(RUNTIME_LOADERS).toContain("window.loadScript('thread-conversions.js'");
    expect(RUNTIME_LOADERS).toContain('window.loadThreadData = function (opts)');
  });

  test('lazy thread data files remain install-time precached for offline use', () => {
    expect(SW).toMatch(/['"]\.\/anchor-data\.js['"]/);
    expect(SW).toMatch(/['"]\.\/thread-conversions\.js['"]/);
  });

  test('entry pages no longer eagerly execute thread data at startup', () => {
    ['index.html', 'create.html', 'manager.html', 'stitch.html'].forEach((file) => {
      const html = loadSource(file);
      expect(html).not.toMatch(/<script\b[^>]*src=["']anchor-data\.js["'][^>]*>/i);
      expect(html).not.toMatch(/<script\b[^>]*src=["']thread-conversions\.js["'][^>]*>/i);
      expect(html).toContain('<script src="runtime-loaders.js"');
    });
  });
});