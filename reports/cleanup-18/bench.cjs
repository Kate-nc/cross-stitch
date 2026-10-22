// Micro-benchmark of the merge hot path: SyncEngine.mergeTrackingProgress on a project with a long journal.
// Usage: node reports/cleanup-18/bench.cjs <checkoutDir>  (run once per checkout, alternate a few times)
const { loadEngine } = require('./load-engine.cjs');
const E = loadEngine(require('path').resolve(process.argv[2]));
const mk = (u, off) => {
  const sessions = Array.from({ length: 150 }, (_, i) => ({ id: 's' + (i + off), start: new Date(Date.UTC(2026, 0, 1) + (i + off) * 3.6e6).toISOString(), date: '2026-01-01', durationMinutes: 5, netStitches: 10, units: 10, totalAtEnd: (i + 1) * 10, percentAtEnd: 1 }));
  return { id: 'p', name: 'P', updatedAt: u, settings: { sW: 30, sH: 30 }, pattern: Array.from({ length: 900 }, () => ({ id: '310' })), done: new Array(900).fill(0),
    statsSessions: sessions, sessions, totalTime: 0, threadOwned: {}, parkMarkers: Array.from({ length: 50 }, (_, i) => ({ x: i, y: i, colorId: '310' })),
    achievedMilestones: [], halfDone: {}, halfStitches: Array.from({ length: 300 }, (_, i) => [i, { fwd: true }]), stitchLog: Array.from({ length: 200 }, (_, i) => ({ date: '2026-' + String(1 + i % 12).padStart(2, '0') + '-' + String(1 + i % 28).padStart(2, '0'), count: i })) };
};
const l = mk('2026-07-01T00:00:00Z', 0), r = mk('2026-08-01T00:00:00Z', 100);
for (let i = 0; i < 2; i++) E.mergeTrackingProgress(l, r);
const t = process.hrtime.bigint();
const N = 12;
for (let i = 0; i < N; i++) E.mergeTrackingProgress(l, r);
console.log(((Number(process.hrtime.bigint() - t) / 1e6) / N).toFixed(3), 'ms per merge');
