const { chromium } = require('@playwright/test');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
(async () => {
 const server = http.createServer((req,res) => {
  if(req.url === '/') {res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html></html>');}
  const file=path.join(process.cwd(),req.url.split('?')[0]);
  if(!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || chromium.executablePath(),headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for(const f of ['constants.js','dmc-data.js','colour-utils.js','helpers.js','creator/generate.js']) await page.addScriptTag({url:'/'+f});
  const results=await page.evaluate(async()=>{
   const opts={sW:24,sH:8,bri:20,con:10,sat:15,maxC:3,allowBlends:false,skipBg:true,bgCol:[0,0,0],bgTh:10,smooth:1,smoothType:'gaussian',stitchCleanup:{enabled:true,strength:'balanced',protectDetails:true},preSharpenOpts:{amount:0.5}};
   const source=document.createElement('canvas'); source.width=192;source.height=64;
   const cx=source.getContext('2d'), im=cx.createImageData(192,64);
   for(let i=0;i<192*64;i++){const x=i%192;im.data.set(x<64?[0,255,255,0]:x<128?[0,0,0,255]:[255,0,0,200],i*4);}cx.putImageData(im,0,0);
   const img=new Image(); img.src=source.toDataURL('image/png');await img.decode();
   const results=[];
   for(const dithAlgo of ['off','atkinson','bayer','riemersma']){
    const settings={...opts,dith:dithAlgo!=='off',dithAlgo};
    const main=runGenerationPipeline(img,settings);
    const raster=document.createElement('canvas');raster.width=24;raster.height=8;const rc=raster.getContext('2d');
    rc.imageSmoothingEnabled=true;rc.imageSmoothingQuality='high';rc.filter='brightness(120%) contrast(110%) saturate(115%)';
    rc.drawImage(prescaleForGrid(applyPreSharpenCanvas(img,24,8,{amount:0.5}),24,8),0,0,24,8);
    const pixels=rc.getImageData(0,0,24,8).data;
    const worker=new Worker('/generate-worker.js');
    const wr=await new Promise((resolve,reject)=>{worker.onerror=reject;worker.onmessage=e=>{if(e.data.type==='result')resolve(e.data);if(e.data.type==='error')reject(Error(e.data.message));};worker.postMessage({type:'generate',reqId:1,pixels:pixels.buffer,width:24,height:8,settings},[pixels.buffer]);});worker.terminate();
    const a=main.pat.map(x=>x.id),b=wr.mapped.map(x=>x.id);
    results.push({dithAlgo,parity:JSON.stringify(a)===JSON.stringify(b),stitches:a.filter(x=>x!=='__skip__').length,threads:main.pal.length,black:a.filter(x=>x==='310').length});
   }
   return results;
  });
  for(const r of results){assert(r.parity);assert.equal(r.stitches,128);assert(r.black>0);}
  console.log(JSON.stringify(results,null,2));
 } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
