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

function allCreatorBodies() {
  const W = window.WelcomeWizard;
  const out = [];
  [{ coarse: false, compact: false }, { coarse: true, compact: true }].forEach(dev => {
    const d = {
      coarse: dev.coarse, compact: dev.compact,
      Tap: dev.coarse ? 'Tap' : 'Click', tap: dev.coarse ? 'tap' : 'click',
      settings: dev.compact ? 'the Settings sheet' : 'the panel on the right',
      actions: dev.compact ? 'the More menu at the top' : 'the bar at the top'
    };
    Object.keys(W.CREATOR_TOURS).forEach(k => W.CREATOR_TOURS[k](d).forEach(s => out.push(s.body || '')));
  });
  return out;
}

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
    expect(window.WelcomeWizard.stepsFor('creator').length).toBeGreaterThanOrEqual(2);
    expect(window.WelcomeWizard.STEPS.manager.length).toBeGreaterThanOrEqual(2);
    expect(window.WelcomeWizard.STEPS.tracker.length).toBeGreaterThanOrEqual(2);
  });

  // The Creator walkthrough runs in the Creator, so it points at Creator
  // controls (it used to target a Home tile that never exists there).
  test('the picture tour targets the Generate button', () => {
    const step = window.WelcomeWizard.stepsFor('creator')[1];
    expect(step.target).toBe('[data-onboard="creator-generate"]');
  });

  test('No creator step body contains stale "Start New" panel reference', () => {
    const bodies = allCreatorBodies();
    bodies.forEach(body => {
      expect(body).not.toMatch(/Start New/);
    });
  });

  test('No creator step body contains directional references "above" or "below"', () => {
    const bodies = allCreatorBodies();
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

  test('shouldShow fails open when localStorage.getItem throws (private browsing)', () => {
    const original = global.window.localStorage.getItem;
    global.window.localStorage.getItem = () => { throw new Error('SecurityError'); };
    try {
      // S-3: known page must return true (i.e. show wizard) when storage
      // access is blocked, not silently hide it.
      expect(window.WelcomeWizard.shouldShow('creator')).toBe(true);
      // Unknown page still returns false (guard runs before the try).
      expect(window.WelcomeWizard.shouldShow('bogus')).toBe(false);
    } finally {
      global.window.localStorage.getItem = original;
    }
  });

  test('each way into the Creator has its own tour of at most 4 steps', () => {
    ['creator-convert', 'creator-scratch', 'creator-import'].forEach(p => {
      const steps = window.WelcomeWizard.stepsFor(p);
      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(steps.length).toBeLessThanOrEqual(4);
      expect(window.WelcomeWizard.shouldShow(p)).toBe(true);
    });
  });

  test('the scratch tour starts with drawing, not pictures', () => {
    const first = window.WelcomeWizard.stepsFor('creator-scratch')[0];
    expect(first.title).toMatch(/Draw/);
    expect(first.title + first.body).not.toMatch(/picture|image|photo/i);
  });

  test('someone who finished the old Creator tour does not see a new one', () => {
    window.WelcomeWizard.markDone('creator');
    expect(window.WelcomeWizard.shouldShow('creator-scratch')).toBe(false);
    expect(window.WelcomeWizard.shouldShow('creator-convert')).toBe(false);
  });

  test('finishing one tour leaves the others to show', () => {
    window.WelcomeWizard.markDone('creator-scratch');
    expect(window.WelcomeWizard.shouldShow('creator-scratch')).toBe(false);
    expect(window.WelcomeWizard.shouldShow('creator-convert')).toBe(true);
  });

  test("reset('creator') brings every Creator tour back", () => {
    window.WelcomeWizard.markDone('creator-scratch');
    window.WelcomeWizard.markDone('creator-import');
    window.WelcomeWizard.reset('creator');
    expect(window.WelcomeWizard.shouldShow('creator-scratch')).toBe(true);
    expect(window.WelcomeWizard.shouldShow('creator-import')).toBe(true);
  });

  test('tours name controls for the device: Tap and the Settings sheet on a phone', () => {
    const d = { coarse: true, compact: true, Tap: 'Tap', tap: 'tap', settings: 'the Settings sheet', actions: 'the More menu at the top' };
    const phone = JSON.stringify(window.WelcomeWizard.CREATOR_TOURS.convert(d));
    expect(phone).toMatch(/Settings sheet/);
    expect(phone).not.toMatch(/\bclick\b/i);
    const d2 = { coarse: false, compact: false, Tap: 'Click', tap: 'click', settings: 'the panel on the right', actions: 'the bar at the top' };
    const desk = JSON.stringify(window.WelcomeWizard.CREATOR_TOURS.scratch(d2));
    expect(desk).not.toMatch(/\btap\b/i);
    expect(desk).not.toMatch(/Settings sheet/);
  });

  test('creatorDevice reads the pointer and the compact layout', () => {
    const d = window.WelcomeWizard.creatorDevice();
    expect(['Tap', 'Click']).toContain(d.Tap);
  });
});
