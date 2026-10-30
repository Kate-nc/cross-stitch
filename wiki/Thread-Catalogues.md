# Custom thread catalogues

In Stash Manager, open **Custom thread catalogues**. Select a CSV file or paste CSV, preview the validation results, then import. Any error or duplicate rejects the whole import, including duplicates already stored by another tab. Imports append reference records; they cannot overwrite DMC, Anchor or existing custom records. Export custom CSV to keep a portable copy (full application backups do not currently include this new reference store).

Required header, in this order:

```csv
brand,code,name,rgb,status,substitute,provenance
my-threads,001,Crème,,discontinued,dmc:3865,Personal collection label
my-threads,A7,Ocean,#507080,unknown,,unknown
```

Codes are strings: leading zeros and non-numeric codes are retained. Brand slugs are lowercase ASCII letters, digits and hyphens, beginning with a letter. Identity is `brand:code`; code case is significant. DMC and Anchor are reserved. Names and provenance support Unicode and quoted commas/newlines. RGB is optional `#RRGGBB`, a screen approximation without calibrated accuracy. Status is active, discontinued or unknown. Substitutions are explicit suggestions, may refer to unavailable records, and never remap anything. Provenance is user supplied, not verified by stitchx; write `unknown` if unavailable.

Exports quote every field and prefix potentially executable spreadsheet formulas (and original apostrophes) with an apostrophe. stitchx reverses that escape on import. Keep codes as text when editing in spreadsheets to prevent spreadsheet conversion of leading zeros.

Custom catalogues are reference records, separate from stock quantities, Creator custom palettes and manufacturer conversion pools. They do not add a manufacturer matching palette. Existing project identities and explicit RGB remain intact. New project saves snapshot available RGB and names, including custom palette entries. Legacy compact projects without RGB still need their original catalogue to reconstruct a colour on first load; historical RGB cannot be recovered from a code alone.

Built-in DMC references have community-source audit documentation in `reports/dmc-colour-audit.md`; their RGB values are then calibrated by `scripts/calibrate-dmc-colours.js`, documented in `reports/dmc-colour-calibration.md`. Anchor source and reconciliation claims in `anchor-data.js` are historical repository claims without independently verified measurements or redistribution evidence. Conversion-table confidence labels are historical chart metadata, not colour calibration or guaranteed equivalence. No additional manufacturer data has been added.
