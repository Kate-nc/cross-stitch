# Help & Tooltip System — Design Proposal Ranking

**Date:** 2026-05-02  
**Proposals evaluated:** A (Sliding Panel), B (Inline Hints + Modal), C (Coach Marks + Widget), D (Hover Cards + Pin), E (Ultra-Rich Tooltips)  
**Scoring scale:** 1–5 (higher is better for all criteria)

---

## Scoring Matrix

| Criterion | A — Sliding Panel | B — Inline Hints + Modal | C — Coach Marks + Widget | D — Hover Cards + Pin | E — Ultra-Rich Tooltips |
|---|:---:|:---:|:---:|:---:|:---:|
| **Implementation Complexity** | 3 | 4 | 2 | 4 | 5 |
| **User Learning Curve** | 4 | 5 | 3 | 4 | 4 |
| **Scalability** | 5 | 4 | 3 | 4 | 4 |
| **Accessibility Compliance** | 4 | 5 | 3 | 4 | 3 |
| **Mobile Experience** | 4 | 5 | 4 | 3 | 3 |
| **Content Maintenance Burden** | 5 | 4 | 3 | 4 | 5 |
| **Intrusiveness** | 5 | 4 | 2 | 5 | 5 |
| **Discoverability** | 4 | 4 | 5 | 3 | 2 |
| **Weighted Total** | **34** | **35** | **25** | **31** | **31** |

---

## Criterion-by-Criterion Justification

### Implementation Complexity (lower score = harder to build)

**A — 3.** The sliding panel is straightforward React, but requires a clean viewport management system (panel width, scroll lock on mobile, focus trap on close). Popover positioning for the info icons needs a flip algorithm.

**B — 4.** Focus-triggered inline hints are a CSS/transition system with minimal JS — the simplest tooltip interaction of the five. The modal help centre is a standard dialog pattern. This has the smallest surface area for bugs.

**C — 2.** Coach marks require a spotlight system (position tracking across renders and scroll), step state management, a "replay" mechanism with state reset, and a separate floating widget. The most pieces to build and maintain.

**D — 4.** Hover cards are a slightly more complex tooltip (rich HTML content, pin state) but follow a well-trodden pattern. Positioning logic must handle viewport edges and scroll containers, but this is a solved problem.

**E — 5.** Ultra-rich tooltips are self-contained — each tooltip is a component with two layers (collapsed/expanded) and an inline feedback mechanism. The *hardest* part (content volume) is editorial, not engineering. No global state management or portal positioning complexity.

---

### User Learning Curve (higher = easier to learn)

**A — 4.** The "?" button with a keyboard hint is a familiar pattern. Sliding panel is immediately understandable. Some users may not know to look for it.

**B — 5.** Inline hints that appear on focus require zero discovery — the help appears exactly when the user is interacting with the element. This is the most natural delivery mechanism. The modal help centre is also familiar (like a docs site).

**C — 3.** The tour is excellent for first-timers but teaches the UI by walking through it — users who skip it get a floating "?" widget with no obvious feature-to-help mapping. Power users find the tour intrusive.

**D — 4.** Hover cards are a deeply familiar pattern (documentation sites, design tools). The "pin" feature is intuitive once discovered. The "read more" link in each card establishes a clear path to deeper content.

**E — 4.** The collapsed/expanded tooltip pattern is novel but self-explanatory. "Show more" is universally understood. The feedback loop (thumbs) is ubiquitous. The risk: if users don't hover over the "?" icon, they never find the help.

---

### Scalability (higher = scales better as the app grows)

**A — 5.** A centralised panel with search, categories, and articles scales to any number of topics. New help content added to the panel is automatically searchable. Navigation is independent of the main UI.

**B — 4.** The modal scales well as a content store. The inline hints scale well per-field. However, very long articles feel out of place in a modal that was sized for browsing. An escape to a full-page docs URL may be needed for very long content.

**C — 3.** Tours are expensive to maintain as the UI evolves — every layout change risks breaking spotlight positions. The widget's quick-link list needs curation. Coach marks work best for fixed, stable flows; creator workflows in this app are highly dynamic.

**D — 4.** Hover cards scale well; each card is independent. The "read more" links decouple the cards from deep content (the docs page can grow without changing the cards). However the positioning system becomes complex in dense UIs.

