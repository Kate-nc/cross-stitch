const { rgbToLab } = require('../dmc-data.js');
const { DMC } = require('../dmc-data.js');
const { findBest, doMap, buildPalette } = require('../colour-utils.js');

// Mock rgbToLab and findBest dependencies by setting them on global if needed
global.rgbToLab = rgbToLab;
global.findBest = findBest;

function dE2(lab1, lab2) {
  let dl = lab1[0] - lab2[0];
  let da = lab1[1] - lab2[1];
  let db = lab1[2] - lab2[2];
  return dl * dl + da * da + db * db;
}
global.dE2 = dE2;
global.DMC = DMC;

function runBenchmark() {
    const width = 500;
    const height = 500;
    const numPixels = width * height; // 250,000 pixels
    const data = new Uint8ClampedArray(numPixels * 4);

    // Create some distinct colors (e.g. 256 colors)
    for (let i = 0; i < numPixels; i++) {
        const colorIdx = i % 256;
        data[i * 4] = colorIdx; // R
        data[i * 4 + 1] = 255 - colorIdx; // G
        data[i * 4 + 2] = (colorIdx * 2) % 256; // B
        data[i * 4 + 3] = 255; // A
    }

    // A small palette
    const pal = DMC.slice(0, 10);

    // Warmup
    doMap(data, 100, 100, pal);

    const start = process.hrtime.bigint();
    doMap(data, width, height, pal);
    const end = process.hrtime.bigint();

    const timeMs = Number(end - start) / 1000000;
    console.log(`Time taken for doMap (${width}x${height}): ${timeMs.toFixed(2)} ms`);
}

runBenchmark();
