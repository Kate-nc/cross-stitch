const {test,expect}=require('@playwright/test');
const {webdavServer}=require('../support/webdav-server');
const {installLocalCdn}=require('./local-cdn');
let dav;
async function configureTestDeployment(context) {
  await installLocalCdn(context);
  await context.grantPermissions(["local-network-access"]);
  // Model a deployment that allowlists just its selected WebDAV origin. The
  // production CSP stays unchanged; there is no wildcard connect permission.
  await context.route(/\/[^/?]*\.html(\?.*)?$/,async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace(/ integrity="[^"]*"/g,'')
      .replace("connect-src 'self'", "connect-src 'self' "+dav.url);
    await route.fulfill({response,body,headers:{...response.headers(),'content-type':'text/html; charset=utf-8'}});
  });
}
test.beforeEach(async({context})=>{dav=await webdavServer();await configureTestDeployment(context);});
test.afterEach(async()=>{if(dav)await dav.close();});
async function open(page){await page.goto('/home.html');await page.waitForFunction(()=>window.WebDAVSync&&window.ProjectStorage&&window.PreferencesModal);
  // Remove CDP routing before DAV: Playwright auto-answers intercepted
  // preflights, which would otherwise hide actual server CORS mistakes.
  await page.context().unrouteAll({behavior:'wait'});
}
async function seed(page){await page.evaluate(async()=>{
  await ProjectStorage.save({id:'proj_webdav',version:11,name:'WebDAV sampler',settings:{sW:2,sH:2,traceImage:true},pattern:[{id:'310'},{id:'310'},{id:'310'},{id:'310'}],done:[0,0,0,0],notes:'base'});
  await BlobStore.put('trace:proj_webdav',{blob:new Blob(['real browser trace'],{type:'image/png'}),type:'image/png'});
});}
async function preferences(page){
  await page.getByRole('button',{name:'File',exact:true}).click();
  await page.getByRole('button',{name:'Preferences…',exact:true}).click();
  await page.getByRole('button',{name:'Sync, backup & data',exact:true}).click();
}
async function connect(page,options){await page.evaluate(o=>WebDAVSync.connect(o),options);}

test('connection UI erases password, reports transfer separately, disconnect retains bytes and reload forgets credentials',async({page})=>{
  await open(page);await seed(page);await preferences(page);
  const panel=page.getByRole('region',{name:'Automatic WebDAV sync'});
  await panel.getByLabel('Collection URL').fill(dav.options().url);
  await panel.getByLabel('Username',{exact:true}).fill('alice');
  await panel.getByLabel('App password',{exact:true}).fill('alice-test-password');
  await panel.getByRole('button',{name:'Connect and sync',exact:true}).click();
  await expect(panel.getByRole('status')).toContainText('Transfers complete');
  await expect(panel.getByLabel('App password',{exact:true})).toHaveValue('');
  expect(dav.requests.some(r=>r.method==='OPTIONS')).toBe(true);
  const disk=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},status:WebDAVSync.getStatus()}));
  expect(disk).not.toContain('alice-test-password');
  await panel.getByRole('button',{name:'Disconnect',exact:true}).click();
  await expect(panel.getByRole('status')).toContainText('Disconnected');
  expect(await page.evaluate(async()=>({name:(await ProjectStorage.get('proj_webdav')).name,bytes:await(await BlobStore.get('trace:proj_webdav')).blob.text()})))
    .toEqual({name:'WebDAV sampler',bytes:'real browser trace'});
  await connect(page,dav.options());await configureTestDeployment(page.context());await page.reload();await page.waitForFunction(()=>window.WebDAVSync);
  expect(await page.evaluate(()=>WebDAVSync.getStatus().connected)).toBe(false);
});

test('two real browser profiles merge offline progress and transfer complete attachments across CORS',async({page,browser})=>{
  await open(page);await seed(page);await connect(page,dav.options());
  const context=await browser.newContext({serviceWorkers:'block'});await configureTestDeployment(context);
  try{
    const peer=await context.newPage();await open(peer);await connect(peer,dav.options());
    expect(await peer.evaluate(async()=>await(await BlobStore.get('trace:proj_webdav')).blob.text())).toBe('real browser trace');
    await page.context().setOffline(true);await context.setOffline(true);
    for(const [client,index]of [[page,0],[peer,1]]) await client.evaluate(async i=>{const p=await ProjectStorage.get('proj_webdav');p.done[i]=1;await ProjectStorage.save(p);},index);
    await page.context().setOffline(false);await context.setOffline(false);
    for(const client of [page,peer,page,peer])await client.evaluate(()=>WebDAVSync.retry());
    for(const client of [page,peer])expect(await client.evaluate(async()=>Array.from((await ProjectStorage.get('proj_webdav')).done))).toEqual([1,1,0,0]);
    await peer.evaluate(()=>WebDAVSync.disconnect());await page.evaluate(()=>WebDAVSync.disconnect());
  } finally{await context.close();}
});

test('revocation is visible and stops requests until reconnection; second account sees no projects',async({page,browser})=>{
  await open(page);await seed(page);await connect(page,dav.options());
  dav.passwords.delete('alice');await page.evaluate(()=>WebDAVSync.retry());
  expect(await page.evaluate(()=>WebDAVSync.getStatus().state)).toBe('credentials');
  const requests=dav.requests.length;await page.evaluate(()=>WebDAVSync.retry());expect(dav.requests).toHaveLength(requests);
  dav.passwords.set('alice','alice-test-password');await connect(page,dav.options());
  const context=await browser.newContext({serviceWorkers:'block'});await configureTestDeployment(context);
  try{const peer=await context.newPage();await open(peer);await connect(peer,dav.options('bob'));
    expect(await peer.evaluate(()=>ProjectStorage.listProjects())).toEqual([]);
    await peer.evaluate(()=>WebDAVSync.disconnect());
  }finally{await context.close();await page.evaluate(()=>WebDAVSync.disconnect());}
});

test('unchanged production CSP blocks an unconfigured DAV origin; exact-origin deployment configuration enables it',async({page,context})=>{
  await context.unrouteAll({behavior:'wait'});
  await installLocalCdn(context); // serve the unmodified production CSP
  await open(page);await seed(page);await connect(page,dav.options());
  expect(await page.evaluate(()=>WebDAVSync.getStatus().state)).toBe('retrying');
  expect(dav.requests).toHaveLength(0);
  expect(await page.evaluate(async()=>(await ProjectStorage.get('proj_webdav')).name)).toBe('WebDAV sampler');
  await page.evaluate(()=>WebDAVSync.disconnect());
  await configureTestDeployment(context);await open(page);await connect(page,dav.options());
  expect(await page.evaluate(()=>WebDAVSync.getStatus().state)).toBe('idle');
  expect(dav.requests.some(r=>r.method==='OPTIONS')).toBe(true);
  await page.evaluate(()=>WebDAVSync.disconnect());
});
