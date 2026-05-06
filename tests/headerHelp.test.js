// tests/headerHelp.test.js — fix-3.1
// Verifies the Header surfaces a visible Help affordance using the
// help icon, with an aria-label, calling HelpDrawer.open({ tab: 'help' }).

const fs = require('fs');
const path = require('path');
const { loadSource } = require('./_helpers/loadSource');
const src = loadSource('header.js');

describe('fix-3.1 — visible Help affordance', () => {
  it('header.js renders a button with className tb-help-btn', () => {
    expect(src).toMatch(/className:\s*'tb-nav-link tb-help-btn'/);
  });

  it('Help button uses Icons.help', () => {
    expect(src).toMatch(/Icons\.help\(\)/);
  });

  it('Help button has an explicit aria-label', () => {
    expect(src).toMatch(/'aria-label':\s*'Open help \(\?\)'/);
  });

  it('Help button opens HelpDrawer on the help tab', () => {
    expect(src).toMatch(/HelpDrawer\.open\(\{\s*tab:\s*'help'\s*\}\)/);
  });
});

describe('fix-3.1 — icons.js exposes help + layers', () => {
  const iconsSrc = fs.readFileSync(path.join(__dirname, '..', 'icons.js'), 'utf8');
  it('defines Icons.help', () => {
    expect(iconsSrc).toMatch(/help:\s*function\s*\(\)/);
  });
  it('defines Icons.layers', () => {
    expect(iconsSrc).toMatch(/layers:\s*function\s*\(\)/);
  });
});
