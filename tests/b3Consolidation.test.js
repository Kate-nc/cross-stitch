// tests/b3Consolidation.test.js — B3 Creator sub-page reduction (5 → 3).

const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

describe('B3 — Creator sub-page consolidation', () => {
  describe('header.js page selector', () => {
    const headerSrc = read('header.js');

    it('lists exactly 3 creator pages: pattern, project, materials', () => {
      const m = headerSrc.match(/const creatorPages\s*=\s*\[([\s\S]*?)\];/);
      expect(m).toBeTruthy();
      const ids = Array.from(m[1].matchAll(/\['([^']+)'/g)).map(x => x[1]);
      expect(ids).toEqual(['pattern', 'project', 'materials']);
    });

    it('does not list the legacy prepare/legend/export entries as top-level pages', () => {
      const m = headerSrc.match(/const creatorPages\s*=\s*\[([\s\S]*?)\];/);
      const block = m[1];
      expect(block).not.toMatch(/'prepare'/);
      expect(block).not.toMatch(/'legend'/);
      expect(block).not.toMatch(/'export'/);
    });

    it('uses the British "Materials & Output" label', () => {
      expect(headerSrc).toMatch(/Materials & Output/);
    });
  });

  describe('useCreatorState.js setTab redirect', () => {
    const src = read('creator/useCreatorState.js');

    it('rewrites legacy "prepare" to (materials, stash)', () => {
      expect(src).toMatch(/value === "prepare"[^\n]*"materials"[^\n]*"stash"/);
    });
    it('rewrites legacy "legend" to (materials, threads)', () => {
      expect(src).toMatch(/value === "legend"[^\n]*"materials"[^\n]*"threads"/);
    });
    it('rewrites legacy "export" to (materials, output)', () => {
      expect(src).toMatch(/value === "export"[^\n]*"materials"[^\n]*"output"/);
    });

    it('persists creator.lastPage and creator.materialsTab via UserPrefs', () => {
      expect(src).toMatch(/UserPrefs\.set\("creator\.lastPage"/);
      expect(src).toMatch(/UserPrefs\.set\("creator\.materialsTab"/);
    });

    it('exports materialsTab and setMaterialsTab from the hook', () => {
      expect(src).toMatch(/materialsTab,\s*setMaterialsTab/);
    });

    it('seeds materialsTab from legacy lastPage on first load', () => {
      expect(src).toMatch(/lp === "export"[^\n]*"output"/);
      expect(src).toMatch(/lp === "prepare"[^\n]*"stash"/);
      expect(src).toMatch(/lp === "legend"[^\n]*"threads"/);
    });
  });

  describe('Sidebar.js mode-aware branching', () => {
    const src = read('creator/Sidebar.js');

    it('returns null when app.tab === "materials" (sidebar hidden)', () => {
      expect(src).toMatch(/app\.tab === 'materials'[\s\S]*?return null/);
    });

    it('renders a "Project at a glance" panel when app.tab === "project"', () => {
      expect(src).toMatch(/app\.tab === 'project'/);
      expect(src).toMatch(/Project at a glance/);
    });
  });

  describe('Tab guards in former top-level tabs', () => {
    it('PrepareTab guards on (materials, stash)', () => {
      const src = read('creator/PrepareTab.js');
      expect(src).toMatch(/app\.tab !== 'materials'\s*\|\|\s*app\.materialsTab !== 'stash'/);
      expect(src).not.toMatch(/app\.tab !== 'prepare'/);
    });

    it('LegendTab guards on (materials, threads)', () => {
      const src = read('creator/LegendTab.js');
      expect(src).toMatch(/app\.tab !== "materials"\s*\|\|\s*app\.materialsTab !== "threads"/);
      expect(src).not.toMatch(/app\.tab !== "legend"/);
    });

    it('ExportTab guards on (materials, output)', () => {
      const src = read('creator/ExportTab.js');
      expect(src).toMatch(/app\.tab !== "materials"\s*\|\|\s*app\.materialsTab !== "output"/);
      expect(src).not.toMatch(/app\.tab !== "export"/);
    });
  });

  describe('creator-main.js renders the new hub instead of three children', () => {
    const src = read('creator-main.js');

    it('mounts CreatorMaterialsHub', () => {
      expect(src).toMatch(/window\.CreatorMaterialsHub/);
    });

    it('no longer mounts CreatorLegendTab/CreatorPrepareTab/CreatorExportTab as page children', () => {
      // Each component is now mounted by MaterialsHub, not directly by creator-main.
      expect(src).not.toMatch(/<window\.CreatorLegendTab\s*\/>/);
      expect(src).not.toMatch(/<window\.CreatorPrepareTab\s*\/>/);
      expect(src).not.toMatch(/<window\.CreatorExportTab\s*\/>/);
    });

    it('exposes materialsTab + setMaterialsTab on the AppContext value', () => {
      expect(src).toMatch(/materialsTab:\s*state\.materialsTab/);
      expect(src).toMatch(/setMaterialsTab:\s*state\.setMaterialsTab/);
    });
  });

  describe('build-creator-bundle.js', () => {
    it('includes MaterialsHub.js after PrepareTab/LegendTab/ExportTab', () => {
      const src = read('build-creator-bundle.js');
      const idxLegend  = src.indexOf("'LegendTab.js'");
      const idxPrepare = src.indexOf("'PrepareTab.js'");
      const idxExport  = src.indexOf("'ExportTab.js'");
      const idxHub     = src.indexOf("'MaterialsHub.js'");
      expect(idxHub).toBeGreaterThan(0);
      expect(idxHub).toBeGreaterThan(idxLegend);
      expect(idxHub).toBeGreaterThan(idxPrepare);
      expect(idxHub).toBeGreaterThan(idxExport);
    });
  });

  describe('Consolidation map document', () => {
    it('exists at reports/b3-consolidation-map.md', () => {
      const p = path.join(__dirname, '..', 'reports', 'b3-consolidation-map.md');
      expect(fs.existsSync(p)).toBe(true);
    });

    it('lists each old page and its new home', () => {
      const src = read('reports/b3-consolidation-map.md');
      // The mapping table mentions every former page name.
      expect(src).toMatch(/Pattern/);
      expect(src).toMatch(/Project/);
      expect(src).toMatch(/Materials/);
      expect(src).toMatch(/Prepare/);
      expect(src).toMatch(/Export/);
      expect(src).toMatch(/materialsTab/);
    });
  });
});
