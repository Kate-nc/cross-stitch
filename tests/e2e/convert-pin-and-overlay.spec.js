const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
const {openConvertWithLogo,convertStep,previewView,device}=require('./creator-helpers');
test.beforeEach(async({context,page})=>{
  await installLocalCdn(context);
  await page.addInitScript(()=>{let hook;Object.defineProperty(window,'useCreatorState',{configurable:true,get:()=>hook,set:fn=>{hook=function(){const state=fn();window.__previewState=state;return state;};}});});
});
async function settled(page){await expect.poll(()=>page.evaluate(()=>{const s=window.__previewState;return !!(s&&s.previewSnapshot&&!s.previewLoading&&s.previewSnapshot.signature===window.conversionSignature(s.conversionSettings));}),{timeout:30000}).toBe(true);await expect(page.getByRole('button',{name:'Pin this preview',exact:true})).toBeEnabled({timeout:30000});}
async function open(page){await openConvertWithLogo(page);await settled(page);}
for(const name of ['desktop','Pixel 5'])test.describe(name,()=>{
 test.use(device(name));
 test('preview fills the phone and picture buttons fit',async({page})=>{
  await open(page);
  const result=await page.evaluate(()=>{const p=document.querySelector('.cvp').getBoundingClientRect();return {width:p.width,screen:innerWidth,buttons:[...document.querySelectorAll('.cvp-source button,.cvp button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,right:r.right};})};});
  if(name==='Pixel 5')expect(result.width).toBeGreaterThanOrEqual(result.screen*.9);
  for(const b of result.buttons){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(result.screen);}
  await page.screenshot({path:`reports/convert-preview-finish/after-${name==='desktop'?'desktop':'phone'}.png`,fullPage:true});
 });
 test('thread selection persists across all views and toggles off',async({page})=>{
  await open(page);const button=page.locator('.cv-thread').first();await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
  for(const view of ['stitched','flat','compare']){await previewView(page,view);await expect(page.getByTestId(view==='compare'?'cmp-highlight':'cvp-highlight')).toHaveCount(1);}
  await button.click();await expect(page.locator('[data-testid$="highlight"]')).toHaveCount(0);
 });
 test('one change overlay works in all views',async({page})=>{
  await open(page);await page.evaluate(()=>__previewState.setBri(35));await settled(page);
  const button=page.getByRole('button',{name:'Show what changed',exact:true});await expect(button).toBeVisible();
  await expect(page.getByTestId('cvp-changed')).toHaveCount(0);await button.click();
  for(const view of ['stitched','flat','compare']){await previewView(page,view);await expect(page.getByTestId('cvp-changed')).toHaveCount(1);await expect(button).toHaveCount(1);await page.screenshot({path:`reports/convert-preview-finish/changed-${view}-${name==='desktop'?'desktop':'phone'}.png`,fullPage:true});}
  await button.click();await expect(page.getByTestId('cvp-changed')).toHaveCount(0);
 });
 test('pin survives settings changes, restores all settings and clears for another source',async({page})=>{
  await open(page);await page.getByRole('button',{name:'Pin this preview',exact:true}).click();
  const before=await page.evaluate(()=>JSON.stringify(__previewState.pinnedPreview));
  const restore=await page.evaluate(()=>__previewState.previewRestoreSettings);
  await page.evaluate(()=>__previewState.setBri(30));await settled(page);
  await expect(page.getByRole('region',{name:'Pinned comparison'})).toContainText('stitches changed');
  // Change every independent conversion value, including the raw thread cap
  // masked by stash constraints, geometry, fabric and style provenance.
  await page.evaluate(()=>{const s=__previewState;s.setSW(80);s.setSH(60);s.setArLock(false);s.setBri(12);s.setCon(14);s.setSat(-10);s.setSmooth(1);s.setSmoothType('gaussian');s.setPreSharpen(true);s.setPreSharpenAmount(.7);s.setMaxC(12);s.setDithMode('bayer8');s.setAllowBlends(true);s.setMinSt(2);s.setSkipBg(false);s.setBgCol([200,200,200]);s.setBgTh(12);s.setStitchCleanup({...s.stitchCleanup,protectDetails:false});s.setOrphans(1);s.setDisambig(true);s.setDisambigLevel('gentle');s.setFabricCt(14);s.setFabricColour('#E8D9B5');s.setGlobalStash({});s.setStashConstrained(true);s.setVariationSeed(1337);s.setVariationSubset(null);s.setPresetApplied(null);});
  await settled(page);expect(await page.evaluate(()=>JSON.stringify(__previewState.pinnedPreview))).toBe(before);
  const comparison=page.getByRole('region',{name:'Pinned comparison'});await expect(comparison).toContainText('Size changed; cells cannot be compared directly');await expect(comparison).toContainText('confetti');await expect(comparison).toContainText('skeins');
  await page.screenshot({path:`reports/convert-preview-finish/pinned-${name==='desktop'?'desktop':'phone'}.png`,fullPage:true});
  await page.getByRole('button',{name:'Apply pinned settings'}).click();await settled(page);
  expect(await page.evaluate(()=>__previewState.previewRestoreSettings)).toEqual(restore);
  expect(await page.evaluate(()=>__previewState.previewSnapshot.signature)).toBe(await page.evaluate(()=>__previewState.pinnedPreview.signature));
  // A crop is also a new Image object, so this covers both source changes.
  await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=20;c.height=20;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,20,20);const img=new Image();img.src=c.toDataURL();await img.decode();__previewState.setImg(img);});
  await expect(comparison).toHaveCount(0);
 });
});

test('a pin restores exact mode, brand and the raw thread limit hidden by a stash',async({page})=>{
 await open(page);
 await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=12;c.height=12;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,12,12);x.fillStyle='blue';x.fillRect(0,0,6,12);
  const img=new Image();img.src=c.toDataURL();await img.decode();__previewState.setImg(img);
 });
 await page.evaluate(()=>{const s=__previewState;s.setSW(12);s.setSH(12);s.setExactPixelArt(true);s.setStashConstrained(true);s.setGlobalStash({'dmc:310':{owned:1},'dmc:321':{owned:1}});s.setMaxC(27);});
 await settled(page);await page.getByRole('button',{name:'Pin this preview',exact:true}).click();
 const restore=await page.evaluate(()=>__previewState.previewRestoreSettings);
 await page.evaluate(async()=>{await window.loadThreadBrand('anchor');const s=__previewState;s.setExactPixelArt(false);s.setConvertBrand('anchor');s.setStashConstrained(false);s.setMaxC(8);});
 await settled(page);await page.getByRole('button',{name:'Apply pinned settings'}).click();await settled(page);
 expect(await page.evaluate(()=>__previewState.previewRestoreSettings)).toEqual(restore);
});
