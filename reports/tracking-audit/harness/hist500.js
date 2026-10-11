// 500 sessions on the small fixture, for timing the Stats pages. Writes fx/history500.json.
const WORK = process.env.AUDIT_WORK || (require('os').tmpdir() + '/tracking-audit-work/');
const fs = require('fs'); const S = WORK + 'fx/';
const p = JSON.parse(fs.readFileSync(S + 'small.json', 'utf8'));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const sessions = []; let total = 0;
for (let i = 0; i < 500; i++) {
  const d = new Date(); d.setDate(d.getDate() - Math.floor((500 - i) * 1.2)); d.setHours(19 + (i % 3), 0, 0, 0);
  const n = 3, m = 20 + (i % 40);
  total += n;
  sessions.push({ id: 'sess_b' + i, date: ymd(d), startTime: d.toISOString(), endTime: new Date(d.getTime() + m * 60000).toISOString(), durationSeconds: m * 60, durationMinutes: m, stitchesCompleted: n, stitchesUndone: 0, netStitches: n, totalAtEnd: total, percentAtEnd: Math.round(total / 1600 * 1000) / 10, note: '', coloursWorked: [] });
}
p.done = p.done.map((v, i) => (i < total ? 1 : 0));
p.statsSessions = sessions; p.id = 'proj_history500'; p.name = 'History 500';
fs.writeFileSync(S + 'history500.json', JSON.stringify(p));
console.log('sessions', sessions.length, 'total', total);
