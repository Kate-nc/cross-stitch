const fs = require('fs');
const vm = require('vm');
const { createCanvas } = require('canvas');

// Evaluate the complete classic script, including its lexical classes. No product test export.
function importer(options={}) {
  const c=vm.createContext({console,Map,Set,Uint8ClampedArray,pdfjsLib:{OPS:{},GlobalWorkerOptions:{}}});
  vm.runInContext(fs.readFileSync('pdf-importer.js','utf8'),c,{filename:'pdf-importer.js'});
  const Importer=vm.runInContext('PatternKeeperImporter',c);
  return new Importer(options);
}
function deferred() {
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
function page(textItems=[]) {
  return {
    getViewport:()=>({width:200,height:300,scale:1,convertToViewportPoint:(x,y)=>[x,300-y]}),
    getTextContent:async()=>({items:textItems}),
    getOperatorList:async()=>({fnArray:[],argsArray:[]}),
  };
}

test('page extraction preserves page order despite reversed completions and normalises text geometry',async()=>{
  const imp=importer(), gates=Array.from({length:4},deferred);
  const pdf={numPages:4,getPage:jest.fn(i=>gates[i-1].promise)};
  const pending=imp.extractAllPages(pdf);
  expect(pdf.getPage.mock.calls).toEqual([[1],[2],[3],[4]]);
  for(let i=3;i>=0;i--)gates[i].resolve(page([
    {str:i===0?'\u0001':'A',transform:[0,5,-5,0,20+i,40],width:7,height:8,fontName:'rotated'},
  ]));
  const out=await pending;
  expect(out.map(p=>p.pageIndex)).toEqual([1,2,3,4]);
  expect(out[0].textItems).toEqual([{str:'U+0001',x:20,y:260,width:7,height:8,fontName:'rotated',fontSize:5,rotated:true}]);
  expect(out[3].textItems[0].x).toBe(23);
  expect(out[0]._pdfPage).toBeDefined();
  expect(Object.keys(out[0])).not.toContain('_pdfPage');
  expect(JSON.parse(JSON.stringify(out[0]))._pdfPage).toBeUndefined();
});

test('cancellation during getPage prevents queued pages and extraction after the four active requests',async()=>{
  const cancelToken={aborted:false}, imp=importer({cancelToken});
  const gates=Array.from({length:4},deferred), p=page();
  p.getTextContent=jest.fn(p.getTextContent);
  const pdf={numPages:7,getPage:jest.fn(i=>gates[i-1].promise)};
  const pending=imp.extractAllPages(pdf), rejected=expect(pending).rejects.toMatchObject({name:'ImportAbortedError',message:'Import cancelled.'});
  cancelToken.aborted=true;gates.forEach(g=>g.resolve(p));await rejected;
  expect(pdf.getPage.mock.calls).toEqual([[1],[2],[3],[4]]);
  expect(p.getTextContent).not.toHaveBeenCalled();
});

test('cancellation while text/operators are pending stops symbol-picture work',async()=>{
  const cancelToken={aborted:false},imp=importer({cancelToken}),gate=deferred(),entered=deferred(),p=page();
  p.getTextContent=()=>{entered.resolve();return gate.promise;};
  const pictures=jest.spyOn(imp,'readSymbolPictures');
  const pending=imp.extractAllPages({numPages:1,getPage:async()=>p});
  const rejected=expect(pending).rejects.toMatchObject({name:'ImportAbortedError'});
  await entered.promise;cancelToken.aborted=true;gate.resolve({items:[]});await rejected;
  expect(pictures).not.toHaveBeenCalled();
});

test('raster bridge rounds dimensions, fills white and waits for render before reading pixels',async()=>{
  const gate=deferred(),entered=deferred();let ctx;
  const factory={create:jest.fn((w,h)=>{const canvas=createCanvas(w,h);ctx=canvas.getContext('2d');return {canvas,context:ctx};})};
  const imp=importer({canvasFactory:factory});
  const p={getViewport:jest.fn(()=>({width:10.2,height:8.1})),render:jest.fn(opts=>{
    expect(opts.canvasFactory).toBe(factory);entered.resolve();return {promise:gate.promise};
  })};
  const pending=imp.renderPagePixels(p,2);await entered.promise;
  expect(factory.create).toHaveBeenCalledWith(11,9);expect(p.getViewport).toHaveBeenCalledWith({scale:2});
  expect(Array.from(ctx.getImageData(5,5,1,1).data)).toEqual([255,255,255,255]);
  ctx.fillStyle='rgb(160,39,75)';ctx.fillRect(2,3,1,1);gate.resolve();
  const pixels=await pending;
  expect([pixels.width,pixels.height]).toEqual([11,9]);
  expect(Array.from(pixels.data.slice((3*11+2)*4,(3*11+2)*4+4))).toEqual([160,39,75,255]);
});

test('raster render failure propagates the original error without returning a blank image',async()=>{
  const failure=new Error('render failed');
  const imp=importer({canvasFactory:{create:(w,h)=>{const canvas=createCanvas(w,h);return {canvas,context:canvas.getContext('2d')};}}});
  await expect(imp.renderPagePixels({getViewport:()=>({width:2,height:2}),render:()=>({promise:Promise.reject(failure)})},1)).rejects.toBe(failure);
});
