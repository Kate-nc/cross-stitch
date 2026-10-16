const B = require('../beads');
const PU = require('../progress-units');
const TS = require('../tracking-sync');
const TM = require('../tracking-merge');
const raw = [{x:1,y:1,label:'Gold',id:'MH-1',brand:'millhill',rgb:[200,180,40]}, {x:1,y:1,label:'Blue',rgb:[0,0,200]}, {x:1,y:1,label:'Gold',id:'MH-1',brand:'millhill',rgb:[200,180,40]}];

test('legacy identities are deterministic, idempotent and distinct across overlaps and duplicate supplied IDs',()=>{
  const beads=B.normalise(raw);
  expect(new Set(beads.map(b=>b.uid)).size).toBe(3);
  expect(B.normalise(raw)).toEqual(beads);
  expect(B.normalise(beads)).toEqual(beads);
  const dup=B.normalise([...beads,{...beads[0]}]);
  expect(new Set(dup.map(b=>b.uid)).size).toBe(4);
  expect(dup[0]).toMatchObject(raw[0]);
  expect(B.normalise([{...raw[0],uid:'__proto__'},{...raw[1],uid:'__proto__'}])[1].uid).not.toBe('__proto__');
});
test('completion is idempotent, toggles independently, and stale/duplicate marks cannot inflate totals',()=>{
  const beads=B.normalise(raw),a=beads[0].uid,b=beads[1].uid;
  expect(B.progress(beads,[a,a,'missing'])).toEqual({total:3,done:1});
  const marked=B.toggle(beads,B.toggle(beads,[],a),b);
  expect(B.toggle(beads,marked,a)).toEqual([b]);
  expect(B.toggle(beads,marked,'missing')).toEqual(marked);
  expect(B.toggle(beads,B.toggle(beads,marked,a),a)).toEqual([b,a]); // redo restores membership
});
test('moves/edits retain completion, deletion or replacement does not transfer it; material references survive',()=>{
  const beads=B.normalise(raw),uid=beads[0].uid;
  const moved=B.normalise([{...beads[0],x:8,y:8,label:'Edited'},beads[1]]);
  expect(B.progress(moved,[uid])).toEqual({total:2,done:1});
  expect(moved[0]).toMatchObject({id:'MH-1',brand:'millhill',rgb:[200,180,40]});
  expect(B.progress(moved.slice(1),[uid])).toEqual({total:1,done:0});
  expect(B.progress(B.normalise([{...raw[1],uid:'new'}]),[uid])).toEqual({total:1,done:0});
});
test.each([3,8,20,48])('hit testing overlaps at %s px/cell never requires choosing a full stitch',cs=>{
  const beads=B.normalise(raw);
  expect(B.hitTest(beads,.5,.5,Math.min(.45,Math.max(.3,12/cs)))).toEqual(beads);
  expect(B.hitTest(beads,4,4,.45)).toEqual([]);
});
test('beads are separate from full-cross units, colours and session activity, including bead-only/zero-bead projects',()=>{
  const beads=B.normalise(raw),beadsDone=beads.map(b=>b.uid);
  const p={beads,beadsDone,pattern:[{id:'310'}],done:[0]};
  expect(PU.fromProject(p)).toMatchObject({totalUnits:1,doneUnits:0,percent:0,separate:{bead:{total:3,done:3}}});
  expect(PU.fromProject({...p,pattern:[]})).toMatchObject({totalUnits:0,doneUnits:0});
  expect(PU.fromProject({pattern:[]} ).separate.bead).toEqual({total:0,done:0});
  expect(PU.sessionUnits({bead:3})).toBe(0);
  expect(Object.keys(PU.coloursFromProject({...p,pattern:[]}))).toEqual([]);
});
test('causal sync preserves complete/uncomplete and old writers cannot erase bead marks',()=>{
  const beads=B.normalise(raw),uid=beads[0].uid;
  const base={pattern:[{id:'310'}],done:[0],beads,beadsDone:[]};
  const marked=TS.record(base,{...base,beadsDone:[uid]},'a');
  const unmarked=TS.record(marked,{...marked,beadsDone:[]},'b');
  expect(TS.merge(unmarked,marked).beadsDone).toEqual([]);
  expect(TS.merge(marked,{pattern:base.pattern,done:[0]}).beadsDone).toEqual([uid]);
  expect(TS.record(marked,{pattern:base.pattern,done:[0]},'old').beadsDone).toEqual([uid]);
  expect(TM.canMerge(base,marked,marked)).toBe(true);
  expect(TM.mergeSet([], [uid], [])).toEqual([uid]);
});
