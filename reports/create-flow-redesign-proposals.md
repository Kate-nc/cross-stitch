# Create-From-Image Flow — Redesign Proposals

> **Phase 2 of 3.** Six genuinely distinct proposals, evaluated against the
> user priorities from Phase 1.
>
> **User priorities (in order):**
> 1. Clean lineart — specific limited palette, stash-aware, 10–15 min, precise colour control
> 2. Quick photo — fast, looks OK, < 5 min
> 3. From my stash — palette adapts to owned threads
> 4. Complex painting — fine control, power user
>
> **Essential controls (always visible, never hidden):**
> dimensions · max colours · blended threads · stash constraint · background removal · smoothing / cleanup
>
> **Key user constraint:** mode switches should be explicit — changing a control
> should not auto-trigger a create→edit transition.
>
> **Interactive HTML mockups:** `reports/create-flow-redesign-option-N.html`

---

## Proposal 1 — Two-Panel Lock

**One-line direction:** Hard physical separation between a "Convert" screen and an "Edit" screen; transitioning between them is an explicit, reversible action.

**Mockup:** [create-flow-redesign-option-1.html](create-flow-redesign-option-1.html)

### Create/Edit Boundary

The boundary is a full-view switch. The Convert screen and the Edit screen are mutually exclusive views — you cannot see generation sliders while editing, and you cannot paint while configuring conversion.

### User Journey

```
Upload image
  │
  ▼
CONVERT SCREEN
  ┌──────────────────────┬────────────────────────┐
  │  Image + live        │  Settings panel        │
  │  preview (side by    │  (all essential         │
  │  side comparison)    │  controls visible)      │
  └──────────────────────┴────────────────────────┘
  [Apply & Edit →]  (primary CTA, bottom right)
  │
  ▼
EDIT SCREEN
  ┌──────────────────────────────────────────────┐
  │  Canvas + toolstrip                          │
  │  Right sidebar: palette chips                │
  │  Header: "Change conversion settings"        │
  │           [opens warning modal if edits > 0] │
  └──────────────────────────────────────────────┘
```

### Automatic vs. User-Controlled

| Stage | Automatic | User-controlled |
|-------|-----------|----------------|
| Image load | Thumbnail shown, no generation | Upload / drag |
| Live preview | Updates 300 ms after any setting change | No manual trigger needed |
| Transition to Edit | Only on "Apply & Edit" click | Explicit |
| Transition back to Convert | Explicit via "Change settings" | Explicit; modal warns of edit count |
| Re-generation | Only when re-entering Convert and clicking Apply | Explicit |

### Control Mapping

| Essential control | Location |
|------------------|---------|
| Dimensions (W × H) | Convert screen, top of settings panel |
| Max colours | Convert screen, settings panel |
| Blended threads | Convert screen, settings panel |
| Stash constraint | Convert screen, settings panel (with stash summary badge) |
| Background removal | Convert screen, settings panel (collapsible sub-section) |
| Smoothing / cleanup | Convert screen, settings panel (collapsible sub-section, "Detail handling") |
| Fabric count | Convert screen, below dimensions (affects live estimate only) |
| All advanced controls (dithering, bri/con/sat, seed) | Convert screen, "Advanced" collapsible section |

After entering Edit mode: **no conversion controls in sidebar at all.** Instead there is a compact "Conversion settings" row in the action bar showing the current settings as read-only badges (e.g. "120×80 · 28 colours · Stash"). This is the "Change settings" entry point.

### User Goal Walkthroughs

**Clean lineart:**  Upload → check background removal is on → set max colours low (8–12) → ensure "From stash" is checked → adjust dimensions → Apply & Edit → use colour replace and magic wand to fine-tune. Total: ~10 min.

**Quick photo:**  Upload → leave defaults → "Apply & Edit". Total: < 1 min to first pattern.

**From stash:**  Toggle "Stash only" in settings panel → see stash count badge update → proceed.

**Complex painting:**  Open "Advanced" section → tweak dithering, bri/con/sat → see live preview update → iterate until happy → Apply & Edit.

