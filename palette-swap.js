/* palette-swap.js — Colour palette swap component for cross-stitch Creator */

// ═══════════════════════════════════════════════════════════
// OKLCH Colour Conversion Utilities
// ═══════════════════════════════════════════════════════════

function rgbToOklab(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  r = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  g = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  b = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  l = Math.cbrt(l); m = Math.cbrt(m); s = Math.cbrt(s);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  };
}

function oklabToOklch(L, a, b) {
  var C = Math.sqrt(a * a + b * b);
  var H = Math.atan2(b, a) * 180 / Math.PI;
  if (H < 0) H += 360;
  return { L: L, C: C, H: H };
}

function oklchToOklab(L, C, H) {
  var hRad = H * Math.PI / 180;
  return { L: L, a: C * Math.cos(hRad), b: C * Math.sin(hRad) };
}

function oklabToRgb(L, a, b) {
  var l = L + 0.3963377774 * a + 0.2158037573 * b;
  var m = L - 0.1055613458 * a - 0.0638541728 * b;
  var s = L - 0.0894841775 * a - 1.2914855480 * b;
  l = l * l * l; m = m * m * m; s = s * s * s;
  var r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  var bv = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  // Linear to sRGB gamma
  r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
  bv = bv <= 0.0031308 ? 12.92 * bv : 1.055 * Math.pow(bv, 1 / 2.4) - 0.055;
  return [
    Math.max(0, Math.min(255, Math.round(r * 255))),
    Math.max(0, Math.min(255, Math.round(g * 255))),
    Math.max(0, Math.min(255, Math.round(bv * 255)))
  ];
}

function shiftRgbHue(rgb, degrees) {
  var ok = rgbToOklab(rgb[0], rgb[1], rgb[2]);
  var lch = oklabToOklch(ok.L, ok.a, ok.b);
  lch.H = (lch.H + degrees) % 360;
  if (lch.H < 0) lch.H += 360;
  var ab = oklchToOklab(lch.L, lch.C, lch.H);
  return oklabToRgb(ab.L, ab.a, ab.b);
}

function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  var n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  return '#' + rgb.map(function(c) { return ('0' + c.toString(16)).slice(-2); }).join('');
}

// ═══════════════════════════════════════════════════════════
// Preset Palette Data (Tiered: 8 / 16 / 24 colours)
// ═══════════════════════════════════════════════════════════

