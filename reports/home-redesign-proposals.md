# Home page: three redesign proposals

> **Phase 2 of 2.** Phase 1, the new-user walkthrough of the current page, is in
> [home-page-audit/README.md](home-page-audit/README.md). The findings it lists
> (F1 to F16) are referenced below.
>
> **Interactive mockups.** Open each file in a browser. The bar at the top
> switches between a **new** and a **returning** user, **desktop** and
> **phone** width, and **light** and **dark** themes. Each mockup has its
> reasoning in a panel beside it.
>
> - [home-redesign-option-1.html](home-redesign-option-1.html): Ask what they have
> - [home-redesign-option-2.html](home-redesign-option-2.html): Workbench
> - [home-redesign-option-3.html](home-redesign-option-3.html): Just open it

## What the walkthrough found, in short

A first-time visitor is never told what stitchx is. They see two competing
"start" controls, one of which seems to do nothing. They're asked to choose
between tiles described by file extensions, and are warned three times about
something that probably doesn't apply to them. The sample is hidden, and the
Stash and Stats tabs are empty. A returning user gets four buttons per
project, no progress on the project rows, a silent cap at 8 projects, and a
phone layout where the buttons cover the project names.

## The three directions

| | Option 1: Ask what they have | Option 2: Workbench | Option 3: Just open it |
|---|---|---|---|
| **Main idea** | One question in the user's words, "What are you starting with?", with one card per answer. | One screen with everything: projects, stash and stitching stats. A setup checklist for new users. | One "Choose a file" button. stitchx works out what the file is and only asks when it has to. |
| **First visit** | Pitch, privacy line, three intent cards, real demo, "How stitchx fits together". | Welcome card, three-step checklist, explanatory empty states for Stash and Stats. | Pitch, one large drop zone, "blank canvas" and "demo" as alternatives. |
| **Returning user** | "Continue stitching" card, project grid with previews and filters, compact "Start something new". | "Now stitching" with stat tiles, project table with one state-aware action per row, side rail with Start, This week and Stash. | "Pick up where you left off" shelf, compact new-pattern bar, three "At a glance" sentences. |
| **Navigation** | Header: Home, Stash, Stats, Help, More. | Header: labelled search box, Help, More. | Sidebar (desktop) or bottom tab bar (phone): Home, Projects, Stash, Stats. |
| **Best for** | Brand-new users; the clearest story. | People with many projects and a stash. | Phone users and people who arrive with a file in hand. |
| **Main risk** | Longer first page; Stash and Stats numbers move off Home. | Dense; long scroll on a phone; more data to load on Home. | Biggest structural change; one button hides what the app can do. |
| **Build effort** | Medium: `home-app.js` plus a demo project. | Medium to high: rail data loading, table layout. | High: new nav model across pages, a Projects page. |

## How each option covers the findings

"Yes" means the mockup removes the problem; "Partly" means it reduces it.

| Finding | Opt 1 | Opt 2 | Opt 3 |
|---|---|---|---|
| F1 No explanation of what stitchx is | Yes | Yes | Partly (one line) |
| F2 Returning-user greeting on first visit | Yes | Yes | Yes |
| F3 Two competing start controls | Yes | Yes | Yes |
| F4 Tab/content mismatch | Yes | Yes | Yes |
| F5 Choice framed in file formats | Yes | Partly | Yes (no choice needed) |
| F6 Warning repeated three times | Yes (once, in "Which files work?") | Partly (formats as hints) | Yes (only after a photo is picked) |
| F7 Unexplained emphasis on one tile | Yes | Yes | Yes |
| F8 Sample hidden and toy-like | Yes | Yes | Yes |
| F9 Advanced jargon on first visit | Yes | Yes | Yes |
| F10 Header noise | Yes | Yes | Yes |
| F11 Thin Stash and Stats tabs | Yes (links) | Yes (useful summaries) | Yes (one-line hooks) |
| F12 Button wall | Yes | Yes | Yes |
| F13 No progress or preview on rows | Yes | Yes | Yes |
| F14 Silent cap at 8 projects | Yes | Yes | Yes |
| F15 Phone layout breaks | Yes | Yes | Yes |
| F16 Active project shown three times | Yes | Yes | Yes |

## Recommendation

**Build Option 1, with two ideas borrowed from the others.**

1. **From Option 3: ask about photos after they're picked.** Option 1 already
   moves the paper-chart warning into one panel. Going further, a picked photo
   gets the one-tap question "Something to turn into a pattern, or a printed
   chart?" That removes the warning for everyone who doesn't need it.
2. **From Option 2: a state-aware action and the stash hook.** The project
   card's main action should say what will happen (Continue, Start, View,
   Convert). A "You own every thread" chip on unstarted projects is a cheap
   reason to visit the Stash Manager.

Option 1 is recommended because it fixes the most findings while changing
only the Home page. The shared header and the other pages stay as they are.
Its first-visit story (what this is, what do you have, try it, how it fits
together) speaks most directly to the confusion the walkthrough found. Option
3's navigation model is worth revisiting later, together with the rest of
the app's mobile work.

## Quick wins, whichever option is chosen

These are small fixes in the current `home-app.js` that don't depend on a
redesign:

- **F13:** read `pct` and `dimensions` from the `listProjects()` rows instead
  of `p.pattern` and `p.settings`, which those rows don't carry. Progress and
  size then appear on every project row.
- **F14:** add a "Show all N projects" link when the list is longer than 8.
- **F3:** on first visit, hide the greeting's "+ New project" button, since the
  creation tiles are already on screen.
- **F15:** let project-row actions wrap under the name below 480 px, or move
  Export and Update chart into a More menu.
