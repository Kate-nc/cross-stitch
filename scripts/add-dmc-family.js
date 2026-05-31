// ─────────────────────────────────────────────────────────────────────────────
// scripts/add-dmc-family.js
//
// Adds a `DMC_FAM` colour-family lookup to dmc-data.js and extends the
// `DMC` map to expose a `fam` field (1–19, or 0 for specialty/unclassified).
//
// Family numbers mirror the physical DMC cotton-floss thread card layout:
//   1  Salmon · Coral · Red · Garnet
//   2  Carnation · Rose · Pink · Geranium
//   3  Dusty Rose · Mauve · Cranberry · Plum
//   4  Shell Pink · Antique Mauve · Antique Violet · Grape
//   5  Lavender · Violet · Blue Violet · Cornflower Blue
//   6  Lavender Blue · Delft Blue · Royal Blue · Electric Blue · Bright Turquoise
//   7  Blue Gray · Baby Blue · Navy Blue · Antique Blue
//   8  Sky Blue · Wedgewood · Peacock Blue · Turquoise · Gray Green · Teal
//   9  Sea Green · Aquamarine · Jade · Celadon · Blue Green
//  10  Nile Green · Emerald · Pistachio · Forest Green · Hunter Green
//  11  Chartreuse · Kelly Green · Parrot Green · Avocado Green · Fern Green · Green Gray
//  12  Pine Green · Moss Green · Olive Green · Khaki · Mustard · Golden Olive
//  13  Drab Brown · Yellow Beige · Old Gold · Topaz · Straw
//  14  Lemon · Topaz · Canary · Yellow · Tangerine · Orange · Pumpkin · Apricot
//  15  Tawny · Orange Spice · Copper · Mahogany · Autumn Gold
//  16  Golden Brown · Peach · Terra Cotta · Rosewood · Desert Sand
//  17  Shell Gray · Cocoa · Cream · Tan · Brown · Coffee Brown · Mocha Beige
//  18  White · Beige Gray · Brown Gray · Mocha Brown · Beige Brown
//  19  Beaver Gray · Pearl Gray · Steel Gray · Pewter · Black
//   0  Specialty / not on standard card
//
// Source for standard-range assignments (01–35, 150–3895):
//   adrianj/CrossStitchCreator CSV — physical card row data
//   Specialty 01–35 range and 3880+ assigned by hue proximity.
//
// Run once from repo root:  node scripts/add-dmc-family.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');

