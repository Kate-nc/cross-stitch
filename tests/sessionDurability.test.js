/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname, '../helpers.js'), 'utf8'));
const source = fs.readFileSync(path.join(__dirname, '../tracker-app.js'), 'utf8');
eval(source.match(/\/\/ \u2500+ Event-log timing engine \u2500+[\s\S]*?(?=function TrackerApp)/)[0]);
global.ProgressUnits = require('../progress-units.js');
let effects;
function hook() {
  effects=[];
  window.React = {
    useState: v => { let value=typeof v==='function'?v():v; return [value, next => { value=typeof next==='function'?next(value):next; }]; },
    useRef: current => ({current}), useMemo: f => f(), useEffect: f => effects.push(f)
  };
  eval(fs.readFileSync(path.join(__dirname, '../useAutoSession.js'), 'utf8'));
  return window.useAutoSession({projectIdRef:{current:'proj_test'},v3FieldsRef:{current:{}},autoSaveDirtyRef:{current:false},statsSettings:{dayEndHour:0}});
}
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-15T12:00:00Z')); localStorage.clear(); Object.defineProperty(document,'hidden',{configurable:true,value:false}); });
afterEach(() => jest.useRealTimers());

test('explicit zero-mark timer saves 60 seconds; accidental automatic empty session is discarded', () => {
  const h=hook(); h.startTimer(); jest.advanceTimersByTime(60000);
  const r=h.finaliseAutoSessionRef.current();
  expect(r.durationSeconds).toBe(60); expect(r.stitchesCompleted).toBe(0); expect(r.timingBasis).toBe('timer');
  h.recordAutoActivity(0,0); jest.advanceTimersByTime(60000);
  expect(h.finaliseAutoSessionRef.current()).toBeUndefined();
});

test('preview is repeatable, keeps the active identity and excludes pause and hidden time', () => {
  const h=hook(); h.startTimer(); const cs=h.currentAutoSessionRef.current;
  jest.advanceTimersByTime(10000); cs.eventLog.push({kind:'manualPause',t:Date.now()});
  jest.advanceTimersByTime(20000); cs.eventLog.push({kind:'manualResume',t:Date.now()});
  jest.advanceTimersByTime(10000); cs.eventLog.push({kind:'hidden',t:Date.now()});
  jest.advanceTimersByTime(20000);
  const a=h.finaliseAutoSessionRef.current({preview:true});
  expect(a.records[0].durationSeconds).toBe(20); expect(a.projectId).toBe('proj_test');
  expect(h.finaliseAutoSessionRef.current({preview:true}).records).toEqual(a.records); expect(h.currentAutoSessionRef.current).toBe(cs);
});

test('abandoned empty timer recovery is capped at the idle limit', () => {
  const h=hook(); h.startTimer(); jest.advanceTimersByTime(8*3600000);
  expect(h.finaliseAutoSessionRef.current({preview:true,trimIfIdle:true}).records[0].durationSeconds).toBe(600);
});

test('timer with no marks splits at midnight and retains its total', () => {
  jest.setSystemTime(new Date(2026,9,15,23,59,30));
  const h=hook();h.startTimer();jest.advanceTimersByTime(60000);
  const r=h.finaliseAutoSessionRef.current();
  expect(r.records.map(s=>s.durationSeconds)).toEqual([30,30]);
  expect(r.records.map(s=>s.date)).toEqual(['2026-10-15','2026-10-16']);
});

for(const [start,date] of [['2026-03-29T00:30:00Z','2026-03-29'],['2026-10-25T00:30:00Z','2026-10-25']])test('DST elapsed duration and date: '+date,()=>{
  jest.setSystemTime(new Date(start));const h=hook();h.startTimer();jest.advanceTimersByTime(2*3600000);
  const r=h.finaliseAutoSessionRef.current();expect(r.durationSeconds).toBe(7200);expect(r.date).toBe(date);
});
test('checkpoint retains unpicked totals, units, catch-up and colours on each day',()=>{
  const h=hook();h.pendingColoursRef.current.add('310');h.recordAutoActivity(3,2,2.5,1.5,1);
  jest.advanceTimersByTime(60000);const cp=h.finaliseAutoSessionRef.current({preview:true});
  const r=cp.records[0];expect(r.unitsCompleted).toBe(2.5);expect(r.unitsUndone).toBe(1.5);expect(r.catchUp).toBe(1);expect(r.coloursWorked).toEqual(['310']);
  expect(h.finaliseAutoSessionRef.current().records).toEqual(cp.records);
});

test('stop dialog allows time-only sessions and immediate unpicking; empty clicks can discard',()=>{
  const React=require('react'),server=require('react-dom/server.node');
  const block=source.slice(source.indexOf('function StopTimerDialog('),source.indexOf('// ── Forgot to stop?'));
  const code=require('@babel/core').transformSync(block,{presets:['@babel/preset-react']}).code;
  const Dialog=new Function('React','useState','window',code+';return StopTimerDialog;')(React,v=>[v,()=>{}],{});
  const render=props=>server.renderToStaticMarkup(Dialog(Object.assign({stitches:0},props)));
  expect(render({seconds:60,hasActivity:false})).toContain('Save session');
  expect(render({seconds:0,hasActivity:true})).toContain('Save session');
  expect(render({seconds:0,hasActivity:false})).toContain('Stop without saving');
});
