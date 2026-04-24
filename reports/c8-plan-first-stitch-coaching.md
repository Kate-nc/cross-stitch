# C8 — First-stitch Interactive Coaching

## Problem Statement

**From the audit:** [ux-3-problems.md](ux-3-problems.md) flags **C1** (🔴) "No click anywhere to start" and **F1** (🔴) "No first-stitch coaching." [ux-8-post-B-audit.md](ux-8-post-B-audit.md) §4 confirms both remain open: *"Help drawer search is not a guide; the welcome wizard fires once and never returns."*

**What users actually face:**
- **Creator journey step 6:** User lands on blank canvas with 12 tools visible and no thread selected. They click a cell → nothing happens. No toast, no hint, no guidance. Natural action silently fails.
- **Tracker journey step 4–5:** User opens their first pattern. A one-time Stitch Style Wizard fires (block / freestyle / crosscountry). Then silence. No coaching on how to mark stitches, how undo works, or what progress looks like.
- **Both modes:** The `WelcomeWizard` (onboarding-wizard.js) showed them a static 3-4 slide presentation *about* features. It never returned. The help drawer (`?`) exists but is keyboard-only — new users never discover it.
- **Root cause:** The app is discoverable through reading, not through interaction. Users must either memorise shortcuts or find the hidden help affordance. The onboarding teaches *vocabulary* ("this is the palette tab") rather than *verbs* ("click a cell to paint").

**Impact:** Journey 1 takes ~7 deliberate actions to achieve first stitch; could be 2 with active guidance + sensible defaults. Users who close the tab mid-journey abandon half-completed patterns with no recovery prompt. Tracker resumability is good, but the lack of session-start coaching means repeat visitors don't know if anything's changed since last time.

---

## Scope

### In scope:
- **"First-stitch interactive coaching"** — a series of contextual overlays (coachmarks) that guide brand-new users through their first concrete interaction in each mode:
  - **Creator:** first stitch marked, undo recovery, saving a project
  - **Tracker:** first stitch marked, session awareness, progress visibility
  - **Manager:** optional; lower priority (assume Creator/Tracker coaching first)
- **Teachable moments:** specific triggers when the user is ready to learn:
  - App opens for the first time (Creator/Tracker landing)
  - User starts to import (or is handed a blank canvas)
  - User marks a stitch for the first time
  - User attempts undo (success path)
  - User ends a session (transition moment)
- **Sequencing:** coachmarks are state machines; multiple overlays never fire at once. Once a coachmark is completed or dismissed, the next one queues (not instantly).
- **User control:** every coachmark is skippable; the entire sequence is replayable from Help drawer.
- **Persistence:** per-coachmark flags in `UserPrefs` (e.g., `onboarding.coached.import`, `onboarding.coached.firstStitch`). Reset path for QA/retesting.

### NOT in scope:
- **Ongoing tips-of-the-day** (would be a separate feature)
- **Marketing nudges** or feature announcements
- **In-depth tutorials** (YouTube links, external docs) — keep coaching self-contained
- **Manager onboarding** (can defer; created patterns are more urgent)
- **Accessibility-deep-dive** for reduced-motion variants (accessibility section flags these decisions, implementation follows standard patterns)

---

## The Five Teachable Moments

Each coachmark teaches one atomic action. The user knows they've "completed" the step when they perform the target action.

### 1. Import or Start (Creator)

**When it triggers:**
- User opens Creator for the first time (localStorage has no `cs_welcome_creator_done` flag)
- After the WelcomeWizard closes, immediately check: has user ever imported or created a blank canvas?
- If not: show this coachmark overlaid on the "Create blank" or "From image" button area

**What it teaches:**
- "Most patterns start with an image you already love. Click 'From image' to drop a photo, or start from a blank canvas."
- Single sentence, not a list

**Anchor:**
- Target: `[data-onboard="home-from-image"]` (existing from wizard)
- Placement: right or bottom, depending on viewport
- Optional highlight ring around the button

