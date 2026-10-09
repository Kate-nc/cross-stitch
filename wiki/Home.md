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

Open `home.html` (or your deployment's address). Four tabs:

- **Projects** — your active project and every other project, with Track, Edit and Export actions
- **Create new** — **New from pattern file** (image, `.json`, `.oxs` or PDF) or **New from scratch**
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

- Convert images with 2–100 colours, optional shading (Smooth blend or Pattern blend), background removal and cleanup of isolated stitches
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
- Import `.json`, `.oxs`, images and PDF charts (including scans and booklets)

### Stash Manager

- DMC and Anchor threads with skein counts, part-used status and low-stock alerts
- Bulk add from a list or a starter kit
- A Pattern Library that fills itself from your projects, showing which threads you already own

### Stats

Streaks, an activity heatmap, stash insights (including how many years of stitching your stash holds) and a Showcase of your finished work.

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
| **Blend** | Two threads in one needle for an in-between colour |
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
