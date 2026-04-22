/* colourway-system.js — shared colourway model + palette tools */
(function(root){
  var DEFAULT_ROLES=["primary-dark","primary-mid","primary-light","secondary-dark","secondary-mid","secondary-light","accent","background","outline","neutral-dark","neutral-mid","neutral-light","highlight","skin-dark","skin-mid","skin-light"];
  var HUE_GROUP_THRESHOLD=30;
  var OUTLINE_LIGHTNESS_THRESHOLD=0.15;
  var HIGHLIGHT_LIGHTNESS_THRESHOLD=0.9;
  var MIN_ROLE_STITCH_COUNT=20;
  var ROLE_COUNT_RATIO=0.2;

  function _clone(obj){return JSON.parse(JSON.stringify(obj));}
  function _now(){return new Date().toISOString();}
  function _mod(n,m){return ((n%m)+m)%m;}
  function _hsl(rgb){
    var r=rgb[0]/255,g=rgb[1]/255,b=rgb[2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),h=0,s=0,l=(max+min)/2;
    if(max!==min){
      var d=max-min;
      s=l>0.5?d/(2-max-min):d/(max+min);
      switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}
      h*=60;
    }
    return{h:h,s:s,l:l};
  }
  function _threadByRef(ref){
    if(ref==null)return null;
    if(typeof getThreadByKey==='function')return getThreadByKey(ref);
    var id=String(ref).indexOf(':')>-1?String(ref).split(':')[1]:String(ref);
    if(typeof DMC!=='undefined')return DMC.find(function(t){return t.id===id;})||null;
    return null;
  }
  function _threadRgb(ref){var t=_threadByRef(ref);return t&&t.rgb?t.rgb:null;}
  function _threadLab(ref){var t=_threadByRef(ref);return t&&t.lab?t.lab:null;}
  function _distance(a,b){
    if(!a||!b)return Infinity;
    if(typeof dE2000==='function')return dE2000(a,b);
    if(typeof dE==='function')return dE(a,b);
    return Math.sqrt(Math.pow(a[0]-b[0],2)+Math.pow(a[1]-b[1],2)+Math.pow(a[2]-b[2],2));
  }
  function _candidatePool(){
    var out=[];
    if(typeof DMC!=='undefined'&&Array.isArray(DMC))out=out.concat(DMC.map(function(t){return{key:'dmc:'+t.id,id:t.id,name:t.name,rgb:t.rgb,lab:t.lab};}));
    if(typeof ANCHOR!=='undefined'&&Array.isArray(ANCHOR))out=out.concat(ANCHOR.map(function(t){return{key:'anchor:'+t.id,id:t.id,name:t.name,rgb:t.rgb,lab:t.lab};}));
    return out;
  }
  function _nearestThread(rgb,pool){
    pool=pool||_candidatePool();
    if(!pool.length)return null;
    var lab=typeof rgbToLab==='function'?rgbToLab(rgb[0],rgb[1],rgb[2]):null;
    var best=null,bestD=Infinity;
    for(var i=0;i<pool.length;i++){
      var p=pool[i];
      var d;
      if(lab&&p.lab)d=_distance(lab,p.lab);
      else d=Math.sqrt(Math.pow(rgb[0]-p.rgb[0],2)+Math.pow(rgb[1]-p.rgb[1],2)+Math.pow(rgb[2]-p.rgb[2],2));
      if(d<bestD){bestD=d;best=p;}
    }
    return best;
  }

  function _slotIdsFromPalette(pal){
    var out=[]; var seen={};
    (pal||[]).forEach(function(p){if(!p||!p.id||p.id==='__skip__'||p.id==='__empty__')return;if(!seen[p.id]){seen[p.id]=1;out.push(p.id);}});
    return out;
  }

  function autoAssignRoles(input){
    var pattern=input&&input.pattern||[];
    var slotIds=input&&input.slotIds||[];
    var colourMap=input&&input.colourMap||{};
    var counts={};
    pattern.forEach(function(c){if(c&&c.id&&c.id!=='__skip__'&&c.id!=='__empty__')counts[c.id]=(counts[c.id]||0)+1;});
    var meta=slotIds.map(function(id){
      var rgb=_threadRgb(colourMap[id])||[127,127,127];
      var hsl=_hsl(rgb);
      return{id:id,count:counts[id]||0,h:hsl.h,s:hsl.s,l:hsl.l};
    }).sort(function(a,b){return b.count-a.count;});
    if(!meta.length)return{};
    var roles={};
    var bg=meta.filter(function(m){return m.s<0.3;})[0];
    if(bg)roles[bg.id]='background';
    var pm=meta.filter(function(m){return m.s>=0.3&&roles[m.id]==null;})[0];
    if(pm)roles[pm.id]='primary-mid';

    var rem=meta.filter(function(m){return roles[m.id]==null;});
    var groups=[];
    rem.forEach(function(m){
      var g=null;
      for(var i=0;i<groups.length;i++){
        var dh=Math.min(Math.abs(groups[i].h-m.h),360-Math.abs(groups[i].h-m.h));
        if(dh<=HUE_GROUP_THRESHOLD){g=groups[i];break;}
      }
      if(!g){g={h:m.h,items:[],total:0};groups.push(g);}
      g.items.push(m); g.total+=m.count;
    });
    groups.sort(function(a,b){return b.total-a.total;});
    [0,1].forEach(function(idx){
      var g=groups[idx]; if(!g)return;
      g.items.sort(function(a,b){return a.l-b.l;});
      var pre=idx===0?'primary':'secondary';
      if(g.items[0])roles[g.items[0].id]=pre+'-dark';
      if(g.items.length>1)roles[g.items[Math.floor(g.items.length/2)].id]=pre+'-mid';
      if(g.items.length>2)roles[g.items[g.items.length-1].id]=pre+'-light';
    });
    meta.forEach(function(m){
      if(roles[m.id])return;
      if(m.l<OUTLINE_LIGHTNESS_THRESHOLD&&m.count<Math.max(MIN_ROLE_STITCH_COUNT,meta[0].count*ROLE_COUNT_RATIO)){roles[m.id]='outline';return;}
      if(m.l>HIGHLIGHT_LIGHTNESS_THRESHOLD&&m.count<Math.max(MIN_ROLE_STITCH_COUNT,meta[0].count*ROLE_COUNT_RATIO)){roles[m.id]='highlight';return;}
      roles[m.id]='accent';
    });
    return roles;
  }

  function buildColourwayModel(input){
    var pal=input&&input.palette||[];
    var pattern=input&&input.pattern||[];
    var slots=_slotIdsFromPalette(pal);
    var baseMap={};
    slots.forEach(function(id){
      var t=_threadByRef(id)||_threadByRef('dmc:'+id);
      baseMap[id]=t?(String(id).indexOf(':')>-1?id:('dmc:'+t.id)):String(id);
    });
    var roleMap=autoAssignRoles({pattern:pattern,slotIds:slots,colourMap:baseMap});
    var colourSlots=slots.map(function(id,idx){
      return{id:id,role:roleMap[id]||null,symbol:(typeof SYMS!=='undefined'&&SYMS.length)?SYMS[idx%SYMS.length]:'•'};
    });
    var base={id:'cw_base',name:'Original',colourMap:baseMap,createdAt:_now(),isBase:true};
    return{colourSlots:colourSlots,colourways:[base],activeColourwayId:base.id,customRoles:[]};
  }

  function resolveColourMap(model,id){
    if(!model||!Array.isArray(model.colourways)||!model.colourways.length)return{};
    var active=id||model.activeColourwayId||model.colourways[0].id;
    var cw=model.colourways.find(function(c){return c.id===active;})||model.colourways[0];
    return cw&&cw.colourMap?cw.colourMap:{};
  }

  function createColourway(model,name,fromId){
    if(!model||!Array.isArray(model.colourways))return null;
    var src=model.colourways.find(function(c){return c.id===(fromId||model.activeColourwayId);})||model.colourways[0];
    if(!src)return null;
    var id='cw_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
    var cw={id:id,name:name||'New colourway',colourMap:_clone(src.colourMap||{}),createdAt:_now(),isBase:false};
    model.colourways=model.colourways.concat([cw]);
    model.activeColourwayId=id;
    return cw;
  }

  function deleteColourway(model,id){
    if(!model||!Array.isArray(model.colourways))return false;
    var cw=model.colourways.find(function(c){return c.id===id;});
    if(!cw||cw.isBase)return false;
    model.colourways=model.colourways.filter(function(c){return c.id!==id;});
    if(model.activeColourwayId===id){
      var base=model.colourways.find(function(c){return c.isBase;});
      model.activeColourwayId=base?base.id:(model.colourways[0]&&model.colourways[0].id)||null;
    }
    return true;
  }

  function reconcileSlotsFromPalette(model,pattern,palette){
    if(!model)return model;
    var nextSlots=_slotIdsFromPalette(palette);
    var slotSet={};nextSlots.forEach(function(id){slotSet[id]=1;});
    var changed=false;
    model.colourSlots=(model.colourSlots||[]).filter(function(s){var keep=!!slotSet[s.id]; if(!keep)changed=true; return keep;});
    var have={};model.colourSlots.forEach(function(s){have[s.id]=1;});
    nextSlots.forEach(function(id){if(!have[id]){model.colourSlots.push({id:id,role:null,symbol:(typeof SYMS!=='undefined'&&SYMS.length)?SYMS[model.colourSlots.length%SYMS.length]:'•'});changed=true;}});
    var base=(model.colourways||[]).find(function(c){return c.isBase;});
    if(base){
      nextSlots.forEach(function(id){if(!base.colourMap[id]){base.colourMap[id]=String(id).indexOf(':')>-1?id:'dmc:'+id;changed=true;}});
    }
    (model.colourways||[]).forEach(function(cw){
      if(cw.stitchGrid!==undefined){delete cw.stitchGrid;changed=true;}
      Object.keys(cw.colourMap||{}).forEach(function(id){if(!slotSet[id]){delete cw.colourMap[id];changed=true;}});
      var fallback=(base&&base.colourMap)||{};
      nextSlots.forEach(function(id){if(!cw.colourMap[id]){cw.colourMap[id]=fallback[id]||('dmc:'+id);changed=true;}});
    });
    return model;
  }

  function validate(model,pattern){
    var errors=[];
    var cws=(model&&model.colourways)||[];
    var slots=(model&&model.colourSlots)||[];
    var slotSet={};slots.forEach(function(s){slotSet[s.id]=1;});
    var baseCount=cws.filter(function(c){return !!c.isBase;}).length;
    if(baseCount!==1)errors.push('Exactly one base colourway must exist');
    cws.forEach(function(cw){
      if(cw&&cw.stitchGrid!==undefined)errors.push('Colourway '+cw.id+' must not contain stitchGrid');
      Object.keys((cw&&cw.colourMap)||{}).forEach(function(id){if(!slotSet[id])errors.push('Orphan colour map slot '+id+' in '+cw.id);});
    });
    if(pattern&&pattern.length){
      for(var i=0;i<pattern.length;i++){
        var cell=pattern[i];
        if(cell&&cell.id&&cell.id!=='__skip__'&&cell.id!=='__empty__'&&!slotSet[cell.id]){errors.push('Orphan stitch slot '+cell.id+' at '+i);break;}
      }
    }
    return{ok:errors.length===0,errors:errors};
  }

  function applyHueShiftToColourway(model,colourwayId,degrees,pool){
    var map=resolveColourMap(model,colourwayId);
    var norm=_mod(degrees||0,360);
    if(norm===0){
      var ident=_clone(map||{});
      var identCw=(model.colourways||[]).find(function(c){return c.id===(colourwayId||model.activeColourwayId);});
      if(identCw)identCw.colourMap=ident;
      return ident;
    }
    var shifted={};
    var keys=Object.keys(map||{});
    for(var i=0;i<keys.length;i++){
      var k=keys[i],ref=map[k],rgb=_threadRgb(ref);
      if(!rgb){shifted[k]=ref;continue;}
      var nextRgb=shiftRgbHue(rgb,norm);
      var nearest=_nearestThread(nextRgb,pool);
      shifted[k]=nearest?nearest.key:ref;
    }
    var cw=(model.colourways||[]).find(function(c){return c.id===(colourwayId||model.activeColourwayId);});
    if(cw)cw.colourMap=shifted;
    return shifted;
  }

  function applyDesaturateToColourway(model,colourwayId,pct,pool){
    var map=resolveColourMap(model,colourwayId),amt=Math.max(0,Math.min(100,pct||0))/100,out={};
    Object.keys(map).forEach(function(k){
      var ref=map[k],rgb=_threadRgb(ref);
      if(!rgb||amt===0){out[k]=ref;return;}
      var hsl=_hsl(rgb),grey=Math.round((rgb[0]+rgb[1]+rgb[2])/3);
      var next=[Math.round(rgb[0]*(1-amt)+grey*amt),Math.round(rgb[1]*(1-amt)+grey*amt),Math.round(rgb[2]*(1-amt)+grey*amt)];
      var nearest=_nearestThread(next,pool); out[k]=nearest?nearest.key:ref;
    });
    var cw=(model.colourways||[]).find(function(c){return c.id===(colourwayId||model.activeColourwayId);});
    if(cw)cw.colourMap=out;
    return out;
  }

  function applyMonochromeToColourway(model,colourwayId,hue,pool){
    var map=resolveColourMap(model,colourwayId),out={},H=_mod(hue||0,360);
    Object.keys(map).forEach(function(k){
      var ref=map[k],rgb=_threadRgb(ref);
      if(!rgb){out[k]=ref;return;}
      var hsl=_hsl(rgb);
      var sat=Math.max(0.2,hsl.s);
      var c=(1-Math.abs(2*hsl.l-1))*sat;
      var x=c*(1-Math.abs((_mod(H/60,2))-1));
      var m=hsl.l-c/2;var rp=0,gp=0,bp=0;
      if(H<60){rp=c;gp=x;}else if(H<120){rp=x;gp=c;}else if(H<180){gp=c;bp=x;}else if(H<240){gp=x;bp=c;}else if(H<300){rp=x;bp=c;}else{rp=c;bp=x;}
      var next=[Math.round((rp+m)*255),Math.round((gp+m)*255),Math.round((bp+m)*255)];
      var nearest=_nearestThread(next,pool); out[k]=nearest?nearest.key:ref;
    });
    var cw=(model.colourways||[]).find(function(c){return c.id===(colourwayId||model.activeColourwayId);});
    if(cw)cw.colourMap=out;
    return out;
  }

  function validatePaletteToolIdempotency(model,pool){
    var base=(model.colourways||[]).find(function(c){return c.isBase;});
    if(!base)return{ok:false,error:'missing base colourway'};
    var tmp={colourways:[_clone(base)],activeColourwayId:base.id};
    var at0=applyHueShiftToColourway(tmp,base.id,0,pool);
    var at360=applyHueShiftToColourway(tmp,base.id,360,pool);
    var keys=Object.keys(base.colourMap||{});
    for(var i=0;i<keys.length;i++){
      var k=keys[i];
      if(at0[k]!==base.colourMap[k])return{ok:false,error:'hue shift 0° is not identity for '+k};
      if(at360[k]!==at0[k])return{ok:false,error:'hue shift 360° mismatch for '+k};
    }
    return{ok:true};
  }

  var api={
    DEFAULT_ROLES:DEFAULT_ROLES,
    buildColourwayModel:buildColourwayModel,
    resolveColourMap:resolveColourMap,
    autoAssignRoles:autoAssignRoles,
    createColourway:createColourway,
    deleteColourway:deleteColourway,
    reconcileSlotsFromPalette:reconcileSlotsFromPalette,
    validate:validate,
    applyHueShiftToColourway:applyHueShiftToColourway,
    applyDesaturateToColourway:applyDesaturateToColourway,
    applyMonochromeToColourway:applyMonochromeToColourway,
    validatePaletteToolIdempotency:validatePaletteToolIdempotency
  };

  root.ColourwaySystem=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
