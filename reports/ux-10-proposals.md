# UX-10 — Improvement Proposals

> Phase 3. Three **mutually exclusive philosophical directions** for
> the next round of UX work. The user picks ONE; that pick informs
> Phase 4 mockups + implementation.
>
> Each plan addresses the same set of audit findings ([ux-9](ux-9-prioritised-issues.md))
> but biases toward a different *philosophy*. They are NOT a feature
> menu to mix-and-match; they are competing visions.
>
> Wireframes for each plan live in
> [reports/wireframes/](wireframes/) — `plan-a-*.html`,
> `plan-b-*.html`, `plan-c-*.html`. Visual direction is in
> [ux-11](ux-11-visual-direction.md).

---

## How to read this document

For each plan:
- **One-line bet** — the philosophy in a sentence
- **What changes** — concrete user-visible shifts
- **What stays** — explicit non-changes (so reviewers know what
  isn't on the table)
- **Wins** — which personas / themes benefit
- **Risks** — what we lose or defer
- **Wireframes** — list of files in [wireframes/](wireframes/)
- **Effort estimate** (rough sizing only, no time estimates)
- **The two changes that would prove this plan in 2 PRs**

The three plans are then compared side-by-side in §4.

---

## Plan A — "Tracker-First, Mobile-First"

> **The bet:** the Tracker is our biggest competitive moat. Make it
> Pattern-Keeper-grade on iOS and Android, and let the Creator and
> Manager catch up later.

### What changes

1. **Tracker becomes the flagship surface.** A complete phone-first
   re-layout. Canvas takes ≥ 80% of viewport at all times. Tools
   become a slim floating dock (Aseprite-style), not a horizontal pill
   bar.
2. **A persistent left rail (collapsible to icons) replaces the
   project-picker modal.** Recent + active projects always one tap
   away. Cross-page navigation (Track / Edit / Manage) stays in this
   rail.
3. **Mobile basics ship as one release:** PWA icons (T2), wake-lock
   (T2), safe-area (T2), 44 px touch targets (T2),
   `inputMode`/`enterkeyhint` (T2), `touch-action: none` on canvases
   (T2).
4. **Live cross-device sync via the existing sync engine
   ([sync-engine.js](../sync-engine.js))**, foregrounded as a "Sync to
   phone" affordance with QR code from the Pattern tab.
5. **Performance pass:** cache compiled Babel output to localStorage;
   ship a skeleton/splash on cold start; lazy-load Manager and Creator
   bundles.
6. **A11y in the tracker:** modals get `role="dialog"` + focus trap;
   canvas gets companion list of next-N stitches and an `aria-live`
   announcer; coloured state badges all paired with icons.
7. **Creator gets the minimum to unblock W1/W2:** a "Print" and
   "Track" primary button on the Pattern tab, the unnamed-project
   gate is removed, the Materials sub-tabs stay as-is.

### What stays

- The Manager keeps its current layout. Shopping list polish deferred.
- The Creator's tab structure stays mostly intact (only the Pattern
  tab gets the two new buttons).
- The visual language stays largely as-is; dark mode and type scale
  are NOT in scope. (Defer to Plan B.)
- Designer / professional features (watermark, ZIP polish) NOT in
  scope.

### Wins

- Persona priority: **Eli** primary win (sync + tracker performance);
  **Bea** secondary win (mobile basics + W1/W2 quick fixes).
- Themes: T1 (partial), T2 (full), T5 (Tracker only), T8.
- Strategic: opens a real wedge against Pattern Keeper on iOS.

### Risks

- Manager and Designer Devi are explicitly deferred — their next
  round of needs sit unaddressed for one cycle.
- The Visual Foundation work (T4) is deferred; component sprawl gets
  worse before it gets better.
- "Tracker rewrite" risk: the existing tracker has years of nuanced
  state (parking markers, half-stitches, sessions, time tracking); a
  layout reshuffle could regress.

### Wireframes

- [wireframes/plan-a-tracker-mobile.html](wireframes/plan-a-tracker-mobile.html) — phone-first Tracker
- [wireframes/plan-a-tracker-tablet.html](wireframes/plan-a-tracker-tablet.html) — tablet Tracker with persistent left rail
- [wireframes/plan-a-pattern-tab.html](wireframes/plan-a-pattern-tab.html) — Creator Pattern tab with Print + Track CTAs

### Effort sizing

Largest of the three plans. The Tracker re-layout is the big-ticket
item. Mobile basics are small. Sync foregrounding is medium.

### The two PRs that would prove this plan

1. **PR-A1:** PWA icons + wake-lock + safe-area + Tracker bottom-bar
   re-layout. Pure mobile-basics, ships in days.
