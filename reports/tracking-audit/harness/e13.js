const T=require('./tk');
const probe=(page,id)=>page.evaluate(async id=>{const p=await ProjectStorage.get(id);return p?{done:p.done&&p.done.filter(v=>v).length,pattern:!!p.pattern}:null},id);
(async()=>{
  const { ctx, close } = await T.launch({}, 'e13');
  const page = await ctx.newPage();
  const id = await T.open(page,'small.json');
  await T.dragCells(page,2,2,11); await page.waitForTimeout(6500);
  console.log('autosaved:', JSON.stringify(await probe(page,id)));
  await T.dragCells(page,2,3,11); console.log('strip now', await T.counts(page));
  await page.evaluate(()=>window.__flushProjectToIDB());
  console.log('IDB right after __flushProjectToIDB (what Backup / Sync / Stats-refresh / unload call):', JSON.stringify(await probe(page,id)));
  await close();
})();