**E — 4.** A single JSON registry of all help content scales well for authoring. Embedded content avoids link rot. However, very complex help topics (e.g., full dithering mode comparison) strain the tooltip container — you eventually need an escape to a longer-form document.

---

### Accessibility Compliance (higher = more accessible)

**A — 4.** A `role="complementary"` panel with proper focus management, heading structure, and keyboard trigger maps well to WCAG 2.1 AA. Gap: info icon popovers need `aria-describedby`, role="tooltip", and Escape-dismiss to be fully compliant.

**B — 5.** Focus-triggered hints are the most accessible pattern: they appear at the same point in the tab order as the field, don't require mouse interaction, and naturally pair with `aria-describedby`. The modal uses standard dialog semantics. No hover-only interactions.

**C — 3.** Coach mark spotlights must announce steps to screen readers (`role="dialog"`, live region), step count must be announced, and the overlay must trap focus. This is achievable but requires careful implementation. The widget is accessible, but the tour itself is the problematic surface.

**D — 4.** Hover cards are keyboard-accessible (triggered on focus, dismissable with Escape). The "pin" functionality needs proper `aria-expanded` and state tracking. The pattern is well-precedented and has good WCAG mapping.

**E — 3.** Ultra-rich tooltips must fire on focus as well as hover (implemented in the proposal). The collapsed/expanded state needs `aria-expanded`. The inline feedback buttons need accessible labels. The nested interactive elements inside the tooltip (expand button + feedback) create a complex keyboard interaction model that needs careful implementation.

---

### Mobile Experience (higher = better touch UX)

**A — 4.** Panel slides to full-width sheet on narrow viewports. Popovers adapt position. The only gap: on iOS Safari, the 300ms click delay may affect popover responsiveness (mitigated by `touch-action: manipulation`).

**B — 5.** Inline hints triggered on focus work perfectly on mobile — when the user taps a field to edit it, the hint appears immediately below. No hover dependency. The modal is a standard sheet on mobile.

**C — 4.** The widget works as a floating button (well-established on mobile). Coach marks require careful viewport calculation for the spotlight on small screens — elements may shift when the keyboard opens. Manageable but requires extra mobile testing.

**D — 3.** Hover cards have no equivalent on touch. The proposal would need a tap-to-trigger fallback for the info icon, and pinned cards take up significant screen space on mobile. The implementation gap between hover and touch is the largest of any proposal.

**E — 3.** Same as D: hover trigger needs a tap-to-toggle fallback on mobile. The expanded tooltip can be tall and take up most of the screen on a phone, with no natural close affordance unless a dismiss button is added. Doable but requires significant mobile adaptation.

---

### Content Maintenance Burden (higher = easier to maintain)

**A — 5.** All help content lives in a single JS/JSON data file. The panel renders it. Adding a new help topic is adding one entry to the data file — no HTML to write, no layout to manage.

**B — 4.** Two content registries: one for inline hint strings (one sentence per field), one for full modal articles. Both are manageable. The hints must stay in sync with field labels, which adds a minor maintenance burden as UI evolves.

**C — 3.** Tour steps are tightly coupled to DOM element IDs. Any UI restructuring (e.g., moving a setting to a different section) breaks the spotlight. Quick-link article titles in the widget must be curated manually. This is the most fragile of the five proposals.

**D — 4.** Each hover card's content is independent and co-located with the component it documents. Easy to update. The "read more" deep links must be maintained (a broken link is embarrassing). A URL registry helps.

**E — 5.** All content in a single registry (JSON or JS object). No separate article pages to write or maintain. Adding a new tooltip is adding one entry. The tradeoff: very long explanations feel cramped, but within the scope of this app's content needs, the registry approach is the lowest overall maintenance burden.

---

### Intrusiveness (higher = less intrusive for experienced users)

**A — 5.** The panel only opens when explicitly invoked. Popovers only appear on click of an info icon. Zero passive interruptions.

**B — 4.** Inline hints only appear on focus — experienced users who tab quickly through fields see a brief flash of the hint, but it disappears the moment they move on. Not intrusive in practice.

**C — 2.** The guided tour fires automatically on first visit and interrupts the entire UI with a spotlight overlay. Even with a "Skip" button, this is the most intrusive of the five. Returning users who replay it may find it tedious. The corner widget is fine, but the tour is the core conceit.

