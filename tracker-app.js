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
        <p style={{margin:"0 0 var(--s-4)",fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>A printable, Pattern Keeper-compatible chart. These settings are shared with the Export tab in the Pattern Creator, which has the full set.</p>
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
function SessionConfigModal({onStart,onClose,liveAutoElapsed,liveAutoStitches}){
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
            const pct=total>0?Math.round(done/total*100):0;
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
                    {isActive&&<span style={{marginLeft:'var(--s-2)',fontSize:10,fontWeight:700,color:"var(--accent)",background:"var(--accent-light)",padding:"1px 6px",borderRadius:'var(--radius-md)',verticalAlign:"middle"}}>ACTIVE</span>}
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

// ─── Event-log timing engine ─────────────────────────────────────────────────
// computeActiveMs: pure function — active stitching duration from an event log.
// Events each carry {kind, t} (t = Unix ms). Recognised kinds:
//   start, stitch, hidden, visible, manualPause, manualResume
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
const { wakeLockActive, toggleWakeLock } = window.useWakeLock();
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
const[welcomeOpen,setWelcomeOpen]=useState(()=>{try{return !!(window.WelcomeWizard&&window.WelcomeWizard.shouldShow('tracker'));}catch(_){return false;}});
// Global "?" shortcut → open Help Centre.
useEffect(()=>{const h=()=>setModal("help");window.addEventListener("cs:openHelp",h);return()=>window.removeEventListener("cs:openHelp",h);},[]);
// Command Palette → Shortcuts modal.
useEffect(()=>{const h=()=>setModal("shortcuts");window.addEventListener("cs:openShortcuts",h);return()=>window.removeEventListener("cs:openShortcuts",h);},[]);
// "Show welcome tour again" from HelpCentre → re-open the wizard.
useEffect(()=>{const h=(e)=>{if(!e||!e.detail||e.detail.page==='tracker')setWelcomeOpen(true);};window.addEventListener("cs:showWelcome",h);return()=>window.removeEventListener("cs:showWelcome",h);},[]);
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
      action:()=>setWelcomeOpen(true) }
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

const[done,setDone]=useState(null);
// ── BUGFIX: live ref to latest `done` so toggle/bulk callbacks always
//    read the freshest array even when invoked before React commits a
//    prior setDone. Prevents the "marking a new stitch unmarks all
//    previous in-session stitches" regression caused by stale closures
//    in fast-tap sequences (incremental counters survive because they
//    use refs; the visible `done` array did not).
const doneRef=useRef(null);
doneRef.current=done;
const[doneSnapshots,setDoneSnapshots]=useState([]);
const lastSnapshotDateRef=useRef(null);
const[trackHistory,setTrackHistory]=useState([]);
const[redoStack,setRedoStack]=useState([]);
const TRACK_HISTORY_MAX=50;

const[statsView,setStatsView]=useState(false);
const[statsTab,setStatsTab]=useState('all');
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
const[sessionTimeChoice,setSessionTimeChoice]=useState(null);
const[sessionGoalInput,setSessionGoalInput]=useState("");
const[sessionSummaryData,setSessionSummaryData]=useState(null);
// A3 (UX Phase 5) — Resume recap modal shown once per project load when the
// project already has stitching sessions. Cleared via Continue/Stats/Switch/Close.
const[resumeRecap,setResumeRecap]=useState(null);
const resumeRecapShownRef=useRef(new Set());
const dragStateRef=useRef({isDragging:false, dragVal:1});
const dragChangesRef=useRef([]);
const scrollRafRef=useRef(null);
// Canvas-space region currently painted on the chart, plus the cell size it
// was painted at. Set by renderStitch, read by renderStitchIfScrolledOut to
// skip repaints while the viewport is still inside it.
const paintedRectRef=useRef(null);
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
const[halfDone,setHalfDone]=useState(new Map());
const[partialStitches,setPartialStitches]=useState(new Map());
const[halfDisambig,setHalfDisambig]=useState(null); // {x, y, idx} for popup

const hoverRefs = useRef({ row: null, col: null });
// Hover read-out under the chart (F4, reports/track-view-performance-plan.md).
// The hovered cell and its thread live in refs and the bar's text is written
// directly, like the crosshair above it. As React state, every stitch the
// pointer crossed re-rendered all of TrackerApp — ~1 200 elements per cell.
const hoverCellRef = useRef(null);   // {row, col}, 0-based, or null
const hoverInfoRef = useRef(null);   // {row, col, id, name}, 1-based, or null
const hoverBarRef = useRef(null);
function renderHoverBar(){
  const el=hoverBarRef.current;
  if(!el)return;
  const c=hoverCellRef.current, info=hoverInfoRef.current;
  let text="—";
  if(c){
    text="Row: "+(c.row+1)+"   Col: "+(c.col+1);
    if(info&&info.row===c.row+1&&info.col===c.col+1)text+="  —   DMC "+info.id+" "+info.name;
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
// "DMC 310 Black" for a stitch, or "" for an empty / skipped cell.
function cellThreadLabel(idx){
  const cell=pat&&pat[idx];
  if(!cell||cell.id==="__skip__"||cell.id==="__empty__")return "";
  if(cell.type==="blend"&&cell.threads)return "DMC "+cell.id+" "+cell.threads[0].name+"+"+cell.threads[1].name;
  const ci=cmap&&cmap[cell.id];
  return "DMC "+cell.id+(ci&&ci.name?" "+ci.name:"");
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
  const fit=Math.min((el.clientWidth-G-8)/(w*20),(el.clientHeight-G-8)/(h*20));
  setStitchZoom(+Math.max(0.05,Math.min(maxZoom,fit)).toFixed(3));
  el.scrollLeft=0;el.scrollTop=0;
  requestAnimationFrame(()=>{const e2=stitchScrollRef.current;if(e2){e2.scrollLeft=0;e2.scrollTop=0;}});
}
// "Fit" fits the work area while one is active, the whole pattern otherwise.
function fitChart(){if(areaOn)fitWorkAreaView();else fitSZ();}
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
  const onKeyDown=e=>{if(e.key==="Shift")setIsShiftDown(true);};
  const onKeyUp=e=>{
    if(e.key==="Shift"){
      setIsShiftDown(false);
      if(dragMarkNotifyShiftUpRef.current)dragMarkNotifyShiftUpRef.current();
    }
  };
  const onBlur=()=>{
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
// hit the canvas. Only a contextmenu right after one parks: the menu can
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
const RT_WASTE_DEFAULTS={enabled:false,tailAllowanceIn:1.5,threadRunLength:30,generalWasteMultiplier:1.10,strandCountOverride:null,lastWrittenAt:null};
const[wastePrefs,setWastePrefs]=useState(()=>{
  try{const p=window.UserPrefs&&window.UserPrefs.get('rtWastePrefs');if(p&&typeof p==='object')return Object.assign({},RT_WASTE_DEFAULTS,p);}catch(_){}
  return Object.assign({},RT_WASTE_DEFAULTS);
});
// Snapshot of global stash taken at project-load (or when RT is first enabled).
// Used so the "skeins remaining" display reflects the stash BEFORE this project
// consumed any thread, not the live (already-decremented) stash.
const rtStashSnapshotRef=useRef({});
// Debounce timer for writing consumption to stash.
const rtDebounceRef=useRef(null);
// Ref to latest rtConsumption so beforeunload handler can flush without stale closures.
const rtConsumptionRef=useRef({});
// Tracks which thread ids have already triggered a low-thread toast this session.
const rtLowToastedRef=useRef(new Set());
// Expose the snapshot setters on window for the "Live tracking (RT)" toggle in
// the palette More panel, which renders in a different component scope.
// __setRtStashSnapshot replaces the snapshot unconditionally (used by project-load).
// __ensureRtStashSnapshot sets the snapshot ONLY IF the current ref is empty — used by
// the Live toggle so re-enabling Live within the same project session doesn't move the
// baseline forward and silently lose the ability to restore earlier deductions (DEFECT-001).
useEffect(function(){
  window.__setRtStashSnapshot=function(snap){rtStashSnapshotRef.current=snap||{};};
  window.__ensureRtStashSnapshot=function(snap){
    var cur=rtStashSnapshotRef.current||{};
    if(Object.keys(cur).length===0)rtStashSnapshotRef.current=snap||{};
  };
  return function(){delete window.__setRtStashSnapshot;delete window.__ensureRtStashSnapshot;};
},[]);
// Listen for the disable request dispatched by that same Live tracking toggle.
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
    // First run — default by viewport type.
    if(window.TouchConstants&&window.TouchConstants.isCompactTouch())return "hidden";
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
const[focusMode,setFocusMode]=useState(false);
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
useEffect(()=>{
  const onKey=e=>{
    // Ignore when typing in inputs / contenteditable.
    const t=e.target;
    if(t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT"||t.isContentEditable))return;
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.key==="f"||e.key==="F"){
      e.preventDefault();
      setFocusMode(v=>!v);
    }else if(e.key==="Escape"&&focusMode){
      e.preventDefault();
      setFocusMode(false);
    }
  };
  window.addEventListener("keydown",onKey);
  return()=>window.removeEventListener("keydown",onKey);
},[focusMode]);

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
const createdAtRef=useRef(null);    // stable createdAt ISO string for the active project
const lastSnapshotRef=useRef(null); // freshest serialised project for beforeunload
const v3FieldsRef=useRef({});       // preserve v3 stats fields across save round-trips
const autoSaveDirtyRef=useRef(false);
const session=window.useAutoSession({projectIdRef,v3FieldsRef,autoSaveDirtyRef,statsSettings});
const{statsSessions,setStatsSessions,totalTime,liveAutoElapsed,liveAutoStitches,liveAutoIsPaused,currentTimingMode,manuallyPaused,setManuallyPaused,manuallyPausedRef,celebration,setCelebration,celebratedRef,goalCelebrationRef,currentAutoSessionRef,finaliseAutoSessionRef,resetAutoSessionForProjectLoad,pendingColoursRef,pendingMilestonesRef,prevAutoCountRef,justLoadedRef,justLoadedSettlePassRef,autoStatsRef,isUnloadingRef,achievedMilestones,setAchievedMilestones,sessionOnboardingShown,setSessionOnboardingShown,sessionSavedToast,setSessionSavedToast,recordAutoActivity,editSessionNote}=session;
const counts=window.useStitchCounts({pat,done,halfStitches,halfDone});
const{doneCountRef,colourDoneCountsRef,countsVer,recomputeAllCounts,applyDoneCountsDelta}=counts;
const[projectName,setProjectName]=useState("");
const[projectDesigner,setProjectDesigner]=useState("");
const[projectDescription,setProjectDescription]=useState("");
const[namePromptOpen,setNamePromptOpen]=useState(false);
const[editDetailsOpen,setEditDetailsOpen]=useState(false);
// Command Palette → Preferences modal bridge (UX-12 Phase 6 PR #11).
useEffect(()=>{const h=()=>{if(typeof window.PreferencesModal!=='undefined')setPreferencesOpen(true);};window.addEventListener('cs:openPreferences',h);return()=>window.removeEventListener('cs:openPreferences',h);},[]);
// Command Palette → Rename current project bridge (UX-12 Phase 6 PR #11).
useEffect(()=>{const h=()=>setEditDetailsOpen(true);window.addEventListener('cs:openRename',h);return()=>window.removeEventListener('cs:openRename',h);},[]);
const G=28;
const[tOverflowOpen,setTOverflowOpen]=useState(false);
const[tStripCollapsed,setTStripCollapsed]=useState({view:false,stitch:false});
const STITCH_LAYERS=[{id:'full',label:'Full Cross',key:'F'},{id:'half',label:'Half Stitch',key:'H'},{id:'backstitch',label:'Backstitch',key:'B'},{id:'quarter',label:'Quarter',key:null},{id:'petite',label:'Petite',key:null},{id:'french_knot',label:'French Knot',key:'K'},{id:'long_stitch',label:'Long Stitch',key:null}];
const ALL_LAYERS_VISIBLE={full:true,half:true,backstitch:true,quarter:true,petite:true,french_knot:true,long_stitch:true};
const[layerVis,setLayerVis]=useState(ALL_LAYERS_VISIBLE);
const[soloPreState,setSoloPreState]=useState(null);
const[bsThickness,setBsThickness]=useState(()=>{try{return parseInt(localStorage.getItem('cs_bsThickness')||'2');}catch(_){return 2;}});
const[statsCountMode,setStatsCountMode]=useState('visible');
const tStripRef=useRef(null);
const tOverflowRef=useRef(null);
const soloTimerRef=useRef(null);

const doneCount=countsVer>=0?doneCountRef.current:0;
const totalStitchable=useMemo(()=>{if(!pat)return 0;let c=0;for(let i=0;i<pat.length;i++){const id=pat[i].id;if(id!=="__skip__"&&id!=="__empty__")c++;}return c;},[pat]);

// Half-stitch counts
const halfStitchCounts=useMemo(()=>{
  let total=0,dn=0;
  halfStitches.forEach((hs,idx)=>{
    if(hs.fwd)total++;
    if(hs.bck)total++;
  });
  halfDone.forEach((hd)=>{
    if(hd.fwd)dn++;
    if(hd.bck)dn++;
  });
  return{total,done:dn};
},[halfStitches,halfDone]);

// Combined progress: full stitches + half stitches weighted at 0.5
const combinedTotal=totalStitchable+halfStitchCounts.total*0.5;
const combinedDone=doneCount+halfStitchCounts.done*0.5;
// Effective progress respects visible-layer filter
const effectiveCombinedTotal=statsCountMode==='visible'?(layerVis.full?totalStitchable:0)+(layerVis.half?halfStitchCounts.total*0.5:0):combinedTotal;
const effectiveCombinedDone=statsCountMode==='visible'?(layerVis.full?doneCount:0)+(layerVis.half?halfStitchCounts.done*0.5:0):combinedDone;
const progressPct=effectiveCombinedTotal>0?Math.round(effectiveCombinedDone/effectiveCombinedTotal*1000)/10:0;
// Today's stitches for progress bar accent segment
const todayStitchesForBar=useMemo(()=>{if(!statsSessions)return 0;const deh=(statsSettings&&statsSettings.dayEndHour)||0;return getStatsTodayStitches(statsSessions,deh)+liveAutoStitches;},[statsSessions,liveAutoStitches,statsSettings]);
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
const allParkLayersHidden=useMemo(()=>{
  if(totalParkedColours===0)return false;
  for(const id in parkCountsByColour){if(parkLayers[id]!==false)return false;}
  return true;
},[parkCountsByColour,parkLayers,totalParkedColours]);
function toggleParkLayer(cid){setParkLayers(prev=>{const next=Object.assign({},prev);next[cid]=!(next[cid]!==false);if(next[cid])delete next[cid];return next;});}
function setAllParkLayersVisible(visible){
  setParkLayers(prev=>{
    if(visible)return{};
    const next=Object.assign({},prev);
    for(const id in parkCountsByColour)next[id]=false;
    return next;
  });
}
const weekStitchesForChip=useMemo(()=>{if(!statsSessions)return 0;const deh=(statsSettings&&statsSettings.dayEndHour)||0;return getStatsThisWeekStitches(statsSessions,deh)+liveAutoStitches;},[statsSessions,liveAutoStitches,statsSettings]);
const todayBarPct=effectiveCombinedTotal>0?Math.min((todayStitchesForBar/effectiveCombinedTotal)*100,Math.min(progressPct,100)):0;
// Completion projection — derived from InsightsEngine when available.
const completionProjection=useMemo(()=>{
  if(typeof InsightsEngine==='undefined')return null;
  if(!totalStitchable||!Array.isArray(statsSessions)||statsSessions.length===0)return null;
  const results=InsightsEngine.generateProjections([{
    id:projectIdRef.current,name:projectName,
    totalStitches:totalStitchable,completedStitches:doneCount,
    statsSessions:statsSessions
  }]);
  return results&&results[0]?results[0]:null;
},[totalStitchable,doneCount,statsSessions,projectName]);
const prevBarPct=Math.max(0,Math.min(progressPct,100)-todayBarPct);
// Plan B Phase 1: Progress info chip + AppInfoPopover state.
const [progressInfoOpen,setProgressInfoOpen]=useState(false);
const progressChipRef=useRef(null);

const colourDoneCounts=countsVer>=0?colourDoneCountsRef.current:{};
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
const layerCounts=useMemo(()=>({full:totalStitchable,half:halfStitchCounts.total,backstitch:bsLines.length,quarter:0,petite:0,french_knot:0,long_stitch:0}),[totalStitchable,halfStitchCounts.total,bsLines.length]);
// PERF: the palette legend tile list (rendered below) used to be rebuilt and
// re-sorted from `pal` on every single render of this component — including
// re-renders triggered by unrelated state (drag-preview updates, hover, etc.)
// while marking stitches. `colourDoneCountsRef.current` is mutated in place
// (see the T-5 counts invariant), so `countsVer` — not `colourDoneCounts`
// itself — is the correct "did the counts actually change" signal here.
const legendRows=useMemo(()=>{
  if(!pal)return null;
  // In a work area: only the colours it contains, with its counts.
  const src=areaColourCounts||colourDoneCountsRef.current;
  const shown=areaColourCounts?pal.filter(p=>{const c=areaColourCounts[p.id];return c&&(c.total+c.halfTotal)>0;}):pal;
  const rows=shown.map(p=>{
    const dc=src[p.id]||{total:0,done:0,halfTotal:0,halfDone:0};
    const totalWH=dc.total+dc.halfTotal*0.5;
    const doneWH=dc.done+dc.halfDone*0.5;
    const pct=totalWH>0?Math.round(doneWH/totalWH*100):0;
    const remaining=Math.max(0,totalWH-doneWH);
    const complete=doneWH>=totalWH&&totalWH>0;
    return {p,dc,pct,remaining,complete};
  });
  if(legendSort==="done")rows.sort((a,b)=>b.pct-a.pct);
  else if(legendSort==="count")rows.sort((a,b)=>b.remaining-a.remaining);
  else rows.sort((a,b)=>{const ai=String(a.p.id),bi=String(b.p.id);const an=parseInt(ai,10),bn=parseInt(bi,10);if(isFinite(an)&&isFinite(bn)&&String(an)===ai&&String(bn)===bi)return an-bn;return ai.localeCompare(bi);});
  return rows;
},[pal,countsVer,legendSort,areaColourCounts]);
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
const[lowZoomFade,setLowZoomFade]=useState(()=>{try{const v=parseFloat(localStorage.getItem('cs_lowZoomFade')||'0');return Number.isFinite(v)?Math.max(0,Math.min(0.9,v)):0;}catch(_){return 0;}});
useEffect(()=>{try{localStorage.setItem('cs_lowZoomFade',String(lowZoomFade));}catch(_){}},[lowZoomFade]);
// tierRef: current render tier (1–4) with hysteresis; default zoom=1→scs=20→Tier 3
const tierRef=useRef(3);
const tierFadeRef=useRef({symbolOpacity:1.0,bsHsOpacity:1.0,animRafId:null});
const renderStitchRef=useRef(null);
// PERF: set true by single/bulk stitch-toggle paths that already painted their
// changed cells directly (see paintDoneChanges call sites) so the full-viewport
// renderStitch effect can skip a redundant redraw. See the effect below for detail.
const skipNextFullRedrawRef=useRef(false);

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
},[pal,countsVer,highlightSkipDone,onlyStarted,areaColourCounts]);

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
    result.push({label:String(sy*numX+sx+1),sx,sy,x0,y0,x1,y1,total,completed,pct:total>0?Math.round(completed/total*100):100,isDone:total>0&&completed>=total});
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
      const label=nextColor.type==="blend"?(nextColor.threads[0].name+"+"+nextColor.threads[1].name):nextColor.name;
      setAdvanceToast(`DMC ${nextColor.id} — ${label}`);
      setTimeout(()=>setAdvanceToast(null),2500);
      return;
    }
  }
  prevFocusDoneRef.current=isNowComplete;
},[countsVer,focusColour,stitchView,highlightSkipDone,pal,areaColourCounts]);

