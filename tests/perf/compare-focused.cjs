/* Compare complete same-environment reports. Ratios are observations, not budgets.
 * node tests/perf/compare-focused.cjs base.json head.json > comparison.json */
const fs=require('fs');
const assert=require('node:assert/strict');
const [baseFile,headFile]=process.argv.slice(2);
assert(baseFile&&headFile,'Pass base and head report paths');
const base=JSON.parse(fs.readFileSync(baseFile,'utf8')),head=JSON.parse(fs.readFileSync(headFile,'utf8'));
for(const key of ['os','arch','cpu','logicalCpus','hostMemoryGiB','node','playwright','viewport','dpr','cpuQuota','memoryLimit','headless','throttling','localCdn','fixture'])
  assert.deepEqual(head.environment[key],base.environment[key],'Environment differs: '+key);
assert.equal(head.warmups,base.warmups,'Warmup counts differ');
assert.equal(head.repeats,base.repeats,'Measured run counts differ');
for(const report of [base,head]){
  assert(!report.environment.sourceOverlay,'Use complete served worktrees rather than diagnostic source overlays');
  assert(report.warmups>=1&&report.repeats>=3,'Need warmup and at least three measurements');
  assert(report.results.every(r=>!r.error&&!r.unavailable),'Report contains failed/unavailable runs');
  for(const run of report.results){
    assert.equal(run.save.version,11,'Saved format changed');
    assert.equal(run.save.patternLength,run.size[0]*run.size[1],'Saved pattern length changed');
    assert.equal(run.save.indices.length,20,'Saved marks missing');
    assert.deepEqual(run.reopenedIndices,run.save.indices,'Reopened marks differ');
  }
}
const comparisons=[];
for(const b of base.distributions){
  const h=head.distributions.find(x=>x.browser===b.browser&&x.size===b.size);
  assert(h,'Head is missing '+b.browser+' '+b.size);
  assert.equal(b.runs,base.repeats);assert.equal(h.runs,head.repeats);
  const bRuns=base.results.filter(r=>r.browser===b.browser&&r.size.join('x')===b.size);
  const hRuns=head.results.filter(r=>r.browser===h.browser&&r.size.join('x')===h.size);
  assert.deepEqual([...new Set(hRuns.map(r=>r.version))],[...new Set(bRuns.map(r=>r.version))],'Browser versions differ');
  const metrics={};
  for(const key of ['importMs','markP95Ms','saveMs','reopenMs','heapAfterGC']){
    if(!b[key]&&!h[key])continue;
    assert(b[key]&&h[key],'Missing metric '+key);
    metrics[key]={base:b[key],head:h[key],medianRatio:h[key].median/b[key].median};
  }
  comparisons.push({browser:b.browser,size:b.size,metrics});
}
assert.equal(head.distributions.length,comparisons.length,'Head contains unmatched groups');
console.log(JSON.stringify({base:{label:base.label,sha:base.sourceSha},head:{label:head.label,sha:head.sourceSha},budget:null,comparisons},null,2));
