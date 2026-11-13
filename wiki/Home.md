# stitchx — Wiki Home

Welcome to **stitchx**, a fully client-side web app for creating, managing and tracking cross-stitch patterns. No backend, no installation, no login — open it in your browser and start stitching.

## What is stitchx?

Three tools that work together:

1. **Pattern Creator** — turn images into stitchable charts, or design from scratch
2. **Stitch Tracker** — mark your progress while you stitch
3. **Stash Manager** — manage your thread collection and pattern library

They share one **Home** page and one set of data. Everything lives on your device — nothing is uploaded, and the app works offline after the first visit.

## Start Here

- **[Getting Started Guide](Getting-Started-Guide.md)** — the Home page, your first pattern, backups and devices
- **[Pattern Creator Tutorial](Pattern-Creator-Tutorial.md)** — converting images, editing, exporting
- **[Stitch Tracker Guide](Stitch-Tracker-Guide.md)** — marking stitches, views, work areas, parking, sessions
- **[Cross-Device Sync](Cross-Device-Sync.md)** — using more than one device
- **[PDF Export Quick-start](../EXPORT_QUICKSTART.md)** — printable and Pattern Keeper charts

Inside the app, press **?** (or the **Help** button) for help on every tool and the full list of keyboard shortcuts.

## The Home Page

Open `home.html` (or your deployment's address). When you return, **Start something new** sits directly below **Welcome back**, above the Continue card and project list. Choose **A pattern I already have**, **A photo or picture**, or **A blank canvas**.

Home also gives you access to:

- **Projects** — your active project and every other project, with Track, Edit and Export actions
- **Create new** — **Stitch an existing chart** (PDF, `.oxs`, supported `.xsd`, PCStitch 7 `.pat` or project `.json`), **Convert a picture** (image), or **Draw a pattern**
- **Stash** — what you own, what you could start, and your shopping list
- **Stats** — lifetime stitches and recent activity

You can also go straight to a tool:

| Tool | URL |
|------|-----|
| Home | `home.html` |
| Pattern Creator | `create.html` |
| Stitch Tracker | `stitch.html` |
| Stash Manager | `manager.html` |

## Core Features

### Pattern Creator

- Convert images with 2–100 colours, optional shading (Smooth shading or Regular pattern), background removal and Reduce confetti (merging single stitches of a colour on their own)
- Restrict colours to threads you own
- Paint, fill, erase, Magic Wand and Lasso selection; quarter, half, three-quarter and backstitch
- Replace a colour, shift the whole palette, or adapt the pattern to your stash or another brand
- Realistic preview and side-by-side split view
- Export a Pattern Keeper-compatible PDF, PNG, `.oxs` or a `.zip` bundle

### Stitch Tracker

- Mark stitches by click, drag, rectangle or touch (one finger marks, two pan)
- Symbol, colour and highlight views (Isolate, Outline, Tint, Spotlight)
- Work areas for large patterns, Spotlight for block-by-block stitching
- Park threads and jump back to them; a guide crosshair to keep your place
- Automatic sessions and a completion estimate from your real pace
- Import `.json`, `.oxs`, PCStitch 7 `.pat`, images and PDF charts (including scans and booklets)

### Stash Manager

- **Overview** (where it opens): how many threads and skeins you have, what to buy next, which patterns you could start, and what is running low. On a wide screen the sections are in a menu down the left; on narrower screens they are tabs. Keys 1 to 4 switch sections.
- **Thread Stash:** the threads you own, one row each, edited in place: full skeins, the opened skein (¾, ½, ¼ or used up), a minimum to keep, and shopping-list actions. Filters for Owned, Running low, Opened, Used up and Every shade. Typing a number in the search offers threads you don't own with an Add button.
- **Running low:** a thread is low when you have less than its minimum, counting an opened skein as part of a skein; the minimum is the thread's own, or the Preferences value (1 by default).
- **Shopping list:** every thread your patterns need and your stash doesn't cover, plus any you added, with the patterns it is for. Tick what you bought and add it all to your stash in one go (with Undo); ticks stay on the device until you do. On a phone it is grouped by pattern, with Copy and Done pinned to the bottom. To buy, Thread Conflicts and Low stock panels follow, then Project materials (reservations).
- **Stock-take:** count a whole box of threads, typing each number (a number pad on phones and tablets), with Undo all at the end.
- **Custom catalogues** and **Import and export** (Bulk add, catalogue CSV, shopping list copy and JSON, full backup) have their own pages.
- A Pattern Library that fills itself from your projects, showing which threads you already own

### Stats

Streaks, an activity heatmap, stash insights (including how many years of stitching your stash holds) and a Showcase of your finished work.

Project Stats has **Overview** and **Visuals** views. Colours uses wrapping names and flexible bars; dense section grids and charts scroll within their tile. Before / After comparisons keep the pattern’s proportions even for large patterns. Tiles adapt when resizing or zooming, and short panels keep their natural height. Use **Customise** on the Stash tab to hide or reopen optional panels.

## Your Data

| Where | What |
|-------|------|
| `CrossStitchDB` (browser storage) | Projects, progress, sessions, stats |
| `stitch_manager_db` (browser storage) | Thread stash and pattern library |

- **Back up:** **File > Export Backup** saves everything in one file; **File > Restore from Backup…** brings it back.
- **Sync:** connect a cloud-synced folder, or move `.csync` files by hand — see [Cross-Device Sync](Cross-Device-Sync.md).
- Your data stays as long as you don't clear the browser's site data. On iPhone and iPad, add the app to the Home Screen so Safari doesn't clear it after a week without a visit.

## Terminology

| Term | Meaning |
|------|---------|
| **Project** | One complete stitching effort (pattern + progress + history) |
| **Pattern** | The chart itself |
| **Stash** | Your physical thread collection |
| **Skein** | One bundle of thread (315 inches / 8 m by default) |
| **Blend** | Two threads in one needle (one strand of each) for an in-between colour; the key reads, for example, DMC 341 + 826 (blend) |
| **Save** | Write to the app's storage on this device (automatic) |
| **Download / Export** | Write a file to your device (PDF, `.json`, `.oxs`, backup…) |
| **Open / Import** | Read a file into the app |

The full glossary is in [TERMINOLOGY.md](../TERMINOLOGY.md) and in the app's Help under **Glossary**.

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Undo / Redo | Ctrl+Z / Ctrl+Y (Cmd on Mac) |
| Help and all shortcuts | ? |
| Command palette | Ctrl+K |
| Download project (.json) | Ctrl+S |

Preferences are under **File > Preferences**.

## Browsers

stitchx works in current versions of Chrome, Edge, Firefox and Safari, on desktop, tablet and phone. Automatic folder sync needs a Chromium browser (Chrome or Edge) on desktop; other browsers sync by file. Install it as an app from your browser's menu for quicker access.

## Help & Feedback

- **In the app:** press `?`
- **Bugs and ideas:** [github.com/Kate-nc/cross-stitch/issues](https://github.com/Kate-nc/cross-stitch/issues)
- **Developers:** see the repository [README](../README.md) and [AGENTS.md](../AGENTS.md)

---

**Last Updated:** October 2026
**License:** ISC
