# Competitor Analysis — Pattern Creator

This analysis focuses on **pattern creation** features — image-to-chart conversion, pattern editing, palette management, and export. The tracking competitor analysis in the sibling review covers tracking-specific competitors.

---

## 1. Stitch Fiddle (Web — stitchfiddle.com)

**Closest structural competitor** — web-based, handles both creation and tracking. Freemium model ($4.99/month premium).

### Pattern Creation Approach
Stitch Fiddle offers two creation modes:
- **Image-to-chart:** Upload photo → set dimensions + max colours → auto-generate
- **Blank grid:** Draw from scratch on a grid

### Specific UI Comparisons

| Feature | Stitch Fiddle | This App | Gap |
|---|---|---|---|
| **Image upload flow** | Upload → small settings panel (width, colours, palette) → Generate. Clean 3-step flow. | Upload → 7 collapsible sections visible → Generate. Settings overload for beginners. | SF's beginner flow is simpler. This app's settings are more powerful but overwhelming upfront. |
| **Canvas workspace** | Grid takes ~80% of screen. Thin toolbar top, mini palette left. | Grid takes ~55-65% (desktop) due to 280px sidebar + 172px chrome. | SF gives more canvas space. This app's sidebar carries more features but costs space. |
| **Colour editing** | Click palette colour → click cell. Very simple. No brush sizes, no fill tool. | Paint/Fill/Erase/Eyedropper with brush sizes 1-3. Magic wand selection, lasso. | This app is dramatically more capable. SF is finger-paint level; this app is Photoshop-lite. |
| **Backstitch** | Basic line drawing between grid points. | Full backstitch with continuous mode, erase tool, snapping. | Parity with advantage to this app (continuous mode). |
| **Palette control** | Simple colour picker + DMC lookup. No blends, no stash integration. | Max colours slider, blends, stash-constrained generation, orphan removal, dithering, palette swap. | This app is significantly more advanced. |
| **Preview** | Small thumbnail preview. No realistic rendering. | Chart + pixel + 4-level realistic rendering with thread textures. Comparison slider. | This app is in a different league. |
| **Export** | PDF (basic chart), image export. | PDF (3 chart modes, 3 cell sizes, cover sheet), PNG with A4 pages, JSON, direct tracker handoff. | This app's export is more complete. |
| **Mobile** | Desktop-focused. Works on tablet but cramped on phone. | Mobile drawer + responsive toolbar. Usable on phone. | This app has better mobile story (though imperfect). |

### Key Takeaway
Stitch Fiddle proves that a **simple, canvas-dominant interface** attracts users even with far fewer features. The initial impression of "just works" matters. This app should match SF's simplicity for the first-time flow while keeping its power features accessible to returning users.

### What to Borrow
- **Canvas dominance:** SF gives the grid 80%+ of screen space. Target similar ratios, especially on initial load.
- **Simple generation flow:** SF's "3 settings then generate" approach for beginners. Advanced settings should be opt-in, not default-visible.
- **Clean palette panel:** SF's small vertical palette strip (left of canvas) is less intrusive than a 280px sidebar.

### What Not to Copy
- **Limited editing tools:** SF has no selection system, no fill, no brush sizes. This app's editing depth is a core differentiator — don't regress.
- **No stitch type variety:** SF is cross-stitch only, no half/quarter/backstitch. This app's partial stitch support is essential.
- **Free-tier limitations:** SF watermarks free exports and limits grid size. This app's fully-free model is more generous.

---

## 2. MacStitch / WinStitch (Desktop — $75-$150)

**Professional-grade desktop pattern creators.** These are the "full Photoshop" of cross-stitch software.

### Pattern Creation Approach
MacStitch/WinStitch are primarily manual design tools:
- Import image → trace/auto-convert with extensive control
- Full manual design from scratch
- Import from other formats (.oxs, .pat, etc.)

### Specific UI Comparisons

