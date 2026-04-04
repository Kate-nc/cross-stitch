var fs = require('fs');
var content = fs.readFileSync('tracker-app.js', 'utf8');
var lines = content.split('\n');
var start = -1, end = -1;
// Find old mode toolbar opening (after line 1620 to avoid false matches)
for (var i = 1620; i < lines.length; i++) {
  if (lines[i].indexOf('gap:6,marginBottom:6,alignItems') > -1 && start === -1) {
    start = i;
  }
  if (start > -1 && lines[i].indexOf('fecaca') > -1 && lines[i].indexOf('Revert to Original') > -1) {
    // Close is 2 more lines: "      </div>}" and "    </div>"
    end = i + 2;
    break;
  }
}
if (start === -1 || end === -1) { console.log('NOT FOUND start='+start+' end='+end); process.exit(1); }
console.log('Removing lines ' + (start+1) + ' to ' + (end+1) + ' (0-indexed: '+start+' to '+end+')');
console.log('First line: ' + lines[start].trim().substring(0, 80));
console.log('Last line:  ' + lines[end].trim().substring(0, 80));
lines.splice(start, end - start + 1);
fs.writeFileSync('tracker-app.js', lines.join('\n'), 'utf8');
console.log('Done. File now has ' + lines.length + ' lines.');
