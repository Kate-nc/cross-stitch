const { rgbToLab } = require('../dmc-data.js');

function runBenchmark() {
    const numColors = 10000;
    const numCalls = 1000000;

    // Generate a set of random colors to simulate an image palette
    const colors = [];
    for (let i = 0; i < numColors; i++) {
        colors.push([
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256)
        ]);
    }

    // Generate random indices to simulate accessing those colors repeatedly
    const calls = new Int32Array(numCalls);
    for (let i = 0; i < numCalls; i++) {
        calls[i] = Math.floor(Math.random() * numColors);
    }

    // Warmup
    for (let i = 0; i < 100000; i++) {
        const c = colors[calls[i]];
        rgbToLab(c[0], c[1], c[2]);
    }

    // Benchmark
    const start = process.hrtime.bigint();

    let dummy = 0;
    for (let i = 0; i < numCalls; i++) {
        const c = colors[calls[i]];
        const lab = rgbToLab(c[0], c[1], c[2]);
        dummy += lab[0]; // Prevent optimization
    }

    const end = process.hrtime.bigint();
    const timeMs = Number(end - start) / 1000000;

    console.log(`Time taken for ${numCalls} calls: ${timeMs.toFixed(2)} ms`);
    return timeMs;
}

runBenchmark();
