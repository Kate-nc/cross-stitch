# Competitive Report 6: UX Flow Gaps

> **Purpose:** Detailed comparison of user flows — the step-by-step journeys
> through key tasks — against competitor implementations. Identifies where
> our flows add friction and where competitor flows have found more elegant paths.

---

## 1. Flow Analysis: Image-to-Pattern Conversion

### Our flow (5 steps):
```
1. Upload image
2. Crop → Palette → Size → Preview → Confirm  (5-step Import Wizard)
3. Generate pattern
4. Edit in canvas editor
5. Export PDF
```

### StitchMate flow:
```
1. Upload image
2. Adjust settings sidebar (real-time preview updates)
   - Colour count slider
   - FLOW Score updates live
   - ConfettiScope toggle
3. See result immediately in canvas
4. Edit if needed
5. Export (pay per export or use pass)
```

### StitchFiddle flow:
```
1. Upload image
2. Set colour count + fabric count (one panel)
3. Click Generate → instant preview
4. Edit in full-page canvas
5. Export PDF
```

**Gap analysis:**

| Flow step | Ours | StitchMate | StitchFiddle |
|---|---|---|---|
| Settings visible during preview | No — wizard steps separate | Yes — side-by-side | No |
| Quality feedback during generation | None | FLOW Score + ConfettiScope | None |
| Steps to reach editable pattern | 5 | 2 | 2 |
| Real-time preview update | No — must advance wizard | Yes | No |
| Confetti diagnostic | None (remove option exists) | Visual overlay | None |

**Key friction in our flow:**
- The 5-step Import Wizard separates settings from preview. A user must advance
  to "Preview" to see what their settings produce, then go back to change them.
  This is 2–3 round-trips per iteration.
- StitchMate's live-preview-with-sidebar is faster because you see the effect
  immediately.
- We do not show quality feedback at any point.

**Recommended change:** Collapse the 5-step wizard into a 2-panel view:
left = settings (colour count, size, dithering, orphan removal), right = live
preview. Add a quality indicator below the preview. This mirrors the pattern
StitchMate proved works.

---

## 2. Flow Analysis: Stitch Tracking

### Our flow:
```
1. Open pattern in Stitch Tracker
2. Tap/click to mark individual stitches done
3. Use spacebar to toggle Track/Navigate modes
4. Session logged automatically
5. View stats in stats page
```

### Pattern Keeper flow (Android):
```
1. Import PDF
2. Pan/zoom to working area
3. Tap stitch to mark done (single tap)
4. Thread list updates automatically (removes completed threads)
5. Long-press for notes
```

### Cross Stitch Paradise flow (Android):
```
1. Open XSD file
2. Navigate to current row
3. Tap to mark; row automatically scrolls with progress
4. View completion per colour
```

**Gap analysis:**

| Aspect | Ours | Pattern Keeper | Cross Stitch Paradise |
|---|---|---|---|
| Row navigation mode | None | None | Row highlight |
| Thread completion tracking | Visual only | ✓ Auto removes completed | ✓ Per-colour count |
| Parking method tracking | ✓ Parking markers | ✓ (sole feature per LordLibidan) | None |
| Session auto-logging | ✓ | None | None |
| Works offline | ✓ PWA | ✓ Native app | ✓ Native app |
| Mobile ergonomics | Adapted web | Native mobile | Native mobile |

**Key friction:**
- No row-level navigation. Users who stitch row-by-row have no "where am I in
  this row" navigation.
- The Track/Navigate toggle (spacebar) is non-obvious; there is no visible
  reminder in the tracker UI.
- Pattern Keeper shows a thread list that updates as colours are completed;
  our tracker does not show a live colour-completion list.

**Recommended changes:**
1. Add row mode toggle with row-highlight visual
2. Show live colour completion list in the sidebar
3. Surface the Track/Navigate toggle as a visible button with label

---

## 3. Flow Analysis: Thread Shopping (Stash to Purchase)

### Our current flow:
```
1. View stash in manager
2. Manually note what's missing for a pattern
3. Toggle "to buy" flag on specific threads
4. Export stash? (No — there is no shopping list export)
```

### Ravelry equivalent flow (yarn):
```
1. Open a queued project
2. Ravelry shows: "Owned: 3 skeins | Needed: 5 skeins | Gap: 2 skeins"
3. Click "Add to cart" on a yarn store directly from that view
4. Shopping list tab shows all gaps across all queued projects
```

### Thread Stash flow:
```
1. Browse thread list
2. Toggle "to buy" flag
3. View "shopping list" tab showing flagged threads
4. (Implicitly: cross-reference with what patterns need them)
```

**Gap analysis:**

| Step | Ours | Ravelry | Thread Stash |
|---|---|---|---|
| Shows gap between stash and pattern | No | ✓ | No (manual) |
| Shopping list export | No | Via Ravelry cart | No |
| Cross-project shopping aggregation | No | ✓ | No |

