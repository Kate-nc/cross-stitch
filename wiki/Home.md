# StitchX — Wiki Home

Welcome to **StitchX**, a fully client-side web application suite for creating, managing, and tracking cross-stitch patterns. No backend, no installation, no login required — just open it in your browser and start stitching.

## What is StitchX?

StitchX is an integrated toolkit of three specialized applications designed to handle every step of the cross-stitch journey:

1. **Pattern Creator** — Convert images into stitchable charts or design from scratch
2. **Stitch Tracker** — Track your progress while you physically stitch
3. **Stash Manager** — Manage your thread inventory and plan purchases

All three tools work independently or seamlessly integrate through a unified Home Screen. Your data lives entirely on your device — nothing is uploaded to a server, and you can use the app fully offline (after the initial load).

## Getting Started

### First Time?

Start at **[home.html](https://yoursite.com/home.html)** — this is the canonical entry point. You'll see:

- **Projects tab** — Your active and saved projects
- **Create New tab** — Start a pattern from an image or blank canvas
- **Stash tab** — Quick view of your thread inventory
- **Stats tab** — View stitching insights and history

### Direct Access (Experienced Users)

You can bookmark individual tools:

| Tool | URL |
|------|-----|
| Pattern Creator | `create.html` or `index.html` |
| Stitch Tracker | `stitch.html` |
| Stash Manager | `manager.html` |
| Home Screen | `home.html` |

## Core Features

### Pattern Creator

Turn images into cross-stitch patterns or design from scratch.

**Image Conversion**
- Upload JPG or PNG and generate a pattern using intelligent colour quantisation
- Adjust dithering strength, brightness, contrast, and smoothing
- Remove background colours with tolerance control
- Preview updates in real-time before finalising

**Pattern Editing**
- Paint stitches, fill regions, draw backstitch lines, place half-stitches
- Magic Wand and Lasso tools for precise selection
- Full undo/redo history (Ctrl+Z / Ctrl+Y)
- Real-time thread usage and cost calculations
- Split-pane view for chart and preview side-by-side

**Palette Controls**
- Limit colours to 2–80 (automatic rarer-colour removal)
- Stash-only mode (restrict to threads you own)
- Smart two-thread blend detection
- Palette swap (replace one colour across entire pattern)
- Thread substitution from your stash

**Export Options**
- PDF charts (Pattern Keeper–compatible or standard printing)
- PNG images (full resolution or A4 layout)
- JSON project files (load anytime, includes progress)
- ZIP bundles (all formats in one archive)
- OXS files (Pattern Keeper / KG-Chart XML)
- Shareable URLs (compressed, opens directly in Tracker)

### Stitch Tracker

Your digital replacement for a printed chart while stitching.

**Tracking Modes**
- Mark full stitches and half-stitches as you go
- Click, tap, or drag to mark progress
- Full undo history if you make a mistake
- Session timer to track time spent and estimate completion

**Navigation & Views**
- Symbol view, colour view, or highlight mode (with isolate, outline, tint, and spotlight sub-modes)
- Place a guide crosshair for navigation
- Per-colour parking markers (for picking up where you left off)
- Thread panel showing skein needs, stash status, and live consumption tracking

**Live Stash Deduction**
- Toggle "Live" in the thread panel to track thread consumption in real time as you stitch
- See consumed vs. owned fractions per thread with low-stock warnings
- Configurable waste settings (tail allowance, run length, waste %, strand count)

**Import Support**
- Load `.json` projects from the Creator
- Open `.oxs` files (KG-Chart / Pattern Keeper)
- Convert pixel-art images (`.png`, `.jpg`)
- Extract patterns from PDF scans

### Stash Manager

Plan purchases and manage your thread collection.

**Inventory Tracking**
- Mark skeins as owned or to-buy for both DMC and Anchor threads
- Stash status syncs in real-time to Creator and Tracker
- Cost tracking (set per-skein price for totals)
- Browse full DMC and Anchor catalogues

**Shopping & Planning**
- Skein calculator for thread usage (by colour, blend, or pattern)
- Batch mode: calculate requirements for entire patterns
- Copy shopping lists to clipboard
- Bulk-add starter kits (DMC Essentials, Anchor Starter)

**Pattern Library**
- Store patterns you own (separate from active projects)
- Browse and reference for future stitching
- Integrated with your project history

## Data & Storage

### Where Your Data Lives

Your data is stored **entirely on your device** using IndexedDB (browser's local database). No cloud, no login required.

**Two Databases:**

| Database | Stores |
|----------|--------|
| `CrossStitchDB` | Projects, patterns, progress, session history, stitching stats |
| `stitch_manager_db` | Thread stash inventory and pattern library |

### Backup & Sync

**Manual Backup**
- Export all your data as a single compressed backup file from Preferences → **Sync, backup & data** → **Download backup**
- Store securely on your device
- Restore anytime via the same Preferences panel

**Cloud Sync (Optional)**
- Connect a cloud storage folder (Dropbox, Google Drive, OneDrive) via Preferences → **Sync, backup & data** → **Sync folder**
- Changes are automatically exported as `.csync` files every 30 seconds after a save
- Other devices watching the same folder receive and merge updates automatically
- No account required; uses the File System Access API (Chrome/Edge 86+)
- Manual file-transfer sync also available for Firefox and Safari

### Clearing Your Data

Your data persists as long as you don't clear your browser's storage. Learn how in **[Data Storage & Privacy](Data-Storage-Privacy.md)**.

## Project Structure

### What is a Project?

A **Project** is one complete stitching effort. It includes:

- The pattern (grid of coloured stitches)
- Your progress (which stitches are done)
- Session history (when you stitched, for how long)
- Thread ownership notes (which colours you've marked as owned)
- Export formats (PDF, PNG, JSON, etc.)

### Project Lifecycle

1. **Create** — Generate from image or design from scratch in Creator
2. **Edit** — Adjust colours, remove stitches, swap threads
3. **Export** — Download as PDF, PNG, JSON, or ZIP
4. **Track** — Open in Stitch Tracker and mark progress while stitching
5. **Archive** — Keep the project in your library or delete when done

## Terminology

To ensure clarity across the app, we use specific terms consistently:

| Term | Meaning |
|------|---------|
| **Project** | Complete stitching effort (pattern + progress + history) |
| **Pattern** | The chart itself (grid of stitches and colours) |
| **Stash** | Your personal collection of physical thread skeins |
| **Skein** | One bundle of thread (315 inches by default) |
| **DMC / Anchor** | Thread brand names (always capitalised) |
| **Blend** | Two threads stitched together for a better colour match |
| **Half-stitch** | Quarter, half, or three-quarter stitch in any quadrant |
| **Backstitch** | Line stitches for details and outlines |
| **Save** | Write to app storage (IndexedDB) — no file on disk |
| **Export** | Download a file (PDF, PNG, JSON, etc.) |
| **Import** | Load a file into the app (JSON, OXS, PNG, PDF) |

## Keyboard Shortcuts

Essential shortcuts across all tools:

| Action | Shortcut |
|--------|----------|
| Undo | Ctrl+Z (or Cmd+Z on Mac) |
| Redo | Ctrl+Y (or Cmd+Shift+Z on Mac) |
| Save | Auto-saved (no action needed) |
| Open Preferences | Ctrl+, (Ctrl+Comma) |
| Open Help | ? |
| Search / Command Palette | Ctrl+K |

*(See individual tool pages for more shortcuts)*

## Browser Support

StitchX works on any modern browser:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

**Works offline** after initial load (Progressive Web App). Install from your browser's menu for faster access.

## Accessibility

- Full keyboard navigation across all tools
- Screen reader support (ARIA labels and landmarks)
- High contrast mode support
- Touch-friendly on mobile and tablet (optimised UI for small screens)

## Community & Support

### Help & Feedback

- **Help Drawer** — Press `?` in any tool to read in-app documentation
- **GitHub Issues** — Report bugs or suggest features at [github.com/Kate-nc/cross-stitch/issues](https://github.com/Kate-nc/cross-stitch/issues)
- **Preferences** — Customize theme, colours, and behaviour in Preferences (Ctrl+,)

### Contributing

Want to help improve StitchX? See [Contributing Guide](Contributing.md) for details on:

- Setting up the development environment
- Running tests
- Submitting pull requests
- Code style conventions

## What's Next?

Choose a topic below, or browse the full wiki sidebar:

### For New Users
- [Getting Started Guide](Getting-Started-Guide.md)
- [Pattern Creator Tutorial](Pattern-Creator-Tutorial.md)
- [Stitch Tracker Guide](Stitch-Tracker-Guide.md)
- [Stash Manager Guide](Stash-Manager-Guide.md)

### For Advanced Users
- [Advanced Pattern Editing](Advanced-Pattern-Editing.md)
- [Export Formats Explained](Export-Formats.md)
- [Thread Blends & Colour Matching](Thread-Blends-Colour-Matching.md)
- [Keyboard Shortcuts Reference](Keyboard-Shortcuts.md)

### For Project Management
- [Organizing Your Projects](Organizing-Projects.md)
- [Backup & Restore](Backup-Restore.md)
- [Cross-Device Sync](Cross-Device-Sync.md)

### For Developers
- [Architecture Overview](Architecture-Overview.md)
- [Development Setup](Development-Setup.md)
- [API Reference](API-Reference.md)
- [Contributing Guide](Contributing.md)

---

**Last Updated:** May 2026  
**License:** ISC