**D — 5.** Hover cards only appear when hovering over the info icon — a completely intentional, opt-in interaction. Pinned cards stay open only when explicitly pinned. Zero passive interruptions.

**E — 5.** No automated triggers. Rich tooltips only appear when the user hovers/focuses the "?" icon. Zero passive interruptions.

---

### Discoverability (higher = easier to find help when confused)

**A — 4.** The "Help" button in the header is always visible and has a keyboard shortcut hint. From any state of confusion, there is one obvious path to help.

**B — 4.** The "Help Centre" button is visible in the header. Inline hints appear without searching — if you are confused about a field, focusing it shows you the hint automatically.

**C — 5.** The animated tour ensures first-time users are walked through every key concept before they get confused. The corner widget is a constant visual reminder that help exists. Highest first-run discoverability.

**D — 3.** Info icons must be noticed and associated with "there is help here". Less visible than a "Help" button. Users who don't hover-explore the UI may never find the cards. The docs link in the header helps.

**E — 2.** No dedicated help entry point — only small "?" icons next to fields. Users who don't know help is embedded have no obvious path to it. The pattern works well once discovered but has the worst cold-start discoverability of the five.

---

## Summary Table

| Proposal | Best for | Watch out for |
|---|---|---|
| **A — Sliding Panel** | Power users; scalable help ecosystems | Panel width on smaller laptops; popover ARIA wiring |
| **B — Inline Hints + Modal** | Beginners; forms; mobile-first | Hints on non-form elements (icon buttons, canvas tools) |
| **C — Coach Marks + Widget** | Onboarding-heavy flows; marketing demos | Tour breakage on UI changes; poor returning-user experience |
| **D — Hover Cards + Pin** | Desktop power tools; documentation-oriented UX | No hover = no help on mobile; pin state management |
| **E — Ultra-Rich Tooltips** | Minimalist UX; content-light surfaces | Low discoverability; long content strains the container |

---

## Recommended Pick: **Proposal B (Inline Hints + Modal) as the base, with Proposal A's panel for long-form articles**

### Rationale

The audit (all 8 Phase 1 reports) reveals two clearly distinct help needs:

1. **Field-level help for the generation settings sidebar** — users are confused at the exact moment they interact with a specific control. This is a textbook use case for B's focus-triggered inline hints, which require no discovery and no mouse.

2. **Topic-level help for whole features** — Stats page, Stitch Tracker stitching style, Materials Hub, export presets. These need a few paragraphs, not a one-sentence hint. This is where A's sliding panel (or a conventional modal) adds value.

The combination — inline hints at the field level, with a "Learn more" link that opens a modal/panel article — is precisely what Phase 1 Agent #3 called out as the recommended solution for the "generation settings overwhelm" pain point (the #1 most dangerous stuck point).

**Why not C?** The coach mark tour is excellent for a first-run experience and could be added as a layer on top of the winning proposal. But as the *primary* help system it is too fragile (breaks with every UI change) and too intrusive for returning users. Recommend adding a lightweight first-run tour on top of B/A's implementation in Phase 3.

**Why not D?** The pin feature is genuinely useful, but hover-only trigger is a blocker given the app's mobile usage and the WCAG 2.1 requirements surfaced in Agent #5. D and B converge once you add focus-trigger to D's cards — at that point B's approach is cleaner and simpler.

**Why not E?** Excellent intrusiveness score, but the discoverability problem is real — the app has whole sections (Stats, Tracker stitching style) with no info icon to trigger a tooltip from, and confusing empty states that need a "get started" path rather than a field-level hint.

### Close calls

- **A vs B** on Implementation Complexity: both are genuinely similar effort. If the team wants to ship the inline hints first and add the panel later, that is a valid phased approach.  
- **B vs D** on Accessibility: B wins purely because focus-triggered hints are the more natural WCAG pairing. D requires explicit tooltip ARIA role + `aria-describedby` wiring that is easy to forget; B's hint-below-field pattern can use `aria-describedby` more naturally.
- **C for onboarding only**: Proposal C's coach mark system is worth implementing as a *first-run overlay* on top of the B/A system, scoped to the 5-step "key settings" tour. This gives the best of both worlds: a guided tour for new users, plus persistent contextual help for everyone.

---

*Review these proposals and the ranking, then select a direction. Phase 3 implementation will begin after selection.*
