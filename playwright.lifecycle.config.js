const {defineConfig}=require('@playwright/test');
const port=Number(process.env.LIFECYCLE_PORT || 8010);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('LIFECYCLE_PORT must be 1024–65535');
const baseURL='http://127.0.0.1:'+port;
// The shared import/performance helper reads BASE_URL; keep it on this owned server.
process.env.BASE_URL=baseURL;
module.exports=defineConfig({
  testDir:'./tests/e2e',testMatch:'critical-lifecycle.spec.js',timeout:90000,workers:1,reporter:'list',
  use:{baseURL,viewport:{width:1440,height:900},serviceWorkers:'block'},
  projects:['chromium','firefox','webkit'].map(browserName=>({name:browserName,use:{browserName}})),
  webServer:{command:'node serve.js '+port,url:baseURL,reuseExistingServer:false},
});
