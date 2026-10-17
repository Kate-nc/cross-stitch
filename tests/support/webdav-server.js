// In-memory, local HTTP contract fixture, never a production server. Enforces
// account collection ACLs, atomic conditional PUT, CORS and revocable passwords.
const http = require('http');
async function webdavServer(origin = 'http://127.0.0.1:8000') {
  const resources = new Map(), passwords = new Map([['alice','alice-test-password'],['bob','bob-test-password']]);
  const requests = [], faults = {}, sockets = new Set(); let next = 0;
  const server = http.createServer(async (req,res) => {
    requests.push({method:req.method,path:req.url}); // never log Authorization
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Access-Control-Allow-Methods','OPTIONS, PROPFIND, GET, PUT');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Depth, Content-Type, If-Match, If-None-Match');
    res.setHeader('Access-Control-Expose-Headers','ETag, Content-Length');
    res.setHeader('Vary','Origin');
    if (req.method === 'OPTIONS') {res.writeHead(204);res.end();return;}
    const [user,...parts] = Buffer.from((req.headers.authorization || '').slice(6),'base64').toString().split(':');
    if (!passwords.has(user) || passwords.get(user)!==parts.join(':')) {res.writeHead(401);res.end();return;}
    const root = '/'+user+'/stitchx/';
    if (!req.url.startsWith(root)) {res.writeHead(403);res.end();return;}
    if (faults.hold && await faults.hold(req,res)) return;
    if (req.method === 'PROPFIND') {
      if (req.headers.depth!=='1' || req.url!==root) {res.writeHead(400);res.end();return;}
      res.writeHead(207,{'Content-Type':'application/xml'});
      res.end('<d:multistatus xmlns:d="DAV:">'+[...resources.keys()].filter(k=>k.startsWith(root)).map(k=>'<d:response><d:href>'+k+'</d:href></d:response>').join('')+(faults.extraHref?'<d:response><d:href>'+faults.extraHref+'</d:href></d:response>':'')+'</d:multistatus>');return;
    }
    if (!/^stitchx-[A-Za-z0-9_-]+\.csync$/.test(req.url.slice(root.length))) {res.writeHead(404);res.end();return;}
    const stored=resources.get(req.url);
    if (req.method==='GET') {
      if (!stored) {res.writeHead(404);res.end();return;}
      if (req.headers['if-none-match']===stored.etag) {res.writeHead(304);res.end();return;}
      res.writeHead(200,{'ETag':stored.etag,'Content-Length':stored.data.length});
      if (faults.interruptGet) {faults.interruptGet=false;res.write(stored.data.subarray(0,4));setImmediate(()=>res.destroy());return;}
      res.end(stored.data);return;
    }
    if (req.method==='PUT') {
      if (faults.interruptPut) {faults.interruptPut=false;req.resume();res.destroy();return;}
      const chunks=[];try {for await (const c of req) chunks.push(c);} catch (_) {return;}
      if (faults.failPut) {res.writeHead(503);res.end();return;}
      const current=resources.get(req.url);
      if (faults.collide) {faults.collide=false;res.writeHead(412);res.end();return;}
      if ((current && req.headers['if-match']!==current.etag) || (!current && req.headers['if-none-match']!=='*')) {res.writeHead(412);res.end();return;}
      const etag='"'+(++next)+'"';resources.set(req.url,{data:Buffer.concat(chunks),etag});
      if (faults.dropPutAck) {faults.dropPutAck=false;res.destroy();return;}
      res.writeHead(current?204:201,{'ETag':etag});res.end();return;
    }
    res.writeHead(405);res.end();
  });
  server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
  const url='http://127.0.0.1:'+server.address().port;
  return {url,resources,passwords,requests,faults,options:(user='alice')=>({url:url+'/'+user+'/stitchx/',username:user,password:user+'-test-password'}),
    close:()=>new Promise(r=>{for(const s of sockets)s.destroy();server.close(r);})};
}
module.exports={webdavServer};
