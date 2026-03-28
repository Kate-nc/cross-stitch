function drawCk(ctx,x,y,s){for(let cy=0;cy<s;cy+=CK)for(let cx=0;cx<s;cx+=CK){ctx.fillStyle=((Math.floor(cx/CK)+Math.floor(cy/CK))%2===0)?"#f0f0f0":"#dcdcdc";ctx.fillRect(x+cx,y+cy,Math.min(CK,s-cx),Math.min(CK,s-cy));}}

function fmtTime(s){let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h>0?`${h}h ${m}m`:`${m}m`;}
function fmtTimeL(s){let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);if(h>0)return`${h} hr${h>1?"s":""} ${m} min`;return`${m} min`;}

function skeinEst(stitchCount,fabricCt){let fc=FABRIC_COUNTS.find(f=>f.ct===fabricCt)||FABRIC_COUNTS[0];let totalIn=stitchCount*fc.inPerSt*2;return Math.max(1,Math.ceil(totalIn/SKEIN_LENGTH_IN));}

function gridCoord(canvasRef,e,cellSize,gutter,snap=false){
  if(!canvasRef.current)return null;
  let rect=canvasRef.current.getBoundingClientRect();
  let mx=e.clientX-rect.left,my=e.clientY-rect.top;
  let gx=snap?Math.round((mx-gutter)/cellSize):Math.floor((mx-gutter)/cellSize);
  let gy=snap?Math.round((my-gutter)/cellSize):Math.floor((my-gutter)/cellSize);
  return{gx,gy};
}

// Difficulty rating
function calcDifficulty(palLen,blendCount,totalSt){
  let score=0;
  if(palLen<=8)score+=1;else if(palLen<=15)score+=2;else if(palLen<=25)score+=3;else score+=4;
  if(blendCount>0)score+=1;if(blendCount>5)score+=1;
  if(totalSt>10000)score+=1;if(totalSt>30000)score+=1;
  if(score<=2)return{label:"Beginner",color:"#16a34a",stars:1};
  if(score<=4)return{label:"Intermediate",color:"#d97706",stars:2};
  if(score<=6)return{label:"Advanced",color:"#ea580c",stars:3};
  return{label:"Expert",color:"#dc2626",stars:4};
}

// IndexedDB utility functions
const DB_NAME = "CrossStitchDB";
const STORE_NAME = "projects";

function getDB() {
  return new Promise((resolve, reject) => {
    let request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      let db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveProjectToDB(project) {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      let tx = db.transaction(STORE_NAME, "readwrite");
      let store = tx.objectStore(STORE_NAME);
      let request = store.put(project, "auto_save");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to save project to IndexedDB", err);
  }
}

async function loadProjectFromDB() {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      let tx = db.transaction(STORE_NAME, "readonly");
      let store = tx.objectStore(STORE_NAME);
      let request = store.get("auto_save");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to load project from IndexedDB", err);
    return null;
  }
}

async function clearProjectFromDB() {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      let tx = db.transaction(STORE_NAME, "readwrite");
      let store = tx.objectStore(STORE_NAME);
      let request = store.delete("auto_save");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to clear project from IndexedDB", err);
  }
}