var PALETTE_PRESETS = [
  {
    id: "rocky_coastline",
    name: "Rocky coastline",
    category: "nature",
    description: "Slate, sea spray, kelp green, sand, stormy grey",
    tiers: {
      8:  ["#708090","#B0E0E6","#2E8B57","#C2B280","#4A4A4A","#F5F5F0","#5F9EA0","#D2B48C"],
      16: ["#708090","#B0E0E6","#2E8B57","#C2B280","#4A4A4A","#F5F5F0","#5F9EA0","#D2B48C",
           "#36454F","#87CEEB","#6B8E23","#A0937D","#1C3A3A","#DCDCDC","#3CB371","#8B8378"],
      24: ["#708090","#B0E0E6","#2E8B57","#C2B280","#4A4A4A","#F5F5F0","#5F9EA0","#D2B48C",
           "#36454F","#87CEEB","#6B8E23","#A0937D","#1C3A3A","#DCDCDC","#3CB371","#8B8378",
           "#2F4F4F","#ADD8E6","#4F6D3B","#E8DCC8","#696969","#7B9EA8","#9DB4A0","#BDB5A1"]
    }
  },
  {
    id: "desert_at_dusk",
    name: "Desert at dusk",
    category: "nature",
    description: "Terracotta, sand gold, cactus, purple dusk",
    tiers: {
      8:  ["#CD5C5C","#DAA520","#6B8E23","#7B68AE","#F4A460","#FFB6C1","#2F4F4F","#FFF8DC"],
      16: ["#CD5C5C","#DAA520","#6B8E23","#7B68AE","#F4A460","#FFB6C1","#2F4F4F","#FFF8DC",
           "#8B4513","#C19A6B","#556B2F","#9370DB","#E8927C","#DDA0DD","#4A3728","#FFE4B5"],
      24: ["#CD5C5C","#DAA520","#6B8E23","#7B68AE","#F4A460","#FFB6C1","#2F4F4F","#FFF8DC",
           "#8B4513","#C19A6B","#556B2F","#9370DB","#E8927C","#DDA0DD","#4A3728","#FFE4B5",
           "#A0522D","#E6C87D","#808000","#6A5ACD","#D2A679","#C9A0DC","#3D3021","#F5E6CC"]
    }
  },
  {
    id: "cherry_blossom",
    name: "Cherry blossom",
    category: "nature",
    description: "Delicate spring pinks, dark branches, soft greens",
    tiers: {
      8:  ["#FFB7C5","#8B6914","#90EE90","#FFFAFA","#C71585","#DDA0DD","#556B2F","#F5F5DC"],
      16: ["#FFB7C5","#8B6914","#90EE90","#FFFAFA","#C71585","#DDA0DD","#556B2F","#F5F5DC",
           "#FF91A4","#A0522D","#6B8E23","#FFF0F5","#DB7093","#E6D5E8","#3B4A2B","#FFE4E1"],
      24: ["#FFB7C5","#8B6914","#90EE90","#FFFAFA","#C71585","#DDA0DD","#556B2F","#F5F5DC",
           "#FF91A4","#A0522D","#6B8E23","#FFF0F5","#DB7093","#E6D5E8","#3B4A2B","#FFE4E1",
           "#FFC0CB","#6B4423","#77AB59","#F8E8EE","#B03060","#C8A2C8","#4A5D23","#FAEBD7"]
    }
  },
  {
    id: "coral_reef",
    name: "Coral reef",
    category: "nature",
    description: "Turquoise, hot coral, anemone purple, sunlit sand",
    tiers: {
      8:  ["#40E0D0","#FF7F50","#9370DB","#F5DEB3","#FFD700","#FF1493","#00CED1","#FFFACD"],
      16: ["#40E0D0","#FF7F50","#9370DB","#F5DEB3","#FFD700","#FF1493","#00CED1","#FFFACD",
           "#20B2AA","#E6735A","#8A5FC7","#DEC49B","#FFB347","#C71585","#008B8B","#FFF8DC"],
      24: ["#40E0D0","#FF7F50","#9370DB","#F5DEB3","#FFD700","#FF1493","#00CED1","#FFFACD",
           "#20B2AA","#E6735A","#8A5FC7","#DEC49B","#FFB347","#C71585","#008B8B","#FFF8DC",
           "#5F9EA0","#FF6347","#7B68AE","#C2B280","#DAA520","#DB7093","#2E8B57","#F0E68C"]
    }
  },
  {
    id: "autumn_woodland",
    name: "Autumn woodland",
    category: "nature",
    description: "Copper, mushroom beige, berry red, moss, bark",
    tiers: {
      8:  ["#B87333","#D2B48C","#8B0000","#6B8E23","#5C4033","#DAA520","#F4A460","#556B2F"],
      16: ["#B87333","#D2B48C","#8B0000","#6B8E23","#5C4033","#DAA520","#F4A460","#556B2F",
           "#CD853F","#E8DCC8","#A52A2A","#808000","#3B2716","#C19A6B","#DEB887","#2E4F2E"],
      24: ["#B87333","#D2B48C","#8B0000","#6B8E23","#5C4033","#DAA520","#F4A460","#556B2F",
           "#CD853F","#E8DCC8","#A52A2A","#808000","#3B2716","#C19A6B","#DEB887","#2E4F2E",
           "#A0522D","#F5F0E1","#CC0000","#4F6D3B","#8B7355","#B8860B","#C4A882","#3D5229"]
    }
  },
  {
    id: "thunderstorm",
    name: "Thunderstorm",
    category: "weather",
    description: "Dramatic darks, lightning white, bruised purple, cold rain blue",
    tiers: {
      8:  ["#36454F","#FFFAFA","#4682B4","#483D8B","#778899","#B0C4DE","#191970","#C0C0C0"],
      16: ["#36454F","#FFFAFA","#4682B4","#483D8B","#778899","#B0C4DE","#191970","#C0C0C0",
           "#2F4F4F","#DCDCDC","#5B7FA5","#6A5ACD","#696969","#87CEEB","#0C0C3A","#A9A9A9"],
      24: ["#36454F","#FFFAFA","#4682B4","#483D8B","#778899","#B0C4DE","#191970","#C0C0C0",
           "#2F4F4F","#DCDCDC","#5B7FA5","#6A5ACD","#696969","#87CEEB","#0C0C3A","#A9A9A9",
           "#1C2833","#F5F5F5","#3D6E8E","#7B68AE","#808080","#6699CC","#1B2A4A","#BCC6CC"]
    }
  },
  {
    id: "tropical_sunrise",
    name: "Tropical sunrise",
    category: "weather",
    description: "Mango, hibiscus pink, ocean teal, palm green, radiant gold",
    tiers: {
      8:  ["#FF8C00","#FF1493","#008B8B","#228B22","#FFD700","#FF6347","#20B2AA","#FFF8DC"],
      16: ["#FF8C00","#FF1493","#008B8B","#228B22","#FFD700","#FF6347","#20B2AA","#FFF8DC",
           "#CC7000","#C71585","#006666","#2E8B57","#DAA520","#E55B3C","#5F9EA0","#FFE4B5"],
      24: ["#FF8C00","#FF1493","#008B8B","#228B22","#FFD700","#FF6347","#20B2AA","#FFF8DC",
           "#CC7000","#C71585","#006666","#2E8B57","#DAA520","#E55B3C","#5F9EA0","#FFE4B5",
           "#FF4500","#DB7093","#2F4F4F","#6B8E23","#B8860B","#CD5C5C","#40E0D0","#FFDAB9"]
    }
  },
  {
    id: "victorian_garden",
    name: "Victorian garden",
    category: "cultural",
    description: "Dusty rose, sage, plum, antique gold, cream",
    tiers: {
      8:  ["#BC8F8F","#8FBC8F","#8E4585","#BDB76B","#FFFDD0","#C08081","#556B2F","#D4A574"],
      16: ["#BC8F8F","#8FBC8F","#8E4585","#BDB76B","#FFFDD0","#C08081","#556B2F","#D4A574",
           "#9B7A7A","#6B8E6B","#6A2E6B","#8B7D3C","#F5F0E1","#A06060","#3D4F2A","#C19A6B"],
      24: ["#BC8F8F","#8FBC8F","#8E4585","#BDB76B","#FFFDD0","#C08081","#556B2F","#D4A574",
           "#9B7A7A","#6B8E6B","#6A2E6B","#8B7D3C","#F5F0E1","#A06060","#3D4F2A","#C19A6B",
           "#D4A4A4","#A0C0A0","#7B3B7B","#DAC77D","#FAF5E6","#8B6060","#4A5D34","#E8D4BC"]
    }
  },
  {
    id: "japanese_ukiyoe",
    name: "Japanese ukiyo-e",
    category: "cultural",
    description: "Deep indigo, vermillion, matcha green, rice paper, charcoal",
    tiers: {
      8:  ["#264348","#E34234","#7BA05B","#F5F0E1","#36454F","#DAA520","#B22222","#8FBC8F"],
      16: ["#264348","#E34234","#7BA05B","#F5F0E1","#36454F","#DAA520","#B22222","#8FBC8F",
           "#1A2F35","#C13525","#556B2F","#E8DCC8","#1C1C1C","#C19A6B","#8B0000","#6B8E6B"],
      24: ["#264348","#E34234","#7BA05B","#F5F0E1","#36454F","#DAA520","#B22222","#8FBC8F",
           "#1A2F35","#C13525","#556B2F","#E8DCC8","#1C1C1C","#C19A6B","#8B0000","#6B8E6B",
           "#3D5E65","#FF6347","#4A7A3D","#FAF0E6","#4A4A4A","#E6C87D","#CD5C5C","#A0C0A0"]
    }
  },
  {
    id: "moroccan_tiles",
    name: "Moroccan tiles",
    category: "cultural",
    description: "Cobalt blue, saffron yellow, terracotta, jade, crisp white",
    tiers: {
      8:  ["#0047AB","#F4C430","#C04000","#00A86B","#FFFAFA","#FF6347","#4682B4","#DAA520"],
      16: ["#0047AB","#F4C430","#C04000","#00A86B","#FFFAFA","#FF6347","#4682B4","#DAA520",
           "#003380","#E6B420","#8B2500","#2E8B57","#F5F0E1","#CD5C5C","#6699CC","#B8860B"],
      24: ["#0047AB","#F4C430","#C04000","#00A86B","#FFFAFA","#FF6347","#4682B4","#DAA520",
           "#003380","#E6B420","#8B2500","#2E8B57","#F5F0E1","#CD5C5C","#6699CC","#B8860B",
           "#1B2A4A","#FFD700","#A0522D","#3CB371","#DCDCDC","#E55B3C","#5B7FA5","#C19A6B"]
    }
  },
  {
    id: "folk_art",
    name: "Folk art",
    category: "cultural",
    description: "Barn red, sky blue, sunflower, forest green, cream",
    tiers: {
      8:  ["#7C0A02","#87CEEB","#FFDA03","#228B22","#FFFDD0","#1C1C1C","#CD853F","#4169E1"],
      16: ["#7C0A02","#87CEEB","#FFDA03","#228B22","#FFFDD0","#1C1C1C","#CD853F","#4169E1",
           "#A52A2A","#ADD8E6","#DAA520","#2E8B57","#F5F0E1","#36454F","#8B7355","#6495ED"],
      24: ["#7C0A02","#87CEEB","#FFDA03","#228B22","#FFFDD0","#1C1C1C","#CD853F","#4169E1",
           "#A52A2A","#ADD8E6","#DAA520","#2E8B57","#F5F0E1","#36454F","#8B7355","#6495ED",
           "#CC0000","#B0C4DE","#FFD700","#556B2F","#FAF5E6","#4A4A4A","#D2B48C","#5B7FA5"]
    }
  },
  {
    id: "nordic_knit",
    name: "Nordic knit",
    category: "cultural",
    description: "Cream, charcoal, rust, fjord blue, pine green",
    tiers: {
      8:  ["#FFFDD0","#36454F","#B7410E","#4682B4","#2E4F3E","#CD853F","#778899","#F5F5DC"],
      16: ["#FFFDD0","#36454F","#B7410E","#4682B4","#2E4F3E","#CD853F","#778899","#F5F5DC",
           "#FAF0E6","#1C1C1C","#8B2500","#5B7FA5","#3D5229","#A0522D","#696969","#E8DCC8"],
      24: ["#FFFDD0","#36454F","#B7410E","#4682B4","#2E4F3E","#CD853F","#778899","#F5F5DC",
           "#FAF0E6","#1C1C1C","#8B2500","#5B7FA5","#3D5229","#A0522D","#696969","#E8DCC8",
           "#FFFFF0","#4A4A4A","#CC5500","#6699CC","#4A6E50","#D2B48C","#B0B0B0","#D4C4A8"]
    }
  },
  {
    id: "patisserie",
    name: "Patisserie",
    category: "food",
    description: "Macaron pink, pistachio, vanilla cream, caramel, berry",
    tiers: {
      8:  ["#FFB7C5","#93C572","#FFFDD0","#C68E17","#8E4585","#FFE4E1","#DAA520","#F5F5DC"],
      16: ["#FFB7C5","#93C572","#FFFDD0","#C68E17","#8E4585","#FFE4E1","#DAA520","#F5F5DC",
           "#FF91A4","#6B8E23","#FAF0E6","#A07010","#6A2E6B","#FFC0CB","#B8860B","#E8DCC8"],
      24: ["#FFB7C5","#93C572","#FFFDD0","#C68E17","#8E4585","#FFE4E1","#DAA520","#F5F5DC",
           "#FF91A4","#6B8E23","#FAF0E6","#A07010","#6A2E6B","#FFC0CB","#B8860B","#E8DCC8",
           "#DB7093","#77AB59","#FFFFF0","#8B6914","#C08081","#FFD1DC","#C19A6B","#D4C4A8"]
    }
  },
  {
    id: "coffee_shop",
    name: "Coffee shop",
    category: "food",
    description: "Espresso, milk foam, caramel, cinnamon, a touch of sage",
    tiers: {
      8:  ["#3C1414","#FFFDD0","#C68E17","#D2691E","#8FBC8F","#8B7355","#F5DEB3","#A0522D"],
      16: ["#3C1414","#FFFDD0","#C68E17","#D2691E","#8FBC8F","#8B7355","#F5DEB3","#A0522D",
           "#1C0C0C","#FAF0E6","#A07010","#8B4513","#6B8E6B","#5C4033","#DEB887","#CD853F"],
      24: ["#3C1414","#FFFDD0","#C68E17","#D2691E","#8FBC8F","#8B7355","#F5DEB3","#A0522D",
           "#1C0C0C","#FAF0E6","#A07010","#8B4513","#6B8E6B","#5C4033","#DEB887","#CD853F",
           "#2A1010","#E8DCC8","#B8860B","#C19A6B","#556B2F","#6B4423","#F5F0E1","#BC8F8F"]
    }
  },
  {
    id: "spice_market",
    name: "Spice market",
    category: "food",
    description: "Turmeric, paprika, cardamom green, saffron, clove brown",
    tiers: {
      8:  ["#E3A857","#C04000","#6B8E23","#F4C430","#5C4033","#CD853F","#8B4513","#DAA520"],
      16: ["#E3A857","#C04000","#6B8E23","#F4C430","#5C4033","#CD853F","#8B4513","#DAA520",
           "#C19A6B","#8B2500","#556B2F","#E6B420","#3B2716","#A0522D","#6B4423","#B8860B"],
      24: ["#E3A857","#C04000","#6B8E23","#F4C430","#5C4033","#CD853F","#8B4513","#DAA520",
           "#C19A6B","#8B2500","#556B2F","#E6B420","#3B2716","#A0522D","#6B4423","#B8860B",
           "#FFD700","#A52A2A","#808000","#FFF8DC","#2F1F10","#D2B48C","#4A3520","#E6C87D"]
    }
  },
  {
    id: "gingham_picnic",
    name: "Gingham picnic",
    category: "textile",
    description: "Cherry red, white, sky blue, grass green, butter yellow",
    tiers: {
      8:  ["#DC143C","#FFFAFA","#87CEEB","#4CAF50","#FFFACD","#FF6347","#ADD8E6","#F5F5DC"],
      16: ["#DC143C","#FFFAFA","#87CEEB","#4CAF50","#FFFACD","#FF6347","#ADD8E6","#F5F5DC",
           "#B22222","#F5F0E1","#6699CC","#228B22","#FFD700","#CD5C5C","#B0C4DE","#DEB887"],
      24: ["#DC143C","#FFFAFA","#87CEEB","#4CAF50","#FFFACD","#FF6347","#ADD8E6","#F5F5DC",
           "#B22222","#F5F0E1","#6699CC","#228B22","#FFD700","#CD5C5C","#B0C4DE","#DEB887",
           "#8B0000","#DCDCDC","#4682B4","#2E8B57","#DAA520","#A52A2A","#5B7FA5","#C2B280"]
    }
  },
  {
    id: "indigo_shibori",
    name: "Indigo shibori",
    category: "textile",
    description: "Deep indigo gradations with white and warm grey accents",
    tiers: {
      8:  ["#1A0533","#FFFAFA","#ADD8E6","#A9A9A9","#1B2A4A","#B0C4DE","#4B0082","#E6E6FA"],
      16: ["#1A0533","#FFFAFA","#ADD8E6","#A9A9A9","#1B2A4A","#B0C4DE","#4B0082","#E6E6FA",
           "#0C0122","#F5F5F5","#87CEEB","#808080","#264366","#6699CC","#2E0854","#D8D8E8"],
      24: ["#1A0533","#FFFAFA","#ADD8E6","#A9A9A9","#1B2A4A","#B0C4DE","#4B0082","#E6E6FA",
           "#0C0122","#F5F5F5","#87CEEB","#808080","#264366","#6699CC","#2E0854","#D8D8E8",
           "#100028","#DCDCDC","#5B7FA5","#C0C0C0","#36456B","#778899","#3D1A70","#C8C8F0"]
    }
  },
  {
    id: "mid_century_modern",
    name: "Mid-century modern",
    category: "interiors",
    description: "Mustard, teal, burnt orange, walnut brown, cream",
    tiers: {
      8:  ["#DAA520","#008080","#CC5500","#5C4033","#FFFDD0","#FF8C00","#2E8B57","#D2B48C"],
      16: ["#DAA520","#008080","#CC5500","#5C4033","#FFFDD0","#FF8C00","#2E8B57","#D2B48C",
           "#B8860B","#006666","#A0522D","#3B2716","#FAF0E6","#E07000","#20735C","#C19A6B"],
      24: ["#DAA520","#008080","#CC5500","#5C4033","#FFFDD0","#FF8C00","#2E8B57","#D2B48C",
           "#B8860B","#006666","#A0522D","#3B2716","#FAF0E6","#E07000","#20735C","#C19A6B",
           "#C19A3D","#2F4F4F","#8B4513","#6B4423","#E8DCC8","#CD853F","#4F7D6E","#DEB887"]
    }
  },
  {
    id: "coastal_cottage",
    name: "Coastal cottage",
    category: "interiors",
    description: "Driftwood, sea glass, sand, navy, coral pop",
    tiers: {
      8:  ["#8B7D6B","#66CDAA","#C2B280","#1B2A4A","#FF7F50","#F5F5DC","#4682B4","#B0C4DE"],
      16: ["#8B7D6B","#66CDAA","#C2B280","#1B2A4A","#FF7F50","#F5F5DC","#4682B4","#B0C4DE",
           "#6B5D4B","#3CB371","#A09570","#0C1A30","#E6735A","#FAF0E6","#5B7FA5","#87CEEB"],
      24: ["#8B7D6B","#66CDAA","#C2B280","#1B2A4A","#FF7F50","#F5F5DC","#4682B4","#B0C4DE",
           "#6B5D4B","#3CB371","#A09570","#0C1A30","#E6735A","#FAF0E6","#5B7FA5","#87CEEB",
           "#A09080","#5F9EA0","#D2C5A8","#36456B","#CD5C5C","#FFFAFA","#6699CC","#ADD8E6"]
    }
  },
  {
    id: "parisian_apartment",
    name: "Parisian apartment",
    category: "interiors",
    description: "Charcoal, blush, gold, marble white, dusty blue",
    tiers: {
      8:  ["#36454F","#FFB6C1","#DAA520","#FFFAFA","#6699CC","#C0C0C0","#D4A574","#F5F5F5"],
      16: ["#36454F","#FFB6C1","#DAA520","#FFFAFA","#6699CC","#C0C0C0","#D4A574","#F5F5F5",
           "#1C1C1C","#FF91A4","#B8860B","#E8E8E8","#5B7FA5","#A9A9A9","#BC8F8F","#DCDCDC"],
      24: ["#36454F","#FFB6C1","#DAA520","#FFFAFA","#6699CC","#C0C0C0","#D4A574","#F5F5F5",
           "#1C1C1C","#FF91A4","#B8860B","#E8E8E8","#5B7FA5","#A9A9A9","#BC8F8F","#DCDCDC",
           "#4A4A4A","#FFC0CB","#C19A6B","#F0F0F0","#4682B4","#808080","#C19A3D","#B0B0B0"]
    }
  },
  {
    id: "candy_shop",
    name: "Candy shop",
    category: "whimsical",
    description: "Bubblegum, mint, lemon, tangerine, blueberry",
    tiers: {
      8:  ["#FF69B4","#98FF98","#FFFACD","#FF8C00","#4169E1","#FFB6C1","#00CED1","#FFD700"],
      16: ["#FF69B4","#98FF98","#FFFACD","#FF8C00","#4169E1","#FFB6C1","#00CED1","#FFD700",
           "#FF1493","#3CB371","#FFF8DC","#CC7000","#0047AB","#FFC0CB","#20B2AA","#DAA520"],
      24: ["#FF69B4","#98FF98","#FFFACD","#FF8C00","#4169E1","#FFB6C1","#00CED1","#FFD700",
           "#FF1493","#3CB371","#FFF8DC","#CC7000","#0047AB","#FFC0CB","#20B2AA","#DAA520",
           "#DB7093","#90EE90","#F0E68C","#FF6347","#6495ED","#FFE4E1","#40E0D0","#F4C430"]
    }
  },
  {
    id: "storybook",
    name: "Storybook",
    category: "whimsical",
    description: "Brick red, adventure green, sky blue, gold, parchment",
    tiers: {
      8:  ["#B22222","#2E8B57","#87CEEB","#DAA520","#F5F0E1","#8B0000","#4682B4","#FFD700"],
      16: ["#B22222","#2E8B57","#87CEEB","#DAA520","#F5F0E1","#8B0000","#4682B4","#FFD700",
           "#CD5C5C","#228B22","#ADD8E6","#B8860B","#FFFDD0","#A52A2A","#5B7FA5","#C19A6B"],
      24: ["#B22222","#2E8B57","#87CEEB","#DAA520","#F5F0E1","#8B0000","#4682B4","#FFD700",
           "#CD5C5C","#228B22","#ADD8E6","#B8860B","#FFFDD0","#A52A2A","#5B7FA5","#C19A6B",
           "#CC0000","#6B8E23","#B0C4DE","#E6C87D","#FAF5E6","#36454F","#6699CC","#D2B48C"]
    }
  },
  {
    id: "under_the_sea",
    name: "Under the sea",
    category: "whimsical",
    description: "Deep ocean, mermaid teal, starfish coral, sand, pearl",
    tiers: {
      8:  ["#003366","#20B2AA","#FF7F50","#C2B280","#FFFAFA","#4682B4","#FF6347","#E0FFFF"],
      16: ["#003366","#20B2AA","#FF7F50","#C2B280","#FFFAFA","#4682B4","#FF6347","#E0FFFF",
           "#001A33","#008B8B","#E6735A","#A09570","#F5F5F5","#5B7FA5","#CD5C5C","#B0E0E6"],
      24: ["#003366","#20B2AA","#FF7F50","#C2B280","#FFFAFA","#4682B4","#FF6347","#E0FFFF",
           "#001A33","#008B8B","#E6735A","#A09570","#F5F5F5","#5B7FA5","#CD5C5C","#B0E0E6",
           "#0C2D48","#5F9EA0","#FFD700","#DEC49B","#DCDCDC","#6699CC","#DB7093","#ADD8E6"]
    }
  },
  {
    id: "fireworks_night",
    name: "Fireworks night",
    category: "festive",
    description: "Midnight sky, spark gold, rocket red, blue burst, smoke",
    tiers: {
      8:  ["#0C0C1D","#FFD700","#FF0000","#1E90FF","#A9A9A9","#FF69B4","#4169E1","#FFA500"],
      16: ["#0C0C1D","#FFD700","#FF0000","#1E90FF","#A9A9A9","#FF69B4","#4169E1","#FFA500",
           "#191970","#DAA520","#CC0000","#4682B4","#808080","#FF1493","#0047AB","#FF8C00"],
      24: ["#0C0C1D","#FFD700","#FF0000","#1E90FF","#A9A9A9","#FF69B4","#4169E1","#FFA500",
           "#191970","#DAA520","#CC0000","#4682B4","#808080","#FF1493","#0047AB","#FF8C00",
           "#1B2A4A","#F4C430","#8B0000","#6495ED","#C0C0C0","#DB7093","#5B7FA5","#E6C87D"]
    }
  }
];

