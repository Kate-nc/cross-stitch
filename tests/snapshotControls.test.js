/** @jest-environment jsdom */
const fs = require('fs');
const React = require('react');
const {createRoot} = require('react-dom/client');
const {act} = require('react-dom/test-utils');
const pako = require('pako');
const read = f => fs.readFileSync(f, 'utf8');
const tracker = read('tracker-app.js');
const stats = read('components-stats.js');

beforeEach(() => {
  localStorage.clear();
  eval(read('user-prefs.js'));
});

test('existing users default off, opt-in timestamp persists and only changes on re-enable', () => {
  localStorage.setItem('cs_pref_trackerDragMark', 'false');
  eval(read('user-prefs.js'));
  expect(window.UserPrefs.get('trackerAutomaticSnapshots')).toBe(false);
  jest.useFakeTimers().setSystemTime(new Date('2026-10-14T12:00:00Z'));
  window.UserPrefs.set('trackerAutomaticSnapshots', true);
  const baseline = window.UserPrefs.get('trackerSnapshotsEnabledAt');
  jest.setSystemTime(new Date('2026-10-17T12:00:00Z'));
  window.UserPrefs.set('trackerAutomaticSnapshots', true);
  expect(window.UserPrefs.get('trackerSnapshotsEnabledAt')).toBe(baseline);
  window.UserPrefs.set('trackerAutomaticSnapshots', false);
  window.UserPrefs.set('trackerAutomaticSnapshots', true);
  expect(window.UserPrefs.get('trackerSnapshotsEnabledAt')).toBe('2026-10-17T12:00:00.000Z');
  eval(read('user-prefs.js'));
  expect(window.UserPrefs.get('trackerAutomaticSnapshots')).toBe(true);
  window.UserPrefs.reset();
  expect(window.UserPrefs.get('trackerAutomaticSnapshots')).toBe(false);
  jest.useRealTimers();
});

function dailyHarness() {
  let queue=[], history=[];
  const refs={lastSnapshotDateRef:{current:'2026-10-13'},snapshotGenerationRef:{current:0},projectIdRef:{current:'a'}};
  const block=tracker.slice(tracker.indexOf('    // Auto-snapshot: on a new stitching day'),tracker.indexOf('    prevAutoCountRef.current={done:curDone',tracker.indexOf('    // Auto-snapshot: on a new stitching day')));
  const run = new Function('window','done','curDone','sW','sH','statsSettings','getStitchingDate','getDayEndHour','lastSnapshotDateRef','snapshotGenerationRef','projectIdRef','requestIdleCallback','setDoneSnapshots','pako','btoa',block);
  const lifecycle=tracker.slice(tracker.indexOf('// Invalidate synchronously'),tracker.indexOf('function updateCompareSnapshots'));
  let cleanup;
  new Function('useEffect','window','snapshotGenerationRef','lastSnapshotDateRef','getStitchingDate','getDayEndHour',lifecycle)(fn=>{cleanup=fn();},window,refs.snapshotGenerationRef,refs.lastSnapshotDateRef,()=> '2026-10-14',()=>0);
  return {refs,mark:()=>run(window,new Uint8Array([1,0]),1,2,1,{},()=> '2026-10-14',()=>0,refs.lastSnapshotDateRef,refs.snapshotGenerationRef,refs.projectIdRef,fn=>queue.push(fn),fn=>{history=fn(history);},pako,btoa),flush:()=>queue.splice(0).forEach(fn=>fn()),history:()=>history,cleanup};
}

test.each(['disable','off-on','reset','boundary','project-roundtrip'])('queued work is invalidated by %s', action => {
  window.UserPrefs.set('trackerAutomaticSnapshots',true);
  const h=dailyHarness();h.mark();
  if(action==='disable')window.UserPrefs.set('trackerAutomaticSnapshots',false);
  if(action==='off-on'){window.UserPrefs.set('trackerAutomaticSnapshots',false);window.UserPrefs.set('trackerAutomaticSnapshots',true);}
  if(action==='reset')window.UserPrefs.reset();
  if(action==='boundary')window.UserPrefs.set('statsDayEndHour',4);
  if(action==='project-roundtrip')h.refs.snapshotGenerationRef.current++; // project-load invalidation, even same id
  h.flush();expect(h.history()).toEqual([]);h.cleanup();
});

test('off creates nothing; enabling starts today; later rollover creates one sized snapshot', () => {
  const h=dailyHarness();h.mark();h.flush();expect(h.history()).toEqual([]);
  window.UserPrefs.set('trackerAutomaticSnapshots',true);
  h.mark();h.flush();expect(h.history()).toEqual([]);
  h.refs.lastSnapshotDateRef.current='2026-10-13';
  h.mark();h.mark();h.flush();
  expect(h.history()).toHaveLength(1);
  expect(h.history()[0]).toMatchObject({label:'auto',date:'2026-10-13',w:2,h:1,doneCount:1});
  expect([...pako.inflate(Uint8Array.from(atob(h.history()[0].data),c=>c.charCodeAt(0)))]).toEqual([1,0]);
  h.cleanup();
});

