const T=require('./tk');
const probe=(page,id)=>page.evaluate(async id=>{const p=await ProjectStorage.get(id);return p?{hasPattern:!!p.pattern,patternLen:p.pattern&&p.pattern.length,hasDone:!!p.done,doneLen:p.done&&p.done.length,sessions:(p.statsSessions||[]).length,keys:Object.keys(p).length}:null},id);
(async()=>{
  const { ctx, close } = await T.launch({}, 'e12');
  const page = await ctx.newPage();
  const id = await T.open(page,'small.json');
  console.log('before flush:', JSON.stringify(await probe(page,id)));
  await T.dragCells(page,2,2,11);
  const r = await page.evaluate(async()=>{ await window.__flushProjectToIDB(); return 'flushed'; });
  console.log(r, JSON.stringify(await probe(page,id)));
  await page.waitForTimeout(6500);
  console.log('after 6.5s autosave:', JSON.stringify(await probe(page,id)));
  await close();
})();
