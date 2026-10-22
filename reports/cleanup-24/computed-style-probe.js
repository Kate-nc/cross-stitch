// Usage: node reports/cleanup-24/computed-style-probe.js <styles.css> <out.json>
// Mounts every selector touched by the 13 CSS-token warnings in light, dark,
// high-contrast, dark+high-contrast, narrow and print contexts (plus hover) and
// dumps computed colours. Run on base and head and `cmp` the JSON.
// Set CHROMIUM_PATH if Playwright cannot find its browser.
// Computes styles for every selector touched by the 13 warnings, across contexts.
const { chromium } = require('playwright');
const fs = require('fs');
const css = process.argv[2], out = process.argv[3];
const cases = [
  ['sync-popover-btn sync-popover-btn--primary','button'],
  ['srg-counter-chip srg-counter-chip--complete','span'],
  ['creator-actionbar__mode-btn creator-actionbar__mode-btn--forward','button'],
  ['home-create-tile home-create-tile--primary','div'],
  ['home-create-tile--primary-icon','div'],
  ['creator-sidebar-tab','button'],
  ['import-preview-canvas','canvas'],
  ['mh-subtabs','div'],
];
const html = `<!doctype html><html><head><meta charset=utf-8><style>${fs.readFileSync(css,"utf8")}</style><style>*,*::before,*::after{transition:none!important;animation:none!important}</style></head><body>
<div id=t1 class="home-create-tile home-create-tile--primary"><span class="home-create-tile__icon"></span><span class="home-create-tile__copy"><strong>s</strong><span>x</span></span></div>
<button id=t2 class="sync-popover-btn sync-popover-btn--primary">a</button>
<span id=t3 class="srg-counter-chip srg-counter-chip--complete">a</span>
<button id=t4 class="creator-actionbar__mode-btn creator-actionbar__mode-btn--forward">a</button>
<button id=t5 class="creator-sidebar-tab" aria-selected="true">a</button>
<canvas id=t6 class="import-preview-canvas"></canvas>
<div id=t7 class="mh-subtabs">x</div>
</body></html>`;
(async()=>{
  const b = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
  const res = {};
  for (const [name,theme,hc,vw] of [['light',0,0,1280],['dark',1,0,1280],['light+hc',0,1,1280],['dark+hc',1,1,1280],['light-narrow',0,0,400],['light+print',0,0,1280]]) {
    const p = await b.newPage({viewport:{width:vw,height:800}});
    await p.setContent(html);
    if (name.endsWith('print')) await p.emulateMedia({media:'print'});
    await p.evaluate(([t,h])=>{const r=document.documentElement; if(t) r.setAttribute('data-theme','dark'); if(h) r.classList.add('pref-high-contrast');},[theme,hc]);
    res[name] = await p.evaluate(()=>{
      const o={};
      for (const id of ['t1','t2','t3','t4','t5','t6','t7']) {
        const e=document.getElementById(id), c=getComputedStyle(e);
        o[id]={color:c.color,bg:c.backgroundColor,border:c.borderTopColor,mask:c.maskImage||c.webkitMaskImage,lineVar:c.getPropertyValue('--line')};
      }
      const s=document.querySelector('.home-create-tile__copy strong'); o.strong=getComputedStyle(s).color;
      const sp=document.querySelector('.home-create-tile__copy span'); o.span=getComputedStyle(sp).color;
      const ic=document.querySelector('.home-create-tile__icon'); o.icon={color:getComputedStyle(ic).color,bg:getComputedStyle(ic).backgroundColor};
      o.body=getComputedStyle(document.body).color; o.bodybg=getComputedStyle(document.body).backgroundColor;
      return o;});
    // hover states
    for (const id of ['t2','t4','t5','t1']) { await p.hover('#'+id).catch(()=>{}); res[name]['hover_'+id]=await p.evaluate(i=>{const c=getComputedStyle(document.getElementById(i));return {color:c.color,bg:c.backgroundColor,border:c.borderTopColor}},id); }
    await p.close();
  }
  fs.writeFileSync(out, JSON.stringify(res,null,1));
  await b.close();
})();