**Success signal:**
- User clicks "From image" (goes to image upload) OR "Create blank" (goes to size picker)
- Coachmark auto-closes; set `onboarding.coached.import` = true

**Mobile:**
- On screens ≤480px, if the button is below the fold, dismiss the coachmark and set the flag so it doesn't re-fire. The user will discover it by scrolling naturally.

---

### 2. Mark Your First Stitch

**Creator variant — When it triggers:**
- User is on the blank canvas in Edit mode, *no colour is selected yet*
- This coachmark fires only once per account per mode
- Fires ~500ms after the creator-canvas first renders (time for the page to settle)

**What it teaches:**
- "Pick a colour from the palette below, then click a cell to paint."
- Anchor the tip to the palette area in the sidebar (the colour-chip list)
- Or show a simple modal: "Ready? Pick a colour, then click any cell on the grid."

**Success signal:**
- User clicks a cell on the canvas AND a colour is selected
- Pattern cell gets the colour
- Coachmark closes; set `onboarding.coached.firstStitch_creator` = true
- Bonus: show a congratulatory toast: "Nice! You painted your first stitch." (no undo yet)

**Tracker variant — When it triggers:**
- User is on the Tracker canvas in Track mode for the first time
- StitchingStyleOnboarding has already fired (that's separate)
- This fires after that wizard closes

**What it teaches:**
- "Tap a cell to mark it complete. Tap again to undo a single stitch."
- Anchor to a cell in the pattern grid (pick a colour that's present and visible)
- On touch devices, consider a larger, modal-like popover to avoid fat-finger misses

**Success signal:**
- User taps a cell and it's marked as complete (visual feedback: cell dims or gets a checkmark)
- Coachmark closes; set `onboarding.coached.firstStitch_tracker` = true

**Mobile:**
- Coachmark position must account for immersive mode (header slides off). Either:
  - Fire before the user scrolls deep (within first 5 seconds)
  - Or reposition the coachmark if it goes offscreen

---

### 3. Undo a Mistake (Creator/Tracker hybrid)

**When it triggers:**
- User has marked at least 2 stitches (in Creator) or 2 cells (in Tracker)
- User makes a mistake and hovers over or focuses the Undo button (Ctrl+Z, FAB, action bar icon)
- Fire this coachmark the *first time* Undo is about to be used

**What it teaches:**
- "Undo backs out your last stitch. Press Ctrl+Z or click the undo button."
- Single sentence, placed near the undo button
- On Tracker mobile, the undo button is a tiny icon — emphasize it visually

**Success signal:**
- User presses Ctrl+Z or clicks the undo button
- A stitch is rolled back
- User sees the change
- Coachmark closes; set `onboarding.coached.undo` = true
- Toast (optional): "Undo works—you're safe to experiment."

**Accessibility note:**
- Make sure keyboard focus is visible on the undo button when the coachmark shows
- ESC should close the coachmark without triggering undo

---

### 4. View Your Progress (Tracker)

**When it triggers:**
- User is in the Tracker and has marked ≥ 10 stitches (or ~30 seconds of activity)
- Progress percentage is visibly non-zero (e.g., 2% of a 500-stitch pattern)
- Fire this coachmark once per account

**What it teaches:**
- "You're making progress. The bar at the top shows how much of the pattern you've completed. Your sessions are logged automatically."
- Anchor to the progress bar (mobile: the percentage text in the immersive header; desktop: the full progress bar in the header)

**Success signal:**
- User glances at (focuses on or hovers over) the progress bar
- OR user marks another 5 stitches (time-based completion)
- Coachmark closes; set `onboarding.coached.progress` = true

**Honest copy:**
- Don't promise "you'll be done in X hours" — progress bars are motivating but unreliable with varying stitch speeds. Say "logged automatically" to set expectations that the timer is there.

---

### 5. Save Your Work (Creator)

**When it triggers:**
- User has edited the pattern (at least 1 cell changed from blank or 1 colour added)
- 10–15 seconds elapse without a save
- OR user tries to close the tab/navigate away (browser beforeunload event)
- This coachmark fires *before* the NamePromptModal, overlaid on the modal

**What it teaches:**
- "Give your pattern a name so you can find it later. It's saved to your device—no account needed."
- Anchor to the name input field in the NamePromptModal
- Emphasize "*your device*" to set privacy expectations

**Success signal:**
- User types a name into the input (any text)
- Coachmark closes; set `onboarding.coached.save` = true

**Note:**
- If the user hits Save without opening a name prompt (e.g., they saved before), this coachmark never fires (no re-education needed).

---

## Coachmark Primitive — `coaching.js`

A coachmark is a lightweight overlay component, reusable across modes. It's *not* the same as the WelcomeWizard popover (which has more features like custom components and step navigation).

### Design

```
┌────────────────────────────────────────────┐
│ [Existing Page Content]                    │
│                                            │
│  [Target Button/Element with highlight] ◄─┼─ Highlight ring (optional)
│     |                                      │
│     └─ Popover ┌──────────────────────┐   │
│               │ Heading              │   │
│               │ Single-sentence body │   │
│               │ [Skip] [Next/Done]   │   │
│               └──────────────────────┘   │
│                                            │
│ Semi-transparent scrim behind popover     │
└────────────────────────────────────────────┘
```

### Props

```javascript
{
  id:           'import',            // unique; used for completion tracking
  target:       '[data-coachmark="import-button"]',  // optional selector
  placement:    'right',             // right | bottom | top | left
  title:        'Start Your Pattern',
  body:         'Pick an image or start blank.',
  buttons: [
    { label: 'Skip',    action: 'skip' },   // dismiss, don't mark done
    { label: 'Got it',  action: 'complete', primary: true }
  ],
  onComplete:   () => {},            // called when 'complete' is clicked
  onSkip:       () => {},            // called when 'skip' is clicked
  showHighlight: true,               // dim background + highlight target
  focusTrap:    true,                // trap Tab/Shift+Tab inside popover
}
```

### Lifecycle

1. **Mount:** Check `UserPrefs.get('onboarding.coached.' + id)`. If true, don't render.
2. **Render:** Position popover relative to target (or centre if target missing/offscreen).
3. **Interaction:**
   - User clicks "Got it" → call `onComplete()`, set pref to true, unmount
   - User clicks "Skip" → call `onSkip()`, set pref to false (replayable), unmount
   - User presses ESC → same as "Skip"
   - User clicks outside → same as "Skip" (configurable)
4. **Cleanup:** Remove overlay + highlight ring, restore focus to the triggering element

### State ownership

The page that shows the coachmark owns the display state:
```javascript
// In creator-main.js or tracker-app.js
const [activeCoach, setActiveCoach] = useState(null);

return (
  <>
    <CreatorCanvas />
    {activeCoach && <Coachmark {...activeCoach} onComplete={() => setActiveCoach(null)} />}
  </>
);
```

A separate module `coaching-manager.js` (or hooks within `coaching.js`) can coordinate sequencing:
```javascript
// In coaching.js
export function useCoachingSequence(mode) {
  // Returns { active, next, skip, complete }
  // Manages state machine: import → firstStitch → undo → progress → save
}
```

---

## Sequencing — State Machine

Coachmarks are a directed acyclic graph (DAG) per mode:

```
Creator:
  import → firstStitch → undo → save
              ↑ (replayable from Help)
  
Tracker:
  [stitch style wizard (external)]
    ↓
  firstStitch → undo → progress
    ↓ (replayable from Help)
```

### Rules

1. **One at a time:** Only one coachmark visible at any moment.
2. **Sequential:** Coachmark N doesn't show until N-1 is complete (or skipped).
3. **No backtracking:** If the user skips step 2, they don't loop back to it (but can replay from Help).
4. **Triggers are atomic:** Each step has exactly one trigger condition (first import, first stitch, etc.).
5. **Time-gating:** After a coachmark is dismissed, wait 1–2 seconds before showing the next one (avoid carousel effect).

### Implementation sketch

```javascript
// coaching.js
window.useCoachingSequence = function (mode) {
  const SEQUENCES = {
    creator: ['import', 'firstStitch', 'undo', 'save'],
    tracker: ['firstStitch', 'undo', 'progress'],
  };
  const sequence = SEQUENCES[mode] || [];
  const [completedSteps, setCompletedSteps] = useState(
    () => Object.keys(window.UserPrefs.get('onboarding.coached') || {})
  );
  const nextStep = sequence.find(s => !completedSteps.includes(s));
  
  return {
    active: nextStep,
    complete: (stepId) => {
      window.UserPrefs.set(`onboarding.coached.${stepId}`, true);
      setCompletedSteps([...completedSteps, stepId]);
    },
    skip: (stepId) => {
      // Mark as "not coached this session" but replayable
      // (implementation: don't persist, just move to next)
    }
  };
};
```

---

## Persistence — UserPrefs Schema

Add to [user-prefs.js](user-prefs.js) under the Accessibility section or a new Onboarding section:

```javascript
DEFAULTS = {
  // ... existing defaults ...
  
  // ─── Onboarding coaching (each step tracked separately) ─────────────
  onboarding: {
    coached: {
      'import': false,                // Creator first-time
      'firstStitch_creator': false,   // Creator
      'firstStitch_tracker': false,   // Tracker
      'undo': false,                  // Both modes
      'progress': false,              // Tracker
      'save': false,                  // Creator
    },
    skippedAt: null,                  // timestamp of last skip (for replay offer)
  },
};
```

Alternatively, use flattened keys:
```javascript
DEFAULTS = {
  'onboarding.coached.import': false,
  'onboarding.coached.firstStitch_creator': false,
  // ...
  'onboarding.skippedAt': null,
};
```

### Reset path (testing/replay)

From Help drawer → "Restore tutorials":
```javascript
function resetOnboarding() {
  const keys = Object.keys(UserPrefs.DEFAULTS).filter(k => k.startsWith('onboarding.'));
  keys.forEach(k => UserPrefs.set(k, UserPrefs.DEFAULTS[k]));
  window.Toast.show({
    message: 'Tutorials reset. They will show again when you start a new project.',
    type: 'info',
    duration: 4000
  });
}
```

---

## Skip / Replay — Help Drawer Integration

The Help drawer (help-drawer.js) gains a button (or menu item) in its footer:

**"Restart guided tours"**
- Label: Use `Icons.replay()` or `Icons.redo()` (verify it exists, or add one)
- Clicking it:
  1. Calls `resetOnboarding()` (above)
  2. Optionally navigates the user back to the home screen or the Creator if they're already mid-editing
  3. Toast confirms: "Tutorials are reset."

**Skip affordance within the coachmark:**
- Every coachmark has a "Skip" button (not just ESC)
- Clicking "Skip" does NOT mark the step as done (so it's replayable)
- Sets a temporary flag or just doesn't call `UserPrefs.set()`
- Moves to the next step in the sequence

---

## Accessibility

### Focus Management

1. **Initial focus:** When a coachmark mounts, move focus to the primary action button ("Got it").
2. **Keyboard navigation:** Tab/Shift+Tab cycles between buttons inside the popover (focus trap).
3. **ESC:** Closes the coachmark (same as "Skip"), restores focus to the triggering element or nearest focusable ancestor.
4. **Initial focus on target:** If the coachmark is anchored to a button, consider setting initial focus to that button instead (so the user can press Enter to complete the action).

### Screen Reader Narration

- **Popover container:** `role="alertdialog"` and `aria-labelledby="coach-title" aria-describedby="coach-body"`
- **Title:** `id="coach-title"` + `role="heading" aria-level="2"`
- **Body:** `id="coach-body"` and readable plain text (no icon-only elements)
- **Buttons:** Semantic `<button>` elements with readable labels; `data-coach-primary` to mark the main action

### Reduced Motion

Check `window.UserPrefs.get('a11yReducedMotion')`:
- If true:
  - Remove the highlight ring animation (static only)
  - Remove popover fade-in/slide-in animations
  - Show the coachmark instantly
  - Don't delay between sequential coachmarks (show the next one immediately)

### Mobile Screen Readers

- Ensure the highlight ring's `aria-label` or adjacent text describes what's being highlighted
- The popover text must be large enough to read (verify with zoom test at 200%)

---

## Mobile

### Viewport sizing (≤480px)

1. **Popover max-width:** 320px (narrower than desktop 420px) to fit between edges and highlight ring
2. **Highlight ring:** Increases padding if the target element is small (< 40px tall) to make it more obvious
3. **Placement fallback:** If the target is near the viewport edge, automatically reposition to centre or opposite side

### Touch interactions

- Popover and highlight ring must not overlap the main interactive area (the target)
- If no good placement exists (e.g., target fills the viewport), show a full-screen semi-modal version instead:
  - Title at top
  - Body centered
  - Buttons at bottom
  - Semi-transparent scrim behind
  - Tap outside = "Skip"

### Scrolling + immersive mode (Tracker)

- On the Tracker, the header slides off when scrolling. If a coachmark is anchored to the immersive header, either:
  - Show it only during the first 5 seconds (before the user scrolls)
  - OR reposition it if it scrolls out of view (not ideal UX, but safe fallback)

### Button spacing

- Coachmark buttons must be ≥ 44 × 44 px (tap target)
- Use `<button style={{padding: '12px 24px'}}>` minimum

---

## Honest Copy

Every coachmark must teach what the app *actually does*, not what's promised.

### Anti-patterns

- ❌ "Click anywhere to start" (not true; you need a colour first)
- ❌ "Your projects sync to the cloud" (not true; they're local-only)
- ❌ "Drag to mark multiple stitches" (true in design but B2_DRAG_MARK_ENABLED is false, so defer this coachmark or mention it's experimental)

### Approved copy (checked against current implementation)

- ✅ "Pick a colour from the palette below, then click a cell to paint." (paint tool works)
- ✅ "It's saved to your device—no account needed." (localStorage + IndexedDB are device-local)
- ✅ "Sessions are logged automatically." (timer exists and writes to progress)
- ✅ "Tap again to undo a single stitch." (toggle works on Tracker)

---

## Architecture — File Structure

### New files

1. **`coaching.js`** — Coachmark primitive, sequencing state machine, shared utilities
   - `window.Coachmark` — React component
   - `window.useCoachingSequence(mode)` — hook
   - `window.resetCoaching()` — help-drawer integration
   - ~300 lines

### Modified files

1. **`creator-main.js`** — Integrate coaching into CreatorApp
   - Mount the coaching state machine in a useEffect
   - Conditionally render `<Coachmark>` when active
   - Listen for triggers (import, firstStitch, undo, save)
   - ~50 lines added

2. **`tracker-app.js`** — Integrate coaching into TrackerApp
   - Mount the coaching state machine
   - Conditionally render `<Coachmark>`
   - Listen for triggers (firstStitch, undo, progress)
   - ~50 lines added

3. **`user-prefs.js`** — Add onboarding coaching keys to DEFAULTS
   - ~10 lines

4. **`help-drawer.js`** — Add "Restart guided tours" button/menu item
   - Call `window.resetCoaching()` on click
   - ~20 lines

5. **`index.html`** (optional) — Ensure `coaching.js` is loaded before `creator-main.js`
   - Add `<script src="coaching.js"></script>` in the right order

### Load order (in `index.html`)

```html
<!-- After helpers.js but before creator-main.js -->
<script src="constants.js"></script>
<script src="dmc-data.js"></script>
<script src="colour-utils.js"></script>
<script src="helpers.js"></script>
<script src="coaching.js"></script>  <!-- NEW -->
<script src="import-formats.js"></script>
<!-- ... rest of load order ... -->
```

---

## Migration — WelcomeWizard + Coachmarks

### Current state

- **WelcomeWizard:** Fires once per page, never returns (unless user clicks "Restore tutorials")
- **Help drawer:** Static reference docs, no guided interactions

### After C8

**The WelcomeWizard stays** — it's a one-time setup screen that introduces vocabulary ("this is the Create mode", "this is the Tracker", etc.). It's *not* interactive coaching, so don't delete it.

**Coachmarks layer on top** during the first session(s):
1. User opens Creator for the first time
2. WelcomeWizard modal fires → user reads intro → closes
3. User lands on home screen
4. First coachmark activates (import): "Ready? Pick an image or start blank."
5. User clicks "From image"
6. Coachmark closes → wait 1.5s
7. User uploads image → canvas appears
8. Second coachmark activates (firstStitch): "Pick a colour, then click a cell."
9. User picks colour + paints a cell
10. Coachmark closes → congratulatory toast
11. Continues painting...

**Result:** Wizard introduces the app's sections. Coachmarks guide the first real actions. Both together tell a complete story.

---

## Phased Rollout

### Phase 1 (Weeks 1–2, MVP)

Ship **2 coachmarks** to measure impact:
1. **Create: "Mark your first stitch"** — the highest-friction moment from Journey 1
2. **Tracker: "Mark your first stitch"** — verify the core interaction is discovered

**Deliverables:**
- `coaching.js` with both coachmarks
- Integration into `creator-main.js` and `tracker-app.js`
- Help drawer "Restart" button
- UserPrefs persistence

**Metrics:**
- % of new users who see coachmark (loaded)
- % of new users who complete the coached action within 5 minutes
- Engagement: do completed users paint more stitches?

### Phase 2 (Weeks 3–4)

Add **3 more coachmarks** based on Phase 1 learnings:
1. **Creator: "Undo"** — confidence builder
2. **Creator: "Save"** — project persistence
3. **Tracker: "Progress"** — motivation

**Iterate on:**
- Coachmark placement (did users find the target or miss it?)
- Copy clarity (did wording help or confuse?)
- Dismiss rates (too aggressive? too passive?)

### Phase 3 (Beyond)

Conditionally enable:
- **Image import coaching** (once B6 image-import wizard is separate)
- **Manager: "Add to stash"** (if Manager onboarding is needed)
- **Drag-mark coaching** (once B2 is default-on)

---

## Open Questions

Before implementation starts, decide:

1. **Highlight ring style:** Should the target element get a visual glow/border, or just the semi-transparent scrim? (Figma: ask design to spec one example.)

2. **Popover arrow:** Should the popover have a pointing arrow toward the target, or just proximity + placement? (Affects complexity; arrow is nice but requires more positioning logic.)

3. **Completion UX after first stitch:** Should the app auto-scroll to the next logical step (e.g., after marking a stitch, auto-scroll to the Undo button)? Or just dismiss the coachmark and let the user explore?

4. **Manager coaching priority:** Does C8 include Manager onboarding, or is that deferred to a later ticket? (Affects scope; Creator/Tracker are higher priority.)

5. **Drag-mark coachmark gating:** The C8 brief lists "drag to mark" as a teachable moment, but `B2_DRAG_MARK_ENABLED` is false by default (§C3 is the coordination PR). Should C8 coachmark wait for B2, or teach the workaround (single taps)?

6. **Toast vs. coachmark:** After completing a coached action (e.g., first stitch), should the confirmation be a coachmark popover, a toast ("Great! You painted your first stitch"), or both? (Toast is less disruptive; popover reinforces the highlight.)

7. **Reduced motion + animations:** Does the highlight ring scale/fade in, or appear instantly? (Already covered in §Accessibility, but confirm with design/WCAG audit.)

---

## Estimate

**Size: L** — 4–6 milestones, ~14–18 days of focused engineering (with testing, a11y review, QA).

### Milestones

| # | Milestone | Est. Days | Dependencies |
|---|-----------|-----------|---|
| 1 | `coaching.js` primitive + basic coachmark rendering | 2 | None |
| 2 | State machine + sequencing + UserPrefs integration | 2 | M1 |
| 3 | Creator integration (import + firstStitch triggers) | 2 | M2 |
| 4 | Tracker integration (firstStitch + undo + progress triggers) | 2 | M2 |
| 5 | Help drawer "Restart" + mobile sizing + a11y (focus trap, ESC, ARIA) | 2.5 | M3, M4 |
| 6 | QA, Playwright tests, reduced-motion testing, cross-browser spot-check | 2 | M1–M5 |

**Total: ~14.5 days** (or 3 weeks with buffer for interruptions, design clarification, and code review cycles).

### Parallel streams

- **Design review (concurrent with M1–M2):** Finalize highlight ring style, popover arrow, button spacing for mobile.
- **Documentation (concurrent with M5–M6):** Snapshot of current copy → help-drawer additions if needed.
- **Test fixtures (concurrent with M3–M4):** Create test accounts/projects that trigger coaching paths for manual QA.

---

## Deliverables

### Code

1. [coaching.js](../coaching.js) — new file
2. [creator-main.js](../creator-main.js) — modified
3. [tracker-app.js](../tracker-app.js) — modified
4. [user-prefs.js](../user-prefs.js) — modified
5. [help-drawer.js](../help-drawer.js) — modified
6. [index.html](../index.html) — modified (script load order)

### Tests

- Unit tests for `useCoachingSequence()` state machine (Jest)
- Playwright tests for full Creator flow: new user → import → first stitch → undo → save
- Playwright tests for Tracker: resume → first stitch → progress visibility
- Accessibility scan: focus trap, ESC, ARIA labels, reduced-motion

### QA Checklist

- [ ] All coachmarks appear at the right moment (import, firstStitch, undo, progress, save)
- [ ] Skip button prevents re-showing that coachmark in the same session
- [ ] "Restart guided tours" in Help drawer resets all flags
- [ ] Coachmarks don't overlap the target element
- [ ] Mobile (480px): popover doesn't overflow, buttons are 44×44, text is readable
- [ ] ESC key closes coachmark + restores focus
- [ ] Highlight ring and scrim render correctly (not invisible, not too bright)
- [ ] Screen-reader users hear the title + body + button labels
- [ ] Reduced motion: no animations, instant appearance
- [ ] Cross-browser (Chrome, Safari, Firefox) on desktop + iOS Safari + Chrome Mobile

---

## Summary — Five Teachable Moments

1. **Import or Start** (Creator home) — "Pick an image or start blank."
2. **Mark Your First Stitch** (Creator canvas / Tracker canvas) — "Pick a colour, then click a cell to paint." / "Tap a cell to mark it complete."
3. **Undo a Mistake** (Both modes) — "Ctrl+Z backs out your last stitch."
4. **View Your Progress** (Tracker) — "The bar shows your completion %. Sessions log automatically."
5. **Save Your Work** (Creator) — "Give it a name. Saved to your device—no account needed."

---

## References

- [ux-3-problems.md](ux-3-problems.md) — **C1** 🔴, **F1** 🔴
- [ux-8-post-B-audit.md](ux-8-post-B-audit.md) — §3.1 (help affordance), §4 (C1/F1 still open)
- [ux-2-user-journeys.md](ux-2-user-journeys.md) — Journey 1 (first pattern), Journey 4 (tracker first-time)
- [onboarding-wizard.js](../onboarding-wizard.js) — existing wizard, reuse targeting + popover logic
- [help-drawer.js](../help-drawer.js) — "Restart guided tours" integration point
- [user-prefs.js](../user-prefs.js) — persistence layer
- [shortcuts.js](../shortcuts.js) — keyboard dispatch (ESC already handled by useEscape)
- [toast.js](../toast.js) — confirmation toasts
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) — no-emoji rule, design conventions