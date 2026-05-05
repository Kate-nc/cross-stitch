# P0 Verification: Creator Legend/Export

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-EL-SCR-008-10-01 | PASS | user-prefs.js:53; creator/pdfExport.js:203,275 | `creator.pdfWorkshopTheme` defaults false; opt-in only; PK-compat path guarded by tests in tests/pdfTheme.test.js |
| VER-EL-SCR-023-03-01 | PASS | creator/DesignerBrandingSection.js:42-44 | Canvas alpha enabled by default; no background fill before drawImage; PNG format preserved via toDataURL("image/png") |

## Detailed findings

### VER-EL-SCR-008-10-01 — PASS

The `creator.pdfWorkshopTheme` UserPref defaults to **false** in user-prefs.js:53, with the comment confirming "opt-in Workshop print theme (terracotta + linen). OFF = bit-identical PK output."

The preference is read via `readWorkshopThemePref()` at creator/pdfExport.js:201-203:

```javascript
return window.UserPrefs.get("creator.pdfWorkshopTheme") === true;
```

When exporting, the theme parameter is set at creator/pdfExport.js:275:

```javascript
theme: (legacy.theme === "workshop" || readWorkshopThemePref()) ? "workshop" : "pk",
```

This ensures the default theme is `"pk"` (Pattern Keeper-compatible). The workshop-only PDF changes are gated in creator/pdfChartLayout.js:267-277 where `themeColors('pk')` returns `null` for both channels, signalling callers to use legacy literals.

**Bit-stability tests** in tests/pdfTheme.test.js verify:
- Lines 48-49: PK theme returns null channels (no colour change)
- Lines 72-76: Worker guards major-grid colour behind `themeCols.majorGrid` check
- Lines 78-81: CrossStitchSymbols font embedding unchanged (`subset: false`)
- Lines 84-89: `legacyExportPDF` defaults theme to `'pk'` when omitted
- tests/pdfThemePref.test.js:16-19: confirms default is `false`

The PK-compat path is untouched when workshop theme is OFF; all conditional logic falls through to null returns.

### VER-EL-SCR-023-03-01 — PASS

The logo downscaling function in creator/DesignerBrandingSection.js:26-52 preserves PNG alpha:

**Canvas creation** (DesignerBrandingSection.js:42-44):

```javascript
var c = document.createElement("canvas");
c.width = w; c.height = hgt;
c.getContext("2d").drawImage(img, 0, 0, w, hgt);
```

Alpha preservation verified:
1. Canvas created without options → alpha channel enabled by default (per HTML Canvas spec).
2. `getContext("2d")` called without `{ alpha: false }` → context has alpha blending enabled.
3. No background colour fill before `drawImage()` → canvas remains transparent.
4. PNG format detection and preservation at DesignerBrandingSection.js:50-51:

```javascript
var isPng = /image\/png/i.test(file.type);
resolve(c.toDataURL(isPng ? "image/png" : "image/jpeg", isPng ? undefined : 0.9));
```

PNG → saved as PNG (alpha intact); JPEG → 90% quality (alpha not applicable).

Identical implementation confirmed in preferences-modal.js:55-78, validating the pattern across the codebase.

## Defects to file
- None identified.

## Final result
- **2 items: 2 PASS / 0 FAIL / 0 PARTIAL / 0 UNVERIFIABLE**
