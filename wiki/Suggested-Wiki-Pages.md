# Suggested Wiki Pages for StitchX

## Overview

This document outlines 20 recommended wiki pages to create a comprehensive documentation experience for both end users and developers. These pages would complement the Home page and provide deep-dive guidance on specific features, workflows, and technical topics.

---

## User-Facing Pages (12)

### Beginner & Getting Started (3 pages)

#### 1. **Getting Started Guide**
- Goal: First-time user orientation
- Content:
  - Opening the app for the first time
  - Understanding the home screen layout
  - Creating your first project
  - Where to find help within the app
  - Browser storage and data persistence overview
- Links to: Pattern Creator Tutorial, Stash Manager Guide

#### 2. **Pattern Creator Tutorial**
- Goal: Step-by-step guide to generate a pattern from image
- Content:
  - Uploading an image (JPG/PNG)
  - Choosing colour count and quantisation settings
  - Dithering strength explained (visual examples)
  - Brightness, contrast, saturation adjustments
  - Background removal workflow
  - Previewing before finalising
  - Saving your first project
- Visual aids: Screenshots or animated GIFs of each step

#### 3. **Stitch Tracker Guide**
- Goal: Learn to track stitching progress
- Content:
  - Loading a project into the Tracker
  - Marking stitches as done (click, tap, drag)
  - Understanding views (symbol-only, colour+symbol, highlight)
  - Using the colours drawer for per-thread progress
  - Setting parking markers for picking up later
  - Session timer and completion estimates
  - Keyboard shortcuts in Tracker
- Includes: Tips for small screens

---

### Feature Deep-Dives (6 pages)

#### 4. **Stash Manager Guide**
- Goal: Master thread inventory management
- Content:
  - Adding threads to stash (DMC, Anchor)
  - Marking as owned vs. to-buy
  - Using the skein calculator
  - Cost tracking and stash value
  - Batch adding preset kits
  - Pattern library features
  - Stash-only generation in Creator

