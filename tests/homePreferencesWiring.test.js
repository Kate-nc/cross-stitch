/* Regression test: home-mode Header in creator-main.js must wire onPreferences
   so the Preferences modal is reachable from the home screen. Round 2 introduced
   the Preferences entry in the dropdown menu but the home Header was the only
   one that didn't pass the prop, so the menu item appeared inert. */
const fs = require('fs');
const path = require('path');

describe('Home mode Preferences wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'creator-main.js'), 'utf8');

  test('home Header receives onPreferences prop', () => {
    // Find the home-mode Header element.
    const m = src.match(/<Header page="home"[\s\S]*?\/>/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/onPreferences\s*=/);
  });

  test('homePrefsOpen state and PreferencesModal mount exist', () => {
    expect(src).toMatch(/homePrefsOpen/);
    expect(src).toMatch(/window\.PreferencesModal/);
  });
});
