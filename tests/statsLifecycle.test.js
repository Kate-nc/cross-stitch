/** @jest-environment jsdom */
const fs=require('fs');
const React=require('react');
const {createRoot}=require('react-dom/client');
const {act}=require('react-dom/test-utils');

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

test('Stats unmount during migration removes subscriptions and prevents later data reads',async()=>{
  const previousReact=global.React;global.React=React;
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const gate=deferred(),entered=deferred(),host=document.createElement('div');document.body.appendChild(host);
  const storage={migrateProjectsToV3:jest.fn(()=>{entered.resolve();return gate.promise;}),listProjects:jest.fn(),getLifetimeStitches:jest.fn()};
  const stash={migrateSchemaToV3:async()=>{}};
  const previous=window.StatsPage;
  const add=jest.spyOn(window,'addEventListener'),remove=jest.spyOn(window,'removeEventListener');
  new Function('window','React',fs.readFileSync('icons.js','utf8'))(window,React);
  new Function('React','Icons','ProjectStorage','StashBridge','GlobalStatsDashboard',fs.readFileSync('stats-page.js','utf8'))(React,window.Icons,storage,stash,()=>null);
  const root=createRoot(host);
  try{
    await act(async()=>{root.render(React.createElement(window.StatsPage,{onClose(){}}));});
    await entered.promise;
    for(const type of ['cs:stashChanged','cs:projectsChanged','cs:backupRestored']){
      const registration=add.mock.calls.find(c=>c[0]===type);expect(registration).toBeDefined();
      expect(remove.mock.calls.some(c=>c[0]===type&&c[1]===registration[1])).toBe(false);
    }
    await act(async()=>root.unmount());
    for(const type of ['cs:stashChanged','cs:projectsChanged','cs:backupRestored']){
      const registration=add.mock.calls.find(c=>c[0]===type);
      expect(remove).toHaveBeenCalledWith(type,registration[1]);
    }
    await act(async()=>gate.resolve());
    window.dispatchEvent(new Event('cs:projectsChanged'));
    expect(storage.migrateProjectsToV3).toHaveBeenCalledTimes(1);
    expect(storage.listProjects).not.toHaveBeenCalled();expect(storage.getLifetimeStitches).not.toHaveBeenCalled();
    expect(host.childNodes).toHaveLength(0);
  }finally{
    await act(async()=>root.unmount());host.remove();add.mockRestore();remove.mockRestore();
    window.StatsPage=previous;global.React=previousReact;delete global.IS_REACT_ACT_ENVIRONMENT;
  }
});