var HARMONY_TYPES = {
  "Complementary": [180],
  "Analogous":     [-30, 30],
  "Triadic":       [120, 240],
  "Split-comp.":   [150, 210]
};

// ═══════════════════════════════════════════════════════════
// CVD Simulation Matrices (Machado et al. 2009)
// ═══════════════════════════════════════════════════════════

var CVD_MATRICES = {
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.011820, 0.042940, 0.968881
  ],
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998
  ]
};

// ═══════════════════════════════════════════════════════════
// Tier Selection & Palette Scaling
// ═══════════════════════════════════════════════════════════

function autoSelectTier(palCount) {
  if (palCount <= 12) return 8;
  if (palCount <= 20) return 16;
  return 24;
}

function expandPalette(hexColours, targetCount) {
  if (targetCount <= hexColours.length) return hexColours.slice(0, targetCount);
  // Sort by OKLAB lightness for perceptual ordering
  var sorted = hexColours.slice().sort(function(a, b) {
    var ra = hexToRgb(a), rb = hexToRgb(b);
    return rgbToOklab(ra[0], ra[1], ra[2]).L - rgbToOklab(rb[0], rb[1], rb[2]).L;
  });
  var result = sorted.slice();
  while (result.length < targetCount) {
    // Find pair with widest OKLAB gap and insert interpolated midpoint
    var maxGap = -1, maxIdx = 0;
    for (var i = 0; i < result.length - 1; i++) {
      var rgbA = hexToRgb(result[i]), rgbB = hexToRgb(result[i + 1]);
      var okA = rgbToOklab(rgbA[0], rgbA[1], rgbA[2]);
      var okB = rgbToOklab(rgbB[0], rgbB[1], rgbB[2]);
      var gap = Math.sqrt(
        (okA.L - okB.L) * (okA.L - okB.L) +
        (okA.a - okB.a) * (okA.a - okB.a) +
        (okA.b - okB.b) * (okA.b - okB.b)
      );
      if (gap > maxGap) { maxGap = gap; maxIdx = i; }
    }
    var rA = hexToRgb(result[maxIdx]), rB = hexToRgb(result[maxIdx + 1]);
    var oA = rgbToOklab(rA[0], rA[1], rA[2]), oB = rgbToOklab(rB[0], rB[1], rB[2]);
    var mid = oklabToRgb((oA.L + oB.L) / 2, (oA.a + oB.a) / 2, (oA.b + oB.b) / 2);
    result.splice(maxIdx + 1, 0, rgbToHex(mid));
  }
  return result;
}

