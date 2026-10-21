const {test,expect}=require('@playwright/test');
const {prepare,importChart,input,guideIndex,GRID}=require('../perf/focused-journey.cjs');

// Observe real script resources without adding production globals or changing the hooks.
async function observe(context) {
  await context.addInitScript(()=>{
    window.__lifecycle={roots:[],listeners:[],channels:[],frames:new Set(),intervals:new Set()};
    Object.defineProperty(window,'ReactDOM',{configurable:true,get(){return this.__testReactDOM;},set(value){
      let wrapped;
      const wrap=fn=>function(...args){const root=fn.apply(this,args);window.__lifecycle.roots.push(root);return root;};
      if(value.createRoot)wrapped=wrap(value.createRoot);
      Object.defineProperty(value,'createRoot',{configurable:true,get:()=>wrapped,set:fn=>{wrapped=wrap(fn);}});
      this.__testReactDOM=value;
    }});
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener=function(type,fn,options){
      const stack=new Error().stack;
      const capture=typeof options==='boolean'?options:!!options?.capture;
      if((this===window || this===document) && /compiled\/(tracker-app|creator-main)|stats-page\.js/.test(stack.split('\n')[2] || ''))
        if(!window.__lifecycle.listeners.some(x=>!x.removed&&x.target===this&&x.type===type&&x.fn===fn&&x.capture===capture))
          window.__lifecycle.listeners.push({target:this,type,fn,capture,stack,removed:false});
      return add.call(this,type,fn,options);
    };
    EventTarget.prototype.removeEventListener=function(type,fn,options){
      const capture=typeof options==='boolean'?options:!!options?.capture;
      for(const x of window.__lifecycle.listeners)if(x.target===this&&x.type===type&&x.fn===fn&&x.capture===capture)x.removed=true;
      return remove.call(this,type,fn,options);
    };
    const raf=window.requestAnimationFrame,caf=window.cancelAnimationFrame;
    window.requestAnimationFrame=function(fn){
      const owned=/compiled\/(tracker-app|creator-main)|stats-page\.js/.test(new Error().stack.split('\n')[2] || '');
      const id=raf.call(window,time=>{__lifecycle.frames.delete(id);fn(time);});
      if(owned)__lifecycle.frames.add(id);return id;
    };
    window.cancelAnimationFrame=function(id){__lifecycle.frames.delete(id);return caf.call(window,id);};
    const interval=window.setInterval,clear=window.clearInterval;
    window.setInterval=function(fn,delay,...args){
      const id=interval.call(window,fn,delay,...args);
      if(/compiled\/(tracker-app|creator-main)|stats-page\.js/.test(new Error().stack.split('\n')[2] || ''))__lifecycle.intervals.add(id);
      return id;
    };
    window.clearInterval=function(id){__lifecycle.intervals.delete(id);return clear.call(window,id);};
    if(window.BroadcastChannel){const BC=window.BroadcastChannel;window.BroadcastChannel=class extends BC{
      constructor(...args){super(...args);if(/compiled\/tracker-app/.test(new Error().stack.split('\n')[2] || ''))window.__lifecycle.channels.push(this);this.__closed=false;}
      close(){this.__closed=true;return super.close();}
    };}
  });
}
const activeListeners=page=>page.evaluate(()=>__lifecycle.listeners.filter(x=>!x.removed).map(x=>x.type).sort());

test.beforeEach(async({context})=>{await prepare(context);await observe(context);});

