const {W, prepare, runWorker} = require('./_helpers/conversionHarness');
const fs = require('fs'), vm = require('vm');

test('logo edge folding keeps at most five threads, no white fringe and the original coverage', async () => {
  const p = await prepare('tests/fixtures/logo.png', 100);
  const settings = {maxC:8,dith:false,dithAlgo:'off',allowBlends:false,skipBg:true,bgCol:[255,255,255],bgTh:15,minSt:0,smooth:0,stitchCleanup:{enabled:true,strength:'balanced',protectDetails:true,smoothDithering:true},orphans:2,disambig:false};
  const result = runWorker(p.linear.data, p.w, p.h, settings);
  const cells = result.mapped, threads = new Set(cells.filter(m=>m.id!=='__skip__').map(m=>m.id));
  expect(threads.size).toBeLessThanOrEqual(5);
  // No white thread beside the left-out background unless the picture is
  // white there: a white fringe would just be more background.
  const src = p.linear.data, w = p.w;
  const beside = (i) => [i%w>0?i-1:-1, i%w<w-1?i+1:-1, i-w, i+w].some(j => j>=0 && j<cells.length && cells[j].id==='__skip__');
  cells.forEach((m,i)=>{ if(m.id!=='__skip__'&&m.rgb.every(v=>v>235)&&beside(i)) expect([0,1,2].every(k=>src[i*4+k]>235)).toBe(true); });
  // The chart is converted with the background in, then the background is
  // left out: only stitches beside it may differ (the white lettering inside
  // the navy is the same either way).
  const withBackground = runWorker(p.linear.data, p.w, p.h, Object.assign({}, settings, {skipBg:false})).mapped;
  cells.forEach((m,i)=>{ if(m.id!=='__skip__'&&m.id!==withBackground[i].id) expect(beside(i)).toBe(true); });
  expect(result.confettiData.final.singlesPct).toBeLessThan(1);
  // The page pipeline must match the worker bit for bit.
  vm.runInContext(fs.readFileSync('creator/generate.js','utf8'),W);
  const page = W.runCleanupPipeline(new Uint8ClampedArray(p.linear.data),p.w,p.h,settings);
  expect(Array.from(page.mapped,m=>m.id)).toEqual(Array.from(cells,m=>m.id));
  const raw = new Uint8ClampedArray(p.linear.data);
  const mask = W.prepareConversionPixels(raw,p.w,p.h,settings);
  expect(cells.map(m=>m.id==='__skip__')).toEqual(Array.from(mask,v=>!v));
});
