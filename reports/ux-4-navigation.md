# UX-4 — Information Architecture & Navigation Audit

> Phase 2 audit. Read [ux-3-domain-reference.md](ux-3-domain-reference.md) first.
> Findings are sorted by severity. Severity rubric:
> - **High** — blocks or seriously confuses one of the W1–W7 workflows
> - **Medium** — slows the user but has a workaround
> - **Low** — polish / consistency

---

## Scope

The three pages — Creator (`index.html`), Tracker (`stitch.html`),
Manager (`manager.html`) — share a header but otherwise have
independent navigation. This audit covers:

- Shared header ([header.js](../header.js))
- Creator top tabs and Materials sub-tabs
  ([creator/MaterialsHub.js](../creator/MaterialsHub.js),
  [creator/useCreatorState.js](../creator/useCreatorState.js))
- Tracker view modes / sidebars / toolbars
  ([tracker-app.js](../tracker-app.js))
- Manager tabs and panels ([manager-app.js](../manager-app.js))
- Home / project pickers
  ([home-screen.js](../home-screen.js),
  [project-library.js](../project-library.js))
- Help drawer, onboarding wizard, command palette
  ([help-drawer.js](../help-drawer.js),
  [onboarding-wizard.js](../onboarding-wizard.js),
  [command-palette.js](../command-palette.js))

---

## High-severity findings