// ── Family membership lists ───────────────────────────────────────────────────
// Row numbers match physical DMC thread card pages (card rows 01–19).
// Each array is ordered as it appears on the card (light → dark within family).
const FAM = {
  1:  ['3713','761','760','3712','3328','347',
       '353','352','351','350','349','817',
       '3708','3706','3705','3801','666','321','304','498','816','815','814',
       // specialty: Shrimp / Alizarin (warm salmon hues)
       '20','21','22',
       // other in-range
       '3684'],
  2:  ['894','893','892','891','818','957','956','309',
       '963','3716','962','961','3833','3832','3831','777',
       '819','3326','776','899','335','326'],
  3:  ['151','3354','3733','3731','3350','150',
       '3689','3688','3687','3803','3685',
       '605','604','603','602','601','600',
       '3806','3805','3804','3609','3608','3607','718','917','915',
       // specialty: Apple Blossom (mauve-pink), Fuchsia range
       '23','33','34','35',
       '3886'],
  4:  ['225','224','152','223','3722','3721','221',
       '778','3727','316','3726','315','3802','902',
       '3743','3042','3041','3740',
       '3836','3835','3834','154',
       // specialty: near antique mauve/violet
       '3880','3888'],
  5:  ['211','210','209','208','3837','327',
       '153','554','553','552','550',
       '3747','341','156','340','155','3746','333',
       '157','794','793','3807','792','158','791','804',
       // specialty: White Lavender, Lavender, Violet, Blueberry range
       '23','24','25','26','27','28','29','30','31','32',
       '3887'],
  6:  ['3840','3839','3838',
       '800','809','799','798','797','796','820',
       '162','827','813','826','825','824',
       '996','3843','995','3846','3845','3844',
       // other in-range
       '805','808',
       // specialty: Bright Turquoise (light)
       '3890'],
  7:  ['159','160','161',
       '3756','775','3841','3325','3755','334','322','312','803','336','823','939',
       '3753','3752','932','931','930','3750',
       // specialty: Dark Blueberry → deep blue; newer blue darks
       '802','3885'],
  8:  ['828','3761','519','518','3760','517','3842','311',
       '747','3766','807','806','3765',
       '3811','598','597','3810','3809','3808',
       '928','927','926','3768','924',
       '3849','3848','3847',
       // specialty: Very Dark Bright Turquoise
       '3891'],
  9:  ['964','959','958','3812','3851','943','3850',
       '993','992','3814','991',
       '966','564','563','562','505',
       '3817','3816','163','3815','561',
       '504','3813','503','502','501','500',
       // 505-510 Grass Green family (by hue)
       '506','507','508','509','510'],
  10: ['955','954','913','912','911','910','909','3818',
       '369','368','320','367','319','890',
       '164','989','988','987','986',
       '772','3348','3347','3346','3345','895',
       // specialty: Nile Green (named match)
       '13'],
  11: ['704','703','702','701','700','699',
       '907','906','905','904',
       '472','471','470','469','937','936','935','934',
       '523','3053','3052','3051','524','522','520',
       // specialty: Tender Green range (yellow-green)
       '10','11','12','14','15','16',
       // 511-516 Avocado Gray family
       '511','512','513','514','515','516',
       // newer: Pale Avocado, Very Light Parrot Green
       '3881','3894'],
  12: ['3364','3363','3362',
       '165','3819','166','581','580',
       '734','733','732','731','730',
       '3013','3012','3011',
       '372','371','370',
       '834','833','832','831','830','829',
       // specialty: Yellow Plum (yellow-olive)
       '17','18'],
  13: ['613','612','611','610',
       '3047','3046','3045','167',
       '746','677','422','3828','420','869',
       '728','783','782','781','780',
       '676','729','680','3829',
       '3822','3821','3820','3852',
       // specialty: Medium Light Autumn Gold (Straw-adjacent)
       '19'],
  14: ['445','307','973','444','3078','727','726','725','972',
       '745','744','743','742','741','740',
       '970','971','947','946','900',
       '967','3824','3341','3340','608','606',
       // newer: Lemon/Yellow adjacents
       '3889','974'],
  15: ['951','3856','722','721','720','3825',
       '922','921','920','919','918',
       '3770','945','402','3776','301','400','300',
       '3823','3855','3854','3853',
       // newer: Medium Light Orange Spice
       '3883','3892'],
  16: ['3827','977','976','3826','975',
       '948','754','3771','758','3778','356','3830','355','3777',
       '3779','3859','3858','3857',
       '3774','950','3064','407','3773','3772','632',
       // other in-range
       '633',
       // newer: Peach Med/Dk (hue proximity)
       '968','969'],
  17: ['453','452','451',
       '3861','3860','779',
       '712','739','738','437','436','435','434','433','801','898','938','3371',
       '543','3864','3863','3862','3031',
       // specialty: Driftwood / Cocoa range (warm beige-brown)
       '05','06','07','08','09',
       // newer
       '3882','3893'],
  18: ['B5200','blanc','3865','ecru',
       '822','644','642','640','3787','3021',
       '3024','3023','3022',
       '535','3033','3782','3032','3790','3781','3866',
       '842','841','840','839','838'],
  19: ['3072','648','647','646','645','844',
       '762','415','318','414',
       '168','169','317','413','3799','310',
       // specialty: White Tin range (cool grays)
       '01','02','03','04',
       // newer
       '3884','3895'],
};