function reducePalette(hexColours, targetCount) {
  if (targetCount >= hexColours.length) return hexColours.slice();
  if (targetCount <= 0) return [];
  // MaxMin diversity selection in OKLAB space
  var oklabs = hexColours.map(function(hex) {
    var r = hexToRgb(hex);
    return rgbToOklab(r[0], r[1], r[2]);
  });
  var n = oklabs.length;
  var selected = [0];
  var minDist = new Array(n);
  for (var i = 0; i < n; i++) {
    var d = oklabs[0];
    minDist[i] = Math.sqrt(
      (oklabs[i].L - d.L) * (oklabs[i].L - d.L) +
      (oklabs[i].a - d.a) * (oklabs[i].a - d.a) +
      (oklabs[i].b - d.b) * (oklabs[i].b - d.b)
    );
  }
  while (selected.length < targetCount) {
    var best = -1, bestDist = -1;
    for (var j = 0; j < n; j++) {
      if (selected.indexOf(j) >= 0) continue;
      if (minDist[j] > bestDist) { bestDist = minDist[j]; best = j; }
    }
    selected.push(best);
    for (var k = 0; k < n; k++) {
      if (selected.indexOf(k) >= 0) continue;
      var dist = Math.sqrt(
        (oklabs[k].L - oklabs[best].L) * (oklabs[k].L - oklabs[best].L) +
        (oklabs[k].a - oklabs[best].a) * (oklabs[k].a - oklabs[best].a) +
        (oklabs[k].b - oklabs[best].b) * (oklabs[k].b - oklabs[best].b)
      );
      if (dist < minDist[k]) minDist[k] = dist;
    }
  }
  selected.sort(function(a, b) { return a - b; });
  return selected.map(function(idx) { return hexColours[idx]; });
}

function getPresetById(id) {
  for (var i = 0; i < PALETTE_PRESETS.length; i++) {
    if (PALETTE_PRESETS[i].id === id) return PALETTE_PRESETS[i];
  }
  return null;
}

function getEffectiveTierColours(preset, tier, unlockedCount) {
  var tierColours = preset.tiers[tier] || preset.tiers[8];
  if (unlockedCount > tierColours.length) {
    return { colours: expandPalette(tierColours, unlockedCount), mode: "expand", tierSize: tierColours.length };
  } else if (unlockedCount < tierColours.length) {
    return { colours: reducePalette(tierColours, unlockedCount), mode: "reduce", tierSize: tierColours.length };
  }
  return { colours: tierColours, mode: "exact", tierSize: tierColours.length };
}

// ═══════════════════════════════════════════════════════════
// Core Palette Swap Logic
// ═══════════════════════════════════════════════════════════

function computeShiftMapping(pal, shiftDeg, lockedIds) {
  var mapping = {};
  var collisions = {};
  for (var i = 0; i < pal.length; i++) {
    var entry = pal[i];
    if (entry.id === "__skip__" || entry.id === "__empty__") continue;
    if (lockedIds.has(entry.id)) {
      mapping[entry.id] = { source: entry, dest: entry, dE: 0, locked: true };
      continue;
    }
    var shifted = shiftRgbHue(entry.rgb, shiftDeg);
    var idealLab = rgbToLab(shifted[0], shifted[1], shifted[2]);
    var match = findSolid(idealLab, DMC);
    var deltaE = Math.sqrt(dE2(idealLab, match.lab));
    mapping[entry.id] = {
      source: entry,
      dest: { id: match.id, name: match.name, rgb: match.rgb, lab: match.lab, type: "solid" },
      idealRgb: shifted,
      dE: deltaE,
      locked: false
    };
    if (!collisions[match.id]) collisions[match.id] = [];
    collisions[match.id].push(entry.id);
  }
  var collisionList = [];
  Object.keys(collisions).forEach(function(dmcId) {
    if (collisions[dmcId].length > 1) {
      collisionList.push({ dmcId: dmcId, sourceIds: collisions[dmcId] });
    }
  });
  return { mapping: mapping, collisions: collisionList };
}

function computePresetMapping(pal, presetColours, lockedIds) {
  // Sort source and target by OKLAB lightness
  var unlocked = pal.filter(function(e) {
    return e.id !== "__skip__" && e.id !== "__empty__" && !lockedIds.has(e.id);
  });
  var sortedSource = unlocked.slice().sort(function(a, b) {
    return rgbToOklab(a.rgb[0], a.rgb[1], a.rgb[2]).L - rgbToOklab(b.rgb[0], b.rgb[1], b.rgb[2]).L;
  });
  var targetRgbs = presetColours.map(hexToRgb);
  var sortedTarget = targetRgbs.slice().sort(function(a, b) {
    return rgbToOklab(a[0], a[1], a[2]).L - rgbToOklab(b[0], b[1], b[2]).L;
  });

  var mapping = {};
  var collisions = {};
  // Map locked entries first
  for (var i = 0; i < pal.length; i++) {
    var entry = pal[i];
    if (entry.id === "__skip__" || entry.id === "__empty__") continue;
    if (lockedIds.has(entry.id)) {
      mapping[entry.id] = { source: entry, dest: entry, dE: 0, locked: true };
    }
  }
  // Map unlocked by lightness rank
  for (var j = 0; j < sortedSource.length; j++) {
    var src = sortedSource[j];
    var tgtRgb = sortedTarget[j % sortedTarget.length];
    var tgtLab = rgbToLab(tgtRgb[0], tgtRgb[1], tgtRgb[2]);
    var match = findSolid(tgtLab, DMC);
    var deltaE = Math.sqrt(dE2(tgtLab, match.lab));
    mapping[src.id] = {
      source: src,
      dest: { id: match.id, name: match.name, rgb: match.rgb, lab: match.lab, type: "solid" },
      idealRgb: tgtRgb,
      dE: deltaE,
      locked: false
    };
    if (!collisions[match.id]) collisions[match.id] = [];
    collisions[match.id].push(src.id);
  }
  var collisionList = [];
  Object.keys(collisions).forEach(function(dmcId) {
    if (collisions[dmcId].length > 1) {
      collisionList.push({ dmcId: dmcId, sourceIds: collisions[dmcId] });
    }
  });
  return { mapping: mapping, collisions: collisionList };
}

function generateHarmonyPalette(baseHex, harmonyType, count) {
  var baseRgb = hexToRgb(baseHex);
  var ok = rgbToOklab(baseRgb[0], baseRgb[1], baseRgb[2]);
  var lch = oklabToOklch(ok.L, ok.a, ok.b);
  var angles = HARMONY_TYPES[harmonyType] || [];
  var colours = [rgbToHex(baseRgb)];
  for (var i = 0; i < angles.length; i++) {
    var h = (lch.H + angles[i]) % 360;
    if (h < 0) h += 360;
    var ab = oklchToOklab(lch.L, lch.C, h);
    var rgb = oklabToRgb(ab.L, ab.a, ab.b);
    colours.push(rgbToHex(rgb));
  }
  // Expand to target count by adding lightness variants
  var target = count || colours.length;
  if (colours.length < target) {
    var expanded = colours.slice();
    var ci = 0;
    while (expanded.length < target) {
      var cRgb = hexToRgb(colours[ci % colours.length]);
      var cOk = rgbToOklab(cRgb[0], cRgb[1], cRgb[2]);
      var cLch = oklabToOklch(cOk.L, cOk.a, cOk.b);
      var step = Math.floor(ci / colours.length) + 1;
      var lightL = Math.min(0.95, cLch.L + step * 0.12);
      var abL = oklchToOklab(lightL, cLch.C * 0.8, cLch.H);
      expanded.push(rgbToHex(oklabToRgb(abL.L, abL.a, abL.b)));
      if (expanded.length >= target) break;
      var darkL = Math.max(0.05, cLch.L - step * 0.12);
      var abD = oklchToOklab(darkL, cLch.C * 0.9, cLch.H);
      expanded.push(rgbToHex(oklabToRgb(abD.L, abD.a, abD.b)));
      ci++;
    }
    return expanded.slice(0, target);
  }
  return colours;
}

function applyMapping(pat, mapping) {
  var newPat = new Array(pat.length);
  for (var i = 0; i < pat.length; i++) {
    var cell = pat[i];
    if (cell.id === "__skip__" || cell.id === "__empty__") {
      newPat[i] = cell;
      continue;
    }
    var m = mapping[cell.id];
    if (!m || m.locked) {
      newPat[i] = cell;
      continue;
    }
    newPat[i] = {
      type: m.dest.type || "solid",
      id: m.dest.id,
      name: m.dest.name,
      rgb: m.dest.rgb,
      lab: m.dest.lab,
      symbol: cell.symbol
    };
  }
  return newPat;
}

function findSimilarDmc(lab, count) {
  var results = [];
  for (var i = 0; i < DMC.length; i++) {
    var d = Math.sqrt(dE2(lab, DMC[i].lab));
    results.push({ thread: DMC[i], dE: d });
  }
  results.sort(function(a, b) { return a.dE - b.dE; });
  return results.slice(0, count || 5);
}

function computeContrastWarnings(pat, mapping, sW) {
  // Build a set of adjacent colour pairs and check contrast
  var pairSet = new Set();
  var warnings = [];
  var len = pat.length;
  var sH = Math.floor(len / sW);
  for (var i = 0; i < len; i++) {
    var cell = pat[i];
    if (cell.id === "__skip__" || cell.id === "__empty__") continue;
    var m = mapping[cell.id];
    if (!m) continue;
    var destA = m.locked ? m.source : m.dest;
    // Check right neighbour
    var x = i % sW, y = Math.floor(i / sW);
    var neighbours = [];
    if (x + 1 < sW) neighbours.push(i + 1);
    if (y + 1 < sH) neighbours.push(i + sW);
    for (var n = 0; n < neighbours.length; n++) {
      var ni = neighbours[n];
      var nCell = pat[ni];
      if (!nCell || nCell.id === "__skip__" || nCell.id === "__empty__") continue;
      var nm = mapping[nCell.id];
      if (!nm) continue;
      var destB = nm.locked ? nm.source : nm.dest;
      if (destA.id === destB.id) continue;
      var pairKey = [destA.id, destB.id].sort().join("|");
      if (pairSet.has(pairKey)) continue;
      pairSet.add(pairKey);
      // WCAG relative luminance
      var rA = destA.rgb[0]/255, gA = destA.rgb[1]/255, bA = destA.rgb[2]/255;
      rA = rA <= 0.04045 ? rA/12.92 : Math.pow((rA+0.055)/1.055, 2.4);
      gA = gA <= 0.04045 ? gA/12.92 : Math.pow((gA+0.055)/1.055, 2.4);
      bA = bA <= 0.04045 ? bA/12.92 : Math.pow((bA+0.055)/1.055, 2.4);
      var lumA = 0.2126*rA + 0.7152*gA + 0.0722*bA;
      var rB = destB.rgb[0]/255, gB = destB.rgb[1]/255, bB = destB.rgb[2]/255;
      rB = rB <= 0.04045 ? rB/12.92 : Math.pow((rB+0.055)/1.055, 2.4);
      gB = gB <= 0.04045 ? gB/12.92 : Math.pow((gB+0.055)/1.055, 2.4);
      bB = bB <= 0.04045 ? bB/12.92 : Math.pow((bB+0.055)/1.055, 2.4);
      var lumB = 0.2126*rB + 0.7152*gB + 0.0722*bB;
      var lighter = Math.max(lumA, lumB);
      var darker = Math.min(lumA, lumB);
      var ratio = (lighter + 0.05) / (darker + 0.05);
      if (ratio < 2) {
        warnings.push({ a: destA, b: destB, ratio: Math.round(ratio * 10) / 10 });
      }
    }
  }
  return warnings;
}