test('Tracker load, mark, undo, save, reopen, active update and unmount release owned resources',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await importChart(page,[40,40]);
  await page.waitForFunction(()=>typeof __flushProjectToIDB==='function');
  await page.evaluate(()=>__flushProjectToIDB());
  await page.locator(GRID).focus();
  await input(page,'ArrowRight');const first=await guideIndex(page,40);await input(page,'Enter');await input(page,'ArrowRight');await input(page,'Enter');
  await page.locator('.ppal-mode-btn[title="Undo (Ctrl+Z)"]').click();
  const stored=await page.evaluate(async()=>{await __flushProjectToIDB();return ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));});
  expect(stored.done.flatMap((v,i)=>v?[i]:[])).toEqual([first]);
  await page.reload();await page.locator(GRID).waitFor();
  await expect.poll(()=>page.locator('.info-strip-counts').innerText()).toMatch(/^1 done/);
  await page.waitForFunction(()=>typeof __flushProjectToIDB==='function');
  // Enable the opt-in channel through React's real control after restoration.
  await page.locator('[title="More controls"]').click();
  await page.locator('#ppal-more-panel').getByRole('button',{name:'Tools',exact:true}).click();
  await page.getByLabel('Use up stash thread as I stitch',{exact:true}).check();
  await expect.poll(()=>page.evaluate(()=>__lifecycle.channels.length)).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Close controls',exact:true}).click();
  await page.evaluate(()=>__flushProjectToIDB());
  const before=await activeListeners(page);
  expect(before).toContain('beforeunload');expect(before).toContain('cs:prefchange');
  // Read committed hooks to check refs and memoised callbacks across real updates.
  const hooks=async compare=>page.evaluate(compare=>{
    const pending=[__lifecycle.roots[0]._internalRoot.current];let tracker;
    while(pending.length){const f=pending.pop();if(!f)continue;
      if(f.type===TrackerApp){tracker=f;break;}pending.push(f.child,f.sibling);}
    if(!tracker)throw new Error('Tracker fibre not found');
    const values=[];for(let h=tracker.memoizedState;h;h=h.next)values.push(h.memoizedState);
    const signature=values.map(v=>v&&typeof v==='object'&&'create' in v&&'deps' in v?'effect':
      v&&typeof v==='object'&&Object.keys(v).length===1&&'current' in v?'ref':
      Array.isArray(v)&&v.length===2&&Array.isArray(v[1])&&typeof v[0]==='function'?'callback':'other');
    const changed=[];
    if(compare)values.forEach((v,i)=>{
      const old=window.__trackerHookValues[i];
      if(signature[i]==='ref'&&v!==old)changed.push(i);
      if(signature[i]==='callback'&&old&&v[1].length===old[1].length&&v[1].every((x,j)=>Object.is(x,old[1][j]))&&v[0]!==old[0])changed.push(i);
    });
    window.__trackerHookValues=values;
    return{signature,changed};
  },compare);
  const mounted=await hooks(false);
  expect(mounted.signature.filter(x=>x==='ref').length).toBeGreaterThan(0);
  expect(mounted.signature.filter(x=>x==='callback').length).toBeGreaterThan(0);
  await page.evaluate(()=>UserPrefs.set('trackerAutomaticSnapshots',true));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  expect(await hooks(true)).toEqual(mounted);
  await page.evaluate(()=>{__lifecycle.roots[0].render(React.createElement(TrackerApp,{isActive:false}));});
  await expect.poll(()=>page.evaluate(()=>document.querySelectorAll('canvas[role=application]').length)).toBeGreaterThan(0);
  await page.evaluate(()=>{__lifecycle.roots[0].render(React.createElement(TrackerApp,{isActive:true}));});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  expect(await activeListeners(page)).toEqual(before);
  expect(await hooks(true)).toEqual(mounted);
  await page.evaluate(()=>__lifecycle.roots[0].unmount());
  expect(await activeListeners(page)).toEqual([]);
  expect(await page.evaluate(()=>__lifecycle.channels.length)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>__lifecycle.channels.every(c=>c.__closed))).toBe(true);
  expect(await page.evaluate(()=>__lifecycle.frames.size)).toBe(0);
  expect(await page.evaluate(()=>__lifecycle.intervals.size)).toBe(0);
  expect(await page.evaluate(()=>typeof __flushProjectToIDB)).toBe('function');
  const fallback=await page.evaluate(async()=>{await __flushProjectToIDB();return ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));});
  expect(fallback.done.flatMap((v,i)=>v?[i]:[])).toEqual([first]);
  await page.goto('/home.html');
  await expect(page.locator('#root button').first()).toBeVisible();
  await page.goto('/stitch.html?from=home');await page.locator(GRID).waitFor();
  await expect.poll(()=>page.locator('.info-strip-counts').innerText()).toMatch(/^1 done/);
  expect(errors).toEqual([]);
});

