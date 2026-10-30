const {W, prepare, runWorker} = require('../scripts/conversion-accuracy/harness');
const fs = require('fs'), vm = require('vm');

test('logo edge folding keeps at most five threads, no white threads and the original coverage', async () => {
  const p = await prepare('tests/fixtures/logo.png', 100);
  const settings = {maxC:8,dith:false,dithAlgo:'off',allowBlends:false,skipBg:true,bgCol:[255,255,255],bgTh:15,minSt:0,smooth:0,stitchCleanup:{enabled:true,strength:'balanced',protectDetails:true,smoothDithering:true},orphans:2,disambig:false};
  const result = runWorker(p.linear.data, p.w, p.h, settings);
  const cells = result.mapped, threads = new Set(cells.filter(m=>m.id!=='__skip__').map(m=>m.id));
  expect(threads.size).toBeLessThanOrEqual(5);
  // White thread only where the picture itself is white (the logo has white
  // lettering inside the navy): never from background edges or fringes.
  const src = p.linear.data;
  cells.forEach((m,i)=>{ if(m.id!=='__skip__'&&m.rgb.every(v=>v>235)) expect([0,1,2].every(k=>src[i*4+k]>235)).toBe(true); });
  expect(result.confettiData.final.singlesPct).toBeLessThan(1);
  // The page pipeline must match the worker bit for bit.
  vm.runInContext(fs.readFileSync('creator/generate.js','utf8'),W);
  const page = W.runCleanupPipeline(new Uint8ClampedArray(p.linear.data),p.w,p.h,settings);
  expect(Array.from(page.mapped,m=>m.id)).toEqual(Array.from(cells,m=>m.id));
  const raw = new Uint8ClampedArray(p.linear.data);
  const mask = W.prepareConversionPixels(raw,p.w,p.h,settings);
  expect(cells.map(m=>m.id==='__skip__')).toEqual(Array.from(mask,v=>!v));
});
