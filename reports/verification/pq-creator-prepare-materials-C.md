# P? Verification: creator-prepare-materials C (14)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-EL-SCR-017-03-04-P0 | PASS | creator/ShoppingListModal.js:207-209 | "Need to buy" / "Already in stash" sections via sectionLabel. |
| VER-EL-SCR-017-05-P3 | PASS | creator/ShoppingListModal.js:210 | Empty-state copy on rows.length === 0. |
| VER-EL-SCR-017-06-07-P2 | PASS | creator/ShoppingListModal.js:234 | Footer flexWrap:wrap; stacks on narrow. |
| VER-EL-SCR-017-06-07-P4 | PASS | toast.js:15 | Toast queue with DEFAULT_MAX_VISIBLE=3. |
| VER-EL-SCR-017-06-P1 | PASS | creator/ShoppingListModal.js:83; creator/PrepareTab.js:37 | Both use stitchesToSkeins for needed counts. |
| VER-EL-SCR-017-07-P1 | PASS | creator/ShoppingListModal.js:182 | Push to Stash uses missing>0 ? missing : needed; brand-prefixed key. |
| VER-EL-SCR-018a-05-06-07-P2 | PARTIAL | styles.css:4545,4624 | .iw-btn 40px desktop; 48px <480px; iPad portrait (768px) not covered. |
| VER-EL-SCR-018a-06-P1 | PASS | creator/ImportWizard.js:164 | aria-pressed on Mirror horizontally. |
| VER-EL-SCR-018b-04-P1 | PASS | creator/useCreatorState.js:75 | DMC-only filter enforced. |
| VER-EL-SCR-018b-04-P4 | UNVERIFIABLE | creator/useCreatorState.js:68-95 | Empty stash returns null gracefully; UX message live test required. |
| VER-EL-SCR-018b-06-P2 | UNVERIFIABLE | styles.css:143 | accent-color set; track thickness depends on browser default. |
| VER-EL-SCR-018c-03-04-P1 | PASS | creator/ImportWizard.js:244-245 | min/max 10/300; bound enforcement via Math.max/min. |
| VER-EL-SCR-018c-03-04-P2 | UNVERIFIABLE | creator/ImportWizard.js:244-245 | Spinner sizing depends on browser. |
| VER-EL-SCR-018c-05-P1 | PASS | creator/ImportWizard.js:228-237 | Lock-aspect logic for sz.lock===true. |

## Defects to file

1. **VER-EL-SCR-018a-05-06-07-P2** — .iw-btn touch target <44px on desktop and uncovered for tablet (600-900px).

## Final result
- 14 items: 8 PASS / 0 FAIL / 2 PARTIAL / 4 UNVERIFIABLE
