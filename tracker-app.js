const{useState,useRef,useCallback,useEffect,useMemo}=React;
// Central shortcut registry hooks (loaded by shortcuts.js before tracker-app.js).
// Fall back to no-op stubs in case the script failed to load — tracker still
// renders, just without keyboard shortcuts.
const useShortcuts = (typeof window!=='undefined' && window.useShortcuts) || (function(){});
const useScope     = (typeof window!=='undefined' && window.useScope)     || (function(){});
// deepClone: prefer structuredClone (faster) with JSON fallback for older browsers.
const deepClone=typeof structuredClone==='function'?structuredClone:(x)=>JSON.parse(JSON.stringify(x));

// How far beyond the visible viewport drawStitch paints, in canvas px. The
// chart is only ever painted for the visible slice plus this margin, so the
// margin is also how far the user can scroll before a repaint is needed —
// renderStitch and the scroll handler both derive their answer from here so
// the two cannot drift apart.
function chartOverdraw(cSz){return Math.max(40,20*cSz);}

// "#rgb", "#rrggbb" or "rgb(r,g,b)" as [r,g,b], or null for anything else.
// Used to put the chart's flat cell colours into image pixels (drawStitch).
function parseChartColour(c){
  if(typeof c!=="string")return null;
  let m=/^#([0-9a-f]{3})$/i.exec(c);
  if(m)return[0,1,2].map(i=>parseInt(m[1][i]+m[1][i],16));
  m=/^#([0-9a-f]{6})$/i.exec(c);
  if(m)return[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16));
  m=/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(c);
  if(m)return[+m[1],+m[2],+m[3]];
  return null;
}
// The chart's cell outlines as grid lines (see drawStitch). codes holds each
// cell's outline style, row by row, w x h cells from chart pixel x0, y0: 0 for
// none, then OUTLINE_LINE's entries. A grid line takes the style of the cell
// after it (right or below), else of the cell before, and each run of one
// style is one fillRect, 1 px wide and centred on the line like the strokes
// it replaces. The colours are a single layer as dark, overall, as the two
// layers and one that per-cell strokes left on the two sides of an edge.
const OUTLINE_LINE=[null,"rgba(0,0,0,0.117)","rgba(0,0,0,0.045)","rgba(0,0,0,0.088)","rgba(220,50,50,0.344)"];
function drawOutlineGrid(ctx,codes,w,h,x0,y0,cSz){
  let cur=0;
  const put=(code,x,y,rw,rh)=>{if(code!==cur){ctx.fillStyle=OUTLINE_LINE[code];cur=code;}ctx.fillRect(x,y,rw,rh);};
  for(let bx=0;bx<=w;bx++){
    let rc=0,rs=0;
    for(let j=0;j<=h;j++){
      const code=j<h?((bx<w?codes[j*w+bx]:0)||(bx>0?codes[j*w+bx-1]:0)):0;
      if(code!==rc){if(rc)put(rc,x0+bx*cSz-0.5,y0+rs*cSz,1,(j-rs)*cSz);rc=code;rs=j;}
    }
  }
  for(let by=0;by<=h;by++){
    let rc=0,rs=0;
    for(let i=0;i<=w;i++){
      const code=i<w?((by<h?codes[by*w+i]:0)||(by>0?codes[(by-1)*w+i]:0)):0;
      if(code!==rc){if(rc)put(rc,x0+rs*cSz,y0+by*cSz-0.5,(i-rs)*cSz,1);rc=code;rs=i;}
    }
  }
}
// The small canvas drawStitch builds its one-pixel-per-cell image in, shared
// by every paint (they run one at a time) and grown as needed.
let _cellImageCanvas=null;
function cellImageCanvas(w,h){
  if(typeof document==="undefined")return null;
  if(!_cellImageCanvas)_cellImageCanvas=document.createElement("canvas");
  if(_cellImageCanvas.width<w)_cellImageCanvas.width=w;
  if(_cellImageCanvas.height<h)_cellImageCanvas.height=h;
  return _cellImageCanvas;
}

// The analysis worker's view of the pattern: one Uint16 per stitch indexing
// `ids`, with 0xFFFF for __skip__/__empty__. Mirrors toModel() in
// analysis-worker.js (tests/analysisWorkerProtocol.test.js holds them to the
// same output). Sent once per pattern with its buffer transferred.
function encodeAnalysisPattern(pat){
  const n=pat.length,codes=new Uint16Array(n),ids=[],map=new Map();
  for(let i=0;i<n;i++){
    const id=pat[i]&&pat[i].id;
    if(id==null||id==="__skip__"||id==="__empty__"){codes[i]=0xFFFF;continue;}
    let c=map.get(id);
    if(c===undefined){c=ids.length;ids.push(id);map.set(id,c);}
    codes[i]=c;
  }
  return{codes,ids};
}

// Boundary of every cell of colour `id` inside cell range `r`, as SVG path
// data in chart pixels (`gut` + cell * `cSz`), plus the average luminance of
// those cells for picking a contrasting ant colour. An edge is boundary when
// exactly one of the two cells it separates is the colour — the same edges the
// old per-cell canvas loop drew — and collinear edges are merged into one run,
// so a straight boundary is a single segment and its dashes flow unbroken.
function outlinePathData(pat,sW,sH,id,r,cSz,gut){
  const is=(x,y)=>x>=0&&y>=0&&x<sW&&y<sH&&!!pat[y*sW+x]&&pat[y*sW+x].id===id;
  const parts=[];
  let lumSum=0,lumCnt=0;
  for(let y=r.y0;y<r.y1;y++)for(let x=r.x0;x<r.x1;x++){
    const m=pat[y*sW+x];
    if(m&&m.id===id&&m.rgb){lumSum+=luminance(m.rgb);lumCnt++;}
  }
  // Horizontal boundaries: grid line y sits between rows y-1 and y.
  for(let y=r.y0;y<=r.y1;y++){
    let run=-1;
    for(let x=r.x0;x<=r.x1;x++){
      const edge=x<r.x1&&is(x,y)!==is(x,y-1);
      if(edge&&run<0)run=x;
      else if(!edge&&run>=0){parts.push("M"+(gut+run*cSz)+" "+(gut+y*cSz)+"H"+(gut+x*cSz));run=-1;}
    }
  }
  // Vertical boundaries: grid line x sits between columns x-1 and x.
  for(let x=r.x0;x<=r.x1;x++){
    let run=-1;
    for(let y=r.y0;y<=r.y1;y++){
      const edge=y<r.y1&&is(x,y)!==is(x-1,y);
      if(edge&&run<0)run=y;
      else if(!edge&&run>=0){parts.push("M"+(gut+x*cSz)+" "+(gut+run*cSz)+"V"+(gut+y*cSz));run=-1;}
    }
  }
  return{d:parts.join(""),avgLum:lumCnt>0?lumSum/lumCnt:128};
}

/* ── Viewport tiling ───────────────────────────────────────────────────────
   The chart and its overlays used to size their backing store to the whole
   pattern at the current zoom: `canvas.width = sW*scs + G + 2`. That is
   O(pattern) memory. A 400x500 chart at zoom 1 is 63 MB *per canvas*, and up
   to six of them mount at once, so an ordinary highlight session asked an
   iPad for a quarter of a gigabyte. Safari does not throw — it discards
   backing stores under that pressure and repaints them, which is what "the
   app freezes" feels like. The zoom clamp that used to hold this in check
   also held large patterns below the cell size at which symbols render.

   Instead every chart-geometry canvas now covers only the visible slice plus
   an overscan margin, and its 2D context is translated so that draw code can
   go on addressing cells in absolute chart coordinates. Memory becomes
   O(viewport): ~11 MB whatever the pattern size.

   When the whole chart already fits in one tile the origin is (0,0) and the
   geometry is identical to the pre-tiling behaviour, so small patterns and
   desktop are untouched. `full` records which regime a tile is in. */
const CHART_TILE_OVERSCAN=(typeof window!=='undefined'&&window.chartTileOverscan)||300;
// How close the view may get to the tile's edge before the tile moves on (see
// renderStitchIfScrolledOut).
const CHART_PAN_LOOKAHEAD=Math.round(CHART_TILE_OVERSCAN/3);
// stitch.html?tileshift=0 turns off keeping the drawn tile on a move
// (shiftChartTile), so the two can be compared on a real device with
// ?perf=1. The emulated harness cannot settle it: its canvas is drawn on the
// CPU, where copying the tile costs far more than on a phone's GPU.
const CHART_TILE_SHIFT=!(typeof location!=='undefined'&&/[?&]tileshift=0(&|$)/.test(location.search));

// Geometry of the tile that should be showing for a given scroller position.
// `x`/`y` are in chart coordinates and name the chart pixel that lands on
// canvas pixel 0.
//
// `view` is the part of the pattern the scroller shows, in cells: the whole
// pattern, or a work area plus its margin (see work-area.js). The scroller's
// extent covers only the view, so scrollLeft/scrollTop are relative to its
// top-left corner and chart coordinates are scroll + view.x0/y0 * cSz. With no
// view, or the whole pattern, the offset is 0 and this is exactly the old
// geometry.
function chartTileFor(scroller,cSz,sW,sH,gutter,view){
  const v=view||{x0:0,y0:0,x1:sW,y1:sH};
  const offX=v.x0*cSz, offY=v.y0*cSz;
  const fullW=gutter+(v.x1-v.x0)*cSz+2, fullH=gutter+(v.y1-v.y0)*cSz+2;
  if(!scroller){
    return{x:offX,y:offY,w:fullW,h:fullH,full:true};
  }
  if(!scroller.clientWidth||!scroller.clientHeight){
    return{x:offX,y:offY,w:0,h:0,full:false};
  }
  const w=Math.min(fullW,scroller.clientWidth+CHART_TILE_OVERSCAN*2);
  const h=Math.min(fullH,scroller.clientHeight+CHART_TILE_OVERSCAN*2);
  if(w>=fullW&&h>=fullH)return{x:offX,y:offY,w:fullW,h:fullH,full:true};
  // Clamped to the view so the tile never hangs off an edge, which would
  // waste backing store on blank space and leave the opposite edge unpainted.
  const x=offX+Math.max(0,Math.min(fullW-w,Math.round(scroller.scrollLeft-CHART_TILE_OVERSCAN)));
  const y=offY+Math.max(0,Math.min(fullH-h,Math.round(scroller.scrollTop -CHART_TILE_OVERSCAN)));
  return{x,y,w,h,full:false};
}

// Point a canvas at a tile: resize if needed, move the element so canvas pixel
// 0 sits on chart pixel `tile.x/y`, and translate the context so callers keep
// drawing in absolute chart coordinates. Returns the prepared 2D context.
//
// setTransform (not translate) because every draw entry point calls this,
// including the single-cell fast path — an absolute transform is idempotent,
// a relative one would accumulate.
// opts.blankOnMove === false means the caller repaints the whole tile itself,
// so the clear a move would otherwise need is redundant — true of the chart,
// whose drawStitch begins by filling the entire chart rect.
//
// opts.scale is device pixels per CSS pixel for this canvas's backing store.
// The chart renders at the device's pixel ratio where the budget allows it
// (see chartRenderScale); the overlays stay at 1, because they draw large flat
// shapes where a finer raster buys almost nothing. The *CSS* size is always
// the tile size regardless, so layout — and every screen-to-chart conversion
// that goes through getBoundingClientRect — is unaffected by the scale.
function applyChartTile(canvas,tile,gutter,opts){
  const o=opts||{};
  const scale=o.scale>0?o.scale:1;
  const prev=canvas.__chartTile;
  const needW=Math.round(tile.w*scale), needH=Math.round(tile.h*scale);
  const resized=canvas.width!==needW||canvas.height!==needH;
  const moved=!!prev&&(prev.x!==tile.x||prev.y!==tile.y);
  const ctx=canvas.getContext("2d");
  // Assigning width blanks the surface; *moving* it does not — the pixels
  // stay, but they were painted for the old origin, so they are now garbage
  // in the wrong place. Callers that clear incrementally (the recommendation
  // pulse) rely on `invalidated` meaning "the surface is blank", so a move has
  // to actually make that true rather than merely claim it.
  //
  // The liveness probe is cached per backing-store size, so a resize has to
  // drop it — the new surface has not been probed.
  if(resized){
    delete canvas.__chartTileProbe;
    canvas.width=needW;
    canvas.height=needH;
  }
  else if(moved&&o.blankOnMove!==false){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  // -gutter reproduces the overhang the full-size canvas got from its negative
  // margin, so a tile at origin sits exactly where the old canvas did.
  const left=(tile.x-gutter)+"px", top=(tile.y-gutter)+"px";
  if(canvas.style.left!==left)canvas.style.left=left;
  if(canvas.style.top !==top )canvas.style.top =top;
  // Explicit CSS size: with scale > 1 the backing store is larger than the
  // element, and without this the browser would size the element to the
  // backing store and the chart would render at double size.
  const cssW=tile.w+"px", cssH=tile.h+"px";
  if(canvas.style.width !==cssW)canvas.style.width =cssW;
  if(canvas.style.height!==cssH)canvas.style.height=cssH;
  canvas.__chartTile={x:tile.x,y:tile.y,w:tile.w,h:tile.h,scale:scale};
  // Fold the scale into the same transform that carries the tile origin, so
  // callers keep drawing in absolute chart (CSS-pixel) coordinates.
  ctx.setTransform(scale,0,0,scale,-tile.x*scale,-tile.y*scale);
  return{ctx:ctx,invalidated:resized||moved||!prev};
}

// Blank a chart canvas outright, for the branches where an overlay is switched
// off. Resets the transform first: the context still carries the tile
// translation from its last draw, so clearing 0,0..w,h through it would clear
// the wrong region and leave the overlay visible.
function clearWholeChartCanvas(canvas){
  if(!canvas||!canvas.width||!canvas.height)return;
  const ctx=canvas.getContext("2d");
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

// R3 — memory-pressure escape hatch. A backing store the browser refused or
// discarded reports its dimensions normally and simply does not paint, so the
// only way to know is to write a pixel and read it back. Checked once per
// allocated size rather than per frame; getImageData on 1 px is cheap, but a
// per-frame readback would stall the pipeline.
function chartTileIsLive(canvas,ctx){
  if(!canvas||!canvas.width||!canvas.height)return false;
  const key=canvas.width+"x"+canvas.height;
  const state=canvas.__chartTileProbe||{};
  if(state.key===key&&typeof state.live==='boolean')return state.live;
  let live=true;
  try{
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);
      ctx.fillStyle="#fff";
      ctx.fillRect(canvas.width-1,canvas.height-1,1,1);
      const d=ctx.getImageData(canvas.width-1,canvas.height-1,1,1).data;
      live=d[3]===255;
    }finally{
      ctx.restore();
    }
  }catch(_){
    // Tainted or otherwise unreadable: no evidence of failure, so assume live
    // rather than degrading a working chart.
    live=true;
  }
  canvas.__chartTileProbe={key:key,live:live};
  return live;
}

// Hoisted module-scope constants (avoid per-render allocation).
const START_CORNERS=[["TL","Top-left"],["TR","Top-right"],["C","Centre"],["BL","Bottom-left"],["BR","Bottom-right"]];
const PDF_MODAL_LABEL_STYLE={fontSize:'var(--text-sm)',fontWeight:600,color:"var(--text-secondary)",display:"flex",flexDirection:"column",gap:6};
const PDF_MODAL_SELECT_STYLE={padding:"6px 8px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",fontSize:'var(--text-md)',background:"var(--surface)"};
const PDF_MODAL_CHECKBOX_LABEL_STYLE={fontSize:'var(--text-sm)',fontWeight:600,color:"var(--text-secondary)",display:"flex",alignItems:"center",gap:6,cursor:"pointer"};
const PDF_MODAL_EXPORT_BTN_STYLE={flex:1,padding:"10px",borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",fontWeight:600,cursor:"pointer"};

// Standalone realistic preview modal for the tracker.
// Adapted from creator/RealisticCanvas.js — no CreatorContext required.
function TrackerPreviewModal({pat,cmap,sW,sH,fabricCt,level,onLevelChange,onClose}){
  var displayRef=React.useRef(null);
  var offscreenRef=React.useRef(null);
  var realisticRafRef=React.useRef(null);
  var _offV=React.useState(0);var offscreenVersion=_offV[0],setOffscreenVersion=_offV[1];

  // Effect A: render the full offscreen realistic canvas (identical logic to RealisticCanvas.js)
  React.useEffect(function(){
    if(!pat||!sW||!sH)return;
    if(realisticRafRef.current)cancelAnimationFrame(realisticRafRef.current);
    realisticRafRef.current=requestAnimationFrame(function(){
      realisticRafRef.current=null;
      var MAX_DIM=8192;
      var maxCellSz=(level>=3)?32:16;
      var rawCellSz=Math.floor(Math.min(MAX_DIM/sW,MAX_DIM/sH));
      if(rawCellSz<1)return;
      var CELL_SIZE=Math.max(4,Math.min(maxCellSz,rawCellSz));
      var canvasW=sW*CELL_SIZE,canvasH=sH*CELL_SIZE;
      var offscreen=document.createElement("canvas");
      offscreen.width=canvasW;offscreen.height=canvasH;
      var oc=offscreen.getContext("2d");
      if(!oc)return;
      var FR=245,FG=240,FB=230;
      oc.fillStyle="rgb("+FR+","+FG+","+FB+")";
      oc.fillRect(0,0,canvasW,canvasH);
      var weaveStep=Math.max(3,Math.round(CELL_SIZE/4));
      var fabricTile=document.createElement("canvas");
      fabricTile.width=CELL_SIZE;fabricTile.height=CELL_SIZE;
      var ftc=fabricTile.getContext("2d");
      if(ftc){
        ftc.fillStyle="rgb("+FR+","+FG+","+FB+")";
        ftc.fillRect(0,0,CELL_SIZE,CELL_SIZE);
        ftc.strokeStyle="rgba("+(Math.max(0,FR-10))+","+(Math.max(0,FG-10))+","+(Math.max(0,FB-10))+",0.07)";
        ftc.lineWidth=1;
        for(var wxi=0;wxi<CELL_SIZE;wxi+=weaveStep){ftc.beginPath();ftc.moveTo(wxi+0.5,0);ftc.lineTo(wxi+0.5,CELL_SIZE);ftc.stroke();}
        for(var wyi=0;wyi<CELL_SIZE;wyi+=weaveStep){ftc.beginPath();ftc.moveTo(0,wyi+0.5);ftc.lineTo(CELL_SIZE,wyi+0.5);ftc.stroke();}
        var weavePattern=oc.createPattern(fabricTile,"repeat");
        oc.fillStyle=weavePattern||("rgb("+FR+","+FG+","+FB+")");
        oc.fillRect(0,0,canvasW,canvasH);
      }
      var fc=fabricCt||14;
      var SC=fc<=11?3:(fc<=17?2:1);
      function _lerp(a,b,t){return a+(b-a)*t;}
      function _clamp01(v){return v<0?0:v>1?1:v;}
      var autoCoverage=_clamp01(_clamp01((fc-8)/24)*(SC/2));
      var coverage=_clamp01(Math.round(autoCoverage/0.05)*0.05);
      var sw=Math.max(CELL_SIZE*0.12,CELL_SIZE*_lerp(0.14,0.32,coverage));
      var padding=Math.max(1,CELL_SIZE*_lerp(0.14,0.03,coverage));
      var haloWidthMult=_lerp(1.1,1.5,coverage);
      var haloOpacity=_lerp(0.06,0.18,coverage);
      var twistAmpMult=_lerp(1.0,0.7,coverage);
      var lvl=level;
      function drawCross_L1(tc,r1,g1,b1,r2,g2,b2,x0,y0,x1,y1){
        tc.lineWidth=sw;tc.strokeStyle="rgb("+r1+","+g1+","+b1+")";
        tc.beginPath();tc.moveTo(x0,y1);tc.lineTo(x1,y0);tc.stroke();
        tc.lineWidth=sw;tc.strokeStyle="rgb("+r2+","+g2+","+b2+")";
        tc.beginPath();tc.moveTo(x0,y0);tc.lineTo(x1,y1);tc.stroke();
      }
      function drawCross_L2(tc,r1,g1,b1,r2,g2,b2,x0,y0,x1,y1){
        var INV_SQ2=0.7071;var hs=sw/2;var cx=CELL_SIZE/2,cy=CELL_SIZE/2;
        function makeGrad(perpX,perpY,r,g,b,factor){
          var gx0=cx-perpX*hs,gy0=cy-perpY*hs,gx1=cx+perpX*hs,gy1=cy+perpY*hs;
          var grad=tc.createLinearGradient(gx0,gy0,gx1,gy1);
          function stop(f){return "rgb("+Math.min(255,Math.max(0,Math.round(r*f)))+","+Math.min(255,Math.max(0,Math.round(g*f)))+","+Math.min(255,Math.max(0,Math.round(b*f)))+")"}
          grad.addColorStop(0.00,stop(factor*0.38));grad.addColorStop(0.28,stop(factor*0.90));
          grad.addColorStop(0.50,stop(factor*1.22));grad.addColorStop(0.72,stop(factor*0.90));
          grad.addColorStop(1.00,stop(factor*0.38));return grad;
        }
        tc.lineWidth=sw;tc.strokeStyle=makeGrad(INV_SQ2,INV_SQ2,r1,g1,b1,0.72);
        tc.beginPath();tc.moveTo(x0,y1);tc.lineTo(x1,y0);tc.stroke();
        tc.fillStyle="rgba(0,0,0,0.28)";tc.beginPath();tc.arc(cx,cy,sw*0.75,0,Math.PI*2);tc.fill();
        tc.lineWidth=sw;tc.strokeStyle=makeGrad(INV_SQ2,-INV_SQ2,r2,g2,b2,1.15);
        tc.beginPath();tc.moveTo(x0,y0);tc.lineTo(x1,y1);tc.stroke();
      }
      function drawCross_L34(tc,r1,g1,b1,r2,g2,b2,variant,x0,y0,x1,y1){
        var SN=20,TF=2.5,TA=sw*0.3*twistAmpMult,ISW=sw/SC*1.2;
        var IS_BLEND=!(r1===r2&&g1===g2&&b1===b2);
        var lCX=CELL_SIZE/2,lCY=CELL_SIZE/2;
        function hashVar(seed,si){var hv=((seed*1619)^(si*31337))|0;hv=(hv^(hv>>>13))*1540483477|0;hv=hv^(hv>>>15);return(((hv%8)+8)%8)-4;}
        function mkPts(lsx,lsy,lex,ley,angle,si){var px=-Math.sin(angle),py=Math.cos(angle);var phase=si*(2*Math.PI/SC);var pts=[];for(var n=0;n<=SN;n++){var t=n/SN;var off=Math.sin(t*TF*2*Math.PI+phase)*TA;pts.push(lsx+(lex-lsx)*t+px*off,lsy+(ley-lsy)*t+py*off);}return pts;}
        function drawStrand3(pts,fR,fGc,fBlu){
          tc.beginPath();tc.moveTo(pts[0],pts[1]);for(var k=2;k<pts.length;k+=2)tc.lineTo(pts[k],pts[k+1]);
          tc.lineWidth=ISW*haloWidthMult;tc.strokeStyle="rgba("+fR+","+fGc+","+fBlu+","+haloOpacity+")";tc.stroke();
          tc.beginPath();tc.moveTo(pts[0],pts[1]);for(var k=2;k<pts.length;k+=2)tc.lineTo(pts[k],pts[k+1]);
          tc.lineWidth=ISW;tc.strokeStyle="rgb("+fR+","+fGc+","+fBlu+")";tc.stroke();
        }
        function drawLeg3(lsx,lsy,lex,ley,angle,aR,aG,aB,bR,bG,bB,bright){
          for(var si=0;si<SC;si++){
            var sR,sGv,sB;
            if(IS_BLEND){if(si%2===0){sR=aR;sGv=aG;sB=aB;}else{sR=bR;sGv=bG;sB=bB;}}
            else{var vv=hashVar(variant*17+si,si);sR=Math.min(255,Math.max(0,aR+vv));sGv=Math.min(255,Math.max(0,aG+vv));sB=Math.min(255,Math.max(0,aB+vv));}
            var dfR=Math.min(255,Math.max(0,Math.round(sR*bright)));
            var dfG=Math.min(255,Math.max(0,Math.round(sGv*bright)));
            var dfBlu=Math.min(255,Math.max(0,Math.round(sB*bright)));
            drawStrand3(mkPts(lsx,lsy,lex,ley,angle,si),dfR,dfG,dfBlu);
          }
        }
        function drawLeg3a(lsx,lsy,lex,ley,angle,aR,aG,aB,bR,bG,bB,bright){
          if(!IS_BLEND||SC<2){drawLeg3(lsx,lsy,lex,ley,angle,aR,aG,aB,bR,bG,bB,bright);return;}
          var pts0=mkPts(lsx,lsy,lex,ley,angle,0);var pts1=mkPts(lsx,lsy,lex,ley,angle,1);
          function applyBright(r,g,b){return "rgb("+Math.min(255,Math.max(0,Math.round(r*bright)))+","+Math.min(255,Math.max(0,Math.round(g*bright)))+","+Math.min(255,Math.max(0,Math.round(b*bright)))+")"}
          var cssA=applyBright(aR,aG,aB),cssB=applyBright(bR,bG,bB);
          var crossIdx=[0];
          for(var ck=1;ck<=Math.ceil(2*TF);ck++){var ci=Math.round(ck/(2*TF)*SN);if(ci>0&&ci<SN)crossIdx.push(ci);}
          crossIdx.push(SN);
          function drawSeg(pts,n0,n1,css){if(n1<=n0)return;tc.beginPath();tc.moveTo(pts[n0*2],pts[n0*2+1]);for(var k=n0+1;k<=n1;k++)tc.lineTo(pts[k*2],pts[k*2+1]);tc.lineWidth=ISW;tc.strokeStyle=css;tc.stroke();}
          for(var seg=0;seg<crossIdx.length-1;seg++){
            var n0=crossIdx[seg],n1=crossIdx[seg+1];
            var midT=(n0+n1)/2/SN;var s0Front=Math.sin(midT*TF*2*Math.PI)>=0;
            if(s0Front){drawSeg(pts1,n0,n1,cssB);drawSeg(pts0,n0,n1,cssA);}
            else{drawSeg(pts0,n0,n1,cssA);drawSeg(pts1,n0,n1,cssB);}
          }
        }
        tc.lineCap="round";tc.lineJoin="round";
        var drawLegFn=(lvl===4)?drawLeg3a:drawLeg3;
        drawLegFn(x0,y1,x1,y0,-Math.PI/4,r1,g1,b1,r2,g2,b2,0.78);
        tc.fillStyle="rgba("+FR+","+FG+","+FB+",0.15)";tc.beginPath();tc.arc(lCX,lCY,sw*0.75,0,Math.PI*2);tc.fill();
        drawLegFn(x0,y0,x1,y1,Math.PI/4,r1,g1,b1,r2,g2,b2,1.15);
        var hlPts=mkPts(x0,y0,x1,y1,Math.PI/4,0);
        tc.lineWidth=ISW*0.3;tc.strokeStyle="rgba(255,255,255,0.13)";
        tc.beginPath();tc.moveTo(hlPts[0],hlPts[1]);for(var k=2;k<hlPts.length;k+=2)tc.lineTo(hlPts[k],hlPts[k+1]);tc.stroke();
      }
      function drawCross(tc,r1,g1,b1,r2,g2,b2,variant){
        var x0=padding,y0=padding,x1=CELL_SIZE-padding,y1=CELL_SIZE-padding;
        tc.lineCap="round";
        if(lvl===1)return drawCross_L1(tc,r1,g1,b1,r2,g2,b2,x0,y0,x1,y1);
        if(lvl===2)return drawCross_L2(tc,r1,g1,b1,r2,g2,b2,x0,y0,x1,y1);
        return drawCross_L34(tc,r1,g1,b1,r2,g2,b2,variant,x0,y0,x1,y1);
      }
      var tileCache={};
      function getTile(rgb,rgb2,variant){
        var r1=rgb[0],g1=rgb[1],b1=rgb[2];
        var r2=rgb2?rgb2[0]:r1,g2=rgb2?rgb2[1]:g1,b2=rgb2?rgb2[2]:b1;
        var key=r1+","+g1+","+b1+"|"+r2+","+g2+","+b2+"|cov:"+coverage;
        if(lvl===3||lvl===4)key+=":"+(variant|0);
        if(tileCache[key])return tileCache[key];
        var tileC=document.createElement("canvas");tileC.width=CELL_SIZE;tileC.height=CELL_SIZE;
        var tc=tileC.getContext("2d");
        drawCross(tc,r1,g1,b1,r2,g2,b2,variant|0);
        tileCache[key]=tileC;return tileC;
      }
      var colourFreq={};
      if(lvl===3||lvl===4){
        for(var ci=0;ci<pat.length;ci++){
          var cc=pat[ci];
          if(!cc||cc.id==="__skip__"||cc.id==="__empty__")continue;
          var cKey;
          if(cc.id&&cc.id.indexOf("+")!==-1){cKey=cc.id;}
          else{var cRgb=cc.rgb;if(!cRgb&&cmap){var cLk=cmap[cc.id];if(cLk)cRgb=cLk.rgb;}if(cRgb)cKey=cRgb[0]+","+cRgb[1]+","+cRgb[2];}
          if(cKey)colourFreq[cKey]=(colourFreq[cKey]||0)+1;
        }
      }
      for(var i=0;i<pat.length;i++){
        var cell=pat[i];
        if(!cell||cell.id==="__skip__"||cell.id==="__empty__")continue;
        var cellCol=i%sW,cellRow=Math.floor(i/sW);
        var cellX=cellCol*CELL_SIZE,cellY=cellRow*CELL_SIZE;
        var rgb=cell.rgb,rgb2=null;
        if(cell.id&&cell.id.indexOf("+")!==-1){
          var blendParts=splitBlendId(cell.id);
          var e1=cmap&&cmap[blendParts[0]];var e2=cmap&&cmap[blendParts[1]];
          if(e1)rgb=e1.rgb;if(e2)rgb2=e2.rgb;
        }
        if(!rgb&&cmap){var lookup=cmap[cell.id];if(lookup)rgb=lookup.rgb;}
        if(!rgb)continue;
        var variant3=0;
        if(lvl===3){
          var vKey;
          if(cell.id&&cell.id.indexOf("+")!==-1){vKey=cell.id;}
          else{vKey=rgb[0]+","+rgb[1]+","+rgb[2];}
          if(vKey&&colourFreq[vKey]>=30)variant3=(cellCol+cellRow*3)%4;
        }
        oc.drawImage(getTile(rgb,rgb2,variant3),cellX,cellY);
      }
      offscreenRef.current=offscreen;
      setOffscreenVersion(function(v){return v+1;});
    });
    return function(){if(realisticRafRef.current){cancelAnimationFrame(realisticRafRef.current);realisticRafRef.current=null;}};
  },[pat,cmap,sW,sH,level,fabricCt]);

  // Effect B: scale the offscreen canvas to the display canvas
  React.useEffect(function(){
    if(!offscreenRef.current||!displayRef.current||!sW||!sH)return;
    var off=offscreenRef.current;
    var displayCs=Math.max(2,Math.min(16,Math.floor(700/sW),Math.floor(500/sH)));
    var canvas=displayRef.current;
    canvas.width=sW*displayCs;canvas.height=sH*displayCs;
    var ctx2d=canvas.getContext("2d");
    ctx2d.imageSmoothingEnabled=true;if('imageSmoothingQuality' in ctx2d){ctx2d.imageSmoothingQuality="high";}
    ctx2d.drawImage(off,0,0,sW*displayCs,sH*displayCs);
  },[offscreenVersion,sW,sH]);

  var lvlLabels=["","Flat","Shaded","Detailed","Detailed+blend"];
  var fc2=fabricCt||14;var sc2=fc2<=11?3:fc2<=17?2:1;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Realistic preview" onClick={function(e){if(e.target===e.currentTarget)onClose();}} style={{zIndex:1200}}>
      <div className="modal-box" style={{maxWidth:"min(90vw,900px)",maxHeight:"90vh",display:"flex",flexDirection:"column",padding:0,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid var(--border)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:'var(--s-3)'}}>
            <span style={{fontWeight:700,fontSize:15}}>Realistic preview</span>
            <div style={{display:"flex",gap:'var(--s-1)'}}>
              {[1,2,3,4].map(function(l){
                return <button key={l} onClick={function(){onLevelChange(l);}} style={{padding:"3px 8px",borderRadius:5,border:"1px solid "+(level===l?"var(--accent)":"var(--border)"),background:level===l?"var(--accent-light)":"var(--surface)",color:level===l?"var(--accent)":"var(--text-secondary)",fontSize:'var(--text-xs)',fontWeight:600,cursor:"pointer"}}>{lvlLabels[l]}</button>;
              })}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"var(--text-tertiary)",lineHeight:1,padding:"0 4px"}}>{Icons.x?Icons.x():null}</button>
        </div>
        <div style={{flex:1,overflow:"auto",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface-secondary)",padding:'var(--s-4)'}}>
          <canvas ref={displayRef} style={{display:"block",maxWidth:"100%",maxHeight:"calc(90vh - 100px)",imageRendering:"auto"}}/>
        </div>
        <div style={{padding:"8px 16px",borderTop:"1px solid var(--border)",flexShrink:0,fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>
          {sW}\u00D7{sH} \u00B7 {fc2}-count\u00B7 {sc2} strand{sc2!==1?"s":""}
        </div>
      </div>
    </div>
  );
}

// ── Stitching Style picker body ──
// StitchingStyleStepBody renders the 3-screen flow without any modal chrome.
// It is reused by:
//   - StitchingStyleOnboarding (legacy modal launcher used by the toolbar
//     "change style" affordance), which wraps this body in modal-overlay.
//   - The first-visit WelcomeWizard, which renders this as a customComponent
//     step so the welcome + style picker present as a single wizard rather
//     than two stacked modals.
// Props: { onComplete({style,blockW,blockH,startCorner}), onBack?, onSkip?, startCorner }
function StitchingStyleStepBody({onComplete,onBack,onSkip,startCorner:initCorner}){
  const[screen,setScreen]=useState(1);
  const[style,setStyle]=useState(null);
  const[bw,setBw]=useState(10),[bh,setBh]=useState(10);
  const[customW,setCustomW]=useState(10),[customH,setCustomH]=useState(10);
  const[showCustom,setShowCustom]=useState(false);
  const[corner,setCorner]=useState(initCorner||"TL");
  const commit=(s,w,h,c)=>{try{localStorage.setItem("cs_styleOnboardingDone","1");}catch(_){}onComplete({style:s,blockW:w,blockH:h,startCorner:c});};
  // Screen 1 — pick general working style.
  if(screen===1)return(
    <div>
      <h3 style={{marginTop:0,fontSize:17}}>How do you usually work through a pattern?</h3>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:'var(--s-4)'}}>
        <button className="modal-choice-btn" onClick={()=>{setStyle("block");setScreen(2);}}>One section at a time</button>
        <button className="modal-choice-btn" onClick={()=>{setStyle("crosscountry");setScreen(3);}}>One colour at a time</button>
        <button className="modal-choice-btn" onClick={()=>{setStyle("freestyle");setScreen(3);}}>I don't have a fixed method</button>
      </div>
      {/* Skip-for-now removed: Phase 4 requires an active selection so users
          don't accidentally bypass the picker and lose the helpful defaults. */}
    </div>
  );
  // Screen 2 — block-shape picker (only for "block" style).
  if(screen===2)return(
    <div>
      <h3 style={{marginTop:0,fontSize:17}}>What shape are your sections?</h3>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:'var(--s-4)'}}>
        <button className="modal-choice-btn" onClick={()=>{setStyle("block");setBw(10);setBh(10);setScreen(3);}}>10×10 blocks</button>
        <button className="modal-choice-btn" onClick={()=>{setStyle("royal");setBw(10);setBh(20);setScreen(3);}}>Tall towers (10 wide × 20 tall)</button>
        <button className="modal-choice-btn" onClick={()=>{setStyle("block");setBw(20);setBh(20);setScreen(3);}}>Larger blocks (20×20)</button>
        <button className="modal-choice-btn" onClick={()=>setShowCustom(v=>!v)}>Other size…</button>
        {showCustom&&<div style={{display:"flex",gap:'var(--s-2)',alignItems:"center",padding:"8px 12px",background:"var(--surface-secondary)",borderRadius:'var(--radius-md)',border:"1px solid var(--border)"}}>
          <label style={{fontSize:'var(--text-sm)',fontWeight:600}}>W:</label>
          <input type="number" inputMode="numeric" value={customW} onChange={e=>setCustomW(Math.max(5,Math.min(100,parseInt(e.target.value)||10)))} style={{width:52,padding:"4px",borderRadius:4,border:"1px solid var(--border)",fontSize:'var(--text-md)'}} min={5} max={100}/>
          <label style={{fontSize:'var(--text-sm)',fontWeight:600}}>H:</label>
          <input type="number" inputMode="numeric" value={customH} onChange={e=>setCustomH(Math.max(5,Math.min(100,parseInt(e.target.value)||10)))} style={{width:52,padding:"4px",borderRadius:4,border:"1px solid var(--border)",fontSize:'var(--text-md)'}} min={5} max={100}/>
          <button onClick={()=>{setStyle("block");setBw(customW);setBh(customH);setScreen(3);}} style={{padding:"4px 10px",borderRadius:4,border:"none",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontSize:'var(--text-sm)',fontWeight:600}}>OK</button>
        </div>}
        {showCustom&&(customW%10!==0||customH%10!==0)&&<div style={{fontSize:'var(--text-xs)',color:"var(--warning)",background:"var(--warning-soft)",padding:"4px 10px",borderRadius:'var(--radius-sm)'}}>Custom sizes may not align with the 10-stitch grid lines.</div>}
      </div>
      <button style={{marginTop:'var(--s-4)',background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:'var(--text-sm)',display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setScreen(1)}><span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronLeft?Icons.chevronLeft():null}</span> Back</button>
    </div>
  );
  // Screen 3 — start-corner picker; commits on selection.
  const CORNERS=START_CORNERS;
  return(
    <div>
      <h3 style={{marginTop:0,fontSize:17}}>Where do you usually start?</h3>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:'var(--s-4)'}}>
        {CORNERS.map(([k,l])=><button key={k} className={"modal-choice-btn"+(corner===k?" modal-choice-btn--on":"")} onClick={()=>commit(style||"block",bw,bh,k)}>{l}</button>)}
      </div>
      <button style={{marginTop:'var(--s-4)',background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",fontSize:'var(--text-sm)',display:'inline-flex',alignItems:'center',gap:4}} onClick={()=>setScreen(style==="block"||style==="royal"?2:1)}><span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronLeft?Icons.chevronLeft():null}</span> Back</button>
    </div>
  );
}

// ── Stitching Style Onboarding Modal ──
// Used by the toolbar "Stitching style: …" affordance to re-open the picker
// after the first visit. The first-visit picker is now embedded as a step in
// the WelcomeWizard (see UnifiedApp / TrackerApp welcome mount).
function StitchingStyleOnboarding({onDone,startCorner:initCorner}){
  // Closing (the X, Escape or the backdrop) keeps the current style.
  const doneRef=useRef(onDone);doneRef.current=onDone;
  const close=useCallback(()=>{try{localStorage.setItem("cs_styleOnboardingDone","1");}catch(_){}doneRef.current(null);},[]);
  (window.useEscape||function(){})(close);
  // Coachmark tips wait while this is open.
  useEffect(()=>{const C=window.Coaching;if(C&&C.overlayOpened)C.overlayOpened();return()=>{if(C&&C.overlayClosed)C.overlayClosed();};},[]);
  return(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Stitching style" onClick={close}>
      <div className="modal-content" style={{maxWidth:380}} onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={close} aria-label="Close" title="Close and keep the current style">{Icons.x?Icons.x():null}</button>
        <StitchingStyleStepBody onComplete={onDone} startCorner={initCorner} />
      </div>
    </div>
  );
}

// ── Export PDF dialog ──
// Edits the same saved settings as the Pattern Creator's Export tab
// (UserPrefs export*), then exports through export-pdf.js, so a PDF made
// here matches one made in the Creator and stays Pattern Keeper-compatible.
function PdfExportModal({onClose,onExport}){
  const UP=window.UserPrefs;
  const get=(k,fb)=>{try{const v=UP&&UP.get(k);return v==null?fb:v;}catch(_){return fb;}};
  const[bw,setBw]=useState(()=>!!get("exportChartModeBw",true));
  const[colour,setColour]=useState(()=>!!get("exportChartModeColour",true));
  const[perPage,setPerPage]=useState(()=>get("exportStitchesPerPage","medium"));
  const[pageSize,setPageSize]=useState(()=>get("exportPageSize","auto"));
  const save=(k,v,set)=>{set(v);try{UP&&UP.set(k,v);}catch(_){}};
  const closeRef=useRef(onClose);closeRef.current=onClose;
  const onEsc=useCallback(()=>closeRef.current(),[]);
  (window.useEscape||function(){})(onEsc);
  const canExport=bw||colour;
  return(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title" onClick={onClose}>
      <div className="modal-content" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">{Icons.x?Icons.x():null}</button>
        <h3 id="pdf-export-title" style={{marginTop:0,marginBottom:6}}>Export PDF</h3>
        <p style={{margin:"0 0 var(--s-4)",fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>A printable, Pattern Keeper-compatible chart. PDF omits beads and bead progress. These settings are shared with the Export tab in the Pattern Creator, which has the full set.</p>
        <div style={{display:"flex",flexDirection:"column",gap:'var(--s-4)'}}>
          <fieldset style={{border:0,padding:0,margin:0,display:"flex",flexDirection:"column",gap:6}}>
            <legend style={Object.assign({},PDF_MODAL_LABEL_STYLE,{marginBottom:6})}>Charts</legend>
            <label style={PDF_MODAL_CHECKBOX_LABEL_STYLE}><input type="checkbox" checked={bw} onChange={e=>save("exportChartModeBw",e.target.checked,setBw)}/> Symbols on white (B&amp;W)</label>
            <label style={PDF_MODAL_CHECKBOX_LABEL_STYLE}><input type="checkbox" checked={colour} onChange={e=>save("exportChartModeColour",e.target.checked,setColour)}/> Colour blocks with symbols</label>
          </fieldset>
          <label style={PDF_MODAL_LABEL_STYLE}>
            Print size:
            <select value={perPage} onChange={e=>save("exportStitchesPerPage",e.target.value,setPerPage)} style={PDF_MODAL_SELECT_STYLE}>
              <option value="small">Small print (~2 mm cells)</option>
              <option value="medium">Medium print (~2.8 mm cells, ideal for Pattern Keeper)</option>
              <option value="large">Large print (~4 mm cells, easier to read)</option>
              {perPage==="custom"&&<option value="custom">Custom (set in the Pattern Creator)</option>}
            </select>
          </label>
          <label style={PDF_MODAL_LABEL_STYLE}>
            Page size:
            <select value={pageSize} onChange={e=>save("exportPageSize",e.target.value,setPageSize)} style={PDF_MODAL_SELECT_STYLE}>
              <option value="auto">Auto (A4 or US Letter for your region)</option>
              <option value="a4">A4</option>
              <option value="letter">US Letter</option>
            </select>
          </label>
          {!canExport&&<div role="alert" style={{fontSize:'var(--text-sm)',color:"var(--danger)"}}>Tick at least one kind of chart.</div>}
          <div style={{display:"flex",gap:10,marginTop:'var(--s-2)'}}>
            <button disabled={!canExport} onClick={()=>{onClose();onExport();}} style={Object.assign({},PDF_MODAL_EXPORT_BTN_STYLE,canExport?{}:{opacity:.5,cursor:"not-allowed"})}>Export PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Session Config Modal ──
// The running timer's clock. Only this component re-renders on each tick (see elapsedStore in useAutoSession.js).
function fmtClock(s){s=Math.max(0,Math.floor(s));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;const p=n=>(n<10?"0":"")+n;return h>0?h+":"+p(m)+":"+p(sec):m+":"+p(sec);}
function LiveElapsed({store}){
  const v=React.useSyncExternalStore(store.subscribe,()=>store.value);
  return fmtClock(v);
}
function SessionConfigModal({onStart,onClose,liveAutoStitches}){
  const[timeChoice,setTimeChoice]=useState(null);
  const[goalStitches,setGoalStitches]=useState("");
  return(
    <div className="modal-overlay modal-overlay--sheet" role="dialog" aria-modal="true" aria-labelledby="session-config-title" onClick={onClose}>
      <div className="modal-content modal-content--sheet" style={{maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true"/>
        <button className="modal-close" onClick={onClose} aria-label="Close" title="Close">{Icons.x?Icons.x():null}</button>
        <h3 id="session-config-title" style={{marginTop:0,fontSize:17}}>Start Session</h3>
        <div style={{marginBottom:'var(--s-4)'}}>
          <div style={{fontWeight:600,fontSize:'var(--text-sm)',color:"var(--text-secondary)",marginBottom:'var(--s-2)'}}>Time available</div>
          <div style={{display:"flex",gap:'var(--s-2)',flexWrap:"wrap"}}>
            {[[900,"15 min"],[1800,"30 min"],[3600,"1 hr"],[7200,"2 hr"],[null,"Open-ended"]].map(([v,l])=>(
              <button key={String(v)} onClick={()=>setTimeChoice(v)} style={{padding:"6px 12px",borderRadius:'var(--radius-md)',border:"1px solid "+(timeChoice===v?"var(--accent)":"var(--border)"),background:timeChoice===v?"var(--accent-light)":"var(--surface)",color:timeChoice===v?"var(--accent)":"var(--text-secondary)",cursor:"pointer",fontWeight:600,fontSize:'var(--text-sm)'}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:'var(--s-4)'}}>
          <div style={{fontWeight:600,fontSize:'var(--text-sm)',color:"var(--text-secondary)",marginBottom:'var(--s-2)'}}>Stitch goal (optional)</div>
          <input type="number" inputMode="numeric" enterKeyHint="done" value={goalStitches} onChange={e=>setGoalStitches(e.target.value)} placeholder="e.g. 200" min={1} style={{padding:"6px 10px",borderRadius:'var(--radius-md)',border:"1px solid var(--border)",fontSize:'var(--text-md)',width:"100%",boxSizing:"border-box"}}/>
        </div>
        <button onClick={()=>onStart({timeAvail:timeChoice,stitchGoal:goalStitches?parseInt(goalStitches)||null:null})} style={{width:"100%",padding:"10px",borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",fontWeight:600,cursor:"pointer",fontSize:'var(--text-lg)'}}>Start</button>
      </div>
    </div>
  );
}

// ── Stopping the timer: confirm or edit the minutes ──
// ── Small screens (tracking audit TRACK-07) ─────────────────────────────
// A phone, by the size of its screen (not the window, so rotating does not change the answer) and a touch screen.
function isPhoneScreen(){
  try{
    const coarse=!!(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches);
    const sc=window.screen||{};
    return coarse&&Math.min(sc.width||window.innerWidth,sc.height||window.innerHeight)<600;
  }catch(_){return false;}
}
// A UserPrefs value that follows changes made in Preferences while the Tracker is open.
function useTrackerPref(key,def){
  const get=()=>{try{const v=window.UserPrefs&&window.UserPrefs.get(key);return v==null?def:v;}catch(_){return def;}};
  const[v,setV]=useState(get);
  useEffect(()=>{
    const on=()=>setV(get());
    window.addEventListener('cs:prefchange',on);
    return()=>window.removeEventListener('cs:prefchange',on);
  },[key]);
  return v;
}
// The room kept clear at the chart's right edge for the controls strip (CSS: .tracker-chart-view margin-right).
function chartEndSpace(scroller){
  try{const v=scroller.querySelector('.tracker-chart-view');return v?(parseFloat(getComputedStyle(v).marginRight)||0):0;}catch(_){return 0;}
}
// Sizes the chart box to what is left of the screen on a phone or tablet: the screen height less everything above
// and below the chart, measured here rather than guessed in CSS (the box used to be a fixed 600 px: taller than a
// phone's screen, so the page scrolled and the bar below the chart was out of sight). The result is the CSS variable
// --tracker-chart-h, which only the small-screen rules read. It is measured on layout changes (a banner appearing, the
// top bar tucked away, rotating, the on-screen keyboard), never per stitch marked.
function useFillChartHeight(chartRef,ready){
  useEffect(()=>{
    const chart=chartRef.current;
    if(!ready||!chart||typeof ResizeObserver==='undefined')return;
    const area=chart.parentElement;
    if(!area)return;
    const mq=window.matchMedia?window.matchMedia('(max-width: 1023px), (pointer: coarse)'):null;
    let raf=0,last=null;
    const measure=()=>{
      raf=0;
      if(!mq||!mq.matches){if(last!==null){chart.style.removeProperty('--tracker-chart-h');last=null;}return;}
      const vv=window.visualViewport;
      const vh=vv?vv.height:window.innerHeight;
      const top=chart.getBoundingClientRect().top+(window.scrollY||0);
      const below=area.scrollHeight-chart.offsetTop-chart.offsetHeight;   // the bar and hint under the chart, and the padding
      const h=Math.max(200,Math.floor(vh-top-below));
      if(last===null||Math.abs(h-last)>=1){last=h;chart.style.setProperty('--tracker-chart-h',h+'px');}
    };
    const queue=()=>{if(!raf)raf=requestAnimationFrame(measure);};
    const ro=new ResizeObserver(queue);
    const watched=new Set();
    const watch=()=>{
      const els=[area,document.documentElement,document.querySelector('.tb-topbar'),document.querySelector('.info-strip-wrap')];
      Array.prototype.forEach.call(area.children,c=>els.push(c));
      els.forEach(e=>{if(e&&!watched.has(e)){watched.add(e);ro.observe(e);}});
    };
    watch();
    const mo=new MutationObserver(()=>{watch();queue();});
    mo.observe(area,{childList:true});
    window.addEventListener('resize',queue);
    window.addEventListener('orientationchange',queue);
    if(window.visualViewport)window.visualViewport.addEventListener('resize',queue);
    if(mq&&mq.addEventListener)mq.addEventListener('change',queue);
    queue();
    return()=>{
      if(raf)cancelAnimationFrame(raf);
      ro.disconnect();mo.disconnect();
      window.removeEventListener('resize',queue);window.removeEventListener('orientationchange',queue);
      if(window.visualViewport)window.visualViewport.removeEventListener('resize',queue);
      if(mq&&mq.removeEventListener)mq.removeEventListener('change',queue);
      chart.style.removeProperty('--tracker-chart-h');
    };
  },[ready]);
}

// Lock touches (TRACK-08): while the chart ignores fingers this pill says so. Holding it until it fills, then lifting
// the finger, unlocks (a stray finger would only tap it, not hold it; unlocking on the lift keeps the pill under the
// finger until the touch is over). A keyboard or switch user can unlock with Enter or Space at once.
function TouchLockPill({onUnlock}){
  const[holding,setHolding]=useState(false);
  const[ready,setReady]=useState(false);
  const[released,setReleased]=useState(false);
  const timerRef=useRef(null);
  const readyRef=useRef(false);
  const goTimerRef=useRef(null);
  const holdMs=(window.TouchConstants&&window.TouchConstants.UNLOCK_HOLD_MS)||700;
  const stop=()=>{if(timerRef.current){clearTimeout(timerRef.current);timerRef.current=null;}readyRef.current=false;setHolding(false);setReady(false);};
  useEffect(()=>()=>{if(timerRef.current)clearTimeout(timerRef.current);if(goTimerRef.current)clearTimeout(goTimerRef.current);},[]);
  return <button type="button" className={"touch-lock-pill"+(holding?" touch-lock-pill--holding":"")+(ready?" touch-lock-pill--ready":"")}
    style={{"--unlock-ms":holdMs+"ms"}}
    onPointerDown={e=>{e.preventDefault();setHolding(true);if(timerRef.current)clearTimeout(timerRef.current);timerRef.current=setTimeout(()=>{timerRef.current=null;readyRef.current=true;setReady(true);},holdMs);}}
    // Unlock a moment after the finger lifts, not at once: the browser's follow-up click would otherwise land on whatever
    // is under the finger once the pill has gone.
    onPointerUp={()=>{const go=readyRef.current;stop();if(go){setReleased(true);goTimerRef.current=setTimeout(()=>{goTimerRef.current=null;onUnlock();},400);}}}
    onPointerCancel={stop} onPointerLeave={stop}
    onContextMenu={e=>e.preventDefault()}
    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onUnlock();}}}
    aria-label="Touches are locked. Hold, then lift your finger, to unlock; or press Enter.">
    <span className="touch-lock-pill__icon" aria-hidden="true">{Icons.lock?Icons.lock():null}</span>
    <span>{released?"Unlocked":(ready?"Lift to unlock":"Touches locked. Hold to unlock")}</span>
    <span className="touch-lock-pill__fill" aria-hidden="true"/>
  </button>;
}
function StopTimerDialog({seconds,stitches,hasActivity,onSave,onKeep,onClose}){
  const startMin=Math.max(1,Math.round(seconds/60));
  const[minutes,setMinutes]=useState(String(startMin));
  const nothing=seconds<1&&!hasActivity;
  const O=window.Overlay;
  const m=Number(minutes);
  const valid=minutes!==''&&Number.isFinite(m)&&m>=1&&m<=1440;
  const body=<>
    <h3 id="stoptimer-title" style={{marginTop:0,fontSize:20,color:'var(--text-primary)'}}>{nothing?"Nothing marked yet":"You stitched for "+startMin+" min"}</h3>
    <div id="stoptimer-body" style={{fontSize:'var(--text-lg)',color:'var(--text-secondary)',marginBottom:'var(--s-4)'}}>
      {nothing
        ?<p style={{marginTop:0,marginBottom:0}}>The timer has not recorded a second yet, so no session will be saved.</p>
        :<>
          <p style={{marginTop:0}}>{Math.round(stitches).toLocaleString('en-GB')} stitches in that time. Change the minutes if the timer ran when you were not stitching.</p>
          <label style={{display:'flex',flexDirection:'column',gap:4,fontSize:'var(--text-sm)'}}>Minutes
            <input type="number" inputMode="numeric" min={1} max={1440} step={1} value={minutes} onChange={e=>setMinutes(e.target.value)} autoFocus style={{padding:'8px 10px',borderRadius:'var(--radius-md)',border:'1px solid var(--border)',fontSize:'var(--text-lg)',minHeight:44,width:120}}/>
          </label>
          {!valid&&<p role="alert" style={{margin:'var(--s-2) 0 0',fontSize:'var(--text-sm)'}}>Enter between 1 and 1,440 minutes.</p>}
        </>}
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:'var(--s-2)'}}>
      <button className="resume-recap-btn resume-recap-btn--primary" disabled={!nothing&&!valid} onClick={()=>onSave(nothing?null:Math.round(m*60))}>{nothing?"Stop without saving":"Save session"}</button>
      <button className="resume-recap-btn" onClick={onKeep}>Keep timing</button>
    </div>
  </>;
  return O
    ?<O variant="dialog" maxWidth={420} labelledBy="stoptimer-title" describedBy="stoptimer-body" onClose={onClose} panelProps={{'data-stoptimer':'1'}}><div style={{padding:'var(--s-4)'}}>{body}</div></O>
    :<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="stoptimer-title"><div className="modal-content" style={{maxWidth:420}}>{body}</div></div>;
}
// ── Forgot to stop? ──
function ForgotStopDialog({info,onTrim,onStop,onKeep}){
  const O=window.Overlay;
  const mins=Math.max(1,Math.round((info.idleMs||0)/60000));
  const none=!info.lastMarkT;
  const body=<>
    <h3 id="forgotstop-title" style={{marginTop:0,fontSize:20,color:'var(--text-primary)'}}>Forgot to stop?</h3>
    <div id="forgotstop-body" style={{fontSize:'var(--text-lg)',color:'var(--text-secondary)',marginBottom:'var(--s-4)'}}>
      <p style={{margin:0}}>{none?"Your timer has been running for "+mins+" min and nothing has been marked.":"Your timer has run for "+mins+" min since your last stitch."} {none?"Stopping now will not save a session, since there is nothing in it.":"Trim it to your last stitch to leave that time out."}</p>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:'var(--s-2)'}}>
      <button className="resume-recap-btn resume-recap-btn--primary" onClick={onTrim}>{none?"Stop without saving":"Trim to my last stitch"}</button>
      <button className="resume-recap-btn" onClick={onKeep}>Keep going</button>
      {!none&&<button className="resume-recap-btn" onClick={onStop}>Stop now</button>}
    </div>
  </>;
  return O
    ?<O variant="dialog" maxWidth={420} labelledBy="forgotstop-title" describedBy="forgotstop-body" onClose={onKeep} panelProps={{'data-forgotstop':'1'}}><div style={{padding:'var(--s-4)'}}>{body}</div></O>
    :<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="forgotstop-title"><div className="modal-content" style={{maxWidth:420}}>{body}</div></div>;
}

// ── Session Summary Modal ──
function SessionSummaryModal({data,prevAvgSpeed,onViewBreadcrumbs,hasBreadcrumbs,onClose}){
  if(!data)return null;
  const{durationSeconds,stitchesCompleted,blocksCompleted,coloursCompleted,progressPctBefore,progressPctAfter}=data;
  const mins=Math.floor(durationSeconds/60),secs=durationSeconds%60;
  const speed=durationSeconds>0?Math.round(stitchesCompleted/(durationSeconds/3600)):0;
  const pctDiff=prevAvgSpeed>0?Math.round(((speed-prevAvgSpeed)/prevAvgSpeed)*100):null;
  const progressGain=progressPctBefore!=null&&progressPctAfter!=null?progressPctAfter-progressPctBefore:null;
  return(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="session-complete-title" onClick={onClose}>
      <div className="modal-content" style={{maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">{Icons.x?Icons.x():null}</button>
        <h3 id="session-complete-title" style={{marginTop:0,fontSize:18,color:"var(--text-primary)"}}>Session complete</h3>
        <div style={{display:"flex",flexDirection:"column",gap:'var(--s-2)',marginBottom:'var(--s-4)'}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Time</span><span style={{fontWeight:700}}>{mins}m {secs}s</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Stitches</span><span style={{fontWeight:700}}>{stitchesCompleted}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Speed</span><span style={{fontWeight:700}}>{speed} st/hr{pctDiff!=null?<span style={{fontSize:'var(--text-xs)',fontWeight:400,color:pctDiff>=0?"var(--success)":"var(--danger)",marginLeft:6}}>{pctDiff>=0?"+":""}{pctDiff}% vs avg</span>:null}</span></div>
          {progressPctBefore!=null&&progressPctAfter!=null&&<div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Progress</span><span style={{fontWeight:700}}>{progressPctBefore}%<span style={{color:"var(--text-tertiary)",fontWeight:400,margin:"0 4px"}}>to</span>{progressPctAfter}%{progressGain!=null&&progressGain>0&&<span style={{fontSize:'var(--text-xs)',fontWeight:400,color:"var(--success)",marginLeft:6}}>+{progressGain}%</span>}</span></div>}
          {blocksCompleted>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Blocks</span><span style={{fontWeight:700}}>{blocksCompleted}</span></div>}
          {coloursCompleted&&coloursCompleted.length>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:'var(--text-lg)'}}><span style={{color:"var(--text-secondary)"}}>Colours finished</span><span style={{fontWeight:700}}>{coloursCompleted.length}</span></div>}
        </div>
        <div style={{display:"flex",gap:'var(--s-2)'}}>
          {hasBreadcrumbs&&<button onClick={onViewBreadcrumbs} style={{flex:1,padding:"8px",borderRadius:'var(--radius-md)',border:"1px solid var(--border)",background:"var(--surface)",cursor:"pointer",fontSize:'var(--text-md)',fontWeight:600,color:"var(--text-secondary)"}}>View breadcrumb trail</button>}
          <button onClick={onClose} style={{flex:1,padding:"8px",borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontSize:'var(--text-md)',fontWeight:600}}>Close</button>
        </div>
      </div>
    </div>
  );
}

function TrackerProjectPicker({list,currentId,onPick,onClose}){
  const sorted=[...(list||[])].sort((a,b)=>{
    const ad=a.updatedAt?new Date(a.updatedAt).getTime():0;
    const bd=b.updatedAt?new Date(b.updatedAt).getTime():0;
    return bd-ad;
  });
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--surface)",borderRadius:'var(--radius-xl)',padding:20,maxWidth:560,width:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:'var(--s-3)'}}>
          <h3 style={{margin:0,fontSize:17,color:"var(--text-primary)"}}>Switch project</h3>
          <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",padding:"0 4px",display:"inline-flex",alignItems:"center"}}>{Icons.x?Icons.x():null}</button>
        </div>
        <p style={{margin:"0 0 12px",fontSize:'var(--text-sm)',color:"var(--text-tertiary)"}}>Pick another saved project to track. Your current progress is auto-saved.</p>
        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:'var(--s-2)',paddingRight:4}}>
          {sorted.length===0&&<div style={{padding:"24px 0",textAlign:"center",fontSize:'var(--text-md)',color:"var(--text-tertiary)"}}>No saved projects yet.</div>}
          {sorted.map(p=>{
            const isActive=p.id===currentId;
            const total=p.totalStitches||0;
            const done=p.completedStitches||0;
            const pct=ProgressUnits.percent(done,total);
            return(
              <button key={p.id} onClick={()=>!isActive&&onPick(p)} disabled={isActive} style={{
                display:"flex",alignItems:"center",gap:'var(--s-3)',padding:"10px 12px",borderRadius:'var(--radius-md)',
                border:isActive?"2px solid var(--accent)":"1px solid var(--border)",
                background:isActive?"var(--accent-light)":"var(--surface)",
                cursor:isActive?"default":"pointer",textAlign:"left",fontFamily:"inherit",
                opacity:isActive?0.85:1
              }}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'var(--text-md)',fontWeight:600,color:"var(--text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {p.name||"Untitled"}
                    {isActive&&<span style={{marginLeft:'var(--s-2)',fontSize:10,fontWeight:700,color:"var(--accent-text)",background:"var(--accent-light)",padding:"1px 6px",borderRadius:'var(--radius-md)',verticalAlign:"middle"}}>ACTIVE</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:'var(--s-2)',marginTop:'var(--s-1)'}}>
                    <div style={{flex:1,height:5,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:pct+"%",height:"100%",background:pct===100?"var(--success)":"var(--accent)"}}/>
                    </div>
                    <span style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",fontVariantNumeric:"tabular-nums",minWidth:36,textAlign:"right"}}>{pct}%</span>
                  </div>
                  <div style={{fontSize:10,color:"var(--text-tertiary)",marginTop:3}}>
                    {p.dimensions?(p.dimensions.width+"\u00D7"+p.dimensions.height+" \u00B7 "):""}
                    {done.toLocaleString('en-GB')+" / "+total.toLocaleString('en-GB')+" stitches"}
                    {p.updatedAt?(" \u00B7 updated "+new Date(p.updatedAt).toLocaleDateString('en-GB')):""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// The high-frequency stroke preview has its own subscription and render tree.
// Controls still receive mode/anchor changes from useDragMark immediately.
const DragMarkOverlay=React.memo(function DragMarkOverlay({store,pulse,w,h,scs,G}){
  const state=React.useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  if(!state.path.size&&state.anchor==null&&!pulse)return null;
  return (
    <div className={"drag-mark-overlay drag-mark-overlay--"+(state.intent||'mark')}
         style={{position:"absolute",top:-G,left:-G,zIndex:6,pointerEvents:"none",
                 width:w*scs+G,height:h*scs+G}}>
      {[...state.path].map(function(idx){
        var x=(idx%w)*scs+G, y=Math.floor(idx/w)*scs+G;
        return <div key={"p"+idx} className="drag-mark-cell"
                    style={{left:x,top:y,width:scs,height:scs}}/>;
      })}
      {state.anchor!=null&&(function(){
        var idx=state.anchor;
        var x=(idx%w)*scs+G, y=Math.floor(idx/w)*scs+G;
        return <div key={"a"+idx} className="drag-mark-anchor"
                    style={{left:x,top:y,width:scs,height:scs}}/>;
      })()}
      {pulse&&[...pulse].map(function(idx){
        var x=(idx%w)*scs+G, y=Math.floor(idx/w)*scs+G;
        return <div key={"x"+idx} className="drag-mark-pulse cell-pulse"
                    style={{left:x,top:y,width:scs,height:scs}}/>;
      })}
    </div>
  );
});

// ─── Event-log timing engine ─────────────────────────────────────────────────
// computeActiveMs: pure function — active stitching duration from an event log.
// Events each carry {kind, t} (t = Unix ms). Recognised kinds:
//   start, stitch, frog (an unpicked area), hidden, visible, manualPause, manualResume
// Intervals inside a hidden or manualPause span are excluded entirely.
// Classic mode credits all eligible gaps at most capMs each.
// Batch-aware mode keeps the same rules except that an interval ending in a
// bulk stitch event (delta > 1) can scale beyond the base cap.
// Manual mode counts the full visible, unpaused wall-clock interval while the
// session is open, regardless of how often stitches are marked.
function normaliseTimingMode(mode) {
  if (mode === 'batchAware' || mode === 'manual') return mode;
  return 'classic';
}
function getEventGapCapMs(ev, baseCapMs) {
  if (!ev || ev.kind !== 'stitch') return baseCapMs;
  var burst = Math.max(1, Math.abs(ev.delta || 1));
  if (burst <= 1) return baseCapMs;
  return Math.min(10 * 60 * 1000, baseCapMs * Math.min(burst, 6));
}
function computeActiveMsClassic(log, upToTime, capMs) {
  if (!log || log.length === 0) return 0;
  var activeMs = 0;
  var hiddenAt = null;
  var manualPauseAt = null;
  var prevT = null;
  for (var i = 0; i < log.length; i++) {
    var ev = log[i];
    var t = ev.t <= upToTime ? ev.t : upToTime;
    if (prevT !== null && t > prevT) {
      if (hiddenAt === null && manualPauseAt === null) {
        activeMs += Math.min(t - prevT, capMs);
      }
    }
    if (ev.t > upToTime) { prevT = t; break; }
    if      (ev.kind === 'hidden')       hiddenAt = ev.t;
    else if (ev.kind === 'visible')      hiddenAt = null;
    else if (ev.kind === 'manualPause')  manualPauseAt = ev.t;
    else if (ev.kind === 'manualResume') manualPauseAt = null;
    prevT = ev.t;
  }
  if (prevT !== null && prevT < upToTime && hiddenAt === null && manualPauseAt === null) {
    activeMs += Math.min(upToTime - prevT, capMs);
  }
  return activeMs;
}
function computeActiveMsBatchAware(log, upToTime, capMs) {
  if (!log || log.length === 0) return 0;
  var activeMs = 0;
  var hiddenAt = null;
  var manualPauseAt = null;
  var prevT = null;
  var prevEv = null;
  for (var i = 0; i < log.length; i++) {
    var ev = log[i];
    var t = ev.t <= upToTime ? ev.t : upToTime;
    if (prevT !== null && t > prevT) {
      if (hiddenAt === null && manualPauseAt === null) {
        activeMs += Math.min(t - prevT, getEventGapCapMs(ev, capMs));
      }
    }
    if (ev.t > upToTime) { prevT = t; break; }
    if      (ev.kind === 'hidden')       hiddenAt = ev.t;
    else if (ev.kind === 'visible')      hiddenAt = null;
    else if (ev.kind === 'manualPause')  manualPauseAt = ev.t;
    else if (ev.kind === 'manualResume') manualPauseAt = null;
    prevT = ev.t;
    prevEv = ev;
  }
  // Tail: from last event up to upToTime
  if (prevT !== null && prevT < upToTime && hiddenAt === null && manualPauseAt === null) {
    activeMs += Math.min(upToTime - prevT, capMs);
  }
  return activeMs;
}
function computeActiveMsManual(log, upToTime) {
  if (!log || log.length === 0) return 0;
  var activeMs = 0;
  var hiddenAt = null;
  var manualPauseAt = null;
  var prevT = null;
  for (var i = 0; i < log.length; i++) {
    var ev = log[i];
    var t = ev.t <= upToTime ? ev.t : upToTime;
    if (prevT !== null && t > prevT) {
      if (hiddenAt === null && manualPauseAt === null) {
        activeMs += (t - prevT);
      }
    }
    if (ev.t > upToTime) { prevT = t; break; }
    if      (ev.kind === 'hidden')       hiddenAt = ev.t;
    else if (ev.kind === 'visible')      hiddenAt = null;
    else if (ev.kind === 'manualPause')  manualPauseAt = ev.t;
    else if (ev.kind === 'manualResume') manualPauseAt = null;
    prevT = ev.t;
  }
  if (prevT !== null && prevT < upToTime && hiddenAt === null && manualPauseAt === null) {
    activeMs += (upToTime - prevT);
  }
  return activeMs;
}
function computeActiveMs(log, upToTime, capMs, mode) {
  var timingMode = normaliseTimingMode(mode);
  if (timingMode === 'batchAware') return computeActiveMsBatchAware(log, upToTime, capMs);
  if (timingMode === 'manual') return computeActiveMsManual(log, upToTime);
  return computeActiveMsClassic(log, upToTime, capMs);
}

// Derive current paused state from the event log (for liveAutoIsPaused).
function deriveIsLogPaused(log) {
  if (!log || log.length === 0) return false;
  var hidden = false, manual = false;
  for (var i = 0; i < log.length; i++) {
    var k = log[i].kind;
    if      (k === 'hidden')       hidden = true;
    else if (k === 'visible')      hidden = false;
    else if (k === 'manualPause')  manual = true;
    else if (k === 'manualResume') manual = false;
  }
  return hidden || manual;
}
// ─────────────────────────────────────────────────────────────────────────────
// Expose to useAutoSession.js (loaded as a separate script in the same page)
if (typeof window !== 'undefined') { window.computeActiveMs = computeActiveMs; window.deriveIsLogPaused = deriveIsLogPaused; }

function formatTimingModeLabel(mode) {
  if (mode === 'batchAware') return 'Batch-friendly';
  if (mode === 'manual') return 'Manual timer';
  return 'Classic';
}
function formatTimingModeShortLabel(mode) {
  if (mode === 'batchAware') return 'Batch';
  if (mode === 'manual') return 'Manual';
  return 'Classic';
}
// UX-fix — session timer mode was only explained in Preferences, with no
// inline hint at the point the mode badge is actually shown. Mirrors the
// wording in preferences-modal.js's "Session timing mode" row.
function formatTimingModeDescription(mode) {
  if (mode === 'batchAware') return 'Batch-friendly timing: credits longer gaps when you mark a large run of stitches at once.';
  if (mode === 'manual') return 'Manual timer: runs until you pause, hide the tab, or the idle timeout ends the session.';
  return 'Classic timing: uses a fixed cap on how long a break still counts as stitching time.';
}

// Part stitches as saved: each quarter names its brand when that isn't the
// project's (P4-5), so a DMC quarter in an Anchor pattern stays DMC.
function partialsForSave(partialStitches,projectBrand){
  return [...partialStitches.entries()].map(([k,v])=>{
    const e=Object.assign({},v);
    ["TL","TR","BL","BR"].forEach(q=>{
      if(!v||!v[q])return;
      const qb=cellBrandForSave(v[q],projectBrand);
      e[q]=Object.assign({},v[q]);
      if(qb)e[q].brand=qb;else delete e[q].brand;
    });
    return [k,e];
  });
}
function TrackerApp({onSwitchToDesign=null, onGoHome=null, isActive=true, incomingProject=null}={}){
const[sW,setSW]=useState(80);
const[sH,setSH]=useState(80);
const[pat,setPat]=useState(null);
const[pal,setPal]=useState(null);
const[cmap,setCmap]=useState(null);
const incomingProjectRef=useRef(incomingProject);
// T-4: set to true after any successful processLoadedProject. The mount
// effect's fallback chain (handoff -> URL hash -> active project) checks
// this so a late-arriving `incomingProject` prop doesn't get overridden
// by a fallback load that ran in the same tick. The prop effect always
// wins because it sets the ref after it processes; the mount effect's
// ProjectStorage.getActiveProject() fallback is also deferred to the
// next microtask so the prop effect has a chance to run first.
const hasLoadedOnceRef=useRef(false);
// Ref kept current every render so the window.__navigateToEditor wrapper always
// calls the latest handleEditInCreator closure (which captures current state).
const _editInCreatorRef=useRef(null);
const[fabricCt,setFabricCt]=useState(14);
const prefs = window.useTrackerPrefs();
const { skeinPrice, setSkeinPrice, stitchSpeed, setStitchSpeed, statsSettings, setStatsSettings } = prefs;
const canvas = window.useCanvasOverlays({ sW, sH });
const { stitchView, setStitchView, stitchZoom, setStitchZoom, stitchZoomRef,
  highlightSkipDone, setHighlightSkipDone, onlyStarted, setOnlyStarted,
  trackerDimLevel, setTrackerDimLevel, trackerFabricColour, setTrackerFabricColour,
  trackerCanvasTexture, setTrackerCanvasTexture, paletteDetail, setPaletteDetail,
  highlightMode, setHighlightMode, tintColor, setTintColor, tintOpacity, setTintOpacity,
  spotDimOpacity, setSpotDimOpacity,
  hlIntroSeen, setHlIntroSeen, hlIntroBannerVisible, setHlIntroBannerVisible, hlIntroTimerRef,
  countingAidsEnabled, setCountingAidsEnabled, countRunMin, setCountRunMin,
  countRunDir, setCountRunDir, countNinjaEnabled, setCountNinjaEnabled,
  countingAidsCanvasRef, countingAidsRafRef,
  focusOverlayCanvasRef, breadcrumbCanvasRef, threadUsageCanvasRef,
  hlRow, setHlRow, hlCol, setHlCol, selectedColorId, setSelectedColorId,
  scs, fitSZ, maxZoom } = canvas;
// The guide crosshair as drawStitch sees it (read through a ref because the
// guide is repainted incrementally, not by a full renderStitch).
const guideRef=useRef({row:-1,col:-1});
// Keyboard marking (Phase 5, TRACK-10): true once the arrow keys or Enter have taken the guide, so Space and Enter act on it; a
// pointer press, Esc or a change of mode hands it back. kbAnchorRef is the last stitch marked from the keyboard (for Shift+Enter).
const kbGuideRef=useRef(false);
const kbAnchorRef=useRef(null);
guideRef.current={row:hlRow,col:hlCol};

const[loadError,setLoadError]=useState(null);
// A PDF being read: what the importer is doing, and a way to stop it.
// { label, stopping, cancel } while busy, else null.
const[importBusy,setImportBusy]=useState(null);
const[copied,setCopied]=useState(null);
const[modal,setModal]=useState(null);
// ── Mobile: bottom action bar + colour quick-switcher state ──
// `quickColourOpen` toggles a dedicated bottom drawer that lets the user pick
// the focus colour with one tap. It's only used on touch / narrow viewports.
const[quickColourOpen,setQuickColourOpen]=useState(false);
// ── Phase 4 (UX-12) — floating tool dock vertical position (phone) ──
// User-draggable along the right edge. Persisted between sessions.
const[dockY,setDockY]=useState(()=>{
  try{const v=parseInt(localStorage.getItem("tracker_dock_y")||"",10);return Number.isFinite(v)?v:40;}catch(_){return 40;}
});
useEffect(()=>{try{localStorage.setItem("tracker_dock_y",String(dockY));}catch(_){}},[dockY]);
const { wakeLockActive, toggleWakeLock, keepAwakeOnMark } = window.useWakeLock();
// Tag the document body with `tracker-mobile` while the Tracker is mounted on a
// touch / narrow viewport. CSS scopes the new bottom action bar and quick-
// switcher drawer to this class so desktop layout is untouched.
useEffect(()=>{
  if(typeof window==='undefined'||!window.matchMedia)return;
  const mql=window.matchMedia('(pointer: coarse), (max-width: 899px)');
  const apply=()=>{document.body.classList.toggle('tracker-mobile',mql.matches);};
  apply();
  // Modern + legacy listener API
  if(mql.addEventListener)mql.addEventListener('change',apply);
  else if(mql.addListener)mql.addListener(apply);
  return()=>{
    document.body.classList.remove('tracker-mobile');
    document.body.classList.remove('tracker-immersive');
    if(mql.removeEventListener)mql.removeEventListener('change',apply);
    else if(mql.removeListener)mql.removeListener(apply);
  };
},[]);
// ── Mobile immersive mode ──
// While actively scrolling the pattern, slide the topbar + toolbar off-screen
// so the canvas can use almost the full viewport. On any upward scroll the
// chrome reappears immediately. Only active on touch / narrow viewports.
// Re-evaluates when the media query changes (e.g. on resize or screen rotation).
useEffect(()=>{
  if(typeof window==='undefined'||!window.matchMedia)return;
  const mql=window.matchMedia('(pointer: coarse), (max-width: 899px)');
  // Canvas scroll container is created later — poll briefly until it exists.
  let lastY=0,raf=0;
  function handleScroll(target){
    const y=target.scrollTop;
    if(raf)return;
    raf=requestAnimationFrame(()=>{
      raf=0;
      const goingDown=y>lastY;
      if(goingDown&&y>50){document.body.classList.add('tracker-immersive');}
      else if(!goingDown){document.body.classList.remove('tracker-immersive');}
      lastY=y;
    });
  }
  let attached=null;
  function attach(){
    const el=document.querySelector('.canvas-area');
    if(!el)return false;
    const fn=(e)=>handleScroll(e.target);
    el.addEventListener('scroll',fn,{passive:true});
    attached={el,fn};
    return true;
  }
  function detach(){
    if(attached){attached.el.removeEventListener('scroll',attached.fn);attached=null;}
    if(raf){cancelAnimationFrame(raf);raf=0;}
    document.body.classList.remove('tracker-immersive');
  }
  let tries=[];
  function enable(){
    if(attached)return;
    lastY=0;
    if(!attach()){
      tries=[100,300,800,1500].map(d=>setTimeout(()=>{if(!attached&&mql.matches)attach();},d));
    }
  }
  function onMqlChange(){
    if(mql.matches){enable();}else{tries.forEach(clearTimeout);tries=[];detach();}
  }
  if(mql.addEventListener)mql.addEventListener('change',onMqlChange);
  else if(mql.addListener)mql.addListener(onMqlChange);
  // Initialise for the current state.
  if(mql.matches)enable();
  return()=>{
    if(mql.removeEventListener)mql.removeEventListener('change',onMqlChange);
    else if(mql.removeListener)mql.removeListener(onMqlChange);
    tries.forEach(clearTimeout);
    detach();
  };
},[]);
// Generic Tracker welcome — fires once on first visit, before the existing
// StitchingStyleOnboarding (which is domain-specific).
const welcomeAskedRef=useRef(false); // true when the person asked for the tour (Help menu), so a loaded pattern does not retire it
const[welcomeOpen,setWelcomeOpen]=useState(()=>{try{return !!(window.WelcomeWizard&&window.WelcomeWizard.shouldShow('tracker'));}catch(_){return false;}});
// Global "?" shortcut → open Help Centre.
useEffect(()=>{const h=()=>setModal("help");window.addEventListener("cs:openHelp",h);return()=>window.removeEventListener("cs:openHelp",h);},[]);
// Command Palette → Shortcuts modal.
useEffect(()=>{const h=()=>setModal("shortcuts");window.addEventListener("cs:openShortcuts",h);return()=>window.removeEventListener("cs:openShortcuts",h);},[]);
// "Show welcome tour again" from HelpCentre → re-open the wizard.
useEffect(()=>{const h=(e)=>{if(!e||!e.detail||e.detail.page==='tracker'){welcomeAskedRef.current=true;setWelcomeOpen(true);}};window.addEventListener("cs:showWelcome",h);return()=>window.removeEventListener("cs:showWelcome",h);},[]);
// Register Tracker-specific Command Palette actions (M9).
useEffect(()=>{
  if(!window.CommandPalette||!window.CommandPalette.registerPage)return;
  window.CommandPalette.registerPage('tracker',[
    { id:'trk_save_project', label:'Save Project', section:'action', keywords:['save','project'],
      action:()=>{ try{ if(typeof saveProject==='function') saveProject(); }catch(_){} } },
    { id:'trk_export_pdf', label:'Export Pattern Keeper PDF', section:'action', keywords:['pdf','export','print','pattern','keeper'],
      action:()=>setModal('pdf_export') },
    { id:'trk_export_oxs', label:'Export as Open X-Stitch (.oxs)', section:'action', keywords:['oxs','export','macstitch','winstitch','flosscross','open','x-stitch'],
      action:()=>{ try{ if(typeof doExportOxs==='function') doExportOxs(); }catch(_){} } },
    { id:'trk_show_welcome', label:'Show Welcome Tour', section:'action', keywords:['welcome','tour','onboarding','intro'],
      action:()=>{welcomeAskedRef.current=true;setWelcomeOpen(true);} }
  ]);
  return()=>{ if(window.CommandPalette) window.CommandPalette.registerPage('tracker',[]); };
},[]);
const[projectPickerOpen,setProjectPickerOpen]=useState(false);
const[projectPickerList,setProjectPickerList]=useState([]);
const[preferencesOpen,setPreferencesOpen]=useState(false);
// UX-fix — lets the session-timer mode badge deep-link straight into the
// Preferences panel's Tracker category instead of forcing the user to hunt
// for it manually.
const[preferencesInitialCategory,setPreferencesInitialCategory]=useState(null);
const[shortcutsHintDismissed,setShortcutsHintDismissed]=useState(()=>{try{return !!localStorage.getItem("shortcuts_hint_dismissed");}catch(_){return false;}});
const[trackerLoadCount,setTrackerLoadCount]=useState(()=>{try{const n=parseInt(localStorage.getItem("cs_trackerHintLoadCount")||"0",10);return isNaN(n)?0:n;}catch(_){return 0;}});
const hintLoadCountedRef=useRef(false);
const showCtr=true;
const[bsLines,setBsLines]=useState([]);

const[done,_setDoneState]=useState(null);
// ── BUGFIX: live ref to latest `done` so toggle/bulk callbacks always
//    read the freshest array even when invoked before React commits a
//    prior setDone. Prevents the "marking a new stitch unmarks all
//    previous in-session stitches" regression caused by stale closures
//    in fast-tap sequences (incremental counters survive because they
//    use refs; the visible `done` array did not).
// The ref is the newest array *requested*, set in the same call as the state.
// It is deliberately not re-assigned during render: a tap's render runs as a
// transition (see _dragMarkOnToggle), and any render that happens before it
// commits still carries the previous array — copying that into the ref would
// make the next tap start from it and drop the mark.
const doneRef=useRef(null);
function setDone(nd){doneRef.current=nd;_setDoneState(nd);}
// A tap or stroke paints its cells straight onto the chart, and every ref the
// next tap, Undo or a save reads is updated by the calls inside fn. What is
// left is re-rendering the Tracker (and the work keyed on `done`), which on a
// well-progressed chart is long. Running those state updates as a transition
// lets the browser show the stitch first instead of after that render.
function commitMarkState(fn){
  if(typeof React.startTransition==='function')React.startTransition(fn);else fn();
}
const[doneSnapshots,setDoneSnapshots]=useState([]);
const lastSnapshotDateRef=useRef(null);
const snapshotGenerationRef=useRef(0);
const deletedSnapshotIdsRef=useRef([]);
// Invalidate synchronously on preference events, even off/on before React renders.
useEffect(()=>{
  const on=e=>{
    const key=e&&e.detail&&e.detail.key;
    if(key&&key!=='trackerAutomaticSnapshots'&&key!=='statsDayEndHour')return;
    snapshotGenerationRef.current++;
    lastSnapshotDateRef.current=getStitchingDate(new Date(),getDayEndHour());
  };
  window.addEventListener('cs:prefchange',on);
  const storage=e=>{if(!e.key||e.key==='cs_pref_trackerAutomaticSnapshots'||e.key==='cs_pref_statsDayEndHour')on();};
  window.addEventListener('storage',storage);
  return()=>{snapshotGenerationRef.current++;window.removeEventListener('cs:prefchange',on);window.removeEventListener('storage',storage);};
},[]);
function updateCompareSnapshots(update){
  setDoneSnapshots(prev=>{
    const next=typeof update==='function'?update(prev):update;
    const retained=new Set(next.map(s=>s.id));
    const deleted=prev.filter(s=>!retained.has(s.id)).map(s=>s.id);
    deletedSnapshotIdsRef.current=Array.from(new Set([...deletedSnapshotIdsRef.current,...deleted]));
    return next;
  });
}
const[trackHistory,_setTrackHistory]=useState([]);
const trackHistoryRef=useRef(trackHistory);
function setTrackHistory(update){const next=typeof update==='function'?update(trackHistoryRef.current):update;trackHistoryRef.current=next;_setTrackHistory(next);}
const[redoStack,_setRedoStack]=useState([]);
const redoStackRef=useRef(redoStack);
function setRedoStack(update){const next=typeof update==='function'?update(redoStackRef.current):update;redoStackRef.current=next;_setRedoStack(next);}
const TRACK_HISTORY_MAX=50;

const[statsView,setStatsView]=useState(false);
const[statsTab,setStatsTab]=useState('all');
// Streaks, goals and celebrations on or off (Preferences). The ref lets the effects below read the live value without re-running.
const motivation=useMotivationPrefs();const motivationRef=useRef(motivation);motivationRef.current=motivation;
const[trackerPreviewOpen,setTrackerPreviewOpen]=useState(false);
const[trackerPreviewLevel,setTrackerPreviewLevel]=useState(2);
const[stitchMode,setStitchMode]=useState("track");
// R11: Row-by-row navigation mode — session-local, not persisted.
const[rowModeActive,setRowModeActive]=useState(false);
const[currentRow,setCurrentRow]=useState(0);
const[isEditMode,setIsEditMode]=useState(false);
const[originalPaletteState,setOriginalPaletteState]=useState(null);
// V2: single-level undo snapshot (replaces editHistory array)
const[undoSnapshot,setUndoSnapshot]=useState(null);
// V2: sparse diff of single-stitch edits/removals: Map<cellIdx, {originalId, currentId|null}>
const[singleStitchEdits,setSingleStitchEdits]=useState(new Map());
// V2: cell edit popover state
const[cellEditPopover,setCellEditPopover]=useState(null);
// V2: snapshot taken on entering Edit Mode, used by Discard
const[sessionStartSnapshot,setSessionStartSnapshot]=useState(null);
const[editModalColor,setEditModalColor]=useState(null);
const[showExitEditModal,setShowExitEditModal]=useState(false);
const[drawer,setDrawer]=useState(false);
const[focusColour,setFocusColour]=useState(null);
const[showNavHelp,setShowNavHelp]=useState(false);
const[advanceToast,setAdvanceToast]=useState(null);
const[parkMarkers,setParkMarkers]=useState([]);
// Multi-colour parking — Option C: per-colour visibility map.
// Keys are DMC IDs (or blend IDs). Missing key = visible (default true).
// Persisted per project alongside layerVis (cs_parkLayers_<projectId>).
const[parkLayers,setParkLayers]=useState({});
// Convenience: a marker is visible iff parkLayers[colourId] !== false.
function isParkLayerVisible(cid){return parkLayers[cid]!==false;}
// A marker is spent once its stitch is done — the parked thread was used to
// make it (Pattern Keeper clears it the same way). Spent markers are hidden
// rather than deleted, so undoing the mark brings the marker back; they are
// pruned when the project is next loaded (processLoadedProject).
function isParkSpent(pm,doneArr){return !!(doneArr&&doneArr[pm.y*sW+pm.x]);}
// Read by drawStitch: markers are repainted incrementally (the park repaint
// effect), not through renderStitch's deps, so its closure may predate them.
const parkMarkersRef=useRef(parkMarkers);parkMarkersRef.current=parkMarkers;
const parkLayersRef=useRef(parkLayers);parkLayersRef.current=parkLayers;
// ── Stitching Style & Spatial Focus Area ──
const[stitchingStyle,setStitchingStyle]=useState(()=>{try{var ls=localStorage.getItem("cs_stitchStyle");if(ls)return ls;var p=window.UserPrefs&&window.UserPrefs.get("trackerStitchingStyle");return p||"block";}catch(_){return"block";}});
// T-2: default to 10/10/TL on mount and let processLoadedProject
// pick the project value (or fall back to localStorage when the
// project doesn't specify one). Reading localStorage here caused
// the previous project's block size to flash on the first render
// when switching projects.
const[blockW,setBlockW]=useState(10);
const[blockH,setBlockH]=useState(10);
const[focusBlock,setFocusBlock]=useState(null); // {bx,by} | null
// Work area: the group of Spotlight sections the chart is clipped to. Saved
// on the project and synced (newer setAt wins); see work-area.js.
// null | {active,x0,y0,x1,y1,bw,bh,gridW,gridH,setAt}
const[workArea,setWorkArea]=useState(null);
// Stitches of faded context shown around the area (a per-stitcher
// preference, not part of the project).
const[workAreaMargin,setWorkAreaMarginState]=useState(()=>{
  try{const v=window.UserPrefs&&window.UserPrefs.get("trackerWorkAreaMargin");if(typeof v==="number"&&v>=0&&v<=20)return v;}catch(_){}
  return(window.WorkArea&&window.WorkArea.DEFAULT_MARGIN)||3;
});
const setWorkAreaMargin=useCallback(v=>{
  setWorkAreaMarginState(v);
  try{if(window.UserPrefs)window.UserPrefs.set("trackerWorkAreaMargin",v);}catch(_){}
},[]);
const areaOn=!!(workArea&&workArea.active);
useEffect(()=>{
  if(!workArea||!window.WorkArea||(workArea.gridW===blockW&&workArea.gridH===blockH))return;
  const snapped=window.WorkArea.snapToSections(workArea,blockW,blockH,sW,sH);
  setWorkArea(Object.assign(snapped,{active:workArea.active,setAt:workArea.setAt,gridW:blockW,gridH:blockH}));
},[workArea,blockW,blockH,sW,sH]);
// The cells the chart shows: the work area plus its margin, or the whole
// pattern. The scroller's extent and the rulers cover only this, so scroll
// positions are relative to its corner; chartScrollOffset() converts.
const viewBounds=useMemo(()=>(areaOn&&window.WorkArea)
  ?window.WorkArea.bounds(workArea,workAreaMargin,sW,sH)
  :{x0:0,y0:0,x1:sW,y1:sH},[areaOn,workArea,workAreaMargin,sW,sH]);
const viewBoundsRef=useRef(viewBounds);
viewBoundsRef.current=viewBounds;
// Chart pixels hidden off the scroller's top-left by the view: add to a
// scroll position to get chart coordinates, subtract to go back.
function chartScrollOffset(cSz){const v=viewBoundsRef.current;const c=cSz||scs;return{x:v.x0*c,y:v.y0*c};}
const[focusEnabled,setFocusEnabled]=useState(()=>{try{return localStorage.getItem("cs_focusEnabled")==="1";}catch(_){return false;}});
const[colourSequence,setColourSequence]=useState(()=>{try{return localStorage.getItem("cs_colourSeq")||"fewest";}catch(_){return"fewest";}});
const[startCorner,setStartCorner]=useState("TL");
// Gate the style picker on the generic Welcome wizard so they appear
// sequentially: Welcome first, style picker after dismissal. If the user has
// already seen the Welcome wizard (or never needed it on this build), the
// style picker shows immediately as before.
const[styleOnboardingOpen,setStyleOnboardingOpen]=useState(()=>{try{
  if(localStorage.getItem("cs_styleOnboardingDone")||localStorage.getItem("cs_stitchStyle"))return false;
  if(window.WelcomeWizard&&window.WelcomeWizard.shouldShow("tracker"))return false; // wait for welcome
  return true;
}catch(_){return false;}});
const[breadcrumbs,setBreadcrumbs]=useState([]);
const[breadcrumbVisible,setBreadcrumbVisible]=useState(()=>{try{return localStorage.getItem("cs_bcVisible")!=="0";}catch(_){return true;}});
useEffect(()=>{try{localStorage.setItem("cs_stitchStyle",stitchingStyle);}catch(_){}},[stitchingStyle]);
useEffect(()=>{try{localStorage.setItem("cs_blockW",String(blockW));}catch(_){}},[blockW]);
useEffect(()=>{try{localStorage.setItem("cs_blockH",String(blockH));}catch(_){}},[blockH]);
useEffect(()=>{try{localStorage.setItem("cs_focusEnabled",focusEnabled?"1":"0");}catch(_){}},[focusEnabled]);
useEffect(()=>{try{localStorage.setItem("cs_colourSeq",colourSequence);}catch(_){}},[colourSequence]);
useEffect(()=>{try{localStorage.setItem("cs_startCorner",startCorner);}catch(_){}},[startCorner]);
useEffect(()=>{try{localStorage.setItem("cs_bcVisible",breadcrumbVisible?"1":"0");}catch(_){}},[breadcrumbVisible]);
const[blockAdvanceToast,setBlockAdvanceToast]=useState(null);
const prevFocusBlockDoneRef=useRef(false);
const blockAdvanceTimerRef=useRef(null);
// ── Explicit session mode ──
const[explicitSession,setExplicitSession]=useState(null);
const[sessionConfigOpen,setSessionConfigOpen]=useState(false);
const[stopTimerAsk,setStopTimerAsk]=useState(null);   // { seconds, stitches } while the Stop dialog is open
const[sessionTimeChoice,setSessionTimeChoice]=useState(null);
const[sessionGoalInput,setSessionGoalInput]=useState("");
const[sessionSummaryData,setSessionSummaryData]=useState(null);
// A3 (UX Phase 5) — Resume recap modal shown once per project load when the
// project already has stitching sessions. Cleared via Continue/Stats/Switch/Close.
const[resumeRecap,setResumeRecap]=useState(null);
const resumeRecapShownRef=useRef(new Set());
// The recap is only a hello: the first mark, or twenty seconds, retires it.
useEffect(()=>{
  if(!resumeRecap)return;
  let t;
  // Not while keyboard focus is inside it: taking the focused button away would drop the person's place.
  const arm=(ms)=>{t=setTimeout(()=>{const b=document.querySelector('.resume-recap-banner');if(b&&b.contains(document.activeElement))arm(5000);else setResumeRecap(null);},ms);};
  arm(20000);
  return()=>clearTimeout(t);
},[resumeRecap]);
useEffect(()=>{if(resumeRecap&&trackHistory.length>0)setResumeRecap(null);},[resumeRecap,trackHistory]);
// Marking is what keeps the screen on (TRACK-11): the first mark of a session takes the wake lock on a touch screen.
const prevHistRef=useRef({len:0,last:null});
useEffect(()=>{
  // Only a stitch or a knot going on to the history counts: not an undo (the history shrinks) and not a parked thread.
  const last=trackHistory.length?trackHistory[trackHistory.length-1]:null, prev=prevHistRef.current;
  prevHistRef.current={len:trackHistory.length,last};
  if(last&&last!==prev.last&&trackHistory.length>=prev.len&&last.type!=="PARK"&&keepAwakeOnMark)keepAwakeOnMark();
},[trackHistory,keepAwakeOnMark]);
// The pattern's size no longer matches the saved marks: held here until the user decides (see
// processLoadedProject). While it is set nothing is written, so closing the tab changes nothing.
const[reconcile,setReconcile]=useState(null);
// Marking a whole colour done: asked once whether it counts as today's stitching or as catch-up (remembered).
const[markAllAsk,setMarkAllAsk]=useState(null);

const savesBlockedRef=useRef(false);
const dragStateRef=useRef({isDragging:false, dragVal:1});
const dragChangesRef=useRef([]);
const scrollRafRef=useRef(null);
// Canvas-space region currently painted on the chart, plus the cell size it
// was painted at. Set by renderStitch, read by renderStitchIfScrolledOut to
// skip repaints while the viewport is still inside it.
const paintedRectRef=useRef(null);
// The renderStitch that last made the chart canvas match state: set by its
// full paints, and by the redraw effect when a mark's own partial paint stood
// in for one. While it is still the current renderStitch nothing drawn has
// changed, so the pixels on the canvas are still right and a tile move can
// keep them (shiftChartTile).
const chartPaintedByRef=useRef(null);
// Tile the chart canvas currently shows (see chartTileFor). Every conversion
// between screen and chart coordinates has to add this origin back, so it is
// the one place that knows where the canvas is, and it must be set before any
// draw or hit-test reads it — renderStitch does that on the first paint.
const chartTileRef=useRef({x:0,y:0,w:0,h:0,full:true});
// Overlay canvases share the chart's geometry, so they have to follow the tile
// when it moves. Each overlay effect registers its draw function here and
// removes it on cleanup; renderStitch invokes whatever is registered.
const chartOverlayRedrawRef=useRef({});
function redrawChartOverlays(){
  const reg=chartOverlayRedrawRef.current;
  for(const k in reg){try{reg[k]();}catch(e){console.error("overlay redraw failed: "+k,e);}}
}
// Register an overlay's draw function under `name` for the lifetime of an
// effect. Returns the cleanup to hand back from the effect, so an overlay that
// unmounts cannot leave a stale closure being called on every scroll.
function registerChartOverlay(name,draw){
  chartOverlayRedrawRef.current[name]=draw;
  return()=>{delete chartOverlayRedrawRef.current[name];};
}
// Point an overlay canvas at the chart's current tile and return its context.
// Overlays sit on the chart's geometry, so they share its tile exactly.
function prepareOverlayTile(canvas){
  if(!canvas)return null;
  // Follow the tile the *chart* is on rather than recomputing from the current
  // scroll position. Two reasons: the overlays must stay registered to the
  // chart or they would show a different slice of the pattern for a frame, and
  // the recommendation pulse runs this at 60fps — recomputing there made every
  // pan frame move and blank the overlay, which is what pushed cleared pixels
  // up rather than down. Overlays now move only when the chart moves.
  const ref=chartTileRef.current;
  const tile=(ref&&ref.w>0)?ref:chartTileFor(stitchScrollRef.current,scs,sW,sH,G,viewBoundsRef.current);
  // A zero-sized tile means the scroller has not been measured yet; there is
  // nothing to draw into and no geometry to draw it at.
  if(!tile||!tile.w||!tile.h)return null;
  const a=applyChartTile(canvas,tile,G,{scale:1});
  return{ctx:a.ctx,invalidated:a.invalidated,tile};
}
// Clear the whole tile. Called through the chart-coordinate transform, so the
// rect is expressed in chart space rather than canvas space.
function clearOverlayTile(ctx,tile){ctx.clearRect(tile.x,tile.y,tile.w,tile.h);}
// Cell range a tile covers. Overlays that walked the entire pattern on every
// redraw now walk only this — necessary as well as faster, because a tiled
// overlay redraws whenever the tile moves.
function tileCellRange(tile,cSz){
  return{
    x0:Math.max(0,Math.floor((tile.x-G)/cSz)),
    y0:Math.max(0,Math.floor((tile.y-G)/cSz)),
    x1:Math.min(sW,Math.ceil((tile.x+tile.w-G)/cSz)),
    y1:Math.min(sH,Math.ceil((tile.y+tile.h-G)/cSz)),
  };
}
const lastClickedRef=useRef(null); // { idx, row, col, val } for shift+click range
// C3: range-select state lives inside useDragMark (long-press anchor + shift+click).

// ═══ Half-stitch state ═══
// Sparse map: cellIdx → { fwd?: {id,rgb,lab,name,type,symbol}, bck?: {id,rgb,lab,name,type,symbol} }
const[halfStitches,setHalfStitches]=useState(new Map());
// Sparse map: cellIdx → { fwd?: 0|1, bck?: 0|1 }
const[halfDone,_setHalfDone]=useState(new Map());
const halfDoneRef=useRef(halfDone);
function setHalfDone(update){const next=typeof update==='function'?update(halfDoneRef.current):update;halfDoneRef.current=next;_setHalfDone(next);}
const[specialtyStitches,setSpecialtyStitches]=useState([]);
const[specialtyDone,setSpecialtyDone]=useState([]);
const[specialtySelected,setSpecialtySelected]=useState(null);
const specialtyDoneRef=useRef(specialtyDone);specialtyDoneRef.current=specialtyDone;
const[partialStitches,setPartialStitches]=useState(new Map());
// French knots (knots.js): [{x, y, id, rgb}] in half-stitch units, and the
// keys ("x,y") of those marked done.
const[knots,setKnots]=useState([]);
const[knotsDone,_setKnotsDone]=useState([]);
const knotsDoneRef=useRef(knotsDone);
function setKnotsDone(update){const next=typeof update==='function'?update(knotsDoneRef.current):update;knotsDoneRef.current=next;_setKnotsDone(next);}
// Backstitch lines marked done (backstitch.js keys) and quarter stitches marked done (fractional.js: Map of
// cellIndex -> Set of positions). Beads have independent object identities and marks.
const[bsDone,setBsDone]=useState([]);
const[partialDone,_setPartialDone]=useState(new Map());
const partialDoneRef=useRef(partialDone);
function setPartialDone(update){const next=typeof update==='function'?update(partialDoneRef.current):update;partialDoneRef.current=next;_setPartialDone(next);}
const beadsRef=useRef(undefined);
const[beads,setBeads]=useState([]);
const[beadsDone,_setBeadsDone]=useState([]);
const beadsDoneRef=useRef([]);
function setBeadsDone(update){const next=typeof update==='function'?update(beadsDoneRef.current):update;beadsDoneRef.current=next;_setBeadsDone(next);}
const[selectedBead,setSelectedBead]=useState(null);
const[beadPanelOpen,setBeadPanelOpen]=useState(false);
const beadPanelRef=useRef(null);
const beadCounts=useMemo(()=>window.Beads.progress(beads,beadsDone),[beads,beadsDone]);
function flipBeadDone(uid){setBeadsDone(prev=>window.Beads.toggle(beadsRef.current,prev,uid));}
function toggleBeadDone(uid){
  if(!(beadsRef.current||[]).some(b=>b.uid===uid))return;
  flipBeadDone(uid);
  setTrackHistory(prev=>[...prev,{type:"BEAD",key:uid}].slice(-TRACK_HISTORY_MAX));
  setRedoStack([]);
}
// The backstitch line the keyboard has selected (an index into bsLines, -1 for none), and the cell it was chosen at.
const[bsSelect,setBsSelect]=useState(-1);
const bsSelectRef=useRef(-1);
// Unpick area (unpick.js): chosen on the rectangle bar, waiting for the second corner; and the current unpickArea for callers
// that outlive a render.
const unpickPendingRef=useRef(false);
const[unpickPending,setUnpickPending]=useState(false);
const unpickAreaRef=useRef(function(){return false;});
function setUnpickIntent(on){unpickPendingRef.current=on;setUnpickPending(on);}
bsSelectRef.current=bsSelect;
// Progress record (ProjectStorage.saveProgress): the marks, written about every 400 ms.
// owner is the (project id, state) pair as of the last committed render, so a write can
// never put one project's marks under another project's id while switching.
const progressOwnerRef=useRef(null);
const progressBaseRef=useRef({id:null,done:null,halfDone:null,knotsDone:null,beadsDone:null,bsDone:null,partialDone:null});
const progressTimerRef=useRef(null);
const lastProgressWriteRef=useRef(0);   // when writeProgressNow last wrote (scheduleProgressWrite spaces writes on large charts)
// Save badge (header). One honest status for the whole project, derived from refs so that
// updating it costs nothing on the mark path: React skips a setState to the same value.
//   error > conflict > saving (a write in flight, or changes not yet written) > saved/idle
// uiGenRef counts changes to saved data (not zoom or the guide); uiSavedGenRef is the newest
// count known written. Neither is a React dependency.
const[saveStatus,setSaveStatus]=useState('idle');
const[savedAt,setSavedAt]=useState(null);
const[saveError,setSaveError]=useState(null);
// epoch: bumped when another project is loaded; a write that finishes after that belongs to the old project and is ignored.
const saveUiRef=useRef({inFlight:0,conflict:false,error:null,savedOnce:false,epoch:0});
const uiGenRef=useRef(0);
const uiSavedGenRef=useRef(0);
const[halfDisambig,setHalfDisambig]=useState(null); // {x, y, idx} for popup

const hoverRefs = useRef({ row: null, col: null });
// Hover read-out under the chart (F4, reports/track-view-performance-plan.md).
// The hovered cell and its thread live in refs and the bar's text is written
// directly, like the crosshair above it. As React state, every stitch the
// pointer crossed re-rendered all of TrackerApp — ~1 200 elements per cell.
const hoverCellRef = useRef(null);   // {row, col}, 0-based, or null
const hoverInfoRef = useRef(null);   // {row, col, id, name}, 1-based, or null
// The pattern's thread brand (settings.threadBrand, P4-5): 'dmc' unless the
// project says otherwise. Cells of another brand carry it too.
const[threadBrand,setThreadBrand]=useState("dmc");
const hoverBarRef = useRef(null);
function renderHoverBar(){
  const el=hoverBarRef.current;
  if(!el)return;
  const c=hoverCellRef.current, info=hoverInfoRef.current;
  let text="—";
  if(c){
    text="Row: "+(c.row+1)+"   Col: "+(c.col+1);
    if(info&&info.row===c.row+1&&info.col===c.col+1)text+="  —   "+formatThread((cmap&&cmap[info.id])||info);
  }else{
    // Nothing under the pointer (always the case on touch): describe the
    // guide crosshair, if there is one.
    const g=guideRef.current;
    if(g&&g.row>=0&&g.col>=0){
      text="Guide   Row: "+(g.row+1)+"   Col: "+(g.col+1);
      const lbl=cellThreadLabel(g.row*sW+g.col);
      if(lbl)text+="  —   "+lbl;
    }
  }
  if(el.textContent!==text)el.textContent=text;
}
// "DMC 310 Black" (or "Anchor 403 ...", or "DMC 341 + 826 (blend)") for a stitch, or "" for an empty /
// skipped cell. The same label as the colour list.
function cellThreadLabel(idx){
  const cell=pat&&pat[idx];
  if(!cell||cell.id==="__skip__"||cell.id==="__empty__")return "";
  return formatThread((cmap&&cmap[cell.id])||cell);
}
function setHoverInfo(info){
  const prev=hoverInfoRef.current;
  if(prev===info)return;
  hoverInfoRef.current=info;
  renderHoverBar();
}

const[isPanning,setIsPanning]=useState(false);
const panStart=useRef({x:0,y:0,scrollX:0,scrollY:0});
const stitchScrollRef=useRef(null);

// ═══ Work area: enter / leave, and keeping the view steady ═══
// What to do with the scroll position once the next view has rendered:
// {kind:"fit"} after entering, {kind:"centre",cx,cy} after leaving.
const workAreaViewPendingRef=useRef(null);
function enterWorkArea(rect){
  if(!rect||!window.WorkArea)return false;
  const next=window.WorkArea.normalise(Object.assign({},rect,{active:true,gridW:blockW,gridH:blockH,setAt:Date.now()}),sW,sH);
  if(!next)return false;
  workAreaViewPendingRef.current={kind:"fit"};
  setWorkArea(next);
  return true;
}
function exitWorkArea(){
  const a=workArea;
  if(!a||!a.active)return;
  workAreaViewPendingRef.current={kind:"centre",cx:(a.x0+a.x1)/2,cy:(a.y0+a.y1)/2};
  setWorkArea(Object.assign({},a,{active:false,setAt:Date.now()}));
}
// Runs after the scroller has its new extent. A view change nobody asked to
// reposition for (the margin, a synced area arriving) keeps the same stitches
// under the same screen position by shifting the scroll by the change in
// offset; entering fits the area to the chart; leaving centres on it.
const prevViewRef=useRef(null);
React.useLayoutEffect(()=>{
  const el=stitchScrollRef.current;
  const prev=prevViewRef.current;
  prevViewRef.current={vb:viewBounds,scs};
  const pending=workAreaViewPendingRef.current;
  if(!el)return;
  if(pending&&pending.kind==="fit"){
    workAreaViewPendingRef.current=null;
    // The zoom lands on the next render; the corner of the view is 0,0 at
    // any zoom, so the scroll can be set now and again once the size settles.
    fitWorkAreaView();
    return;
  }
  if(pending&&pending.kind==="centre"){
    workAreaViewPendingRef.current=null;
    const off=chartScrollOffset();
    el.scrollLeft=Math.max(0,G+pending.cx*scs-off.x-el.clientWidth/2);
    el.scrollTop=Math.max(0,G+pending.cy*scs-off.y-el.clientHeight/2);
    return;
  }
  if(prev&&prev.scs===scs&&(prev.vb.x0!==viewBounds.x0||prev.vb.y0!==viewBounds.y0)){
    el.scrollLeft+= (prev.vb.x0-viewBounds.x0)*scs;
    el.scrollTop += (prev.vb.y0-viewBounds.y0)*scs;
  }
},[viewBounds,scs]);
// Exposed for the browser specs (tests/mobile-audit/*work-area*) and
// automation, like __flushProjectToIDB. Reassigned every render so it always
// closes over current state.
useEffect(()=>{
  window.__workArea={enter:enterWorkArea,exit:exitWorkArea,get:()=>workArea,view:()=>viewBoundsRef.current,openPicker:()=>setAreaPickerOpen(true)};
});
const[areaPickerOpen,setAreaPickerOpen]=useState(false);
// Stitches and done stitches inside a rectangle of the pattern. O(area):
// cheap enough per tap for any area a stitcher would choose.
function countRect(r){
  let total=0,dn=0;
  if(!pat||!r)return{total,done:dn};
  const d=doneRef.current||done;
  for(let y=r.y0;y<r.y1;y++){const base=y*sW;for(let x=r.x0;x<r.x1;x++){const m=pat[base+x];if(!m||m.id==="__skip__"||m.id==="__empty__")continue;total++;if(d&&d[base+x])dn++;}}
  if(halfStitches&&halfStitches.size)halfStitches.forEach((hs,idx)=>{
    if(!window.WorkArea.containsIndex(r,idx,sW))return;
    const hd=halfDone&&halfDone.get(idx);
    if(hs.fwd){total+=0.5;if(hd&&hd.fwd)dn+=0.5;}
    if(hs.bck){total+=0.5;if(hd&&hd.bck)dn+=0.5;}
  });
  return{total,done:dn};
}
const areaStats=useMemo(()=>areaOn?countRect(workArea):null,[areaOn,workArea,pat,done,halfStitches,halfDone,sW]);
// Per-colour counts inside the work area, in the same shape as the whole-
// pattern counts (colourDoneCountsRef): the colour list, highlight cycling and
// "mark all" use these while an area is active. O(area) per change.
const areaColourCounts=useMemo(()=>{
  if(!areaOn||!pat||!workArea)return null;
  const out={},a=workArea,d=doneRef.current||done;
  const get=id=>out[id]||(out[id]={total:0,done:0,halfTotal:0,halfDone:0});
  for(let y=a.y0;y<a.y1;y++){const base=y*sW;for(let x=a.x0;x<a.x1;x++){
    const m=pat[base+x];if(!m||m.id==="__skip__"||m.id==="__empty__")continue;
    const c=get(m.id);c.total++;if(d&&d[base+x])c.done++;
  }}
  if(halfStitches&&halfStitches.size){
    halfStitches.forEach((hs,idx)=>{
      if(!window.WorkArea.containsIndex(a,idx,sW))return;
      const hd=halfDone&&halfDone.get(idx);
      if(hs.fwd){const c=get(hs.fwd.id);c.halfTotal++;if(hd&&hd.fwd)c.halfDone++;}
      if(hs.bck){const c=get(hs.bck.id);c.halfTotal++;if(hd&&hd.bck)c.halfDone++;}
    });
  }
  return out;
},[areaOn,workArea,pat,done,halfStitches,halfDone,sW]);
// The neighbouring area in reading order: any (for enabling the buttons,
// cheap) or the nearest unfinished one (on click — it may scan many areas).
function neighbourArea(dir,unfinishedOnly){
  if(!areaOn||!window.WorkArea)return null;
  return window.WorkArea.step(workArea,dir,blockW,blockH,sW,sH,
    unfinishedOnly?(r=>{const c=countRect(r);return c.total===0||c.done>=c.total;}):null);
}
function stepWorkArea(dir){
  const a=neighbourArea(dir,true);
  if(a){enterWorkArea(a);return;}
  try{window.Toast&&window.Toast.show&&window.Toast.show({message:dir>0?"No unfinished areas after this one":"No unfinished areas before this one",type:"info"});}catch(_){}
}
// The next unfinished area after this one, or failing that before it.
function nextUnfinishedArea(){return neighbourArea(1,true)||neighbourArea(-1,true);}
// Finishing the area's last stitch offers the next one. Keyed on the area,
// so moving to an already-finished area (or loading one) does not announce.
const areaDoneRef=useRef(null);
useEffect(()=>{
  if(!areaOn||!areaStats||!workArea){areaDoneRef.current=null;return;}
  const key=workArea.x0+","+workArea.y0+","+workArea.x1+","+workArea.y1;
  const finished=areaStats.total>0&&areaStats.done>=areaStats.total;
  const prev=areaDoneRef.current;
  areaDoneRef.current={key,finished};
  if(!prev||prev.key!==key||prev.finished||!finished)return;
  const next=nextUnfinishedArea();
  try{
    if(window.Toast&&window.Toast.show)window.Toast.show(next
      ?{message:"Work area finished",type:"success",action:()=>enterWorkArea(next),actionLabel:"Next area",duration:10000}
      :{message:"Work area finished. Every area of this size is done.",type:"success"});
  }catch(_){}
},[areaOn,areaStats,workArea]);
// Fit the current view (area + margin) to the chart and show its corner.
function fitWorkAreaView(){
  const el=stitchScrollRef.current;
  if(!el)return;
  const vb=viewBoundsRef.current;
  const w=vb.x1-vb.x0,h=vb.y1-vb.y0;
  const fit=Math.min((el.clientWidth-G-8-chartEndSpace(el))/(w*20),(el.clientHeight-G-8)/(h*20));
  setStitchZoom(+Math.max(0.05,Math.min(maxZoom,Math.floor(fit*20)/20)).toFixed(3));   // scs is a whole number of pixels: round down so it fits
  el.scrollLeft=0;el.scrollTop=0;
  requestAnimationFrame(()=>{const e2=stitchScrollRef.current;if(e2){e2.scrollLeft=0;e2.scrollTop=0;}});
}
// The whole pattern in the scroll box, on both axes (the hook's fitSZ looked at the width alone, so a
// tall pattern overflowed the box). No box yet, or no size: fall back to the hook's width fit.
function fitWholeView(){
  const el=stitchScrollRef.current;
  if(!el||!sW||!sH){fitSZ();return;}
  const fit=Math.min((el.clientWidth-G-8-chartEndSpace(el))/(sW*20),(el.clientHeight-G-8)/(sH*20));
  setStitchZoom(+Math.max(0.05,Math.min(maxZoom,Math.floor(fit*20)/20)).toFixed(3));   // scs is a whole number of pixels: round down so it fits
  el.scrollLeft=0;el.scrollTop=0;
  requestAnimationFrame(()=>{const e2=stitchScrollRef.current;if(e2){e2.scrollLeft=0;e2.scrollTop=0;}});
}
// "Fit" fits the work area while one is active, the whole pattern otherwise.
function fitChart(){if(areaOn)fitWorkAreaView();else fitWholeView();}
// The overview's two calls into the chart. What the chart shows, in cells: the sticky ruler covers the first G pixels
// of the box, so the first visible cell is at scroll position / scs and the box holds (width - G) / scs of them.
const minimapGetView=useCallback(()=>{
  const el=stitchScrollRef.current;
  if(!el||!(scs>0))return null;
  const off=chartScrollOffset();
  const x0=(el.scrollLeft+off.x)/scs,y0=(el.scrollTop+off.y)/scs;
  return{x0:x0,y0:y0,x1:x0+(el.clientWidth-G)/scs,y1:y0+(el.clientHeight-G)/scs};
},[scs]);
// Centre the chart on a cell (the overview's tap and drag).
const minimapJump=useCallback((cx,cy)=>{
  const el=stitchScrollRef.current;
  if(!el||!(scs>0))return;
  const off=chartScrollOffset();
  el.scrollLeft=Math.max(0,cx*scs-(el.clientWidth-G)/2-off.x);
  el.scrollTop=Math.max(0,cy*scs-(el.clientHeight-G)/2-off.y);
},[scs]);
// The lowest zoom: one pixel a stitch, which Fit can now reach, so every zoom-out control must be able to stay there.
const MIN_STITCH_ZOOM=0.05;
// A new mode or a different pattern hands the guide back from the keyboard too (a stale coordinate must not be marked in another project).
useEffect(()=>{kbGuideRef.current=false;kbAnchorRef.current=null;},[stitchMode,pat]);
const isSpaceDownRef=useRef(false);
const spaceDownTimeRef=useRef(0);
const spacePannedRef=useRef(false);
// B2/mouse UX: live Shift-key state, so the canvas can show a visual cue
// distinguishing "click + drag" (freehand multi-mark) from "Shift+click"
// (rectangular range select) — see useDragMark.js behaviour (5). Tracked
// via document-level listeners (not just onMouseDown's e.shiftKey) so the
// indicator appears the instant Shift is pressed, before any click happens.
const[isShiftDown,setIsShiftDown]=useState(false);
// Mirrors the latest useDragMark().notifyShiftUp so the keyup/blur
// listener below (registered once, on mount) always calls into the
// current hook instance instead of a stale first-render closure — see
// useDragMark.js behaviour (7): the range-select anchor is forgotten the
// instant Shift is released, rather than persisting across unrelated clicks.
const dragMarkNotifyShiftUpRef=useRef(null);
useEffect(()=>{
  const onKeyDown=e=>{if(e.key==="Shift")setIsShiftDown(true);if(e.key==="Alt")altDownRef.current=true;};
  const onKeyUp=e=>{
    if(e.key==="Alt")altDownRef.current=false;
    if(e.key==="Shift"){
      setIsShiftDown(false);
      if(dragMarkNotifyShiftUpRef.current)dragMarkNotifyShiftUpRef.current();
    }
  };
  const onBlur=()=>{
    altDownRef.current=false;
    setIsShiftDown(false);
    if(dragMarkNotifyShiftUpRef.current)dragMarkNotifyShiftUpRef.current();
  };
  window.addEventListener("keydown",onKeyDown);
  window.addEventListener("keyup",onKeyUp);
  window.addEventListener("blur",onBlur);
  return()=>{
    window.removeEventListener("keydown",onKeyDown);
    window.removeEventListener("keyup",onKeyUp);
    window.removeEventListener("blur",onBlur);
  };
},[]);
const touchStateRef=useRef({mode:"none",pinchDist:0,pinchZoom:1,pinchAnchor:null});
const hasTouchRef=useRef(typeof window!=="undefined"&&"ontouchstart" in window);
// Parking gestures (see toggleParkAt): the pointer type behind the latest
// press, so a contextmenu event can tell a right-click from a touch
// long-press; the pending Nav-mode press-and-hold; and the time until which
// the compatibility mousedown that follows a fired hold is ignored.
const lastPointerTypeRef=useRef("mouse");
// When the latest secondary press (right button, or Ctrl+click on a Mac)
// hit the canvas. Only a contextmenu right after one acts on a stitch: the menu can
// also come from the keyboard (Menu key, Shift+F10), with no cell meant.
const lastSecondaryPressRef=useRef(0);
// Screen-reader announcement of the guide as the arrow keys move it.
const guideLiveRef=useRef(null);
const navHoldRef=useRef(null);
const suppressNavClickUntilRef=useRef(0);
// Stable handler refs — point to latest function each render; listeners attach once
const touchStartHandlerRef=useRef(null);
const touchMoveHandlerRef=useRef(null);
const touchEndHandlerRef=useRef(null);
const wheelHandlerRef=useRef(null);
// rAF token for throttling zoom state updates to one per animation frame
const zoomRafRef=useRef(null);

const[threadOwned,setThreadOwned]=useState({});
const[globalStash,setGlobalStash]=useState({});
const[kittingResult,setKittingResult]=useState(null);
const[stashDeducted,setStashDeducted]=useState(false);

// ── Real-time stash deduction (Proposal D implementation) ──────────────
// Defaults match threadCostPerStitch() in threadCalc.js.
// Thread-usage events reach the stash ledger in batches: when marking pauses this
// long, and at least this often while it goes on (see the thread-usage sync effect).
const RT_IDLE_MS=5000;
const RT_CAP_MS=30000;
const RT_WASTE_DEFAULTS={enabled:false,tailAllowanceIn:1.5,threadRunLength:30,generalWasteMultiplier:1.10,strandCountOverride:null,lastWrittenAt:null};
const[wastePrefs,setWastePrefs]=useState(()=>{
  try{const p=window.UserPrefs&&window.UserPrefs.get('rtWastePrefs');if(p&&typeof p==='object')return Object.assign({},RT_WASTE_DEFAULTS,p);}catch(_){}
  return Object.assign({},RT_WASTE_DEFAULTS);
});
// Durable accounting belongs to manager_state alongside live stock, not project JSON.
// Each asynchronous operation captures its project context before awaiting.
const rtContextRef=useRef(null);
const rtWriteSnapshotRef=useRef(null);
const[rtAccountingVersion,setRtAccountingVersion]=useState(0);
const rtDebounceRef=useRef(null);
const rtLowToastedRef=useRef(new Set());
// Listen for the disable request dispatched by that same stash toggle.
useEffect(function(){
  function onDisable(){setModal('rt_disable_confirm');}
  window.addEventListener('cs:rtDisableRequest',onDisable);
  return function(){window.removeEventListener('cs:rtDisableRequest',onDisable);};
},[]);
// Persist wastePrefs to UserPrefs as a global default for new projects.
useEffect(function(){
  try{window.UserPrefs&&window.UserPrefs.set('rtWastePrefs',wastePrefs);}catch(_){}
},[wastePrefs]);
const[altOpen,setAltOpen]=useState(null);

// ═══ Spatial Analysis Engine ═══
const[analysisResult,setAnalysisResult]=useState(null);
const[analysisRunning,setAnalysisRunning]=useState(false);
const analysisWorkerRef=useRef(null);
const analysisRequestIdRef=useRef(0);
const analysisThrottleRef=useRef(null);
// PERF (F2, reports/track-view-performance-plan.md): the worker holds the
// pattern. It is sent once per `pat` identity — and per worker instance — as a
// transferred Uint16Array (see encodeAnalysisPattern), so a stitch mark posts
// only `done`. Previously every mark structured-cloned one {id} object per
// stitch on the main thread: 352 ms per tap on a 600x800 chart at 4x CPU.
const analysisPatternRef=useRef({pat:null,worker:null,id:0,sW:0,sH:0});
// Pattern-only per-stitch arrays (clusterSize, nearestDist, ...) arrive once
// per pattern id, transferred, and are re-attached to every later result.
const analysisStaticsRef=useRef({id:-1,perStitch:null});
const analysisPostedDoneRef=useRef(null);
// Thread usage visualisation: null | "distance" | "cluster"
const[threadUsageMode,setThreadUsageMode]=useState(null);
const threadUsageRafRef=useRef(null);
// Next-stitch recommendations
const[recDismissed,setRecDismissed]=useState(()=>new Set());
const[recShowMore,setRecShowMore]=useState(false);
const[recEnabled,setRecEnabled]=useState(()=>{try{return localStorage.getItem("cs_recEnabled")!=="0";}catch(_){return true;}});
const[rpanelTab,setRpanelTab]=useState("colours");
const[mobileDrawerOpen,setMobileDrawerOpen]=useState(false);

// ─── Tracker left sidebar (toolbar-rework phase 1) ─────────────────────
// Replaces the scattered Highlight / View / Session controls in the
// toolbar pill and right-panel "More" tab with a tabbed left sidebar.
// State persists via window.UserPrefs (key: trackerLeftSidebarMode,
// values: "hidden" | "rail" | "open"). Default hidden on touch
// viewports, open elsewhere. The hamburger cycles hidden→rail→open.
// `leftSidebarOpen` (Boolean) is kept as a derived alias for the
// existing render code that already reads it.
const[leftSidebarMode,setLeftSidebarMode]=useState(()=>{
  try{
    // Orientation-specific key takes priority when the user has previously
    // used the app in both orientations (written by the orientation-change
    // effect so each orientation remembers its own preference).
    var _isWide=typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(min-width: 1024px)').matches;
    var _orientKey=_isWide?'cs_pref_trackerLeftSidebarMode_wide':'cs_pref_trackerLeftSidebarMode_narrow';
    var _orientRaw=localStorage.getItem(_orientKey);
    if(_orientRaw!==null){
      try{
        var _orientStored=JSON.parse(_orientRaw);
        if(_orientStored==="hidden"||_orientStored==="rail"||_orientStored==="open")return _orientStored;
      }catch(_){}
    }
    // Use localStorage directly so we can distinguish "key never set" from
    // "key set to the default value".  UserPrefs.get() always returns the
    // DEFAULTS fallback and can't detect a true first run.
    var raw=localStorage.getItem("cs_pref_trackerLeftSidebarMode");
    if(raw!==null){
      try{
        var stored=JSON.parse(raw);
        if(stored==="hidden"||stored==="rail"||stored==="open")return stored;
      }catch(_){}
    }
    // Migrate the legacy boolean preference (a corrupt new key falls through here).
    var legacyRaw=localStorage.getItem("cs_pref_trackerLeftSidebarOpen");
    if(legacyRaw!==null){
      try{
        var legacy=JSON.parse(legacyRaw);
        if(legacy===true)return "open";
        if(legacy===false)return "hidden";
      }catch(_){}
    }
    // First run — default by viewport type. Below 1024 px the palette is a sheet over the chart, so it starts shut there whatever
    // the input device (a desktop browser zoomed to 200% is 720 px wide and used to open on a sheet that covered the chart).
    if(window.TouchConstants&&window.TouchConstants.isCompactTouch())return "hidden";
    if(window.matchMedia&&window.matchMedia("(max-width:1023px)").matches)return "hidden";
    return "open";
  }catch(_){return "hidden";}
});
const leftSidebarOpen = leftSidebarMode === "open" || leftSidebarMode === "rail";
// Ref that mirrors leftSidebarMode so the orientation-change handler can
// read the current mode without becoming a captured-stale-closure or adding
// leftSidebarMode as an effect dependency.
const leftSidebarModeRef=useRef(leftSidebarMode);
leftSidebarModeRef.current=leftSidebarMode;
const setLeftSidebarOpen = useCallback((next)=>{
  setLeftSidebarMode(prev=>{
    var want = typeof next==="function" ? next(prev==="open"||prev==="rail") : !!next;
    if(want) return prev==="hidden" ? "open" : prev;
    return "hidden";
  });
},[]);
// Desktop-only "pin" — keeps the colour panel permanently docked open
// (see .cs-main--palette-open in styles.css, which shifts the canvas
// right by 320px so the panel never overlaps the chart) and blocks the
// Colours toggle button from collapsing it. Only surfaced in the panel
// header at >=1024px, where the panel docks as a persistent side-pane
// rather than a mobile/tablet overlay. Keep that breakpoint in step
// with the .ppal-pin-btn / .cs-main--palette-open media queries — if the
// JS thinks pinning is supported at a width the CSS still treats as a
// bottom sheet (or vice versa) the pin silently does nothing. The
// explicit close (X) button always works and clears the pin, since
// that's an unambiguous "I want this gone" action.
const[leftSidebarPinned,setLeftSidebarPinned]=useState(()=>{
  try{return localStorage.getItem("cs_pref_trackerLeftSidebarPinned")==="1";}catch(_){return false;}
});
const leftSidebarPinnedRef=useRef(leftSidebarPinned);
leftSidebarPinnedRef.current=leftSidebarPinned;
useEffect(()=>{
  try{localStorage.setItem("cs_pref_trackerLeftSidebarPinned",leftSidebarPinned?"1":"0");}catch(_){}
},[leftSidebarPinned]);
// Compact colour list: one slim line per colour, the selected colour's buttons in the card above. Kept per device
// (a tablet and a laptop can differ), so it lives in localStorage only, outside the cs_pref_ keys sync watches.
const[compactColours,setCompactColours]=useState(()=>{
  try{return localStorage.getItem("cs_trackerCompactColours")==="1";}catch(_){return false;}
});
useEffect(()=>{
  try{localStorage.setItem("cs_trackerCompactColours",compactColours?"1":"0");}catch(_){}
},[compactColours]);
const cycleLeftSidebar = useCallback(()=>{
  // The "rail" collapsed-strip state is CSS-hidden at >=900px (see the
  // "Desktop-only: always show palette panel" rule in styles.css, which
  // forces `.lpanel--rail{display:none!important;}`). If we still routed
  // through "rail" on those viewports the first click from "hidden" would
  // land on an invisible state, making the Colours button appear to do
  // nothing until a second click reached "open". Skip straight to "open"
  // whenever rail isn't visually supported.
  var railSupported = !(typeof window!=='undefined' && window.matchMedia && window.matchMedia('(min-width: 900px)').matches);
  var pinSupported = !!(typeof window!=='undefined' && window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
  setLeftSidebarMode(prev=>{
    if(pinSupported && leftSidebarPinnedRef.current && prev==="open") return prev;
    if(prev==="hidden") return railSupported ? "rail" : "open";
    if(prev==="rail") return "open";
    return "hidden";
  });
},[]);
// Tracks whether the screen is currently ≥1024px (docked lpanel mode).
// Updated by the orientation-change effect; used by the persist effect
// to write to the correct orientation-specific localStorage key.
// Null-guard ensures the matchMedia query runs exactly once on mount
// (useRef's argument is otherwise evaluated on every render).
const isWideRef=useRef(null);
if(isWideRef.current===null)isWideRef.current=!!(typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(min-width: 1024px)').matches);
const[leftSidebarTab,setLeftSidebarTab]=useState(()=>{
  try{var p=window.UserPrefs&&window.UserPrefs.get("trackerLeftSidebarTab");return p||"highlight";}catch(_){return"highlight";}
});
useEffect(()=>{
  try{
    window.UserPrefs&&window.UserPrefs.set("trackerLeftSidebarMode",leftSidebarMode);
    // Also persist to the orientation-specific key so each orientation
    // independently remembers its last state.
    var _ok=isWideRef.current?'cs_pref_trackerLeftSidebarMode_wide':'cs_pref_trackerLeftSidebarMode_narrow';
    localStorage.setItem(_ok,JSON.stringify(leftSidebarMode));
  }catch(_){}
},[leftSidebarMode]);
useEffect(()=>{try{window.UserPrefs&&window.UserPrefs.set("trackerLeftSidebarTab",leftSidebarTab);}catch(_){}},[leftSidebarTab]);

// Phase 4: palette-legend sort key persisted via UserPrefs (global default)
// AND per-project (cs_legendSort_<pid>) overlay. Per-project takes
// precedence when present — set in processLoadedProject. Writes go to
// both so the next new project picks up the user's last preference.
const[legendSort,setLegendSort]=useState(()=>{
  try{var p=window.UserPrefs&&window.UserPrefs.get("trackerLegendSort");return p||"id";}catch(_){return"id";}
});
useEffect(()=>{
  try{window.UserPrefs&&window.UserPrefs.set("trackerLegendSort",legendSort);}catch(_){}
  try{const pid=projectIdRef.current;if(pid)localStorage.setItem('cs_legendSort_'+pid,legendSort);}catch(_){}
},[legendSort]);

// Issue #6 — desktop palette legend collapsible. Persists via UserPrefs
// (global default) AND per-project (cs_legendCollapsed_<pid>) overlay.
const[legendCollapsed,setLegendCollapsed]=useState(()=>{
  try{var p=window.UserPrefs&&window.UserPrefs.get("trackerLegendCollapsed");return !!p;}catch(_){return false;}
});
useEffect(()=>{
  try{window.UserPrefs&&window.UserPrefs.set("trackerLegendCollapsed",!!legendCollapsed);}catch(_){}
  try{const pid=projectIdRef.current;if(pid)localStorage.setItem('cs_legendCollapsed_'+pid,legendCollapsed?'1':'0');}catch(_){}
},[legendCollapsed]);

// Option 3 Split Palette: More panel state
// morePanelOpen controls the slide-up panel; leftSidebarTab (declared above)
// is re-used for the More panel's tab selection so it persists via UserPrefs.
const[morePanelOpen,setMorePanelOpen]=useState(false);
const morePanelRef=useRef(null);
window.Overlay.useFocusTrap(morePanelRef,morePanelOpen);
const closeMorePanel=useCallback(()=>setMorePanelOpen(false),[]);
window.useEscape(morePanelOpen?closeMorePanel:null,{skipWhenEditingTextField:false});
// Close the More panel when palette panel is opened on phone (avoid two overlays)
useEffect(()=>{if(leftSidebarMode==="open")setMorePanelOpen(false);},[leftSidebarMode]);

// Phase 5: ESC closes the mobile lpanel drawer. Desktop ignores it
// (the panel is sticky / persistent and ESC could clobber other modal
// dismiss semantics).
useEffect(()=>{
  if(!leftSidebarOpen)return;
  const onKey=e=>{
    if(e.key!=="Escape")return;
    if(typeof window==='undefined'||!window.matchMedia)return;
    if(!window.matchMedia("(max-width: 1023px)").matches)return;
    setLeftSidebarOpen(false);
  };
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
},[leftSidebarOpen]);
// Orientation-aware sidebar handler. On rotation to narrow (<1024px) the
// lpanel switches from a docked side panel to a full-screen overlay, so we
// save the current wide-mode preference and auto-close. On rotation back to
// wide (≥1024px) we reload the saved preference (defaulting to "open") so
// the sidebar comes back without the user having to tap the hamburger again.
useEffect(()=>{
  if(typeof window==='undefined'||!window.matchMedia)return;
  const mql=window.matchMedia('(max-width: 1023px)');
  const onChange=()=>{
    if(mql.matches){
      // Going narrow: persist current wide mode outside the updater so the
      // write happens exactly once, then close the panel.
      isWideRef.current=false;
      try{localStorage.setItem('cs_pref_trackerLeftSidebarMode_wide',JSON.stringify(leftSidebarModeRef.current));}catch(_){}
      setLeftSidebarMode('hidden');
    } else {
      // Going wide: persist current narrow mode before switching so the
      // narrow key accurately reflects what the user had, then restore
      // the saved wide preference (defaulting to "open").
      isWideRef.current=true;
      try{localStorage.setItem('cs_pref_trackerLeftSidebarMode_narrow',JSON.stringify(leftSidebarModeRef.current));}catch(_){}
      var wideMode='open';
      try{
        var saved=localStorage.getItem('cs_pref_trackerLeftSidebarMode_wide');
        if(saved!==null){var p=JSON.parse(saved);if(p==="hidden"||p==="rail"||p==="open")wideMode=p;}
      }catch(_){}
      setLeftSidebarMode(wideMode);
    }
  };
  if(mql.addEventListener)mql.addEventListener('change',onChange);
  else if(mql.addListener)mql.addListener(onChange);
  return()=>{
    if(mql.removeEventListener)mql.removeEventListener('change',onChange);
    else if(mql.removeListener)mql.removeListener(onChange);
  };
},[]);

// Touch-1 H-2: Focus mode. Strips chrome to canvas + a floating
// mini-bar (.cs-focus-bar). Toggled with the F key (when no input is
// focused) or via the toolbar button. body.cs-focus is what styles.css
// hooks into to hide chrome surfaces.
// Touch intent (TRACK-08). Paint mode: a one-finger drag paints at once instead of scrolling. Lock touches: a finger on
// the chart does nothing (a propped-up device). Neither is remembered across a reload, so nobody is locked out by a stale
// setting; both leave the mouse alone.
const[paintMode,setPaintMode]=useState(false);
const[touchLocked,setTouchLocked]=useState(false);
// On a phone it starts on (the top bar and strip tucked away, the chart given the screen); Preferences can turn that off.
const[focusMode,setFocusMode]=useState(()=>{try{return isPhoneScreen()&&!(window.UserPrefs&&window.UserPrefs.get('trackerFocusOnPhone')===false);}catch(_){return false;}});
const focusBarRef=useRef(null);
const[focusBarFaded,setFocusBarFaded]=useState(false);
const focusFadeTimerRef=useRef(null);
const resetFocusFade=useCallback(()=>{
  setFocusBarFaded(false);
  if(focusFadeTimerRef.current)clearTimeout(focusFadeTimerRef.current);
  const ms=(window.TouchConstants&&window.TouchConstants.FOCUS_MINIBAR_FADE_MS)||4000;
  focusFadeTimerRef.current=setTimeout(()=>setFocusBarFaded(true),ms);
},[]);
useEffect(()=>{
  if(typeof document==="undefined")return;
  if(focusMode){
    document.body.classList.add("cs-focus");
    resetFocusFade();
  }else{
    document.body.classList.remove("cs-focus");
    setFocusBarFaded(false);
    if(focusFadeTimerRef.current)clearTimeout(focusFadeTimerRef.current);
  }
  return()=>{document.body.classList.remove("cs-focus");if(focusFadeTimerRef.current)clearTimeout(focusFadeTimerRef.current);};
},[focusMode,resetFocusFade]);
// F and Esc for focus mode are registered shortcuts (tracker.focusMode, and the end of tracker.esc), so the keys have one owner.

const [importDialog, setImportDialog] = useState(null);
const [importImage, setImportImage] = useState(null);
const [importSuccess, setImportSuccess] = useState(null);
const [importMaxW, setImportMaxW] = useState(80);
const [importMaxH, setImportMaxH] = useState(80);
const [importMaxColours, setImportMaxColours] = useState(30);
const [importSkipBg, setImportSkipBg] = useState(false);
const [importBgThreshold, setImportBgThreshold] = useState(15);
const [importArLock, setImportArLock] = useState(true);
const [importName, setImportName] = useState("");
const [importFabricCt, setImportFabricCt] = useState(14);

const loadRef=useRef(null),timerRef=useRef(null),stitchRef=useRef(null);
const projectIdRef=useRef(null);    // current project's storage ID
const statsSessionsLiveRef=useRef(null);   // the journal as last rendered, so an Undo can tell whether anything replaced it
const deletedSessionIdsRef=useRef([]);   // tombstones of sessions the person deleted or merged away (kept so a sync cannot bring them back)
const createdAtRef=useRef(null);    // stable createdAt ISO string for the active project
const namePromptShownRef=useRef(false); // Creator-owned flag, carried through Tracker saves
const nameAutoGeneratedRef=useRef(false); // Creator-owned flag (P0-2); a Tracker rename clears it
const symbolsRef=useRef(null); // Creator-owned symbol choices (P1-4); carried through Tracker saves
// The pattern's fabric colour (settings.fabricColour, P2-2): the chart is drawn
// on it, as in the Creator. Projects saved without it keep the Tracker's own
// fabric colour preference.
const[projectFabricColour,setProjectFabricColour]=useState(null);
const chartFabricColour=projectFabricColour||trackerFabricColour;
const lastSnapshotRef=useRef(null); // freshest serialised project for beforeunload
const v3FieldsRef=useRef({});       // preserve v3 stats fields across save round-trips
const autoSaveDirtyRef=useRef(false);
// When the oldest unsaved change happened. The save timer is a debounce; this caps
// how long continuous marking can postpone it (see the autosave effect).
const autoSaveFirstDirtyRef=useRef(null);
// Change generation: bumped by every autosave-effect run; flushedGenRef is the newest
// generation known to be written. The tab-hidden save compares the two, so it writes
// only when something changed since the last write and never touches the debounce.
const autoSaveGenRef=useRef(0);
const flushedGenRef=useRef(-1);
// Marks-only changes on large charts (see the autosave effect): the previous run's
// non-mark inputs, whether any of them is unsaved, and when the oldest deferred
// marks-only change happened.
const autoSaveOtherRef=useRef(null);
const autoSaveOtherDirtyRef=useRef(true);
const autoSaveMarksSinceRef=useRef(null);
const progressFailedRef=useRef(false);   // the last progress write failed (see progressWriteFailed)
const progressKickRef=useRef(null);
// The drag gesture lives in useDragMark; these let snapshotNow() read it synchronously.
const dragMarkGetStateRef=useRef(null);
const dragCommitFilterRef=useRef(null);
const session=window.useAutoSession({projectIdRef,v3FieldsRef,autoSaveDirtyRef,statsSettings,savesBlockedRef});
const{getSessionCheckpoint,writeSessionCheckpoint,correctHistoryActivity,statsSessionsRef,statsSessions,setStatsSessions,totalTime,elapsedStore,liveAutoStitches,liveAutoIsPaused,liveSessionOpen,liveIsTimer,forgotStop,startTimer,snoozeForgotStop,currentTimingMode,manuallyPaused,setManuallyPaused,manuallyPausedRef,celebration,setCelebration,celebratedRef,goalCelebrationRef,currentAutoSessionRef,finaliseAutoSessionRef,resetAutoSessionForProjectLoad,pendingColoursRef,pendingMilestonesRef,prevAutoCountRef,justLoadedRef,justLoadedSettlePassRef,autoStatsRef,isUnloadingRef,achievedMilestones,setAchievedMilestones,sessionOnboardingShown,setSessionOnboardingShown,sessionSavedToast,setSessionSavedToast,recordAutoActivity,editSessionNote}=session;
useEffect(()=>{if(!motivation.show)setCelebration(null);},[motivation.show,setCelebration]);
const counts=window.useStitchCounts({pat,done,halfStitches,halfDone});
const{doneCountRef,colourDoneCountsRef,countsVer,recomputeAllCounts,applyDoneCountsDelta,applyHalfDoneDelta}=counts;
const[projectName,setProjectName]=useState("");
const[projectDesigner,setProjectDesigner]=useState("");
const[projectDescription,setProjectDescription]=useState("");
// Stitching notes (tracker-notes.js): free text kept with the project. Photos live in the BlobStore (photos.js), not here.
const[projectNotes,setProjectNotes]=useState("");
const[namePromptOpen,setNamePromptOpen]=useState(false);
const[editDetailsOpen,setEditDetailsOpen]=useState(false);
// Command Palette → Preferences modal bridge (UX-12 Phase 6 PR #11).
useEffect(()=>{const h=()=>{if(typeof window.PreferencesModal!=='undefined')setPreferencesOpen(true);};window.addEventListener('cs:openPreferences',h);return()=>window.removeEventListener('cs:openPreferences',h);},[]);
// Command Palette → Rename current project bridge (UX-12 Phase 6 PR #11).
useEffect(()=>{const h=()=>setEditDetailsOpen(true);window.addEventListener('cs:openRename',h);return()=>window.removeEventListener('cs:openRename',h);},[]);
const G=28;
const[tOverflowOpen,setTOverflowOpen]=useState(false);
const[tStripCollapsed,setTStripCollapsed]=useState({view:false,stitch:false});
const STITCH_LAYERS=[{id:'full',label:'Full Cross',key:'Shift+F'},{id:'half',label:'Half Stitch',key:'Shift+H'},{id:'backstitch',label:'Backstitch',key:'Shift+L'},{id:'quarter',label:'Quarter',key:null},{id:'petite',label:'Petite',key:null},{id:'french_knot',label:'French Knot',key:'Shift+K'},{id:'long_stitch',label:'Long Stitch',key:null}];
const ALL_LAYERS_VISIBLE={full:true,half:true,backstitch:true,quarter:true,petite:true,french_knot:true,long_stitch:true};
const[layerVis,setLayerVis]=useState(ALL_LAYERS_VISIBLE);
const[soloPreState,setSoloPreState]=useState(null);
const[bsThickness,setBsThickness]=useState(()=>{try{return parseInt(localStorage.getItem('cs_bsThickness')||'2');}catch(_){return 2;}});
const[statsCountMode,setStatsCountMode]=useState('visible');
const tStripRef=useRef(null);
const tOverflowRef=useRef(null);
const soloTimerRef=useRef(null);

const doneCount=countsVer>=0?doneCountRef.current:0;
// The how-to-mark banners go once a stitch has been marked, and stay gone (remembered across sessions).
const[hintsSeen,setHintsSeen]=useState(()=>{try{return !!(window.UserPrefs&&window.UserPrefs.get('trackerHintsSeen'));}catch(_){return false;}});
const handedness=useTrackerPref('trackerHandedness','right')==='left'?'left':'right';
useFillChartHeight(stitchScrollRef,!!pat);
// Once stitches exist worth protecting, offer a backup if it has been a while (helpers.js, BackupReminder).
const _halfMarked=useMemo(()=>{for(const v of halfDone.values())if(v&&(v.fwd||v.bck))return true;return false;},[halfDone]);
const _hasMarks=doneCount>0||_halfMarked||knotsDone.length>0||beadsDone.length>0||partialDone.size>0||bsDone.length>0||specialtyDone.length>0;
// Any marked stitch (full, half or knot) is the signal that the how-to-mark banners have done their job.
useEffect(()=>{
  if(hintsSeen||!_hasMarks)return;
  setHintsSeen(true);
  try{window.UserPrefs&&window.UserPrefs.set('trackerHintsSeen',true);}catch(_){}
},[_hasMarks,hintsSeen]);
useEffect(()=>{
  if(!_hasMarks||!isActive)return;
  const t=setTimeout(()=>{if(window.BackupReminder)window.BackupReminder.maybeRemind();},4000);
  return()=>clearTimeout(t);
},[_hasMarks,isActive]);
const totalStitchable=useMemo(()=>{if(!pat)return 0;let c=0;for(let i=0;i<pat.length;i++){const id=pat[i].id;if(id!=="__skip__"&&id!=="__empty__")c++;}return c;},[pat]);

// Half-stitch counts
const halfStitchCounts=useMemo(()=>{
  let total=0,dn=0;
  halfStitches.forEach((hs,idx)=>{
    const hd=halfDone.get(idx);
    if(hs.fwd){total++;if(hd&&hd.fwd)dn++;}
    if(hs.bck){total++;if(hd&&hd.bck)dn++;}
  });
  return{total,done:dn};
},[halfStitches,halfDone]);

// French knots: {total, done}, and per thread.
const knotDoneSet=useMemo(()=>new Set(knotsDone),[knotsDone]);
const knotCounts=useMemo(()=>window.Knots?window.Knots.progress(knots,knotsDone):{total:0,done:0},[knots,knotsDone]);
const knotsByThread=useMemo(()=>window.Knots?window.Knots.byThread(knots,knotsDone):{},[knots,knotsDone]);
// Quarter stitches (fractional.js): {total, done} in quarters, and per thread. Each is worth a quarter of a full stitch.
const countedPartials=useMemo(()=>ProgressUnits.partialWithoutLegacyHalves(partialStitches,halfStitches),[partialStitches,halfStitches]);
const quarterCounts=useMemo(()=>window.Fractional?window.Fractional.progress(countedPartials,partialDone):{total:0,done:0},[countedPartials,partialDone]);
const quartersByThread=useMemo(()=>window.Fractional?window.Fractional.byThread(countedPartials,partialDone):{},[countedPartials,partialDone]);
// Backstitch (backstitch.js): each line's key, the done keys as a Set, the spatial index (built once per pattern), and
// {total, done} lines overall and per colour. The drawing path reads the keys and the Set through refs, so a one-line
// repaint (which a memoised caller runs from an older render) always sees the current marks.
const bsKeys=useMemo(()=>window.Backstitch?bsLines.map(window.Backstitch.key):[],[bsLines]);
const bsDoneSet=useMemo(()=>new Set(bsDone),[bsDone]);
const bsGrid=useMemo(()=>window.Backstitch&&bsLines.length?window.Backstitch.buildGrid(bsLines):null,[bsLines]);
// key -> the line indexes that carry it, so a mark's repaint finds its lines without scanning all of them.
const bsIndex=useMemo(()=>window.Backstitch&&bsLines.length?window.Backstitch.index(bsLines):null,[bsLines]);
const bsInfo=useMemo(()=>{
  // Per line: is it well formed, and its colour. Computed once per pattern; the counts below only walk these arrays.
  const B=window.Backstitch,well=[],col=[];
  bsLines.forEach(ln=>{const w=!!B&&B.wellFormed(ln);well.push(w);col.push(w?B.colourOf(ln):"");});
  return{well,col};
},[bsLines]);
const bsTally=useMemo(()=>{
  const by={};let total=0,done=0;
  for(let i=0;i<bsKeys.length;i++){
    if(!bsInfo.well[i])continue;
    total++;const d=bsDoneSet.has(bsKeys[i]);if(d)done++;
    const e=by[bsInfo.col[i]]||(by[bsInfo.col[i]]={total:0,done:0});e.total++;if(d)e.done++;
  }
  return{total,done,by};
},[bsKeys,bsInfo,bsDoneSet]);
const bsCounts=bsTally,bsByColour=bsTally.by;
const bsKeysRef=useRef(bsKeys),bsDoneSetRef=useRef(bsDoneSet),bsGridRef=useRef(bsGrid),bsIndexRef=useRef(bsIndex);
const bsDragActiveRef=useRef(false);
bsKeysRef.current=bsKeys;if(!bsDragActiveRef.current)bsDoneSetRef.current=bsDoneSet;bsGridRef.current=bsGrid;bsIndexRef.current=bsIndex;

// Progress in units, from the one shared definition (progress-units.js: a full stitch is one unit, a half stitch
// half, a French knot one). Every figure below, and every other page, reads it from there.
const specialtyCounts=useMemo(()=>ProgressUnits.specialty.counts(specialtyStitches,specialtyDone),[specialtyStitches,specialtyDone]);
const progAll=useMemo(()=>ProgressUnits.progressUnits({full:{done:doneCount,total:totalStitchable},half:{done:halfStitchCounts.done,total:halfStitchCounts.total},knot:{done:knotCounts.done,total:knotCounts.total},quarter:{done:quarterCounts.done,total:quarterCounts.total},...specialtyCounts}),[doneCount,totalStitchable,halfStitchCounts,knotCounts,quarterCounts,specialtyCounts]);
// The strip follows the visible-layer filter; everything else counts every type.
const progShown=useMemo(()=>statsCountMode==='visible'?ProgressUnits.progressUnits({full:{done:doneCount,total:totalStitchable},half:{done:halfStitchCounts.done,total:halfStitchCounts.total},knot:{done:knotCounts.done,total:knotCounts.total},quarter:{done:quarterCounts.done,total:quarterCounts.total},...specialtyCounts},{include:{full:layerVis.full,half:layerVis.half,knot:layerVis.french_knot,quarter:layerVis.quarter,petite:layerVis.petite,long_stitch:layerVis.long_stitch}}):progAll,[progAll,statsCountMode,layerVis,doneCount,totalStitchable,halfStitchCounts,knotCounts,quarterCounts,specialtyCounts]);
const combinedTotal=progAll.totalUnits;
const combinedDone=progAll.doneUnits;
const effectiveCombinedTotal=progShown.totalUnits;
const effectiveCombinedDone=progShown.doneUnits;
const progressPct=progShown.percent;
// Today's stitches for progress bar accent segment
const todayStitchesForBar=useMemo(()=>{if(!statsSessions)return 0;const deh=getDayEndHour(statsSettings);return getStatsTodayStitches(statsSessions,deh)+getLiveTodayStitches(currentAutoSessionRef.current,deh);},[statsSessions,liveAutoStitches,statsSettings]);
// Multi-colour parking — per-colour count for the legend "park" pip.
// Spent markers (on finished stitches, see isParkSpent) are not counted.
const parkCountsByColour=useMemo(()=>{
  const out={};
  if(!parkMarkers||!parkMarkers.length)return out;
  for(let i=0;i<parkMarkers.length;i++){
    if(isParkSpent(parkMarkers[i],done))continue;
    const id=parkMarkers[i].colorId;
    if(id)out[id]=(out[id]||0)+1;
  }
  return out;
},[parkMarkers,done,sW]);
const totalParkedColours=useMemo(()=>Object.keys(parkCountsByColour).length,[parkCountsByColour]);
// Markers that are drawn: colour layer shown and not spent. The Spotlight
// overlay cuts these out of its dimming; it keys its effect on the string so
// it redraws when the set changes, not on every tap that changes `done`.
const liveParkMarkers=useMemo(()=>(parkMarkers||[]).filter(pm=>parkLayers[pm.colorId]!==false&&!isParkSpent(pm,done)),[parkMarkers,parkLayers,done,sW]);
const liveParkKey=liveParkMarkers.map(pm=>pm.x+","+pm.y+","+(pm.corner||"BL")).join(";");
const liveParkMarkersRef=useRef(liveParkMarkers);liveParkMarkersRef.current=liveParkMarkers;
// Keep this hook in sequence; its result has no consumers.
useMemo(()=>{
  if(totalParkedColours===0)return false;
  for(const id in parkCountsByColour){if(parkLayers[id]!==false)return false;}
  return true;
},[parkCountsByColour,parkLayers,totalParkedColours]);
function toggleParkLayer(cid){setParkLayers(prev=>{const next=Object.assign({},prev);next[cid]=!(next[cid]!==false);if(next[cid])delete next[cid];return next;});}
const weekStitchesForChip=useMemo(()=>{if(!statsSessions)return 0;const deh=getDayEndHour(statsSettings);return getStatsThisWeekStitches(statsSessions,deh)+getLiveWeekStitches(currentAutoSessionRef.current,deh);},[statsSessions,liveAutoStitches,statsSettings]);
const todayBarPct=effectiveCombinedTotal>0?Math.min((todayStitchesForBar/effectiveCombinedTotal)*100,Math.min(progressPct,100)):0;
// Completion projection — derived from InsightsEngine when available.
// The one estimate (helpers.js, "One estimator"). The pace comes from the sessions, so it is worked out when they
// change, not on every mark; each mark only redoes the arithmetic on what is left.
const estPaceInfo=useMemo(()=>{
  const deh=getDayEndHour(statsSettings);
  let seconds=0,added=0;
  for(let i=0;i<(statsSessions||[]).length;i++){seconds+=getSessionSeconds(statsSessions[i]);added+=ProgressUnits.sessionAdded(statsSessions[i]);}
  return{pace:computePace(statsSessions||[],deh),speed:seconds>0?added/(seconds/3600):0,deh};
},[statsSessions,statsSettings]);
const completionEstimate=useMemo(()=>{
  if(!combinedTotal||!Array.isArray(statsSessions)||statsSessions.length===0)return null;
  return estimateFromPace(estPaceInfo.pace,Math.max(0,combinedTotal-combinedDone),{today:getStitchingDate(new Date(),estPaceInfo.deh),percent:progAll.percent,speed:estPaceInfo.speed});
},[estPaceInfo,combinedTotal,combinedDone,progAll,totalStitchable,statsSessions]);
const prevBarPct=Math.max(0,Math.min(progressPct,100)-todayBarPct);
// Plan B Phase 1: Progress info chip + AppInfoPopover state.
const [progressInfoOpen,setProgressInfoOpen]=useState(false);
const progressChipRef=useRef(null);

const specialtyColours=useMemo(()=>ProgressUnits.coloursFromProject({settings:{sW,sH},specialtyStitches,specialtyDone}),[sW,sH,specialtyStitches,specialtyDone]);
const colourDoneCounts=useMemo(()=>{
  const out={};
  const ids=new Set([...Object.keys(colourDoneCountsRef.current),...Object.keys(knotsByThread),...Object.keys(quartersByThread),...Object.keys(specialtyColours)]);
  ids.forEach(id=>{const kn=knotsByThread[id]||{},qt=quartersByThread[id]||{};out[id]={...(specialtyColours[id]||{}),...(colourDoneCountsRef.current[id]||{total:0,done:0,halfTotal:0,halfDone:0}),knotTotal:kn.total,knotDone:kn.done,quarterTotal:qt.total,quarterDone:qt.done};});
  return out;
},[countsVer,knotsByThread,quartersByThread,specialtyColours]);
// The counts that "which colours are left" questions should use: the work
// area's while one is active, the whole pattern's otherwise.
const scopedColourCounts=areaColourCounts||colourDoneCounts;
useEffect(()=>{
  if(!areaColourCounts)return;
  const current=areaColourCounts[focusColour];
  if(current&&(current.total+current.halfTotal)>0)return;
  const next=pal&&pal.find(p=>{const c=areaColourCounts[p.id];return c&&(c.total+c.halfTotal)>0;});
  setFocusColour(next?next.id:null);
},[areaColourCounts,focusColour,pal]);
const layerCounts=useMemo(()=>({full:totalStitchable,half:halfStitchCounts.total,backstitch:bsLines.length,quarter:quarterCounts.total,petite:specialtyCounts.petite.total,french_knot:knots.length,long_stitch:specialtyCounts.long_stitch.total}),[totalStitchable,halfStitchCounts.total,bsLines.length,knots.length,quarterCounts.total,specialtyCounts]);
// Shows every hidden layer again (the "hidden" chip's one click). The chip unmounts, so keyboard focus goes back to the chart.
const showHiddenLayers=()=>{setLayerVis(ALL_LAYERS_VISIBLE);const c=stitchRef.current;if(c&&c.focus)c.focus();};
// PERF: the palette legend tile list (rendered below) used to be rebuilt and
// re-sorted from `pal` on every single render of this component — including
// re-renders triggered by unrelated state (drag-preview updates, hover, etc.)
// while marking stitches. `colourDoneCountsRef.current` is mutated in place
// (see the T-5 counts invariant), so `countsVer` — not `colourDoneCounts`
// itself — is the correct "did the counts actually change" signal here.
// Class names for the colour list's key text (components.js ThreadKeyLabel; the Creator palette uses its own).
const TILE_KEY_CLASSES={wrap:"ppal-tile-text",id:"ppal-tile-id",tag:"ppal-tile-tag",name:"ppal-tile-name",use:"ppal-tile-use"};
// A legend row's count line. The whole-stitch figure is left out for a colour with no whole stitches but other kinds
// (so a colour used only in quarter stitches or knots never reads "0/0").
function legendCountText(dc,kn,qt,bsc){
  const parts=[];
  const other=(dc.petiteTotal>0)||(dc.longTotal>0)||(dc.halfTotal>0)||(kn&&kn.total>0)||(qt&&qt.total>0)||(bsc&&bsc.total>0);
  if(dc.total>0||!other)parts.push(dc.done+"/"+dc.total);
  if(dc.petiteTotal>0)parts.push((dc.petiteDone||0)+"/"+dc.petiteTotal+" petite");
  if(dc.longTotal>0)parts.push((dc.longDone||0)+"/"+dc.longTotal+" long stitch");
  if(dc.halfTotal>0)parts.push(dc.halfDone+"/"+dc.halfTotal+" half");
  if(kn&&kn.total>0)parts.push(kn.done+"/"+kn.total+" knots");
  if(qt&&qt.total>0)parts.push(qt.done+"/"+qt.total+" fractional");
  if(bsc&&bsc.total>0)parts.push(bsc.done+"/"+bsc.total+" lines");
  return parts.join(" · ");
}
const legendRows=useMemo(()=>{
  if(!pal)return null;
  // In a work area: only the colours it contains, with its counts.
  const src=areaColourCounts||colourDoneCounts;
  const shown=areaColourCounts?pal.filter(p=>{const c=areaColourCounts[p.id];return c&&(c.total+c.halfTotal)>0;}):pal;
  const rows=shown.map(p=>{
    const dc=src[p.id]||{total:0,done:0,halfTotal:0,halfDone:0};
    // French knots count one each (not in a work area's counts).
    const kn=!areaColourCounts&&knotsByThread[p.id]||{total:0,done:0};
    // Quarter stitches, a quarter each (not in a work area's counts either).
    const qt=!areaColourCounts&&quartersByThread[p.id]||{total:0,done:0};
    const cp=ProgressUnits.colourProgress({...dc,knotTotal:kn.total,knotDone:kn.done,quarterTotal:qt.total,quarterDone:qt.done});
    const totalWH=cp.totalUnits,doneWH=cp.doneUnits;
    // Backstitch lines of this colour are their own row and not in the units; a colour with nothing else is judged by them.
    const bsc=!areaColourCounts&&bsByColour[String(p.id)]||{total:0,done:0};
    let pct=totalWH>0?cp.percent:ProgressUnits.percent(bsc.done,bsc.total);
    const remaining=Math.max(0,totalWH-doneWH);
    const complete=totalWH>0?(doneWH>=totalWH&&(bsc.total===0||bsc.done>=bsc.total)):(bsc.total>0&&bsc.done>=bsc.total);
    return {p,dc,kn,qt,bsc,pct,remaining,complete};
  });
  if(legendSort==="done")rows.sort((a,b)=>b.pct-a.pct);
  else if(legendSort==="count")rows.sort((a,b)=>b.remaining-a.remaining);
  else rows.sort((a,b)=>{const ai=String(a.p.id),bi=String(b.p.id);const an=parseInt(ai,10),bn=parseInt(bi,10);if(isFinite(an)&&isFinite(bn)&&String(an)===ai&&String(bn)===bi)return an-bn;return ai.localeCompare(bi);});
  return rows;
},[pal,colourDoneCounts,countsVer,legendSort,areaColourCounts,knotsByThread,quartersByThread,bsByColour]);
// The colour list's key rows (UX-013, UX-014): the one thread label, then the strands and skeins each symbol takes.
// They change with the palette or the fabric count, not with every stitch marked, so they are built once here.
const keyRowsById=useMemo(()=>{
  const out={};
  if(pal)pal.forEach(p=>{out[p.id]=threadKeyRow(p,{fabricCount:fabricCt});});
  return out;
},[pal,fabricCt]);
// The key under the progress bar: the chart's own pale and done looks for one colour, and whether any thread is pale
// enough to look grey once stitched. Only changes with the palette or the selected colour, not with every stitch.
const stitchKey=useMemo(()=>{
  if(!pal||!pal.length)return null;
  const sample=(focusColour&&cmap&&cmap[focusColour])||pal[0];
  return{pend:pendingStitchLook(sample.rgb,0.5).fill,done:doneStitchLook(sample.rgb).fill,pale:pal.some(p=>lum709(p.rgb)>DONE_MAX_LUM)};
},[pal,cmap,focusColour]);
// After recomputeAllCounts has run post-load, snap prevAutoCountRef to the real
// counts so the auto-detect effect below never sees a spurious delta.
useEffect(()=>{if(justLoadedRef.current){prevAutoCountRef.current={done:doneCountRef.current,halfDone:(halfStitchCounts&&halfStitchCounts.done)||0};justLoadedRef.current=false;}},[countsVer]);
useEffect(()=>{const pid=projectIdRef.current;if(!pid)return;try{localStorage.setItem('cs_layerVis_'+pid,JSON.stringify(layerVis));}catch(_){}},[layerVis]);
useEffect(()=>{const pid=projectIdRef.current;if(!pid)return;try{localStorage.setItem('cs_parkLayers_'+pid,JSON.stringify(parkLayers));}catch(_){}},[parkLayers]);
useEffect(()=>{try{localStorage.setItem('cs_bsThickness',String(bsThickness));}catch(_){}},[bsThickness]);
// ── Zoom-adaptive detail level ──
const[lockDetailLevel,setLockDetailLevel]=useState(()=>{try{return !!JSON.parse(localStorage.getItem('cs_lockDetail')||'false');}catch(e){console.warn('cs_lockDetail corrupted, resetting:',e);try{localStorage.removeItem('cs_lockDetail');}catch(_){}return false;}});
useEffect(()=>{try{localStorage.setItem('cs_lockDetail',String(lockDetailLevel));}catch(_){}},[lockDetailLevel]);
// Tier 1 (zoomed-out) fade strength for un-stitched cells. 0 = off (full colour),
// 0.15 = subtle, 0.55 = strong (legacy behaviour). Default 0 keeps the colour
// view at full saturation when zoomed out.
const stitchLookRef=useRef({cmap:null,fade:-1,done:null,pend:null});   // drawStitch's per-colour looks, kept between paints
const minimapPref=useTrackerPref('trackerMinimap',true);   // the pattern overview in the corner of the chart
const minimapApiRef=useRef(null);                          // set by the overview while it is mounted: cellsChanged(changes,nd)
const[minimapFocusOpen,setMinimapFocusOpen]=useState(false);   // on a phone in Focus the overview stays shut until asked for
const doneStyle=useTrackerPref('trackerDoneStyle','fill');   // how a finished stitch shows: 'fill' (thread colour, dimmed symbol) or 'tick' (corner tick)
// The chart's grid lines (More > View > Grid lines). High contrast draws Standard as Bold; Subtle stays as chosen.
const gridStyle=useTrackerPref('trackerGridStyle','standard');
const gridColour=useTrackerPref('trackerGridColour','auto');
const gridEvery=useTrackerPref('trackerGridEvery',10);
const highContrastPref=!!useTrackerPref('a11yHighContrast',false);
const gridStyleEff=highContrastPref&&gridStyle==='standard'?'bold':gridStyle;
const[lowZoomFade,setLowZoomFade]=useState(()=>{try{const v=parseFloat(localStorage.getItem('cs_lowZoomFade')||'0');return Number.isFinite(v)?Math.max(0,Math.min(0.9,v)):0;}catch(_){return 0;}});
useEffect(()=>{try{localStorage.setItem('cs_lowZoomFade',String(lowZoomFade));}catch(_){}},[lowZoomFade]);
// tierRef: current render tier (1–4) with hysteresis; default zoom=1→scs=20→Tier 3
const tierRef=useRef(3);
const tierFadeRef=useRef({symbolOpacity:1.0,bsHsOpacity:1.0,animRafId:null});
const renderStitchRef=useRef(null);
// PERF: set true by single/bulk stitch-toggle paths that already painted their
// changed cells directly (see paintDoneChanges call sites) so the full-viewport
// renderStitch effect can skip a redundant redraw. See the effect below for detail.
const skipNextFullRedrawRef=useRef(null);   // the done (or bsDone) array whose commit needs no full redraw

const focusableColors=useMemo(()=>{
  if(!pal)return[];
  const cc=scopedColourCounts;
  // In a work area, only the colours it contains.
  let list=areaColourCounts?pal.filter(p=>{const c=areaColourCounts[p.id];return c&&c.total>0;}):pal;
  if(!list.length)list=pal;
  if(onlyStarted){const started=list.filter(p=>{const dc=cc[p.id];return dc&&dc.done>0;});if(started.length>0)list=started;}
  if(!highlightSkipDone)return list;
  const incomplete=list.filter(p=>{const dc=cc[p.id];return !dc||dc.done<dc.total;});
  return incomplete.length>0?incomplete:list;
},[pal,colourDoneCounts,countsVer,highlightSkipDone,onlyStarted,areaColourCounts]);

const sections=useMemo(()=>{
  if(!statsView||!pat||!done)return[];
  const secCols=(statsSettings&&statsSettings.sectionCols)||50;
  const secRows=(statsSettings&&statsSettings.sectionRows)||50;
  const numX=Math.ceil(sW/secCols);const numY=Math.ceil(sH/secRows);
  const result=[];
  for(let sy=0;sy<numY;sy++){for(let sx=0;sx<numX;sx++){
    const x0=sx*secCols,y0=sy*secRows;
    const x1=Math.min(x0+secCols,sW),y1=Math.min(y0+secRows,sH);
    let total=0,completed=0;
    for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){const idx=y*sW+x;const m=pat[idx];if(m&&m.id!=='__skip__'&&m.id!=='__empty__'){total++;if(done[idx])completed++;}}}
    result.push({label:String(sy*numX+sx+1),sx,sy,x0,y0,x1,y1,total,completed,pct:ProgressUnits.percent(completed,total),isDone:total>0&&completed>=total});
  }}
  return result;
},[statsView,pat,done,sW,sH,statsSettings.sectionCols,statsSettings.sectionRows]);

const prevFocusIdRef=useRef(null);
const prevFocusDoneRef=useRef(null);
useEffect(()=>{
  if(!focusColour||stitchView!=="highlight"||!highlightSkipDone||!scopedColourCounts||!pal)return;
  const dc=scopedColourCounts[focusColour];
  const isNowComplete=dc&&dc.total>0&&dc.done>=dc.total;
  if(prevFocusIdRef.current!==focusColour){
    prevFocusIdRef.current=focusColour;
    prevFocusDoneRef.current=isNowComplete;
    return;
  }
  if(prevFocusDoneRef.current===false&&isNowComplete){
    const nextColor=pal.find(p=>{
      if(p.id===focusColour)return false;
      const dc2=scopedColourCounts[p.id];
      if(areaColourCounts&&!dc2)return false;
      return !dc2||dc2.done<dc2.total;
    });
    if(nextColor){
      setFocusColour(nextColor.id);
      setAdvanceToast(formatThread(nextColor));
      setTimeout(()=>setAdvanceToast(null),2500);
      return;
    }
  }
  prevFocusDoneRef.current=isNowComplete;
},[countsVer,focusColour,stitchView,highlightSkipDone,pal,areaColourCounts]);


/* ── Chart rulers ────────────────────────────────────────────────────────
   The sticky column and row rulers render one <div> per column and per row —
   900 of them on a 400x500 chart, 1 400 on a 600x800. Inline in the returned
   JSX they were rebuilt on *every* render of TrackerApp, and TrackerApp
   re-renders once a second while a stitching session is running (the session
   clock; see useAutoSession.js).

   Measured on a 400x500 chart sitting idle with a live session: 1 210
   React.createElement calls per second, of which 1 029 were these divs. They
   depend only on the chart's dimensions and its cell size, so memoising them
   removes ~85% of that work — and the saving grows with pattern size, which
   is exactly where it is needed. Every other re-render benefits too, not just
   the per-second one.

   G is a module constant and deliberately not a dependency. */
const rulerStep=scs<6?10:scs<14?5:1;
const colRuler=useMemo(()=>Array.from({length:sW},(_,x)=>{
  const show=((x+1)%rulerStep===0||x===0), is10=(x+1)%10===0, is5=(x+1)%5===0;
  return (
    <div key={x} style={{ width: scs, flexShrink: 0, height: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(9, Math.min(11, scs * 0.6)), fontWeight: is10 ? 'bold' : is5 ? 600 : 400, color: is10 ? 'var(--text-primary)' : is5 ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontFamily: 'monospace' }}>
      {show ? (x + 1) : ''}
    </div>
  );
}),[sW,scs,rulerStep]);
const rowRuler=useMemo(()=>Array.from({length:sH},(_,y)=>{
  const show=((y+1)%rulerStep===0||y===0), is10=(y+1)%10===0, is5=(y+1)%5===0;
  return (
    <div key={y} style={{ height: scs, flexShrink: 0, width: G, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: Math.max(9, Math.min(11, scs * 0.6)), fontWeight: is10 ? 'bold' : is5 ? 600 : 400, color: is10 ? 'var(--text-primary)' : is5 ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontFamily: 'monospace' }}>
      {show ? (y + 1) : ''}
    </div>
  );
}),[sH,scs,rulerStep]);
const skeinData=useMemo(()=>{
  if(!pal)return[];
  return threadDemandRows(projectThreadEntries({pattern:pat,halfStitches,partialStitches,bsLines,knots,specialtyStitches,threadBrand}),{fabricCount:fabricCt})
    .map(r=>{const t=findThreadInCatalog(r.p.brand,r.p.id);return{id:r.p.id,brand:r.p.brand,key:r.key,name:t?t.name:r.name,rgb:t?t.rgb:[128,128,128],stitches:r.threadStitches,skeins:r.needed,estimatedSkeins:r.estimatedNeeded};});
},[pal,pat,fabricCt,halfStitches,partialStitches,bsLines,knots,specialtyStitches,threadBrand]);

useEffect(()=>{
  function loadStash(){if(typeof StashBridge!=="undefined"){StashBridge.getGlobalStash().then(setGlobalStash).catch(e=>console.warn('getGlobalStash failed:',e));}}
  loadStash();
  window.addEventListener('cs:stashChanged',loadStash);
  return ()=>{window.removeEventListener('cs:stashChanged',loadStash);};
},[]);

// Detect project completion and offer stash deduction
useEffect(()=>{
  if(progAll.complete && !stashDeducted && combinedTotal>0 && typeof StashBridge!=="undefined"){
    setModal(wastePrefs.enabled?"rt_complete_summary":"deduct_prompt");
  }
},[progAll.complete,stashDeducted,wastePrefs.enabled]);

const totalSkeins=useMemo(()=>skeinData.reduce((s,d)=>s+d.skeins,0),[skeinData]);
const blendCount=useMemo(()=>pal?pal.filter(p=>p.type==="blend").length:0,[pal]);

// Scan pattern once for confetti/change metrics used by the difficulty model.
const difficultyMetrics=useMemo(()=>{
  if(!pat||!sW||!sH||totalStitchable<1)return{};
  let isolated=0,changePairs=0,totalPairs=0;
  for(let y=0;y<sH;y++){for(let x=0;x<sW;x++){
    const i=y*sW+x;const cell=pat[i];
    if(!cell||cell.id==='__skip__'||cell.id==='__empty__')continue;
    const id=cell.id;
    let iso=true,nx;
    if(x>0){nx=pat[y*sW+(x-1)];if(nx&&nx.id!=='__skip__'&&nx.id!=='__empty__'&&nx.id===id)iso=false;}
    if(iso&&x+1<sW){nx=pat[y*sW+(x+1)];if(nx&&nx.id!=='__skip__'&&nx.id!=='__empty__'&&nx.id===id)iso=false;}
    if(iso&&y>0){nx=pat[(y-1)*sW+x];if(nx&&nx.id!=='__skip__'&&nx.id!=='__empty__'&&nx.id===id)iso=false;}
    if(iso&&y+1<sH){nx=pat[(y+1)*sW+x];if(nx&&nx.id!=='__skip__'&&nx.id!=='__empty__'&&nx.id===id)iso=false;}
    if(iso)isolated++;
    if(x+1<sW){nx=pat[y*sW+(x+1)];if(nx&&nx.id!=='__skip__'&&nx.id!=='__empty__'){totalPairs++;if(nx.id!==id)changePairs++;}}
    if(y+1<sH){nx=pat[(y+1)*sW+x];if(nx&&nx.id!=='__skip__'&&nx.id!=='__empty__'){totalPairs++;if(nx.id!==id)changePairs++;}}
  }}
  return{confettiScore:isolated/totalStitchable,changeScore:totalPairs>0?changePairs/totalPairs:0};
},[pat,sW,sH,totalStitchable]);

const difficulty=useMemo(()=>pal?calcDifficulty(pal.length,blendCount,totalStitchable,{fabricCt,bsCount:bsLines.length,confettiScore:difficultyMetrics.confettiScore,changeScore:difficultyMetrics.changeScore}):null,[pal,blendCount,totalStitchable,fabricCt,bsLines,difficultyMetrics]);

// The threads (brand:id) that at least one marked stitch uses, as kept by the
// project's live thread-usage marks (the sync effect below). Only changes when a
// thread gains its first mark or loses its last, so it rarely re-renders.
const[rtMarkedKeys,setRtMarkedKeys]=useState([]);
const rtConsumption=useMemo(()=>{
  const out={},ctx=rtContextRef.current;
  const used=ctx&&ctx.accounting?window.ThreadAccounting.totals(ctx.accounting,ctx.projectId):{};
  new Set([...rtMarkedKeys,...Object.keys(used)]).forEach(key=>{const owned=globalStash[key]?StashBridge.stashEffectiveQty(globalStash[key]):null;
    out[key]={key,skeinsConsumed:used[key]||0,ownedSkeins:owned,skeinsRemaining:owned};});
  return out;
},[rtMarkedKeys,globalStash,rtAccountingVersion]);
rtWriteSnapshotRef.current={ctx:rtContextRef.current,enabled:wastePrefs.enabled};

// Retain the exact pending operations on failure; a lost acknowledgement retries the same identities.
const flushRtStashWrite=useCallback(async(captured)=>{
  const write=captured?{ctx:captured}:rtWriteSnapshotRef.current;
  if(!write||!write.ctx||typeof StashBridge==='undefined')return;
  const ctx=write.ctx;
  if(ctx.batchTimer){clearTimeout(ctx.batchTimer);ctx.batchTimer=null;}ctx.batchSince=null;   // this write takes the batch
  if(!ctx.projectId||savesBlockedRef.current)return;
  const run=async()=>{
    if(ctx.ready)await ctx.ready.catch(()=>{});
    if(!ctx.accounting){const r=await StashBridge.applyConsumptionEvents(ctx.projectId,ctx.initialMarks,[]);ctx.accounting=r.accounting;}
    while(ctx.outbox.length){
      // Two recovery keys may contain the same operation after a peer copied
      // an outbox. Deduplicate before allocating sequences, not just at commit.
      const batch=Array.from(new Map(ctx.outbox.map(c=>[c.token,c])).values()),heads=window.ThreadAccounting.sequences(ctx.accounting,ctx.projectId);
      batch.forEach(c=>{
        const receipt=ctx.accounting.receipts&&ctx.accounting.receipts[c.token];
        if(receipt)c.seq=JSON.parse(receipt)[2];
        if(!c.seq){c.seq=Math.max(ctx.sequences[c.unit]||0,heads[c.unit]||0)+1;}
        ctx.sequences[c.unit]=Math.max(ctx.sequences[c.unit]||0,c.seq);c.projectId=ctx.projectId;
      });
      // Save identities before attempting the transaction, so a lost acknowledgement
      // after closing the tab replays exactly the same events.
      try{localStorage.setItem(ctx.outboxKey,JSON.stringify(ctx.outbox));}catch(e){console.warn('Consumption recovery storage unavailable',e);}
      const result=await StashBridge.applyConsumptionEvents(ctx.projectId,ctx.initialMarks,batch);
      ctx.accounting=result.accounting;
      ctx.outbox=ctx.outbox.filter(c=>!batch.some(op=>op.token===c.token));
      try{
        localStorage.setItem(ctx.outboxKey,JSON.stringify(ctx.outbox));
        (ctx.recoveredKeys||[]).forEach(r=>{if(localStorage.getItem(r.key)===r.value)localStorage.removeItem(r.key);});ctx.recoveredKeys=[];
      }catch(e){console.warn('Could not clear committed consumption recovery',e);}
      if(rtContextRef.current===ctx){setGlobalStash(result.threads);setRtAccountingVersion(v=>v+1);}
    }
  };
  ctx.queue=(ctx.queue||Promise.resolve()).catch(()=>{}).then(run);
  try{await ctx.queue;}catch(e){
    console.warn('Stash event write failed; retained for retry:',e);
    if(window.Toast)window.Toast.show({message:'Could not update stash. Your consumption history will be retried.',type:'warning'});
    if(rtContextRef.current===ctx){
      if(rtDebounceRef.current)clearTimeout(rtDebounceRef.current);
      rtDebounceRef.current=setTimeout(()=>{rtDebounceRef.current=null;flushRtStashWriteRef.current().catch(()=>{});},30000);
    }
    throw e;
  }
},[]);
const flushRtStashWriteRef=useRef(flushRtStashWrite);
flushRtStashWriteRef.current=flushRtStashWrite;
const openConsumptionHistory=useCallback(async()=>{
  const ctx=rtContextRef.current;if(!ctx)return;
  try{
    await flushRtStashWriteRef.current(ctx).catch(()=>{});
    const ledger=await StashBridge.getConsumptionAccounting();
    if(rtContextRef.current!==ctx)return;
    ctx.accounting=ledger;setRtAccountingVersion(v=>v+1);setModal('rt_history');
  }catch(e){if(window.Toast)window.Toast.show({message:'Could not read consumption history. Please try again.',type:'warning'});}
},[]);
// Capture assumptions with each progress transition. Preferences alone never create usage.
// The project's thread-usage marks (one estimate per marked stitch) live in
// ctx.live, which re-estimates only what changed since the last commit. It used
// to be rebuilt for every finished stitch inside each render, then diffed key by
// key here: ~0.7 s per tap on a large, half-stitched chart at phone speed.
useEffect(()=>{
  const ctx=rtContextRef.current;if(!ctx||!ctx.live)return;
  // Initialisation can finish after a mark. Queue changes with their original assumptions.
  const marked=ctx.live.sync({...v3FieldsRef.current,pattern:pat,done,fabricCt,
    halfStitches,halfDone,partialStitches,partialDone,knots,knotsDone,bsLines,bsDone,specialtyStitches,specialtyDone,
    settings:{threadBrand}},wastePrefs);
  const keys=ctx.live.threadKeys();
  setRtMarkedKeys(prev=>prev.length===keys.length&&keys.every(k=>prev.includes(k))?prev:keys);
  if(!marked.length)return;
  const changes=marked.map(({unit,before,after})=>{
    const intent=ctx.intents[unit];delete ctx.intents[unit];
    return {unit,estimate:after||before,kind:intent||(after?'mark':'correction'),enabled:wastePrefs.enabled,date:new Date().toISOString()};
  });
  changes.forEach(c=>{c.token=crypto.randomUUID();ctx.outbox.push(c);});
  // Crash recovery records the original assumptions before any asynchronous work.
  try{localStorage.setItem(ctx.outboxKey,JSON.stringify(ctx.outbox));}
  catch(e){if(window.Toast)window.Toast.show({message:'Could not save pending consumption history. Keep this tab open and retry.',type:'warning'});}
  // Batched, and written when marking pauses (RT_IDLE_MS), or every RT_CAP_MS while
  // it goes on, rather than once per tap or every couple of seconds. Each write
  // reads and rewrites the whole stash ledger — an event for every stitch ever
  // marked, seconds on a phone once that history is long — then reloads the stash
  // and re-renders the Tracker. The outbox saved above already covers a crash;
  // hiding or closing the tab, opening the history and saving the project all
  // flush straight away.
  if(ctx.batchTimer)clearTimeout(ctx.batchTimer);
  if(!ctx.batchSince)ctx.batchSince=Date.now();
  ctx.batchTimer=setTimeout(()=>{ctx.batchTimer=null;ctx.batchSince=null;flushRtStashWriteRef.current(ctx).catch(()=>{});},
    Math.max(0,Math.min(RT_IDLE_MS,RT_CAP_MS-(Date.now()-ctx.batchSince))));
},[pat,done,fabricCt,halfStitches,halfDone,partialStitches,partialDone,knots,knotsDone,bsLines,bsDone,specialtyStitches,specialtyDone,wastePrefs,threadBrand]);
useEffect(()=>{
  function onHidden(){if(document.hidden)flushRtStashWriteRef.current().catch(()=>{});}
  document.addEventListener('visibilitychange',onHidden);
  return()=>document.removeEventListener('visibilitychange',onHidden);
},[]);

// Presence is advisory; IDB transactions provide the accounting exclusion.
// A join can solicit one active response. Active/heartbeat messages never reply.
useEffect(()=>{
  if(!wastePrefs.enabled)return;
  var useBroadcast=!(typeof BroadcastChannel==='undefined');
  var chan;
  var myId=Math.random().toString(36).slice(2)+Date.now().toString(36);
  var warned=false;
  var LS_KEY='cs-rt-tracker-hb';
  function showWarning(){
    if(!warned&&window.Toast){
      warned=true;
      window.Toast.show({
        message:'Live stash tracking is also enabled in another tab. Sync project marks before continuing in both tabs.',
        type:'warning',duration:8000
      });
    }
  }
  function announce(type){
    var msg={type:typeof type==='string'?type:'rt-active',id:myId,t:Date.now()};
    if(useBroadcast){try{chan.postMessage(msg);}catch(_){}}
    else{try{localStorage.setItem(LS_KEY,JSON.stringify(msg));}catch(_){}}
  }
  function receive(msg){
    if(!msg||msg.id===myId||typeof msg.id!=='string'||!Number.isFinite(msg.t)||Date.now()-msg.t>90000||msg.t>Date.now()+5000)return;
    if(msg.type!=='rt-active'&&msg.type!=='rt-join')return;
    if(msg.type==='rt-join')announce('rt-active');
    showWarning();
  }
  function onMsg(ev){receive(ev&&ev.data);}
  function onStorage(ev){
    if(ev.key!==LS_KEY)return;
    try{receive(JSON.parse(ev.newValue));}catch(_){}
  }
  if(useBroadcast){
    try{chan=new BroadcastChannel('cs-rt-tracker');}catch(_){useBroadcast=false;}
  }
  if(useBroadcast){chan.addEventListener('message',onMsg);}
  else{window.addEventListener('storage',onStorage);}
  announce('rt-join');
  var hb=setInterval(announce,30000);
  return function(){
    clearInterval(hb);
    if(useBroadcast&&chan){try{chan.removeEventListener('message',onMsg);chan.close();}catch(_){}}
    else{window.removeEventListener('storage',onStorage);try{var last=JSON.parse(localStorage.getItem(LS_KEY));if(last&&last.id===myId)localStorage.removeItem(LS_KEY);}catch(_){}}
  };
},[wastePrefs.enabled]);

// Debounced write: reset timer on every stitch mark. Fires 30 s after last activity.
useEffect(()=>{
  if(!wastePrefs.enabled)return;
  if(rtDebounceRef.current)clearTimeout(rtDebounceRef.current);
  rtDebounceRef.current=setTimeout(()=>{rtDebounceRef.current=null;flushRtStashWrite().catch(()=>{});},30000);
  return()=>{if(rtDebounceRef.current){clearTimeout(rtDebounceRef.current);rtDebounceRef.current=null;}};
},[done,halfDone,partialDone,knotsDone,bsDone,specialtyDone,wastePrefs.enabled]);

// Low-thread toast: fires once per thread per session when skeinsRemaining first drops below 0.25.
const prevRtConsumptionRef=useRef({});
useEffect(()=>{
  if(!wastePrefs.enabled||!skeinData)return;
  const LOW=0.25;
  skeinData.forEach(d=>{
    const curr=rtConsumption[d.key];
    const prev=prevRtConsumptionRef.current[d.key];
    if(!curr||curr.skeinsRemaining==null)return;
    const wasOk=!prev||prev.skeinsRemaining==null||prev.skeinsRemaining>=LOW;
    const isLow=curr.skeinsRemaining>=0&&curr.skeinsRemaining<LOW;
    const notAlerted=!rtLowToastedRef.current.has(d.key);
    if(wasOk&&isLow&&notAlerted){
      rtLowToastedRef.current.add(d.key);
      if(typeof window.Toast!=='undefined'&&window.Toast.show){
        window.Toast.show({
          message:'Low thread: '+formatThread(d)+'. Only '+curr.skeinsRemaining.toFixed(2)+' skeins remaining.',
          type:'warning',duration:10000
        });
      }
    }
    // Reset toast gate if the user adds more thread (skeinsRemaining recovers above LOW+0.25)
    if(curr.skeinsRemaining>=LOW+0.25)rtLowToastedRef.current.delete(d.key);
  });
  prevRtConsumptionRef.current=rtConsumption;
},[rtConsumption,wastePrefs.enabled]);

// Keep autoStatsRef fresh
useEffect(()=>{autoStatsRef.current={doneUnits:combinedDone,totalUnits:combinedTotal};},[combinedDone,combinedTotal]);
// Observe progress for milestones and optional daily snapshots; actions own session accounting.
useEffect(()=>{
  try{
    if(!pat||!done)return;
    const curDone=doneCount;
    const curHalf=(halfStitchCounts&&halfStitchCounts.done)||0;
    const prev=prevAutoCountRef.current||{done:0,halfDone:0};
    const prevDone=prev.done;
    const prevHalf=prev.halfDone;
    // Skip initial load or project load — justLoadedRef stays true until
    // both doneCount and halfStitchCounts.done have settled post-load.
    // justLoadedRef is now cleared by the countsVer useEffect above, which fires
    // after recomputeAllCounts and snaps prevAutoCountRef to the real loaded counts.
    // The prevDone<0 sentinel guards the first auto-detect fire before that effect runs.
    // French knots count one each. The seeds elsewhere don't carry a knot
    // count; a missing one is taken as "no change" and set from here on.
    const curKnot=knotCounts.done;
    const prevKnot=typeof prev.knotDone==="number"?prev.knotDone:curKnot;
    const curPetite=specialtyCounts.petite.done,curLong=specialtyCounts.long_stitch.done;
    const prevPetite=typeof prev.petiteDone==='number'?prev.petiteDone:curPetite,prevLong=typeof prev.longDone==='number'?prev.longDone:curLong;
    const petiteDiff=curPetite-prevPetite,longDiff=curLong-prevLong;
    const curQuarter=quarterCounts.done;
    const prevQuarter=typeof prev.quarterDone==="number"?prev.quarterDone:curQuarter;
    if(prevDone<0||prevHalf<0){
      prevAutoCountRef.current={done:curDone,halfDone:curHalf,knotDone:curKnot,quarterDone:curQuarter,petiteDone:curPetite,longDone:curLong};
      return;
    }
    const doneDiff=curDone-prevDone;
    const halfDiff=curHalf-prevHalf;
    const knotDiff=curKnot-prevKnot;
    const quarterDiff=curQuarter-prevQuarter;
    if(doneDiff!==0||halfDiff!==0||knotDiff!==0||quarterDiff!==0||petiteDiff!==0||longDiff!==0){
      const completedUnits=ProgressUnits.sessionUnits({full:Math.max(0,doneDiff),half:Math.max(0,halfDiff),knot:Math.max(0,knotDiff),quarter:Math.max(0,quarterDiff),petite:Math.max(0,petiteDiff),long_stitch:Math.max(0,longDiff)});
      // Accounting is synchronous at the action; this effect only observes milestones and snapshots.
      // Milestone detection
      if(completedUnits>0&&combinedTotal>0){
        const prevTotal=ProgressUnits.sessionUnits({full:prevDone,half:prevHalf,knot:prevKnot,quarter:prevQuarter,petite:prevPetite,long_stitch:prevLong});
        const newTotal=ProgressUnits.sessionUnits({full:curDone,half:curHalf,knot:curKnot,quarter:curQuarter,petite:curPetite,long_stitch:curLong});
        try{
          const hits=checkMilestones(prevTotal,newTotal,combinedTotal);
          if(hits&&hits.length>0){
            const best=hits[hits.length-1];
            const key=best.pct!=null?('pct_'+best.pct):best.label;
            if(!celebratedRef.current.has(key)){
              celebratedRef.current.add(key);
              // Remembered as celebrated either way, so turning celebrations on later does not replay old ones.
              if(motivationRef.current.show)setCelebration(best);
            }
            for(let h=0;h<hits.length;h++){pendingMilestonesRef.current.push(hits[h]);}
            // Record persistently (deduplicated by pct/label key)
            const now=new Date().toISOString();
            const sessionId=currentAutoSessionRef.current?currentAutoSessionRef.current.id:null;
            const newMs=hits.map(h=>({pct:h.pct,label:h.label,achievedAt:now,sessionId}));
            setAchievedMilestones(prev=>{
              const existing=new Set(prev.map(m=>m.pct!=null?('pct_'+m.pct):m.label));
              const unique=newMs.filter(m=>{const k=m.pct!=null?('pct_'+m.pct):m.label;return !existing.has(k);});
              return unique.length>0?[...prev,...unique]:prev;
            });
          }
        }catch(me){}
      }
    }
    // Auto-snapshot: on a new stitching day, keep a snapshot of the done-state as it was. The day comes from
    // the same helper the statistics use (it used to call a function that only exists inside useAutoSession,
    // so it threw into this catch and no snapshot was ever saved). Compressing 90,000 cells is a few
    // milliseconds, so it runs when the browser is idle rather than inside the mark.
    if(done&&window.UserPrefs&&window.UserPrefs.get('trackerAutomaticSnapshots')===true){
      try{
        const today=getStitchingDate(new Date(),getDayEndHour(statsSettings));
        if(!lastSnapshotDateRef.current){
          lastSnapshotDateRef.current=today;
        } else if(lastSnapshotDateRef.current!==today){
          const copy=done.slice(),dayOf=lastSnapshotDateRef.current,marks=curDone,w=sW,hgt=sH,forProject=projectIdRef.current;
          const generation=snapshotGenerationRef.current;
          const make=()=>{
            // The user may have opened another project while this waited for an idle moment.
            if(projectIdRef.current!==forProject)return;
            if(generation!==snapshotGenerationRef.current||!window.UserPrefs||window.UserPrefs.get('trackerAutomaticSnapshots')!==true)return;
            try{
              const b=pako.deflate(copy);
              const C=0x8000;let o='';for(let i=0;i<b.length;i+=C)o+=String.fromCharCode.apply(null,b.subarray(i,i+C));
              const snapshot={id:'snap_'+Date.now(),date:dayOf,label:'auto',doneCount:marks,w:w,h:hgt,data:btoa(o)};
              setDoneSnapshots(prev=>{
                if(generation!==snapshotGenerationRef.current||projectIdRef.current!==forProject||window.UserPrefs.get('trackerAutomaticSnapshots')!==true)return prev;
                const updated=[...prev,snapshot];
                const labelled=updated.filter(s=>(s.label!=='auto'||s.kind==='manual'));
                const autos=updated.filter(s=>(s.label==='auto'&&s.kind!=='manual')).slice(-60);
                return[...labelled,...autos];
              });
            }catch(e){console.warn('[stitchx/tracker] could not save the daily snapshot:',e);}
          };
          if(typeof requestIdleCallback==='function')requestIdleCallback(make,{timeout:5000});else setTimeout(make,0);
          lastSnapshotDateRef.current=today;
        }
      }catch(e){console.warn('[stitchx/tracker] daily snapshot check failed:',e);}
    }
    prevAutoCountRef.current={done:curDone,halfDone:curHalf,knotDone:curKnot,quarterDone:curQuarter,petiteDone:curPetite,longDone:curLong};
  }catch(e){}
},[doneCount,halfStitchCounts.done,knotCounts.done,quarterCounts.done,specialtyCounts]);
// Goal-completion detection: remembers when a goal is first reached in this session; says so only when goals are shown.
useEffect(()=>{
  try{
    const deh=getDayEndHour(statsSettings);
    const dailyGoal=statsSettings&&statsSettings.dailyGoal;
    const weeklyGoal=statsSettings&&statsSettings.weeklyGoal;
    const monthlyGoal=statsSettings&&statsSettings.monthlyGoal;
    if(!dailyGoal&&!weeklyGoal&&!monthlyGoal)return;
    const liveSess=currentAutoSessionRef.current;
    const prev=goalCelebrationRef.current;
    if(dailyGoal>0){
      const cur=todayStitchesForBar;
      if(!prev.daily&&cur>=dailyGoal){goalCelebrationRef.current={...prev,daily:true};if(motivationRef.current.show)setCelebration({label:'Daily goal reached: '+cur.toLocaleString('en-GB')+' of '+dailyGoal.toLocaleString('en-GB')+' stitches',pct:null});}
      else if(prev.daily&&cur<dailyGoal)goalCelebrationRef.current={...prev,daily:false};
    }
    if(weeklyGoal>0){
      const cur=getStatsThisWeekStitches(statsSessions||[],deh)+getLiveWeekStitches(liveSess,deh);
      if(!prev.weekly&&cur>=weeklyGoal){goalCelebrationRef.current={...prev,weekly:true};if(motivationRef.current.show)setCelebration({label:'Weekly goal reached: '+cur.toLocaleString('en-GB')+' of '+weeklyGoal.toLocaleString('en-GB')+' stitches',pct:null});}
      else if(prev.weekly&&cur<weeklyGoal)goalCelebrationRef.current={...prev,weekly:false};
    }
    if(monthlyGoal>0){
      const cur=getStatsThisMonthStitches(statsSessions||[],deh)+getLiveMonthStitches(liveSess,deh);
      if(!prev.monthly&&cur>=monthlyGoal){goalCelebrationRef.current={...prev,monthly:true};if(motivationRef.current.show)setCelebration({label:'Monthly goal reached: '+cur.toLocaleString('en-GB')+' of '+monthlyGoal.toLocaleString('en-GB')+' stitches',pct:null});}
      else if(prev.monthly&&cur<monthlyGoal)goalCelebrationRef.current={...prev,monthly:false};
    }
  }catch(e){}
},[todayStitchesForBar,liveAutoStitches,statsSessions,statsSettings]);

// ═══ Analysis worker lifecycle ═══
useEffect(()=>{
  try{
    const w=new Worker("analysis-worker.js");
    analysisWorkerRef.current=w;
    w.onmessage=function(e){
      const msg=e.data;
      if(msg.type==="result"){
        const result=msg.result;
        // Keep the statics even from a superseded request: they are sent only
        // once per pattern, so dropping them here would lose them for good.
        if(result&&result.perStitch&&msg.patternId===analysisPatternRef.current.id){
          analysisStaticsRef.current={id:msg.patternId,perStitch:result.perStitch};
        }
        if(msg.requestId!==analysisRequestIdRef.current)return;
        const st=analysisStaticsRef.current;
        if(result&&st.id===msg.patternId){
          result.perStitch=Object.assign({},st.perStitch,{isCompleted:analysisPostedDoneRef.current});
        }
        setAnalysisResult(result);
        setAnalysisRunning(false);
      }else if(msg.type==="error"&&msg.requestId===analysisRequestIdRef.current){
        setAnalysisRunning(false);
      }
    };
    w.onerror=function(err){
      // PERF (perf-8 #12): terminate the worker on error so a wedged worker doesn't
      // leak; null the ref so the analyse useEffect skips until next mount.
      setAnalysisRunning(false);
      try{if(analysisWorkerRef.current){analysisWorkerRef.current.terminate();analysisWorkerRef.current=null;}}catch(_){}
    };
  }catch(e){}
  return()=>{clearTimeout(analysisThrottleRef.current);if(analysisWorkerRef.current){analysisWorkerRef.current.terminate();analysisWorkerRef.current=null;}};
},[]);

// Re-run analysis whenever pattern or progress changes (debounced 500ms)
useEffect(()=>{
  if(!pat||!sW||!sH||!analysisWorkerRef.current)return;
  clearTimeout(analysisThrottleRef.current);
  analysisThrottleRef.current=setTimeout(()=>{
    const w=analysisWorkerRef.current;
    if(!w)return;
    const reqId=++analysisRequestIdRef.current;
    setAnalysisRunning(true);
    // Send the pattern only when it (or the worker) has changed since the last
    // post. Transferring the buffer makes the post itself free.
    const pr=analysisPatternRef.current;
    if(pr.pat!==pat||pr.worker!==w||pr.sW!==sW||pr.sH!==sH){
      const enc=encodeAnalysisPattern(pat);
      const id=pr.id+1;
      analysisPatternRef.current={pat,worker:w,id,sW,sH};
      w.postMessage({type:"setPattern",patternId:id,codes:enc.codes,ids:enc.ids,sW,sH},[enc.codes.buffer]);
    }
    // PERF: postMessage's structured clone copies a Uint8Array with a single
    // memcpy; Array.from(done) instead boxed every byte into a JS number and
    // built a full-size plain Array — much more expensive for large patterns,
    // for no benefit since the worker immediately does `new Uint8Array(done)`
    // on the other side regardless of which one it receives.
    analysisPostedDoneRef.current=done||null;
    w.postMessage({type:"analyse",patternId:analysisPatternRef.current.id,done:done||null,sW,sH,requestId:reqId,blockSize:blockW});
  },500);
  return()=>clearTimeout(analysisThrottleRef.current);
},[pat,done,sW,sH,blockW]);

// Derived recommendations from analysis result
const recommendations=useMemo(()=>{
  if(!analysisResult||!pat)return null;
  const pr=analysisResult.perRegion;
  if(!pr)return null;
  // Regions are Spotlight sections (the worker's blockSize is blockW): in a
  // work area, recommend only the ones inside it.
  const _recCols=analysisResult.regionCols||1;
  const _recSize=analysisResult.regionSize||blockW;
  const _recArea=(areaOn&&window.WorkArea)?window.WorkArea.sectionRange(workArea,_recSize,_recSize):null;
  const scored=[];
  for(let i=0;i<pr.length;i++){
    const reg=pr[i];
    if(!reg||reg.totalStitches===0||reg.completionPercentage>=1)continue;
    if(_recArea){const rc=i%_recCols,rr=Math.floor(i/_recCols);if(rc<_recArea.bx0||rc>=_recArea.bx1||rr<_recArea.by0||rr>=_recArea.by1)continue;}
    if(!recDismissed.has(i))scored.push({idx:i,reg,score:reg.impactScore||0});
  }
  scored.sort((a,b)=>b.score-a.score);
  const pc=analysisResult.perColour;
  const quickWins=pc?Object.values(pc).filter(c=>c.totalStitches>0&&c.completedStitches<c.totalStitches).map(c=>({...c,remaining:c.totalStitches-c.completedStitches})).sort((a,b)=>a.remaining-b.remaining).slice(0,3):[];
  return{top:scored.slice(0,3),quickWins};
},[analysisResult,pat,recDismissed,areaOn,workArea,blockW,blockH]);

// ── Focus block helper functions ──
function _isFocusBlockComplete(bx,by){
  if(!pat||!done)return false;
  const x0=bx*blockW,y0=by*blockH,x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
  for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){
    const idx=y*sW+x;const m=pat[idx];
    if(!m||m.id==="__skip__"||m.id==="__empty__")continue;
    if(done[idx])continue;
    if(parkMarkers.some(pm=>pm.x===x&&pm.y===y))continue;
    return false;
  }}return true;
}
function _getBlockStitchCount(bx,by){
  if(!pat)return 0;
  const x0=bx*blockW,y0=by*blockH,x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
  let c=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const m=pat[y*sW+x];if(m&&m.id!=="__skip__"&&m.id!=="__empty__")c++;}return c;
}
// The sections Spotlight may visit, as a section-grid rectangle (exclusive
// ends): the whole grid, or only the sections of the active work area — the
// area is a group of sections, and Spotlight works through them in turn.
function _spotRange(){
  const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
  if(areaOn&&workArea&&window.WorkArea){
    const r=window.WorkArea.sectionRange(workArea,blockW,blockH);
    return{bx0:Math.max(0,r.bx0),by0:Math.max(0,r.by0),bx1:Math.min(bCols,r.bx1),by1:Math.min(bRows,r.by1)};
  }
  return{bx0:0,by0:0,bx1:bCols,by1:bRows};
}
function _inSpotRange(b){const r=_spotRange();return !!b&&b.bx>=r.bx0&&b.bx<r.bx1&&b.by>=r.by0&&b.by<r.by1;}
// With Spotlight on, a work area that does not contain the spotlit section
// moves Spotlight to the area's starting section.
useEffect(()=>{
  if(!areaOn||!focusEnabled||stitchingStyle==="crosscountry"||!sW||!sH)return;
  if(focusBlock&&_inSpotRange(focusBlock))return;
  setFocusBlock(_getStartBlock());
},[areaOn,workArea,focusEnabled,stitchingStyle,blockW,blockH,sW,sH]);
function _getStartBlock(){
  if(!sW||!sH)return{bx:0,by:0};
  const r=_spotRange();
  if(startCorner==="TR")return{bx:r.bx1-1,by:r.by0};
  if(startCorner==="BL")return{bx:r.bx0,by:r.by1-1};
  if(startCorner==="BR")return{bx:r.bx1-1,by:r.by1-1};
  if(startCorner==="C")return{bx:Math.floor((r.bx0+r.bx1-1)/2),by:Math.floor((r.by0+r.by1-1)/2)};
  return{bx:r.bx0,by:r.by0};
}
function _getRoyalRowsNext(bx,by){
  if(!sW||!sH)return null;
  const r=_spotRange();
  if(bx+1<r.bx1)return{bx:bx+1,by};
  if(by+1<r.by1)return{bx:r.bx0,by:by+1};
  return null;
}
// Move the spotlight focus block by one block in (dx,dy). No-op when spotlight
// is disabled or stitching style is cross-country (which has no concept of
// spatial blocks). If no focus block is set yet, falls back to the start block.
function _stepFocusBlock(dx,dy){
  if(!focusEnabled||stitchingStyle==="crosscountry"||!sW||!sH)return;
  const r=_spotRange();
  const cur=focusBlock||_getStartBlock();
  const bx=Math.max(r.bx0,Math.min(r.bx1-1,cur.bx+dx));
  const by=Math.max(r.by0,Math.min(r.by1-1,cur.by+dy));
  if(bx===cur.bx&&by===cur.by&&focusBlock)return;
  setFocusBlock({bx,by});
}
// Compute the next sequential focus block without requiring the current block
// to be complete. Used by the "Next section" button.
// Returns {bx,by} for the next block, or null if already at the last block.
function _computeNextFocusBlock(){
  if(!focusBlock||stitchingStyle==="crosscountry")return null;
  if(stitchingStyle==="royal")return _getRoyalRowsNext(focusBlock.bx,focusBlock.by);
  if(recommendations&&recommendations.top&&recommendations.top.length>0&&analysisResult){
    const RC=analysisResult.regionCols||1;
    const top=recommendations.top.find(r=>{const rC=r.idx%RC,rR=Math.floor(r.idx/RC);return!(rC===focusBlock.bx&&rR===focusBlock.by);});
    if(top){const rC=top.idx%RC,rR=Math.floor(top.idx/RC);return{bx:rC,by:rR};}
  }
  return _getRoyalRowsNext(focusBlock.bx,focusBlock.by);
}

// ── Block auto-advance effect ──
useEffect(()=>{
  if(!focusBlock||!focusEnabled||!pat||!done||stitchingStyle==="crosscountry")return;
  const complete=_isFocusBlockComplete(focusBlock.bx,focusBlock.by);
  if(!prevFocusBlockDoneRef.current&&complete){
    if(blockAdvanceTimerRef.current)clearTimeout(blockAdvanceTimerRef.current);
    blockAdvanceTimerRef.current=setTimeout(()=>{
      const stitches=_getBlockStitchCount(focusBlock.bx,focusBlock.by);
      const curSessIdx=statsSessions?statsSessions.length:0;
      const seqN=breadcrumbs.filter(b=>b.sessionIdx===curSessIdx).length+1;
      // PERF (perf-8 #9): cap breadcrumb history to last 500 entries to prevent unbounded growth
      // over long projects with many focus blocks.
      setBreadcrumbs(prev=>{const next=[...prev,{sessionIdx:curSessIdx,bx:focusBlock.bx,by:focusBlock.by,seqN,completedAt:Date.now()}];return next.length>500?next.slice(-500):next;});
      let next=null;
      if(stitchingStyle==="royal"){
        next=_getRoyalRowsNext(focusBlock.bx,focusBlock.by);
      }else if(recommendations&&recommendations.top.length>0&&analysisResult){
        const RS=analysisResult.regionSize||blockW;const RC=analysisResult.regionCols||1;
        const top=recommendations.top.find(r=>{const rC=r.idx%RC,rR=Math.floor(r.idx/RC);return!(rC===focusBlock.bx&&rR===focusBlock.by);});
        if(top){const rC=top.idx%RC,rR=Math.floor(top.idx/RC);next={bx:rC,by:rR};}
      }
      prevFocusBlockDoneRef.current=true;
      setBlockAdvanceToast({bx:focusBlock.bx,by:focusBlock.by,label:`Block ${focusBlock.by+1},${focusBlock.bx+1}`,stitches,next});
      setTimeout(()=>{
        setBlockAdvanceToast(null);
        if(next)setFocusBlock(next);
      },1500);
    },500);
  }else if(!complete){
    prevFocusBlockDoneRef.current=false;
    if(blockAdvanceTimerRef.current){clearTimeout(blockAdvanceTimerRef.current);blockAdvanceTimerRef.current=null;}
  }
  return()=>{if(blockAdvanceTimerRef.current)clearTimeout(blockAdvanceTimerRef.current);};
},[countsVer,focusBlock,focusEnabled,pat,done,parkMarkers,stitchingStyle,blockW,blockH,sW,sH,recommendations,analysisResult,statsSessions,breadcrumbs]);

// Thread usage summary stats derived from analysis
const threadUsageSummary=useMemo(()=>{
  if(!analysisResult||!analysisResult.perStitch)return null;
  const ps=analysisResult.perStitch;
  let isolated=0,small=0,medium=0,large=0;
  for(let i=0;i<ps.clusterSize.length;i++){
    if(!pat||!pat[i])continue;
    const id=pat[i].id;
    if(id==="__skip__"||id==="__empty__")continue;
    const sz=ps.clusterSize[i];
    if(sz===1)isolated++;
    else if(sz<=4)small++;
    else if(sz<=19)medium++;
    else large++;
  }
  const total=isolated+small+medium+large;
  const pc=analysisResult.perColour;
  let mostScattered=null,mostClustered=null;
  if(pc){
    const cols=Object.values(pc).filter(c=>c.totalStitches>0);
    if(cols.length){
      mostScattered=cols.reduce((best,c)=>c.confettiCount>best.confettiCount?c:best,cols[0]);
      mostClustered=cols.reduce((best,c)=>c.largestClusterSize>best.largestClusterSize?c:best,cols[0]);
    }
  }
  // Estimated thread changes ≈ isolated + small cluster count (each cluster needs thread up+rethread)
  const estChanges=isolated+(analysisResult.perColour?Object.values(analysisResult.perColour).reduce((s,c)=>s+c.clusterCount,0):0);
  return{isolated,small,medium,large,total,estChanges,mostScattered,mostClustered};
},[analysisResult,pat]);

statsSessionsLiveRef.current=statsSessionsRef.current;
// Session journal: edit, delete, merge. The pure work is in helpers.js; here the result is applied once (one state
// change, one save) with Undo restoring the previous list and tombstones.
function applySessionHistoryChange(result,message){
  if(!result||result.error)return result||{error:'Nothing changed.'};
  const prevSessions=statsSessions,prevDeleted=deletedSessionIdsRef.current;
  const flush=function(){setTimeout(function(){if(typeof window.__flushProjectToIDB==='function'){var pr=window.__flushProjectToIDB();if(pr&&typeof pr.catch==='function')pr.catch(function(){});}},0);};
  const removed=result.removedIds||[];
  deletedSessionIdsRef.current=removed.length?prevDeleted.concat(removed.filter(function(x){return prevDeleted.indexOf(x)<0;})):prevDeleted;
  const pid=projectIdRef.current,produced=result.sessions;
  setStatsSessions(result.sessions);flush();
  try{window.Toast&&window.Toast.show&&window.Toast.show({message:message,type:'success',duration:9000,undoAction:function(){
    // Only while the journal is still exactly what this change produced, in the same project: a session that finished
    // since, a note, another tab's changes or another project would otherwise be overwritten by the old list.
    if(projectIdRef.current!==pid||statsSessionsLiveRef.current!==produced){try{window.Toast.show({message:'That change cannot be undone now: the journal has changed since.',type:'warning',duration:5000});}catch(_){}return false;}
    deletedSessionIdsRef.current=prevDeleted;setStatsSessions(prevSessions);flush();}});}catch(_){}
  return {ok:true};
}
function editSessionDetails(id,patch){return applySessionHistoryChange(editSessionRecord(statsSessions,id,patch,combinedTotal),'Session changed');}
function deleteSessionById(id){
  const n=sessionRunIds(statsSessions,id).length;
  return applySessionHistoryChange(deleteSessionRun(statsSessions,id,combinedTotal),n>1?'Session deleted (it spanned '+n+' days)':'Session deleted');
}
function mergeSessionWithNext(id){return applySessionHistoryChange(mergeSessionRecords(statsSessions,id,combinedTotal),'Sessions merged');}
// Styled confirmation, never window.confirm. Resolves true to go ahead; if the dialog is unavailable it resolves false, so a
// destructive step never runs unasked.
function askConfirm(opts){
  if(window.ConfirmDialog&&window.ConfirmDialog.show)return window.ConfirmDialog.show(opts);
  return Promise.resolve(false);
}
// An Undo toast for one history step. The step is bound to the toast: the message goes as soon as that step is no longer the
// newest (see the trackHistory effect), and its button reverses exactly that step, the same as the Undo button.
function offerStepUndo(entry,message,undoLabel,staleMessage){
  if(!entry||!window.Toast||!window.Toast.show)return;
  if(bulkUndoToastRef.current&&window.Toast.dismiss){try{window.Toast.dismiss(bulkUndoToastRef.current);}catch(_){}}
  bulkToastEntryRef.current=entry;
  bulkUndoToastRef.current=window.Toast.show({
    message:message,type:'info',duration:8000,undoLabel:undoLabel||'Undo',
    undoAction:function(){
      const h=trackHistoryRef.current;
      if(h[h.length-1]!==entry){
        window.Toast.show({message:staleMessage||"That can no longer be undone on its own. Use Undo to step back.",type:'warning',duration:4000});
        return false;
      }
      if(bulkUndoRef.current)bulkUndoRef.current();
    }
  });
}
// In a work area "all" means all of this colour inside the area.
function colourAreaFilter(){const a=areaOn?workArea:null;return a?(i=>window.WorkArea.containsIndex(a,i,sW)):null;}
// One history step, however many stitches it covers, so Undo (or the toast's button) reverses the whole colour at once.
function markColourDone(cid,md,asCatchUp){const cur=doneRef.current;if(!pat||!cur)return;
  const changes=colourDoneChanges(pat,cur,cid,md,colourAreaFilter());
  const nd=new Uint8Array(cur);for(let k=0;k<changes.length;k++)nd[changes[k].idx]=md?1:0;
  if(changes.length>0){
    const n=changes.length,count=n===1?"1 stitch":n.toLocaleString('en-GB')+" stitches",name=colourDoneName(cmap&&cmap[cid]||{id:cid});
    offerStepUndo(changes,count+" of "+name+(md?" marked as done":" marked as not done"),"Undo "+count);   // `changes` is the history step
    pushTrackHistory(changes,md&&asCatchUp);applyDoneCountsDelta(changes,pat,nd);paintDoneChanges(changes,nd);skipNextFullRedrawRef.current=nd;}
  doneRef.current=nd;setDone(nd);}
// The chip on a colour row: always ask first, with the colour and the exact number of stitches, then go through the usual
// catch-up or today question (requestMarkColourDone) when marking.
function confirmAndMarkColour(p,md){
  if(!pat||!doneRef.current)return;
  const name=colourDoneName(p);
  const n=colourDoneChanges(pat,doneRef.current,p.id,md,colourAreaFilter()).length;
  if(n===0){
    // Only full stitches are changed here; half stitches, knots and backstitch are marked on the chart (or by their own chip).
    if(window.Toast&&window.Toast.show)window.Toast.show({message:(md?"Every full stitch of ":"No full stitch of ")+name+(areaOn?" in this work area":"")+(md?" is already marked done.":" is marked done."),type:'info',duration:4000});
    return;
  }
  const t=colourDoneConfirmText(name,n,md,areaOn);
  askConfirm({title:t.title,message:t.message,confirmLabel:t.confirmLabel,danger:!md}).then(ok=>{if(ok)requestMarkColourDone(p.id,md);});
}
// Whole-colour Done: unmarking goes straight through; marking uses the remembered choice, or asks once.
function requestMarkColourDone(cid,md){
  if(!md){markColourDone(cid,false);return;}
  let pref='ask';try{pref=(window.UserPrefs&&window.UserPrefs.get('trackerMarkAllAs'))||'ask';}catch(_){}
  if(pref==='catchup'||pref==='today'){markColourDone(cid,true,pref==='catchup');return;}
  setMarkAllAsk({cid});
}
function answerMarkAllAsk(asCatchUp){
  const a=markAllAsk;setMarkAllAsk(null);if(!a)return;
  try{if(window.UserPrefs)window.UserPrefs.set('trackerMarkAllAs',asCatchUp?'catchup':'today');}catch(_){}
  // The same question covers a rectangle fill (a.set) and a whole-colour Done (a.cid).
  if(a.set)_commitBulk(a.set,a.intent,a.source,asCatchUp);else markColourDone(a.cid,true,asCatchUp);
}
// History entry shapes:
//   • Legacy: bare array of {idx,oldVal} — single-cell or per-pixel drag.
//   • B2 BULK_TOGGLE: {type:"BULK_TOGGLE", source:"drag"|"range", changes:[...]}
//     One undo step covering the whole drag-mark or range-select gesture.
// _historyChanges normalises both shapes for the undo/redo pipeline.
function _historyChanges(entry){
  return (entry && entry.type === "BULK_TOGGLE") ? entry.changes : entry;
}
function recordFullHistoryActivity(entry,changes,asCatchUp){
  let completed=0,undone=0;
  for(const c of changes){if(c.oldVal)undone++;else completed++;}
  entry.activity=recordAutoActivity(completed,undone,completed,undone,asCatchUp?completed:0);
}
function pushTrackHistory(changes,asCatchUp){
  if(!changes||!changes.length)return;
  // Track colours for auto-session
  if(pat){for(let i=0;i<changes.length;i++){const id=pat[changes[i].idx]&&pat[changes[i].idx].id;if(id&&id!=='__skip__'&&id!=='__empty__')pendingColoursRef.current.add(id);}}
  recordFullHistoryActivity(changes,changes,asCatchUp);
  setTrackHistory(prev=>{let n=[...prev,changes];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
// B2: push a single tagged BULK_TOGGLE entry from useDragMark commits.
function pushBulkToggleHistory(changes, source, asCatchUp){
  if(!changes||!changes.length)return;
  if(pat){for(let i=0;i<changes.length;i++){const id=pat[changes[i].idx]&&pat[changes[i].idx].id;if(id&&id!=='__skip__'&&id!=='__empty__')pendingColoursRef.current.add(id);}}
  const entry={type:"BULK_TOGGLE",source:source||"drag",changes:changes};
  recordFullHistoryActivity(entry,changes,asCatchUp);
  lastBulkEntryRef.current=entry;   // the Undo N stitches message is bound to exactly this step
  setTrackHistory(prev=>{let n=[...prev,entry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
// A French knot marked or unmarked: {type:"KNOT", key:"x,y"}. Undo and redo
// both flip it back.
function flipKnotDone(key){
  setKnotsDone(prev=>prev.indexOf(key)===-1?prev.concat([key]):prev.filter(x=>x!==key));
}
// A quarter stitch marked or unmarked: {type:"QUARTER", idx, pos}. Undo and redo both flip it back.
function flipSpecialtyDone(uid){
  const next=specialtyDoneRef.current.includes(uid)?specialtyDoneRef.current.filter(x=>x!==uid):specialtyDoneRef.current.concat(uid);
  specialtyDoneRef.current=next;setSpecialtyDone(next);
}
function specialtyAvailable(o){
  if(layerVis[o.type]===false||(isColourLocked()&&o.thread.id!==focusColour))return false;
  if(!areaOn)return true;
  return ProgressUnits.specialty.segments(o).every(a=>[[a[0],a[1]],[a[2],a[3]]].every(pt=>window.WorkArea.contains(workArea,Math.min(sW-1,Math.floor(pt[0])),Math.min(sH-1,Math.floor(pt[1])))));
}
function toggleSpecialtyDone(uid){
  const o=specialtyStitches.find(x=>x.uid===uid);
  if(!o||!_dragMarkActive||!specialtyAvailable(o))return;
  const old=specialtyDoneRef.current.includes(uid),units=ProgressUnits.WEIGHTS[o.type];
  flipSpecialtyDone(uid);pendingColoursRef.current.add(o.thread.id);
  const entry={type:'SPECIALTY',uid};entry.activity=recordAutoActivity(old?0:1,old?1:0,old?0:units,old?units:0);
  setTrackHistory(prev=>prev.concat(entry).slice(-TRACK_HISTORY_MAX));setRedoStack([]);
}
function flipQuarterDone(idx,pos){
  setPartialDone(prev=>window.Fractional?window.Fractional.toggle(prev,idx,pos):prev);
}
function undoTrack(){
  if(!trackHistoryRef.current.length||!doneRef.current)return;
  let lastEntry=trackHistoryRef.current[trackHistoryRef.current.length-1];
  correctHistoryActivity(lastEntry.activity,false);
  if(lastEntry&&lastEntry.type==="UNPICK"){
    // Putting an unpicked area back is not stitching: it comes off the session's unpicked figure, and adds nothing.
    applyUnpickPlan(lastEntry.plan,true);
    setTrackHistory(prev=>prev.slice(0,-1));
    setRedoStack(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="BS"){
    setBsKeysDone(lastEntry.keys,!lastEntry.on);
    setTrackHistory(prev=>prev.slice(0,-1));
    setRedoStack(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="HALF"){
    setHalfHistoryState(lastEntry.idx,lastEntry.dir,lastEntry.oldVal);
    setTrackHistory(prev=>prev.slice(0,-1));
    setRedoStack(prev=>[...prev,{...lastEntry,oldVal:lastEntry.oldVal?0:1}].slice(-TRACK_HISTORY_MAX));
    return;
  }
  if(lastEntry&&lastEntry.type==="SPECIALTY"){
    flipSpecialtyDone(lastEntry.uid);
    setTrackHistory(prev=>prev.slice(0,-1));setRedoStack(prev=>prev.concat(lastEntry).slice(-TRACK_HISTORY_MAX));return;
  }
  if(lastEntry&&lastEntry.type==="QUARTER"){
    flipQuarterDone(lastEntry.idx,lastEntry.pos);
    setTrackHistory(prev=>prev.slice(0,-1));
    setRedoStack(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="BEAD"){
    flipBeadDone(lastEntry.key);
    setTrackHistory(prev=>prev.slice(0,-1));
    setRedoStack(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="KNOT"){
    flipKnotDone(lastEntry.key);
    setTrackHistory(prev=>prev.slice(0,-1));
    setRedoStack(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="PARK"){
    applyParkEntry(lastEntry,false);
    setTrackHistory(prev=>prev.slice(0,-1));
    setRedoStack(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  let last=_historyChanges(lastEntry);
  let nd=new Uint8Array(doneRef.current);
  let redoChanges=last.map(c=>({idx:c.idx,oldVal:nd[c.idx]}));
  for(let c of last)nd[c.idx]=c.oldVal;
  applyDoneCountsDelta(redoChanges,pat,nd);
  paintDoneChanges(last,nd);
  skipNextFullRedrawRef.current=nd;
  doneRef.current=nd;setDone(nd);
  setTrackHistory(prev=>prev.slice(0,-1));
  let redoEntry=(lastEntry&&lastEntry.type==="BULK_TOGGLE")
    ?{type:"BULK_TOGGLE",source:lastEntry.source,changes:redoChanges}
    :redoChanges;
  redoEntry.activity=lastEntry.activity;
  setRedoStack(prev=>{let n=[...prev,redoEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
}
function redoTrack(){
  if(!redoStackRef.current.length||!doneRef.current)return;
  let lastEntry=redoStackRef.current[redoStackRef.current.length-1];
  correctHistoryActivity(lastEntry.activity,true);
  if(lastEntry&&lastEntry.type==="UNPICK"){
    applyUnpickPlan(lastEntry.plan,false);
    setRedoStack(prev=>prev.slice(0,-1));
    setTrackHistory(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="BS"){
    setBsKeysDone(lastEntry.keys,lastEntry.on);
    setRedoStack(prev=>prev.slice(0,-1));
    setTrackHistory(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="HALF"){
    setHalfHistoryState(lastEntry.idx,lastEntry.dir,lastEntry.oldVal);
    setRedoStack(prev=>prev.slice(0,-1));
    setTrackHistory(prev=>[...prev,{...lastEntry,oldVal:lastEntry.oldVal?0:1}].slice(-TRACK_HISTORY_MAX));
    return;
  }
  if(lastEntry&&lastEntry.type==="SPECIALTY"){
    flipSpecialtyDone(lastEntry.uid);
    setRedoStack(prev=>prev.slice(0,-1));setTrackHistory(prev=>prev.concat(lastEntry).slice(-TRACK_HISTORY_MAX));return;
  }
  if(lastEntry&&lastEntry.type==="QUARTER"){
    flipQuarterDone(lastEntry.idx,lastEntry.pos);
    setRedoStack(prev=>prev.slice(0,-1));
    setTrackHistory(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="BEAD"){
    flipBeadDone(lastEntry.key);
    setRedoStack(prev=>prev.slice(0,-1));
    setTrackHistory(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="KNOT"){
    flipKnotDone(lastEntry.key);
    setRedoStack(prev=>prev.slice(0,-1));
    setTrackHistory(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  if(lastEntry&&lastEntry.type==="PARK"){
    applyParkEntry(lastEntry,true);
    setRedoStack(prev=>prev.slice(0,-1));
    setTrackHistory(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  let last=_historyChanges(lastEntry);
  let nd=new Uint8Array(doneRef.current);
  let undoChanges=last.map(c=>({idx:c.idx,oldVal:nd[c.idx]}));
  for(let c of last)nd[c.idx]=c.oldVal;
  applyDoneCountsDelta(undoChanges,pat,nd);
  paintDoneChanges(last,nd);
  skipNextFullRedrawRef.current=nd;
  doneRef.current=nd;setDone(nd);
  setRedoStack(prev=>prev.slice(0,-1));
  let undoEntry=(lastEntry&&lastEntry.type==="BULK_TOGGLE")
    ?{type:"BULK_TOGGLE",source:lastEntry.source,changes:undoChanges}
    :undoChanges;
  undoEntry.activity=lastEntry.activity;
  setTrackHistory(prev=>{let n=[...prev,undoEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
}

// --- V2 Edit functions ---

// Change a single cell's symbol. Updates the sparse diff and pat, preserves symbols in pal.
function handleSingleStitchEdit(cellIdx, newId) {
  if (!pat || !pal || !cmap) return;
  const cell = pat[cellIdx];
  if (cell.id === newId) return; // no-op: tapped the symbol the cell already has
  const newEntry = cmap[newId];
  if (!newEntry) return;

  const existingEditEntry = singleStitchEdits.get(cellIdx) || null;
  setUndoSnapshot({ type:"single_stitch_edit", cellIdx, previousCell:{...cell}, previousEditEntry:existingEditEntry });

  // Update sparse diff — originalId is always the first-ever pre-edit value
  const originalId = existingEditEntry ? existingEditEntry.originalId : cell.id;
  const newEdits = new Map(singleStitchEdits);
  if (newId === originalId) {
    newEdits.delete(cellIdx); // back to original — no diff needed
  } else {
    newEdits.set(cellIdx, { originalId, currentId: newId });
  }
  setSingleStitchEdits(newEdits);

  const newPat = [...pat];
  newPat[cellIdx] = { ...cell, id:newId, name:newEntry.name, rgb:newEntry.rgb, lab:newEntry.lab };
  const newPal = rebuildPaletteCounts(newPat, pal);
  const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
  setPat(newPat); setPal(newPal); setCmap(newCmap);
  setCellEditPopover(null);
}

// Remove a single stitch (marks cell as __empty__). Clears done state for that cell.
function handleStitchRemoval(cellIdx) {
  if (!pat || !done) return;
  const cell = pat[cellIdx];
  if (cell.id === "__skip__" || cell.id === "__empty__") return;
  const existingEditEntry = singleStitchEdits.get(cellIdx) || null;
  const previousDone = done[cellIdx];

  setUndoSnapshot({ type:"removal", cellIdx, previousCell:{...cell}, previousEditEntry:existingEditEntry, previousDone });

  const originalId = existingEditEntry ? existingEditEntry.originalId : cell.id;
  const newEdits = new Map(singleStitchEdits);
  newEdits.set(cellIdx, { originalId, currentId: null });
  setSingleStitchEdits(newEdits);

  const newPat = [...pat];
  newPat[cellIdx] = { id:"__empty__", type:"skip", rgb:[255,255,255], lab:[100,0,0] };
  if (previousDone) { const nd=new Uint8Array(doneRef.current||done); nd[cellIdx]=0; applyDoneCountsDelta([{idx:cellIdx,oldVal:1}],pat,nd); setDone(nd); }
  const newPal = rebuildPaletteCounts(newPat, pal);
  const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
  setPat(newPat); setPal(newPal); setCmap(newCmap);
  setCellEditPopover(null);
}

// Swap the thread assignments of two palette entries. Each symbol keeps its visual character;
// only the underlying thread (id/rgb/name) swaps. O(n) cell scan required since cell.id = threadCode.
function handleSymbolSwap(palEntryA, palEntryB) {
  if (!pat || !pal) return;
  if (palEntryA.id === palEntryB.id) return; // no-op
  setUndoSnapshot({ type:"swap", entryA:{...palEntryA}, entryB:{...palEntryB} });
  _applySwap(palEntryA, palEntryB);
}

// Internal swap — does not touch undoSnapshot. Used by both handleSymbolSwap and applyUndo.
function _applySwap(palEntryA, palEntryB) {
  const newPat = pat.map(cell => {
    if (cell.id === palEntryA.id) return { ...cell, id:palEntryB.id, name:palEntryB.name, rgb:palEntryB.rgb, lab:palEntryB.lab };
    if (cell.id === palEntryB.id) return { ...cell, id:palEntryA.id, name:palEntryA.name, rgb:palEntryA.rgb, lab:palEntryA.lab };
    return cell;
  });
  const newPal = pal.map(p => {
    if (p.id === palEntryA.id) return { ...p, id:palEntryB.id, name:palEntryB.name, rgb:palEntryB.rgb, lab:palEntryB.lab };
    if (p.id === palEntryB.id) return { ...p, id:palEntryA.id, name:palEntryA.name, rgb:palEntryA.rgb, lab:palEntryA.lab };
    return p;
  });
  const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
  // Transfer thread ownership
  const newOwned = { ...threadOwned };
  const ownA = threadOwned[palEntryA.id], ownB = threadOwned[palEntryB.id];
  delete newOwned[palEntryA.id]; delete newOwned[palEntryB.id];
  if (ownA !== undefined) newOwned[palEntryB.id] = ownA;
  if (ownB !== undefined) newOwned[palEntryA.id] = ownB;
  setPat(newPat); setPal(newPal); setCmap(newCmap); setThreadOwned(newOwned);
}

// Single-level undo for edit operations (bulk reassign, single-stitch edit, removal, swap).
function applyUndo() {
  if (!undoSnapshot) return;
  const snap = undoSnapshot;
  setUndoSnapshot(null);

  if (snap.type === "bulk_reassignment") {
    const { pal:prevPal, threadOwned:prevOwned, oldId, newId } = snap;
    const oldEntry = prevPal.find(p => p.id === oldId);
    const newPat = pat.map(cell => {
      if (cell.id !== newId) return cell;
      return { ...cell, id:oldId, name:oldEntry?.name||cell.name, rgb:oldEntry?.rgb||cell.rgb, lab:oldEntry?.lab||cell.lab };
    });
    const newCmap = {}; prevPal.forEach(p => { newCmap[p.id] = p; });
    setPat(newPat); setPal(prevPal); setCmap(newCmap); setThreadOwned(prevOwned);
  }
  else if (snap.type === "single_stitch_edit") {
    const { cellIdx, previousCell, previousEditEntry } = snap;
    const newPat = [...pat];
    newPat[cellIdx] = previousCell;
    const newEdits = new Map(singleStitchEdits);
    if (previousEditEntry === null) newEdits.delete(cellIdx);
    else newEdits.set(cellIdx, previousEditEntry);
    setSingleStitchEdits(newEdits);
    const newPal = rebuildPaletteCounts(newPat, pal);
    const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
    setPat(newPat); setPal(newPal); setCmap(newCmap);
  }
  else if (snap.type === "removal") {
    const { cellIdx, previousCell, previousEditEntry, previousDone } = snap;
    const newPat = [...pat];
    newPat[cellIdx] = previousCell;
    const newEdits = new Map(singleStitchEdits);
    if (previousEditEntry === null) newEdits.delete(cellIdx);
    else newEdits.set(cellIdx, previousEditEntry);
    setSingleStitchEdits(newEdits);
    if (previousDone) { const nd=new Uint8Array(doneRef.current||done); nd[cellIdx]=1; applyDoneCountsDelta([{idx:cellIdx,oldVal:0}],pat,nd); setDone(nd); }
    const newPal = rebuildPaletteCounts(newPat, pal);
    const newCmap = {}; newPal.forEach(p => { newCmap[p.id] = p; });
    setPat(newPat); setPal(newPal); setCmap(newCmap);
  }
  else if (snap.type === "swap") {
    // A swap is self-inverse: apply the same swap using the current (post-swap) entries
    const curA = pal.find(p => p.id === snap.entryA.id);
    const curB = pal.find(p => p.id === snap.entryB.id);
    if (curA && curB) _applySwap(curA, curB);
  }
}

function handleRevertToOriginal(){
  askConfirm({title:"Revert to the original import?",message:"Revert all symbol assignments to the original PDF import? Your tracking progress will be kept, but all colour corrections will be lost.",confirmLabel:"Revert",danger:true}).then(ok=>{if(ok)revertToOriginal();});
}
function revertToOriginal(){
  const previousPal=originalPaletteState;
  const previousMap={};
  previousPal.forEach(p=>{previousMap[p.symbol]=p;});
  const newPat=pat.map(cell=>{
    if(cell.id==="__skip__")return cell;
    const currentEntry=cmap[cell.id];
    const originalThread=currentEntry?previousMap[currentEntry.symbol]:null;
    if(originalThread){return{...cell,id:originalThread.id,name:originalThread.name,rgb:originalThread.rgb,lab:originalThread.lab};}
    return cell;
  });
  const newCmap={};
  previousPal.forEach(p=>{newCmap[p.id]=p;});
  const newThreadOwned={...threadOwned};
  Object.keys(newThreadOwned).forEach(threadId=>{if(!previousPal.find(p=>p.id===threadId))delete newThreadOwned[threadId];});
  let revertedPat=newPat;
  if(singleStitchEdits.size>0){
    revertedPat=[...newPat];
    singleStitchEdits.forEach((entry,cellIdx)=>{
      const originalCell=revertedPat[cellIdx];
      const origEntry=previousPal.find(p=>p.id===entry.originalId);
      if(origEntry){revertedPat[cellIdx]={...originalCell,id:origEntry.id,name:origEntry.name,rgb:origEntry.rgb,lab:origEntry.lab};}
      else{revertedPat[cellIdx]={...originalCell,id:entry.originalId};}
    });
  }
  setPat(revertedPat);setPal(previousPal);setCmap(newCmap);setThreadOwned(newThreadOwned);setSingleStitchEdits(new Map());setUndoSnapshot(null);
}

async function doSaveProject(finalName){
  if(!pat||!pal)return;
  // Serialise singleStitchEdits Map as array of [cellIdx, {originalId, currentId}] pairs
  const sseArr = [...singleStitchEdits.entries()];
  // Serialise half stitch data as arrays of [cellIdx, {fwd?, bck?}] pairs
  const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
    fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb, brand: cellBrandForSave(hs.fwd, threadBrand) } : undefined,
    bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb, brand: cellBrandForSave(hs.bck, threadBrand) } : undefined
  }]);
  const hdArr = [...halfDoneRef.current.entries()];
  const psArr = partialsForSave(partialStitches, threadBrand);
  let project={
    version:11,
    chartRevision:v3FieldsRef.current.chartRevision,chartAccountingUnits:v3FieldsRef.current.chartAccountingUnits,meta:v3FieldsRef.current.meta,
    id:projectIdRef.current||undefined,
    page:"tracker",
    name:finalName,
    namePromptShown:namePromptShownRef.current||undefined,
    nameAutoGenerated:nameAutoGeneratedRef.current||undefined,
    symbols:symbolsRef.current||undefined,
    createdAt:createdAtRef.current||new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    settings:{sW,sH,fabricCt,skeinPrice,stitchSpeed,wastePrefs,fabricColour:projectFabricColour||undefined,threadBrand:threadBrandForSave(threadBrand)},
    // PERF (deferred-1): rgb-stripping serializer; see helpers.js / serializePattern.
    pattern:(window.PatternIO?window.PatternIO.serializePattern(pat,threadBrand):pat.map(m=>(m.id==="__skip__"||m.id==="__empty__")?{id:m.id}:{id:m.id,type:m.type,rgb:m.rgb})),
    bsLines,
    done:doneRef.current?Array.from(doneRef.current):null,
    parkMarkers,
    hlRow,
    hlCol,
    threadOwned,
    originalPaletteState,
    singleStitchEdits: sseArr,
    halfStitches: hsArr,
    halfDone: hdArr,
    specialtyVersion:1, specialtyStitches, specialtyDone:specialtyDoneRef.current,
    partialStitches: psArr,
    knots: knotsForSave(knots, threadBrand),
    knotsDone: knotsDoneRef.current.slice(),
    bsDone: window.Backstitch?(window.Backstitch.forSave(Array.from(bsDoneSetRef.current))||[]):[],
    partialDone: window.Fractional?(window.Fractional.forSave(partialDoneRef.current)||[]):[],
    beads: beadsRef.current, beadsDone: beadsDoneRef.current.slice(),
    notes: projectNotes||undefined,
    statsSessions:statsSessionsRef.current,
    deletedSessionIds:deletedSessionIdsRef.current.length?deletedSessionIdsRef.current.slice():undefined,
    statsSettings,
    achievedMilestones,
    doneSnapshots,
    deletedSnapshotIds:deletedSnapshotIdsRef.current.slice(),
    breadcrumbs,
    stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence, workArea,
    workingContext: workingContextForSave(focusColour, stitchMode, stitchView, highlightMode),
    savedZoom: stitchZoom,
    savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft + chartScrollOffset().x, top: stitchScrollRef.current.scrollTop + chartScrollOffset().y } : null
  };
  // Include removal history from the small progress overlay as well as full saves.
  if(window.__flushProjectToIDB)await window.__flushProjectToIDB();
  const savedBase=project.id?await ProjectStorage.get(project.id):null;
  project=TrackingSync.record(savedBase||mergeBaseRef.current,project);
  let blob=new Blob([JSON.stringify(project)],{type:"application/json"});
  let url=URL.createObjectURL(blob);
  let a=document.createElement("a");
  a.href=url;
  const safeName=(finalName||'cross-stitch-project').replace(/[^a-zA-Z0-9_\- ]/g,'').trim()||'cross-stitch-project';
  a.download=safeName+".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function saveProject(){
  if(!pat||!pal)return;
  if(!projectName){
    setNamePromptOpen(true);
    return;
  }
  doSaveProject(projectName);
}

function doExportOxs(){
  if(!pat||!sW||!sH)return;
  if(typeof generateOXS!=='function'){
    window.Toast&&Toast.show({message:'OXS export is not available.',type:'error'});
    return;
  }
  var result=generateOXS({w:sW,h:sH,threadBrand:threadBrand,pattern:pat,specialtyStitches:specialtyStitches,partialStitches:partialStitches,halfStitches:halfStitches,bsLines:bsLines||[],knots:knots,beads:beadsRef.current||[],name:projectName||'pattern'});
  if(result.warnings&&result.warnings.length>0){
    window.Toast&&Toast.show({message:result.warnings.join(' '),type:'warning',duration:6000});
  }
  var blob=new Blob([result.xml],{type:'application/xml'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download=((projectName||'pattern').replace(/[^\w\-]+/g,'_')||'pattern')+'.oxs';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},5000);
}

const reconcileRef=useRef(null);
// What a save result means when nothing was written and nothing went wrong: the page is
// reloading, the marks were merged into this tab instead, or a question is holding saves.
function noWriteReason(r){return r==='reloaded'||r==='merged'||r==='held';}

function resolveReconcile(choice){
  const rc=reconcileRef.current;
  if(!rc)return;
  if(choice==='home'){
    // Nothing was written: the project is exactly as it was.
    reconcileRef.current=null;setReconcile(null);
    if(typeof onGoHome==='function')onGoHome();else window.location.href='home.html';
    return;
  }
  let nd=new Uint8Array(pat.length),hd=new Map(),kept=0;
  const cand=choice.indexOf('keep:')===0?rc.candidates[Number(choice.slice(5))]:null;
  if(cand){
    nd=Uint8Array.from(cand.done);kept=cand.kept;
    // A half-stitch mark stays only if there is a half stitch on its new cell to attach to.
    const moved=window.TrackingMerge.remapHalfDone(rc.halfDone,cand.oldW,sW,sH),kept2=[];
    moved.forEach(([i,v])=>{
      const def=halfStitches&&halfStitches.get(i);
      if(!def)return;
      const m={};if(v.fwd&&def.fwd)m.fwd=v.fwd;if(v.bck&&def.bck)m.bck=v.bck;
      if(m.fwd||m.bck)kept2.push([i,m]);
    });
    hd=new Map(kept2);
    // Quarter marks move the same way, and stay only where a quarter stitch is on the new cell.
    if(window.Fractional&&rc.partialDone&&rc.partialDone.length){
      const moved=window.Fractional.remap(window.Fractional.toMap(rc.partialDone),cand.oldW,sW,sH,0,0);
      setPartialDone(window.Fractional.live(moved,partialStitches));
    }
  }
  // The earlier marks stay recoverable from Stats > Compare, whichever way this goes.
  try{
    const b=pako.deflate(Uint8Array.from(rc.oldDone));
    const C=0x8000;let o='';for(let i=0;i<b.length;i+=C)o+=String.fromCharCode.apply(null,b.subarray(i,i+C));
    const snap={id:'snap_'+Date.now(),date:new Date().toLocaleDateString('en-CA'),label:'Before pattern change',doneCount:rc.oldMarks,w:cand?cand.oldW:undefined,h:cand?cand.oldH:undefined,data:btoa(o)};
    setDoneSnapshots(prev=>{
      const updated=[...prev,snap];
      return[...updated.filter(s=>(s.label!=='auto'||s.kind==='manual')),...updated.filter(s=>(s.label==='auto'&&s.kind!=='manual')).slice(-60)];
    });
  }catch(e){console.warn('[stitchx/tracker] could not keep a snapshot of the earlier marks:',e);}
  justLoadedRef.current=true;
  doneRef.current=nd;
  recomputeAllCounts(pat,nd,halfStitches,hd);
  setDone(nd);setHalfDone(hd);
  if(!cand){setKnotsDone([]);setSpecialtyDone([]);}
  reconcileRef.current=null;savesBlockedRef.current=false;setReconcile(null);
  if(rc.recap)setResumeRecap({...rc.recap,doneSt:kept});
  window.Toast&&Toast.show({message:cand?('Kept '+kept.toLocaleString('en-GB')+' of '+rc.oldMarks.toLocaleString('en-GB')+' stitches'+(cand.lost?'; '+cand.lost.toLocaleString('en-GB')+' fell outside the new pattern.':'.')+' Your earlier marks are saved in Stats > Compare.'):('Progress started again. Your earlier '+rc.oldMarks.toLocaleString('en-GB')+' stitches are saved in Stats > Compare.'),type:'info',duration:8000});
}

function persistProjectRecord(project){
  if(savesBlockedRef.current)return Promise.resolve({ok:false,reason:'held'});
  // What was just written is what the next cross-tab merge starts from.
  const remember=function(res){if(res&&res.ok!==false&&res.reason!=='merged')mergeBaseRef.current=project;return res;};
  if(window.CrossTabResolution&&typeof window.CrossTabResolution.saveWithConflictResolution==='function'){
    return window.CrossTabResolution.saveWithConflictResolution(project).then(remember);
  }
  return ProjectStorage.save(project).then(function(id){ProjectStorage.setActiveProject(id);return remember({ok:true,id:id});});
}

// Another tab saved this project: fold its marks and sessions into this tab's instead of
// asking which tab to throw away. Resolves true when it did, false to leave the question
// to the user (the other tab changed more than marks, or anything here is unexpected).
async function mergeRemoteProject(info){
  const TM=window.TrackingMerge;
  const id=projectIdRef.current;
  const base=mergeBaseRef.current;
  if(!TM||!id||savesBlockedRef.current||!base||base.id!==id||(info&&info.projectId&&info.projectId!==id))return false;
  if(!Array.isArray(base.done))return false;
  const remote=await ProjectStorage.get(id);
  if(!remote||projectIdRef.current!==id||!Array.isArray(remote.done))return false;
  const local=snapshotNow();
  if(!local||!Array.isArray(local.done)||local.done.length!==base.done.length||remote.done.length!==base.done.length)return false;
  const why=TM.whyNot(base,local,remote);
  if(why){console.info('[stitchx/tracker] not merging the other tab\'s save:',why);return false;}
  const nd=Uint8Array.from(TM.mergeDone(base.done,local.done,remote.done));
  const mergedHalf=TM.mergeHalfDone(base.halfDone,local.halfDone,remote.halfDone);
  const mergedKnots=TM.mergeSet(base.knotsDone,local.knotsDone,remote.knotsDone);
  const mergedBs=TM.mergeSet(base.bsDone,local.bsDone,remote.bsDone);
  const mergedQuarters=TM.mergeQuarterDone(base.partialDone,local.partialDone,remote.partialDone);
  const mergedSpecialty=TM.mergeSet(base.specialtyDone,local.specialtyDone,remote.specialtyDone);
  // A deletion the other tab made is added; one it took back (Undo) is dropped, as for any other set.
  const mergedDeleted=TM.mergeSet(base.deletedSessionIds,local.deletedSessionIds,remote.deletedSessionIds);
  deletedSessionIdsRef.current=mergedDeleted;
  const mergedSessions=withoutDeletedSessions(TM.mergeSessions(base.statsSessions,local.statsSessions,remote.statsSessions),mergedDeleted);
  const mergedMilestones=TM.mergeMilestones(local.achievedMilestones,remote.achievedMilestones);
  // Imported progress carries no evidence of new stitching in this tab. The
  // accompanying stash ledger is merged separately; missing usage stays unknown.
  if(rtContextRef.current&&rtContextRef.current.live)rtContextRef.current.live.adopt({...local,pattern:pat,done:nd,
    halfDone:mergedHalf,knotsDone:mergedKnots,bsDone:mergedBs,partialDone:mergedQuarters,specialtyDone:mergedSpecialty},wastePrefs);
  // Counts of what the other tab added must not read as stitches done here just now.
  justLoadedRef.current=true;
  doneRef.current=nd;
  const hdMap=new Map(mergedHalf);
  recomputeAllCounts(pat,nd,halfStitches,hdMap);
  setDone(nd);
  setHalfDone(hdMap);
  setSpecialtyDone(mergedSpecialty);
  setKnotsDone(mergedKnots);
  setBeadsDone(window.Beads.live(beadsRef.current,TM.mergeSet(base.beadsDone,local.beadsDone,remote.beadsDone)));
  setBsDone(mergedBs);
  setPartialDone(window.Fractional?window.Fractional.toMap(mergedQuarters):new Map());
  setStatsSessions(mergedSessions);
  setAchievedMilestones(mergedMilestones);
  // The undo history describes cells whose value just changed under it.
  setTrackHistory([]);setRedoStack([]);
  // The record now on disk is the new base; this tab's next save writes the combined result.
  mergeBaseRef.current={...remote,pattern:base.pattern};
  try{if(window.CrossTabCoord&&window.CrossTabCoord.noteSeen)window.CrossTabCoord.noteSeen(id,remote.lastWriteAt,remote.lastWriteTabId);}catch(_){}
  window.Toast&&Toast.show({message:'Stitches marked in another tab were added to this one.',type:'info',duration:4000});
  return true;
}
const mergeRemoteRef=useRef(null);
mergeRemoteRef.current=mergeRemoteProject;
const mergeBaseRef=useRef(null);
// Only while the Tracker is the visible mode: in the unified page it stays mounted, hidden,
// behind the Creator, and must not answer the Creator's conflicts from stale Tracker state.
useEffect(()=>{
  if(!isActive||!window.CrossTabResolution||typeof window.CrossTabResolution.registerMerger!=='function')return;
  return window.CrossTabResolution.registerMerger(info=>mergeRemoteRef.current(info));
},[isActive]);

function handleEditInCreator(){
  if(!pat||!pal)return;
  if(savesBlockedRef.current)return;   // a question about the saved marks is open: answer it first
  if(onSwitchToDesign){
    // Build a fresh snapshot so name/session changes that haven't auto-saved yet are included
    const project=buildSnapshot();
    if(project){
      lastSnapshotRef.current=project;
      persistProjectRecord(project).then(function(saveResult){
        if(saveResult&&noWriteReason(saveResult.reason))return null;
        return saveProjectToDB(project);
      }).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
      // Push ALL tracker-specific fields to Creator so its auto-save doesn't overwrite them
      try{
        if(typeof window.__updateCreatorTrackerFields==='function'){
          var _v3h=v3FieldsRef.current||{};
          window.__updateCreatorTrackerFields({
            chartRevision:project.chartRevision,chartAccountingUnits:project.chartAccountingUnits,meta:project.meta,
            statsSessions:project.statsSessions, deletedSessionIds:project.deletedSessionIds, statsSettings:project.statsSettings,
            achievedMilestones:project.achievedMilestones, doneSnapshots:project.doneSnapshots, deletedSnapshotIds:project.deletedSnapshotIds,
            breadcrumbs:project.breadcrumbs, stitchingStyle:project.stitchingStyle,
            blockW:project.blockW, blockH:project.blockH, focusBlock:project.focusBlock, workArea:project.workArea, workingContext:project.workingContext,
            startCorner:project.startCorner, colourSequence:project.colourSequence,
            originalPaletteState:project.originalPaletteState,
            singleStitchEdits:project.singleStitchEdits,
            halfStitches:project.halfStitches, halfDone:project.halfDone,
            specialtyDone:project.specialtyDone, knotsDone:project.knotsDone, bsDone:project.bsDone, partialDone:project.partialDone, beads:project.beads, beadsDone:project.beadsDone, notes:project.notes,
            finishStatus:_v3h.finishStatus, startedAt:_v3h.startedAt,
            lastTouchedAt:_v3h.lastTouchedAt, completedAt:_v3h.completedAt,
            stitchLog:_v3h.stitchLog
          });
        }
      }catch(e){}
    }
    // Sync the current project name to the Creator so it doesn't overwrite with stale name
    if(typeof window.__setCreatorProjectName==='function') window.__setCreatorProjectName(projectName||'');
    onSwitchToDesign();
    return;
  }
  // Standalone tracker (stitch.html): save the project to IndexedDB, then let
  // the Creator open it as the active project. The whole project used to go
  // through localStorage, whose ~5 MB quota a large chart (100k+ stitches)
  // overflows, leaving the user stuck on a "Pattern too large" alert.
  const project=buildSnapshot();
  if(!project)return;
  lastSnapshotRef.current=project;
  persistProjectRecord(project).then(function(saveResult){
    // A cross-tab conflict that the user resolved by reloading: stay here.
    if(saveResult&&noWriteReason(saveResult.reason))return;
    if(saveResult&&saveResult.ok===false)throw new Error(saveResult.reason||'save failed');
    // T-3 / INT-4: only a small timestamped note travels through
    // localStorage now, so the Creator can still warn about tracking
    // progress. It drops notes older than HANDOFF_TTL_MS so an aborted nav
    // doesn't leave a stale alert waiting for the next Creator visit.
    try{
      var _env = { ts: Date.now(), projectId: project.id, hasProgress: !!(project.done && project.done.some(function(v){return v===1;})) };
      localStorage.setItem("crossstitch_handoff_to_creator", JSON.stringify(_env));
    }catch(_){}
    window.__navigatingAway=true;
    window.location.href = "create.html?source=tracker";
  }).catch(function(e){
    console.error('Edit in Creator: save failed:', e);
    try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save the pattern before opening it in the Creator. Please try again.', type: 'error'}); } catch(_){}
  });
}


function handleSymbolReassignment(oldColorId, newThread) {
  if (!pat || !pal || !cmap) return;

  // 1. Snapshot for undo — V2 single-level undoSnapshot
  const currentPalState = deepClone(pal); // PERF (perf-6 #5): deepClone > JSON round-trip
  const currentThreadOwnedState = deepClone(threadOwned); // PERF (perf-6 #5)
  setUndoSnapshot({ type:"bulk_reassignment", pal: currentPalState, threadOwned: currentThreadOwnedState, oldId: oldColorId, newId: newThread.id });

  // 2. Map grid values
  const newPat = pat.map(cell => {
    if (cell.id === oldColorId) {
      return {
        ...cell,
        id: newThread.id,
        name: newThread.name,
        rgb: newThread.rgb,
        lab: newThread.lab || cell.lab
      };
    }
    return cell;
  });

  // 3. Update palette
  const oldPalEntry = pal.find(p => p.id === oldColorId);
  const newPal = pal.map(p => {
    if (p.id === oldColorId) {
      return {
        ...p,
        id: newThread.id,
        name: newThread.name,
        rgb: newThread.rgb,
        lab: newThread.lab || p.lab,
        // keep symbol and count
      };
    }
    return p;
  });

  // 4. Update cmap
  const newCmap = {};
  newPal.forEach(p => { newCmap[p.id] = p; });

  // 5. Update thread owned status map to move the status if any
  if (threadOwned[oldColorId]) {
    setThreadOwned(prev => {
      const next = { ...prev };
      next[newThread.id] = prev[oldColorId];
      delete next[oldColorId];
      return next;
    });
  }

  setPat(newPat);
  setPal(newPal);
  setCmap(newCmap);
}

function processLoadedProject(project){
  if(!project){console.error("processLoadedProject called with null/undefined");return;}
  if(!project.id){console.warn('[stitchx/tracker] processLoadedProject: project has no id — a new id will be minted on first auto-save; call stack:', new Error().stack);}
  // What a cross-tab merge starts from (see mergeRemoteProject).
  mergeBaseRef.current=project;
  // INT-7 Phase B-1: seed the last-seen cache so a future save() from this
  // tab can detect concurrent writes from other tabs. No-op when
  // CrossTabCoord isn't loaded or the project lacks Phase B fields (legacy
  // payloads) — the next save from this tab will stamp them.
  try {
    if (project.id && typeof window !== 'undefined'
        && window.CrossTabCoord && typeof window.CrossTabCoord.noteSeen === 'function') {
      window.CrossTabCoord.noteSeen(
        project.id, project.lastWriteAt, project.lastWriteTabId);
    }
  } catch (_) {}
    if(project.specialtyVersion!=null&&project.specialtyVersion!==1)throw new Error('Unsupported petite/long stitch schema version '+project.specialtyVersion+'.');
  project=ProgressUnits.specialty.migrate(project);
  // Canonical numeric indices also cover legacy string-keyed half marks.
  project={...project,halfDone:TrackingSync.merge(project,{}).halfDone};
  mergeBaseRef.current=project;
  // P4-5: a project in another brand's numbering loads that brand's
  // catalogue first, then comes back here (helpers.js).
  if(window.whenProjectBrandReady&&!window.whenProjectBrandReady(project,processLoadedProject,err=>{
    console.error("[tracker] processLoadedProject threw:",err);
    setLoadError("Could not open this pattern: "+(err&&err.message||err));
  }))return;
  const brand=window.projectThreadBrand?window.projectThreadBrand(project):"dmc";
  // Install the loaded project's identity before any downstream work so a
  // later render-time failure can't cause the next auto-save to mint a copy.
  // A session still running belongs to the project being left: finish it now, while the project id is still that
  // one, so it is kept (its backup is written under that id and is recovered when that project is opened again).
  try{if(currentAutoSessionRef.current&&finaliseAutoSessionRef.current){
    const oldId=projectIdRef.current;
    const ended=finaliseAutoSessionRef.current({trimIfIdle:true});
    if(ended&&oldId===project.id){
      const records=ended.records||[ended],existing=project.statsSessions||[];
      project={...project,statsSessions:existing.concat(records.filter(r=>!existing.some(s=>s.id===r.id)))};
    }
  }}catch(_){}
  const _sameProjectReload=!!project.id&&project.id===projectIdRef.current; // a reload of what is on screen keeps the person's current mode and view
  projectIdRef.current = project.id || null;
  let s=project.settings||{};
  const nextW=project.w||s.sW||project.settings?.w||80;
  const nextH=project.h||s.sH||project.settings?.h||80;
  // If this device cannot fit the chart at the minimum usable stitch-cell size,
  // reject the load before any canvas sizing runs.
  if(typeof window.maxChartCellSize==="function"&&window.maxChartCellSize(nextW,nextH)<2){
    setLoadError(`Pattern (${nextW}×${nextH}) is too large to display on this device in Stitch Tracker. Open it in the Creator to reduce stitch count.`);
    return;
  }
  setSW(nextW);
  setSH(nextH);
  setBsLines(project.bsLines||project.bs||[]);
  if(s.fabricCt)setFabricCt(s.fabricCt);
  else if(project.fc)setFabricCt(project.fc);
  setThreadBrand(brand);
  setProjectFabricColour(typeof s.fabricColour==="string"&&/^#[0-9a-fA-F]{6}$/.test(s.fabricColour)?s.fabricColour:null);
  if(s.skeinPrice!=null)setSkeinPrice(s.skeinPrice);
  if(s.stitchSpeed)setStitchSpeed(s.stitchSpeed);
  // Flush the departing context before replacing it; the callback captures its id.
  if(rtWriteSnapshotRef.current&&rtWriteSnapshotRef.current.ctx&&rtWriteSnapshotRef.current.ctx.projectId!==project.id){
    flushRtStashWriteRef.current().catch(()=>{});
  }
  rtWriteSnapshotRef.current=null;
  const loadedWaste=s.wastePrefs&&typeof s.wastePrefs==='object'?Object.assign({},RT_WASTE_DEFAULTS,s.wastePrefs):Object.assign({},RT_WASTE_DEFAULTS);
  setWastePrefs(loadedWaste);
  // Clear per-session RT state on project switch.
  rtLowToastedRef.current.clear();
  setStashDeducted(false);

  let p = project.pattern || project.p;
  if(!p){console.error("processLoadedProject: missing pattern data");return;}
  let restored;

  setIsEditMode(false);
  setUndoSnapshot(null);
  setSingleStitchEdits(new Map());
  setCellEditPopover(null);
  setSessionStartSnapshot(null);
  setEditModalColor(null);

  // Detect the compact array-of-arrays format ([["310"], ["311","b"], ["", "k"]])
  // by inspecting the first cell rather than relying on project.v alone. This
  // protects against legacy v8 projects whose `.pattern` field was rewritten
  // post-decompression but whose v stamp never advanced.
  var _isCompactArray = p.length > 0 && Array.isArray(p[0]);
  if (_isCompactArray) {
    // Compressed URL format
     restored = p.map(m => {
        if(m[1] === 'k') return restoreStitch({id:"__skip__"});
        if(m[1] === 'b') return restoreStitch({type:"blend",id:m[0]},brand);
        return restoreStitch({type:"solid",id:m[0]},brand);
     });
  } else {
    // Normal JSON format
    restored=p.map(m=>restoreStitch(m,brand));
  }

  const loadedSpecialty=ProgressUnits.specialty.read(project,s.sW||project.w,s.sH||project.h,brand);
  setSpecialtyStitches(loadedSpecialty);setSpecialtyDone(ProgressUnits.specialty.live(project.specialtyDone,loadedSpecialty));setSpecialtySelected(null);
  const partialMap = new Map();
  const partialCells = [];
  (project.partialStitches || []).forEach(([idx, quarters]) => {
    const restoredQuarters = {};
    Object.keys(quarters || {}).forEach(corner => {
      const quarter = quarters[corner];
      if (!quarter || !quarter.id) return;
      const stitch = restoreStitch({ id: quarter.id, type: quarter.id.includes('+') ? 'blend' : 'solid', rgb: quarter.rgb, brand: quarter.brand }, brand);
      restoredQuarters[corner] = { id: stitch.id, rgb: stitch.rgb, lab: stitch.lab, name: stitch.name, type: stitch.type };
      if (stitch.brand) restoredQuarters[corner].brand = stitch.brand;
      partialCells.push(stitch);
    });
    if (Object.keys(restoredQuarters).length) partialMap.set(Number(idx), restoredQuarters);
  });
  // Symbols chosen in the Creator (P1-4) ride on their cells; buildPalette
  // keeps a symbol its cells carry.
  const savedSyms=project.symbols&&typeof project.symbols==="object"?project.symbols:null;
  symbolsRef.current=savedSyms;
  restored=applySavedSymbols(restored,savedSyms);
  // French knots: their threads join the palette (one count each, as the
  // part stitches' quarters do), so they show in the key and the thread totals.
  const kW=(project.settings&&project.settings.sW)||project.w,kH=(project.settings&&project.settings.sH)||project.h;
  const knotList=window.Knots?window.Knots.normalise(project.knots,kW,kH,brand):[];
  const knotCells=knotList.map(k=>restoreStitch({id:k.id,type:k.id.includes('+')?'blend':'solid',rgb:k.rgb,brand:k.brand||'dmc'}));
  knotList.forEach((k,i)=>{if(!k.rgb&&knotCells[i].rgb)k.rgb=knotCells[i].rgb;});
  // Colours used only by backstitch still belong in the legend (their lines are tracked there).
  const bsCells=[],bsSeen=new Set();
  (project.bsLines||project.bs||[]).forEach(ln=>{
    if(!ln||ln.colorId==null||ln.colorId===""||bsSeen.has(String(ln.colorId)))return;
    bsSeen.add(String(ln.colorId));
    try{bsCells.push(restoreStitch({id:String(ln.colorId),type:String(ln.colorId).includes('+')?'blend':'solid',rgb:ln.rgb||(/^#[0-9a-f]{6}$/i.test(ln.color||"")?[parseInt(ln.color.slice(1,3),16),parseInt(ln.color.slice(3,5),16),parseInt(ln.color.slice(5,7),16)]:undefined),brand:ln.brand||brand}));}catch(_){}
  });
  let{pal:newPal,cmap:newCmap}=buildPalette(restored,partialCells.concat(knotCells,bsCells,loadedSpecialty.map(o=>restoreStitch(o.thread,brand))));
  setPat(restored);setPal(newPal);setCmap(newCmap);
  const rtInitial=rtThreadUsage(restored,project.done,s.fabricCt||project.fc||14,loadedWaste);
  const rtLoaded={...project,pattern:restored,fabricCt:s.fabricCt||project.fc||14};
  const rtInitialMarks=window.ThreadAccounting.snapshot(rtLoaded,loadedWaste);
  // What is marked on load is history, not stitching done now: the live marks
  // start from it and report only what changes after (see the sync effect).
  const rtLive=window.ThreadAccounting.live();rtLive.adopt(rtLoaded,loadedWaste,rtInitialMarks);
  const rtContext={projectId:project.id||ProjectStorage.newId(),initial:rtInitial,initialMarks:rtInitialMarks,live:rtLive,
    accounting:null,ready:null,pending:[],intents:{},sequences:{},outbox:[]};
  const recoveryId=window.RecoveryStorage?JSON.parse(window.RecoveryStorage.current()||'null'):null;
  const outboxPrefix='cs_consumption_outbox:'+(recoveryId?recoveryId.id:'original')+':'+rtContext.projectId+':';
  rtContext.outboxKey=outboxPrefix+crypto.randomUUID();
  rtContext.recoveredKeys=[];
  try{for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key&&key.startsWith(outboxPrefix)){
      const value=localStorage.getItem(key)||'[]',saved=JSON.parse(value);
      rtContext.outbox.push(...saved);rtContext.recoveredKeys.push({key,value});
    }
  }}catch(e){console.warn('Unreadable pending consumption history',e);}
  if(!project.id)projectIdRef.current=rtContext.projectId;
  rtContextRef.current=rtContext;
  if(typeof StashBridge!=='undefined'){
    rtContext.ready=StashBridge.applyConsumptionEvents(rtContext.projectId,rtInitialMarks,[]).then(result=>{
      rtContext.accounting=result.accounting;
      if(rtContext.outbox.length)setTimeout(()=>flushRtStashWriteRef.current(rtContext).catch(()=>{}),0);
      if(rtContextRef.current===rtContext){setGlobalStash(result.threads);setRtAccountingVersion(v=>v+1);}
    });
    rtContext.ready.catch(e=>console.warn('Could not initialise stash accounting:',e));
  }

  setPartialStitches(partialMap);
  setKnots(knotList);
  setKnotsDone(Array.isArray(project.knotsDone)?project.knotsDone.filter(kk=>typeof kk==="string"):[]);
  setBsDone(window.Backstitch?window.Backstitch.live(project.bsDone,project.bsLines||project.bs):[]);
  setPartialDone(window.Fractional?window.Fractional.live(window.Fractional.toMap(project.partialDone),partialMap):new Map());
  beadsRef.current=window.Beads.normalise(project.beads);
  setBeads(beadsRef.current);
  setBeadsDone(window.Beads.live(beadsRef.current,project.beadsDone));
  setSelectedBead(null);setBeadPanelOpen(false);
  if (project.originalPaletteState) {
    setOriginalPaletteState(project.originalPaletteState);
  } else {
    setOriginalPaletteState(deepClone(newPal)); // PERF (perf-6 #5)
  }
  // V2: restore sparse diff of single-stitch edits
  if (project.singleStitchEdits && project.singleStitchEdits.length > 0) {
    setSingleStitchEdits(new Map(project.singleStitchEdits));
  }
  // V9: restore half stitch data
  if (project.halfStitches && project.halfStitches.length > 0) {
    const hsMap = new Map();
    project.halfStitches.forEach(([idx, hs]) => {
      const entry = {};
      if (hs.fwd) {
        const restored = restoreStitch({ id: hs.fwd.id, type: hs.fwd.id.includes('+') ? 'blend' : 'solid', rgb: hs.fwd.rgb, brand: hs.fwd.brand }, brand);
        entry.fwd = { id: restored.id, rgb: restored.rgb, lab: restored.lab, name: restored.name, type: restored.type };
        if (restored.brand) entry.fwd.brand = restored.brand;
      }
      if (hs.bck) {
        const restored = restoreStitch({ id: hs.bck.id, type: hs.bck.id.includes('+') ? 'blend' : 'solid', rgb: hs.bck.rgb, brand: hs.bck.brand }, brand);
        entry.bck = { id: restored.id, rgb: restored.rgb, lab: restored.lab, name: restored.name, type: restored.type };
        if (restored.brand) entry.bck.brand = restored.brand;
      }
      hsMap.set(idx, entry);
    });
    setHalfStitches(hsMap);
  } else {
    setHalfStitches(new Map());
  }
  if (project.halfDone && project.halfDone.length > 0) {
    setHalfDone(new Map(project.halfDone));
  } else {
    setHalfDone(new Map());
  }
  setSelectedColorId(null);setTrackHistory([]);setRedoStack([]);
  // Back to where the stitcher left off: colour, Mark or Navigate, and how the chart was drawn (TRACK-05).
  if(!_sameProjectReload){
    const _wc=normaliseWorkingContext(project.workingContext,newPal);
    setStitchMode(_wc?_wc.mode:"track");
    setFocusColour(_wc&&_wc.colour?_wc.colour:null);
    if(_wc&&_wc.view)setStitchView(_wc.view);
    else if(stitchView==="highlight")setStitchView("symbol");   // highlighting needs a colour, and this project has none saved
    if(_wc&&_wc.highlight)setHighlightMode(_wc.highlight);
  }else{
    // The project on screen, loaded again: keep the colour in hand if the pattern still has it.
    setFocusColour(prev=>prev&&newPal.some(m=>m&&m.id===prev)?prev:null);
  }
  setThreadOwned(project.threadOwned||{});
  let _reconcileHeld=false;
  reconcileRef.current=null;savesBlockedRef.current=false;setReconcile(null);
  if(project.done&&project.done.length===restored.length)setDone(new Uint8Array(project.done));
  else{
    setDone(new Uint8Array(restored.length));
    // Marks that no longer fit the pattern: never zero them silently. Ask, and write nothing meanwhile.
    const _oldMarks=project.done?Array.from(project.done).filter(v=>v===1).length:0;
    // Half-stitch marks are keyed by cell index too, so they go stale the same way.
    const _oldHalf=(project.halfDone||[]).filter(e=>e&&e[1]&&(e[1].fwd||e[1].bck)).length;
    // Quarter-stitch marks are keyed by cell index as well. They are held back with the rest until the question is answered.
    const _oldQuarter=(project.partialDone||[]).reduce((n,e)=>n+(e&&Array.isArray(e[1])?e[1].length:0),0);
    if(_oldMarks>0||_oldHalf>0||_oldQuarter>0){
      setPartialDone(new Map());
      const _cand=window.TrackingMerge?window.TrackingMerge.remapCandidates(project.done||[],kW,kH,restored):[];
      const _rc={oldDone:Array.from(project.done||[]),oldMarks:_oldMarks,oldHalf:_oldHalf,candidates:_cand,halfDone:project.halfDone||[],partialDone:project.partialDone||[],oldQuarter:_oldQuarter,projectId:project.id||null};
      reconcileRef.current=_rc;
      savesBlockedRef.current=true;
      _reconcileHeld=true;
      setReconcile(_rc);
    }
  }

  // T-1: drop park markers whose colour no longer exists in the palette
  // (e.g. the colour was removed in the Creator between sessions). Notify
  // the user once if any were dropped.
  var rawParkMarkers = project.parkMarkers || [];
  var liveParkMarkers = rawParkMarkers.filter(function(m) { return m && newCmap && newCmap[m.colorId]; });
  if (rawParkMarkers.length && liveParkMarkers.length !== rawParkMarkers.length) {
    var dropped = rawParkMarkers.length - liveParkMarkers.length;
    try {
      if (window.Toast && window.Toast.show) {
        window.Toast.show({
          message: "Removed " + dropped + " park marker" + (dropped !== 1 ? "s" : "") + " for colours no longer in the palette",
          type: "info",
          duration: 3500
        });
      }
    } catch (_) {}
  }
  // A marker on a finished stitch is spent: the parked thread was used to
  // make it. During a session such markers are only hidden (so undoing a
  // stray tap brings them back); drop them silently here so they do not
  // pile up in the saved project.
  var loadedDone = (project.done && project.done.length === restored.length) ? project.done : null;
  if (loadedDone) liveParkMarkers = liveParkMarkers.filter(function(m) { return !loadedDone[m.y * nextW + m.x]; });
  setParkMarkers(liveParkMarkers);
  setBreadcrumbs(project.breadcrumbs||[]);
  // Preserve v3 stats fields through auto-save round-trips
  v3FieldsRef.current={chartRevision:project.chartRevision,chartAccountingUnits:project.chartAccountingUnits,meta:project.meta,finishStatus:project.finishStatus,startedAt:project.startedAt,lastTouchedAt:project.lastTouchedAt,completedAt:project.completedAt,stitchLog:project.stitchLog};
  if(project.stitchingStyle)setStitchingStyle(project.stitchingStyle);
  // T-2: prefer the per-project value; fall back to last-used (localStorage)
  // or the user pref shape; final default 10/TL. Doing it here (not in
  // useState) keeps the first render from showing the previous project's
  // block size when switching between projects.
  var _fallbackShape = (window.UserPrefs && window.UserPrefs.get("trackerBlockShape")) || "10x10";
  var _fbW = parseInt(String(_fallbackShape).split("x")[0], 10);
  var _fbH = parseInt(String(_fallbackShape).split("x")[1], 10);
  var _lsW = null, _lsH = null, _lsCorner = null;
  try { _lsW = localStorage.getItem("cs_blockW"); _lsH = localStorage.getItem("cs_blockH"); _lsCorner = localStorage.getItem("cs_startCorner"); } catch(_){}
  var _resolveBlock = function(projVal, lsVal, fbVal) {
    if (projVal) return Math.max(5, Math.min(100, projVal));
    if (lsVal) { var n = parseInt(lsVal, 10); if (isFinite(n)) return Math.max(5, Math.min(100, n)); }
    return isFinite(fbVal) ? Math.max(5, Math.min(100, fbVal)) : 10;
  };
  setBlockW(_resolveBlock(project.blockW, _lsW, _fbW));
  setBlockH(_resolveBlock(project.blockH, _lsH, _fbH));
  if(project.focusBlock)setFocusBlock(project.focusBlock);else setFocusBlock(null);
  // Validated against this pattern's size: the file may come from another
  // device, an older build, or a pattern since resized in the Creator.
  setWorkArea(window.WorkArea?window.WorkArea.normalise(project.workArea,nextW,nextH):null);
  setStartCorner(project.startCorner || _lsCorner || (window.UserPrefs && window.UserPrefs.get("trackerStartCorner")) || "TL");
  if(project.colourSequence)setColourSequence(project.colourSequence);
  // Legacy migration, duration and totalAtEnd patching and pending-session recovery live in helpers.js. The backup is
  // read here (it is localStorage) and kept while a question holds saves; the first save after it clears it.
  var pendingSessions=null;
  try{pendingSessions=readPendingSessions(localStorage,project.id);}catch(_){}
  var rawStatsSessions=rebuildLoadedSessions(project,{pattern:restored,pendingSessions:pendingSessions});
  // Sessions the person deleted stay deleted, even if a stale copy comes back (a recovered unsaved session, a restore).
  deletedSessionIdsRef.current=Array.isArray(project.deletedSessionIds)?project.deletedSessionIds.slice():[];
  rawStatsSessions=withoutDeletedSessions(rawStatsSessions,deletedSessionIdsRef.current);
  // The checkpoint already contains day-split records calculated at the last write.
  // Never resume its wall clock: time while the renderer was gone is unknown.
  (project.sessionCheckpoints||[]).forEach(cp=>{
    if(cp.projectId!==project.id)return;
    (cp.records||[]).forEach(r=>{if(!rawStatsSessions.some(s=>s.id===r.id))rawStatsSessions.push(r);});
  });
  rawStatsSessions=withoutDeletedSessions(rawStatsSessions,deletedSessionIdsRef.current);
  setStatsSessions(rawStatsSessions);
  // A3: fire the resume recap modal once per project load when there is at
  // least one prior session. Skipped on a fresh project (sessions empty) and
  // on the same project re-loading inside one mounted Tracker instance.
  try{
    var _pid=project.id||'__unsaved__';
    if(rawStatsSessions.length>0&&!resumeRecapShownRef.current.has(_pid)){
      resumeRecapShownRef.current.add(_pid);
      var _summary=(typeof lastSessionSummary==='function')?lastSessionSummary({statsSessions:rawStatsSessions}):null;
      if(_summary){
        var _last=rawStatsSessions[rawStatsSessions.length-1];
        var _totalSt=restored.filter(function(c){return c&&c.id!=='__skip__'&&c.id!=='__empty__';}).length;
        var _doneSt=project.done?Array.from(project.done).filter(function(v){return v===1;}).length:0;
        const _recap={
          projectName:project.name||'Untitled',
          summary:_summary,
          lastDate:_last&&(_last.date||_last.startTime)||null,
          totalSt:_totalSt,
          doneSt:_doneSt
        };
        // The marks are being reconciled: the recap waits for the figures that are kept.
        if(_reconcileHeld&&reconcileRef.current)reconcileRef.current.recap=_recap;
        else setResumeRecap(_recap);
      }
    }
  }catch(_e){}
  setStatsSettings(Object.assign({dailyGoal:null,weeklyGoal:null,monthlyGoal:null,targetDate:null,dayEndHour:0,timingMode:null,stitchingSpeedOverride:null,useActiveDays:true,sectionCols:50,sectionRows:50},project.statsSettings||{}));
  setStatsView(false);
  setCelebration(null);
  celebratedRef.current=new Set();
  goalCelebrationRef.current={daily:false,weekly:false,monthly:false};
  resetAutoSessionForProjectLoad();
  // Restore persisted milestones and seed celebratedRef so celebrations don't re-fire
  var persistedMilestones=project.achievedMilestones||[];
  setAchievedMilestones(persistedMilestones);
  persistedMilestones.forEach(function(m){var key=m.pct!=null?('pct_'+m.pct):m.label;celebratedRef.current.add(key);});
  // Restore done-state snapshots and reset the day-tracking ref
  snapshotGenerationRef.current++;
  deletedSnapshotIdsRef.current=project.deletedSnapshotIds||[];
  setDoneSnapshots((project.doneSnapshots||[]).filter(s=>!deletedSnapshotIdsRef.current.includes(s.id)));
  // The last stitching day seen, so opening the Tracker on a later day still notices the change of day
  // (it used to start from nothing on every load, and the snapshot only fired if the page stayed open
  // across midnight). The newest session's date is that day (sessions are saved when the Tracker closes);
  // lastTouchedAt, then updatedAt, are the fallbacks. A project with nothing marked has no day yet.
  lastSnapshotDateRef.current=null;
  try{
    const hasMarks=project.done&&Array.from(project.done).some(v=>v===1);
    let lastDay=null;
    (project.statsSessions||[]).forEach(s=>{if(s&&s.date&&(!lastDay||s.date>lastDay))lastDay=s.date;});
    // A very short session is not recorded at all, so fall back to when the project was last touched or saved.
    // A day-end hour a project saved before there was one setting becomes the setting, once, if none is set yet.
    try{if(window.UserPrefs&&window.UserPrefs.get('statsDayEndHour')==null){const pv=project.statsSettings&&project.statsSettings.dayEndHour;if(typeof pv==='number'&&pv>0)window.UserPrefs.set('statsDayEndHour',pv);}}catch(_){}
    const deh=getDayEndHour(project.statsSettings);
    [project.lastTouchedAt,project.updatedAt].forEach(t=>{
      if(lastDay||!t)return;
      const d=new Date(t);
      if(!isNaN(d.getTime()))lastDay=getStitchingDate(d,deh);
    });
    if(lastDay&&hasMarks)lastSnapshotDateRef.current=lastDay;
    const enabledAt=window.UserPrefs&&window.UserPrefs.get('trackerSnapshotsEnabledAt');
    if(enabledAt){const baseline=getStitchingDate(new Date(enabledAt),deh);if(!lastSnapshotDateRef.current||baseline>lastSnapshotDateRef.current)lastSnapshotDateRef.current=baseline;}
    if(!window.UserPrefs||window.UserPrefs.get('trackerAutomaticSnapshots')!==true)lastSnapshotDateRef.current=getStitchingDate(new Date(),deh);
  }catch(_){}
  // Reset auto-session count refs so loading doesn't trigger a spurious session
  // justLoadedRef stays true until the stitch-delta effect has run at least once,
  // protecting against the sentinel being consumed by a halfStitchCounts change
  // before doneCount has been recomputed.
  justLoadedRef.current=true;
  // justLoadedSettlePassRef no longer drives the settling logic (replaced by countsVer effect)
  justLoadedSettlePassRef.current=0;
  prevAutoCountRef.current={done:-1,halfDone:-1};
  if(project.hlRow>=0)setHlRow(project.hlRow);
  if(project.hlCol>=0)setHlCol(project.hlCol);
  setProjectName(project.name||"");
  setProjectDesigner(project.designer||"");
  setProjectDescription(project.description||"");
  setProjectNotes(typeof project.notes==="string"?project.notes:"");
  namePromptShownRef.current=!!project.namePromptShown;
  nameAutoGeneratedRef.current=!!project.nameAutoGenerated;
  try{const saved=localStorage.getItem('cs_layerVis_'+(project.id||''));if(saved)setLayerVis(JSON.parse(saved));else setLayerVis(ALL_LAYERS_VISIBLE);}catch(_){setLayerVis(ALL_LAYERS_VISIBLE);}
  try{const saved=localStorage.getItem('cs_parkLayers_'+(project.id||''));setParkLayers(saved?JSON.parse(saved):{});}catch(_){setParkLayers({});}
  // Per-project legend overlay (sort + collapsed). When absent, the
  // current global UserPrefs default is left in place.
  try{const ls=localStorage.getItem('cs_legendSort_'+(project.id||''));if(ls)setLegendSort(ls);}catch(_){}
  try{const lc=localStorage.getItem('cs_legendCollapsed_'+(project.id||''));if(lc!==null)setLegendCollapsed(lc==='1');}catch(_){}
  const normalisedCreatedAt=(()=>{
    const value=project.createdAt;
    if(value==null||value==="")return null;
    if(typeof value==="number"&&Number.isFinite(value)){
      const dt=new Date(value);
      return Number.isNaN(dt.getTime())?null:dt.toISOString();
    }
    if(typeof value==="string"){
      const trimmed=value.trim();
      if(!trimmed)return null;
      const dt=new Date(trimmed);
      return Number.isNaN(dt.getTime())?null:dt.toISOString();
    }
    return null;
  })();
  createdAtRef.current=normalisedCreatedAt;

  if(project.savedZoom!=null){
    setTimeout(()=>{
      setStitchZoom(project.savedZoom);
      if(project.savedScroll&&stitchScrollRef.current){
        requestAnimationFrame(()=>{
          if(!stitchScrollRef.current)return;
          // Saved in chart coordinates; the scroller may be showing a work area.
          const off=chartScrollOffset();
          stitchScrollRef.current.scrollLeft=project.savedScroll.left-off.x;
          stitchScrollRef.current.scrollTop=project.savedScroll.top-off.y;
        });
      }
    },100);
  }else{
    setTimeout(()=>{
      let z=Math.min(3,Math.max(0.05,750/((project.w||s.sW||80)*20)));
      setStitchZoom(z);
    },100);
  }
}

function loadProject(e){
  let f=e.target.files[0];if(!f)return;
  setLoadError(null);
  setImportSuccess(null);

  const format = detectImportFormat(f);
  const baseName = f.name ? f.name.replace(/\.[^.]+$/, '') : '';

  if (format === "json") {
    let rd=new FileReader();
    rd.onload=ev=>{
      try{
        let project=JSON.parse(ev.target.result);
        const patternField = project.pattern || project.p;
        if(!patternField) throw new Error("Invalid pattern file: 'pattern' field missing or not an array");
        if(!Array.isArray(patternField)) throw new Error("Invalid pattern file: 'pattern' field missing or not an array");
        if(!project.id) project.id = ProjectStorage.newId();
        if(!project.createdAt) project.createdAt = new Date().toISOString();
        processLoadedProject(project);
        persistProjectRecord(project).catch(err => console.error("JSON import save failed:", err));
      }catch(err){
        console.error(err);
        setLoadError("Could not load: "+err.message);

      }
    };
    rd.readAsText(f);
  } else if (format === "xsd" || /\.pat$/i.test(f.name || '')) {
    // Use the same verification review and publication path as Home/Creator.
    window.ImportEngine.importAndReview(f, { navigateTo: 'stitch.html' }).catch(err => {
      console.error('[tracker] Pattern import failed:', err);
      if (window.ImportEngine.showImportError) window.ImportEngine.showImportError(err, f.name);
    });
  } else if (format === "oxs") {
    let rd=new FileReader();
    rd.onload=async ev=>{
      try{
        if (typeof window.loadThreadConversions === 'function') await window.loadThreadConversions();
        if (/<blend\b/i.test(ev.target.result) && /\banchor\b/i.test(ev.target.result) && typeof window.loadAnchorData === 'function') await window.loadAnchorData();
        let result = parseOXS(ev.target.result);
        let project = importResultToProject(result, 14, baseName);
        if (result.warnings && result.warnings.length) {
          window.Toast && Toast.show({message:result.warnings.join(' '),type:'warning',duration:10000});
        }
        const importedAt = Date.now();
        project.id = "proj_" + importedAt;
        if(!project.createdAt) project.createdAt = new Date(importedAt).toISOString();
        processLoadedProject(project);
        persistProjectRecord(project).catch(err => console.error("Import save failed:", err));
        setImportSuccess(`Imported "${baseName || 'pattern'}" \u2014 ${result.width}\u00d7${result.height}, ${result.paletteSize} colours, ${result.stitchCount} stitches`);
      }catch(err){
        console.error(err);
        setLoadError("Could not load OXS: "+err.message);

      }
    };
    rd.readAsText(f);
  } else if (format === "image") {
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (f.size > MAX_FILE_SIZE) {
      setLoadError("File is too large. Please select an image under 5MB.");

      return;
    }
    let rd=new FileReader();
    rd.onload=ev=>{
      let img = new Image();
      img.onload = () => {
        setImportImage(img);
        setImportName(baseName);
        setImportFabricCt(14);
        setImportDialog("image");
      };
      img.onerror = () => {
        setLoadError("Could not load image.");

      };
      img.src = ev.target.result;
    };
    rd.readAsDataURL(f);
  } else if (format === "pdf") {
    // A large chart or a scan takes a while: say which page it is on, and
    // let the stitcher stop it. The importer checks the token once a page.
    const token = { aborted: false };
    const cancel = () => {
      token.aborted = true;
      setImportBusy(b => b ? { ...b, label: "Stopping\u2026", stopping: true } : b);
    };
    const title = "Importing " + (f.name || "PDF chart");
    const show = (label, page, total) => setImportBusy(b => (b && b.stopping) ? b : { title, label, page, total, stopping: false, cancel });
    setLoadError(null);
    show("Loading PDF library\u2026");
    const pdfReady = typeof window.loadPdfStack === 'function' ? window.loadPdfStack() : Promise.resolve();
    pdfReady.then(() => {
      if (token.aborted) { const e = new Error("Import cancelled."); e.name = "ImportAbortedError"; throw e; }
      show("Reading the PDF\u2026");
      const importer = new PatternKeeperImporter({
        onProgress: m => { if (m && m.label) show(m.label + "…", m.page, m.total); },
        cancelToken: token,
      });
      return importer.import(f);
    }).then(project => {
      setImportBusy(null);
      // A chart printed across several pages goes through the review dialog
      // first, so the stitcher can check each page sits in the right place and
      // move any that do not. So does any chart the importer has something to
      // say about — a symbol it could not match, a size that differs from what
      // the PDF states — so it can be put right before it is saved. A clean
      // single-page chart imports straight away, as before; so does everything
      // if the dialog is unavailable.
      const session = project && project._layoutSession;
      const report = (project && project.importReport) || {};
      const engine = window.ImportEngine;
      const multiPage = !!(session && session.pages && session.pages.length > 1);
      const needsLook = (report.warnings && report.warnings.length > 0) ||
        (report.placeholders && report.placeholders.length > 0);
      if ((multiPage || needsLook) && engine && typeof engine.openReview === 'function') {
        return engine.openReview({ project, layoutSession: session, warnings: [], coverage: 1, reviewMode: 'standard' })
          .then(out => {
            if (!(out && out.action === 'confirm' && out.project)) return null;
            // A booklet imported whole: the other designs go to the library,
            // and the one shown in the review opens here.
            const others = (out.projects || []).filter(p => p !== out.project);
            return Promise.all(others.map(p => {
              if (!p.id) p.id = ProjectStorage.newId();
              if (!p.createdAt) p.createdAt = new Date().toISOString();
              return ProjectStorage.save(p);
            })).then(() => {
              if (others.length && window.Toast && window.Toast.show) {
                window.Toast.show({ message: "Also saved to your library: " + others.map(p => p.name || "pattern").join(", ") + ".", type: "success", duration: 6000 });
              }
              return out.project;
            });
          });
      }
      return project;
    }).then(project => {
      if (!project) { setLoadError(null); return; }      // review cancelled
      if (!project.name) project.name = baseName;
      if (!project.id) project.id = ProjectStorage.newId();
      if (!project.createdAt) project.createdAt = new Date().toISOString();
      processLoadedProject(project);
      persistProjectRecord(project).catch(err => console.error("Import save failed:", err));
      setLoadError(null);
      const s = project.settings || {};
      const palCount = project.pattern ? new Set(project.pattern.filter(m => m && m.id !== '__skip__' && m.id !== '__empty__').map(m => m.id)).size : 0;
      const stitchCount = project.pattern ? project.pattern.filter(m => m && m.id !== '__skip__' && m.id !== '__empty__').length : 0;
      setImportSuccess(`Imported "${baseName || 'PDF chart'}" \u2014 ${s.sW||'?'}\u00d7${s.sH||'?'}, ${palCount} colours, ${stitchCount} stitches`);
    }).catch(err => {
      setImportBusy(null);
      if (err && err.name === "ImportAbortedError") return;   // cancelled: nothing went wrong
      console.error(err);
      setLoadError("Could not load PDF: " + err.message);
      // The line above sits under the sidebar while a chart is open; a toast
      // is seen whatever is on screen.
      if (window.Toast && window.Toast.show) window.Toast.show({ message: "Could not load PDF: " + err.message, type: "error", duration: 8000 });
    });
  } else {
    setLoadError("Unsupported file format. Please load .json, .oxs, .xml, .pdf, or image files.");
  }

  if(loadRef.current)loadRef.current.value="";
}

// When incomingProject prop changes (keepAlive: Creator passed a new project), reload.
useEffect(()=>{
  if(!incomingProject||incomingProject===incomingProjectRef.current)return;
  incomingProjectRef.current=incomingProject;
  if(incomingProject.project){
    processLoadedProject(incomingProject.project);
    hasLoadedOnceRef.current=true; // T-4
  }else if(incomingProject.id){
    // Called with {id} only (e.g. stats "Navigate to project") — load from storage.
    ProjectStorage.get(incomingProject.id).then(p=>{if(p&&(p.pattern||p.p)){processLoadedProject(p);hasLoadedOnceRef.current=true;}}).catch(err=>console.error("Failed to load project by id:",err));
  }
},[incomingProject]);

useEffect(() => {
  // Handle pending import file from HomeScreen
  if (window.__pendingTrackerImportFile) {
    const file = window.__pendingTrackerImportFile;
    delete window.__pendingTrackerImportFile;
    // Simulate a file input event for the existing loadProject handler
    const fakeEvt = { target: { files: [file] } };
    loadProject(fakeEvt);
    return;
  }
  // If a project was passed directly on first mount, use it (no DB read needed).
  if(incomingProjectRef.current){
    const ip=incomingProjectRef.current;
    if(ip.project){processLoadedProject(ip.project);hasLoadedOnceRef.current=true;}
    else if(ip.id){ProjectStorage.get(ip.id).then(p=>{
      if(p && (p.pattern || p.p)){processLoadedProject(p);hasLoadedOnceRef.current=true;}
      else if(p){
        // Project exists in IDB but has no pattern cell data in either the
        // current `pattern` field or the legacy/compressed `p` field — treat
        // it as unloadable so the user gets a clear signal rather than a
        // silent empty canvas.
        console.warn('[TrackerApp] incomingProject "'+ip.id+'" found in IDB but has no pattern data.');
        if(window.Toast&&window.Toast.show)window.Toast.show({message:'No pattern data found. Please select a project from your library.',type:'warning',duration:6000});
      }
    }).catch(err=>console.error("Failed to load project by id:",err));}
    return;
  }
  const handoff = localStorage.getItem('crossstitch_handoff');
  if (handoff) {
    try {
      const projectData = JSON.parse(handoff);
      localStorage.removeItem('crossstitch_handoff');
      if (!projectData.pattern && !projectData.p) {
        // Handoff contains no pattern cell data (e.g. a manager library metadata
        // entry was mistakenly placed here). Fall through to the getActiveProject()
        // fallback below rather than showing an empty tracker with no recovery path.
        console.warn('[TrackerApp] Handoff has no pattern data — falling through to getActiveProject()');
        // (do not set hasLoadedOnceRef, do not return)
      } else {
        // Persist the incoming project so it survives beyond this one-shot key
        if (projectData.id) {
          persistProjectRecord(projectData).catch(err => console.error("ProjectStorage save failed:", err));
        }
        processLoadedProject(projectData);
        hasLoadedOnceRef.current=true; // T-4
        return;
      }
    } catch (e) {
      console.error("Failed to load handoff:", e);
    }
  }
    // Check URL hash for shared project
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('p=')) {
        try {
            const encoded = hash.slice(2);
            // Replace base64url characters
            const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
            const binaryStr = atob(base64);
            const binaryData = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                binaryData[i] = binaryStr.charCodeAt(i);
            }
            const decompressed = pako.inflate(binaryData, { to: 'string' });
            const project = JSON.parse(decompressed);
            if (!project.id) project.id = ProjectStorage.newId();
            processLoadedProject(project);
            hasLoadedOnceRef.current=true; // T-4
            window.location.hash = ''; // Clear hash after loading
            return;
        } catch (err) {
            console.error("Failed to load from URL:", err);
            setLoadError("Failed to load pattern from link.");
        }
    }
  // No handoff and no URL hash — restore from the URL ?id= param first
  // (if present) and fall back to the active-project pointer otherwise.
  //
  // Two-step strategy to eliminate active-pointer races entirely:
  //   1. If ?id=<projectId> is in the URL (added by home/stash Track
  //      navigation), load directly from IDB by that id. This bypasses
  //      the localStorage pointer altogether, so it works even when the
  //      pointer was cleared by self-heal racing with navigation.
  //   2. Only if (1) yields no project (no id in URL, or id not in IDB),
  //      fall back to ProjectStorage.getActiveProject().
  //
  // Both paths funnel through the same `hydrate()` helper so the toast +
  // diagnostic logging fire in exactly one place.
  var _urlParams2;
  try { _urlParams2 = new URLSearchParams(window.location.search); }
  catch (_) { _urlParams2 = null; }
  var _urlId2 = _urlParams2 ? _urlParams2.get('id') : null;

  function _hasPattern(proj) {
    // Mirror the explicit checks elsewhere (StatsContainer.onOpenProject,
    // creator-boot): require both a pattern array (in either field shape)
    // AND settings. Without settings, processLoadedProject would render a
    // broken canvas, so treat a settings-less project as un-loadable here
    // and let the toast fire with the diagnostic log.
    return !!(proj && (proj.pattern || proj.p) && proj.settings);
  }
  function _hydrate(project, source) {
    if (hasLoadedOnceRef.current) return;
    if (_hasPattern(project)) {
      processLoadedProject(project);
      hasLoadedOnceRef.current = true;
      // Mirror the pointer so subsequent reloads have a stable target.
      try { if (project.id && ProjectStorage.setActiveProject) ProjectStorage.setActiveProject(project.id); } catch (_) {}
      return true;
    }
    return false;
  }
  function _failLoad(activeId, projectIfAny) {
    // Diagnostic: log what we did/didn't find so future "No pattern" reports
    // can be traced. ProjectStorage.listProjects is a metadata-only read so
    // this is cheap even for large libraries.
    var shouldWarn = !!(_urlId2 || activeId || projectIfAny);
    var diag = {
      activeId: activeId,
      urlId: _urlId2,
      projectFound: !!projectIfAny,
      hasPattern: !!(projectIfAny && projectIfAny.pattern),
      hasP: !!(projectIfAny && projectIfAny.p),
      hasSettings: !!(projectIfAny && projectIfAny.settings),
      keys: projectIfAny ? Object.keys(projectIfAny).slice(0, 20) : null
    };
    try {
      if (shouldWarn && ProjectStorage && ProjectStorage.listProjects) {
        ProjectStorage.listProjects().then(function (l) {
          diag.libraryCount = (l || []).length;
          diag.libraryIds = (l || []).slice(0, 5).map(function (m) { return m && m.id; });
          console.warn('[TrackerApp] Could not load a project on mount:', diag);
        }).catch(function () {
          console.warn('[TrackerApp] Could not load a project on mount:', diag);
        });
      } else if (shouldWarn) {
        console.warn('[TrackerApp] Could not load a project on mount:', diag);
      }
    } catch (_) {
      if (shouldWarn) console.warn('[TrackerApp] Could not load a project on mount:', diag);
    }
    // Only clear the pointer when the URL didn't ask for a specific id —
    // if it did, we want to keep the pointer for the next reload attempt.
    if (activeId && !_urlId2) {
      try { ProjectStorage.clearActiveProject && ProjectStorage.clearActiveProject(); } catch (_) {}
    }
    if (shouldWarn && window.Toast && window.Toast.show) {
      window.Toast.show({ message: 'No pattern found. Please select a project from your library.', type: 'warning', duration: 6000 });
    }
  }

  Promise.resolve().then(function () {
    if (hasLoadedOnceRef.current) return;
    // Step 1: ?id= → direct IDB load
    var step1;
    if (_urlId2 && /^proj_/.test(_urlId2) && ProjectStorage && ProjectStorage.get) {
      step1 = ProjectStorage.get(_urlId2).catch(function () { return null; });
    } else {
      step1 = Promise.resolve(null);
    }
    step1.then(function (urlProject) {
      if (hasLoadedOnceRef.current) return;
      if (_hydrate(urlProject, 'url-id')) return;
      // Step 2: fall back to active-project pointer
      ProjectStorage.getActiveProject().then(function (project) {
        if (hasLoadedOnceRef.current) return;
        if (_hydrate(project, 'active-pointer')) return;
        var activeId = ProjectStorage.getActiveProjectId ? ProjectStorage.getActiveProjectId() : null;
        _failLoad(activeId, project || urlProject);
      }).catch(function (err) {
        console.error('Failed to load active project:', err);
        _failLoad(null, urlProject);
      });
    });
  });
}, []);

// ═══ Tracker auto-save ═══
// Marks the project as dirty on every relevant state change but defers the
// expensive snapshot serialisation until the 5-second debounce timer fires.
// lastSnapshotRef is rebuilt lazily by buildSnapshot() for beforeunload.
const buildSnapshotRef = useRef(null);
const buildSnapshot = () => {
  const statsSessions=statsSessionsRef.current;
  if (!pat || !pal) return null;
  if (!projectIdRef.current) {
    projectIdRef.current = ProjectStorage.newId();
    // Legacy/imported unsaved projects acquire their durable accounting identity
    // with the first project save, keeping the load-time historical checkpoint.
    if(rtContextRef.current&&!rtContextRef.current.projectId)rtContextRef.current.projectId=projectIdRef.current;
    console.warn('[stitchx/tracker] buildSnapshot: projectIdRef was null — assigning new id', projectIdRef.current, new Error().stack);
  }
  if (!createdAtRef.current) createdAtRef.current = new Date().toISOString();
  const sseArr = [...singleStitchEdits.entries()];
  const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
    fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb, brand: cellBrandForSave(hs.fwd, threadBrand) } : undefined,
    bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb, brand: cellBrandForSave(hs.bck, threadBrand) } : undefined
  }]);
  const hdArr = [...halfDoneRef.current.entries()];
  const psArr = partialsForSave(partialStitches, threadBrand);
  // Derive stitchLog from statsSessions (single source of truth).
  // Groups netStitches by date so stitchLog always matches what statsSessions says.
  const _logMap = {};
  (statsSessions || []).forEach(s => {
    if (!s || !s.date) return;
    _logMap[s.date] = (_logMap[s.date] || 0) + (ProgressUnits.sessionNet(s) || 0);
  });
  const _derivedLog = Object.entries(_logMap)
    .filter(([, c]) => c !== 0)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
  if (v3FieldsRef.current) v3FieldsRef.current.stitchLog = _derivedLog;
  return {
    version: 11, id: projectIdRef.current, page: "tracker", name: projectName,
    designer: projectDesigner, description: projectDescription, notes: projectNotes || undefined,
    namePromptShown: namePromptShownRef.current || undefined,
    nameAutoGenerated: nameAutoGeneratedRef.current || undefined,
    symbols: symbolsRef.current || undefined,
    createdAt: createdAtRef.current, updatedAt: new Date().toISOString(),
    settings: { sW, sH, fabricCt, skeinPrice, stitchSpeed, wastePrefs, fabricColour: projectFabricColour || undefined, threadBrand: threadBrandForSave(threadBrand) },
    pattern: (window.PatternIO ? window.PatternIO.serializePattern(pat, threadBrand) : pat.map(m => (m.id === "__skip__" || m.id === "__empty__") ? { id: m.id } : { id: m.id, type: m.type, rgb: m.rgb })),
    bsLines, done: doneRef.current ? Array.from(doneRef.current) : null, parkMarkers,
    hlRow, hlCol, threadOwned, originalPaletteState,
    singleStitchEdits: sseArr, halfStitches: hsArr, halfDone: hdArr, partialStitches: psArr,
    specialtyVersion:1,specialtyStitches,specialtyDone:specialtyDoneRef.current,
    knots: knotsForSave(knots, threadBrand), knotsDone: knotsDoneRef.current.slice(),
    bsDone: window.Backstitch ? (window.Backstitch.forSave(Array.from(bsDoneSetRef.current))||[]) : [], partialDone: window.Fractional ? (window.Fractional.forSave(partialDoneRef.current)||[]) : [], beads: beadsRef.current, beadsDone: beadsDoneRef.current.slice(),
    activeSessionCheckpoint:getSessionCheckpoint(),
    statsSessions:statsSessionsRef.current, deletedSessionIds: deletedSessionIdsRef.current.length ? deletedSessionIdsRef.current.slice() : undefined, statsSettings, achievedMilestones, doneSnapshots, deletedSnapshotIds:deletedSnapshotIdsRef.current.slice(),
    savedZoom: stitchZoom,
    savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft + chartScrollOffset().x, top: stitchScrollRef.current.scrollTop + chartScrollOffset().y } : null,
    breadcrumbs, stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence, workArea,
    workingContext: workingContextForSave(focusColour, stitchMode, stitchView, highlightMode),
    ...v3FieldsRef.current
  };
};
buildSnapshotRef.current = buildSnapshot;
// The project exactly as it is now. buildSnapshot() reads `done` from the last
// render; doneRef is updated synchronously on every mark, so use that, and apply
// a drag that has not been released yet. Reads refs only and never changes drag
// state, so it is safe from the unload, tab-hidden and backup/sync flush paths.
function snapshotNow() {
  const fresh = buildSnapshotRef.current ? buildSnapshotRef.current() : null;
  if (!fresh) return lastSnapshotRef.current;
  const live = doneRef.current;
  if (!live || !fresh.pattern || live.length !== fresh.pattern.length) return fresh;
  const d = Array.from(live);
  // A drag that has not been released yet: cells it has crossed are committed on
  // release (_commitBulk), so include them with the same filters. Ranges are not
  // included; they are only a selection until confirmed.
  const g = dragMarkGetStateRef.current ? dragMarkGetStateRef.current() : null;
  if (g && g.mode === 'drag' && g.path && g.path.size) {
    const want = g.intent === 'mark' ? 1 : 0;
    const allowed = dragCommitFilterRef.current;
    g.path.forEach(idx => {
      const c = fresh.pattern[idx];
      if (!c || c.id === '__skip__' || c.id === '__empty__') return;
      if (allowed && !allowed(idx)) return;
      d[idx] = want;
    });
  }
  return { ...fresh, done: d };
}
// ── Save badge status ──
function refreshSaveUi() {
  const u = saveUiRef.current;
  const unsaved = uiGenRef.current > uiSavedGenRef.current;
  const next = u.error ? 'error' : u.conflict ? 'conflict' : (u.inFlight > 0 || unsaved) ? 'saving' : (u.savedOnce ? 'saved' : 'idle');
  setSaveStatus(next);
  setSaveError(u.error || null);
}
function beginSave() { saveUiRef.current.inFlight++; refreshSaveUi(); return saveUiRef.current.epoch; }
// ok === true: written; ok === false: failed (err says why); ok === null: the page is reloading, say nothing.
function endSave(ok, uiGen, err, epoch) {
  const u = saveUiRef.current;
  if (epoch !== u.epoch) return;      // started for a project that has since been replaced
  u.inFlight = Math.max(0, u.inFlight - 1);
  if (ok === true) {
    u.error = null; u.savedOnce = true;
    uiSavedGenRef.current = Math.max(uiSavedGenRef.current, uiGen);
    setSavedAt(new Date());
  } else if (ok === false) {
    u.error = (err && err.message) ? err : new Error(typeof err === 'string' ? err : 'Could not save');
  }
  refreshSaveUi();
}
function retrySave() {
  saveUiRef.current.error = null;
  refreshSaveUi();
  try { const r = window.__flushProjectToIDB && window.__flushProjectToIDB(); if (r && r.catch) r.catch(function () {}); } catch (_) {}
}

// ── Progress record writer ──
// Writes the marks, and only the marks, to ProjectStorage's small progress record.
// Saving the whole project takes up to ~150 ms on a large chart so it happens every
// few seconds; this is far smaller, so marks are safe within about half a second
// (a few seconds on a large chart, see scheduleProgressWrite).
function writeProgressNow() {
  if (progressTimerRef.current) { clearTimeout(progressTimerRef.current); progressTimerRef.current = null; }
  const o = progressOwnerRef.current;
  if (!o || !o.id || savesBlockedRef.current) return;
  lastProgressWriteRef.current = Date.now();
  // The freshest marks, but only if they belong to the project the owner names.
  const live = doneRef.current;
  const done = (live && projectIdRef.current === o.id && live.length === o.done.length) ? live : o.done;
  const seen = window.CrossTabCoord && window.CrossTabCoord.getSeen ? window.CrossTabCoord.getSeen(o.id) : null;
  if(projectIdRef.current===o.id)writeSessionCheckpoint();
  const recoverySnapshot = isUnloadingRef.current ? snapshotNow() : null;
  try {
    const recovery = recoverySnapshot && recoverySnapshot.id === o.id ? recoverySnapshot : null;
    const data = {
      done: recovery ? recovery.done : done,
      halfDone: recovery ? recovery.halfDone : (projectIdRef.current===o.id ? [...halfDoneRef.current.entries()] : [...o.halfDone.entries()]),
      beadsDone: recovery ? recovery.beadsDone || [] : (projectIdRef.current===o.id?beadsDoneRef.current:o.beadsDone),
      knotsDone: recovery ? recovery.knotsDone || [] : (projectIdRef.current===o.id?knotsDoneRef.current:o.knotsDone),
      bsDone: recovery ? recovery.bsDone || [] : (projectIdRef.current===o.id?Array.from(bsDoneSetRef.current):o.bsDone),
      specialtyDone:recovery?recovery.specialtyDone||[]:(projectIdRef.current===o.id?specialtyDoneRef.current:o.specialtyDone),
      partialDone: recovery ? recovery.partialDone || [] : (window.Fractional && window.Fractional.forSave(projectIdRef.current===o.id?partialDoneRef.current:o.partialDone)) || [],
      baseWriteAt: seen && typeof seen.lastWriteAt === 'number' ? seen.lastWriteAt : null,
      tabId: window.CrossTabCoord ? window.CrossTabCoord.tabId : null
    };
    if (recovery) ProjectStorage.saveProgressRecovery(o.id, data);
    const uiGen = uiGenRef.current, epoch = saveUiRef.current.epoch;
    const r = ProjectStorage.saveProgress(o.id, data);
    // The gap to the next write runs from when this one finishes: the write's
    // own work (the sync record) runs inside its transaction, after this returns.
    if (r && r.then) r.then(function (ok) {
      lastProgressWriteRef.current = Date.now();
      if (!recovery) progressWriteFailed(ok !== true, o.id);
      // With only marks unsaved, they are now on disk: the badge says Saved
      // although the full save may be deferred (see the autosave effect).
      if (ok === true && !recovery && !autoSaveOtherDirtyRef.current && epoch === saveUiRef.current.epoch
          && projectIdRef.current === o.id && progressRecordCovers()) {
        uiSavedGenRef.current = Math.max(uiSavedGenRef.current, uiGen);
        saveUiRef.current.savedOnce = true;
        setSavedAt(new Date());
        refreshSaveUi();
      }
    }, function () { if (!recovery) progressWriteFailed(true, o.id); });
  } catch (_) {}
  return recoverySnapshot;
}
// Marks-only autosave on large charts: wait for this long a pause in marking, but no
// longer than the cap since the first such change (see the autosave effect).
const AUTOSAVE_MARKS_IDLE_MS = 60000;
const AUTOSAVE_MARKS_CAP_MS = 300000;
// A progress write that fails leaves marks only in memory. Stop treating it as
// cover, and if a full save is being held back for marks, write everything now.
function progressWriteFailed(failed, id) {
  if (projectIdRef.current !== id) return;   // a write for a project that has since been replaced says nothing about this one
  progressFailedRef.current = !!failed;
  if (!failed || !autoSaveMarksSinceRef.current || progressKickRef.current) return;
  progressKickRef.current = setTimeout(() => {
    progressKickRef.current = null;
    try { const r = window.__flushProjectToIDB && window.__flushProjectToIDB(); if (r && r.catch) r.catch(() => {}); } catch (_) {}
  }, 1000);
}
// Before another project replaces this one, write anything unsaved: a full save held
// back for marks (see the autosave effect), or one still waiting on its debounce,
// would otherwise be dropped when the effect's timer is cleared by the switch. Runs
// while this project is still the loaded one, so the snapshot is of it.
function flushBeforeSwitch() {
  if (!autoSaveDirtyRef.current || autoSaveGenRef.current === flushedGenRef.current || typeof window.__flushProjectToIDB !== 'function') return Promise.resolve();
  return Promise.resolve().then(() => window.__flushProjectToIDB()).catch(e => console.warn('Saving before switching projects failed:', e));
}
// Whether a progress write for the open project will be read back on reload: it
// must be based on the project's last full save (CrossTabCoord's last-seen write,
// set on load and by every save), saving must be working, and the last progress
// write must have succeeded.
function progressRecordCovers() {
  const id = projectIdRef.current;
  if (!id || savesBlockedRef.current || saveUiRef.current.error || saveUiRef.current.conflict) return false;
  if (progressFailedRef.current) return false;
  if (typeof ProjectStorage === 'undefined' || typeof ProjectStorage.saveProgress !== 'function') return false;
  const seen = window.CrossTabCoord && window.CrossTabCoord.getSeen ? window.CrossTabCoord.getSeen(id) : null;
  return !!seen && typeof seen.lastWriteAt === 'number';
}
// Throttled, not debounced: the first mark after a pause is written ~400 ms later
// however steadily marking continues. On a large chart each write also rebuilds
// the sync record for every finished stitch (seconds on a phone, until that is
// made incremental), and now that a tap commits on its own every tap would start
// one; so there, a write starts at least PROGRESS_GAP_LARGE_MS after the last one
// finished. Hiding or closing the tab still writes at once.
const PROGRESS_GAP_LARGE_MS = 3000;
function scheduleProgressWrite() {
  if (progressTimerRef.current) return;
  const gap = pat && pat.length > 40000 ? PROGRESS_GAP_LARGE_MS : 0;
  progressTimerRef.current = setTimeout(writeProgressNow, Math.max(400, lastProgressWriteRef.current + gap - Date.now()));
}
const writeProgressNowRef = useRef(null);
writeProgressNowRef.current = writeProgressNow;
const scheduleProgressWriteRef = useRef(null);
scheduleProgressWriteRef.current = scheduleProgressWrite;
useEffect(() => {
  if (!pat || !pal) return;
  autoSaveDirtyRef.current = true;
  // Debounce 5 s after the last change, but cap how long a change can stay unsaved:
  // without a cap, marking steadily (each mark restarts the timer) saved nothing
  // until the first 5 s pause. A full save of a very large chart costs about
  // 150 ms of main thread (structured clone of the whole record), so charts over
  // 40,000 stitches get a longer cap rather than a hitch every 10 s.
  autoSaveGenRef.current++;
  // Marks-only changes on a large chart. The progress record (writeProgressNow)
  // already has every mark on disk within a few seconds, and reloading applies it
  // while it is based on the project's last full save. The full save rewrites the
  // whole chart — seconds of main thread on a phone for a large, well-progressed
  // chart — so for marks alone it waits for a pause in marking (AUTOSAVE_MARKS_IDLE_MS)
  // and runs at least every AUTOSAVE_MARKS_CAP_MS. Any other change saves as before,
  // and hiding or leaving the page still writes everything at once.
  const _other = [pat, pal, bsLines, parkMarkers, totalTime, hlRow, hlCol, threadOwned, halfStitches, singleStitchEdits, knots, specialtyStitches,
    sW, sH, fabricCt, skeinPrice, stitchSpeed, wastePrefs, originalPaletteState, statsSessions, statsSettings, projectName, stitchZoom, doneSnapshots,
    projectDesigner, projectDescription, projectNotes, partialStitches, projectFabricColour, threadBrand,
    stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence, workArea, breadcrumbs, focusColour, stitchMode, stitchView, highlightMode, achievedMilestones];
  const _prevOther = autoSaveOtherRef.current;
  autoSaveOtherRef.current = _other;
  if (!_prevOther || _other.some((v, i) => !Object.is(v, _prevOther[i]))) autoSaveOtherDirtyRef.current = true;
  const _deferMarks = pat.length > 40000 && !autoSaveOtherDirtyRef.current && progressRecordCovers();
  if (!_deferMarks) autoSaveMarksSinceRef.current = null;
  else if (!autoSaveMarksSinceRef.current) autoSaveMarksSinceRef.current = Date.now();
  if (!_deferMarks && !autoSaveFirstDirtyRef.current) autoSaveFirstDirtyRef.current = Date.now();
  const _autoSaveCap = pat.length > 40000 ? 20000 : 10000;
  const _autoSaveDelay = _deferMarks
    ? Math.max(0, Math.min(AUTOSAVE_MARKS_IDLE_MS, AUTOSAVE_MARKS_CAP_MS - (Date.now() - autoSaveMarksSinceRef.current)))
    : Math.max(0, Math.min(5000, _autoSaveCap - (Date.now() - autoSaveFirstDirtyRef.current)));
  const saveTimer = setTimeout(() => {
    autoSaveFirstDirtyRef.current = null;
    autoSaveMarksSinceRef.current = null;
    if (!autoSaveDirtyRef.current) return;
    autoSaveDirtyRef.current = false;
    // The snapshot below holds everything; a later change sets this again. A save
    // that does not get written (held, refused, failed) puts it back, so non-mark
    // changes are never treated as covered by the progress record.
    const _hadOther = autoSaveOtherDirtyRef.current;
    autoSaveOtherDirtyRef.current = false;
    const _gen = autoSaveGenRef.current;
    const _uiGen = uiGenRef.current;
    const project = buildSnapshot();
    if (!project) { if (_hadOther) autoSaveOtherDirtyRef.current = true; return; }
    lastSnapshotRef.current = project;
    let _ended = false;
    const _epoch = beginSave();
    const endOnce = (ok, err) => { if (_ended) return; _ended = true; endSave(ok, _uiGen, err, _epoch); };
    persistProjectRecord(project).then(function(saveResult){
      const _ok = !!(saveResult && saveResult.ok !== false && !noWriteReason(saveResult.reason));
      if(!_ok&&_hadOther)autoSaveOtherDirtyRef.current=true;
      if(_ok){flushedGenRef.current=Math.max(flushedGenRef.current,_gen);
        // The full save changed the project's write time, which retires the progress record; if marks arrived while it ran, write a fresh one.
        if(autoSaveGenRef.current!==_gen)scheduleProgressWriteRef.current();}
      endOnce(_ok ? true : (saveResult && noWriteReason(saveResult.reason) ? null : false), saveResult && saveResult.reason);
      if(saveResult&&noWriteReason(saveResult.reason))return null;
      if(!_ok)return null;
      // No second copy under the legacy "auto_save" key here: on a large chart
      // it cloned the whole record again (~350 ms of main thread per autosave).
      // The project record just written is what every page opens, and
      // loadProjectFromDB() prefers it over the legacy copy when both name the
      // same project. Leaving the page, handing off to the Creator and explicit
      // flushes still refresh the legacy copy.
      return Promise.resolve().then(function(){
        // Keep the Creator's tracker-field preservation container in sync so that if
        // the user switches to Creator mode, the next Creator auto-save won't overwrite
        // sessions, stats settings, milestones, etc. with stale data.
        try{
          if(typeof window.__updateCreatorTrackerFields==='function'){
            var _v3=v3FieldsRef.current||{};
            window.__updateCreatorTrackerFields({
            chartRevision:project.chartRevision,chartAccountingUnits:project.chartAccountingUnits,meta:project.meta,
              statsSessions:project.statsSessions, deletedSessionIds:project.deletedSessionIds, statsSettings:project.statsSettings,
              achievedMilestones:project.achievedMilestones, doneSnapshots:project.doneSnapshots, deletedSnapshotIds:project.deletedSnapshotIds,
              breadcrumbs:project.breadcrumbs, stitchingStyle:project.stitchingStyle,
              blockW:project.blockW, blockH:project.blockH, focusBlock:project.focusBlock, workArea:project.workArea, workingContext:project.workingContext,
              startCorner:project.startCorner, colourSequence:project.colourSequence,
              originalPaletteState:project.originalPaletteState,
              singleStitchEdits:project.singleStitchEdits,
              halfStitches:project.halfStitches, halfDone:project.halfDone,
              specialtyDone:project.specialtyDone, knotsDone:project.knotsDone, bsDone:project.bsDone, partialDone:project.partialDone, beads:project.beads, beadsDone:project.beadsDone, notes:project.notes,
              finishStatus:_v3.finishStatus, startedAt:_v3.startedAt,
              lastTouchedAt:_v3.lastTouchedAt, completedAt:_v3.completedAt,
              stitchLog:_v3.stitchLog
            });
          }
          if(typeof window.__setCreatorProjectName==='function') window.__setCreatorProjectName(projectName||'');
        }catch(e){}
        if (typeof StashBridge !== "undefined" && skeinData.length > 0) {
          return StashBridge.syncProjectToLibrary(
            projectIdRef.current,
            projectName || `${sW}×${sH} pattern`,
            skeinData,
            combinedDone >= combinedTotal && combinedTotal > 0 ? "completed" : "inprogress",
            fabricCt
          ).catch(err => console.error("Library sync failed:", err));
        }
        return null;
      });
    }).catch(err => { console.error("Tracker auto-save failed:", err); if (_hadOther) autoSaveOtherDirtyRef.current = true; endOnce(false, err); });
  }, _autoSaveDelay);
  return () => clearTimeout(saveTimer);
}, [pat, pal, done, bsLines, parkMarkers, totalTime, hlRow, hlCol, threadOwned,
    halfStitches, halfDone, singleStitchEdits, knots, knotsDone, beadsDone, bsDone, partialDone, specialtyStitches, specialtyDone,
    sW, sH, fabricCt, skeinPrice, stitchSpeed, wastePrefs, originalPaletteState, statsSessions, statsSettings, projectName, stitchZoom, doneSnapshots,
    // Everything else buildSnapshot() persists, so an edit to any of it is saved on its own (it used to wait for some unrelated change).
    projectDesigner, projectDescription, projectNotes, partialStitches, projectFabricColour, threadBrand,
    stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence, workArea, breadcrumbs, focusColour, stitchMode, stitchView, highlightMode, achievedMilestones]);

// Save the freshest snapshot before the page unloads (best-effort fire-and-forget).
// Uses only refs so the handler is never stale; drag in-progress mutations are applied
// from dragChangesRef before saving.
useEffect(() => {
  const handleBeforeUnload = () => {
    try {
    isUnloadingRef.current = true;
    if (savesBlockedRef.current) return;   // a question about the saved marks is open: leave the stored project untouched
    // Commit the filtered drag snapshot synchronously before navigation can stop IDB.
    const recovery = writeProgressNowRef.current();
    // Reuse that fresh snapshot for the best-effort full save.
    let project = null;
    const fresh = recovery || snapshotNow();
    if (fresh) { project = fresh; lastSnapshotRef.current = fresh; }
    if (!project) project = lastSnapshotRef.current;
    if (!project) return;
    let projectToSave = project;
    // Finalise any active auto-session and merge into the snapshot
    const finalisedSession = finaliseAutoSessionRef.current ? finaliseAutoSessionRef.current({trimIfIdle:true}) : null;
    if (finalisedSession) {
      // A run that crossed the day end was saved as one record per day: merge all of them, not the whole run.
      const finalisedRecords = finalisedSession.records || [finalisedSession];
      const existingSessions = Array.isArray(projectToSave.statsSessions) ? projectToSave.statsSessions : [];
      const missing = finalisedRecords.filter(r => !existingSessions.some(s => s && s.id === r.id));
      if (missing.length) {
        projectToSave = {
          ...projectToSave,
          statsSessions: [...existingSessions, ...missing],
          updatedAt: new Date().toISOString()
        };
      }
    }
    lastSnapshotRef.current = projectToSave;
    ProjectStorage.save(projectToSave)
      .then(id => ProjectStorage.setActiveProject(id))
      .catch(err => console.error("Tracker unload auto-save failed:", err));
    saveProjectToDB(projectToSave)
      .catch(err => console.error("Tracker DB unload auto-save failed:", err));
    // Flush any pending RT stash deduction before the page closes.
    // Fire-and-forget (async; browser may not wait, but IndexedDB writes are usually fast).
    if(rtDebounceRef.current){clearTimeout(rtDebounceRef.current);rtDebounceRef.current=null;}
    flushRtStashWriteRef.current().catch(()=>{});
    } catch(e) {}
  };
  // pagehide covers iOS Safari and bfcache navigation where beforeunload may not fire.
  // persisted=true means the page is entering the bfcache (not being destroyed), but
  // we still finalise and back up — the session will be deduplicated on recovery if
  // the page is restored and used again.
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("pagehide", handleBeforeUnload);
  return () => { window.removeEventListener("beforeunload", handleBeforeUnload); window.removeEventListener("pagehide", handleBeforeUnload); };
}, []); // empty: handler reads only from refs (always fresh)

// Expose __openTrackerStats so the header Stats link can open per-project stats
// directly from the track page without navigating away. Optional targetId lets
// callers (e.g. the standalone Stats page's project-card click) request a
// specific project's stats — StatsContainer will lazy-load it from IDB if it
// isn't the currently-open one.
// This project's own Stats (not whichever tab was open last, and not the all-projects tab the page starts on).
function openProjectStats(){setStatsTab(projectIdRef.current||'all');setStatsView(true);}
useEffect(() => {
  window.__openTrackerStats = function(targetId) {
    setStatsTab(targetId || projectIdRef.current || 'all');
    setStatsView(true);
  };
  return () => { delete window.__openTrackerStats; };
}, []);

// Expose flush for BackupRestore, Sync and the Stats refresh to call before they
// read IndexedDB. It saves a complete, current snapshot (snapshotNow), so it can
// never write a record that lacks the pattern or carries a stale `done`; both
// happened when this built a partial object on top of the last autosave. While
// the page is unloading the unload handler owns the write; refuse export then.
useEffect(() => {
  window.__flushProjectToIDB = async function() {
    if (isUnloadingRef.current || window.__restoringBackup > Date.now()) throw new Error("Project saving is paused.");
    await flushRtStashWriteRef.current();
    const project = snapshotNow();
    if (!project) return;
    lastSnapshotRef.current = project;
    const _gen = autoSaveGenRef.current;
    const _uiGen = uiGenRef.current;
    const _epoch = beginSave();
    let saveResult;
    try { saveResult = await persistProjectRecord(project); }
    catch (err) { endSave(false, _uiGen, err, _epoch); throw err; }
    const _flushOk = !!(saveResult && saveResult.ok !== false && !noWriteReason(saveResult.reason));
    if (_flushOk) flushedGenRef.current = Math.max(flushedGenRef.current, _gen);
    endSave(_flushOk ? true : (saveResult && noWriteReason(saveResult.reason) ? null : false), _uiGen, saveResult && saveResult.reason, _epoch);
    if (!_flushOk) throw new Error("The current project was not saved: " + (saveResult && saveResult.reason || "unknown failure"));
    await saveProjectToDB(project, { strict: true });
    // Retire the queued autosave only after both writes succeed, and only
    // while this is still the same project's unchanged generation. A later
    // mark must keep its own dirty flag and timer.
    if(projectIdRef.current===project.id&&autoSaveGenRef.current===_gen){
      autoSaveDirtyRef.current=false;
      autoSaveFirstDirtyRef.current=null;
      autoSaveOtherDirtyRef.current=false;
      autoSaveMarksSinceRef.current=null;
    }
    return saveResult;
  };
  return () => {
    // Replace with a snapshot-based fallback rather than deleting outright.
    // If a backup or sync flush is requested during the mode-switch gap before
    // the Creator registers its own handler, this ensures IDB is still written.
    var last = snapshotNow();
    window.__flushProjectToIDB = async function() {
      if (last) {
        const saveResult = await persistProjectRecord(last);
        if (!saveResult || saveResult.ok === false || noWriteReason(saveResult.reason)) throw new Error("The current project was not saved.");
        await saveProjectToDB(last, { strict: true });
        return saveResult;
      }
    };
  };
}, []);

// Save when the tab is hidden (switching app, locking the phone, switching tab).
// This is the one event mobile browsers reliably deliver before they suspend or
// discard a page; unload events often never fire there. Only writes when something
// changed since the last write (generation counters), so merely switching tabs
// costs nothing and a successful flush is not repeated on every later hide.
useEffect(() => {
  function onVisibility() {
    if (document.visibilityState !== 'hidden') return;
    writeProgressNowRef.current();
    if (autoSaveGenRef.current === flushedGenRef.current) return;
    try { const r = window.__flushProjectToIDB && window.__flushProjectToIDB(); if (r && r.catch) r.catch(function(){}); } catch (_) {}
  }
  // A page restored from the back/forward cache was not really unloaded: the
  // unload handler's flag must not keep blocking flushes and new sessions.
  function onPageShow(e) { if (e && e.persisted) isUnloadingRef.current = false; }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pageshow', onPageShow); };
}, []);

// Count changes to data the project saves (not zoom or the guide), for the save badge.
useEffect(() => {
  if (!pat) return;
  uiGenRef.current++;
  refreshSaveUi();
}, [pat, done, bsLines, parkMarkers, halfStitches, halfDone, singleStitchEdits, knots, knotsDone, beadsDone, bsDone, partialDone, specialtyStitches, specialtyDone,
    statsSessions, statsSettings, projectName, doneSnapshots, achievedMilestones, threadOwned,
    originalPaletteState, sW, sH, fabricCt, skeinPrice, stitchSpeed, wastePrefs,
    projectDesigner, projectDescription, projectNotes, partialStitches, projectFabricColour, threadBrand,
    stitchingStyle, blockW, blockH, startCorner, colourSequence, workArea, breadcrumbs]);
// A cross-tab conflict dialog is open: the changes are not saved until it is answered.
useEffect(() => {
  function onConflict(e) {
    saveUiRef.current.conflict = !!(e && e.detail && e.detail.open);
    refreshSaveUi();
  }
  window.addEventListener('cs:conflictState', onConflict);
  return () => window.removeEventListener('cs:conflictState', onConflict);
}, []);

// Keep the progress record's owner current and schedule a write when marks change.
useEffect(() => {
  const id = projectIdRef.current;
  if (!pat || !done || !id) return;
  // A project switch inside the page: write the old project's pending marks before the
  // owner changes, or the timer would fire for the new project and drop them.
  const _prev = progressOwnerRef.current;
  if (_prev && _prev.id !== id && progressTimerRef.current) writeProgressNow();
  progressOwnerRef.current = { id, done, halfDone, knotsDone, beadsDone, bsDone, partialDone, specialtyDone };
  const b = progressBaseRef.current;
  if (b.id !== id) {                       // just loaded or switched: nothing has changed yet
    progressBaseRef.current = { id, done, halfDone, knotsDone, beadsDone, bsDone, partialDone, specialtyDone };
    uiSavedGenRef.current = uiGenRef.current;     // what was just loaded is what is stored
    // Another project: its own save state, and writes still running for the old one must not touch it.
    { const u = saveUiRef.current; u.error = null; u.savedOnce = false; u.inFlight = 0; u.conflict = false; u.epoch++; }
    setSavedAt(null);
    refreshSaveUi();
    return;
  }
  if (b.done === done && b.halfDone === halfDone && b.knotsDone === knotsDone && b.beadsDone === beadsDone && b.bsDone === bsDone && b.partialDone === partialDone && b.specialtyDone === specialtyDone) return;
  scheduleProgressWrite();
}, [done, halfDone, knotsDone, beadsDone, bsDone, partialDone, specialtyDone]);
useEffect(() => () => { if (progressTimerRef.current) clearTimeout(progressTimerRef.current); }, []);

// Counting aids (block counts, run-length badges, ninja stars) are drawn in this neutral
// style: a light fill with a dark outline and dark text, so they read on any thread colour in either theme.
const COUNTING_AIDS_INK="#1B1814",COUNTING_AIDS_FILL="rgba(255,255,255,0.94)";
// Smallest cell (px) at which they are drawn: a badge is 11 px tall, so on smaller cells they pile up.
const COUNTING_AIDS_MIN_CELL=12;
// ── Zoom-adaptive tier helpers ──
// Compute rendering tier (1–4) from cell size with hysteresis.
// Thresholds — appear/disappear: T1↔T2 5px/3px, T2↔T3 13px/10px, T3↔T4 26px/22px
function computeDetailTier(cSz,cur){
  let t=cur;
  for(let i=0;i<4;i++){let n=t;if(t===1){if(cSz>=5)n=2;}else if(t===2){if(cSz<3)n=1;else if(cSz>=13)n=3;}else if(t===3){if(cSz<10)n=2;else if(cSz>=26)n=4;}else{if(cSz<22)n=3;}if(n===t)break;t=n;}
  return t;
}
// Symbol font size: Tier 3 (12–24px) scales 7→14px linearly; Tier 4 continues growing
function tierSymFontSz(cSz){
  if(cSz<=12)return 7;
  if(cSz<=24)return Math.round(7+(cSz-12)*7/12);
  return Math.round(14+(cSz-24)*0.5);
}

// French knots as saved: {x, y, id, rgb}, or nothing when there are none, so
// projects without knots save exactly as before.
// The working context a stitcher comes back to: which colour they were on, Mark or Navigate, and how the
// chart was drawn. Saved with the project as one optional field and checked on the way back in, because the
// record may come from another device, an older build, or a pattern since edited in the Creator.
function workingContextForSave(colour, mode, view, highlight) {
  var wc = {};
  if (colour) wc.colour = colour;
  if (mode === "navigate") wc.mode = mode;
  if (view && view !== "symbol") wc.view = view;
  if (view === "highlight" && highlight) wc.highlight = highlight;
  return Object.keys(wc).length ? wc : undefined;
}
function normaliseWorkingContext(wc, pal) {
  if (!wc || typeof wc !== "object") return null;
  var out = { colour: null, mode: "track", view: null, highlight: null };
  if (typeof wc.colour === "string" && Array.isArray(pal) && pal.some(function (m) { return m && m.id === wc.colour; })) out.colour = wc.colour;
  if (wc.mode === "navigate" || wc.mode === "track") out.mode = wc.mode;
  if (wc.view === "symbol" || wc.view === "colour" || wc.view === "highlight") out.view = wc.view;
  if (wc.highlight === "isolate" || wc.highlight === "outline" || wc.highlight === "tint" || wc.highlight === "spotlight") out.highlight = wc.highlight;
  // Highlighting needs a colour to highlight.
  if (out.view === "highlight" && !out.colour) { out.view = null; out.highlight = null; }
  return out;
}
function knotsForSave(knots, projectBrand) {
  return knots && knots.length ? window.Knots.forSave(knots, projectBrand) : undefined;
}

// ═══ Half-stitch cell rendering ═══
// Renders half-stitch triangle fills, diagonal lines, and symbols for one cell.
// Called from inside drawStitch.
function _drawHalfStitchCell(ctx, px, py, cSz, hs, hd, cmap, view, focusColour, dimmed, lowZoom, medZoom, highZoom) {
  const dirs = ["fwd", "bck"];
  for (let di = 0; di < dirs.length; di++) {
    const dir = dirs[di];
    const stitch = hs[dir];
    if (!stitch) continue;
    const info = cmap ? cmap[stitch.id] : null;
    const isDn = hd[dir] ? true : false;
    const rgb = stitch.rgb;
    const isFiltered = view === "highlight" && focusColour;
    const matchesFilter = isFiltered && stitch.id === focusColour;
    const nonMatch = isFiltered && !matchesFilter;

    // Determine opacities based on view mode and done state
    let triAlpha, lineAlpha, lineWidth, showSymbol, symAlpha, symColor;

    if (view === "highlight" && isFiltered) {
      // Colour filter active
      if (matchesFilter) {
        triAlpha = 0.20;
        lineAlpha = 1.0;
        lineWidth = 2.5;
        showSymbol = true;
        symAlpha = 1.0;
        symColor = luminance(rgb) > 140 ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.95)";
      } else {
        triAlpha = 0.04;
        lineAlpha = 0.10;
        lineWidth = 1;
        showSymbol = false;
        symAlpha = 0;
        symColor = "rgba(161,161,170,0.1)";
      }
    } else if (view === "highlight" && !isFiltered) {
      // Highlight mode, no filter — treat as tracker unmarked
      triAlpha = isDn ? 0.40 : 0.06;
      lineAlpha = isDn ? 1.0 : 0.28;
      lineWidth = isDn ? 2.5 : 1.5;
      showSymbol = !isDn;
      symAlpha = isDn ? 0 : 0.3;
      symColor = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.3)`;
    } else if (view === "colour" || view === "symbol") {
      // Pattern chart view (designing/reading) — also used as tracker symbol/colour views
      triAlpha = isDn ? 0.40 : 0.12;
      lineAlpha = isDn ? 1.0 : 1.0;
      lineWidth = isDn ? 2.5 : 2;
      showSymbol = !isDn && view === "symbol";
      symAlpha = 1.0;
      symColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    } else {
      // Default fallback
      triAlpha = 0.12;
      lineAlpha = 1.0;
      lineWidth = 2;
      showSymbol = true;
      symAlpha = 1.0;
      symColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    }

    // Apply greying for non-matching in highlight
    const drawRgb = nonMatch ? [161,161,170] : rgb;

    // Zoom-level thresholds
    if (lowZoom) {
      // Triangle fill only
      drawHalfTriangle(ctx, px, py, cSz, dir, drawRgb, triAlpha);
    } else if (medZoom) {
      // Triangle fill + diagonal line
      drawHalfTriangle(ctx, px, py, cSz, dir, drawRgb, triAlpha);
      drawHalfLine(ctx, px, py, cSz, dir, drawRgb, lineAlpha, lineWidth);
    } else {
      // Full detail: triangle + line + symbol
      drawHalfTriangle(ctx, px, py, cSz, dir, drawRgb, triAlpha);
      drawHalfLine(ctx, px, py, cSz, dir, drawRgb, lineAlpha, lineWidth);
      if (showSymbol && info && cSz >= 8) {
        const fs = Math.max(7, cSz * 0.45);
        drawHalfSymbol(ctx, px, py, cSz, dir, info.symbol, symColor, fs, "500");
      }
    }
  }
}

// Park marker geometry: a right triangle in its corner of the cell, inset so
// its outline (PARK_MARKER_RING wide, centred on the edge) stays inside the
// cell. Shared by the chart (drawParkMarker) and the Spotlight overlay, which
// cuts the same shape out of its dimming so markers stay at full strength.
const PARK_MARKER_RING=3.5;
function parkMarkerPath(ctx,pm,gut,cSz){
  const corner=pm.corner||"BL";
  const inset=Math.min(2,cSz*0.1);
  const ts=Math.max(4,Math.min(cSz*0.5,14));
  const x0=gut+pm.x*cSz+inset,y0=gut+pm.y*cSz+inset,x1=gut+(pm.x+1)*cSz-inset,y1=gut+(pm.y+1)*cSz-inset;
  let pts;
  if(corner==="TL")pts=[[x0,y0],[x0+ts,y0],[x0,y0+ts]];
  else if(corner==="TR")pts=[[x1,y0],[x1-ts,y0],[x1,y0+ts]];
  else if(corner==="BR")pts=[[x1,y1],[x1-ts,y1],[x1,y1-ts]];
  else pts=[[x0,y1],[x0+ts,y1],[x0,y1-ts]];
  ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);ctx.lineTo(pts[1][0],pts[1][1]);ctx.lineTo(pts[2][0],pts[2][1]);ctx.closePath();
}
// One park marker, in the thread colour. The marker is the colour of the
// stitch it sits on, so on its own it vanishes in Colour view (black on
// black); a white inner ring and a dark outer ring make it show on any
// background, light or dark.
function drawParkMarker(ctx,pm,gut,cSz){
  ctx.save();
  parkMarkerPath(ctx,pm,gut,cSz);
  ctx.lineJoin="round";
  ctx.strokeStyle="rgba(27,24,20,0.9)";ctx.lineWidth=PARK_MARKER_RING;ctx.stroke();
  ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.stroke();
  ctx.fillStyle=`rgb(${pm.rgb[0]},${pm.rgb[1]},${pm.rgb[2]})`;ctx.fill();
  ctx.restore();
}

// Paints the cells in viewportRect and everything drawn over them. Also the
// single-cell / strip repaint path (repaintChartCells), clipped to the cells
// being redrawn, so a partial repaint draws exactly what a full one would.
// isDoneAt (optional) overrides the done state, for callers that paint a
// toggle before setDone has committed.
function drawStitch(ctx,cSz,viewportRect,isDoneAt){
  let gut=G,dW=sW,dH=sH;
  // Marks come from the live ref, the array the newest tap painted, not the
  // rendered `done`: a tap commits its state as a transition, and a full redraw
  // for another update (a view change) can run before it — drawing the rendered
  // array would erase the stitch the tap just painted.
  const liveDone=doneRef.current||done;
  const isDone=isDoneAt||(i=>!!(liveDone&&liveDone[i]));
  // Guide and park markers are read through refs: they are repainted
  // incrementally (see the guide / park repaint effects) rather than by a
  // full renderStitch, so this function's closure may predate them.
  const hlRow=guideRef.current.row,hlCol=guideRef.current.col;
  const parkMarkers=parkMarkersRef.current,parkLayers=parkLayersRef.current;

  // Determine effective tier and animated feature opacities. The tier is
  // brought up to date for this cell size here, not only in the tier effect:
  // that effect runs after the redraw effect, so a zoom across the Tier 3/4
  // boundary (where no fade animates, so nothing repaints) was painted with
  // the previous tier and stayed that way. computeDetailTier is idempotent.
  if(!lockDetailLevel)tierRef.current=computeDetailTier(cSz,tierRef.current);
  const tier=lockDetailLevel?3:tierRef.current;
  const symAlpha=lockDetailLevel?1.0:tierFadeRef.current.symbolOpacity;
  const bsHsAlpha=lockDetailLevel?1.0:tierFadeRef.current.bsHsOpacity;

  ctx.fillStyle=chartFabricColour||"#fff";
  ctx.fillRect(0,0,gut+dW*cSz+2,gut+dH*cSz+2);

  // Viewport culling: 20-cell overdraw buffer for smooth panning. A tiled
  // caller passes its own margin (0 — the tile already includes it), so the
  // paint cannot spill past the backing store it was sized for.
  const OVERDRAW=(viewportRect&&typeof viewportRect.overdraw==="number")?viewportRect.overdraw:chartOverdraw(cSz);
  let startX=0,startY=0,endX=dW,endY=dH;
  if(viewportRect){
    startX=Math.max(0,Math.floor((viewportRect.left-gut-OVERDRAW)/cSz));
    startY=Math.max(0,Math.floor((viewportRect.top-gut-OVERDRAW)/cSz));
    endX=Math.min(dW,Math.ceil((viewportRect.right-gut+OVERDRAW)/cSz));
    endY=Math.min(dH,Math.ceil((viewportRect.bottom-gut+OVERDRAW)/cSz));
  }
  // A work area clips the chart to its view: nothing outside is visible, so
  // nothing outside is drawn.
  const vb=viewBoundsRef.current;
  if(vb){startX=Math.max(startX,vb.x0);startY=Math.max(startY,vb.y0);endX=Math.min(endX,vb.x1);endY=Math.min(endY,vb.y1);}

  // Tier-aware font sizes
  const symPx=tierSymFontSz(cSz);
  const fSym=chartSymbolFont(symPx,true);
  const fCol=chartSymbolFont(Math.max(7,Math.round(symPx*0.92)),true);
  const fHlDim=chartSymbolFont(Math.max(6,Math.round(cSz*0.45)));
  const fHlFocus=chartSymbolFont(symPx,true);
  ctx.textAlign="center";ctx.textBaseline="middle";

  // Half-stitch detail flags — driven by tier rather than raw zoom percentage
  const hsLowZoom=tier===2;   // Tier 2: triangle fill only
  const hsMedZoom=tier===3;   // Tier 3: triangle + diagonal line
  const hsHighZoom=tier>=4;   // Tier 4: full detail (tri + line + symbol)
  // Quarter stitches: a done one is drawn as before; one not done yet is faded (lighter, so the two differ in
  // more than hue). An instruction (a quarter, a half or three quarters) is done when every explicit
  // quarter it is made of is.
  function instructionCorners(ins) {
    if (ins.type === 'quarter') return [ins.corner];
    if (ins.type === 'three-quarter') return ['TL', 'TR', 'BL', 'BR'].filter(function (q) { return q !== ins.emptyCorner; });
    return ins.direction === 'fwd' ? ['BL', 'TR'] : ['TL', 'BR'];
  }
  function drawPartial(entry, base, px, py, idx) {
    if (!entry || layerVis.quarter === false) return;
    const dn = partialDone.get(idx);
    analysePartialStitches(entry, base).forEach(function (instruction) {
      let q = 0.8, isDnQ = true;
      const cs = instructionCorners(instruction);
      for (let ci = 0; ci < cs.length; ci++) if (entry[cs[ci]] && !(dn && dn.has(cs[ci]))) { isDnQ = false; break; }
      if (!isDnQ) q = 0.4;
      ctx.save();
      var colour = instruction.colour;
      var paletteEntry = cmap && cmap[colour.id];
      var symbol = paletteEntry && paletteEntry.symbol;
      var view = stitchView === 'symbol' ? 'symbol' : 'both';
      if (instruction.type === 'three-quarter') {
        drawThreeQuarterStitch(ctx, px, py, cSz, colour, instruction.emptyCorner, q, view, symbol);
      } else if (instruction.type === 'quarter') {
        drawQuarterStitch(ctx, px, py, cSz, colour, instruction.corner, q, view, symbol);
      } else {
        drawHalfTriangle(ctx, px, py, cSz, instruction.direction, colour.rgb, q);
        drawHalfLine(ctx, px, py, cSz, instruction.direction, colour.rgb, q);
      }
      ctx.restore();
    });
  }

  // The two looks of a colour for this paint, by packed RGB (an id is not unique across brands: DMC 310 and Anchor 310 differ): one property read per cell instead of a map lookup, and nothing
  // built per cell (the shared caches in colour-utils.js sit behind these).
  // They live across paints (a one-stitch repaint reuses them) and are rebuilt when the palette or the fade changes.
  const pendFade=tier<=2?lowZoomFade:0.5;
  let lc=stitchLookRef.current;
  if(lc.cmap!==cmap||lc.fade!==pendFade){lc=stitchLookRef.current={cmap:cmap,fade:pendFade,done:Object.create(null),pend:Object.create(null)};}
  const doneLooks=lc.done,pendLooks=lc.pend;
  function doneLookOf(m){const k=(m.rgb[0]<<16)|(m.rgb[1]<<8)|m.rgb[2];let l=doneLooks[k];if(!l)l=doneLooks[k]=doneStitchLook(m.rgb);return l;}
  function pendLookOf(m){const k=(m.rgb[0]<<16)|(m.rgb[1]<<8)|m.rgb[2];let l=pendLooks[k];if(!l)l=pendLooks[k]=pendingStitchLook(m.rgb,pendFade);return l;}
  // The "tick" done style: a dark corner triangle with a pale edge, readable on a pale or a dark cell.
  function drawDoneTick(px,py){
    const t=Math.max(4,Math.round(cSz*0.42));
    ctx.fillStyle="rgba(27,24,20,0.92)";ctx.beginPath();ctx.moveTo(px+cSz-t,py);ctx.lineTo(px+cSz,py);ctx.lineTo(px+cSz,py+t);ctx.closePath();ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.9)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px+cSz-t,py);ctx.lineTo(px+cSz,py+t);ctx.stroke();
  }
  // A cell's symbol. A glyph atlas (each symbol drawn once, then copied with
  // drawImage) was tried and is slower: fillText already draws from the
  // browser's own glyph cache. Several callers draw inside a save/restore, so
  // the font is set every time (browsers skip an unchanged font themselves).
  function drawGlyph(sym,font,ink,cx,cy){
    ctx.fillStyle=ink;ctx.font=font;ctx.fillText(sym,cx,cy);
  }

  // ── Cell backgrounds as one image ──
  // Every full stitch's background is one flat colour at Tier 1 (any view)
  // and in Symbol and Colour views at every tier; symbols, ticks and the rest
  // are drawn on top. Rather than a fillStyle and a fillRect per cell (tens of
  // thousands of each for a tile zoomed out), the colours go into an image
  // with one pixel per cell, drawn once, scaled up without smoothing. Cells
  // the loop below paints itself (unstitched cells above Tier 1, Tier 1 cells
  // with quarter stitches) get the fabric colour the whole chart is first
  // filled with.
  let isolateBase=null;
  const imgPath=(tier===1||layerVis.full)&&endX>startX&&endY>startY&&paintCellImage();
  // A full stitch's background, as the loop below draws it, as a colour
  // string or [r,g,b].
  function cellBackground(m,idx){
    const dn=isDone(idx);
    if(tier===1)return dn?doneLookOf(m).fill:pendLookOf(m).fill;
    if(stitchView==="symbol"||stitchView==="colour"){
      const solid=tier<=2;
      if(dn&&(solid||doneStyle!=="tick"))return doneLookOf(m).fill;
      if(stitchView==="symbol"&&!solid)return chartFabricColour||"#fff";
      return pendLookOf(m).fill;
    }
    const dimmed=!!(focusColour&&m.id!==focusColour);
    if(highlightMode==="outline"||highlightMode==="tint")return m.rgb;
    if(highlightMode==="spotlight")return dimmed?"#e8ecf0":m.rgb;
    // Isolate: other colours dimmed; the highlighted colour, done in full,
    // still to do at 25% over the fabric, worked out here.
    if(dimmed)return[Math.round(255-(255-m.rgb[0])*trackerDimLevel),Math.round(255-(255-m.rgb[1])*trackerDimLevel),Math.round(255-(255-m.rgb[2])*trackerDimLevel)];
    if(dn)return m.rgb;
    if(!isolateBase)isolateBase=parseChartColour(chartFabricColour||"#fff")||[255,255,255];
    return[0,1,2].map(i=>Math.round(m.rgb[i]*0.25+isolateBase[i]*0.75));
  }
  function paintCellImage(){
    const w=endX-startX,h=endY-startY;
    const base=parseChartColour(chartFabricColour||"#fff");
    const skipT1=parseChartColour(chartFabricColour||"#f0f4f8");
    const cv=cellImageCanvas(w,h);
    if(!base||!skipT1||!cv)return false;
    const img=new ImageData(w,h),d=img.data;
    // Parsed once per colour string for the paint.
    const parsed=new Map();
    const px=c=>{if(typeof c!=="string")return c;let v=parsed.get(c);if(!v){v=parseChartColour(c)||[0,0,0];parsed.set(c,v);}return v;};
    let o=0;
    for(let y=startY;y<endY;y++)for(let x=startX;x<endX;x++,o+=4){
      const idx=y*sW+x,m=pat[idx];
      let c=base;
      if(m){
        if(m.id==="__skip__"||m.id==="__empty__"){if(tier===1)c=skipT1;}
        else if(!(tier===1&&partialStitches.has(idx)))c=px(cellBackground(m,idx));
      }
      d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=255;
    }
    cv.getContext("2d").putImageData(img,0,0);
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(cv,0,0,w,h,gut+startX*cSz,gut+startY*cSz,w*cSz,h*cSz);
    ctx.restore();
    return true;
  }

  // ── Cell outlines as grid lines ──
  // Each cell used to stroke its own outline (a strokeStyle and a strokeRect
  // per cell). The loop now only notes each cell's outline style, and the
  // outlines are drawn after it as long lines: one fillRect per run of the
  // same style along each grid line, so a tile costs about rows + columns
  // calls instead of one per cell. A single path of many small rectangles
  // was tried and is slower than the strokeRects. Drawn per cell, the next
  // cell's fill covered half of each shared edge, so an edge was two layers
  // of outline on one side and one on the other; a line here is one even
  // layer of about the same total darkness (OUTLINE_LINE). In row mode the
  // outlines must sit under each row's tint, and at Tier 1 only cells with
  // quarter stitches have one, so both keep the per-cell strokeRect.
  const outlineGrid=cSz>=4&&tier>=2&&!rowModeActive;
  const olW=endX-startX, olH=endY-startY;
  const olCodes=outlineGrid&&olW>0&&olH>0?new Uint8Array(olW*olH):null;
  const OUTLINE_STYLE=[null,"rgba(0,0,0,0.08)","rgba(0,0,0,0.03)","rgba(0,0,0,0.06)","rgba(220,50,50,0.25)"];
  function addOutline(code,x,y,px,py){
    if(olCodes){olCodes[(y-startY)*olW+(x-startX)]=code;return;}
    ctx.strokeStyle=OUTLINE_STYLE[code];ctx.strokeRect(px,py,cSz,cSz);
  }

  for(let y=startY;y<endY;y++){
    for(let x=startX;x<endX;x++){
      let idx=y*sW+x,m=pat[idx];if(!m)continue;
      let info=(m.id==="__skip__"||m.id==="__empty__")?null:(cmap?cmap[m.id]:null);
      // Already in the cell image (see above): skip this cell's fill.
      const imgCell=imgPath&&m.id!=="__skip__"&&m.id!=="__empty__"&&!(tier===1&&partialStitches.has(idx));
      let px=gut+x*cSz,py=gut+y*cSz;
      let isDn=isDoneAt?isDoneAt(idx):(liveDone&&liveDone[idx]);

      // ── Tier 1 fast path: flat color blocks, no symbols, no cell borders ──
      if(tier===1&&!partialStitches.has(idx)){
        if(imgPath)continue;
        if(m.id==="__skip__"||m.id==="__empty__"){ctx.fillStyle=chartFabricColour||"#f0f4f8";ctx.fillRect(px,py,cSz,cSz);continue;}
        // Done is the thread colour; not done is that colour desaturated and lightened (colour-utils.js), so done
        // areas stand out at a glance, in greyscale too.
        ctx.fillStyle=isDn?doneLookOf(m).fill:pendLookOf(m).fill;ctx.fillRect(px,py,cSz,cSz);
        continue;
      }

      let dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__"&&m.id!=="__empty__";
      const effectiveDimmed=dimmed&&highlightMode!=="outline"&&highlightMode!=="tint";
      const dimR=Math.round(255-(255-m.rgb[0])*trackerDimLevel),dimG=Math.round(255-(255-m.rgb[1])*trackerDimLevel),dimB=Math.round(255-(255-m.rgb[2])*trackerDimLevel);
      const dimFill=effectiveDimmed?`rgb(${dimR},${dimG},${dimB})`:'#EFE7D6';
      // Unstitched cells show the pattern's fabric with a faint checker, as in the Creator (P2-2).
      if(m.id==="__skip__"||m.id==="__empty__"){ctx.fillStyle=chartFabricColour||"#fff";ctx.fillRect(px,py,cSz,cSz);ctx.globalAlpha=0.25;drawCk(ctx,px,py,cSz);ctx.globalAlpha=1;
        let hs=halfStitches.get(idx);
        if(cSz>=4)addOutline(m.id==="__empty__"?4:3,x,y,px,py);
        if(hs&&layerVis.half&&bsHsAlpha>0.01){
          let hd=halfDone.get(idx)||{};
          ctx.save();ctx.globalAlpha=bsHsAlpha;
          _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,false,hsLowZoom,hsMedZoom,hsHighZoom);
          ctx.restore();
        }
        drawPartial(partialStitches.get(idx),m,px,py,idx);
        continue;
      }
      if(layerVis.full){
      if(stitchView==="symbol"||stitchView==="colour"){
        // Done versus not done without relying on a pale tint (TRACK-09). Below the symbol tiers every cell is one solid
        // pixel (done in the thread colour, not done faded); from the symbol tiers up, a done cell fills with its thread
        // colour and keeps a dimmed symbol, or (the "tick" style) keeps its look and gains a corner tick.
        const isSymV=stitchView==="symbol",solid=tier<=2;
        const showSym=info&&symAlpha>0.01&&(!solid||cSz>=7);
        if(isDn&&(solid||doneStyle!=="tick")){
          const lk=doneLookOf(m);
          if(!imgCell){ctx.fillStyle=lk.fill;ctx.fillRect(px,py,cSz,cSz);}
          if(showSym){ctx.globalAlpha=symAlpha;drawGlyph(info.symbol,isSymV?fSym:fCol,lk.ink,px+cSz/2,py+cSz/2);ctx.globalAlpha=1;}
        }else{
          let ink;
          if(isSymV&&!solid){if(!imgCell){ctx.fillStyle=chartFabricColour||"#fff";ctx.fillRect(px,py,cSz,cSz);}ink="#1B1814";}
          else{const pl=pendLookOf(m);if(!imgCell){ctx.fillStyle=pl.fill;ctx.fillRect(px,py,cSz,cSz);}ink=pl.ink;}
          if(showSym){ctx.globalAlpha=symAlpha;drawGlyph(info.symbol,isSymV?fSym:fCol,ink,px+cSz/2,py+cSz/2);ctx.globalAlpha=1;}
          if(isDn)drawDoneTick(px,py);
        }
      }else if(highlightMode==="outline"||highlightMode==="tint"){
        if(!imgCell){ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
        if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;drawGlyph(info.symbol,fCol,luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)",px+cSz/2,py+cSz/2);ctx.restore();}
        if(highlightMode==="tint"&&focusColour&&m.id===focusColour){const tr=parseInt(tintColor.slice(1,3),16),tg=parseInt(tintColor.slice(3,5),16),tb=parseInt(tintColor.slice(5,7),16);ctx.fillStyle=`rgba(${tr},${tg},${tb},${tintOpacity})`;ctx.fillRect(px,py,cSz,cSz);}
      }else if(highlightMode==="spotlight"){
        if(dimmed){if(!imgCell){ctx.fillStyle="#e8ecf0";ctx.fillRect(px,py,cSz,cSz);}}
        else{if(!imgCell){ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;drawGlyph(info.symbol,fCol,luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)",px+cSz/2,py+cSz/2);ctx.restore();}if(cSz>=4){const lum2=luminance(m.rgb);ctx.strokeStyle=lum2>140?"rgba(26,26,46,0.85)":"rgba(255,255,255,0.85)";ctx.lineWidth=1.5;ctx.strokeRect(px+0.75,py+0.75,cSz-1.5,cSz-1.5);ctx.lineWidth=1;}}
      }else{
        if(isDn){if(!imgCell){ctx.fillStyle=effectiveDimmed?dimFill:`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}}
        else if(dimmed){if(!imgCell){ctx.fillStyle=dimFill;ctx.fillRect(px,py,cSz,cSz);}if(symAlpha>0.01&&trackerDimLevel<0.25&&info&&cSz>=8){ctx.save();ctx.globalAlpha=symAlpha;drawGlyph(info.symbol,fHlDim,`rgba(0,0,0,${Math.max(0.04,0.12-trackerDimLevel*0.4)})`,px+cSz/2,py+cSz/2);ctx.restore();}else if(symAlpha>0.01&&trackerDimLevel>=0.25&&info&&cSz>=8){ctx.save();ctx.globalAlpha=symAlpha;drawGlyph(info.symbol,fHlDim,luminance(m.rgb)>140?'rgba(0,0,0,0.5)':'rgba(255,255,255,0.6)',px+cSz/2,py+cSz/2);ctx.restore();}}
        else{if(!imgCell){ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);}if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;drawGlyph(info.symbol,fHlFocus,"#1B1814",px+cSz/2,py+cSz/2);ctx.restore();}}
      }
      // Tier 4: thread ID secondary label below the symbol (cell > 40px)
      if(tier>=4&&cSz>40&&info&&symAlpha>0.01&&m.id!=="__skip__"&&m.id!=="__empty__"){
        ctx.save();ctx.globalAlpha=symAlpha*0.7;ctx.fillStyle="rgba(100,116,139,1)";
        ctx.font=`${Math.max(6,Math.round(cSz*0.2))}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillText(m.id,px+cSz/2,py+cSz*0.8);ctx.restore();
      }
      } // end layerVis.full
      // Tier 4: stitch direction indicators on undone full-stitch cells (cell > 40px)
      if(tier>=4&&cSz>40&&m.id!=="__skip__"&&m.id!=="__empty__"&&!isDn&&layerVis.full){
        ctx.save();ctx.globalAlpha=0.1;ctx.strokeStyle="#333";ctx.lineWidth=0.8;
        const pd4=Math.max(2,cSz*0.12);
        ctx.beginPath();ctx.moveTo(px+pd4,py+cSz-pd4);ctx.lineTo(px+cSz-pd4,py+pd4);ctx.stroke();
        ctx.beginPath();ctx.moveTo(px+pd4,py+pd4);ctx.lineTo(px+cSz-pd4,py+cSz-pd4);ctx.stroke();
        ctx.restore();
      }
      // Render half stitches on top of full-stitch cells (faded at T1 boundary)
      let hs=halfStitches.get(idx);
      if(hs&&layerVis.half&&bsHsAlpha>0.01){
        let hd=halfDone.get(idx)||{};
        ctx.save();ctx.globalAlpha=bsHsAlpha;
        _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,layerVis.full?effectiveDimmed:false,hsLowZoom,hsMedZoom,hsHighZoom);
        ctx.restore();
      }
      drawPartial(partialStitches.get(idx),m,px,py,idx);
      if(cSz>=4)addOutline((effectiveDimmed&&layerVis.full)?2:1,x,y,px,py);
    }
    // R11: dim rows outside the current row — one pass per row covers all tiers.
    if(rowModeActive&&y!==currentRow){ctx.fillStyle='rgba(255,255,255,0.55)';ctx.fillRect(gut+startX*cSz,gut+y*cSz,(endX-startX)*cSz,cSz);}
    // R11: highlight the current row with a subtle tint drawn after cells so it stays visible.
    if(rowModeActive&&y===currentRow){ctx.fillStyle='rgba(37,99,235,0.12)';ctx.fillRect(gut+startX*cSz,gut+y*cSz,(endX-startX)*cSz,cSz);}
  }

  if(olCodes)drawOutlineGrid(ctx,olCodes,olW,olH,gut+startX*cSz,gut+startY*cSz,cSz);

  // color-11: thread sheen — second pass gradient overlay on stitched cells
  if(trackerCanvasTexture&&cSz>=6){
    for(let _ty=startY;_ty<endY;_ty++){for(let _tx=startX;_tx<endX;_tx++){
      const _ti=_ty*sW+_tx,_tm=pat[_ti];
      if(!_tm||_tm.id==="__skip__"||_tm.id==="__empty__")continue;
      const _tpx=gut+_tx*cSz,_tpy=gut+_ty*cSz;
      const _tg=ctx.createLinearGradient(_tpx,_tpy,_tpx+cSz,_tpy+cSz);
      _tg.addColorStop(0,"rgba(255,255,255,0.13)");
      _tg.addColorStop(0.45,"transparent");
      _tg.addColorStop(1,"rgba(0,0,0,0.06)");
      ctx.fillStyle=_tg;ctx.fillRect(_tpx,_tpy,cSz,cSz);
    }}
  }

  // The "outline" highlight's marching ants are no longer drawn here: they
  // are an SVG overlay the browser animates (see antsSvgRef), so animating
  // them never repaints the chart.

  // Grid lines: a heavy line every gridEvery stitches and a light one half-way between, in the style, colour and
  // strength chosen in More > View (trackerGridLook, colour-utils.js). Each kind is one path, stroked once.
  {
    // Auto's light or dark ink follows what is behind most cells: the fabric only in Symbol view with symbols drawn;
    // the other views (and Symbol zoomed out) fill every cell with a pale or a thread colour.
    const gridBg=stitchView==="symbol"&&tier>=3?chartFabricColour:null;
    const gl=trackerGridLook({style:gridStyleEff,colour:gridColour,every:gridEvery,fabric:gridBg,tier});
    const x0=gut+startX*cSz,x1=gut+endX*cSz,y0=gut+startY*cSz,y1=gut+endY*cSz;
    const gridPath=(step,skip)=>{
      ctx.beginPath();
      for(let gx=Math.ceil(startX/step)*step;gx<=endX;gx+=step){if(skip&&gx%skip===0)continue;ctx.moveTo(gut+gx*cSz,y0);ctx.lineTo(gut+gx*cSz,y1);}
      for(let gy=Math.ceil(startY/step)*step;gy<=endY;gy+=step){if(skip&&gy%skip===0)continue;ctx.moveTo(x0,gut+gy*cSz);ctx.lineTo(x1,gut+gy*cSz);}
    };
    ctx.save();ctx.setLineDash([]);ctx.lineCap="butt";
    if(gl.minor&&gl.minorEvery){gridPath(gl.minorEvery,gl.every);ctx.lineWidth=gl.minor.width;ctx.strokeStyle=gl.minor.stroke;ctx.stroke();}
    gridPath(gl.every,0);
    if(gl.halo){ctx.lineWidth=gl.halo.width;ctx.strokeStyle=gl.halo.stroke;ctx.stroke();}
    ctx.lineWidth=gl.major.width;ctx.strokeStyle=gl.major.stroke;ctx.stroke();
    ctx.restore();
  }

  ProgressUnits.specialty.draw(ctx,specialtyStitches,specialtyDone,gut,gut,cSz,layerVis,specialtySelected);
  // Centre marks, crosshair, backstitch, park markers, border — always draw (cheap)
  // Dash phase anchored to the chart origin (lineDashOffset = distance from
  // it), so the dashes sit in the same place whatever range is painted — a
  // partial repaint or a scrolled tile — instead of restarting at its edge.
  if(showCtr){ctx.strokeStyle="rgba(200,60,60,0.3)";ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.lineDashOffset=startY*cSz;ctx.beginPath();ctx.moveTo(gut+Math.floor(sW/2)*cSz,gut+startY*cSz);ctx.lineTo(gut+Math.floor(sW/2)*cSz,gut+endY*cSz);ctx.stroke();ctx.lineDashOffset=startX*cSz;ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+Math.floor(sH/2)*cSz);ctx.lineTo(gut+endX*cSz,gut+Math.floor(sH/2)*cSz);ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;}
  if(hlRow>=0&&hlCol>=0){ctx.strokeStyle="rgba(59,130,246,0.6)";ctx.lineWidth=2;ctx.setLineDash([]);if(hlRow>=startY&&hlRow<endY){ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+hlRow*cSz+cSz/2);ctx.lineTo(gut+endX*cSz,gut+hlRow*cSz+cSz/2);ctx.stroke();}if(hlCol>=startX&&hlCol<endX){ctx.beginPath();ctx.moveTo(gut+hlCol*cSz+cSz/2,gut+startY*cSz);ctx.lineTo(gut+hlCol*cSz+cSz/2,gut+endY*cSz);ctx.stroke();}}
  // Backstitch: hidden at Tier 1, forced 1px at Tier 2, user thickness at Tier 3+
  if(bsLines.length>0&&layerVis.backstitch&&bsHsAlpha>0.01){
    ctx.save();ctx.globalAlpha=bsHsAlpha;
    ctx.lineWidth=tier===2?1:bsThickness;ctx.lineCap="round";
    // Skip lines wholly outside the cells being painted (backstitch runs
    // along cell edges, in stitch units). A full paint covers the tile so
    // this rarely skips anything; a one-cell repaint skips nearly all.
    // Done lines are solid; lines still to stitch are dashed and a little fainter, so the two differ in more than colour
    // (at the smallest zoom, where a dash is not visible, only the fainter look is left). Two passes keep the canvas
    // state changes to two. A line in the keyboard's selection is drawn last, with a halo.
    const bsKeysNow=bsKeysRef.current,bsDoneNow=bsDoneSetRef.current,bsSel=bsSelectRef.current;
    const dash=tier>=3?[Math.max(3,cSz*0.22),Math.max(2,cSz*0.14)]:[];
    // One walk over the lines picks out those in the painted cells; the two passes then only touch those.
    const bsVisPending=[],bsVisDone=[];
    for(let li=0;li<bsLines.length;li++){
      const ln=bsLines[li];
      if(Math.max(ln.x1,ln.x2)<startX||Math.min(ln.x1,ln.x2)>endX||Math.max(ln.y1,ln.y2)<startY||Math.min(ln.y1,ln.y2)>endY)continue;
      (bsDoneNow.has(bsKeysNow[li])?bsVisDone:bsVisPending).push(li);
    }
    for(let pass=0;pass<2;pass++){
      const doneNow=pass===1,list=doneNow?bsVisDone:bsVisPending;
      if(!list.length)continue;
      ctx.setLineDash(doneNow?[]:dash);
      ctx.globalAlpha=doneNow?bsHsAlpha:bsHsAlpha*0.62;
      for(let k=0;k<list.length;k++){
        const ln=bsLines[list[k]];
        ctx.strokeStyle=ln.color||"#333";ctx.beginPath();ctx.moveTo(gut+ln.x1*cSz,gut+ln.y1*cSz);ctx.lineTo(gut+ln.x2*cSz,gut+ln.y2*cSz);ctx.stroke();
      }
    }
    ctx.setLineDash([]);ctx.globalAlpha=1;
    if(bsSel>=0&&bsLines[bsSel]){
      const ln=bsLines[bsSel];
      ctx.lineCap="round";
      ctx.strokeStyle="rgba(255,255,255,0.95)";ctx.lineWidth=(tier===2?1:bsThickness)+5;
      ctx.beginPath();ctx.moveTo(gut+ln.x1*cSz,gut+ln.y1*cSz);ctx.lineTo(gut+ln.x2*cSz,gut+ln.y2*cSz);ctx.stroke();
      ctx.strokeStyle="#B85C38";ctx.lineWidth=(tier===2?1:bsThickness)+2;
      ctx.beginPath();ctx.moveTo(gut+ln.x1*cSz,gut+ln.y1*cSz);ctx.lineTo(gut+ln.x2*cSz,gut+ln.y2*cSz);ctx.stroke();
      ctx.strokeStyle=ln.color||"#333";ctx.lineWidth=tier===2?1:bsThickness;
      ctx.beginPath();ctx.moveTo(gut+ln.x1*cSz,gut+ln.y1*cSz);ctx.lineTo(gut+ln.x2*cSz,gut+ln.y2*cSz);ctx.stroke();
    }
    ctx.restore();
  }
  // French knots: a ring in the thread colour until done, then filled. In
  // highlight view, other colours' knots are faded like their stitches.
  if(knots.length>0&&layerVis.french_knot){
    const kr=Math.max(2,cSz*0.3);
    ctx.save();
    knots.forEach(k=>{
      const kx=k.x/2,ky=k.y/2;
      if(kx<startX-0.5||kx>endX+0.5||ky<startY-0.5||ky>endY+0.5)return;
      const rgb=k.rgb||(cmap&&cmap[k.id]&&cmap[k.id].rgb)||[0,0,0];
      const col="rgb("+rgb[0]+","+rgb[1]+","+rgb[2]+")";
      const kDone=knotDoneSet.has(k.x+","+k.y);
      ctx.globalAlpha=stitchView==="highlight"&&focusColour&&k.id!==focusColour?0.25:1;
      ctx.beginPath();ctx.arc(gut+kx*cSz,gut+ky*cSz,kr,0,Math.PI*2);
      if(kDone){
        ctx.fillStyle=col;ctx.fill();
        ctx.lineWidth=Math.max(1,cSz*0.06);ctx.strokeStyle="rgba(0,0,0,0.55)";ctx.stroke();
      }else{
        ctx.fillStyle="rgba(255,255,255,0.9)";ctx.fill();
        ctx.lineWidth=Math.max(1.5,cSz*0.1);ctx.strokeStyle=col;ctx.stroke();
      }
    });
    ctx.restore();
  }
  if(beads.length){
    ctx.save();
    beads.slice().sort((a,b)=>Number(a.uid===selectedBead)-Number(b.uid===selectedBead)).forEach(b=>{
      const x=b.x/2,y=b.y/2;
      if(x<startX-0.5||x>endX+0.5||y<startY-0.5||y>endY+0.5)return;
      const rgb=b.rgb||[128,128,128],r=Math.max(3,cSz*0.24),marked=beadsDone.includes(b.uid);
      ctx.beginPath();ctx.ellipse(gut+x*cSz,gut+y*cSz,r,r*0.7,-Math.PI/4,0,Math.PI*2);
      ctx.fillStyle=marked?'rgb('+rgb.join(',')+')':'white';ctx.fill();
      ctx.strokeStyle=b.uid===selectedBead?'#B85C38':'rgb('+rgb.join(',')+')';ctx.lineWidth=b.uid===selectedBead?3:2;ctx.stroke();
      if(marked){ctx.beginPath();ctx.arc(gut+x*cSz,gut+y*cSz,Math.max(1,r*0.22),0,Math.PI*2);ctx.fillStyle='white';ctx.fill();}
    });
    ctx.restore();
  }
  ctx.strokeStyle="rgba(0,0,0,0.4)";ctx.lineWidth=2;ctx.strokeRect(gut,gut,dW*cSz,dH*cSz);ctx.lineWidth=1;
  // Work area: fade the margin (context only — it cannot be marked) and
  // outline the area. The outline sits entirely outside the area, on margin
  // cells, so the single-cell repaint of a tap inside it never erases it.
  if(areaOn&&workArea&&startX<endX&&startY<endY){
    const a=workArea;
    const ax0=gut+a.x0*cSz,ay0=gut+a.y0*cSz,ax1=gut+a.x1*cSz,ay1=gut+a.y1*cSz;
    const vx0=gut+startX*cSz,vy0=gut+startY*cSz,vx1=gut+endX*cSz,vy1=gut+endY*cSz;
    ctx.fillStyle="rgba(239,231,214,0.72)";
    if(ay0>vy0)ctx.fillRect(vx0,vy0,vx1-vx0,ay0-vy0);
    if(vy1>ay1)ctx.fillRect(vx0,ay1,vx1-vx0,vy1-ay1);
    const my0=Math.max(vy0,ay0),my1=Math.min(vy1,ay1);
    if(my1>my0){
      if(ax0>vx0)ctx.fillRect(vx0,my0,ax0-vx0,my1-my0);
      if(vx1>ax1)ctx.fillRect(ax1,my0,vx1-ax1,my1-my0);
    }
    ctx.strokeStyle="rgba(27,24,20,0.75)";ctx.lineWidth=2;
    ctx.strokeRect(ax0-1,ay0-1,ax1-ax0+2,ay1-ay0+2);ctx.lineWidth=1;
  }
  // Park markers last, over the work-area fade: a thread is usually parked
  // ahead of where you are stitching, which is often outside the area.
  if(parkMarkers.length>0){parkMarkers.forEach(pm=>{
    // Multi-colour parking — Option C: skip markers whose colour layer
    // is hidden via the legend toggle.
    if(parkLayers[pm.colorId]===false)return;
    if(pm.x<startX||pm.x>=endX||pm.y<startY||pm.y>=endY)return;
    if(isDone(pm.y*sW+pm.x))return; // spent — see isParkSpent
    drawParkMarker(ctx,pm,gut,cSz);
  });}
}

const renderStitch=useCallback(()=>{if(!pat||!cmap||!stitchRef.current)return;
  let canvas = stitchRef.current;
  const el = stitchScrollRef.current;
  if(el&&(!el.clientWidth||!el.clientHeight)){
    chartTileRef.current={x:0,y:0,w:0,h:0,full:false};
    paintedRectRef.current=null;
    return;
  }
  let tile = chartTileFor(el,scs,sW,sH,G,viewBoundsRef.current);
  // Budgeted against this tile, not the window-sized worst case.
  const chartScale = (typeof window.chartRenderScale==="function")?window.chartRenderScale(tile.w*tile.h):1;
  let ctx = applyChartTile(canvas,tile,G,{blankOnMove:false,scale:chartScale}).ctx;
  // R3 — if the browser refused or discarded this backing store, shrink the
  // tile and try once more before painting into a surface that will never
  // appear. Rare, but the failure is silent otherwise: a blank white chart.
  if(!chartTileIsLive(canvas,ctx)&&!tile.full){
    // Shrink toward the viewport rather than blindly halving: a tile smaller
    // than the visible area would leave part of the chart unpainted. Re-centred
    // on what was showing, and clamped to the chart's bounds.
    const fullW=G+sW*scs+2, fullH=G+sH*scs+2;
    const viewportW=Math.max(1,el?el.clientWidth:tile.w);
    const viewportH=Math.max(1,el?el.clientHeight:tile.h);
    const reducedW=Math.max(viewportW,Math.floor(tile.w/2));
    const reducedH=Math.max(viewportH,Math.floor(tile.h/2));
    const xShift=Math.max(0,Math.floor((tile.w-reducedW)/2));
    const yShift=Math.max(0,Math.floor((tile.h-reducedH)/2));
    tile={x:Math.max(0,Math.min(tile.x+xShift,fullW-reducedW)),y:Math.max(0,Math.min(tile.y+yShift,fullH-reducedH)),w:reducedW,h:reducedH,full:false};
    ctx=applyChartTile(canvas,tile,G,{blankOnMove:false,scale:chartScale}).ctx;
    delete canvas.__chartTileProbe;
  }
  const prevTile=chartTileRef.current;
  // Carries the render scale too: repaintChartCells re-establishes this
  // transform for partial repaints and needs both halves of it.
  chartTileRef.current={x:tile.x,y:tile.y,w:tile.w,h:tile.h,full:tile.full,scale:chartScale};

  // The paintable region *is* the tile, so ask drawStitch for exactly that and
  // no overdraw on top: the tile already contains the margin, and growing past
  // it would only draw cells that get clipped away. A full tile (the whole
  // view fits in one) is painted whole, once, so scrolling it never repaints;
  // it used to paint only the viewport plus a margin and repaint as you
  // scrolled out of it, on a canvas that already covered everything.
  // The backing store is the tile times the scale, rounded, so its last
  // device row or column can reach a fraction past the tile: paint to there.
  const paintW=Math.max(tile.w,canvas.width/chartScale), paintH=Math.max(tile.h,canvas.height/chartScale);
  drawStitch(ctx,scs,{left:tile.x, top:tile.y, right:tile.x+paintW, bottom:tile.y+paintH,
    width:paintW, height:paintH, overdraw:0});

  // Record what is now on the canvas so the scroll handler can tell whether a
  // repaint is actually needed, and which renderStitch painted it: a later
  // one means something drawn has changed, so shiftChartTile cannot reuse
  // these pixels.
  paintedRectRef.current={
    left:tile.x, top:tile.y, right:tile.x+tile.w, bottom:tile.y+tile.h, scs:scs
  };
  chartPaintedByRef.current=renderStitch;
  // Overlays share the chart's geometry, so a tile move invalidates them too.
  const tileChanged = !prevTile || prevTile.x!==tile.x || prevTile.y!==tile.y || prevTile.w!==tile.w || prevTile.h!==tile.h || prevTile.full!==tile.full;
  if(tileChanged)redrawChartOverlays();
},[pat,cmap,scs,sW,sH,showCtr,bsLines,done,stitchView,focusColour,halfStitches,halfDone,highlightMode,tintColor,tintOpacity,spotDimOpacity,trackerDimLevel,layerVis,bsThickness,lockDetailLevel,lowZoomFade,doneStyle,rowModeActive,currentRow,chartFabricColour,gridStyleEff,gridColour,gridEvery,trackerCanvasTexture,viewBounds,areaOn,workArea,knots,knotDoneSet,partialStitches,partialDone,bsDone,bsSelect,beads,beadsDone,selectedBead,specialtyStitches,specialtyDone,specialtySelected]);

// Scroll-driven repaint. Previously every scroll frame ran a full
// renderStitch, which repainted the visible slice plus a 20-cell margin from
// scratch — measured at ~3,500 fillRect calls per touchmove and 51-127 s of
// blocking across 8 pan gestures at 4x CPU throttle. The margin already
// covers small movements, so while the viewport is still inside the painted
// region there is nothing to do and the browser can scroll the existing
// bitmap on its own. Anything that changes what the chart *looks* like goes
// through renderStitch (see its dependency array), which repaints and resets
// the region, so this cannot serve stale pixels.
//
// Two refinements (reports/track-pan-performance-audit.md):
// - Only the part of the view that is chart counts. The scroller reaches a
//   few px past the chart (the rulers' borders; on tablets the 60 px margin
//   kept for the controls strip), and the tile, clamped to the chart, can
//   never cover that. At the right or bottom edge the check used to fail on
//   every frame, so each scroll frame repainted the whole tile.
// - The tile moves a little before the view reaches its edge (CHART_PAN_LOOKAHEAD),
//   so a fast pan or a fling does not run into unpainted canvas. That is
//   affordable because a move keeps what is already drawn (shiftChartTile).
const renderStitchIfScrolledOut=useCallback(()=>{
  const painted=paintedRectRef.current, el=stitchScrollRef.current;
  if(painted&&el&&painted.scs===scs){
    const off=chartScrollOffset(scs);
    const v=viewBoundsRef.current;
    const cl=off.x, ct=off.y;
    const cr=off.x+G+(v.x1-v.x0)*scs+2, cb=off.y+G+(v.y1-v.y0)*scs+2;
    const l=Math.max(cl,el.scrollLeft+off.x-CHART_PAN_LOOKAHEAD), t=Math.max(ct,el.scrollTop+off.y-CHART_PAN_LOOKAHEAD);
    const r=Math.min(cr,el.scrollLeft+off.x+el.clientWidth+CHART_PAN_LOOKAHEAD), b=Math.min(cb,el.scrollTop+off.y+el.clientHeight+CHART_PAN_LOOKAHEAD);
    if(l>=painted.left&&t>=painted.top&&r<=painted.right&&b<=painted.bottom)return;
  }
  if(shiftChartTile())return;
  renderStitch();
},[renderStitch,scs]);

// Move the chart tile for a scroll by keeping what it already shows: the
// overlapping part of the old tile is copied to its new place on the same
// canvas, and only the strips that come into view are drawn (clipped, like
// repaintChartCells, so they match a full paint exactly). A pan used to
// redraw the whole tile, about five screens of cells on a phone, every 300 px
// of travel: 100-400 ms per move at 4x CPU on a 400 x 500 chart.
//
// Returns false, leaving it to a full renderStitch, whenever the pixels on the
// canvas cannot be trusted or kept as they are: something drawn changed since
// they were painted, the tile changed size or render scale, it moved further
// than its own size, or the move is not a whole number of device pixels (a
// 1.5x scale and an odd move), which would blur the copy.
function shiftChartTile(){
  const canvas=stitchRef.current, el=stitchScrollRef.current, prev=chartTileRef.current;
  if(!CHART_TILE_SHIFT||!canvas||!el||!pat||!cmap||!prev||!(prev.w>0)||prev.full)return false;
  if(chartPaintedByRef.current!==renderStitch)return false;
  const tile=chartTileFor(el,scs,sW,sH,G,viewBoundsRef.current);
  if(tile.full||tile.w!==prev.w||tile.h!==prev.h)return false;
  const s=prev.scale>0?prev.scale:1;
  const want=(typeof window.chartRenderScale==="function")?window.chartRenderScale(tile.w*tile.h):1;
  if(want!==s||canvas.width!==Math.round(tile.w*s)||canvas.height!==Math.round(tile.h*s))return false;
  const dx=tile.x-prev.x, dy=tile.y-prev.y;
  if((!dx&&!dy)||Math.abs(dx)>=tile.w||Math.abs(dy)>=tile.h)return false;
  const ddx=dx*s, ddy=dy*s;
  if(Math.abs(ddx-Math.round(ddx))>1e-6||Math.abs(ddy-Math.round(ddy))>1e-6)return false;
  const ctx=canvas.getContext("2d");
  const W=canvas.width, H=canvas.height, ax=Math.abs(Math.round(ddx)), ay=Math.abs(Math.round(ddy));
  // Device pixels, no transform. Drawing a canvas onto itself reads a copy of
  // the source first, so the overlap is safe.
  ctx.setTransform(1,0,0,1,0,0);
  ctx.drawImage(canvas, ddx>0?ax:0, ddy>0?ay:0, W-ax, H-ay, ddx>0?0:ax, ddy>0?0:ay, W-ax, H-ay);
  applyChartTile(canvas,tile,G,{blankOnMove:false,scale:s});
  chartTileRef.current={x:tile.x,y:tile.y,w:tile.w,h:tile.h,full:false,scale:s};
  // The uncovered strips: a full-height one for a sideways move, and one
  // across the kept columns for a move up or down. Worked out in device
  // pixels, so they meet the copied area exactly even when the tile's size
  // times the scale is not a whole number, then turned into chart pixels.
  const strips=[];
  const kx0=ddx>0?0:ax, kx1=ddx>0?W-ax:W;
  if(ddx>0)strips.push([W-ax,0,W,H]);else if(ddx<0)strips.push([0,0,ax,H]);
  if(ddy>0)strips.push([kx0,H-ay,kx1,H]);else if(ddy<0)strips.push([kx0,0,kx1,ay]);
  for(const st of strips){
    const l=tile.x+st[0]/s, t=tile.y+st[1]/s, r=tile.x+st[2]/s, b=tile.y+st[3]/s;
    if(r<=l||b<=t)continue;
    ctx.setTransform(s,0,0,s,-tile.x*s,-tile.y*s);
    ctx.save();
    ctx.beginPath();ctx.rect(l,t,r-l,b-t);ctx.clip();
    // One cell further on every side, so outlines and markers that overhang
    // into the strip from its neighbours are drawn too (see repaintChartCells).
    const m=scs;
    drawStitch(ctx,scs,{left:l-m,top:t-m,right:r+m,bottom:b+m,width:r-l+2*m,height:b-t+2*m,overdraw:0});
    ctx.restore();
  }
  paintedRectRef.current={left:tile.x,top:tile.y,right:tile.x+tile.w,bottom:tile.y+tile.h,scs:scs};
  redrawChartOverlays();
  return true;
}
// PERF: single/bulk stitch toggles already paint their own changed cells directly
// via paintDoneChanges() (see markColourDone / _commitBulk / _dragMarkOnToggle /
// undoTrack / redoTrack) for instant feedback. Those call sites set
// skipNextFullRedrawRef.current to the array they are about to commit (setDone, or
// setBsDone for backstitch) so this effect
// — which would otherwise repaint the *entire visible viewport* just because the
// `done` array reference changed — can skip the redundant full redraw. Anything
// that legitimately needs a full repaint (project load, zoom, view-mode change,
// undo of an edit-mode snapshot, etc.) never sets the flag, so it still gets one.
// The skip names the exact array, not just "skip once", and holds only when
// nothing else that renderStitch draws changed in the same commit: a tap commits
// as a transition, so another update (a view or colour change) can commit first
// or alongside, and must still get its full redraw. Any full redraw also retires
// the skip (the partial paint it stood for is superseded).
const redrawInputsRef=useRef(null);
useEffect(()=>{
  const inputs=[pat,cmap,scs,sW,sH,showCtr,bsLines,stitchView,focusColour,halfStitches,halfDone,highlightMode,tintColor,tintOpacity,spotDimOpacity,trackerDimLevel,layerVis,bsThickness,lockDetailLevel,lowZoomFade,doneStyle,rowModeActive,currentRow,chartFabricColour,gridStyleEff,gridColour,gridEvery,trackerCanvasTexture,viewBounds,areaOn,workArea,knots,knotDoneSet,partialStitches,partialDone,bsSelect,beads,beadsDone,selectedBead,specialtyStitches,specialtyDone,specialtySelected];
  const prev=redrawInputsRef.current;
  redrawInputsRef.current=inputs;
  const skip=skipNextFullRedrawRef.current;
  skipNextFullRedrawRef.current=null;
  const marksOnly=!!prev&&inputs.every((v,i)=>Object.is(v,prev[i]));
  // Already painted by this very renderStitch (a zoom commit paints before
  // its effect runs), so the canvas matches state.
  if(chartPaintedByRef.current===renderStitch)return;
  // The mark painted its own cells, so the canvas matches state again.
  if(skip&&(skip===done||skip===bsDone)&&marksOnly&&!specialtyStitches.length&&!beads.length){chartPaintedByRef.current=renderStitch;return;}
  renderStitch();
},[renderStitch]);
// The guide crosshair and park markers are repainted where they changed
// rather than by a full renderStitch (they are not in its deps): moving the
// guide repaints the old and new row and column, a park toggle repaints its
// cell. drawStitch reads both through refs, so a later full repaint agrees.
const prevGuidePaintRef=useRef(null);
useEffect(()=>{
  const prev=prevGuidePaintRef.current;
  prevGuidePaintRef.current={row:hlRow,col:hlCol};
  renderHoverBar();
  if(!prev||(prev.row===hlRow&&prev.col===hlCol))return;
  const strips=[prev,{row:hlRow,col:hlCol}];
  for(const g of strips){
    if(g.row<0||g.col<0)continue; // no crosshair drawn for this one
    repaintChartCells(0,g.row,sW,g.row+1);
    repaintChartCells(g.col,0,g.col+1,sH);
  }
},[hlRow,hlCol]);
const prevParkPaintRef=useRef(null);
useEffect(()=>{
  const prev=prevParkPaintRef.current;
  prevParkPaintRef.current={markers:parkMarkers,layers:parkLayers};
  if(!prev)return;
  // Per-cell signature of what is drawn there; repaint cells whose changed.
  const sig=(list,layers)=>{
    const m=new Map();
    for(const pm of list){const k=pm.y*sW+pm.x;m.set(k,(m.get(k)||"")+pm.colorId+":"+(pm.corner||"BL")+":"+(layers[pm.colorId]!==false)+"|");}
    return m;
  };
  const a=sig(prev.markers,prev.layers),b=sig(parkMarkers,parkLayers);
  const keys=new Set([...a.keys(),...b.keys()]);
  keys.forEach(k=>{if(a.get(k)!==b.get(k)){const x=k%sW,y=(k-x)/sW;repaintChartCells(x,y,x+1,y+1);}});
},[parkMarkers,parkLayers]);
// Keep renderStitchRef current so animation callbacks always call the latest closure
useEffect(()=>{renderStitchRef.current=renderStitch;},[renderStitch]);
// Tier-change handler: compute new tier, animate feature opacities across boundaries
useEffect(()=>{
  const eff=lockDetailLevel?3:computeDetailTier(scs,tierRef.current);
  tierRef.current=eff;
  const tSym=eff>=3?1.0:0.0,tBsHs=eff>=2?1.0:0.0;
  const startSym=tierFadeRef.current.symbolOpacity,startBsHs=tierFadeRef.current.bsHsOpacity;
  if(tierFadeRef.current.animRafId){cancelAnimationFrame(tierFadeRef.current.animRafId);tierFadeRef.current.animRafId=null;}
  if(Math.abs(startSym-tSym)>=0.01||Math.abs(startBsHs-tBsHs)>=0.01){
    const durSym=tSym>startSym?200:150,durBsHs=tBsHs>startBsHs?200:150;
    const startMs=performance.now();
    const animate=()=>{
      const el=performance.now()-startMs;
      const tS=Math.min(1,el/durSym),tB=Math.min(1,el/durBsHs);
      tierFadeRef.current.symbolOpacity=startSym+(tSym-startSym)*tS;
      tierFadeRef.current.bsHsOpacity=startBsHs+(tBsHs-startBsHs)*tB;
      if(renderStitchRef.current)renderStitchRef.current();
      if(tS<1||tB<1){tierFadeRef.current.animRafId=requestAnimationFrame(animate);}
      else{tierFadeRef.current.animRafId=null;}
    };
    tierFadeRef.current.animRafId=requestAnimationFrame(animate);
  }
  return()=>{if(tierFadeRef.current.animRafId){cancelAnimationFrame(tierFadeRef.current.animRafId);tierFadeRef.current.animRafId=null;}};
},[scs,lockDetailLevel]);

// R3 (second half) — hand the chart's backing stores back while the tab is
// hidden. Safari reclaims canvas memory aggressively under pressure and
// decides *for* us which surfaces to discard; releasing them deliberately on
// the way out means the return path is a clean repaint rather than whatever
// state the browser left behind. Zeroing width is what actually frees the
// backing store — display:none does not.
//
// Only the overlays are released. The chart itself is left alone: it is the
// one canvas the user is guaranteed to be looking at on return, and blanking
// it risks a visible flash before renderStitch runs.
useEffect(()=>{
  if(!pat)return;
  const overlays=[threadUsageCanvasRef,recOverlayCanvasRef,breadcrumbCanvasRef,
                  focusOverlayCanvasRef,countingAidsCanvasRef];
  const onVis=()=>{
    if(document.visibilityState==="hidden"){
      for(const r of overlays){
        const c=r.current;
        if(c&&c.width){c.width=0;c.height=0;delete c.__chartTile;}
      }
    }else{
      // __chartTile was cleared above, so applyChartTile sees a fresh surface
      // and every overlay repaints from scratch at the current tile. Called
      // through the ref so this effect does not depend on renderStitch's
      // identity, which changes on most renders and would otherwise churn the
      // listener every time.
      if(renderStitchRef.current)renderStitchRef.current();
    }
  };
  document.addEventListener("visibilitychange",onVis);
  return()=>document.removeEventListener("visibilitychange",onVis);
},[!!pat]);

// ═══ Session onboarding hint ═══
// Shown once, on the first stitch of the first session, as a floating toast
// so it cannot move the chart. Marked as seen as soon as it is shown.
// The ref guards against rapid marking: a click's render can commit before
// the setSessionOnboardingShown(true) below does, re-running this effect
// with the old value, and the toast used to appear two or three times.
const sessionHintFiredRef=useRef(false);
useEffect(()=>{
  if(sessionHintFiredRef.current||sessionOnboardingShown||!(liveAutoStitches>0)||statsSessions.length!==0)return;
  sessionHintFiredRef.current=true;
  setSessionOnboardingShown(true);
  try{localStorage.setItem("cs_sessionOnboardingDone","1");}catch(_){}
  try{
    if(window.Toast&&window.Toast.show)window.Toast.show({
      message:"Sessions are tracked automatically as you stitch, so their time is an estimate. For an exact time, use Start timer in the Session panel.",
      type:"info",duration:8000,priority:0,   // a first-run notice: on a phone it waits behind the feedback for what the stitcher just did
      action:()=>{setLeftSidebarTab("session");setMorePanelOpen(true);},actionLabel:"Open",
    });
  }catch(_){}
},[sessionOnboardingShown,liveAutoStitches,statsSessions.length]);

// ═══ Thread usage overlay rendering ═══
useEffect(()=>{
  const canvas=threadUsageCanvasRef.current;
  if(!canvas)return;
  if(!analysisResult||!threadUsageMode||!pat){
    clearWholeChartCanvas(canvas);
    return;
  }
  const ps=analysisResult.perStitch;
  const W=analysisResult.sW,H=analysisResult.sH;
  if(!ps||W!==sW||H!==sH)return;
  const draw=()=>{
    const prep=prepareOverlayTile(canvas);
    if(!prep)return;
    const ctx=prep.ctx;
    clearOverlayTile(ctx,prep.tile);
    // Bounded by the tile rather than pat.length: this loop is now re-run
    // whenever the tile moves, and walking 200k cells per scroll would cost
    // far more than the tiling saves.
    const r0=tileCellRange(prep.tile,scs);
    for(let y=r0.y0;y<r0.y1;y++)for(let x=r0.x0;x<r0.x1;x++){
      const i=y*W+x;
      const cell=pat[i];
      if(!cell||cell.id==="__skip__"||cell.id==="__empty__")continue;
      const px=G+x*scs,py=G+y*scs;
      let r=0,g=0,b=0,a=0;
      if(threadUsageMode==="distance"){
        const dist=ps.nearestDist[i];
        if(dist<=1.415)continue;
        else if(dist<=5){const t=(dist-1.415)/3.585;r=255;g=200;b=0;a=t*0.3;}
        else if(dist<=15){const t=(dist-5)/10;r=255;g=120;b=0;a=t*0.4;}
        else{r=220;g=40;b=40;a=0.4;}
      }else{
        const sz=ps.clusterSize[i];
        if(sz>=20)continue;
        else if(sz>=5){r=100;g=150;b=255;a=0.15;}
        else if(sz>=2){r=255;g=200;b=0;a=0.25;}
        else{r=220;g=40;b=40;a=0.40;}
      }
      if(a>0){ctx.fillStyle=`rgba(${r},${g},${b},${a})`;ctx.fillRect(px,py,scs,scs);}
    }
  };
  cancelAnimationFrame(threadUsageRafRef.current);
  threadUsageRafRef.current=requestAnimationFrame(draw);
  const unregister=registerChartOverlay("threadUsage",draw);
  return()=>{cancelAnimationFrame(threadUsageRafRef.current);unregister();};
},[analysisResult,threadUsageMode,scs,pat,sW,sH]);

// ═══ Recommendation pulsing border animation ═══
const recPulseRef=useRef(null);
const recPulsePhaseRef=useRef(0);
const recOverlayCanvasRef=useRef(null);
// Rectangles stroked on the last pulse frame, so the next frame can clear
// just those instead of the whole (chart-sized) overlay canvas.
const recPulseBoxesRef=useRef(null);
useEffect(()=>{
  const canvas=recOverlayCanvasRef.current;
  if(!canvas)return;
  // Bail out *before* starting the loop when there is nothing to pulse.
  // Previously `draw()` returned early but `loop()` kept re-scheduling
  // itself at 60fps for the lifetime of the effect, so the tracker held a
  // permanent animation-frame callback even with recommendations switched
  // off — pure battery/main-thread cost on a phone.
  if(!recommendations||!recommendations.top||!recommendations.top.length||!recEnabled||!analysisResult){
    clearWholeChartCanvas(canvas);
    return;
  }
  const prefersReducedMotion=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const draw=(staticOnly=false)=>{
    const W=analysisResult.sW,H=analysisResult.sH;
    const RS=analysisResult.regionSize||10;
    const prep=prepareOverlayTile(canvas);
    if(!prep)return;
    // A tile that resized or moved is blank and holds nothing to clear
    // incrementally, so the partial-clear path below has to be skipped.
    const resized=prep.invalidated;
    const ctx=prep.ctx;
    const RC=analysisResult.regionCols||1;
    // The rectangles this frame will stroke. Computed before drawing so the
    // clear can be limited to them.
    const boxes=recommendations.top.map((rec,rank)=>{
      const rCol=rec.idx%RC,rRow=Math.floor(rec.idx/RC);
      return {
        x:G+rCol*RS*scs, y:G+rRow*RS*scs,
        w:Math.min(RS,W-rCol*RS)*scs, h:Math.min(RS,H-rRow*RS)*scs,
        lw:rank===0?3:2, rank:rank
      };
    });
    // Clear only what was drawn last frame, not the whole canvas. This overlay
    // is the size of the entire chart — 4030x5030 on a 200x250 pattern — and
    // this runs every animation frame, so a full clear was wiping 20 Mpx at
    // 60fps: measured at 4.2 BILLION pixels cleared across 8 pan gestures, and
    // it was the dominant cost of panning a large chart once the redraw itself
    // was fixed. The boxes are stable between frames, so clearing them is
    // equivalent to clearing everything. A resize already blanks the canvas.
    if(!resized){
      const prev=recPulseBoxesRef.current;
      if(prev){for(const b of prev){const p=b.lw+2;ctx.clearRect(b.x-p,b.y-p,b.w+p*2,b.h+p*2);}}
      else clearOverlayTile(ctx,prep.tile);
    }
    recPulseBoxesRef.current=boxes;
    // phase cycles 0→1→0 at 2s period
    if(!staticOnly)recPulsePhaseRef.current=(recPulsePhaseRef.current+0.016)%(Math.PI*2);
    const pulseAlpha=staticOnly?0.7:(0.3+0.4*((Math.sin(recPulsePhaseRef.current)+1)/2));
    for(const b of boxes){
      if(b.rank===0){ctx.strokeStyle=`rgba(184, 92, 56,${pulseAlpha})`;ctx.lineWidth=3;}
      else{ctx.strokeStyle="rgba(184, 92, 56,0.2)";ctx.lineWidth=2;}
      ctx.strokeRect(b.x+1,b.y+1,b.w-2,b.h-2);
    }
  };
  // Registered so a tile move repaints the boxes at their new origin. The
  // static form is used because the pulse loop, when running, supplies its own
  // animation; when it is not running this is the only thing that redraws.
  const unregister=registerChartOverlay("recPulse",()=>draw(true));
  if(prefersReducedMotion){draw(true);return unregister;}
  // Also suspend while the tab is hidden — rAF is already throttled when
  // backgrounded, but this releases the callback entirely so a phone that
  // keeps the page alive in the background does no work at all.
  const loop=()=>{draw();recPulseRef.current=requestAnimationFrame(loop);};
  const start=()=>{if(recPulseRef.current==null)loop();};
  const stop=()=>{if(recPulseRef.current!=null){cancelAnimationFrame(recPulseRef.current);recPulseRef.current=null;}};
  const onVis=()=>{if(document.visibilityState==="visible")start();else stop();};
  document.addEventListener("visibilitychange",onVis);
  if(document.visibilityState==="visible")loop();
  return()=>{document.removeEventListener("visibilitychange",onVis);stop();unregister();};
},[recommendations,recEnabled,analysisResult,scs,sW,sH]);

// ═══ Focus area three-zone dimming overlay ═══
useEffect(()=>{
  const canvas=focusOverlayCanvasRef.current;
  if(!canvas)return;
  if(!focusBlock||!focusEnabled||stitchingStyle==="crosscountry"){
    clearWholeChartCanvas(canvas);
    return;
  }
  const draw=()=>{
  const prep=prepareOverlayTile(canvas);
  if(!prep)return;
  const ctx=prep.ctx,tile=prep.tile;
  clearOverlayTile(ctx,tile);
  // Full-tile dim (94% opacity → pattern shows at 6% brightness). Only the
  // tile is dimmed because only the tile is visible; the blocks cut out of it
  // below are addressed in chart coordinates either way.
  ctx.fillStyle="rgba(241,245,249,0.94)";ctx.fillRect(tile.x,tile.y,tile.w,tile.h);
  const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
  const{bx,by}=focusBlock;
  // Cut out neighbour blocks (raise to ~40% brightness)
  ctx.save();ctx.globalCompositeOperation="destination-out";
  for(let dy=-1;dy<=1;dy++){for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0)continue;
    const nbx=bx+dx,nby=by+dy;
    if(nbx<0||nbx>=bCols||nby<0||nby>=bRows)continue;
    let op=0.54; // default: raises from 6% to ~40%
    if(stitchingStyle==="royal"){const ROYAL_OP={"0,1":0.88,"1,0":0.81};op=ROYAL_OP[dx+","+dy]??0.31;}
    ctx.globalAlpha=op;ctx.fillStyle="black";
    const nx=G+nbx*blockW*scs,ny=G+nby*blockH*scs;
    const nw=Math.min(blockW,sW-nbx*blockW)*scs,nh=Math.min(blockH,sH-nby*blockH)*scs;
    ctx.fillRect(nx,ny,nw,nh);
  }}
  // Fully clear focus block (100% brightness)
  ctx.globalAlpha=1;
  const fx=G+bx*blockW*scs,fy=G+by*blockH*scs;
  const fw=Math.min(blockW,sW-bx*blockW)*scs,fh=Math.min(blockH,sH-by*blockH)*scs;
  ctx.fillRect(fx,fy,fw,fh);
  // Cut the live park markers out of the dimming. Parking puts a thread
  // ahead of where you are stitching — usually the next block — and a 94%
  // dim made those markers all but invisible.
  const lpm=liveParkMarkersRef.current;
  if(lpm.length){
    ctx.globalAlpha=1;ctx.fillStyle="black";ctx.strokeStyle="black";ctx.lineJoin="round";ctx.lineWidth=PARK_MARKER_RING+1;
    for(let i=0;i<lpm.length;i++){parkMarkerPath(ctx,lpm[i],G,scs);ctx.fill();ctx.stroke();}
  }
  ctx.restore();
  // Focus block border
  ctx.strokeStyle="rgba(184, 92, 56,0.9)";ctx.lineWidth=2;ctx.strokeRect(fx+1,fy+1,fw-2,fh-2);
  // Neighbour dashed borders
  for(let dy=-1;dy<=1;dy++){for(let dx=-1;dx<=1;dx++){
    if(dx===0&&dy===0)continue;
    const nbx=bx+dx,nby=by+dy;
    if(nbx<0||nbx>=bCols||nby<0||nby>=bRows)continue;
    const nx=G+nbx*blockW*scs,ny=G+nby*blockH*scs;
    const nw=Math.min(blockW,sW-nbx*blockW)*scs,nh=Math.min(blockH,sH-nby*blockH)*scs;
    ctx.strokeStyle="rgba(184, 92, 56,0.25)";ctx.lineWidth=1;
    ctx.setLineDash([3,3]);ctx.strokeRect(nx+0.5,ny+0.5,nw-1,nh-1);ctx.setLineDash([]);
  }}
  };
  draw();
  return registerChartOverlay("focusBlock",draw);
},[focusBlock,focusEnabled,stitchingStyle,scs,sW,sH,blockW,blockH,liveParkKey]);

// ═══ Breadcrumb trail overlay ═══
useEffect(()=>{
  const canvas=breadcrumbCanvasRef.current;
  if(!canvas)return;
  if(!breadcrumbVisible||!breadcrumbs||breadcrumbs.length===0){
    clearWholeChartCanvas(canvas);
    return;
  }
  const draw=()=>{
  const prep=prepareOverlayTile(canvas);
  if(!prep)return;
  const ctx=prep.ctx;
  clearOverlayTile(ctx,prep.tile);
  const TINTS=["59,130,246","20,184,166","139,92,246","234,88,12","22,163,74","225,29,72"];
  const curSessIdx=statsSessions?statsSessions.length:0;
  breadcrumbs.forEach(b=>{
    const fx=G+b.bx*blockW*scs,fy=G+b.by*blockH*scs;
    const fw=Math.min(blockW,sW-b.bx*blockW)*scs,fh=Math.min(blockH,sH-b.by*blockH)*scs;
    const tint=TINTS[b.sessionIdx%TINTS.length];
    const isCur=b.sessionIdx===curSessIdx;
    ctx.fillStyle=`rgba(${tint},${isCur?0.08:0.03})`;ctx.fillRect(fx,fy,fw,fh);
    ctx.strokeStyle=`rgba(${tint},${isCur?0.30:0.15})`;ctx.lineWidth=1;ctx.strokeRect(fx+0.5,fy+0.5,fw-1,fh-1);
    if(isCur&&scs>=8&&fw>=8&&fh>=8){
      ctx.fillStyle=`rgba(${tint},0.4)`;
      const fnt=Math.max(8,Math.min(12,Math.floor(Math.min(fw,fh)*0.5)));
      ctx.font=`${fnt}px sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(String(b.seqN),fx+fw/2,fy+fh/2);
    }
  });
  };
  draw();
  return registerChartOverlay("breadcrumbs",draw);
},[breadcrumbs,breadcrumbVisible,scs,sW,sH,blockW,blockH,statsSessions]);

// ═══ Counting aids overlay ═══
useEffect(()=>{
  cancelAnimationFrame(countingAidsRafRef.current);
  const canvas=countingAidsCanvasRef.current;
  if(!canvas)return ()=>{cancelAnimationFrame(countingAidsRafRef.current);};
  if(stitchView!=="highlight"||!focusColour||!countingAidsEnabled||!pat||!done){
    clearWholeChartCanvas(canvas);
    return ()=>{cancelAnimationFrame(countingAidsRafRef.current);};
  }
  // Below this cell size the badges and counts stack on top of each other, so
  // draw none (the sidebar says to zoom in).
  if(scs<COUNTING_AIDS_MIN_CELL){const p0=prepareOverlayTile(canvas);if(p0)clearOverlayTile(p0.ctx,p0.tile);return ()=>{cancelAnimationFrame(countingAidsRafRef.current);};}
  const draw=()=>{
    const prep=prepareOverlayTile(canvas);
    if(!prep)return;
    const ctx=prep.ctx;
    clearOverlayTile(ctx,prep.tile);
    const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
    // Culled to the tile rather than the raw viewport: the tile is what this
    // canvas can actually hold, and it already carries the overscan margin.
    const cr=tileCellRange(prep.tile,scs);
    const visC0=Math.max(0,Math.floor(cr.x0/blockW));
    const visC1=Math.min(bCols,Math.ceil(cr.x1/blockW)+1);
    const visR0=Math.max(0,Math.floor(cr.y0/blockH));
    const visR1=Math.min(bRows,Math.ceil(cr.y1/blockH)+1);
    // Ninja icon: 4-pointed star (shuriken)
    function drawNinjaIcon(cx,cy,r){
      const ir=r*0.35;
      ctx.beginPath();
      for(let i=0;i<4;i++){
        const outerAngle=(i*Math.PI/2)-Math.PI/2;
        const innerAngle=outerAngle+Math.PI/4;
        ctx.lineTo(cx+Math.cos(outerAngle)*r,cy+Math.sin(outerAngle)*r);
        ctx.lineTo(cx+Math.cos(innerAngle)*ir,cy+Math.sin(innerAngle)*ir);
      }
      ctx.closePath();
      ctx.fillStyle=COUNTING_AIDS_FILL;ctx.fill();
      ctx.strokeStyle=COUNTING_AIDS_INK;ctx.lineWidth=1.2;ctx.lineJoin="round";ctx.stroke();
    }
    // A badge: light fill, dark outline and dark text, so it reads on any thread colour in either theme.
    function drawBadge(label,x,y,w,h){
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(x,y,w,h,5);else ctx.rect(x,y,w,h);
      ctx.fillStyle=COUNTING_AIDS_FILL;ctx.fill();
      ctx.strokeStyle=COUNTING_AIDS_INK;ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=COUNTING_AIDS_INK;ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillText(label,x+w/2,y+h/2+0.5);
    }
    const ps=analysisResult&&analysisResult.perStitch;
    // Per-block counts + ninja detection
    for(let by=visR0;by<visR1;by++){for(let bx=visC0;bx<visC1;bx++){
      const x0=bx*blockW,y0=by*blockH;
      const x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
      let total=0,remaining=0;
      for(let row=y0;row<y1;row++){for(let col=x0;col<x1;col++){
        const idx=row*sW+col;
        const m=pat[idx];
        if(!m||m.id==="__skip__"||m.id==="__empty__")continue;
        if(m.id!==focusColour)continue;
        total++;
        if(!done[idx])remaining++;
      }}
      if(total===0)continue;
      const isActive=focusBlock&&focusBlock.bx===bx&&focusBlock.by===by;
      const px=G+x0*scs+2,py=G+y0*scs+2;
      if(remaining===0){
        // Draw a small checkmark using canvas strokes (matches Icons.check
        // glyph) instead of rendering the "✓" character — keeps the canvas
        // overlay font-independent and consistent with the SVG icon library.
        ctx.lineCap="round";
        ctx.lineJoin="round";
        ctx.beginPath();
        ctx.moveTo(px+1,py+5);
        ctx.lineTo(px+3.4,py+7.4);
        ctx.lineTo(px+8,py+2);
        ctx.strokeStyle=COUNTING_AIDS_FILL;ctx.lineWidth=3.6;ctx.stroke();
        ctx.strokeStyle=COUNTING_AIDS_INK;ctx.lineWidth=1.4;ctx.stroke();
      }else if(isActive){
        const label=String(remaining);
        ctx.font="bold 10px sans-serif";
        ctx.textAlign="left";ctx.textBaseline="top";
        const tw=ctx.measureText(label).width;
        ctx.beginPath();
        if(ctx.roundRect)ctx.roundRect(px-2,py-1,tw+6,13,3);else ctx.rect(px-2,py-1,tw+6,13);
        ctx.fillStyle=COUNTING_AIDS_FILL;ctx.fill();
        ctx.strokeStyle=COUNTING_AIDS_INK;ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle=COUNTING_AIDS_INK;ctx.fillText(label,px,py);
      }else{
        // Other blocks: dark digits with a light halo (the old 30% black was under 3:1 on most threads).
        ctx.font="bold 9px sans-serif";
        ctx.textAlign="left";ctx.textBaseline="top";
        ctx.lineJoin="round";ctx.lineWidth=3;ctx.strokeStyle=COUNTING_AIDS_FILL;
        ctx.strokeText(String(remaining),px,py);
        ctx.fillStyle=COUNTING_AIDS_INK;ctx.fillText(String(remaining),px,py);
      }
    }}
    // Run-length badges
    if(countRunMin>0){
      for(let by=visR0;by<visR1;by++){for(let bx=visC0;bx<visC1;bx++){
        const x0=bx*blockW,y0=by*blockH;
        const x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
        // Horizontal runs
        if(countRunDir==="h"||countRunDir==="both"){
          for(let row=y0;row<y1;row++){
            let runStart=-1,runLen=0;
            for(let col=x0;col<=x1;col++){
              const inBounds=col<x1;
              const match=inBounds&&pat[row*sW+col]&&pat[row*sW+col].id===focusColour&&!done[row*sW+col];
              if(match){if(runStart<0){runStart=col;runLen=1;}else runLen++;}
              else if(runStart>=0){
                if(runLen>=countRunMin){
                  const midCol=runStart+Math.floor(runLen/2);
                  const bpx=G+midCol*scs+scs-2,bpy=G+row*scs+2;
                  const label=String(runLen);
                  ctx.font="bold 8px monospace";
                  const tw=Math.max(ctx.measureText(label).width+6,14);
                  drawBadge(label,bpx-tw,bpy,tw,11);
                }
                runStart=-1;runLen=0;
              }
            }
          }
        }
        // Vertical runs
        if(countRunDir==="v"||countRunDir==="both"){
          for(let col=x0;col<x1;col++){
            let runStart=-1,runLen=0;
            for(let row=y0;row<=y1;row++){
              const inBounds=row<y1;
              const match=inBounds&&pat[row*sW+col]&&pat[row*sW+col].id===focusColour&&!done[row*sW+col];
              if(match){if(runStart<0){runStart=row;runLen=1;}else runLen++;}
              else if(runStart>=0){
                if(runLen>=countRunMin){
                  const midRow=runStart+Math.floor(runLen/2);
                  const bpx=G+col*scs+2,bpy=G+midRow*scs+scs-13;
                  const label=String(runLen);
                  ctx.font="bold 8px monospace";
                  const tw=Math.max(ctx.measureText(label).width+6,14);
                  drawBadge(label,bpx,bpy,tw,11);
                }
                runStart=-1;runLen=0;
              }
            }
          }
        }
      }}
    }
    // Ninja stitch detection
    if(countNinjaEnabled){
      const r=Math.max(4,scs*0.3);
      for(let by=visR0;by<visR1;by++){for(let bx=visC0;bx<visC1;bx++){
        const x0=bx*blockW,y0=by*blockH;
        const x1=Math.min(x0+blockW,sW),y1=Math.min(y0+blockH,sH);
        for(let row=y0;row<y1;row++){for(let col=x0;col<x1;col++){
          const idx=row*sW+col;
          const m=pat[idx];
          if(!m||m.id!==focusColour||done[idx])continue;
          let isolated=false;
          if(ps&&ps.clusterSize){
            isolated=ps.clusterSize[idx]===1;
          }else{
            const upIdx=row>0?(row-1)*sW+col:-1;
            const dnIdx=row<sH-1?(row+1)*sW+col:-1;
            const ltIdx=col>0?row*sW+col-1:-1;
            const rtIdx=col<sW-1?row*sW+col+1:-1;
            isolated=![upIdx,dnIdx,ltIdx,rtIdx].some(ni=>ni>=0&&pat[ni]&&pat[ni].id===focusColour&&!done[ni]);
          }
          if(isolated){
            drawNinjaIcon(G+col*scs+scs/2,G+row*scs+scs/2,r);
          }
        }}
      }}
    }
  };
  countingAidsRafRef.current=requestAnimationFrame(draw);
  const unregister=registerChartOverlay("countingAids",draw);
  return ()=>{cancelAnimationFrame(countingAidsRafRef.current);unregister();};
},[pat,done,sW,sH,scs,focusColour,stitchView,countingAidsEnabled,countRunMin,countRunDir,countNinjaEnabled,blockW,blockH,focusBlock,countsVer,analysisResult,lockDetailLevel]);


// Marching-ants outline for the "outline" highlight — F1 of
// reports/track-view-performance-plan.md.
//
// An SVG overlay whose dash offset the browser animates (Web Animations API,
// stepped to 10 updates a second as before). It used to be a 100 ms interval
// setting React state that sat in renderStitch's dependencies, so every tick
// re-rendered all of TrackerApp and repainted the whole chart tile: ~12 000
// elements and ~49 000 fills a second with nobody touching anything. Now a
// tick runs no script at all, and the path is rebuilt only when the tile,
// zoom, pattern or colour changes.
//
// SVG rather than another overlay canvas so it adds nothing to the canvas
// memory budget (CONCURRENT_CHART_CANVASES in useCanvasOverlays.js). Not
// animated under prefers-reduced-motion; browsers already stop animations in
// hidden tabs.
const antsSvgRef=useRef(null);
const antsOn=!statsView&&stitchView==="highlight"&&!!focusColour&&highlightMode==="outline"&&!!pat;
useEffect(()=>{
  const svg=antsSvgRef.current;
  if(!antsOn||!svg)return;
  let reduced=false;
  try{reduced=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);}catch(_){}
  const [bg,fg]=svg.querySelectorAll("path");
  let anims=[],animKey="";
  const draw=()=>{
    const ref=chartTileRef.current;
    const tile=(ref&&ref.w>0)?ref:chartTileFor(stitchScrollRef.current,scs,sW,sH,G,viewBoundsRef.current);
    if(!tile||!tile.w||!tile.h)return;
    svg.style.left=(tile.x-G)+"px";svg.style.top=(tile.y-G)+"px";
    svg.setAttribute("width",tile.w);svg.setAttribute("height",tile.h);
    svg.setAttribute("viewBox",tile.x+" "+tile.y+" "+tile.w+" "+tile.h);
    const o=outlinePathData(pat,sW,sH,focusColour,tileCellRange(tile,scs),scs,G);
    const antColor=o.avgLum>140?"#1A1A2E":"#FFFFFF";
    const antBg=o.avgLum>140?"rgba(255,255,255,0.5)":"rgba(0,0,0,0.4)";
    const dash=Math.max(2,scs*0.3),gap=Math.max(2,scs*0.2),lead=Math.floor(dash);
    [[bg,antBg,0],[fg,antColor,lead]].forEach(([p,colour,offset])=>{
      p.setAttribute("d",o.d);
      p.setAttribute("stroke",colour);
      p.setAttribute("stroke-dasharray",dash+" "+gap);
      p.setAttribute("stroke-dashoffset",offset);
    });
    // One period of the dash pattern at 1 px per 100 ms, the old speed, so the
    // loop is seamless. Restarted only when the dash geometry changes; moving
    // the tile just swaps the path data under the running animation.
    const key=dash+"/"+gap;
    if(reduced||key===animKey||typeof bg.animate!=="function")return;
    anims.forEach(a=>a.cancel());
    animKey=key;
    const period=dash+gap,steps=Math.max(1,Math.round(period));
    anims=[[bg,0],[fg,lead]].map(([p,offset])=>p.animate(
      [{strokeDashoffset:offset+"px"},{strokeDashoffset:(offset-period)+"px"}],
      {duration:period*100,iterations:Infinity,easing:"steps("+steps+")"}));
  };
  draw();
  const unregister=registerChartOverlay("ants",draw);
  return()=>{unregister();anims.forEach(a=>a.cancel());};
},[antsOn,pat,focusColour,scs,sW,sH]);

const updateHoverOverlay = (gc) => {
  if (gc && gc.gx >= 0 && gc.gx < sW && gc.gy >= 0 && gc.gy < sH) {
    if (hoverRefs.current.row) {
      hoverRefs.current.row.style.display = 'block';
      hoverRefs.current.row.style.top = (gc.gy * scs) + 'px';
      hoverRefs.current.row.style.left = (-G) + 'px';
      hoverRefs.current.row.style.width = (sW * scs + G) + 'px';
      hoverRefs.current.row.style.height = scs + 'px';
    }
    if (hoverRefs.current.col) {
      hoverRefs.current.col.style.display = 'block';
      hoverRefs.current.col.style.top = (-G) + 'px';
      hoverRefs.current.col.style.left = (gc.gx * scs) + 'px';
      hoverRefs.current.col.style.width = scs + 'px';
      hoverRefs.current.col.style.height = (sH * scs + G) + 'px';
    }
    if (!hoverCellRef.current || hoverCellRef.current.row !== gc.gy || hoverCellRef.current.col !== gc.gx) {
      hoverCellRef.current = { row: gc.gy, col: gc.gx };
      renderHoverBar();
    }
  } else {
    if (hoverRefs.current.row) hoverRefs.current.row.style.display = 'none';
    if (hoverRefs.current.col) hoverRefs.current.col.style.display = 'none';
    if (hoverCellRef.current) {
      hoverCellRef.current = null;
      renderHoverBar();
    }
  }
};

const rafIdRef = useRef(null);

// Repaint the cells [x0,x1) x [y0,y1) by running the chart renderer clipped
// to them, so a partial repaint draws exactly what a full one would: the
// stitches and every line or marker crossing them (grid, centre lines, guide,
// backstitch, park markers, row-mode tint, work-area fade). Before this the
// fast path was a hand-copied subset of drawStitch that cleared the cell and
// redrew only the stitch, so marking a stitch cut a gap in the guide, the
// centre and grid lines and any backstitch through it until the next full
// repaint.
//
// Only the part on the current tile is painted: the canvas covers just the
// visible slice, and off-tile cells are repainted from state when scrolled
// to (renderStitchIfScrolledOut), so drawing them would be clipped away.
function repaintChartCells(x0,y0,x1,y1,isDoneAt){
  const canvas=stitchRef.current;
  if(!canvas||!pat||!cmap)return;
  const t=chartTileRef.current;
  if(!t||!(t.w>0))return;
  const r=tileCellRange(t,scs);
  x0=Math.max(x0,r.x0);y0=Math.max(y0,r.y0);x1=Math.min(x1,r.x1);y1=Math.min(y1,r.y1);
  if(x0>=x1||y0>=y1)return;
  const ctx=canvas.getContext('2d');
  // The canvas is a tile: re-establish the chart-coordinate transform (tile
  // origin and render scale) that renderStitch left it in.
  const s=t.scale>0?t.scale:1;
  ctx.setTransform(s,0,0,s,-t.x*s,-t.y*s);
  const left=G+x0*scs,top=G+y0*scs,right=G+x1*scs,bottom=G+y1*scs;
  ctx.save();
  // The clip reaches a little past the cells: a park marker's outline (and
  // a cell's own outline) overhangs its edge by up to a pixel, and that
  // overhang must be drawn or erased with the cell.
  const sp=2;
  ctx.beginPath();ctx.rect(left-sp,top-sp,right-left+2*sp,bottom-top+2*sp);ctx.clip();
  // Paint one cell further on every side than the cells themselves, so
  // everything that overlaps the clipped area — neighbours' outlines and
  // markers — is drawn, in the same order as a full paint.
  const m=scs;
  drawStitch(ctx,scs,{left:left-m,top:top-m,right:right+m,bottom:bottom+m,width:right-left+2*m,height:bottom-top+2*m,overdraw:0},isDoneAt);
  ctx.restore();
}
// Paint stitches that were just marked or unmarked, ahead of the setDone
// that will commit them (callers set skipNextFullRedrawRef so that commit
// does not repaint the whole tile as well). `changes` is [{idx}], `nd` the
// new done array — passed explicitly because each cell's repaint also paints
// the overhang into its neighbours, which must show their new state too.
//
// Few on-tile cells: repaint each. Many (a whole colour, a big range, at low
// zoom): one repaint of the tile does less work than hundreds of clipped
// ones, each of which paints its neighbours as well. Off-tile cells are
// skipped; they are painted from `done` when scrolled to.
function paintDoneChanges(changes,nd){
  if(nd&&minimapApiRef.current)minimapApiRef.current.cellsChanged(changes,nd);   // the overview: only the blocks these cells fall in
  if(!stitchRef.current||!pat||!cmap||!nd)return;
  const t=chartTileRef.current;
  if(!t||!(t.w>0))return;
  const r=tileCellRange(t,scs);
  const on=[];
  for(let i=0;i<changes.length;i++){
    const idx=changes[i].idx,x=idx%sW,y=(idx-x)/sW;
    if(x>=r.x0&&x<r.x1&&y>=r.y0&&y<r.y1)on.push(idx);
  }
  if(!on.length)return;
  const isDoneAt=i=>!!nd[i];
  const tileCells=(r.x1-r.x0)*(r.y1-r.y0);
  if(on.length>Math.max(64,tileCells/8)){repaintChartCells(r.x0,r.y0,r.x1,r.y1,isDoneAt);return;}
  for(let i=0;i<on.length;i++){const x=on[i]%sW,y=(on[i]-x)/sW;repaintChartCells(x,y,x+1,y+1,isDoneAt);}
}
// Memoised callers (_commitBulk, _dragMarkOnToggle) hold an older render's
// closure; going through this ref makes them paint with the current zoom,
// view settings, guide and markers.
const paintDoneChangesRef=useRef(null);
paintDoneChangesRef.current=paintDoneChanges;

// ═══ Half-stitch marking helpers ═══
function hitTestHalfStitch(localX, localY, cellSize, margin) {
  // Determine which diagonal slash orientation (fwd=/ or bck=\) the click is closest to.
  const normX = localX / cellSize;
  const normY = localY / cellSize;
  // "/" lies on y = 1 - x, "\" lies on y = x.
  // If the click is within the margin of both diagonals, treat it as ambiguous.
  const fwdDist = Math.abs(normY - (1 - normX));
  const bckDist = Math.abs(normY - normX);
  const threshold = margin / cellSize;
  if (fwdDist < threshold && bckDist < threshold) return "ambiguous";
  return fwdDist < bckDist ? "fwd" : "bck";
}

function setHalfHistoryState(idx,dir,on){
  const newHd = new Map(halfDoneRef.current);
  const hd = { ...(newHd.get(idx) || {}) };
  hd[dir] = on ? 1 : 0;
  if (!hd.fwd && !hd.bck) newHd.delete(idx);
  else newHd.set(idx, hd);
  applyHalfDoneDelta(idx,dir,(halfDoneRef.current.get(idx)||{})[dir],on,halfStitches);
  setHalfDone(newHd);
  renderStitch();
}
function _toggleHalfDone(idx, dir) {
  const oldVal=(halfDoneRef.current.get(idx)||{})[dir]?1:0;
  const hs=halfStitches.get(idx);
  if(hs&&hs[dir]&&hs[dir].id)pendingColoursRef.current.add(hs[dir].id);
  const entry={type:"HALF",idx,dir,oldVal};
  entry.activity=recordAutoActivity(oldVal?0:1,oldVal?1:0,oldVal?0:0.5,oldVal?0.5:0);
  setTrackHistory(prev=>[...prev,entry].slice(-TRACK_HISTORY_MAX));
  setRedoStack([]);
  setHalfHistoryState(idx,dir,!oldVal);
}

function _markHalfDoneFromDisambig(idx, dir) {
  if (isColourLocked() && !halfStitchMatchesFocus(idx, dir)) {
    setHalfDisambig(null);
    return;
  }
  _toggleHalfDone(idx, dir);
  setHalfDisambig(null);
}

// ── Highlight colour lock helpers ──
function isColourLocked() {
  return stitchView === "highlight" && !!focusColour && stitchMode === "track";
}
function fullStitchMatchesFocus(idx) {
  return pat[idx] && pat[idx].id === focusColour;
}
function halfStitchMatchesFocus(idx, dir) {
  const hs = halfStitches.get(idx);
  return hs && hs[dir] && hs[dir].id === focusColour;
}

// ═══ Parking ═══
// A park marker shows where a thread is waiting on the front of the fabric.
// The thread parked on a stitch is that stitch's colour, so the marker takes
// its colour from the stitch and there is nothing to pick first (Pattern
// Keeper and Markup R-XP work the same way). Parking a stitch that already
// holds its marker removes it. Reached by Shift + right-click (desktop, Mark or Navigate) or
// press-and-hold in Navigate mode (touch). Returns true if anything changed.
function toggleParkAt(gx,gy){
  if(!pat||!cmap||gx<0||gx>=sW||gy<0||gy>=sH)return false;
  const idx=gy*sW+gx;
  const cell=pat[idx];
  if(!cell||cell.id==="__skip__"||cell.id==="__empty__")return false;
  const info=cmap[cell.id];
  if(!info)return false;
  const cur=doneRef.current||done;
  if(cur&&cur[idx]){
    try{if(window.Toast&&window.Toast.show)window.Toast.show({message:"That stitch is already done. Park on the next stitch you'll make in this colour.",type:"info",duration:3000});}catch(_){}
    return false;
  }
  const colorId=cell.id;
  const prev=parkMarkersRef.current;
  const next=(()=>{
    const existing=prev.some(m=>m.x===gx&&m.y===gy);
    if(existing)return prev.filter(m=>m.x!==gx||m.y!==gy);
    // Multi-colour parking — Option A: auto-rotate corners.
    // Pick the next free corner at this cell in [BL, BR, TR, TL]
    // order so markers already on the cell (e.g. synced from an older
    // version that parked any colour anywhere) are not overdrawn. If all
    // four are taken, replace the OLDEST marker at this cell (FIFO).
    const ORDER=["BL","BR","TR","TL"];
    const atCell=prev.filter(m=>m.x===gx&&m.y===gy);
    const used=new Set(atCell.map(m=>m.corner||"BL"));
    let corner=ORDER.find(c=>!used.has(c));
    let next=prev;
    if(!corner){
      // All four corners occupied — evict the oldest at this cell.
      const oldestIdx=prev.findIndex(m=>m===atCell[0]);
      if(oldestIdx>=0)next=prev.filter((_,i)=>i!==oldestIdx);
      corner=atCell[0].corner||"BL";
    }
    return[...next,{x:gx,y:gy,colorId,rgb:info.rgb,corner}];
  })();
  commitParkMarkers(prev,next);
  return true;
}

// Park changes are steps in the same undo history as stitch marks, so the
// Undo button and Ctrl+Z undo whatever was done last. Stored as a diff
// (markers added / removed) rather than a snapshot, so undoing cannot bring
// back markers that changed some other way since (sync, load pruning).
function sameParkMarker(a,b){return a.x===b.x&&a.y===b.y&&a.colorId===b.colorId&&(a.corner||"BL")===(b.corner||"BL");}
function commitParkMarkers(prev,next,extra){
  const added=next.filter(m=>!prev.some(o=>sameParkMarker(o,m)));
  const removed=prev.filter(m=>!next.some(o=>sameParkMarker(o,m)));
  if(!added.length&&!removed.length)return;
  // Ahead of the render, so a second toggle in the same frame sees this one.
  parkMarkersRef.current=next;
  setParkMarkers(next);
  const entry=Object.assign({type:"PARK",added,removed},extra);
  setTrackHistory(h=>{let n=[...h,entry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
  return entry;
}
// Clear every park marker: asks first, and the step can be undone from the toast or the Undo button.
function clearAllParkMarkers(){
  const n0=parkMarkersRef.current.length;if(!n0)return;
  askConfirm({title:"Clear all park markers?",message:"Remove all "+(n0===1?"1 park marker":n0.toLocaleString('en-GB')+" park markers")+" from the chart?\n\nYou can undo this straight afterwards.",confirmLabel:"Clear all",danger:true}).then(ok=>{
    if(!ok)return;
    const entry=commitParkMarkers(parkMarkersRef.current,[],{layersBefore:Object.assign({},parkLayersRef.current)});setParkLayers({});
    if(entry)offerStepUndo(entry,(entry.removed.length===1?"1 park marker":entry.removed.length.toLocaleString('en-GB')+" park markers")+" cleared","Undo");
  });
}
// Apply a PARK history entry forwards (redo) or backwards (undo).
function applyParkEntry(entry,forward){
  const add=forward?entry.added:entry.removed, drop=forward?entry.removed:entry.added;
  const cur=parkMarkersRef.current;
  const next=cur.filter(m=>!drop.some(o=>sameParkMarker(o,m))).concat(add.filter(m=>!cur.some(o=>sameParkMarker(o,m))));
  parkMarkersRef.current=next;
  setParkMarkers(next);
  // A step that also reset the layer visibility (Clear all) remembers what it was: Undo puts it back, redo clears it again.
  if(entry.layersBefore)setParkLayers(forward?{}:Object.assign({},entry.layersBefore));
}

// Desktop secondary clicks select a colour; Shift parks / unparks instead.
// Touch context menus still belong to the long-press recognisers.
function selectTrackerColour(id){
  setStitchView("highlight");setFocusColour(id);
  if(typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(max-width:899px)").matches)setLeftSidebarOpen(false);
}
function handleStitchContextMenu(e){
  if(isEditMode||!pat)return;
  if(lastPointerTypeRef.current!=="mouse"){
    if(dragMarkHandlers.onContextMenu)dragMarkHandlers.onContextMenu(e);
    if(stitchMode==="navigate")e.preventDefault();
    return;
  }
  if(e.defaultPrevented)return;
  if(Date.now()-lastSecondaryPressRef.current>1000)return;
  const gc=gridCoord(stitchRef,e,scs,G,false,chartTileRef.current);
  // Off the chart (the gutter): leave the browser menu alone.
  if(!gc||gc.gx<0||gc.gx>=sW||gc.gy<0||gc.gy>=sH)return;
  e.preventDefault();
  const cell=pat[gc.gy*sW+gc.gx];
  if(!cell||cell.id==="__skip__"||cell.id==="__empty__"||!cmap||!cmap[cell.id])return;
  if(e.shiftKey)toggleParkAt(gc.gx,gc.gy);
  else selectTrackerColour(cell.id);
}

function handleStitchKeyDown(e){
  // The chart has focus. The rules, in one place (also in the Help drawer):
  //  - The arrow keys move the guide, in Mark and Navigate mode (Shift: 10 stitches). Row mode keeps Up and Down for rows.
  //    Alt+arrows still move the spotlight, and with focus off the chart Left and Right still change the highlighted colour.
  //  - Mark mode: Enter marks or unmarks the stitch at the guide; Space does too once the guide is the keyboard's;
  //    Shift+Enter fills the rectangle from the last stitch marked this way. `[` and `]` change colour wherever focus is.
  //  - Esc clears the guide. Claimed here, before the shortcut registry, which skips events that are already handled.
  const plain=!e.altKey&&!e.ctrlKey&&!e.metaKey;
  const inMark=stitchMode==="track"&&!isEditMode&&!!pat;
  if((stitchMode==="navigate"||stitchMode==="track")&&!isEditMode&&plain&&GUIDE_KEYS[e.key]){
    if(rowModeActive&&stitchMode!=="navigate"&&(e.key==="ArrowUp"||e.key==="ArrowDown"))return;   // row mode owns Up and Down
    e.preventDefault();
    kbGuideRef.current=true;
    moveGuideBy(GUIDE_KEYS[e.key][0]*(e.shiftKey?10:1),GUIDE_KEYS[e.key][1]*(e.shiftKey?10:1));
    return;
  }
  // Ctrl or Cmd + Shift + Enter: unpick the rectangle from the last stitch marked with the keyboard to the guide
  // (the Shift+Enter variant that takes marks out of every kind of stitch there).
  if(inMark&&e.key==="Enter"&&e.shiftKey&&(e.ctrlKey||e.metaKey)&&!e.altKey){
    e.preventDefault();
    if(e.repeat)return;
    const g=guideRef.current;
    const onChart=kbGuideRef.current&&g&&g.row>=0&&g.col>=0&&g.row<sH&&g.col<sW;
    const anchor=kbAnchorRef.current;
    if(!onChart||!anchor){
      if(window.Toast&&window.Toast.show)window.Toast.show({message:"Mark a stitch with Enter first, move the guide to the opposite corner, then press Ctrl+Shift+Enter to unpick the rectangle.",type:'info',duration:5000});
      return;
    }
    const ax=anchor.idx%sW,ay=(anchor.idx-ax)/sW,set=new Set();
    for(let y=Math.min(ay,g.row);y<=Math.max(ay,g.row);y++)for(let x=Math.min(ax,g.col);x<=Math.max(ax,g.col);x++)set.add(y*sW+x);
    if(unpickAreaRef.current(set))kbAnchorRef.current={idx:g.row*sW+g.col,intent:'unmark'};
    return;
  }
  const isEnter=e.key==="Enter"&&!e.altKey&&!e.ctrlKey&&!e.metaKey;
  const isSpace=(e.key===" "||e.code==="Space")&&plain&&!e.shiftKey;
  if(inMark&&(isEnter||(isSpace&&kbGuideRef.current))){
    e.preventDefault();
    if(e.repeat)return;
    const g=guideRef.current;
    const onChart=g&&g.row>=0&&g.col>=0&&g.row<sH&&g.col<sW;
    if(!kbGuideRef.current||!onChart){
      // First press: take (or drop) the guide, so the next one marks where the guide is rather than somewhere unseen.
      kbGuideRef.current=true;
      if(!onChart)moveGuideBy(0,0);
      return;
    }
    // A backstitch line chosen with B: Enter marks or unmarks it (Shift+Enter and the stitch under it are left alone).
    if(!e.shiftKey&&bsSelectRef.current>=0&&bsLines[bsSelectRef.current]){toggleBsLine(bsSelectRef.current);return;}
    const idx=g.row*sW+g.col;
    const cell=pat[idx];
    // A cell of quarter stitches whose whole stitch is done (or absent): Enter marks its quarters one at a time, nearest the
    // top left first and then on, a second press on the next. A plain Enter on any other cell marks the stitch as before.
    if(!e.shiftKey&&window.Fractional&&partialStitches.size&&partialStitches.has(idx)&&!halfStitches.has(idx)&&layerVis.quarter!==false){
      const isFull=cell&&cell.id!=="__skip__"&&cell.id!=="__empty__";
      if(!isFull||doneRef.current[idx]){
        const q=window.Fractional.nextToMark(partialStitches.get(idx),partialDone.get(idx),isColourLocked()?focusColour:null);
        if(q){toggleQuarterDone({idx,pos:q,id:partialStitches.get(idx)[q].id});return;}
        if(!isFull)return;
      }
    }
    if(!cell||cell.id==="__skip__"||cell.id==="__empty__")return;
    if(layerVis.full===false)return;
    const anchor=kbAnchorRef.current;
    if(isEnter&&e.shiftKey&&anchor&&anchor.idx!==idx){
      const ax=anchor.idx%sW,ay=(anchor.idx-ax)/sW;
      const set=new Set();
      for(let y=Math.min(ay,g.row);y<=Math.max(ay,g.row);y++)for(let x=Math.min(ax,g.col);x<=Math.max(ax,g.col);x++)set.add(y*sW+x);
      // The anchor moves only when the rectangle was committed: not when a colour lock filtered every stitch, and not while the
      // "mark all as" question is open (cancelling it must not leave the next Shift+Enter starting from an endpoint never marked).
      if(_commitBulk(set,anchor.intent,'range'))kbAnchorRef.current={idx:idx,intent:anchor.intent};
      return;
    }
    const was=doneRef.current[idx];
    _dragMarkOnToggle(idx);
    const now=doneRef.current[idx];
    if(now!==was)kbAnchorRef.current={idx:idx,intent:now?'mark':'unmark'};   // a colour lock can refuse the mark
    return;
  }
  if(isEditMode||!pat)return;
  if(e.key!=="ContextMenu"&&!(e.shiftKey&&e.key==="F10"))return;
  const guide=guideRef.current;
  if(!guide||guide.row<0||guide.row>=sH||guide.col<0||guide.col>=sW)return;
  e.preventDefault();
  toggleParkAt(guide.col,guide.row);
}

// Every way of clearing the guide goes through here, so the keyboard's ownership and range anchor go with it.
function clearGuide(){setHlRow(-1);setHlCol(-1);kbGuideRef.current=false;kbAnchorRef.current=null;setBsSelect(-1);}
const GUIDE_KEYS={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
// Move the guide by (dx,dy) stitches — or, with no guide yet, drop it at the
// middle of the view — keeping it inside the chart (or the work area's view)
// and on screen, and announce where it is for screen readers.
function moveGuideBy(dx,dy){
  const el=stitchScrollRef.current;
  if(!el||!pat||!(scs>0))return;
  const off=chartScrollOffset();
  const vx0=(el.scrollLeft+off.x-G)/scs,vy0=(el.scrollTop+off.y-G)/scs;
  const vx1=vx0+el.clientWidth/scs,vy1=vy0+el.clientHeight/scs;
  const vb=viewBoundsRef.current;
  const bx0=vb?vb.x0:0,by0=vb?vb.y0:0,bx1=vb?vb.x1:sW,by1=vb?vb.y1:sH;
  const g=guideRef.current;
  let col,row;
  if(g.row<0||g.col<0){col=Math.floor((vx0+vx1)/2);row=Math.floor((vy0+vy1)/2);}
  else{col=g.col+dx;row=g.row+dy;}
  col=Math.max(bx0,Math.min(bx1-1,col));row=Math.max(by0,Math.min(by1-1,row));
  setHlRow(row);setHlCol(col);setBsSelect(-1);
  if(col<vx0+1||col>vx1-2||row<vy0+1||row>vy1-2)centreOnCell(col,row);
}
useEffect(()=>{
  if(!pat)return;
  const timer=setTimeout(()=>{
    const live=guideLiveRef.current;if(!live)return;
    const idx=hlRow*sW+hlCol;
    const cell=hlRow>=0&&hlCol>=0&&pat[idx];
    const label=cell&&cellThreadLabel(idx);
    const state=label?((doneRef.current&&doneRef.current[idx])?"full cross done":"full cross not done"):"empty";
    const position=cell?"Guide at row "+(hlRow+1)+", column "+(hlCol+1)+(label?", "+label:"")+", "+state+". ":"No guide. ";
    const selected=focusColour&&cmap&&cmap[focusColour];
    const text=position+ProgressUnits.formatUnits(effectiveCombinedDone)+" of "+ProgressUnits.formatUnits(effectiveCombinedTotal)+" stitch units done"+(statsCountMode==='visible'?" in visible layers":" across all layers")+". "+
      (selected?"Selected "+formatThread(selected)+". ":"")+Math.round(stitchZoom*100)+" percent zoom."+
      (layerVis.full===false?" Full crosses hidden.":"");
    if(live.textContent!==text)live.textContent=text;
  },250);
  return()=>clearTimeout(timer);
},[hlRow,hlCol,pat,cmap,sW,done,halfDone,partialDone,effectiveCombinedDone,effectiveCombinedTotal,focusColour,stitchZoom,layerVis.full,statsCountMode]);

// Touch / pen press-and-hold in Navigate mode parks the stitch. Capture-
// phase handlers so they sit alongside useDragMark's (idle in this mode)
// rather than replacing them. The hold is abandoned if the finger moves
// past the tap slop, a second finger lands (pinch), or the browser takes
// the gesture over for a native pan (pointercancel).
function clearNavHold(){
  const h=navHoldRef.current;
  if(h){clearTimeout(h.timer);navHoldRef.current=null;}
}
// Ctrl+click is the Mac secondary click: it selects (via contextmenu) and must
// not also mark the stitch or move the guide.
function isMacSecondaryClick(e){
  return e.button===0&&e.ctrlKey&&!!(window.Shortcuts&&window.Shortcuts.isMac&&window.Shortcuts.isMac());
}
function handleCanvasPointerDownCapture(e){
  // Hit-testing reads the canvas's box on screen, which a zoom preview has
  // scaled, so a press lands the previewed zoom first.
  if(zoomPreviewRef.current&&touchStateRef.current.mode!=="pinch")commitZoomPreview();
  lastPointerTypeRef.current=e.pointerType||"mouse";
  lastSecondaryPressRef.current=(e.button===2||isMacSecondaryClick(e))?Date.now():0;
  clearNavHold();
  if(stitchMode!=="navigate"||isEditMode||!pat)return;
  if(!e.pointerType||e.pointerType==="mouse"||e.isPrimary===false)return;
  const x=e.clientX,y=e.clientY;
  const ms=(window.TouchConstants&&window.TouchConstants.LONG_PRESS_MS)||500;
  const timer=setTimeout(()=>{
    navHoldRef.current=null;
    const gc=gridCoord(stitchRef,{clientX:x,clientY:y},scs,G,false,chartTileRef.current);
    if(!gc)return;
    // The finger lifting after a hold can still produce a compatibility
    // mousedown, which would move the guide crosshair onto the stitch.
    suppressNavClickUntilRef.current=Date.now()+800;
    if(toggleParkAt(gc.gx,gc.gy)){try{if(navigator.vibrate)navigator.vibrate(10);}catch(_){}}
  },ms);
  navHoldRef.current={timer,x,y,id:e.pointerId};
}
function handleCanvasPointerMoveCapture(e){
  const h=navHoldRef.current;
  if(!h||e.pointerId!==h.id)return;
  const slop=(window.TouchConstants&&window.TouchConstants.TAP_SLOP_PX)||10;
  if(Math.abs(e.clientX-h.x)>slop||Math.abs(e.clientY-h.y)>slop)clearNavHold();
}
useEffect(()=>clearNavHold,[stitchMode,isEditMode,pat]);

// Navigate-mode press (mouse, or the compatibility mousedown after a touch
// tap). Tracked on window so a drag keeps panning when the pointer leaves
// the canvas. Past a few pixels it is a pan — the same absolute-scroll maths
// as startPan/doPan, so handleStitchMouseMove's doPan agrees while the
// pointer is over the canvas. Otherwise, on release, it toggles the guide.
const NAV_DRAG_PX=4;
const navPressCleanupRef=useRef(null);
function beginNavPress(e,gx,gy){
  const el=stitchScrollRef.current;
  if(!el)return;
  if(navPressCleanupRef.current)navPressCleanupRef.current();
  const press={x:e.clientX,y:e.clientY,sl:el.scrollLeft,st:el.scrollTop,dragging:false};
  const move=ev=>{
    const dx=ev.clientX-press.x,dy=ev.clientY-press.y;
    if(!press.dragging){
      if(Math.abs(dx)<=NAV_DRAG_PX&&Math.abs(dy)<=NAV_DRAG_PX)return;
      press.dragging=true;
      panStart.current={x:press.x,y:press.y,scrollX:press.sl,scrollY:press.st};
      setIsPanning(true);
    }
    el.scrollLeft=press.sl-dx;el.scrollTop=press.st-dy;
  };
  const cleanup=()=>{window.removeEventListener("mousemove",move);window.removeEventListener("mouseup",up);navPressCleanupRef.current=null;};
  const up=()=>{
    cleanup();
    if(press.dragging){setIsPanning(false);return;}
    toggleGuideAt(gx,gy);
  };
  window.addEventListener("mousemove",move);
  window.addEventListener("mouseup",up);
  navPressCleanupRef.current=cleanup;
}
useEffect(()=>()=>{if(navPressCleanupRef.current)navPressCleanupRef.current();},[]);
// Place the guide crosshair on a cell, or clear it if it is already there.
function toggleGuideAt(gx,gy){
  if(gx<0||gx>=sW||gy<0||gy>=sH)return;
  const g=guideRef.current;
  if(g.row===gy&&g.col===gx){setHlRow(-1);setHlCol(-1);}
  else{setHlRow(gy);setHlCol(gx);}
}

// A pointer press hands the guide back from the keyboard (kbGuideRef): Space pans again and Enter does not mark under a stale guide.
function handleStitchMouseDown(e){
  if(!stitchRef.current||!pat)return;
  // Secondary clicks must not mark, move the guide or start a Space-pan.
  if(e.button===2||isMacSecondaryClick(e))return;
  kbGuideRef.current=false;kbAnchorRef.current=null;
  stopPanMomentum();
  if(e.button===1||isSpaceDownRef.current){e.preventDefault();startPan(e);return;}
  // Alt+click: relocate the spotlight focus block to the clicked cell's block.
  // Works in both Mark and Navigate modes; bypasses edit-mode cell editor too.
  // No-op when spotlight is off or the stitching style has no spatial blocks.
  if(e.altKey&&e.button===0&&focusEnabled&&stitchingStyle!=="crosscountry"&&sW&&sH){
    const gcA=gridCoord(stitchRef,e,scs,G,false,chartTileRef.current);
    if(gcA&&gcA.gx>=0&&gcA.gx<sW&&gcA.gy>=0&&gcA.gy<sH){
      e.preventDefault();
      const bCols=Math.ceil(sW/blockW),bRows=Math.ceil(sH/blockH);
      const bx=Math.max(0,Math.min(bCols-1,Math.floor(gcA.gx/blockW)));
      const by=Math.max(0,Math.min(bRows-1,Math.floor(gcA.gy/blockH)));
      // In a work area Spotlight stays among the area's sections.
      if(_inSpotRange({bx,by}))setFocusBlock({bx,by});
      return;
    }
  }
  // Edit Mode: left-click on grid opens cell edit popover instead of any navigate/track action
  if(isEditMode){
    if(e.button!==0)return;
    const gc2=gridCoord(stitchRef,e,scs,G,false,chartTileRef.current);
    if(gc2&&gc2.gx>=0&&gc2.gx<sW&&gc2.gy>=0&&gc2.gy<sH){
      const idx=gc2.gy*sW+gc2.gx;
      const cell=pat[idx];
      if(cell.id==="__skip__")return; // __skip__ cells are not editable
      setCellEditPopover({idx,row:gc2.gy+1,col:gc2.gx+1,x:e.clientX,y:e.clientY});
    }
    return;
  }
  // Always the cell under the pointer. Park markers are drawn inside a cell
  // (a corner triangle), so placing them must not round to the nearest grid
  // line — that put three clicks in four on a neighbouring cell.
  let gc=gridCoord(stitchRef,e,scs,G,false,chartTileRef.current);
  if(!gc)return;let{gx,gy}=gc;
  if(stitchMode==="navigate"){
    // Navigate mode is a hand tool: press and drag pans the chart; a press
    // released without moving places the guide crosshair, or clears it if
    // it is already on that cell. Parking is Shift + right-click or press-and-hold
    // (toggleParkAt).
    if(Date.now()<suppressNavClickUntilRef.current)return;
    e.preventDefault();
    beginNavPress(e,gx,gy);
    return;
  }
  if(gx<0||gx>=sW||gy<0||gy>=sH||!done)return;
  if(areaOn&&!window.WorkArea.contains(workArea,gx,gy))return;
  let idx=gy*sW+gx;

  // A press on a French knot is the knot's (stitchPointerHandlers).
  if(knotPressRef.current||bsPressRef.current)return;

  if(pat[idx].id==="__skip__"||pat[idx].id==="__empty__")return;

  // C3: cell tap / drag-mark / shift+click range / long-press range are all
  // owned by useDragMark (see _dragMarkOnToggle / _dragMarkOnCommitDrag /
  // _dragMarkOnCommitRange below). The mousedown handler keeps only the
  // pan, edit-mode popover and navigate-mode branches above.
  e.preventDefault();
}
function handleStitchMouseMove(e){
  if(isPanning){
    doPan(e);
    setHoverInfo(null);
    updateHoverOverlay(null);
    return;
  }
  let gc=gridCoord(stitchRef,e,scs,G,false,chartTileRef.current);

  updateHoverOverlay(gc);

  if(dragStateRef.current.isDragging) {
    setHoverInfo(null);
  } else if(pat && gc && gc.gx>=0 && gc.gx<sW && gc.gy>=0 && gc.gy<sH){
    let idx=gc.gy*sW+gc.gx;
    let cell=pat[idx];
    if(cell && cell.id!=="__skip__" && cell.id!=="__empty__"){
      // Only update state if the hovered cell actually changed
      const hi=hoverInfoRef.current;
      if(!hi || hi.row!==gc.gy+1 || hi.col!==gc.gx+1){
        // The hover bar writes the thread through formatThread (the cell, or its palette entry for the name).
        setHoverInfo({row:gc.gy+1, col:gc.gx+1, id:cell.id, name:formatThread((cmap&&cmap[cell.id])||cell,{variant:"name"})});
      }
    } else {
      setHoverInfo(null);
    }
  } else if (!dragStateRef.current.isDragging) {
    setHoverInfo(null);
  }

  // C3: drag mutation now flows through useDragMark; mousemove only owns
  // pan + hover updates above.
}
function handleStitchMouseLeave(){
  handleMouseUp();
  setHoverInfo(null);
  updateHoverOverlay(null);
}
function handleMouseUp(){
  if(isPanning){setIsPanning(false);return;}
  // C3: drag commit owned by useDragMark via _dragMarkOnCommitDrag.
}

function startPan(e){
  if(!stitchScrollRef.current)return;
  setIsPanning(true);
  if(isSpaceDownRef.current)spacePannedRef.current=true;
  panStart.current={x:e.clientX,y:e.clientY,scrollX:stitchScrollRef.current.scrollLeft,scrollY:stitchScrollRef.current.scrollTop};
}
function doPan(e){
  if(!stitchScrollRef.current)return;
  let dx=e.clientX-panStart.current.x,dy=e.clientY-panStart.current.y;
  stitchScrollRef.current.scrollLeft=panStart.current.scrollX-dx;
  stitchScrollRef.current.scrollTop=panStart.current.scrollY-dy;
}

// ═══ Zoom preview: pinch and trackpad zoom without a repaint per step ═══
// A pinch changes the zoom on every touch move, and each change used to
// re-render the tracker and, whenever the cell size moved a pixel, repaint the
// whole chart tile: roughly 40 full repaints to pinch from 100% to 300%.
// Instead, while a pinch (or a run of Ctrl/Cmd + wheel or trackpad-pinch
// events) is under way, the chart layer (canvas, overlays, guide and hover
// lines together) is scaled and moved with a CSS transform, which the
// compositor does without any repaint, and the zoom is committed once at the
// end. It is also committed early ("rebased") when the scaled tile would no
// longer cover the view, or past ZOOM_PREVIEW_MAX_SCALE, where the stretched
// pixels get blurry. The rulers keep their old numbers until the commit.
const ZOOM_PREVIEW_MAX_SCALE=1.6;
const ZOOM_PREVIEW_WHEEL_IDLE_MS=160;
const chartLayerRef=useRef(null);
// {z0, z, k, tx, ty, ox, oy: layer origin on screen, ax, ay: anchor in layer
//  pixels, mx, my: anchor on screen, canvas / layerW / layerH / view: layer
//  and screen geometry when the preview began}
const zoomPreviewRef=useRef(null);
// Set by commitZoomPreview, read once the new zoom has rendered: the stitch
// (in cells, fractional) that must end up under the screen point mx, my.
const pendingZoomAnchorRef=useRef(null);
const wheelCommitTimerRef=useRef(0);
// The latest renderStitchIfScrolledOut, for the commit, which runs inside an
// older render's handler after flushSync has rendered a new one.
const scrollRepaintRef=useRef(null);
function beginZoomPreview(mx,my){
  const layer=chartLayerRef.current, canvas=stitchRef.current, el=stitchScrollRef.current;
  if(!layer||!canvas||!el||!sW)return null;
  layer.style.transform="";
  const lr=layer.getBoundingClientRect(), cr=canvas.getBoundingClientRect(), sr=el.getBoundingClientRect();
  if(!(lr.width>0)||!(cr.width>0))return null;
  const vl=sr.left+el.clientLeft, vt=sr.top+el.clientTop;
  const p={z0:stitchZoomRef.current,z:stitchZoomRef.current,k:1,tx:0,ty:0,
    ox:lr.left,oy:lr.top,ax:mx-lr.left,ay:my-lr.top,mx:mx,my:my,
    canvas:{l:cr.left-lr.left,t:cr.top-lr.top,r:cr.right-lr.left,b:cr.bottom-lr.top},
    layerW:lr.width,layerH:lr.height,
    // The part of the scroller the chart shows through: the rulers cover G
    // along the top and left.
    view:{l:vl+G,t:vt+G,r:vl+el.clientWidth,b:vt+el.clientHeight}};
  layer.style.transformOrigin="0 0";
  layer.style.willChange="transform";
  zoomPreviewRef.current=p;
  return p;
}
// Show zoom z with the preview's anchor under screen point mx, my. Returns
// false when the preview should be committed and begun again: the scaled tile
// no longer covers the part of the view that shows chart, or it is stretched
// past ZOOM_PREVIEW_MAX_SCALE.
function updateZoomPreview(z,mx,my){
  const p=zoomPreviewRef.current, layer=chartLayerRef.current;
  if(!p||!layer)return true;
  const k=z/p.z0, tx=mx-p.ox-k*p.ax, ty=my-p.oy-k*p.ay;
  p.z=z;p.k=k;p.tx=tx;p.ty=ty;p.mx=mx;p.my=my;
  layer.style.transform="translate("+tx+"px,"+ty+"px) scale("+k+")";
  if(k>=ZOOM_PREVIEW_MAX_SCALE)return false;
  const X=v=>p.ox+tx+k*v, Y=v=>p.oy+ty+k*v;
  const nl=Math.max(p.view.l,X(0)), nt=Math.max(p.view.t,Y(0));
  const nr=Math.min(p.view.r,X(p.layerW)), nb=Math.min(p.view.b,Y(p.layerH));
  if(nr<=nl||nb<=nt)return true;
  return X(p.canvas.l)<=nl+1&&Y(p.canvas.t)<=nt+1&&X(p.canvas.r)>=nr-1&&Y(p.canvas.b)>=nb-1;
}
// Keep the zoom where it is but zoom about a new screen point from here on
// (the wheel follows the pointer; a pinch keeps its first anchor).
function reanchorZoomPreview(mx,my){
  const p=zoomPreviewRef.current;
  if(!p)return;
  p.ax=(mx-p.ox-p.tx)/p.k;p.ay=(my-p.oy-p.ty)/p.k;
}
// Commit the previewed zoom and position for real: one zoom state change,
// rendered synchronously so the transform comes off in the same frame as the
// chart appears at its new size. The stitch under the anchor point stays under
// it, worked out in cells, so the commit lands exactly where the preview
// showed, give or take the rounding of the cell size to a whole pixel.
function commitZoomPreview(){
  clearTimeout(wheelCommitTimerRef.current);
  const p=zoomPreviewRef.current, layer=chartLayerRef.current, el=stitchScrollRef.current;
  zoomPreviewRef.current=null;
  if(!p)return;
  const clear=()=>{if(layer){layer.style.transform="";layer.style.willChange="";}};
  if(!layer||!el||!sW){clear();return;}
  // The layer is sW cells plus 2 px wide at the committed cell size.
  // The anchor stays in screen coordinates: the new zoom can move or resize
  // the chart box (a notice above it coming or going), so its position is
  // measured when the scroll is placed.
  const cs0=(p.layerW-2)/sW;
  pendingZoomAnchorRef.current={
    cx:(p.mx-p.ox-p.tx)/p.k/cs0, cy:(p.my-p.oy-p.ty)/p.k/cs0, mx:p.mx, my:p.my};
  const z=Math.min(p.z,maxZoom);
  stitchZoomRef.current=z;
  const flush=window.ReactDOM&&window.ReactDOM.flushSync;
  if(flush)flush(()=>setStitchZoom(z));else setStitchZoom(z);
  // Nothing re-rendered (the zoom did not change, as in a pinch that only
  // panned): place the scroll at the current cell size.
  if(pendingZoomAnchorRef.current)applyZoomAnchor(scs);
  clear();
  // Paint what the new scroll position uncovered now, not on the scroll
  // event a frame later, so no blank edge shows.
  if(scrollRepaintRef.current)scrollRepaintRef.current();
}
function cancelZoomPreview(){
  clearTimeout(wheelCommitTimerRef.current);
  zoomPreviewRef.current=null;
  const layer=chartLayerRef.current;
  if(layer){layer.style.transform="";layer.style.willChange="";}
}
function applyZoomAnchor(cs){
  const a=pendingZoomAnchorRef.current, el=stitchScrollRef.current;
  pendingZoomAnchorRef.current=null;
  if(!a||!el)return;
  const v=viewBoundsRef.current, sr=el.getBoundingClientRect();
  el.scrollLeft=G+a.cx*cs-v.x0*cs-(a.mx-sr.left-el.clientLeft);
  el.scrollTop=G+a.cy*cs-v.y0*cs-(a.my-sr.top-el.clientTop);
}
// Runs once the committed zoom has rendered (layout effects run before the
// redraw effect, so the chart is painted at the new scroll position). A zoom
// change from anywhere else while a preview is showing drops the preview.
React.useLayoutEffect(()=>{
  if(pendingZoomAnchorRef.current)applyZoomAnchor(scs);
  else if(zoomPreviewRef.current)cancelZoomPreview();
},[scs,stitchZoom]);
useEffect(()=>()=>clearTimeout(wheelCommitTimerRef.current),[]);

// Throttle React zoom state to one update per animation frame.
// stitchZoomRef.current is updated immediately so scroll maths stays accurate.
function scheduleZoomUpdate(newZoom){
  // Clamp here as well as in setStitchZoom: the wheel/pinch handlers read
  // stitchZoomRef back as `oldZoom` to compute their scroll-preserving scale
  // factor, so the ref must not drift above the device's canvas ceiling.
  stitchZoomRef.current=Math.min(newZoom,maxZoom);
  if(!zoomRafRef.current){
    zoomRafRef.current=requestAnimationFrame(()=>{
      setStitchZoom(stitchZoomRef.current);
      zoomRafRef.current=null;
    });
  }
}

function handleStitchWheel(e){
  if(!e.ctrlKey&&!e.metaKey)return;
  e.preventDefault();
  const container=stitchScrollRef.current;
  if(!container)return;
  {
    // Ctrl/Cmd + wheel and trackpad pinches arrive as a run of events: preview
    // them with a transform and commit when they pause (see Zoom preview).
    const normDy=e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*400:e.deltaY;
    const delta=-normDy*0.005;
    const p=zoomPreviewRef.current||beginZoomPreview(e.clientX,e.clientY);
    if(p){
      reanchorZoomPreview(e.clientX,e.clientY);
      const oldZoom=p.z;
      const newZoom=Math.min(maxZoom,Math.max(MIN_STITCH_ZOOM,oldZoom+delta));
      if(!updateZoomPreview(newZoom,e.clientX,e.clientY)){commitZoomPreview();}
      else{clearTimeout(wheelCommitTimerRef.current);wheelCommitTimerRef.current=setTimeout(commitZoomPreview,ZOOM_PREVIEW_WHEEL_IDLE_MS);}
      return;
    }
  }
  const rect=container.getBoundingClientRect();
  const mouseX=e.clientX-rect.left;
  const mouseY=e.clientY-rect.top;
  const canvasX=container.scrollLeft+mouseX;
  const canvasY=container.scrollTop+mouseY;
  // Normalise deltaY for deltaMode: 0=pixels, 1=lines (~16px), 2=pages (~400px)
  const normDy=e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*400:e.deltaY;
  const delta=-normDy*0.005;
  const oldZoom=stitchZoomRef.current;
  // maxZoom (not the bare 4) so `scale` below matches the zoom that is
  // actually applied — see the matching clamp in the pinch handler.
  // maxZoom is applied last: on a pattern so large that maxZoom falls under
  // the 0.3 floor, the ceiling still has to win or the ref and the scale
  // factor would disagree.
  const newZoom=Math.min(maxZoom,Math.max(MIN_STITCH_ZOOM,oldZoom+delta));
  const scale=newZoom/oldZoom;
  scheduleZoomUpdate(newZoom);
  requestAnimationFrame(()=>{
    if(!container)return;
    container.scrollLeft=canvasX*scale-mouseX;
    container.scrollTop=canvasY*scale-mouseY;
  });
}

// R6 — who owns a one-finger drag on the chart.
//
// A one-finger drag is a pan almost everywhere, and the compositor does that far better than a JS handler writing
// scrollLeft on every frame. In Mark mode it is a pan too, until the finger has rested on a stitch for a moment (the
// hook's "armed" state) or Paint mode is on: only then is it drag-marking and the page must not scroll. So the canvas
// keeps `touch-action: pan-x pan-y` and touchmove calls preventDefault only once the chart owns the gesture. In
// Paint mode and with the touches locked the canvas is `touch-action: none` and the chart owns every touch.
//
// Two-finger gestures are always ours — they pinch-zoom the chart, not the
// page — so handleTouchStart still calls preventDefault for them, which stops
// the browser panning a two-finger drag when touch-action would otherwise
// allow it.
function chartOwnsGesture(e){
  if(e.touches.length>1)return true;
  // Locked: a stray finger neither marks nor scrolls.
  if(touchLocked)return true;
  if(!_dragMarkActive)return false;
  if(!_dragMarkFlag)return false;
  if(paintMode)return true;
  // One finger in Mark mode scrolls natively (a quick swipe marks nothing) until it has rested on a stitch long
  // enough to paint; from then on the page must not scroll under it. See useDragMark.js, "Touch intent".
  const g=dragMarkGetStateRef.current&&dragMarkGetStateRef.current();
  return !!(g&&(g.mode==='drag'||g.armed||(g.mode==='range'&&g.held)));
}

// How far (as a share of the starting distance) two fingers must pinch or
// spread before the chart zooms, so a two-finger pan stays a pan.
const PINCH_ZOOM_DEADBAND=0.04;

// Two-finger pan momentum: after a pan (not a pinch) the chart coasts and
// slows, as native one-finger scrolling does in Navigate mode. Any new touch
// or press stops it; off when the system asks for reduced motion.
const panMomentumRafRef=useRef(null);
function stopPanMomentum(){
  if(panMomentumRafRef.current){cancelAnimationFrame(panMomentumRafRef.current);panMomentumRafRef.current=null;}
}
function startPanMomentum(vx,vy){
  stopPanMomentum();
  const el=stitchScrollRef.current;
  if(!el)return;
  try{if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;}catch(_){}
  let last=performance.now();
  const step=now=>{
    const dt=Math.min(64,now-last);last=now;
    // Fingers moved by v px/ms, so the content scrolls the other way.
    el.scrollLeft-=vx*dt;el.scrollTop-=vy*dt;
    const decay=Math.pow(0.995,dt);vx*=decay;vy*=decay;
    if(Math.abs(vx)<0.02&&Math.abs(vy)<0.02){panMomentumRafRef.current=null;return;}
    panMomentumRafRef.current=requestAnimationFrame(step);
  };
  panMomentumRafRef.current=requestAnimationFrame(step);
}
useEffect(()=>stopPanMomentum,[]);

function handleTouchStart(e){
  if(!pat)return;
  stopPanMomentum();
  // Conditional, not unconditional: calling preventDefault here is exactly
  // what forced every pan onto the main thread, because it cancels the native
  // scroll before it starts.
  if(chartOwnsGesture(e))e.preventDefault();
  const ts=touchStateRef.current;
  if(e.touches.length===1){
    // One finger: in Mark mode useDragMark owns tap / drag-mark / long-press
    // range through pointer events; in Navigate mode the compositor pans.
    // Nothing to track here.
    ts.mode="tap";
  }else if(e.touches.length===2){
    // Two fingers pan and pinch-zoom the chart together, in every mode. The
    // point between the fingers is recorded in zoom-independent content
    // units, so each move can put it back under the current midpoint at the
    // current zoom (same maths as handleStitchWheel).
    ts.mode="pinch";
    const container=stitchScrollRef.current;
    const t0=e.touches[0],t1=e.touches[1];
    ts.pinchDist=Math.hypot(t1.clientX-t0.clientX,t1.clientY-t0.clientY);
    // A wheel or trackpad zoom still being previewed lands first.
    if(zoomPreviewRef.current)commitZoomPreview();
    ts.pinchZoom=stitchZoomRef.current;
    ts.startZoom=ts.pinchZoom;
    ts.pinchZooming=false;
    ts.pinchSamples=[];
    if(container){
      const rect=container.getBoundingClientRect();
      const midX=(t0.clientX+t1.clientX)/2-rect.left;
      const midY=(t0.clientY+t1.clientY)/2-rect.top;
      ts.pinchAnchor={x:(container.scrollLeft+midX)/ts.pinchZoom,y:(container.scrollTop+midY)/ts.pinchZoom};
    }
  }
}

function handleTouchMove(e){
  if(!pat)return;
  if(chartOwnsGesture(e))e.preventDefault();
  const ts=touchStateRef.current;
  // One finger: nothing to do. In Mark mode it marks (useDragMark) and must
  // not also pan — doing both moved the chart under the finger, so a drag
  // panned erratically and left a few stray marks. In Navigate mode the
  // compositor pans; scrolling here as well would double the speed.
  if(e.touches.length!==2||ts.mode!=="pinch"||!(ts.pinchDist>0)||!ts.pinchAnchor)return;
  const container=stitchScrollRef.current;
  if(!container)return;
  const t0=e.touches[0],t1=e.touches[1];
  let dist=Math.hypot(t1.clientX-t0.clientX,t1.clientY-t0.clientY);
  // Two fingers never move quite rigidly: in a pan they drift a pixel or two
  // closer or apart, and that used to zoom by a fraction of a percent on every
  // move, re-rendering the tracker and repainting the whole chart each frame
  // of what was meant as a pan. The zoom now waits until the fingers have
  // pinched by PINCH_ZOOM_DEADBAND, then starts from there, so it follows the
  // fingers smoothly once it does engage.
  if(!ts.pinchZooming){
    if(Math.abs(dist/ts.pinchDist-1)<PINCH_ZOOM_DEADBAND)dist=ts.pinchDist;
    else{ts.pinchZooming=true;ts.pinchDist=dist;}
  }
  // Absolute from the gesture start rather than compounded per move, so the
  // anchor cannot drift. maxZoom (not the bare 4) so the scroll maths matches
  // the zoom actually applied; ceiling last, as in handleStitchWheel.
  const newZoom=Math.min(maxZoom,Math.max(MIN_STITCH_ZOOM,ts.pinchZoom*dist/ts.pinchDist));
  const rect=container.getBoundingClientRect();
  const cmx=(t0.clientX+t1.clientX)/2, cmy=(t0.clientY+t1.clientY)/2;
  const midX=cmx-rect.left;
  const midY=cmy-rect.top;
  const a=ts.pinchAnchor;
  // Recent midpoints, for the release velocity (handleTouchEnd).
  const now=performance.now();
  (ts.pinchSamples||(ts.pinchSamples=[])).push({t:now,x:midX,y:midY,z:newZoom});
  while(ts.pinchSamples.length>2&&now-ts.pinchSamples[0].t>100)ts.pinchSamples.shift();
  if(ts.pinchZooming){
    // Zooming: shown with a transform and committed when the pinch ends (see
    // Zoom preview), instead of a zoom, a re-render and often a full repaint
    // on every move.
    if(!zoomPreviewRef.current){
      // Hand over from the pan: put the scroll where this move would have,
      // so the stitch under the fingers stays there, and preview from here.
      if(ts.panRaf){cancelAnimationFrame(ts.panRaf);ts.panRaf=0;}
      container.scrollLeft=a.x*ts.pinchZoom-midX;
      container.scrollTop=a.y*ts.pinchZoom-midY;
      beginZoomPreview(cmx,cmy);
    }
    if(zoomPreviewRef.current){
      if(!updateZoomPreview(newZoom,cmx,cmy)){
        // The scaled tile no longer covers the view (or is too stretched):
        // commit and carry on previewing from the committed zoom.
        commitZoomPreview();
        ts.pinchZoom=stitchZoomRef.current;ts.pinchDist=dist;
        const r2=container.getBoundingClientRect();
        ts.pinchAnchor={x:(container.scrollLeft+cmx-r2.left)/ts.pinchZoom,y:(container.scrollTop+cmy-r2.top)/ts.pinchZoom};
        beginZoomPreview(cmx,cmy);
      }
      return;
    }
  }
  if(newZoom!==stitchZoomRef.current)scheduleZoomUpdate(newZoom);
  // After the zoom render (same frame as scheduleZoomUpdate's rAF), so the
  // content is already its new size when the scroll is clamped to it. Only
  // the latest move's scroll is kept.
  if(ts.panRaf)cancelAnimationFrame(ts.panRaf);
  ts.panRaf=requestAnimationFrame(()=>{
    ts.panRaf=0;
    container.scrollLeft=a.x*newZoom-midX;
    container.scrollTop=a.y*newZoom-midY;
  });
}

function handleTouchEnd(e){
  if(!pat)return;
  const ts=touchStateRef.current;
  // A pinch ends when all fingers have lifted. A finger left on the
  // glass does not start a new gesture (useDragMark has already abandoned
  // the one-finger gesture the second finger interrupted).
  // A zoom being previewed is committed as soon as fewer than two fingers
  // remain (or the browser cancels the gesture).
  if(zoomPreviewRef.current&&ts.mode==="pinch"&&!(e.touches&&e.touches.length>=2))commitZoomPreview();
  if(e.touches&&e.touches.length>0)return;
  // A two-finger pan that was still moving coasts on. Only a pan: if the
  // zoom moved, this was a pinch, and coasting would fight it.
  const sm=ts.pinchSamples;
  if(ts.mode==="pinch"&&sm&&sm.length>=2){
    const a=sm[0],b=sm[sm.length-1],dt=b.t-a.t;
    const recent=performance.now()-b.t<80;
    if(dt>0&&recent&&Math.abs(b.z/(ts.startZoom||ts.pinchZoom)-1)<0.03){
      const vx=(b.x-a.x)/dt,vy=(b.y-a.y)/dt;
      if(Math.hypot(vx,vy)>0.3)startPanMomentum(vx,vy);
    }
  }
  ts.mode="none"; ts.pinchDist=0; ts.pinchAnchor=null; ts.pinchSamples=null; ts.pinchZooming=false;
}

function toggleOwned(id){setThreadOwned(prev=>{let cur=prev[id]||"";let next=cur===""?"owned":cur==="owned"?"tobuy":"";return{...prev,[id]:next};});}
const ownedCount=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")==="owned").length,[skeinData,threadOwned]);
const toBuyList=useMemo(()=>skeinData.filter(d=>(threadOwned[d.id]||"")!=="owned"),[skeinData,threadOwned]);

// ─── Keyboard shortcuts (migrated to central registry) ──────────────
// Scope hierarchy:
//   tracker                    — active whenever the tracker is mounted
//   tracker.notedit            — !isEditMode
//   tracker.view.highlight     — stitchView === 'highlight'
//
// The registry handles dispatch, the canonical input-element guard
// (text inputs / contenteditable only — NOT BUTTON or A), and conflict
// detection. Keyup for Space-pan stays in a sibling effect because
// the registry is keydown-only.
//
// Behaviour changes vs. pre-migration (see reports/shortcuts-4-redesign-spec.md):
//   • Single-key shortcuts no longer die when focus is on a button/link.
//   • '?' now opens the Shortcuts modal (was: Help) for cross-page consistency.
//   • Backstitch layer toggle moved 'B' → 'L' (B reserved for global Bulk Add).
//   • All-layers toggle moved bare 'A' → 'Shift+A' (avoids browser select-all clash).
//   • Counting aids 'C' works in any tracker view (was: highlight + focused only).
//   • Highlight modes 1–4 auto-pick the first focusable colour if none is set.
//   • Ctrl/Cmd+Z, +S etc. now fire even from inside text inputs.
useScope("tracker", !!isActive);
useScope("tracker.notedit", !!isActive && !isEditMode);
useScope("tracker.view.highlight", !!isActive && stitchView === "highlight");
useScope("tracker.rowmode", !!isActive && rowModeActive && !isEditMode);

// Keyup handler for Space-pan release stays imperative (registry is keydown-only).
useEffect(()=>{
  if(!isActive)return;
  function handleKeyUp(e){
    if(e.code==="Space"){isSpaceDownRef.current=false;spacePannedRef.current=false;}
  }
  window.addEventListener("keyup",handleKeyUp);
  return()=>window.removeEventListener("keyup",handleKeyUp);
},[isActive]);

// Helper: cycle to the next/previous focusable colour, auto-picking the
// first when none is currently set (so [/] always do something useful).
// Move keyboard focus into the colour legend (opening it if it is shut): onto the selected colour's tile, else the first.
// Tab and Shift+Tab walk the tiles; Enter or Space selects one.
function focusLegend(){
  if(leftSidebarMode!=="open")setLeftSidebarMode("open");
  let tries=0;
  (function go(){
    const tiles=document.querySelectorAll('.ppal-tile-select');
    const target=document.querySelector('.ppal-tile--on .ppal-tile-select')||tiles[0];
    if(target&&target.getBoundingClientRect().width>0){try{target.scrollIntoView({block:'nearest'});}catch(_){}target.focus();return;}
    if(++tries<12)setTimeout(go,40);
  })();
}
function cycleFocusColour(direction){
  setFocusColour(prev=>{
    if(!focusableColors.length)return prev;
    if(!prev){
      const first=focusableColors.find(p=>{const dc=scopedColourCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];
      return first?first.id:prev;
    }
    const idx=focusableColors.findIndex(p=>p.id===prev);
    if(idx<0)return focusableColors[0].id;
    if(direction>0)return focusableColors[(idx+1)%focusableColors.length].id;
    return focusableColors[(idx<=0?focusableColors.length:idx)-1].id;
  });
}
// Helper: ensure a focus colour is set (used when user presses 1-4 in
// highlight view without first picking one). Same first-focusable logic
// as the V key transition.
function ensureFocusColour(){
  if(focusColour)return;
  const first=focusableColors.find(p=>{const dc=scopedColourCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];
  if(first)setFocusColour(first.id);
}

// Jump to the next remaining stitch of the focus colour, honouring the
// user's stitching preferences (startCorner from the wizard / preferences
// modal). Scan order:
//   TL (or default) — top→bottom, left→right
//   TR              — top→bottom, right→left
//   BL              — bottom→top, left→right
//   BR              — bottom→top, right→left
//   C               — nearest unmarked cell to the centre of the chart
// Wraps around from the current crosshair position so repeated presses
// step through every remaining stitch of the focus colour.
function jumpToNextStitch(){
  if(!pat||!sW||!sH)return;
  let target=focusColour;
  if(!target){
    const first=focusableColors.find(p=>{const dc=scopedColourCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];
    if(!first)return;
    target=first.id;
    setFocusColour(first.id);
  }
  const cur=doneRef.current;
  function _matches(cell){
    if(!cell||cell.id==="__skip__"||cell.id==="__empty__")return false;
    if(cell.id===target)return true;
    if(cell.type==="blend"){
      if(typeof cell.id==="string"&&cell.id.split("+").indexOf(target)>=0)return true;
      if(Array.isArray(cell.threads)&&cell.threads.some(function(t){return t&&t.id===target;}))return true;
    }
    return false;
  }
  // In a work area, only its stitches count as somewhere to jump to.
  function _isOpen(idx){if(areaOn&&!window.WorkArea.containsIndex(workArea,idx,sW))return false;return !cur||!cur[idx];}
  let foundX=-1,foundY=-1;
  if(startCorner==="C"){
    // Nearest unmarked stitch of focus colour to the chart centre.
    const cxC=Math.floor(sW/2),cyC=Math.floor(sH/2);
    let best=Infinity;
    for(let y=0;y<sH;y++){
      for(let x=0;x<sW;x++){
        const idx=y*sW+x;
        if(!_matches(pat[idx])||!_isOpen(idx))continue;
        const dx=x-cxC,dy=y-cyC;const d=dx*dx+dy*dy;
        if(d<best){best=d;foundX=x;foundY=y;}
      }
    }
  }else{
    const xRev=startCorner==="TR"||startCorner==="BR";
    const yRev=startCorner==="BL"||startCorner==="BR";
    const stepX=xRev?-1:1,stepY=yRev?-1:1;
    const startX=xRev?sW-1:0,endX=xRev?-1:sW;
    const startY=yRev?sH-1:0,endY=yRev?-1:sH;
    const fromX=hlCol>=0&&hlCol<sW?hlCol:startX;
    const fromY=hlRow>=0&&hlRow<sH?hlRow:startY;
    function scan(sx,sy,ex,ey,skipFirst){
      let first=skipFirst;
      for(let y=sy;y!==ey;y+=stepY){
        const rowStart=(y===sy)?sx:startX;
        for(let x=rowStart;x!==endX;x+=stepX){
          if(first){first=false;continue;}
          const idx=y*sW+x;
          if(_matches(pat[idx])&&_isOpen(idx)){foundX=x;foundY=y;return true;}
        }
      }
      return false;
    }
    // First pass: from current cursor (skip current cell) to end corner.
    if(!scan(fromX,fromY,endX,endY,true)){
      // Wrap-around: from start corner up to (and including) cursor.
      foundX=-1;foundY=-1;
      for(let y=startY;y!==fromY+stepY;y+=stepY){
        const rowEnd=(y===fromY)?fromX+stepX:endX;
        for(let x=startX;x!==rowEnd;x+=stepX){
          const idx=y*sW+x;
          if(_matches(pat[idx])&&_isOpen(idx)){foundX=x;foundY=y;break;}
        }
        if(foundX>=0)break;
      }
    }
  }
  if(foundX<0||foundY<0){
    try{if(window.Toast&&window.Toast.show)window.Toast.show({message:"No remaining stitches for "+formatThread((cmap&&cmap[target])||{id:target})+(areaOn?" in this work area":""),type:"info"});}catch(_){}
    return;
  }
  setHlRow(foundY);setHlCol(foundX);
  centreOnCell(foundX,foundY);
}
// Scroll the chart so a cell is in the middle of the view.
function centreOnCell(x,y){
  const el=stitchScrollRef.current;
  if(!el)return;
  const off=chartScrollOffset();
  const px=G+x*scs+scs/2-off.x,py=G+y*scs+scs/2-off.y;
  try{el.scrollTo({left:Math.max(0,px-el.clientWidth/2),top:Math.max(0,py-el.clientHeight/2),behavior:'smooth'});}
  catch(_){el.scrollLeft=Math.max(0,px-el.clientWidth/2);el.scrollTop=Math.max(0,py-el.clientHeight/2);}
}

// ── Row mode ─────────────────────────────────────────────────────────────
// Work one row at a time: every other row is washed out and the row bar
// steps between rows. Rows run across the work area when one is active.
// "Onward" follows the start corner: top starts work down, bottom starts up.
const rowSpan=areaOn&&workArea?{x0:workArea.x0,x1:workArea.x1,y0:workArea.y0,y1:workArea.y1}:{x0:0,x1:sW,y0:0,y1:sH};
const rowDir=(startCorner==="BL"||startCorner==="BR")?-1:1;
function rowStats(y){
  const d=doneRef.current||done;
  let total=0,dn=0;
  if(!pat||y<0||y>=sH)return{total:0,done:0};
  for(let x=rowSpan.x0;x<rowSpan.x1;x++){
    const idx=y*sW+x,m=pat[idx];
    const hs=halfStitches&&halfStitches.get(idx),hd=halfDone&&halfDone.get(idx);
    if(hs&&hs.fwd){total+=0.5;if(hd&&hd.fwd)dn+=0.5;}
    if(hs&&hs.bck){total+=0.5;if(hd&&hd.bck)dn+=0.5;}
    if(!m||m.id==="__skip__"||m.id==="__empty__")continue;
    total++;if(d&&d[idx])dn++;
  }
  return{total,done:dn};
}
function rowUnfinished(y){const s=rowStats(y);return s.total>0&&s.done<s.total;}
// First unfinished row from `from` (inclusive) in direction `dir`, or -1.
function findUnfinishedRow(from,dir){
  for(let y=from;y>=rowSpan.y0&&y<rowSpan.y1;y+=dir)if(rowUnfinished(y))return y;
  return -1;
}
// Scroll vertically just enough to bring a row into view.
function scrollRowIntoView(y){
  const el=stitchScrollRef.current;
  if(!el||!(scs>0))return;
  const off=chartScrollOffset();
  const top=G+y*scs-off.y,bottom=top+scs;
  if(top>=el.scrollTop&&bottom<=el.scrollTop+el.clientHeight)return;
  const t=Math.max(0,top-el.clientHeight/2+scs/2);
  try{el.scrollTo({top:t,behavior:'smooth'});}catch(_){el.scrollTop=t;}
}
function goToRow(y){
  const r=Math.max(rowSpan.y0,Math.min(rowSpan.y1-1,y));
  setCurrentRow(r);scrollRowIntoView(r);
}
function setRowMode(on){
  setRowModeActive(on);
  if(!on)return;
  const startY=rowDir>0?rowSpan.y0:rowSpan.y1-1;
  const y=findUnfinishedRow(startY,rowDir);
  goToRow(y>=0?y:startY);
}
function nextUnfinishedRow(){
  let y=findUnfinishedRow(currentRow+rowDir,rowDir);
  if(y<0)y=findUnfinishedRow(rowDir>0?rowSpan.y0:rowSpan.y1-1,rowDir);
  return y;
}
// Keep the row inside the work area when the area changes.
useEffect(()=>{
  if(!rowModeActive)return;
  if(currentRow<rowSpan.y0||currentRow>=rowSpan.y1)setRowMode(true);
// eslint-disable-next-line react-hooks/exhaustive-deps
},[rowModeActive,rowSpan.y0,rowSpan.y1]);
// When the last stitch of the current row is marked, move on to the next
// unfinished row. Only on the transition, so opening row mode on a finished
// row (or undoing and redoing) doesn't jump unexpectedly.
const rowWasFinishedRef=useRef(null);
useEffect(()=>{
  if(!rowModeActive||!pat){rowWasFinishedRef.current=null;return;}
  const s=rowStats(currentRow);
  const finished=s.total>0&&s.done>=s.total;
  const prev=rowWasFinishedRef.current;
  rowWasFinishedRef.current={row:currentRow,finished};
  if(!finished||!prev||prev.row!==currentRow||prev.finished)return;
  const next=nextUnfinishedRow();
  try{if(window.Toast&&window.Toast.show)window.Toast.show({message:next>=0?"Row "+(currentRow+1)+" done. On to row "+(next+1)+".":"Row "+(currentRow+1)+" done. Every row is finished.",type:"success",duration:2500});}catch(_){}
  if(next>=0)goToRow(next);
// eslint-disable-next-line react-hooks/exhaustive-deps
},[rowModeActive,currentRow,doneCount,pat,halfStitches,halfDone]);

// Where is that thread parked? The palette's P badge answers it (as Markup
// R-XP's symbol list does): it brings the colour's park marker into view and
// puts the guide on it, the way J does for the next stitch. With several
// markers for one colour, each press moves to the next. A hidden colour is
// shown first: jumping to a marker you cannot see would only confuse.
const parkJumpIndexRef=useRef({});
function goToParkedThread(colorId){
  const list=parkMarkersRef.current.filter(m=>m.colorId===colorId&&!isParkSpent(m,doneRef.current||done));
  if(!list.length)return;
  if(parkLayers[colorId]===false)setParkLayers(prev=>{const n=Object.assign({},prev);delete n[colorId];return n;});
  const i=(parkJumpIndexRef.current[colorId]||0)%list.length;
  parkJumpIndexRef.current[colorId]=i+1;
  const m=list[i];
  if(areaOn&&workArea&&window.WorkArea&&!window.WorkArea.contains(workArea,m.x,m.y)){
    const vb=viewBoundsRef.current;
    if(!vb||m.x<vb.x0||m.x>=vb.x1||m.y<vb.y0||m.y>=vb.y1){
      try{if(window.Toast&&window.Toast.show)window.Toast.show({message:formatThread((cmap&&cmap[colorId])||{id:colorId})+" is parked outside this work area, at row "+(m.y+1)+", column "+(m.x+1)+".",type:"info",duration:4000});}catch(_){}
      return;
    }
  }
  setHlRow(m.y);setHlCol(m.x);
  centreOnCell(m.x,m.y);
}

// Single letters are type-ahead in a focused <select>, so F and the Shift+letter layer keys leave it alone (as the old raw
// focus-mode listener did).
const notInSelect=e=>!(e&&e.target&&e.target.tagName==="SELECT");
// Built every render, so each entry's run() sees this render's state.
const trackerShortcuts=!isActive ? [] : [
  // Esc cascade — preserves original priority order. Listed hidden because
  // Esc semantics are implicit and documented in every modal.
  { id: "tracker.esc", keys: "esc", scope: "tracker", hidden: true,
    description: "Cancel / dismiss",
    run: () => {
      if(halfDisambig){setHalfDisambig(null);return;}
      if(namePromptOpen){setNamePromptOpen(false);return;}
      if(modal){setModal(null);return;}
      if(showExitEditModal){setShowExitEditModal(false);return;}
      if(cellEditPopover){setCellEditPopover(null);return;}
      if(importDialog){setImportDialog(null);return;}
      if(tOverflowOpen){setTOverflowOpen(false);return;}
      if(focusColour&&stitchView==="highlight"){setFocusColour(null);return;}
      if(drawer){setDrawer(false);return;}
      // Close the palette panel on mobile/tablet (≤1023px). On desktop the
      // panel is persistent so ESC intentionally leaves it open.
      if(leftSidebarOpen&&typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(max-width:1023px)").matches){setLeftSidebarOpen(false);return;}
      // Last: Esc clears the guide crosshair (in Navigate mode, or when the keyboard has taken it in Mark mode).
      if((stitchMode==="navigate"||kbGuideRef.current)&&hlRow>=0&&hlCol>=0){clearGuide();return;}
      // Nothing else open: Esc leaves focus mode (the Exit focus button says so).
      if(focusMode){setFocusMode(false);return;}
    } },

  // History / save (modified — fire from inputs by default).
  { id: "tracker.undo", keys: "mod+z", scope: "tracker",
    description: "Undo",
    run: () => { if(isEditMode&&undoSnapshot){applyUndo();}else if(!isEditMode){undoTrack();} } },
  { id: "tracker.redo", keys: ["mod+y", "mod+shift+z"], scope: "tracker.notedit",
    description: "Redo",
    run: () => { redoTrack(); } },
  { id: "tracker.save", keys: "mod+s", scope: "tracker",
    description: "Save project",
    run: () => { if(pat&&pal)saveProject(); } },

  // Hold-Space to pan (preventDefault so page doesn't scroll).
  { id: "tracker.space", keys: "space", scope: "tracker",
    description: "Hold to pan canvas",
    when: e=>!(e.target&&e.target.closest&&e.target.closest('button,input,select,textarea,summary,a[href],[role="button"],[contenteditable]:not([contenteditable="false"])')),
    run: () => { if(!isSpaceDownRef.current){isSpaceDownRef.current=true;spaceDownTimeRef.current=Date.now();spacePannedRef.current=false;} } },

  // Shortcuts panel.
  { id: "tracker.shortcuts", keys: "?", scope: "tracker",
    description: "Toggle shortcuts panel",
    run: () => setModal("shortcuts") },

  // Stitch mode tabs.
  { id: "tracker.mode.track", keys: "t", scope: "tracker.notedit",
    description: "Track mode",
    run: () => setStitchMode("track") },
  { id: "tracker.mode.navigate", keys: "n", scope: "tracker.notedit",
    description: "Navigate mode",
    run: () => setStitchMode("navigate") },
  { id: "tracker.mode.rowmode", keys: "r", scope: "tracker.notedit",
    description: "Toggle row mode",
    run: () => setRowMode(!rowModeActive) },
  { id: "tracker.row.prev", keys: "arrowup", scope: "tracker.rowmode",
    description: "Row mode: the row above",
    when: () => stitchMode!=="navigate",
    run: () => goToRow(currentRow-1) },
  { id: "tracker.row.next", keys: "arrowdown", scope: "tracker.rowmode",
    description: "Row mode: the row below",
    when: () => stitchMode!=="navigate",
    run: () => goToRow(currentRow+1) },

  // View cycle.
  { id: "tracker.view.cycle", keys: "v", scope: "tracker.notedit",
    description: "Cycle view: symbol → colour → highlight",
    run: () => {
      const nextView=stitchView==="symbol"?"colour":stitchView==="colour"?"highlight":"symbol";
      setStitchView(nextView);
      if(nextView==="highlight"&&!focusColour){
        const first=focusableColors.find(p=>{const dc=scopedColourCounts[p.id];return !dc||dc.done<dc.total;})||focusableColors[0];
        if(first)setFocusColour(first.id);
      }
    } },

  // Focus mode owns the bare F (the toolbar button's title says so). It works in edit mode too, hence scope "tracker".
  { id: "tracker.focusMode", keys: "f", scope: "tracker",
    description: "Enter or leave focus mode",
    when: notInSelect,
    run: () => setFocusMode(v=>!v) },

  // Layer toggles are Shift+letter so that one slip of the finger cannot blank the chart. Backstitch is L (B chooses a line);
  // all-layers is Shift+A.
  { id: "tracker.layer.full",   keys: "shift+f", scope: "tracker.notedit",
    description: "Toggle full-stitch layer",
    when: notInSelect,
    run: () => setLayerVis(v=>({...v,full:!v.full})) },
  { id: "tracker.layer.half",   keys: "shift+h", scope: "tracker.notedit",
    description: "Toggle half-stitch layer",
    when: notInSelect,
    run: () => setLayerVis(v=>({...v,half:!v.half})) },
  { id: "tracker.layer.knot",   keys: "shift+k", scope: "tracker.notedit",
    description: "Toggle French-knot layer",
    when: notInSelect,
    run: () => setLayerVis(v=>({...v,french_knot:!v.french_knot})) },
  { id: "tracker.layer.bs",     keys: "shift+l", scope: "tracker.notedit",
    description: "Toggle backstitch layer",
    when: notInSelect,
    run: () => setLayerVis(v=>({...v,backstitch:!v.backstitch})) },
  { id: "tracker.layer.all",    keys: "shift+a", scope: "tracker.notedit",
    description: "Toggle all layers on/off",
    run: () => {
      if(Object.values(layerVis).every(Boolean)){
        const allOff=Object.fromEntries(STITCH_LAYERS.map(l=>[l.id,false]));
        setLayerVis(allOff);
      }else{setLayerVis(ALL_LAYERS_VISIBLE);}
    } },

  // Drawer / pause / counting aids / zoom.
  { id: "tracker.drawer", keys: "d", scope: "tracker",
    description: "Toggle colour drawer",
    run: () => setDrawer(d=>!d) },
  { id: "tracker.pause", keys: "p", scope: "tracker.notedit",
    description: "Pause / resume session timer",
    when: () => !!currentAutoSessionRef.current,
    run: () => {
      if(!currentAutoSessionRef.current)return;
      const now=Date.now();
      if(manuallyPausedRef.current){
        // Resume: emit manualResume event
        currentAutoSessionRef.current.eventLog.push({kind:'manualResume',t:now});
        manuallyPausedRef.current=false;
        setManuallyPaused(false);
        setLiveAutoIsPaused(document.hidden);
      }else{
        // Pause: emit manualPause event
        currentAutoSessionRef.current.eventLog.push({kind:'manualPause',t:now});
        manuallyPausedRef.current=true;
        setManuallyPaused(true);
        setLiveAutoIsPaused(true);
      }
    } },
  // B: choose a backstitch line at the guide. Each press goes on to the next line that touches the guide's cell, and after the
  // last the selection is cleared; Enter then marks or unmarks it, an arrow key moves the guide and clears it.
  { id: "tracker.bs.select", keys: "b", scope: "tracker.notedit",
    description: "Backstitch: choose a line at the guide (again for the next)",
    run: () => selectBsAtGuide() },
  { id: "tracker.counting", keys: "c", scope: "tracker",
    description: "Toggle counting aids",
    run: () => setCountingAidsEnabled(v=>!v) },
  // S for Section spotlight.
  { id: "tracker.focus.toggle", keys: "s", scope: "tracker",
    description: "Toggle section spotlight",
    run: () => {
      if(stitchingStyle==="crosscountry")return;
      const next=!focusEnabled;
      setFocusEnabled(next);
      try{localStorage.setItem("cs_focusEnabled",next?"1":"0");}catch(_){}
      if(next&&!focusBlock)setFocusBlock(_getStartBlock());
    } },
  { id: "tracker.focus.left", keys: "alt+arrowleft", scope: "tracker",
    description: "Move spotlight one block left",
    run: () => _stepFocusBlock(-1,0) },
  { id: "tracker.focus.right", keys: "alt+arrowright", scope: "tracker",
    description: "Move spotlight one block right",
    run: () => _stepFocusBlock(+1,0) },
  { id: "tracker.focus.up", keys: "alt+arrowup", scope: "tracker",
    description: "Move spotlight one block up",
    run: () => _stepFocusBlock(0,-1) },
  { id: "tracker.focus.down", keys: "alt+arrowdown", scope: "tracker",
    description: "Move spotlight one block down",
    run: () => _stepFocusBlock(0,+1) },
  { id: "tracker.zoom.in", keys: ["=", "+"], scope: "tracker",
    description: "Zoom in",
    run: () => setStitchZoom(z=>Math.min(4,+(z+0.1).toFixed(2))) },
  { id: "tracker.zoom.out", keys: "-", scope: "tracker",
    description: "Zoom out",
    run: () => setStitchZoom(z=>Math.max(MIN_STITCH_ZOOM,+(z-0.1).toFixed(2))) },
  { id: "tracker.zoom.fit", keys: "0", scope: "tracker",
    description: "Zoom to fit",
    run: () => fitChart() },
  { id: "tracker.workArea.pick", keys: "w", scope: "tracker",
    description: "Pick a work area",
    run: () => setAreaPickerOpen(true) },

  // Highlight-view-only: focus-colour cycling and highlight modes.
  { id: "tracker.col.next", keys: "]", scope: "tracker.notedit",
    description: "Next colour (the one selected in the legend)",
    run: () => cycleFocusColour(+1) },
  { id: "tracker.col.prev", keys: "[", scope: "tracker.notedit",
    description: "Previous colour (the one selected in the legend)",
    run: () => cycleFocusColour(-1) },
  { id: "tracker.legend", keys: "g", scope: "tracker.notedit",
    description: "Go to the colour legend",
    run: () => focusLegend() },
  { id: "tracker.chartFocus", keys: "shift+g", scope: "tracker.notedit",
    description: "Go to the chart",
    run: () => { const c=stitchRef.current;if(c)c.focus(); } },
  { id: "tracker.hl.next", keys: "arrowright", scope: "tracker.view.highlight",
    description: "Next focus colour",
    run: () => cycleFocusColour(+1) },
  { id: "tracker.hl.prev", keys: "arrowleft", scope: "tracker.view.highlight",
    description: "Previous focus colour",
    run: () => cycleFocusColour(-1) },
  { id: "tracker.hl.isolate", keys: "1", scope: "tracker.view.highlight",
    description: "Highlight: isolate",
    run: () => { ensureFocusColour(); setHighlightMode("isolate"); } },
  { id: "tracker.hl.outline", keys: "2", scope: "tracker.view.highlight",
    description: "Highlight: outline",
    run: () => { ensureFocusColour(); setHighlightMode("outline"); } },
  { id: "tracker.hl.tint", keys: "3", scope: "tracker.view.highlight",
    description: "Highlight: tint",
    run: () => { ensureFocusColour(); setHighlightMode("tint"); } },
  { id: "tracker.hl.spotlight", keys: "4", scope: "tracker.view.highlight",
    description: "Highlight: spotlight",
    run: () => { ensureFocusColour(); setHighlightMode("spotlight"); } },
  // Jump-to-next: hops the crosshair to the next remaining stitch of the
  // focus colour using the wizard / preferences-modal startCorner setting
  // (TL/TR/BL/BR/C). Available outside highlight view too \u2014 it sets the
  // focus colour from the first incomplete one when none is selected.
  { id: "tracker.jumpNext", keys: "j", scope: "tracker.notedit",
    description: "Jump to next remaining stitch of focus colour",
    run: () => jumpToNextStitch() },
];
// Registered once per activation, with run/when delegating by id to the entry
// from the latest render. The list used to be re-registered from a long deps
// array, and any state missing from it (leftSidebarOpen, hlRow, stitchMode)
// left a shortcut reading stale values — Esc did not close the palette on
// narrow screens.
const trackerShortcutsRef=useRef(trackerShortcuts);
trackerShortcutsRef.current=trackerShortcuts;
useShortcuts(trackerShortcuts.map(entry=>Object.assign({},entry,{
  run:evt=>{const cur=trackerShortcutsRef.current.find(x=>x.id===entry.id);if(cur)return cur.run(evt);},
  when:entry.when?(evt=>{const cur=trackerShortcutsRef.current.find(x=>x.id===entry.id);return !!(cur&&(!cur.when||cur.when(evt)));}):undefined,
})),[isActive]);

// Update stable handler refs every render (cheap assignment, no DOM work)
wheelHandlerRef.current=handleStitchWheel;
scrollRepaintRef.current=renderStitchIfScrolledOut;
touchStartHandlerRef.current=handleTouchStart;
touchMoveHandlerRef.current=handleTouchMove;
touchEndHandlerRef.current=handleTouchEnd;

// Attach wheel listener when pattern loads (stitchScrollRef is null before then)
useEffect(()=>{
  const el=stitchScrollRef.current;
  if(!el)return;
  const handler=e=>wheelHandlerRef.current(e);
  el.addEventListener("wheel",handler,{passive:false});
  return()=>el.removeEventListener("wheel",handler);
},[!!pat]);

// Increment shortcuts-hint session counter once per pattern load
useEffect(()=>{
  if(!pat||hintLoadCountedRef.current)return;
  hintLoadCountedRef.current=true;
  try{const n=Math.min(99,parseInt(localStorage.getItem("cs_trackerHintLoadCount")||"0",10)+1);localStorage.setItem("cs_trackerHintLoadCount",String(n));setTrackerLoadCount(n);}catch(_){}
},[!!pat]);

// Attach touch listeners once when pattern loads — wrapper delegates to latest handler
// NOTE (Safari iOS): the canvas uses Touch Events (not Pointer Events) because
// {passive:false} touch listeners are required to call preventDefault() and block
// both scroll and the browser's own selection / magnifier gestures.  Pointer Events
// with {passive:false} do not reliably suppress those gestures on Safari iOS.
// UI chrome (toolbar, modals) uses React's synthetic onPointerDown/Up events, which
// is fine because those elements do not need to block default browser behaviour.
// This intentional mixed strategy is the recommended practice for canvas-based
// drawing surfaces on iOS (see MDN "Pointer Events — Touch action").
useEffect(()=>{
  const canvas=stitchRef.current;
  if(!canvas||!pat)return;
  const ts=e=>touchStartHandlerRef.current(e);
  const tm=e=>touchMoveHandlerRef.current(e);
  const te=e=>touchEndHandlerRef.current(e);
  canvas.addEventListener("touchstart",ts,{passive:false});
  canvas.addEventListener("touchmove",tm,{passive:false});
  canvas.addEventListener("touchend",te,{passive:false});
  // A cancelled touch ends the gesture too, or a previewed zoom would be left
  // showing as a transform.
  canvas.addEventListener("touchcancel",te,{passive:false});
  return()=>{
    canvas.removeEventListener("touchstart",ts);
    canvas.removeEventListener("touchmove",tm);
    canvas.removeEventListener("touchend",te);
    canvas.removeEventListener("touchcancel",te);
  };
},[!!pat]);

// Overflow close on outside click
useEffect(()=>{
  if(!tOverflowOpen)return;
  function close(e){if(tOverflowRef.current&&!tOverflowRef.current.contains(e.target))setTOverflowOpen(false);}
  document.addEventListener('mousedown',close);
  return()=>document.removeEventListener('mousedown',close);
},[tOverflowOpen]);
// ResizeObserver — collapse stitch/view groups when toolbar is narrow
useEffect(()=>{
  if(!tStripRef.current)return;
  const ro=new ResizeObserver(entries=>{
    const w=entries[0].contentRect.width;
    requestAnimationFrame(()=>setTStripCollapsed({view:w<860,stitch:w<600}));
  });
  ro.observe(tStripRef.current);
  return()=>ro.disconnect();
},[]);

// ═══ B2: Drag-Mark + Long-Press Range Select ═══════════════════════════
// useDragMark owns full-stitch tap / drag / range routing for mouse, touch
// and pen. Pan and specialty presses are claimed before they reach it.
const _dragMarkCellAtPoint=useCallback(function(cx,cy){
  if(!stitchRef.current||!pat||layerVis.full===false)return -1;
  const rect=stitchRef.current.getBoundingClientRect(),tile=chartTileRef.current;
  const x=(cx-rect.left+tile.x-G)/scs,y=(cy-rect.top+tile.y-G)/scs;
  const gx=Math.floor(x),gy=Math.floor(y);
  if(gx<0||gx>=sW||gy<0||gy>=sH)return -1;
  // Margin stitches around a work area are context, not part of it: no tap,
  // drag or range can mark them.
  if(areaOn&&!window.WorkArea.contains(workArea,gx,gy))return -1;
  return {idx:gy*sW+gx,x,y};
},[pat,sW,sH,scs,areaOn,workArea,layerVis.full]);

const _pulseCells=useCallback(function(idxList){
  // Briefly add a pulse class on overlay cells. The overlay re-renders from
  // dragState; we mirror the just-committed indices into a transient ref.
  if(!idxList||!idxList.length)return;
  const pulse=new Set(idxList);
  setDragMarkPulse(pulse);
  setTimeout(function(){setDragMarkPulse(null);},250);
},[]);

const[dragMarkPulse,setDragMarkPulse]=useState(null);
// UX-fix — tracks whether the user has ever completed a rectangle
// range-select, so the rectSelect_tracker coachmark can auto-dismiss the
// moment the behaviour is actually discovered (mirrors firstStitch's
// doneCount>0 auto-complete below).
const[_rectSelectUsed,_setRectSelectUsed]=useState(false);

// Marking more than this many cells in one rectangle asks (once, then remembers) whether it is today's stitching or
// catch-up; smaller fills are ordinary stitching, as drag-marking always is.
const BULK_ASK_MIN=50;
const bulkUndoToastRef=useRef(null);
const bulkUndoRef=useRef(null);
const lastBulkEntryRef=useRef(null);
const bulkToastEntryRef=useRef(null);

// The message goes as soon as the stroke it offers to undo is no longer the newest step (a mark, a park, an Undo, a
// project switch).
useEffect(()=>{
  const t=bulkUndoToastRef.current,e=bulkToastEntryRef.current;
  if(!t||!e)return;
  if(trackHistory[trackHistory.length-1]!==e){
    try{window.Toast&&window.Toast.dismiss&&window.Toast.dismiss(t);}catch(_){}
    bulkUndoToastRef.current=null;bulkToastEntryRef.current=null;
  }
},[trackHistory]);
bulkUndoRef.current=undoTrack;   // always the current one: the toast's button outlives the render that made it
const _commitBulk=useCallback(function(set,intent,source,asCatchUp){
  // BUGFIX: read live `done` via doneRef so back-to-back commits before
  // React commits a prior setDone don't rewind earlier in-session marks.
  const cur=doneRef.current;
  if(!pat||!cur||!set||!set.size||layerVis.full===false)return false;
  const want=intent==='mark'?1:0;
  const changes=[];
  const nd=new Uint8Array(cur);
  set.forEach(function(idx){
    if(idx<0||idx>=pat.length)return;
    const cell=pat[idx];
    if(!cell||cell.id==='__skip__'||cell.id==='__empty__')return;
    // C3: colour-lock filter — match the legacy handlers' fullStitchMatchesFocus check.
    if(typeof isColourLocked==='function'&&isColourLocked()
       &&!fullStitchMatchesFocus(idx))return;
    if(nd[idx]!==want){
      changes.push({idx:idx,oldVal:nd[idx]});
      nd[idx]=want;
    }
  });
  if(!changes.length)return false;
  if(source==='range'&&want===1&&asCatchUp===undefined&&changes.length>BULK_ASK_MIN){
    let pref='ask';try{pref=(window.UserPrefs&&window.UserPrefs.get('trackerMarkAllAs'))||'ask';}catch(_){}
    if(pref==='ask'){setMarkAllAsk({set:set,intent:intent,source:source});return false;}
    asCatchUp=pref==='catchup';
  }
  doneRef.current=nd;
  // PERF: paint just the changed cells directly instead of a full-viewport
  // renderStitch() redraw (previously called here unconditionally on every
  // drag-mark commit, then AGAIN via the done-dependent useEffect below).
  paintDoneChangesRef.current(changes,nd);
  skipNextFullRedrawRef.current=nd;
  commitMarkState(function(){
    pushBulkToggleHistory(changes,source,asCatchUp&&want===1);
    applyDoneCountsDelta(changes,pat,nd);
    setDone(nd);
    _pulseCells(changes.map(function(c){return c.idx;}));
    if(source==='range')_setRectSelectUsed(true);
  });
  // A stroke or rectangle that marked (or unmarked) a good many stitches at once offers a way back, because a stray
  // swipe is easy to make and hard to untangle later. Undo is the ordinary one (this was one history step).
  const _bulkMin=(window.TouchConstants&&window.TouchConstants.BULK_UNDO_MIN)||5;
  if(changes.length>_bulkMin){
    const n=changes.length.toLocaleString('en-GB');
    offerStepUndo(lastBulkEntryRef.current,n+' stitches '+(want===1?'marked':'unmarked'),'Undo '+n+' stitches',"That stroke can no longer be undone on its own. Use Undo to step back.");
  }
  return true;   // something was marked or unmarked (false: nothing changed, or the "mark all as" question is open)
},[pat,focusColour,_pulseCells,recordAutoActivity,halfStitchCounts,layerVis.full]);

const _dragMarkOnToggle=useCallback(function(idx){
  // C3: single-cell tap from useDragMark (touch + mouse). Uses the
  // standard pushTrackHistory machinery for a single-cell undo step.
  // BUGFIX: read live `done` via doneRef so two taps inside one render
  // frame each see the most-recent array, not a stale closure copy.
  const cur=doneRef.current;
  if(!pat||!cur||layerVis.full===false)return;
  if(idx<0||idx>=pat.length)return;
  const cell=pat[idx];
  if(!cell||cell.id==='__skip__'||cell.id==='__empty__')return;
  // C3: colour-lock filter — match the legacy handlers' fullStitchMatchesFocus check.
  if(typeof isColourLocked==='function'&&isColourLocked()
     &&!fullStitchMatchesFocus(idx))return;
  const oldVal=cur[idx];
  const nv=oldVal?0:1;
  const nd=new Uint8Array(cur);
  nd[idx]=nv;
  doneRef.current=nd;
  // PERF: paint just this cell directly instead of a full-viewport renderStitch()
  // redraw (previously called here unconditionally on every single tap, then
  // AGAIN via the done-dependent useEffect below).
  paintDoneChangesRef.current([{idx:idx}],nd);
  skipNextFullRedrawRef.current=nd;
  commitMarkState(function(){
    pushTrackHistory([{idx:idx,oldVal:oldVal}]);
    applyDoneCountsDelta([{idx:idx,oldVal:oldVal}],pat,nd);
    setDone(nd);
  });
},[pat,focusColour,isColourLocked,fullStitchMatchesFocus,pushTrackHistory,applyDoneCountsDelta,renderStitch,recordAutoActivity,halfStitchCounts,layerVis.full]);

const _dragMarkOnCommitDrag=useCallback(function(set,intent){
  _commitBulk(set,intent,'drag');
},[_commitBulk]);

const altDownRef=useRef(false);
const _dragMarkOnCommitRange=useCallback(function(set,intent){
  // "Unpick area" chosen on the rectangle bar (touch), or Alt held on release of a Shift+drag (mouse): the rectangle
  // is taken out of every kind of stitch instead of marked.
  if(unpickPendingRef.current||altDownRef.current){
    const wasPending=unpickPendingRef.current;
    if(wasPending)setUnpickIntent(false);
    unpickAreaRef.current(set);
    return;
  }
  _commitBulk(set,intent,'range');
},[_commitBulk]);

// Hook itself — gated by edit mode + non-track stitchMode (returns idle).
// C3: useDragMark is the unified pointer pipeline (touch + mouse). The
// `trackerDragMark` user preference (default true) lets users opt out at
// runtime. The legacy `window.B2_DRAG_MARK_ENABLED` global remains
// supported only as a QA/automation override — set it to false to force
// the hook off (e.g. for regression repro). Source assertions in
// tests/dragMark.test.js + tests/c3LegacyHandlersRemoved.test.js verify
// the wiring.
const _dragMarkPref=(typeof window!=='undefined'&&window.UserPrefs&&typeof window.UserPrefs.get==='function')?window.UserPrefs.get('trackerDragMark'):true;
const _dragMarkOverrideOff=(typeof window!=='undefined'&&window.B2_DRAG_MARK_ENABLED===false);
const _dragMarkFlag=!_dragMarkOverrideOff&&_dragMarkPref!==false;
const _dragMarkActive=!_dragMarkOverrideOff&&!isEditMode&&stitchMode==="track"&&!!pat&&!!done;
const _dragMark=(typeof window!=='undefined'&&window.useDragMark)
  ?window.useDragMark({
    w:sW,h:sH,pattern:pat,done:done,doneRef:doneRef,
    cellAtPoint:_dragMarkCellAtPoint,
    onToggleCell:_dragMarkOnToggle,
    onCommitDrag:_dragMarkOnCommitDrag,
    onCommitRange:_dragMarkOnCommitRange,
    isEditMode:!_dragMarkActive,
    dragEnabled:_dragMarkFlag,
    isolatedPreview:true,
    paintMode:paintMode,
    touchLocked:touchLocked,
  })
  :{handlers:{},dragState:{mode:'idle',path:new Set(),anchor:null,intent:null}};
const _dragMarkHandlers=_dragMark.handlers;
const dragMarkState=_dragMark.dragState;
const dragMarkReset=_dragMark.reset||(()=>{});
// Disabling gestures also dismisses a rectangle awaiting its second corner.
useEffect(()=>{if(!_dragMarkFlag)dragMarkReset();},[_dragMarkFlag]);
// "Unpick area" only lasts while the rectangle is waiting for its second corner.
useEffect(()=>{if(unpickPending&&!(dragMarkState&&dragMarkState.mode==='range'))setUnpickIntent(false);},[dragMarkState&&dragMarkState.mode,unpickPending]);
// Keep the keyup/blur listener (registered once, on mount, above) calling
// into the CURRENT hook instance's notifyShiftUp — see useDragMark.js (7).
dragMarkNotifyShiftUpRef.current=_dragMark.notifyShiftUp||null;
dragMarkGetStateRef.current=_dragMark.getDragState||null;
// Same filters as _commitBulk applies when a drag is released.
dragCommitFilterRef.current=function(idx){return !(isColourLocked()&&!fullStitchMatchesFocus(idx));};

// French knots (knots.js): in Mark mode a press on a knot marks it done (or
// not done) when it's released there, instead of starting a drag-mark on the
// stitch underneath. Every other press goes to useDragMark as before. These
// wrapped handlers are the ones the chart canvas spreads.
const knotPressRef=useRef(null);
function knotAtPoint(cx,cy){
  if(!_dragMarkActive||!knots.length||!layerVis.french_knot||!window.Knots||!stitchRef.current)return null;
  const rect=stitchRef.current.getBoundingClientRect();
  const ct=chartTileRef.current||{x:0,y:0};
  const fx=(cx-rect.left+ct.x-G)/scs,fy=(cy-rect.top+ct.y-G)/scs;
  // About a finger's width at small zooms, never more than half a stitch.
  const k=window.Knots.hitTest(knots,fx,fy,Math.min(0.45,Math.max(0.3,12/scs)));
  if(!k)return null;
  if(isColourLocked()&&k.id!==focusColour)return null;
  if(areaOn&&!window.WorkArea.contains(workArea,Math.min(sW-1,k.x>>1),Math.min(sH-1,k.y>>1)))return null;
  return k;
}
// Half stitches claim a pointer press exclusively, just like quarters and knots.
function halfAtPoint(cx,cy){
  if(!_dragMarkActive||!stitchRef.current||layerVis.half===false)return null;
  const gc=gridCoord(stitchRef,{clientX:cx,clientY:cy},scs,G,false,chartTileRef.current);
  if(!gc||gc.gx<0||gc.gx>=sW||gc.gy<0||gc.gy>=sH)return null;
  if(areaOn&&!window.WorkArea.contains(workArea,gc.gx,gc.gy))return null;
  const idx=gc.gy*sW+gc.gx,hs=halfStitches.get(idx),cell=pat[idx];
  if(!hs||(!hs.fwd&&!hs.bck))return null;
  const full=cell&&cell.id!=="__skip__"&&cell.id!=="__empty__";
  if(full&&!(doneRef.current&&doneRef.current[idx]))return null;
  return {idx,gx:gc.gx,gy:gc.gy};
}
function toggleHalfAtPoint(hit,e){
  const {idx,gx,gy}=hit;
  const hs=halfStitches.get(idx);
  const hasBoth=hs.fwd&&hs.bck;
  if(hasBoth){
    // Two halves: hit-test which triangle was tapped
    const rect=stitchRef.current.getBoundingClientRect();
    // +tile origin: the canvas is a tile, so its pixel 0 is chart pixel
    // tile.x/y rather than 0 (see chartTileFor).
    const _ct=chartTileRef.current;
    const localX=e.clientX-rect.left+_ct.x-G-gx*scs;
    const localY=e.clientY-rect.top +_ct.y-G-gy*scs;
    const hitDir=hitTestHalfStitch(localX,localY,scs,8);
    if(hitDir==="ambiguous"){
      // Show disambiguation popup
      if (isColourLocked()) {
        const fwdMatch = halfStitchMatchesFocus(idx, "fwd");
        const bckMatch = halfStitchMatchesFocus(idx, "bck");
        if (!fwdMatch && !bckMatch) { e.preventDefault(); return; }
        if (fwdMatch && !bckMatch) { _toggleHalfDone(idx, "fwd"); e.preventDefault(); return; }
        if (!fwdMatch && bckMatch) { _toggleHalfDone(idx, "bck"); e.preventDefault(); return; }
        // Both match — fall through to normal disambiguation popup
      }
      setHalfDisambig({idx,x:e.clientX,y:e.clientY});
      e.preventDefault();
      return;
    }
    if (isColourLocked() && !halfStitchMatchesFocus(idx, hitDir)) { e.preventDefault(); return; }
    _toggleHalfDone(idx,hitDir);
  } else {
    // Single half: toggle it
    const dir=hs.fwd?"fwd":"bck";
    if (isColourLocked() && !halfStitchMatchesFocus(idx, dir)) { e.preventDefault(); return; }
    _toggleHalfDone(idx,dir);
  }
  e.preventDefault();
  return;
}
// Quarter stitches (fractional.js): in Mark mode a press on a cell that holds quarter stitches marks the nearest one,
// once the cell's whole stitch (if it has one) is done, the way half stitches are. A colour lock refuses a quarter of
// another colour. Cells with half stitches keep the half-stitch path.
function quarterAt(idx,nx,ny){
  if(!window.Fractional||!partialStitches.size||layerVis.quarter===false||halfStitches.has(idx))return null;
  const entry=partialStitches.get(idx);
  if(!entry)return null;
  const m=pat[idx],isFull=m&&m.id!=="__skip__"&&m.id!=="__empty__";
  if(isFull&&!(done&&done[idx]))return null;
  const pos=window.Fractional.pick(entry,nx,ny,isColourLocked()?focusColour:null);
  return pos?{idx,pos,id:entry[pos].id}:null;
}
function quarterAtPoint(cx,cy){
  if(!_dragMarkActive||!partialStitches.size||!stitchRef.current)return null;
  const rect=stitchRef.current.getBoundingClientRect();
  const ct=chartTileRef.current||{x:0,y:0};
  const fx=(cx-rect.left+ct.x-G)/scs,fy=(cy-rect.top+ct.y-G)/scs;
  const gx=Math.floor(fx),gy=Math.floor(fy);
  if(gx<0||gx>=sW||gy<0||gy>=sH)return null;
  if(areaOn&&!window.WorkArea.contains(workArea,gx,gy))return null;
  return quarterAt(gy*sW+gx,fx-gx,fy-gy);
}
function toggleQuarterDone(q){
  const oldVal=(partialDoneRef.current.get(q.idx)||new Set()).has(q.pos);
  flipQuarterDone(q.idx,q.pos);
  if(q.id)pendingColoursRef.current.add(q.id);
  const entry={type:"QUARTER",idx:q.idx,pos:q.pos};
  entry.activity=recordAutoActivity(oldVal?0:1,oldVal?1:0,oldVal?0:0.25,oldVal?0.25:0);
  setTrackHistory(prev=>{let n=[...prev,entry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
// Backstitch lines (backstitch.js). In Mark mode a press within a short snap distance of a line marks it, and a drag
// along lines marks each one it passes (one undo step for the whole stroke). The distance is 14 px for a mouse and
// 20 px for a finger, never more than half a cell, so it scales with the zoom. Where the cell under the press has a
// stitch of its own, the line must be nearer than the cell's centre, so a tap on a stitch still marks the stitch.
const bsPressRef=useRef(null);
// A finger covers the lines it is marking, so for touch (and pen) a magnifier shows the cells around the fingertip while a
// backstitch press or stroke is on, the same loupe the Creator uses (creator/Loupe.js).
function showBsLoupe(cx,cy,colour){
  const loupe=window.creatorLoupe;
  if(!loupe||!stitchRef.current)return;
  const rect=stitchRef.current.getBoundingClientRect(),ct=chartTileRef.current||{x:0,y:0};
  const fx=(cx-rect.left+ct.x-G)/scs,fy=(cy-rect.top+ct.y-G)/scs;
  // The loupe reads the canvas in chart pixels from (G + gx*cs); the canvas is a tile, so shift by its origin.
  loupe.show({x:cx,y:cy,cell:{gx:fx-ct.x/scs,gy:fy-ct.y/scs},snap:true,cs:scs,G:G,source:stitchRef.current,magnifier:true,precision:false,colour:colour||null});
}
function hideBsLoupe(){if(window.creatorLoupe)window.creatorLoupe.hide();}
function bsAcceptLine(i,ln){return !isColourLocked()||(ln.colorId!=null&&String(ln.colorId)===String(focusColour));}
function bsHitAt(cx,cy,pointerType){
  const grid=bsGridRef.current;
  if(!_dragMarkActive||!grid||layerVis.backstitch===false||!window.Backstitch||!stitchRef.current||!pat)return null;
  const rect=stitchRef.current.getBoundingClientRect();
  const ct=chartTileRef.current||{x:0,y:0};
  const fx=(cx-rect.left+ct.x-G)/scs,fy=(cy-rect.top+ct.y-G)/scs;
  const px=(pointerType==="touch"||pointerType==="pen")?20:14;
  const tol=Math.min(0.5,px/scs);
  const hit=window.Backstitch.nearest(grid,fx,fy,tol,bsAcceptLine);
  if(!hit)return null;
  const gx=Math.floor(fx),gy=Math.floor(fy);
  if(areaOn&&!window.WorkArea.contains(workArea,Math.max(0,Math.min(sW-1,gx)),Math.max(0,Math.min(sH-1,gy))))return null;
  if(gx>=0&&gx<sW&&gy>=0&&gy<sH){
    const m=pat[gy*sW+gx];
    if(m&&m.id!=="__skip__"&&m.id!=="__empty__"&&!(hit.d<Math.hypot(fx-gx-0.5,fy-gy-0.5)))return null;
  }
  return hit;
}
// Mark or unmark lines by key. `defer` leaves the React state for the end of a stroke (the Set the painter reads is
// updated at once), so a drag does not re-render per line.
function setBsKeysDone(keys,on,defer){
  const next=new Set(bsDoneSetRef.current);
  keys.forEach(k=>{if(on)next.add(k);else next.delete(k);});
  bsDoneSetRef.current=next;
  paintBsKeys(keys);
  if(!defer)commitBsDone();
}
function commitBsDone(){
  const next=Array.from(bsDoneSetRef.current);
  skipNextFullRedrawRef.current=next;
  setBsDone(next);
}
// Repaint only the cells the lines cover (a line is drawn by the cells it passes through).
function paintBsKeys(keys){
  const idx=bsIndexRef.current;
  if(!idx||!keys.length)return;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  keys.forEach(k=>{(idx.get(k)||[]).forEach(i=>{const ln=bsLines[i];x0=Math.min(x0,ln.x1,ln.x2);x1=Math.max(x1,ln.x1,ln.x2);y0=Math.min(y0,ln.y1,ln.y2);y1=Math.max(y1,ln.y1,ln.y2);});});
  if(x0>x1)return;
  const nd=doneRef.current;
  repaintChartCells(Math.floor(x0)-1,Math.floor(y0)-1,Math.ceil(x1)+1,Math.ceil(y1)+1,i=>!!(nd&&nd[i]));
}
function pushBsHistory(keys,on,colourId){
  if(!keys.length)return;
  if(colourId!=null)pendingColoursRef.current.add(colourId);
  const entry={type:"BS",keys,on};
  setTrackHistory(prev=>{let n=[...prev,entry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
  return entry;
}
// One line, tapped or chosen at the keyboard: flip it.
function toggleBsLine(i){
  const k=bsKeysRef.current[i];if(k===undefined)return;
  const on=!bsDoneSetRef.current.has(k);
  setBsKeysDone([k],on);
  pushBsHistory([k],on,bsLines[i]&&bsLines[i].colorId);
}
// Every line of one colour (the legend's "mark all backstitch"): all done if any is not, otherwise all unmarked.
// The backstitch lines of one colour a whole-colour change would flip (all pending -> done, otherwise done -> not done).
function bsPlanForColour(colour){
  const keys=[];let anyPending=false;
  if(!window.Backstitch)return{changed:[],anyPending:false};
  bsLines.forEach((ln,i)=>{
    if(!window.Backstitch.wellFormed(ln)||window.Backstitch.colourOf(ln)!==colour)return;
    if(areaOn&&!window.WorkArea.contains(workArea,Math.max(0,Math.min(sW-1,Math.floor(Math.min(ln.x1,ln.x2)))),Math.max(0,Math.min(sH-1,Math.floor(Math.min(ln.y1,ln.y2))))))return;
    const k=bsKeysRef.current[i];
    if(keys.indexOf(k)===-1)keys.push(k);
    if(!bsDoneSetRef.current.has(k))anyPending=true;
  });
  return{changed:keys.filter(k=>bsDoneSetRef.current.has(k)!==anyPending),anyPending};
}
function markAllBsOfColour(colour){
  const plan=bsPlanForColour(colour);
  if(!plan.changed.length)return null;
  setBsKeysDone(plan.changed,plan.anyPending);
  return pushBsHistory(plan.changed,plan.anyPending,colour);
}
// The Lines chip on a colour row follows the same rules as the stitch chip: ask first with the exact count, then an Undo toast.
function confirmAndMarkBsOfColour(p){
  const colour=String(p.id),name=colourDoneName(p),plan=bsPlanForColour(colour);
  if(!plan.changed.length)return;
  const md=plan.anyPending,t=colourDoneConfirmText(name,plan.changed.length,md,areaOn,true);
  askConfirm({title:t.title,message:t.message,confirmLabel:t.confirmLabel,danger:!md}).then(ok=>{
    if(!ok)return;
    const entry=markAllBsOfColour(colour);
    if(!entry)return;
    const n=entry.keys.length,count=n===1?"1 line":n.toLocaleString('en-GB')+" lines";
    offerStepUndo(entry,count+" of "+name+(md?" marked as done":" marked as not done"),"Undo "+count);
  });
}
// B at the keyboard guide: the lines touching the guide's cell, in drawing order, one per press.
function selectBsAtGuide(){
  if(stitchMode!=="track"||!bsGridRef.current||!window.Backstitch||layerVis.backstitch===false)return;
  if(!kbGuideRef.current||guideRef.current.row<0||guideRef.current.col<0){kbGuideRef.current=true;moveGuideBy(0,0);return;}
  const g=guideRef.current;
  const list=window.Backstitch.inCell(bsGridRef.current,g.col,g.row).filter(i=>bsAcceptLine(i,bsLines[i]));
  if(!list.length){setBsSelect(-1);return;}
  const at=list.indexOf(bsSelectRef.current);
  const next=at===-1?list[0]:(at+1<list.length?list[at+1]:-1);
  setBsSelect(next);
}
// ── Unpick area (unpick.js, TRACK-13) ──
// Takes the marks of every kind of stitch out of a rectangle of cells (the whole rectangle, background cells too, since
// half stitches, quarters, knots and backstitch can sit there) as one undo step. The session records it as an
// unpicked area ("Unpicked 80" in the journal), never as a negative day. A colour lock limits it to that thread.
function applyUnpickPlan(p,undo){
  const ctx=rtContextRef.current;
  if(ctx){
    const units=[...p.full.map(c=>'d:'+c.idx),...p.half.flatMap(c=>['fwd','bck'].filter(d=>c.before&&c.before[d]&&!(c.after&&c.after[d])).map(d=>'h:'+c.idx+':'+d)),
      ...p.quarter.flatMap(c=>(c.before||[]).filter(pos=>!(c.after||[]).includes(pos)).map(pos=>'q:'+c.idx+':'+pos)),...p.knots.map(k=>'k:'+(typeof k==='string'?k:k.key)),...p.bs.map(k=>'b:'+k),...(p.specialty||[]).map(uid=>'s:'+uid)];
    units.forEach(u=>ctx.intents[(v3FieldsRef.current.chartAccountingUnits||{})[u]||u]=undo?'undo-unpick':'unpick');
  }

  if(p.full.length){
    const nd=new Uint8Array(doneRef.current);
    const changes=p.full.map(c=>({idx:c.idx,oldVal:nd[c.idx]}));
    p.full.forEach(c=>{nd[c.idx]=undo?c.oldVal:0;});
    applyDoneCountsDelta(changes,pat,nd);
    doneRef.current=nd;
    paintDoneChangesRef.current(p.full.map(c=>({idx:c.idx})),nd);
    skipNextFullRedrawRef.current=nd;
    setDone(nd);
  }
  if(p.half.length){
    const next=window.Unpick.nextHalfDone(halfDoneRef.current,p,undo);
    for(const c of p.half)for(const dir of ["fwd","bck"])applyHalfDoneDelta(c.idx,dir,(halfDoneRef.current.get(c.idx)||{})[dir],(next.get(c.idx)||{})[dir],halfStitches);
    setHalfDone(next);
  }
  if(p.specialty&&p.specialty.length){
    const marks=new Set(specialtyDoneRef.current);p.specialty.forEach(uid=>undo?marks.add(uid):marks.delete(uid));
    specialtyDoneRef.current=Array.from(marks);setSpecialtyDone(specialtyDoneRef.current);
  }
  if(p.quarter.length)setPartialDone(m=>window.Unpick.nextPartialDone(m,p,undo));
  if(p.knots.length)setKnotsDone(l=>window.Unpick.nextKnotsDone(l,p,undo));
  if(p.bs.length)setBsKeysDone(p.bs,undo);
  // The counts changed by hand here: the session's diff-based detector must not read them as stitching or unmarking.
  const sign=undo?1:-1;
  prevAutoCountRef.current={done:doneCountRef.current,halfDone:(halfStitchCounts.done||0)+sign*p.counts.half,knotDone:knotCounts.done+sign*p.counts.knot,quarterDone:quarterCounts.done+sign*p.counts.quarter};
}
function unpickArea(cells){
  if(!window.Unpick||!pat||!doneRef.current||!cells||!cells.size)return false;
  // The rectangle is the cells' bounding box.
  let x0=1e9,y0=1e9,x1=-1,y1=-1;
  cells.forEach(i=>{const x=i%sW,y=(i-x)/sW;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;});
  const set=new Set();
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(areaOn&&!window.WorkArea.contains(workArea,x,y))continue;
    set.add(y*sW+x);
  }
  const p=window.Unpick.plan({sW,sH,pat,done:doneRef.current,halfStitches,halfDone:halfDoneRef.current,partialStitches,partialDone:partialDoneRef.current,knots,knotsDone:knotsDoneRef.current,bsLines,bsDone:Array.from(bsDoneSetRef.current),specialtyStitches,specialtyDone:specialtyDoneRef.current,set,lockId:isColourLocked()?focusColour:null});
  if(p.empty){
    if(window.Toast&&window.Toast.show)window.Toast.show({message:isColourLocked()?"Nothing of the locked colour is marked in that area.":"Nothing is marked in that area.",type:'info',duration:3000});
    return false;
  }
  applyUnpickPlan(p,false);
  const entry={type:"UNPICK",plan:p};
  if(p.stitches>0)entry.activity=recordAutoActivity(0,p.stitches,0,p.units,0,'frog');
  setTrackHistory(prev=>{let n=[...prev,entry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
  offerStepUndo(entry,"Unpicked "+p.stitches.toLocaleString('en-GB')+(p.stitches===1?" stitch":" stitches")+(p.counts.backstitch?" and "+p.counts.backstitch+" backstitch line"+(p.counts.backstitch===1?"":"s"):""),"Undo");
  return true;
}
unpickAreaRef.current=unpickArea;
function toggleKnotDone(k){
  const key=k.x+","+k.y;
  const oldVal=knotsDoneRef.current.includes(key);
  flipKnotDone(key);
  if(k.id)pendingColoursRef.current.add(k.id);
  const entry={type:"KNOT",key};
  entry.activity=recordAutoActivity(oldVal?0:1,oldVal?1:0);
  setTrackHistory(prev=>{let n=[...prev,entry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
const dragMarkHandlers=Object.assign({},_dragMarkHandlers,{
  onPointerDown:e=>{
    if(e.button===2||isMacSecondaryClick(e))return;
    // Space-pan owns the press before any full or specialty stitch can
    // claim it. Keep capture so the mouse pan continues off the canvas.
    if(e.button===0&&isSpaceDownRef.current){
      dragMarkReset();
      try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
      return;
    }
    // A finger landing during a fling is stopping navigation, not marking.
    // Claim it explicitly rather than relying on the old touch-tap cutoff.
    if(e.pointerType==="touch"&&panMomentumRafRef.current){
      stopPanMomentum();
      knotPressRef.current={stopPan:true,id:e.pointerId,x:e.clientX,y:e.clientY};
      if(_dragMarkHandlers.onExtraTouchDown)_dragMarkHandlers.onExtraTouchDown(e);
      return;
    }
    if(touchLocked&&e.pointerType&&e.pointerType!=="mouse")return;
    const plain=(e.button===undefined||e.button===0)&&!e.altKey&&!e.shiftKey;
    if(plain&&_dragMarkActive&&beads.length&&stitchRef.current){
      const rect=stitchRef.current.getBoundingClientRect(),ct=chartTileRef.current||{x:0,y:0};
      const fx=(e.clientX-rect.left+ct.x-G)/scs,fy=(e.clientY-rect.top+ct.y-G)/scs;
      const hits=window.Beads.hitTest(beads,fx,fy,Math.min(0.45,Math.max(0.3,12/scs)));
      if(hits.length){
        const at=hits.findIndex(b=>b.uid===selectedBead),bead=hits[(at+1)%hits.length];
        knotPressRef.current={bead,id:e.pointerId,x:e.clientX,y:e.clientY};
        if(_dragMarkHandlers.onExtraTouchDown)_dragMarkHandlers.onExtraTouchDown(e);
        return;
      }
    }
    if(plain&&_dragMarkActive&&stitchRef.current){
      const rect=stitchRef.current.getBoundingClientRect(),ct=chartTileRef.current||{x:0,y:0};
      const fx=(e.clientX-rect.left+ct.x-G)/scs,fy=(e.clientY-rect.top+ct.y-G)/scs;
      const hit=specialtyStitches.find(o=>specialtyAvailable(o)&&ProgressUnits.specialty.segments(o).some(a=>window.Backstitch.segDist(fx,fy,...a)<=Math.min(0.15,6/scs)));
      if(hit){setSpecialtySelected(hit.uid);knotPressRef.current={specialty:hit.uid,id:e.pointerId,x:e.clientX,y:e.clientY};if(_dragMarkHandlers.onExtraTouchDown)_dragMarkHandlers.onExtraTouchDown(e);return;}
    }
    const k=plain?knotAtPoint(e.clientX,e.clientY):null;
    const b=plain&&!k?bsHitAt(e.clientX,e.clientY,e.pointerType):null;
    if(b){
      const key=bsKeysRef.current[b.i];
      bsPressRef.current={id:e.pointerId,x:e.clientX,y:e.clientY,type:e.pointerType,first:b.i,on:!bsDoneSetRef.current.has(key),dragging:false,seen:new Set([b.i]),keys:[],colour:bsLines[b.i]&&bsLines[b.i].colorId};
      try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
      if(e.pointerType==="touch"||e.pointerType==="pen")showBsLoupe(e.clientX,e.clientY,bsLines[b.i]&&bsLines[b.i].color);
      if(_dragMarkHandlers.onExtraTouchDown)_dragMarkHandlers.onExtraTouchDown(e);
      return;
    }
    bsPressRef.current=null;
    const half=plain&&!k?halfAtPoint(e.clientX,e.clientY):null;
    if(half){
      knotPressRef.current={half,id:e.pointerId,x:e.clientX,y:e.clientY};
      try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
      if(_dragMarkHandlers.onExtraTouchDown)_dragMarkHandlers.onExtraTouchDown(e);
      return;
    }
    const q=plain&&!k?quarterAtPoint(e.clientX,e.clientY):null;
    if(k||q){knotPressRef.current={k,q,id:e.pointerId,x:e.clientX,y:e.clientY};if(_dragMarkHandlers.onExtraTouchDown)_dragMarkHandlers.onExtraTouchDown(e);return;}
    knotPressRef.current=null;
    if(_dragMarkHandlers.onPointerDown)_dragMarkHandlers.onPointerDown(e);
  },
  onPointerMove:e=>{
    const bp=bsPressRef.current;
    if(bp&&bp.id===e.pointerId){
      if(bp.type==="touch"||bp.type==="pen")showBsLoupe(e.clientX,e.clientY,null);
      if(!bp.dragging){
        if(Math.hypot(e.clientX-bp.x,e.clientY-bp.y)<7)return;
        bp.dragging=true;bsDragActiveRef.current=true;
        // The stroke starts with the line that was pressed.
        const k0=bsKeysRef.current[bp.first];
        if(bsDoneSetRef.current.has(k0)!==bp.on){bp.keys.push(k0);setBsKeysDone([k0],bp.on,true);}
      }
      const h=bsHitAt(e.clientX,e.clientY,bp.type);
      if(h&&!bp.seen.has(h.i)){
        bp.seen.add(h.i);
        const k=bsKeysRef.current[h.i];
        if(bsDoneSetRef.current.has(k)!==bp.on&&bp.keys.indexOf(k)===-1){bp.keys.push(k);setBsKeysDone([k],bp.on,true);}
      }
      return;
    }
    if(knotPressRef.current&&knotPressRef.current.id===e.pointerId)return;
    if(_dragMarkHandlers.onPointerMove)_dragMarkHandlers.onPointerMove(e);
  },
  onPointerUp:e=>{
    const bp=bsPressRef.current;
    if(bp&&bp.id===e.pointerId){
      bsPressRef.current=null;bsDragActiveRef.current=false;hideBsLoupe();
      try{e.currentTarget.releasePointerCapture(e.pointerId);}catch(_){}
      if(_dragMarkHandlers.onExtraTouchEnd)_dragMarkHandlers.onExtraTouchEnd(e);
      if(bp.dragging){
        if(bp.keys.length){commitBsDone();pushBsHistory(bp.keys,bp.on,bp.colour);}
      }else toggleBsLine(bp.first);
      return;
    }
    const p=knotPressRef.current;
    if(p&&p.id===e.pointerId){
      // Read before ending the contact: the last lift clears 'multi', but
      // must not turn a cancelled half/specialty press back into a tap.
      const cancelled=e.pointerType==="touch"&&dragMarkGetStateRef.current&&dragMarkGetStateRef.current().mode==="multi";
      knotPressRef.current=null;
      if(_dragMarkHandlers.onExtraTouchEnd)_dragMarkHandlers.onExtraTouchEnd(e);
      if(p.stopPan||cancelled)return;
      if(Math.hypot(e.clientX-p.x,e.clientY-p.y)<12){if(p.bead){setSelectedBead(p.bead.uid);setBeadPanelOpen(true);}else if(p.specialty)toggleSpecialtyDone(p.specialty);else if(p.half)toggleHalfAtPoint(p.half,e);else if(p.q)toggleQuarterDone(p.q);else toggleKnotDone(p.k);}
      return;
    }
    if(_dragMarkHandlers.onPointerUp)_dragMarkHandlers.onPointerUp(e);
  },
  onPointerCancel:e=>{
    const bp=bsPressRef.current;
    if(bp){
      bsPressRef.current=null;bsDragActiveRef.current=false;hideBsLoupe();
      if(bp.dragging&&bp.keys.length){commitBsDone();pushBsHistory(bp.keys,bp.on,bp.colour);}
    }
    knotPressRef.current=null;
    if(_dragMarkHandlers.onPointerCancel)_dragMarkHandlers.onPointerCancel(e);
  }
});


// C3: useDragMark now owns both touch AND mouse pointer events. The
// previous touch-only gate is no longer needed because legacy mouse
// cell-marking has been removed from handleStitchMouseDown / Move / Up.

// ── Coachmark tips (Tracker) ─────────────────────────────────────────
// Two one-off tips. Both wait for the welcome walkthrough and style picker
// (coaching.js holds them back while either is open) and are remembered
// however they are dismissed. Neither blocks the chart: the tip asks for an
// action and the action itself completes it.
//   firstStitch_tracker  a project with nothing marked yet; done when a
//                        stitch is marked.
//   rectSelect_tracker   after a few stitches marked by hand in this
//                        session (not the project total, which made it pop
//                        up on every visit to an established project), shown
//                        once the stitcher pauses so it never lands mid-tap;
//                        done when a rectangle is marked.
const RECT_SELECT_COACH_THRESHOLD=4;
const RECT_SELECT_COACH_IDLE_MS=1500;
const _rectSelectThresholdMet=liveAutoStitches>=RECT_SELECT_COACH_THRESHOLD;
const _trCoach = (typeof window.useCoachingSequence === 'function')
  ? window.useCoachingSequence('tracker', {
      firstStitch_tracker: !!pat && doneCount === 0,
      rectSelect_tracker: !!pat && _rectSelectThresholdMet && !_rectSelectUsed
    })
  : { active: null, complete: ()=>{}, skip: ()=>{}, skipAll: ()=>{} };
// First run is one sequence, not three layers: the tour belongs to the empty screen. Once a pattern is on the
// chart the tour steps aside (its dimmed backdrop used to swallow the first tap, which only closed it) and the
// "Mark your first stitch" hint takes over. The style question keeps its default and stays in More controls.
useEffect(()=>{
  if(!welcomeOpen||!pat||welcomeAskedRef.current)return;
  setWelcomeOpen(false);
  try{ if(window.WelcomeWizard)window.WelcomeWizard.markDone('tracker'); }catch(_){}
  try{ if(!localStorage.getItem("cs_styleOnboardingDone")) localStorage.setItem("cs_styleOnboardingDone","1"); }catch(_){}
},[welcomeOpen,pat]);
const _trCoachBlocked = !isActive || !pat || styleOnboardingOpen || welcomeOpen;
const [_trCoachReady, _setTrCoachReady] = React.useState(false);
React.useEffect(()=>{
  _setTrCoachReady(false);
  if (_trCoachBlocked || _trCoach.active !== 'firstStitch_tracker') return;
  const t = setTimeout(()=>_setTrCoachReady(true), 600);
  return ()=>clearTimeout(t);
}, [_trCoachBlocked, _trCoach.active]);
React.useEffect(()=>{
  if (_trCoach.active === 'firstStitch_tracker' && doneCount > 0) _trCoach.complete('firstStitch_tracker');
}, [doneCount, _trCoach.active]);
const _showTrFirstStitchCoach = _trCoachReady && !_trCoachBlocked && _trCoach.active === 'firstStitch_tracker';

const[_isCoarsePointer,_setIsCoarsePointer]=React.useState(false);
React.useEffect(()=>{
  if(typeof window==='undefined'||!window.matchMedia)return;
  const mql=window.matchMedia('(pointer: coarse)');
  const apply=()=>_setIsCoarsePointer(mql.matches);
  apply();
  if(mql.addEventListener)mql.addEventListener('change',apply);
  else if(mql.addListener)mql.addListener(apply);
  return()=>{
    if(mql.removeEventListener)mql.removeEventListener('change',apply);
    else if(mql.removeListener)mql.removeListener(apply);
  };
},[]);
// liveAutoStitches is in the deps on purpose: each new mark restarts the
// timer, so the tip appears only after a pause in marking.
const [_trRectCoachReady, _setTrRectCoachReady] = React.useState(false);
React.useEffect(()=>{
  _setTrRectCoachReady(false);
  if (_trCoachBlocked || _trCoach.active !== 'rectSelect_tracker') return;
  const t = setTimeout(()=>_setTrRectCoachReady(true), RECT_SELECT_COACH_IDLE_MS);
  return ()=>clearTimeout(t);
}, [_trCoachBlocked, _trCoach.active, liveAutoStitches]);
React.useEffect(()=>{
  if (_rectSelectUsed && window.Coaching && !window.Coaching._isCoached('rectSelect_tracker')) _trCoach.complete('rectSelect_tracker');
}, [_rectSelectUsed]);
const _showTrRectSelectCoach = _trRectCoachReady && !_trCoachBlocked && _trCoach.active === 'rectSelect_tracker';

// Keep ref current on every render (function declarations are hoisted so this
// is always defined; the ref lets the registered handler call the latest closure).
_editInCreatorRef.current=handleEditInCreator;
// Register NavigationAPI handoff for Tracker → Editor so the top-bar Edit tab
// and command palette trigger the full snapshot+handoff path.
useEffect(()=>{
  if(!pat||!pal){delete window.__navigateToEditor;return;}
  window.__navigateToEditor=function(){if(_editInCreatorRef.current)_editInCreatorRef.current();};
  return()=>{delete window.__navigateToEditor;};
},[!!pat,!!pal]); // eslint-disable-line react-hooks/exhaustive-deps

// A colour's action chips: go to its park marker, mark its backstitch lines, mark all its stitches. Shown on each
// colour row, or (in the compact list) once, in the selected colour's card.
function renderColourActions(row,kr){
  const {p,dc,kn,qt,bsc,complete}=row;
  const swRgb="rgb("+p.rgb+")";
  return <div className="ppal-tile-actions" onClick={e=>e.stopPropagation()}>
    {parkCountsByColour[p.id]>0&&<button
      className="ppal-tile-park-btn"
      onClick={e=>{e.stopPropagation();goToParkedThread(p.id);}}
      title={"Go to where "+kr.label+" is parked"+(parkCountsByColour[p.id]>1?" ("+parkCountsByColour[p.id]+" places; press again for the next)":"")}
      aria-label={"Go to where "+kr.label+" is parked"}
      style={{background:isParkLayerVisible(p.id)?swRgb:undefined,borderColor:isParkLayerVisible(p.id)?swRgb:"var(--border)",color:isParkLayerVisible(p.id)?(luminance(p.rgb)>140?"#000":"#fff"):"var(--text-tertiary)"}}
    >P{parkCountsByColour[p.id]>1?"×"+parkCountsByColour[p.id]:""}</button>}
    {bsc&&bsc.total>0&&<button
      className="ppal-tile-done-btn ppal-tile-bs-btn"
      onClick={e=>{e.stopPropagation();confirmAndMarkBsOfColour(p);}}
      style={{borderColor:"var(--line)",background:"var(--surface-secondary)",color:"var(--text-secondary)"}}
      title={"Mark all backstitch lines of "+colourDoneName(p)+(bsc.done>=bsc.total?" as not done":" as done")}
      aria-label={(bsc.done>=bsc.total?"Mark all lines not done: ":"Mark all lines done: ")+colourDoneName(p)}
    >{bsc.done>=bsc.total?<>{Icons.x?Icons.x():null}<span>Mark all lines not done</span></>:<>{Icons.check?Icons.check():null}<span>Mark all lines done</span></>}</button>}
    {!(dc.total===0&&dc.halfTotal===0&&kn.total===0&&qt.total===0&&bsc&&bsc.total>0)&&<button
      className="ppal-tile-done-btn"
      onClick={e=>{e.stopPropagation();confirmAndMarkColour(p,!complete);}}
      style={{borderColor:complete?"var(--danger-soft)":"var(--success-soft)",background:complete?"var(--danger-soft)":"var(--success-soft)",color:complete?"var(--danger)":"var(--success)"}}
      title={"Mark all stitches of "+colourDoneName(p)+(complete?" as not done":" as done")}
      aria-label={(complete?"Mark all not done: ":"Mark all done: ")+colourDoneName(p)}
    >{complete?<>{Icons.x?Icons.x():null}<span>Mark all not done</span></>:<>{Icons.check?Icons.check():null}<span>Mark all done</span></>}</button>}
  </div>;
}

return(
<>
{/* Platform.fileAccept drops the filter on iOS, where .oxs resolves to no UTI
    and would grey out every file in the Files picker. */}
<input ref={loadRef} type="file" accept={window.Platform ? window.Platform.fileAccept(".json,.pat,.oxs,.xsd,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf") : ".json,.pat,.oxs,.xsd,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf"} onChange={loadProject} style={{display:"none"}}/>
<Header page="tracker" onOpen={()=>loadRef.current.click()} onSave={pat?saveProject:null} onExportPDF={pat?()=>setModal('pdf_export'):null} onExportOxs={pat?doExportOxs:null} onNewProject={pat?()=>{askConfirm({title:"Start fresh?",message:"Your current project is auto-saved.",confirmLabel:"Start fresh"}).then(ok=>{if(!ok)return;if(typeof ProjectStorage!=='undefined')ProjectStorage.clearActiveProject();else localStorage.removeItem("crossstitch_active_project");if(onGoHome){onGoHome();}else{window.location.href='home.html';}});}:null} onOpenProject={typeof ProjectStorage!=='undefined'?()=>{ProjectStorage.listProjects().then(list=>{setProjectPickerList(list||[]);setProjectPickerOpen(true);}).catch(()=>{setProjectPickerList([]);setProjectPickerOpen(true);});}:undefined} onPreferences={typeof window.PreferencesModal!=='undefined'?()=>setPreferencesOpen(true):undefined} setModal={setModal} projectName={pat&&pal?(projectName || (sW + '×' + sH + ' pattern')):undefined} projectPct={pat&&pal&&combinedTotal>0?progAll.percent:undefined} onNameChange={pat&&pal?(n=>{nameAutoGeneratedRef.current=false;setProjectName(n);}):undefined} showAutosaved={!!(pat&&pal)} saveStatus={saveStatus} savedAt={savedAt} saveError={saveError} onRetrySave={retrySave} />
{projectPickerOpen&&<TrackerProjectPicker
  list={projectPickerList}
  currentId={projectIdRef.current}
  onClose={()=>setProjectPickerOpen(false)}
  onPick={(meta)=>{
    // Close the modal immediately so the loading state doesn't appear stuck.
    setProjectPickerOpen(false);
    flushBeforeSwitch().then(()=>ProjectStorage.get(meta.id)).then(p=>{
      if(p&&(p.pattern||p.p)&&p.settings){
        processLoadedProject(p);
        // Note: setActiveProject is synchronous (writes localStorage); do NOT chain .catch().
        try { ProjectStorage.setActiveProject(p.id); } catch(_) {}
      } else {
        alert("That project is empty or could not be loaded.");
      }
    }).catch(err=>{
      alert("Failed to load project: "+(err && err.message ? err.message : err));
    });
  }}
/>}
{preferencesOpen&&typeof window.PreferencesModal!=='undefined'&&React.createElement(window.PreferencesModal,{initialCategory:preferencesInitialCategory||undefined,onClose:()=>{setPreferencesOpen(false);setPreferencesInitialCategory(null);}})}
{namePromptOpen&&<NamePromptModal
  defaultName={projectName || (sW+'×'+sH+' pattern')}
  onConfirm={name=>{setProjectName(name);setNamePromptOpen(false);doSaveProject(name);}}
  onCancel={()=>setNamePromptOpen(false)}
/>}
{editDetailsOpen&&typeof EditProjectDetailsModal!=='undefined'&&<EditProjectDetailsModal
  projectId={projectIdRef.current}
  name={projectName || (sW+'×'+sH+' pattern')}
  designer={projectDesigner}
  description={projectDescription}
  onSave={({name,designer,description})=>{
    if(name!==projectName)nameAutoGeneratedRef.current=false;
    setProjectName(name);
    setProjectDesigner(designer);
    setProjectDescription(description);
    setEditDetailsOpen(false);
  }}
  onClose={()=>setEditDetailsOpen(false)}
/>}
{pat&&pal&&<>
{/* A2 (UX Phase 5) — bold edit-mode strip. Sits directly above the toolbar so
    users cannot miss that "Mark"/grid actions now overwrite stitches rather
    than record progress. aria-live="polite" announces entry once. */}
{isEditMode&&<div className="edit-mode-strip" role="status" aria-live="polite">
  <span className="edit-mode-strip__label">
    {Icons.warning&&Icons.warning()}
    <strong>Edit mode</strong>
    <span className="edit-mode-strip__hint">— grid taps modify the pattern, not your progress</span>
  </span>
  <button
    type="button"
    className="edit-mode-strip__exit"
    onClick={()=>{
      if(undoSnapshot!==null){setShowExitEditModal(true);}
      else{setIsEditMode(false);setUndoSnapshot(null);setSessionStartSnapshot(null);}
    }}
  >Exit edit mode</button>
</div>}
{!isEditMode&&beads.length>0&&<section aria-label="Bead progress" className="bead-progress">
  <button type="button" aria-expanded={beadPanelOpen} onClick={()=>setBeadPanelOpen(o=>!o)}>Beads {beadCounts.done}/{beadCounts.total}</button>
  {beadPanelOpen&&<div ref={beadPanelRef} className="bead-progress-list">
    <p>Beads are counted separately from stitch progress. Select a bead, then mark or unmark it. Chart taps cycle overlapping beads.</p>
    <p>PDF and image exports omit beads. OXS keeps bead appearance and position, but does not carry completion or object IDs. Use project saves or backups for progress.</p>
    {beads.map((b,i)=><div key={b.uid}>
      <button type="button" aria-pressed={selectedBead===b.uid} onClick={()=>setSelectedBead(b.uid)}>Select bead {i+1}: {b.label||b.id||'Bead'} ({b.x/2}, {b.y/2})</button>
      <button type="button" aria-pressed={beadsDone.includes(b.uid)} onClick={()=>toggleBeadDone(b.uid)}>{beadsDone.includes(b.uid)?'Unmark':'Complete'} bead {i+1}</button>
    </div>)}
  </div>}
</section>}
{!isEditMode&&<div className="info-strip-wrap">
{window.TrackerProgressStrip&&React.createElement(window.TrackerProgressStrip,{progress:progShown,prevBarPct,todayBarPct,bsCounts,layerVis,layerCounts,onShowHiddenLayers:showHiddenLayers,session:{open:liveSessionOpen,isTimer:liveIsTimer,paused:liveAutoIsPaused||manuallyPaused,timingLabel:formatTimingModeShortLabel(currentTimingMode),elapsedStore},LiveElapsed,onOpenSession:()=>{setLeftSidebarTab("session");setMorePanelOpen(true);}})}
<div className="app-info-chip-wrap info-strip-chip-wrap">
  <button
    ref={progressChipRef}
    type="button"
    className="app-info-chip info-strip-chip"
    aria-haspopup="dialog"
    aria-expanded={progressInfoOpen}
    title="Progress details"
    onClick={()=>setProgressInfoOpen(o=>!o)}
  >
    <span className="app-info-chip__label">Progress info</span>
    <span className="app-info-chip__chevron" aria-hidden="true">{Icons.chevronDown?Icons.chevronDown():null}</span>
  </button>
  {progressInfoOpen && window.AppInfoPopover && (() => {
    const totalSec = (typeof totalTime === 'number' ? totalTime : 0);
    // Pace comes from what sessions added (not from everything marked, which includes catch-up and unpicking).
    const addedAllSessions = (statsSessions||[]).reduce((a,x)=>a+ProgressUnits.sessionAdded(x),0);
    const speedPerHour = totalSec > 0 && addedAllSessions > 0 ? Math.round(addedAllSessions / (totalSec/3600)) : 0;
    const unpickedToday = getStatsTodayUnpicked(statsSessions||[], getDayEndHour(statsSettings)) + (()=>{const c=currentAutoSessionRef.current,d=c&&c.byDay&&c.byDay[getStitchingDate(new Date(),getDayEndHour(statsSettings))];return d?(d.uu||0):0;})();
    const remainingStitches = Math.max(0, effectiveCombinedTotal - effectiveCombinedDone);
    const fmtL = window.fmtTimeL || (s => Math.round(s/3600)+'h');
    const progressRows = [
      ['Done', `${ProgressUnits.formatUnits(combinedDone)} / ${ProgressUnits.formatUnits(combinedTotal)} (${progAll.percent.toFixed(1)}%)`],
      ['Today', ProgressUnits.formatUnits(todayStitchesForBar)],
      ['This week', ProgressUnits.formatUnits(weekStitchesForChip)]
    ];
    // Backstitch is counted on its own, in lines, and is not part of the percentage above.
    if (beadCounts.total > 0) progressRows.splice(1, 0, ['Beads', `${beadCounts.done}/${beadCounts.total} beads (separate)`]);
    if (bsCounts.total > 0) progressRows.splice(1, 0, ['Backstitch', `${bsCounts.done}/${bsCounts.total} lines`]);
    if (unpickedToday > 0) progressRows.splice(2, 0, ['Unpicked today', ProgressUnits.formatUnits(unpickedToday)]);
    const timeEst = sessionsTimeIsEstimated(statsSessions || []);
    const timeRows = [['Time spent' + (timeEst ? ' (estimated)' : ''), fmtL(totalSec)]];
    if (speedPerHour > 0) {
      timeRows.push(['Speed' + (timeEst ? ' (estimated)' : ''), `${speedPerHour.toLocaleString('en-GB')} st/hr`]);
      const leftAll = Math.max(0, combinedTotal - combinedDone);
      if (leftAll > 0) {
        timeRows.push(['Time remaining', estimateText(leftAll/speedPerHour, completionEstimate&&completionEstimate.enough?completionEstimate.calendarDaysRemaining:0)]);
      }
    }
    // One estimate for the finish date, with what it is based on (the same one the Stats pages use).
    const est = completionEstimate;
    const finishRows = [];
    if (est && combinedTotal - combinedDone > 0) {
      finishRows.push(['Estimated finish', est.enough ? est.text : est.text]);
      if (est.enough) {
        finishRows.push(['Range', est.rangeText.replace(/^Between /, '')]);
        finishRows.push(['Pace', `${est.stitchesPerStitchingDay.toLocaleString('en-GB')} per stitching day`]);
        finishRows.push(['Stitching days', `${est.stitchingDaysPerWeek} a week`]);
      }
    }
    // Build sparkline data: stitches per active day, last 30 active days.
    const sparkDays=(()=>{
      if(!Array.isArray(statsSessions)||statsSessions.length===0)return[];
      const byDay={};
      for(const s of statsSessions){if(s.date&&(ProgressUnits.sessionAdded(s)||0)>0)byDay[s.date]=(byDay[s.date]||0)+(ProgressUnits.sessionAdded(s)||0);}
      return Object.keys(byDay).sort().slice(-30).map(d=>({date:d,count:byDay[d]}));
    })();
    const sparkMax=sparkDays.length>0?Math.max(...sparkDays.map(d=>d.count)):0;
    return React.createElement(window.AppInfoPopover, {
      open: true,
      onClose: () => setProgressInfoOpen(false),
      triggerRef: progressChipRef,
      heading: 'Progress',
      ariaLabel: 'Progress details',
      children: [
        React.createElement(window.AppInfoSection, { title: 'Progress' },
          React.createElement(window.AppInfoGrid, { rows: progressRows })),
        React.createElement(window.AppInfoDivider),
        React.createElement(window.AppInfoSection, { title: 'Time' },
          React.createElement(window.AppInfoGrid, { rows: timeRows })),
        ...(finishRows.length?[
          React.createElement(window.AppInfoDivider),
          React.createElement(window.AppInfoSection, { title: 'Finish' },
            React.createElement(window.AppInfoGrid, { rows: finishRows }),
            est&&est.enough?React.createElement('div',{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',marginTop:4}},est.basis):null)
        ]:[]),
        ...(sparkDays.length>=2?[
          React.createElement(window.AppInfoDivider),
          React.createElement(window.AppInfoSection, { title: 'Daily progress' },
            React.createElement('div',{style:{display:'flex',alignItems:'flex-end',gap:2,height:40,paddingTop:4},role:'img','aria-label':'Stitches per stitching day, last '+sparkDays.length+' stitching days; latest '+sparkDays[sparkDays.length-1].count.toLocaleString('en-GB')+'. Open Stats for the full chart.'},
              sparkDays.map(({date,count})=>React.createElement('div',{
                key:date,
                title:date+': '+count.toLocaleString('en-GB')+' stitches',
                style:{flex:'1 1 0',minWidth:3,height:Math.max(2,Math.round((count/sparkMax)*38))+'px',background:'var(--accent)',borderRadius:'1px 1px 0 0',opacity:0.75}
              }))
            )
          )
        ]:[]),
        React.createElement(window.AppInfoDivider),
        React.createElement('button',{type:'button',className:'stats-export-btn',style:{width:'100%',justifyContent:'center',minHeight:44},onClick:()=>{setProgressInfoOpen(false);openProjectStats();}},'Open Stats')
      ]
    });
  })()}
</div>
</div>}
{!isEditMode&&completionEstimate&&progressPct<100&&(
  <div className="completion-projection-bar">
    {completionEstimate.enough
      ?<><span className="completion-projection-text">Estimated finish: {completionEstimate.text}</span>
        <span className="completion-projection-speed" title={completionEstimate.rangeText}>{completionEstimate.basis}</span></>
      :<span className="completion-projection-text completion-projection-text--none">Estimated finish: {completionEstimate.text}</span>}
  </div>
)}
{hlIntroBannerVisible&&!isEditMode&&<div className={"tracker-hint-banner"+(leftSidebarMode==="open"?" tracker-hint-banner--palette-open":"")}>
  <span className="tracker-hint-banner__text">Highlight mode — press <kbd>1</kbd>–<kbd>4</kbd> to change style, <kbd>C</kbd> for counting aids, <kbd>[</kbd> <kbd>]</kbd> to cycle colours</span>
  <button onClick={()=>{setHlIntroBannerVisible(false);clearTimeout(hlIntroTimerRef.current);}} aria-label="Dismiss" className="tracker-dismiss-btn tracker-hint-banner__close">{Icons.x?Icons.x():null}</button>
</div>}
{/* The one-time "sessions are tracked" hint is a floating toast (see the
    session-onboarding effect), not a banner here: a banner appeared on the
    first stitch and pushed the chart down under the pointer, then back up
    when it auto-dismissed or the stitch was undone. */}
{focusEnabled&&focusBlock&&stitchingStyle!=="crosscountry"&&(
  <div className="focus-block-nav">
    <div className="focus-block-chip" onClick={()=>setStyleOnboardingOpen(true)} title="Tap to change stitching style">
      {({block:"Block",royal:"Royal Rows",freestyle:"Freestyle"})[stitchingStyle]||stitchingStyle} · {focusBlock.by+1},{focusBlock.bx+1}
    </div>
    {(()=>{const nb=_computeNextFocusBlock();return nb?(
      <button className="focus-block-next-btn" onClick={()=>setFocusBlock(nb)} title="Advance to next section">
        Next section{Icons.chevronRight?Icons.chevronRight():null}
      </button>
    ):null;})()}
  </div>
)}
{sessionSavedToast&&(
  <div className="session-toast">
    {!sessionSavedToast.showNoteInput?(
      <>
        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} Session saved — {sessionSavedToast.stitches} {sessionSavedToast.stitches===1?"stitch":"stitches"} in {formatStatsDuration(sessionSavedToast.durationMin*60)}</span>
        <button onClick={()=>setSessionSavedToast(prev=>({...prev,showNoteInput:true}))}>Add note</button>
        <button onClick={()=>setSessionSavedToast(null)} aria-label="Dismiss" className="tracker-dismiss-btn" style={{display:'inline-flex',alignItems:'center'}}>{Icons.x?Icons.x():null}</button>
      </>
    ):(
      <>
        <input autoFocus maxLength={200} placeholder="What did you work on?" value={sessionSavedToast.noteText}
          onChange={e=>setSessionSavedToast(prev=>({...prev,noteText:e.target.value}))}
          onKeyDown={e=>{if(e.key==="Enter"){editSessionNote(sessionSavedToast.sessionId,sessionSavedToast.noteText);setSessionSavedToast(null);}if(e.key==="Escape")setSessionSavedToast(null);}}/>
        <button onClick={()=>{editSessionNote(sessionSavedToast.sessionId,sessionSavedToast.noteText);setSessionSavedToast(null);}}>Save</button>
      </>
    )}
  </div>
)}
</>}
<div className="cs-page-content" style={{maxWidth:(!statsView&&pat&&pal)?'none':1100,margin:(!statsView&&pat&&pal)?0:"0 auto",padding:(!statsView&&pat&&pal)?0:"20px 16px",width:(!statsView&&pat&&pal)?undefined:"100%"}}>
  {/* The same floating card the home screen's import shows (styles.css
      .import-busy): above the chart and sidebar, where a line in the page
      would sit under the sidebar. */}
  {importBusy&&<div className="import-busy" role="status" aria-live="polite">
    <div className="import-busy-title">{importBusy.title}</div>
    <div className="import-busy-label">{importBusy.label}</div>
    <div className="import-busy-track">
      <div className={"import-busy-bar"+(importBusy.total>0&&importBusy.page>0?"":" indeterminate")}
        style={importBusy.total>0&&importBusy.page>0?{width:Math.round(100*Math.min(1,importBusy.page/importBusy.total))+"%"}:undefined}/>
    </div>
    <button type="button" className="g-btn import-busy-cancel" onClick={importBusy.cancel} disabled={importBusy.stopping}>Cancel</button>
  </div>}
  {loadError&&<div role="alert" style={{background:"var(--danger-soft)",border:"1px solid var(--danger-soft)",borderRadius:'var(--radius-md)',padding:"8px 14px",fontSize:'var(--text-sm)',color:"var(--danger)",marginBottom:'var(--s-3)'}}>{loadError}</div>}
  {copied==="progress"&&<div style={{background:"var(--success-soft)",border:"1px solid var(--success-soft)",borderRadius:'var(--radius-md)',padding:"8px 14px",fontSize:'var(--text-sm)',color:"var(--success)",fontWeight:600,marginBottom:'var(--s-3)',display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} Progress summary copied to clipboard!</div>}
  {importSuccess && (
    <div style={{
      background: "var(--success-soft)", border: "1px solid var(--success-soft)", borderRadius:'var(--radius-md)',
      padding: "8px 14px", fontSize:'var(--text-sm)', color: "var(--success)", fontWeight: 600, marginBottom:'var(--s-3)',
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
    }}>
      <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} {importSuccess}</span>
      <button onClick={()=>setImportSuccess(null)} className="tracker-dismiss-btn" style={{
        padding: "3px 10px", borderRadius:'var(--radius-sm)', border: "1px solid var(--success-soft)", background: "var(--surface)",
        cursor: "pointer", fontSize:'var(--text-xs)', fontWeight: 600, color: "var(--success)", flexShrink: 0
      }}>Dismiss</button>
    </div>
  )}

  {statsView&&pat&&<StatsContainer statsTab={statsTab} setStatsTab={setStatsTab} statsSessions={statsSessions} statsSettings={statsSettings} totalCompleted={combinedDone} totalStitches={combinedTotal} halfStitchCounts={halfStitchCounts} onEditNote={editSessionNote} onEditSession={editSessionDetails} onDeleteSession={deleteSessionById} onMergeSession={mergeSessionWithNext} onUpdateSettings={setStatsSettings} onClose={()=>setStatsView(false)} projectName={projectName||(sW+'\u00D7'+sH+' pattern')} palette={pal} colourDoneCounts={colourDoneCounts} achievedMilestones={achievedMilestones} done={done} pat={pat} sW={sW} sH={sH} doneSnapshots={doneSnapshots} setDoneSnapshots={updateCompareSnapshots} sections={sections} currentProjectId={projectIdRef.current} onOpenProject={(meta)=>{flushBeforeSwitch().then(()=>ProjectStorage.get(meta.id)).then(project=>{if(project&&(project.pattern||project.p)&&project.settings){processLoadedProject(project);try{ProjectStorage.setActiveProject(project.id);}catch(_){};setStatsView(false);}}).catch(()=>{});}}/>}

  {trackerPreviewOpen&&pat&&<TrackerPreviewModal pat={pat} cmap={cmap} sW={sW} sH={sH} fabricCt={fabricCt} level={trackerPreviewLevel} onLevelChange={setTrackerPreviewLevel} onClose={()=>setTrackerPreviewOpen(false)}/>}

  {!statsView&&!pat&&<div style={{maxWidth:500, margin:"40px auto", textAlign:"center"}}>
    <div className="card" style={{padding:"30px"}}>
      <h2 style={{fontSize:24, fontWeight:700, color:"var(--text-primary)", marginBottom:'var(--s-2)'}}>{Icons.thread()} Stitch Tracker</h2>
      <p style={{fontSize:15, color:"var(--text-secondary)", marginBottom:24}}>Track your cross stitch progress</p>

      <div style={{display:"grid",gap:'var(--s-4)'}}>
        <button onClick={()=>loadRef.current.click()} style={{padding:"14px",fontSize:'var(--text-xl)',borderRadius:'var(--radius-xl)',border:"0.5px solid var(--border)",background:"var(--surface-secondary)",cursor:"pointer",fontWeight:600,color:"var(--text-primary)",display:"flex",alignItems:"center",justifyContent:"center",gap:'var(--s-2)'}}>
          {Icons.folder()} Load Project
        </button>
      </div>

      <div style={{marginTop:24, textAlign:"left", background:"var(--surface-secondary)", padding:"16px", borderRadius:'var(--radius-xl)', border:"0.5px solid var(--border)"}}>
        <p style={{fontSize:'var(--text-md)', fontWeight:600, color:"var(--text-secondary)", marginBottom:'var(--s-3)', marginTop:0}}>Supported formats:</p>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:'var(--text-md)', color:"var(--text-secondary)"}}>
            <span style={{padding:"3px 8px", background:"var(--surface-secondary)", color:"var(--text-primary)", borderRadius:'var(--radius-sm)', border:"1px solid var(--accent-light)", fontWeight:600, fontSize:'var(--text-xs)', width:64, textAlign:"center", flexShrink:0}}>.json</span>
            stitchx project files
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:'var(--text-md)', color:"var(--text-secondary)"}}>
            <span style={{padding:"3px 8px", background:"var(--surface-secondary)", color:"var(--accent-text)", borderRadius:'var(--radius-sm)', border:"1px solid var(--accent-light)", fontWeight:600, fontSize:'var(--text-xs)', width:64, textAlign:"center", flexShrink:0}}>.oxs</span>
            KG-Chart / Pattern Keeper XML format
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:'var(--text-md)', color:"var(--text-secondary)"}}>
            <span style={{padding:"3px 8px", background:"var(--success-soft)", color:"var(--success)", borderRadius:'var(--radius-sm)', border:"1px solid var(--success-soft)", fontWeight:600, fontSize:'var(--text-xs)', width:64, textAlign:"center", flexShrink:0}}>.png .jpg</span>
            Pixel art images (each pixel = one stitch)
          </div>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:'var(--text-md)', color:"var(--text-secondary)"}}>
            <span style={{padding:"3px 8px", background:"var(--danger-soft)", color:"var(--danger)", borderRadius:'var(--radius-sm)', border:"1px solid var(--danger-soft)", fontWeight:600, fontSize:'var(--text-xs)', width:64, textAlign:"center", flexShrink:0}}>.pdf</span>
            Pattern Keeper compatible PDF charts
          </div>
        </div>
      </div>

      <div style={{marginTop:30, paddingTop:20, borderTop:"0.5px solid var(--border)"}}>
        <p style={{fontSize:'var(--text-lg)', color:"var(--text-secondary)", marginBottom:10}}>Need a pattern?</p>
        <a href="home.html?tab=create" style={{color:"var(--accent-text)", fontWeight:600, textDecoration:"none", display:'inline-flex', alignItems:'center', gap:4}}><span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronRight?Icons.chevronRight():null}</span>Pattern Creator</a>
      </div>
      <div style={{marginTop:12}}>
        <a href="home.html" style={{color:"var(--text-secondary)", fontWeight:500, textDecoration:"none", display:'inline-flex', alignItems:'center', gap:4, fontSize:'var(--text-md)'}}><span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronLeft?Icons.chevronLeft():null}</span>Back to my projects</a>
      </div>
    </div>
  </div>}

  {!statsView&&pat&&pal&&<><div className={"cs-main"+(leftSidebarMode==="open"?" cs-main--palette-open":"")}>
    {/* Phase 5: backdrop scrim — only visible on mobile while the
        drawer is open. Tap to close. CSS controls visibility (hidden
        on >=900px) so desktop layout is untouched. */}
    {leftSidebarMode==="open"&&<div className="lpanel-backdrop" onClick={()=>setLeftSidebarOpen(false)} aria-hidden="true"/>}
    {/* Touch-1 H-1: rail mode. A 56 px-wide vertical strip with the
        active highlight swatch + an expand chevron. Single-tap on the
        chevron opens the full sidebar; tap on the swatch opens it
        scrolled to the highlight tab. */}
    {leftSidebarMode==="rail"&&<aside className="lpanel lpanel--rail" role="complementary" aria-label="Tracker sidebar (rail)">
      <div className="lpanel-rail-content">
        {(()=>{
          const selEntry=selectedColorId&&pal?pal.find(p=>p.id===selectedColorId):null;
          if(!selEntry||!selEntry.rgb)return null;
          return <button
            type="button"
            className="lpanel-rail-swatch"
            style={{background:"rgb("+selEntry.rgb.join(",")+")"}}
            onClick={()=>{setLeftSidebarTab("highlight");setLeftSidebarMode("open");}}
            aria-label={"Highlighted colour: "+formatThread(selEntry)}
            title={formatThread(selEntry,{variant:"title"})}
          />;
        })()}
        <button
          type="button"
          className="lpanel-rail-btn"
          onClick={()=>setLeftSidebarMode("open")}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >{Icons.chevronRight&&Icons.chevronRight()}</button>
        <button
          type="button"
          className="lpanel-rail-btn"
          onClick={()=>setLeftSidebarMode("hidden")}
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >{Icons.x&&Icons.x()}</button>
      </div>
    </aside>}
    {/* ═══ LEFT SIDEBAR (toolbar-rework phase 1) ═══
        Mirrors Highlight / View / Session controls so the toolbar pill
        and the rpanel "More" tab can be trimmed in later phases. The
        old controls remain wired during phase 1 to avoid disrupting
        in-flight sessions during the migration. */}
    {leftSidebarMode==="open"&&<div className={"lpanel lpanel--open"} role="complementary" aria-label="Colour palette">
    <div className={"ppal-wrap"+(compactColours?" ppal-wrap--compact":"")}>
      {/* ─ Header ─ */}
      <div className="ppal-header">
        <div className="ppal-header-top">
          <span className="ppal-title" title={projectName||"Pattern"}>{projectName||"Pattern"}</span>
          <button
            className={"ppal-pin-btn"+(leftSidebarPinned?" ppal-pin-btn--on":"")}
            onClick={()=>setLeftSidebarPinned(v=>!v)}
            aria-pressed={leftSidebarPinned}
            aria-label={leftSidebarPinned?"Unpin colour panel":"Pin colour panel open"}
            title={leftSidebarPinned?"Unpin panel (allow collapsing)":"Pin panel open"}
          >{Icons.pin&&Icons.pin()}</button>
          <button className="ppal-close" onClick={()=>{setLeftSidebarPinned(false);setLeftSidebarOpen(false);}} aria-label="Close palette panel">{Icons.x()}</button>
        </div>
        <div className="ppal-progress-bar"><div className="ppal-progress-fill" style={{width:progressPct+"%"}}/></div>
        <div className="ppal-header-stats">
          <span className="ppal-pct">{progressPct>=100?"Complete!":progressPct.toFixed(1)+"%"}</span>
          {liveSessionOpen
            ?<button type="button" className="ppal-session-chip" title="Open Session controls" aria-label={(liveIsTimer?"Timer":"Session")+(liveAutoIsPaused||manuallyPaused?", paused":"")+". Open session controls"} onClick={()=>{setLeftSidebarTab("session");setMorePanelOpen(true);}}>
              {liveAutoIsPaused||manuallyPaused?(Icons.pause?Icons.pause():null):(Icons.play?Icons.play():null)}{" "}<LiveElapsed store={elapsedStore}/>{liveAutoStitches>0?" \u00B7 "+liveAutoStitches+" st":""}{" \u00B7 "}{liveIsTimer?"Timer":formatTimingModeShortLabel(currentTimingMode)}
            </button>
            :<button type="button" className="ppal-session-chip ppal-session-chip--start" title="Start a timer for this stitching session" onClick={()=>startTimer()}>
              {Icons.play?Icons.play():null}{" "}Start timer
            </button>}
        </div>
        {stitchKey&&!compactColours&&<div className="ppal-key" role="group" aria-label="Key to stitch colours">
          <span className="ppal-key-item"><span className="ppal-key-swatch" style={{background:stitchKey.pend}} aria-hidden="true"/>To stitch</span>
          <span className="ppal-key-item"><span className="ppal-key-swatch" style={{background:doneStyle==="tick"?stitchKey.pend:stitchKey.done}} aria-hidden="true">{doneStyle==="tick"&&<span className="ppal-key-tick"/>}</span>Stitched{doneStyle==="tick"?" (corner tick)":""}</span>
          {stitchKey.pale&&doneStyle!=="tick"&&<span className="ppal-key-note">Very pale threads such as white and ecru look light grey once stitched. For a corner tick instead, choose Corner tick in More &gt; View.</span>}
        </div>}
      </div>
      {/* ─ Sort row ─ */}
      <div className="ppal-sort-row">
        <div className="ppal-sort-group" role="group" aria-label="Sort colour list">
          {[["count","Remaining"],["done","% done"],["id","Number"]].map(([k,l])=>
            <button key={k} className={"ppal-sort-btn"+(legendSort===k?" ppal-sort-btn--on":"")} onClick={()=>setLegendSort(k)} aria-pressed={legendSort===k}>{l}</button>
          )}
        </div>
        <div className="ppal-size-toggle" role="group" aria-label="Colour list size">
          <button type="button" className={"ppal-size-btn"+(!compactColours?" ppal-size-btn--on":"")} onClick={()=>setCompactColours(false)} aria-pressed={!compactColours} aria-label="Comfortable list" title="Comfortable list">{Icons.listComfortable()}</button>
          <button type="button" className={"ppal-size-btn"+(compactColours?" ppal-size-btn--on":"")} onClick={()=>setCompactColours(true)} aria-pressed={compactColours} aria-label="Compact list" title="Compact list: one line per colour">{Icons.listCompact()}</button>
        </div>
      </div>
      {pal&&pal.length>0&&!compactColours&&<p className="ppal-use-note">Each colour shows the strands in the needle and the skeins it takes.</p>}
      {pal&&window.BlendHelpNote&&!compactColours&&pal.some(p=>p.type==="blend")&&<div className="ppal-blend-note">{React.createElement(window.BlendHelpNote)}</div>}
      {/* ─ Active colour tile ─ */}
      {focusColour&&cmap&&cmap[focusColour]&&(!areaColourCounts||((scopedColourCounts[focusColour]||{}).total+(scopedColourCounts[focusColour]||{}).halfTotal>0))?(()=>{
        const fc=cmap[focusColour];
        const dc=scopedColourCounts[focusColour]||{total:0,done:0,halfTotal:0,halfDone:0};
        const row=legendRows&&legendRows.find(r=>r.p.id===focusColour);
        const cp=ProgressUnits.colourProgress(dc);
        const pct=row?row.pct:cp.percent;
        const complete=row?row.complete:cp.complete;
        const swRgb="rgb("+fc.rgb+")";
        const findBtn=<button className="ppal-find-btn" onClick={jumpToNextStitch} title="Jump to next remaining stitch" aria-label={"Find next unfinished stitch of "+formatThread((cmap&&cmap[focusColour])||{id:focusColour})}>{Icons.magnify()}</button>;
        if(compactColours){
          // Compact list: the rows carry no buttons, so the selected colour's card holds them, with its usage line.
          const kr=keyRowsById[focusColour]||threadKeyRow(fc,{fabricCount:fabricCt});
          return <div className={"ppal-active-tile ppal-active-tile--compact"+(complete?" ppal-active-tile--done":"")}>
            <div className="ppal-active-top">
              <div className="ppal-active-swatch-wrap"><span className="ppal-active-swatch" style={{background:swRgb}}/></div>
              <div className="ppal-active-info">
                <span className="ppal-active-id" title={formatThread(fc,{variant:"title"})}>{formatThread(fc,{variant:"short"})}{fc.type==="blend"&&<span className="ppal-tile-tag">blend</span>}{" "}<span className="ppal-active-name">{formatThread(fc,{variant:"name"})}</span></span>
                <span className="ppal-active-count">{row?legendCountText(row.dc,row.kn,row.qt,row.bsc):dc.done+"/"+dc.total} · {pct}%{kr&&kr.usage?" \u00B7 "+kr.usage:""}</span>
              </div>
              {findBtn}
            </div>
            {row&&kr&&renderColourActions(row,kr)}
          </div>;
        }
        return <div className={"ppal-active-tile"+(complete?" ppal-active-tile--done":"")}>
          <div className="ppal-active-swatch-wrap">
            {window.ProgressRing
              ?React.createElement(window.ProgressRing,{percent:pct,size:56})
              :<span className="ppal-active-swatch" style={{background:swRgb}}/>}
          </div>
          <div className="ppal-active-info">
            <span className="ppal-active-id" title={formatThread(fc,{variant:"title"})}>{formatThread(fc,{variant:"short"})}{fc.type==="blend"&&<span className="ppal-tile-tag">blend</span>}</span>
            <span className="ppal-active-name">{formatThread(fc,{variant:"name"})}</span>
            <span className="ppal-active-count">{dc.done}/{dc.total} · {pct}%</span>
          </div>
          {findBtn}
        </div>;
      })()
      :<div className="ppal-active-none">{Icons.pointing?Icons.pointing():null}{" Tap a colour below to select it"}</div>}
      {/* ─ Colour tile list ─ */}
      {pal&&<div className="ppal-tile-list" role="list">
        {(()=>{
          const rows=legendRows||[];
          return rows.map(row=>{
            const {p,dc,kn,qt,bsc,pct,complete}=row;
            const isFocused=focusColour===p.id;
            const swRgb="rgb("+p.rgb+")";
            const kr=keyRowsById[p.id]||threadKeyRow(p,{fabricCount:fabricCt});
            const openDetail=e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setPaletteDetail({id:p.id,type:p.type,brand:p.brand,threads:p.threads,name:p.name,rgb:p.rgb,anchorRect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}});};
            const pick=e=>{e.stopPropagation();if(isEditMode){setEditModalColor(p);return;}selectTrackerColour(p.id);};
            if(compactColours){
              // One line: swatch, number and name, then % (a tick once finished), over a thin progress line.
              return <div key={p.id} role="listitem"
                className={"ppal-tile ppal-tile--compact"+(isFocused?" ppal-tile--on":"")+(complete?" ppal-tile--done":"")}
                onClick={pick}>
                <button type="button" className="ppal-tile-swatch" style={{background:swRgb}} aria-label={"View "+kr.title+" detail"} onClick={openDetail}/>
                <button type="button" className="ppal-tile-select ppal-row-select" title={kr.title}
                  aria-pressed={isFocused} aria-label={"Select "+kr.title+", "+pct+" percent complete. "+kr.usageTitle}
                  onClick={pick}>
                  <ThreadKeyLabel row={{...kr,usage:""}} classes={TILE_KEY_CLASSES}/>
                  {complete
                    ?<span className="ppal-row-done" aria-hidden="true">{Icons.check()}</span>
                    :<span className="ppal-tile-pct">{pct}%</span>}
                  <span className="ppal-row-bar" aria-hidden="true"><span className="ppal-tile-bar-fill" style={{width:pct+"%"}}/></span>
                </button>
              </div>;
            }
            return <div key={p.id} role="listitem"
              className={"ppal-tile"+(isFocused?" ppal-tile--on":"")+(complete?" ppal-tile--done":"")}
              onClick={()=>{if(isEditMode){setEditModalColor(p);return;}selectTrackerColour(p.id);}}>
              <button type="button" className="ppal-tile-swatch" style={{background:swRgb}}
                aria-label={"View "+kr.title+" detail"}
                onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setPaletteDetail({id:p.id,type:p.type,brand:p.brand,threads:p.threads,name:p.name,rgb:p.rgb,anchorRect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}});}}
              />
              <div className="ppal-tile-body">
                <button type="button" className="ppal-tile-id-row ppal-tile-select" title={kr.title}
                  aria-pressed={isFocused} aria-label={"Select "+kr.title+", "+pct+" percent complete. "+kr.usageTitle}
                  onClick={e=>{e.stopPropagation();if(isEditMode){setEditModalColor(p);return;}selectTrackerColour(p.id);}}>
                  <ThreadKeyLabel row={kr} classes={TILE_KEY_CLASSES}/>
                  <span className="ppal-tile-pct">{pct}%</span>
                </button>
                <div className="ppal-tile-bar"><div className="ppal-tile-bar-fill" style={{width:pct+"%"}}/></div>
                <div className="ppal-tile-count-row">
                  <span className="ppal-tile-count">{legendCountText(dc,kn,qt,bsc)}</span>
                  {renderColourActions(row,kr)}
                </div>
              </div>
            </div>;
          });
        })()}
      </div>}
    </div>
    </div>}

    <div className={"ppal-canvas-col"+(handedness==="left"?" ppal-canvas-col--left":"")}>
    <div className="canvas-area" style={{padding:"12px 16px",position:"relative"}}>
    {isShiftDown&&_dragMarkActive&&_dragMarkFlag&&<div style={{position:"absolute",top:4,right:20,zIndex:30,pointerEvents:"none",display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:'var(--radius-md)',background:"var(--accent)",color:"var(--surface)",fontSize:'var(--text-xs)',fontWeight:600,boxShadow:'var(--shadow-sm)'}}>
      <span aria-hidden="true" style={{display:"inline-flex"}}>{Icons.crop?Icons.crop():null}</span>
      <span>{dragMarkState&&dragMarkState.mode==='shiftRange'?(altDownRef.current?"Release to unpick the rectangle":"Drag to select a rectangle, release to apply (hold Alt to unpick)"):"Shift held — drag from a cell to select a rectangle"}</span>
    </div>}
    {/* Touch long-press in Mark mode anchors a rectangle. Say what happens
        next, and offer the two other things a long-press can mean here:
        parking a thread on that stitch (as Markup R-XP's long-press menu
        does) and backing out, which had no gesture of its own. */}
    {_dragMarkActive&&dragMarkState&&dragMarkState.mode==='range'&&dragMarkState.anchor!=null&&(()=>{
      const a=dragMarkState.anchor,ax=a%sW,ay=Math.floor(a/sW);
      const anchorDone=!!(done&&done[a]);
      const parked=parkMarkers.some(m=>m.x===ax&&m.y===ay);
      return <div className="range-anchor-bar" role="status">
        <span aria-hidden="true" className="range-anchor-bar__icon">{Icons.crop?Icons.crop():null}</span>
        <span className="range-anchor-bar__text">{unpickPending?"Tap the opposite corner to unpick that area":"Tap the opposite corner to fill a rectangle"}</span>
        {!anchorDone&&<button type="button" className="range-anchor-bar__btn" onClick={()=>{dragMarkReset();toggleParkAt(ax,ay);}}>
          <span aria-hidden="true" className="range-anchor-bar__icon">{Icons.parkFlag?Icons.parkFlag():null}</span>{parked?"Remove park marker":"Park thread here"}
        </button>}
        <button type="button" className={"range-anchor-bar__btn"+(unpickPending?" range-anchor-bar__btn--on":"")} aria-pressed={unpickPending} onClick={()=>setUnpickIntent(!unpickPending)} title="Take the marks out of every kind of stitch in the rectangle">
          <span aria-hidden="true" className="range-anchor-bar__icon">{Icons.undo?Icons.undo():null}</span>Unpick area
        </button>
        <button type="button" className="range-anchor-bar__btn" onClick={dragMarkReset}>
          <span aria-hidden="true" className="range-anchor-bar__icon">{Icons.x?Icons.x():null}</span>Cancel
        </button>
      </div>;
    })()}
    {showNavHelp&&!isEditMode&&(()=>{const isTouch=hasTouchRef.current;return(
    <div style={{marginBottom:'var(--s-2)',padding:"14px 16px",background:"var(--surface)",border:"1px solid var(--accent-light)",borderRadius:'var(--radius-lg)',fontSize:'var(--text-sm)'}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontWeight:700,fontSize:'var(--text-md)',color:"var(--text-primary)"}}>Navigation &amp; Controls</span>
        <button onClick={()=>setShowNavHelp(false)} aria-label="Dismiss" className="tracker-dismiss-btn" style={{background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",padding:"0 4px",lineHeight:1,display:'inline-flex'}}>{Icons.x?Icons.x():null}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 24px"}}>
        {[
          ["Pan",isTouch?"Mark mode: drag with two fingers  ·  Nav mode: drag with one finger":"Drag in Nav mode  ·  or hold Space + drag  ·  or middle-click drag"],
          ["Zoom in / out",isTouch?"Pinch two fingers apart / together":"Ctrl + scroll  ·  or use − / + buttons"],
          ["Zoom to fit","Tap the Fit button"],
          ["Mark a stitch",isTouch?"Tap a cell":"Click a cell"],
          ["Mark multiple",isTouch?"Drag one finger across the stitches":"Click + drag across cells — all set to same state"],
          ["Select a rectangle",isTouch?"Long-press a cell, then tap another":"Hold Shift + click another cell"],
          ["Undo last marks","Undo button (top right)"],
          stitchView==="highlight"?["Cycle colours",isTouch?"Open the Highlight tab in the sidebar":"[ or ] keys"]:null,
          stitchView==="highlight"?["Clear focus","Tap the colour pill to show all colours"]:null,
          stitchMode==="navigate"?["Place a guide",isTouch?"Tap a cell to drop a crosshair. Tap it again to clear it":"Click a cell to drop a crosshair. Click it again, or press Esc, to clear it"]:null,
          ["Select a colour",isTouch?"Tap a colour in the palette":"Right-click a stitch to select its colour and enter Highlight view (Ctrl+click on a Mac)"],
          ["Park a thread",isTouch?"Press and hold a stitch: Nav mode parks at once; in Mark mode tap Park thread here":"Shift + right-click a stitch. Repeat to remove the marker (Shift+Ctrl+click on a Mac)"],
          ["Find a parked thread","Tap the P on its colour in the palette"],
        ].filter(Boolean).map(([label,tip],i)=>(
          <div key={i} style={{display:"contents"}}>
            <div style={{color:"var(--text-secondary)",fontWeight:600,paddingTop:1}}>{label}</div>
            <div style={{color:"var(--text-primary)"}}>{tip}</div>
          </div>
        ))}
      </div>
      {!isTouch&&<div style={{marginTop:10,paddingTop:8,borderTop:"0.5px solid var(--surface-tertiary)",color:"var(--text-tertiary)",fontSize:'var(--text-xs)'}}>
        Tip: on a trackpad, two-finger scroll pans the canvas without any modifier key.
      </div>}
    </div>
    );})()}

    {scs < 6 && !isEditMode && (stitchView === "symbol" || stitchView === "colour") && <div style={{fontSize:'var(--text-sm)', color: "var(--text-secondary)", marginBottom: 6, background: "var(--surface-tertiary)", padding: "6px 10px", borderRadius:'var(--radius-md)'}}>To see symbols, you may need to zoom in.</div>}

    {/* ── Single banner slot (highest priority wins) ── */}
    {(()=>{
      if(isEditMode) return <div style={{fontSize:'var(--text-sm)',color:"var(--warning)",background:"var(--warning-soft)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"1px solid var(--warning)", fontWeight: 600}}>EDITING — <span style={{fontWeight:400}}>Tap a <b>stitch on the grid</b> to edit that cell only · Tap a <b>colour in the list below</b> to reassign all stitches of that colour</span></div>;
      if(advanceToast) return <div style={{fontSize:'var(--text-sm)',color:"var(--success)",background:"var(--success-soft)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"1px solid var(--success-soft)",fontWeight:600,display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} Complete! Next: {advanceToast}</div>;
      if(blockAdvanceToast) return <div style={{fontSize:'var(--text-sm)',color:"var(--accent-text)",background:"var(--accent-light)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"1px solid var(--accent-border)",fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} {blockAdvanceToast.label} complete — {blockAdvanceToast.stitches} stitches</span>
        <div style={{display:"flex",gap:'var(--s-2)'}}>
          {blockAdvanceToast.next&&<button onClick={()=>{setFocusBlock(blockAdvanceToast.next);setBlockAdvanceToast(null);}} style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:4,border:"1px solid var(--accent-border)",background:"var(--surface)",cursor:"pointer",fontWeight:600,color:"var(--accent-text)"}}>Next block</button>}
          <button onClick={()=>{setBlockAdvanceToast(null);setFocusBlock(null);}} style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:4,border:"none",background:"none",cursor:"pointer",color:"var(--text-tertiary)"}}>Stay</button>
        </div>
      </div>;
      if(stitchMode==="track"&&!hintsSeen) return <div className="tracker-hint" style={{fontSize:'var(--text-sm)',color:"var(--accent-ink)",background:"var(--accent-light)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--accent-border)"}}>{hasTouchRef.current?"Tap to mark · Rest a finger, then drag, to paint · Swipe to scroll · Long-press for a rectangle · Two fingers to zoom":"Click or drag to mark/unmark cross stitches · Shift+click or long-press for rectangle fill · Right-click to highlight a colour · Shift + right-click to park · Space+drag to pan · Ctrl+scroll to zoom · Ctrl+Z undo"}{trackHistory.length>0?` · ${trackHistory.length} undo step${trackHistory.length>1?"s":""} available`:""}</div>;
      if(stitchMode==="navigate"&&!hintsSeen) return <div className="tracker-hint" style={{fontSize:'var(--text-sm)',color:"var(--text-primary)",background:"var(--surface-tertiary)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--border)"}}>{hasTouchRef.current?"Drag to pan · Tap to place or clear the guide · Press and hold a stitch to park its thread":"Drag to pan · Click to place or clear the guide · Right-click a stitch to highlight its colour · Shift + right-click to park its thread · T for track mode"}</div>;
      if(!shortcutsHintDismissed&&pat&&trackerLoadCount>=3&&!(window.Platform&&window.Platform.isCoarsePointer&&window.Platform.isCoarsePointer())) return <div style={{fontSize:'var(--text-sm)',color:"var(--text-tertiary)",background:"var(--surface-secondary)",padding:"5px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:'var(--s-2)'}}><span>{Icons.lightbulb()} Press <kbd>?</kbd> for keyboard shortcuts</span><button onClick={()=>{localStorage.setItem("shortcuts_hint_dismissed","1");setShortcutsHintDismissed(true);}} aria-label="Dismiss" className="tracker-dismiss-btn" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",lineHeight:1,padding:0,display:"inline-flex",alignItems:"center"}}>{Icons.x?Icons.x():null}</button></div>;
      return null;
    })()}

    {/* Work area bar: which part of the pattern the chart is showing, its
        progress, and stepping to the next unfinished area. */}
    {areaOn&&areaStats&&(()=>{
      const pct=areaStats.total?Math.floor(areaStats.done/areaStats.total*1000)/10:100;
      const hasPrev=!!neighbourArea(-1,false),hasNext=!!neighbourArea(1,false);
      const finished=areaStats.total>0&&areaStats.done>=areaStats.total;
      return <div className="work-area-bar" role="region" aria-label="Work area">
        <span className="work-area-bar__title">{Icons.crop()}<span>Work area</span><span className="work-area-bar__range">{window.WorkArea.describe(workArea)}</span></span>
        <span className="work-area-bar__progress">
          <span className="work-area-bar__track" aria-hidden="true"><span className="work-area-bar__fill" style={{display:"block",width:pct+"%"}}/></span>
          <span className="work-area-bar__pct" aria-label={"Work area "+pct+"% done, "+(areaStats.total-areaStats.done).toLocaleString("en-GB")+" stitches left"}>{pct%1===0?pct.toFixed(0):pct.toFixed(1)}%</span>
        </span>
        {finished&&<button type="button" className="g-btn g-btn--primary" onClick={()=>{const n=nextUnfinishedArea();if(n)enterWorkArea(n);else{try{window.Toast&&window.Toast.show&&window.Toast.show({message:"Every area of this size is done",type:"success"});}catch(_){}}}}>{Icons.check()} Finished: next area</button>}
        <span className="work-area-bar__actions">
          <span className="work-area-seg" role="group" aria-label="Margin around the area">
            <span className="work-area-seg__label">Margin</span>
            {[0,3,10].map(m=><button key={m} type="button" aria-pressed={workAreaMargin===m} onClick={()=>setWorkAreaMargin(m)}>{m}</button>)}
          </span>
          <button type="button" className="work-area-bar__icon-btn" disabled={!hasPrev} onClick={()=>stepWorkArea(-1)} aria-label="Previous unfinished area" title="Previous unfinished area">{Icons.chevronLeft()}</button>
          <button type="button" className="work-area-bar__icon-btn" disabled={!hasNext} onClick={()=>stepWorkArea(1)} aria-label="Next unfinished area" title="Next unfinished area">{Icons.chevronRight()}</button>
          <button type="button" className="g-btn" onClick={()=>setAreaPickerOpen(true)}>Change</button>
          <button type="button" className="g-btn" onClick={exitWorkArea}>{Icons.focusExit()} Show whole pattern</button>
        </span>
      </div>;
    })()}
    {/* Row bar: which row row mode is on, its progress, and stepping rows. */}
    {rowModeActive&&!isEditMode&&pat&&(()=>{
      const st=rowStats(currentRow);
      const pct=st.total?Math.floor(st.done/st.total*100):100;
      const left=st.total-st.done;
      const next=nextUnfinishedRow();
      return <div className="work-area-bar row-mode-bar" role="region" aria-label="Row mode">
        <span className="work-area-bar__title">{Icons.rowMode()}<span>Row {currentRow+1}</span><span className="work-area-bar__range">of {sH}</span></span>
        <span className="work-area-bar__progress">
          <span className="work-area-bar__track" aria-hidden="true"><span className="work-area-bar__fill" style={{display:"block",width:pct+"%"}}/></span>
          <span className="work-area-bar__pct" aria-label={"Row "+(currentRow+1)+": "+(st.total?left.toLocaleString("en-GB")+" stitches left":"no stitches")}>{st.total?(left?left.toLocaleString("en-GB")+" left":"Done"):"Empty"}</span>
        </span>
        <span className="work-area-bar__actions">
          <button type="button" className="work-area-bar__icon-btn" disabled={currentRow<=rowSpan.y0} onClick={()=>goToRow(currentRow-1)} aria-label="Row above" title="Row above">{Icons.chevronUp()}</button>
          <button type="button" className="work-area-bar__icon-btn" disabled={currentRow>=rowSpan.y1-1} onClick={()=>goToRow(currentRow+1)} aria-label="Row below" title="Row below">{Icons.chevronDown()}</button>
          {next>=0&&next!==currentRow&&<button type="button" className="g-btn" onClick={()=>goToRow(next)}>Next unfinished row</button>}
          <button type="button" className="g-btn" onClick={()=>setRowMode(false)}>Exit row mode</button>
        </span>
      </div>;
    })()}
    {areaPickerOpen&&pat&&window.WorkAreaPicker&&React.createElement(window.WorkAreaPicker,{
      pat,done,halfStitches,halfDone,sW,sH,blockW,blockH,current:workArea,
      onClose:()=>setAreaPickerOpen(false),
      onConfirm:(rect)=>{setAreaPickerOpen(false);enterWorkArea(rect);}
    })}
    {/* Height lives in CSS (.tracker-chart-scroll), not inline. It used to be
        an inline max-height of 600px, which no media query could override, so
        a tablet with 1300 CSS px of height showed the chart through the same
        letterbox as a phone. */}
    <p id="tracker-chart-summary" className="tracker-chart-summary">{sW} columns by {sH} rows. {Math.round(stitchZoom*100)}% zoom. Focus the chart and use arrow keys to move the guide; Enter marks or unmarks in Mark mode. Ctrl+Z undoes. {layerVis.full===false?"Full crosses are hidden.":""}</p>
    <div ref={stitchScrollRef} className={"tracker-chart-scroll"+(drawer?" is-drawer":"")} onScroll={()=>{if(!scrollRafRef.current){scrollRafRef.current=requestAnimationFrame(()=>{renderStitchIfScrolledOut();scrollRafRef.current=null;})}}} style={{overflow:"auto",border:"0.5px solid var(--border)",borderRadius:"8px 8px 0 0",background:"var(--surface-tertiary)",cursor:isPanning?"grabbing":isSpaceDownRef.current?"grab":(!isEditMode&&stitchMode==="track"?(isShiftDown&&_dragMarkActive&&_dragMarkFlag?"cell":"crosshair"):!isEditMode&&stitchMode==="navigate"?"grab":"default"),transition:"max-height 0.3s",position:"relative"}} onMouseUp={handleMouseUp} onMouseLeave={handleStitchMouseLeave}>
      <div aria-hidden="true" style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', width: 'max-content', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: G, height: G, flexShrink: 0, position: 'sticky', left: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', zIndex: 4 }}></div>
        {areaOn?colRuler.slice(viewBounds.x0,viewBounds.x1):colRuler}
      </div>
      <div style={{ display: 'flex', width: 'max-content' }}>
        <div aria-hidden="true" style={{ position: 'sticky', left: 0, zIndex: 3, width: G, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          {areaOn?rowRuler.slice(viewBounds.y0,viewBounds.y1):rowRuler}
        </div>
        {/* Explicit size: the chart canvas is absolutely positioned now that it
            is a viewport-sized tile, so it no longer gives this box its
            dimensions. These are exactly what the full-size canvas used to
            contribute (its width less the -G margin), which is what keeps the
            scroller's extent — and every saved scroll position — unchanged. */}
        {/* Sized to the view: the whole pattern, or a work area plus its
            margin. The inner layer keeps every child in whole-chart
            coordinates and is shifted so the view's corner sits at this box's
            corner; overflow is hidden so nothing outside the view adds to the
            scroller's extent. With no work area the shift is 0 and the
            geometry is exactly as before. */}
        <div className="tracker-chart-view" style={{ position: 'relative', width: (viewBounds.x1-viewBounds.x0)*scs+2, height: (viewBounds.y1-viewBounds.y0)*scs+2, overflow: areaOn ? 'hidden' : undefined }}>
        <div ref={chartLayerRef} className="tracker-chart-layer" style={{ position: 'absolute', left: -viewBounds.x0*scs, top: -viewBounds.y0*scs, width: sW*scs+2, height: sH*scs+2 }}>
          <canvas ref={stitchRef} role="application" tabIndex="0" aria-describedby="tracker-chart-summary tracker-chart-status" aria-label="Cross stitch pattern grid. Right-click a stitch to select its colour and enter Highlight view; Shift + right-click parks or unparks its thread (Ctrl+click and Shift+Ctrl+click on a Mac). The arrow keys move the guide. In Mark mode Enter or Space marks the stitch at the guide and Shift+Enter fills a rectangle from the last one; Menu or Shift+F10 parks a thread at the guide." style={{display:"block",position:"absolute",zIndex:2, left: -G, top: -G, touchAction:(touchLocked||(_dragMarkActive&&_dragMarkFlag&&paintMode))?"none":"pan-x pan-y", WebkitTouchCallout:"none"}} onMouseDown={handleStitchMouseDown} onMouseMove={handleStitchMouseMove} onKeyDown={handleStitchKeyDown} {...dragMarkHandlers} onContextMenu={handleStitchContextMenu} onPointerDownCapture={handleCanvasPointerDownCapture} onPointerMoveCapture={handleCanvasPointerMoveCapture} onPointerUpCapture={clearNavHold} onPointerCancelCapture={clearNavHold}/>

          {_dragMarkActive&&_dragMark.previewStore&&<DragMarkOverlay store={_dragMark.previewStore} pulse={dragMarkPulse} w={sW} h={sH} scs={scs} G={G}/>}

          {/* Outline highlight's marching ants (SVG, browser-animated) */}
          {antsOn&&<svg ref={antsSvgRef} className="tracker-ants" aria-hidden="true" focusable="false" style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:3,pointerEvents:"none",overflow:"hidden"}}><path fill="none" strokeWidth="2"/><path fill="none" strokeWidth="2"/></svg>}
          {/* Thread usage overlay */}
          {threadUsageMode&&<canvas ref={threadUsageCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:3,pointerEvents:"none"}}/>}
          {/* Recommendation border overlay */}
          {recEnabled&&<canvas ref={recOverlayCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:4,pointerEvents:"none"}}/>}
          {/* Breadcrumb trail overlay (below focus overlay) */}
          {breadcrumbVisible&&<canvas ref={breadcrumbCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:5,pointerEvents:"none"}}/>}
          {/* Focus area spotlight overlay */}
          {focusEnabled&&focusBlock&&<canvas ref={focusOverlayCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:6,pointerEvents:"none"}}/>}
          {/* Counting aids overlay (block counts, run lengths, ninja stitches) */}
          {countingAidsEnabled&&stitchView==="highlight"&&focusColour&&<canvas ref={countingAidsCanvasRef} style={{display:"block",position:"absolute",top:-G,left:-G,zIndex:7,pointerEvents:"none"}}/>}

          {/* C3: range anchor overlay driven by useDragMark long-press anchor
              (touch) and the live shift-drag rubber-band anchor (mouse). */}
          {dragMarkState&&(dragMarkState.mode==='range'||dragMarkState.mode==='shiftRange')&&dragMarkState.anchor!=null&&sW>0&&<div style={{
            position:'absolute',
            left:(dragMarkState.anchor%sW)*scs,
            top:Math.floor(dragMarkState.anchor/sW)*scs,
            width:scs,height:scs,
            border:'2px solid var(--accent)',
            borderRadius:2,
            pointerEvents:'none',
            zIndex:5,
            boxSizing:'border-box',
            animation:'range-anchor-pulse 1s ease-in-out infinite alternate'
          }}/>}

          <>
            <div ref={el => hoverRefs.current.row = el} style={{
              display: 'none', position: 'absolute', pointerEvents: 'none', background: 'rgba(100, 149, 237, 0.08)', zIndex: 3,
              willChange: 'transform'
            }} />
            <div ref={el => hoverRefs.current.col = el} style={{
              display: 'none', position: 'absolute', pointerEvents: 'none', background: 'rgba(100, 149, 237, 0.08)', zIndex: 3,
              willChange: 'transform'
            }} />
          </>
        </div>
        </div>
      </div>
    </div>

    <div className={"tracker-hover-wrap"+(hlRow>=0&&hlCol>=0?"":" tracker-hover-wrap--idle")} style={{background:"var(--text-primary)", color:"var(--surface)", padding:"6px 10px", borderRadius:"0 0 8px 8px", fontSize:'var(--text-sm)', fontWeight:500, display:"flex", alignItems:"center", minHeight:30, marginBottom:'var(--s-3)'}}>
      {/* Written directly by renderHoverBar(); React never updates these children. */}
      <span ref={hoverBarRef} className="tracker-hover-bar">{"—"}</span>
      <span ref={guideLiveRef} id="tracker-chart-status" className="tracker-sr-only" role="status" aria-live="polite" aria-atomic="true"/>
      {/* Touch has no Esc, and re-tapping the exact guide cell is easy to
          miss, so the guide gets a visible way out wherever it is shown. */}
      {hlRow>=0&&hlCol>=0&&<button type="button" className="tracker-hover-bar__clear" onClick={()=>{clearGuide();stitchRef.current&&stitchRef.current.focus({preventScroll:true});}} title="Clear the guide crosshair" aria-label="Clear the guide crosshair">
        <span aria-hidden="true" style={{display:"inline-flex"}}>{Icons.x?Icons.x():null}</span>Clear guide
      </button>}
    </div>

    {doneCount===0&&!hintsSeen&&totalStitchable>0&&stitchMode==="track"&&<div className="tracker-hint" style={{fontSize:'var(--text-xs)',color:"var(--accent-ink)",background:"var(--accent-soft)",border:"1px solid var(--accent-border)",borderRadius:'var(--radius-sm)',padding:"6px 10px",marginBottom:'var(--s-2)',textAlign:"center"}}>Tap any stitch on the canvas to mark it as done</div>}

    </div>{/* end canvas-area */}
    {pat&&cmap&&window.TrackerMinimap&&minimapPref!==false&&!isEditMode&&React.createElement(window.TrackerMinimap,{pat,cmap,sW,sH,done,scrollRef:stitchScrollRef,getView:minimapGetView,onJump:minimapJump,apiRef:minimapApiRef,viewKey:scs+"|"+sW+"|"+sH+"|"+focusMode+"|"+handedness,side:handedness==="left"?"right":"left",collapsed:focusMode&&isPhoneScreen()&&!minimapFocusOpen,onOpen:()=>setMinimapFocusOpen(true)})}
    {/* ─ Phone chip ─ */}
    {pal&&focusColour&&cmap&&cmap[focusColour]
      ?<button className="ppal-phone-chip" onClick={cycleLeftSidebar} aria-label="Open colour palette panel">
          <span className="ppal-phone-chip-sw" style={{background:"rgb("+cmap[focusColour].rgb+")"}}/>
          <span title={formatThread((cmap&&cmap[focusColour])||{id:focusColour},{variant:"title"})}>{formatThread((cmap&&cmap[focusColour])||{id:focusColour},{variant:"short"})}</span>
        </button>
      :<button className="ppal-phone-chip ppal-phone-chip--empty" onClick={cycleLeftSidebar} aria-label="Open colour palette panel">
          {Icons.menu?Icons.menu():null}{" Palette"}
        </button>
    }

    {/* ─ Mode strip ─ */}
    <div className={"toolbar-row"+(isEditMode?" toolbar-row--edit":"")+" ppal-mode-strip"} role="toolbar" aria-label="Canvas controls">
      <button className={"ppal-mode-btn"+(leftSidebarMode==="open"?" ppal-mode-btn--on":"")} onClick={cycleLeftSidebar} aria-label={(leftSidebarMode==="hidden"?"Open colour palette":"Cycle colour palette mode")+((pal&&focusColour&&cmap&&cmap[focusColour])?" (current colour "+formatThread(cmap[focusColour])+")":"")} aria-pressed={leftSidebarMode==="open"} title="Toggle colour palette">
        {(()=>{
          const cur=pal&&focusColour&&cmap&&cmap[focusColour];
          return <>
            <span className="ppal-mode-btn-icon">{cur?<span className="ppal-mode-swatch" aria-hidden="true" style={{background:"rgb("+cur.rgb+")"}}/>:(Icons.palette?Icons.palette():null)}</span>
            <span className="ppal-mode-btn-label">{cur?String(cur.id):"Colours"}</span>
          </>;
        })()}
      </button>
      <button className={"ppal-mode-btn"+(stitchMode==="track"?" ppal-mode-btn--on":"")+(isEditMode?" tb-btn--red":" tb-btn--green")} onClick={()=>setStitchMode("track")} title={isEditMode?"Modify pattern (M)":(paintMode&&_isCoarsePointer&&_dragMarkFlag?"Mark stitches (T): Paint mode is on":"Mark stitches (T)")} aria-pressed={stitchMode==="track"}>
        <span className="ppal-mode-btn-icon">{Icons.check()}</span>
        <span className="ppal-mode-btn-label">{isEditMode?"Modify":(paintMode&&_isCoarsePointer&&_dragMarkFlag?"Paint":"Mark")}</span>
      </button>
      <button className={"ppal-mode-btn"+(stitchMode==="navigate"?" ppal-mode-btn--on":"")} onClick={()=>setStitchMode("navigate")} title="Navigate (N)" aria-pressed={stitchMode==="navigate"}>
        <span className="ppal-mode-btn-icon">{Icons.hand()}</span>
        <span className="ppal-mode-btn-label">Nav</span>
      </button>
      <button className="ppal-mode-btn" onClick={fitChart} title={areaOn?"Fit the work area (0)":"Fit to screen (0)"}>
        <span className="ppal-mode-btn-icon">{Icons.focus()}</span>
        <span className="ppal-mode-btn-label">Fit</span>
      </button>
      <button className={"ppal-mode-btn"+(areaOn?" ppal-mode-btn--on":"")} onClick={()=>setAreaPickerOpen(true)} aria-pressed={areaOn} title={areaOn?"Change work area (W)":"Pick a work area (W)"}>
        <span className="ppal-mode-btn-icon">{Icons.crop()}</span>
        <span className="ppal-mode-btn-label">Area</span>
      </button>
      <button className="ppal-mode-btn" onClick={undoTrack} disabled={!trackHistory.length} title="Undo (Ctrl+Z)" aria-label={trackHistory.length>0?"Undo "+trackHistory.length+" steps":"Nothing to undo"}>
        <span className="ppal-mode-btn-icon">{Icons.undo()}</span>
        <span className="ppal-mode-btn-label">Undo</span>
      </button>
      <button className={"ppal-mode-btn"+(morePanelOpen?" ppal-mode-btn--on":"")} onClick={()=>setMorePanelOpen(v=>!v)} title="More controls" aria-expanded={morePanelOpen} aria-controls="ppal-more-panel">
        <span className="ppal-mode-btn-icon">{Icons.menu()}</span>
        <span className="ppal-mode-btn-label">More</span>
      </button>
    </div>

    {/* ─ More panel backdrop ─ */}
    {morePanelOpen&&<div className="ppal-more-backdrop" onClick={()=>setMorePanelOpen(false)} aria-hidden="true"/>}

    {/* ─ More panel ─ */}
    <div ref={morePanelRef} tabIndex={-1} id="ppal-more-panel" className={"ppal-more-panel"+(morePanelOpen?" ppal-more-panel--open":"")} role="dialog" aria-modal={morePanelOpen?"true":undefined} aria-label="Tracker controls" aria-hidden={!morePanelOpen} inert={!morePanelOpen?"":undefined}>
      <div className="ppal-more-header">
        <span className="ppal-more-title">Controls</span>
        <button className={"ppal-utility-chip"+(wakeLockActive?" ppal-utility-chip--on":"")} onClick={toggleWakeLock} aria-pressed={wakeLockActive} title={wakeLockActive?"The screen stays on while you stitch. Tap to let it sleep.":"Keep the screen on while you stitch"}>
          {Icons.dot?Icons.dot():null}{" Keep screen on"}
        </button>
        <button className={"ppal-utility-chip"+(focusMode?" ppal-utility-chip--on":"")} onClick={()=>setFocusMode(v=>!v)} aria-pressed={focusMode} title={focusMode?"Exit focus mode (F)":"Enter focus mode (F)"}>
          {focusMode?(Icons.focusExit?Icons.focusExit():null):(Icons.focus?Icons.focus():null)}{" Focus"}
        </button>
        <button className="ppal-more-close" onClick={()=>setMorePanelOpen(false)} aria-label="Close controls">{Icons.x()}</button>
      </div>
      {_isCoarsePointer&&<div className="ppal-touch-row" role="group" aria-label="Touch">
        {_dragMarkFlag&&<button className={"ppal-utility-chip"+(paintMode?" ppal-utility-chip--on":"")} onClick={()=>setPaintMode(v=>!v)} aria-pressed={paintMode} title="Paint mode: one finger paints a run of stitches at once instead of scrolling the chart">
          {Icons.brush?Icons.brush():null}{" Paint"}
        </button>}
        <button className={"ppal-utility-chip"+(touchLocked?" ppal-utility-chip--on":"")} onClick={()=>{setTouchLocked(v=>!v);setMorePanelOpen(false);}} aria-pressed={touchLocked} title="Lock touches: a finger on the chart does nothing, so a propped-up device cannot mark by accident. Hold the Locked pill to unlock">
          {Icons.lock?Icons.lock():null}{" Lock touches"}
        </button>
      </div>}
      <div className="ppal-more-tabs">
        {[["highlight","Highlight"],["view","View"],["session","Session"],["layers","Layers"],["tools","Tools"]].map(([k,l])=>
          <button key={k} aria-pressed={leftSidebarTab===k} className={"ppal-more-tab"+(leftSidebarTab===k?" ppal-more-tab--on":"")} onClick={()=>setLeftSidebarTab(k)}>{l}</button>
        )}
      </div>
      <div className="ppal-more-content">

        {/* -- Highlight tab -- */}
        {leftSidebarTab==="highlight"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Chart view</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["symbol","Symbol"],["colour","Colour + symbol"],["highlight","Highlight"]].map(([v,l])=>
                <button key={v}
                  style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid "+(stitchView===v?"var(--accent)":"var(--border)"),background:stitchView===v?"var(--accent)":"var(--surface)",color:stitchView===v?"var(--text-on-accent)":"var(--text-secondary)",fontSize:'var(--text-sm)',cursor:"pointer",fontWeight:stitchView===v?600:400}}
                  onClick={()=>setStitchView(v)} aria-pressed={stitchView===v}
                >{l}</button>
              )}
            </div>
          </div>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Highlight style</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["isolate","Isolate"],["outline","Outline"],["tint","Tint"],["spotlight","Spotlight"]].map(([v,l])=>
                <button key={v} className="ppal-hl-mode-btn"
                  style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid "+(highlightMode===v&&stitchView==="highlight"?"var(--accent)":"var(--border)"),background:highlightMode===v&&stitchView==="highlight"?"var(--accent)":"var(--surface)",color:highlightMode===v&&stitchView==="highlight"?"var(--text-on-accent)":"var(--text-secondary)",fontSize:'var(--text-sm)',cursor:"pointer",fontWeight:highlightMode===v&&stitchView==="highlight"?600:400}}
                  onClick={()=>{setStitchView("highlight");setHighlightMode(v);}} aria-pressed={highlightMode===v&&stitchView==="highlight"}
                >{l}</button>
              )}
            </div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={countingAidsEnabled} onChange={e=>setCountingAidsEnabled(e.target.checked)} className="ppal-check"/>
            <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Counting aids</span>
          </label>
          {countingAidsEnabled&&scs<COUNTING_AIDS_MIN_CELL&&<div role="status" style={{fontSize:'var(--text-xs)',color:"var(--text-secondary)",marginTop:-8}}>Zoom in to see counting aids. They are hidden when the cells are this small.</div>}
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={!!highlightSkipDone} onChange={e=>setHighlightSkipDone(e.target.checked)} className="ppal-check"/>
            <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Skip done stitches</span>
          </label>
          {focusColour&&<button onClick={()=>setFocusColour(null)} style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",alignSelf:"flex-start"}}>Clear focus</button>}
        </div>}

        {/* -- View tab -- */}
        {leftSidebarTab==="view"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Finished stitches</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["fill","Thread colour"],["tick","Corner tick"]].map(([v,l])=>
                <button key={v}
                  style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid "+(doneStyle===v?"var(--accent)":"var(--border)"),background:doneStyle===v?"var(--accent)":"var(--surface)",color:doneStyle===v?"var(--text-on-accent)":"var(--text-secondary)",fontSize:'var(--text-sm)',cursor:"pointer",fontWeight:doneStyle===v?600:400}}
                  onClick={()=>{try{if(window.UserPrefs)window.UserPrefs.set('trackerDoneStyle',v);}catch(_){}}} aria-pressed={doneStyle===v}
                >{l}</button>
              )}
            </div>
          </div>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Grid lines</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[
                ["trackerGridStyle","Strength",gridStyle,[["subtle","Subtle"],["standard","Standard"],["bold","Bold"]]],
                ["trackerGridColour","Colour",gridColour,[["auto","Auto"],["dark","Dark"],["light","Light"],["accent","Terracotta"]]],
                ["trackerGridEvery","Heavy line every",gridEvery,[[5,"5"],[10,"10"],[20,"20"]]]
              ].map(([key,label,cur,opts])=>
                <div key={key} role="group" aria-label={"Grid lines: "+label.toLowerCase()}>
                  <div style={{fontSize:'var(--text-xs)',color:"var(--text-secondary)",marginBottom:4}}>{label}{key==="trackerGridEvery"?" (stitches)":""}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {opts.map(([v,l])=>
                      <button key={v}
                        style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid "+(cur===v?"var(--accent)":"var(--border)"),background:cur===v?"var(--accent)":"var(--surface)",color:cur===v?"var(--text-on-accent)":"var(--text-secondary)",fontSize:'var(--text-sm)',cursor:"pointer",fontWeight:cur===v?600:400}}
                        onClick={()=>{try{if(window.UserPrefs)window.UserPrefs.set(key,v);}catch(_){}}} aria-pressed={cur===v}
                      >{l}</button>
                    )}
                  </div>
                </div>
              )}
              {highContrastPref&&gridStyle==="standard"&&<div role="status" style={{fontSize:'var(--text-xs)',color:"var(--text-secondary)"}}>High contrast is on, so Standard lines are drawn Bold.</div>}
            </div>
          </div>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Pattern overview</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[[true,"Show"],[false,"Hide"]].map(([v,l])=>
                <button key={l}
                  style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid "+((minimapPref!==false)===v?"var(--accent)":"var(--border)"),background:(minimapPref!==false)===v?"var(--accent)":"var(--surface)",color:(minimapPref!==false)===v?"var(--text-on-accent)":"var(--text-secondary)",fontSize:'var(--text-sm)',cursor:"pointer"}}
                  onClick={()=>{try{if(window.UserPrefs)window.UserPrefs.set('trackerMinimap',v);}catch(_){}}} aria-pressed={(minimapPref!==false)===v}
                >{l}</button>
              )}
            </div>
          </div>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Zoom</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={()=>setStitchZoom(z=>Math.max(MIN_STITCH_ZOOM,+(z-0.25).toFixed(2)))} style={{padding:"5px 10px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:16,cursor:"pointer",color:"var(--text-secondary)"}} aria-label="Zoom out">&#8722;</button>
              <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)",minWidth:40,textAlign:"center"}}>{Math.round((stitchZoom||1)*100)}%</span>
              <button onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} style={{padding:"5px 10px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:16,cursor:"pointer",color:"var(--text-secondary)"}} aria-label="Zoom in">&#43;</button>
              <button onClick={fitChart} style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)"}}>Fit</button>
            </div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={!!lockDetailLevel} onChange={e=>setLockDetailLevel(e.target.checked)} className="ppal-check"/>
            <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Lock detail level</span>
          </label>
        </div>}

        {/* -- Session tab -- */}
        {leftSidebarTab==="session"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {liveSessionOpen?<>
            <div style={{background:"var(--surface-secondary)",borderRadius:"var(--radius-md)",padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:'var(--text-sm)',color:"var(--text-tertiary)"}}>Active session</span>
                {liveAutoIsPaused||manuallyPaused
                  ?<span style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:"var(--radius-sm)",background:"var(--warning-soft)",color:"var(--warning)",fontWeight:600}}>Paused</span>
                  :<span style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:"var(--radius-sm)",background:"var(--success-soft)",color:"var(--success)",fontWeight:600}}>Active</span>
                }
                {liveIsTimer
                  ?<span style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:"var(--radius-sm)",background:"var(--surface)",color:"var(--text-secondary)",fontWeight:600,border:"1px solid var(--border)"}}>Timer</span>
                  :<Tooltip text={formatTimingModeDescription(currentTimingMode)+' Open preferences to change.'} width={220}>
                  <button type="button"
                    onClick={e=>{e.stopPropagation();setPreferencesInitialCategory('tracker');setPreferencesOpen(true);}}
                    style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:"var(--radius-sm)",background:"var(--surface)",color:"var(--text-secondary)",fontWeight:600,border:"1px solid var(--border)",cursor:"pointer"}}
                    aria-label={"Session timing mode: "+formatTimingModeLabel(currentTimingMode)+". "+formatTimingModeDescription(currentTimingMode)+" Open preferences to change."}
                  >{formatTimingModeLabel(currentTimingMode)}</button>
                </Tooltip>}
              </div>
              <div style={{display:"flex",gap:24}}>
                <div><div style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>{liveIsTimer?"Time":"Time (estimated)"}</div><div style={{fontSize:'var(--text-lg)',fontWeight:700,color:"var(--text-primary)",fontVariantNumeric:"tabular-nums"}}><LiveElapsed store={elapsedStore}/></div></div>
                <div><div style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>Stitches</div><div style={{fontSize:'var(--text-lg)',fontWeight:700,color:"var(--text-primary)"}}>{liveAutoStitches.toLocaleString('en-GB')}</div></div>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button
                onClick={()=>{
                  if(!currentAutoSessionRef.current)return;
                  const now=Date.now();
                  if(manuallyPausedRef.current){
                    // Resume: emit manualResume event to log
                    currentAutoSessionRef.current.eventLog.push({kind:'manualResume',t:now});
                    manuallyPausedRef.current=false;
                    setManuallyPaused(false);
                    setLiveAutoIsPaused(document.hidden);
                  }else{
                    // Pause: emit manualPause event to log
                    currentAutoSessionRef.current.eventLog.push({kind:'manualPause',t:now});
                    manuallyPausedRef.current=true;
                    setManuallyPaused(true);
                    setLiveAutoIsPaused(true);
                  }
                }}
                style={{flex:1,padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                aria-label={manuallyPaused?"Resume session":"Pause session"}
              >
                {manuallyPaused?(Icons.play?Icons.play():null):(Icons.pause?Icons.pause():null)}
                {" "}{manuallyPaused?"Resume":"Pause"}
              </button>
              <button
                onClick={()=>{
                  const cs=currentAutoSessionRef.current;
                  if(cs&&cs.timer){const endMs=Date.now();setStopTimerAsk({endMs:endMs,seconds:Math.floor(computeActiveMs(cs.eventLog,endMs,90000,'manual')/1000),stitches:liveAutoStitches,hasActivity:cs.stitchesCompleted+cs.stitchesUndone>0});}
                  else if(finaliseAutoSessionRef.current)finaliseAutoSessionRef.current();
                  setMorePanelOpen(false);
                }}
                style={{flex:1,padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--danger-soft)",background:"var(--danger-soft)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--danger)",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                aria-label={liveIsTimer?"Stop timer":"End session"}
              >
                {Icons.x?Icons.x():null}{liveIsTimer?" Stop timer":" End session"}
              </button>
            </div>
          </>:<>
            <p style={{fontSize:'var(--text-sm)',color:"var(--text-tertiary)",margin:0}}>No active session. Stitching starts one automatically and its time is worked out from your stitches (an estimate). Start the timer for an exact time.</p>
            <button
              onClick={()=>{startTimer();setMorePanelOpen(false);}}
              style={{padding:"10px 12px",minHeight:44,borderRadius:"var(--radius-sm)",border:"1px solid var(--accent)",background:"var(--accent)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-on-accent)",fontWeight:600}}
            >Start timer</button>
            <button
              onClick={()=>{setSessionConfigOpen(true);setMorePanelOpen(false);}}
              style={{padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--accent)",background:"var(--accent)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-on-accent)",fontWeight:600}}
            >Session settings</button>
            {explicitSession&&<button onClick={()=>setExplicitSession(null)} style={{padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)"}}>End explicit session</button>}
          </>}
          {statsSessions&&statsSessions.length>0&&<button
            onClick={()=>{setMorePanelOpen(false);openProjectStats();}}
            style={{padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",display:"flex",alignItems:"center",gap:6,marginTop:4}}
          >{Icons.barChart?Icons.barChart():null} View Stats</button>}
          {window.TrackerNotesPhotos&&React.createElement(window.TrackerNotesPhotos,{key:projectIdRef.current||"p",projectId:projectIdRef.current,notes:projectNotes,onNotes:setProjectNotes,active:morePanelOpen&&leftSidebarTab==="session"})}
        </div>}

        {/* -- Layers tab -- */}
        {leftSidebarTab==="layers"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
          {window.SpecialtyStitchPanel&&<window.SpecialtyStitchPanel tracking objects={specialtyStitches} done={specialtyDone} visible={layerVis} accept={specialtyAvailable} disabled={!_dragMarkActive} onSelect={setSpecialtySelected} onToggle={toggleSpecialtyDone}/>}
          {STITCH_LAYERS.map(layer=>
            <label key={layer.id} title={layer.key?"Shortcut: "+layer.key:undefined} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
              <input type="checkbox" checked={layerVis[layer.id]!==false} onChange={e=>setLayerVis(v=>({...v,[layer.id]:e.target.checked}))} className="ppal-check"/>
              <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>{layer.label} ({fmtNum(layerCounts[layer.id])})</span>
            </label>
          )}
          <hr style={{border:"none",borderTop:"1px solid var(--border)",margin:"4px 0"}}/>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={rowModeActive} onChange={e=>setRowMode(e.target.checked)} className="ppal-check"/>
            <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Row mode</span>
          </label>
          {pal&&pal.some(p=>parkCountsByColour[p.id])&&<>
            <hr style={{border:"none",borderTop:"1px solid var(--border)",margin:"4px 0"}}/>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>Park markers</div>
            {pal.filter(p=>parkCountsByColour[p.id]).map(p=>
              <label key={p.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
                <input type="checkbox" checked={parkLayers[p.id]!==false} onChange={()=>toggleParkLayer(p.id)} className="ppal-check"/>
                <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>{p.id} ({parkCountsByColour[p.id]})</span>
              </label>
            )}
            <button onClick={clearAllParkMarkers} style={{marginTop:4,padding:"5px 10px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",alignSelf:"flex-start"}}>Clear all</button>
          </>}
        </div>}

        {/* -- Tools tab -- */}
        {leftSidebarTab==="tools"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Stitch mode</div>
            {/* Shared with the Creator's Navigate | Draw (components/ModeToggle.js). */}
            {window.ModeToggle?<window.ModeToggle className="mode-toggle--block" ariaLabel="Stitch mode" value={stitchMode} onChange={setStitchMode}
              options={[{value:"track",label:"Mark",icon:Icons.check(),title:"Mark stitches (T)"},{value:"navigate",label:"Navigate",icon:Icons.hand(),title:"Navigate (N)"}]}/>
            :<div style={{display:"flex",gap:6}}>
              {[["track","Mark"],["navigate","Navigate"]].map(([v,l])=>
                <button key={v}
                  style={{flex:1,padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid "+(stitchMode===v?"var(--accent)":"var(--border)"),background:stitchMode===v?"var(--accent)":"var(--surface)",color:stitchMode===v?"var(--text-on-accent)":"var(--text-secondary)",fontSize:'var(--text-sm)',cursor:"pointer",fontWeight:stitchMode===v?600:400}}
                  onClick={()=>setStitchMode(v)} aria-pressed={stitchMode===v}
                >{l}</button>
              )}
            </div>}
          </div>
          {stitchingStyle!=="crosscountry"&&<div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Section spotlight</div>
            <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer",userSelect:"none",marginBottom:4}}>
              <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Highlight active section</span>
              <input type="checkbox" checked={!!focusEnabled} onChange={e=>{
                const on=e.target.checked;
                setFocusEnabled(on);
                try{localStorage.setItem("cs_focusEnabled",on?"1":"0");}catch(_){}
                if(on&&!focusBlock)setFocusBlock(_getStartBlock());
              }} className="ppal-check"/>
            </label>
            {focusEnabled&&focusBlock&&<div style={{display:"flex",gap:12}}>
              <button onClick={()=>setFocusBlock(_getStartBlock())} style={{fontSize:'var(--text-xs)',padding:0,background:"none",border:"none",color:"var(--accent-text)",cursor:"pointer",fontFamily:"inherit"}}>Restart sections</button>
              <button onClick={()=>setStyleOnboardingOpen(true)} style={{fontSize:'var(--text-xs)',padding:0,background:"none",border:"none",color:"var(--accent-text)",cursor:"pointer",fontFamily:"inherit"}}>Change style</button>
            </div>}
          </div>}
          <button
            onClick={()=>setSessionConfigOpen(true)}
            style={{padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",textAlign:"left",display:"flex",alignItems:"center",gap:8}}
          >{Icons.gear?Icons.gear():null}{" Session settings"}</button>
          <button
            onClick={()=>setStyleOnboardingOpen(true)}
            style={{padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",textAlign:"left",display:"flex",alignItems:"center",gap:8}}
          >{Icons.palette?Icons.palette():null}{" Stitching style"}</button>
          <button
            onClick={()=>window.dispatchEvent(new Event("cs:openShortcuts"))}
            style={{padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",textAlign:"left",display:"flex",alignItems:"center",gap:8}}
          >{Icons.keyboard?Icons.keyboard():null}{" Keyboard shortcuts"}</button>
          <button type="button" className="btn" onClick={()=>openConsumptionHistory()}>Thread consumption history</button>
          {/* RT live tracking toggle */}
          <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer",userSelect:"none"}}>
            <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Use up stash thread as I stitch</span>
            <input type="checkbox" checked={!!wastePrefs.enabled} onChange={e=>{
              if(!e.target.checked&&typeof setWastePrefs==='function'){
                // Turning off: dispatch to TrackerApp via a custom event
                // so the disable modal (which needs StashBridge) can be shown.
                window.dispatchEvent(new CustomEvent('cs:rtDisableRequest'));
              }else if(e.target.checked&&typeof setWastePrefs==='function'){
                setWastePrefs(function(prev){return Object.assign({},prev,{enabled:true});});
              }
            }} className="ppal-check"/>
          </label>
        </div>}

      </div>
    </div>{/* end ppal-more-panel */}

    </div>{/* end ppal-canvas-col */}
  </div>{/* end cs-main */}
  </>}

  {importDialog==="image"&&importImage&&(()=>{
    // C7: when the experimental import wizard is enabled, mount the new
    // 5-step ImportWizard component instead of the legacy single-step
    // parameter modal. The flag defaults off so existing users see no
    // change. The wizard's commit() returns the same shape the legacy
    // path expects so the generation call below stays identical.
    let _useWizard=false;
    try{ _useWizard=!!(window.UserPrefs&&window.UserPrefs.get&&window.UserPrefs.get('experimental.importWizard')); }catch(_){_useWizard=false;}
    if(_useWizard&&window.ImportWizard){
      return React.createElement(window.ImportWizard,{
        image:importImage,
        baseName:importName||"",
        globalStash:globalStash,
        onClose:()=>{ setImportDialog(null); setImportImage(null); },
        onGenerate:(settings)=>{
          try{
            let result=parseImagePattern(importImage,Object.assign({},settings,{globalStash:globalStash}));
            const finalName=(settings.name||'').trim().slice(0,60);
            let project=importResultToProject(result,settings.fabricCt||14,finalName);
            project.id=ProjectStorage.newId();
            project.createdAt=project.createdAt||new Date().toISOString();
            processLoadedProject(project);
            ProjectStorage.save(project).then(id=>ProjectStorage.setActiveProject(id)).catch(err=>console.error("Import save failed:",err));
            setImportSuccess(`Imported "${finalName||'image'}" \u2014 ${result.width}\u00d7${result.height}, ${result.paletteSize} colours, ${result.stitchCount} stitches`);
          }catch(err){
            console.error(err);
            setLoadError("Image import failed: "+err.message);
          }
          setImportDialog(null);
          setImportImage(null);
        }
      });
    }
    return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="import-pattern-title" onClick={()=>{setImportDialog(null);setImportImage(null);}}>
    <div className="modal-content" style={{maxWidth:600}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>{setImportDialog(null);setImportImage(null);}} aria-label="Close">{Icons.x?Icons.x():null}</button>
      <h3 id="import-pattern-title" style={{marginTop:0,marginBottom:15}}>Import Image Pattern</h3>
      <div style={{display:"flex", flexDirection:"column", gap:'var(--s-3)', marginBottom:'var(--s-4)'}}>
        <div style={{display:"flex", flexDirection:"column", gap:'var(--s-1)'}}>
          <label style={{fontSize:'var(--text-sm)', fontWeight:600, color:"var(--text-secondary)"}}>Project Name</label>
          <input type="text" maxLength={60} value={importName} onChange={e=>setImportName(e.target.value)}
            placeholder="e.g. Rose Garden" style={{padding:"6px 10px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)", fontSize:'var(--text-md)'}}/>
        </div>
      </div>
      <div style={{display:"flex", gap:20, flexWrap:"wrap"}}>
        <div style={{width:140, display:"flex", flexDirection:"column", gap:'var(--s-2)'}}>
          <div style={{width:140, height:140, background:"var(--surface-secondary)", border:"0.5px solid var(--border)", borderRadius:'var(--radius-md)', display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden"}}>
            <img src={importImage.src} style={{maxWidth:"100%", maxHeight:"100%", objectFit:"contain", imageRendering:"pixelated"}}/>
          </div>
          <div style={{fontSize:'var(--text-sm)', color:"var(--text-secondary)", textAlign:"center"}}>
            {importImage.width} × {importImage.height} px
          </div>
        </div>
        <div style={{flex:1, minWidth:250, display:"flex", flexDirection:"column", gap:'var(--s-4)'}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:'var(--s-3)'}}>
            <div style={{display:"flex", flexDirection:"column", gap:'var(--s-1)'}}>
              <label style={{fontSize:'var(--text-sm)', fontWeight:600, color:"var(--text-secondary)"}}>Max Width (stitches)</label>
              <input type="number" inputMode="numeric" min={10} max={300} value={importMaxW} onChange={e=>{
                let val = Number(e.target.value);
                setImportMaxW(val);
                if (importArLock) setImportMaxH(Math.max(10, Math.floor(val * (importImage.height / importImage.width))));
              }} style={{padding:"6px 10px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)"}}/>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:'var(--s-1)'}}>
              <label style={{fontSize:'var(--text-sm)', fontWeight:600, color:"var(--text-secondary)"}}>Max Height (stitches)</label>
              <input type="number" inputMode="numeric" min={10} max={300} value={importMaxH} onChange={e=>{
                let val = Number(e.target.value);
                setImportMaxH(val);
                if (importArLock) setImportMaxW(Math.max(10, Math.floor(val * (importImage.width / importImage.height))));
              }} style={{padding:"6px 10px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)"}}/>
            </div>
          </div>
          <label style={{display:"flex", alignItems:"center", gap:'var(--s-2)', fontSize:'var(--text-md)', color:"var(--text-primary)", cursor:"pointer"}}>
            <input type="checkbox" checked={importArLock} onChange={e=>setImportArLock(e.target.checked)}/> Lock aspect ratio
          </label>

          <div style={{display:"flex", flexDirection:"column", gap:'var(--s-1)'}}>
            <label style={{fontSize:'var(--text-sm)', fontWeight:600, color:"var(--text-secondary)"}}>Fabric Count</label>
            <select value={importFabricCt} onChange={e=>setImportFabricCt(Number(e.target.value))}
              style={{padding:"6px 10px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)", fontSize:'var(--text-md)', background:"var(--surface)"}}>
              {FABRIC_COUNTS.map(fc=><option key={fc.ct} value={fc.ct}>{fc.label}</option>)}
            </select>
          </div>

          <SliderRow label="Threads (max)" val={importMaxColours} setVal={setImportMaxColours} min={5} max={40} />

          <label style={{display:"flex", alignItems:"center", gap:'var(--s-2)', fontSize:'var(--text-md)', color:"var(--text-primary)", cursor:"pointer"}}>
            <input type="checkbox" checked={importSkipBg} onChange={e=>setImportSkipBg(e.target.checked)}/> Skip near-white background
          </label>

          {importSkipBg && <SliderRow label="Background Tolerance" val={importBgThreshold} setVal={setImportBgThreshold} min={3} max={50} />}

        </div>
      </div>
      <div style={{display:"flex", justifyContent:"flex-end", gap:10, marginTop:24, paddingTop:16, borderTop:"0.5px solid var(--border)"}}>
        <button onClick={()=>{setImportDialog(null);setImportImage(null);}} style={{padding:"8px 16px", borderRadius:'var(--radius-md)', border:"0.5px solid var(--border)", background:"var(--surface)", cursor:"pointer", fontWeight:600}}>Cancel</button>
        <button onClick={()=>{
          try {
            let result = parseImagePattern(importImage, {
              maxWidth: importMaxW, maxHeight: importMaxH,
              maxColours: importMaxColours, skipWhiteBg: importSkipBg, bgThreshold: importBgThreshold
            });
            const finalName = (importName || '').trim().slice(0, 60);
            let project = importResultToProject(result, importFabricCt, finalName);
            project.id = ProjectStorage.newId();
            project.createdAt = project.createdAt || new Date().toISOString();
            processLoadedProject(project);
            ProjectStorage.save(project).then(id => ProjectStorage.setActiveProject(id)).catch(err => console.error("Import save failed:", err));
            setImportSuccess(`Imported "${finalName || 'image'}" \u2014 ${result.width}\u00d7${result.height}, ${result.paletteSize} colours, ${result.stitchCount} stitches`);
            setImportDialog(null);
            setImportImage(null);
          } catch(err) {
            console.error(err);
            setLoadError("Image import failed: " + err.message);
            setImportDialog(null);
            setImportImage(null);
          }
        }} style={{padding:"8px 16px", borderRadius:'var(--radius-md)', border:"none", background:"var(--accent)", color:"var(--surface)", cursor:"pointer", fontWeight:600}}>Import Pattern</button>
      </div>
    </div>
  </div>;
  })()}

  {modal==="help"&&<SharedModals.Help defaultTab="tracker" onClose={()=>setModal(null)} />}
  {welcomeOpen&&window.WelcomeWizard&&React.createElement(window.WelcomeWizard,{
    page:"tracker",
    // Phase 5: the Stitching-Style picker is now an extra wizard step rather
    // than a separate modal stacked after the welcome. Both tutorial flags
    // get marked done together when the user finishes the wizard.
    extraSteps:[{
      customComponent:StitchingStyleStepBody,
      onCommit:result=>{
        if(!result)return;
        setStitchingStyle(result.style);
        setBlockW(result.blockW);setBlockH(result.blockH);
        setStartCorner(result.startCorner);
        if(!focusBlock){setFocusBlock(_getStartBlock());}
        if(result.style!=="crosscountry")setFocusEnabled(true);
      }
    }],
    onClose:()=>{
      setWelcomeOpen(false);
      // Leaving the tour early keeps the default stitching style. It used to
      // open the standalone picker, which has no way out, so "Skip tour" led
      // straight into a questionnaire. The style can be changed any time from
      // More controls > Tools > Stitching style.
      try{ if(!localStorage.getItem("cs_styleOnboardingDone")) localStorage.setItem("cs_styleOnboardingDone","1"); }catch(_){}
    }
  })}
  {styleOnboardingOpen&&<StitchingStyleOnboarding startCorner={startCorner} onDone={result=>{
    setStyleOnboardingOpen(false);
    if(result){
      setStitchingStyle(result.style);
      setBlockW(result.blockW);setBlockH(result.blockH);
      setStartCorner(result.startCorner);
      if(!focusBlock){setFocusBlock(_getStartBlock());}
      if(result.style!=="crosscountry")setFocusEnabled(true);
    }
  }}/>}
  {/* Only render HelpHintBanner when TrackerApp is the top-level page (stitch.html).
     When embedded inside UnifiedApp (create.html), the parent already mounts it. */}
  {!onSwitchToDesign&&window.HelpHintBanner&&React.createElement(window.HelpHintBanner)}
  {_showTrFirstStitchCoach && window.Coachmark && React.createElement(window.Coachmark, {
    id: 'firstStitch_tracker',
    title: 'Mark your first stitch',
    body: _isCoarsePointer
      ? 'Tap a stitch to mark it done, or drag across several. Tap it again to unmark it.'
      : 'Click a stitch to mark it done, or drag across several. Click it again to unmark it.',
    placement: 'inside-bottom',
    target: '.tracker-chart-scroll',
    showHighlight: false,
    helpTopic: 'Tracking progress',
    onComplete: ()=>_trCoach.complete('firstStitch_tracker'),
    onSkip: ()=>_trCoach.skip('firstStitch_tracker'),
    onSkipAll: ()=>_trCoach.skipAll()
  })}
  {_showTrRectSelectCoach && window.Coachmark && React.createElement(window.Coachmark, {
    id: 'rectSelect_tracker',
    title: 'Select a rectangle of stitches',
    body: _isCoarsePointer
      ? 'Press and hold a cell, then tap another cell to mark a whole rectangle at once.'
      : 'Hold Shift and click a stitch to mark the whole rectangle between it and the last stitch you marked.',
    placement: 'inside-bottom',
    target: '.tracker-chart-scroll',
    showHighlight: false,
    helpTopic: 'Marking a rectangle',
    onComplete: ()=>_trCoach.complete('rectSelect_tracker'),
    onSkip: ()=>_trCoach.skip('rectSelect_tracker'),
    onSkipAll: ()=>_trCoach.skipAll()
  })}
  {sessionConfigOpen&&<SessionConfigModal liveAutoStitches={liveAutoStitches} onClose={()=>setSessionConfigOpen(false)} onStart={cfg=>{
    setExplicitSession({startTime:Date.now(),timeAvail:cfg.timeAvail,stitchGoal:cfg.stitchGoal,startStitches:doneCount,blocks:[]});
    setSessionConfigOpen(false);
  }}/>}
  {sessionSummaryData&&(()=>{
    const activeSessionIdx=statsSessions?statsSessions.length:0;
    const sessionBreadcrumbs=(breadcrumbs||[]).filter(b=>b&&b.sessionIdx===activeSessionIdx);
    const firstSessionBreadcrumb=sessionBreadcrumbs.length>0?sessionBreadcrumbs[0]:null;
    return <SessionSummaryModal data={sessionSummaryData} prevAvgSpeed={statsSessions&&statsSessions.length>1?Math.round(statsSessions.slice(0,-1).reduce((s,sess)=>s+(ProgressUnits.sessionAdded(sess)),0)/Math.max(1,statsSessions.slice(0,-1).reduce((s,sess)=>s+(sess.durationSeconds||0),0))*3600):0} hasBreadcrumbs={sessionBreadcrumbs.length>0} onViewBreadcrumbs={()=>{setBreadcrumbVisible(true);setSessionSummaryData(null);if(firstSessionBreadcrumb&&stitchScrollRef.current){const b=firstSessionBreadcrumb;const off=chartScrollOffset();const cx=G+b.bx*blockW*scs+blockW*scs/2-off.x;const cy=G+b.by*blockH*scs+blockH*scs/2-off.y;const el=stitchScrollRef.current;el.scrollLeft=Math.max(0,cx-el.clientWidth/2);el.scrollTop=Math.max(0,cy-el.clientHeight/2);}}} onClose={()=>setSessionSummaryData(null)}/>;
  })()}
  {stopTimerAsk&&<StopTimerDialog seconds={stopTimerAsk.seconds} stitches={stopTimerAsk.stitches} hasActivity={stopTimerAsk.hasActivity}
    onKeep={()=>setStopTimerAsk(null)} onClose={()=>setStopTimerAsk(null)}
    onSave={sec=>{const endMs=stopTimerAsk.endMs;setStopTimerAsk(null);if(finaliseAutoSessionRef.current)finaliseAutoSessionRef.current(sec==null?{discard:true}:{endMs:endMs,durationSeconds:sec});}}/>}
  {forgotStop&&!stopTimerAsk&&<ForgotStopDialog info={forgotStop}
    onKeep={()=>snoozeForgotStop()}
    onTrim={()=>{if(finaliseAutoSessionRef.current)finaliseAutoSessionRef.current(forgotStop.lastMarkT?{endMs:forgotStop.lastMarkT}:{discard:true});}}
    onStop={()=>{const cs=currentAutoSessionRef.current;if(!cs)return;const endMs=Date.now();setStopTimerAsk({endMs:endMs,seconds:Math.floor(computeActiveMs(cs.eventLog,endMs,90000,'manual')/1000),stitches:liveAutoStitches,hasActivity:cs.stitchesCompleted+cs.stitchesUndone>0});}}/>}
  {markAllAsk&&(()=>{
    const O=window.Overlay;
    const body=<>
      <h3 id="markall-title" style={{marginTop:0,fontSize:20,color:'var(--text-primary)'}}>Count these as today's stitching?</h3>
      <div id="markall-body" style={{fontSize:'var(--text-lg)',color:'var(--text-secondary)',marginBottom:'var(--s-4)'}}>
        <p style={{marginTop:0}}>Catch-up marks raise your progress but are left out of today's count, your pace, your goals and your streak. Use it when you are recording stitching you already did, for example on paper.</p>
        <p style={{marginBottom:0}}>I will remember your answer. You can change it in Preferences, under Stitch Tracker.</p>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:'var(--s-2)'}}>
        <button className="resume-recap-btn resume-recap-btn--primary" autoFocus onClick={()=>answerMarkAllAsk(true)}>Count as catch-up</button>
        <button className="resume-recap-btn" onClick={()=>answerMarkAllAsk(false)}>Count as today's stitching</button>
        <button className="resume-recap-btn" onClick={()=>setMarkAllAsk(null)}>Cancel</button>
      </div>
    </>;
    return O
      ?<O variant="dialog" maxWidth={480} labelledBy="markall-title" describedBy="markall-body" onClose={()=>setMarkAllAsk(null)} panelProps={{'data-markall':'1'}}><div style={{padding:'var(--s-4)'}}>{body}</div></O>
      :<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="markall-title"><div className="modal-content" style={{maxWidth:480}}>{body}</div></div>;
  })()}
  {reconcile&&(()=>{
    const cands=reconcile.candidates||[];
    const f=v=>v.toLocaleString('en-GB');
    const what=[reconcile.oldMarks>0?f(reconcile.oldMarks)+' stitches':null,reconcile.oldHalf>0?f(reconcile.oldHalf)+' half stitches':null].filter(Boolean).join(' and ');
    const O=window.Overlay;
    const body=<>
        <h3 id="reconcile-title" style={{marginTop:0,fontSize:20,color:'var(--text-primary)'}}>This pattern changed since you last stitched it</h3>
        <div id="reconcile-body" style={{fontSize:'var(--text-lg)',color:'var(--text-secondary)',marginBottom:'var(--s-4)'}}>
          <p style={{marginTop:0}}>It has a different number of stitches now ({sW}&times;{sH}), so the {what} you marked no longer line up with it.</p>
          {cands.length>0
            ?<p>You can keep your progress where cells still match. This assumes the change was at the bottom or right edge; if it was at the top or left, marks would land on the wrong stitches, so choose Start progress again.{cands.length>1?' Your marks fit two sizes, so choose which one the pattern had.':''}</p>
            :<p>We cannot tell how the pattern was resized, so the marks cannot be carried across.</p>}
          <p style={{marginBottom:0}}>If you keep your progress or start again, your earlier full-stitch marks are saved as a snapshot in Stats &gt; Compare. If you leave it as it is, nothing is changed and nothing is saved. Nothing changes until you choose.</p>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:'var(--s-2)'}}>
          {cands.map((c,i)=><button key={i} className={'resume-recap-btn'+(i===0?' resume-recap-btn--primary':'')} autoFocus={i===0} onClick={()=>resolveReconcile('keep:'+i)}>
            {cands.length>1?(c.kind==='rows'?'Rows changed (it was ':'Columns changed (it was ')+c.oldW+'\u00D7'+c.oldH+'): keep '+f(c.kept)+' stitches':'Keep progress where cells match ('+f(c.kept)+' stitches'+(c.lost>0?', '+f(c.lost)+' lost':'')+')'}
          </button>)}
          <button className="resume-recap-btn" autoFocus={cands.length===0} onClick={()=>resolveReconcile('again')}>Start progress again</button>
          <button className="resume-recap-btn" onClick={()=>resolveReconcile('home')}>Leave it as it is and go back</button>
        </div>
    </>;
    // The shared overlay traps focus, locks background scrolling and joins the Escape stack; with no
    // onClose and no scrim dismissal, the question can only be answered with one of its buttons.
    return O
      ?<O variant="dialog" maxWidth={480} labelledBy="reconcile-title" describedBy="reconcile-body" dismissOnScrim={false} className="reconcile-modal" panelProps={{role:'alertdialog','data-reconcile':'1'}}><div style={{padding:'var(--s-4)'}}>{body}</div></O>
      :<div className="modal-overlay reconcile-overlay" role="alertdialog" aria-modal="true" aria-labelledby="reconcile-title" aria-describedby="reconcile-body"><div className="modal-content reconcile-modal" style={{maxWidth:480}}>{body}</div></div>;
  })()}
  {!statsView&&resumeRecap&&(()=>{
    // A3: resume recap — a banner (not a dialog, so the chart stays usable) once per project load when prior sessions exist.
    const r=resumeRecap;
    const sm=r.summary||{};
    const dismiss=()=>setResumeRecap(null);
    let lastStr='';
    if(r.lastDate){
      try{
        const d=new Date(r.lastDate);
        if(!Number.isNaN(d.getTime())){
          const days=Math.floor((Date.now()-d.getTime())/86400000);
          if(days<=0)lastStr='Last stitched today';
          else if(days===1)lastStr='Last stitched yesterday';
          else if(days<7)lastStr='Last stitched '+days+' days ago';
          else lastStr='Last stitched '+d.toLocaleDateString('en-GB');
        }
      }catch(_){}
    }
    const pct=ProgressUnits.percent(r.doneSt,r.totalSt);
    const minutes=Math.max(0,Math.round((sm.ms||0)/60000));
    let speedNote=null;
    if(sm.perHour!=null&&sm.perHourAvg!=null){
      const diff=sm.perHour-sm.perHourAvg;
      if(diff>=5)speedNote=(sm.perHour-sm.perHourAvg)+' / hr faster than your average';
      else if(diff<=-5)speedNote=Math.abs(diff)+' / hr slower than your average';
    }
    const hrs=sm.perHour!=null?(' · '+sm.perHour+' / hr'):'';
    return <div className="resume-recap-banner" role="status" aria-live="polite">
      <div className="resume-recap-banner-text">
        <strong>Welcome back to {r.projectName}</strong>
        <span>{lastStr?lastStr+'. ':''}{pct}% done; last session {(sm.count||0).toLocaleString('en-GB')} stitches in {minutes} m{hrs}{speedNote?' ('+speedNote+')':''}.</span>
      </div>
      <button className="resume-recap-banner-btn" onClick={()=>{dismiss();openProjectStats();}}>Stats</button>
      <button className="resume-recap-banner-btn" onClick={()=>{dismiss();if(typeof onGoHome==='function')onGoHome();else window.location.href='home.html';}}>Switch project</button>
      <button className="resume-recap-banner-close tracker-dismiss-btn" onClick={dismiss} aria-label="Dismiss">{Icons.x()}</button>
    </div>;
  })()}
  {modal==="about"&&<SharedModals.About onClose={()=>setModal(null)} />}
  {modal==="pdf_export"&&<PdfExportModal onClose={()=>setModal(null)} onExport={()=>{
    if(window.ExportPdf)window.ExportPdf.run({pat,pal,sW,sH,bsLines,partialStitches,specialtyStitches,knots,fabricCt,skeinPrice,projectName,projectDesigner});
  }}/>}

  {modal==="shortcuts"&&<SharedModals.Help defaultTab="shortcuts" onClose={()=>setModal(null)} />}


  {modal==="deduct_prompt"&&<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="deduct-prompt-title" onClick={()=>{setModal(null);setStashDeducted(true);}}>
    <div className="modal-content" style={{maxWidth:460}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>{setModal(null);setStashDeducted(true);}} aria-label="Close">{Icons.x?Icons.x():null}</button>
      <h3 id="deduct-prompt-title" style={{marginTop:0,fontSize:20,color:"var(--text-primary)"}}>Project Complete!</h3>
      <p style={{fontSize:'var(--text-lg)',color:"var(--text-secondary)",marginBottom:'var(--s-4)'}}>Deduct the thread used from your global stash?</p>
      <div style={{display:"flex",flexDirection:"column",gap:'var(--s-2)'}}>
        <button onClick={()=>{
          (async()=>{
            const stash=await StashBridge.getGlobalStash();
            for(const d of skeinData){
              // Stash is keyed by composite keys ("dmc:310"); d.id is a bare id ("310").
              const gs=stashEntryFor(stash,d)||{owned:0};
              const newOwned=Math.max(0,gs.owned-d.skeins);
              await StashBridge.updateThreadOwned(d.key,newOwned);
            }
            setGlobalStash(await StashBridge.getGlobalStash());
            if(typeof ProjectStorage!=='undefined'&&ProjectStorage.markProjectFinished&&projectIdRef.current){
              await ProjectStorage.markProjectFinished(projectIdRef.current);
              v3FieldsRef.current=Object.assign(v3FieldsRef.current||{},{finishStatus:'completed',completedAt:new Date().toISOString()});
            }
          })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
        }} style={{padding:"10px 20px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontWeight:600}}>Deduct Full Skeins</button>
        <button onClick={()=>{
          (async()=>{
            const stash=await StashBridge.getGlobalStash();
            for(const d of skeinData){
              // Stash is keyed by composite keys ("dmc:310"); d.id is a bare id ("310").
              const gs=stashEntryFor(stash,d)||{owned:0};
              const deduct=Math.max(0,d.skeins-1);
              const newOwned=Math.max(0,gs.owned-deduct);
              await StashBridge.updateThreadOwned(d.key,newOwned);
            }
            setGlobalStash(await StashBridge.getGlobalStash());
            if(typeof ProjectStorage!=='undefined'&&ProjectStorage.markProjectFinished&&projectIdRef.current){
              await ProjectStorage.markProjectFinished(projectIdRef.current);
              v3FieldsRef.current=Object.assign(v3FieldsRef.current||{},{finishStatus:'completed',completedAt:new Date().toISOString()});
            }
          })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
        }} style={{padding:"10px 20px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"1px solid var(--accent-light)",background:"var(--surface-secondary)",color:"var(--accent-text)",cursor:"pointer",fontWeight:600}}>Deduct Partial (keep 1 per colour)</button>
        <button onClick={()=>{
          (async()=>{
            if(typeof ProjectStorage!=='undefined'&&ProjectStorage.markProjectFinished&&projectIdRef.current){
              await ProjectStorage.markProjectFinished(projectIdRef.current);
              v3FieldsRef.current=Object.assign(v3FieldsRef.current||{},{finishStatus:'completed',completedAt:new Date().toISOString()});
            }
          })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
        }} style={{padding:"10px 20px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"0.5px solid var(--border)",background:"var(--surface)",color:"var(--text-secondary)",cursor:"pointer",fontWeight:500}}>Skip</button>
      </div>
      <div style={{marginTop:'var(--s-3)',paddingTop:10,borderTop:"1px solid var(--border)",display:"flex",justifyContent:"center"}}>
        <button onClick={()=>{window.location.search='?mode=stats&tab=showcase';}} style={{fontSize:'var(--text-sm)',color:"var(--accent-text)",background:"none",border:"none",cursor:"pointer",fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}>See your updated stats <span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronRight?Icons.chevronRight():null}</span></button>
      </div>
    </div>
  </div>}

  {/* ── RT: mid-project disable modal ──────────────────────────────── */}
  {modal==="rt_disable_confirm"&&<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rt-disable-title" onClick={()=>setModal(null)}>
    <div className="modal-content" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>setModal(null)} aria-label="Close">{Icons.x?Icons.x():null}</button>
      <h3 id="rt-disable-title" style={{marginTop:0,fontSize:18,color:'var(--text-primary)'}}>Stop using up stash thread as you stitch?</h3>
      <p style={{fontSize:'var(--text-sm)',color:'var(--text-secondary)',marginBottom:'var(--s-4)'}}>Keep recorded usage, or correct a tracking mistake. Physical unpicking does not return usable thread. Corrections reverse only recorded event debits; unknown historical usage is not refunded.</p>
      <button onClick={()=>openConsumptionHistory()}>View consumption history</button>
      <div style={{display:'flex',flexDirection:'column',gap:'var(--s-2)'}}>
        <button onClick={()=>{
          const ctx=rtContextRef.current;
          flushRtStashWriteRef.current().then(()=>{if(rtContextRef.current!==ctx)return;setWastePrefs(prev=>({...prev,enabled:false}));setModal(null);}).catch(()=>{});
        }} style={{padding:'10px 20px',fontSize:'var(--text-sm)',borderRadius:'var(--radius-md)',border:'none',background:'var(--accent)',color:'var(--surface)',cursor:'pointer',fontWeight:600}}>
          Keep deductions so far
        </button>
        <button onClick={()=>{
          // Explicit correction only: credit this project's recorded debits,
          // preserving purchases and deductions by other projects.
          const write=rtWriteSnapshotRef.current;
          if(!write||!write.ctx)return;
          const ctx=write.ctx;
          ctx.suspended=true;
          if(rtDebounceRef.current){clearTimeout(rtDebounceRef.current);rtDebounceRef.current=null;}
          (async()=>{
            if(ctx.ready)await ctx.ready.catch(()=>{});
            await flushRtStashWriteRef.current();
            const A=window.ThreadAccounting,units=new Set([...Object.keys(ctx.initialMarks),...Object.values(ctx.accounting.events).filter(e=>e.projectId===ctx.projectId).map(e=>e.unit)]);
            const ops=[];units.forEach(unit=>{const st=A.state(ctx.accounting,ctx.projectId,unit);if(Object.values(st.debits).some(v=>v>0)){
              const seq=st.seq+1;ctx.sequences[unit]=seq;ops.push({projectId:ctx.projectId,unit,seq,kind:'correct-project',estimate:st.estimate});}});
            const result=await StashBridge.applyConsumptionEvents(ctx.projectId,ctx.initialMarks,ops);
            if(rtContextRef.current!==ctx)return;
            ctx.accounting=result.accounting;
            setGlobalStash(result.threads);
            setWastePrefs(prev=>({...prev,enabled:false}));
            setModal(null);
          })().catch(e=>{ctx.suspended=false;console.warn('RT correction failed:',e);if(window.Toast)window.Toast.show({message:'Could not reverse deductions. Please try again.',type:'warning'});});
        }} style={{padding:'10px 20px',fontSize:'var(--text-sm)',borderRadius:'var(--radius-md)',border:'1px solid var(--border)',background:'var(--surface-secondary)',color:'var(--text-primary)',cursor:'pointer',fontWeight:500}}>
          Correct deductions recorded for this project
        </button>
        <button onClick={()=>setModal(null)} style={{padding:'8px 20px',fontSize:'var(--text-sm)',borderRadius:'var(--radius-md)',border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text-secondary)',cursor:'pointer'}}>
          Cancel (keep tracking)
        </button>
      </div>
    </div>
  </div>}

  {modal==="rt_history"&&<div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Thread consumption history" onClick={()=>setModal(null)}>
    <div className="modal" onClick={e=>e.stopPropagation()} style={{maxHeight:'80vh',overflowY:'auto'}}>
      <button className="modal-close" onClick={()=>setModal(null)} aria-label="Close">{Icons.x?Icons.x():null}</button>
      <h3>Thread consumption history</h3>
      <p>Consumed quantities are estimates in skeins, separate from owned stock. Existing balances were preserved when event accounting began; earlier usage is unknown.</p>
      {rtContextRef.current&&rtContextRef.current.accounting&&Object.values(rtContextRef.current.accounting.events).filter(e=>e.projectId===rtContextRef.current.projectId).sort((a,b)=>b.date.localeCompare(a.date)).map(e=><p key={e.id}>
        <strong>{new Date(e.date).toLocaleString('en-GB')}</strong>: {e.description} ({e.unit}).
        {e.estimate&&Object.entries(e.estimate.amounts).map(([k,v])=><span key={k}> {k}: {v.toFixed(6)} skeins estimated; {(e.debit[k]||0).toFixed(6)} debited; {(e.credit[k]||0).toFixed(6)} credited.</span>)}
        {e.estimate&&<small> {e.estimate.assumptions.fabricCount} count, {e.estimate.assumptions.strands} strands, waste ×{e.estimate.assumptions.wasteMultiplier}, tails {e.estimate.assumptions.tailAllowanceIn} in, {e.estimate.assumptions.stitchesPerRun} stitches/run.</small>}
      </p>)}
    </div>
  </div>}

  {/* ── RT: completion reconciliation modal ────────────────────────── */}
  {modal==="rt_complete_summary"&&<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rt-complete-title" onClick={()=>{setStashDeducted(true);setModal(null);}}>
    <div className="modal-content" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>{setStashDeducted(true);setModal(null);}} aria-label="Close">{Icons.x?Icons.x():null}</button>
      <h3 id="rt-complete-title" style={{marginTop:0,fontSize:18,color:'var(--text-primary)'}}>Project Complete — Thread Summary</h3>
      <p style={{fontSize:'var(--text-sm)',color:'var(--text-secondary)',marginBottom:'var(--s-3)'}}>Live stash tracking has been updating your stash as you stitched. Here is a summary of what was used.</p>
      <div style={{overflowY:'auto',maxHeight:240,border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:'var(--s-4)'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'var(--text-sm)'}}>
          <thead><tr style={{background:'var(--surface-secondary)'}}>
            <th style={{padding:'6px 10px',textAlign:'left',color:'var(--text-secondary)',fontWeight:600}}>Thread</th>
            <th style={{padding:'6px 10px',textAlign:'right',color:'var(--text-secondary)',fontWeight:600}}>Used</th>
            <th style={{padding:'6px 10px',textAlign:'right',color:'var(--text-secondary)',fontWeight:600}}>Remaining</th>
          </tr></thead>
          <tbody>
            {(skeinData||[]).map(function(d){
              const c=rtConsumption&&rtConsumption[d.key];
              if(!c)return null;
              const remText=c.skeinsRemaining!=null
                ?(c.skeinsRemaining<0?React.createElement('span',{style:{color:'var(--danger)'}},c.skeinsRemaining.toFixed(2)):c.skeinsRemaining.toFixed(2))
                :'—';
              return React.createElement('tr',{key:d.id,style:{borderTop:'1px solid var(--border)'}},
                React.createElement('td',{style:{padding:'5px 10px',display:'flex',alignItems:'center',gap:6}},
                  React.createElement('span',{style:{width:10,height:10,borderRadius:'50%',background:'rgb('+(d.rgb||[128,128,128]).join(',')+')',display:'inline-block',flexShrink:0}}),
                  formatThread(d)
                ),
                React.createElement('td',{style:{padding:'5px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}},c.skeinsConsumed.toFixed(2)),
                React.createElement('td',{style:{padding:'5px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}},remText)
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={()=>{
        const finishingCtx=rtContextRef.current;
        const finishingId=projectIdRef.current;
        (async()=>{
          // Flush any remaining RT write before closing.
          if(rtDebounceRef.current){clearTimeout(rtDebounceRef.current);rtDebounceRef.current=null;}
          await flushRtStashWriteRef.current();
          if(rtContextRef.current!==finishingCtx)return false;
          if(typeof ProjectStorage!=='undefined'&&ProjectStorage.markProjectFinished&&finishingId){
            await ProjectStorage.markProjectFinished(finishingId);
            if(rtContextRef.current!==finishingCtx)return false;
            v3FieldsRef.current=Object.assign(v3FieldsRef.current||{},{finishStatus:'completed',completedAt:new Date().toISOString()});
          }
          // Keep accounting after completion so reopening remains idempotent.
          return true;
        })().then(ok=>{if(ok){setStashDeducted(true);setModal(null);}}).catch(e=>console.warn('Completion stash write failed:',e));
      }} style={{width:'100%',padding:'10px 20px',fontSize:'var(--text-sm)',borderRadius:'var(--radius-md)',border:'none',background:'var(--accent)',color:'var(--surface)',cursor:'pointer',fontWeight:600}}>
        Confirm and finish
      </button>
    </div>
  </div>}

  {cellEditPopover && isEditMode && (()=>{
    const cell = pat[cellEditPopover.idx];
    const currentEntry = cell && cell.id !== "__empty__" ? cmap[cell.id] : null;
    const isEmpty = !cell || cell.id === "__empty__";
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cell-edit-title" onClick={()=>setCellEditPopover(null)}>
        <div className="modal-content" style={{maxWidth:440,display:"flex",flexDirection:"column",maxHeight:"80vh"}} onClick={e=>e.stopPropagation()}>
          <button className="modal-close" onClick={()=>setCellEditPopover(null)} aria-label="Close">{Icons.x?Icons.x():null}</button>
          <h3 id="cell-edit-title" style={{marginTop:0,marginBottom:'var(--s-1)',fontSize:18,color:"var(--text-primary)"}}>Edit Stitch</h3>
          <div style={{fontSize:'var(--text-sm)',color:"var(--text-tertiary)",marginBottom:'var(--s-3)'}}>Row {cellEditPopover.row}, Col {cellEditPopover.col}</div>

          {isEmpty ? (
            <div style={{padding:"10px 12px",background:"var(--surface-tertiary)",borderRadius:'var(--radius-md)',marginBottom:'var(--s-3)',fontSize:'var(--text-md)',color:"var(--text-secondary)",fontStyle:"italic"}}>
              Empty — no stitch. Select a symbol below to assign one.
            </div>
          ) : currentEntry ? (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--accent-light)",borderRadius:'var(--radius-md)',marginBottom:'var(--s-3)',border:"1px solid var(--accent-border)"}}>
              <span style={{width:22,height:22,borderRadius:4,background:`rgb(${currentEntry.rgb[0]},${currentEntry.rgb[1]},${currentEntry.rgb[2]})`,border:"1px solid var(--border)",flexShrink:0}}/>
              <span style={{fontFamily:"var(--font-symbol)",fontWeight:700,fontSize:'var(--text-xl)'}}>{currentEntry.symbol}</span>
              <span style={{fontWeight:600,fontSize:'var(--text-md)',flex:1,minWidth:0,overflowWrap:"anywhere"}}>{formatThread(currentEntry)}</span>
              <span style={{fontSize:'var(--text-xs)',color:"var(--accent-text)",fontWeight:600}}>Current</span>
            </div>
          ) : null}

          <div style={{fontSize:'var(--text-sm)',fontWeight:600,color:"var(--text-secondary)",marginBottom:6}}>Assign symbol:</div>
          <div style={{flex:1,overflowY:"auto",border:"1px solid var(--border)",borderRadius:'var(--radius-md)',marginBottom:'var(--s-3)'}}>
            {pal.map(p=>{
              const isCurrent = !isEmpty && p.id === cell.id;
              return (
                <div key={p.id} onClick={()=>{ if(!isCurrent) handleSingleStitchEdit(cellEditPopover.idx,p.id); }}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderBottom:"1px solid var(--surface-tertiary)",
                    background:isCurrent?"var(--accent-light)":"var(--surface)",cursor:isCurrent?"default":"pointer",
                    opacity:isCurrent?0.6:1}}>
                  <span style={{width:20,height:20,borderRadius:4,background:`rgb(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]})`,border:"1px solid var(--border)",flexShrink:0}}/>
                  <span style={{fontFamily:"var(--font-symbol)",fontWeight:700,fontSize:'var(--text-lg)',width:18,textAlign:"center"}}>{p.symbol}</span>
                  <span style={{fontWeight:600,fontSize:'var(--text-md)',flex:1,minWidth:0,overflowWrap:"anywhere"}}>{formatThread(p)}</span>
                  <span style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>{p.count} st</span>
                  {isCurrent&&<span style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--accent-text)",background:"var(--accent-light)",padding:"2px 8px",borderRadius:'var(--radius-lg)'}}>Current</span>}
                </div>
              );
            })}
          </div>

          {!isEmpty && (
            <button onClick={()=>{
              const rmIdx=cellEditPopover.idx;
              askConfirm({title:"Remove this stitch?",message:`Remove stitch at Row ${cellEditPopover.row}, Col ${cellEditPopover.col}? It will be marked as empty.`,confirmLabel:"Remove stitch",danger:true}).then(ok=>{if(ok)handleStitchRemoval(rmIdx);});
            }} style={{padding:"9px 16px",borderRadius:'var(--radius-md)',border:"1px solid var(--danger-soft)",background:"var(--danger-soft)",color:"var(--danger)",cursor:"pointer",fontWeight:600,fontSize:'var(--text-md)',textAlign:"left"}}>
              Remove Stitch
            </button>
          )}
        </div>
      </div>
    );
  })()}

  {editModalColor && <SharedModals.ThreadSelector
    onClose={() => setEditModalColor(null)}
    currentSymbol={editModalColor.symbol}
    currentThreadId={editModalColor.id}
    usedThreads={pal.map(p => p.id)}
    onSelect={(newThread) => {
      handleSymbolReassignment(editModalColor.id, newThread);
      setEditModalColor(null);
    }}
    onSwap={(conflictingThread) => {
      // conflictingThread = the palette entry currently holding the desired thread
      handleSymbolSwap(editModalColor, conflictingThread);
      setEditModalColor(null);
    }}
    pal={pal}
  />}

  {showExitEditModal && (
    <div role="dialog" aria-modal="true" aria-labelledby="exit-edit-title" style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}}>
      <div style={{background:"var(--surface)",padding:24,borderRadius:'var(--radius-xl)',width:350,maxWidth:"90%",boxShadow:"0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)"}}>
        <h3 id="exit-edit-title" style={{margin:"0 0 12px 0",fontSize:18,color:"var(--text-primary)"}}>Apply changes?</h3>
        <p style={{fontSize:'var(--text-lg)',color:"var(--text-secondary)",margin:"0 0 24px 0",lineHeight:1.5}}>You have made changes to the symbol assignments. Do you want to apply them?</p>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:'var(--s-2)'}}>
          <button onClick={()=>{
            // Cancel
            setShowExitEditModal(false);
          }} style={{padding:"8px 12px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"0.5px solid var(--border)",background:"var(--surface)",cursor:"pointer",fontWeight:500,color:"var(--text-secondary)"}}>Cancel</button>

          <div style={{display:"flex",gap:'var(--s-2)'}}>
            <button onClick={()=>{
              // Discard — restore the full state from when Edit Mode was entered
              if (sessionStartSnapshot) {
                const { pat:startPat, pal:startPal, threadOwned:startOwned, singleStitchEdits:startEdits } = sessionStartSnapshot;
                const newCmap = {}; startPal.forEach(p => { newCmap[p.id] = p; });
                setPat([...startPat]);
                setPal(startPal);
                setCmap(newCmap);
                setThreadOwned(startOwned);
                setSingleStitchEdits(startEdits);
              }
              setUndoSnapshot(null);
              setSessionStartSnapshot(null);
              setIsEditMode(false);
              setShowExitEditModal(false);
            }} style={{padding:"8px 12px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"none",background:"var(--danger-soft)",color:"var(--danger)",cursor:"pointer",fontWeight:500}}>Discard</button>

            <button onClick={()=>{
              // Apply — commit edits; clear undo snapshot (edits are now permanent)
              setUndoSnapshot(null);
              setSessionStartSnapshot(null);
              setIsEditMode(false);
              setShowExitEditModal(false);
            }} style={{padding:"8px 12px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontWeight:500}}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  )}

  {/* Half stitch disambiguation popup */}
  {window.CreatorLoupe&&React.createElement(window.CreatorLoupe,null)}
  {halfDisambig&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:10001}} onClick={()=>setHalfDisambig(null)}>
    <div className="hs-scale-in" style={{
      position:"fixed",left:halfDisambig.x-50,top:halfDisambig.y-60,
      background:"var(--surface)",borderRadius:'var(--radius-md)',boxShadow:"0 4px 16px rgba(0,0,0,0.2)",padding:"6px 8px",
      display:"flex",flexDirection:"column",gap:'var(--s-1)',border:"1px solid var(--border)",minWidth:100
    }} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>_markHalfDoneFromDisambig(halfDisambig.idx,"fwd")} style={{
        display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:'var(--radius-sm)',border:"none",
        background:"var(--surface-secondary)",cursor:"pointer",fontSize:'var(--text-sm)',fontWeight:500,color:"var(--accent-text)"
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="0,0 0,14 14,14" fill="var(--accent-light)"/></svg>
        Mark /
      </button>
      <button onClick={()=>_markHalfDoneFromDisambig(halfDisambig.idx,"bck")} style={{
        display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:'var(--radius-sm)',border:"none",
        background:"var(--surface-secondary)",cursor:"pointer",fontSize:'var(--text-sm)',fontWeight:500,color:"var(--accent-text)"
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="0,0 14,0 0,14" fill="var(--accent-light)"/></svg>
        Mark \
      </button>
    </div>
  </div>}

{celebration&&motivation.show&&<MilestoneCelebration milestone={celebration} onDismiss={()=>setCelebration(null)}/>}
{/* Touch-1 H-2: Focus mini-bar. Renders only when focus mode is on.
    The Exit button never fades — it's the user's only way out. */}
{focusMode&&<div className="cs-focus-progress" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct}>
  <span className="cs-focus-progress__fill" style={{width:Math.min(100,Math.max(0,progressPct))+"%"}}/>
  <span className="cs-focus-progress__text">{progressPct>=100?"Complete":progressPct.toFixed(1)+"%"+(effectiveCombinedTotal>0?" \u00b7 "+ProgressUnits.formatUnits(progShown.remainingUnits)+" to go":"")}</span>
</div>}
{/* The strip is hidden in focus mode, so a hidden layer is signposted by a pill above the bar (the bar itself has no room on a phone). */}
{focusMode&&window.TrackerHiddenLayersChip&&React.createElement(window.TrackerHiddenLayersChip,{layerVis,counts:layerCounts,onShow:showHiddenLayers,className:"tracker-layers-chip--float"})}
{focusMode&&<div
  ref={focusBarRef}
  className={"cs-focus-bar"+(focusBarFaded?" cs-focus-bar--faded":"")}
  onPointerMove={resetFocusFade}
  onPointerDown={resetFocusFade}
  role="toolbar"
  aria-label="Focus mode toolbar"
>
  {(()=>{
    const selEntry=selectedColorId&&pal?pal.find(p=>p.id===selectedColorId):null;
    if(!selEntry||!selEntry.rgb)return null;
    return <span className="cs-focus-swatch" style={{background:"rgb("+selEntry.rgb.join(",")+")"}} title={formatThread(selEntry,{variant:"title"})}/>;
  })()}
  <button type="button" onClick={()=>{if(typeof undoTrack==='function')undoTrack();}} aria-label="Undo" title="Undo">{Icons.undo&&Icons.undo()}</button>
  <button type="button" onClick={()=>setStitchZoom(z=>Math.max(MIN_STITCH_ZOOM,+(z-0.25).toFixed(2)))} aria-label="Zoom out" title="Zoom out">{Icons.minus&&Icons.minus()}</button>
  <button type="button" onClick={()=>setStitchZoom(1)} aria-label="Reset zoom" title="Reset zoom">{Math.round((stitchZoom||1)*100)}%</button>
  <button type="button" onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} aria-label="Zoom in" title="Zoom in">{Icons.plus&&Icons.plus()}</button>
  <button type="button" className="cs-focus-exit" onClick={()=>setFocusMode(false)} aria-label="Exit focus mode" title="Exit focus mode (Esc)">
    {Icons.x&&Icons.x()}<span style={{marginLeft:6}}>Exit focus</span><kbd style={{marginLeft:8,padding:"1px 6px",fontSize:11,fontWeight:600,background:"var(--surface-alt,var(--surface))",border:"1px solid var(--line)",borderRadius:4,fontFamily:"inherit",color:"var(--text-secondary)"}}>Esc</kbd>
  </button>
</div>}
{touchLocked&&<TouchLockPill onUnlock={()=>setTouchLocked(false)}/>}
{/* color-3 (C2): swatch detail popover (portalled to body) */}
{paletteDetail&&window.SwatchDetailPopover&&React.createElement(window.SwatchDetailPopover,{thread:paletteDetail,anchorRect:paletteDetail.anchorRect,onClose:()=>setPaletteDetail(null)})}
</div>
</>);
}
window.TrackerApp=TrackerApp;
if(!window.__UNIFIED__)ReactDOM.createRoot(document.getElementById("root")).render(<TrackerApp/>);
if (typeof SyncEngine !== 'undefined') SyncEngine.registerBeforeUnloadSnapshot();
