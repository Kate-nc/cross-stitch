const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { installLocalCdn } = require('./local-cdn');
const { quietOnboarding, clickGenerate, waitForEdit } = require('./creator-helpers');
test.use({ video: 'off', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} });
test.beforeEach(async ({context, page}) => { await installLocalCdn(context); await quietOnboarding(page); });

async function seed(page, kind) {
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.evaluate(async kind => {
    const w = 48, h = 40;
    const black = {id:'310',type:'solid',rgb:[0,0,0]}, red = {id:'321',type:'solid',rgb:[199,43,59]};
    const blend = {id:'310+321',type:'blend',rgb:[100,22,30],threads:[black,red]};
    const pattern = Array.from({length:w*h}, (_,i) => {
      const x=i%w,y=Math.floor(i/w);
      if (kind==='sparse' || kind==='no-source') return x%9===0&&y%7===0 ? red : {id:'__empty__'};
      if (kind==='blends') return x<24 ? blend : black;
      if (kind==='low-colour') return y<20 ? black : red;
      return (Math.floor(x/4)+Math.floor(y/4))%2 ? red : black;
    });
    const id = await ProjectStorage.save({id:'proj_review', name:'Review '+kind, version:11,
      settings:{sW:w,sH:h,fabricCt:14,isScratchMode:kind==='no-source'}, pattern,
      bsLines: [{x1:0,y1:10,x2:48,y2:10,threadId:'310'}]});
    ProjectStorage.setActiveProject(id);
    UserPrefs.set('creator.materialsTab','review');
  }, kind);
  await page.goto('/create.html');
  await page.getByRole('tab',{name:'Materials',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ready to stitch',exact:true})).toBeVisible();
  await expect(page.locator('.ready-review canvas')).toHaveCount(4);
  await expect.poll(() => page.locator('.ready-review canvas').evaluateAll(cs => cs.every(c => c.width > 0 && c.height > 0))).toBe(true);
}
// The count is edited in one place, Edit > Project > Fabric; Ready to stitch shows it
// read-only with an Edit link there (UX-032).
async function setFabricCount(page, review, ct) {
  await expect(review.getByLabel('Fabric count',{exact:true})).toHaveCount(0);
  await review.getByRole('button',{name:'Edit fabric count in Edit, Project'}).click();
  await expect(page.locator('.creator-sidebar-tab[data-tab-id="project"]')).toHaveAttribute('aria-selected','true');
  await page.locator('.fabric-block__select').selectOption(String(ct));
  // On a phone the settings open as a drawer over the page; tap outside to close it.
  if (await page.locator('.rpanel-backdrop').count()) await page.locator('.rpanel-backdrop').click({position:{x:5,y:5}});
  await page.getByRole('tab',{name:'Materials',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ready to stitch',exact:true})).toBeVisible();
}
function screenshotPath(name) { const dir=path.resolve('reports/ready-to-stitch');fs.mkdirSync(dir,{recursive:true});return path.join(dir,name); }

for (const kind of ['pixel-art','low-colour','sparse','blends','no-source']) {
  test(kind+' chart is reviewable, sample export matches selection and fabric assumptions', async ({page}) => {
    await page.setViewportSize({width:kind==='no-source'?390:1440,height:1000});
    await seed(page,kind);
    const review = page.getByRole('region',{name:'Ready to stitch review'});
    await expect(review).toContainText('No source image.');
    await expect(review).toContainText('48 × 40 stitches; finished 3.4 × 2.9 in (8.7 × 7.3 cm)');
    const before = await page.evaluate(async()=>JSON.stringify((await ProjectStorage.get('proj_review')).pattern));
    // Leaving for Edit and coming back resets the sample fields, so change the count first.
    await setFabricCount(page, review, 28);
    await review.getByLabel('First column',{exact:true}).fill('6');
    await review.getByLabel('First row',{exact:true}).fill('8');
    await review.getByLabel('Width (stitches)',{exact:true}).fill('8');
    await review.getByLabel('Height (stitches)',{exact:true}).fill('6');
    await expect(page.getByTestId('sample-bounds')).toContainText('Columns 6–13, rows 8–13');
    await expect(review).toContainText('28 count, over 2; 2 strands; 20% waste; 8 m skeins');
    await expect(review).toContainText('48 × 40 stitches; finished 3.4 × 2.9 in');
    const downloadEvent=page.waitForEvent('download');
    await review.getByRole('button',{name:'Export sample chart PNG',exact:true}).click();
    const download=await downloadEvent;
    expect(download.suggestedFilename()).toBe('stitchx-sample-c6-r8-8x6.png');
    const img=await loadImage(fs.readFileSync(await download.path()));
    const sample=page.getByRole('img',{name:'Selected sample chart',exact:true});
    const dims=await sample.evaluate(c=>({w:c.width,h:c.height,data:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)}));
    expect(dims.w).toBe(186); expect(dims.h).toBe(146);
    const c=createCanvas(img.width,img.height),g=c.getContext('2d');g.drawImage(img,0,0);
    expect(Array.from(g.getImageData(0,100,dims.w,dims.h).data)).toEqual(dims.data);
    await setFabricCount(page, review, 18);
    await expect(review).toContainText('48 × 40 stitches; finished 2.7 × 2.2 in (6.8 × 5.6 cm)');
    if (kind==='blends'||kind==='no-source') {
      await review.scrollIntoViewIfNeeded();
      await page.screenshot({path:screenshotPath(kind+'.png'),fullPage:true});
      await review.getByRole('button',{name:'Export sample chart PNG',exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:screenshotPath(kind+'-sample.png'),fullPage:true});
    }
    // Edge selection clamps, and narrow screens contain their canvases.
    await review.getByLabel('First column',{exact:true}).fill('48');
    await expect(review.getByLabel('Width (stitches)',{exact:true})).toHaveValue('1');
    expect(await review.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
    await review.getByRole('button',{name:'Open adjustment and cleanup tools'}).click();
    await expect(page.locator('.ready-review')).toHaveCount(0);
    expect(await page.evaluate(async()=>JSON.stringify((await ProjectStorage.get('proj_review')).pattern))).toBe(before);
  });
}

test('portrait conversion retains original, current chart and actual stitch preview', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/home.html?tab=create');
  // Reuse the repository's synthetic portrait fixture generator (eyes,
  // eyebrows, nose, mouth and a skin gradient), not an external photograph.
  const src=fs.readFileSync('scripts/bug-hunt-usm.js','utf8');
  const start=src.indexOf('function makePortrait('),end=src.indexOf('\n}',start)+2;
  const portrait=new Function('createCanvas',src.slice(start,end)+';return makePortrait(128,160);')(createCanvas);
  await page.locator('input.home-create-file-input').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:portrait.toBuffer('image/png')});
  await page.waitForURL(/create\.html/);
  await clickGenerate(page);await waitForEdit(page);
  await page.getByRole('tab',{name:'Materials',exact:true}).click();
  await page.getByRole('tab',{name:'Ready to stitch',exact:true}).click();
  await expect(page.getByAltText('Original source image')).toBeVisible();
  await expect(page.getByRole('img',{name:'Current generated or drawn chart'})).toBeVisible();
  await expect(page.locator('.ready-review canvas')).toHaveCount(4);
  const dismiss=page.getByRole('button',{name:'Dismiss toast',exact:true});
  while (await dismiss.count()) await dismiss.first().click();
  await page.screenshot({path:screenshotPath('portrait.png'),fullPage:true});
  await page.getByLabel('First column',{exact:true}).fill('20');
  await page.getByLabel('First row',{exact:true}).fill('20');
  await page.getByRole('button',{name:'Enlarge sample cells',exact:true}).click();
  await page.getByRole('button',{name:'Export sample chart PNG',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:screenshotPath('portrait-sample.png'),fullPage:true});
  await page.getByRole('button',{name:'Review conversion settings',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ready to stitch',exact:true})).toHaveCount(0);
});

test('bug hunting: manual erase and undo refresh metrics, preview and materials without regeneration', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});await seed(page,'sparse');
  const review=page.getByRole('region',{name:'Ready to stitch review'});
  await expect(review).toContainText('36 full-cross cells');
  await review.getByRole('button',{name:'Open adjustment and cleanup tools'}).click();
  await expect(page.getByRole('button',{name:'Fix outline colours',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reduce confetti',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Erase tool',exact:true}).click();
  const point=await page.locator('.canvas-area canvas').first().evaluate(c=>{
    const b=c.getBoundingClientRect(),cell=(b.width-30)/48;
    return {x:b.left+28+cell*.5,y:b.top+28+cell*.5};
  });
  await page.mouse.click(point.x,point.y);
  await page.getByRole('tab',{name:'Materials',exact:true}).click();
  await expect(review).toContainText('35 full-cross cells');
  await review.getByRole('button',{name:'Open adjustment and cleanup tools'}).click();
  await page.getByRole('button',{name:'Undo',exact:true}).first().click();
  await page.getByRole('tab',{name:'Materials',exact:true}).click();
  await expect(review).toContainText('36 full-cross cells');
  await expect(review).toContainText('36 confetti stitches');
});

test('bug hunting: dark phone layout, enlarged samples and keyboard review tabs stay usable', async ({page}) => {
  await page.setViewportSize({width:390,height:844});await seed(page,'no-source');
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
  const review=page.getByRole('region',{name:'Ready to stitch review'});
  await review.getByLabel('Width (stitches)',{exact:true}).fill('48');
  await review.getByRole('button',{name:'Enlarge sample cells',exact:true}).click();
  expect(await review.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(review.getByRole('button',{name:'Export sample chart PNG',exact:true})).toBeEnabled();
  await page.getByRole('tab',{name:'Ready to stitch',exact:true}).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Threads',exact:true})).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('heading',{name:'Ready to stitch',exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:844});
  expect(await review.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
});
