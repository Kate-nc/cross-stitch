const fs=require('fs'),vm=require('vm');
const read=f=>fs.readFileSync(f,'utf8');
const pages=fs.readdirSync('.').filter(f=>f.endsWith('.html')&&read(f).includes('src="sync-engine.js"'));
test.each(pages)('%s loads the attachment codec once before the engine',page=>{
  const html=read(page),tag='<script src="sync-attachment-codec.js"></script>';
  expect(html.split(tag)).toHaveLength(2);expect(html.indexOf(tag)).toBeLessThan(html.indexOf('src="sync-engine.js"'));
});
test('codec loads without engine dependencies and its CommonJS/browser interfaces agree',()=>{
  const c={window:{}};vm.createContext(c);vm.runInContext(read('sync-attachment-codec.js'),c);
  expect(Object.keys(c.window.SyncAttachmentCodec)).toEqual(['verify']);
  expect(Object.keys(require('../sync-attachment-codec'))).toEqual(['verify']);
});
test('codec is precached and fingerprinted',()=>{
  expect(read('sw.js')).toContain("'./sync-attachment-codec.js'");
  expect(read('sw.js')).toContain('"./sync-attachment-codec.js": {');
});
test('protocol errors call the engine callback immediately and preserve its rejected error',async()=>{
  const Codec=require('../sync-attachment-codec');let called=false;
  const error=new Error('protocol');
  const pending=Codec.verify({_version:2},null,null,null,()=>{called=true;return error;},64*1024*1024);
  expect(called).toBe(true);await expect(pending).rejects.toBe(error);
});