const estCompletion=useMemo(()=>{let t=totalTime+liveAutoElapsed;if(doneCount<1||t<60)return null;return Math.round((totalStitchable-doneCount)*(t/doneCount));},[totalTime,liveAutoElapsed,doneCount,totalStitchable]);

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
    <div key={x} style={{ width: scs, flexShrink: 0, height: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(9, Math.min(11, scs * 0.6)), fontWeight: is10 ? 'bold' : is5 ? 600 : 400, color: is10 ? 'var(--text-primary)' : is5 ? 'var(--text-secondary)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
      {show ? (x + 1) : ''}
    </div>
  );
}),[sW,scs,rulerStep]);
const rowRuler=useMemo(()=>Array.from({length:sH},(_,y)=>{
  const show=((y+1)%rulerStep===0||y===0), is10=(y+1)%10===0, is5=(y+1)%5===0;
  return (
    <div key={y} style={{ height: scs, flexShrink: 0, width: G, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, fontSize: Math.max(9, Math.min(11, scs * 0.6)), fontWeight: is10 ? 'bold' : is5 ? 600 : 400, color: is10 ? 'var(--text-primary)' : is5 ? 'var(--text-secondary)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
      {show ? (y + 1) : ''}
    </div>
  );
}),[sH,scs,rulerStep]);
const skeinData=useMemo(()=>{
  if(!pal)return[];
  let map={};
  pal.forEach(p=>{
    if(p.type==="solid"){map[p.id]=(map[p.id]||0)+p.count;}
    else if(p.type==="blend"&&p.threads){p.threads.forEach(t=>{map[t.id]=(map[t.id]||0)+p.count;});}
  });
  return Object.entries(map).sort((a,b)=>{let na=parseInt(a[0])||0,nb=parseInt(b[0])||0;if(na&&nb)return na-nb;return a[0].localeCompare(b[0]);}).map(([id,ct])=>{let t=findThreadInCatalog('dmc',id);return{id,name:t?t.name:"",rgb:t?t.rgb:[128,128,128],stitches:ct,skeins:skeinEst(ct,fabricCt)};});
},[pal,fabricCt]);

useEffect(()=>{
  function loadStash(){if(typeof StashBridge!=="undefined"){StashBridge.getGlobalStash().then(setGlobalStash).catch(e=>console.warn('getGlobalStash failed:',e));}}
  loadStash();
  window.addEventListener('cs:stashChanged',loadStash);
  return ()=>{window.removeEventListener('cs:stashChanged',loadStash);};
},[]);

// Detect project completion and offer stash deduction
useEffect(()=>{
  if(progressPct>=100 && !stashDeducted && combinedTotal>0 && typeof StashBridge!=="undefined"){
    setModal(wastePrefs.enabled?"rt_complete_summary":"deduct_prompt");
  }
},[progressPct]);

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

// RT consumption: derived, never stored. Recalculates from done counts + prefs.
// SKEIN_TOTAL_IN: 6 strands × 315 in/strand = 1890 total single-strand inches per skein.
const SKEIN_TOTAL_IN=1890;
const rtConsumption=useMemo(()=>{
  if(!wastePrefs.enabled||!skeinData||!skeinData.length)return{};
  const strands=typeof wastePrefs.strandCountOverride==='number'?wastePrefs.strandCountOverride:2;
  const base=(4.8*strands)/fabricCt;
  const tail=(wastePrefs.tailAllowanceIn*2)/Math.max(1,wastePrefs.threadRunLength);
  const effectiveCostIn=(base+tail)*wastePrefs.generalWasteMultiplier;
  const snap=rtStashSnapshotRef.current||{};
  // Build done-stitch count keyed by bare thread id, aggregating across solids AND blends.
  // colourDoneCounts is keyed by palette-entry id ("310" for solids, "310+550" for blends).
  // For blends, each constituent thread contributes equally, so we accumulate blend done
  // counts onto each thread id the same way skeinData does.
  const threadDone={};
  if(pal){
    pal.forEach(function(p){
      const dc=colourDoneCounts[p.id];
      const dn=dc?dc.done:0;
      if(p.type==='solid'){threadDone[p.id]=(threadDone[p.id]||0)+dn;}
      else if(p.type==='blend'&&p.threads){
        p.threads.forEach(function(t){threadDone[t.id]=(threadDone[t.id]||0)+dn;});
      }
    });
  }
  const out={};
  skeinData.forEach(d=>{
    const dn=threadDone[d.id]||0;
    const skeinsConsumed=dn*effectiveCostIn/SKEIN_TOTAL_IN;
    const snapEntry=(snap['dmc:'+d.id]||snap[d.id])||null;
    const ownedSkeins=snapEntry&&typeof snapEntry.owned==='number'?snapEntry.owned:null;
    const skeinsRemaining=ownedSkeins!=null?ownedSkeins-skeinsConsumed:null;
    out[d.id]={skeinsConsumed,skeinsRemaining,ownedSkeins,effectiveCostIn};
  });
  return out;
  // countsVer in dep array ensures re-run whenever done counts change.
},[wastePrefs,skeinData,fabricCt,countsVer,pal]);
// Keep a stable ref for beforeunload and async flush callbacks.
useEffect(()=>{rtConsumptionRef.current=rtConsumption;},[rtConsumption]);

// ── RT stash write helpers ─────────────────────────────────────────────
// Writes current consumption to the global stash. Idempotent: re-applying
// the same consumption after reload produces the same stash level (since we
// always write ownedAtStart − consumedNow, not a delta).
// We set rtSelfWritingRef around the loop so the cs:stashChanged listener
// below can ignore events triggered by our own writes (DEFECT-009).
const rtSelfWritingRef=useRef(false);
const flushRtStashWrite=useCallback(async()=>{
  if(!wastePrefs.enabled||typeof StashBridge==='undefined')return;
  const consumption=rtConsumptionRef.current;
  const ids=Object.keys(consumption);
  if(!ids.length)return;
  let wrote=false;
  rtSelfWritingRef.current=true;
  try{
    for(const id of ids){
      const c=consumption[id];
      if(!c||c.skeinsConsumed<=0||c.ownedSkeins==null)continue;
      const newOwned=Math.max(0,c.ownedSkeins-c.skeinsConsumed);
      try{await StashBridge.updateThreadOwned(id,newOwned);wrote=true;}
      catch(e){console.warn('RT stash write failed for '+id+':',e);}
    }
  }finally{
    rtSelfWritingRef.current=false;
  }
  if(wrote){
    setWastePrefs(prev=>({...prev,lastWrittenAt:new Date().toISOString()}));
    try{const fresh=await StashBridge.getGlobalStash();setGlobalStash(fresh);}catch(_){}
  }
},[wastePrefs.enabled]);
// Stable ref so the beforeunload handler can call it without stale closure.
const flushRtStashWriteRef=useRef(flushRtStashWrite);
useEffect(()=>{flushRtStashWriteRef.current=flushRtStashWrite;},[flushRtStashWrite]);

// External-change listener (DEFECT-009): when the Manager (or any other
// surface) edits a thread quantity while RT is enabled, re-baseline our
// snapshot so the next debounced flush doesn't overwrite that edit.
// Self-triggered events (from flushRtStashWrite above) are filtered out via
// rtSelfWritingRef, which is set for the duration of the write loop.
// Re-baseline rule: newSnapshot[id] = liveOwned[id] + currentConsumed[id].
// This way the next flush computes newOwned = newSnapshot − newConsumed,
// which preserves any external delta and continues to deduct only this
// session's incremental consumption.
useEffect(()=>{
  function onExternalChange(){
    if(rtSelfWritingRef.current)return;
    if(!wastePrefs.enabled)return;
    if(typeof StashBridge==='undefined')return;
    var snap=rtStashSnapshotRef.current||{};
    if(Object.keys(snap).length===0)return; // no baseline yet
    StashBridge.getGlobalStash().then(function(live){
      if(!live)return;
      var consumption=rtConsumptionRef.current||{};
      var next=Object.assign({},snap);
      // The stash is keyed by composite key (e.g. 'dmc:310'); rtConsumption is
      // keyed by bare thread id (e.g. '310'). Strip the brand prefix to look up.
      Object.keys(live).forEach(function(key){
        var entry=live[key];
        if(!entry||typeof entry.owned!=='number')return;
        var bareId=key.indexOf(':')>=0?key.split(':').slice(1).join(':'):key;
        var c=consumption[bareId];
        var consumed=(c&&typeof c.skeinsConsumed==='number')?c.skeinsConsumed:0;
        next[key]=Object.assign({},entry,{owned:entry.owned+consumed});
      });
      rtStashSnapshotRef.current=next;
    }).catch(function(){});
  }
  window.addEventListener('cs:stashChanged',onExternalChange);
  return function(){window.removeEventListener('cs:stashChanged',onExternalChange);};
},[wastePrefs.enabled]);

// Multi-tab guard (DEFECT-008): two tracker tabs both writing the live stash
// race — each writes `snapshot - consumed` from its own snapshot, so the
// later write overwrites the earlier (net deduction = max, not sum). A full
// fix needs atomic read-modify-write inside StashBridge; here we at least
// warn the user when a second tab joins. Uses BroadcastChannel where
// available (all evergreen browsers); falls back to localStorage storage
// events for Safari <15.4 which lacks BroadcastChannel support.
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
        message:'Live tracking is active in another tab — stash deductions may collide. Disable Live in one tab to avoid lost edits.',
        type:'warning',duration:8000
      });
    }
  }
  function announce(){
    if(useBroadcast){try{chan.postMessage({type:'rt-active',id:myId,t:Date.now()});}catch(_){}}
    else{try{localStorage.setItem(LS_KEY,JSON.stringify({id:myId,t:Date.now()}));}catch(_){}}
  }
  function onMsg(ev){
    var msg=ev&&ev.data;
    if(!msg||msg.id===myId)return;
    if(msg.type==='rt-active'){announce();showWarning();}
  }
  function onStorage(ev){
    if(ev.key!==LS_KEY)return;
    try{var msg=JSON.parse(ev.newValue);if(!msg||msg.id===myId)return;announce();showWarning();}catch(_){}
  }
  if(useBroadcast){
    try{chan=new BroadcastChannel('cs-rt-tracker');}catch(_){useBroadcast=false;}
  }
  if(useBroadcast){chan.addEventListener('message',onMsg);}
  else{window.addEventListener('storage',onStorage);}
  announce();
  var hb=setInterval(announce,30000);
  return function(){
    clearInterval(hb);
    if(useBroadcast&&chan){try{chan.removeEventListener('message',onMsg);chan.close();}catch(_){}}
    else{window.removeEventListener('storage',onStorage);try{localStorage.removeItem(LS_KEY);}catch(_){}}
  };
},[wastePrefs.enabled]);

// Debounced write: reset timer on every stitch mark. Fires 30 s after last activity.
useEffect(()=>{
  if(!wastePrefs.enabled)return;
  if(rtDebounceRef.current)clearTimeout(rtDebounceRef.current);
  rtDebounceRef.current=setTimeout(()=>{rtDebounceRef.current=null;flushRtStashWrite();},30000);
  return()=>{if(rtDebounceRef.current){clearTimeout(rtDebounceRef.current);rtDebounceRef.current=null;}};
},[countsVer,wastePrefs.enabled]);

// Low-thread toast: fires once per thread per session when skeinsRemaining first drops below 0.25.
const prevRtConsumptionRef=useRef({});
useEffect(()=>{
  if(!wastePrefs.enabled||!skeinData)return;
  const LOW=0.25;
  skeinData.forEach(d=>{
    const curr=rtConsumption[d.id];
    const prev=prevRtConsumptionRef.current[d.id];
    if(!curr||curr.skeinsRemaining==null)return;
    const wasOk=!prev||prev.skeinsRemaining==null||prev.skeinsRemaining>=LOW;
    const isLow=curr.skeinsRemaining>=0&&curr.skeinsRemaining<LOW;
    const notAlerted=!rtLowToastedRef.current.has(d.id);
    if(wasOk&&isLow&&notAlerted){
      rtLowToastedRef.current.add(d.id);
      if(typeof window.Toast!=='undefined'&&window.Toast.show){
        window.Toast.show({
          message:'Low thread: DMC '+d.id+(d.name?' \u2014 '+d.name:'')+'. Only '+curr.skeinsRemaining.toFixed(2)+' skeins remaining.',
          type:'warning',duration:10000
        });
      }
    }
    // Reset toast gate if the user adds more thread (skeinsRemaining recovers above LOW+0.25)
    if(curr.skeinsRemaining>=LOW+0.25)rtLowToastedRef.current.delete(d.id);
  });
  prevRtConsumptionRef.current=rtConsumption;
},[rtConsumption,wastePrefs.enabled]);

