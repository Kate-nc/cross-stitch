/**
 * icons.test.js
 *
 * Verifies that:
 *   1. Every Icons.xxx() call found in the codebase has a corresponding
 *      function defined in icons.js.
 *   2. Every defined icon function returns a non-null value (i.e. produces
 *      a React element rather than crashing).
 *
 * This prevents the class of bug where a new icon is referenced in UI code
 * before being added to icons.js (which previously caused a runtime crash
 * on the deployed site: "Icons.cloudOff is not a function").
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 1. Load icons.js with minimal browser-environment shims
// ---------------------------------------------------------------------------

// icons.js calls React.createElement; we only need something that returns a
// truthy non-null value so we can verify the icon function completes without error.
const mockElement = { type: 'svg', props: {}, children: [] };
const mockReact = {
  createElement: function() { return mockElement; }
};

// icons.js assigns to window.Icons
const mockWindow = {};

const iconsSource = fs.readFileSync(
  path.join(__dirname, '..', 'icons.js'),
  'utf8'
);

// Evaluate with shims in scope
const fn = new Function('window', 'React', iconsSource);
fn(mockWindow, mockReact);

const Icons = mockWindow.Icons;

// ---------------------------------------------------------------------------
// 2. Collect all Icons.xxx names actually used across the codebase
// ---------------------------------------------------------------------------

// Files that may reference Icons.xxx() — include source files but not
// the compiled bundle (which is generated from the source files).
const sourceFiles = [
  '../header.js',
  '../home-screen.js',
  '../home-app.js',
  '../components.js',
  '../modals.js',
  '../tracker-app.js',
  '../manager-app.js',
  '../palette-swap.js',
  '../creator-main.js',
  '../creator/ContextMenu.js',
  '../creator/ExportTab.js',
  '../creator/PatternTab.js',
  '../creator/Sidebar.js',
].map(function(f) { return path.join(__dirname, f); });

const usedIconNames = new Set();
const ICON_CALL_RE = /Icons\.(\w+)\s*\(/g;

for (const filePath of sourceFiles) {
  if (!fs.existsSync(filePath)) continue;
  const src = fs.readFileSync(filePath, 'utf8');
  let m;
  while ((m = ICON_CALL_RE.exec(src)) !== null) {
    usedIconNames.add(m[1]);
  }
  ICON_CALL_RE.lastIndex = 0;
}

// ---------------------------------------------------------------------------
// 3. Tests
// ---------------------------------------------------------------------------

describe('Icons object', () => {
  it('is defined by icons.js', () => {
    expect(Icons).toBeDefined();
    expect(typeof Icons).toBe('object');
  });

  it('every Icons.xxx used in the codebase is a function in icons.js', () => {
    const missing = [];
    for (const name of usedIconNames) {
      if (typeof Icons[name] !== 'function') {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every defined icon function returns a non-null value', () => {
    const broken = [];
    for (const name of Object.keys(Icons)) {
      if (typeof Icons[name] === 'function') {
        try {
          const result = Icons[name]();
          if (result == null) broken.push(name + ' returned null/undefined');
        } catch (e) {
          broken.push(name + ' threw: ' + e.message);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  // Snapshot of icons that are currently used — adding a new Icons.xxx call
  // to the codebase without a definition will fail the test above, but this
  // test makes the full expected set explicit for reviewers.
  it('used icon set matches snapshot', () => {
    const sorted = Array.from(usedIconNames).sort();
    expect(sorted).toMatchSnapshot();
  });
});
