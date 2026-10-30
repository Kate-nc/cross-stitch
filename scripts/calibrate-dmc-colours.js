// ═══════════════════════════════════════════════════════════════════
// calibrate-dmc-colours.js — derive DMC screen colours from three references
// ═══════════════════════════════════════════════════════════════════
// The community RGB table (threadcolors.com and copies) is consistently
// lighter and paler than real thread. This script darkens it and corrects
// the worst threads, using only the inputs in
// reports/dmc-colour-calibration.csv:
//
//   community_hex  the community table the app used up to 30 October 2026
//   scan_hex       median of each swatch on a scanned DMC thread card
//   older_hex      the older camelia.sk palette (independent of the above)
//
// Step 1, tone curve: every channel becomes 255 * (v / 255) ^ GAMMA.
//   GAMMA 1.4 fits the scan best and 1.2–1.25 fits the older palette
//   best. 1.3 sits between them and improves the fit to both. White (255)
//   and black (0) do not move.
// Step 2, hand corrections: a thread is corrected only when all three hold
//   - after the curve it is still at least FAR_DE (ΔE2000) from the scan
//   - the older palette is closer to the scan than the curved value is
//   - the older palette differs from the curved value by at least AGREE_DE
//   The new value is the Lab average of the curved value, the scan and the
//   older palette. The last two checks stop a scanner colour cast (the scan
//   alone disagreeing) from moving a thread.
//
// None of these are physical measurements. Check against real thread.
//
//   node scripts/calibrate-dmc-colours.js           report only
//   node scripts/calibrate-dmc-colours.js --check   exit 1 if dmc-data.js or the CSV differ
//   node scripts/calibrate-dmc-colours.js --write   update dmc-data.js and the CSV
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { rgbToLab } = require('../dmc-data');
const { labToRgb, dE2000 } = require('../colour-utils');

const GAMMA = 1.3;
const FAR_DE = 12;
const AGREE_DE = 5;

const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'reports', 'dmc-colour-calibration.csv');
const DATA_PATH = path.join(ROOT, 'dmc-data.js');

function parseCsv(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const cells = [];
    let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const head = rows.shift();
  return { head, rows: rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || '']))) };
}
const csvCell = v => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));

const fromHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
const curve = rgb => rgb.map(v => Math.round(255 * Math.pow(v / 255, GAMMA)));
const de = (a, b) => dE2000(rgbToLab(...a), rgbToLab(...b));

/** Returns { rgb, method } for one CSV row. */
function calibrate(row) {
  const curved = curve(fromHex(row.community_hex));
  if (!row.scan_hex || !row.older_hex) return { rgb: curved, method: 'curve' };
  const scan = fromHex(row.scan_hex), older = fromHex(row.older_hex);
  const dCurvedScan = de(curved, scan);
  if (dCurvedScan >= FAR_DE && de(older, scan) < dCurvedScan && de(curved, older) >= AGREE_DE) {
    const labs = [curved, scan, older].map(c => rgbToLab(...c));
    const mean = [0, 1, 2].map(i => (labs[0][i] + labs[1][i] + labs[2][i]) / 3);
    return { rgb: labToRgb(...mean), method: 'hand' };
  }
  return { rgb: curved, method: 'curve' };
}

function readCatalogue() {
  const src = fs.readFileSync(DATA_PATH, 'utf8');
  const m = src.match(/const DMC_RAW=(\[.*?\]);/s);
  if (!m) throw new Error('Cannot locate DMC_RAW in dmc-data.js');
  return { src, match: m[0], raw: JSON.parse(m[1]) };
}

function run(mode) {
  const { head, rows } = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  const { src, match, raw } = readCatalogue();
  if (rows.length !== raw.length) throw new Error('CSV and catalogue have different row counts');
  const problems = [];
  const next = raw.map((entry, i) => {
    const row = rows[i];
    if (row.id !== entry[0] || row.name !== entry[1]) throw new Error('CSV row ' + (i + 2) + ' does not match catalogue entry ' + entry[0]);
    const { rgb, method } = calibrate(row);
    const hex = toHex(rgb);
    if (row.final_hex !== hex || row.method !== method) problems.push(entry[0] + ': CSV says ' + (row.final_hex || '-') + ' ' + (row.method || '-') + ', expected ' + hex + ' ' + method);
    if (toHex(entry.slice(2, 5)) !== hex) problems.push(entry[0] + ': dmc-data.js has ' + toHex(entry.slice(2, 5)) + ', expected ' + hex);
    row.final_hex = hex;
    row.method = method;
    return [entry[0], entry[1], ...rgb];
  });
  if (mode === '--write') {
    fs.writeFileSync(DATA_PATH, src.replace(match, 'const DMC_RAW=' + JSON.stringify(next) + ';'));
    fs.writeFileSync(CSV_PATH, [head.join(','), ...rows.map(r => head.map(h => csvCell(r[h])).join(','))].join('\n') + '\n');
    console.log('Wrote ' + next.length + ' entries (' + rows.filter(r => r.method === 'hand').length + ' hand-corrected).');
    return 0;
  }
  if (problems.length) {
    console.error(problems.length + ' differences:\n  ' + problems.slice(0, 20).join('\n  '));
    return mode === '--check' ? 1 : 0;
  }
  console.log('dmc-data.js and the calibration CSV are up to date (' + next.length + ' entries).');
  return 0;
}

if (require.main === module) process.exitCode = run(process.argv[2]);
module.exports = { calibrate, curve, GAMMA, FAR_DE, AGREE_DE, CSV_PATH, parseCsv };
