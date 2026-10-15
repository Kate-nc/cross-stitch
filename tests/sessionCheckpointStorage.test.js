/**
 * @jest-environment jsdom
 *
 * Active-session checkpoint journal and retirement fences, using real IndexedDB transactions.
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
// A real structured clone: the progress record holds a typed array, which a JSON round trip would turn into a plain object.
const v8 = require('v8');
global.structuredClone = v => v8.deserialize(v8.serialize(v));

// project-storage.js gets its DB through helpers.js getDB; use the real one.
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));
window.ProjectStorage = ProjectStorage;

const N = 6;
const pattern = () => Array.from({ length: N }, () => ({ id: '310' }));
const proj = (over) => Object.assign({ id: 'proj_p', name: 'P', settings: { sW: 3, sH: 2 }, pattern: pattern(), done: [0, 0, 0, 0, 0, 0] }, over);
const base = async (id) => (await ProjectStorage.get(id)).lastWriteAt;

beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  await ProjectStorage.clearAllProgress();
  ProjectStorage._deletedIds.clear();
});


const cp=(over)=>Object.assign({v:1,projectId:'proj_p',sessionId:'sess_one',checkpointAt:1000,records:[{id:'sess_one',date:'2026-10-15',durationSeconds:60,stitchesCompleted:3,units:3}]},over);
test('checkpoint survives full saves without history; recovery is repeatable until committed once',async()=>{
  await ProjectStorage.save(proj()); await ProjectStorage.saveSessionCheckpoint('proj_p',cp());
  await ProjectStorage.save(proj());
  for(let i=0;i<3;i++)expect((await ProjectStorage.get('proj_p')).sessionCheckpoints).toHaveLength(1);
  await ProjectStorage.save(proj({statsSessions:cp().records}));
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints).toEqual([]);
  await ProjectStorage.saveSessionCheckpoint('proj_p',cp({checkpointAt:9000}));
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints).toEqual([]);
});
test('full save carries its own checkpoint and rejects stale later arrivals',async()=>{
  await ProjectStorage.save(proj({activeSessionCheckpoint:cp({checkpointAt:2000})}));
  await ProjectStorage.saveSessionCheckpoint('proj_p',cp());
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints[0].checkpointAt).toBe(2000);
});
test('deletion fence prevents resurrection even after history and tombstones are absent',async()=>{
  await ProjectStorage.save(proj());await ProjectStorage.saveSessionCheckpoint('proj_p',cp());
  await ProjectStorage.save(proj({deletedSessionIds:['sess_one']}));
  await ProjectStorage.save(proj());await ProjectStorage.saveSessionCheckpoint('proj_p',cp({checkpointAt:9000}));
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints).toEqual([]);
});
test('projects and two distinct tab sessions have independent checkpoint keys',async()=>{
  await ProjectStorage.save(proj());await ProjectStorage.save(proj({id:'proj_q'}));
  await ProjectStorage.saveSessionCheckpoint('proj_p',cp());
  await ProjectStorage.saveSessionCheckpoint('proj_p',cp({sessionId:'sess_two',records:[{id:'sess_two',durationSeconds:30}]}));
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints).toHaveLength(2);
  expect((await ProjectStorage.get('proj_q')).sessionCheckpoints).toEqual([]);
  await expect(ProjectStorage.saveSessionCheckpoint('proj_q',cp())).rejects.toThrow('Invalid');
});
test('older projects load and deleted projects do not acquire checkpoints',async()=>{
  await ProjectStorage.save(proj());expect((await ProjectStorage.get('proj_p')).sessionCheckpoints).toEqual([]);
  await ProjectStorage.delete('proj_p');await expect(ProjectStorage.saveSessionCheckpoint('proj_p',cp())).rejects.toThrow();
});
test('checkpoint transaction abort is reported; failed full save retains checkpoint',async()=>{
  await ProjectStorage.save(proj());await ProjectStorage.saveSessionCheckpoint('proj_p',cp());
  await expect(ProjectStorage.save({id:'proj_p',statsSessions:cp().records})).rejects.toThrow();
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints).toHaveLength(1);
});
test('only committed pending backups are retired',async()=>{
  await ProjectStorage.save(proj());
  localStorage.setItem('cs_pending_session_proj_p',JSON.stringify([{id:'sess_one'},{id:'sess_two'}]));
  await ProjectStorage.save(proj({statsSessions:cp().records}));
  expect(JSON.parse(localStorage.getItem('cs_pending_session_proj_p'))).toEqual([{id:'sess_two'}]);
});

test('an idle trim with a newer revision replaces a longer older endpoint',async()=>{
  await ProjectStorage.save(proj());
  await ProjectStorage.saveSessionCheckpoint('proj_p',cp({revision:1,checkpointAt:9000}));
  await ProjectStorage.saveSessionCheckpoint('proj_p',cp({revision:2,checkpointAt:1000}));
  await ProjectStorage.saveSessionCheckpoint('proj_p',cp({revision:1,checkpointAt:9000}));
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints[0].checkpointAt).toBe(1000);
});
test('discard is a fence against delayed writes and full-save previews',async()=>{
  await ProjectStorage.save(proj());await ProjectStorage.saveSessionCheckpoint('proj_p',cp());
  await ProjectStorage.retireSessionCheckpoint('proj_p','sess_one');
  await ProjectStorage.save(proj({activeSessionCheckpoint:cp({revision:2})}));
  await ProjectStorage.saveSessionCheckpoint('proj_p',cp({revision:3}));
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints).toEqual([]);
});

test('overlapping finalisation and checkpoint writes leave a closed run',async()=>{
  await ProjectStorage.save(proj());
  await Promise.all([
    ProjectStorage.saveSessionCheckpoint('proj_p',cp({revision:1})),
    ProjectStorage.save(proj({statsSessions:cp().records})),
    ProjectStorage.saveSessionCheckpoint('proj_p',cp({revision:2}))
  ]);
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints).toEqual([]);
  expect((await ProjectStorage.get('proj_p')).statsSessions).toEqual(cp().records);
});
test('overlapping older full save and newer checkpoint keep the newer session snapshot',async()=>{
  await ProjectStorage.save(proj());
  await Promise.all([
    ProjectStorage.save(proj({activeSessionCheckpoint:cp({revision:1})})),
    ProjectStorage.saveSessionCheckpoint('proj_p',cp({revision:2,checkpointAt:2000}))
  ]);
  expect((await ProjectStorage.get('proj_p')).sessionCheckpoints[0].checkpointAt).toBe(2000);
});
