/* Focused, reproducible cloud Chromium measurements. Instrument only served
   sources: render JS time (not React reconciliation), worker execution (not
   queue/message time), plus the baseline's paints/storage/interaction probes. */
const fs=require('fs'),path=require('path');
const {chromium}=require('@playwright/test');
const babel=require('@babel/core');
const B=require('./track-baseline.cjs');
const ROOT=path.join(__dirname,'../..');
const names=new Set(['TrackerApp','TrackerPaletteRow','TrackerColourActions','TrackerSaveHeader','TrackerProgressStrip','ThreadKeyLabel','Header','renderColourActions']);
function instrument(src){return babel.transformSync(src,{configFile:false,babelrc:false,plugins:[({types:t})=>({visitor:{Function(p){const n=p.node.id&&p.node.id.name;if(!names.has(n)||p.node.__timed)return;p.node.__timed=true;const body=p.node.body.body;p.node.body.body=[t.variableDeclaration('const',[t.variableDeclarator(t.identifier('__rt'),t.callExpression(t.memberExpression(t.identifier('performance'),t.identifier('now')),[]))]),t.tryStatement(t.blockStatement(body),null,t.blockStatement(babel.template.statements.ast(`window.__renderCosts=window.__renderCosts||[];window.__renderCosts.push({name:${JSON.stringify(n)},t:__rt,ms:performance.now()-__rt});`)))];}}})]}).code;}
(async()=>{
 const server=await B.startServer();let browser;try{browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',args:['--no-sandbox']});
 const out={build:B.buildInfo(),browser:browser.version(),environment:'Headless cloud Chromium; software rendering, desktop viewport, no CPU throttle. Not a physical device.',scenarios:{}};
 try{for(const open of [false,true])for(const active of [false,true])for(let rep=0;rep<+(process.env.REPEATS||2);rep++){
 const id=`palette-${open?'open':'closed'}-analysis-${active?'on':'off'}`;
 const spec={profile:'desktop',base:`http://127.0.0.1:${server.port}`,fixture:{custom:{sW:400,sH:500,nColours:200,doneFraction:.5}},storage:{cs_recEnabled:active?'1':'0',cs_pref_trackerLeftSidebarMode:JSON.stringify(open?'open':'hidden'),cs_pref_trackerLeftSidebarMode_wide:JSON.stringify(open?'open':'hidden')},plan:{taps:8,spacingMs:650,tailMs:1000}};
 const ctx=await B.newCtx(browser,spec);
 await ctx.context.route(/\/(compiled\/tracker-app\.compiled|components|header|tracker-progress-strip)\.js(?:\?.*)?$/,async route=>{const file=route.request().url().split('/').slice(3).join('/').split('?')[0];await route.fulfill({body:instrument(fs.readFileSync(path.join(ROOT,file),'utf8')),contentType:'application/javascript'});});
 await ctx.context.route(/\/analysis-worker\.js(?:\?.*)?$/,async route=>{let s=fs.readFileSync(path.join(ROOT,'analysis-worker.js'),'utf8');s=s.replace('handleMessage(e.data, function (m, transfer) { self.postMessage(m, transfer || []); });','var t=performance.now(); handleMessage(e.data, function(m,transfer){ if(m.type==="result")m.executionMs=performance.now()-t; self.postMessage(m,transfer||[]); });');await route.fulfill({body:s,contentType:'application/javascript'});});
 await ctx.page.addInitScript(()=>{window.__workerCosts=[];const W=window.Worker;window.Worker=class extends W{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.type==='result')window.__workerCosts.push({t:performance.now(),ms:e.data.executionMs});});}};});
 spec.setup=async()=>{await ctx.page.evaluate(()=>{window.__renderCosts=[];window.__workerCosts=[];});};
 try{const r=await B.runMarking(ctx,spec);r.renderCosts=await ctx.page.evaluate(()=>{const out={};for(const r of window.__renderCosts||[]){const a=out[r.name]||(out[r.name]={n:0,ms:0});a.n++;a.ms+=r.ms;}return out;});r.workerExecution=await ctx.page.evaluate(()=>window.__workerCosts);(out.scenarios[id]||(out.scenarios[id]=[])).push(r);console.log(id,JSON.stringify({interaction:r.interactions,react:r.react,render:r.renderCosts,worker:r.workerExecution}));}finally{await ctx.context.close();}
 fs.writeFileSync(process.env.OUT||'reports/track-mode-baseline/reconciliation-before.json',JSON.stringify(out,null,2));
 }}finally{await browser.close();}
 }finally{server.proc.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
