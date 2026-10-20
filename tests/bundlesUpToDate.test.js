// Use the same isolated byte comparisons as CI: verification never regenerates
// or restores files in the checkout, including when a generator fails.
const { BUNDLES, checkBundle } = require('../scripts/check-generated-bundles');

for (const bundle of BUNDLES) {
  test(`${bundle.outputs.join(', ')} match what ${bundle.script} produces`, () => {
    expect(checkBundle(bundle)).toEqual([]); // If stale: run the generator and commit the result.
  });
}
