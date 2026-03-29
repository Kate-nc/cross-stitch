const { findSolid } = require('../colour-utils.js');
const { dE } = require('../dmc-data.js');

global.dE = dE;

describe('findSolid', () => {
  const palette = [
    { id: '310', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0] },
    { id: 'BLANC', name: 'White', rgb: [255, 255, 255], lab: [100, 0, 0] },
    { id: '666', name: 'Bright Red', rgb: [227, 29, 66], lab: [53, 67, 43] }
  ];

  it('should find an exact match in the palette', () => {
    const lab = [100, 0, 0]; // White
    const result = findSolid(lab, palette);
    expect(result.id).toBe('BLANC');
    expect(result.dist).toBe(0);
    expect(result.type).toBe('solid');
  });

  it('should find the closest color when an exact match is not present', () => {
    const lab = [10, 2, 2]; // Very dark, closer to Black than White or Red
    const result = findSolid(lab, palette);
    expect(result.id).toBe('310');
    // Distance = sqrt(10^2 + 2^2 + 2^2) = sqrt(108) ≈ 10.3923048
    expect(result.dist).toBeCloseTo(10.3923048, 5);
  });

  it('should return the only color if the palette has one item', () => {
    const singlePalette = [{ id: '666', name: 'Bright Red', rgb: [227, 29, 66], lab: [53, 67, 43] }];
    const lab = [100, 0, 0]; // White
    const result = findSolid(lab, singlePalette);
    expect(result.id).toBe('666');
  });

  it('should return an object with the correct structure', () => {
    const lab = [53, 67, 43];
    const result = findSolid(lab, palette);
    expect(result).toHaveProperty('type', 'solid');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('rgb');
    expect(result).toHaveProperty('lab');
    expect(result).toHaveProperty('dist');
  });

  it('should handle negative LAB values correctly', () => {
    const paletteWithNegative = [
      { id: 'NEG', name: 'Negative', rgb: [0, 128, 128], lab: [-50, -20, -20] }
    ];
    const lab = [-51, -21, -21];
    const result = findSolid(lab, paletteWithNegative);
    expect(result.id).toBe('NEG');
    expect(result.dist).toBeCloseTo(Math.sqrt(1+1+1), 5);
  });

  it('should fail gracefully or throw if the palette is empty', () => {
    // Current behavior: throws TypeError: Cannot read properties of null (reading 'id')
    // We document this behavior with a test.
    expect(() => {
      findSolid([0, 0, 0], []);
    }).toThrow(TypeError);
  });
});