function renderMiniCanvas(canvas, pat, sW, sH, mapping) {
  var pw = Math.min(100, sW);
  var ph = Math.round(pw * sH / sW);
  if (ph < 1) ph = 1;
  canvas.width = pw;
  canvas.height = ph;
  canvas.style.imageRendering = "pixelated";
  var ctx = canvas.getContext("2d");
  var scaleX = sW / pw, scaleY = sH / ph;
  for (var y = 0; y < ph; y++) {
    for (var x = 0; x < pw; x++) {
      var srcX = Math.floor(x * scaleX);
      var srcY = Math.floor(y * scaleY);
      var idx = srcY * sW + srcX;
      var cell = pat[idx];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") {
        ctx.fillStyle = "#f0f0f0";
      } else if (mapping) {
        var m = mapping[cell.id];
        if (m) {
          var dest = m.locked ? m.source : m.dest;
          ctx.fillStyle = "rgb(" + dest.rgb[0] + "," + dest.rgb[1] + "," + dest.rgb[2] + ")";
        } else {
          ctx.fillStyle = "rgb(" + cell.rgb[0] + "," + cell.rgb[1] + "," + cell.rgb[2] + ")";
        }
      } else {
        ctx.fillStyle = "rgb(" + cell.rgb[0] + "," + cell.rgb[1] + "," + cell.rgb[2] + ")";
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Saved Palettes (localStorage)
// ═══════════════════════════════════════════════════════════

var CUSTOM_PALETTES_KEY = "crossstitch_custom_palettes";

function loadCustomPalettes() {
  try {
    var raw = localStorage.getItem(CUSTOM_PALETTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveCustomPalettes(palettes) {
  try {
    localStorage.setItem(CUSTOM_PALETTES_KEY, JSON.stringify(palettes));
  } catch (e) { /* quota exceeded */ }
}

// ═══════════════════════════════════════════════════════════
// React Components
// ═══════════════════════════════════════════════════════════

function DEBadge(props) {
  var d = props.dE;
  var tier, bg, color;
  if (d < 1) { tier = "Perfect"; bg = "#f0fdf4"; color = "#16a34a"; }
  else if (d <= 3) { tier = "Close"; bg = "#fffbeb"; color = "#d97706"; }
  else { tier = "Approx."; bg = "#fef2f2"; color = "#dc2626"; }
  return React.createElement("span", {
    style: { fontSize: 10, padding: "1px 6px", borderRadius: 8, background: bg, color: color, whiteSpace: "nowrap" }
  }, tier);
}

function SwatchBox(props) {
  var sz = props.size || 16;
  return React.createElement("span", {
    style: {
      display: "inline-block", width: sz, height: sz, borderRadius: 3,
      background: "rgb(" + props.rgb[0] + "," + props.rgb[1] + "," + props.rgb[2] + ")",
      border: "1px solid #d4d4d8", flexShrink: 0, cursor: props.onClick ? "pointer" : "default"
    },
    onClick: props.onClick || null
  });
}

function LockToggle(props) {
  var locked = props.locked;
  return React.createElement("button", {
    onClick: props.onToggle,
    title: locked ? "Unlock this colour" : "Lock this colour",
    style: {
      width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 4, border: locked ? "1px solid #fde68a" : "1px solid #e4e4e7",
      background: locked ? "#fef3c7" : "#fff", color: locked ? "#b45309" : "#a1a1aa",
      cursor: "pointer", fontSize: 11, padding: 0, lineHeight: 1
    }
  }, locked ? "\uD83D\uDD12" : "\uD83D\uDD13");
}

function HueSpectrumBar() {
  var ref = React.useRef(null);
  React.useEffect(function() {
    var c = ref.current;
    if (!c) return;
    var ctx = c.getContext("2d");
    var w = c.width, h = c.height;
    for (var x = 0; x < w; x++) {
      var hue = (x / w) * 360;
      ctx.fillStyle = "hsl(" + hue + ",80%,55%)";
      ctx.fillRect(x, 0, 1, h);
    }
  }, []);
  return React.createElement("canvas", {
    ref: ref, width: 280, height: 24,
    style: { width: "100%", height: 24, borderRadius: 6, display: "block" }
  });
}

function QuickShiftButtons(props) {
  var angles = [0, 30, 60, 90, 120, 180];
  return React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
    angles.map(function(a) {
      var active = props.value === a;
      return React.createElement("button", {
        key: a,
        onClick: function() { props.onChange(a); },
        style: {
          padding: "4px 10px", fontSize: 11, fontWeight: 500, borderRadius: 12, cursor: "pointer",
          border: active ? "1px solid #1D9E75" : "1px solid #e4e4e7",
          background: active ? "#f0fdfa" : "#fff",
          color: active ? "#1D9E75" : "#71717a"
        }
      }, a + "\u00B0");
    })
  );
}

function SimilarPopover(props) {
  var lab = props.lab;
  var similar = React.useMemo(function() { return findSimilarDmc(lab, 6); }, [lab]);
  // Skip first if it's the same as current
  var filtered = similar.filter(function(s) { return s.thread.id !== props.currentId; }).slice(0, 5);
  return React.createElement("div", {
    style: {
      position: "absolute", top: "100%", right: 0, zIndex: 20,
      background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)", padding: 6, minWidth: 200
    }
  },
    React.createElement("div", { style: { fontSize: 10, color: "#a1a1aa", marginBottom: 4, fontWeight: 600 } }, "Similar DMC threads"),
    filtered.map(function(s) {
      return React.createElement("div", {
        key: s.thread.id,
        onClick: function() { props.onSelect(s.thread); },
        style: {
          display: "flex", alignItems: "center", gap: 6, padding: "3px 4px",
          borderRadius: 4, cursor: "pointer", fontSize: 11
        },
        onMouseEnter: function(e) { e.currentTarget.style.background = "#f4f4f5"; },
        onMouseLeave: function(e) { e.currentTarget.style.background = "transparent"; }
      },
        React.createElement(SwatchBox, { rgb: s.thread.rgb }),
        React.createElement("span", { style: { fontWeight: 600, minWidth: 36 } }, s.thread.id),
        React.createElement("span", { style: { color: "#71717a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.thread.name),
        React.createElement(DEBadge, { dE: s.dE })
      );
    })
  );
}

function DmcPickerPopover(props) {
  var _useState = React.useState(""), search = _useState[0], setSearch = _useState[1];
  var filtered = React.useMemo(function() {
    if (!search.trim()) return DMC.slice(0, 40);
    var q = search.toLowerCase();
    return DMC.filter(function(d) {
      return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q);
    }).slice(0, 40);
  }, [search]);
  return React.createElement("div", {
    style: {
      position: "absolute", top: "100%", left: 0, zIndex: 20,
      background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)", padding: 6, width: 260
    },
    onClick: function(e) { e.stopPropagation(); }
  },
    React.createElement("input", {
      type: "text", placeholder: "Search DMC # or name\u2026", value: search,
      onChange: function(e) { setSearch(e.target.value); },
      autoFocus: true,
      style: { width: "100%", padding: "5px 8px", border: "0.5px solid #e4e4e7", borderRadius: 6, fontSize: 12, marginBottom: 4, boxSizing: "border-box" }
    }),
    React.createElement("div", { style: { maxHeight: 200, overflow: "auto" } },
      filtered.map(function(d) {
        return React.createElement("div", {
          key: d.id,
          onClick: function() { props.onSelect(d); },
          style: {
            display: "flex", alignItems: "center", gap: 6, padding: "3px 6px",
            borderRadius: 4, cursor: "pointer", fontSize: 11
          },
          onMouseEnter: function(e) { e.currentTarget.style.background = "#f4f4f5"; },
          onMouseLeave: function(e) { e.currentTarget.style.background = "transparent"; }
        },
          React.createElement(SwatchBox, { rgb: d.rgb }),
          React.createElement("span", { style: { fontWeight: 600, minWidth: 36 } }, d.id),
          React.createElement("span", { style: { color: "#71717a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, d.name)
        );
      })
    )
  );
}

// ═══════════════════════════════════════════════════════════
// Mapping Table Row
// ═══════════════════════════════════════════════════════════

function MappingTableRow(props) {
  var m = props.mapping;
  var _st1 = React.useState(false), showSimilar = _st1[0], setShowSimilar = _st1[1];
  var _st2 = React.useState(false), showPicker = _st2[0], setShowPicker = _st2[1];

  function handleSelectSimilar(thread) {
    setShowSimilar(false);
    props.onOverride(m.source.id, thread);
  }
  function handleSelectPicker(thread) {
    setShowPicker(false);
    props.onOverride(m.source.id, thread);
  }

  return React.createElement("tr", { style: { borderBottom: "0.5px solid #f4f4f5", opacity: m.locked ? 0.5 : 1 } },
    React.createElement("td", { style: { padding: "4px 6px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
        React.createElement(SwatchBox, { rgb: m.source.rgb }),
        React.createElement("span", { style: { fontFamily: "monospace", fontSize: 11, fontWeight: 600 } }, m.source.id),
        React.createElement("span", { style: { fontSize: 11, color: "#71717a" } }, m.source.name || "")
      )
    ),
    React.createElement("td", { style: { padding: "4px 2px", fontSize: 13, color: "#a1a1aa" } }, "\u2192"),
    React.createElement("td", {
      style: { padding: "4px 6px", position: "relative", cursor: m.locked ? "default" : "pointer" },
      onClick: function() { if (!m.locked) setShowPicker(!showPicker); }
    },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
        React.createElement(SwatchBox, { rgb: m.dest.rgb }),
        React.createElement("span", { style: { fontFamily: "monospace", fontSize: 11, fontWeight: 600 } }, m.dest.id),
        React.createElement("span", { style: { fontSize: 11, color: "#71717a" } }, m.dest.name || "")
      ),
      showPicker && React.createElement(DmcPickerPopover, { onSelect: handleSelectPicker })
    ),
    React.createElement("td", { style: { padding: "4px 6px", textAlign: "right", fontSize: 11, color: "#a1a1aa" } }, (props.count || 0).toLocaleString()),
    React.createElement("td", { style: { padding: "4px 6px" } },
      m.locked
        ? React.createElement("span", { style: { fontSize: 10, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 8 } }, "Locked")
        : React.createElement(DEBadge, { dE: m.dE })
    ),
    React.createElement("td", { style: { padding: "4px 6px", position: "relative" } },
      !m.locked && React.createElement("button", {
        onClick: function(e) { e.stopPropagation(); setShowSimilar(!showSimilar); },
        style: {
          fontSize: 10, color: "#1D9E75", background: "#f0fdfa",
          border: "0.5px solid #99f6e4", borderRadius: 4, padding: "2px 6px", cursor: "pointer"
        }
      }, "Similar"),
      showSimilar && React.createElement(SimilarPopover, {
        lab: m.dest.lab, currentId: m.dest.id, onSelect: handleSelectSimilar
      })
    )
  );
}

// ═══════════════════════════════════════════════════════════
// Preset Card
// ═══════════════════════════════════════════════════════════

function PresetCard(props) {
  var p = props.preset;
  var selected = props.selected;
  var swatchColours = p.tiers[8];
  return React.createElement("div", {
    onClick: props.onClick,
    className: "ps-preset-card" + (selected ? " ps-preset-card--selected" : ""),
    style: {
      borderRadius: 8, padding: 10, cursor: "pointer",
      border: selected ? "2px solid #1D9E75" : "1px solid #e4e4e7",
      background: selected ? "#f0fdfa" : "#fff"
    }
  },
    React.createElement("div", { style: { fontSize: 11, fontWeight: 500, marginBottom: 4, color: "#18181b" } }, p.name),
    React.createElement("div", { style: { display: "flex", gap: 2, flexWrap: "wrap" } },
      swatchColours.map(function(hex, i) {
        return React.createElement("span", {
          key: i,
          style: {
            width: 16, height: 16, borderRadius: 2, display: "inline-block",
            background: hex, border: "1px solid #d4d4d8"
          }
        });
      })
    ),
    React.createElement("div", { style: { fontSize: 10, color: "#a1a1aa", marginTop: 3 } }, "8 / 16 / 24 colours")
  );
}

// ═══════════════════════════════════════════════════════════
// Main PaletteSwapPanel Component
// ═══════════════════════════════════════════════════════════

function usePaletteSwap(props) {
  var pat = props.pat, pal = props.pal, cmap = props.cmap, sW = props.sW, sH = props.sH;
  var done = props.done;
  var setPat = props.setPat, setPal = props.setPal, setCmap = props.setCmap;
  var editHistory = props.editHistory, setEditHistory = props.setEditHistory;
  var setRedoHistory = props.setRedoHistory;
  var setDone = props.setDone;
  var EDIT_HISTORY_MAX = props.EDIT_HISTORY_MAX || 50;
  var buildPaletteWithScratch = props.buildPaletteWithScratch || buildPalette;

  // State
  var _s1 = React.useState(0), shiftDeg = _s1[0], setShiftDeg = _s1[1];
  var _s2 = React.useState(new Set()), lockedIds = _s2[0], setLockedIds = _s2[1];
  var _s3 = React.useState(null), activePreset = _s3[0], setActivePreset = _s3[1];
  var _s4 = React.useState("themes"), presetTab = _s4[0], setPresetTab = _s4[1];
  var _s5 = React.useState("#FF0000"), harmonyBase = _s5[0], setHarmonyBase = _s5[1];
  var _s6 = React.useState("Complementary"), harmonyType = _s6[0], setHarmonyType = _s6[1];
  var _s7 = React.useState(false), showConfirm = _s7[0], setShowConfirm = _s7[1];
  var _s8 = React.useState(""), customHex = _s8[0], setCustomHex = _s8[1];
  var _s9 = React.useState(function() { return loadCustomPalettes(); }), customPalettes = _s9[0], setCustomPalettes = _s9[1];
  var _s10 = React.useState(null), mappingOverrides = _s10[0], setMappingOverrides = _s10[1];
  var _s11 = React.useState("shift"), activeMode = _s11[0], setActiveMode = _s11[1]; // "shift" or "preset"
  var _s12 = React.useState(null), activeTier = _s12[0], setActiveTier = _s12[1]; // null=auto, 8, 16, or 24

  var beforeRef = React.useRef(null);
  var afterRef = React.useRef(null);
  var debounceRef = React.useRef(null);

  // Compute mapping
  var computedMapping = React.useMemo(function() {
    if (activeMode === "preset" && activePreset) {
      var presetData = getPresetById(activePreset);
      if (presetData) {
        var tier = activeTier || autoSelectTier(pal.length);
        var unlockedCount = pal.filter(function(e) { return e.id !== "__skip__" && e.id !== "__empty__" && !lockedIds.has(e.id); }).length;
        var eff = getEffectiveTierColours(presetData, tier, unlockedCount);
        return computePresetMapping(pal, eff.colours, lockedIds);
      }
    }
    if (activeMode === "harmony") {
      var hTier = activeTier || autoSelectTier(pal.length);
      var harmonyCols = generateHarmonyPalette(harmonyBase, harmonyType, hTier);
      return computePresetMapping(pal, harmonyCols, lockedIds);
    }
    return computeShiftMapping(pal, shiftDeg, lockedIds);
  }, [pal, shiftDeg, lockedIds, activePreset, activeMode, harmonyBase, harmonyType, activeTier]);

  // Apply overrides
  var finalMapping = React.useMemo(function() {
    if (!mappingOverrides) return computedMapping.mapping;
    var merged = {};
    Object.keys(computedMapping.mapping).forEach(function(id) {
      merged[id] = mappingOverrides[id] || computedMapping.mapping[id];
    });
    return merged;
  }, [computedMapping, mappingOverrides]);

  var collisions = computedMapping.collisions;

  // Stitch counts per source ID
  var countMap = React.useMemo(function() {
    var c = {};
    if (!pat) return c;
    for (var i = 0; i < pat.length; i++) {
      var id = pat[i].id;
      if (id === "__skip__" || id === "__empty__") continue;
      c[id] = (c[id] || 0) + 1;
    }
    return c;
  }, [pat]);

  // Done count
  var doneCount = React.useMemo(function() {
    if (!done) return 0;
    var c = 0;
    for (var i = 0; i < done.length; i++) if (done[i]) c++;
    return c;
  }, [done]);

  // Contrast warnings
  var contrastWarnings = React.useMemo(function() {
    if (!showConfirm) return [];
    return computeContrastWarnings(pat, finalMapping, sW);
  }, [showConfirm, pat, finalMapping, sW]);

  // Has any change?
  var hasChange = React.useMemo(function() {
    var keys = Object.keys(finalMapping);
    for (var i = 0; i < keys.length; i++) {
      var m = finalMapping[keys[i]];
      if (!m.locked && m.source.id !== m.dest.id) return true;
    }
    return false;
  }, [finalMapping]);

  // Render preview canvases
  React.useEffect(function() {
    if (!showConfirm) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(function() {
      if (beforeRef.current) renderMiniCanvas(beforeRef.current, pat, sW, sH, null);
      if (afterRef.current) renderMiniCanvas(afterRef.current, pat, sW, sH, finalMapping);
    }, 200);
    return function() { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [showConfirm, pat, sW, sH, finalMapping]);

  // Toggle lock
  function toggleLock(id) {
    setLockedIds(function(prev) {
      var next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMappingOverrides(null);
  }

  // Override a mapping row
  function handleOverride(sourceId, thread) {
    setMappingOverrides(function(prev) {
      var n = Object.assign({}, prev || {}, finalMapping);
      var src = n[sourceId] ? n[sourceId].source : null;
      if (!src) return prev;
      var idealLab = rgbToLab(thread.rgb[0], thread.rgb[1], thread.rgb[2]);
      n[sourceId] = {
        source: src,
        dest: { id: thread.id, name: thread.name, rgb: thread.rgb, lab: thread.lab, type: "solid" },
        idealRgb: thread.rgb,
        dE: Math.sqrt(dE2(idealLab, thread.lab)),
        locked: false
      };
      return n;
    });
  }

  // Apply swap
  function applySwap() {
    // Record undo
    var changes = [];
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      if (cell.id === "__skip__" || cell.id === "__empty__") continue;
      var m = finalMapping[cell.id];
      if (m && !m.locked && m.source.id !== m.dest.id) {
        changes.push({ idx: i, old: Object.assign({}, pat[i]) });
      }
    }
    if (changes.length === 0) return;

    setEditHistory(function(prev) {
      var n = prev.concat([{ type: "palette_swap", changes: changes }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    setRedoHistory([]);

    var newPat = applyMapping(pat, finalMapping);
    var result = buildPaletteWithScratch(newPat);
    setPat(newPat);
    setPal(result.pal);
    setCmap(result.cmap);
    setDone(new Uint8Array(newPat.length));

    // Reset swap state
    setShiftDeg(0);
    setActivePreset(null);
    setActiveTier(null);
    setMappingOverrides(null);
    setShowConfirm(false);
  }

  // Save current palette
  function savePalette() {
    var name = prompt("Name this palette:");
    if (!name) return;
    var colours = [];
    Object.keys(finalMapping).forEach(function(id) {
      var m = finalMapping[id];
      if (m && m.dest) colours.push(rgbToHex(m.dest.rgb));
    });
    var entry = { name: name, colours: colours, createdAt: Date.now() };
    var updated = customPalettes.concat([entry]);
    setCustomPalettes(updated);
    saveCustomPalettes(updated);
  }

  function deleteCustomPalette(idx) {
    var updated = customPalettes.filter(function(_, i) { return i !== idx; });
    setCustomPalettes(updated);
    saveCustomPalettes(updated);
  }

  function upsertDraftCustomPalette(hex, match) {
    var draftName = match && match.name
      ? "Draft custom palette (" + match.name + " base)"
      : "Draft custom palette";
    var draftIndex = customPalettes.findIndex(function(entry) {
      return entry && (entry.isDraft === true || /^Draft custom palette\b/.test(entry.name));
    });

    if (draftIndex === -1) {
      return customPalettes.concat([{
        name: draftName,
        colours: [hex],
        createdAt: Date.now(),
        isDraft: true
      }]);
    }

    return customPalettes.map(function(entry, index) {
      if (index !== draftIndex) return entry;
      var colours = Array.isArray(entry.colours) ? entry.colours.slice() : [];
      if (colours.indexOf(hex) === -1) colours.push(hex);
      return {
        name: draftName,
        colours: colours,
        createdAt: entry.createdAt || Date.now(),
        isDraft: true
      };
    });
  }

  // Add hex to a temporary building palette
  function addCustomHexColour() {
    var hex = customHex.trim();
    if (!/^#?[0-9a-fA-F]{3,6}$/.test(hex)) return;
    if (hex[0] !== '#') hex = '#' + hex;
    var rgb = hexToRgb(hex);
    var canonicalHex = rgbToHex(rgb);
    var lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
    var match = findSolid(lab, DMC);
    var updated = upsertDraftCustomPalette(canonicalHex, match);
    setCustomPalettes(updated);
    saveCustomPalettes(updated);
    setCustomHex("");
  }

  // Sorted palette for display (by count descending)
  var sortedPal = React.useMemo(function() {
    return pal.filter(function(p) { return p.id !== "__skip__" && p.id !== "__empty__"; });
  }, [pal]);

  // All presets (array)
  var allThemePresets = PALETTE_PRESETS;

  // Harmony palette
  var harmonyColours = React.useMemo(function() {
    var tier = activeTier || autoSelectTier(pal.length);
    return generateHarmonyPalette(harmonyBase, harmonyType, tier);
  }, [harmonyBase, harmonyType, activeTier, pal.length]);

  var harmonyDmc = React.useMemo(function() {
    return harmonyColours.map(function(hex) {
      var rgb = hexToRgb(hex);
      var lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
      return findSolid(lab, DMC);
    });
  }, [harmonyColours]);

  // Early return if no palette data
  if (!pal || pal.length === 0) {
    return { shiftSection: null, presetSection: null, confirmView: null, showConfirm: false };
  }

  // ───────────── Sidebar: Shift Colours Section ─────────────
  var shiftSection = React.createElement(Section, {
    title: "Shift Colours", defaultOpen: true
  },
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 } },
      React.createElement(HueSpectrumBar, null),
      React.createElement(SliderRow, {
        label: "Shift", value: shiftDeg, min: 0, max: 360, step: 1,
        onChange: function(v) { setShiftDeg(v); setActiveMode("shift"); setActivePreset(null); setMappingOverrides(null); },
        suffix: "\u00B0"
      }),
      React.createElement(QuickShiftButtons, {
        value: activeMode === "shift" ? shiftDeg : -1,
        onChange: function(v) { setShiftDeg(v); setActiveMode("shift"); setActivePreset(null); setMappingOverrides(null); }
      }),
      React.createElement("div", { style: { borderTop: "0.5px solid #e4e4e7", margin: "4px 0" } }),
      React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 2 } }, "Colour mapping preview"),
      React.createElement("div", { style: { maxHeight: 250, overflow: "auto" } },
        sortedPal.map(function(entry) {
          var m = finalMapping[entry.id];
          if (!m) return null;
          return React.createElement("div", {
            key: entry.id,
            style: { display: "flex", alignItems: "center", gap: 4, padding: "3px 0", fontSize: 11 }
          },
            React.createElement(LockToggle, { locked: lockedIds.has(entry.id), onToggle: function() { toggleLock(entry.id); } }),
            React.createElement(SwatchBox, { rgb: m.source.rgb }),
            React.createElement("span", { style: { fontFamily: "monospace", minWidth: 32 } }, m.source.id),
            React.createElement("span", { style: { color: "#a1a1aa" } }, "\u2192"),
            React.createElement(SwatchBox, { rgb: m.dest.rgb }),
            React.createElement("span", { style: { fontFamily: "monospace", minWidth: 32 } }, m.dest.id),
            React.createElement("span", { style: { color: "#71717a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.dest.name || ""),
            m.locked
              ? React.createElement("span", { style: { fontSize: 10, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 8 } }, "Locked")
              : React.createElement(DEBadge, { dE: m.dE })
          );
        })
      ),
      collisions.length > 0 && React.createElement("div", {
        style: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#d97706" }
      },
        "\u26A0 ",
        collisions.map(function(c) {
          return "DMC " + c.dmcId + " (" + c.sourceIds.length + " sources)";
        }).join(", "),
        " \u2014 same thread collision. Pattern may lose detail."
      ),
      React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 4 } },
        React.createElement("button", {
          onClick: function() { if (hasChange) setShowConfirm(true); },
          disabled: !hasChange,
          style: {
            flex: 1, padding: "8px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: hasChange ? "pointer" : "default",
            background: hasChange ? "#1D9E75" : "#a1a1aa", color: "#fff", border: "none"
          }
        }, "Preview & Apply"),
        React.createElement("button", {
          onClick: function() { setShiftDeg(0); setActivePreset(null); setMappingOverrides(null); },
          style: {
            padding: "8px 12px", fontSize: 12, borderRadius: 8, cursor: "pointer",
            background: "#fff", color: "#71717a", border: "1px solid #e4e4e7"
          }
        }, "Reset")
      )
    )
  );

  // ───────────── Sidebar: Palette Presets Section ─────────────
  var presetSection = React.createElement(Section, {
    title: "Palette Presets", defaultOpen: false
  },
    React.createElement("div", { style: { marginTop: 8, display: "flex", flexDirection: "column", gap: 8 } },
      // Tab switcher
      React.createElement("div", {
        style: { display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }
      },
        ["themes", "harmony", "saved"].map(function(t) {
          var label = t.charAt(0).toUpperCase() + t.slice(1);
          var active = presetTab === t;
          return React.createElement("button", {
            key: t,
            onClick: function() { setPresetTab(t); },
            style: {
              flex: 1, padding: "5px 8px", fontSize: 11, fontWeight: active ? 500 : 400,
              background: active ? "#fff" : "transparent", borderRadius: 6,
              color: active ? "#18181b" : "#71717a", border: "none", cursor: "pointer",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none"
            }
          }, label);
        })
      ),

      // Themes tab
      presetTab === "themes" && React.createElement("div", {
        style: { display: "flex", flexDirection: "column", gap: 8 }
      },
        React.createElement("div", {
          style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }
        },
          allThemePresets.map(function(p) {
            return React.createElement(PresetCard, {
              key: p.id, preset: p,
              selected: activePreset === p.id,
              onClick: function() {
                setActivePreset(p.id);
                setActiveMode("preset");
                setMappingOverrides(null);
              }
            });
          })
        ),
        // Tier selector (visible when a preset is selected)
        activePreset && activeMode === "preset" && React.createElement("div", {
          style: { background: "#f9fafb", borderRadius: 8, padding: "8px 10px", border: "0.5px solid #e4e4e7" }
        },
          React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: "#71717a", marginBottom: 6, textTransform: "uppercase" } }, "Palette size"),
          React.createElement("div", { style: { display: "flex", gap: 4 } },
            [null, 8, 16, 24].map(function(t) {
              var isAuto = t === null;
              var label = isAuto ? "Auto (" + autoSelectTier(pal.length) + ")" : t + "";
              var active = activeTier === t;
              return React.createElement("button", {
                key: String(t),
                onClick: function() { setActiveTier(t); setMappingOverrides(null); },
                style: {
                  flex: 1, padding: "5px 6px", fontSize: 10, fontWeight: active ? 600 : 400,
                  borderRadius: 6, cursor: "pointer",
                  border: active ? "1px solid #1D9E75" : "1px solid #e4e4e7",
                  background: active ? "#f0fdfa" : "#fff",
                  color: active ? "#1D9E75" : "#71717a"
                }
              }, label);
            })
          ),
          // Tier preview with scaling info
          (function() {
            var preset = getPresetById(activePreset);
            if (!preset) return null;
            var tier = activeTier || autoSelectTier(pal.length);
            var colours = preset.tiers[tier] || preset.tiers[8];
            var unlockedCount = pal.filter(function(e) { return e.id !== "__skip__" && e.id !== "__empty__" && !lockedIds.has(e.id); }).length;
            var info = "";
            if (unlockedCount > colours.length) info = "Expanding " + colours.length + " \u2192 " + unlockedCount + " via interpolation";
            else if (unlockedCount < colours.length) info = "Reducing " + colours.length + " \u2192 " + unlockedCount + " (most distinct)";
            else info = "Exact match (" + colours.length + " colours)";
            return React.createElement("div", { style: { marginTop: 6 } },
              React.createElement("div", { style: { display: "flex", gap: 2, flexWrap: "wrap", marginBottom: 4 } },
                colours.map(function(hex, i) {
                  return React.createElement("span", {
                    key: i,
                    style: { width: 14, height: 14, borderRadius: 2, background: hex, border: "1px solid #d4d4d8", display: "inline-block" }
                  });
                })
              ),
              React.createElement("div", { style: { fontSize: 10, color: "#71717a" } }, info)
            );
          })()
        )
      ),

      // Harmony tab
      presetTab === "harmony" && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("label", {
            htmlFor: "harmony-base-colour-input",
            style: {
              width: 28, height: 28, borderRadius: 6, display: "inline-block",
              background: harmonyBase, border: "2px solid #e4e4e7", cursor: "pointer"
            }
          }),
          React.createElement("input", {
            id: "harmony-base-colour-input",
            type: "color", value: harmonyBase,
            onChange: function(e) { setHarmonyBase(e.target.value); setActiveMode("harmony"); setMappingOverrides(null); },
            style: { width: 0, height: 0, opacity: 0, position: "absolute" }
          }),
          React.createElement("input", {
            type: "text", value: harmonyBase,
            onChange: function(e) {
              var v = e.target.value;
              if (/^#[0-9a-fA-F]{6}$/.test(v)) { setHarmonyBase(v); setActiveMode("harmony"); setMappingOverrides(null); }
              else setHarmonyBase(v);
            },
            style: { fontFamily: "monospace", width: 80, padding: "4px 8px", border: "0.5px solid #e4e4e7", borderRadius: 6, fontSize: 12 }
          })
        ),
        React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
          Object.keys(HARMONY_TYPES).map(function(ht) {
            var active = harmonyType === ht;
            return React.createElement("button", {
              key: ht,
              onClick: function() { setHarmonyType(ht); setActiveMode("harmony"); setMappingOverrides(null); },
              style: {
                padding: "4px 10px", fontSize: 11, fontWeight: 500, borderRadius: 12, cursor: "pointer",
                border: active ? "1px solid #1D9E75" : "1px solid #e4e4e7",
                background: active ? "#f0fdfa" : "#fff",
                color: active ? "#1D9E75" : "#71717a"
              }
            }, ht);
          })
        ),
        // Tier selector for harmony
        React.createElement("div", { style: { display: "flex", gap: 4 } },
          [null, 8, 16, 24].map(function(t) {
            var isAuto = t === null;
            var label = isAuto ? "Auto (" + autoSelectTier(pal.length) + ")" : t + " colours";
            var active = activeTier === t;
            return React.createElement("button", {
              key: String(t),
              onClick: function() { setActiveTier(t); setActiveMode("harmony"); setMappingOverrides(null); },
              style: {
                flex: 1, padding: "4px 6px", fontSize: 10, fontWeight: active ? 600 : 400,
                borderRadius: 6, cursor: "pointer",
                border: active ? "1px solid #1D9E75" : "1px solid #e4e4e7",
                background: active ? "#f0fdfa" : "#fff",
                color: active ? "#1D9E75" : "#71717a"
              }
            }, label);
          })
        ),
        React.createElement("div", { style: { display: "flex", gap: 3 } },
          harmonyDmc.map(function(m, i) {
            return React.createElement("div", { key: i, style: { textAlign: "center" } },
              React.createElement(SwatchBox, { rgb: m.rgb, size: 22 }),
              React.createElement("div", { style: { fontSize: 9, color: "#a1a1aa" } }, m.id)
            );
          })
        ),
        React.createElement("button", {
          onClick: function() { if (activeMode === "harmony") setShowConfirm(true); },
          disabled: activeMode !== "harmony",
          style: {
            padding: "8px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: activeMode === "harmony" ? "pointer" : "default",
            background: activeMode === "harmony" ? "#1D9E75" : "#a1a1aa", color: "#fff", border: "none"
          }
        }, "Preview Harmony")
      ),

      // Saved tab
      presetTab === "saved" && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        customPalettes.length === 0 && React.createElement("div", {
          style: { fontSize: 11, color: "#a1a1aa", textAlign: "center", padding: "12px 0" }
        }, "No saved palettes yet. Apply a swap and click \u201CSave palette\u201D."),
        customPalettes.map(function(cp, idx) {
          return React.createElement("div", {
            key: idx,
            style: {
              borderRadius: 8, padding: 8, border: "1px solid #e4e4e7", background: "#fff",
              display: "flex", flexDirection: "column", gap: 4
            }
          },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              React.createElement("span", { style: { fontSize: 11, fontWeight: 500 } }, cp.name),
              React.createElement("div", { style: { display: "flex", gap: 4 } },
                React.createElement("button", {
                  onClick: function() {
                    // Store saved palette colours as the active preset source so
                    // mapping and collision detection are derived from the same state.
                    setActivePreset(cp.colours);
                    setActiveMode("preset");
                    setMappingOverrides(null);
                    setShowConfirm(true);
                  },
                  style: { fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#1D9E75", cursor: "pointer" }
                }, "Apply"),
                React.createElement("button", {
                  onClick: function() { deleteCustomPalette(idx); },
                  style: { fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", cursor: "pointer" }
                }, "\u00D7")
              )
            ),
            React.createElement("div", { style: { display: "flex", gap: 2 } },
              cp.colours.slice(0, 8).map(function(hex, ci) {
                return React.createElement("span", {
                  key: ci,
                  style: { width: 14, height: 14, borderRadius: 2, background: hex, border: "1px solid #d4d4d8", display: "inline-block" }
                });
              })
            )
          );
        })
      ),

      // Custom hex input at bottom
      presetTab === "themes" && React.createElement("div", {
        style: { display: "flex", gap: 4, alignItems: "center", borderTop: "0.5px solid #e4e4e7", paddingTop: 6 }
      },
        React.createElement("input", {
          type: "text", placeholder: "#hex", value: customHex,
          onChange: function(e) { setCustomHex(e.target.value); },
          style: { fontFamily: "monospace", width: 72, padding: "4px 8px", border: "0.5px solid #e4e4e7", borderRadius: 6, fontSize: 12 }
        }),
        React.createElement("button", {
          onClick: addCustomHexColour,
          style: { fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #e4e4e7", background: "#fafafa", cursor: "pointer" }
        }, "+ Add")
      ),

      // Apply preset button (Themes/Saved)
      (presetTab === "themes" && activePreset) && (function() {
        var pName = (getPresetById(activePreset) || {}).name || activePreset;
        return React.createElement("button", {
          onClick: function() { setShowConfirm(true); },
          style: {
            padding: "8px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
            background: "#1D9E75", color: "#fff", border: "none"
          }
        }, "Preview \u201C" + pName + "\u201D");
      })()
    )
  );

  // ───────────── Main Content: Confirmation View ─────────────
  var confirmView = showConfirm ? React.createElement("div", {
    className: "ps-confirm-overlay",
    style: { background: "#fff", borderRadius: 10, border: "1px solid #e4e4e7", padding: 16 }
  },
    // Preview canvases
    React.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 16 } },
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, "Before"),
        React.createElement("div", { style: { borderRadius: 8, background: "#f4f4f5", overflow: "hidden", aspectRatio: sW + "/" + sH } },
          React.createElement("canvas", { ref: beforeRef, style: { width: "100%", height: "100%", display: "block", imageRendering: "pixelated" } })
        )
      ),
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } },
          "After" + (activeMode === "shift" ? " (" + shiftDeg + "\u00B0 shift)" : activeMode === "preset" && activePreset ? " (\u201C" + ((getPresetById(activePreset) || {}).name || activePreset) + "\u201D)" : "")
        ),
        React.createElement("div", { style: { borderRadius: 8, background: "#f4f4f5", overflow: "hidden", aspectRatio: sW + "/" + sH } },
          React.createElement("canvas", { ref: afterRef, style: { width: "100%", height: "100%", display: "block", imageRendering: "pixelated" } })
        )
      )
    ),

    // Mapping table
    React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 4 } }, "Colour mapping"),
    React.createElement("div", { style: { overflow: "auto", maxHeight: 300, marginBottom: 12 } },
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } },
        React.createElement("thead", null,
          React.createElement("tr", { style: { fontSize: 10, textTransform: "uppercase", color: "#a1a1aa" } },
            React.createElement("th", { style: { textAlign: "left", padding: "2px 6px", fontWeight: 600 } }, "Source"),
            React.createElement("th", { style: { padding: "2px 2px" } }),
            React.createElement("th", { style: { textAlign: "left", padding: "2px 6px", fontWeight: 600 } }, "Destination"),
            React.createElement("th", { style: { textAlign: "right", padding: "2px 6px", fontWeight: 600 } }, "Stitches"),
            React.createElement("th", { style: { textAlign: "left", padding: "2px 6px", fontWeight: 600 } }, "Match"),
            React.createElement("th", { style: { padding: "2px 6px" } })
          )
        ),
        React.createElement("tbody", null,
          sortedPal.map(function(entry) {
            var m = finalMapping[entry.id];
            if (!m) return null;
            return React.createElement(MappingTableRow, {
              key: entry.id,
              mapping: m,
              count: countMap[entry.id] || 0,
              onOverride: handleOverride
            });
          })
        )
      )
    ),

    // Contrast warnings
    contrastWarnings.length > 0 && React.createElement("div", {
      style: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#d97706", marginBottom: 8 }
    },
      React.createElement("strong", null, "Low contrast pairs: "),
      contrastWarnings.map(function(w, i) {
        return React.createElement("span", { key: i, style: { display: "inline-flex", alignItems: "center", gap: 2, marginRight: 8 } },
          React.createElement(SwatchBox, { rgb: w.a.rgb, size: 12 }),
          React.createElement(SwatchBox, { rgb: w.b.rgb, size: 12 }),
          React.createElement("span", null, " " + w.ratio + ":1")
        );
      })
    ),

    // Tracking progress warning
    doneCount > 0 && React.createElement("div", {
      style: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#d97706", marginBottom: 8 }
    },
      "This pattern has tracking progress (" + doneCount.toLocaleString() + " stitches marked). Applying a palette swap will reset your progress."
    ),

    // Collision warnings
    collisions.length > 0 && React.createElement("div", {
      style: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#d97706", marginBottom: 8 }
    },
      "\u26A0 Collision: ",
      collisions.map(function(c) { return "DMC " + c.dmcId + " (" + c.sourceIds.length + " sources)"; }).join(", "),
      " \u2014 multiple source colours map to the same thread."
    ),

    // Action bar
    React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 8,
        background: "#fafafa", borderTop: "0.5px solid #e4e4e7", padding: "10px 0", marginTop: 8
      }
    },
      React.createElement("button", {
        onClick: savePalette,
        style: {
          fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
          background: "#fff", color: "#71717a", border: "1px solid #e4e4e7", marginRight: "auto"
        }
      }, "Save palette"),
      React.createElement("button", {
        onClick: function() { setShowConfirm(false); },
        style: {
          fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
          background: "#fff", color: "#71717a", border: "1px solid #e4e4e7"
        }
      }, "Cancel"),
      React.createElement("button", {
        onClick: applySwap,
        style: {
          fontSize: 13, fontWeight: 600, padding: "8px 20px", borderRadius: 8, cursor: "pointer",
          background: "#1D9E75", color: "#fff", border: "none"
        }
      }, "Apply Swap")
    )
  ) : null;

  // Return the component parts for the host CreatorApp to place
  return { shiftSection: shiftSection, presetSection: presetSection, confirmView: confirmView, showConfirm: showConfirm };
}
