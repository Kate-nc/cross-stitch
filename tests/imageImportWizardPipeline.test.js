const fs = require('fs');
const vm = require('vm');
const {createCanvas, ImageData} = require('canvas');

function runtime() {
  const scope = {console, Uint8ClampedArray, Float32Array, addEventListener() {}, document:{createElement:()=>createCanvas(1,1)}};
  scope.window = scope; vm.createContext(scope);
  for(const file of ['constants.js','dmc-data.js','colour-utils.js','helpers.js','import-formats.js']) {
    vm.runInContext(fs.readFileSync(file,'utf8'),scope,{filename:file});
  }
  // Use the actual ownership predicate, including partial skeins.
  const stash = fs.readFileSync('stash-bridge.js','utf8');
  vm.runInContext(stash.slice(stash.indexOf('var PARTIAL_STATUS_FRACTIONS'),stash.indexOf('const StashBridge')),scope);
  return scope;
}
function source(w=40,h=20) {
  const c=createCanvas(w,h), x=c.getContext('2d');
  x.fillStyle='#e4002b';x.fillRect(0,0,w/2,h);
  x.fillStyle='#0055ff';x.fillRect(w/2,0,w/2,h);
  return c;
}
const base = {maxWidth:40,maxHeight:20,maxColours:8, crop:{rotate:0,flipH:false,flipV:false,aspect:'free'},
  palette:{mode:'dmc',maxColours:8,allowBlends:false}, settings:{dithAlgo:'off',contrast:0,skipBg:false,bgThreshold:15,preSmooth:false,saliency:false}};
const ids = result => Array.from(result.pattern,c=>c.id);

test('guided preview and committed import use identical complete settings and preserve blends in saved projects',()=>{
  const c=runtime(), img=source();
  const options={...base, crop:{rotate:90,flipH:true,aspect:'1:1'},
    palette:{...base.palette,allowBlends:true}, settings:{...base.settings,contrast:35,preSmooth:true,dithAlgo:'bayer'}};
  const preview=c.parseImagePattern(img,options), generated=c.parseImagePattern(img,options);
  expect(ids(generated)).toEqual(ids(preview));
  expect(generated.width).toBe(40);expect(generated.height).toBe(20);
  expect(ids(c.importResultToProject(generated,14,'test'))).toEqual(ids(preview));
  for(const cell of generated.pattern.filter(cell=>cell.id.includes('+'))) {
    expect(cell.type).toBe('blend');expect(cell.threads).toHaveLength(2);
  }
});

test('rotation, mirror and centred aspect crop change the sampled pixels before conversion',()=>{
  const c=runtime(), img=source();
  // Capture the actual canvas pixels before quantisation, independent of the catalogue.
  const captured=[];const quantize=c.quantizeConstrained;
  c.quantizeConstrained=(data,...args)=>{captured.push(Array.from(data));return quantize(data,...args)};
  c.parseImagePattern(img,base);
  c.parseImagePattern(img,{...base,crop:{...base.crop,flipH:true}});
  c.parseImagePattern(img,{...base,maxWidth:20,maxHeight:40,crop:{...base.crop,rotate:90}});
  c.parseImagePattern(img,{...base,crop:{...base.crop,aspect:'1:1'}});
  const pixel=(arr,x,y,w)=>arr.slice((y*w+x)*4,(y*w+x)*4+3);
  expect(pixel(captured[1],0,0,40)).toEqual(pixel(captured[0],39,0,40));
  expect(pixel(captured[2],0,0,20)).toEqual(pixel(captured[0],0,19,40));
  expect(pixel(captured[2],0,39,20)).toEqual(pixel(captured[0],39,19,40));
  expect(c.imageImportGeometry(img,{aspect:'1:1'})).toMatchObject({sx:10,sy:0,sw:20,sh:20});
  expect(captured[3]).toHaveLength(40*20*4);
});

test.each(['off','atkinson','bayer','riemersma'])('the %s selection dispatches the requested mapper and blend flag',algo=>{
  const c=runtime(), calls=[];
  for(const fn of ['doMap','doDither','doBayerDither','doRiemersma']) {
    const original=c[fn]; c[fn]=(...args)=>{calls.push([fn,args[4]]);return original(...args)};
  }
  c.parseImagePattern(source(),{...base,palette:{...base.palette,allowBlends:true},settings:{...base.settings,dithAlgo:algo}});
  expect(calls[0]).toEqual([{off:'doMap',atkinson:'doDither',bayer:'doBayerDither',riemersma:'doRiemersma'}[algo],true]);
});

test('stash mode accepts only owned DMC threads, including partial skeins; empty stash never falls back',()=>{
  const c=runtime(), options={...base,palette:{...base.palette,mode:'stash'},globalStash:{
    'dmc:310':{owned:1},'dmc:666':{owned:0,partialStatus:'remnant'},'anchor:403':{owned:3},'dmc:321':{owned:0}
  }};
  const r=c.parseImagePattern(source(),options);
  expect(ids(r).every(id=>['310','666'].includes(id))).toBe(true);
  expect(()=>c.parseImagePattern(source(),{...options,globalStash:{}})).toThrow(/stash is empty/);
  expect(()=>c.parseImagePattern(source(),{...options,globalStash:null})).toThrow(/stash is empty/);
});

