/* Home-only update workflow: import review first, then explicit alignment and
 * difference review. The existing importer owns format coverage and page layout. */
(function() {
  'use strict';
  const C=window.ChartUpdates;
  function el(tag,text,parent,attrs) {
    const n=document.createElement(tag);if(text!=null)n.textContent=text;
    Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,v));if(parent)parent.appendChild(n);return n;
  }
  function download(value,name) {
    const blob=value instanceof Blob?value:new Blob([JSON.stringify(value,(_,v)=>ArrayBuffer.isView(v)?Array.from(v):v,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=el('a',null,document.body,{href:url,download:name});a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  C.open=async function(id) {
    let base=await ProjectStorage.prepareChartUpdate(id);
    const previousFocus=document.activeElement;
    const dialog=el('dialog',null,document.body,{'class':'chart-update-dialog','aria-labelledby':'chart-update-title'});
    el('h2','Update chart: '+(base.project.name||'Untitled project'),dialog,{id:'chart-update-title'});
    el('p','End stitching sessions and save your work before updating. Changes made while this review is open require a fresh preview. The project identity, notes, sessions and thread inventory are retained.',dialog);
    const content=el('div',null,dialog),status=el('p','',dialog,{role:'status','aria-live':'polite'});
    const close=el('button','Close',dialog,{type:'button','class':'btn'});
    function dismiss(){dialog.close();dialog.remove();if(previousFocus)previousFocus.focus();}
    close.onclick=dismiss;dialog.addEventListener('cancel',e=>{e.preventDefault();if(!close.disabled)dismiss();});
    dialog.showModal();
    function error(e){status.textContent=e.message||String(e);}
    function button(label,parent,fn){const b=el('button',label,parent,{type:'button','class':'btn'});b.onclick=()=>Promise.resolve().then(fn).catch(error);return b;}
    function field(label,tag,value,parent,type) {
      const l=el('label',label+' ',parent),input=el(tag,null,l);if(type)input.type=type;if(value!=null)input.value=value;return input;
    }
    function showPreview(incoming,file) {
      content.replaceChildren();status.textContent='';
      el('p','This is a chart difference preview, after import review. Symbols and palette ordering are ignored for matching. Only a unique match at confirmed coordinates with the same stitch geometry and thread transfers automatically. Incoming completion marks are ignored.',content);
      const form=el('div',null,content,{'class':'chart-update-fields'});
      const mode=field('Update type','select',null,form);
      el('option','Corrected full chart',mode,{value:'replace'});el('option','Add chart pages',mode,{value:'append'});
      const dx=field('Column offset','input',0,form,'number'),dy=field('Row offset','input',0,form,'number');
      dx.step=dy.step='1';
      el('p','For a corrected chart, offsets move OLD coordinates into the new chart. For added pages, offsets place the INCOMING chart on the existing canvas. Use the import review’s Pages tab to arrange PDF pages first. Offsets are zero-based whole cells. Overlapping different content requires a choice.',content);
      const details=el('details',null,content);el('summary','Inserted pages or separate region offsets',details);
      el('p','For a corrected full chart with a local shift, enter non-overlapping OLD rectangles as JSON: [{"x":0,"y":20,"w":80,"h":40,"dx":0,"dy":20}]. Rectangles use x, y inclusive and x+w, y+h exclusive. Other coordinates use the offsets above. Objects spanning different offsets are archived for manual repair.',details);
      const regions=field('Old region mappings','textarea','[]',details);
      const align=field('I have checked the page placement and old-to-new coordinate alignment','input',null,content,'checkbox');
      const diff=el('div',null,content),actions=el('div',null,content),choices={};
      let review,currentOptions;
      const apply=button('Apply reviewed update',actions,async()=>{
        if(!align.checked||!review||!review.ready)throw Error('Check alignment and resolve every ambiguous item first.');
        apply.disabled=true;close.disabled=true;
        try {
          const snapshotId=await ProjectStorage.applyChartUpdate(id,base.token,incoming,currentOptions,choices,file);
          content.replaceChildren();status.textContent='Chart updated. A recoverable snapshot and the source file were saved. No thread was consumed by migration.';
          button('Download pre-update project',content,()=>download(base.project,(base.project.name||'project')+'-before-update.json'));
          button('Review recovery snapshots',content,showStart);
          el('p','Snapshot reference: '+snapshotId,content);
        } finally {apply.disabled=false;close.disabled=false;}
      });
      function draw() {
        diff.replaceChildren();status.textContent='';review=null;apply.disabled=true;
        try {
          currentOptions={mode:mode.value,dx:Number(dx.value),dy:Number(dy.value),regions:JSON.parse(regions.value)};
          if(dx.value===''||dy.value==='')throw Error('Enter both coordinate offsets.');
          review=C.preview(base.project,incoming,currentOptions,choices);
          el('h3','Differences',diff);
          el('p',review.dimensions.before.join(' × ')+' cells becomes '+review.dimensions.after.join(' × ')+'. '+review.counts.matched+' matched, '+review.counts.added+' added, '+review.counts.changed+' changed or deleted; '+review.counts.completed+' completion marks retained.',diff);
          el('p','Deleted stitches and displaced annotations remain recoverable in the snapshot. Changed-thread transfers mean you explicitly accept the existing physical work for the corrected chart. Archive starts the replacement unmarked. Each old stitch may transfer to at most one new stitch.',diff);
          const unresolved=review.conflicts.filter(c=>!c.resolved).length;
          el('p',unresolved+' decisions remaining.',diff,{role:'status'});
          const list=el('div',null,diff,{'class':'chart-update-decisions'});
          review.conflicts.forEach(c=>{
            const row=el('div',null,list);if(c.description)el('p',c.description,row);const sel=field(c.reason+' ('+c.id+')','select',null,row);
            el('option','Choose a resolution',sel,{value:''});
            c.choices.forEach(v=>el('option',v==='archive'?'Archive old content; leave replacement unmarked':v==='keep'?'Keep existing page content':v==='incoming'?'Use incoming page content':'Transfer to '+v,sel,{value:v}));
            sel.value=choices[c.id]||'';
            sel.onchange=()=>{if(sel.value)choices[c.id]=sel.value;else delete choices[c.id];draw();};
          });
          const tableDetails=el('details',null,diff);el('summary','Inspect and download stitch differences',tableDetails);
          el('pre',JSON.stringify({changes:review.changes,added:review.added,annotations:review.annotations},null,2),tableDetails);
          button('Download difference preview',tableDetails,()=>download({dimensions:review.dimensions,options:currentOptions,counts:review.counts,conflicts:review.conflicts,changes:review.changes,added:review.added,pairs:review.pairs,annotations:review.annotations,resolutions:choices},'chart-differences.json'));
          apply.disabled=!review.ready||!align.checked;
        }catch(e){error(e);}
      }
      [mode,dx,dy,regions].forEach(input=>input.onchange=()=>{Object.keys(choices).forEach(k=>delete choices[k]);align.checked=false;draw();});
      align.onchange=draw;draw();
    }
    async function showStart() {
      base=await ProjectStorage.prepareChartUpdate(id);
      const snapshots=await window.BlobStore.list('chart-update:'+id+':');
      content.replaceChildren();
      button('Choose corrected chart or additional pages',content,async()=>{
        dialog.close(); // React's import modal must be above the Home page.
        try {await window.ImportEngine.openImportPicker({
          onReviewedProject:async function(project,file){showPreview(project,file);return {action:'update-preview'};}
        });} finally {if(dialog.isConnected&&!dialog.open)dialog.showModal();}
      });
      el('p','Uses the existing import formats and limitations. Review recognised stitches and source fidelity before continuing; unsupported objects must be repaired in the source program. Original files and before/after chart records stay with local recovery snapshots. Export a backup before clearing browser storage.',content);
      el('h3','Recovery snapshots',content);
      if(!snapshots.length)el('p','No chart updates saved yet.',content);
      snapshots.forEach(s=>{
        const row=el('div',null,content);
        el('p',new Date(s.createdAt).toLocaleString('en-GB')+' · '+(s.before.name||'Project'),row);
        button('Download previous project',row,()=>download(s.before,(s.before.name||'project')+'-before-update.json'));
        if(s.source)button('Download imported source',row,()=>download(s.source,s.source.name||'chart-source'));
        button('Review rollback',row,async()=>{
          const current=await ProjectStorage.prepareChartUpdate(id);
          content.replaceChildren();
          el('h3','Review rollback',content);
          el('p','Restore the project saved before this update. This replaces current chart, progress, notes and project settings; changes made since that snapshot will be kept in a new recovery snapshot. Thread consumption history and inventory are retained.',content);
          el('pre',JSON.stringify({current:{dimensions:current.project.settings,notes:current.project.notes,done:current.project.done},restore:{dimensions:s.before.settings,notes:s.before.notes,done:s.before.done}},null,2),content);
          button('Download current project',content,()=>download(current.project,'current-project.json'));
          const accept=field('I have reviewed the rollback and want to restore this snapshot','input',null,content,'checkbox');
          const restore=button('Restore snapshot',content,async()=>{
            if(!accept.checked)throw Error('Review and confirm the rollback first.');
            restore.disabled=true;
            try {await ProjectStorage.applyChartUpdate(id,current.token,null,null,null,null,s.id);status.textContent='Snapshot restored. Inventory was retained.';await showStart();}
            catch(e){restore.disabled=false;throw e;}
          });
          restore.disabled=true;accept.onchange=()=>{restore.disabled=!accept.checked;};
        });
      });
    }
    await showStart();close.focus();
  };
})();
