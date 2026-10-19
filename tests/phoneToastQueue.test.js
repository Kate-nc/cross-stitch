/**
 * UX-018: on a phone, notices queue into one full-width banner (toast.js).
 * Runs the real toast.js in jsdom with a matchMedia stub, fake timers and a Coaching stub.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const src = fs.readFileSync(path.join(__dirname, '..', 'toast.js'), 'utf8');

function setup({ phone = true, prefs = {} } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const t = { opened: 0, closed: 0 };
  w.Date.now = () => Date.now();             // the window's clock follows Jest's fake one
  w.matchMedia = () => ({ matches: phone });
  w.UserPrefs = { get: k => prefs[k] };
  w.Coaching = { overlayOpened() { t.opened++; }, overlayClosed() { t.closed++; } };
  w.eval(src);
  const doc = w.document;
  return {
    w, t, doc,
    shown: () => Array.from(doc.querySelectorAll('[data-toast-id]')).map(e => e.querySelector('span:not([aria-hidden])').textContent),
    show: o => w.Toast.show(o),
    container: () => doc.querySelector('[data-toast-container]'),
    close: () => w.close()
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('phone layout', () => {
  test('one full-width banner at the bottom', () => {
    const s = setup();
    s.show({ message: 'One' });
    const c = s.container();
    expect(c.getAttribute('data-toast-phone')).toBe('1');
    expect(c.style.left).toBe('0px');
    expect(c.style.right).toBe('0px');
    expect(c.style.transform).toBe('');
    const el = c.querySelector('[data-toast-id]');
    expect(el.style.width).toBe('100%');
    expect(el.style.maxWidth).toBe('');
    expect(el.style.flexWrap).toBe('wrap');
    s.close();
  });

  test('never more than one on screen: the rest wait', () => {
    const s = setup();
    s.show({ message: 'A' }); s.show({ message: 'B' }); s.show({ message: 'C' });
    expect(s.shown()).toEqual(['A']);
    jest.advanceTimersByTime(4000);           // A's informational clock
    expect(s.shown()).toEqual(['B']);
    jest.advanceTimersByTime(4000);
    expect(s.shown()).toEqual(['C']);
    jest.advanceTimersByTime(4000);
    jest.advanceTimersByTime(400);
    expect(s.shown()).toEqual([]);
    s.close();
  });

  test('information dismisses itself within four seconds, even when the caller asked for nine', () => {
    const s = setup();
    s.show({ message: 'Long', duration: 9000 });
    jest.advanceTimersByTime(3900);
    expect(s.shown()).toEqual(['Long']);
    jest.advanceTimersByTime(100);
    jest.advanceTimersByTime(400);
    expect(s.shown()).toEqual([]);
    s.close();
  });

  test('a notice with a button keeps six seconds; warnings and errors keep their own time', () => {
    const s = setup();
    s.show({ message: 'Act', duration: 9000, action: () => {}, actionLabel: 'Open' });
    jest.advanceTimersByTime(5900);
    expect(s.shown()).toEqual(['Act']);
    jest.advanceTimersByTime(100); jest.advanceTimersByTime(400);
    expect(s.shown()).toEqual([]);
    s.show({ message: 'Warn', type: 'warning', duration: 9000 });
    jest.advanceTimersByTime(8900);
    expect(s.shown()).toEqual(['Warn']);
    s.close();
  });

  test('a duration of 0 stays until dismissed', () => {
    const s = setup();
    s.show({ message: 'Stay', duration: 0 });
    jest.advanceTimersByTime(60000);
    expect(s.shown()).toEqual(['Stay']);
    s.close();
  });

  test('buttons and the dismiss control are at least 44px', () => {
    const s = setup();
    s.show({ message: 'Act', action: () => {}, actionLabel: 'Open' });
    const el = s.container().querySelector('[data-toast-id]');
    const btn = el.querySelector('.toast-action');
    const x = el.querySelector('.toast-dismiss');
    expect(btn.style.minHeight).toBe('44px');
    expect(btn.style.minWidth).toBe('44px');
    expect(x.style.minHeight).toBe('44px');
    expect(x.style.minWidth).toBe('44px');
    s.close();
  });

  test('the message wraps in full: no ellipsis clipping', () => {
    const s = setup();
    s.show({ message: 'x'.repeat(300) });
    const msg = s.container().querySelector('[data-toast-id] span');
    expect(msg.style.textOverflow).toBe('');
    expect(msg.style.overflowWrap).toBe('anywhere');
    s.close();
  });
});

describe('queue order', () => {
  test('errors jump ahead of what is waiting and replace what is showing', () => {
    const s = setup();
    s.show({ message: 'A' }); s.show({ message: 'B' });
    s.show({ message: 'Oops', type: 'error' });
    expect(s.shown()).toEqual(['Oops']);          // more important than A: it takes over
    jest.advanceTimersByTime(6000);
    expect(s.shown()).toEqual(['B']);             // A was ordinary feedback and is gone
    s.close();
  });

  test('first-run notices wait behind feedback for what the stitcher just did', () => {
    const s = setup();
    s.show({ message: 'Welcome', priority: 0 });
    s.show({ message: 'Row done' });
    expect(s.shown()).toEqual(['Row done']);      // outranks the notice and takes the banner
    jest.advanceTimersByTime(4000);
    expect(s.shown()).toEqual(['Welcome']);       // the notice was put back, not lost
    s.close();
  });

  test('first-run notices keep their order among themselves', () => {
    const s = setup();
    s.show({ message: 'First', priority: 0 });
    s.show({ message: 'Second', priority: 0 });
    expect(s.shown()).toEqual(['First']);
    jest.advanceTimersByTime(4000);
    expect(s.shown()).toEqual(['Second']);
    s.close();
  });

  test('an Undo offer is never lost to a more important message', () => {
    const s = setup();
    s.show({ message: 'Undo me', undoAction: () => {} });
    s.show({ message: 'Oops', type: 'error' });
    expect(s.shown()).toEqual(['Oops']);
    jest.advanceTimersByTime(6000);
    expect(s.shown()).toEqual(['Undo me']);
    s.close();
  });

  test('the same message is not shown twice, showing or waiting', () => {
    const s = setup();
    const a = s.show({ message: 'Same' });
    expect(s.show({ message: 'Same' })).toBe(a);
    s.show({ message: 'Other' });
    s.show({ message: 'Other' });
    jest.advanceTimersByTime(4000);
    expect(s.shown()).toEqual(['Other']);
    jest.advanceTimersByTime(4000); jest.advanceTimersByTime(400);
    expect(s.shown()).toEqual([]);
    s.close();
  });

  test('two messages with buttons are never folded together: each keeps its own handler', () => {
    const s = setup();
    const ran = [];
    const a = s.show({ message: 'Marked 12 stitches.', undoAction: () => ran.push('a') });
    const b = s.show({ message: 'Marked 12 stitches.', undoAction: () => ran.push('b') });
    expect(b).not.toBe(a);
    s.container().querySelector('.toast-action').click();
    expect(ran).toEqual(['a']);
    expect(s.shown()).toEqual(['Marked 12 stitches.']);   // the twin, with its own Undo, takes the banner next
    s.container().querySelector('.toast-action').click();
    expect(ran).toEqual(['a', 'b']);
    s.close();
  });

  test('the queue is capped and drops the oldest ordinary feedback', () => {
    const s = setup();
    for (let i = 0; i < 9; i++) s.show({ message: 'm' + i });
    const seen = [];
    for (let i = 0; i < 12; i++) { seen.push(...s.shown()); jest.advanceTimersByTime(4400); }
    expect(seen.length).toBeLessThanOrEqual(6);   // the visible one plus a queue of at most five
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]).toBe('m0');
    expect(seen).not.toContain('m1');             // the oldest waiting feedback was the one dropped
    s.close();
  });

  test('a notice that stays until dismissed does not hold everything else back', () => {
    const s = setup();
    s.show({ message: 'Reload this page', duration: 0 });
    s.show({ message: 'Saved' });
    expect(s.shown()).toEqual(['Saved']);         // feedback takes the banner for its few seconds
    jest.advanceTimersByTime(4000);
    expect(s.shown()).toEqual(['Reload this page']);   // and the notice comes back, still there
    jest.advanceTimersByTime(60000);
    expect(s.shown()).toEqual(['Reload this page']);
    s.close();
  });

  test('feedback that waited too long is not shown late', () => {
    const s = setup();
    s.show({ message: 'Slow error', type: 'error', duration: 60000 });
    s.show({ message: 'Stale' });
    jest.advanceTimersByTime(20000);
    s.w.Toast.dismiss(s.container().querySelector('[data-toast-id]').getAttribute('data-toast-id'));
    jest.advanceTimersByTime(400);
    expect(s.shown()).toEqual([]);
    s.close();
  });

  test('dismiss() removes a waiting toast by the id show() returned', () => {
    const s = setup();
    s.show({ message: 'A' });
    const b = s.show({ message: 'B' });
    s.w.Toast.dismiss(b);
    jest.advanceTimersByTime(4000); jest.advanceTimersByTime(400);
    expect(s.shown()).toEqual([]);
    s.close();
  });

  test('the Undo button runs the handler, clears the banner and confirms once', () => {
    const s = setup();
    let ran = 0;
    s.show({ message: 'Did it', undoAction: () => { ran++; } });
    s.container().querySelector('.toast-action').click();
    expect(ran).toBe(1);
    expect(s.shown()).toEqual(['Undone']);
    s.close();
  });
});

describe('coaching', () => {
  test('the banner holds coachmarks back while it is up, and lets them go after', () => {
    const s = setup();
    s.show({ message: 'A' }); s.show({ message: 'B' });
    expect(s.t.opened).toBe(1);
    expect(s.w.Toast.isBannerOpen()).toBe(true);
    jest.advanceTimersByTime(4000);               // A to B: still one claim, no flicker
    expect(s.t.opened).toBe(1);
    expect(s.t.closed).toBe(0);
    jest.advanceTimersByTime(4000);
    expect(s.t.closed).toBe(1);
    expect(s.w.Toast.isBannerOpen()).toBe(false);
    s.close();
  });

  test('a swap for something more important does not release and re-take the claim', () => {
    const s = setup();
    s.show({ message: 'A' });
    s.show({ message: 'Oops', type: 'error' });
    expect(s.t.opened).toBe(1);
    expect(s.t.closed).toBe(0);
    s.close();
  });

  test('without Coaching loaded nothing breaks and nothing is closed that was not opened', () => {
    const s = setup();
    s.w.Coaching = undefined;
    s.show({ message: 'A' });
    jest.advanceTimersByTime(4400);
    expect(s.shown()).toEqual([]);
    expect(s.t.closed).toBe(0);
    s.close();
  });
});

describe('everywhere else', () => {
  test('a wider screen still stacks toasts, centred, up to the preference, and never touches Coaching', () => {
    const s = setup({ phone: false });
    ['A', 'B', 'C', 'D'].forEach(m => s.show({ message: m }));
    expect(s.container().getAttribute('data-toast-phone')).toBe('0');
    expect(s.container().style.left).toBe('50%');
    jest.advanceTimersByTime(400);              // the oldest has faded out
    expect(s.shown()).toEqual(['B', 'C', 'D']);
    expect(s.t.opened).toBe(0);
    s.close();
  });

  test('a wider screen keeps the caller\'s duration and the desktop message clipping', () => {
    const s = setup({ phone: false });
    s.show({ message: 'Slow', duration: 9000 });
    jest.advanceTimersByTime(8900);
    expect(s.shown()).toEqual(['Slow']);
    expect(s.container().querySelector('[data-toast-id] span').style.textOverflow).toBe('ellipsis');
    s.close();
  });

  test('turning toasts off still lets an error through, on a phone as anywhere', () => {
    const s = setup({ prefs: { toastsEnabled: false } });
    expect(s.show({ message: 'Quiet' })).toBeNull();
    s.show({ message: 'Failed', type: 'error' });
    expect(s.shown()).toEqual(['Failed']);
    s.close();
  });
});

describe('first-run notices are marked low priority', () => {
  test('the wake-lock notice and the sessions notice pass priority 0', () => {
    const wake = fs.readFileSync(path.join(__dirname, '..', 'useWakeLock.js'), 'utf8');
    const tracker = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
    expect(wake).toMatch(/Keeping the screen on while you stitch\.", type:"info", duration:9000, priority:0/);
    expect(tracker).toMatch(/Sessions are tracked automatically[^]*?priority:0/);
  });
});
