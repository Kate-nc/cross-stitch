/* Synthetic large-pattern fixture used by the perf harness.
 *
 * Generated in the Node test process and injected into IndexedDB via
 * `page.evaluate` so the harness has a deterministic worst-case project
 * to drive. Two sizes:
 *   - small : 80×80 (6,400 cells)
 *   - large : 400×600 (240,000 cells)
 *
 * Pattern uses a checkerboard of 6 DMC ids so palette / colour switch
 * timing has something to render.
 *
 * The shape matches the v8 project model documented in
 * `.github/copilot-instructions.md`. Keep in sync if the model changes.
 */

const PALETTE = ['310', '321', '699', '725', '796', 'B5200'];

function makeProject({ w, h, name, id }) {
  const total = w * h;
  const pattern = new Array(total);
  for (let i = 0; i < total; i++) {
    const dmcId = PALETTE[(i + ((i / w) | 0)) % PALETTE.length];
    pattern[i] = { id: dmcId, type: 'solid', rgb: [0, 0, 0] };
  }
  const now = new Date().toISOString();
  return {
    v: 8,
    id,
    name,
    createdAt: now,
    updatedAt: now,
    w,
    h,
    settings: { sW: w, sH: h, fabricCt: 14 },
    pattern,
    bsLines: [],
    done: null,
    halfStitches: {},
    halfDone: {},
    parkMarkers: [],
    totalTime: 0,
    sessions: [],
    threadOwned: {},
  };
}

const FIXTURES = {
  small: () => makeProject({ w: 80, h: 80, name: 'Perf small (80×80)', id: 'proj_perf_small' }),
  large: () => makeProject({ w: 400, h: 600, name: 'Perf large (400×600)', id: 'proj_perf_large' }),
};

module.exports = { FIXTURES, PALETTE };