#### 5. **Export Formats Explained**
- Goal: Understand all export options
- Content:
  - PDF charts (Pattern Keeper compatibility, image symbols, colour variants)
  - PNG images (full resolution, A4 page layout)
  - JSON projects (loading and re-editing)
  - ZIP bundles (what's included)
  - OXS files (Pattern Keeper / KG-Chart)
  - URL shares (compression, direct Tracker launch)
  - Choosing the right format for your needs
- Includes: When to use each format

#### 6. **Advanced Pattern Editing**
- Goal: Master editing tools and techniques
- Content:
  - Paint and fill tools
  - Backstitch and half-stitch placement
  - Magic Wand tool (selection by region)
  - Lasso tool (freeform selection)
  - Palette swap (replacing colours)
  - Thread substitution from stash
  - Bulk operations (remove unused colours)
  - Undo/redo workflows
  - Working with blends

#### 7. **Thread Blends & Colour Matching**
- Goal: Understand blends and colour selection
- Content:
  - What is a blend? (two threads together)
  - Why the app suggests blends
  - How colour matching works (CIEDE2000)
  - DMC vs. Anchor colour differences
  - Anchor conversion and equivalents
  - Using "closest thread" substitution
  - Manually adding blends
  - Colour preview accuracy

#### 8. **Organizing Your Projects**
- Goal: Project management and workflow
- Content:
  - Creating and naming projects
  - Filtering and sorting on Home Screen
  - Bulk operations (delete multiple, manage status)
  - Project status indicators
  - Finding old projects
  - Archiving completed projects
  - Project metadata (created date, last edited, progress %)
- Tips: Organization strategies

#### 9. **Importing Patterns**
- Goal: Load patterns from external sources
- Content:
  - Importing JSON projects
  - OXS files (KG-Chart / Pattern Keeper format)
  - Pixel-art images as patterns (PNG/JPG)
  - PDF pattern extraction
  - Import wizard walkthrough
  - Troubleshooting import failures
  - Merging imported patterns with existing projects
  - File format requirements

---

### Data & Backup (3 pages)

#### 10. **Data Storage & Privacy**
- Goal: Explain where data lives and privacy implications
- Content:
  - IndexedDB storage (what it is, how it works)
  - No cloud upload, no tracking
  - Browser privacy modes and data loss
  - Clearing browser storage (implications)
  - Using across multiple devices locally
  - Incognito/private window considerations
  - Browser vendor differences
  - GDPR and data control (user owns everything)

#### 11. **Backup & Restore**
- Goal: Protect and recover your data
- Content:
  - Manual backup workflow (full export)
  - `.csbackup` file format
  - Scheduling regular backups
  - Restoring from backup
  - Recovery after data loss
  - Backing up before browser update
  - Clearing app data safely
  - Backup verification

#### 12. **Cross-Device Sync**
- Goal: Sync projects between devices
- Content:
  - Cloud folder setup (Dropbox, iCloud, OneDrive)
  - `.csync` file format (incremental)
  - Exporting sync files from device A
  - Importing sync files on device B
  - Conflict resolution
  - Manual merge workflow
  - Limitations and workarounds
  - Multi-device workflows

---

## Developer-Facing Pages (8)

### Setup & Development (2 pages)

#### 13. **Development Setup**
- Goal: Get the project running locally
- Content:
  - Prerequisites (Node.js version)
  - Installing dependencies (`npm install`)
  - Starting the dev server (`npm run start`)
  - Running tests (`npm test`)
  - Building the creator bundle (`npm run build:creator`)
  - IDE setup (recommended VS Code extensions)
  - Debugging tips (browser dev tools)
  - Common errors and troubleshooting
- Includes: Links to .github/copilot-instructions.md

#### 14. **Testing & Quality**
- Goal: Understand the test suite
- Content:
  - Unit test structure (Jest)
  - Running tests with `npm test`
  - Writing new tests
  - Test coverage targets
  - E2E tests (Playwright)
  - Performance tests (mobile/desktop)
  - Manual testing checklist
  - CI/CD pipeline
  - Coverage badges and metrics

---

### Architecture & Technical (4 pages)

#### 15. **Architecture Overview**
- Goal: Understand the codebase structure
- Content:
  - Five HTML entry points (home, create, stitch, manager, index)
  - Script loading order and dependencies
  - React vs. vanilla JS components
  - Global bindings and window namespacing
  - IndexedDB schema (CrossStitchDB, stitch_manager_db)
  - Creator module bundling process
  - Module boundaries and data flow
  - File responsibility map

#### 16. **API Reference**
- Goal: Document key functions and exports
- Content:
  - `colour-utils.js` — Colour matching and image processing functions
  - `helpers.js` — Utility functions (formatting, storage helpers)
  - `threadCalc.js` — Skein calculation and thread estimation
  - `project-storage.js` — ProjectStorage API (save, load, list projects)
  - `stash-bridge.js` — Cross-database sync for stash
  - `tracker-app.js` — Stitch Tracker React component API
  - `manager-app.js` — Stash Manager React component API
  - Global event names (cs:projectsChanged, cs:stashChanged, etc.)
- Format: JSDoc-style with examples

#### 17. **Data Model & Schema**
- Goal: Understand how data is structured
- Content:
  - Project JSON structure (v8 format)
  - Pattern array format (colour IDs, blend format)
  - Done-array structure (tracking stitches)
  - IndexedDB stores and key naming
  - Stash composite keys (brand:id format)
  - Blend ID format ("310+550")
  - Thread object structure {id, name, rgb, lab}
  - Migration history and version compatibility

#### 18. **Theme & Styling System**
- Goal: Understand CSS tokens and design system
- Content:
  - Workshop design system (UX-12)
  - CSS custom properties (--accent, --surface, etc.)
  - Light vs. dark theme tokens
  - Responsive design approach
  - Icon system (icons.js)
  - Motion and transitions (--motion token)
  - Shadow and radius tokens
  - No-emoji rule and why it matters

---

### Contributing & Guidelines (2 pages)

#### 19. **Contributing Guide**
- Goal: Help developers contribute
- Content:
  - Code of conduct
  - How to report bugs
  - Feature request process
  - Pull request workflow
  - Commit message conventions
  - Branch naming conventions
  - Review checklist
  - Common mistakes and gotchas
  - Getting help (GitHub issues, discussions)
- Includes: Links to code style docs

#### 20. **Code Style & Conventions**
- Goal: Maintain consistency in the codebase
- Content:
  - File organization and naming
  - Minified vs. modern JS (context-dependent)
  - React hooks and component structure
  - Global binding patterns (window.* exports)
  - Comment style (box-drawing headers)
  - Test file structure and naming
  - Naming conventions (camelCase, CONSTANTS)
  - No-import/export rule (classic scripts)
  - British English spelling for UI
  - Creator module-specific conventions
- Includes: Links to .github/copilot-instructions.md

---

## Suggested Additional Pages (Optional Enhancements)

### Community & Support
- **Frequently Asked Questions (FAQ)** — Common problems and solutions
- **Troubleshooting Guide** — Import errors, storage issues, browser compatibility
- **Accessibility Features** — Screen reader support, keyboard navigation, contrast modes

### Tutorials & Workflows
- **Workflow: From Image to Print** — End-to-end scenario
- **Workflow: Multi-Device Stitching** — Using Creator on one device, Tracker on another
- **Workflow: Pattern Keeper Integration** — Exporting OXS for use in Pattern Keeper

### Release & Changelog
- **Release Notes & Changelog** — Version history and new features
- **Roadmap** — Planned features and future direction
- **Browser Compatibility Matrix** — Detailed browser/OS support table

---

## Wiki Structure Recommendation

### Sidebar Organization

```
HOME
├─ Getting Started (3)
│  ├─ Getting Started Guide
│  ├─ Pattern Creator Tutorial
│  └─ Stitch Tracker Guide
│
├─ Features (6)
│  ├─ Stash Manager Guide
│  ├─ Export Formats Explained
│  ├─ Advanced Pattern Editing
│  ├─ Thread Blends & Colour Matching
│  ├─ Organizing Your Projects
│  └─ Importing Patterns
│
├─ Data & Backup (3)
│  ├─ Data Storage & Privacy
│  ├─ Backup & Restore
│  └─ Cross-Device Sync
│
├─ Development (8)
│  ├─ Development Setup
│  ├─ Testing & Quality
│  ├─ Architecture Overview
│  ├─ API Reference
│  ├─ Data Model & Schema
│  ├─ Theme & Styling System
│  ├─ Contributing Guide
│  └─ Code Style & Conventions
│
└─ Community
   └─ (Feedback, GitHub links, etc.)
```

### Navigation Tips

- Add "Next" and "Previous" links at the bottom of each page
- Create topic-specific "See Also" sections
- Use breadcrumbs for clear hierarchy
- Link from Home page to key pages in each category
- Add a search/index feature for quick access

---

## Implementation Roadmap

**Phase 1 (Essential):** Home, Getting Started, Pattern Creator Tutorial, Stitch Tracker Guide, Stash Manager Guide, Development Setup

**Phase 2 (Core Features):** Export Formats, Advanced Editing, Importing Patterns, Architecture Overview, API Reference

**Phase 3 (Supporting):** All remaining pages

**Phase 4 (Nice-to-have):** FAQ, Troubleshooting, Workflows, Release notes

---

## Notes

- All pages should include clear examples and screenshots where applicable
- Developer pages should link to source files in the repository
- Maintain consistency with the existing copilot-instructions.md and AGENTS.md
- Use the canonical terminology from TERMINOLOGY.md
- Include keyboard shortcuts in relevant pages
- Add a "Last Updated" date to each page for freshness

