// Original, freely redistributable test data authored for stitchx. No commercial chart.
// Independent byte writer for the public v7 layout; expected geometry is hand-written in tests.
function fixture(opts = {}) {
  const chunks = [], offsets = {};
  let length = 0;
  const put = b => { chunks.push(b); length += b.length; };
  const u8 = n => put(Buffer.from([n]));
  const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); put(b); };
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); put(b); };
  const str = s => { const b = Buffer.from(s, 'latin1'); u16(b.length); put(b); };
  const w = opts.w ?? 3, h = opts.h ?? 2;
  const head = Buffer.alloc(256); head.write('PCStitch ' + (opts.version || 7) + ' Pattern File'); put(head);
  put(Buffer.alloc(8)); offsets.dimensions = length;
  u16(w); u16(h); u16(14); u16(opts.fabricY ?? 14); put(Buffer.from([255,255,255,0]));
  ['Test author', '', 'Original fixture', '', '', '', ''].forEach(str);
  u16(2); u16(1); offsets.marker = length; put(Buffer.from('PCStitch Floss Palette!!!'));
  put(Buffer.alloc(4));
  const palette = opts.palette || [{scheme:'DMC', id:'310', rgb:[0,0,0]}, {scheme:'DMC', id:'321', rgb:[199,43,59]}];
  u16(palette.length); offsets.palette = length;
  palette.forEach(p => {
    const b = Buffer.alloc(250); b.write(p.scheme,0,33,'latin1'); b.write(p.id,33,10,'latin1'); b.write(p.id,43,30,'latin1');
    p.rgb.forEach((v,i) => { b[77+i] = v; }); put(b);
  });
  offsets.runs = length;
  (opts.runs || [[1,1,1],[1,255,255],[2,2,1],[2,255,255]]).forEach(([n,c,t]) => {u16(n);u8(c);u8(t);});
  offsets.extras = length;
  u32((opts.extras || []).length);
  (opts.extras || []).forEach(e => { u16(e.x); u16(e.y); e.stitches.forEach(([c,t])=>{u8(c);u8(t);}); });
  offsets.knots = length; u32((opts.knots || []).length);
  (opts.knots || []).forEach(k => k.forEach(u16));
  offsets.lines = length; u32((opts.lines || []).length);
  (opts.lines || []).forEach(l => l.forEach(u16));
  if (opts.trailing) put(Buffer.from(opts.trailing));
  return { bytes: Buffer.concat(chunks), offsets };
}
module.exports = { fixture };
