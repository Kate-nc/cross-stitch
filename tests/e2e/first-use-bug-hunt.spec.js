// Separate adversarial pass: narrow layout, recovery controls and hidden settings.
const {test,expect}=require('@playwright/test');
const {installLocalCdn}=require('./local-cdn');
const {device,quietOnboarding,generateLogo}=require('./creator-helpers');
test.beforeEach(async({context})=>installLocalCdn(context));
test.describe('First-use bug hunt',()=>{
  test.use(device('desktop'));
  test('sample supports keyboard, collapse/reopen and narrow screens without a reset',async({page})=>{
    await page.setViewportSize({width:320,height:740});
    await page.goto('/home.html?tab=create');
    await page.getByText('Try the practice pattern',{exact:true}).click();
    const sample=page.locator('.home-sample');
    const cell=sample.getByRole('button',{name:'Row 1, column 3, DMC 321 Red',exact:true});
    await cell.focus();await page.keyboard.press('Space');
    await expect(cell).toHaveAttribute('aria-pressed','true');
    await sample.locator('summary').click();await sample.locator('summary').click();
    await expect(sample.getByRole('status')).toContainText('1 of');
    // Opening and closing Which files work? leaves the practice alone.
    await page.getByRole('button',{name:'Which files work?'}).click();
    await page.getByRole('button',{name:'Which files work?'}).click();
    await expect(cell).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    // Recovery stays findable on a first visit: Restore a backup in Home's footer and in the File menu.
    await expect(page.locator('.home-footer').getByText('Restore a backup',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'File',exact:true}).click();
    await expect(page.getByRole('button',{name:'Export Backup',exact:true})).toBeVisible();
    await expect(page.getByText('Restore from Backup…',{exact:true})).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  test('custom PDF density remains available through existing Export controls',async({page})=>{
    await generateLogo(page);
    await page.getByRole('tab',{name:'Materials',exact:true}).click();
    await page.getByRole('tab',{name:'Export',exact:true}).click();
    const select=page.getByLabel('Stitches per page',{exact:true});
    if (!(await select.isVisible())) await page.getByRole('button',{name:'Format & settings',exact:true}).click();
    await select.selectOption('custom');
    await page.getByLabel('Custom columns per PDF page').fill('90');
    await page.getByLabel('Custom rows per PDF page').fill('110');
    await expect(page.getByLabel('Custom columns per PDF page')).toHaveValue('90');
    await expect(page.getByLabel('Custom rows per PDF page')).toHaveValue('110');
    await page.getByRole('tab',{name:'Threads',exact:true}).click();
    await page.getByRole('tab',{name:'Export',exact:true}).click();
    await expect(select).toHaveValue('custom');
    await expect(page.getByLabel('Custom columns per PDF page')).toHaveValue('90');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
