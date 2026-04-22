# Colourway System: Test Plan & Common Error Prevention

---

## Test Fixtures

### Fixture A: "Simple Geometric" (30×30, 6 colours)

A small pattern with clear colour roles. Two hue families (warm reds/oranges and cool greens), one outline colour, one background colour. No confetti, clean clusters. Used for basic correctness testing.

| Slot | Colour | Role | Stitch Count |
|---|---|---|---|
| slot-1 | DMC 310 (Black) | outline | 840 |
| slot-2 | DMC 321 (Red) | primary-dark | 320 |
| slot-3 | DMC 740 (Tangerine) | primary-mid | 480 |
| slot-4 | DMC 699 (Green) | secondary-dark | 210 |
| slot-5 | DMC 702 (Kelly Green) | secondary-mid | 150 |
| slot-6 | DMC 3865 (Winter White) | background | 1,200 |

### Fixture B: "Portrait" (100×100, 25 colours)

A complex pattern with skin tones, hair, clothing, and background. Tests role auto-assignment with a realistic palette including difficult-to-classify colours (skin tones, mixed neutrals).

### Fixture C: "Monochrome" (50×50, 1 colour)

A single-colour pattern (DMC 310 Black on white). Edge case for role assignment, colourway creation, and palette tools.

### Fixture D: "Maximum Colours" (80×80, 60 colours)

A photo-converted pattern with many colours, heavy confetti, and multiple colours at similar stitch counts. Stress tests the mapping table UI, auto-assignment with many slots, and palette tool performance.

### Fixture E: "Pre-existing Pattern" (40×40, 10 colours)

A pattern created before the colourway system exists, stored with direct colour references in the stitch grid (no slot indirection). Used to test the migration path.

---

## Section 1: Data Model & Migration

### Test 1.1: Slot Indirection Migration

**Goal:** Verify that existing patterns are correctly migrated to the slot-based data model.

**Steps:**
1. Load Fixture E (pre-existing pattern with direct colour references).
2. Trigger the migration (this should happen automatically on first load after the colourway system is deployed, or on first access of the colourway manager).

**Verify:**
- The stitch grid now references slot IDs ("slot-1", "slot-2", etc.) instead of direct colour codes ("DMC-310", "DMC-321").
- A `colourSlots` array has been created with one slot per unique colour in the original pattern.
- A base colourway has been created with the name "Original" and `isBase: true`.
- The base colourway's `colourMap` correctly maps each slot ID to the original colour code.
- The pattern renders identically before and after migration — no visual change whatsoever.
- The migration is idempotent: running it again on an already-migrated pattern does nothing.

**Common errors to prevent:**
- **Duplicate slots for the same colour.** If the pattern has 500 stitches of DMC 310, there should be exactly one slot for DMC 310, not 500 slots. Count unique colours, not stitch references.
- **Stitch references pointing to non-existent slots.** After migration, every stitch grid cell should reference a slot ID that exists in `colourSlots`. Validate by iterating the entire grid and checking each reference.
- **Loss of stitch data during migration.** Compare the total stitch count before and after migration. They must be identical.

### Test 1.2: Colourway Storage Size

**Goal:** Verify that colourways are lightweight.

**Steps:**
1. Load Fixture D (60 colours).
2. Create 10 colourways, each with all 60 colours remapped.
3. Measure the pattern file size before and after.

**Verify:**
- The size increase is less than 50KB for 10 colourways (approximately 60 key-value pairs × 10 colourways × ~80 bytes per entry = ~48KB).
- The stitch grid is not duplicated — there is exactly one copy in the file regardless of colourway count.

**Common errors to prevent:**
- **Stitch grid duplication.** The most dangerous error. If creating a colourway deep-copies the stitch grid, file sizes will balloon (a 100×100 grid is 10,000 cells × bytes per cell). Assert that `pattern.stitchGrid` is a single object reference, not copied per colourway.
- **Colour map stored as full colour objects instead of references.** The colourway should store `{ "slot-1": "DMC-310" }` (a string reference), not `{ "slot-1": { code: "DMC-310", name: "Black", rgb: [26,26,26], ... } }` (a full colour object). The colour details are looked up from the thread database at render time.

