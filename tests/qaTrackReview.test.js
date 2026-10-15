/** @jest-environment jsdom */
const fs=require('fs'), React=require('react');
const {renderToStaticMarkup}=require('react-dom/server.node');
const PU=require('../progress-units');
// Browser globals, as loaded by the HTML pages.
window.React=React;
eval(fs.readFileSync(require.resolve('../helpers.js'),'utf8'));
eval(fs.readFileSync(require.resolve('../components-stats.js'),'utf8'));
test('colour stats renders weighted fractions and counts half-only remaining work',()=>{
  const html=renderToStaticMarkup(React.createElement(ColourProgress,{palette:[{id:'310',name:'Black'}],colourDoneCounts:{310:{total:1,done:1,halfTotal:1,halfDone:0}},sessions:[]}));
  expect(html).toContain('66.7% done');expect(html).toContain('0.5 units left');expect(html).toContain('0 / 1 colour complete');
});
test('Stats, share text and milestones reserve completion for exact totals',()=>{
  const stats=computeOverviewStats([],1,1.5);
  expect(stats.percent).toBe(66.7);expect(stats.remaining).toBe(.5);
  expect(generateShareText('Fractional',stats,[],2499,2500,0)).toContain('99.9%');
  expect(getMilestones([],0,.25).some(m=>m.achieved)).toBe(false);
  expect(getMilestones([],1,1.5).find(m=>m.percent===100).achieved).toBe(false);
  expect(checkMilestones(0,.25,.25).some(m=>m.pct===100)).toBe(true);
  expect(checkMilestones(.75,1,1.5).some(m=>m.pct===100)).toBe(false);
});
test('exported progress card uses the same capped and fractional percentage',()=>{
  const texts=[];
  const ctx=new Proxy({fillText(t){texts.push(t);},measureText(){return {width:10};}},{get(target,key){return key in target?target[key]:()=>{};}});
  const canvas={getContext:()=>ctx};
  drawProgressCard(canvas,{projectName:'Fractional',percent:computeOverviewStats([],1,1.5).percent});
  expect(texts).toContain('66.7%');
  texts.length=0;drawProgressCard(canvas,{projectName:'Nearly',percent:computeOverviewStats([],2499,2500).percent});
  expect(texts).toContain('99.9%');expect(texts).not.toContain('100%');
});