test('contrast changes pixels, tolerance changes empty cells, and saliency does not change generated cells',()=>{
  const c=runtime(), img=createCanvas(20,20), x=img.getContext('2d');
  x.fillStyle='rgb(220,220,220)';x.fillRect(0,0,20,20);x.fillStyle='rgb(80,80,80)';x.fillRect(5,5,10,10);
  const opts={...base,maxWidth:20,maxHeight:20};
  const normal=c.parseImagePattern(img,opts);
  expect(ids(c.parseImagePattern(img,{...opts,settings:{...base.settings,contrast:50}}))).not.toEqual(ids(normal));
  const low=c.parseImagePattern(img,{...opts,settings:{...base.settings,skipBg:true,bgThreshold:3}});
  const high=c.parseImagePattern(img,{...opts,settings:{...base.settings,skipBg:true,bgThreshold:30}});
  expect(high.stitchCount).toBeLessThan(low.stitchCount);
  const salient=c.parseImagePattern(img,{...opts,settings:{...base.settings,saliency:true}});
  expect(ids(salient)).toEqual(ids(normal));expect(salient.saliencyMap).toHaveLength(400);
});

test('transparent and semi-transparent cells agree with quantisation alpha cutoff',()=>{
  const c=runtime(), img=createCanvas(10,10), x=img.getContext('2d');
  const data=new Uint8ClampedArray(400);
  for(let i=0;i<100;i++)data.set([200,20,30,i<50?127:255],i*4);
  x.putImageData(new ImageData(data,10,10),0,0);
  const r=c.parseImagePattern(img,{...base,maxWidth:10,maxHeight:10});
  expect(r.stitchCount).toBe(50);expect(ids(r).slice(0,50)).toEqual(Array(50).fill('__skip__'));
});

test('fractional aspect crops produce whole cell grids for legacy flat callers',()=>{
  const c=runtime(), r=c.parseImagePattern(source(31,20),{crop:{aspect:'4:3'},maxColours:3});
  expect(Number.isInteger(r.width)).toBe(true);expect(Number.isInteger(r.height)).toBe(true);
  expect(r.pattern).toHaveLength(r.width*r.height);
});

test('a picture entirely in a blended colour keeps both of the blend\'s threads',()=>{
  // Regression: palette pruning dropped 317 because no pixel had it as its
  // nearest solid, and the grey became 3799 (ΔE 6) instead of the blend (ΔE 0.3).
  const c=runtime(), img=source(30,10), x=img.getContext('2d');
  x.fillStyle='rgb(63,63,63)';x.fillRect(0,0,30,10);
  const r=c.parseImagePattern(img,{...base,maxWidth:30,maxHeight:10,
    palette:{mode:'stash',maxColours:2,allowBlends:true},globalStash:{'dmc:3799':{owned:1},'dmc:317':{owned:1}}});
  expect(new Set(r.pattern.map(cell=>cell.id))).toEqual(new Set(['317+3799']));
});

test('blend thread metadata survives conversion and project creation',()=>{
  const c=runtime(), img=source(30,10), x=img.getContext('2d');
  // Two greys close enough to blend (black and white are not: a blend of
  // threads that far apart reads as a tweed, so it is never offered).
  x.fillStyle='rgb(44,44,44)';x.fillRect(0,0,10,10);x.fillStyle='rgb(83,83,83)';x.fillRect(10,0,10,10);
  x.fillStyle='rgb(63,63,63)';x.fillRect(20,0,10,10);
  const r=c.parseImagePattern(img,{...base,maxWidth:30,maxHeight:10,
    palette:{mode:'stash',maxColours:2,allowBlends:true},globalStash:{'dmc:3799':{owned:1},'dmc:317':{owned:1}}});
  const blends=r.pattern.filter(cell=>cell.type==='blend');
  expect(blends.length).toBeGreaterThan(0);
  const saved=c.importResultToProject(r,14,'blend test');
  for(const [i,cell] of r.pattern.entries()) if(cell.type==='blend') {
    expect(cell.threads).toHaveLength(2);
    expect(saved.pattern[i].threads.map(t=>t.id)).toEqual(cell.threads.map(t=>t.id));
  }
});

test('shrinking averages the picture as light, so a fine checker becomes one even grey', () => {
  // A 1-pixel black and white checker at 5 pixels per stitch. Sampling it
  // (the old single drawImage) gave black, white or dark-grey stitches; the
  // light-correct average is about sRGB 188, a light grey.
  const c = runtime(), w = 200, h = 100, img = createCanvas(w, h), x = img.getContext('2d');
  const id = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = ((i % w) + Math.floor(i / w)) % 2 ? 255 : 0; id.data.set([v, v, v, 255], i * 4); }
  x.putImageData(id, 0, 0);
  const result = c.parseImagePattern(img, { ...base, maxWidth: 40, maxHeight: 20 });
  const threads = new Set(result.pattern.map((cell) => cell.id));
  expect(threads.size).toBe(1);
  const rgb = result.pattern[0].rgb, lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  expect(lum).toBeGreaterThan(165);
  expect(lum).toBeLessThan(210);
});

test('pixel art at its own size keeps its pixels: a half-pixel crop offset invents no blended colours', () => {
  // 101 x 100 alternating red and blue columns, cropped 1:1 to 100 x 100 at
  // its own size: the crop starts half a pixel in. With smoothing on, every
  // stitch became a red-blue mix, a colour the picture doesn't have.
  const c = runtime(), img = createCanvas(101, 100), x = img.getContext('2d');
  for (let i = 0; i < 101; i++) { x.fillStyle = i % 2 ? '#0055ff' : '#e4002b'; x.fillRect(i, 0, 1, 100); }
  const result = c.parseImagePattern(img, { ...base, maxWidth: 100, maxHeight: 100, crop: { ...base.crop, aspect: '1:1' } });
  expect(result.width).toBe(100);
  expect(new Set(result.pattern.map((cell) => cell.id)).size).toBe(2);
});
