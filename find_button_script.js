const fs = require('fs');

const content = fs.readFileSync('tracker-app.js', 'utf8');
const lines = content.split('\n');
const trackingIndex = lines.findIndex(l => l.includes('Tracking Mode</button>'));
const trackIndex = lines.findIndex(l => l.includes('Track</button>'));

console.log("Tracking Mode toggle line:", trackingIndex);
console.log("Track mode line:", trackIndex);
