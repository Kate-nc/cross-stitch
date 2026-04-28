# Proposal A: "Keeper" — Pattern Keeper Minimalism

## Design Philosophy
Strip the tracker down to its absolute core: **canvas, colour legend, progress**. Every feature that isn't "mark stitches" or "see where to stitch next" hides behind a single menu or bottom sheet. Mirrors Pattern Keeper's three-mode paradigm (Move / Search / Mark) and relentless prioritisation of canvas space.

---

## What Stays On Screen

### Mobile Layout (portrait)
```
┌──────────────────────────────┐
│  🧵 Cross Stitch    Track ▾  │  ← 44px thin header (logo + page dropdown)
├──────────────────────────────┤
│  ◀ DMC 310 Black ▶   23.4%  │  ← 40px colour bar (cycle + progress)
├──────────────────────────────┤
│                              │
│                              │
│        ╔═══════════╗         │
│        ║  CANVAS   ║         │  ← Fills remaining space (~600px on 10" tablet)
│        ║           ║         │
│        ╚═══════════╝         │
│                              │
│                              │
├──────────────────────────────┤
│  ✋ Pan    ✏ Mark    ✓ 1,230 │  ← 52px bottom bar (mode + session count)
└──────────────────────────────┘
```

**Total chrome: ~136px** (vs current ~226px). Canvas gains ~90px.

### Desktop Layout
```
┌──────────────────────────────────────────────────────────┐
│  🧵 Cross Stitch Studio   Create  Track  Stash  Stats   │  Header
│  My Pattern · 80×80 · 23.4%                    ⋯ File   │
├────────────────────────────┬─────────────────────────────┤
│                            │  ◀ DMC 310 Black ▶          │  Colour legend
│                            │  ■ 310 Black      12/45 ■  │  (scrollable)
│       CANVAS               │  ■ 321 Red        30/82 ●  │
│       (fills all)          │  ■ 550 Violet      0/23    │
│                            │  ■ 3799 Dk Grey    8/15 ●  │
│                            │  ...                        │
│                            ├─────────────────────────────┤
│                            │  Session: 15m · 42 st       │
│                            │  Speed: 2.8 st/min          │
├────────────────────────────┴─────────────────────────────┤
│  ✋ Pan  ✏ Mark  ⊞ Range       Zoom ─●── 120%  Fit      │  Bottom toolbar
└──────────────────────────────────────────────────────────┘
```

---

## Where Everything Moves

| Current Location | Feature | New Location |
|---|---|---|
| Header | Page tabs | **Kept** (but slimmer — dropdown on mobile) |
| ContextBar | Name, dimensions, progress | **Merged into header** + colour bar progress |
| Pill toolbar — Cross | Mark mode | **Bottom bar** — Mark button |
| Pill toolbar — Half ▾ | Half-stitch tools | **Bottom bar** — long-press Mark for half menu |
| Pill toolbar — Nav | Navigate/pan mode | **Bottom bar** — Pan button |
| Pill toolbar — Range | Rectangle mark | **Bottom bar** — appears when Mark is active |
| Pill toolbar — Sym/Col/HL | View modes | **Colour bar** — tap colour to highlight; menu for sym/col toggle |
| Pill toolbar — ◀ ▶ | Colour cycling | **Colour bar** — swipe or ◀ ▶ arrows |
| Pill toolbar — Zoom | Zoom controls | **Bottom bar** (desktop only); mobile uses pinch only |
| Pill toolbar — Session chip | Live session | **Bottom bar** — stitch count badge |
| Pill toolbar — Preview eye | Realistic preview | **Menu** (⋯) |
| Pill toolbar — Thread usage | Confetti heatmap | **Menu** (⋯) → Analysis |
| Pill toolbar — Undo/Redo | Undo/Redo | **Floating undo button** (bottom-left, ~60×60px) + keyboard |
| Pill toolbar — Layers | Layer visibility | **Menu** (⋯) → Layers |
| Progress bar | Completion bar + text | **Colour bar** — percentage; **Stats page** for detail |
| MiniStatsBar | Today/streak/view all | **Removed from tracker chrome**. Accessible via Stats tab. |
| Right panel — Suggestions | Next-region recommendations | **Menu** (⋯) → Suggestions panel |
| Right panel — Thread usage | Confetti stats | **Menu** (⋯) → Analysis |
| Right panel — Session | Live session card | **Bottom bar** badge + **Stats page** for detail |
| Right panel — View | View settings, highlight options | **Colour bar** tap + **Menu** (⋯) → View settings |
| Right panel — Colours | Colour list | **Desktop right panel** (kept, simplified) / **Mobile bottom sheet** (swipe up) |
| Right panel — Actions | Summary, Edit | **Menu** (⋯) |
| Below-canvas — Thread Organiser | Thread management | **Separate "Supplies" tab** or **Stash Manager** |
| Below-canvas — Project Info | Metadata grid | **Menu** (⋯) → Project info |
| Below-canvas — Save/Load | Save/Load buttons | **Header File menu** (already there) — remove duplicate |
| Status bar | Hover position | **Auto-hidden** — only appears when hovering (desktop) or long-pressing (mobile) |

---

## Mobile Interaction Model

### Primary loop: Mark stitches
1. Canvas shows highlighted colour (one colour at a time, PK-style)
2. Tap a stitch to mark it done
3. Drag across stitches to mark multiple
4. Swipe ◀/▶ on colour bar (or tap arrows) to advance to next colour
5. Pinch to zoom, one-finger drag to pan (when Pan mode selected)

### Bottom bar
Three tabs: **Pan** | **Mark** | **{count}**
- Pan: finger drag pans, pinch zooms
- Mark: finger tap marks, finger drag marks multiple
- {count}: shows live stitch count. Tap to expand to session detail.

### Floating undo
A small pill button floats at the bottom-left corner. Tap to undo last action, long-press for redo. Auto-hides after 5 seconds of inactivity.

### Bottom sheet (swipe up from colour bar)
Swipe up on the colour bar to reveal the full colour legend as a half-screen bottom sheet. Tap a colour to highlight it. Sheet dismisses on tap-outside or swipe-down.

---

## Creator↔Tracker Harmony

| Aspect | Creator (currently) | Tracker (Proposal A) | Harmony |
|---|---|---|---|
| Header | Same header component | Same header component | ✅ Same |
| Primary toolbar | Top pill | **Bottom bar** | ❌ Different position — but different task justifies it |
| Canvas position | Centre, below top toolbar | Centre, between colour bar and bottom bar | Similar enough |
| Right panel | Settings/palette/legend | Colour legend (desktop) | Structurally equivalent |
| Menu (⋯) | File dropdown in header | **Same** + overflow items | ✅ Same location |

**Note:** Moving the tracker toolbar to the bottom is a deliberate divergence from the creator's top toolbar. Justification: the tracker is touch-first and thumbs reach the bottom of the screen more easily than the top. The creator is cursor-first and top toolbars are standard for editing interfaces. This is a known trade-off.

---

## Main Risk / Trade-Off

**Risk:** Hiding features behind the ⋯ menu significantly increases the tap count for power features (layers, thread usage, view mode settings). A user who frequently adjusts highlight dimming or switches between Isolate/Tint modes will find this slower.

**Mitigation:** The ⋯ menu remembers last-used section. Keyboard shortcuts still work on desktop. Long-press on colour bar opens view settings directly.

**Trade-off:** Canvas space vs feature discoverability. New users may never find thread usage analysis, suggestions, or layer controls. This is acceptable if those features are genuinely rarely used — **but we don't have usage data to confirm frequency**.