| Feature | MacStitch/WinStitch | This App | Gap |
|---|---|---|---|
| **Workspace layout** | Multiple floating palettes, toolbars, panels. Dockable/undockable. Customisable. | Fixed layout: header + toolbar + sidebar + canvas. | MacStitch is more flexible for experts but overwhelming for everyone else. This app's fixed layout is appropriate for a web app. |
| **Image conversion** | Detailed wizard: colour reduction algorithm selection, multiple dithering methods, colour substitution rules, thread manufacturer selection (DMC, Anchor, etc.). | Single-page sidebar: max colours, dithering toggle, orphan removal, blends, cleanup. | MacStitch has finer grain control. This app covers 90% of use cases with less complexity. |
| **Thread support** | Multiple thread brands (DMC, Anchor, Weeks, Madeira, etc.). Custom threads. | DMC only (with stash-based substitution). | This app is DMC-focused. Multi-brand support would be a future expansion. |
| **Stitch types** | Full: cross, half, quarter, ¾, backstitch, French knot, lazy daisy, couching, long stitch, petit point. | Cross, half (/ and \), quarter, ¾, backstitch. | MacStitch has more stitch types. This app covers the most common 80%. |
| **Selection tools** | Rectangle, polygon, magic wand, freehand. With transform (move, rotate, flip, mirror). | Magic wand (tolerance, contiguous/global, operations panel), lasso (freehand/polygon/magnetic). No transform. | This app's selection tools are strong. Transform (move/rotate selection) is the key miss. |
| **Colour management** | Thread palette with blending, custom colours, conversion between thread brands, colour organiser. | DMC palette, blends (2-thread), stash integration for substitution. Palette swap with 14 presets. | MacStitch is more comprehensive. This app's palette swap is a creative feature MacStitch lacks. |
| **Canvas size** | Up to 999×999 stitches. | 10–300 stitches per dimension (UI slider limit). | MacStitch handles much larger patterns. Web canvas may hit performance limits at high sizes. |
| **Export** | .oxs (KG-Chart), .pat, PDF (print-ready with thread usage charts, legend, grid), image formats. | PDF (3 modes, cover sheet), PNG, JSON. Import from .oxs, .json, image, PDF. | Comparable PDF output. MacStitch's .pat format has wider compatibility. |

### Anti-Patterns to Avoid (same as tracker analysis)
- **Everything visible simultaneously:** MacStitch shows all palettes, tools, properties, layers at once. Web apps should not emulate this — progressive disclosure is essential.
- **Floating panels:** Web doesn't do floating windows well. Fixed sidebar + floating overlays (diagnostics, wand) is the right approach.
- **Professional density as default:** MacStitch's target user is a professional designer. This app serves both beginners and experts — the default must be approachable.

### What to Borrow
- **Selection transforms:** Move, rotate, flip selected regions — a significant editing capability gap in this app.
- **Thread usage chart in export:** MacStitch's PDF includes visual thread consumption charts. This app's cover sheet could be enhanced.
- **Customisable grid:** MacStitch shows 10×10 grid blocks optionally highlighted. This app has grid lines but could offer more grid customisation (5×5 vs 10×10, colour).

### What Not to Copy
- **Floating everything:** Fixed layout beats floating for web UX.
- **Extreme complexity upfront:** MacStitch's learning curve is weeks. This app should remain minutes-to-first-pattern.
- **Multi-brand thread management:** Future feature, not a UI reorganisation concern.

---

## 3. Pixel Stitch (Web — pixelstitch.net)

**Minimalist web-based converter.** Free, ad-supported. No account required.

### Pattern Creation Approach
Pixel Stitch is a pure converter — no editing:
1. Upload image
2. Set dimensions + max colours
3. Download PDF

### Specific UI Comparisons

| Feature | Pixel Stitch | This App | Gap |
|---|---|---|---|
| **Flow** | 3 steps: upload → configure → download. Single page, no tabs. | Multi-tab sidebar + toolbar + canvas + export tab. | PS is trivially simple. This app offers 100× more capability at 10× more complexity. |
| **Settings** | Width/height, max colours, background removal, grid style. That's all. | 20+ settings across 7 sidebar sections. | PS proves most users only need 4-5 settings for basic conversion. This app's advanced settings add value but should be progressive. |
| **Preview** | Static image — click "Preview" to see result. | Live canvas with zoom, pan, highlight, 4 preview modes, split view. | This app is vastly superior. |
| **Editing** | None. | Full editing suite. | Not comparable. |
| **Export** | PDF only. | PDF, PNG, JSON, tracker handoff. | This app wins. |

### Key Takeaway
Pixel Stitch's entire interface is a **single narrow column** with 5 controls. Users convert an image in under 30 seconds. For the "I just want a quick pattern" use case, Pixel Stitch's simplicity is unbeatable.

### What to Borrow
- **Vertical single-column for beginners:** For first-time users, present configuration as a linear flow (image → size → colours → generate) rather than a multi-section sidebar.
- **Instant preview:** PS shows a preview as soon as settings change, no "Regenerate" button needed. Live preview would be ideal for simple patterns.

---

## 4. Crochet Charts / Stitch Charts (Web)

**Chart-first design tools** where users draw on a grid from scratch (no image import). Common for crochet but cross-stitch versions exist.

