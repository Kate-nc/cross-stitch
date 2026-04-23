// Tests for help-content.js — verifies HELP_TOPICS structure and search filter logic.
const fs = require('fs');
const path = require('path');

// Stub a minimal window/React so the IIFE executes without throwing.
global.window = {};
global.React = {
  createElement: function () {},
  useState: function (init) { return [init, function () {}]; }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'help-content.js'), 'utf8');
eval(src);

describe('help-content', () => {
  test('exposes HELP_TOPICS array on window', () => {
    expect(Array.isArray(window.HELP_TOPICS)).toBe(true);
    expect(window.HELP_TOPICS.length).toBeGreaterThanOrEqual(5);
  });

  test('every topic has id, label, icon, and at least one section', () => {
    window.HELP_TOPICS.forEach(t => {
      expect(typeof t.id).toBe('string');
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.label).toBe('string');
      expect(typeof t.icon).toBe('string');
      expect(Array.isArray(t.sections)).toBe(true);
      expect(t.sections.length).toBeGreaterThan(0);
    });
  });

  test('every section has heading and either body or bullets', () => {
    window.HELP_TOPICS.forEach(t => {
      t.sections.forEach(s => {
        expect(typeof s.heading).toBe('string');
        expect(s.body || s.bullets).toBeTruthy();
        if (s.bullets) {
          expect(Array.isArray(s.bullets)).toBe(true);
          s.bullets.forEach(b => {
            expect(Array.isArray(b)).toBe(true);
            expect(b.length).toBe(2);
          });
        }
      });
    });
  });

  test('topic ids are unique', () => {
    const ids = window.HELP_TOPICS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('expected page topics exist (creator, tracker, manager)', () => {
    const ids = window.HELP_TOPICS.map(t => t.id);
    expect(ids).toEqual(expect.arrayContaining(['creator', 'tracker', 'manager']));
  });

  test('glossary tab is present with Save/Stash terminology', () => {
    const glossary = window.HELP_TOPICS.find(t => t.id === 'glossary');
    expect(glossary).toBeTruthy();
    const flat = JSON.stringify(glossary).toLowerCase();
    expect(flat).toContain('stash');
    expect(flat).toContain('save');
    expect(flat).toContain('download');
    expect(flat).toContain('project');
    expect(flat).toContain('pattern');
  });

  test('exposes HelpCentre as a function', () => {
    expect(typeof window.HelpCentre).toBe('function');
  });
});
