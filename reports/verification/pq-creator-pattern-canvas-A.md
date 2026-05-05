# P? Verification: creator-pattern-canvas A (13)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-EL-SCR-010-01-01 | PASS | creator/useCanvasInteraction.js:531-533,595-610 | Paint dragActionRef + applyBrush with editHistory undo entries. |
| VER-EL-SCR-010-01-02 | PASS | creator/useEditHistory.js:24-80 | undoEdit restores cells from changes array. |
| VER-EL-SCR-010-01-03 | UNVERIFIABLE | creator/useCanvasInteraction.js:176-195 | applyBrush has no explicit large-pattern batching; threshold behaviour unclear statically. |
| VER-EL-SCR-010-02-01 | PASS | creator/useCanvasInteraction.js:195 | Erase sets {id:"__empty__", rgb:[255,255,255]}; not removed. |
| VER-EL-SCR-010-03-01 | PASS | creator/useCanvasInteraction.js:406-428 | Flood fill BFS stops at id !== tid. |
| VER-EL-SCR-010-04-01 | PASS | creator/useCanvasInteraction.js:280-281 | Eyedrop empty-cell rejection toast. |
| VER-EL-SCR-010-05-01 | PASS | creator/useCanvasInteraction.js:514-520 | Modifier opMode: Shift+Alt intersect, Shift add, Alt subtract, else replace. |
| VER-EL-SCR-010-05-02 | FAIL | creator/useCanvasInteraction.js:660-688 | Long-press triggers context menu, not magic wand. |
| VER-EL-SCR-010-06-01 | PASS | creator/useCanvasInteraction.js:655,714 | Pan only when isPanTool() or no active tool; lasso blocks pan. |
| VER-EL-SCR-010-08-01 | PARTIAL | creator/useLassoSelect.js:1-12; creator/useMagicWand.js:66-70 | Lasso "magnetic" sub-mode; deltaE colour-snap coupling unclear in static path. |
| VER-EL-SCR-010-09-02 | PASS | creator/useCanvasInteraction.js:690-710,799-806 | Touch tap detection for backstitch via pendingTapRef. |
| VER-EL-SCR-010-11-01 | PASS | creator/useCanvasInteraction.js:655,714 | Pan disabled when tool active. |
| VER-EL-SCR-010-12-01 | PASS | creator/useCanvasInteraction.js:114-132,638-644 | Pinch zoom on 2 pointers; updatePinchGesture + RAF apply. |

## Defects to file

1. **VER-EL-SCR-010-05-02** — Long-press triggers context menu, not magic wand.
2. **VER-EL-SCR-010-08-01** — Magnetic lasso colour-threshold coupling unverifiable statically.
3. **VER-EL-SCR-010-01-03** — Paint performance gate for >100k stitches not present.

## Final result
- 13 items: 9 PASS / 1 FAIL / 1 PARTIAL / 2 UNVERIFIABLE
