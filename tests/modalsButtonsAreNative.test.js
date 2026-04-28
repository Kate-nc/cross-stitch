// Regression lock for audit batch 2 fix #5.
//
// The Shortcuts panel (and every other shared modal in modals.js) routes its
// click handlers through native <button> elements rather than div+role="button"
// constructs. Native buttons fire `click` on both Enter and Space without any
// extra JS, which means the panel is keyboard-accessible by default.
//
// An audit flagged "missing Space-key handlers" as a potential WCAG gap; on
// inspection the gap was a false alarm because all interactive elements were
// already native buttons. This test locks that invariant in: if someone later
// switches a button to `<div onClick=...>`, the test fails and forces the
// refactor to add explicit keyboard handling.

const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'modals.js'), 'utf8');

// All literal createElement / h() invocations of "div" or "span" with a
// neighbouring onClick prop. Comment-only references (the audit notes) are
// excluded by skipping lines starting with "//".
function findInteractiveNonButtons(src) {
  const offenders = [];
  const lines = src.split(/\r?\n/);
  // We need a 6-line window because `createElement('div', { ... onClick: ...`
  // is sometimes split across multiple lines after a `style: { ... }` block.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line)) continue;
    const m = line.match(/createElement\(\s*['"](div|span|a|li|ul|p|section|article)['"]/);
    if (!m) continue;
    // Look for an onClick within the next 12 lines or until the matching ).
    let depth = 0, found = false;
    for (let j = 0; j < 14 && (i + j) < lines.length; j++) {
      const seg = lines[i + j];
      // Skip onClick references inside nested createElement('button', ...)
      if (/createElement\(\s*['"]button['"]/.test(seg)) break;
      if (/\bonClick\s*:/.test(seg)) { found = true; break; }
      depth += (seg.match(/\(/g) || []).length;
      depth -= (seg.match(/\)/g) || []).length;
      if (depth < 0) break;
    }
    if (found) {
      offenders.push({
        line: i + 1,
        tag: m[1],
        snippet: line.trim()
      });
    }
  }
  return offenders;
}

describe('modals.js — every clickable element is a native <button>', () => {
  test('no <div onClick> / <span onClick> / etc. exists', () => {
    const offenders = findInteractiveNonButtons(SOURCE);
    if (offenders.length) {
      const detail = offenders.map(o => `  modals.js:${o.line}  <${o.tag}>  ${o.snippet}`).join('\n');
      throw new Error(
        'Found interactive non-button elements. Native <button> handles ' +
        'Enter and Space for free; div+onClick does not. Either switch the ' +
        'tag to <button> or add explicit keyDown handlers for Enter and ' +
        'Space:\n' + detail
      );
    }
  });

  test('Shortcuts modal "Reset preferences" flow uses three buttons', () => {
    // The inline confirm flow added in audit batch 2 fix #1 has three button
    // states (idle, arming with Reset+Cancel, done with Reload now). Lock the
    // count so a regression can't accidentally drop one back to confirm()/alert().
    const within = SOURCE.match(/Reset preview preferences[\s\S]+?Reload now/);
    expect(within).not.toBeNull();
    const buttonMatches = within[0].match(/createElement\(\s*'button'/g) || [];
    expect(buttonMatches.length).toBeGreaterThanOrEqual(4);
  });
});
