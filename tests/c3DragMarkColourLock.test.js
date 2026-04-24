// tests/c3DragMarkColourLock.test.js — C3
//
// Verifies the colour-lock filter is applied INSIDE the useDragMark
// callbacks (`_dragMarkOnToggle`, `_dragMarkOnCommitDrag`,
// `_dragMarkOnCommitRange` → `_commitBulk`) so locked cells are skipped
// regardless of input source. Source-level assertions follow the same
// regex-grep pattern as tests/dragMark.test.js's wiring check.
//
// Why source-level: each callback is a React closure whose dependencies
// (pat, done, focusColour, isColourLocked, fullStitchMatchesFocus,
// pushTrackHistory, applyDoneCountsDelta, setDone, renderStitch) come
// from the surrounding component scope and cannot be cleanly extracted
// for in-isolation execution. The filter logic itself is small and the
// regression risk we're guarding against is "the filter is missing from
// the new pipeline" — which is exactly what a source assertion catches.

const fs = require('fs');
const path = require('path');

const TRACKER = fs.readFileSync(
  path.resolve(__dirname, '..', 'tracker-app.js'), 'utf8');

// Pull out the body of a top-level useCallback so we can grep inside it
// without false matches from neighbouring code.
function extractCallbackBody(src, name) {
  const re = new RegExp(
    'const\\s+' + name + '\\s*=\\s*useCallback\\s*\\(\\s*function[^{]*\\{');
  const m = re.exec(src);
  if (!m) throw new Error('Could not find ' + name + ' useCallback');
  // Walk braces from the opening { to find matching close.
  let depth = 1;
  let i = m.index + m[0].length;
  while (i < src.length && depth > 0) {
    const c = src[i++];
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  if (depth !== 0) throw new Error('Unbalanced braces in ' + name);
  return src.slice(m.index + m[0].length, i - 1);
}

describe('C3 — colour-lock filter inside useDragMark callbacks', () => {
  test('_dragMarkOnToggle skips cells when isColourLocked() && !fullStitchMatchesFocus(idx)', () => {
    const body = extractCallbackBody(TRACKER, '_dragMarkOnToggle');
    expect(body).toMatch(/isColourLocked\s*\(\s*\)/);
    expect(body).toMatch(/!\s*fullStitchMatchesFocus\s*\(\s*idx\s*\)/);
    // The filter must short-circuit (return) — not just log.
    expect(body).toMatch(
      /isColourLocked\s*\([^)]*\)[\s\S]{0,80}fullStitchMatchesFocus[\s\S]{0,40}return/);
    // Mutation (setDone) must come AFTER the filter.
    const filterIdx = body.search(/fullStitchMatchesFocus\s*\(\s*idx\s*\)/);
    const setDoneIdx = body.search(/setDone\s*\(/);
    expect(filterIdx).toBeGreaterThan(-1);
    expect(setDoneIdx).toBeGreaterThan(filterIdx);
  });

  test('_commitBulk filters locked cells inside its set.forEach loop', () => {
    const body = extractCallbackBody(TRACKER, '_commitBulk');
    // Inside the per-cell loop body we expect the same filter pattern.
    expect(body).toMatch(/set\.forEach/);
    expect(body).toMatch(/isColourLocked\s*\(\s*\)/);
    // The filter must short-circuit per-cell — `return` inside the
    // forEach callback (skips that cell, not the whole commit).
    expect(body).toMatch(
      /isColourLocked\s*\([^)]*\)[\s\S]{0,160}!\s*fullStitchMatchesFocus\s*\(\s*idx\s*\)[\s\S]{0,40}return/);
  });

  test('_dragMarkOnCommitDrag routes through _commitBulk (and therefore the filter)', () => {
    const body = extractCallbackBody(TRACKER, '_dragMarkOnCommitDrag');
    expect(body).toMatch(/_commitBulk\s*\(\s*set\s*,\s*intent\s*,\s*['"]drag['"]\s*\)/);
  });

  test('_dragMarkOnCommitRange routes through _commitBulk (and therefore the filter)', () => {
    const body = extractCallbackBody(TRACKER, '_dragMarkOnCommitRange');
    expect(body).toMatch(/_commitBulk\s*\(\s*set\s*,\s*intent\s*,\s*['"]range['"]\s*\)/);
  });

  test('the filter uses fullStitchMatchesFocus (not the inline pat[idx].id !== focusColour shortcut)', () => {
    // C3 normalises the check to use the helper so legacy + new callbacks
    // share one source of truth.
    const toggleBody = extractCallbackBody(TRACKER, '_dragMarkOnToggle');
    const bulkBody = extractCallbackBody(TRACKER, '_commitBulk');
    expect(toggleBody).toMatch(/fullStitchMatchesFocus/);
    expect(bulkBody).toMatch(/fullStitchMatchesFocus/);
  });
});
