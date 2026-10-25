// relay-sync.js helpers: pairing codes, the pairing bundle's encryption and
// the access token. The full pair-and-sync flow runs in tests/e2e/relay-sync.spec.js.
const fs = require('fs');

global.window = global;
eval(fs.readFileSync('./relay-sync.js', 'utf8'));
const T = global.SyncRelay._test;

describe('pairing codes', () => {
  test('new codes are 12 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) expect(T.newCode()).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/);
  });

  test('typed and scanned forms normalise to the same code', () => {
    expect(T.normalizeCode('ab cd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(T.normalizeCode('STITCHX-PAIR:ABCDEFGHJKMN')).toBe('ABCDEFGHJKMN');
    // Look-alikes people type by mistake.
    expect(T.normalizeCode('0OIL-0000-0000')).toBe('0011' + '00000000');
    expect(T.formatCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
  });

  test('wrong lengths and letters outside the alphabet are refused', () => {
    expect(T.normalizeCode('ABCD-EFGH')).toBeNull();
    expect(T.normalizeCode('ABCD-EFGH-JKMU')).toBeNull(); // U is not used
    expect(T.normalizeCode('')).toBeNull();
  });
});

describe('pairing bundle', () => {
  const bundle = { v: 1, space: 'A'.repeat(22), key: 'B'.repeat(43) };

  test('opens with the code it was sealed with', async () => {
    const blob = await T.sealBundle(bundle, 'ABCDEFGHJKMN');
    expect(blob).not.toContain('BBBB');
    await expect(T.openBundle(blob, 'ABCDEFGHJKMN')).resolves.toEqual(bundle);
  });

  test('does not open with another code', async () => {
    const blob = await T.sealBundle(bundle, 'ABCDEFGHJKMN');
    await expect(T.openBundle(blob, 'ABCDEFGHJKMP')).rejects.toBeTruthy();
  });

  test('the relay lookup id reveals nothing of the code', async () => {
    const id = await T.pairId('ABCDEFGHJKMN');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toBe(await T.pairId('ABCDEFGHJKMP'));
  });
});

test('the access token is derived from the key and is not the key', async () => {
  const state = { space: 'A'.repeat(22), key: 'C'.repeat(43) };
  const token = await T.accessToken(state);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(token).not.toBe(state.key);
  expect(await T.accessToken({ space: state.space, key: 'D'.repeat(43) })).not.toBe(token);
});
