const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
test('reviewed chart update and rollback preserve project progress and notes',async({page})=>{
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url());let file;
   if(url.hostname==='stitchx.test')file=path.join(process.cwd(),decodeURIComponent(url.pathname));
   else if(/react-dom.*\.js/.test(url.pathname))file=path.resolve('node_modules/react-dom/umd/react-dom.production.min.js');
   else if(/react.*\.js/.test(url.pathname))file=path.resolve('node_modules/react/umd/react.production.min.js');
   else if(/pako.*\.js/.test(url.pathname))file=path.resolve('node_modules/pako/dist/pako.min.js');
   if(file&&fs.existsSync(file)&&fs.statSync(file).isFile())await route.fulfill({path:file,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/javascript'});
   else await route.fulfill({status:404,body:''});
 });
 await page.goto('https://stitchx.test/home.html');
 await page.waitForFunction(()=>window.ChartUpdates&&window.ProjectStorage);
 await page.evaluate(async()=>{
   await ProjectStorage.save({id:'proj_smoke',name:'Smoke chart',settings:{sW:2,sH:1},pattern:[{id:'310'},{id:'666'}],done:[1,0],notes:'Retain this note'});
 });
 // Update chart lives in the project's More menu on Home.
 await page.locator('.home-pcard').getByRole('button',{name:'More actions for Smoke chart'}).click();
 await page.getByRole('menuitem',{name:/^Update chart/}).click();
 await page.getByRole('heading',{name:'Update chart: Smoke chart'}).waitFor();
 // Stub only the picker result: UI and storage are real browser code.
 await page.evaluate(()=>{window.ImportEngine.openImportPicker=async opts=>opts.onReviewedProject({settings:{sW:3,sH:1},pattern:[{id:'310'},{id:'321'},{id:'550'}],done:[1,1,1]},new File(['source'],'corrected.json',{type:'application/json'}));});
 await page.getByRole('button',{name:'Choose corrected chart or additional pages'}).click();
 await page.getByRole('heading',{name:'Differences',exact:true}).waitFor();
 if(!await page.getByRole('button',{name:'Apply reviewed update'}).isDisabled())throw Error('Apply enabled before alignment/resolution');
 await page.getByLabel('I have checked the page placement and old-to-new coordinate alignment').check();
 await page.getByLabel(/Changed thread, stitch or duplicate geometry/).selectOption('archive');
 await page.getByRole('button',{name:'Apply reviewed update'}).click();
 await page.getByText(/Chart updated\. A recoverable snapshot/).waitFor();
 let saved=await page.evaluate(()=>ProjectStorage.get('proj_smoke'));
 if(saved.notes!=='Retain this note'||JSON.stringify(saved.done)!=='[1,0,0]')throw Error('Wrong transferred progress/notes');
 await page.getByRole('button',{name:'Review recovery snapshots'}).click();
 await page.getByRole('button',{name:'Review rollback'}).first().click();
 await page.getByLabel('I have reviewed the rollback and want to restore this snapshot').check();
 await page.getByRole('button',{name:'Restore snapshot',exact:true}).click();
 await page.getByText('Snapshot restored. Inventory was retained.').waitFor();
 saved=await page.evaluate(()=>ProjectStorage.get('proj_smoke'));
 if(saved.settings.sW!==2||JSON.stringify(saved.done)!=='[1,0]')throw Error('Wrong rollback');
 if(errors.length)throw Error(errors.join('\n'));
 expect(errors).toEqual([]);
});
