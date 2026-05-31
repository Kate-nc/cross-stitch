// ─────────────────────────────────────────────────────────────────────────────
// scripts/update-dmc-colours.js
//
// One-off script to apply corrected RGB values to dmc-data.js.
//
// Sources cross-referenced (all three agree on every changed value below,
// except the 01–35 range which only appears in Cassandra Dias / official
// DMC thread-card scans):
//   • threadcolors.com             (community-maintained, well-validated)
//   • adrianj/CrossStitchCreator   (GitHub CSV from DMC official colours)
//   • cassandramdias.com           (sampled from physical DMC thread cards)
//
// Run once from the repo root:   node scripts/update-dmc-colours.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// Lookup: DMC id → [R, G, B] corrected value
// Only entries where ≥2 authoritative sources agree on a value that
// differs from what is currently in dmc-data.js are listed here.
const CORRECTIONS = {
  // ── Blanc (White) ──────────────────────────────────────────────────────────
  'blanc': [252, 251, 248],

  // ── New specialty colours 01–35 (Cassandra Dias / official thread card) ───
  '01': [227, 227, 230],
  '02': [215, 215, 216],
  '03': [184, 184, 187],
  '04': [174, 174, 177],
  '05': [227, 204, 190],
  '06': [220, 198, 184],
  '07': [143, 123, 110],
  '08': [106,  80,  70],
  '09': [ 85,  32,  14],
  '10': [237, 254, 217],
  '11': [226, 237, 181],
  '12': [205, 217, 154],
  '13': [191, 246, 224],
  '14': [208, 251, 178],
  '15': [209, 237, 164],
  '16': [201, 194,  88],
  '17': [229, 226, 114],
  '18': [217, 213, 109],
  '19': [247, 201,  95],
  '20': [247, 175, 147],
  '21': [215, 153, 130],
  '22': [188,  96,  78],
  '23': [237, 226, 237],
  '24': [224, 215, 238],
  '25': [218, 210, 233],
  '26': [215, 202, 230],
  '27': [240, 238, 249],
  '28': [144, 134, 169],
  '29': [103,  64, 118],
  '30': [125, 119, 165],
  '31': [ 80,  81, 141],
  '32': [ 77,  46, 138],
  '33': [156,  89, 158],
  '34': [125,  48, 100],
  '35': [ 70,   5,  45],

  // ── Red / Pink / Rose family ───────────────────────────────────────────────
  '309': [214,  43,  91],  // Rose Dark:         was brownish [186,74,74]
  '321': [199,  43,  59],  // Christmas Red:     all 3 refs agree
  '349': [210,  16,  53],  // Coral Dark:        G was wrong
  '350': [224,  72,  72],  // Coral Medium:      was [224,95,85]
  '351': [233, 106, 103],  // Coral:             G fix
  '352': [253, 156, 151],  // Coral Light:       B fix
  '353': [254, 215, 204],  // Peach:             large diff; refs agree
  '666': [227,  29,  66],  // Christmas Red Br:  was near-wine [205,10,24]
  '817': [187,   5,  31],  // Coral Red VDk:     was [177,0,26]
  '819': [255, 238, 235],  // Baby Pink Lt:      was [255,233,231]
  '891': [255,  87, 115],  // Carnation Dark:    was [255,77,95]
  '892': [255, 121, 140],  // Carnation Med:     was [255,108,131]
  '893': [252, 144, 162],  // Carnation Lt:      was [252,133,154]
  '956': [255, 145, 145],  // Geranium:          was [255,109,115]

  // ── Cranberry ──────────────────────────────────────────────────────────────
  '603': [255, 164, 190],  // Cranberry:         was [255,115,140]

  // ── Drab Brown family ─────────────────────────────────────────────────────
  '611': [150, 118,  86],  // Drab Brown:        was [150,135,104]
  '612': [188, 154, 120],  // Drab Brown Lt:     was [188,174,147]
  '613': [220, 196, 170],  // Drab Brown VLt:    was [220,211,188]

  // ── Beige Gray family ──────────────────────────────────────────────────────
  '640': [133, 123,  97],  // Beige Gray VDk:    B fix
  '642': [164, 152, 120],  // Beige Gray Dk:     B fix

  // ── Olive Green family (all values significantly wrong) ────────────────────
  '730': [130, 123,  48],  // Olive Green VDk:   was [74,89,35]
  '731': [147, 139,  55],  // Olive Green Dk:    was [97,112,53]
  '732': [148, 140,  54],  // Olive Green:       was [122,135,77]
  '733': [188, 179,  76],  // Olive Green Med:   was [152,164,115]
  '734': [199, 192, 119],  // Olive Green Lt:    was [180,191,152]

  // ── Tangerine / Orange family ──────────────────────────────────────────────
  '740': [255, 139,   0],  // Tangerine:         was [255,131,19]
  '741': [255, 163,  43],  // Tangerine Med:     was [255,142,4]
  '742': [255, 191,  87],  // Tangerine Lt:      was [255,183,85]

  // ── Tan family ────────────────────────────────────────────────────────────
  '437': [228, 187, 142],  // Tan Lt:            was [222,178,132]

  // ── Cocoa / Brown ─────────────────────────────────────────────────────────
  '779': [ 98,  75,  69],  // Cocoa Dark:        was wrong brown [111,68,35]

  // ── Royal Blue family ──────────────────────────────────────────────────────
  '796': [ 17,  65, 109],  // Royal Blue Dk:     was [26,76,128]
  '797': [ 19,  71, 125],  // Royal Blue:        was [22,82,150]

  // ── Turquoise family ───────────────────────────────────────────────────────
  '597': [ 91, 163, 179],  // Turquoise:         B fix; was [91,163,153]
  '598': [144, 195, 204],  // Turquoise Lt:      B fix; was [144,195,191]

  // ── Teal family ────────────────────────────────────────────────────────────
  '3848': [ 85, 147, 146], // Teal Med:          was [85,156,143]

  // ── Electric Blue / Bright Turquoise ──────────────────────────────────────
  '3843': [ 20, 170, 208], // Electric Blue:     was [0,162,201]
  '3844': [ 18, 174, 186], // Bright Turq Dk:    was [0,164,176]

  // ── Lavender Blue ─────────────────────────────────────────────────────────
  '3838': [ 92, 114, 148], // Lavender Bl Dk:    was [107,100,146]

  // ── Golden Brown ──────────────────────────────────────────────────────────
  '976': [194, 129,  66],  // Golden Brn Med:    B fix; was [194,129,44]

  // ── Pine Green ────────────────────────────────────────────────────────────
  '3362': [ 94, 107,  71], // Pine Grn Dk:       was [77,93,59]

  // ── Khaki / Green Gray ────────────────────────────────────────────────────
  '3011': [137, 138,  88], // Khaki Dk:          was [137,118,79]
  '3012': [166, 167,  93], // Khaki Med:         was [166,149,103]
  '3013': [185, 185, 130], // Khaki Lt:          was [185,171,127]

  // ── Brown Gray family ─────────────────────────────────────────────────────
  '3021': [ 79,  75,  65], // Brn Gray VDk:      was [79,65,49]
  '3022': [142, 144, 120], // Brn Gray Med:      G fix; was [142,136,120]
};

