// Original tiny test charts. No third-party pattern data or parser is embedded.
// Layout offsets are from the public XSD structure notes (docs/xsd-import.md).
const put16 = (b,o,v) => b.writeUInt16LE(v,o);
function chart(opts = {}) {
  const width = opts.width || 3, height = opts.height || 2;
  const entries = opts.palette || [{brand:0,id:'310',rgb:[0,0,0]}, {brand:0,id:'321',rgb:[200,0,0]}];
  const header = Buffer.alloc(763);
  put16(header,0,0x0510); [8,4,12,4].forEach((v,i) => put16(header,6+i*2,v));
  put16(header,741,width);put16(header,743,height);
  const small = opts.small || [];
  header.writeUInt32LE(small.length,745);put16(header,749,(opts.joints || []).length);
  put16(header,751,14);put16(header,753,14);put16(header,759,0x1600);put16(header,761,entries.length);
  const palette = Buffer.alloc(entries.length * 123);
  entries.forEach((p,i) => {
    const o=i*123; palette[o+2]=p.brand;palette.write(p.id,o+3,11,'ascii');
    (p.rgb||[0,0,0]).forEach((v,j)=>{palette[o+55+j]=v;});
    const blends=p.blends||[];put16(palette,o+59,blends.length);
    blends.forEach((c,j)=>{palette[o+61+j*12]=c.brand;palette.write(c.id,o+62+j*12,11,'ascii');palette[o+109+j]=c.strands;});
    if(p.bead) {palette.writeUInt32LE(1,o+113);put16(palette,o+117,25);put16(palette,o+119,15);}
  });
  const positions = Buffer.alloc(entries.length*2);
  entries.forEach((_,i)=>put16(positions,i*2,opts.reversePalette ? entries.length-1-i : i));
  const fixed = Buffer.alloc(entries.length*(18+16)+28080+entries.length*12+380+56+109+2626+52+32+16412+512);
  // Every note is zero length; no display setting or metadata is required.
  const prefix = Buffer.concat([header,palette,positions,fixed]);
  const words = opts.words || [0x00000000,0x00010000,0x0f000000,0x0f000000,0x0f000000,0x0f000000];
  const seed = [498347506,626547637,1679951037,2146703145];
  const shifts = [18,25,28,30,21,26,13,22,29,30,15,23,9,20,10,5];
  let key=-228908503, random=seed[0];
  const encoded=Buffer.alloc(20+words.length*4);
  seed.forEach((v,i)=>encoded.writeUInt32LE(v,i*4));encoded.writeUInt32LE(words.length,16);
  words.forEach((v,i)=>{encoded.writeUInt32LE((v^key^random)>>>0,20+i*4);key=((key<<shifts[i%16])|(key>>>(32-shifts[i%16])))>>>0;random=(random+seed[1])>>>0;});
  const models = opts.models || Buffer.alloc(4);
  const joints=(opts.joints||[]).map(j=>{
    if(j.kind===3){const b=Buffer.alloc(7+j.points.length*4);put16(b,0,3);put16(b,5,j.points.length);j.points.forEach((p,i)=>{put16(b,7+i*4,p[0]);put16(b,9+i*4,p[1]);});return b;}
    const b=Buffer.alloc(j.kind===6?12:14);put16(b,0,j.kind);put16(b,4,j.x*2);put16(b,6,j.y*2);
    if(j.kind===6){b[8]=j.pi||0;put16(b,10,j.rotation||0);}else{put16(b,8,(j.x2||0)*2);put16(b,10,(j.y2||0)*2);b[12]=j.pi||0;}return b;
  });
  return {bytes:Buffer.concat([prefix,encoded,...small.map(b=>Buffer.from(b)),models,...joints]), stream:prefix.length,
    smallOffset:prefix.length+encoded.length, modelOffset:prefix.length+encoded.length+small.length*10, paletteOffset:763};
}
module.exports={chart};
