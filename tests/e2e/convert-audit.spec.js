const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
const {openConvertWithLogo,convertStep}=require('./creator-helpers');
test.beforeEach(async({context,page})=>{
 await installLocalCdn(context);
 await page.addInitScript(()=>{let hook;Object.defineProperty(window,'useCreatorState',{configurable:true,get:()=>hook,set:fn=>{hook=function(){const s=fn();window.__auditState=s;return s;};}});});
});
async function settled(page){await expect.poll(()=>page.evaluate(()=>{const s=window.__auditState;return !!(s&&s.previewSnapshot&&!s.previewLoading&&s.previewSnapshot.signature===conversionSignature(s.conversionSettings));}),{timeout:30000}).toBe(true);}
async function open(page){await openConvertWithLogo(page);await settled(page);}

test('a same-count stash replacement reports the actual changed cells',async({page})=>{
 await open(page);
 await page.evaluate(()=>{const s=__auditState;s.setGlobalStash({'dmc:310':{owned:1},'dmc:321':{owned:1}});s.setStashConstrained(true);s.setMaxC(2);});await settled(page);
 await page.getByRole('button',{name:'Pin this preview',exact:true}).click();
 await page.evaluate(()=>__auditState.setGlobalStash({'dmc:742':{owned:1},'dmc:820':{owned:1}}));await settled(page);
 const changed=await page.evaluate(()=>{const a=__auditState.pinnedPreview.ids,b=__auditState.previewSnapshot.ids;return b.reduce((n,id,i)=>n+(id!==a[i]?1:0),0);});
 expect(changed).toBeGreaterThan(0);
 await expect(page.locator('.cv-pin .cvp-change')).toContainText(changed.toLocaleString('en-GB')+' stitches changed');
});

test('phone switching mounts only the selected picture, and resizing restores both',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Pin this preview',exact:true}).click();
 const pin=page.getByRole('region',{name:'Pinned comparison'});
 await page.setViewportSize({width:393,height:851});
 await expect(pin.locator('canvas')).toHaveCount(1);
 await expect(pin.locator('figure[data-version="current"]')).toBeVisible();
 await pin.getByRole('button',{name:'Pinned',exact:true}).click();
 await expect(pin.locator('canvas')).toHaveCount(1);
 await expect(pin.locator('figure[data-version="pinned"]')).toBeVisible();
 await page.setViewportSize({width:1440,height:1000});
 await expect(pin.locator('canvas')).toHaveCount(2);
});

test('cost fallback renders a pound sign when the currency formatter is unavailable',async({page})=>{
 await open(page);
 await page.evaluate(()=>{window.AppPrefs={};__auditState.setSkeinPrice(1.23);});
 const cost=page.locator('.cv-estimates dt').filter({hasText:/^Cost$/}).locator('xpath=following-sibling::dd[1]');
 await expect(cost).toHaveText(/^£\d+\.\d{2}$/);
});

test('pinned change counts from a smaller page preview are labelled as estimates',async({page})=>{
 await page.addInitScript(()=>{window.Worker=undefined;});
 await open(page);
 await page.evaluate(()=>{__auditState.setSW(220);__auditState.setSH(220);});await settled(page);
 expect(await page.evaluate(()=>__auditState.previewSnapshot.estimated)).toBe(true);
 await page.getByRole('button',{name:'Pin this preview',exact:true}).click();
 await page.evaluate(()=>__auditState.setBri(35));await settled(page);
 await expect(page.locator('.cv-pin .cvp-change')).toHaveText(/^About [\d,]+ stitches changed/);
});


test('Balanced and Tidier can be compared and restored through the settings controls',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Pin this preview',exact:true}).click();
 await convertStep(page,'detail');
 const choices=page.getByRole('radiogroup',{name:'Detail and tidiness'});
 await choices.getByRole('radio',{name:'Tidier',exact:true}).click();await settled(page);
 const drawer=page.locator('.rpanel-drawer-header');
 if(await drawer.isVisible()&&await drawer.getAttribute('aria-expanded')==='true')await drawer.click();
 const pin=page.getByRole('region',{name:'Pinned comparison'});
 await expect(pin).toContainText('Pinned preview: Balanced');await expect(pin).toContainText('Current: Tidier');
 await pin.getByRole('button',{name:'Apply pinned settings'}).click();await settled(page);
 await convertStep(page,'detail');
 await expect(choices.getByRole('radio',{name:'Balanced',exact:true})).toHaveAttribute('aria-checked','true');
});
