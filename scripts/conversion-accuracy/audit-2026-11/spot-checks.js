'use strict';
// Audit B's spot checks on three photos, plus "Balanced without the edge-shade fold".
// Run from the repository root: node scripts/conversion-accuracy/audit-2026-11/spot-checks.js
const path=require('path');const M=require('./measure.js');const {H,W,v}=M;
(async()=>{for(const f of ['astronaut.png','chelsea.png','kodim05.png'])for(const L of [100,150]){const p=await H.prepare(path.join(M.IMG,f),L);
 const cfg=L===100?[['Balanced',v({})],['More detail',v({orphans:0})],['Tidier',v({orphans:1,stitchCleanup:{enabled:true,protectDetails:false}})],['Gaussian Soften 1',v({smooth:1,smoothType:'gaussian'})],['40-thread cap',v({maxC:40})],['Balanced, no fold',null]]:[['Balanced',v({})]];
 for(const [n,s] of cfg){let r;if(!s){const o=W.mergeEdgeBlendColours;W.mergeEdgeBlendColours=()=>{};r=H.runWorker(p.linear.data,p.w,p.h,v({}));W.mergeEdgeBlendColours=o;}else r=H.runWorker(p.linear.data,p.w,p.h,s);
  const m=H.score(r,p.ref,p.w,p.h);console.log([f,p.w+'x'+p.h,n.padEnd(18),m.cellDE.toFixed(2),m.edgeDE.toFixed(2),r.confettiData.final.singlesPct.toFixed(2),r.confettiData.final.pct.toFixed(2),m.threads+'/'+m.symbols].join('\t'));}}})();
