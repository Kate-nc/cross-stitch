// External edits and stale Manager writes are exercised against IndexedDB in
// rtAccountingStorage.test.js. These guard the tracker boundary: no snapshot
// replacement arithmetic is allowed to return to the write path.
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../tracker-app.js'),'utf8');
test('RT writes submit cumulative consumption to transactional accounting',()=>{
 const section=src.slice(src.indexOf('const flushRtStashWrite='),src.indexOf('// Presence is advisory'));
 expect(section).toContain('StashBridge.applyProjectConsumption(ctx.projectId,write.amounts,ctx.initial)');
 expect(section).not.toContain('updateThreadOwned');
});
test('remaining stock uses composite-keyed live stock minus unapplied consumption',()=>{
 const section=src.slice(src.indexOf('const rtConsumption=useMemo'),src.indexOf('const flushRtStashWrite='));
 expect(section).toContain('globalStash[key]');expect(section).toContain('consumed-observed');expect(src).not.toContain('rtStashSnapshotRef');
});