// Keep autoStatsRef fresh
useEffect(()=>{autoStatsRef.current={doneCount,totalStitchable};},[doneCount,totalStitchable]);
// Auto-detect stitch activity from doneCount & halfDone changes
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
    if(prevDone<0||prevHalf<0){
      prevAutoCountRef.current={done:curDone,halfDone:curHalf};
      return;
    }
    const doneDiff=curDone-prevDone;
    const halfDiff=curHalf-prevHalf;
    if(doneDiff!==0||halfDiff!==0){
      const completed=Math.max(0,doneDiff)+Math.max(0,halfDiff);
      const undone=Math.max(0,-doneDiff)+Math.max(0,-halfDiff);
      if(completed>0||undone>0)recordAutoActivity(completed,undone);
      // Milestone detection
      if(completed>0&&totalStitchable>0){
        const prevTotal=prevDone+prevHalf;
        const newTotal=curDone+curHalf;
        try{
          const hits=checkMilestones(prevTotal,newTotal,totalStitchable);
          if(hits&&hits.length>0){
            const best=hits[hits.length-1];
            const key=best.pct!=null?('pct_'+best.pct):best.label;
            if(!celebratedRef.current.has(key)){
              celebratedRef.current.add(key);
              setCelebration(best);
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
    // Auto-snapshot: on new stitching day, save a snapshot of the current done-state
    if(done){
      try{
        const today=getStitchingDateLocal(new Date());
        if(!lastSnapshotDateRef.current){
          lastSnapshotDateRef.current=today;
        } else if(lastSnapshotDateRef.current!==today){
          const snapshot={
            id:'snap_'+Date.now(),
            date:lastSnapshotDateRef.current,
            label:'auto',
            doneCount:curDone,
            data:(function(b){var C=0x8000,o='';for(var i=0;i<b.length;i+=C)o+=String.fromCharCode.apply(null,b.subarray(i,i+C));return btoa(o);})(pako.deflate(done))
          };
          setDoneSnapshots(prev=>{
            const updated=[...prev,snapshot];
            const labelled=updated.filter(s=>s.label!=='auto');
            const autos=updated.filter(s=>s.label==='auto').slice(-60);
            return[...labelled,...autos];
          });
          lastSnapshotDateRef.current=today;
        }
      }catch(e){}
    }
    prevAutoCountRef.current={done:curDone,halfDone:curHalf};
  }catch(e){}
},[doneCount,halfStitchCounts.done]);
// Goal-completion detection — fire a celebration when any goal is first reached in this session
useEffect(()=>{
  try{
    const deh=(statsSettings&&statsSettings.dayEndHour)||0;
    const dailyGoal=statsSettings&&statsSettings.dailyGoal;
    const weeklyGoal=statsSettings&&statsSettings.weeklyGoal;
    const monthlyGoal=statsSettings&&statsSettings.monthlyGoal;
    if(!dailyGoal&&!weeklyGoal&&!monthlyGoal)return;
    const liveExtra=liveAutoStitches;
    const prev=goalCelebrationRef.current;
    if(dailyGoal>0){
      const cur=todayStitchesForBar;
      if(!prev.daily&&cur>=dailyGoal){goalCelebrationRef.current={...prev,daily:true};setCelebration({label:'Daily goal reached! '+cur.toLocaleString('en-GB')+' / '+dailyGoal.toLocaleString('en-GB')+' stitches',pct:null});}
      else if(prev.daily&&cur<dailyGoal)goalCelebrationRef.current={...prev,daily:false};
    }
    if(weeklyGoal>0){
      const cur=getStatsThisWeekStitches(statsSessions||[],deh)+liveExtra;
      if(!prev.weekly&&cur>=weeklyGoal){goalCelebrationRef.current={...prev,weekly:true};setCelebration({label:'Weekly goal reached! '+cur.toLocaleString('en-GB')+' / '+weeklyGoal.toLocaleString('en-GB')+' stitches',pct:null});}
      else if(prev.weekly&&cur<weeklyGoal)goalCelebrationRef.current={...prev,weekly:false};
    }
    if(monthlyGoal>0){
      const cur=getStatsThisMonthStitches(statsSessions||[],deh)+liveExtra;
      if(!prev.monthly&&cur>=monthlyGoal){goalCelebrationRef.current={...prev,monthly:true};setCelebration({label:'Monthly goal reached! '+cur.toLocaleString('en-GB')+' / '+monthlyGoal.toLocaleString('en-GB')+' stitches',pct:null});}
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

function markColourDone(cid,md){const cur=doneRef.current;if(!pat||!cur)return;let changes=[];let nd=new Uint8Array(cur);
  // In a work area "all" means all of this colour inside the area.
  const _a=areaOn?workArea:null;
  for(let i=0;i<pat.length;i++)if(pat[i].id===cid&&(!_a||window.WorkArea.containsIndex(_a,i,sW))){if(nd[i]!==(md?1:0))changes.push({idx:i,oldVal:nd[i]});nd[i]=md?1:0;}if(changes.length>0){pushTrackHistory(changes);applyDoneCountsDelta(changes,pat,nd);paintDoneChanges(changes,nd);skipNextFullRedrawRef.current=true;}doneRef.current=nd;setDone(nd);}
function copyText(t,l){navigator.clipboard.writeText(t).then(()=>{setCopied(l);setTimeout(()=>setCopied(null),2000);}).catch(()=>{});}
function copyProgressSummary(){
  let t=totalTime+liveAutoElapsed;
  let coloursComplete=Object.values(colourDoneCounts).filter(c=>c.done>=c.total&&c.total>0).length;
  let totalColours=pal?pal.length:0;
  let stPerHr=t>=60&&doneCount>0?Math.round(doneCount/(t/3600)):null;
  let estRem=t>=60&&doneCount>0?Math.round((totalStitchable-doneCount)*(t/doneCount)):null;
  let lines=["\u{1F9F5} Cross Stitch Progress Update"];
  lines.push("Project: "+(projectName||sW+"\u00D7"+sH+" pattern"));
  lines.push("Progress: "+doneCount+"/"+totalStitchable+" stitches ("+progressPct.toFixed(1)+"%)");
  if(halfStitchCounts.total>0)lines.push("Half stitches: "+halfStitchCounts.done+"/"+halfStitchCounts.total);
  lines.push("Colours: "+coloursComplete+"/"+totalColours+" colours complete");
  if(t>=60)lines.push("Time stitched: "+fmtTime(t)+" ("+(statsSessions?statsSessions.length:0)+" sessions)");
  else lines.push("Time stitched: Not tracked yet");
  if(stPerHr)lines.push("Speed: "+stPerHr+" stitches/hour");
  if(estRem)lines.push("Est. remaining: "+fmtTime(estRem));
  lines.push("Pattern: "+sW+"\u00D7"+sH+", "+totalColours+" colours, "+fabricCt+"ct");
  copyText(lines.join("\n"),"progress");
}

// History entry shapes:
//   • Legacy: bare array of {idx,oldVal} — single-cell or per-pixel drag.
//   • B2 BULK_TOGGLE: {type:"BULK_TOGGLE", source:"drag"|"range", changes:[...]}
//     One undo step covering the whole drag-mark or range-select gesture.
// _historyChanges normalises both shapes for the undo/redo pipeline.
function _historyChanges(entry){
  return (entry && entry.type === "BULK_TOGGLE") ? entry.changes : entry;
}
function pushTrackHistory(changes){
  if(!changes||!changes.length)return;
  // Track colours for auto-session
  if(pat){for(let i=0;i<changes.length;i++){const id=pat[changes[i].idx]&&pat[changes[i].idx].id;if(id&&id!=='__skip__'&&id!=='__empty__')pendingColoursRef.current.add(id);}}
  setTrackHistory(prev=>{let n=[...prev,changes];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
// B2: push a single tagged BULK_TOGGLE entry from useDragMark commits.
function pushBulkToggleHistory(changes, source){
  if(!changes||!changes.length)return;
  if(pat){for(let i=0;i<changes.length;i++){const id=pat[changes[i].idx]&&pat[changes[i].idx].id;if(id&&id!=='__skip__'&&id!=='__empty__')pendingColoursRef.current.add(id);}}
  const entry={type:"BULK_TOGGLE",source:source||"drag",changes:changes};
  setTrackHistory(prev=>{let n=[...prev,entry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
function undoTrack(){
  if(!trackHistory.length||!done)return;
  let lastEntry=trackHistory[trackHistory.length-1];
  if(lastEntry&&lastEntry.type==="PARK"){
    applyParkEntry(lastEntry,false);
    setTrackHistory(prev=>prev.slice(0,-1));
    setRedoStack(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  let last=_historyChanges(lastEntry);
  let nd=new Uint8Array(done);
  let redoChanges=last.map(c=>({idx:c.idx,oldVal:nd[c.idx]}));
  for(let c of last)nd[c.idx]=c.oldVal;
  applyDoneCountsDelta(redoChanges,pat,nd);
  paintDoneChanges(last,nd);
  skipNextFullRedrawRef.current=true;
  setDone(nd);
  setTrackHistory(prev=>prev.slice(0,-1));
  let redoEntry=(lastEntry&&lastEntry.type==="BULK_TOGGLE")
    ?{type:"BULK_TOGGLE",source:lastEntry.source,changes:redoChanges}
    :redoChanges;
  setRedoStack(prev=>{let n=[...prev,redoEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
}
function redoTrack(){
  if(!redoStack.length||!done)return;
  let lastEntry=redoStack[redoStack.length-1];
  if(lastEntry&&lastEntry.type==="PARK"){
    applyParkEntry(lastEntry,true);
    setRedoStack(prev=>prev.slice(0,-1));
    setTrackHistory(prev=>{let n=[...prev,lastEntry];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
    return;
  }
  let last=_historyChanges(lastEntry);
  let nd=new Uint8Array(done);
  let undoChanges=last.map(c=>({idx:c.idx,oldVal:nd[c.idx]}));
  for(let c of last)nd[c.idx]=c.oldVal;
  applyDoneCountsDelta(undoChanges,pat,nd);
  paintDoneChanges(last,nd);
  skipNextFullRedrawRef.current=true;
  setDone(nd);
  setRedoStack(prev=>prev.slice(0,-1));
  let undoEntry=(lastEntry&&lastEntry.type==="BULK_TOGGLE")
    ?{type:"BULK_TOGGLE",source:lastEntry.source,changes:undoChanges}
    :undoChanges;
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
  if (previousDone) { const nd=new Uint8Array(done); nd[cellIdx]=0; applyDoneCountsDelta([{idx:cellIdx,oldVal:1}],pat,nd); setDone(nd); }
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
    if (previousDone) { const nd=new Uint8Array(done); nd[cellIdx]=1; applyDoneCountsDelta([{idx:cellIdx,oldVal:0}],pat,nd); setDone(nd); }
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
  if(!confirm("Revert all symbol assignments to the original PDF import? Your tracking progress will be kept, but all colour corrections will be lost."))return;
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

function doSaveProject(finalName){
  if(!pat||!pal)return;
  // Serialise singleStitchEdits Map as array of [cellIdx, {originalId, currentId}] pairs
  const sseArr = [...singleStitchEdits.entries()];
  // Serialise half stitch data as arrays of [cellIdx, {fwd?, bck?}] pairs
  const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
    fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb } : undefined,
    bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb } : undefined
  }]);
  const hdArr = [...halfDone.entries()];
  const psArr = [...partialStitches.entries()];
  let project={
    version:11,
    id:projectIdRef.current||undefined,
    page:"tracker",
    name:finalName,
    createdAt:createdAtRef.current||new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    settings:{sW,sH,fabricCt,skeinPrice,stitchSpeed,wastePrefs},
    // PERF (deferred-1): rgb-stripping serializer; see helpers.js / serializePattern.
    pattern:(window.PatternIO?window.PatternIO.serializePattern(pat):pat.map(m=>(m.id==="__skip__"||m.id==="__empty__")?{id:m.id}:{id:m.id,type:m.type,rgb:m.rgb})),
    bsLines,
    done:done?Array.from(done):null,
    parkMarkers,
    hlRow,
    hlCol,
    threadOwned,
    originalPaletteState,
    singleStitchEdits: sseArr,
    halfStitches: hsArr,
    halfDone: hdArr,
    partialStitches: psArr,
    statsSessions,
    statsSettings,
    achievedMilestones,
    doneSnapshots,
    breadcrumbs,
    stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence, workArea,
    savedZoom: stitchZoom,
    savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft + chartScrollOffset().x, top: stitchScrollRef.current.scrollTop + chartScrollOffset().y } : null
  };
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
  var result=generateOXS({w:sW,h:sH,pattern:pat,bsLines:bsLines||[],name:projectName||'pattern'});
  if(result.warnings&&result.warnings.length>0){
    window.Toast&&Toast.show({message:result.warnings[0],type:'warning',duration:6000});
  }
  var blob=new Blob([result.xml],{type:'application/xml'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download=((projectName||'pattern').replace(/[^\w\-]+/g,'_')||'pattern')+'.oxs';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},5000);
}

function persistProjectRecord(project){
  if(window.CrossTabResolution&&typeof window.CrossTabResolution.saveWithConflictResolution==='function'){
    return window.CrossTabResolution.saveWithConflictResolution(project);
  }
  return ProjectStorage.save(project).then(function(id){ProjectStorage.setActiveProject(id);return{ok:true,id:id};});
}

function handleEditInCreator(){
  if(!pat||!pal)return;
  if(onSwitchToDesign){
    // Build a fresh snapshot so name/session changes that haven't auto-saved yet are included
    const project=buildSnapshot();
    if(project){
      lastSnapshotRef.current=project;
      persistProjectRecord(project).then(function(saveResult){
        if(saveResult&&saveResult.reason==='reloaded')return null;
        return saveProjectToDB(project);
      }).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
      // Push ALL tracker-specific fields to Creator so its auto-save doesn't overwrite them
      try{
        if(typeof window.__updateCreatorTrackerFields==='function'){
          var _v3h=v3FieldsRef.current||{};
          window.__updateCreatorTrackerFields({
            statsSessions:project.statsSessions, statsSettings:project.statsSettings,
            achievedMilestones:project.achievedMilestones, doneSnapshots:project.doneSnapshots,
            breadcrumbs:project.breadcrumbs, stitchingStyle:project.stitchingStyle,
            blockW:project.blockW, blockH:project.blockH, focusBlock:project.focusBlock, workArea:project.workArea,
            startCorner:project.startCorner, colourSequence:project.colourSequence,
            originalPaletteState:project.originalPaletteState,
            singleStitchEdits:project.singleStitchEdits,
            halfStitches:project.halfStitches, halfDone:project.halfDone,
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
    if(saveResult&&saveResult.reason==='reloaded')return;
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
  // Install the loaded project's identity before any downstream work so a
  // later render-time failure can't cause the next auto-save to mint a copy.
  projectIdRef.current = project.id || null;
  let s=project.settings||{};
  const nextW=project.w||s.sW||project.settings?.w||80;
  const nextH=project.h||s.sH||project.settings?.h||80;
  // If this device cannot fit the chart at the minimum usable stitch-cell size,
  // reject the load before any canvas sizing runs.
  if(typeof window.maxChartCellSize==="function"&&window.maxChartCellSize(nextW,nextH)<2){
    setLoadError(`Pattern (${nextW}×${nextH}) is too large to display on this device in Stitch Tracker. Open it in the Creator to reduce stitch count.`);
    setTimeout(()=>setLoadError(null),5000);
    return;
  }
  setSW(nextW);
  setSH(nextH);
  setBsLines(project.bsLines||project.bs||[]);
  if(s.fabricCt)setFabricCt(s.fabricCt);
  else if(project.fc)setFabricCt(project.fc);
  if(s.skeinPrice!=null)setSkeinPrice(s.skeinPrice);
  if(s.stitchSpeed)setStitchSpeed(s.stitchSpeed);
  // Restore RT waste preferences; snapshot stash if feature is enabled.
  if(s.wastePrefs&&typeof s.wastePrefs==='object'){
    const loaded=Object.assign({},RT_WASTE_DEFAULTS,s.wastePrefs);
    setWastePrefs(loaded);
    if(loaded.enabled){
      // Snapshot the current live stash so "skeins remaining" computes correctly
      // relative to what the user owned at project start.
      if(typeof StashBridge!=='undefined'){
        StashBridge.getGlobalStash().then(snap=>{rtStashSnapshotRef.current=snap;}).catch(()=>{});
      }
    }else{
      rtStashSnapshotRef.current={};
    }
  }else{
    setWastePrefs(Object.assign({},RT_WASTE_DEFAULTS));
    rtStashSnapshotRef.current={};
  }
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
        if(m[1] === 'b') return restoreStitch({type:"blend",id:m[0]});
        return restoreStitch({type:"solid",id:m[0]});
     });
  } else {
    // Normal JSON format
    restored=p.map(restoreStitch);
  }

  const partialMap = new Map();
  const partialCells = [];
  (project.partialStitches || []).forEach(([idx, quarters]) => {
    const restoredQuarters = {};
    Object.keys(quarters || {}).forEach(corner => {
      const quarter = quarters[corner];
      if (!quarter || !quarter.id) return;
      const stitch = restoreStitch({ id: quarter.id, type: quarter.id.includes('+') ? 'blend' : 'solid', rgb: quarter.rgb });
      restoredQuarters[corner] = { id: stitch.id, rgb: stitch.rgb, lab: stitch.lab, name: stitch.name, type: stitch.type };
      partialCells.push(stitch);
    });
    if (Object.keys(restoredQuarters).length) partialMap.set(Number(idx), restoredQuarters);
  });
  let{pal:newPal,cmap:newCmap}=buildPalette(restored.concat(partialCells));
  setPat(restored);setPal(newPal);setCmap(newCmap);
  setPartialStitches(partialMap);
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
        const restored = restoreStitch({ id: hs.fwd.id, type: hs.fwd.id.includes('+') ? 'blend' : 'solid', rgb: hs.fwd.rgb });
        entry.fwd = { id: restored.id, rgb: restored.rgb, lab: restored.lab, name: restored.name, type: restored.type };
      }
      if (hs.bck) {
        const restored = restoreStitch({ id: hs.bck.id, type: hs.bck.id.includes('+') ? 'blend' : 'solid', rgb: hs.bck.rgb });
        entry.bck = { id: restored.id, rgb: restored.rgb, lab: restored.lab, name: restored.name, type: restored.type };
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
  setSelectedColorId(null);setFocusColour(null);setTrackHistory([]);setRedoStack([]);
  setThreadOwned(project.threadOwned||{});
  if(project.done&&project.done.length===restored.length)setDone(new Uint8Array(project.done));
  else setDone(new Uint8Array(restored.length));

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
  v3FieldsRef.current={finishStatus:project.finishStatus,startedAt:project.startedAt,lastTouchedAt:project.lastTouchedAt,completedAt:project.completedAt,stitchLog:project.stitchLog};
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
  // Legacy migration: if no statsSessions but totalTime exists, create a synthetic session
  var rawStatsSessions=(project.statsSessions||[]).filter(function(s){
    if(!s)return false;
    if(s.startTime==null&&s.date==null)return true;
    if(s.startTime!=null){
      var t=new Date(s.startTime).getTime();
      if(Number.isNaN(t))return false;
    }
    return true;
  });
  if(rawStatsSessions.length===0&&project.totalTime>0){
    var legacyDone=project.done?Array.from(project.done).filter(function(v){return v===1;}).length:0;
    var normaliseSessionTime=(function(value){
      if(value==null||value==="")return null;
      var dt;
      if(typeof value==="number"&&Number.isFinite(value))dt=new Date(value);
      else if(typeof value==="string"){
        var trimmed=value.trim();
        if(!trimmed)return null;
        if(/^\d+$/.test(trimmed))dt=new Date(Number(trimmed));
        else dt=new Date(trimmed);
      }else if(value instanceof Date)dt=value;
      if(!dt||Number.isNaN(dt.getTime()))return null;
      return dt.toISOString();
    });
    var legacyCreatedAtIso=normaliseSessionTime(project.createdAt);
    var legacyUpdatedAtIso=normaliseSessionTime(project.updatedAt);
    // Use createdAt for the legacy session date so historical stitches are never
    // attributed to today.  Fall back to a date 24h in the past if createdAt is
    // missing or resolves to today's local date.
    var legacyDate=(function(){
      var src=legacyCreatedAtIso||legacyUpdatedAtIso;
      if(src){
        var d=src.slice(0,10);
        // Guard: if that date is today (local), push it back 24h
        var today=getStitchingDate(new Date(),0);
        if(d===today){var yest=new Date();yest.setDate(yest.getDate()-1);d=yest.getFullYear()+'-'+('0'+(yest.getMonth()+1)).slice(-2)+'-'+('0'+yest.getDate()).slice(-2);}
        return d;
      }
      var yest=new Date();yest.setDate(yest.getDate()-1);return yest.getFullYear()+'-'+('0'+(yest.getMonth()+1)).slice(-2)+'-'+('0'+yest.getDate()).slice(-2);
    })();
    var legacyStart=legacyCreatedAtIso||legacyUpdatedAtIso||(function(){var d=new Date();d.setDate(d.getDate()-1);return d.toISOString();}());
    rawStatsSessions=[{
      id:'sess_legacy',
      date:legacyDate,
      startTime:legacyStart,
      endTime:legacyUpdatedAtIso||legacyStart,
      durationSeconds:project.totalTime,
      durationMinutes:Math.round(project.totalTime/60),
      stitchesCompleted:legacyDone,
      stitchesUndone:0,
      netStitches:legacyDone,
      totalAtEnd:legacyDone,
      percentAtEnd:0,
      note:'Migrated from legacy total time',
      coloursWorked:[],
    }];
  }
  // Patch legacy sessions that only have durationMinutes
  rawStatsSessions.forEach(function(s){if(s.durationSeconds==null&&s.durationMinutes!=null){s.durationSeconds=s.durationMinutes*60;}});
  // Backfill totalAtEnd for pre-v9 sessions that were saved without it.
  // Reconstruct as a running cumulative sum of netStitches sorted chronologically.
  if(rawStatsSessions.some(function(s){return s.totalAtEnd==null;})){
    var totalStitchCount=restored.filter(function(c){return c&&c.id!=='__skip__'&&c.id!=='__empty__';}).length;
    var sorted=rawStatsSessions.slice().sort(function(a,b){
      var aKey=a.startTime||a.date||'';
      var bKey=b.startTime||b.date||'';
      var aTime=new Date(aKey).getTime();
      var bTime=new Date(bKey).getTime();
      if(!Number.isNaN(aTime)&&!Number.isNaN(bTime)){
        if(aTime<bTime)return-1;
        if(aTime>bTime)return 1;
        return 0;
      }
      if(aKey<bKey)return-1;
      if(aKey>bKey)return 1;
      return 0;
    });
    var running=0;
    sorted.forEach(function(s){running+=(s.netStitches||0);if(s.totalAtEnd==null)s.totalAtEnd=Math.min(Math.max(0,running),totalStitchCount);});
  }
  // Recover any session that was finalised but not yet flushed to IDB (e.g. tab was
  // closed before the 5-second auto-save timer fired). The localStorage backup is
  // written by finaliseAutoSession and cleared by the auto-save timer on success.
  try{
    var _pk='cs_pending_session_'+(project.id||'');
    var _pj=localStorage.getItem(_pk);
    if(_pj){var _ps=JSON.parse(_pj);if(_ps&&_ps.id&&!rawStatsSessions.some(function(s){return s.id===_ps.id;})){rawStatsSessions.push(_ps);}localStorage.removeItem(_pk);}
  }catch(_){}
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
        setResumeRecap({
          projectName:project.name||'Untitled',
          summary:_summary,
          lastDate:_last&&(_last.date||_last.startTime)||null,
          totalSt:_totalSt,
          doneSt:_doneSt
        });
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
  setDoneSnapshots(project.doneSnapshots||[]);
  lastSnapshotDateRef.current=null;
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
        setTimeout(()=>setLoadError(null),4000);
      }
    };
    rd.readAsText(f);
  } else if (format === "oxs") {
    let rd=new FileReader();
    rd.onload=ev=>{
      try{
        let result = parseOXS(ev.target.result);
        let project = importResultToProject(result, 14, baseName);
        const importedAt = Date.now();
        project.id = "proj_" + importedAt;
        if(!project.createdAt) project.createdAt = new Date(importedAt).toISOString();
        processLoadedProject(project);
        persistProjectRecord(project).catch(err => console.error("Import save failed:", err));
        setImportSuccess(`Imported "${baseName || 'pattern'}" \u2014 ${result.width}\u00d7${result.height}, ${result.paletteSize} colours, ${result.stitchCount} stitches`);
      }catch(err){
        console.error(err);
        setLoadError("Could not load OXS: "+err.message);
        setTimeout(()=>setLoadError(null),4000);
      }
    };
    rd.readAsText(f);
  } else if (format === "image") {
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (f.size > MAX_FILE_SIZE) {
      setLoadError("File is too large. Please select an image under 5MB.");
      setTimeout(() => setLoadError(null), 4000);
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
        setTimeout(()=>setLoadError(null),4000);
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
      setTimeout(()=>setLoadError(null),4000);
    });
  } else {
    setLoadError("Unsupported file format. Please load .json, .oxs, .xml, .pdf, or image files.");
    setTimeout(()=>setLoadError(null),4000);
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
    if (window.Toast && window.Toast.show) {
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
  if (!pat || !pal) return null;
  if (!projectIdRef.current) {
    projectIdRef.current = ProjectStorage.newId();
    console.warn('[stitchx/tracker] buildSnapshot: projectIdRef was null — assigning new id', projectIdRef.current, new Error().stack);
  }
  if (!createdAtRef.current) createdAtRef.current = new Date().toISOString();
  const sseArr = [...singleStitchEdits.entries()];
  const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
    fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb } : undefined,
    bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb } : undefined
  }]);
  const hdArr = [...halfDone.entries()];
  const psArr = [...partialStitches.entries()];
  // Derive stitchLog from statsSessions (single source of truth).
  // Groups netStitches by date so stitchLog always matches what statsSessions says.
  const _logMap = {};
  (statsSessions || []).forEach(s => {
    if (!s || !s.date) return;
    _logMap[s.date] = (_logMap[s.date] || 0) + (s.netStitches || 0);
  });
  const _derivedLog = Object.entries(_logMap)
    .filter(([, c]) => c !== 0)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
  if (v3FieldsRef.current) v3FieldsRef.current.stitchLog = _derivedLog;
  return {
    version: 11, id: projectIdRef.current, page: "tracker", name: projectName,
    designer: projectDesigner, description: projectDescription,
    createdAt: createdAtRef.current, updatedAt: new Date().toISOString(),
    settings: { sW, sH, fabricCt, skeinPrice, stitchSpeed, wastePrefs },
    pattern: (window.PatternIO ? window.PatternIO.serializePattern(pat) : pat.map(m => (m.id === "__skip__" || m.id === "__empty__") ? { id: m.id } : { id: m.id, type: m.type, rgb: m.rgb })),
    bsLines, done: done ? Array.from(done) : null, parkMarkers,
    hlRow, hlCol, threadOwned, originalPaletteState,
    singleStitchEdits: sseArr, halfStitches: hsArr, halfDone: hdArr, partialStitches: psArr,
    statsSessions, statsSettings, achievedMilestones, doneSnapshots,
    savedZoom: stitchZoom,
    savedScroll: stitchScrollRef.current ? { left: stitchScrollRef.current.scrollLeft + chartScrollOffset().x, top: stitchScrollRef.current.scrollTop + chartScrollOffset().y } : null,
    breadcrumbs, stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence, workArea,
    ...v3FieldsRef.current
  };
};
buildSnapshotRef.current = buildSnapshot;
useEffect(() => {
  if (!pat || !pal) return;
  autoSaveDirtyRef.current = true;
  const saveTimer = setTimeout(() => {
    if (!autoSaveDirtyRef.current) return;
    autoSaveDirtyRef.current = false;
    const project = buildSnapshot();
    if (!project) return;
    lastSnapshotRef.current = project;
    persistProjectRecord(project).then(function(saveResult){
      if(saveResult&&saveResult.reason==='reloaded')return null;
      try{if(projectIdRef.current)localStorage.removeItem('cs_pending_session_'+projectIdRef.current);}catch(_){}
      return saveProjectToDB(project).catch(err => console.error("Tracker DB auto-save failed:", err)).then(function(){
        // Keep the Creator's tracker-field preservation container in sync so that if
        // the user switches to Creator mode, the next Creator auto-save won't overwrite
        // sessions, stats settings, milestones, etc. with stale data.
        try{
          if(typeof window.__updateCreatorTrackerFields==='function'){
            var _v3=v3FieldsRef.current||{};
            window.__updateCreatorTrackerFields({
              statsSessions:project.statsSessions, statsSettings:project.statsSettings,
              achievedMilestones:project.achievedMilestones, doneSnapshots:project.doneSnapshots,
              breadcrumbs:project.breadcrumbs, stitchingStyle:project.stitchingStyle,
              blockW:project.blockW, blockH:project.blockH, focusBlock:project.focusBlock, workArea:project.workArea,
              startCorner:project.startCorner, colourSequence:project.colourSequence,
              originalPaletteState:project.originalPaletteState,
              singleStitchEdits:project.singleStitchEdits,
              halfStitches:project.halfStitches, halfDone:project.halfDone,
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
    }).catch(err => console.error("Tracker auto-save failed:", err));
  }, 5000);
  return () => clearTimeout(saveTimer);
}, [pat, pal, done, bsLines, parkMarkers, totalTime, hlRow, hlCol, threadOwned,
    halfStitches, halfDone, singleStitchEdits,
    sW, sH, fabricCt, skeinPrice, stitchSpeed, wastePrefs, originalPaletteState, statsSessions, statsSettings, projectName, stitchZoom, doneSnapshots, achievedMilestones]);

// Save the freshest snapshot before the page unloads (best-effort fire-and-forget).
// Uses only refs so the handler is never stale; drag in-progress mutations are applied
// from dragChangesRef before saving.
useEffect(() => {
  const handleBeforeUnload = () => {
    try {
    isUnloadingRef.current = true;
    // Always build a fresh snapshot so we never use stale data
    let project = null;
    const fresh = buildSnapshotRef.current();
    if (fresh) { project = fresh; lastSnapshotRef.current = fresh; }
    if (!project) project = lastSnapshotRef.current;
    if (!project) return;
    let projectToSave = project;
    // If a drag is in progress, apply the pending in-place mutations to a fresh done copy
    if (dragStateRef.current.isDragging && dragChangesRef.current.length > 0) {
      const dVal = dragStateRef.current.dragVal;
      const freshDone = project.done ? project.done.slice() : null;
      if (freshDone) {
        for (const {idx} of dragChangesRef.current) freshDone[idx] = dVal;
      }
      projectToSave = { ...project, done: freshDone, updatedAt: new Date().toISOString() };
      dragChangesRef.current = [];
      dragStateRef.current.isDragging = false;
    }
    // Finalise any active auto-session and merge into the snapshot
    const finalisedSession = finaliseAutoSessionRef.current ? finaliseAutoSessionRef.current() : null;
    if (finalisedSession) {
      const existingSessions = Array.isArray(projectToSave.statsSessions) ? projectToSave.statsSessions : [];
      const hasSession = existingSessions.some(s => s && s.id === finalisedSession.id);
      if (!hasSession) {
        projectToSave = {
          ...projectToSave,
          statsSessions: [...existingSessions, finalisedSession],
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
    flushRtStashWriteRef.current();
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
useEffect(() => {
  window.__openTrackerStats = function(targetId) {
    setStatsTab(targetId || projectIdRef.current || 'all');
    setStatsView(true);
  };
  return () => { delete window.__openTrackerStats; };
}, []);

// Expose flush for BackupRestore to call before reading IndexedDB.
// Re-registered whenever relevant state changes so the function always builds
// a fresh snapshot rather than relying on a potentially stale ref.
useEffect(() => {
  window.__flushProjectToIDB = async function() {
    if (!pat || !pal) {
      const project = lastSnapshotRef.current;
      if (project) {
        const saveResult = await persistProjectRecord(project);
        if (!saveResult || saveResult.reason !== 'reloaded') {
          await saveProjectToDB(project).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
        }
      }
      return;
    }
    const sseArr = [...singleStitchEdits.entries()];
    const hsArr = [...halfStitches.entries()].map(([idx, hs]) => [idx, {
      fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb } : undefined,
      bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb } : undefined
    }]);
    const hdArr = [...halfDone.entries()];
    const psArr = [...partialStitches.entries()];
    const project = {
      ...(lastSnapshotRef.current || {}),
      version: 11, id: projectIdRef.current, page: "tracker", name: projectName,
      createdAt: createdAtRef.current,
      updatedAt: new Date().toISOString(),
      settings: { sW, sH, fabricCt, skeinPrice, stitchSpeed, wastePrefs },
      partialStitches: psArr,
      // PERF (deferred-1): rgb-stripping serializer; see helpers.js / serializePattern.
      breadcrumbs, stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence, workArea
    };
    lastSnapshotRef.current = project;
    const saveResult = await persistProjectRecord(project);
    if (!saveResult || saveResult.reason !== 'reloaded') {
      await saveProjectToDB(project).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
    }
  };
  return () => {
    // Replace with a snapshot-based fallback rather than deleting outright.
    // If a backup or sync flush is requested during the mode-switch gap before
    // the Creator registers its own handler, this ensures IDB is still written.
    var last = lastSnapshotRef.current;
    window.__flushProjectToIDB = async function() {
      if (last) {
        const saveResult = await persistProjectRecord(last);
        if (!saveResult || saveResult.reason !== 'reloaded') {
          await saveProjectToDB(last).catch(e => { console.error('Save failed:', e); try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save progress \u2014 your changes may not persist. Try downloading a backup.', type: 'error'}); } catch(_){} });
        }
      }
    };
  };
}, [projectName, sW, sH, fabricCt, skeinPrice, stitchSpeed, pat, pal, bsLines, done,
    halfStitches, halfDone, partialStitches, parkMarkers, totalTime, liveAutoElapsed, hlRow, hlCol,
    threadOwned, originalPaletteState, singleStitchEdits, statsSessions, statsSettings, achievedMilestones, stitchZoom, doneSnapshots,
    breadcrumbs, stitchingStyle, blockW, blockH, focusBlock, startCorner, colourSequence, workArea]);

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
  const isDone=isDoneAt||(i=>!!(done&&done[i]));
  // Guide and park markers are read through refs: they are repainted
  // incrementally (see the guide / park repaint effects) rather than by a
  // full renderStitch, so this function's closure may predate them.
  const hlRow=guideRef.current.row,hlCol=guideRef.current.col;
  const parkMarkers=parkMarkersRef.current,parkLayers=parkLayersRef.current;

  // Determine effective tier and animated feature opacities
  const tier=lockDetailLevel?3:tierRef.current;
  const symAlpha=lockDetailLevel?1.0:tierFadeRef.current.symbolOpacity;
  const bsHsAlpha=lockDetailLevel?1.0:tierFadeRef.current.bsHsOpacity;

  ctx.fillStyle=trackerFabricColour||"#fff";
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
  const fSym=`bold ${symPx}px monospace`;
  const fCol=`bold ${Math.max(7,Math.round(symPx*0.92))}px monospace`;
  const fHlDim=`${Math.max(6,Math.round(cSz*0.45))}px monospace`;
  const fHlFocus=`bold ${symPx}px monospace`;
  ctx.textAlign="center";ctx.textBaseline="middle";

  // Half-stitch detail flags — driven by tier rather than raw zoom percentage
  const hsLowZoom=tier===2;   // Tier 2: triangle fill only
  const hsMedZoom=tier===3;   // Tier 3: triangle + diagonal line
  const hsHighZoom=tier>=4;   // Tier 4: full detail (tri + line + symbol)
  function drawPartial(entry, base, px, py) {
    if (!entry) return;
    analysePartialStitches(entry, base).forEach(function (instruction) {
      var colour = instruction.colour;
      var paletteEntry = cmap && cmap[colour.id];
      var symbol = paletteEntry && paletteEntry.symbol;
      var view = stitchView === 'symbol' ? 'symbol' : 'both';
      if (instruction.type === 'three-quarter') {
        drawThreeQuarterStitch(ctx, px, py, cSz, colour, instruction.emptyCorner, 0.8, view, symbol);
      } else if (instruction.type === 'quarter') {
        drawQuarterStitch(ctx, px, py, cSz, colour, instruction.corner, 0.8, view, symbol);
      } else {
        drawHalfTriangle(ctx, px, py, cSz, instruction.direction, colour.rgb, 0.8);
        drawHalfLine(ctx, px, py, cSz, instruction.direction, colour.rgb, 0.8);
      }
    });
  }

  for(let y=startY;y<endY;y++){
    for(let x=startX;x<endX;x++){
      let idx=y*sW+x,m=pat[idx];if(!m)continue;
      let info=(m.id==="__skip__"||m.id==="__empty__")?null:(cmap?cmap[m.id]:null);
      let px=gut+x*cSz,py=gut+y*cSz;
      let isDn=isDoneAt?isDoneAt(idx):(done&&done[idx]);

      // ── Tier 1 fast path: flat color blocks, no symbols, no cell borders ──
      if(tier===1&&!partialStitches.has(idx)){
        if(m.id==="__skip__"||m.id==="__empty__"){ctx.fillStyle="#f0f4f8";ctx.fillRect(px,py,cSz,cSz);continue;}
        if(isDn||lowZoomFade<=0){ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
        else{const f=lowZoomFade,inv=1-f,r2=Math.round(m.rgb[0]*inv+255*f),g2=Math.round(m.rgb[1]*inv+255*f),b2=Math.round(m.rgb[2]*inv+255*f);ctx.fillStyle=`rgb(${r2},${g2},${b2})`;ctx.fillRect(px,py,cSz,cSz);}
        continue;
      }

      let dimmed=stitchView==="highlight"&&focusColour&&m.id!==focusColour&&m.id!=="__skip__"&&m.id!=="__empty__";
      const effectiveDimmed=dimmed&&highlightMode!=="outline"&&highlightMode!=="tint";
      const dimR=Math.round(255-(255-m.rgb[0])*trackerDimLevel),dimG=Math.round(255-(255-m.rgb[1])*trackerDimLevel),dimB=Math.round(255-(255-m.rgb[2])*trackerDimLevel);
      const dimFill=effectiveDimmed?`rgb(${dimR},${dimG},${dimB})`:'#EFE7D6';
      if(m.id==="__skip__"||m.id==="__empty__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle=m.id==="__empty__"?"rgba(220,50,50,0.25)":"rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}
        let hs=halfStitches.get(idx);
        if(hs&&layerVis.half&&bsHsAlpha>0.01){
          let hd=halfDone.get(idx)||{};
          ctx.save();ctx.globalAlpha=bsHsAlpha;
          _drawHalfStitchCell(ctx,px,py,cSz,hs,hd,cmap,stitchView,focusColour,false,hsLowZoom,hsMedZoom,hsHighZoom);
          ctx.restore();
        }
        drawPartial(partialStitches.get(idx),m,px,py);
        continue;
      }
      if(layerVis.full){
      if(stitchView==="symbol"){
        if(isDn){ctx.fillStyle="#D5E5C8";ctx.fillRect(px,py,cSz,cSz);}
        else{ctx.fillStyle=trackerFabricColour||"#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1B1814";ctx.font=fSym;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
      }else if(stitchView==="colour"){
        ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
        if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=fCol;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}
      }else if(highlightMode==="outline"||highlightMode==="tint"){
        ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
        if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=fCol;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}
        if(highlightMode==="tint"&&focusColour&&m.id===focusColour){const tr=parseInt(tintColor.slice(1,3),16),tg=parseInt(tintColor.slice(3,5),16),tb=parseInt(tintColor.slice(5,7),16);ctx.fillStyle=`rgba(${tr},${tg},${tb},${tintOpacity})`;ctx.fillRect(px,py,cSz,cSz);}
      }else if(highlightMode==="spotlight"){
        if(dimmed){ctx.fillStyle="#e8ecf0";ctx.fillRect(px,py,cSz,cSz);}
        else{ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);if(!isDn&&info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=fCol;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}if(cSz>=4){const lum2=luminance(m.rgb);ctx.strokeStyle=lum2>140?"rgba(26,26,46,0.85)":"rgba(255,255,255,0.85)";ctx.lineWidth=1.5;ctx.strokeRect(px+0.75,py+0.75,cSz-1.5,cSz-1.5);ctx.lineWidth=1;}}
      }else{
        if(isDn){ctx.fillStyle=effectiveDimmed?dimFill:`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
        else if(dimmed){ctx.fillStyle=dimFill;ctx.fillRect(px,py,cSz,cSz);if(symAlpha>0.01&&trackerDimLevel<0.25&&info&&cSz>=8){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=`rgba(0,0,0,${Math.max(0.04,0.12-trackerDimLevel*0.4)})`;ctx.font=fHlDim;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}else if(symAlpha>0.01&&trackerDimLevel>=0.25&&info&&cSz>=8){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle=luminance(m.rgb)>140?'rgba(0,0,0,0.5)':'rgba(255,255,255,0.6)';ctx.font=fHlDim;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
        else{ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);if(info&&symAlpha>0.01){ctx.save();ctx.globalAlpha=symAlpha;ctx.fillStyle="#1B1814";ctx.font=fHlFocus;ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);ctx.restore();}}
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
      drawPartial(partialStitches.get(idx),m,px,py);
      if(cSz>=4){ctx.strokeStyle=(effectiveDimmed&&layerVis.full)?"rgba(0,0,0,0.03)":"rgba(0,0,0,0.08)";ctx.strokeRect(px,py,cSz,cSz);}
    }
    // R11: dim rows outside the current row — one pass per row covers all tiers.
    if(rowModeActive&&y!==currentRow){ctx.fillStyle='rgba(255,255,255,0.55)';ctx.fillRect(gut+startX*cSz,gut+y*cSz,(endX-startX)*cSz,cSz);}
    // R11: highlight the current row with a subtle tint drawn after cells so it stays visible.
    if(rowModeActive&&y===currentRow){ctx.fillStyle='rgba(37,99,235,0.12)';ctx.fillRect(gut+startX*cSz,gut+y*cSz,(endX-startX)*cSz,cSz);}
  }

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

  // Grid lines — tier-adaptive
  if(tier===1){
    // Tier 1: only 10-block lines, subtle spatial reference
    ctx.lineWidth=1;
    for(let gx=startX;gx<=endX;gx++){if(gx%10!==0)continue;ctx.strokeStyle="rgba(204,204,204,0.4)";ctx.beginPath();ctx.moveTo(gut+gx*cSz,gut+startY*cSz);ctx.lineTo(gut+gx*cSz,gut+endY*cSz);ctx.stroke();}
    for(let gy=startY;gy<=endY;gy++){if(gy%10!==0)continue;ctx.strokeStyle="rgba(204,204,204,0.4)";ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+gy*cSz);ctx.lineTo(gut+endX*cSz,gut+gy*cSz);ctx.stroke();}
  }else{
    const gridOp=tier===2?0.30:tier===3?0.50:0.60;
    const grid10Op=tier===2?0.60:tier===3?0.90:1.0;
    const grid10Lw=tier>=4?2:1;
    for(let gx=startX;gx<=endX;gx++){
      const is10=gx%10===0,is5=gx%5===0;if(!is5&&!is10)continue;
      ctx.lineWidth=is10?grid10Lw:1;ctx.strokeStyle=is10?`rgba(68,68,68,${grid10Op})`:`rgba(170,170,170,${gridOp})`;
      ctx.beginPath();ctx.moveTo(gut+gx*cSz,gut+startY*cSz);ctx.lineTo(gut+gx*cSz,gut+endY*cSz);ctx.stroke();
    }
    for(let gy=startY;gy<=endY;gy++){
      const is10=gy%10===0,is5=gy%5===0;if(!is5&&!is10)continue;
      ctx.lineWidth=is10?grid10Lw:1;ctx.strokeStyle=is10?`rgba(68,68,68,${grid10Op})`:`rgba(170,170,170,${gridOp})`;
      ctx.beginPath();ctx.moveTo(gut+startX*cSz,gut+gy*cSz);ctx.lineTo(gut+endX*cSz,gut+gy*cSz);ctx.stroke();
    }
    ctx.lineWidth=1;
  }

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
    bsLines.forEach(ln=>{
      if(Math.max(ln.x1,ln.x2)<startX||Math.min(ln.x1,ln.x2)>endX||Math.max(ln.y1,ln.y2)<startY||Math.min(ln.y1,ln.y2)>endY)return;
      ctx.strokeStyle=ln.color||"#333";ctx.beginPath();ctx.moveTo(gut+ln.x1*cSz,gut+ln.y1*cSz);ctx.lineTo(gut+ln.x2*cSz,gut+ln.y2*cSz);ctx.stroke();
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

  let viewportRect = null;
  if (el) {
    const off = chartScrollOffset(scs);
    viewportRect = {
      left: el.scrollLeft + off.x,
      top: el.scrollTop + off.y,
      width: el.clientWidth,
      height: el.clientHeight,
      right: el.scrollLeft + off.x + el.clientWidth,
      bottom: el.scrollTop + off.y + el.clientHeight
    };
  }
  // On a tile, the paintable region *is* the tile, so ask drawStitch for
  // exactly that and no overdraw on top: the tile already contains the margin,
  // and growing past it would only draw cells that get clipped away.
  const drawRect = tile.full ? viewportRect
    : {left:tile.x, top:tile.y, right:tile.x+tile.w, bottom:tile.y+tile.h,
       width:tile.w, height:tile.h, overdraw:0};
  drawStitch(ctx,scs,drawRect);

  // Record what is now on the canvas so the scroll handler can tell whether a
  // repaint is actually needed. Untiled, drawStitch paints viewportRect grown
  // by the overdraw margin, so that grown rect is the valid region; tiled, the
  // valid region is the tile itself. Null means the whole chart was drawn and
  // any scroll position is already covered.
  if(!tile.full){
    paintedRectRef.current={
      left:tile.x, top:tile.y, right:tile.x+tile.w, bottom:tile.y+tile.h, scs:scs
    };
  }else if(viewportRect){
    const od=chartOverdraw(scs);
    paintedRectRef.current={
      left:viewportRect.left-od, top:viewportRect.top-od,
      right:viewportRect.right+od, bottom:viewportRect.bottom+od,
      scs:scs
    };
  }else{
    paintedRectRef.current={left:-Infinity,top:-Infinity,right:Infinity,bottom:Infinity,scs:scs};
  }
  // Overlays share the chart's geometry, so a tile move invalidates them too.
  const tileChanged = !prevTile || prevTile.x!==tile.x || prevTile.y!==tile.y || prevTile.w!==tile.w || prevTile.h!==tile.h || prevTile.full!==tile.full;
  if(tileChanged)redrawChartOverlays();
},[pat,cmap,scs,sW,sH,showCtr,bsLines,done,stitchView,focusColour,halfStitches,halfDone,stitchZoom,highlightMode,tintColor,tintOpacity,spotDimOpacity,trackerDimLevel,layerVis,bsThickness,lockDetailLevel,lowZoomFade,rowModeActive,currentRow,trackerFabricColour,trackerCanvasTexture,viewBounds,areaOn,workArea]);

// Scroll-driven repaint. Previously every scroll frame ran a full
// renderStitch, which repainted the visible slice plus a 20-cell margin from
// scratch — measured at ~3,500 fillRect calls per touchmove and 51-127 s of
// blocking across 8 pan gestures at 4x CPU throttle. The margin already
// covers small movements, so while the viewport is still inside the painted
// region there is nothing to do and the browser can scroll the existing
// bitmap on its own. Anything that changes what the chart *looks* like goes
// through renderStitch (see its dependency array), which repaints and resets
// the region, so this cannot serve stale pixels.
const renderStitchIfScrolledOut=useCallback(()=>{
  const painted=paintedRectRef.current, el=stitchScrollRef.current;
  if(painted&&el&&painted.scs===scs){
    const off=chartScrollOffset(scs);
    const l=el.scrollLeft+off.x, t=el.scrollTop+off.y;
    const r=l+el.clientWidth, b=t+el.clientHeight;
    if(l>=painted.left&&t>=painted.top&&r<=painted.right&&b<=painted.bottom)return;
  }
  renderStitch();
},[renderStitch,scs]);
// PERF: single/bulk stitch toggles already paint their own changed cells directly
// via paintDoneChanges() (see markColourDone / _commitBulk / _dragMarkOnToggle /
// undoTrack / redoTrack) for instant feedback. Those call sites set
// skipNextFullRedrawRef.current=true right before their setDone() so this effect
// — which would otherwise repaint the *entire visible viewport* just because the
// `done` array reference changed — can skip the redundant full redraw. Anything
// that legitimately needs a full repaint (project load, zoom, view-mode change,
// undo of an edit-mode snapshot, etc.) never sets the flag, so it still gets one.
useEffect(()=>{
  if(skipNextFullRedrawRef.current){skipNextFullRedrawRef.current=false;return;}
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
      message:"Sessions are tracked automatically as you stitch. Your stats are in the Session panel.",
      type:"info",duration:8000,
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
  const tier=lockDetailLevel?3:tierRef.current;
  if(tier<2){const p0=prepareOverlayTile(canvas);if(p0)clearOverlayTile(p0.ctx,p0.tile);return ()=>{cancelAnimationFrame(countingAidsRafRef.current);};}
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
      ctx.fillStyle="rgba(234,88,12,0.85)";ctx.fill();
      ctx.strokeStyle="rgba(234,88,12,1)";ctx.lineWidth=0.5;ctx.stroke();
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
        ctx.strokeStyle="#B85C38";
        ctx.lineWidth=1.4;
        ctx.lineCap="round";
        ctx.lineJoin="round";
        ctx.beginPath();
        ctx.moveTo(px+1,py+5);
        ctx.lineTo(px+3.4,py+7.4);
        ctx.lineTo(px+8,py+2);
        ctx.stroke();
      }else if(isActive){
        const label=String(remaining);
        ctx.font="bold 10px sans-serif";
        ctx.textAlign="left";ctx.textBaseline="top";
        const tw=ctx.measureText(label).width;
        ctx.fillStyle="rgba(184, 92, 56,0.15)";
        ctx.beginPath();
        if(ctx.roundRect)ctx.roundRect(px-2,py-1,tw+6,13,3);else ctx.rect(px-2,py-1,tw+6,13);
        ctx.fill();
        ctx.fillStyle="#B85C38";ctx.fillText(label,px,py);
      }else{
        ctx.fillStyle="rgba(0,0,0,0.3)";ctx.font="8px sans-serif";
        ctx.textAlign="left";ctx.textBaseline="top";
        ctx.fillText(String(remaining),px,py);
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
                  ctx.fillStyle="#B85C38";
                  ctx.beginPath();
                  if(ctx.roundRect)ctx.roundRect(bpx-tw,bpy,tw,11,5);else ctx.rect(bpx-tw,bpy,tw,11);
                  ctx.fill();
                  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="top";
                  ctx.fillText(label,bpx-tw/2,bpy+1.5);
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
                  ctx.fillStyle="#7c3aed";
                  ctx.beginPath();
                  if(ctx.roundRect)ctx.roundRect(bpx,bpy,tw,11,5);else ctx.rect(bpx,bpy,tw,11);
                  ctx.fill();
                  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.textBaseline="top";
                  ctx.fillText(label,bpx+tw/2,bpy+1.5);
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

function _toggleHalfDone(idx, dir) {
  const newHd = new Map(halfDone);
  const hd = { ...(newHd.get(idx) || {}) };
  hd[dir] = hd[dir] ? 0 : 1;
  if (!hd.fwd && !hd.bck) newHd.delete(idx);
  else newHd.set(idx, hd);
  // Track colour for auto-session
  const hs=halfStitches.get(idx);
  if(hs&&hs[dir]&&hs[dir].id)pendingColoursRef.current.add(hs[dir].id);
  setHalfDone(newHd);
  renderStitch();
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
// holds its marker removes it. Reached by right-click (desktop, any mode) or
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
function commitParkMarkers(prev,next){
  const added=next.filter(m=>!prev.some(o=>sameParkMarker(o,m)));
  const removed=prev.filter(m=>!next.some(o=>sameParkMarker(o,m)));
  if(!added.length&&!removed.length)return;
  // Ahead of the render, so a second toggle in the same frame sees this one.
  parkMarkersRef.current=next;
  setParkMarkers(next);
  setTrackHistory(h=>{let n=[...h,{type:"PARK",added,removed}];if(n.length>TRACK_HISTORY_MAX)n=n.slice(n.length-TRACK_HISTORY_MAX);return n;});
  setRedoStack([]);
}
// Apply a PARK history entry forwards (redo) or backwards (undo).
function applyParkEntry(entry,forward){
  const add=forward?entry.added:entry.removed, drop=forward?entry.removed:entry.added;
  const cur=parkMarkersRef.current;
  const next=cur.filter(m=>!drop.some(o=>sameParkMarker(o,m))).concat(add.filter(m=>!cur.some(o=>sameParkMarker(o,m))));
  parkMarkersRef.current=next;
  setParkMarkers(next);
}

// Desktop: right-click a stitch to park / unpark it, in Mark or Navigate
// mode. A touch long-press also raises contextmenu; in Mark mode that
// gesture belongs to useDragMark's rectangle select, and in Navigate mode
// the press-and-hold recogniser below does the parking, so for touch we
// only keep the browser's own menu out of the way.
function handleStitchContextMenu(e){
  if(dragMarkHandlers.onContextMenu)dragMarkHandlers.onContextMenu(e);
  if(e.defaultPrevented||isEditMode||!pat)return;
  if(lastPointerTypeRef.current!=="mouse"){
    if(stitchMode==="navigate")e.preventDefault();
    return;
  }
  if(Date.now()-lastSecondaryPressRef.current>1000)return;
  const gc=gridCoord(stitchRef,e,scs,G,false,chartTileRef.current);
  // Off the chart (the gutter): leave the browser menu alone.
  if(!gc||gc.gx<0||gc.gx>=sW||gc.gy<0||gc.gy>=sH)return;
  e.preventDefault();
  toggleParkAt(gc.gx,gc.gy);
}

function handleStitchKeyDown(e){
  // Navigate mode, chart focused: the arrow keys move the guide crosshair
  // (Shift: 10 stitches), so the guide — and parking at it with Menu or
  // Shift+F10 below — works without a pointer. Claimed here, before the
  // shortcut registry, which skips events that are already handled.
  if(stitchMode==="navigate"&&!isEditMode&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&GUIDE_KEYS[e.key]){
    e.preventDefault();
    moveGuideBy(GUIDE_KEYS[e.key][0]*(e.shiftKey?10:1),GUIDE_KEYS[e.key][1]*(e.shiftKey?10:1));
    return;
  }
  if(e.key!=="ContextMenu"&&!(e.shiftKey&&e.key==="F10"))return;
  const guide=guideRef.current;
  if(!guide||guide.row<0||guide.row>=sH||guide.col<0||guide.col>=sW)return;
  e.preventDefault();
  toggleParkAt(guide.col,guide.row);
}

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
  setHlRow(row);setHlCol(col);
  if(col<vx0+1||col>vx1-2||row<vy0+1||row>vy1-2)centreOnCell(col,row);
  const live=guideLiveRef.current;
  if(live){const lbl=cellThreadLabel(row*sW+col);live.textContent="Guide at row "+(row+1)+", column "+(col+1)+(lbl?", "+lbl:"");}
}
useEffect(()=>{
  if(hlRow<0||hlCol<0)return;
  const live=guideLiveRef.current;
  if(live){const lbl=cellThreadLabel(hlRow*sW+hlCol);live.textContent="Guide at row "+(hlRow+1)+", column "+(hlCol+1)+(lbl?", "+lbl:"");}
},[hlRow,hlCol,pat,cmap,sW]);

// Touch / pen press-and-hold in Navigate mode parks the stitch. Capture-
// phase handlers so they sit alongside useDragMark's (idle in this mode)
// rather than replacing them. The hold is abandoned if the finger moves
// past the tap slop, a second finger lands (pinch), or the browser takes
// the gesture over for a native pan (pointercancel).
function clearNavHold(){
  const h=navHoldRef.current;
  if(h){clearTimeout(h.timer);navHoldRef.current=null;}
}
// Ctrl+click is the Mac secondary click: it parks (via contextmenu) and must
// not also mark the stitch or move the guide.
function isMacSecondaryClick(e){
  return e.button===0&&e.ctrlKey&&!!(window.Shortcuts&&window.Shortcuts.isMac&&window.Shortcuts.isMac());
}
function handleCanvasPointerDownCapture(e){
  lastPointerTypeRef.current=e.pointerType||"mouse";
  if(e.button===2||isMacSecondaryClick(e))lastSecondaryPressRef.current=Date.now();
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
useEffect(()=>clearNavHold,[]);

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

function handleStitchMouseDown(e){
  if(!stitchRef.current||!pat)return;
  stopPanMomentum();
  if(e.button===1||isSpaceDownRef.current){e.preventDefault();startPan(e);return;}
  // Right-click parks (handleStitchContextMenu). Without this a right-click
  // also moved the guide in Navigate mode and toggled half stitches in Mark.
  if(e.button===2||isMacSecondaryClick(e))return;
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
    // it is already on that cell. Parking is right-click or press-and-hold
    // (toggleParkAt).
    if(Date.now()<suppressNavClickUntilRef.current)return;
    e.preventDefault();
    beginNavPress(e,gx,gy);
    return;
  }
  if(gx<0||gx>=sW||gy<0||gy>=sH||!done)return;
  if(areaOn&&!window.WorkArea.contains(workArea,gx,gy))return;
  let idx=gy*sW+gx;

  // ═══ Tracker: Marking half stitches as done (track mode) ═══
  // If cell has half stitches and NO full stitch (or full is done), handle half marking
  const cellHasHalf=halfStitches.has(idx);
  const m2=pat[idx];
  const isFullCell=m2&&m2.id!=="__skip__"&&m2.id!=="__empty__";

  if(cellHasHalf&&(!isFullCell||(done&&done[idx]))){
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

  if(pat[idx].id==="__skip__"||pat[idx].id==="__empty__")return;

  // C3: cell tap / drag-mark / shift+click range / long-press range are all
  // owned by useDragMark (see _dragMarkOnToggle / _dragMarkOnCommitDrag /
  // _dragMarkOnCommitRange below). The mousedown handler keeps only the
  // pan, edit-mode popover, navigate-mode, and half-stitch branches above.
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
        let name="";
        if(cell.type==="blend"){
          name=cell.threads[0].name+"+"+cell.threads[1].name;
        }else{
          let ci=cmap&&cmap[cell.id]; name=ci?ci.name:"";
        }
        setHoverInfo({row:gc.gy+1, col:gc.gx+1, id:cell.id, name:name});
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
  const newZoom=Math.min(maxZoom,Math.max(0.3,oldZoom+delta));
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
// In track mode that gesture *is* drag-marking, so the compositor must not
// take it and the canvas keeps `touch-action: none`. Everywhere else (nav
// mode, edit mode) a one-finger drag is only ever a pan, and the compositor
// does that far better than a JS handler writing scrollLeft on every frame.
//
// Two-finger gestures are always ours — they pinch-zoom the chart, not the
// page — so handleTouchStart still calls preventDefault for them, which stops
// the browser panning a two-finger drag when touch-action would otherwise
// allow it.
function chartOwnsGesture(e){
  return e.touches.length>1||_dragMarkActive;
}

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
    ts.pinchZoom=stitchZoomRef.current;
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
  const dist=Math.hypot(t1.clientX-t0.clientX,t1.clientY-t0.clientY);
  // Absolute from the gesture start rather than compounded per move, so the
  // anchor cannot drift. maxZoom (not the bare 4) so the scroll maths matches
  // the zoom actually applied; ceiling last, as in handleStitchWheel.
  const newZoom=Math.min(maxZoom,Math.max(0.3,ts.pinchZoom*dist/ts.pinchDist));
  const rect=container.getBoundingClientRect();
  const midX=(t0.clientX+t1.clientX)/2-rect.left;
  const midY=(t0.clientY+t1.clientY)/2-rect.top;
  const a=ts.pinchAnchor;
  // Recent midpoints, for the release velocity (handleTouchEnd).
  const now=performance.now();
  (ts.pinchSamples||(ts.pinchSamples=[])).push({t:now,x:midX,y:midY,z:newZoom});
  while(ts.pinchSamples.length>2&&now-ts.pinchSamples[0].t>100)ts.pinchSamples.shift();
  if(newZoom!==stitchZoomRef.current)scheduleZoomUpdate(newZoom);
  // After the zoom render (same frame as scheduleZoomUpdate's rAF), so the
  // content is already its new size when the scroll is clamped to it.
  requestAnimationFrame(()=>{
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
  if(e.touches&&e.touches.length>0)return;
  // A two-finger pan that was still moving coasts on. Only a pan: if the
  // zoom moved, this was a pinch, and coasting would fight it.
  const sm=ts.pinchSamples;
  if(ts.mode==="pinch"&&sm&&sm.length>=2){
    const a=sm[0],b=sm[sm.length-1],dt=b.t-a.t;
    const recent=performance.now()-b.t<80;
    if(dt>0&&recent&&Math.abs(b.z/ts.pinchZoom-1)<0.03){
      const vx=(b.x-a.x)/dt,vy=(b.y-a.y)/dt;
      if(Math.hypot(vx,vy)>0.3)startPanMomentum(vx,vy);
    }
  }
  ts.mode="none"; ts.pinchDist=0; ts.pinchAnchor=null; ts.pinchSamples=null;
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
    try{if(window.Toast&&window.Toast.show)window.Toast.show({message:"No remaining stitches for DMC "+target+(areaOn?" in this work area":""),type:"info"});}catch(_){}
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
      try{if(window.Toast&&window.Toast.show)window.Toast.show({message:"DMC "+colorId+" is parked outside this work area, at row "+(m.y+1)+", column "+(m.x+1)+".",type:"info",duration:4000});}catch(_){}
      return;
    }
  }
  setHlRow(m.y);setHlCol(m.x);
  centreOnCell(m.x,m.y);
}

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
      // Last: in Navigate mode, Esc clears the guide crosshair.
      if(stitchMode==="navigate"&&hlRow>=0&&hlCol>=0){setHlRow(-1);setHlCol(-1);return;}
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

  // Layer toggles. Backstitch moved B→L; all-layers moved A→Shift+A.
  { id: "tracker.layer.full",   keys: "f", scope: "tracker.notedit",
    description: "Toggle full-stitch layer",
    run: () => setLayerVis(v=>({...v,full:!v.full})) },
  { id: "tracker.layer.half",   keys: "h", scope: "tracker.notedit",
    description: "Toggle half-stitch layer",
    run: () => setLayerVis(v=>({...v,half:!v.half})) },
  { id: "tracker.layer.knot",   keys: "k", scope: "tracker.notedit",
    description: "Toggle French-knot layer",
    run: () => setLayerVis(v=>({...v,french_knot:!v.french_knot})) },
  { id: "tracker.layer.bs",     keys: "l", scope: "tracker.notedit",
    description: "Toggle backstitch layer",
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
  { id: "tracker.counting", keys: "c", scope: "tracker",
    description: "Toggle counting aids",
    run: () => setCountingAidsEnabled(v=>!v) },
  // S for Section spotlight. Was F, which tracker.layer.full (a more
  // specific scope) shadowed, so this could never fire.
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
    run: () => setStitchZoom(z=>Math.max(0.3,+(z-0.1).toFixed(2))) },
  { id: "tracker.zoom.fit", keys: "0", scope: "tracker",
    description: "Zoom to fit",
    run: () => fitChart() },
  { id: "tracker.workArea.pick", keys: "w", scope: "tracker",
    description: "Pick a work area",
    run: () => setAreaPickerOpen(true) },

  // Highlight-view-only: focus-colour cycling and highlight modes.
  { id: "tracker.hl.next", keys: ["]", "arrowright"], scope: "tracker.view.highlight",
    description: "Next focus colour",
    run: () => cycleFocusColour(+1) },
  { id: "tracker.hl.prev", keys: ["[", "arrowleft"], scope: "tracker.view.highlight",
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
  return()=>{
    canvas.removeEventListener("touchstart",ts);
    canvas.removeEventListener("touchmove",tm);
    canvas.removeEventListener("touchend",te);
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
// useDragMark owns tap / drag / long-press routing for TOUCH input on the
// canvas. Mouse input continues to flow through handleStitchMouseDown so
// the existing pinch / pan / shift+click / range-mode pathways are intact.
const _dragMarkCellAtPoint=useCallback(function(cx,cy){
  if(!stitchRef.current||!pat)return -1;
  const gc=gridCoord(stitchRef,{clientX:cx,clientY:cy},scs,G,false,chartTileRef.current);
  if(!gc)return -1;
  if(gc.gx<0||gc.gx>=sW||gc.gy<0||gc.gy>=sH)return -1;
  // Margin stitches around a work area are context, not part of it: no tap,
  // drag or range can mark them.
  if(areaOn&&!window.WorkArea.contains(workArea,gc.gx,gc.gy))return -1;
  return gc.gy*sW+gc.gx;
},[pat,sW,sH,scs,areaOn,workArea]);

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

const _commitBulk=useCallback(function(set,intent,source){
  // BUGFIX: read live `done` via doneRef so back-to-back commits before
  // React commits a prior setDone don't rewind earlier in-session marks.
  const cur=doneRef.current;
  if(!pat||!cur||!set||!set.size)return;
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
  if(!changes.length)return;
  pushBulkToggleHistory(changes,source);
  applyDoneCountsDelta(changes,pat,nd);
  doneRef.current=nd;
  // PERF: paint just the changed cells directly instead of a full-viewport
  // renderStitch() redraw (previously called here unconditionally on every
  // drag-mark commit, then AGAIN via the done-dependent useEffect below).
  paintDoneChangesRef.current(changes,nd);
  skipNextFullRedrawRef.current=true;
  setDone(nd);
  _pulseCells(changes.map(function(c){return c.idx;}));
  // BUGFIX (#2): explicitly start/extend the auto-session for drag-mark commits.
  // The diff-based useEffect at line ~1419 sometimes misses bulk commits when
  // setCountsVer + setDone batch into the same render but prevAutoCountRef has
  // already been updated by an interleaving render. Calling recordAutoActivity
  // here guarantees the session timer starts the moment a drag finishes, no
  // matter how many cells were marked. We also pre-update prevAutoCountRef to
  // the new value so the diff-based useEffect won't double-count.
  let _bulkCompleted=0,_bulkUndone=0;
  for(let _i=0;_i<changes.length;_i++){if(changes[_i].oldVal===0)_bulkCompleted++;else _bulkUndone++;}
  if(_bulkCompleted>0||_bulkUndone>0){
    recordAutoActivity(_bulkCompleted,_bulkUndone);
    prevAutoCountRef.current={done:doneCountRef.current,halfDone:(halfStitchCounts&&halfStitchCounts.done)||(prevAutoCountRef.current&&prevAutoCountRef.current.halfDone)||0};
  }
  if(source==='range')_setRectSelectUsed(true);
},[pat,focusColour,_pulseCells,recordAutoActivity,halfStitchCounts]);

const _dragMarkOnToggle=useCallback(function(idx){
  // C3: single-cell tap from useDragMark (touch + mouse). Uses the
  // standard pushTrackHistory machinery for a single-cell undo step.
  // BUGFIX: read live `done` via doneRef so two taps inside one render
  // frame each see the most-recent array, not a stale closure copy.
  const cur=doneRef.current;
  if(!pat||!cur)return;
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
  pushTrackHistory([{idx:idx,oldVal:oldVal}]);
  applyDoneCountsDelta([{idx:idx,oldVal:oldVal}],pat,nd);
  doneRef.current=nd;
  // PERF: paint just this cell directly instead of a full-viewport renderStitch()
  // redraw (previously called here unconditionally on every single tap, then
  // AGAIN via the done-dependent useEffect below).
  paintDoneChangesRef.current([{idx:idx}],nd);
  skipNextFullRedrawRef.current=true;
  setDone(nd);
  // BUGFIX (#2): mirror _commitBulk — explicitly record the single-tap so the
  // session timer starts immediately rather than depending on the doneCount
  // diff useEffect.
  if(oldVal!==nv){
    if(nv)recordAutoActivity(1,0);else recordAutoActivity(0,1);
    prevAutoCountRef.current={done:doneCountRef.current,halfDone:(halfStitchCounts&&halfStitchCounts.done)||(prevAutoCountRef.current&&prevAutoCountRef.current.halfDone)||0};
  }
},[pat,focusColour,isColourLocked,fullStitchMatchesFocus,pushTrackHistory,applyDoneCountsDelta,renderStitch,recordAutoActivity,halfStitchCounts]);

const _dragMarkOnCommitDrag=useCallback(function(set,intent){
  _commitBulk(set,intent,'drag');
},[_commitBulk]);

const _dragMarkOnCommitRange=useCallback(function(set,intent){
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
const _dragMarkActive=_dragMarkFlag&&!isEditMode&&stitchMode==="track"&&!!pat&&!!done;
const _dragMark=(typeof window!=='undefined'&&window.useDragMark)
  ?window.useDragMark({
    w:sW,h:sH,pattern:pat,done:done,
    cellAtPoint:_dragMarkCellAtPoint,
    onToggleCell:_dragMarkOnToggle,
    onCommitDrag:_dragMarkOnCommitDrag,
    onCommitRange:_dragMarkOnCommitRange,
    isEditMode:!_dragMarkActive,
  })
  :{handlers:{},dragState:{mode:'idle',path:new Set(),anchor:null,intent:null}};
const dragMarkHandlers=_dragMark.handlers;
const dragMarkState=_dragMark.dragState;
const dragMarkReset=_dragMark.reset||(()=>{});
// Keep the keyup/blur listener (registered once, on mount, above) calling
// into the CURRENT hook instance's notifyShiftUp — see useDragMark.js (7).
dragMarkNotifyShiftUpRef.current=_dragMark.notifyShiftUp||null;


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

return(
<>
{/* Platform.fileAccept drops the filter on iOS, where .oxs resolves to no UTI
    and would grey out every file in the Files picker. */}
<input ref={loadRef} type="file" accept={window.Platform ? window.Platform.fileAccept(".json,.oxs,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf") : ".json,.oxs,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf"} onChange={loadProject} style={{display:"none"}}/>
<Header page="tracker" onOpen={()=>loadRef.current.click()} onSave={pat?saveProject:null} onExportPDF={pat?()=>setModal('pdf_export'):null} onExportOxs={pat?doExportOxs:null} onNewProject={pat?()=>{if(confirm("Start fresh? Your current project is auto-saved.")){if(typeof ProjectStorage!=='undefined')ProjectStorage.clearActiveProject();else localStorage.removeItem("crossstitch_active_project");if(onGoHome){onGoHome();}else{window.location.href='home.html';}}}:null} onOpenProject={typeof ProjectStorage!=='undefined'?()=>{ProjectStorage.listProjects().then(list=>{setProjectPickerList(list||[]);setProjectPickerOpen(true);}).catch(()=>{setProjectPickerList([]);setProjectPickerOpen(true);});}:undefined} onPreferences={typeof window.PreferencesModal!=='undefined'?()=>setPreferencesOpen(true):undefined} setModal={setModal} projectName={pat&&pal?(projectName || (sW + '×' + sH + ' pattern')):undefined} projectPct={pat&&pal&&totalStitchable>0?Math.round(doneCount/totalStitchable*100):undefined} onNameChange={pat&&pal?(n=>setProjectName(n)):undefined} showAutosaved={!!(pat&&pal)} />
{projectPickerOpen&&<TrackerProjectPicker
  list={projectPickerList}
  currentId={projectIdRef.current}
  onClose={()=>setProjectPickerOpen(false)}
  onPick={(meta)=>{
    // Close the modal immediately so the loading state doesn't appear stuck.
    setProjectPickerOpen(false);
    ProjectStorage.get(meta.id).then(p=>{
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
{!isEditMode&&<div className="info-strip-wrap">
<div className="info-strip" aria-live="polite" role="button" tabIndex={0} title="Open session controls" onClick={()=>{
  setLeftSidebarTab("session");
  setMorePanelOpen(true);
}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setLeftSidebarTab("session");setMorePanelOpen(true);}}}>
  <div className="info-strip-bar">
    {progressPct>=100&&<div className="info-strip-fill info-strip-fill--done" style={{width:"100%"}}/>}
    {progressPct<100&&prevBarPct>0&&<div className="info-strip-fill" style={{width:prevBarPct+"%"}}/>}
    {progressPct<100&&todayBarPct>0&&<div className="info-strip-fill info-strip-today" style={{width:todayBarPct+"%"}}/>}
  </div>
  <div className="info-strip-row">
    <span className="info-strip-pct">{progressPct>=100?<>Complete! {Icons.star()}</>:<>{progressPct.toFixed(1)}%</>}</span>
    {progressPct<100&&totalStitchable>0&&<span className="info-strip-counts">{doneCount.toLocaleString('en-GB')} done &middot; {Math.max(0,totalStitchable-doneCount).toLocaleString('en-GB')} to go</span>}
    {liveAutoStitches>0&&<span className="info-strip-timer"><span className="info-strip-timer-icon" aria-hidden="true">{liveAutoIsPaused?(Icons.pause?Icons.pause():null):(Icons.play?Icons.play():null)}</span> {fmtTime(liveAutoElapsed)} &middot; {formatTimingModeShortLabel(currentTimingMode)}</span>}
  </div>
</div>
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
    const speedPerHour = totalSec > 0 && doneCount > 0 ? Math.round(doneCount / (totalSec/3600)) : 0;
    const remainingStitches = Math.max(0, effectiveCombinedTotal - effectiveCombinedDone);
    const fmtL = window.fmtTimeL || (s => Math.round(s/3600)+'h');
    const progressRows = [
      ['Done', `${Math.round(effectiveCombinedDone).toLocaleString('en-GB')} / ${Math.round(effectiveCombinedTotal).toLocaleString('en-GB')} (${progressPct.toFixed(1)}%)`],
      ['Today', todayStitchesForBar.toLocaleString('en-GB')],
      ['This week', weekStitchesForChip.toLocaleString('en-GB')]
    ];
    const timeRows = [['Time spent', fmtL(totalSec)]];
    if (speedPerHour > 0) {
      timeRows.push(['Average pace', `${speedPerHour.toLocaleString('en-GB')} st/hr`]);
      if (remainingStitches > 0) {
        timeRows.push(['Remaining', fmtL(Math.round(remainingStitches/speedPerHour*3600))]);
      }
    }
    // Build sparkline data: stitches per active day, last 30 active days.
    const sparkDays=(()=>{
      if(!Array.isArray(statsSessions)||statsSessions.length===0)return[];
      const byDay={};
      for(const s of statsSessions){if(s.date&&(s.netStitches||0)>0)byDay[s.date]=(byDay[s.date]||0)+(s.netStitches||0);}
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
        ...(sparkDays.length>=2?[
          React.createElement(window.AppInfoDivider),
          React.createElement(window.AppInfoSection, { title: 'Daily progress' },
            React.createElement('div',{style:{display:'flex',alignItems:'flex-end',gap:2,height:40,paddingTop:4},'aria-label':'Daily stitches bar chart'},
              sparkDays.map(({date,count})=>React.createElement('div',{
                key:date,
                title:date+': '+count.toLocaleString('en-GB')+' stitches',
                style:{flex:'1 1 0',minWidth:3,height:Math.max(2,Math.round((count/sparkMax)*38))+'px',background:'var(--accent)',borderRadius:'1px 1px 0 0',opacity:0.75}
              }))
            )
          )
        ]:[])
      ]
    });
  })()}
</div>
</div>}
{!isEditMode&&completionProjection&&completionProjection.status==='projected'&&progressPct<100&&(
  <div className="completion-projection-bar" aria-live="polite">
    <span className="completion-projection-text">{completionProjection.projectedText}</span>
    {completionProjection.stitchesPerHour>0&&<span className="completion-projection-speed">{completionProjection.stitchesPerHour.toLocaleString('en-GB')} st/hr recently</span>}
  </div>
)}
{hlIntroBannerVisible&&!isEditMode&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--surface-secondary)",border:"1px solid var(--accent-light)",borderRadius:'var(--radius-sm)',padding:"6px 10px",fontSize:'var(--text-xs)',color:"var(--accent)",marginBottom:'var(--s-1)',gap:'var(--s-2)'}}>
  <span>Highlight mode — press <kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>1</kbd>–<kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>4</kbd> to change style, <kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>C</kbd> for counting aids, <kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>[</kbd> <kbd style={{fontSize:10,padding:"0 3px",border:"1px solid var(--accent-light)",borderRadius:3,background:"var(--surface)"}}>]</kbd> to cycle colours</span>
  <button onClick={()=>{setHlIntroBannerVisible(false);clearTimeout(hlIntroTimerRef.current);}} aria-label="Dismiss" style={{background:"none",border:"none",cursor:"pointer",color:"var(--accent-light)",flexShrink:0,padding:0,lineHeight:1,display:'inline-flex'}}>{Icons.x?Icons.x():null}</button>
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
        <button onClick={()=>setSessionSavedToast(null)} aria-label="Dismiss" style={{display:'inline-flex',alignItems:'center'}}>{Icons.x?Icons.x():null}</button>
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
<div className="cs-page-content" style={{maxWidth:(!statsView&&pat&&pal)?'none':1100,margin:(!statsView&&pat&&pal)?0:"0 auto",padding:(!statsView&&pat&&pal)?0:"20px 16px"}}>
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
  {loadError&&<div style={{background:"var(--danger-soft)",border:"1px solid var(--danger-soft)",borderRadius:'var(--radius-md)',padding:"8px 14px",fontSize:'var(--text-sm)',color:"var(--danger)",marginBottom:'var(--s-3)'}}>{loadError}</div>}
  {copied==="progress"&&<div style={{background:"var(--success-soft)",border:"1px solid var(--success-soft)",borderRadius:'var(--radius-md)',padding:"8px 14px",fontSize:'var(--text-sm)',color:"var(--success)",fontWeight:600,marginBottom:'var(--s-3)',display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} Progress summary copied to clipboard!</div>}
  {importSuccess && (
    <div style={{
      background: "var(--success-soft)", border: "1px solid var(--success-soft)", borderRadius:'var(--radius-md)',
      padding: "8px 14px", fontSize:'var(--text-sm)', color: "var(--success)", fontWeight: 600, marginBottom:'var(--s-3)',
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12
    }}>
      <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} {importSuccess}</span>
      <button onClick={()=>setImportSuccess(null)} style={{
        padding: "3px 10px", borderRadius:'var(--radius-sm)', border: "1px solid var(--success-soft)", background: "var(--surface)",
        cursor: "pointer", fontSize:'var(--text-xs)', fontWeight: 600, color: "var(--success)", flexShrink: 0
      }}>Dismiss</button>
    </div>
  )}

  {statsView&&pat&&<StatsContainer statsTab={statsTab} setStatsTab={setStatsTab} statsSessions={statsSessions} statsSettings={statsSettings} totalCompleted={doneCount} totalStitches={totalStitchable} halfStitchCounts={halfStitchCounts} onEditNote={editSessionNote} onUpdateSettings={setStatsSettings} onClose={()=>setStatsView(false)} projectName={projectName||(sW+'\u00D7'+sH+' pattern')} palette={pal} colourDoneCounts={colourDoneCounts} achievedMilestones={achievedMilestones} done={done} pat={pat} sW={sW} sH={sH} doneSnapshots={doneSnapshots} setDoneSnapshots={setDoneSnapshots} sections={sections} currentProjectId={projectIdRef.current} onOpenProject={(meta)=>{ProjectStorage.get(meta.id).then(project=>{if(project&&(project.pattern||project.p)&&project.settings){processLoadedProject(project);try{ProjectStorage.setActiveProject(project.id);}catch(_){};setStatsView(false);}}).catch(()=>{});}}/>}

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
            <span style={{padding:"3px 8px", background:"var(--surface-secondary)", color:"var(--accent)", borderRadius:'var(--radius-sm)', border:"1px solid var(--accent-light)", fontWeight:600, fontSize:'var(--text-xs)', width:64, textAlign:"center", flexShrink:0}}>.oxs</span>
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
        <a href="home.html?tab=create" style={{color:"var(--accent)", fontWeight:600, textDecoration:"none", display:'inline-flex', alignItems:'center', gap:4}}><span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronRight?Icons.chevronRight():null}</span>Pattern Creator</a>
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
            aria-label={"Highlighted colour: "+(selEntry.name||selEntry.id)}
            title={selEntry.name||selEntry.id}
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
    <div className="ppal-wrap">
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
          {liveAutoStitches>0&&<span className="ppal-session-chip" role="button" tabIndex={0} title="Open Session controls" onClick={()=>{setLeftSidebarTab("session");setMorePanelOpen(true);}} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setLeftSidebarTab("session");setMorePanelOpen(true);}}}>
            {liveAutoIsPaused||manuallyPaused?(Icons.pause?Icons.pause():null):(Icons.play?Icons.play():null)}{" "}{fmtTime(liveAutoElapsed)}{" · "}{liveAutoStitches}{" st · "}{formatTimingModeShortLabel(currentTimingMode)}
          </span>}
        </div>
      </div>
      {/* ─ Sort row ─ */}
      <div className="ppal-sort-row" role="group" aria-label="Sort colour list">
        {[["count","Remaining"],["done","% done"],["id","DMC ID"]].map(([k,l])=>
          <button key={k} className={"ppal-sort-btn"+(legendSort===k?" ppal-sort-btn--on":"")} onClick={()=>setLegendSort(k)} aria-pressed={legendSort===k}>{l}</button>
        )}
      </div>
      {/* ─ Active colour tile ─ */}
      {focusColour&&cmap&&cmap[focusColour]&&(!areaColourCounts||((scopedColourCounts[focusColour]||{}).total+(scopedColourCounts[focusColour]||{}).halfTotal>0))?(()=>{
        const fc=cmap[focusColour];
        const dc=scopedColourCounts[focusColour]||{total:0,done:0,halfTotal:0,halfDone:0};
        const totalWH=dc.total+dc.halfTotal*0.5;
        const doneWH=dc.done+dc.halfDone*0.5;
        const pct=totalWH>0?Math.round(doneWH/totalWH*100):0;
        const complete=doneWH>=totalWH&&totalWH>0;
        const swRgb="rgb("+fc.rgb+")";
        return <div className={"ppal-active-tile"+(complete?" ppal-active-tile--done":"")}>
          <div className="ppal-active-swatch-wrap">
            {window.ProgressRing
              ?React.createElement(window.ProgressRing,{pct:pct,size:56,strokeWidth:5,colour:swRgb,trackColour:"var(--border)"})
              :<span className="ppal-active-swatch" style={{background:swRgb}}/>}
          </div>
          <div className="ppal-active-info">
            <span className="ppal-active-id">DMC {focusColour}</span>
            <span className="ppal-active-name">{fc.type==="blend"?fc.threads[0].name+"+"+fc.threads[1].name:fc.name}</span>
            <span className="ppal-active-count">{dc.done}/{dc.total} · {pct}%</span>
          </div>
          <button className="ppal-find-btn" onClick={jumpToNextStitch} title="Jump to next remaining stitch" aria-label={"Find next unfinished stitch of DMC "+focusColour}>{Icons.magnify()}</button>
        </div>;
      })()
      :<div className="ppal-active-none">{Icons.pointing?Icons.pointing():null}{" Tap a colour below to select it"}</div>}
      {/* ─ Colour tile list ─ */}
      {pal&&<div className="ppal-tile-list" role="list">
        {(()=>{
          const rows=legendRows||[];
          return rows.map(({p,dc,pct,complete})=>{
            const isFocused=focusColour===p.id;
            const swRgb="rgb("+p.rgb+")";
            return <div key={p.id} role="button" tabIndex={0}
              className={"ppal-tile"+(isFocused?" ppal-tile--on":"")+(complete?" ppal-tile--done":"")}
              onClick={()=>{if(isEditMode){setEditModalColor(p);return;}setStitchView("highlight");setFocusColour(p.id);if(typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(max-width:899px)").matches)setLeftSidebarOpen(false);}}
              onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();if(isEditMode){setEditModalColor(p);return;}setStitchView("highlight");setFocusColour(p.id);if(typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(max-width:899px)").matches)setLeftSidebarOpen(false);}}}
              aria-label={"Select DMC "+p.id}
              title={"DMC "+p.id+(complete?" (done)":"")}>
              <div className="ppal-tile-swatch" style={{background:swRgb}}
                role="button" tabIndex={0} aria-label={"View DMC "+p.id+" detail"}
                onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setPaletteDetail({id:p.id,name:p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name,rgb:p.rgb,anchorRect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}});}}
                onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setPaletteDetail({id:p.id,name:p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name,rgb:p.rgb,anchorRect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}});}}}
              />
              <div className="ppal-tile-body">
                <div className="ppal-tile-id-row">
                  <span className="ppal-tile-id">{p.id}</span>
                  <span className="ppal-tile-name">{p.type==="blend"?p.threads[0].name+"+"+p.threads[1].name:p.name}</span>
                  <span className="ppal-tile-pct">{pct}%</span>
                </div>
                <div className="ppal-tile-bar"><div className="ppal-tile-bar-fill" style={{width:pct+"%"}}/></div>
                <div className="ppal-tile-count-row">
                  <span className="ppal-tile-count">{dc.done}/{dc.total}{dc.halfTotal>0?" · "+dc.halfDone+"/"+dc.halfTotal+" half":""}</span>
                  <div className="ppal-tile-actions">
                    {parkCountsByColour[p.id]>0&&<button
                      className="ppal-tile-park-btn"
                      onClick={e=>{e.stopPropagation();goToParkedThread(p.id);}}
                      title={"Go to where DMC "+p.id+" is parked"+(parkCountsByColour[p.id]>1?" ("+parkCountsByColour[p.id]+" places; press again for the next)":"")}
                      aria-label={"Go to where DMC "+p.id+" is parked"}
                      style={{background:isParkLayerVisible(p.id)?swRgb:undefined,borderColor:isParkLayerVisible(p.id)?swRgb:"var(--border)",color:isParkLayerVisible(p.id)?(luminance(p.rgb)>140?"#000":"#fff"):"var(--text-tertiary)"}}
                    >P{parkCountsByColour[p.id]>1?"\u00D7"+parkCountsByColour[p.id]:""}</button>}
                    <button
                      className="ppal-tile-done-btn"
                      onClick={e=>{e.stopPropagation();if(!complete){const u=dc.total-dc.done;if(u>50&&!confirm("Mark all "+u+" stitches of DMC "+p.id+(areaOn?" in this work area":"")+" as done?"))return;}markColourDone(p.id,!complete);}}
                      style={{borderColor:complete?"var(--danger-soft)":"var(--success-soft)",background:complete?"var(--danger-soft)":"var(--success-soft)",color:complete?"var(--danger)":"var(--success)"}}
                      title={complete?"Mark as not done":"Mark all as done"}
                    >{complete?<>{Icons.undo?Icons.undo():null}{" Undo"}</>:<>{Icons.check?Icons.check():null}{" Done"}</>}</button>
                  </div>
                </div>
              </div>
            </div>;
          });
        })()}
      </div>}
    </div>
    </div>}

    <div className="ppal-canvas-col">
    <div className="canvas-area" style={{padding:"12px 16px",position:"relative"}}>
    {isShiftDown&&_dragMarkActive&&<div style={{position:"absolute",top:4,right:20,zIndex:30,pointerEvents:"none",display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:'var(--radius-md)',background:"var(--accent)",color:"var(--surface)",fontSize:'var(--text-xs)',fontWeight:600,boxShadow:'var(--shadow-sm)'}}>
      <span aria-hidden="true" style={{display:"inline-flex"}}>{Icons.crop?Icons.crop():null}</span>
      <span>{dragMarkState&&dragMarkState.mode==='shiftRange'?"Drag to select a rectangle, release to apply":"Shift held — drag from a cell to select a rectangle"}</span>
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
        <span className="range-anchor-bar__text">Tap the opposite corner to fill a rectangle</span>
        {!anchorDone&&<button type="button" className="range-anchor-bar__btn" onClick={()=>{dragMarkReset();toggleParkAt(ax,ay);}}>
          <span aria-hidden="true" className="range-anchor-bar__icon">{Icons.parkFlag?Icons.parkFlag():null}</span>{parked?"Remove park marker":"Park thread here"}
        </button>}
        <button type="button" className="range-anchor-bar__btn" onClick={dragMarkReset}>
          <span aria-hidden="true" className="range-anchor-bar__icon">{Icons.x?Icons.x():null}</span>Cancel
        </button>
      </div>;
    })()}
    {showNavHelp&&!isEditMode&&(()=>{const isTouch=hasTouchRef.current;return(
    <div style={{marginBottom:'var(--s-2)',padding:"14px 16px",background:"var(--surface)",border:"1px solid var(--accent-light)",borderRadius:'var(--radius-lg)',fontSize:'var(--text-sm)'}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontWeight:700,fontSize:'var(--text-md)',color:"var(--text-primary)"}}>Navigation &amp; Controls</span>
        <button onClick={()=>setShowNavHelp(false)} aria-label="Dismiss" style={{background:"none",border:"none",color:"var(--text-tertiary)",cursor:"pointer",padding:"0 4px",lineHeight:1,display:'inline-flex'}}>{Icons.x?Icons.x():null}</button>
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
          ["Park a thread",isTouch?"Press and hold a stitch: Nav mode parks at once; in Mark mode tap Park thread here":"Right-click a stitch. Right-click again to remove the marker"],
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
      if(blockAdvanceToast) return <div style={{fontSize:'var(--text-sm)',color:"var(--accent)",background:"var(--accent-light)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"1px solid var(--accent-border)",fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6}}>{Icons.check?Icons.check():null} {blockAdvanceToast.label} complete — {blockAdvanceToast.stitches} stitches</span>
        <div style={{display:"flex",gap:'var(--s-2)'}}>
          {blockAdvanceToast.next&&<button onClick={()=>{setFocusBlock(blockAdvanceToast.next);setBlockAdvanceToast(null);}} style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:4,border:"1px solid var(--accent-border)",background:"var(--surface)",cursor:"pointer",fontWeight:600,color:"var(--accent)"}}>Next block</button>}
          <button onClick={()=>{setBlockAdvanceToast(null);setFocusBlock(null);}} style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:4,border:"none",background:"none",cursor:"pointer",color:"var(--text-tertiary)"}}>Stay</button>
        </div>
      </div>;
      if(stitchMode==="track") return <div style={{fontSize:'var(--text-sm)',color:"var(--accent)",background:"var(--accent-light)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--accent-border)"}}>{hasTouchRef.current?"Tap or drag to mark · Long-press for a rectangle · Two fingers to pan and zoom":"Click or drag to mark/unmark cross stitches · Shift+click or long-press for rectangle fill · Space+drag to pan · Ctrl+scroll to zoom · Ctrl+Z undo"}{trackHistory.length>0?` · ${trackHistory.length} undo step${trackHistory.length>1?"s":""} available`:""}</div>;
      if(stitchMode==="navigate") return <div style={{fontSize:'var(--text-sm)',color:"var(--text-primary)",background:"var(--surface-tertiary)",padding:"6px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--border)"}}>{hasTouchRef.current?"Drag to pan · Tap to place or clear the guide · Press and hold a stitch to park its thread":"Drag to pan · Click to place or clear the guide · Right-click a stitch to park its thread · T for track mode"}</div>;
      if(!shortcutsHintDismissed&&pat&&trackerLoadCount>=3) return <div style={{fontSize:'var(--text-sm)',color:"var(--text-tertiary)",background:"var(--surface-secondary)",padding:"5px 14px",borderRadius:'var(--radius-md)',marginBottom:6,border:"0.5px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:'var(--s-2)'}}><span>{Icons.lightbulb()} Press <kbd>?</kbd> for keyboard shortcuts</span><button onClick={()=>{localStorage.setItem("shortcuts_hint_dismissed","1");setShortcutsHintDismissed(true);}} aria-label="Dismiss" style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",lineHeight:1,padding:0,display:"inline-flex",alignItems:"center"}}>{Icons.x?Icons.x():null}</button></div>;
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
          <span className="work-area-bar__pct" aria-live="polite" aria-label={"Row "+(currentRow+1)+": "+(st.total?left.toLocaleString("en-GB")+" stitches left":"no stitches")}>{st.total?(left?left.toLocaleString("en-GB")+" left":"Done"):"Empty"}</span>
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
    <div ref={stitchScrollRef} className={"tracker-chart-scroll"+(drawer?" is-drawer":"")} onScroll={()=>{if(!scrollRafRef.current){scrollRafRef.current=requestAnimationFrame(()=>{renderStitchIfScrolledOut();scrollRafRef.current=null;})}}} style={{overflow:"auto",border:"0.5px solid var(--border)",borderRadius:"8px 8px 0 0",background:"var(--surface-tertiary)",cursor:isPanning?"grabbing":isSpaceDownRef.current?"grab":(!isEditMode&&stitchMode==="track"?(isShiftDown&&_dragMarkActive?"cell":"crosshair"):!isEditMode&&stitchMode==="navigate"?"grab":"default"),transition:"max-height 0.3s",position:"relative"}} onMouseUp={handleMouseUp} onMouseLeave={handleStitchMouseLeave}>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', width: 'max-content', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: G, height: G, flexShrink: 0, position: 'sticky', left: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', zIndex: 4 }}></div>
        {areaOn?colRuler.slice(viewBounds.x0,viewBounds.x1):colRuler}
      </div>
      <div style={{ display: 'flex', width: 'max-content' }}>
        <div style={{ position: 'sticky', left: 0, zIndex: 3, width: G, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
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
        <div className="tracker-chart-layer" style={{ position: 'absolute', left: -viewBounds.x0*scs, top: -viewBounds.y0*scs, width: sW*scs+2, height: sH*scs+2 }}>
          <canvas ref={stitchRef} role="application" tabIndex="0" aria-label="Cross stitch pattern grid. In Navigate mode the arrow keys move the guide; Menu or Shift+F10 parks a thread at the guide." style={{display:"block",position:"absolute",zIndex:2, left: -G, top: -G, touchAction:_dragMarkActive?"none":"pan-x pan-y", WebkitTouchCallout:"none"}} onMouseDown={handleStitchMouseDown} onMouseMove={handleStitchMouseMove} onKeyDown={handleStitchKeyDown} {...dragMarkHandlers} onContextMenu={handleStitchContextMenu} onPointerDownCapture={handleCanvasPointerDownCapture} onPointerMoveCapture={handleCanvasPointerMoveCapture} onPointerUpCapture={clearNavHold} onPointerCancelCapture={clearNavHold}/>

          {/* B2 — drag-mark / range-select visual overlay (touch) */}
          {_dragMarkActive&&dragMarkState&&(dragMarkState.path.size>0||dragMarkState.anchor!=null||dragMarkPulse)&&(
            <div className={"drag-mark-overlay drag-mark-overlay--"+(dragMarkState.intent||'mark')}
                 style={{position:"absolute",top:-G,left:-G,zIndex:6,pointerEvents:"none",
                         width:sW*scs+G,height:sH*scs+G}}>
              {[...dragMarkState.path].map(function(idx){
                var x=(idx%sW)*scs+G, y=Math.floor(idx/sW)*scs+G;
                return <div key={"p"+idx} className="drag-mark-cell"
                            style={{left:x,top:y,width:scs,height:scs}}/>;
              })}
              {dragMarkState.anchor!=null&&(function(){
                var idx=dragMarkState.anchor;
                var x=(idx%sW)*scs+G, y=Math.floor(idx/sW)*scs+G;
                return <div key={"a"+idx} className="drag-mark-anchor"
                            style={{left:x,top:y,width:scs,height:scs}}/>;
              })()}
              {dragMarkPulse&&[...dragMarkPulse].map(function(idx){
                var x=(idx%sW)*scs+G, y=Math.floor(idx/sW)*scs+G;
                return <div key={"x"+idx} className="drag-mark-pulse cell-pulse"
                            style={{left:x,top:y,width:scs,height:scs}}/>;
              })}
            </div>
          )}

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

    <div style={{background:"var(--text-primary)", color:"var(--surface)", padding:"6px 10px", borderRadius:"0 0 8px 8px", fontSize:'var(--text-sm)', fontWeight:500, display:"flex", alignItems:"center", minHeight:30, marginBottom:'var(--s-3)'}}>
      {/* Written directly by renderHoverBar(); React never updates these children. */}
      <span ref={hoverBarRef} className="tracker-hover-bar">{"—"}</span>
      <span ref={guideLiveRef} className="tracker-sr-only" aria-live="polite"/>
      {/* Touch has no Esc, and re-tapping the exact guide cell is easy to
          miss, so the guide gets a visible way out wherever it is shown. */}
      {hlRow>=0&&hlCol>=0&&<button type="button" className="tracker-hover-bar__clear" onClick={()=>{setHlRow(-1);setHlCol(-1);}} title="Clear the guide crosshair" aria-label="Clear the guide crosshair">
        <span aria-hidden="true" style={{display:"inline-flex"}}>{Icons.x?Icons.x():null}</span>Clear guide
      </button>}
    </div>

    {doneCount===0&&totalStitchable>0&&stitchMode==="track"&&<div style={{fontSize:'var(--text-xs)',color:"var(--accent-ink)",background:"var(--accent-soft)",border:"1px solid var(--accent-border)",borderRadius:'var(--radius-sm)',padding:"6px 10px",marginBottom:'var(--s-2)',textAlign:"center"}}>Tap any stitch on the canvas to mark it as done</div>}

    </div>{/* end canvas-area */}
    {/* ─ Phone chip ─ */}
    {pal&&focusColour&&cmap&&cmap[focusColour]
      ?<button className="ppal-phone-chip" onClick={cycleLeftSidebar} aria-label="Open colour palette panel">
          <span className="ppal-phone-chip-sw" style={{background:"rgb("+cmap[focusColour].rgb+")"}}/>
          <span>DMC {focusColour}</span>
        </button>
      :<button className="ppal-phone-chip ppal-phone-chip--empty" onClick={cycleLeftSidebar} aria-label="Open colour palette panel">
          {Icons.menu?Icons.menu():null}{" Palette"}
        </button>
    }

    {/* ─ Mode strip ─ */}
    <div className={"toolbar-row"+(isEditMode?" toolbar-row--edit":"")+" ppal-mode-strip"} role="toolbar" aria-label="Canvas controls">
      <button className={"ppal-mode-btn"+(leftSidebarMode==="open"?" ppal-mode-btn--on":"")} onClick={cycleLeftSidebar} aria-label={leftSidebarMode==="hidden"?"Open colour palette":"Cycle colour palette mode"} aria-pressed={leftSidebarMode==="open"} title="Toggle colour palette">
        <span className="ppal-mode-btn-icon">{Icons.palette?Icons.palette():null}</span>
        <span className="ppal-mode-btn-label">Colours</span>
      </button>
      <button className={"ppal-mode-btn"+(stitchMode==="track"?" ppal-mode-btn--on":"")+(isEditMode?" tb-btn--red":" tb-btn--green")} onClick={()=>setStitchMode("track")} title={isEditMode?"Modify pattern (M)":"Mark stitches (T)"} aria-pressed={stitchMode==="track"}>
        <span className="ppal-mode-btn-icon">{Icons.check()}</span>
        <span className="ppal-mode-btn-label">{isEditMode?"Modify":"Mark"}</span>
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
    <div id="ppal-more-panel" className={"ppal-more-panel"+(morePanelOpen?" ppal-more-panel--open":"")} role="dialog" aria-label="Tracker controls" aria-hidden={!morePanelOpen}>
      <div className="ppal-more-header">
        <span className="ppal-more-title">Controls</span>
        <button className={"ppal-utility-chip"+(wakeLockActive?" ppal-utility-chip--on":"")} onClick={toggleWakeLock} aria-pressed={wakeLockActive} title={wakeLockActive?"Screen stays awake — tap to release":"Keep screen awake"}>
          {Icons.dot?Icons.dot():null}{" "}{wakeLockActive?"Awake":"Sleep"}
        </button>
        <button className={"ppal-utility-chip"+(focusMode?" ppal-utility-chip--on":"")} onClick={()=>setFocusMode(v=>!v)} aria-pressed={focusMode} title={focusMode?"Exit focus mode (F)":"Enter focus mode (F)"}>
          {focusMode?(Icons.focusExit?Icons.focusExit():null):(Icons.focus?Icons.focus():null)}{" Focus"}
        </button>
        <button className="ppal-more-close" onClick={()=>setMorePanelOpen(false)} aria-label="Close controls">{Icons.x()}</button>
      </div>
      <div className="ppal-more-tabs">
        {[["highlight","Highlight"],["view","View"],["session","Session"],["layers","Layers"],["tools","Tools"]].map(([k,l])=>
          <button key={k} aria-pressed={leftSidebarTab===k} className={"ppal-more-tab"+(leftSidebarTab===k?" ppal-more-tab--on":"")} onClick={()=>setLeftSidebarTab(k)}>{l}</button>
        )}
      </div>
      <div className="ppal-more-content">

        {/* -- Highlight tab -- */}
        {leftSidebarTab==="highlight"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Highlight style</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["isolate","Isolate"],["outline","Outline"],["tint","Tint"],["spotlight","Spotlight"]].map(([v,l])=>
                <button key={v} className="ppal-hl-mode-btn"
                  style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid "+(highlightMode===v&&stitchView==="highlight"?"var(--accent)":"var(--border)"),background:highlightMode===v&&stitchView==="highlight"?"var(--accent)":"var(--surface)",color:highlightMode===v&&stitchView==="highlight"?"var(--accent-ink)":"var(--text-secondary)",fontSize:'var(--text-sm)',cursor:"pointer",fontWeight:highlightMode===v&&stitchView==="highlight"?600:400}}
                  onClick={()=>{setStitchView("highlight");setHighlightMode(v);}} aria-pressed={highlightMode===v&&stitchView==="highlight"}
                >{l}</button>
              )}
            </div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={countingAidsEnabled} onChange={e=>setCountingAidsEnabled(e.target.checked)} className="ppal-check"/>
            <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Counting aids</span>
          </label>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={!!highlightSkipDone} onChange={e=>setHighlightSkipDone(e.target.checked)} className="ppal-check"/>
            <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Skip done stitches</span>
          </label>
          {focusColour&&<button onClick={()=>setFocusColour(null)} style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",alignSelf:"flex-start"}}>Clear focus</button>}
        </div>}

        {/* -- View tab -- */}
        {leftSidebarTab==="view"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Stitch view</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["symbol","Symbol"],["highlight","Highlight"],["realistic","Realistic"]].map(([v,l])=>
                <button key={v}
                  style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid "+(stitchView===v?"var(--accent)":"var(--border)"),background:stitchView===v?"var(--accent)":"var(--surface)",color:stitchView===v?"var(--accent-ink)":"var(--text-secondary)",fontSize:'var(--text-sm)',cursor:"pointer",fontWeight:stitchView===v?600:400}}
                  onClick={()=>setStitchView(v)} aria-pressed={stitchView===v}
                >{l}</button>
              )}
            </div>
          </div>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Zoom</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={()=>setStitchZoom(z=>Math.max(0.3,+(z-0.25).toFixed(2)))} style={{padding:"5px 10px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:16,cursor:"pointer",color:"var(--text-secondary)"}} aria-label="Zoom out">&#8722;</button>
              <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)",minWidth:40,textAlign:"center"}}>{Math.round((stitchZoom||1)*100)}%</span>
              <button onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} style={{padding:"5px 10px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:16,cursor:"pointer",color:"var(--text-secondary)"}} aria-label="Zoom in">&#43;</button>
              <button onClick={fitSZ} style={{padding:"5px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)"}}>Fit</button>
            </div>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
            <input type="checkbox" checked={!!lockDetailLevel} onChange={e=>setLockDetailLevel(e.target.checked)} className="ppal-check"/>
            <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Lock detail level</span>
          </label>
        </div>}

        {/* -- Session tab -- */}
        {leftSidebarTab==="session"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {currentAutoSessionRef.current?<>
            <div style={{background:"var(--surface-secondary)",borderRadius:"var(--radius-md)",padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:'var(--text-sm)',color:"var(--text-tertiary)"}}>Active session</span>
                {liveAutoIsPaused||manuallyPaused
                  ?<span style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:"var(--radius-sm)",background:"var(--warning-soft)",color:"var(--warning)",fontWeight:600}}>Paused</span>
                  :<span style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:"var(--radius-sm)",background:"var(--success-soft)",color:"var(--success)",fontWeight:600}}>Active</span>
                }
                <Tooltip text={formatTimingModeDescription(currentTimingMode)+' Open preferences to change.'} width={220}>
                  <button type="button"
                    onClick={e=>{e.stopPropagation();setPreferencesInitialCategory('tracker');setPreferencesOpen(true);}}
                    style={{fontSize:'var(--text-xs)',padding:"2px 8px",borderRadius:"var(--radius-sm)",background:"var(--surface)",color:"var(--text-secondary)",fontWeight:600,border:"1px solid var(--border)",cursor:"pointer"}}
                    aria-label={"Session timing mode: "+formatTimingModeLabel(currentTimingMode)+". "+formatTimingModeDescription(currentTimingMode)+" Open preferences to change."}
                  >{formatTimingModeLabel(currentTimingMode)}</button>
                </Tooltip>
              </div>
              <div style={{display:"flex",gap:24}}>
                <div><div style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>Time</div><div style={{fontSize:'var(--text-lg)',fontWeight:700,color:"var(--text-primary)",fontVariantNumeric:"tabular-nums"}}>{fmtTime(liveAutoElapsed)}</div></div>
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
                onClick={()=>{if(finaliseAutoSessionRef.current)finaliseAutoSessionRef.current();setMorePanelOpen(false);}}
                style={{flex:1,padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--danger-soft)",background:"var(--danger-soft)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--danger)",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
                aria-label="End session"
              >
                {Icons.x?Icons.x():null}{" End session"}
              </button>
            </div>
          </>:<>
            <p style={{fontSize:'var(--text-sm)',color:"var(--text-tertiary)",margin:0}}>No active session. Stitching automatically starts a session.</p>
            <button
              onClick={()=>{setSessionConfigOpen(true);setMorePanelOpen(false);}}
              style={{padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--accent)",background:"var(--accent)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--accent-ink)",fontWeight:600}}
            >Session settings</button>
            {explicitSession&&<button onClick={()=>setExplicitSession(null)} style={{padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)"}}>End explicit session</button>}
          </>}
          {statsSessions&&statsSessions.length>0&&<button
            onClick={()=>{setMorePanelOpen(false);setStatsView(true);}}
            style={{padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",display:"flex",alignItems:"center",gap:6,marginTop:4}}
          >{Icons.barChart?Icons.barChart():null} View Stats</button>}
        </div>}

        {/* -- Layers tab -- */}
        {leftSidebarTab==="layers"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
          {STITCH_LAYERS.map(layer=>
            <label key={layer.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
              <input type="checkbox" checked={layerVis[layer.id]!==false} onChange={e=>setLayerVis(v=>({...v,[layer.id]:e.target.checked}))} className="ppal-check"/>
              <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>{layer.label}</span>
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
            <button onClick={()=>{commitParkMarkers(parkMarkersRef.current,[]);setParkLayers({});}} style={{marginTop:4,padding:"5px 10px",borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",background:"var(--surface)",fontSize:'var(--text-sm)',cursor:"pointer",color:"var(--text-secondary)",alignSelf:"flex-start"}}>Clear all</button>
          </>}
        </div>}

        {/* -- Tools tab -- */}
        {leftSidebarTab==="tools"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <div style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>Stitch mode</div>
            <div style={{display:"flex",gap:6}}>
              {[["track","Mark"],["navigate","Navigate"]].map(([v,l])=>
                <button key={v}
                  style={{flex:1,padding:"8px 12px",borderRadius:"var(--radius-sm)",border:"1px solid "+(stitchMode===v?"var(--accent)":"var(--border)"),background:stitchMode===v?"var(--accent)":"var(--surface)",color:stitchMode===v?"var(--accent-ink)":"var(--text-secondary)",fontSize:'var(--text-sm)',cursor:"pointer",fontWeight:stitchMode===v?600:400}}
                  onClick={()=>setStitchMode(v)} aria-pressed={stitchMode===v}
                >{l}</button>
              )}
            </div>
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
              <button onClick={()=>setFocusBlock(_getStartBlock())} style={{fontSize:'var(--text-xs)',padding:0,background:"none",border:"none",color:"var(--accent)",cursor:"pointer",fontFamily:"inherit"}}>Restart sections</button>
              <button onClick={()=>setStyleOnboardingOpen(true)} style={{fontSize:'var(--text-xs)',padding:0,background:"none",border:"none",color:"var(--accent)",cursor:"pointer",fontFamily:"inherit"}}>Change style</button>
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
          {/* RT live tracking toggle */}
          <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer",userSelect:"none"}}>
            <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}>Live tracking (RT)</span>
            <input type="checkbox" checked={!!wastePrefs.enabled} onChange={e=>{
              if(!e.target.checked&&typeof setWastePrefs==='function'){
                // Turning off: dispatch to TrackerApp via a custom event
                // so the disable modal (which needs StashBridge) can be shown.
                window.dispatchEvent(new CustomEvent('cs:rtDisableRequest'));
              }else if(e.target.checked&&typeof setWastePrefs==='function'){
                // Turning on: snapshot stash if (and only if) we don't already
                // have a snapshot for this project session. Capturing on every
                // toggle-on would move the baseline forward across keep-then-
                // re-enable cycles and silently break Restore (DEFECT-001).
                if(typeof StashBridge!=='undefined'){
                  StashBridge.getGlobalStash().then(function(snap){
                    if(window.__ensureRtStashSnapshot)window.__ensureRtStashSnapshot(snap);
                    else if(window.__setRtStashSnapshot)window.__setRtStashSnapshot(snap);
                  }).catch(function(){});
                }
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
        onClose:()=>{ setImportDialog(null); setImportImage(null); },
        onGenerate:(settings)=>{
          try{
            let result=parseImagePattern(importImage,{
              maxWidth:settings.maxWidth, maxHeight:settings.maxHeight,
              maxColours:settings.maxColours,
              skipWhiteBg:settings.skipWhiteBg, bgThreshold:settings.bgThreshold
            });
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
            setTimeout(()=>setLoadError(null),4000);
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

          <SliderRow label="Max Colours" val={importMaxColours} setVal={setImportMaxColours} min={5} max={40} />

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
            setTimeout(()=>setLoadError(null), 4000);
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
  {sessionConfigOpen&&<SessionConfigModal liveAutoElapsed={liveAutoElapsed} liveAutoStitches={liveAutoStitches} onClose={()=>setSessionConfigOpen(false)} onStart={cfg=>{
    setExplicitSession({startTime:Date.now(),timeAvail:cfg.timeAvail,stitchGoal:cfg.stitchGoal,startStitches:doneCount,blocks:[]});
    setSessionConfigOpen(false);
  }}/>}
  {sessionSummaryData&&(()=>{
    const activeSessionIdx=statsSessions?statsSessions.length:0;
    const sessionBreadcrumbs=(breadcrumbs||[]).filter(b=>b&&b.sessionIdx===activeSessionIdx);
    const firstSessionBreadcrumb=sessionBreadcrumbs.length>0?sessionBreadcrumbs[0]:null;
    return <SessionSummaryModal data={sessionSummaryData} prevAvgSpeed={statsSessions&&statsSessions.length>1?Math.round(statsSessions.slice(0,-1).reduce((s,sess)=>s+(typeof sess.netStitches==='number'?sess.netStitches:(sess.stitchesCompleted||0)),0)/Math.max(1,statsSessions.slice(0,-1).reduce((s,sess)=>s+(sess.durationSeconds||0),0))*3600):0} hasBreadcrumbs={sessionBreadcrumbs.length>0} onViewBreadcrumbs={()=>{setBreadcrumbVisible(true);setSessionSummaryData(null);if(firstSessionBreadcrumb&&stitchScrollRef.current){const b=firstSessionBreadcrumb;const off=chartScrollOffset();const cx=G+b.bx*blockW*scs+blockW*scs/2-off.x;const cy=G+b.by*blockH*scs+blockH*scs/2-off.y;const el=stitchScrollRef.current;el.scrollLeft=Math.max(0,cx-el.clientWidth/2);el.scrollTop=Math.max(0,cy-el.clientHeight/2);}}} onClose={()=>setSessionSummaryData(null)}/>;
  })()}
  {resumeRecap&&(()=>{
    // A3: Resume recap modal — fires once per project load when prior sessions exist.
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
    const pct=r.totalSt>0?Math.round(r.doneSt/r.totalSt*100):0;
    const minutes=Math.max(0,Math.round((sm.ms||0)/60000));
    let speedNote=null;
    if(sm.perHour!=null&&sm.perHourAvg!=null){
      const diff=sm.perHour-sm.perHourAvg;
      if(diff>=5)speedNote=(sm.perHour-sm.perHourAvg)+' / hr faster than your average';
      else if(diff<=-5)speedNote=Math.abs(diff)+' / hr slower than your average';
    }
    return <div className="modal-overlay resume-recap-overlay" role="dialog" aria-modal="true" aria-labelledby="resume-recap-title" onClick={dismiss}>
      <div className="modal-content resume-recap-modal" onClick={e=>e.stopPropagation()}>
        <div className="resume-recap-header">
          <div>
            <h3 id="resume-recap-title" className="resume-recap-title">Welcome back to {r.projectName}</h3>
            {lastStr&&<div className="resume-recap-sub">{lastStr}</div>}
          </div>
          <button className="resume-recap-close" onClick={dismiss} aria-label="Close">{Icons.x()}</button>
        </div>
        <div className="resume-recap-body">
          <div className="resume-recap-progress">
            <div className="resume-recap-progress-row">
              <span className="resume-recap-progress-label">Overall progress</span>
              <span className="resume-recap-progress-pct">{pct}%</span>
            </div>
            <div className="resume-recap-bar"><div className="resume-recap-bar-fill" style={{width:pct+'%'}}/></div>
            <div className="resume-recap-progress-meta">{r.doneSt.toLocaleString('en-GB')} / {r.totalSt.toLocaleString('en-GB')} stitches</div>
          </div>
          <div className="resume-recap-section-label">Your last session</div>
          <div className="resume-recap-grid">
            <div className="resume-recap-card">
              <div className="resume-recap-card-num">{(sm.count||0).toLocaleString('en-GB')}</div>
              <div className="resume-recap-card-lbl">stitches</div>
            </div>
            <div className="resume-recap-card">
              <div className="resume-recap-card-num">{minutes} m</div>
              <div className="resume-recap-card-lbl">stitch time</div>
            </div>
            <div className="resume-recap-card">
              <div className="resume-recap-card-num">{sm.perHour!=null?sm.perHour:'—'}</div>
              <div className="resume-recap-card-lbl">stitches / hr</div>
            </div>
          </div>
          {speedNote&&<div className="resume-recap-note">{speedNote}</div>}
        </div>
        <div className="resume-recap-footer">
          <button className="resume-recap-btn" onClick={()=>{dismiss();if(typeof onGoHome==='function')onGoHome();else window.location.href='home.html';}}>Switch project</button>
          <button className="resume-recap-btn" onClick={()=>{dismiss();setStatsView(true);}}>Stats</button>
          <button className="resume-recap-btn resume-recap-btn--primary" onClick={dismiss} autoFocus>Continue stitching</button>
        </div>
      </div>
    </div>;
  })()}
  {modal==="about"&&<SharedModals.About onClose={()=>setModal(null)} />}
  {modal==="pdf_export"&&<PdfExportModal onClose={()=>setModal(null)} onExport={()=>{
    if(window.ExportPdf)window.ExportPdf.run({pat,pal,sW,sH,bsLines,partialStitches,fabricCt,skeinPrice,projectName,projectDesigner});
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
              const gs=stash['dmc:'+d.id]||stash[d.id]||{owned:0};
              const newOwned=Math.max(0,gs.owned-d.skeins);
              await StashBridge.updateThreadOwned(d.id,newOwned);
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
              const gs=stash['dmc:'+d.id]||stash[d.id]||{owned:0};
              const deduct=Math.max(0,d.skeins-1);
              const newOwned=Math.max(0,gs.owned-deduct);
              await StashBridge.updateThreadOwned(d.id,newOwned);
            }
            setGlobalStash(await StashBridge.getGlobalStash());
            if(typeof ProjectStorage!=='undefined'&&ProjectStorage.markProjectFinished&&projectIdRef.current){
              await ProjectStorage.markProjectFinished(projectIdRef.current);
              v3FieldsRef.current=Object.assign(v3FieldsRef.current||{},{finishStatus:'completed',completedAt:new Date().toISOString()});
            }
          })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
        }} style={{padding:"10px 20px",fontSize:'var(--text-lg)',borderRadius:'var(--radius-md)',border:"1px solid var(--accent-light)",background:"var(--surface-secondary)",color:"var(--accent)",cursor:"pointer",fontWeight:600}}>Deduct Partial (keep 1 per colour)</button>
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
        <button onClick={()=>{window.location.search='?mode=stats&tab=showcase';}} style={{fontSize:'var(--text-sm)',color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}>See your updated stats <span aria-hidden="true" style={{display:'inline-flex'}}>{Icons.chevronRight?Icons.chevronRight():null}</span></button>
      </div>
    </div>
  </div>}

  {/* ── RT: mid-project disable modal ──────────────────────────────── */}
  {modal==="rt_disable_confirm"&&<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rt-disable-title" onClick={()=>setModal(null)}>
    <div className="modal-content" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
      <button className="modal-close" onClick={()=>setModal(null)} aria-label="Close">{Icons.x?Icons.x():null}</button>
      <h3 id="rt-disable-title" style={{marginTop:0,fontSize:18,color:'var(--text-primary)'}}>Turn off live tracking?</h3>
      <p style={{fontSize:'var(--text-sm)',color:'var(--text-secondary)',marginBottom:'var(--s-4)'}}>Choose what to do with the thread deductions made so far.</p>
      <div style={{display:'flex',flexDirection:'column',gap:'var(--s-2)'}}>
        <button onClick={()=>{
          setWastePrefs(function(prev){return Object.assign({},prev,{enabled:false});});
          setModal(null);
        }} style={{padding:'10px 20px',fontSize:'var(--text-sm)',borderRadius:'var(--radius-md)',border:'none',background:'var(--accent)',color:'var(--surface)',cursor:'pointer',fontWeight:600}}>
          Keep deductions so far
        </button>
        <button onClick={()=>{
          // Restore stash to pre-project snapshot values, then disable.
          (async()=>{
            const consumption=rtConsumptionRef.current||{};
            for(const id of Object.keys(consumption)){
              const c=consumption[id];
              if(!c||c.ownedSkeins==null)continue;
              try{await StashBridge.updateThreadOwned(id,c.ownedSkeins);}
              catch(e){console.warn('RT restore failed for '+id+':',e);}
            }
            try{const fresh=await StashBridge.getGlobalStash();setGlobalStash(fresh);}catch(_){}
          })().then(()=>{
            // Snapshot represented "pre-project" state; we just rolled back to
            // it, so it's stale. Clearing forces the next enable to re-snapshot
            // from the (now restored) live stash. (DEFECT-001)
            rtStashSnapshotRef.current={};
            setWastePrefs(function(prev){return Object.assign({},prev,{enabled:false});});
            setModal(null);
          }).catch(()=>{
            rtStashSnapshotRef.current={};
            setWastePrefs(function(prev){return Object.assign({},prev,{enabled:false});});
            setModal(null);
          });
        }} style={{padding:'10px 20px',fontSize:'var(--text-sm)',borderRadius:'var(--radius-md)',border:'1px solid var(--border)',background:'var(--surface-secondary)',color:'var(--text-primary)',cursor:'pointer',fontWeight:500}}>
          Restore stash to before this project
        </button>
        <button onClick={()=>setModal(null)} style={{padding:'8px 20px',fontSize:'var(--text-sm)',borderRadius:'var(--radius-md)',border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text-secondary)',cursor:'pointer'}}>
          Cancel (keep tracking)
        </button>
      </div>
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
              const c=rtConsumption&&rtConsumption[d.id];
              if(!c)return null;
              const remText=c.skeinsRemaining!=null
                ?(c.skeinsRemaining<0?React.createElement('span',{style:{color:'var(--danger)'}},c.skeinsRemaining.toFixed(2)):c.skeinsRemaining.toFixed(2))
                :'—';
              return React.createElement('tr',{key:d.id,style:{borderTop:'1px solid var(--border)'}},
                React.createElement('td',{style:{padding:'5px 10px',display:'flex',alignItems:'center',gap:6}},
                  React.createElement('span',{style:{width:10,height:10,borderRadius:'50%',background:'rgb('+(d.rgb||[128,128,128]).join(',')+')',display:'inline-block',flexShrink:0}}),
                  'DMC '+d.id+(d.name?' \u2014 '+d.name:'')
                ),
                React.createElement('td',{style:{padding:'5px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}},c.skeinsConsumed.toFixed(2)),
                React.createElement('td',{style:{padding:'5px 10px',textAlign:'right',fontVariantNumeric:'tabular-nums'}},remText)
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={()=>{
        (async()=>{
          // Flush any remaining RT write before closing.
          if(rtDebounceRef.current){clearTimeout(rtDebounceRef.current);rtDebounceRef.current=null;}
          await flushRtStashWriteRef.current();
          if(typeof ProjectStorage!=='undefined'&&ProjectStorage.markProjectFinished&&projectIdRef.current){
            await ProjectStorage.markProjectFinished(projectIdRef.current);
            v3FieldsRef.current=Object.assign(v3FieldsRef.current||{},{finishStatus:'completed',completedAt:new Date().toISOString()});
          }
          // Project finished — the snapshot is no longer meaningful for any
          // future re-open of this project. Clear so any further enable starts
          // fresh from the live stash (DEFECT-001).
          rtStashSnapshotRef.current={};
        })().then(()=>{setStashDeducted(true);setModal(null);}).catch(()=>{setStashDeducted(true);setModal(null);});
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
              <span style={{fontFamily:"monospace",fontWeight:700,fontSize:'var(--text-xl)'}}>{currentEntry.symbol}</span>
              <span style={{fontWeight:600,fontSize:'var(--text-md)'}}>DMC {currentEntry.id}</span>
              <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)",flex:1}}>{currentEntry.name}</span>
              <span style={{fontSize:'var(--text-xs)',color:"var(--accent)",fontWeight:600}}>Current</span>
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
                  <span style={{fontFamily:"monospace",fontWeight:700,fontSize:'var(--text-lg)',width:18,textAlign:"center"}}>{p.symbol}</span>
                  <span style={{fontWeight:600,fontSize:'var(--text-md)',minWidth:52}}>DMC {p.id}</span>
                  <span style={{fontSize:'var(--text-sm)',color:"var(--text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                  <span style={{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}>{p.count} st</span>
                  {isCurrent&&<span style={{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--accent)",background:"var(--accent-light)",padding:"2px 8px",borderRadius:'var(--radius-lg)'}}>Current</span>}
                </div>
              );
            })}
          </div>

          {!isEmpty && (
            <button onClick={()=>{
              if(confirm(`Remove stitch at Row ${cellEditPopover.row}, Col ${cellEditPopover.col}? It will be marked as empty.`)){
                handleStitchRemoval(cellEditPopover.idx);
              }
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
  {halfDisambig&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:10001}} onClick={()=>setHalfDisambig(null)}>
    <div className="hs-scale-in" style={{
      position:"fixed",left:halfDisambig.x-50,top:halfDisambig.y-60,
      background:"var(--surface)",borderRadius:'var(--radius-md)',boxShadow:"0 4px 16px rgba(0,0,0,0.2)",padding:"6px 8px",
      display:"flex",flexDirection:"column",gap:'var(--s-1)',border:"1px solid var(--border)",minWidth:100
    }} onClick={e=>e.stopPropagation()}>
      <button onClick={()=>_markHalfDoneFromDisambig(halfDisambig.idx,"fwd")} style={{
        display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:'var(--radius-sm)',border:"none",
        background:"var(--surface-secondary)",cursor:"pointer",fontSize:'var(--text-sm)',fontWeight:500,color:"var(--accent)"
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="0,0 0,14 14,14" fill="var(--accent-light)"/></svg>
        Mark /
      </button>
      <button onClick={()=>_markHalfDoneFromDisambig(halfDisambig.idx,"bck")} style={{
        display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:'var(--radius-sm)',border:"none",
        background:"var(--surface-secondary)",cursor:"pointer",fontSize:'var(--text-sm)',fontWeight:500,color:"var(--accent)"
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14"><polygon points="0,0 14,0 0,14" fill="var(--accent-light)"/></svg>
        Mark \
      </button>
    </div>
  </div>}

{celebration&&<MilestoneCelebration milestone={celebration} onDismiss={()=>setCelebration(null)}/>}
{/* Touch-1 H-2: Focus mini-bar. Renders only when focus mode is on.
    The Exit button never fades — it's the user's only way out. */}
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
    return <span className="cs-focus-swatch" style={{background:"rgb("+selEntry.rgb.join(",")+")"}} title={selEntry.name||selEntry.id}/>;
  })()}
  <button type="button" onClick={()=>{if(typeof undoTrack==='function')undoTrack();}} aria-label="Undo" title="Undo">{Icons.undo&&Icons.undo()}</button>
  <button type="button" onClick={()=>setStitchZoom(z=>Math.max(0.3,+(z-0.25).toFixed(2)))} aria-label="Zoom out" title="Zoom out">{Icons.minus&&Icons.minus()}</button>
  <button type="button" onClick={()=>setStitchZoom(1)} aria-label="Reset zoom" title="Reset zoom">{Math.round((stitchZoom||1)*100)}%</button>
  <button type="button" onClick={()=>setStitchZoom(z=>Math.min(4,+(z+0.25).toFixed(2)))} aria-label="Zoom in" title="Zoom in">{Icons.plus&&Icons.plus()}</button>
  <button type="button" className="cs-focus-exit" onClick={()=>setFocusMode(false)} aria-label="Exit focus mode" title="Exit focus mode (Esc)">
    {Icons.x&&Icons.x()}<span style={{marginLeft:6}}>Exit focus</span><kbd style={{marginLeft:8,padding:"1px 6px",fontSize:11,fontWeight:600,background:"var(--surface-alt,var(--surface))",border:"1px solid var(--line)",borderRadius:4,fontFamily:"inherit",color:"var(--text-secondary)"}}>Esc</kbd>
  </button>
</div>}
{/* color-3 (C2): swatch detail popover (portalled to body) */}
{paletteDetail&&window.SwatchDetailPopover&&React.createElement(window.SwatchDetailPopover,{thread:paletteDetail,anchorRect:paletteDetail.anchorRect,onClose:()=>setPaletteDetail(null)})}
</div>
</>);
}
window.TrackerApp=TrackerApp;
if(!window.__UNIFIED__)ReactDOM.createRoot(document.getElementById("root")).render(<TrackerApp/>);
if (typeof SyncEngine !== 'undefined') SyncEngine.registerBeforeUnloadSnapshot();
