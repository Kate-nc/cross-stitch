/* useStitchCounts.js — Phase B step E: Stitch-counter hook.
   ═══════════════════════════════════════════════════════════
   Extracted from TrackerApp.  Owns the T-5 invariant counters
   (doneCountRef, colourDoneCountsRef, countsVer) and the two
   mutator functions (recomputeAllCounts, applyDoneCountsDelta).

   Loaded as a plain <script> before tracker-app.js.
   Exposes window.useStitchCounts.

   Parameters
   ──────────
     pat          — current pattern array (triggers full recompute)
     done         — current done Int8Array (read during recompute)
     halfStitches — current half-stitch Map (triggers full recompute)
     halfDone     — current half-done Map (invalidates half counters only)
     sW           — pattern width (work-area counts only)

   Returns
   ───────
     doneCountRef, colourDoneCountsRef, countsVer,
     recomputeAllCounts, applyDoneCountsDelta, applyHalfDoneDelta,
     areaCountsFor, areaCountsRef

   Work-area counts
   ────────────────
   areaCountsFor(area, done, halfDone) gives the counts inside a work area
   (WorkArea.buildCounts in work-area.js). They are built by one scan of the
   area, then kept up to date by the same two delta functions as the
   whole-pattern counts, so a mark costs what it changed, not the area's size.
   A delta only applies when the caller says which marks it started from
   (`baseDone`, or `baseHalf`/`nextHalf` for halves) and those are the marks
   the area counts reflect; anything else marks them stale. They are rebuilt,
   deliberately, when:
     - the area, pattern, half-stitch layout or width changes (project load,
       area change, pattern edit);
     - recomputeAllCounts runs (reconcile after a pattern change, another
       tab's or device's progress merged in);
     - the marks being read are not the ones the counts reflect (any path
       that replaced `done` or `halfDone` without a delta);
     - a delta arrived without its starting marks, or from other marks.  */