### Tradeoffs

**Advantages:**
- Cleanest create/edit boundary possible — zero slider bleed between modes
- Convert screen can be richer (full-width image comparison, more visual preview options) because it doesn't need to share space with edit tools
- Re-generate is always a deliberate, full-screen action — no silent edit destruction
- "Change settings" button makes the back-path explicit and visible

**Disadvantages:**
- Two distinct views means users must navigate between them — more clicks for iterative tweakers
- Power users who want to tweak settings and check pixel-level results quickly may find the full-view switch disruptive
- Converting settings badge in the action bar is a new UI element to learn

### Touch Fit

Excellent for mobile: the Convert screen is naturally a single-column settings scroll on narrow viewports. The comparison slider handles touch natively. The Edit screen is unchanged from the current implementation.

### Minor Variants

- **1a (Drawer variant):** Instead of a full-screen Convert view, the "Change settings" action opens a wide bottom-sheet drawer on mobile, or a wide left-panel drawer on desktop. The canvas remains visible behind it (dimmed). Avoids the navigation cost at the price of a slightly blurrier boundary.
- **1b (Split-pane):** Convert screen always shows image left + settings right at ≥ 1024 px; stacks to settings-above-image on mobile.

---

## Proposal 2 — Intent Profiles

**One-line direction:** On upload, the user picks a work mode ("Quick", "Precise", "Stash"); each profile pre-configures all defaults and shows only the controls that matter for that mode.

**Mockup:** [create-flow-redesign-option-2.html](create-flow-redesign-option-2.html)

### Create/Edit Boundary

Same as current: generate is explicit (button click). The boundary is maintained by the profile system — once in a profile, the "generate" action is visually prominent and the edit tools are hidden until it is used. The key difference: changing a setting never auto-generates or auto-switches mode.

### User Journey

```
Upload image
  │
  ▼
PROFILE SELECTION (shown once per image upload, skippable)
  ┌──────────────────┬──────────────────┬──────────────────┐
  │   Quick Photo    │  Lineart / Stash │  Detailed Photo  │
  │   < 5 min        │  10–15 min       │  Advanced        │
  └──────────────────┴──────────────────┴──────────────────┘
  │
  ▼
CREATION PANEL (settings relevant to chosen profile + Generate button)
  ↓
EDIT MODE (clean — no conversion controls in sidebar)
```

### Profile Definitions

| Profile | Pre-set defaults | Controls shown | Hidden |
|---------|-----------------|----------------|--------|
| **Quick Photo** | maxC=25, dith=balanced, smooth=2, cleanup=gentle, bgRemove=off | Dimensions, max colours, cleanup toggle | All sliders, dithering detail, seed |
| **Lineart / Stash** | maxC=12, dith=off, smooth=0, cleanup=thorough, bgRemove=on (white), blends=off | Dimensions, max colours, stash toggle, background colour+threshold, cleanup strength | Dithering, sat/bri/con |
| **Detailed Photo** | maxC=40, dith=strong, smooth=1, cleanup=balanced | All essential + all advanced | Nothing hidden |

Users can switch profiles after selection; a "Customise" link reveals the full control set regardless of profile.

### Automatic vs. User-Controlled

| Stage | Automatic | User-controlled |
|-------|-----------|----------------|
| Profile defaults applied | On profile select | Profile selection itself |
| Live preview | 300 ms debounce after any change | Manual drag |
| Generate | Never automatic | Button click |
| Edit→re-generate | Only via explicit "Change conversion" | Button click + warning if edits > 0 |

### Control Mapping

Essential controls appear in all profiles, at the top of the settings panel:
- Dimensions (locked aspect ratio by default)
- Fabric count (with live size-in-cm display)
- Max colours
- Blended threads (prominent toggle, not hidden)
- Stash constraint (prominent toggle in Lineart/Stash; checkbox in others)
- Background (toggle + colour swatch in Lineart/Stash; "Advanced" in others)
- Smoothing / cleanup (single "Detail" slider 0–3 that maps to presets)

### User Goal Walkthroughs

