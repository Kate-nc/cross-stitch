const {test,expect} = require('@playwright/test');
const path = require('path');
const root = path.resolve(__dirname,'../..');
for (const width of [1280,390]) {
  test('verification and repair access at '+width+'px', async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>');
    await page.addStyleTag({path:path.join(root,'styles.css')});
    for (const file of ['node_modules/react/umd/react.development.js','node_modules/react-dom/umd/react-dom.development.js','import-engine/pipeline/validate.js','import-engine/ui/ImportReviewModal.js']) {
      await page.addScriptTag({path:path.join(root,file)});
    }
    await page.evaluate(()=>{
      const project={w:2,h:2,settings:{sW:2,sH:2},pattern:Array(4).fill({id:'310',rgb:[0,0,0]}),importReport:{keyEntries:1,matched:{symbol:4},warnings:['Repeated note']}};
      window.reviewRoot=ReactDOM.createRoot(document.getElementById('root'));
      window.reviewRoot.render(React.createElement(ImportEngine.ImportReviewModal,{project,warnings:[{message:'Repeated note',severity:'high'}],originalFileUrl:'data:text/plain,source',originalFileName:'chart.oxs'}));
    });
    await expect(page.getByRole('status')).toHaveText('Usable import with limitations');
    await expect(page.locator('.import-review-coverage')).toHaveText('100% matched to the key');
    await expect(page.locator('.import-review-verification li')).toHaveCount(6);
    await expect(page.locator('.import-warning')).toHaveCount(1);
    await expect(page.getByRole('button',{name:'Open guided wizard'})).toHaveCount(0);
    const download=page.getByRole('link',{name:'Download original source'});
    await expect(download).toHaveAttribute('download','chart.oxs');
    await download.scrollIntoViewIfNeeded();
    await expect(download).toBeVisible();
    const bounds=await page.evaluate(()=>{
      const v=document.querySelector('.import-review-verification').getBoundingClientRect();
      const b=document.querySelector('.import-review-body').getBoundingClientRect();
      const f=document.querySelector('.import-review-footer').getBoundingClientRect();
      return {scroll:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight,verificationBottom:v.bottom,bodyTop:b.top,footerBottom:f.bottom};
    });
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
    expect(bounds.verificationBottom).toBeLessThanOrEqual(bounds.bodyTop+1);
    expect(bounds.footerBottom).toBeLessThanOrEqual(bounds.height+1);
    await page.evaluate(()=>{
      window.getDmcByIdCI=id=>({id,name:'Black',rgb:[0,0,0]});
      const p={w:1,h:1,settings:{sW:1,sH:1},pattern:[{id:'U1',rgb:[0,0,0]}],importReport:{keyEntries:1,matched:{unresolved:1},placeholders:[{id:'U1',count:1}],warnings:[]}};
      const fixed=ImportEngine.mergeEdits(p,{threads:{U1:'310'}});
      window.reviewRoot.render(React.createElement(ImportEngine.ImportReviewModal,{project:fixed,warnings:[{code:'THREAD_REFERENCE',message:'Stale missing thread',severity:'high'}]}));
    });
    await expect(page.getByText('Stale missing thread')).toHaveCount(0);
  });
}
