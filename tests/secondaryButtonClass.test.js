// UX-023: two secondary actions rendered with browser-default button styling.
// They now use the standard `.btn` class from styles.css.

const fs = require('fs');
const path = require('path');

function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

describe('secondary buttons use the standard .btn class (UX-023)', () => {
  test('Creator "Ready to stitch review" banner button', () => {
    const src = read('creator/PatternTab.js');
    expect(src).toMatch(/className:"btn btn-sm", onClick:function\(\)\{app\.setMaterialsTab\("review"\);app\.setTab\("materials"\);\}\}, "Ready to stitch review"/);
  });

  test('Tracker "Thread consumption history" button', () => {
    const src = read('tracker-app.js');
    expect(src).toMatch(/<button type="button" className="btn" onClick=\{\(\)=>openConsumptionHistory\(\)\}>Thread consumption history<\/button>/);
  });

  test('.btn is defined in the shared stylesheet both pages load', () => {
    expect(read('styles.css')).toMatch(/^\.btn \{/m);
    expect(read('create.html')).toContain('href="styles.css"');
    expect(read('stitch.html')).toContain('href="styles.css"');
  });
});
