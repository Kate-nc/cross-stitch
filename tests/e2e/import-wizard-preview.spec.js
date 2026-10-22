const path = require('path');
const {test, expect} = require('@playwright/test');
const ROOT = path.resolve(__dirname,'../..');

// Mount the production wizard and processing scripts without the rest of the
// application. This keeps timing/geometry assertions independent of startup,
// storage migrations and the Creator's separate conversion pipeline.
async function mount(page) {
  await page.route('**/wizard-harness', route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><main id="root"></main></body></html>'}));
  await page.goto('/wizard-harness');
  for(const file of ['node_modules/react/umd/react.development.js','node_modules/react-dom/umd/react-dom.development.js',
    'constants.js','dmc-data.js','colour-utils.js','helpers.js','stash-bridge.js','import-formats.js',
    'creator/useImportWizard.js','creator/ImportWizard.js']) await page.addScriptTag({path:path.join(ROOT,file)});
  await page.addStyleTag({path:path.join(ROOT,'styles.css')});
  await page.evaluate(async()=>{
    window.Tooltip=({children})=>React.createElement('span',null,children);
    window.CONFETTI_HELP=window.CONFETTI_HELP||{definition:'isolated stitches'};
    const c=document.createElement('canvas');c.width=40;c.height=20;const x=c.getContext('2d');
    x.fillStyle='rgb(220,220,220)';x.fillRect(0,0,40,20);
    x.fillStyle='#e4002b';x.fillRect(5,5,15,10);x.fillStyle='#0055ff';x.fillRect(20,5,15,10);
    const image=new Image();image.src=c.toDataURL();await image.decode();
    const hook=window.useImportWizard;
    window.useImportWizard=function(opts){const w=hook(opts);window.__wizard=w;return w;};
    const parser=window.parseImagePattern;
    window.__parses=[];
    window.parseImagePattern=function(img,opts){const r=parser(img,opts);window.__parses.push({options:opts,result:r});return r;};
    window.__wizardProps={image,baseName:'Test image',globalStash:{},onGenerate:settings=>{
      window.__generated=parser(image,{...settings,globalStash:window.__wizardProps.globalStash});
    }};
    window.__wizardRoot=ReactDOM.createRoot(document.getElementById('root'));
    ReactDOM.flushSync(()=>__wizardRoot.render(React.createElement(ImportWizard,__wizardProps)));
  });
}
async function next(page){await page.getByRole('button',{name:'Next',exact:true}).click();}
async function ready(page){await expect(page.getByAltText('Converted pattern preview')).toBeVisible();await expect(page.getByText('Updating preview…',{exact:true})).toHaveCount(0);}
const latest=page=>page.evaluate(()=>{
  const r=window.__parses.at(-1).result;return {ids:r.pattern.map(c=>c.id),width:r.width,height:r.height,count:r.stitchCount};
});
test.beforeEach(async({page})=>{await mount(page);});

test('rotated live preview, all processing settings and final generation agree',async({page})=>{
  await page.getByRole('button',{name:'Rotate 90°'}).click();
  await next(page);await next(page);
  await expect(page.getByLabel('Width (stitches)',{exact:true})).toHaveValue('20');
  await expect(page.getByLabel('Height (stitches)',{exact:true})).toHaveValue('40');
  await next(page);await ready(page);
  const before=await latest(page);
  await page.locator('#iw-dith').selectOption('bayer');
  await page.locator('#iw-contrast').focus();await page.keyboard.press('End');
  await page.getByLabel('Pre-smooth image (reduces confetti in flat colour areas)',{exact:true}).check();
  await ready(page);
  const tuned=await latest(page);expect(tuned.ids).not.toEqual(before.ids);
  const previewUrl=await page.getByAltText('Converted pattern preview').getAttribute('src');
  expect(previewUrl).not.toBe(await page.evaluate(()=>__wizardProps.image.src));
  await next(page);await ready(page);
  await expect(page.getByRole('button',{name:'Generate pattern'})).toBeEnabled();
  await page.getByRole('button',{name:'Generate pattern'}).click();
  expect(await page.evaluate(()=>__generated.pattern.map(c=>c.id))).toEqual(tuned.ids);
});

test('background tolerance refreshes confirmation stats and saliency stays out of generated cells',async({page})=>{
  await next(page);await next(page);await next(page);
  await page.getByLabel('Skip near-white background',{exact:true}).check();
  await page.locator('#iw-bgt').focus();await page.keyboard.press('Home');await ready(page);
  const low=await latest(page);
  await next(page);await ready(page);
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.locator('#iw-bgt').focus();await page.keyboard.press('End');await ready(page);
  const high=await latest(page);expect(high.count).toBeLessThan(low.count);
  await page.getByLabel('Show saliency overlay (advanced)',{exact:true}).check();await ready(page);
  await expect(page.getByAltText('Detail importance overlay')).toBeVisible();
  expect((await latest(page)).ids).toEqual(high.ids);
  await next(page);await ready(page);
  await page.getByRole('button',{name:'Generate pattern'}).click();
  expect(await page.evaluate(()=>__generated.pattern.map(c=>c.id))).toEqual(high.ids);
});

test('empty stash blocks generation and a stash update regenerates the preview',async({page})=>{
  await next(page);await page.getByRole('radio',{name:/From my stash/}).check();await next(page);await next(page);
  await expect(page.getByRole('alert')).toContainText('DMC stash is empty');
  await next(page);await expect(page.getByRole('button',{name:'Generate pattern'})).toBeDisabled();
  await page.evaluate(()=>{
    __wizardProps={...__wizardProps,globalStash:{'dmc:310':{owned:1},'anchor:403':{owned:5}}};
    ReactDOM.flushSync(()=>__wizardRoot.render(React.createElement(ImportWizard,__wizardProps)));
  });
  await ready(page);await expect(page.getByRole('button',{name:'Generate pattern'})).toBeEnabled();
  expect((await latest(page)).ids.every(id=>id==='310')).toBe(true);
});

test('rapid settings edits publish only the newest preview and closing cancels pending work',async({page})=>{
  await next(page);await next(page);await next(page);await ready(page);
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  const count=await page.evaluate(()=>__parses.length);
  await page.evaluate(()=>{
    ReactDOM.flushSync(()=>__wizard.setSettings({...__wizard.settings,contrast:10}));
    ReactDOM.flushSync(()=>__wizard.setSettings({...__wizard.settings,contrast:45}));
  });
  await page.clock.runFor(250);await ready(page);
  expect(await page.evaluate(()=>__parses.length)).toBe(count+1);
  expect(await page.evaluate(()=>__parses.at(-1).options.settings.contrast)).toBe(45);
  await page.evaluate(()=>{
    ReactDOM.flushSync(()=>__wizard.setSettings({...__wizard.settings,contrast:20}));
    __wizardRoot.unmount();
  });
  await page.clock.runFor(500);
  expect(await page.evaluate(()=>__parses.length)).toBe(count+1);
});

test('aspect lock follows crop and rotation while respecting the 500-stitch limit',async({page})=>{
  await page.getByRole('button',{name:'Rotate 90°'}).click();await next(page);await next(page);
  await page.getByLabel('Width (stitches)',{exact:true}).fill('500');
  await expect(page.getByLabel('Width (stitches)',{exact:true})).toHaveValue('250');
  await expect(page.getByLabel('Height (stitches)',{exact:true})).toHaveValue('500');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('radio',{name:'1:1',exact:true}).check();await next(page);await next(page);
  await expect(page.getByLabel('Width (stitches)',{exact:true})).toHaveValue('500');
  await expect(page.getByLabel('Height (stitches)',{exact:true})).toHaveValue('500');
});
