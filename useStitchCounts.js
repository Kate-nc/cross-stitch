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
     halfDone     — current half-done Map (read during recompute)

   Returns
   ───────
     doneCountRef, colourDoneCountsRef, countsVer,
     recomputeAllCounts, applyDoneCountsDelta                    */
(function () {
  'use strict';

  var R = (typeof window !== 'undefined' && window.React) || null;

  window.useStitchCounts = function useStitchCounts({ pat, done, halfStitches, halfDone }) {
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
    //      always go through path 1.
    // If you mutate `done` and forget both, the counter (`Stitches done` chip,
    // rail progress bars, milestone celebrations, autosave snapshot) silently
    // drifts. Add a recomputeAllCounts call when in doubt — it's O(w·h) but
    // still <2 ms on 300×300 grids.
    const doneCountRef=useRef(0);
    const colourDoneCountsRef=useRef({});
    const[countsVer,setCountsVer]=useState(0);
    function recomputeAllCounts(patArr,doneArr,hs,hd){
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
    function applyDoneCountsDelta(changes,patArr,newDoneArr){
      if(!changes||!changes.length||!patArr)return;
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
    // Full recompute only on structural changes (pattern load, half-stitch structure edits)
    useEffect(()=>{recomputeAllCounts(pat,done,halfStitches,halfDone);},[pat,halfStitches]);

    return { doneCountRef, colourDoneCountsRef, countsVer, recomputeAllCounts, applyDoneCountsDelta };
  };
})();
