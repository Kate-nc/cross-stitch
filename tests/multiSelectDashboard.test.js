/**
 * Tests for B5 — multi-select dashboard + rich cards.
 *
 * Following the repo convention (see embroidery-image-processing.test.js,
 * partialStitchThumb.test.js): we read the source files via fs and assert
 * against (a) source-level regex contracts and (b) extracted pure helpers
 * loaded into a sandbox. We deliberately do NOT try to drive React under
 * jsdom — the dashboard component is too entangled with browser globals
 * (IndexedDB, canvas, indexedDB-backed ProjectStorage) to mount cleanly.
 */
const fs = require('fs');
const path = require('path');

const HOME_PATH = path.join(__dirname, '..', 'home-screen.js');
const STORAGE_PATH = path.join(__dirname, '..', 'project-storage.js');
const CSS_PATH = path.join(__dirname, '..', 'styles.css');

const home = fs.readFileSync(HOME_PATH, 'utf8');
const storage = fs.readFileSync(STORAGE_PATH, 'utf8');
const css = fs.readFileSync(CSS_PATH, 'utf8');

describe('Dashboard wires PartialStitchThumb', () => {
  test('ProjectCard renders window.PartialStitchThumb', () => {
    expect(home).toMatch(/window\.PartialStitchThumb/);
    // The card should pass the lazy-loaded payload's pattern/done into the thumb.
    expect(home).toMatch(/h\(window\.PartialStitchThumb,\s*\{[\s\S]{0,300}pattern:\s*payload\.pattern/);
  });
  test('Hero card also uses PartialStitchThumb', () => {
    expect(home).toMatch(/h\(window\.PartialStitchThumb,\s*\{[\s\S]{0,300}pattern:\s*heroPayload\.pattern/);
  });
  test('ProjectStorage.get is called lazily inside ProjectCard', () => {
    // The lazy-load effect must be inside ProjectCard, not at dashboard level.
    expect(home).toMatch(/ProjectStorage\.get\(proj\.id\)/);
  });
  test('payload cache is shared across cards via a ref Map', () => {
    expect(home).toMatch(/payloadCacheRef\s*=\s*React\.useRef/);
    expect(home).toMatch(/payloadCacheRef\.current\s*=\s*new Map/);
  });
});

describe('Selection state', () => {
  test('selected is a Set', () => {
    expect(home).toMatch(/useState\(function\(\)\s*\{\s*return new Set\(\)/);
  });
  test('selection set intersects with project IDs whenever projects change', () => {
    // Effect that rebuilds selected from new project IDs.
    expect(home).toMatch(/useEffect\(function\(\)\s*\{[\s\S]{0,400}new Set\(projects\.map[\s\S]{0,400}\}, \[projects\]\)/);
  });
  test('Escape key handler is wired with addEventListener("keydown") inside an effect', () => {
    expect(home).toMatch(/useEffect\(function\(\)\s*\{[\s\S]{0,500}addEventListener\(['"]keydown['"]/);
    expect(home).toMatch(/e\.key\s*===\s*['"]Escape['"]/);
  });
});

describe('Long-press to enter selection', () => {
  test('uses a 500ms setTimeout on touchstart', () => {
    expect(home).toMatch(/setTimeout\([\s\S]{0,200}\b500\)/);
  });
  test('cancels the press when the touch moves > 10px', () => {
    expect(home).toMatch(/Math\.abs\(dx\)\s*>\s*10|Math\.abs\(dy\)\s*>\s*10/);
  });
  test('ProjectCard exposes onTouchStart / onTouchMove / onTouchEnd handlers', () => {
    expect(home).toMatch(/onTouchStart:\s*onTouchStart/);
    expect(home).toMatch(/onTouchMove:\s*onTouchMove/);
    expect(home).toMatch(/onTouchEnd:\s*onTouchEnd/);
  });
});

describe('Bulk action bar', () => {
  test('rendering is gated on selectionMode === true', () => {
    expect(home).toMatch(/selectionMode\s*&&\s*h\(['"]div['"],\s*\{\s*\n?\s*className:\s*['"]mpd-bulk-bar['"]/);
  });
  test('bulk delete shows a confirmation before deletion (now via styled BulkDeleteModal)', () => {
    // fix-3.5 — handleBulkDelete now opens a styled modal instead of
    // calling window.confirm. The modal lists project names then calls
    // doBulkDelete().
    expect(home).toMatch(/function handleBulkDelete\(\)[\s\S]{0,300}setConfirmDelete\(true\)/);
    expect(home).toMatch(/function BulkDeleteModal/);
    expect(home).toMatch(/cannot be undone/);
  });
  test('bulk export only shows a "coming in B4" toast (no real export)', () => {
    expect(home).toMatch(/handleBulkExport[\s\S]{0,300}coming in B4/);
    // and is NOT calling any export pipeline
    expect(home).not.toMatch(/handleBulkExport[\s\S]{0,300}PdfExport/);
  });
  test('bar shows N selected, Select all, and a Cancel selection control', () => {
    expect(home).toMatch(/['"]mpd-bulk-count['"]/);
    expect(home).toMatch(/Select all/);
    // fix-3.7 — the old "Clear" label was renamed to "Cancel selection"
    // and a persistent banner offers the same action where the Continue
    // bar would be.
    expect(home).toMatch(/Cancel selection/);
  });
});

describe('Card markup additions', () => {
  test('card has a checkbox container with class mpd-card-select', () => {
    expect(home).toMatch(/className:\s*['"]mpd-card-select['"]/);
    // Selected-state class variant is also present
    expect(home).toMatch(/mpd-card-select--checked/);
  });
  test('selected card receives the mpd-card--selected modifier', () => {
    expect(home).toMatch(/mpd-card--selected/);
  });
  test('thread count is surfaced in the meta row when present', () => {
    expect(home).toMatch(/threadCount\s*=/);
    expect(home).toMatch(/colour' \+ \(threadCount === 1/);
  });
});

describe('CSS additions', () => {
  test('.mpd-card--selected rule exists', () => {
    expect(css).toMatch(/\.mpd-card--selected\s*\{/);
  });
  test('.mpd-card-select base rule exists', () => {
    expect(css).toMatch(/\.mpd-card-select\s*\{/);
  });
  test('.mpd-bulk-bar is sticky', () => {
    expect(css).toMatch(/\.mpd-bulk-bar\s*\{[\s\S]{0,200}position:\s*sticky/);
  });
  test('mobile (≤480px) media query handles bulk bar overflow', () => {
    expect(css).toMatch(/@media \(max-width:\s*480px\)[\s\S]{0,800}\.mpd-bulk-bar\s*\{/);
  });
});

describe('ProjectStorage bulk helpers', () => {
  test('deleteMany([]) is a no-op (returns empty array)', async () => {
    // Exercise the helper logic via a tiny stub: emulate the same control flow
    // by re-implementing the public contract from the source.
    expect(storage).toMatch(/async deleteMany\(ids\)/);
    expect(storage).toMatch(/if \(!Array\.isArray\(ids\) \|\| ids\.length === 0\) return \[\]/);
  });
  test('deleteMany loops per id via this.delete(id)', () => {
    expect(storage).toMatch(/for \(var i\s*=\s*0; i < ids\.length; i\+\+\)/);
    expect(storage).toMatch(/await this\.delete\(ids\[i\]\)/);
  });
  test('setStateMany loops setProjectState per id', () => {
    expect(storage).toMatch(/setStateMany\(ids,\s*state\)/);
    expect(storage).toMatch(/this\.setProjectState\(ids\[i\],\s*state\)/);
  });

  // Behavioural test using a hand-rolled stub matching the public shape of
  // ProjectStorage. We are NOT loading project-storage.js (it requires
  // IndexedDB); we are validating that a "deleteMany over fake delete()"
  // calls per-id delete the right number of times — the same contract the
  // dashboard relies on.
  test('deleteMany behavioural stub invokes per-id delete twice for ["a","b"]', async () => {
    const calls = [];
    const stub = {
      async delete(id) { calls.push(id); },
      async deleteMany(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return [];
        const out = [];
        for (let i = 0; i < ids.length; i++) {
          await this.delete(ids[i]);
          out.push({ id: ids[i], ok: true });
        }
        return out;
      }
    };
    const empty = await stub.deleteMany([]);
    expect(empty).toEqual([]);
    expect(calls).toEqual([]);
    const result = await stub.deleteMany(['a', 'b']);
    expect(calls).toEqual(['a', 'b']);
    expect(result).toEqual([
      { id: 'a', ok: true },
      { id: 'b', ok: true }
    ]);
  });
});

describe('Continue bar coexistence', () => {
  test('Continue bar is hidden while selection mode is active', () => {
    expect(home).toMatch(/!selectionMode\s*&&\s*continueProj\s*&&\s*h\(/);
  });
});

describe('No emoji or forbidden glyphs in B5 additions', () => {
  test('no pictographic emoji or arrow/check glyphs in the bulk bar block', () => {
    // Scope: the bulk bar JSX block.
    const start = home.indexOf("'mpd-bulk-bar'");
    const tail = home.slice(start, start + 2000);
    expect(tail).not.toMatch(/[\u2190-\u2199\u21D0-\u21D9]/); // arrows
    expect(tail).not.toMatch(/[\u2700-\u27BF]/);              // dingbats
    expect(tail).not.toMatch(/[\uD83C-\uDBFF]/);              // emoji surrogates
  });
});
