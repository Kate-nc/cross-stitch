/**
 * tests/generateConfirmGuard.test.js
 *
 * Regression test for audit-4G INT-3 / C-3.
 *
 * "Generate" rebuilds pat / pal and resets `done` to a fresh
 * Uint8Array of zeros and `parkMarkers` to [] (see applyResultRef
 * in creator/useCreatorState.js). Before the fix, this happened
 * silently — a user with hours of stitching progress could click
 * Generate by accident and lose everything. The fix wraps the
 * generate callback so that if any progress exists, a confirm
 * dialog is shown first via window.ConfirmDialog.show.
 *
 * This test asserts the source contains the guard. A behavioural
 * test that fully renders the Creator hook is out of scope for the
 * existing test harness (no React renderer set up) — the structural
 * checks below are the same style used by tests/workerLifecycleStructure.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'useCreatorState.js'),
  'utf8'
);

describe('audit-4G — generate() confirms before clearing progress (INT-3 / C-3)', () => {
  test('source contains the INT-3 / C-3 guard tag', () => {
    expect(src).toMatch(/INT-3 \/ C-3/);
  });

  test('guard scans done for any stitched cell', () => {
    const idx = src.indexOf('INT-3 / C-3');
    const window = src.slice(idx, idx + 1200);
    // Loops over done looking for === 1.
    expect(window).toMatch(/done\[_di\]\s*===\s*1/);
    // Also flags non-empty park markers.
    expect(window).toMatch(/parkMarkers\.length\s*>\s*0/);
  });

  test('guard shows a ConfirmDialog when progress exists and aborts when cancelled', () => {
    const idx = src.indexOf('INT-3 / C-3');
    const window = src.slice(idx, idx + 1800);
    expect(window).toMatch(/window\.ConfirmDialog/);
    expect(window).toMatch(/\.show\(\{/);
    // Confirm button label is the destructive copy.
    expect(window).toMatch(/Regenerate \(clear progress\)/);
    // Re-entry uses an __confirmed flag so the dialog isn't shown twice.
    expect(window).toMatch(/__confirmed:\s*true/);
    // If the user cancels, we return without calling generate again.
    expect(window).toMatch(/if\s*\(!ok\)\s*return/);
  });

  test('confirmed re-entry bypasses the dialog', () => {
    // The early-return condition explicitly checks the __confirmed flag.
    expect(src).toMatch(/!\(overrides && overrides\.__confirmed\)/);
  });
});