2. **PR-A2:** Tracker left rail (replaces project-picker modal) +
   "Print PDF" button on Creator Pattern tab + remove unnamed-project
   gate.

---

## Plan B — "Design System Reset"

> **The bet:** the audit found that visual and component sprawl is
> the root cause of half the issues. Build the foundation now; the
> per-page UX wins become almost free afterwards.

### What changes

1. **Component primitives consolidated.** One `<Button>`, one
   `<Modal>` (with proper dialog semantics + focus trap + safe-area),
   one `<Badge>`, one `<EmptyState>`, one `<Sheet>` (bottom sheet).
   Page-specific button classes alias to the new primitives.
2. **Design tokens enforced.** Type scale (six steps), spacing scale
   (4 / 8 / 12 / 16 / 24 / 32), full dark-mode CSS variable set,
   single accent system. Stylelint rule (or eslint-plugin) blocks
   inline hex.
3. **Dark mode shipped end-to-end.** Every page, every component,
   tested.
4. **Icons-paired-with-state everywhere.** Toasts, badges, streak,
   today, brand chips — all gain icons next to the colour.
5. **A11y modal hygiene shipped via the new `<Modal>` primitive.**
   Every modal in the app gets dialog role + focus trap + `aria-live`
   in one swap.
6. **Vocabulary copy pass.** Apply [ux-3 §7](ux-3-domain-reference.md#7-vocabulary-in-app-copy--the-dos-and-donts)
   across every screen.
7. **Tracker, Creator, Manager structure unchanged** — just rendered
   in the new primitives.

### What stays

- Information architecture (tab structure, page count, navigation)
  stays where it is.
- Workflow flow (where buttons live in the hierarchy) stays where it
  is. The "Print PDF buried 4 tabs deep" issue is NOT addressed in
  this plan — but the buttons all *look* better.
- No new features. Designer / shopping / sync stay as-is.

### Wins

- Persona priority: all three personas benefit equally (lower
  cognitive load, better contrast, full dark mode).
- Themes: T4 (full), T5 (broad), T2 (partial via Modal/Sheet),
  T6 (visual polish only).
- Strategic: every future PR is cheaper. Component sprawl stops
  growing.

### Risks

- **Slow visible payoff.** Users may not notice for a while; reviewers
  may feel the work is "invisible".
- **Refactor risk.** Touching every modal, button, and badge in a
  React codebase that uses Babel-in-browser is a lot of surface area
  to regress.
- The headline workflow problems (W1 buried, W3 modal-heavy) are NOT
  fixed.

### Wireframes

- [wireframes/plan-b-token-system.html](wireframes/plan-b-token-system.html) — type scale, colour, component preview
- [wireframes/plan-b-dark-mode.html](wireframes/plan-b-dark-mode.html) — every page in dark
- [wireframes/plan-b-modal-primitive.html](wireframes/plan-b-modal-primitive.html) — modal / sheet / drawer family

### Effort sizing

Medium. The work is wide but shallow. Most of it can be parallelised.
The risk surface is large but the per-change risk is small.

### The two PRs that would prove this plan

1. **PR-B1:** Type scale + spacing scale + button consolidation + dark
   mode CSS variables. No JSX changes.
2. **PR-B2:** Modal primitive + Sheet primitive + Badge primitive,
   migrating one page (Tracker) as the proof.

---

## Plan C — "Outcomes Over Tabs"

> **The bet:** Bea is the biggest growth audience and the current
> Creator IA actively pushes her away. Restructure the Creator and
> the navigation around *outcomes* (print, track, manage thread)
> rather than *tabs* (Pattern, Project, Materials & Output).

### What changes

1. **The Creator collapses from three tabs to two:** **Design** (the
   chart canvas + tools + settings) and **Use** (preview, print,
   share, track, hand-off). The Materials Hub becomes a
   contextual pane *inside* Design (collapsible right rail), not a
   separate top-level destination.
2. **Primary actions live where the user finishes:** the Pattern view
   has a persistent action bar at the top with "Print PDF",
   "Track this", "Share". No tab-switching to reach the print button.
3. **Cross-page object model.** A project is one entity; the page
   chooses what to do with it. Header gets a project switcher
   (Linear-style); when a project is open, the header shows
   "Designing • Tracking • Managing" as a mode switch, not page
   switch.
4. **Manager Patterns tab gains "Edit" and "Track" buttons on every
   card** — restoring symmetric continuity.
5. **Welcome / Onboarding consolidation.** One Welcome Back card
   replaces the welcome wizard; project picker integrated into the
   home dashboard.
6. **Designer features get a clear home.** The Use view has a
   "Publishing" panel with branding, watermark, ZIP options — instead
   of being scattered across Project / Output sub-tabs.
7. **Mobile basics ship as a single small PR alongside this** (PWA
   icons, wake-lock, safe-area).

### What stays

- The Tracker keeps its current toolbar / canvas / drawer layout
  (only the project picker becomes a header switcher).
- Visual design largely stays — type scale and dark mode NOT in scope.
- The Manager's tab structure stays.

### Wins

- Persona priority: **Bea** primary win (W1 in 2 clicks; no more
  hunting for Print); **Devi** strong win (designer features get a
  home); **Eli** secondary win (cross-page continuity).
- Themes: T1 (full), T3 (full), T6 (broad), T7 (full).
- Strategic: the IA actually starts to *describe* what the app
  *does*, instead of how it's organised internally.

### Risks

- **Highest design and code risk** of the three. Renaming top-level
  tabs and restructuring object identity ripples through every
  file. The "two tabs" framing will be intuitive to new users but
  *will* surprise existing ones.
- **Mobile basics get less depth** than in Plan A.
- **No design-system payoff** — visual sprawl continues.
- The Tracker's mobile experience improves only marginally.

### Wireframes

- [wireframes/plan-c-creator-design.html](wireframes/plan-c-creator-design.html) — Design view with collapsible Materials rail
- [wireframes/plan-c-creator-use.html](wireframes/plan-c-creator-use.html) — Use view with Publishing panel
- [wireframes/plan-c-header-switcher.html](wireframes/plan-c-header-switcher.html) — header mode switcher (Design/Track/Manage)
- [wireframes/plan-c-home.html](wireframes/plan-c-home.html) — consolidated home dashboard

### Effort sizing

Medium-large. The structural changes are not as wide as Plan B but
are deeper — they touch the navigation, the project model, and the
Creator IA all at once.

### The two PRs that would prove this plan

1. **PR-C1:** Pattern tab gets persistent action bar with Print PDF +
   Track. Materials sub-tabs collapse into a right-rail panel
   (feature-flagged behind a setting first).
2. **PR-C2:** Header mode-switcher; Manager pattern cards gain
   Edit/Track buttons; Welcome Back consolidated.

---

## Side-by-side comparison

| Dimension | Plan A · Tracker/Mobile | Plan B · Design System | Plan C · Outcomes |
|---|---|---|---|
| Bea (beginner) | Some win | Aesthetic win | **Big win** |
| Eli (power user) | **Big win** | Modest win | Modest win |
| Devi (designer) | Deferred | Aesthetic win | **Big win** |
| Mobile depth | **Deepest** | Some via primitives | Basic |
| A11y depth | Tracker only | **Broadest** | Some |
| Visible payoff speed | Fast | Slow | Fast |
| Risk to existing users | Medium (Tracker rewrite) | Low | **High** (IA shift) |
| Foundation for future work | Some | **Strongest** | Medium |
| Competitive moat | **Strongest** | Weakest | Strong |
| Effort | High | Medium | Medium-high |
| Defers... | Designer features, visual sprawl | Workflow / IA | Visual sprawl, deep mobile |

---

## What's NOT in any plan (yet)

- Live multi-user collaboration on a chart.
- Cloud account / sign-in / hosted backups.
- Selling marketplace integration (Etsy / Lovecrafts API).
- AI-suggested palette or auto-recolour ("looks great" buttons).
- Native mobile app (we stay PWA).
- Multi-craft (knitting, crochet) editor abstractions.

These are intentional non-goals for the next round; they belong in a
future strategy doc, not this one.

---

## Recommendation

If forced to pick one: **Plan A**. The reasoning:

1. The Tracker is the only surface used in *every* persona's
   workflow ([ux-2 cross-persona summary](ux-2-user-journeys.md#cross-persona-summary)).
   It's also the weakest mobile experience and has the clearest
   competitive moat (Pattern Keeper's iOS gap).
2. Plan A's "two PRs that prove it" are the most independently
   shippable — each delivers value alone.
3. Plan A naturally creates the conditions for Plan B (the new mobile
   primitives become a starting point for design-system work).

But: **Plan C is the right pick if Bea's onboarding metrics are the
top business priority.** Bea is who the app needs to grow into the
mainstream. Plan C makes the first 60 seconds of her experience
dramatically better.

**Plan B is the right pick if engineering velocity is the constraint.**
The audit shows component sprawl is making every PR more expensive.
Plan B inverts that.

The user should pick based on which framing matches the strategic
priority. The wireframes in [reports/wireframes/](wireframes/) make
each plan concrete enough to compare.