**Clean lineart:**  Pick "Lineart / Stash" → stash toggle is pre-checked → set dimensions → set max colours to 8 → "Generate". Then use colour replace in edit mode.

**Quick photo:**  Pick "Quick Photo" → set dimensions → "Generate". Done in under 1 min.

**From stash:**  "Lineart / Stash" profile → stash toggle is on by default.

**Complex painting:**  Pick "Detailed Photo" → all controls exposed → iterate on live preview.

### Tradeoffs

**Advantages:**
- Excellent for first-time users — they don't see controls they don't understand
- Lineart/stash profile matches the #1 user priority exactly
- Profiles are persistent (remembered per-session or as a user preference)

**Disadvantages:**
- Profile selection adds one extra click for returning users
- "Customise" escape hatch must be very visible or power users will be frustrated
- Three profiles may not cover all cases — "stash but also photo" is a common hybrid

### Touch Fit

Profile cards scale well to mobile. Settings panel is a single column with good tap targets. The profile selector works as a bottom-sheet on mobile.

### Minor Variants

- **2a:** No separate profile selection step — show a compact profile toggle at the top of the settings panel (appears on every upload, can be changed at any time). Less friction but profile switcher is always visible.
- **2b:** Show profile cards as a landing overlay only the first time a user uses the creator; after that, remember and use the last profile.

---

## Proposal 3 — Wizard Complete

**One-line direction:** The Import Wizard becomes the primary (non-experimental) path, with live preview actually wired in step 4, crop properly applied, and a clean edit mode that hides all conversion controls.

**Mockup:** [create-flow-redesign-option-3.html](create-flow-redesign-option-3.html)

### Create/Edit Boundary

The wizard is the create phase. Completing step 5 generates the pattern and opens the clean edit view. To change conversion settings after that, you re-open the wizard via "Change settings" — same warning modal as Proposal 1.

### User Journey

```
Upload image
  │
  ▼
WIZARD (5 steps, always visible progress strip)
  Step 1: Crop & Orient   — visual crop rectangle, rotate/flip
  Step 2: Palette          — DMC / Stash / Limited; max colours; blends
  Step 3: Size & Fabric    — dimensions with live physical size; fabric count
  Step 4: Preview & Tune   — LIVE preview working; dithering, contrast,
                              background, cleanup (single "Noise removal" slider)
  Step 5: Generate         — summary card → "Generate Pattern" button
  │
  ▼
EDIT MODE (clean — conversion controls not in sidebar)
```

### Automatic vs. User-Controlled

| Stage | Automatic | User-controlled |
|-------|-----------|----------------|
| Step 4 live preview | Yes, fully wired (300 ms debounce, main thread) | Can pause via "Freeze preview" toggle |
| Crop transform | Applied on step transition (not deferred to generate) | User-driven via visual handles |
| Generate | Only on step 5 button | Explicit |
| Edit→re-generate | Re-opens wizard at step 4 (keeps previous settings) | Explicit; modal if edits > 0 |

### Control Mapping

The wizard steps distribute controls by mental model rather than by technical category:

| Step | Controls | Why here |
|------|----------|---------|
| 1 Crop | Rotate, flip, crop rectangle, aspect ratio guide | Decisions about the image before it becomes a pattern |
| 2 Palette | Palette source (full/stash/limited), max colours, allow blends, constrain to stash | "What threads will I use?" |
| 3 Size | Width, height, aspect lock, fabric count, physical size display, stitch + time estimate, complexity warning | "How big will this be?" |
| 4 Preview | Dithering toggle (labelled "Smooth edges"), contrast slider, background removal, cleanup slider (labelled "Remove noise") | "Does it look right?" |
| 5 Generate | Summary, generate button | Commit |

Essential controls are in steps 2 and 3, which cannot be skipped.

### User Goal Walkthroughs

**Clean lineart:**  Step 2: toggle "From stash" → max colours = 8, blends off. Step 3: set dimensions. Step 4: background removal on. Generate. Done. ~6 clicks.

**Quick photo:**  All defaults are acceptable. Step 4 shows instant preview. Click Next → Generate. ~3 clicks after upload.