### N-H1 · Asymmetric cross-page navigation
**Where:** [creator-main.js](../creator-main.js#L729),
[tracker-app.js](../tracker-app.js#L2227),
[header.js](../header.js#L93-L95)

The Creator surfaces a "Track ›" button to jump to the Tracker. The
Tracker surfaces "Edit Pattern" to jump to the Creator. The Manager
surfaces *neither* — to "open in tracker" from a Manager pattern card a
user must navigate via the header tab and then re-pick the project.
The two surfaces that share an object (a project) don't share a verb
to act on it.

**Impact:** Eli (juggling 30+ WIPs from the Manager) has to
context-switch every time he wants to start stitching a different
pattern. Bea may never realise she can edit her saved pattern at all.

### N-H2 · Materials sub-tab labels do not parallel the parent
**Where:** [creator/MaterialsHub.js](../creator/MaterialsHub.js#L68),
[creator/useCreatorState.js](../creator/useCreatorState.js)

Top tab is "Materials & Output" — a noun + noun. Sub-tabs are
"Threads / Stash status / Shopping / Output" — three nouns and a
noun-status-noun. "Output" appears at both levels, which is its own
problem (see N-H3). "Stash status" is a hybrid label whose distinction
from "Threads" is unclear without entering the tab.

**Impact:** Bea can't form a mental model for "where is the print
button?". Eli has to learn the hierarchy before it sticks.

### N-H3 · Primary export action buried two tabs deep
**Where:** [creator/MaterialsHub.js](../creator/MaterialsHub.js#L88-L116),
[creator/ExportTab.js](../creator/ExportTab.js#L33-L70)

To download the most-requested artifact (a printable PDF) from a fresh
generation, the user must:

1. Click "Materials & Output" top tab
2. Click "Output" sub-tab (skipping past Threads, Stash, Shopping)
3. Pick a preset
4. Expand "Format & settings" (collapsed by default)
5. Click "Export PDF"

That's 5 deliberate clicks for the *primary* W1 outcome, and the user
has to know which preset (Pattern Keeper vs Home Printing) they want
*before* the first click. Bea reliably misclicks Threads/Stash/Shopping
on the way (see persona ux-2 step 10).

**Impact:** This is the single biggest blocker for W1 (photo → PDF).

### N-H4 · Cross-page sync of identical state has no visible marker
**Where:** [manager-app.js](../manager-app.js#L31-L45),
[creator/MaterialsHub.js](../creator/MaterialsHub.js#L25-L26),
[stash-bridge.js](../stash-bridge.js)

The Manager owns the canonical thread inventory in
`stitch_manager_db`. The Creator's "Stash" sub-tab reads through
`stash-bridge.js`. The two views look like independent databases — no
"synced from Manager" badge, no "this also affects Manager" warning
when editing.

**Impact:** Bea adds threads in the Creator and worries the Manager
doesn't know. Eli edits in the Manager and the open Creator window
stays stale until refresh (depending on the bridge's listener wiring).

### N-H5 · Unnamed-project gate at the worst moment
**Where:** [creator/useProjectIO.js](../creator/useProjectIO.js#L116-L120)

When the user clicks "Open in Tracker" or saves a fresh generation,
they are blocked by a name-prompt modal *before* the project is
created. The user has just generated a chart and wants to keep
working; instead they're asked to commit to a name.

**Impact:** Breaks the W2 handoff flow. Eli wants instant continuation;
Bea doesn't yet have a name in mind.

---

## Medium-severity findings

### N-M1 · Header has no "you-are-here" indicator on narrow viewports
**Where:** [header.js](../header.js#L239-L250)

The header tabs swap to an icon-only / overflow form on phones. There's
no breadcrumb, no page title, and the active tab indicator is subtle.

**Impact:** Bea, after using the command palette to switch pages on her
phone, can be unsure which page she's on for several seconds.

### N-M2 · Breadcrumb pattern only used on Materials Hub
**Where:** [creator/MaterialsHub.js](../creator/MaterialsHub.js#L244-L249)

Pattern, Project, and other Creator tabs have no breadcrumb. Materials
Hub has one. The pattern feels arbitrary.

**Impact:** Wayfinding inconsistency; users expect either everywhere or
nowhere.

### N-M3 · Project-picker terminology differs across pages
**Where:** [tracker-app.js](../tracker-app.js#L383),
[manager-app.js](../manager-app.js#L1201)

Tracker says "Switch project". Manager says "Saved Cross-Stitch
Projects (N)". Same conceptual action, three different labels (Creator
also has a project-open flow with its own copy).

**Impact:** Eli has to learn the synonyms; Bea may not realise the
Manager also lets her pick a project.

### N-M4 · Command palette doesn't distinguish current-page from cross-page actions
**Where:** [command-palette.js](../command-palette.js#L75-L120)

Switch-page commands appear in the same flat list as in-page commands.
On the Creator, "Switch to Creator" still appears (a no-op). Recent
projects always say "Continue tracking" regardless of whether the
project is in tracker mode or fresh generation.

**Impact:** Cognitive overhead; weak information scent.

### N-M5 · "Currently Tracking" badge in Manager doesn't name the project
**Where:** [manager-app.js](../manager-app.js#L1169-L1172)

Manager shows a "Currently Tracking" badge with a "Go to Tracker →"
link, but doesn't name *which* project is being tracked or its
progress.

**Impact:** Eli with multiple WIPs has to click through to find out.

### N-M6 · Welcome wizard stacks on the Tracker project picker
**Where:** [onboarding-wizard.js](../onboarding-wizard.js#L1-L80),
[tracker-app.js](../tracker-app.js#L2700)

First-time visitor to the Tracker sees the Welcome Wizard *and* the
project picker modals at once, with the wizard layered on top.

**Impact:** First impression is "two pop-ups"; Bea is more likely to
dismiss both without reading.

### N-M7 · Manager's Patterns "Track" button is an unclear verb
**Where:** [manager-app.js](../manager-app.js#L1219)

The Track button on a saved-pattern card doesn't make clear whether it
*starts* tracking (resets progress?) or *resumes* tracking (preserves
state). Tooltip is missing.

**Impact:** Eli is paranoid about losing progress and may avoid the
button.

### N-M8 · No reciprocal "Open in Tracker" / "Edit in Creator" on Manager pattern cards
**Where:** [manager-app.js](../manager-app.js#L1219), pattern card markup

Cards show "Track" but not "Edit". To edit a pattern Eli must navigate
to Creator and re-open the project from the home screen.

**Impact:** Workflow detour; Eli's "tweak the palette of WIP X" task
takes 4 clicks instead of 1.

---

## Low-severity findings

### N-L1 · Help drawer and command palette overlap
Two affordances (help drawer 'Search help', command palette 'Cmd+K')
do similar things but with different scopes (docs vs actions). Many
users discover only one. **Fix:** unify under a single command/search
launcher.

### N-L2 · Onboarding wizard skip lacks explanation
Skipping the wizard removes both the help cards and the suggested
first project; users don't know they can re-summon it later.

### N-L3 · Header logo is not a "home" link consistently
On some pages clicking the logo goes to the home dashboard; on others
it does nothing (depending on which page is current).

### N-L4 · "Materials & Output" is the wrong noun pair
"Materials" and "Output" don't share a category. Output is an action
(noun-form). Better grouping options: "Threads & Materials" + "Print &
Export" as siblings, or fold Output into the Pattern tab as a primary
action.

### N-L5 · Manager's "Patterns" tab uses a different empty-state pattern from Creator's empty home
Inconsistent visual / copy treatment of "you have nothing yet".

---

## Patterns and themes

Three patterns recur across these findings:

1. **Cross-page object continuity is broken** (N-H1, N-H4, N-M5,
   N-M8). A "project" exists in all three pages but the navigation
   doesn't carry the user from page to page along the project's
   identity.
2. **Primary actions are buried** (N-H3, N-H5). The most-frequent
   outcome of any session — print or save — is consistently 3+ clicks
   deep.
3. **Vocabulary is inconsistent** (N-H2, N-M3, N-L4). The same nouns
   ("Output", "Stash", "Track") appear at different levels with
   different meanings.

The Phase 3 proposals must address at least these three patterns. See
[ux-9-prioritised-issues.md](ux-9-prioritised-issues.md).