let root, container, history, props;
function mountCompare(canEdit=true) {
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const ComparisonView=new Function('React','pako','Icons','renderComparisonCanvas','renderDiffCanvas',stats.slice(stats.indexOf('function ComparisonView('),stats.indexOf('function ProjectComparison('))+';return ComparisonView;')(React,pako,{camera:()=>null},()=>{},()=>{});
  history=[{id:'a',label:'auto',data:''},{id:'m',label:'Manual',data:''},{id:'r',label:'Before pattern change',data:''}];
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  props={canEdit,done:new Uint8Array([1,0]),pat:[{},{}],sW:2,sH:1,setDoneSnapshots:fn=>{history=fn(history);render();}};
  function render(){root.render(React.createElement(ComparisonView,{...props,doneSnapshots:history}));}
  act(render);
  return {select:id=>act(()=>{const el=container.querySelector('select');el.value=id;el.dispatchEvent(new Event('change',{bubbles:true}));}),click:text=>act(()=>{[...container.querySelectorAll('button')].find(b=>b.textContent===text).click();}),render:()=>act(render)};
}
afterEach(()=>{if(root){act(()=>root.unmount());container.remove();root=null;}});
beforeAll(()=>jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({clearRect:jest.fn()}));

test('both deletions confirm, clear selections, and bulk keeps manual and recovery', () => {
  window.confirm=jest.fn(()=>false);const ui=mountCompare();ui.select('a');ui.click('Delete snapshot');expect(history).toHaveLength(3);
  window.confirm.mockReturnValue(true);ui.click('Delete snapshot');expect(history.map(s=>s.id)).toEqual(['m','r']);expect(container.querySelector('select').value).toBe('');
  history.push({id:'a2',label:'auto',data:''});ui.render();ui.select('m');ui.click('Delete all automatic snapshots');expect(history.map(s=>s.id)).toEqual(['m','r']);expect(container.querySelector('select').value).toBe('m');
  ui.select('r');ui.click('Delete snapshot');expect(history.map(s=>s.id)).toEqual(['m']);
});

test('manual save works when off, including label auto; bulk preserves it', () => {
  window.confirm=()=>true;const ui=mountCompare();
  act(()=>{const el=container.querySelector('input[type=text]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'auto');el.dispatchEvent(new Event('input',{bubbles:true}));});
  ui.click('Save snapshot');const manual=history.find(s=>s.kind==='manual');expect(manual).toMatchObject({label:'auto',kind:'manual',w:2,h:1,doneCount:1});
  ui.click('Delete all automatic snapshots');expect(history).toContain(manual);
});

test('read-only views disable save and both deletion actions', () => {
  window.confirm=jest.fn(()=>true);const ui=mountCompare(false);ui.select('a');
  const buttons=[...container.querySelectorAll('button')];expect(buttons.every(b=>b.disabled)).toBe(true);
  ui.click('Delete snapshot');ui.click('Delete all automatic snapshots');ui.click('Save snapshot');expect(history).toHaveLength(3);expect(window.confirm).not.toHaveBeenCalled();
});

test('snapshot deletions survive repeated two-device sync merges', () => {
  const SE=new Function('window','localStorage','pako','ProjectStorage',read('sync-engine.js')+';return window.SyncEngine;')(window,localStorage,pako,{});
  const base={id:'p',settings:{sW:2,sH:1},pattern:[{id:'310'},{id:'310'}],done:[1,0],statsSessions:[],updatedAt:'2026-10-14T12:00:00Z'};
  const a={...base,doneSnapshots:[{id:'m',label:'Manual'},{id:'r',label:'Before pattern change'}],deletedSnapshotIds:['a']};
  const b={...base,doneSnapshots:[{id:'a',label:'auto'},{id:'b',label:'auto'}]};
  const once=SE.mergeTrackingProgress(a,b);expect(once.doneSnapshots.map(s=>s.id).sort()).toEqual(['b','m','r']);
  expect(SE.mergeTrackingProgress(b,once).doneSnapshots).toEqual(once.doneSnapshots);
  expect(SE.mergeTrackingProgress(once,b).deletedSnapshotIds).toEqual(['a']);
});

test('the baseline respects the configured stitching-day boundary', () => {
  const helpers=read('helpers.js');
  const getDate=new Function(helpers.slice(helpers.indexOf('function getStitchingDate('),helpers.indexOf('// The hour the stitching day ends.'))+';return getStitchingDate;')();
  expect(getDate(new Date(2026,9,14,3,59),4)).toBe('2026-10-13');
  expect(getDate(new Date(2026,9,14,4,0),4)).toBe('2026-10-14');
});

test('portable backup restore rebases opt-in and invalidates queued work; older sections default off', () => {
  window.UserPrefs.set('trackerAutomaticSnapshots',true);
  const portable=window.UserPrefs.exportPortable();
  expect(portable.values.trackerAutomaticSnapshots).toBe(true);
  expect(portable.values).not.toHaveProperty('trackerSnapshotsEnabledAt');
  const h=dailyHarness();h.mark();
  window.UserPrefs.restorePortable(portable);h.flush();expect(h.history()).toEqual([]);
  h.mark();h.flush();expect(h.history()).toEqual([]);
  window.UserPrefs.restorePortable({version:1,stateSchemaVersion:1,values:{}});
  expect(window.UserPrefs.get('trackerAutomaticSnapshots')).toBe(false);
  h.cleanup();
});
