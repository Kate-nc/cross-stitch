# Stage 3: one look from Convert to Edit

Screenshots of the Pattern Creator before and after Stage 3, from the logo
fixture (`tests/fixtures/logo.png`) just after Generate, in Chromium. `1440`
is a 1440 × 900 window with a mouse (the tool rail on, the default); `pixel5`
is a Pixel 5. Each comes in `light` and `dark`.

| File | What it shows |
|---|---|
| `<size>-<theme>-tab-palette-before/after.png` | Edit's Palette tab: In this pattern, Add colour and Recolour the chart |
| `<size>-<theme>-tab-view-before/after.png` | Edit's View tab: Chart view, Your picture over the chart, Chart, flat or realistic, and Side by side (Chart and stitched) |
| `<size>-<theme>-tab-project-before/after.png` | Edit's Project tab: Project info and Fabric as sections, no longer bordered cards |
| `pixel5-<theme>-tab-tools-before/after.png` | The phone's Tools tab, on the same sections and buttons |
| `1440-<theme>-convert-before/after.png` | Convert's Size step: its headings are sentence case too, as the shared class changed |
| `1440-<theme>-recolour-before/after.png` | Recolour the chart's presets: in dark mode the cards were white before |
| `<size>-<theme>-stitched-view.png` | The new Chart / Stitched switch with Stitched on, and its note |
| `1440-<theme>-progress-note.png` | A reopened project with marked stitches: "6% stitched. Changing a marked stitch clears its mark." with the tool's reach |
| `1440-<theme>-replace-colour-reach.png` | Replace colour saying how far it reaches, and how many marks clear, before it runs |

## What changed, by task

1. **Shared classes (D1).** Inline style objects: `creator/Sidebar.js` 179 → 7,
   `palette-swap.js` 121 → 4, `creator/ToolStrip.js` 66 → 6,
   `creator/PatternTab.js` 22 → 4. What is left is data (swatch colours, a
   tooltip's position, the chart's size and cursor).
   `tests/inlineStyleBudget.test.js` holds each file to that.
2. **One section style (D3).** Every side-panel section in Edit is built by
   Convert's own `sec()` helper (`window.CreatorPanelParts`). The shared header
   class is now sentence case, so Convert's headers change with Edit's.
3. **Chart / Stitched.** A switch in the chart's corner, and the S key, show
   Convert's stitched view over the chart at the same zoom and place, with
   painting off.
4. **Comparisons say what they compare (X6).** Picture and chart (Convert),
   Chart and stitched (Edit), Before and after (Recolour); `TERMINOLOGY.md`
   "Views and comparisons" and a terminology lint rule.
5. **Progress note.** "23% stitched. Changing a marked stitch clears its mark."
   with the tool's reach; Replace colour, Recolour and Regenerate state theirs
   before they run.
6. **Comfortable targets (D7).** Every visible button in Edit is at least
   32 px tall at 1440 × 900 (`tests/e2e/creator-target-sizes.spec.js`); the
   phone's tool rail and tab row are at least 44 px. "Your pattern is ready"
   keeps 32 px buttons on a phone, where 44 px made the card cover more of
   the chart.

## For review

- Convert's section headers and the size and fabric labels changed from small
  capitals to sentence case. The brief calls sentence case Convert's pattern,
  but the shared class drew Convert's headers in capitals, so meeting "the
  same class as Convert's" and "no uppercase-tracked headers" meant changing
  Convert too.
- The palette's thread list no longer folds away (Convert's sections don't).
- The phone's Preview tab is folded into View, as it already was with the
  tool rail, so no tab is called only "Preview".
- Edit's Flat and Realistic views (Preview's old Pixel and Realistic) stay;
  Stitched is Convert's renderer, Realistic is Edit's textured one.
