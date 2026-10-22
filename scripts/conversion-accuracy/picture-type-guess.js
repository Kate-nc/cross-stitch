const fs=require('fs');const {createCanvas,loadImage}=require('canvas');
const { detectUniformBorder } = require(process.cwd()+'/colour-utils.js');
const src=fs.readFileSync(process.cwd()+'/creator/useCreatorState.js','utf8');
const block = src.slice(src.indexOf('var PICTURE_PRESETS = {'), src.indexOf('function threadCountsShort(c) {'));
const api = new Function('window', block + 'return {analysePicture,guessPictureType};')({ detectUniformBorder });
async function info(buf,label){const img=await loadImage(buf);const sc=Math.min(1,400/Math.max(img.width,img.height));const cw=Math.round(img.width*sc),ch=Math.round(img.height*sc);const c=createCanvas(cw,ch),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.fillStyle='#fff';x.fillRect(0,0,cw,ch);x.drawImage(img,0,0,cw,ch);const i=api.analysePicture(x.getImageData(0,0,cw,ch),img.width,img.height);console.log(label.padEnd(28),api.guessPictureType(i).padEnd(8),'distinct',i.distinct,'top8',i.top8Cover.toFixed(3),'flat',i.flat.toFixed(3),'border',!!i.border);}
(async()=>{
 const logo=await loadImage('tests/fixtures/logo.png');
 const c=createCanvas(logo.width,logo.height),x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(logo,0,0);
 await info(c.toBuffer('image/png'),'logo PNG (on white)');
 for(const q of [0.95,0.85,0.7]) await info(c.toBuffer('image/jpeg',{quality:q}),'logo JPEG q'+q);
 // a flat 6-colour graphic with anti-aliased circles, 800px
 const g=createCanvas(800,600),gx=g.getContext('2d');gx.fillStyle='#f4efe4';gx.fillRect(0,0,800,600);const cols=['#c0392b','#2e86c1','#f1c40f','#27ae60','#34495e'];cols.forEach((cc,k)=>{gx.fillStyle=cc;gx.beginPath();gx.arc(120+k*140,300,60+k*5,0,7);gx.fill();});gx.fillStyle='#34495e';gx.font='bold 64px sans-serif';gx.fillText('Hello',300,500);
 await info(g.toBuffer('image/png'),'flat graphic PNG');
 await info(g.toBuffer('image/jpeg',{quality:0.85}),'flat graphic JPEG q0.85');
 const dir=process.argv[2]||require('path').join(__dirname,'img');for (const f of fs.readdirSync(dir)) await info(fs.readFileSync(dir+'/'+f),'photo '+f);
})();
