// tests/c4MaterialsHubVisual.test.js — Quarter C ticket C4
//
// Source-level assertions for the Materials Hub visual hierarchy refresh:
// pill-style sub-tab class names, role=tab/tablist wiring, breadcrumb
// micro-label, shared empty-state markup, and arrow-key navigation hook.

const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

const hubSrc    = read('creator/MaterialsHub.js');
const cssSrc    = read('styles.css');
const iconsSrc  = read('icons.js');
const bundleSrc = read('creator/bundle.js');

describe('C4 — Materials Hub visual hierarchy refresh', () => {
  describe('Sub-tab pill markup', () => {
    it('uses .mh-subtab class for each sub-tab', () => {
      expect(hubSrc).toMatch(/className:\s*'mh-subtab' \+ \(on \? ' on' : ''\)/);
    });

    it('declares role="tablist" with aria-label on the nav', () => {
      expect(hubSrc).toMatch(/role:\s*'tablist'/);
      expect(hubSrc).toMatch(/'aria-label':\s*'Materials sections'/);
    });

    it('each sub-tab button uses role="tab" with aria-selected', () => {
      expect(hubSrc).toMatch(/role:\s*'tab',\s*\n\s*'aria-selected':\s*on/);
    });

    it('inactive sub-tabs receive tabIndex -1 (roving tabindex pattern)', () => {
      expect(hubSrc).toMatch(/tabIndex:\s*on \? 0 : -1/);
    });
  });

  describe('Pill style in CSS', () => {
    it('.mh-subtab uses a rounded pill border-radius', () => {
      expect(cssSrc).toMatch(/\.mh-subtab\s*\{[^}]*border-radius:\s*999px/s);
    });

    it('.mh-subtab has a resting outline border', () => {
      expect(cssSrc).toMatch(/\.mh-subtab\s*\{[^}]*border:\s*1px solid var\(--border\)/s);
    });

    it('.mh-subtab.on fills with accent', () => {
      expect(cssSrc).toMatch(/\.mh-subtab\.on\s*\{[^}]*background:\s*var\(--accent\)/s);
    });

    it('.mh-subtab has a visible :focus-visible outline', () => {
      expect(cssSrc).toMatch(/\.mh-subtab:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s);
    });

    it('.mh-body has an inset surface background', () => {
      expect(cssSrc).toMatch(/\.mh-body\s*\{[^}]*background:\s*var\(--surface-1/s);
    });

    it('.mh-subtabs-wrap has an accent left border for visual nesting', () => {
      expect(cssSrc).toMatch(/\.mh-subtabs-wrap\s*\{[^}]*border-left:\s*2px solid color-mix\(in srgb, var\(--accent\)/s);
    });
  });

  describe('Breadcrumb micro-label', () => {
    it('renders an .mh-breadcrumb element above the sub-tab strip', () => {
      expect(hubSrc).toMatch(/className:\s*'mh-breadcrumb'/);
    });

    it('breadcrumb is aria-hidden (parent tablist already announces section)', () => {
      expect(hubSrc).toMatch(/className:\s*'mh-breadcrumb',\s*'aria-hidden':\s*'true'/);
    });

    it('breadcrumb shows the page-level root label "Materials & Output"', () => {
      expect(hubSrc).toMatch(/Materials & Output/);
    });

    it('breadcrumb has a current-segment span derived from the active sub-tab', () => {
      expect(hubSrc).toMatch(/className:\s*'mh-breadcrumb-current'/);
      expect(hubSrc).toMatch(/var activeLabel\s*=\s*SUBTABS\[activeIdx\]/);
    });

    it('uses Icons.chevronRight as the breadcrumb separator (not a › glyph)', () => {
      expect(hubSrc).toMatch(/Icons\.chevronRight/);
      // No literal U+203A (›) or U+2192 (→) anywhere in the source.
      expect(hubSrc).not.toMatch(/[\u203A\u2192]/);
    });

    it('breadcrumb truncates the root segment on mobile (≤480px)', () => {
      // Find the @media block that contains the .mh-subtabs-wrap rule.
      const blocks = cssSrc.match(/@media \(max-width:\s*480px\)\s*\{[\s\S]*?\n\}/g) || [];
      const mhBlock = blocks.find(function (b) { return /\.mh-subtabs-wrap/.test(b); });
      expect(mhBlock).toBeTruthy();
      expect(mhBlock).toMatch(/\.mh-breadcrumb-root\s*\{[^}]*max-width:/);
    });
  });

  describe('Empty-state shared layout', () => {
    it('exposes a local emptyState() helper rendering .mh-empty', () => {
      expect(hubSrc).toMatch(/function emptyState\(opts\)/);
      expect(hubSrc).toMatch(/className:\s*'mh-empty'/);
    });

    it('shopping empty branch routes through emptyState() (no inline styles)', () => {
      const m = hubSrc.match(/if \(deficits\.length === 0\) \{([\s\S]*?)\n\s*\}/);
      expect(m).toBeTruthy();
      expect(m[1]).toMatch(/return emptyState\(\{/);
      // Old inline-style empty markup is gone.
      expect(m[1]).not.toMatch(/mh-shopping-empty/);
    });

    it('empty state uses an SVG icon (Icons.shoppingCart) and not an emoji', () => {
      const m = hubSrc.match(/if \(deficits\.length === 0\) \{([\s\S]*?)\n\s*\}/);
      expect(m[1]).toMatch(/Icons\.shoppingCart|Icons\.cart/);
    });

    it('CSS provides .mh-empty / .mh-empty-headline / .mh-empty-body classes', () => {
      expect(cssSrc).toMatch(/\.mh-empty\s*\{/);
      expect(cssSrc).toMatch(/\.mh-empty-headline\s*\{/);
      expect(cssSrc).toMatch(/\.mh-empty-body\s*\{/);
      expect(cssSrc).toMatch(/\.mh-empty-icon\s*\{/);
    });

    it('CSS centres the empty-state content', () => {
      expect(cssSrc).toMatch(/\.mh-empty\s*\{[^}]*align-items:\s*center/s);
      expect(cssSrc).toMatch(/\.mh-empty\s*\{[^}]*text-align:\s*center/s);
    });
  });

  describe('Arrow-key navigation', () => {
    it('attaches onKeyDown to the tablist', () => {
      expect(hubSrc).toMatch(/onKeyDown:\s*onTablistKeyDown/);
    });

    it('handler responds to ArrowLeft / ArrowRight / Home / End', () => {
      expect(hubSrc).toMatch(/ArrowRight/);
      expect(hubSrc).toMatch(/ArrowLeft/);
      expect(hubSrc).toMatch(/Home/);
      expect(hubSrc).toMatch(/End/);
    });

    it('handler calls app.setMaterialsTab with the next tab id', () => {
      expect(hubSrc).toMatch(/app\.setMaterialsTab\(SUBTABS\[nextIdx\]\.id\)/);
    });
  });

  describe('No emoji house-rule', () => {
    it('MaterialsHub.js source contains no forbidden glyphs', () => {
      // Same set as the existing materialsHub.test.js, plus › U+203A.
      const FORBIDDEN = /[\u2192\u2190\u25B8\u2715\u2713\u2717\u26A0\u2139\u203A\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
      expect(hubSrc).not.toMatch(FORBIDDEN);
    });
  });

  describe('Icons availability', () => {
    it('icons.js defines chevronRight (used as breadcrumb separator)', () => {
      expect(iconsSrc).toMatch(/chevronRight:\s*function\s*\(\)/);
    });
  });

  describe('Bundle freshness', () => {
    it('creator/bundle.js includes the new breadcrumb markup', () => {
      expect(bundleSrc).toMatch(/mh-breadcrumb/);
    });

    it('creator/bundle.js includes the empty-state helper', () => {
      expect(bundleSrc).toMatch(/className:\s*'mh-empty'/);
    });
  });
});