// 5 also incorrectly listed '23' — remove it (23 = Apple Blossom is row 3/mauve)
// Fix: remove '23' from fam 5, keep only in fam 3
{
  const f5 = FAM[5];
  const idx = f5.indexOf('23');
  if (idx !== -1) f5.splice(idx, 1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const filePath = path.join(__dirname, '..', 'dmc-data.js');
let content = fs.readFileSync(filePath, 'utf8');

// Build a flat id→family map to validate coverage against DMC_RAW
const rawMatch = content.match(/(const DMC_RAW=)(\[.*?\]);/s);
if (!rawMatch) { console.error('Cannot find DMC_RAW'); process.exit(1); }
const dmcRaw = JSON.parse(rawMatch[2]);
const idToFam = {};
for (const [fam, ids] of Object.entries(FAM)) {
  for (const id of ids) {
    if (idToFam[id]) {
      console.warn(`WARNING: id "${id}" assigned to both fam ${idToFam[id]} and fam ${fam}`);
    }
    idToFam[id] = +fam;
  }
}

let unclassified = 0;
for (const entry of dmcRaw) {
  const id = String(entry[0]);
  if (!idToFam[id]) {
    console.log(`  unclassified: ${id}  "${entry[1]}"`);
    unclassified++;
  }
}
if (unclassified > 0) {
  console.log(`\n${unclassified} unclassified entries — assigning fam 0`);
}

// ── Build compact JS for DMC_FAM ─────────────────────────────────────────────
const famLines = Object.entries(FAM)
  .sort((a, b) => +a[0] - +b[0])
  .map(([fam, ids]) => `  ${fam}:[${ids.map(id => JSON.stringify(id)).join(',')}]`);

const famBlock = [
  '// DMC colour-family lookup — physical thread card layout (rows 1–19).',
  '// 0 = specialty or not on the standard card.',
  '// Source: adrianj/CrossStitchCreator CSV; specialty 01–35 / 3880+ by hue proximity.',
  `const DMC_FAM={`,
  famLines.join(',\n'),
  `};`,
  `const _famById={};for(const[f,ids]of Object.entries(DMC_FAM))for(const id of ids)_famById[id]=+f;`,
].join('\n');

// ── Insert DMC_FAM block after DMC_RAW line ───────────────────────────────────
if (content.includes('const DMC_FAM=')) {
  // Already present — replace it (re-run safe)
  content = content.replace(
    /\/\/ DMC colour-family lookup[\s\S]*?_famById\[id\]=\+f;\}/,
    famBlock
  );
  console.log('\nReplaced existing DMC_FAM block.');
} else {
  // First run — insert after the DMC_RAW line
  content = content.replace(
    /(const DMC_RAW=\[.*?\];)/s,
    `$1\n\n${famBlock}`
  );
  console.log('\nInserted DMC_FAM block after DMC_RAW.');
}

// ── Update the DMC map to include fam ────────────────────────────────────────
const oldMap = `const DMC=DMC_RAW.map(d=>({id:d[0],name:d[1],rgb:[d[2],d[3],d[4]],lab:rgbToLab(d[2],d[3],d[4])}));`;
const newMap = `const DMC=DMC_RAW.map(d=>({id:d[0],name:d[1],rgb:[d[2],d[3],d[4]],lab:rgbToLab(d[2],d[3],d[4]),fam:_famById[d[0]]??0}));`;

if (content.includes(oldMap)) {
  content = content.replace(oldMap, newMap);
  console.log('Updated DMC map to include fam field.');
} else if (content.includes(newMap)) {
  console.log('DMC map already has fam field.');
} else {
  console.warn('WARNING: Could not find expected DMC map line — check dmc-data.js manually.');
}

// ── Update module.exports to include DMC_FAM ─────────────────────────────────
const oldExports = `module.exports = { rgbToLab, dE, dE2, dE00, DMC, SYMS };`;
const newExports = `module.exports = { rgbToLab, dE, dE2, dE00, DMC, DMC_FAM, SYMS };`;
if (content.includes(oldExports)) {
  content = content.replace(oldExports, newExports);
  console.log('Updated module.exports to include DMC_FAM.');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone — dmc-data.js updated.');
