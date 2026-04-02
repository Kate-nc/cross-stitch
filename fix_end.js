const fs = require('fs');
let code = fs.readFileSync('creator-app.js', 'utf8');

const regex = /<<<<<<< HEAD\n  \{modal==="stitch_guide"&&<SharedModals\.StitchGuide onClose=\{\(\)=>setModal\(null\)\} \/>\}\n=======\n  \{modal==="calculator"&&<SharedModals\.Calculator onClose=\{\(\)=>setModal\(null\)\} \/>\}\n  \{modal==="calculator_batch"&&<SharedModals\.Calculator onClose=\{\(\)=>setModal\(null\)\} initialPatterns=\{pal\} \/>\}\n>>>>>>> origin\/main/g;

code = code.replace(regex, `  {modal==="stitch_guide"&&<SharedModals.StitchGuide onClose={()=>setModal(null)} />}
  {modal==="calculator"&&<SharedModals.Calculator onClose={()=>setModal(null)} />}
  {modal==="calculator_batch"&&<SharedModals.Calculator onClose={()=>setModal(null)} initialPatterns={pal} />}`);

fs.writeFileSync('creator-app.js', code);