**Complex painting:**  All controls available across all steps. Step 4 has live preview for iterating quickly.

### Tradeoffs

**Advantages:**
- Controls are grouped by user mental model, not by technical category
- Step 4 live preview (if implemented) is the most powerful learning tool: users see the effect of cleanup and background removal before committing
- Wizard can be skipped (all steps clickable if prior steps are complete)
- Clean edit mode — no conversion clutter in the edit sidebar

**Disadvantages:**
- Step 4 live preview requires making the main thread more responsive (or integrating `generate-worker.js`) — non-trivial implementation cost
- Wizard interaction pattern adds modal overhead on desktop (cancel, close gestures)
- Users who want to quickly re-tweak a single setting after generation must navigate back through the wizard rather than adjusting a slider

### Touch Fit

Excellent for mobile: each wizard step fits naturally on a phone screen. The crop tool in step 1 is the highest-risk touch interaction (pinch-to-crop would need implementation). Next/back navigation works well on touch.

### Minor Variants

- **3a (Non-modal wizard):** Wizard steps appear as a persistent step indicator in a collapsible panel above the canvas, not as a blocking modal. Canvas shows the live preview behind the wizard panel.
- **3b (Quick mode):** If user selects "Quick" on upload, the wizard collapses to steps 2+3 only (palette and size), skipping crop and preview steps.

---

## Proposal 4 — Live Draft

**One-line direction:** The pattern appears immediately on canvas at sensible defaults; generation settings are a persistent sidebar that updates the canvas live; a "Lock & Edit" button commits the conversion and reveals the edit tools.

**Mockup:** [create-flow-redesign-option-4.html](create-flow-redesign-option-4.html)

### Create/Edit Boundary

The boundary is the "Lock & Edit" button. Before it is clicked, the canvas is always in "preview mode" — every change to settings auto-updates it. After it is clicked, the settings sidebar collapses and is replaced by the edit tools. "Unlock settings" re-enters preview mode (with a warning if edits exist).

### User Journey

```
Upload image
  │  (pipeline runs immediately at defaults — ~500 ms)
  ▼
DRAFT MODE
  ┌──────────────────┬────────────────────────────┐
  │  Canvas          │  Settings sidebar          │
  │  (live preview,  │  (all essential controls   │
  │  updates as you  │   + advanced section)      │
  │  change settings)│                            │
  └──────────────────┴────────────────────────────┘
                     [Lock & Edit →]
  │
  ▼
EDIT MODE
  ┌──────────────────┬────────────────────────────┐
  │  Canvas          │  Edit sidebar              │
  │  (committed      │  (palette chips + tools)   │
  │   pattern)       │                            │
  └──────────────────┴────────────────────────────┘
  [Unlock settings ↺]  (small button in action bar, not prominent)
```

### Automatic vs. User-Controlled

| Stage | Automatic | User-controlled |
|-------|-----------|----------------|
| Initial draft | Yes — pipeline runs on upload at defaults | No separate generate button |
| Canvas updates | Yes — 300 ms debounce on every setting change | — |
| "Lock & Edit" transition | Only on button click | Explicit |
| Unlock / re-draft | Only on "Unlock settings" click | Explicit; warning if edits > 0 |

### Control Mapping

All essential controls in the sidebar, always visible (no accordion needed):

| Control group | Placement |
|--------------|---------|
| Dimensions + fabric count | Top of sidebar, persistent header section |
| Palette: max colours, blends, stash | Second section |
| Background removal | Third section (prominent when image has white/light bg) |
| Smoothing / cleanup | Fourth section, single "Detail" slider |
| Advanced (dithering, bri/con/sat, seed) | Collapsible section at bottom |

### User Goal Walkthroughs

**Clean lineart:**  Upload → canvas shows immediate draft. Toggle stash, reduce colours → canvas updates live. Adjust background removal → satisfied → Lock & Edit → refine with colour replace.

**Quick photo:**  Upload → see draft → Lock & Edit immediately. Total: < 30 seconds.

