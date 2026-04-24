# UX Audit · Phase 3 — Decision Summary

> Phase 3 deliverable. **Stop here and pick a direction before any implementation work.**

This document distils the three proposals in [ux-4-proposals.md](ux-4-proposals.md) into a single decision aid: a side-by-side comparison, a recommendation, and a short list of stakeholder questions whose answers would change that recommendation.

---

## 1 · Side-by-side comparison

| Dimension | **A — Polish &amp; honesty** | **B — Re-shape the canvas** | **C — Workspace shell** |
|---|---|---|---|
| **One-line pitch** | Same shape, fix the rough edges. | Same shell, sharper canvas + dashboard. | Re-architect the app around three modes that share a workspace. |
| **Critical (🔴) problems solved** | 9 / 11 (82%) | 11 / 11 (100%) | 11 / 11 (100%) |
| **All problems solved (🔴+🟡+🟢)** | 27 / 60 (45%) | 46 / 60 (77%) | 56 / 60 (93%) |
| **Wireframes** | [a-home-empty](wireframes/a-home-empty.html) · [a-creator-firstcanvas](wireframes/a-creator-firstcanvas.html) · [a-creator-toolstrip](wireframes/a-creator-toolstrip.html) · [a-header](wireframes/a-header.html) · [a-tracker-resume](wireframes/a-tracker-resume.html) · [a-tracker-editmode](wireframes/a-tracker-editmode.html) · [a-dashboard](wireframes/a-dashboard.html) | [b-dashboard](wireframes/b-dashboard.html) · [b-creator-edit](wireframes/b-creator-edit.html) · [b-materials](wireframes/b-materials.html) · [b-tracker](wireframes/b-tracker.html) · [b-help](wireframes/b-help.html) | [c-workspace](wireframes/c-workspace.html) · [c-home](wireframes/c-home.html) · [c-home-empty](wireframes/c-home-empty.html) · [c-studio](wireframes/c-studio.html) · [c-stitch](wireframes/c-stitch.html) · [c-stitch-resume](wireframes/c-stitch-resume.html) · [c-stash](wireframes/c-stash.html) · [c-cmdbar](wireframes/c-cmdbar.html) |
| **Code surface touched** | ~20 files, mostly small | ~35 files; new shared `<MaterialsHub>`, `<HelpDrawer>`, partial-stitch thumb component | ~70 files; new shell, mode rail, command bar, inspector, focus-mode runtime |
| **New components** | 2–3 (coachmark, recap card, mode chip) | 6 (`<MaterialsHub>`, side-tabs, `<HelpDrawer>`, partial-stitch thumb, multi-select bar, `<ResumeRecap>`) | 12+ (`<ModeRail>`, `<ContextBar>`, `<Inspector>`, `<FloatingDock>`, `<CommandBar>`, `<FocusMode>`, `<HomeRow>` × 3, `<StashTwoPane>`, `<WelcomeBack>`…) |
| **Data model changes** | None | None — partial-stitch thumb is a derived render | None forced; mode persistence lives in `localStorage` |
| **Migration cost for existing users** | Zero — everything still where it was | Low — sub-page tabs renamed; muscle memory for two-key shortcut survives | High — full re-orientation; need a one-time guided tour |
| **Risk of regression** | Low | Medium — `creator/PrepareTab.js` and Materials UI are touched in non-trivial ways | High — every page changes; PWA install, deep links, sync engine all need re-validation |
| **Mobile parity** | Improved (44 px targets, modal full-screen) | Strong — drag-mark, bulk select, mini preview all feed mobile | Native-feeling — focus mode is designed mobile-first |
| **Designer fingerprints** | Same as today | Sharper, calmer | New visual language; "creative tool" feel |
| **Onboarding for new users** | Coachmark + sample row | Coachmark + sample + Materials walkthrough | Three-card "What would you like to do?" home + welcome back screen |
| **Effort sizing (rough)** | S | M | L–XL |
| **Reversibility** | Trivially reversible per change | Mostly reversible per surface | Architectural — hard to back out once shipped |
| **Quietly *not* solved** | Image-import wizard friction; designer/showcase polish; sync conflict UX | Help/Shortcut search depth; per-pattern thread substitution preview; offline conflict toast wording | The UX of legacy URL deep links (`?mode=stats` etc.); accessibility audit of focus-mode auto-hide |

(Problem-by-problem traceability is in §6 of [ux-4-proposals.md](ux-4-proposals.md).)

---

## 2 · Recommendation

**Ship A now. Plan B for the next quarter. Treat C as a strategic option, not a Q4 backlog item.**

Rationale:

