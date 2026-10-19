/* tests/threadLabelFormatter.test.js — the one thread label (UX-013).
 *
 * helpers.js formatThread / threadParts / threadLabel write a thread the same
 * way for the Creator Palette tab and chips, the Tracker colour list, active
 * tile and status bar, the Stash Manager and Home. These run the real
 * catalogues and helpers in a VM, as tests/threadBrand.test.js does.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function load(files) {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} } };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  vm.createContext(ctx);
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  return ctx;
}

const ctx = load(['dmc-data.js', 'anchor-data.js', 'helpers.js']);
const dmcOnly = load(['dmc-data.js', 'helpers.js']);
const DMC = vm.runInContext('DMC', ctx);
const fmt = (entry, variant) => ctx.formatThread(entry, variant ? { variant } : undefined);

describe('a solid thread', () => {
  const pewter = { id: '3799', name: 'Pewter VDk', type: 'solid' };

  test('full: brand, number and the name spelled out', () => {
    expect(fmt(pewter)).toBe('DMC 3799 Pewter Very Dark');
  });

  test('short is the brand and number only', () => {
    expect(fmt(pewter, 'short')).toBe('DMC 3799');
    expect(ctx.threadLabel(pewter)).toBe('DMC 3799');
  });

  test('name is the name alone, and title is the full name for a tooltip', () => {
    expect(fmt(pewter, 'name')).toBe('Pewter Very Dark');
    expect(fmt(pewter, 'title')).toBe('DMC 3799 Pewter Very Dark');
  });

  test('a name the entry lacks comes from the catalogue', () => {
    expect(fmt({ id: '3799' })).toBe('DMC 3799 Pewter Very Dark');
    expect(fmt({ id: '05' })).toBe('DMC 05 Light Driftwood');
  });

  test('a number with no name and no catalogue entry is just the number', () => {
    expect(fmt({ id: 'U1' })).toBe('DMC U1');
    expect(fmt({ id: 'U1', name: 'U1' })).toBe('DMC U1');
  });

  test('nothing gives an empty string, never "undefined"', () => {
    expect(fmt(null)).toBe('');
    expect(fmt(undefined, 'short')).toBe('');
    expect(ctx.threadLabel(null)).toBe('');
  });
});

describe('an Anchor thread', () => {
  test('the brand is always written with the number', () => {
    expect(fmt({ id: '403', brand: 'anchor', name: 'Black' })).toBe('Anchor 403 Black');
    expect(fmt({ id: '403', brand: 'anchor' }, 'short')).toBe('Anchor 403');
    expect(fmt({ id: '403', brand: 'Anchor' }, 'short')).toBe('Anchor 403');
  });

  test('the name comes from the Anchor catalogue, not the DMC one that shares the number', () => {
    const colliding = ctx.ANCHOR.find((a) => {
      const d = ctx.findThreadInCatalog('dmc', a.id);
      return d && d.name !== a.name;
    });
    expect(colliding).toBeTruthy();
    expect(fmt({ id: colliding.id, brand: 'anchor' }))
      .toBe('Anchor ' + colliding.id + ' ' + ctx.threadFullName(colliding.name));
  });

  test('with no Anchor catalogue loaded the label still names the brand', () => {
    expect(dmcOnly.formatThread({ id: '403', brand: 'anchor' })).toBe('Anchor 403');
  });
});

describe('a blend', () => {
  const blend = {
    id: '341+826', type: 'blend', name: '341+826',
    threads: [{ id: '341', name: 'Blue Violet Lt' }, { id: '826', name: 'Blue Med' }]
  };

  test('full: both numbers and the word blend, not the name twice', () => {
    expect(fmt(blend)).toBe('DMC 341 + 826 (blend)');
  });

  test('short drops the word blend', () => {
    expect(fmt(blend, 'short')).toBe('DMC 341 + 826');
  });

  test('name joins both thread names, spelled out', () => {
    expect(fmt(blend, 'name')).toBe('Blue Violet Light + Blue Medium');
  });

  test('title names both threads and says how to stitch it', () => {
    expect(fmt(blend, 'title')).toBe(
      'DMC 341 Blue Violet Light + DMC 826 Blue Medium (blend: one strand of each thread)');
  });

  test('a blend with no threads array is read from its id and the catalogue', () => {
    const bare = { id: '341+826', type: 'blend', name: '341+826' };
    expect(fmt(bare)).toBe('DMC 341 + 826 (blend)');
    expect(fmt(bare, 'name')).toBe('Blue Violet Light + Blue Medium');
  });

  test('an id with a plus is a blend even when the entry has no type', () => {
    expect(fmt({ id: '341+826' })).toBe('DMC 341 + 826 (blend)');
  });

  test('the chip no longer repeats itself ("341+826 · 341+826")', () => {
    const p = ctx.threadParts(blend);
    expect(p.id).toBe('341 + 826');
    expect(p.name).not.toContain('341+826');
  });

  test('an Anchor blend is written with the brand once', () => {
    const a = { id: '403+1', type: 'blend', brand: 'anchor', threads: [{ id: '403', brand: 'anchor' }, { id: '1', brand: 'anchor' }] };
    expect(fmt(a)).toBe('Anchor 1 + 403 (blend)');
  });

  test('the same blend stored either way round reads the same, lowest number first', () => {
    expect(fmt({ id: '469+3346', type: 'blend' })).toBe('DMC 469 + 3346 (blend)');
    expect(fmt({ id: '3346+469', type: 'blend' })).toBe('DMC 469 + 3346 (blend)');
    expect(fmt({ id: '3346+469', type: 'blend' }, 'name')).toBe(fmt({ id: '469+3346', type: 'blend' }, 'name'));
    expect(fmt({ id: '3346+blanc', type: 'blend' }, 'short')).toBe('DMC 3346 + blanc');
  });

  test('an uneven blend keeps its order, which says where the extra strand goes', () => {
    expect(fmt({ id: '826+341', type: 'blend', blendRatio: [2, 1] }, 'short')).toBe('DMC 826 + 341');
  });

  test('an uneven ratio is said in the title', () => {
    expect(fmt({ id: '310+550', type: 'blend', blendRatio: [1, 2] }, 'title'))
      .toBe('DMC 310 Black + DMC 550 Violet Very Dark (blend: 1 strand of the first thread and 2 of the second)');
  });
});

describe('a Stash Manager library thread', () => {
  test('a solid reads the same as a palette entry', () => {
    const lib = { id: '3799', name: 'Pewter VDk', brand: 'DMC', qty: 900, unit: 'stitches' };
    expect(fmt(lib)).toBe(fmt({ id: '3799', name: 'Pewter VDk', type: 'solid' }));
  });

  test('a blend entered with is_blended reads as a blend', () => {
    const lib = { id: '341', name: 'Blue Violet Lt', is_blended: true, blend_id: '826', blend_name: 'Blue Med', blend_ratio: [1, 1] };
    expect(fmt(lib)).toBe('DMC 341 + 826 (blend)');
    expect(fmt(lib, 'name')).toBe('Blue Violet Light + Blue Medium');
  });

  test('an Anchor library thread is not labelled DMC', () => {
    expect(fmt({ id: '403', name: 'Black', brand: 'Anchor' })).toBe('Anchor 403 Black');
  });
});

describe('long names', () => {
  test('catalogue abbreviations are spelled out', () => {
    expect(ctx.threadFullName('Antq Mauve VDk')).toBe('Antique Mauve Very Dark');
    expect(ctx.threadFullName('Christmas Red Br')).toBe('Christmas Red Bright');
    expect(ctx.threadFullName('Bright Org-Red')).toBe('Bright Orange-Red');
    expect(ctx.threadFullName('Desert Snd UVDk')).toBe('Desert Sand Ultra Very Dark');
    expect(ctx.threadFullName('Peacock Bl Dk')).toBe('Peacock Blue Dark');
  });

  test('every catalogue name expands without leaving a shade abbreviation behind', () => {
    const left = /\b(Lt|Dk|Med|Md|VDk|VLt|UVLt|UVDk|UDk|ULt|MLt|MDk|MVLt|ExDk|UPale|Grn|Brn|Antq|Yel|Snd|Turq|Org|Elec|Blk)\b/;
    const bad = DMC.filter((d) => left.test(ctx.threadFullName(d.name))).map((d) => d.id + ' ' + d.name);
    expect(bad).toEqual([]);
  });

  test('a long name is never cut short or truncated with an ellipsis', () => {
    const longest = DMC.reduce((a, d) => (ctx.threadFullName(d.name).length > ctx.threadFullName(a.name).length ? d : a));
    const label = fmt(longest);
    expect(label.endsWith(ctx.threadFullName(longest.name))).toBe(true);
    expect(label).not.toMatch(/[…]|\.\.\./);
    const custom = 'Extremely Long Hand Dyed Variegated Sunset Over The Harbour';
    expect(fmt({ id: 'X1', name: custom })).toBe('DMC X1 ' + custom);
  });

  test('a word is only expanded when it stands alone', () => {
    expect(ctx.threadFullName('Medallion')).toBe('Medallion');
    expect(ctx.threadFullName('Darker Lt')).toBe('Darker Light');
    expect(ctx.threadFullName('')).toBe('');
    expect(ctx.threadFullName(null)).toBe('');
  });
});

describe('the explanations are written once', () => {
  test('a blend is one strand of each thread in the needle', () => {
    expect(ctx.BLEND_HELP.title).toBe("What's a blend?");
    expect(ctx.BLEND_HELP.summary).toMatch(/two threads together in the same needle/);
    expect(ctx.BLEND_HELP.body).toMatch(/one strand of each thread/);
  });

  test('confetti stitches are defined in the words the brief gives', () => {
    expect(ctx.CONFETTI_HELP.definition).toBe('single stitches of a colour on their own; slow to stitch');
  });
});
