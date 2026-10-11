// The pages load progress-units.js with a script tag before project-storage.js (tests/progressUnitsLoaded.test.js
// checks every page). Tests that run project-storage.js on its own get the same global from here.
const PU = require('../../progress-units.js');
global.ProgressUnits = PU;
if (typeof window !== 'undefined') window.ProgressUnits = PU;
