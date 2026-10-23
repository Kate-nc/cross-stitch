const {test, expect} = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./touch-helpers');

test('a sparse mouse stroke includes all crossed stitches and undoes in one step', async ({page}) => {
  await H.loadTrackerFixture(page);
  const a=await H.trackerCellPoint(page,1,2),b=await H.trackerCellPoint(page,9,2);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.mouse.up();
  await expect.poll(()=>H.trackerDoneCount(page)).toBe(9);
  await page.keyboard.press('Control+z');
  await expect.poll(()=>H.trackerDoneCount(page)).toBe(0);
});

test('Space-drag pans without marking, and a subsequent click still marks', async ({page}) => {
  await H.loadTrackerFixture(page);
  const a=await H.trackerCellPoint(page,8,5),b=await H.trackerCellPoint(page,4,5);
  await page.mouse.move(a.x,a.y);await page.keyboard.down('Space');await page.mouse.down();
  await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();await page.keyboard.up('Space');
  expect((await H.trackerScroll(page)).left).toBeGreaterThan(100);
  expect(await H.trackerDoneCount(page)).toBe(0);
  const c=await H.trackerCellPoint(page,8,5);await page.mouse.click(c.x,c.y);
  await expect.poll(()=>H.trackerDoneCount(page)).toBe(1);
});

test('drag gestures disabled still allows clicks and touch taps, but not strokes', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('cs_pref_trackerDragMark','false'));
  await H.loadTrackerFixture(page);
  const a=await H.trackerCellPoint(page,2,2),b=await H.trackerCellPoint(page,5,2);
  await page.mouse.click(a.x,a.y);
  await expect.poll(()=>H.trackerDoneCount(page)).toBe(1);
  const touch=await H.trackerTouchDriver(page);
  await touch('touchStart',[b]);await page.waitForTimeout(50);await touch('touchEnd',[]);
  await expect.poll(()=>H.trackerDoneCount(page)).toBe(2);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.mouse.up();
  expect(await H.trackerDoneCount(page)).toBe(2);
});

test('a half-stitch press preserves the completed full stitch and has one undo step', async ({page}) => {
  const project=JSON.parse(fs.readFileSync(H.ensureTrackerProjectFixture(),'utf8'));
  project.done[122]=1;project.halfStitches=[[122,{fwd:{id:'310'}}]];
  const file=path.join(__dirname,'../.tmp/gesture-mixed-half.json');
  fs.writeFileSync(file,JSON.stringify(project));
  await H.loadTrackerFixture(page,file);
  const a=await H.trackerCellPoint(page,2,2);
  const counts=page.locator('.info-strip-counts');
  await page.mouse.click(a.x,a.y);
  await expect(counts).toContainText('1.5 done');
  await page.keyboard.press('Control+z');
  await expect(counts).toContainText('1 done');
  await page.keyboard.press('Control+Shift+z');
  await expect(counts).toContainText('1.5 done');
  const touch=await H.trackerTouchDriver(page);
  await touch('touchStart',[a]);await page.waitForTimeout(50);await touch('touchEnd',[]);
  await expect(counts).toContainText('1 done');
  await page.mouse.move(a.x,a.y);await page.mouse.down();
  await page.mouse.move(a.x+40,a.y);await page.mouse.up();
  await expect(counts).toContainText('1 done');
});

test('a 350 ms touch marks once while a long-press still selects a rectangle', async ({page}) => {
  await H.loadTrackerFixture(page);
  const touch=await H.trackerTouchDriver(page),a=await H.trackerCellPoint(page,2,2);
  await touch('touchStart',[a]);await page.waitForTimeout(350);await touch('touchEnd',[]);
  await expect.poll(()=>H.trackerDoneCount(page)).toBe(1);
  const b=await H.trackerCellPoint(page,5,5),c=await H.trackerCellPoint(page,6,6);
  await touch('touchStart',[b]);await page.waitForTimeout(600);await touch('touchEnd',[]);
  expect(await H.trackerDoneCount(page)).toBe(1);
  await expect(page.locator('.range-anchor-bar')).toBeVisible();
  await touch('touchStart',[c]);await page.waitForTimeout(50);await touch('touchEnd',[]);
  await expect.poll(()=>H.trackerDoneCount(page)).toBe(5);
});

test('stroke previews stay live without rerendering the tracker for every move', async ({page}) => {
  await H.loadTrackerFixture(page);
  await page.evaluate(()=>{
    const original=window.useDragMark;
    window.gestureTrackerRenders=0;
    window.useDragMark=function(...args){window.gestureTrackerRenders++;return original(...args);};
  });
  const a=await H.trackerCellPoint(page,2,2),b=await H.trackerCellPoint(page,7,2);
  await page.mouse.move(a.x,a.y);await page.mouse.down();
  await page.evaluate(()=>{window.gestureTrackerRenders=0;});
  for(let i=0;i<20;i++)await page.mouse.move(a.x+(i%2),a.y);
  expect(await page.evaluate(()=>window.gestureTrackerRenders)).toBe(0);
  await page.mouse.move(b.x,b.y,{steps:20});
  await expect(page.locator('.drag-mark-cell')).toHaveCount(6);
  expect(await page.evaluate(()=>window.gestureTrackerRenders)).toBeLessThanOrEqual(1);
  await page.mouse.up();
  await expect.poll(()=>H.trackerDoneCount(page)).toBe(6);
});

test('turning off drag gestures cancels a waiting rectangle and leaves a plain click', async ({page}) => {
  await H.loadTrackerFixture(page);
  const touch=await H.trackerTouchDriver(page),a=await H.trackerCellPoint(page,2,2);
  await touch('touchStart',[a]);await page.waitForTimeout(600);await touch('touchEnd',[]);
  await expect(page.locator('.range-anchor-bar')).toBeVisible();
  await page.evaluate(()=>UserPrefs.set('trackerDragMark',false));
  // The normal modifier-key render also refreshes the current preferences.
  await page.keyboard.press('Shift');
  await expect(page.locator('.range-anchor-bar')).toHaveCount(0);
  const b=await H.trackerCellPoint(page,4,4);await page.mouse.click(b.x,b.y);
  await expect.poll(()=>H.trackerDoneCount(page)).toBe(1);
});