test('Creator comparison hooks retain key handlers through updates and clean up on unmount',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/create.html?action=new-blank');
  await page.waitForFunction(()=>typeof window.ComparisonSlider==='function' && typeof window.__setCreatorAppMode==='function');
  // ComparisonSlider is an existing public export of the real compiled Creator entry.
  await page.evaluate(()=>{
    __lifecycle.roots[0].unmount();
    window.__comparisonRoot=ReactDOM.createRoot(document.getElementById('root'));
    __comparisonRoot.render(React.createElement(ComparisonSlider,{originalSrc:'',previewSrc:'',width:100,height:100}));
  });
  await expect.poll(()=>activeListeners(page)).toContain('keydown');
  const before=await activeListeners(page);
  await page.keyboard.down('Alt');
  await expect.poll(()=>page.locator('#root [style*="cursor"]').first().evaluate(e=>e.style.cursor)).toBe('zoom-in');
  await page.keyboard.up('Alt');
  await page.evaluate(()=>__comparisonRoot.render(React.createElement(ComparisonSlider,{originalSrc:'',previewSrc:'',width:200,height:100})));
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  expect(await activeListeners(page)).toEqual(before);
  await page.getByRole('button',{name:'Auto-sweep',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>__lifecycle.frames.size)).toBeGreaterThan(0);
  await page.evaluate(()=>__comparisonRoot.unmount());
  expect(await page.evaluate(()=>__lifecycle.frames.size)).toBe(0);
  expect(await activeListeners(page)).toEqual([]);
  expect(await page.evaluate(()=>__lifecycle.intervals.size)).toBe(0);
  expect(errors).toEqual([]);
});

test('Stats loading, tab updates and unmount balance event subscriptions',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/index.html?mode=stats&from=home');
  await page.waitForFunction(()=>typeof StatsPage==='function'&&__lifecycle.roots.length>0);
  await page.getByRole('button',{name:'Stitching',exact:true}).waitFor();
  const before=await activeListeners(page);
  expect(before).toContain('cs:projectsChanged');
  await page.getByRole('button',{name:'Stash',exact:true}).click();
  await page.getByRole('button',{name:'Showcase',exact:true}).click();
  await page.getByRole('button',{name:'Activity',exact:true}).click();
  await page.waitForFunction(()=>typeof StatsActivity==='function');
  await page.getByRole('button',{name:'Insights',exact:true}).click();
  await page.waitForFunction(()=>typeof StatsInsights==='function');
  await page.getByRole('button',{name:'Stitching',exact:true}).click();
  await expect.poll(()=>activeListeners(page)).toEqual(before);
  await page.evaluate(()=>__lifecycle.roots[0].unmount());
  expect(await activeListeners(page)).toEqual([]);
  expect(await page.evaluate(()=>__lifecycle.intervals.size)).toBe(0);
  expect(errors).toEqual([]);
});

test('adjacent Home and Stash entry points mount with shared storage and library exports',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/home.html');
  await expect(page.locator('#root button').first()).toBeVisible();
  expect(await page.evaluate(()=>typeof ProjectStorage.listProjects)).toBe('function');
  await page.goto('/manager.html?from=home');
  await expect(page.locator('#root button').first()).toBeVisible();
  expect(await page.evaluate(()=>typeof MultiProjectDashboard)).toBe('function');
  expect(await page.evaluate(()=>typeof ProjectStorage.listProjects)).toBe('function');
  expect(errors).toEqual([]);
});
