// User-owned catalogue records. Never merged into manufacturer matching pools.
(function(root) {
  'use strict';
  const fields = ['brand','code','name','rgb','status','substitute','provenance'];
  const validRGB = rgb => Array.isArray(rgb) && rgb.length === 3 && rgb.every(v => Number.isInteger(v) && v >= 0 && v <= 255);
  function parseCSV(text) {
    if (typeof text !== 'string' || text.length > 5000000) throw Error('CSV must be text under 5 MB.');
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], value = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i+1] === '"') { value += '"'; i++; }
        else if (c === '"') { quoted = false; closed = true; }
        else value += c;
      } else if (c === ',' || c === '\n' || c === '\r') {
        row.push(value); value = ''; closed = false;
        if (c !== ',') { if (c === '\r' && text[i+1] === '\n') i++; rows.push(row); row = []; }
      } else if (c === '"' && !value && !closed) quoted = true;
      else { if (closed || c === '"') throw Error('Malformed CSV quoting.'); value += c; }
    }
    if (quoted) throw Error('Unclosed CSV quote.');
    if (value || row.length || closed) { row.push(value); rows.push(row); }
    return rows;
  }
  // Apostrophe escape is reversible, including user-entered apostrophes.
  const unsafe = s => /^[\s]*[=+\-@]/u.test(s) || /^[\t\r\n]/.test(s);
  const encode = s => { s = String(s); return "\"" + ((unsafe(s) || s.startsWith("'")) ? "'" + s : s).replace(/"/g,'""') + "\""; };
  const decode = s => s.startsWith("'") && (s[1] === "'" || unsafe(s.slice(1))) ? s.slice(1) : s;
  function preview(text, existing = []) {
    const errors = [], records = [], duplicates = [];
    let rows;
    try { rows = parseCSV(text); } catch(e) { return {errors:[e.message],duplicates,records}; }
    if (!rows.length || rows[0].join(',') !== fields.join(',')) return {errors:['Expected header: ' + fields.join(',')],duplicates,records};
    const seen = new Set(existing.map(t => t.key));
    rows.slice(1).forEach((row, i) => {
      const line = i + 2;
      if (row.length !== fields.length) { errors.push('Row ' + line + ': expected 7 fields.'); return; }
      const [brand,code,name,colour,status,substitute,provenance] = row.map(decode);
      const key = brand + ':' + code;
      const problems = [];
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(brand)) problems.push('brand must be a lowercase slug');
      if (brand === 'dmc' || brand === 'anchor') problems.push('built-in brands are read-only; use a distinct custom brand slug');
      if (!code || code !== code.trim() || /[:\x00-\x1f]/.test(code)) problems.push('code must be non-empty with no colon, control characters or surrounding whitespace');
      if (!name.trim()) problems.push('name is required');
      const rgb = colour ? (/^#[0-9a-fA-F]{6}$/.test(colour) ? [1,3,5].map(n=>parseInt(colour.slice(n,n+2),16)) : null) : null;
      if (colour && !validRGB(rgb)) problems.push('RGB must be #RRGGBB or empty');
      if (!['active','discontinued','unknown'].includes(status)) problems.push('status must be active, discontinued or unknown');
      if (substitute && !/^[a-z][a-z0-9-]{0,63}:[^:\x00-\x1f]+$/.test(substitute)) problems.push('substitute must be brand:code');
      if (substitute === key) problems.push('substitute cannot refer to itself');
      if (!provenance.trim()) problems.push('provenance is required (use unknown when unavailable)');
      if (seen.has(key)) duplicates.push('Row ' + line + ': duplicate ' + key);
      seen.add(key);
      if (problems.length) errors.push('Row ' + line + ': ' + problems.join('; '));
      else records.push({key,brand,code,name,rgb,status,substitute,provenance});
    });
    if (!rows.slice(1).length) errors.push('CSV has no records.');
    return {errors, duplicates, records};
  }
  function exportCSV(records) {
    return fields.join(',') + '\r\n' + records.map(t => [t.brand,t.code,t.name,t.rgb ? '#' + t.rgb.map(v=>v.toString(16).padStart(2,'0')).join('') : '',t.status,t.substitute,t.provenance].map(encode).join(',')).join('\r\n');
  }
  async function read() {
    const db = await openManagerDB();
    try { return await new Promise((resolve,reject)=>{ const tx=db.transaction('manager_state','readonly'); const req=tx.objectStore('manager_state').get('customThreadCatalogues'); req.onsuccess=()=>resolve(req.result || []); req.onerror=()=>reject(req.error); }); }
    finally { db.close(); }
  }
  async function commit(text) {
    const db = await openManagerDB();
    try { return await new Promise((resolve,reject)=>{
      const tx=db.transaction('manager_state','readwrite'), store=tx.objectStore('manager_state'); let result;
      tx.oncomplete=()=>resolve(result); tx.onabort=()=>reject(tx.error || Error('Import rejected. No records were saved.')); tx.onerror=()=>{};
      const req=store.get('customThreadCatalogues');
      req.onsuccess=()=>{
        const existing=req.result || [], check=preview(text,existing);
        if (check.errors.length || check.duplicates.length) { tx.abort(); return; }
        result=existing.concat(check.records); store.put(result,'customThreadCatalogues');
      };
    }); } finally { db.close(); }
  }
  const api = {parseCSV,preview,exportCSV,read,commit,validRGB};
  root.ThreadCatalogues=api;
  if (typeof module !== 'undefined') module.exports=api;
})(typeof window !== 'undefined' ? window : globalThis);