**Complex painting:**  All controls visible. Iterate on live draft. Advanced section for dithering.

### Tradeoffs

**Advantages:**
- Fastest time-to-first-pattern of all proposals — no button to click to see a result
- No "generate" concept to explain to new users
- Settings sidebar and canvas are co-present — changes visible immediately
- Aligns with how tools like Photoshop filters work (live adjustment)

**Disadvantages:**
- Live generation on the main thread is expensive — every slider movement triggers a 300 ms debounced pipeline run. On slow hardware or large patterns this may feel sluggish or unresponsive. Requires `generate-worker.js` to be integrated for a good experience.
- Immediate generation on upload means the pipeline runs even before the user has a chance to set their preferred parameters — potentially wasted CPU time
- "Lock & Edit" is a non-standard pattern; users may not understand why they need to explicitly "lock" to edit
- If the preview update is slow, users won't get the "live" feel the proposal promises

### Touch Fit

Good on tablet landscape. On phone portrait, the sidebar stacks below the canvas; the "Lock & Edit" button needs to be visible without scrolling (sticky position).

### Minor Variants

- **4a:** Add a "freeze preview" toggle that pauses live updates while the user scrolls through settings. Addresses the CPU concern.
- **4b:** The initial pipeline run uses a degraded-quality fast path (lower iteration count, no cleanup) for sub-100 ms responsiveness; full pipeline runs only on "Lock & Edit".

---

## Proposal 5 — Convert / Edit Tabs

**One-line direction:** Two explicit tabs at the top of the creator page: Convert and Edit; the boundary is a literal UI chrome element, always visible.

**Mockup:** [create-flow-redesign-option-5.html](create-flow-redesign-option-5.html)

### Create/Edit Boundary

The tab bar. "Convert" tab contains the image, settings, and generate button. "Edit" tab contains the canvas and editing tools. The active tab is always visible in the page header. Switching tabs is always explicit.

### User Journey

```
[Convert | Edit]  ← always visible tab bar

CONVERT TAB active:
  ┌──────────────────┬────────────────────────────┐
  │  Original +      │  Settings                  │
  │  Preview split   │  Dimensions, palette, etc. │
  │                  │                            │
  │                  │  [Generate Pattern]        │
  └──────────────────┴────────────────────────────┘

EDIT TAB active (enabled after first generate):
  ┌────────────────────────────────────────────────┐
  │  Tool strip + Canvas + right sidebar (palette) │
  └────────────────────────────────────────────────┘
```

Clicking "Edit" before any generation has happened shows a prompt: "Generate a pattern first to start editing." Clicking it after generation switches immediately to the canvas.

Clicking "Convert" from the Edit tab — if edits exist — shows: "Going back to Convert will discard your N edit(s). Your conversion settings are preserved. Continue?"

### Automatic vs. User-Controlled

| Stage | Automatic | User-controlled |
|-------|-----------|----------------|
| Live preview | Yes, 300 ms debounce, visible in Convert tab | Drag comparison slider |
| Tab switch | Never automatic | Explicit |
| Generate | Only on button click in Convert tab | Explicit |
| Re-generation | Click Convert tab → adjust → Generate again | Explicit; warning on tab switch if edits exist |

### Control Mapping

Convert tab sidebar contains all essential controls in a single scrollable panel (no accordion needed — the tab switch provides the spatial separation that was previously missing). The Edit tab sidebar contains only palette chips and colour tools.

| Tab | Controls present |
|-----|-----------------|
| Convert | Dimensions, fabric count, max colours, blends, stash, bg removal, smoothing, cleanup, advanced (dith/bri/con/sat), generate button |
| Edit | Palette chips, paint/fill/erase/eyedropper tools, backstitch, wand, lasso, cleanup mode, undo/redo |
| Both | Action bar: PDF export, Open in Tracker, project name, pattern info |

### User Goal Walkthroughs

**Clean lineart:**  Stay on Convert tab → configure stash, max colours, bg removal → Generate → Edit tab opens automatically.

**Quick photo:**  Convert tab → Generate immediately (defaults are fine) → Edit tab.