### Test 1.3: Shared Stitch Grid Integrity

**Goal:** Verify that editing stitches affects all colourways.

**Steps:**
1. Load Fixture A (6 colours). Create a "Cool" colourway with all colours remapped.
2. In the editor (with the Original colourway active), add 5 new stitches of slot-2 at positions (0,0) through (4,0).
3. Switch to the Cool colourway.

**Verify:**
- The 5 new stitches are visible at (0,0)–(4,0) in the Cool colourway, rendered in the Cool variant's colour for slot-2.
- The stitch count for slot-2 has increased by 5 in both colourways.
- The total pattern stitch count is consistent across colourways.

4. Switch back to Original. Delete one of the new stitches at (2,0).
5. Switch to Cool.

**Verify:**
- The stitch at (2,0) is gone in Cool as well.
- The stitch count for slot-2 is now (original count + 4) in both colourways.

**Common errors to prevent:**
- **Stitch edits only applying to the active colourway.** This means the stitch grid was inadvertently copied. The edit function must write to the shared grid, not a colourway-specific copy.
- **Stitch count desync.** If the stitch count is cached per colourway (for the shopping list or legend), the cache must be invalidated on any stitch edit. Assert that `getStitchCount(slot, 'original') === getStitchCount(slot, 'cool')` after every edit.

---

## Section 2: Palette Roles

### Test 2.1: Auto-Assignment Accuracy

**Goal:** Verify the auto-assignment algorithm produces sensible role assignments.

**Steps:**
1. Load Fixture A (simple geometric, 6 colours). Open the colourway manager for the first time (triggering auto-assignment).

**Verify:**

| Slot | Expected Auto-Assignment | Reasoning |
|---|---|---|
| DMC 310 (Black) | outline | Very dark, low-to-mid stitch count |
| DMC 321 (Red) | primary-dark | High saturation, warm hue family, moderate count |
| DMC 740 (Tangerine) | primary-mid | Same hue family as 321, lighter, higher count |
| DMC 699 (Green) | secondary-dark | Different hue family, darker |
| DMC 702 (Kelly Green) | secondary-mid | Same hue family as 699, lighter |
| DMC 3865 (Winter White) | background | Very light, highest stitch count |

Accept the auto-assignment if at least 4 of 6 are correct (the algorithm is a heuristic, not exact).

2. Load Fixture B (portrait, 25 colours). Trigger auto-assignment.

