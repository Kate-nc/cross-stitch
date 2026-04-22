describe('colourway-system', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    global.DMC = [
      { id: '310', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0] },
      { id: '321', name: 'Red', rgb: [200, 20, 20], lab: [50, 60, 40] },
      { id: '939', name: 'Blue', rgb: [20, 30, 120], lab: [30, 20, -50] },
      { id: 'white', name: 'White', rgb: [250, 250, 250], lab: [98, 0, 0] },
    ];
    global.ANCHOR = [];
    global.SYMS = ['●', '◆', '■'];
    global.getThreadByKey = (key) => {
      const [brand, id] = String(key).includes(':') ? String(key).split(':') : ['dmc', String(key)];
      if (brand !== 'dmc') return null;
      return global.DMC.find((t) => t.id === id) || null;
    };
    global.rgbToLab = (r, g, b) => [r / 3, g / 3, b / 3];
    global.dE2000 = (a, b) => Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
    global.shiftRgbHue = (rgb, deg) => {
      if (!deg || deg % 360 === 0) return rgb.slice();
      return [rgb[2], rgb[0], rgb[1]];
    };
    api = require('../colourway-system.js');
  });

  test('builds base colourway model from palette and pattern', () => {
    const model = api.buildColourwayModel({
      pattern: [{ id: '310' }, { id: '321' }, { id: '321' }],
      palette: [{ id: '310' }, { id: '321' }],
    });

    expect(model.colourways).toHaveLength(1);
    expect(model.colourways[0].isBase).toBe(true);
    expect(model.colourSlots.map((s) => s.id)).toEqual(['310', '321']);
    expect(model.colourways[0].colourMap['310']).toBe('dmc:310');
    expect(model.activeColourwayId).toBe(model.colourways[0].id);
  });

  test('new colourway copies currently active colour map', () => {
    const model = api.buildColourwayModel({
      pattern: [{ id: '310' }, { id: '321' }],
      palette: [{ id: '310' }, { id: '321' }],
    });
    const base = model.colourways[0];
    base.colourMap['321'] = 'dmc:939';
    model.activeColourwayId = base.id;

    const created = api.createColourway(model, 'Cool');

    expect(created.name).toBe('Cool');
    expect(created.isBase).toBe(false);
    expect(created.colourMap).toEqual(base.colourMap);
    expect(created).not.toHaveProperty('stitchGrid');
  });

  test('base colourway cannot be deleted', () => {
    const model = api.buildColourwayModel({
      pattern: [{ id: '310' }],
      palette: [{ id: '310' }],
    });

    expect(api.deleteColourway(model, model.colourways[0].id)).toBe(false);
  });

  test('reconcileSlotsFromPalette removes orphan slot mappings and adds new slots', () => {
    const model = api.buildColourwayModel({
      pattern: [{ id: '310' }, { id: '321' }],
      palette: [{ id: '310' }, { id: '321' }],
    });
    const v = api.createColourway(model, 'V1');
    v.colourMap['ghost'] = 'dmc:939';

    api.reconcileSlotsFromPalette(model, [{ id: '310' }, { id: '939' }], [{ id: '310' }, { id: '939' }]);

    expect(model.colourSlots.map((s) => s.id)).toEqual(['310', '939']);
    expect(v.colourMap.ghost).toBeUndefined();
    expect(v.colourMap['939']).toBeTruthy();
  });

  test('validate catches guard violations', () => {
    const model = api.buildColourwayModel({
      pattern: [{ id: '310' }],
      palette: [{ id: '310' }],
    });
    model.colourways.push({ id: 'bad', isBase: true, colourMap: {}, stitchGrid: [] });

    const result = api.validate(model, [{ id: 'missing-slot' }]);

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Exactly one base colourway must exist');
    expect(result.errors.join(' ')).toContain('must not contain stitchGrid');
    expect(result.errors.join(' ')).toContain('Orphan stitch slot');
  });

  test('hue shift idempotency check passes at 0° and 360°', () => {
    const model = api.buildColourwayModel({
      pattern: [{ id: '310' }, { id: '321' }],
      palette: [{ id: '310' }, { id: '321' }],
    });

    const result = api.validatePaletteToolIdempotency(model);

    expect(result).toEqual({ ok: true });
  });
});
