# WF-05: Home Page First-Run State

**Addresses:** FI-07, R12
**Phase:** 1 (low effort)
**Location:** home.html / home-app.js

---

## Trigger Condition

Show first-run state when `ProjectStorage.listProjects()` returns an empty list
AND no `crossstitch_active_project` key is found in localStorage.

On subsequent visits (any project exists), show the normal project dashboard.

---

## First-Run Layout (Desktop)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [logo]  Cross Stitch Studio                         [Theme] [Help] [Menu]   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                                                              │
│                       Welcome to StitchX                                   │
│                                                                              │
│              Free forever · No account needed · No export limits            │
│                                                                              │
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                                                                    │    │
│   │    [Photo icon]                                                    │    │
│   │    Convert a photo to a pattern                                    │    │
│   │    Upload any image — we handle the rest                           │    │
│   │                                                                    │    │
│   │                          [ Start creating ▶ ]                      │    │
│   │                                                                    │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│   ┌──────────────────────────────┐  ┌──────────────────────────────────┐   │
│   │  [Grid icon]                 │  │  [Download icon]                  │   │
│   │  Start from a template       │  │  Import existing pattern          │   │
│   │  Beginner-friendly starters  │  │  .oxs, .json, .pdf, image         │   │
│   │                              │  │                                   │   │
│   │  [ Browse templates ]        │  │  [ Import file ]                  │   │
│   └──────────────────────────────┘  └──────────────────────────────────┘   │
│                                                                              │
│   ─────────────────────────────────────────────────────────────────────     │
│                                                                              │
│   One app for the whole journey:                                             │
│                                                                              │
│   [Needle icon] Create patterns    [Checkmark icon] Track stitching          │
│   from photos or from scratch      stitch by stitch, row by row              │
│                                                                              │
│   [Thread icon] Manage your stash  [Chart icon] Rich statistics              │
│   track DMC & Anchor inventory     22 insights about your stitching          │
│                                                                              │
│   Works offline · No data ever leaves your device                            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## First-Run Layout (Mobile, portrait)

```
┌──────────────────────────────────────┐
│  StitchX                    [Menu]   │
├──────────────────────────────────────┤
│                                      │
│      Welcome to                      │
│      StitchX                         │
│                                      │
│  Free · No account · No limits       │
│                                      │
├──────────────────────────────────────┤
│                                      │
│  [Photo icon]                        │
│  Convert a photo to a pattern        │
│  Upload any image                    │
│                                      │
│  [ Start creating ▶ ]                │
│                                      │
├──────────────────────────────────────┤
│                                      │
│  [ Browse templates ]                │
│  [ Import existing pattern ]         │
│                                      │
├──────────────────────────────────────┤
│                                      │
│  Create · Track · Stash · Analyse    │
│  Everything in one free app.         │
│                                      │
└──────────────────────────────────────┘
```

---

## Content Strategy

**Headline:** "Welcome to [App name]" — personal, not product-marketing speak
**Subline:** Three facts that directly address the most common hesitations:
  1. "Free forever" — addresses the "is this a trial?" fear
  2. "No account needed" — addresses the privacy / sign-up friction
  3. "No export limits" — addresses the "must I pay to save my work?" fear

**Primary CTA:** "Convert a photo to a pattern" — the most common first action,
and the most differentiating feature. Full-width card to draw the eye.

**Secondary CTAs:** Templates and import — for users who already have a design
in mind or are migrating from another tool.

**Value grid (bottom section):** Four pillars of the integrated suite, stated
in one line each. Not a feature list — a benefit statement.

**Trust line:** "Works offline · No data ever leaves your device" — directly
addresses the privacy concern unique to a browser app.

---

## Normal Dashboard State (for contrast)

After the first project is created, the normal home page shows:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [logo]  Cross Stitch Studio                         [Theme] [Help] [Menu]   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  My Projects                                    [ New project + ]            │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Autumn Barn  │  │ Lighthouse   │  │ Floral Hoop  │  │ [Add new]    │   │
│  │  48%         │  │  5%          │  │  92%         │  │     +        │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                              │
│  [View all projects]  [Stash Manager]  [Stats]                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Notes

- **Detection:** `const isFirstRun = (await ProjectStorage.listProjects()).length === 0`
- **Starter kits link:** calls into existing `starter-kits.js` functionality
- **Import CTA:** opens the existing import file dialog
- **Create CTA:** navigates to `create.html`
- **No new data model needed** — purely a conditional render in `home-app.js`
- **Animation:** the first-run state can fade in on load (subtle — `var(--motion)`)
- After the first project is created, the normal dashboard renders on next page load