1. **A is high-value-per-pound.** It clears every 🔴 except two (the image-import wizard and the dual-onboarding) using small, reversible PRs. Each item could ship independently and benefit users immediately. There is no path-dependence between items, and there is essentially no migration cost.
2. **B is the right second step *if A's improvements stick*.** Most of B's wins (mode-aware sidebar, partial-stitch thumbs, drag-mark, Materials hub) only become legible once A's "honest UI" is in place — otherwise we'd be reshaping a canvas while users are still confused by silent failure, hidden splitter, and dishonest stash toggle. B should be sequenced *after* A has shipped and we have a fortnight of telemetry/feedback.
3. **C should be pursued only if there is appetite for a true product re-launch.** It is not "more of B" — it is a different product story (a creative tool that also tracks stitching, like Procreate-for-cross-stitch). The gains over B are real (focus mode, command bar, two-pane stash, welcome-back surface, complete shell unification) but the risk surface is wide: PWA install, sync, deep links, every keyboard shortcut, every test, the accessibility model. Worth it if the product roadmap calls for "make this *feel* like a serious craft tool" — overkill if the goal is "make the existing tool less frustrating".

### Minimum viable next step (if you accept the above)

Ship from A in this order, each as its own PR:

1. Honest "Limit to stash" warning + Substitute CTA — fixes a trust bug.
2. Bold edit-mode banner + "Modify" relabel — fixes a destructive-action bug.
3. Resume modal with last-session recap — single highest emotional ROI.
4. Touch targets & header sub-page strip — unblocks mobile use.
5. Coachmark + sample row on empty Home — onboarding without a wizard.
6. Dashboard de-dup &amp; emoji removal — house rule alignment + clarity.
7. Compare button in toolstrip — discoverability win, two-line change.

Everything else from A can follow opportunistically. After (1)–(7), measure before committing to B.

### What to avoid

Do **not** mix A items with C architectural changes in the same release. The mode rail, command bar, and inspector are load-bearing for everything in C; partial adoption ("just the rail, just the inspector") creates the worst-of-both-worlds nav.

---

## 3 · Stakeholder questions that would change the recommendation

| # | Question | If YES → reconsider | If NO → recommendation stands |
|---|---|---|---|
| 1 | Is there a planned brand / visual refresh in the next two quarters? | Skip A's polish; bundle into the refresh as part of C. | Ship A now. |
| 2 | Do you have analytics on Tracker session length and frequency? | Optimise for whatever the data shows is the bottleneck (B if multi-session, C if single-session focus). | Trust the audit's qualitative ranking; ship A. |
| 3 | What is the user mix between **designers** (Studio-heavy) and **finishers** (Stitch-heavy)? | Heavy designer skew → B's Materials hub becomes more valuable. Heavy finisher skew → C's focus mode + welcome-back is worth the cost. | Even mix → A still wins. |
| 4 | Is mobile a primary platform or a secondary one? | Primary → C's focus mode and 44 px targets justify the effort. | Secondary → A's touch fix is enough. |
| 5 | Is there appetite for a re-launch / "new product" moment (App Store screenshot refresh, blog post, social campaign)? | Yes → C is the only proposal that gives you a story big enough to relaunch around. | No → A→B is the safer ladder. |
| 6 | Is the team comfortable with a 6–8 week shell-rewrite where the entire app shape is in flux? | Yes → C is feasible. | No → cap at B. |
| 7 | Do you intend to add **collaboration** or **cloud-first** features (shared stash, multi-device live tracking)? | Yes → C's command bar + mode rail makes the surface area easier to extend. | No → A or B is sufficient. |
| 8 | Is the icon library complete enough to retire every emoji today (per the house rule)? | Yes → A's emoji-removal can ship in week 1. | No → land the missing icons in `icons.js` first; emoji-removal becomes a small follow-up PR. |
| 9 | Are there any pending features that depend on the current sub-page structure (e.g. Pattern view tied to URL hash)? | Yes → A's "no structural change" stance becomes even more attractive. | No → B/C unblocked. |

---

## 4 · What "done" looks like for this audit

- **Phase 1** — discovery (4 reports): ✓ delivered.
- **Phase 2** — proposals (1 doc + 20 wireframes): ✓ delivered.
- **Phase 3** — decision summary: ✓ this document.
- **Phase 4** — hi-fi mockups + implementation roadmap: **blocked on stakeholder decision**.

Until a direction is picked, no implementation, no hi-fi work, no `creator/bundle.js` changes. Reply with one of:

- **"Go A"** — I'll draft a Phase 4 plan that turns the seven A items into PR-sized tickets.
- **"Go A then B"** — same, plus a 2-quarter roadmap with B's surfaces.
- **"Go C"** — I'll produce a Phase 4 architecture doc covering the shell, the command bar, the focus-mode runtime, and a migration plan.
- **"Mix"** — tell me which items from each proposal you want and I'll re-cost.

---

*End of Phase 3.*
