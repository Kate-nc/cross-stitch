// Historical correction runner, now a READ-ONLY audit check.
// The former script's source/measurement claims were not supported and its
// hard-coded values were not authoritative. Never apply a reference wholesale.
// See reports/dmc-colour-audit.md for URLs, decisions and unresolved colours.
// Since 30 October 2026 the RGB values come from scripts/calibrate-dmc-colours.js
// (reports/dmc-colour-calibration.md). VERIFIED holds its hand-corrected threads.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { calibrate, CSV_PATH, parseCsv } = require('./calibrate-dmc-colours');
const IDENTITY_SHA256 = '99f285414453dbe2e9f80cf3c0bf793c4b13c0eba03c0408698adb090d681029';
// Hand-corrected threads from the calibration; screen approximations, not physical measurements.
const VERIFIED = Object.fromEntries(parseCsv(fs.readFileSync(CSV_PATH, 'utf8')).rows
  .map(row => [row.id, calibrate(row)])
  .filter(([, result]) => result.method === 'hand')
  .map(([id, result]) => [id, result.rgb]));
function validateCatalogue(raw) {
  const seen = new Set();
  for (const row of raw) {
    const [id, name, ...rgb] = row;
    if (typeof id !== 'string' || !id || seen.has(id)) throw new Error('Invalid or duplicate ID: ' + id);
    seen.add(id);
    if (typeof name !== 'string' || !name || rgb.length !== 3 || !rgb.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
      throw new Error('Invalid name/RGB: ' + id);
    }
    if (VERIFIED[id] && rgb.some((v, i) => v !== VERIFIED[id][i])) throw new Error('Reviewed value differs: ' + id);
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(raw.map(r => r.slice(0, 2)))).digest('hex');
  if (raw.length !== 525 || hash !== IDENTITY_SHA256) throw new Error('Catalogue coverage, IDs, names or order changed');
  return raw.length;
}
if (require.main === module) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'dmc-data.js'), 'utf8');
  const match = source.match(/const DMC_RAW=(\[.*?\]);/s);
  if (!match) throw new Error('Cannot locate DMC_RAW');
  console.log('Read-only audit: ' + validateCatalogue(JSON.parse(match[1])) + ' valid entries; ' + Object.keys(VERIFIED).length + ' hand-corrected values match. No files written.');
}
module.exports = { validateCatalogue, VERIFIED };
