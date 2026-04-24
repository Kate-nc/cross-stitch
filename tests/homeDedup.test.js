// tests/homeDedup.test.js
// A6 — Dashboard de-dup + emoji removal in home-screen.js.

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'home-screen.js'), 'utf8');

describe('A6 — emoji removal', () => {
  test('no streak fire emoji literal', () => {
    expect(SRC).not.toMatch(/\uD83D\uDD25/);
  });
  test('no suggestion lightbulb emoji literal', () => {
    expect(SRC).not.toMatch(/\uD83D\uDCA1/);
  });
  test('no stats-link bar-chart emoji literal', () => {
    expect(SRC).not.toMatch(/\uD83D\uDCCA/);
  });
  test('no warning emoji (U+26A0) literal in user-facing strings', () => {
    // Allow zero matches; previously appeared in stash alert + neglected card.
    expect(SRC).not.toMatch(/\u26A0/);
  });
  test('no four-pointed-star showcase glyph (U+2726)', () => {
    expect(SRC).not.toMatch(/\u2726/);
  });
  test('streak label uses Icons.fire()', () => {
    expect(SRC).toMatch(/Icons\.fire\(\)/);
  });
  test('suggestion title uses Icons.lightbulb()', () => {
    expect(SRC).toMatch(/Icons\.lightbulb\(\)/);
  });
  test('global stats link uses Icons.barChart()', () => {
    expect(SRC).toMatch(/Icons\.barChart\(\)/);
  });
  test('stash alert uses Icons.warning()', () => {
    expect(SRC).toMatch(/Icons\.warning\(\)/);
  });
});

describe('A6 — Suggestion / Continue de-dup', () => {
  test('Suggestion card is suppressed when its project matches Continue bar', () => {
    expect(SRC).toMatch(/suggestion\.proj\.id\s*!==\s*continueProj\.id/);
  });
});
