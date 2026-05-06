// Tests for onboarding-wizard.js — verifies localStorage gating behaviour.
const fs = require('fs');
const path = require('path');

// Minimal localStorage stub.
const store = {};
global.window = {
  localStorage: {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  }
};
global.localStorage = global.window.localStorage;
global.React = {
  createElement: function () {},
  useState: function (init) { return [init, function () {}]; }
};

const src = fs.readFileSync(path.join(__dirname, '..', 'onboarding-wizard.js'), 'utf8');
eval(src);

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('WelcomeWizard', () => {
  test('exposes WelcomeWizard on window', () => {
    expect(typeof window.WelcomeWizard).toBe('function');
    expect(typeof window.WelcomeWizard.shouldShow).toBe('function');
    expect(typeof window.WelcomeWizard.markDone).toBe('function');
    expect(typeof window.WelcomeWizard.reset).toBe('function');
  });

  test('shouldShow returns true on first visit for known pages', () => {
    expect(window.WelcomeWizard.shouldShow('creator')).toBe(true);
    expect(window.WelcomeWizard.shouldShow('manager')).toBe(true);
    expect(window.WelcomeWizard.shouldShow('tracker')).toBe(true);
  });

  test('shouldShow returns false after markDone', () => {
    window.WelcomeWizard.markDone('creator');
    expect(window.WelcomeWizard.shouldShow('creator')).toBe(false);
    // Other pages remain unaffected.
    expect(window.WelcomeWizard.shouldShow('manager')).toBe(true);
  });

  test('reset clears the done flag', () => {
    window.WelcomeWizard.markDone('manager');
    expect(window.WelcomeWizard.shouldShow('manager')).toBe(false);
    window.WelcomeWizard.reset('manager');
    expect(window.WelcomeWizard.shouldShow('manager')).toBe(true);
  });

  test('shouldShow returns false for unknown pages', () => {
    expect(window.WelcomeWizard.shouldShow('bogus')).toBe(false);
  });

  test('STEPS contains creator, manager, tracker entries with at least 2 steps each', () => {
    expect(window.WelcomeWizard.STEPS.creator.length).toBeGreaterThanOrEqual(2);
    expect(window.WelcomeWizard.STEPS.manager.length).toBeGreaterThanOrEqual(2);
    expect(window.WelcomeWizard.STEPS.tracker.length).toBeGreaterThanOrEqual(2);
  });

  test('STEPS.creator[2] targets the home-from-image element', () => {
    const step = window.WelcomeWizard.STEPS.creator[2];
    expect(step.target).toBe('[data-onboard="home-from-image"]');
  });

  test('No creator step body contains stale "Start New" panel reference', () => {
    const bodies = window.WelcomeWizard.STEPS.creator.map(s => s.body || '');
    bodies.forEach(body => {
      expect(body).not.toMatch(/Start New/);
    });
  });

  test('No creator step body contains directional references "above" or "below"', () => {
    const bodies = window.WelcomeWizard.STEPS.creator.map(s => s.body || '');
    bodies.forEach(body => {
      expect(body).not.toMatch(/\babove\b/i);
      expect(body).not.toMatch(/\bbelow\b/i);
    });
  });

  test('STEPS.manager step titles do not start with a digit', () => {
    window.WelcomeWizard.STEPS.manager.forEach(step => {
      expect(step.title).not.toMatch(/^\d/);
    });
  });
});
