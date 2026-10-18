const {indexedDB}=require('fake-indexeddb');
const C=require('../thread-catalogues');
const header='brand,code,name,rgb,status,substitute,provenance\n';
const csv=(rows)=>header+rows.join('\n');
beforeEach(()=>{global.openManagerDB=()=>new Promise((resolve,reject)=>{const req=indexedDB.open('catalogue-'+Math.random(),1);req.onupgradeneeded=()=>req.result.createObjectStore('manager_state');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});});
test('brand-qualified strings retain zeros, Unicode and absent RGB',()=>{
 const p=C.preview(csv(['one,001,Crème,,unknown,,unknown','two,001,海,#aabbcc,discontinued,one:A-7,Label','one,A-7,Blue,,active,,Personal']));
 expect(p.errors).toEqual([]);expect(p.duplicates).toEqual([]);
 expect(p.records.map(t=>t.key)).toEqual(['one:001','two:001','one:A-7']);expect(p.records[0].rgb).toBeNull();
 expect(C.preview(C.exportCSV(p.records)).records).toEqual(p.records);
});
test.each(['one,1,"unclosed,,active,,unknown','one,1,a"b,,active,,unknown','one,1,"a"x,,active,,unknown','one,1,Name,#12345,active,,unknown','one,1,Name,rgb(1),active,,unknown','one,1,Name,,bad,,unknown','dmc,310,Black,,active,,unknown'])('rejects malformed input %s',row=>expect(C.preview(csv([row])).errors.length).toBeGreaterThan(0));
test('duplicates block, with cross-brand codes independent',()=>{const text=csv(['one,1,A,,active,,unknown','one,1,B,,active,,unknown']);expect(C.preview(text).duplicates).toHaveLength(1);expect(C.preview(csv(['one,1,A,,active,,unknown']),[{key:'one:1'}]).duplicates).toHaveLength(1);});
test('formula fields, quotes, newlines and apostrophes round trip safely',()=>{
 const records=['=SUM(1,2)',' \t@evil',"'literal",'海\n"blue"','-formula','+formula','\tformula'].map((name,i)=>({key:'mine:'+i,brand:'mine',code:String(i),name,rgb:null,status:'unknown',substitute:'',provenance:name}));
 const exported=C.exportCSV(records);expect(exported).toContain('"\'=SUM(1,2)"');expect(exported).toContain('"\' \t@evil"');expect(C.preview(exported).records).toEqual(records);
});
test('atomic commit rechecks stored duplicates; invalid bulk import writes nothing',async()=>{
 const req=indexedDB.open('atomic-'+Math.random(),1);const db=await new Promise(resolve=>{req.onupgradeneeded=()=>req.result.createObjectStore('manager_state');req.onsuccess=()=>resolve(req.result);});const name=db.name;db.close();
 global.openManagerDB=()=>new Promise(resolve=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);});
 const a=csv(['one,001,A,,active,,unknown']);await C.commit(a);
 await expect(C.commit(a)).rejects.toThrow();
 await expect(C.commit(csv(['two,002,B,,active,,unknown','two,003,C,#bad,active,,unknown']))).rejects.toThrow();
 expect((await C.read()).map(t=>t.key)).toEqual(['one:001']);
 const concurrent=await Promise.allSettled([C.commit(csv(['two,1,B,,active,,unknown'])),C.commit(csv(['two,1,C,,active,,unknown']))]);expect(concurrent.map(r=>r.status).sort()).toEqual(['fulfilled','rejected']);
});