**Key friction:**
- A user who has a wishlist pattern cannot see "I need to buy X, Y, Z to start
  this pattern." They must open the pattern PDF, read the legend, and manually
  cross-reference with their stash.
- The stash manager's "to buy" flag is manual and disconnected from patterns.

**Recommended change:** When viewing a pattern in the project library, show a
"threads needed / owned / gap" table auto-populated from the pattern's legend
vs the user's stash. Add a one-click "Add gap to shopping list" action.

---

## 4. Flow Analysis: Pattern Export (PDF)

### Our flow:
```
1. Open Export tab in creator
2. Set PDF options (page size, margins, modes, cover page, etc.)
3. Click Export → worker generates PDF
4. Download
```

### StitchMate flow:
```
1. Click Export button
2. Page settings panel slides in (page size, border, etc.)
3. Preview updates in real time
4. Click Download → export + payment prompt if needed
```

### WinStitch flow (desktop):
```
1. File → Print / Export PDF
2. Multi-tab dialog (cover page, chart options, colour key, page layout)
3. Preview in PDF viewer panel
4. Export
```

**Gap analysis:**

| Aspect | Ours | StitchMate | WinStitch |
|---|---|---|---|
| Live PDF preview | No (worker render) | Yes (real-time) | Yes (PDF viewer embedded) |
| Setting discoverability | All options visible | Progressive disclosure | Tab-based dialog |
| Complexity | High (many options) | Moderate | High |

**Key friction:**
- Our export tab has many options but no live preview. Users must export and
  open the PDF to see the result, then adjust and repeat.
- The page-overlap setting, mini-legend, and backstitch chart options are
  powerful but undocumented in the UI itself.

**Recommended change:** Add a page-thumbnail preview in the export tab that
updates when major settings change (page count, layout mode). Does not need to
be pixel-perfect — just show the page layout schematically.

---

## 5. Flow Analysis: First-Time User Onboarding

### Our flow:
```
1. Land on home.html
2. See dashboard (project cards, stats overview, quick actions)
3. Click "New pattern" or "Open stitch tracker" or "Manage stash"
4. Per-page onboarding tour runs if first visit
```

### StitchMate flow:
```
1. Land on stitchmate.app
2. See hero with "upload your photo" CTA + quality comparison
3. Click "Try it with your photo" → editor opens immediately
4. No account required
5. Generate preview instantly
6. Pay only at export
```

### Stitch Fiddle flow:
```
1. Land on stitchfiddle.com
2. See "Create new chart" button prominently
3. Click → editor opens immediately
4. Free, no account
```

**Gap analysis:**

| Aspect | Ours | StitchMate | Stitch Fiddle |
|---|---|---|---|
| Time-to-first-pattern | ~3 minutes | ~30 seconds | ~30 seconds |
| First CTA clarity | Moderate (dashboard) | Single clear CTA | Single clear CTA |
| Value proposition visible | No (post-login) | Yes (hero section) | Implicit (free = clear) |
| Account required | No (PWA install prompt may appear) | No | No |

**Key friction:**
- Our landing page is a dashboard, which implies the user already has projects.
  A first-time visitor sees an empty dashboard, which is demotivating.
- StitchMate and Stitch Fiddle drop users directly into the creator — first
  value within 30 seconds.
- We do not communicate our key advantages (free, offline, integrated) at the
  entry point.

**Recommended changes:**
1. Add a first-run landing state with a prominent "Make your first pattern"
   CTA when the user has no projects
2. Show value proposition prominently: "Free, no account, unlimited exports"
3. Consider a starter kit or template gallery to reduce blank-canvas anxiety

---

## 6. Flow Analysis: Multi-Project Navigation

### Our flow:
```
1. Home page shows project cards
2. Click card → opens pattern in creator or tracker
3. Stats page shows cross-project analytics
4. Project library in manager shows wishlist / owned / in-progress / completed
```

### WinStitch flow:
```
1. Recent files in File menu
2. One project open at a time
3. No cross-project analytics
```

### Ravelry equivalent:
```
1. Project pages list with thumbnail + status + last updated
2. Queue for future projects
3. Finished projects tab
4. Cross-project yarn usage analytics
```

**Assessment:** Our multi-project flow is actually better than most competitors.
The home dashboard + stats suite is unique. The gap is the connection between
the project library (in manager) and the statistics suite (separate page).

**Recommended change:** Surface a link from the project library to the stats
page for the selected project.

---

## 7. Flow Friction Summary

| Flow | Friction level | Priority fix |
|---|---|---|
| Image-to-pattern (generation) | HIGH — wizard separates settings from preview | Collapse to 2-panel live view |
| Stitch tracker (row navigation) | MEDIUM — no row mode | Add row highlight mode |
| Shopping (stash gap analysis) | HIGH — manual process | Pattern → stash gap table |
| PDF export (no live preview) | MEDIUM — iterate-and-download loop | Page layout schematic preview |
| First-time user onboarding | HIGH — empty dashboard demotivates | First-run state with CTA |
| Multi-project navigation | LOW — already good | Minor: link library ↔ stats |
