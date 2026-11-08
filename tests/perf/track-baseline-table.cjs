/* track-baseline-table.cjs — Markdown tables from track-baseline.cjs results.
   node tests/perf/track-baseline-table.cjs results.json [more.json ...]
   Later files override earlier ones for the same scenario id. Used to build
   reports/track-mode-performance-baseline.md, and to compare a later run
   with it the same way. */
const fs = require('fs');

const scen = {};
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [id, runs] of Object.entries(r.scenarios)) {
    // Files from before the CPU profile moved to `cpuProfile` lost the device
    // name under `profile`: every desktop scenario's id ends in -desktop.
    scen[id] = runs.filter((x) => !x.error).map((x) => (typeof x.profile === 'string' ? x : Object.assign({}, x, { profile: /-desktop$/.test(id) ? 'desktop' : 'phone' })));
  }
}
const first = (id) => (scen[id] || [])[0];
const n = (v) => (v == null ? '–' : typeof v === 'number' ? Math.round(v).toLocaleString('en-GB') : v);
const sp = (e, k, f = 'n') => ((e.spans || {})[k] || {})[f] || 0;
const label = (e) => {
  const f = e.fixture || {};
  return `${f.size}${f.mixed ? ' mixed' : ''} ${Math.round((f.done || 0) * 100)}%${e.zoom !== 1 ? ' @' + Math.round(e.zoom * 100) + '%' : ''}${e.history ? ', 50k history' : ''}${e.collection ? ', 150 projects' : ''}`;
};

function table(head, rows) {
  return ['| ' + head.join(' | ') + ' |', '|' + head.map((_, i) => (i ? '---:' : '---')).join('|') + '|', ...rows.map((r) => '| ' + r.join(' | ') + ' |')].join('\n');
}

const out = [];
const ids = (re) => Object.keys(scen).filter((k) => re.test(k));

out.push('### Opening an unchanged project (first 10 s)\n');
out.push(table(['Scenario', 'Profile', 'First chart paint', 'Longest task', 'TBT 0-10 s', 'Full puts', 'Heap after GC'],
  ids(/^open-/).map((id) => { const e = first(id); if (!e) return [id, 'failed']; return [label(e), e.profile, n(e.firstFullPaintMs) + ' ms', n(e.longTasks.longestMs) + ' ms', n(e.longTasks.tbtMs) + ' ms', n((e.storage.byStore['projects.put'] || {}).n || 0), n(e.heapAfterGcMb) + ' MB']; })));

out.push('\n### Marking (12 taps 1 s apart; rapid: 20 taps 0.4 s apart)\n');
out.push(table(['Scenario', 'Profile', 'Marked', 'Tap p50 / p75 / p95 / max', 'Handler max', 'Paints full / partial', 'Commits / tap', 'Progress writes', 'Full saves', 'Longest task'],
  ids(/^(mark|rapid)-/).map((id) => { const e = first(id); if (!e) return [id, 'failed']; const i = e.interactions; return [(id.startsWith('rapid') ? 'rapid ' : '') + label(e), e.profile, `${e.marked}/${e.taps}`, `${i.p50} / ${i.p75} / ${i.p95} / ${i.max} ms`, n(i.handler.max) + ' ms', `${e.paints.full} / ${e.paints.partial}`, (e.react.commits / e.taps).toFixed(1), n(sp(e, 'ProjectStorage.saveProgress')), n(sp(e, 'ProjectStorage.save')), n(e.longTasks.longestMs) + ' ms']; })));

out.push('\n### Pan, mark, pan (4 x: 60 scroll frames, 3 taps); work area and overlays\n');
out.push(table(['Scenario', 'Profile', 'Tap p50 / max', 'Frames > 50 ms', 'Worst frame', 'Kept tile moves', 'Paints full / partial', 'TBT'],
  ids(/^pmp-/).map((id) => { const e = first(id); if (!e) return [id, 'failed']; return [label(e) + (id.includes('workarea') ? ', work area' : id.includes('overlays') ? ', overlays' : ''), e.profile, `${e.interactions.p50} / ${e.interactions.max} ms`, `${e.frames.over50} of ${e.frames.n}`, n(e.frames.worstMs) + ' ms', n(e.chartCopies), `${e.paints.full} / ${e.paints.partial}`, n(e.longTasks.tbtMs) + ' ms']; })));

out.push('\n### Zoom steps across the detail tiers (16 key presses: 20% to 100% and back)\n');
out.push(table(['Scenario', 'Step p50 / p95 / max', 'Handler max', 'Full paints', 'Script / render in long frames', 'Zooms'],
  ids(/^zoom-/).map((id) => { const e = first(id); if (!e) return [id, 'failed']; const i = e.interactions; return [label(e), `${i.p50} / ${i.p95} / ${i.max} ms`, n(i.handler.max) + ' ms', n(e.paints.full), `${n(e.loaf.scriptMs)} / ${n(e.loaf.renderMs)} ms`, (e.zooms || []).join(' ')]; })));

out.push('\n### Sync: one folder export; two tabs on one project\n');
out.push(table(['Scenario', 'Profile', 'Export total', 'Longest task', 'TBT', 'File'],
  ids(/^sync-/).map((id) => { const e = first(id); if (!e) return [id, 'failed']; return [label(e), e.profile, n(e.exportMs) + ' ms', n(e.longTasks.longestMs) + ' ms', n(e.longTasks.tbtMs) + ' ms', n(Math.round(e.fileBytes / 1024)) + ' KB']; })));
for (const id of ids(/^crosstab-/)) {
  const e = first(id);
  if (e) out.push(`\nTwo tabs (${label(e)}): tab A marked ${e.marked} of 8, taps p50 / max ${e.tabA.interactions.p50} / ${e.tabA.interactions.max} ms; tab B meanwhile: ${e.tabB.longTasks.n} long tasks, ${e.tabB.react.commits} commit${e.tabB.react.commits === 1 ? '' : 's'}, ${(e.tabB.storage.byStore['projects.get'] || {}).n || 0} project reads.`);
}
console.log(out.join('\n'));
