const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'../tracker-app.js'),'utf8');
const helpers=src.slice(src.indexOf('function halfAtPoint('),src.indexOf('// Quarter stitches (fractional.js)',src.indexOf('function halfAtPoint(')));
function harness(extra={}){
  const ctx={
    _dragMarkActive:true,stitchRef:{current:{getBoundingClientRect:()=>({left:0,top:0})}},
    layerVis:{half:true},gridCoord:()=>({gx:0,gy:0}),scs:40,G:0,chartTileRef:{current:{x:0,y:0}},
    sW:1,sH:1,areaOn:false,workArea:null,pat:[{id:'310'}],doneRef:{current:new Uint8Array([1])},
    halfStitches:new Map([[0,{fwd:{id:'310'}}]]),isColourLocked:()=>false,
    halfStitchMatchesFocus:()=>false,_toggleHalfDone:jest.fn(),setHalfDisambig:jest.fn(),
    hitTestHalfStitch:()=> 'ambiguous',...extra
  };
  return {...new Function('ctx','with(ctx){'+helpers+'return {halfAtPoint,toggleHalfAtPoint}}')(ctx),ctx};
}
test('a completed full cell gives the half exclusive ownership; an incomplete full cell does not',()=>{
  expect(harness().halfAtPoint(10,10)).toEqual({idx:0,gx:0,gy:0});
  expect(harness({doneRef:{current:new Uint8Array([0])}}).halfAtPoint(10,10)).toBeNull();
});
test.each([{layerVis:{half:false}},{areaOn:true,window:{WorkArea:{contains:()=>false}}},{_dragMarkActive:false}])('hidden, outside-area or inactive halves cannot claim input: %o',extra=>{
  expect(harness(extra).halfAtPoint(10,10)).toBeNull();
});
test('a half-only cell can be claimed without a full stitch',()=>{
  expect(harness({pat:[{id:'__empty__'}],doneRef:{current:new Uint8Array([0])}}).halfAtPoint(10,10)).not.toBeNull();
});
test('colour lock rejects the half without falling through to a full-stitch toggle',()=>{
  const h=harness({isColourLocked:()=>true});
  const hit=h.halfAtPoint(10,10);expect(hit).not.toBeNull();
  h.toggleHalfAtPoint(hit,{clientX:10,clientY:10,preventDefault:jest.fn()});
  expect(h.ctx._toggleHalfDone).not.toHaveBeenCalled();
});
test('ambiguous halves retain the disambiguation popup',()=>{
  const h=harness({halfStitches:new Map([[0,{fwd:{id:'310'},bck:{id:'606'}}]])});
  h.toggleHalfAtPoint(h.halfAtPoint(10,10),{clientX:10,clientY:10,preventDefault:jest.fn()});
  expect(h.ctx.setHalfDisambig).toHaveBeenCalledWith({idx:0,x:10,y:10});
  expect(h.ctx._toggleHalfDone).not.toHaveBeenCalled();
});
