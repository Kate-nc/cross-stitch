/* starter-kits.js — Preset thread starter kits for DMC and Anchor.
   Each kit is an array of bare thread IDs for the given brand.
   Used by BulkAddModal in the Pattern Creator. */

var STARTER_KITS = (function () {
  // 48 most-used DMC colours (Anchor equiv noted in comments)
  var DMC_ESSENTIALS = [
    "blanc",  // White
    "310",    // Black
    "318",    // Steel Grey Lt
    "414",    // Steel Grey Dk
    "415",    // Pearl Grey
    "317",    // Pewter Grey
    "453",    // Shell Grey Lt
    "451",    // Shell Grey Dk
    "3865",   // Winter White
    "644",    // Beige Grey Med
    "3033",   // Mocha Brown Vy Lt
    "422",    // Hazel Nut Brown Lt
    "420",    // Hazel Nut Brown Dk
    "801",    // Coffee Brown Dk
    "938",    // Coffee Brown Ultra Dk
    "3371",   // Black Brown
    "754",    // Peach Flesh Lt
    "353",    // Peach Flesh
    "352",    // Coral Lt
    "351",    // Coral
    "349",    // Coral Dk
    "347",    // Salmon Vy Dk
    "760",    // Salmon
    "3341",   // Apricot
    "3340",   // Apricot Med
    "741",    // Tangerine Med
    "740",    // Tangerine
    "970",    // Pumpkin Lt
    "971",    // Pumpkin
    "444",    // Lemon Dk
    "307",    // Lemon
    "726",    // Topaz Lt
    "725",    // Topaz
    "781",    // Topaz Vy Dk
    "3820",   // Straw Dk
    "3819",   // Moss Green Lt
    "166",    // Moss Green Med Lt
    "703",    // Chartreuse
    "702",    // Kelly Green
    "700",    // Christmas Green Bright
    "699",    // Christmas Green
    "321",    // Christmas Red
    "498",    // Christmas Red Dk
    "816",    // Garnet
    "336",    // Navy Blue
    "312",    // Baby Blue Vy Dk
    "311",    // Navy Blue Med
    "820"     // Royal Blue Vy Dk
  ];

  // 36 core Anchor colours often bought as a starter
  var ANCHOR_ESSENTIALS = [
    "1",      // White
    "403",    // Black
    "399",    // Steel Grey Lt (≈ DMC 318)
    "401",    // Steel Grey Dk (≈ DMC 414)
    "398",    // Pearl Grey (≈ DMC 415)
    "400",    // Pewter Grey (≈ DMC 317)
    "2",      // White (Bright)
    "391",    // Beige (≈ DMC 644)
    "376",    // Mocha Brown Lt (≈ DMC 3033)
    "374",    // Hazel Nut Brown Lt (≈ DMC 422)
    "374",    // omit dup — kept for positional notes
    "357",    // Coffee Brown Dk (≈ DMC 801)
    "381",    // Coffee Brown Ultra Dk (≈ DMC 938)
    "382",    // Black Brown (≈ DMC 3371)
    "6",      // Peach Flesh Lt (≈ DMC 754)
    "8",      // Peach Flesh (≈ DMC 353)
    "10",     // Coral Lt (≈ DMC 352)
    "11",     // Coral (≈ DMC 351)
    "13",     // Coral Dk (≈ DMC 349)
    "1014",   // Salmon Vy Dk (≈ DMC 347)
    "9",      // Salmon (≈ DMC 760)
    "328",    // Apricot (≈ DMC 3341)
    "329",    // Apricot Med (≈ DMC 3340)
    "314",    // Tangerine Med (≈ DMC 741)
    "316",    // Tangerine (≈ DMC 740)
    "316",    // (dup)
    "298",    // Lemon Dk (≈ DMC 444)
    "295",    // Lemon (≈ DMC 307)
    "290",    // Topaz Lt (≈ DMC 726)
    "291",    // Topaz (≈ DMC 725)
    "309",    // Topaz Vy Dk (≈ DMC 781)
    "259",    // Kelly Green (≈ DMC 702)
    "228",    // Christmas Green Bright (≈ DMC 700)
    "9046",   // Christmas Red (≈ DMC 321)
    "1006",   // Christmas Red Dk (≈ DMC 498)
    "44"      // Garnet (≈ DMC 816)
  ].filter(function (id, idx, arr) { return arr.indexOf(id) === idx; }); // dedup

  // Collector/project packs — curated thematic sets
  var SKIN_TONES_DMC = ["746","3856","951","945","3774","402","407","3830","3778","632","407","3861"];
  var AUTUMN_DMC = ["3852","782","781","975","921","920","919","918","3826","3825","3824","301","300"];
  var OCEAN_DMC = ["747","3811","3766","807","3765","598","597","3843","3842","3841","336","312","311","820","939"];
  var FLORAL_DMC = ["3865","blanc","3713","761","760","3712","352","351","963","3716","962","961","3607","3608","718","917"];

  return {
    dmc: {
      essentials: { label: 'DMC Essentials (48)', ids: DMC_ESSENTIALS },
      skinTones:  { label: 'Skin Tones — DMC',    ids: SKIN_TONES_DMC },
      autumn:     { label: 'Autumn Palette — DMC', ids: AUTUMN_DMC },
      ocean:      { label: 'Ocean Palette — DMC',  ids: OCEAN_DMC },
      floral:     { label: 'Floral Palette — DMC', ids: FLORAL_DMC },
    },
    anchor: {
      essentials: { label: 'Anchor Essentials (36)', ids: ANCHOR_ESSENTIALS },
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STARTER_KITS };
} else {
  window.STARTER_KITS = STARTER_KITS;
}
