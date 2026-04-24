# UX Audit · 4 · Dashboard Deep-Dive

> Phase 1 / Step 4 — focused analysis of the home/dashboard surface.
> Standalone document because the dashboard is the user's primary
> re-entry point on every session.

---

## 1. Current state assessment

The dashboard lives in [home-screen.js](home-screen.js) and is mounted by
the Creator page when no project is loaded. It also appears (in `mode='home'`)
inside the Manager Pattern Library tab via [project-library.js](project-library.js).

There are **three layouts** depending on user state:

### 1.1 Empty state (no projects, no stash)

```
┌────────────────────────────────────────┐
│  Good evening, stitcher ★              │
│                                        │
│  ╔════════════════════════════════╗    │
│  ║  ⤓  Drop an image to start    ║    │
│  ║      or                        ║    │
│  ║  [Create blank]  [Browse]      ║    │
│  ║  [Import .oxs/.pdf/.json]      ║    │
│  ╚════════════════════════════════╝    │
└────────────────────────────────────────┘
```

What's there: greeting, drop-zone, three buttons, file inputs.

What's missing for a brand-new user:

- No **"try a sample pattern"** — `starter-kits.js` data exists, never offered.
- No **what is this app?** — the welcome wizard talks features, not value.
- No **screenshot or preview** of what the output looks like.
- No **path back** if they import a wrong file (silent failure).

### 1.2 Single-project layout (1 project)

