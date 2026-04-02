const fs = require('fs');
const dmc = [0, 0, 0];
const json = {
  version: 8,
  page: "tracker",
  settings: { sW: 2, sH: 2, fabricCt: 14, skeinPrice: 1.2, stitchSpeed: 40 },
  pattern: [
    { id: "A", type: "solid", rgb: dmc },
    { id: "A", type: "solid", rgb: dmc },
    { id: "A", type: "solid", rgb: dmc },
    { id: "A", type: "solid", rgb: dmc }
  ],
  palette: [
    { id: "A", type: "solid", name: "Black", rgb: dmc, lab: dmc, count: 4, symbol: "A" }
  ],
  originalPaletteState: [
    { id: "A", type: "solid", name: "Black", rgb: dmc, lab: dmc, count: 4, symbol: "A" }
  ],
  bsLines: [],
  done: [1, 0, 0, 0],
  parkMarkers: [],
  totalTime: 0,
  sessions: [],
  hlRow: -1,
  hlCol: -1,
  threadOwned: {},
  singleStitchEdits: {}
};

fs.writeFileSync('test_proj2.json', JSON.stringify(json));
