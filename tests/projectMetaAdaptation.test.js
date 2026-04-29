/* tests/projectMetaAdaptation.test.js
 * Verifies project_meta gets an `adaptation` projection ({fromProjectId,
 * fromName, modeAtCreate}) on adapted projects, and is undefined for plain
 * projects. Surfaces the field for the pattern-library "Adapted from …" badge
 * without forcing consumers to load the full project payload.
 */
const fs = require('fs');
const path = require('path');

// Extract buildMeta from project-storage.js by grabbing the function source.
const src = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8');
const start = src.indexOf('function buildMeta(p)');
if (start < 0) throw new Error('buildMeta not found in project-storage.js');
// Find matching closing brace by counting.
let depth = 0, i = start, end = -1;
while (i < src.length) {
  const ch = src[i];
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  i++;
}
const fnSrc = src.slice(start, end);
// Stubs for helpers referenced inside buildMeta — we don't exercise them here.
const countTotalStitches = () => 0;
const countCompletedStitches = () => 0;
// eslint-disable-next-line no-eval
const buildMeta = eval('(' + fnSrc.replace('function buildMeta', 'function') + ')');

function makeProject(extra) {
  return Object.assign({
    id: 'proj_test',
    name: 'Test',
    settings: { sW: 10, sH: 10, fabricCt: 14 },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    pattern: [],
    statsSessions: []
  }, extra);
}

describe('buildMeta adaptation projection', () => {
  test('plain project → adaptation field is undefined', () => {
    const meta = buildMeta(makeProject());
    expect(meta.adaptation).toBeUndefined();
  });

  test('adapted project → meta carries fromProjectId / fromName / modeAtCreate', () => {
    const meta = buildMeta(makeProject({
      adaptation: {
        fromProjectId: 'proj_orig',
        fromName: 'Original Pattern',
        modeAtCreate: 'stash',
        snapshotAt: '2026-04-29T00:00:00Z',
        substitutions: [{ sourceId: '310', target: { id: '413' } }] // ignored in projection
      }
    }));
    expect(meta.adaptation).toEqual({
      fromProjectId: 'proj_orig',
      fromName: 'Original Pattern',
      modeAtCreate: 'stash',
    });
  });

  test('partial adaptation metadata → missing fields fall back to null, not crash', () => {
    const meta = buildMeta(makeProject({ adaptation: { fromProjectId: 'proj_x' } }));
    expect(meta.adaptation.fromProjectId).toBe('proj_x');
    expect(meta.adaptation.fromName).toBeNull();
    expect(meta.adaptation.modeAtCreate).toBeNull();
  });
});
