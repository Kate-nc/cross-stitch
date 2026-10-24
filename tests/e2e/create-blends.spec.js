const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
const {device,quietOnboarding,startBlankGrid,isCompact,openConvertWithLogo}=require('./creator-helpers');
test.beforeEach(async({context,page})=>{
  await installLocalCdn(context);await quietOnboarding(page);
  await page.addInitScript(()=>localStorage.setItem('cs_welcome_creator-scratch_done','1'));
});
for(const name of ['desktop','iPad Mini','Pixel 5']) {
 test.describe('Physical blends on '+name,()=>{
  test.use(device(name));
  test('keyboard picker previews recipes, reaches all results and prevents reversed duplicates',async({page})=>{
    await startBlankGrid(page);
    if(await isCompact(page))await page.locator('.creator-rail__colour').click();
    const picker=page.getByRole('region',{name:'Add colour',exact:true});
    await picker.getByRole('button',{name:'Blend (2 threads)',exact:true}).click();
    const choice=picker.getByRole('button',{name:/^Choose DMC /});
    await expect(choice).toHaveCount(60);
    await picker.getByRole('button',{name:/Show more threads/}).click();
    await expect(choice).toHaveCount(120);
    const search=picker.getByRole('textbox',{name:'Search DMC threads',exact:true});
    async function choose(id){await search.fill(id);const button=picker.getByRole('button',{name:new RegExp('^Choose DMC '+id+' ')});await button.focus();await button.press('Enter');}
    await choose('317');await choose('3799');
    await expect(picker.getByRole('group',{name:'Blend appearance preview'})).toBeVisible();
    await expect(picker.getByText('1 strand of each; 2 strands total.',{exact:false})).toBeVisible();
    await picker.getByRole('button',{name:'Remove thread 2',exact:true}).focus();
    await page.keyboard.press('Enter');
    await expect(picker.getByRole('group',{name:'Blend appearance preview'})).toHaveCount(0);
    await choose('3799');
    await picker.getByRole('button',{name:'Add blend 317+3799',exact:true}).click();
    await expect(page.locator('.pal-rows .pal-row')).toHaveCount(1);
    if(!await picker.isVisible())await page.getByRole('button',{name:'Add colour',exact:true}).click();
    await picker.getByRole('button',{name:'Blend (2 threads)',exact:true}).click();
    await choose('3799');await choose('317');
    await picker.getByRole('button',{name:'Select existing blend',exact:true}).click();
    await expect(page.locator('.pal-rows .pal-row')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
  test('Compare options offers blends on and off with complexity and coverage',async({page})=>{
    await openConvertWithLogo(page);
    await page.waitForSelector('.compare-strip');
    const compare=page.locator('.compare-strip');
    if(!await compare.getByRole('radiogroup',{name:'Compare by'}).isVisible())await compare.getByRole('button',{name:'Compare options',exact:true}).click();
    await compare.getByRole('radio',{name:'Blends',exact:true}).click();
    await expect(compare.locator('.compare-strip__option')).toHaveCount(2);
    await expect(compare.getByText(/symbols · \d+ blends/).first()).toBeVisible({timeout:30000});
    const withBlends=compare.locator('[data-compare-option="with"]');
    await expect(withBlends).toBeEnabled();await withBlends.click();
    await expect(withBlends).toHaveAttribute('aria-pressed','true');
  });
 });
}
