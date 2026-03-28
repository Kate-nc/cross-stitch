const { dE } = require('../dmc-data.js');

describe('dE (Color Distance)', () => {
  it('should return 0 for identical points', () => {
    const p1 = [10, 20, 30];
    const p2 = [10, 20, 30];
    expect(dE(p1, p2)).toBe(0);
  });

  it('should calculate the correct Euclidean distance between two points', () => {
    // 3-4-5 right triangle equivalent in 3D:
    // Distance between (0,0,0) and (1,2,2) is sqrt(1^2 + 2^2 + 2^2) = sqrt(1+4+4) = sqrt(9) = 3
    const p1 = [0, 0, 0];
    const p2 = [1, 2, 2];
    expect(dE(p1, p2)).toBe(3);
    expect(dE(p2, p1)).toBe(3); // Commutative property
  });

  it('should handle negative coordinates correctly', () => {
    const p1 = [-10, -20, -30];
    const p2 = [10, 20, 30];
    // dx = 20, dy = 40, dz = 60
    // distance = sqrt(400 + 1600 + 3600) = sqrt(5600) ≈ 74.8331477
    expect(dE(p1, p2)).toBeCloseTo(74.8331477, 5);
  });

  it('should handle floating point coordinates correctly', () => {
    const p1 = [1.5, 2.5, 3.5];
    const p2 = [4.5, 6.5, 8.5];
    // dx = 3, dy = 4, dz = 5
    // distance = sqrt(9 + 16 + 25) = sqrt(50) ≈ 7.0710678
    expect(dE(p1, p2)).toBeCloseTo(7.0710678, 5);
  });

  it('should correctly handle zero values in only some dimensions', () => {
    const p1 = [0, 5, 0];
    const p2 = [12, 5, 0];
    // distance = 12
    expect(dE(p1, p2)).toBe(12);
  });

  it('should calculate distance when coordinates are large numbers', () => {
    const p1 = [1000, 2000, 3000];
    const p2 = [4000, 6000, 8000];
    // dx = 3000, dy = 4000, dz = 5000
    // distance = sqrt(9,000,000 + 16,000,000 + 25,000,000) = sqrt(50,000,000) ≈ 7071.0678
    expect(dE(p1, p2)).toBeCloseTo(7071.0678, 4);
  });
});
