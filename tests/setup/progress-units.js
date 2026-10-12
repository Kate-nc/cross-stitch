// The pages load progress-units.js with a script tag before project-storage.js (tests/progressUnitsLoaded.test.js
// checks every page). Tests that run project-storage.js on its own get the same global from here.
const PU = require('../../progress-units.js');
global.ProgressUnits = PU;
if (typeof window !== 'undefined') window.ProgressUnits = PU;

// helpers.js is loaded before these scripts on every page, so its shared functions (the estimator, the date helper)
// are globals there. Tests that load insights-engine.js or project-storage.js on their own get them from here.
try {
  const fs = require('fs');
  const path = require('path');
  (0, eval)(fs.readFileSync(path.join(__dirname, '..', '..', 'helpers.js'), 'utf8'));
} catch (e) { /* a test that needs them will say so */ }
