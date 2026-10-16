/* Independent petite crosses and long stitches. Coordinates use cell units.
 * Explicit object selection keeps coincident objects independently editable/markable. */
window.SpecialtyStitchPanel = function SpecialtyStitchPanel(p) {
  var h=React.createElement, S=ProgressUnits.specialty;
  var selection=React.useState(''), uid=selection[0], select=selection[1];
  var empty={type:'petite',x:0,y:0,x1:0,y1:0,x2:1,y2:1};
  var draft=React.useState(empty), form=draft[0], setForm=draft[1];
  var error=React.useState(''), setError=error[1];
  var selected=(p.objects||[]).find(function(o){return o.uid===uid;});
  var objects=(p.objects||[]).filter(function(o){return (!p.visible || p.visible[o.type]!==false)&&(!p.accept||p.accept(o));});
  var marks=new Set(p.done||[]), threads=p.threads||[];
  function choose(id) {
    select(id); setError('');
    var o=(p.objects||[]).find(function(v){return v.uid===id;});
    setForm(o?Object.assign({},empty,o,{threadId:o.thread.id}):empty);
    if(p.onSelect)p.onSelect(id);
  }
  function change(k,v){setForm(function(f){var n=Object.assign({},f);n[k]=v;return n;});}
  function commit() {
    var thread=threads.find(function(t){return t.id===form.threadId;}) || (selected && selected.thread);
    var o=Object.assign({},form,{uid:selected?selected.uid:('specialty-'+(globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2))),thread:thread});
    if(!S.valid(o,p.w,p.h)){setError('Choose a thread and valid half-cell coordinates inside the chart. Long stitches need distinct endpoints.');return;}
    var next=S.normalise([o],p.w,p.h,p.brand)[0];
    p.onChange(selected?p.objects.map(function(v){return v.uid===selected.uid?next:v;}):p.objects.concat([next]));
    choose('');
  }
  return h('details',null,h('summary',null,'Petite and long stitches ('+objects.length+')'),
    h('p',null,p.tracking?'Select an object to mark or unmark it. Coincident objects have separate entries.':'Add or select an object to edit its thread and coordinates. Use these controls for petite and long stitches; canvas selection tools edit the other stitch types.'),
    h('div',{role:'group','aria-label':'Petite and long stitch objects',style:{maxHeight:220,overflowY:'auto'}},objects.map(function(o,i){
      return h('div',{key:o.uid},h('button',{type:'button','aria-pressed':uid===o.uid,onClick:function(){choose(o.uid);}},(o.type==='petite'?'Petite':'Long stitch')+' '+(i+1)+' · '+o.thread.id+(marks.has(o.uid)?' · done':'')),
        p.tracking&&h('button',{type:'button',disabled:p.disabled,onClick:function(){p.onToggle(o.uid);}},marks.has(o.uid)?'Unmark':'Mark'));
    })),
    !p.tracking&&h('div',null,
      h('button',{type:'button',onClick:function(){choose('');}},'New object'),
      h('label',null,'Type ',h('select',{'aria-label':'Type',value:form.type,onChange:function(e){change('type',e.target.value);}},h('option',{value:'petite'},'Petite'),h('option',{value:'long_stitch'},'Long stitch'))),
      h('label',null,'Thread ',h('select',{'aria-label':'Thread',value:form.threadId||'',onChange:function(e){change('threadId',e.target.value);}},h('option',{value:''},'Choose thread'),threads.map(function(t){return h('option',{key:t.id,value:t.id},t.id+' '+(t.name||''));}))),
      (form.type==='petite'?['x','y']:['x1','y1','x2','y2']).map(function(k){return h('label',{key:k,style:{display:'inline-block',margin:4}},k+' ',h('input',{type:'number',step:0.5,min:0,max:k[0]==='x'?p.w:p.h,value:Number.isFinite(form[k])?form[k]:'',style:{width:70},onChange:function(e){change(k,e.target.value===''?NaN:Number(e.target.value));}}));}),
      h('button',{type:'button',onClick:commit},selected?'Apply object edit':'Add object'),
      selected&&h('button',{type:'button',onClick:function(){p.onChange(p.objects.filter(function(o){return o.uid!==uid;}));choose('');}},'Delete object'),
      error[0]&&h('p',{role:'alert'},error[0]),
      h('p',null,'Petite: top-left of a half-cell cross. Long stitch: two endpoints, including chart edges. Coordinates start at zero. Petite = 0.25 progress units; long stitch = 0.5 units per object.')
    )
  );
};
