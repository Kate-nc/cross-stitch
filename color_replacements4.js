const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix Welcome screen h1/subtitle
  content = content.replace(
    /<h1 style=\{\{fontSize:28, fontWeight:700, color:"#0f172a", marginBottom:8\}\}>/g,
    '<h1 style={{fontSize:28, fontWeight:700, color:"#18181b", marginBottom:8}}>'
  );

  content = content.replace(
    /<p style=\{\{fontSize:15, color:"#64748b", marginBottom:32\}\}>/g,
    '<p style={{fontSize:15, color:"#71717a", marginBottom:32}}>'
  );

  content = content.replace(
    /color:"#1e293b"/g,
    'color:"#18181b"'
  );

  // Colour palette strip: selected border -> #0d9488, unselected -> #e4e4e7, bg -> #f0fdfa
  content = content.replace(
    /ips\?"2px solid #2563eb":ihs\?"2px solid #ea580c":"1\.5px solid #e2e5ea"/g,
    'ips?"2px solid #0d9488":ihs?"2px solid #ea580c":"0.5px solid #e4e4e7"'
  );
  content = content.replace(
    /ips\?"#eff6ff":ihs\?"#fff7ed":"#fff"/g,
    'ips?"#f0fdfa":ihs?"#fff7ed":"#fff"'
  );

  // Undo button
  content = content.replace(
    /border:"1px solid #bfdbfe",borderRadius:6,background:"#eff6ff",color:"#2563eb"/g,
    'border:"0.5px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488"'
  );

  // Clear highlight button
  // KEEP red

  // Section badges
  content = content.replace(
    /background:"#5b7bb3"/g,
    'background:"#0d9488"'
  );

  // Export tab buttons - check if we missed any from the bulk find-and-replace
  content = content.replace(
    /background:"linear-gradient\(135deg,#5b7bb3,#4a6fa5\)"/g,
    'background:"#0d9488"'
  );
  content = content.replace(
    /border:"1\.5px solid #5b7bb3",background:"#fff",color:"#5b7bb3"/g,
    'border:"0.5px solid #0d9488",background:"#fff",color:"#0d9488"'
  );

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('creator-app.js');
processFile('index.html');
