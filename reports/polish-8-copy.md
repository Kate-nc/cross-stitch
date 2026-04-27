# Polish Pass 8 — Copy, Labelling & Microcopy

**Audit date:** 2026-04-27  
**Headline:** **3 emoji violations** (1 in [embroidery.js](embroidery.js) `✕` glyph, 2 in [embroidery.js](embroidery.js) recommendations data, 1 `⟺` in [creator-main.js](creator-main.js)), **~15 American spellings** (mostly inside CSS `text-align: center` which is technically the CSS keyword and acceptable), **6 search inputs missing `aria-label`**, **4 vague `confirm()` dialogs** that don't name the object/consequence.

## Terminology inventory

| Concept | Variant A | Count | Variant B | Count | Recommendation |
|---|---|---|---|---|---|
| colour | "colour" | 60+ | "color" | 15 | **colour** (British) |
| pattern / project | "pattern" | 120+ | "project" | 90+ | both are correct per [TERMINOLOGY.md](TERMINOLOGY.md) |
| thread / floss | "thread" | 200+ | "floss" | 3 | **thread** |
| stitch / cell | "stitch" | 150+ | "cell" | 2 | **stitch** |
| centre / center | "centre" | 8 | "center" | 22 | **centre** (in user copy; CSS keyword stays) |
| delete / remove | "delete" | 12 | "remove" | 18 | use **remove** for reversible, **delete** for permanent |

## 1. Emoji violations (HOUSE RULE)

| File | Line | Glyph | Replacement |
|---|---|---|---|
| [embroidery.js](embroidery.js#L1445) | 1445 | `✕` | `Icons.x()` |
| [embroidery.js](embroidery.js#L972) | ~972 | `🎨`, `🧭` (in `recs.push({icon:..., msg:...})`) | replace with `Icons.*` keys or strip from data |
| [creator-main.js](creator-main.js#L184) | 184 | `⟺` | `Icons.arrowsHorizontal` (add to [icons.js](icons.js) if missing) |

## 2. American spellings worth fixing

- [coaching.js](coaching.js#L96) and [creator-main.js](creator-main.js#L979) already use British "centre" — good.
- Most `textAlign:"center"` instances are CSS keywords — leave as-is.
- Real concerns: any user-facing string containing "color" / "favorite" / "organize" — review with grep `\b(color|favorite|favourite|organize|organise|behavior|behaviour|catalog|catalogue)\b` against JSX strings only.

## 3. Vague confirm dialogs

| File | Line | Current | Suggested |
|---|---|---|---|
| [creator/useProjectIO.js](creator/useProjectIO.js#L478) | 478 | `alert("This pattern has tracking progress. Editing the pattern here will reset your stitching progress. Continue with caution.")` | replace with a modal whose buttons read "Discard progress and edit" / "Cancel" |
| [creator/bundle.js](creator/bundle.js#L13046) | 13046 | `confirm("Regenerating will replace your current edits. Continue?")` | "Discard edits and regenerate pattern? This cannot be undone." |
| [creator/ExportTab.js](creator/ExportTab.js#L344) | 344 | `confirm("Bundle is roughly N MB — continue with export?")` | "Export N MB bundle?" with "Export" / "Cancel" buttons |
| [creator/BulkAddModal.js](creator/BulkAddModal.js#L170) | 170 | `'Failed to save: ' + e.message` | `'Failed to add threads to stash: ' + e.message` |

## 4. Inputs without `aria-label` or `<label>`

| File | Line | Field |
|---|---|---|
| [manager-app.js](manager-app.js#L753) | 753 | Thread search |
| [manager-app.js](manager-app.js#L1086) | 1086 | Pattern search |
| [manager-app.js](manager-app.js#L1635) | 1635 | Pattern name |
| [manager-app.js](manager-app.js#L1639) | 1639 | Designer/shop |
| [manager-app.js](manager-app.js#L1652) | 1652 | Fabric description |
| [manager-app.js](manager-app.js#L1663) | 1663 | Add-tag input |

Every input has a placeholder but no semantic label. Add `aria-label` mirroring the placeholder.

## 5. Generic / unclear button labels

- Multiple "Cancel" buttons that don't say what they cancel ([creator/ConvertPaletteModal.js](creator/ConvertPaletteModal.js#L295), [creator/BulkAddModal.js](creator/BulkAddModal.js#L283), [creator/ImportWizard.js](creator/ImportWizard.js#L377)). Use specific verbs: "Discard changes" / "Cancel import".
- Casing is mixed (Title Case vs Sentence case) across modal headers and buttons. Workshop convention is Sentence case for verbs; standardise.

## 6. Jargon needing inline explanation

These appear in UI without tooltips, glossary links, or onboarding callouts:

- backstitch
- half-stitch / quarter-stitch
- confetti
- fabric count (14ct, 18ct…)
- parking markers
- French knot (mentioned in some help copy)

Recommendation: add `title` attributes (or better: an `aria-describedby` pointing into a glossary section in [help-drawer.js](help-drawer.js)) on the labels where these terms first appear in the Creator and Tracker UIs.

## 7. Toast usage — clean ✓

All `Toast.show()` call sites pass an options object `{message, type, duration}`. The known footgun (raw-string call → empty toast) is not present.

## 8. Missing `aria-label` on icon-only buttons

Spot-checked findings:

- [creator/ActionBar.js](creator/ActionBar.js#L250) — `Icons.archive` button, no label.
- [creator/ExportTab.js](creator/ExportTab.js#L543) — `Icons.archive` button, no label.
- Many `creator/ContextMenu.js` magnify items rely on adjacent text.

Recommendation: every `<button>` whose only child is an `Icons.*()` call must have `aria-label` (or a visible text node sibling).

## Priority

**High:** emoji removal (3 sites), `aria-label` on 6 search inputs, vague confirm replacements (4).  
**Medium:** jargon tooltips, casing standardisation, generic "Cancel" → specific verbs.  
**Low:** terminology cleanup (delete/remove split), British/American spelling sweep beyond CSS.
