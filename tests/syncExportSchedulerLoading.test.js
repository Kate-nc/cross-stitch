const fs = require('fs'), vm = require('vm');
const read = f => fs.readFileSync(f, 'utf8');
const pages = fs.readdirSync('.').filter(f => f.endsWith('.html') && read(f).includes('src="sync-engine.js"'));

test('every page that loads the engine is covered', () => {
  expect(pages.sort()).toEqual(['create.html', 'home.html', 'index.html', 'manager.html', 'stitch.html']);
});

test.each(pages)('%s loads the export scheduler once, before the engine', page => {
  const html = read(page), tag = '<script src="sync-export-scheduler.js"></script>';
  expect(html.split(tag)).toHaveLength(2);
  expect(html.indexOf(tag)).toBeLessThan(html.indexOf('src="sync-engine.js"'));
});

test('the scheduler loads without engine dependencies and its CommonJS and browser interfaces agree', () => {
  const c = { window: {} }; vm.createContext(c);
  vm.runInContext(read('sync-export-scheduler.js'), c);
  expect(Object.keys(c.window.SyncExportScheduler)).toEqual(['create']);
  expect(Object.keys(require('../sync-export-scheduler'))).toEqual(['create']);
  expect(Object.keys(c.window)).toEqual(['SyncExportScheduler']);
  expect(Object.keys(c.window.SyncExportScheduler.create(() => {}))).toEqual(['schedule']);
});

test('the scheduler is precached and fingerprinted', () => {
  expect(read('sw.js')).toContain("'./sync-export-scheduler.js'");
  expect(read('sw.js')).toContain('"./sync-export-scheduler.js": {');
});
