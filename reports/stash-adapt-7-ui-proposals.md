# Stash-Adapt — Phase 2.4 — UI Approach Proposals

Three distinct interaction models. The wireframes accompanying this
report (`reports/stash-adapt-wireframes/`) render each one.

## Approach A — Review Table (recommended)

**Mental model:** the paper notebook page that experienced stitchers
already use. One row per source colour; original on the left, suggested
substitute on the right; everything visible at once.

### Layout (desktop)

```
 ┌────────────────────────────────────────────────────────────────┐
 │ ◀ Back │ Adapting "My Pattern"     [Original | Adapted] │ Done │
 ├────────┴────────────────────────────────────────────────┴──────┤
 │ [Stash] [Brand] [Manual]    Sort ▾   Filter ▾   ↻ Re-match    │
 ├────────────────────────────────────────────────────────────────┤
 │ ╔ Banner: 23 close, 4 fair, 3 no match  [Add missing to list] ║
 ├────────────────────────────────────────────────────────────────┤
 │ ▦ Pattern thumbnail (compact)                                  │
 ├────────────────────────────────────────────────────────────────┤
 │ ●  DMC 310 Black            →  ●  DMC 310 Black     [✓]  ●●●● │
 │      152 stitches              In stash · 2 skeins   exact     │
 │                                                                │
 │ ●  DMC 824 Blue VD          →  ●  DMC 939 Navy VD   [✓]  ●●●  │
 │      88 stitches               In stash · 1 skein    good      │
 │                                                                │
 │ ●  DMC 3801 Melon Dark      →  ●  DMC 309 Rose Dark [⚠]  ●●   │
 │      54 stitches               In stash · 1 skein    fair      │
 │                                                                │
 │ ●  DMC 3849 Lt Teal Green   →  (no stash match)     [!]  ○○○○ │
 │      41 stitches               Add to list │ Pick another      │
 │ …                                                              │
 └────────────────────────────────────────────────────────────────┘
```

### Pros

- Mirrors the workflow stitchers already use mentally; zero learning
  curve.
- Complete visibility — you can see whether the auto-match is sound
  *before* committing.
- Sort / filter let you triage a 100-colour pattern fast.
- Easy to add columns later (skein count, cost, etc.).

### Cons

- Visually denser than the alternatives. A first-time user might be
  overwhelmed by an 80-colour HAED.
- Mobile requires careful row layout; rows are wider than tall, which
  fights single-column phone layouts.

### Click count (30-colour pattern, accept all)

3 clicks: *Adapt* → *To stash* → *Done*.

### Edge cases

- 100+ colours: filter "Issues only" reduces visible count to typically
  < 20; sort puts heavy-stitch colours first; review remains tractable.
- Mobile: rows stack vertically (source above target); filter strip
  scrolls horizontally; preview toggle stays on the sticky thumbnail.
- Empty stash: every row shows the same `no stash match` state with a
  prominent banner pointing at Brand / Manual.

---

## Approach B — Pattern-First Preview

**Mental model:** "tell me what the substituted pattern looks like." The
canvas is the primary surface. Tap a colour on the canvas (or in a
sidebar palette) to inspect / edit its substitution.

### Layout (desktop)

```
 ┌────────────────────────────────────────────────────────────────┐
 │ ◀ Back │ Adapting "My Pattern"     [Original | Adapted] │ Done │
 ├────────┬────────────────────────────────────────────────┴──────┤
 │ Palette│                                                        │
 │ ●  310 │            ┌──────────────────────────────────┐       │
 │   ●●●●│            │                                  │       │
 │ ●  824│            │     Pattern preview (adapted)    │       │
 │   ●●● │            │                                  │       │
 │ ●  3801│            │     Click any colour to edit    │       │
 │   ●●  │            │     its substitution             │       │
 │ ●  3849│            │                                  │       │
 │   ○○○○│            └──────────────────────────────────┘       │
 │  …    │                                                        │
 ├───────┴────────────────────────────────────────────────────────┤
 │ Selected: DMC 3849 Lt Teal Green  →  (no stash match)          │
 │                                  [Pick replacement] [Skip]     │
 └────────────────────────────────────────────────────────────────┘
```

### Pros

- Visual-first: spotting "that doesn't look right" is easy because the
  preview *is* the primary surface.
- Calmer for casual users — only one "active" colour at a time.
- Click-to-inspect maps cleanly to mobile (tap is the same).

### Cons

- Systematic review of every colour is harder — the user has to
  remember which they've inspected. Easy to ship a half-reviewed
  adaptation.
- The "is this match good?" question requires looking back and forth
  between the preview and the row.
- The "no match in stash" colours are easy to miss if they're scarce in
  the pattern (a 41-stitch issue on a 90 000-stitch chart is invisible
  on a thumbnail).

### Click count (30-colour, accept all)