```
┌────────────────────────────────────────────┐
│  Good evening, stitcher ★                  │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │ 1 projects │ 4 skeins │ 12% │ 3 h   │  │
│  └──────────────────────────────────────┘  │
│                       ✦ See your Showcase →│
│  ┌──────────────────────────────────────┐  │
│  │ [thumb] Continue stitching           │  │
│  │         Wildflower Meadow            │  │
│  │         ████░░░░░░  12% · yesterday  │  │
│  │         [Open]                       │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

What's there: stats row, hero card with thumbnail, "Showcase" link.

Eye lands on: greeting → stats → hero. Reasonable hierarchy.

What's odd: the stats row is itself a button (clickable to open Stats),
but there is no visual cue that it's interactive. The Showcase link only
exists in this layout, not multi-project — a discoverability hole.

### 1.3 Multi-project layout (>1 project) — `MultiProjectDashboard`

```
┌──────────────────────────────────────────────────────────┐
│  Good evening, stitcher ★                                │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ [t] Wildflower Meadow                            │    │
│  │     12% complete                       Continue →│    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  3 active projects · 1 247 stitches this month · 🔥 5-day│
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 💡 Suggestion: pick up "Mountain View"           │    │
│  │ You haven't stitched this in 7 days.             │    │
│  │ [Start now]                                      │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │  Card 1  │  │  Card 2  │  │  Card 3  │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│                                                          │
│  Up next  (2)                                  [+ Add]   │
│  · Compact row ·                                  [⋯]    │
│  · Compact row ·                                  [⋯]    │
│                                                          │
│  ▸ Paused (1)                                            │
│  ▸ Completed (3)                                         │
│  ▸ My designs (0)                                        │
│                                                          │
│  📊 View detailed stats across all projects →            │
└──────────────────────────────────────────────────────────┘
```

What's there:

1. **Sticky Continue bar** — most recent active project, one-tap resume.
2. **Summary bar** — active count · monthly stitches · streak (with 🔥 emoji,
   violating the no-emoji rule).
3. **Suggestion card** — algorithm-driven nudge with reason + emoji.
4. **Active projects** — full cards (thumb, progress, recency, est. remaining,
   stash badge, Continue + state-change menu).
5. **Up next** — compact rows; "+ Add" button (label-only, opens image picker).
6. **Paused / Completed / My designs** — collapsed sections.
7. **View detailed stats** link.

What can the user DO from here without navigating away:

- Resume the most recent project (sticky bar).
- Open any project (cards/rows).
- Change a project's state.
- Edit project details (via state menu).
- Start a new project (image picker via "+ Add").
- See suggestion reasoning.
- Open stats.

What they CAN'T do:

- Search for a project by name.
- Multi-select / bulk-archive.
- See the *thumbnails* of their queued/paused/completed projects (compact
  rows have small thumbs but completed strips don't preview).
- Open the stash manager (no link from the dashboard despite stash data
  driving the per-card "Need threads" badge).
- See *what they did yesterday* (no recent-activity timeline).
- See completion milestones / motivational artefacts.
- Import or back up data (only via header File menu).

---

## 2. Differences across user states

| User state | Layout | Critical issue |
|---|---|---|
| **Brand new (0 projects, 0 stash)** | Empty drop-zone | No sample pattern; no "what is this?" tour at the dashboard level |
| **Returning newbie (1 project, mid-stitch)** | Single hero | Hero card is the right idea, but only one "Continue" button — no quick path to "let me start a different project" or "show me other things to do" |
| **Active hobbyist (3-6 projects)** | Multi-project dashboard | Works reasonably, but Suggestion + Sticky bar can recommend the same project, doubling visual weight |
| **Power user (10+ projects, mixed states)** | Multi-project dashboard | No search, no filter, no multi-select; Up-next list grows long quickly |
| **Lapsed user returning after weeks** | Multi-project dashboard | Suggestion may pick up a stale project but offers no reorientation: there's no "Welcome back, here's what's new in your stash" or "Here's where you left Wildflower Meadow" |

---

## 3. Anti-patterns observed

| Anti-pattern | Status |
|---|---|
| **Empty state void** | ⚠️ Partial — empty state has a few action buttons but no sample / no value prop. |
| **Stale wall** | ✅ Avoided — projects are categorised by state (active, queued, paused, complete, design) rather than a flat grid. |
| **Feature dumping ground** | ⚠️ Partial — Suggestion + Stats link + state-change menu are all dashboard residents; no settings/announcements clutter, but the Suggestion competes with the Sticky Continue bar for the same eye. |
| **No emotional hook** | ⚠️ Partial — streak emoji and Suggestion exist but feel mechanical. No completed-project gallery, no "you finished 2 patterns this year", no celebration. |
| **Two paths to the same place** | ⚠️ Sticky Continue bar and the first card in Active grid are usually the same project — two CTAs for one action. |

---

## 4. Should-answer-instantly check

The dashboard should answer three questions in a glance.

### "Where did I leave off?"

- ✅ Sticky Continue bar shows name + thumb + percent.
- ❌ Doesn't show **what section** they were stitching (no breadcrumb).
- ❌ No "you stitched 247 stitches in your last session, 3 days ago".
- ❌ No mini-replay of the area they filled in.

### "How are my projects going?"

- ✅ Per-card progress bar.
- ✅ Per-card "last stitched X days ago".
- ⚠️ "🔥 5-day streak" gives a single number but not a calendar/heatmap on
  the dashboard itself.
- ❌ No visual fill-in of the patterns themselves — every card uses the
  *original* thumbnail, not a partial-stitched thumbnail. We have the data
  to render this; we don't.

### "What do I want to do right now?"

- ✅ Continue (sticky), Suggestion, Continue per-card.
- ⚠️ "Start something new" / "Add to queue" CTAs exist but are buried as
  `[+ Add]` text on the Up-next section header.
- ❌ No "browse my stash", "open the editor", or "go to stats" CTAs at
  card-array level — the only nav out of the dashboard is the global
  header.

---

## 5. Content candidates evaluation

For each candidate from the brief, my recommendation:

| Candidate | Verdict | Reason |
|---|---|---|
| Continue-where-you-left-off hero | **Keep & enrich** — already exists; needs "last session" context (stitches, time, area) and a partial-stitched thumbnail | High emotional + functional value |
| Pattern-fill-in progress visual | **Add (high priority)** — generate a partially-rendered thumbnail using `done` mask | Strong motivational hook with no real cost |
| Recent-activity timeline | **Add as collapsible section** — "This week" with date stamps | Resumability + sense of progress |
| Quick-start actions tailored to history | **Restructure existing buttons** as a single "Start something new" zone with sub-options (blank / image / import / sample) | Reduces empty-state void |
| Project health indicators | **Already partial** — "Last stitched X days ago" with warn at 14d. Could elevate "untouched 30+ days" gently as an opt-in `Revive` chip | Already present, polish only |
| Streak / milestones / completion celebration | **Promote** — currently a tiny "🔥 5-day" emoji. Replace with a dedicated, calm "This month" mini-stat block (no emoji) | Currently the weakest emotional surface |
| Finished gallery | **Link to Showcase** from multi-project view (currently only on single layout) | Closes the discovery hole |
| Aggregated shopping list | **Inline sub-section** (collapsed) when active projects flag missing threads | Currently scattered across Manager + per-project |
| Suggestion card | **Keep but de-duplicate** — if Sticky-bar project == Suggestion project, hide Suggestion (or re-rank) | Removes double-CTA |
| Greeting | **Keep** — small but warming | Costs nothing |
| Cross-project stats teaser (numbers) | **Keep** in single-layout, **add** to multi-layout as a single mini-strip above the cards | Symmetry between layouts |

Things that should NOT live on the dashboard:

- Settings / Preferences (header gear is right).
- Backup / restore (header File menu).
- Sync controls (header File menu).
- Help / shortcuts (header `?`).
- Embroidery sandbox / debug surfaces.
- Long-form announcements ("New feature: …" — keep that to release notes
  or a small badge on the gear).

---

## 6. Specific bugs / surprises in the current dashboard

| ID | Issue | Severity |
|---|---|---|
| **D-1** | Continue bar and Suggestion can show the same project — double CTA | 🟡 |
| **D-2** | Suggestion card uses 💡 emoji and "🔥 5-day streak" — violates [AGENTS.md](AGENTS.md) | 🟡 |
| **D-3** | "📊 View detailed stats" link uses 📊 emoji | 🟡 |
| **D-4** | Showcase link only on single-project layout | 🟢 |
| **D-5** | Per-card thumbnails are the *original* preview, not the partial-stitched view | 🟡 (lost emotional reward) |
| **D-6** | "+ Add" button on the Up-next section opens an image picker — but a user would also expect "+ Add to queue from existing pattern". Single-purpose label hides the choice | 🟡 |
| **D-7** | Stash readiness per card shows `null` (`Stash not checked`) for everyone because the dashboard hook never computes per-project thread coverage; only the Manager does | 🟡 (broken-feeling indicator) |
| **D-8** | Compact rows for Paused / Completed / My designs all use the same row component, making it hard to skim "what state is this in" without reading the section header | 🟢 |
| **D-9** | The `EditProjectDetailsModal` is gated by `typeof EditProjectDetailsModal !== 'undefined'` — silently fails on pages that don't load it (e.g. older Tracker context); no fallback toast | 🟢 |
| **D-10** | Sticky Continue bar is sticky **inside the dashboard scroll container** but if the page has its own outer scroll (header + dashboard) the stickiness is lost | 🟢 |
| **D-11** | No empty-state coaching for someone with only paused/completed projects (i.e. **no active**) — they get a tiny "No active projects" string with no nudge to "queue one up". | 🟡 |

---

## 7. Recommendations summary

The dashboard's bones are good — the categorisation, sticky continue bar,
and per-card recency are well-judged. The deficiencies are:

1. **Emotional flatness.** Pattern-fill-in thumbnails + a recent-activity
   timeline transform a list-of-projects into a stitching diary.
2. **De-duplication.** Sticky bar AND Suggestion AND Active grid often all
   point at the same project — pick one hero and let the others recede.
3. **Resumability.** Beyond "where", show "what" — last session stats
   under the Continue bar.
4. **Discoverability of secondary actions.** Search, multi-select, "Browse
   stash", "View stats" should be one hop away on the dashboard, not only
   on the global header.
5. **Honesty of the stash-readiness badge.** Either compute it or remove it —
   the current "Stash not checked" placeholder reads as a bug.
6. **Cohesion with Showcase.** Surface the Showcase link in both layouts
   and treat it as the "finished gallery" emotional payoff.
7. **House-rule compliance.** Replace the 🔥 / 💡 / 📊 / ✦ emoji with
   `Icons.fire` / `Icons.lightbulb` / `Icons.barChart` (already exist in
   [icons.js](icons.js)).

These are picked up in the Phase 2 proposals
([ux-4-proposals.md](ux-4-proposals.md)) at three different scopes.