### What They Do Well
- **Grid is everything:** Nearly 100% of screen space is the grid.
- **Symbol-first editing:** Users place symbols (stitch types) directly, not colours. Colour is secondary.
- **Ruler guides and snap:** Professional drafting tools: rulers, guides, snap-to-grid, symmetry.

### What to Borrow
- **Symmetry tools:** Mirror drawing (horizontal/vertical/both) would be valuable for scratch mode. Draw one quadrant, mirror to all four.
- **Stamp/pattern repeat:** Place a small motif and tile/repeat it across the grid.

### What Not to Copy
- **Symbol-first paradigm:** Cross-stitch is colour-first for most users. Keep colour as the primary editing dimension.

---

## 5. Cross-Stitch Pattern Creator Market Summary

| App | Platform | Price | Image→Pattern | Editing | Preview | Mobile | Export |
|---|---|---|---|---|---|---|---|
| **This app** | Web (PWA) | Free | ✅ Advanced | ✅ Full suite | ✅ 4 modes | ✅ Responsive | ✅ PDF/PNG/JSON |
| Stitch Fiddle | Web | Freemium | ✅ Basic | ⚠️ Minimal | ⚠️ Thumbnail | ⚠️ Desktop-focused | ✅ PDF/Image |
| Pixel Stitch | Web | Free (ads) | ✅ Basic | ❌ None | ⚠️ Static | ⚠️ Basic | ⚠️ PDF only |
| MacStitch | macOS | $75-150 | ✅ Professional | ✅ Professional | ⚠️ Print preview | ❌ Desktop only | ✅ Multi-format |
| WinStitch | Windows | $75-150 | ✅ Professional | ✅ Professional | ⚠️ Print preview | ❌ Desktop only | ✅ Multi-format |
| PCStitch | Windows | $50 | ✅ Advanced | ✅ Advanced | ⚠️ Print preview | ❌ Desktop only | ✅ .pat/PDF |

### This App's Unique Position
No other web-based tool offers this app's combination of:
1. **Image → pattern conversion** with advanced algorithms (k-means quantisation, Floyd-Steinberg dithering, orphan removal, stitch cleanup)
2. **Full editing suite** (paint, fill, selection, backstitch, partial stitches)
3. **Quality diagnostics** (confetti analysis, heatmap, readability)
4. **4-level realistic preview** (unique in the web space)
5. **Stash integration** (constrained generation, substitution analysis)
6. **Direct tracker handoff** (seamless creator→tracker pipeline)
7. **Free, no account required** (privacy-first, local-only)

The challenge is not feature breadth — it's **organising the features so the interface doesn't overwhelm**, especially on first contact.

---

## 6. Common Patterns Across Competitors (Creation-Specific)

### Pattern 1: Progressive Complexity
Every successful creation tool starts simple and layers on complexity:
- **Pixel Stitch:** 4 settings visible → generate. That's the whole app.
- **Stitch Fiddle:** 5 settings → generate → optional editing. Editing is a second phase.
- **MacStitch:** Wizard → workspace. The wizard is simple; the workspace is complex.

**Recommendation for this app:** Phase the sidebar into "Quick" (Image + Dimensions + Colours + Generate) and "Advanced" (all other sections). Default to Quick mode. A toggle or scroll reveals Advanced.

### Pattern 2: Canvas Dominance
All successful pattern editors give 70%+ of screen area to the canvas:
- Stitch Fiddle: ~80%
- MacStitch: ~65-75% (adjustable)
- Pixel Stitch: 100% (separate preview page)

**Current:** This app gives ~55-65% on desktop (after 280px sidebar + 172px chrome). Target: 70%+ by shrinking sidebar width and/or merging chrome layers.

### Pattern 3: Toolbar Relevance
Professional tools show only tools relevant to the current task:
- MacStitch: Toolbar changes when switching between design mode and trace mode
- Photoshop/Figma: Context-sensitive toolbars that update based on selection

**Current:** This app's ToolStrip shows all tools regardless of context (brush size when using wand, backstitch controls when not in backstitch mode). Some contextual hiding exists (brush size for non-paint tools) but could go further.

### Pattern 4: Settings as a Conversation, Not a Control Panel
Modern design tools present settings as part of a workflow, not a panel of knobs:
- Canva: Step-by-step wizard for new designs
- Figma: Properties panel changes based on selected object
- Notion: Slash commands reveal relevant options as needed

**Current:** This app's sidebar is a static control panel. All 7 sections are visible regardless of workflow stage. After generation, Dimensions/Palette/Stitch Cleanup/Background sections are "set and forget" — they only matter during re-generation. During editing, different controls matter (tools, colours, highlight modes).

---

*End of Competitor Analysis*