**From stash:**  Convert tab → toggle stash → Generate.

**Complex painting:**  Convert tab → Advanced section → iterate with live preview → Generate → Edit.

### Tradeoffs

**Advantages:**
- Extremely clear mental model: two tabs = two phases of work
- No accidental mode-switching — tabs require explicit clicks
- Re-generation is safe: Convert tab always shows current settings; user can change and re-generate without risking edits accidentally (they must explicitly navigate back to Edit)
- Simple to implement: the tab bar is a small UI addition; the two panels already exist

**Disadvantages:**
- Users who want to tweak settings and see pixel-level edit results in the same view must switch tabs back and forth
- Edit tab auto-open on first Generate may be surprising if not clearly signposted
- Adds a persistent UI element (tab bar) that takes space from the canvas area

### Touch Fit

Good. Tab bar works well on mobile as a full-width two-button toggle. On phone, each tab is a full-screen view, which is natural.

### Minor Variants

- **5a:** Tab bar is bottom-positioned on mobile (standard mobile pattern for two primary views), top-positioned on desktop.
- **5b:** "Convert" tab is always labelled but greyed when no image is loaded (not just hidden). Shows the upload zone when active.

---

## Proposal 6 — Settings Drawer

**One-line direction:** The edit canvas is always the primary view; conversion settings live in a collapsible drawer that is explicitly opened and "applied" — the draw canvas only reflects committed settings, not slider drags.

**Mockup:** [create-flow-redesign-option-6.html](create-flow-redesign-option-6.html)

### Create/Edit Boundary

The "Apply" button inside the drawer. When the drawer is closed, the canvas shows the committed pattern and only edit tools are available. When the drawer is open, the canvas is replaced by a side-by-side preview (original vs. pending conversion). Closing the drawer without clicking Apply reverts any unsaved setting changes.

### User Journey

```
Upload image → drawer opens automatically (first time only)

DRAWER OPEN (conversion settings)
  ┌────────────────────────────────────────────────────────┐
  │  [↑ Conversion settings]  ← drawer handle             │
  │  Dimensions ·  Palette ·  Detail  ·  Advanced  (tabs) │
  │                                                        │
  │  ⬜ Original    ⬜ Preview    (side-by-side inside drawer)│
  │                                                        │
  │  [Apply conversion]   [Discard changes]                │
  └────────────────────────────────────────────────────────┘

DRAWER CLOSED (edit tools)
  ┌────────────────────────────────────────────────────────┐
  │  Canvas  +  toolstrip  +  palette sidebar              │
  │                                                        │
  │  [▼ Conversion settings]  ← always visible handle      │
  └────────────────────────────────────────────────────────┘
```

The drawer handle is always visible at the top of the canvas area. Opening it does not lose edit history — it only previews a new conversion.

### Automatic vs. User-Controlled

| Stage | Automatic | User-controlled |
|-------|-----------|----------------|
| Drawer opens on first upload | Yes | Can disable in preferences |
| Preview in drawer | 300 ms debounce | Manual slider control |
| "Apply conversion" | Only on button click | Explicit |
| Drawer close without apply | Reverts pending settings | Explicit via Discard / close |
| Edit tools | Always available when drawer is closed | — |

### Control Mapping

Inside the drawer, settings are grouped into 4 sub-tabs (not full wizard steps — the drawer is narrower):

| Sub-tab | Controls |
|---------|---------|
| Dimensions | W × H, aspect lock, fabric count, physical size |
| Palette | Max colours, blends toggle, stash toggle, stash summary badge |
| Detail | Background removal (toggle + colour + threshold), smoothing slider, cleanup slider |
| Advanced | Dithering, bri/con/sat, variation seed |

### User Goal Walkthroughs

**Clean lineart:**  Drawer opens → Palette tab → stash toggle on, max colours 8, blends off → Detail tab → bg removal on → Apply. Edit tab for fine-tuning with colour replace.

**Quick photo:**  Drawer opens → Apply immediately (defaults fine). Under 30 seconds.

**Complex painting:**  Advanced sub-tab for dithering control.