**Verify:**
- Skin tone colours are grouped together (they should be in the same hue family by the algorithm's clustering).
- The colour with the most stitches and low saturation is assigned "background."
- Very dark colours with low stitch counts are assigned "outline" or "neutral-dark."
- No slot is left completely unclassifiable — every slot should have either an auto-assigned role or be placed in the "Unassigned" group.

3. Load Fixture C (monochrome, 1 colour). Trigger auto-assignment.

**Verify:**
- The single colour (DMC 310) is assigned a role (likely "outline" or "primary-dark" — either is acceptable for a single-colour pattern).
- The auto-assignment does not crash or produce an error on a 1-colour pattern.

**Common errors to prevent:**
- **Division by zero.** If a pattern has only 1 colour, the "group by hue similarity" step may divide by zero when calculating hue distances. Guard all clustering code against single-element inputs.
- **All colours assigned the same role.** If the hue clustering threshold is too wide (e.g. 180°), all colours may land in the same group. Verify that patterns with 3+ distinct hue families produce at least 2 role groups.
- **Crash on very similar colours.** Fixture D may have multiple colours within 5° of hue from each other. The clustering algorithm must handle near-identical colours without infinite loops or misclassification.

### Test 2.2: Manual Role Reassignment

**Steps:**
1. Load Fixture A. Auto-assign roles. Change slot-3 (DMC 740) from "primary-mid" to "accent" using the dropdown.
2. Create a "Cool" colourway.

**Verify:**
- DMC 740 is now grouped under "Accent" in the mapping table, not under "Primary."
- The role change persists after closing and reopening the colourway manager.
- The role change applies to all colourways (roles are defined once, not per colourway).

### Test 2.3: Custom Roles

**Steps:**
1. Load Fixture B (portrait). Create a custom role called "hair".
2. Drag two brown-toned slots into the "hair" role group.
3. Close and reopen the colourway manager.

**Verify:**
- The "hair" role appears in the mapping table with the two assigned slots.
- The custom role persists across sessions.
- The custom role appears in the role dropdown for all slots.

4. Delete the "hair" role.

**Verify:**
- The two slots that were in "hair" move to the "Unassigned" group.
- No data is lost — the slots still exist with their colour mappings intact.

---

## Section 3: Colourway CRUD Operations

### Test 3.1: Create Colourway

**Steps:**
1. Load Fixture A. Open colourway manager.
2. With "Original" active, tap "+ New colourway."
3. Name it "Warm".

**Verify:**
- The new colourway appears as a tab.
- Every slot's colour in the "Warm" colourway is identical to the Original (it starts as a copy).
- Every slot swatch in the variant column has the yellow "unchanged" indicator.
- The preview shows the Original's appearance (since all colours are the same).

### Test 3.2: Create Colourway from Non-Original Source

**Steps:**
1. Load Fixture A. Create and configure a "Cool" colourway (remap several colours).
2. With "Cool" active, tap "+ New colourway." Name it "Cool Variant".

**Verify:**
- The "Cool Variant" starts as a copy of "Cool" (not of Original).
- The colours in "Cool Variant" match those in "Cool."
- Unchanged indicators compare against Original (not against Cool) — so colours that were changed in Cool still show as unchanged relative to Original in Cool Variant (since they're the same as Cool, which differs from Original).

Wait — clarify the spec: should "unchanged" compare against the Original always, or against the source colourway? The brief says unchanged = same as Original. Verify this is correct and document it clearly. The rationale: "unchanged" means "the designer hasn't differentiated this from the base design" regardless of which colourway they copied from.

### Test 3.3: Delete Colourway

**Steps:**
1. Load Fixture A with 3 colourways (Original, Cool, Warm).
2. Delete "Cool."

**Verify:**
- The "Cool" tab disappears.
- The mapping table no longer shows a "Cool" column.
- If "Cool" was the active colourway, the active colourway switches to "Original."
- The stitch grid is unaffected.
- The "Warm" colourway is unaffected — its colours haven't changed.
- Undo (if supported) restores the "Cool" colourway with all its colours intact.

3. Try to delete "Original."

**Verify:**
- The delete is blocked. The Original colourway cannot be deleted. Show a clear message: "The original colourway cannot be deleted."

### Test 3.4: Rename Colourway

**Steps:**
1. Rename "Warm" to "Autumn."

**Verify:**
- The tab label updates.
- The preview label updates.
- The colourway's internal ID does not change (only the display name changes).
- Export produces a PDF with "Autumn" as the colourway name.

### Test 3.5: Maximum Colourways

**Steps:**
1. Create 20 colourways on Fixture A.

**Verify:**
- All 20 are listed and switchable.
- The tab bar scrolls horizontally if needed (it should not wrap onto multiple lines).
- Performance remains acceptable: switching between colourways still completes within 200ms.
- The pattern file size remains reasonable (< 100KB for 6 slots × 20 colourways).

---

## Section 4: Colour Mapping

### Test 4.1: Individual Colour Change

**Steps:**
1. Load Fixture A. Create "Cool" colourway.
2. Tap the variant swatch for slot-2 (originally DMC 321 Red).
3. Select DMC 932 (Lt Antique Blue) from the colour picker.

**Verify:**
- The swatch updates to blue.
- The code and name update to "DMC 932 — Lt Antique Blue."
- The yellow "unchanged" indicator disappears from this slot.
- The preview updates within 200ms to show blue where red was.
- Switching to Original shows the original red — the change only affects "Cool."
- The stitch count for this slot is unchanged (it's still the same number of stitches, just in a different colour).

### Test 4.2: Colour Change Does Not Affect Other Colourways

**Steps:**
1. Load Fixture A with "Cool" and "Warm" colourways.
2. Change slot-2 in "Cool" from DMC 321 to DMC 932.
3. Switch to "Warm."

**Verify:**
- Slot-2 in "Warm" is still DMC 321 (unchanged from Original, or whatever it was set to in Warm).
- The change in Cool did not propagate to Warm.

### Test 4.3: Setting a Variant Colour Back to Original

**Steps:**
1. In "Cool," change slot-2 to DMC 932.
2. Then change slot-2 back to DMC 321 (the original colour).

**Verify:**
- The yellow "unchanged" indicator reappears on this slot.
- The system treats this correctly — it's functionally equivalent to an unchanged slot, even though the designer manually set it.

---

## Section 5: Palette Tools

### Test 5.1: Hue Shift — Full Range

**Steps:**
1. Load Fixture A. Create "Shifted" colourway. Apply hue shift at +180°.

**Verify:**
- Every colour has changed (no colour should remain identical to the original at +180°, except for achromatic colours like pure black, white, or grey).
- DMC 310 (Black, saturation ≈ 0) may remain unchanged or nearly unchanged — this is correct behaviour. Pure achromatic colours have no hue to shift.
- DMC 3865 (Winter White, very low saturation) may shift minimally — correct.
- DMC 321 (Red, high saturation) should shift to a cyan/teal family.
- Every shifted colour maps to a real thread code (not a raw RGB value or a placeholder like "DMC ~180"). Verify that the existing colour-matching code found a valid match for each shifted colour.

2. Apply hue shift at 0°.

**Verify:**
- All colours return to their original values. The shift is relative to the Original, not cumulative.

3. Apply hue shift at +360°.

**Verify:**
- All colours are identical to 0° (a full rotation returns to the start).

### Test 5.2: Hue Shift — Thread Matching Quality

**Steps:**
1. Load Fixture A. Create "Shifted." Apply hue shift at +90°.
2. For each slot, note the matched thread code.
3. Look up each matched thread's RGB value in the thread database.
4. Calculate the perceptual colour distance (CIEDE2000 or the app's existing metric) between the shifted RGB and the matched thread's RGB.

**Verify:**
- Every matched thread has a perceptual distance of less than 15 from the target shifted colour (on a 0–100 CIEDE2000 scale). If any match has a distance > 15, the match is poor and the colour-matching code may have a bug.
- No two slots map to the same thread code (unless the shifted colours genuinely converge — this is possible but rare at +90°).

**Common errors to prevent:**
- **Matching against the wrong brand.** If the pattern uses DMC but the matching code searches the Anchor database, all matches will be wrong. Verify the matching uses the pattern's configured brand.
- **Case sensitivity in thread code lookup.** "dmc-310" vs "DMC-310" — ensure the lookup is case-insensitive.
- **Hue shift producing out-of-range HSL values.** Hue should wrap at 360°, not clamp. Saturation and lightness should remain unchanged. If the shift accidentally modifies saturation or lightness, colours will converge toward grey.

### Test 5.3: Desaturate

**Steps:**
1. Load Fixture A. Create "Muted." Apply desaturate at 50%.

**Verify:**
- All saturated colours (Red, Tangerine, Green, Kelly Green) are noticeably more muted.
- Black (DMC 310) is unchanged (saturation is already ~0).
- Winter White (DMC 3865) is unchanged or nearly so.
- The matched thread codes are valid real threads.

2. Apply desaturate at 100%.

**Verify:**
- All colours map to greyscale or near-greyscale threads.
- The lightness ordering is preserved: the colour that was darkest (Black) is still the darkest match, and the colour that was lightest (Winter White) is still the lightest.

3. Apply desaturate at 0%.

**Verify:**
- All colours return to their original values (no desaturation applied).

### Test 5.4: Monochrome

**Steps:**
1. Load Fixture A. Create "Blue Mono." Apply monochrome with hue = 220° (blue).

**Verify:**
- Every colour is now in the blue family.
- The lightness ordering is preserved: Black maps to a very dark blue (e.g. DMC 939), Red maps to a medium-dark blue (e.g. DMC 336), White maps to a very light blue (e.g. DMC 3753).
- No two slots map to the same thread unless the pattern has two colours with identical lightness values.

### Test 5.5: Palette Tool on Monochrome Pattern

**Steps:**
1. Load Fixture C (1 colour, DMC 310 Black). Create a "Shifted" colourway. Apply hue shift at +90°.

**Verify:**
- DMC 310 (Black, saturation ≈ 0) does not change (or changes minimally). The tool does not crash on a single achromatic colour.
- The mapping table shows 1 slot, correctly displayed.
- The preview renders correctly with the (unchanged) colour.

### Test 5.6: Palette Tool Real-Time Performance

**Steps:**
1. Load Fixture D (60 colours). Create "Shifted." Open the hue shift slider.
2. Drag the slider continuously from -180° to +180° over 3 seconds.

**Verify:**
- The mapping table updates at each slider step (every 5° = 72 steps) without visible lag. Each update should complete in < 100ms.
- The preview updates at each step (or debounced to every 200ms). No stale preview frames should be visible for more than 300ms.
- No "flicker" where some slots show new colours and others show old colours. The mapping table must update atomically — all slots change in the same render frame.
- No memory leak: after sliding back and forth 10 times, memory usage has not grown significantly (< 10% increase). Check that intermediate thread-match results are garbage-collected.

---

## Section 6: Preview Integration

### Test 6.1: Preview Tile Cache Invalidation

**Steps:**
1. Load Fixture A. Open realistic preview (Level 2). Note the colours.
2. Open colourway manager. Create "Cool" and remap slot-2 from Red to Blue.
3. Close the colourway manager. Switch the active colourway to "Cool."

**Verify:**
- The preview updates to show blue where red was.
- The tile cache has been regenerated — check that the tiles for the new blue colour exist and the old red tiles are no longer being used.
- The fabric background, grid overlay, and all other preview features are unaffected.

4. Switch back to Original.

**Verify:**
- The preview returns to showing red. The Original tiles are either re-generated or restored from a cache.

### Test 6.2: Preview Consistency Across Levels

**Steps:**
1. Load Fixture A with "Cool" colourway active.
2. View in WYSIWYG preview.
3. Switch to Level 1 preview.
4. Switch to Level 2 preview.

**Verify:**
- All three preview levels show the Cool colourway's colours, not the Original's.
- The colours are consistent across levels (the same thread RGB value is used regardless of rendering level).

### Test 6.3: Preview Performance on Colourway Switch

**Steps:**
1. Load Fixture B (100×100, 25 colours) at Level 2 preview.
2. Measure the time to switch between Original and Cool colourways (using `performance.now()`).

**Verify:**
- Switch time < 200ms (as specified in the brief).
- No visual glitch during the switch (no frame where half the pattern shows old colours and half shows new).

---

## Section 7: Shopping List Integration

### Test 7.1: Shopping List Per Colourway

**Steps:**
1. Load Fixture A. Create "Cool" with slot-2 remapped from DMC 321 to DMC 932.
2. Open the shopping list with "Original" active.
3. Note the thread list.
4. Switch to "Cool" colourway.
5. Open the shopping list again.

**Verify:**
- The Original shopping list includes DMC 321 and does not include DMC 932.
- The Cool shopping list includes DMC 932 and does not include DMC 321.
- The stitch count for slot-2 is identical in both lists (the number of stitches hasn't changed, only the colour).
- The skein count may differ slightly if DMC 321 and DMC 932 have different skein lengths (they don't in this case — both are standard DMC 8m skeins — but the test confirms the calculation uses the correct skein length for the active colourway's thread).
- The total skein count and cost estimate update to reflect the active colourway.

### Test 7.2: Stash Cross-Reference Per Colourway

**Steps:**
1. Add DMC 321 (3 skeins) to the stash inventory.
2. View the shopping list for Original.
3. View the shopping list for Cool.

**Verify:**
- Original: DMC 321 shows "In stash (3 owned)."
- Cool: DMC 932 shows "Need X skeins (not in stash)" — because the stash has DMC 321, not DMC 932.
- The summary ("You own X of Y colours") differs between colourways.

---

## Section 8: Export Integration

### Test 8.1: Single Colourway PDF Export

**Steps:**
1. Load Fixture A with "Cool" colourway active.
2. Export as PDF.

**Verify:**
- The cover page preview image shows the Cool palette.
- The thread legend lists the Cool colours (DMC 932, not DMC 321 for slot-2).
- The chart cells are coloured with the Cool palette (in the colour-with-symbols mode).
- The symbols are identical to what the Original export would produce — only the colours in the legend and colour chart differ.

### Test 8.2: All Colourways Export

**Steps:**
1. Load Fixture A with Original, Cool, and Warm colourways.
2. Export "All colourways as separate PDFs."

**Verify:**
- Three separate PDF files are generated.
- Each PDF has the correct colourway name on the cover page.
- Each PDF has the correct thread legend for its colourway.
- Each PDF has identical symbol assignments (the symbols don't change between colourways).
- Each PDF has identical page counts and pagination (the stitch grid is the same).

### Test 8.3: Comparison Image Export

**Steps:**
1. Export "Comparison image" for all 3 colourways.

**Verify:**
- A single PNG is generated showing 3 preview thumbnails side by side, each labelled with the colourway name.
- The thumbnails are rendered in the correct palettes.
- The image dimensions are suitable for Etsy listings (at least 1200px wide).

---

## Section 9: New Colour Added After Colourway Creation

### Test 9.1: Add Colour to Base Pattern

**Steps:**
1. Load Fixture A with a "Cool" colourway configured.
2. In the editor (Original active), add a new colour (DMC 550, V Dk Violet) and paint 10 stitches with it.

**Verify:**
- A new slot (slot-7) is created in `colourSlots`.
- The base colourway maps slot-7 to DMC 550.
- The "Cool" colourway also receives slot-7, mapped to DMC 550 (same as Original — it defaults to the base colour since the designer hasn't chosen a Cool equivalent yet).
- The colourway manager shows slot-7 with the yellow "unchanged" indicator in the Cool column.
- The preview in Cool shows DMC 550 for the new stitches (since it's unchanged).
- The shopping list for Cool includes DMC 550.

### Test 9.2: Remove Colour from Base Pattern

**Steps:**
1. Load Fixture A with "Cool" colourway. slot-4 (DMC 699, Green) has 210 stitches.
2. In the editor, delete all stitches that use slot-4 (select all of that colour and delete).

**Verify:**
- slot-4 is removed from `colourSlots`.
- slot-4 is removed from all colourways' colour maps.
- The colourway manager no longer shows slot-4.
- The shopping list no longer includes the colours mapped to slot-4 in any colourway.
- No orphaned references: searching the stitch grid for "slot-4" returns zero results.

**Common error to prevent:**
- **Slot removed from base but not from variant colourways.** The variant's colour map would contain an entry for a slot that no longer exists, potentially causing crashes or "undefined" in the legend. On any slot deletion, iterate all colourways and remove the slot's entry.

---

## Section 10: Edge Cases and Error States

### Test 10.1: Two Slots Mapped to the Same Thread in a Variant

**Steps:**
1. Load Fixture A. Create "Mono." Set both slot-2 (originally Red) and slot-5 (originally Kelly Green) to DMC 932 (Lt Antique Blue).

**Verify:**
- This is allowed. The two slots now produce identical colours in the Mono colourway.
- The legend shows DMC 932 twice (once per slot, with different symbols and different stitch counts).
- The shopping list combines the stitch counts for both slots when calculating the total skein count for DMC 932.
- The chart renders correctly — the two slots have different symbols even though they're the same colour, so the chart is still readable.

### Test 10.2: Mixed Thread Brands in a Variant

**Steps:**
1. Load Fixture A (DMC palette). Create "Mixed." Set slot-2 to Anchor 47 (instead of a DMC colour).

**Verify:**
- This is allowed. The colourway can mix brands.
- The legend shows "Anchor 47" for slot-2 and "DMC XXX" for all other slots.
- The shopping list separates DMC and Anchor threads and correctly uses the Anchor skein length for slot-2.
- No crash or error from having mixed brands in the same colourway.

### Test 10.3: Very Long Colourway Name

**Steps:**
1. Create a colourway named "My Beautiful Autumn-Inspired Colourway for the Living Room Project 2026"

**Verify:**
- The name is accepted.
- The tab label truncates gracefully (ellipsis or overflow hidden) without breaking the tab bar layout.
- The full name is shown in a tooltip on hover (desktop) or on long-press (mobile).
- The name renders correctly on the PDF cover page (wrapping if needed).

### Test 10.4: Special Characters in Colourway Name

**Steps:**
1. Create colourways named: "Cool/Blue", "Warm & Gold", "Noël", "日本語テスト"

**Verify:**
- All names are accepted and displayed correctly.
- Names with special characters export correctly in PDF (correct Unicode rendering).
- Names do not break JSON serialisation of the pattern file.

### Test 10.5: Concurrent Editing Scenario

**Steps:**
1. Open the colourway manager with "Cool" active.
2. In a separate window/tab (if the app supports it), or simulate by editing the stitch data directly: add 20 new stitches to the pattern.
3. Return to the colourway manager.

**Verify:**
- The stitch counts in the mapping table update to reflect the new stitches.
- If a new slot was created by the external edit, it appears in the mapping table.
- The colourway manager does not crash or show stale data.

### Test 10.6: Undo/Redo with Colourways

**Steps:**
1. Load Fixture A. Create "Cool" and remap 3 colours.
2. Undo the last colour remap.

**Verify:**
- The third colour reverts to its previous value (either the Original colour or the value before the last change).
- The preview updates.

3. Undo the colourway creation itself.

**Verify:**
- If the undo system supports this granularity, "Cool" is removed and the active colourway reverts to "Original." If the undo system treats colourway creation as a non-undoable action, document this clearly.

### Test 10.7: Pattern with Zero Stitches

**Steps:**
1. Create a new empty pattern (no stitches, just fabric).
2. Open the colourway manager.

**Verify:**
- The manager opens with an empty mapping table.
- No roles are shown (there are no colours to assign roles to).
- The preview shows empty fabric.
- Creating a colourway produces an empty colour map.
- No crashes or errors.

---

## Section 11: Performance Benchmarks

Run these on a mid-range device (e.g. 2022 iPad, mid-range Android phone, 2020 MacBook Air) to establish realistic baselines.

| Test | Pattern | Operation | Target |
|---|---|---|---|
| Colourway switch (editor) | 100×100, 25 colours | Switch active colourway | < 100ms |
| Colourway switch (preview L2) | 100×100, 25 colours | Switch + preview re-render | < 200ms |
| Colourway switch (preview L2) | 500×500, 40 colours | Switch + preview re-render | < 500ms |
| Hue shift slider step | 60 colours | One slider increment + table update | < 100ms |
| Hue shift slider step | 60 colours | One slider increment + table + preview | < 300ms |
| Create colourway | 60 colours | Create + populate mapping | < 50ms |
| Delete colourway | 60 colours | Delete + UI update | < 50ms |
| Auto-assign roles | 25 colours | Clustering + assignment | < 200ms |
| Auto-assign roles | 60 colours | Clustering + assignment | < 500ms |
| Migration (first load) | 100×100, 25 colours | Create slots + remap grid | < 1 second |
| Migration (first load) | 500×500, 40 colours | Create slots + remap grid | < 3 seconds |
