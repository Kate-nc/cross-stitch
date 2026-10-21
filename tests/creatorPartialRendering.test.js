const fs=require('fs');
const vm=require('vm');
const {createCanvas}=require('canvas');

function renderer() {
  const c=vm.createContext({console,Map,Set,Uint8Array,CK:4,ProgressUnits:require('../progress-units'),addEventListener(){},
    document:{createElement:()=>createCanvas(1,1)}});
  c.window=c;
  // Load the same helper and renderer scripts as create.html, in that order.
  for(const file of ['colour-utils.js','helpers.js','creator/symbolFontSpec.js','creator/canvasRenderer.js'])
    vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
  return c;
}
const red={id:'red',rgb:[220,20,20]},blue={id:'blue',rgb:[20,40,220]};
function state() {
  return {sW:4,sH:2,view:'color',showCtr:false,bsLines:[],fabricColour:'#ffffff',
    pat:Array.from({length:8},()=>({id:'__empty__'})),cmap:{red:{...red,symbol:'R'},blue:{...blue,symbol:'B'}},
    partialStitches:new Map([[0,{TL:red}],[1,{TR:red,BL:red}],[2,{TL:blue,TR:blue,BL:blue}],[3,{BR:red}],[4,{TL:red,TR:blue}]])};
}
const pixel=(ctx,x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);

test('quarter, half and three-quarter stitches paint distinct cells, respecting viewport offsets',()=>{
  const r=renderer(),s=state(),canvas=createCanvas(162,82),ctx=canvas.getContext('2d');
  r.drawPatternBaseOnCanvas(ctx,0,0,4,2,40,0,s);
  expect(pixel(ctx,5,5)).toEqual([220,20,20,255]);
  expect(pixel(ctx,34,34)).toEqual([251,251,251,255]);
  // Half stitches carry a subtle tint and a diagonal thread line.
  expect(pixel(ctx,74,5)[0]).toBeGreaterThan(pixel(ctx,74,5)[1]);
  expect(pixel(ctx,45,5)).toEqual([251,251,251,255]);
  expect(pixel(ctx,85,5)).toEqual([20,40,220,255]);
  expect(pixel(ctx,114,34)).toEqual([251,251,251,255]);
  const cropped=createCanvas(82,42).getContext('2d');
  r.drawPatternBaseOnCanvas(cropped,1,0,2,1,40,0,s);
  for(const [x,y] of [[5,5],[34,5],[45,5],[74,34]])
    expect(pixel(cropped,x,y)).toEqual(pixel(ctx,x+40,y));
  expect(s.partialStitches.get(0)).toEqual({TL:red});
});

test.each(['color','symbol','both'])('banded base rendering preserves all partial-stitch pixels in %s view',view=>{
  const r=renderer(),s={...state(),view},full=createCanvas(178,98),banded=createCanvas(178,98);
  // Symbol colour selection uses the actual shared luminance helper.
  const a=full.getContext('2d'),b=banded.getContext('2d'),draw=(ctx,cells)=>r.drawPatternBaseOnCanvas(ctx,0,0,4,2,40,16,s,cells);
  draw(a);
  draw(b,{x0:0,y0:0,x1:0,y1:0,fill:'all',lines:false});
  for(let y=0;y<2;y++)draw(b,{x0:0,y0:y,x1:4,y1:y+1,frame:false,lines:false,fill:false});
  draw(b,{x0:0,y0:0,x1:0,y1:0,frame:false,fill:false});
  expect(Buffer.from(b.getImageData(0,0,178,98).data)).toEqual(Buffer.from(a.getImageData(0,0,178,98).data));
});