### Tradeoffs

**Advantages:**
- Edit mode is the default view — no mode switching concept for users who spend most time editing
- "Apply" button in the drawer means the canvas never shows uncommitted settings — no ambiguity
- Drawer close-without-apply reverts setting changes (same pattern as Cancel in a dialog), which is a learned interaction
- No navigation cost: the drawer overlays the view rather than replacing it

**Disadvantages:**
- Drawer interaction pattern is compact — sub-tabs add complexity within an already-constrained space
- The drawer handle is a subtle affordance; users may not discover it
- Preview inside the drawer is small — the comparison is less immersive than a full-screen view
- "Apply" vs. "Close" vs. "Discard" may be confusing — three actions with overlapping semantics

### Touch Fit

Good on mobile: the drawer is a bottom-sheet on narrow viewports. The handle is a standard touch pattern. The drawer sub-tabs collapse to a horizontal scroll on small screens.

### Minor Variants

- **6a (Top overlay):** Drawer slides down from the top of the canvas, overlaying (not displacing) the canvas. Less scroll offset required to see both the drawer and the canvas edge.
- **6b (Side panel):** On desktop, settings are a persistent left panel that can be "locked open" (like an inspector panel in a design tool). On mobile, it becomes a bottom drawer. Matches design-tool conventions more closely.

---

## Comparison Matrix

| Criterion | 1 Two-Panel Lock | 2 Intent Profiles | 3 Wizard Complete | 4 Live Draft | 5 Convert/Edit Tabs | 6 Settings Drawer |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Clean lineart flow clarity** | ★★★ | ★★★ | ★★★ | ★★ | ★★★ | ★★ |
| **Quick photo speed** | ★★★ | ★★★ | ★★ | ★★★ | ★★★ | ★★★ |
| **Stash-first discoverability** | ★★ | ★★★ | ★★★ | ★★ | ★★ | ★★ |
| **Complex painting control** | ★★★ | ★★ | ★★★ | ★★★ | ★★★ | ★★★ |
| **Mode-switch clarity** | ★★★ | ★★ | ★★★ | ★★ | ★★★ | ★★★ |
| **Mobile experience** | ★★★ | ★★★ | ★★★ | ★★ | ★★ | ★★★ |
| **Implementation cost** | Medium | Low | High (live preview) | High (worker) | Low | Medium |
| **Power user iteration speed** | ★★ | ★★ | ★★ | ★★★ | ★★ | ★★★ |

---

## Recommendation

### Primary recommendation: Proposal 5 — Convert / Edit Tabs

The tab bar provides the cleanest answer to the user's stated constraint ("mode switches should be explicit") with the lowest implementation cost. The two tabs map exactly to the two phases of work the user identified. Essential controls all live in the Convert tab without needing accordions or profiles. The Generate button in the Convert tab is unambiguously the "commit" action.

This also fixes the top three friction items from the audit:
- Mode transition is invisible → **fix:** tab switch is visible UI chrome
- Conversion controls visible in edit mode → **fix:** they live in a different tab
- Re-generate destroys edits silently → **fix:** returning to Convert tab requires a warning click

The key enhancement needed on top of the tab architecture: the Convert tab sidebar can be slimmer (no accordion needed when the whole tab is dedicated to settings), and the stash toggle + dimensions should be at the very top as the two highest-priority decisions.

### Secondary recommendation: Proposal 1 — Two-Panel Lock

For users who primarily do clean lineart and spend most of their time in the convert phase (your #1 priority), the full-screen Convert view gives more space for the comparison slider and image preview. The "Apply & Edit" CTA is conceptually simpler than a tab bar. It is a higher implementation cost but results in a more visually considered create experience.

### Hybrid suggestion

If one implementation is needed: start with Proposal 5 (tabs, low cost) but adopt the Convert tab layout from Proposal 1 (full-width image + settings split-pane on desktop, instead of settings-only sidebar). This gives the best of both — tab clarity with spacious convert UX.

---

*Phase 3 (implementation of chosen direction) begins after selecting a proposal.*
