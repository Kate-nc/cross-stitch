/** @jest-environment jsdom */
const fs = require('fs');
function load() { const win = {}; new Function('window', fs.readFileSync('user-prefs.js','utf8'))(win); return win.UserPrefs; }
beforeEach(()=>localStorage.clear());
const settings = p => Object.fromEntries(p.EXPORT_PRESET_KEYS.map(k=>[k,p.get(k)]));
test('create, edit, rename, delete and reload global presets; no project metadata or branding text captured',()=>{
  let p=load();
  p.saveExportPreset('Shop A4', {...settings(p), projectName:'secret', designerName:'old profile'});
  p=load(); expect(p.namedExportPresets()[0]).toEqual({version:1,scope:'global',name:'Shop A4',settings:settings(p)});
  p.saveExportPreset('Shop Letter', {...settings(p), exportPageSize:'letter', exportIncludeBranding:false}, 'Shop A4');
  expect(load().namedExportPresets()[0].settings).toMatchObject({exportPageSize:'letter',exportIncludeBranding:false});
  expect(p.namedExportPresets()[0].name).toBe('Shop Letter');
  p.deleteExportPreset('Shop Letter'); expect(load().namedExportPresets()).toEqual([]);
});
test('rejects duplicate, empty, overlong names and invalid settings without replacing saved data',()=>{
  const p=load(), v=settings(p); p.saveExportPreset('Print',v);
  for(const [name, patch] of [['print',{}],[' ',{}],['x'.repeat(81),{}],['bad',{exportMarginsMm:NaN}],['bad',{exportCustomCols:9}],['bad',{exportPageSize:'a3'}],['bad',{exportChartModeBw:false,exportChartModeColour:false}]]) {
    expect(()=>p.saveExportPreset(name,{...v,...patch})).toThrow();
    expect(p.namedExportPresets()).toHaveLength(1);
  }
});
test('full preference backup restores global scope; older backups reset new settings to defaults',()=>{
  const p=load(); p.saveExportPreset('Charts', {...settings(p),exportIncludeLegend:false});
  const backup=p.exportPortable(); localStorage.clear(); const dest=load(); dest.restorePortable(backup);
  expect(load().namedExportPresets()[0]).toMatchObject({scope:'global',settings:{exportIncludeLegend:false}});
  dest.restorePortable({version:1,stateSchemaVersion:dest.STATE_SCHEMA_VERSION,values:{exportPageSize:'letter'}});
  expect(dest.namedExportPresets()).toEqual([]); expect(dest.get('exportIncludeLegend')).toBe(true);
});
test('corrupt or project-scoped preset data cannot become executable export options',()=>{
  const p=load(); p.set('exportNamedPresets',[{version:1,scope:'project',name:'bad',settings:settings(p)}]);
  expect(p.namedExportPresets()).toEqual([]); expect(p.exportPortable().values.exportNamedPresets).toEqual([]);
});
test('older custom densities remain reusable and are snapped by the existing geometry controls',()=>{
 const p=load();p.saveExportPreset('Legacy custom',{...settings(p),exportStitchesPerPage:'custom',exportCustomCols:88,exportCustomRows:99});
 expect(load().namedExportPresets()[0].settings.exportCustomCols).toBe(88);
});
test('preset limit and storage failure leave saved presets intact',()=>{
 const p=load(),v=settings(p);
 for(let i=0;i<50;i++)p.saveExportPreset('Print '+i,v);
 expect(()=>p.saveExportPreset('Overflow',v)).toThrow('up to 50');
 const write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Quota exceeded');});
 try {expect(()=>p.saveExportPreset('Changed',v,'Print 0')).toThrow('Could not save');expect(p.namedExportPresets()[0].name).toBe('Print 0');}
 finally{write.mockRestore();}
});
