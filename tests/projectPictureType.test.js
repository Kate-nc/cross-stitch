/* tests/projectPictureType.test.js ────────────────────────────────────────
   A generated pattern keeps the picture type it was made as, and its exact
   shading mode, in project settings (creator/useProjectIO.js), so Detail and
   tidiness reads its steps in that type after a reload or a project switch.
   The browser flow is in tests/e2e/convert-saved-picture-type.spec.js.
   ─────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useProjectIO.js'), 'utf8');

function helpers(presets) {
  const start = src.indexOf('function creatorSavedPictureType');
  const end = src.indexOf('window.creatorSavedPictureType');
  // eslint-disable-next-line no-new-func
  return new Function('PICTURE_PRESETS', src.slice(start, end) +
    '\nreturn { save: creatorSavedPictureType, restore: creatorRestoredPictureType };')(presets);
}

describe('saving the picture type', () => {
  const h = helpers({ graphic: {}, photo: {}, pixel: {} });

  test('keeps the id and the values the type set', () => {
    const p = { id: 'graphic', values: { maxC: 8, dithMode: 'off', bgCol: [255, 255, 255] } };
    expect(h.save(p)).toEqual(p);
    expect(h.save(null)).toBeUndefined();
    expect(h.save({ id: 'graphic' })).toBeUndefined();
  });

  test('restores a known type, and nothing for a missing, unknown or damaged one', () => {
    const p = { id: 'pixel', values: { maxC: 30 } };
    expect(h.restore(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(h.restore(undefined)).toBeNull();
    expect(h.restore({ id: 'poster', values: {} })).toBeNull();
    expect(h.restore({ id: 'photo', values: [1, 2] })).toBeNull();
    expect(h.restore('photo')).toBeNull();
  });
});

describe('project saves and loads', () => {
  test('every project save carries the picture type and the shading mode', () => {
    const saves = src.match(/settings: \{ exactPixelArt:[^\n]*\}/g);
    expect(saves).toHaveLength(3);
    saves.forEach(s => {
      expect(s).toMatch(/dithMode: state\.dithMode/);
      expect(s).toMatch(/pictureType: creatorSavedPictureType\(state\.presetApplied\)/);
    });
  });

  test('loading sets the picture type every time (also to none), and restores the shading mode', () => {
    const load = src.slice(src.indexOf('var s = project.settings;'), src.indexOf('// ─── Tracing picture'));
    expect(load).toMatch(/state\.setDithMode\(s\.dithMode\)/);
    expect(load).toMatch(/else state\.setDith\(!!s\.dith\)/);
    // Unconditional, so the previous project's type never carries over.
    expect(load).toMatch(/\n    if \(state\.setPresetApplied\) state\.setPresetApplied\(savedPictureType\);/);
    expect(load).toMatch(/\n    if \(state\.setPictureInfo\) state\.setPictureInfo\(null\);/);
    // An older project's picture is looked at once it loads.
    expect(load).toMatch(/if \(!savedPictureType && state\.setPictureInfo\) \{[\s\S]*?creatorExaminePicture\(li\)[\s\S]*?state\.setPictureInfo\(info\)/);
  });
});