(function () {
  'use strict';

  var R = (typeof window !== 'undefined' && window.React) || null;

  window.useStitchCounts = function useStitchCounts({ pat, done, halfStitches, halfDone, sW }) {
    var useRef    = R.useRef;
    var useState  = R.useState;
    var useEffect = R.useEffect;

    // ── Incremental stitch counters ──
    // T-5 invariant: `doneCountRef.current` and `colourDoneCountsRef.current`
    // MUST be derivable from (pat, done, halfStitches, halfDone) at all times.
    // There are exactly two valid ways to keep them in sync:
    //   1. Full rebuild — `recomputeAllCounts(pat, done, halfStitches, halfDone)`
    //      after any change that is not a single-cell flip (load, undo, paste,
    //      regenerate, palette swap, halfStitches mutation, etc.).
    //   2. Incremental — `applyDoneCountsDelta(changes, pat, newDone)` after a
    //      stitch flip where you know exactly which indices changed. Halves
    //      use the half-only effect below when their marks change.
    // If you mutate `done` and forget both, the counter (`Stitches done` chip,
    // rail progress bars, milestone celebrations, autosave snapshot) silently
    // drifts. Add a recomputeAllCounts call when in doubt — it's O(w·h) but
    // still <2 ms on 300×300 grids.
    const doneCountRef=useRef(0);
    const colourDoneCountsRef=useRef({});
    const[countsVer,setCountsVer]=useState(0);
    // Work-area counts (see the header): WorkArea.buildCounts state, or null.
    const areaCountsRef=useRef(null);
    function staleArea(){if(areaCountsRef.current)areaCountsRef.current.stale=true;}
    function areaCountsFor(area,doneNow,hdNow){
      var WA=typeof window!=='undefined'&&window.WorkArea;
      if(!area||!pat||!WA||!WA.buildCounts){areaCountsRef.current=null;return null;}
      var st=areaCountsRef.current;
      if(!st||st.stale||!WA.sameRect(st,area)||st.pat!==pat||st.hs!==(halfStitches||null)||st.sW!==sW
         ||st.doneSrc!==(doneNow||null)||st.halfSrc!==(hdNow||null)){
        st=areaCountsRef.current=WA.buildCounts(area,pat,sW,doneNow,halfStitches,hdNow);
        st.builds=(areaCountsRef.builds=(areaCountsRef.builds||0)+1);
      }
      return st;
    }
    function recomputeAllCounts(patArr,doneArr,hs,hd){
      // A full recount rebuilds the area too, unless it was just built from these very marks.
      var ast=areaCountsRef.current;
      if(ast&&!(ast.pat===patArr&&ast.doneSrc===(doneArr||null)&&ast.hs===(hs||null)&&ast.halfSrc===(hd||null)))staleArea();
      let dc=0,cdc={};
      if(patArr){
        for(let i=0;i<patArr.length;i++){const id=patArr[i].id;if(id==="__skip__"||id==="__empty__")continue;if(!cdc[id])cdc[id]={total:0,done:0,halfTotal:0,halfDone:0};cdc[id].total++;if(doneArr&&doneArr[i]){dc++;cdc[id].done++;}}
        if(hs)hs.forEach(function(hsv,idx){
          if(hsv.fwd){var id=hsv.fwd.id;if(!cdc[id])cdc[id]={total:0,done:0,halfTotal:0,halfDone:0};cdc[id].halfTotal++;var hdv=hd&&hd.get(idx);if(hdv&&hdv.fwd)cdc[id].halfDone++;}
          if(hsv.bck){var id=hsv.bck.id;if(!cdc[id])cdc[id]={total:0,done:0,halfTotal:0,halfDone:0};cdc[id].halfTotal++;var hdv=hd&&hd.get(idx);if(hdv&&hdv.bck)cdc[id].halfDone++;}
        });
      }
      doneCountRef.current=dc;colourDoneCountsRef.current=cdc;setCountsVer(function(v){return v+1;});
    }
    // baseDone: the marks `changes` were made to (newDoneArr's source). Without
    // it the work-area counts cannot know they are in step, and rebuild.
    function applyDoneCountsDelta(changes,patArr,newDoneArr,baseDone){
      if(!changes||!changes.length||!patArr)return;
      var st=areaCountsRef.current;
      if(st&&!st.stale){
        if(baseDone&&baseDone===st.doneSrc&&patArr===st.pat){window.WorkArea.applyDoneDelta(st,changes,newDoneArr);st.doneSrc=newDoneArr;}
        else st.stale=true;
      }
      var dc=doneCountRef.current,cdc=colourDoneCountsRef.current;
      // Shallow-copy only affected colour entries
      var touched={};
      for(var i=0;i<changes.length;i++){
        var idx=changes[i].idx,oldV=changes[i].oldVal,newV=newDoneArr[idx];
        if(oldV===newV)continue;
        var id=patArr[idx].id;if(id==="__skip__"||id==="__empty__")continue;
        if(!touched[id]){touched[id]=true;cdc[id]=cdc[id]?{total:cdc[id].total,done:cdc[id].done,halfTotal:cdc[id].halfTotal,halfDone:cdc[id].halfDone}:{total:0,done:0,halfTotal:0,halfDone:0};}
        if(oldV&&!newV){dc--;cdc[id].done--;}
        else if(!oldV&&newV){dc++;cdc[id].done++;}
      }
      doneCountRef.current=dc;colourDoneCountsRef.current=cdc;setCountsVer(function(v){return v+1;});
    }
    // Known half-side edits update the live colour counter before React renders; the effect below reconciles maps.
    // baseHalf/nextHalf: the halfDone maps before and after the edit. Several
    // sides edited into one new map pass the same pair each time.
    function applyHalfDoneDelta(idx,dir,oldVal,newVal,hs,baseHalf,nextHalf){
      const st=areaCountsRef.current;
      if(st&&!st.stale){
        if(!baseHalf||!nextHalf||hs!==st.hs)st.stale=true;
        else if(st.halfSrc===baseHalf||(st.halfSrc===nextHalf&&baseHalf!==nextHalf)){window.WorkArea.applyHalfDelta(st,idx,dir,oldVal,newVal);st.halfSrc=nextHalf;}
        else st.stale=true;
      }
      const side=hs&&hs.get(idx)&&hs.get(idx)[dir];
      if(!side||!!oldVal===!!newVal)return;
      const cdc=colourDoneCountsRef.current,c=cdc[side.id];
      if(c){cdc[side.id]={...c,halfDone:c.halfDone+(newVal?1:-1)};setCountsVer(v=>v+1);}
    }
    // Full recompute only on structural changes (pattern load, half-stitch structure edits)
    useEffect(()=>{recomputeAllCounts(pat,done,halfStitches,halfDone);},[pat,halfStitches]);

    // Half marks must invalidate colour counts, without scanning the full grid on each tap.
    useEffect(()=>{
      const cdc=colourDoneCountsRef.current;
      Object.keys(cdc).forEach(id=>{cdc[id]={...cdc[id],halfDone:0};});
      if(halfStitches)halfStitches.forEach((hs,idx)=>{
        const hd=halfDone&&halfDone.get(idx);
        if(!hd)return;
        ['fwd','bck'].forEach(side=>{if(hs[side]&&hd[side]&&cdc[hs[side].id])cdc[hs[side].id].halfDone++;});
      });
      setCountsVer(v=>v+1);
    },[halfStitches,halfDone]);

    return { doneCountRef, colourDoneCountsRef, countsVer, recomputeAllCounts, applyDoneCountsDelta, applyHalfDoneDelta, areaCountsFor, areaCountsRef };
  };
})();
