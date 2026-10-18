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
    await page.getByText('Try a sample project',{exact:true}).click();
    const sample=page.locator('.home-sample');
    const cell=sample.getByRole('button',{name:'Row 1, column 3, DMC 321 Red',exact:true});
    await cell.focus();await page.keyboard.press('Space');
    await expect(cell).toHaveAttribute('aria-pressed','true');
    await sample.locator('summary').click();await sample.locator('summary').click();
    await expect(sample.getByRole('status')).toContainText('1 of');
    await page.getByRole('tab',{name:'Stats',exact:true}).click();
    await page.goBack();await page.goForward();
    await expect(page.getByRole('tab',{name:'Stats',exact:true})).toHaveAttribute('aria-selected','true');
    await page.goBack();await expect(cell).toHaveAttribute('aria-pressed','true');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByText('Saving, recovery and advanced tools',{exact:true}).click();
    await expect(page.getByText(/conversion drafts stay on this device/)).toBeVisible();
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