// ─── Main ────────────────────────────────────────────────────────────────────

const filePath = path.join(__dirname, '..', 'dmc-data.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the DMC_RAW line (it's a single very long line)
const rawMatch = content.match(/(const DMC_RAW=)(\[.*?\]);/s);
if (!rawMatch) {
  console.error('ERROR: Could not locate DMC_RAW in dmc-data.js');
  process.exit(1);
}

// Parse it safely without eval — use JSON.parse after stripping the assignment
let dmcRaw;
try {
  dmcRaw = JSON.parse(rawMatch[2]);
} catch (e) {
  console.error('ERROR: Could not JSON.parse DMC_RAW:', e.message);
  process.exit(1);
}

let changedCount = 0;
const changes = [];

const updated = dmcRaw.map(entry => {
  const [id, name, r, g, b] = entry;
  const corr = CORRECTIONS[String(id)];
  if (!corr) return entry;
  const [nr, ng, nb] = corr;
  if (nr === r && ng === g && nb === b) return entry; // already correct
  changedCount++;
  changes.push({ id, name, from: [r, g, b], to: [nr, ng, nb] });
  return [id, name, nr, ng, nb];
});

if (changedCount === 0) {
  console.log('No changes needed — all values already match references.');
  process.exit(0);
}

// Report
console.log(`Applying ${changedCount} colour corrections:\n`);
const padId   = s => String(s).padStart(6);
const padName = s => s.padEnd(32);
for (const { id, name, from, to } of changes) {
  const hex = v => v.toString(16).padStart(2, '0');
  const fromHex = '#' + from.map(hex).join('');
  const toHex   = '#' + to.map(hex).join('');
  console.log(`  ${padId(id)}  ${padName(name)}  ${fromHex} → ${toHex}  rgb(${from}) → rgb(${to})`);
}

// Rebuild the DMC_RAW line
const newRawStr = rawMatch[1] + JSON.stringify(updated) + ';';
content = content.replace(/(const DMC_RAW=)\[.*?\];/s, newRawStr);

// Update the "Last reviewed" date
const today = new Date().toISOString().slice(0, 10);
content = content.replace(/^\/\/ Last reviewed: .*/m, `// Last reviewed: ${today}`);

// Update the sources comment to mention the new references
content = content.replace(
  /\/\/ Source: Community consensus dataset, cross-referenced with:/,
  '// Source: Community consensus dataset, cross-referenced with:'
);

// Prepend the new sources if not already listed
if (!content.includes('threadcolors.com')) {
  content = content.replace(
    /\/\/   • nathantspencer\/DMC-ColorCodes .*/,
    `//   • nathantspencer/DMC-ColorCodes (DMC website CSS scrape, 2017)\n//   • threadcolors.com (community-validated RGB values)\n//   • adrianj/CrossStitchCreator GitHub CSV (DMC official colours)\n//   • cassandramdias.com (sampled from physical DMC thread cards, 2025)`
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`\nWrote updated dmc-data.js  (${changedCount} entries changed)`);