3 clicks (same as A — the auto-pass produces an immediately usable
result; clicking through the previewed pattern isn't strictly required).
But a *thorough* review balloons to 30+ clicks (one per colour).

### Edge cases

- Empty stash: preview shows the original pattern unchanged (no
  substitutions applied) — visually misleading. We'd need a banner to
  prevent confusion.
- Mobile: the canvas dominates; the palette sidebar collapses to a
  drawer; the row detail moves to a bottom sheet.
- 100+ colours: palette sidebar scrolls; no built-in mechanism to spot
  unreviewed rows. Would need additional UI (e.g. "13 unreviewed").

---

## Approach C — Wizard

**Mental model:** "walk me through this." Three explicit steps:
*Choose what to adapt* → *Review matches* → *Confirm*.

### Layout (desktop)

Each step is a centred card, ~640 px wide.

**Step 1 — Choose source**
- Three big buttons: *To my stash* / *To Anchor* / *Pick manually*.
- Sub-text under each explaining when to use it.

**Step 2 — Review**
- Same table as Approach A, but with a footer-only "Continue" button
  and back/next progress chrome.

**Step 3 — Confirm**
- Summary: "23 colours matched closely, 4 are approximate, 3 will need
  shopping" with an *Add to list* checkbox and a *Save adapted pattern*
  button.

### Pros

- Beginner-friendliest; very clear progression.
- Forces an explicit confirmation step → reduces "I didn't realise that
  saved" complaints.
- Marketable in onboarding tours.

### Cons

- More clicks for repeat users (the spec target audience).
- Step 1's three options expose a decision the user might not be
  qualified to make on first encounter (which mode? what does "Anchor"
  mean if I don't own any?).
- Wizards tend to acquire scope creep over time; harder to discontinue
  once shipped.

### Click count (30-colour, accept all)

5 clicks: *Adapt* → *Adapt to my stash* (Step 1) → *Continue* (Step 2) → *Save adapted pattern* (Step 3) → close summary toast.

### Edge cases

- Empty stash: Step 1's *To my stash* button is disabled with a tooltip
  ("Your stash is empty"). Forces the user to decide between Brand and
  Manual upfront, which is less forgiving than A or B's
  inline-banner-with-actions approach.
- 100+ colours: Step 2 is the same as A → fine.
- Mobile: each step becomes a full-screen view with a top-bar back
  button. Three views to navigate is heavy on a phone.

---

## Comparison

| Criterion | A — Table | B — Pattern-first | C — Wizard |
|---|---|---|---|
| Click count (best case) | **3** | 3 | 5 |
| Click count (thorough review, 30c) | 3 + per-row tap | **30+** | 3 + per-row tap |
| Mobile-friendliness | medium (rows wide) | **high** | low (multi-screen) |
| Review completeness | **high** | low | high |
| Honesty (poor matches surfaced) | **high** | medium (easy to miss) | high |
| First-time user comfort | medium | medium | **high** |
| Repeat-user efficiency | **high** | high | low |
| Implementation cost | medium | high (canvas integration) | medium |
| Reuse of existing modal code | **high** | low | medium |
| Empty-stash story | **clean banner** | confusing | needs disabled-state UX |

## Recommendation: **Approach A**, with one borrow from B

A best matches the "honest match-quality" hard rule and the spec's bias
toward explicit review. It's also the highest-reuse path — the existing
substitute modal already renders a review-table-shaped UI; this is the
graduation of that prototype into the proper feature.

**Borrow from B:** the canvas preview shouldn't be hidden behind a tab.
Keep it as a small but always-visible thumbnail on the right of the
review screen on desktop, and a sticky strip on top on mobile, so users
get the at-a-glance visual gut-check without ever leaving the table.
This addresses A's main weakness (no visual feedback) without paying B's
review-completeness cost.

The toggle button (*Original* / *Adapted*) operates on that thumbnail.

## Hybrid sketch (the recommendation)

```
 ┌────────────────────────────────────────────────────────────────┐
 │ ◀ Back │ Adapting "My Pattern"     [Original | Adapted] │ Done │
 ├────────┴────────────────────────────────────────────────┴──────┤
 │ [Stash] [Brand] [Manual]   Sort ▾  Filter ▾  ↻ Re-match       │
 ├──────────────────────────────────────────┬─────────────────────┤
 │ ╔ Banner: 23 close, 4 fair, 3 no match ║ │  ┌──────────────┐  │
 │                                          │ │  │ Adapted     │  │
 │ ●  310 Black     →  ●  310           ●●●●│ │  │ thumbnail   │  │
 │ ●  824 Blue VD   →  ●  939 Navy VD   ●●● │ │  │  (live)     │  │
 │ ●  3801 Melon    →  ●  309 Rose      ●●  │ │  └──────────────┘  │
 │ ●  3849 Teal     →  (no match)       ○○○○│ │                   │
 │  …                                        │ │  Issues: 7        │
 │                                          │ │  Manual edits: 0  │
 └──────────────────────────────────────────┴─────────────────────┘
```

Mobile: the right column collapses; thumbnail moves to a sticky strip
above the table.
