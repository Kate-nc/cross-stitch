/* Regression test: the canonical /home Header (now rendered by home-app.js,
   not creator-main.js — the legacy in-Creator HomeScreen mount was retired
   in Tier 2 of the homepage-predominance audit) must wire onPreferences so
   the Preferences modal is reachable from the home screen. */
const fs = require('fs');
const path = require('path');

describe('Home Preferences wiring (home-app.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'home-app.js'), 'utf8');

  test('home Header receives onPreferences prop', () => {
    // home-app.js renders the Header via React.createElement, not JSX.
    expect(src).toMatch(/page:\s*'home'/);
    expect(src).toMatch(/onPreferences:\s*function/);
  });

  test('Preferences modal is mounted from home', () => {
    expect(src).toMatch(/window\.PreferencesModal/);
  });
});
