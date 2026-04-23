# Terminology Glossary

This glossary defines the canonical user-facing terms across the Pattern
Creator, Stitch Tracker, and Stash Manager. Use these terms consistently in
new UI strings, help content, modals, error messages, and documentation.

---

## Core Concepts

### Project
An end-to-end stitching effort tracked by the app. A Project always has:
- a generated or imported pattern,
- progress state (which stitches are done),
- a history (timer sessions, optional notes).

Projects are stored in `CrossStitchDB.projects`. They appear in the Pattern
Creator's home screen, the Stitch Tracker's project picker, and the Stash
Manager's "Your Projects" cards.

> Use **Project** when referring to something a user opens, edits, or stitches.

### Pattern
The visual chart itself — a grid of stitches plus colour metadata. A Pattern
is a *property* of a Project (`project.pattern`). It can also exist
independently in the Stash Manager's library (a "Pattern entry") to plan
stitching that hasn't been started yet.

> Use **Pattern** when referring to the chart/design as data, or to entries
> in the Manager that aren't linked to a started Project.

### Stash
The user's personal collection of physical thread skeins, tracked in the
Stash Manager. Each entry has a brand (DMC or Anchor), thread ID, owned
count, and optional history.

> Use **Stash** in user-facing copy. Avoid "Inventory" (legacy term).

### DMC / Anchor
Brand names of the supported thread manufacturers. Always capitalised as
**DMC** and **Anchor**. Composite stash keys use lowercase: `dmc:310`,
`anchor:403`.

### Skein
A single physical bundle of thread (315 inches per skein, by default).

---

## Verbs (Save vs. Download vs. Export)

### Save
Write data to the app's internal storage (IndexedDB). The user keeps using
the app afterwards; no file appears on disk.

> Examples: "Save Project" (autosave to `CrossStitchDB`), "Save Pattern"
> (Manager pattern detail editor writes to `stitch_manager_db`).

### Download
Write a file to the user's device. The app does not retain a reference to
that file.

> Examples: "Download all data" (full backup `.csbackup`), "Download PDF",
> "Download project as `.json`".

### Export
A user-facing umbrella for "Download" when the output is a deliberately
share-able artefact (PDF chart, OXS file, image).

> Examples: "Export PDF", "Export as OXS".

### Open / Import
Read data from a file or URL into the app. "Open" implies the user wants
to keep working with it; "Import" implies merging into existing state.

> Examples: "Open Project (.json)", "Import Pattern (.oxs)".

### Sync (folder)
Optional feature that writes incremental updates to a user-chosen folder
(typically inside Dropbox/iCloud/OneDrive). Distinct from Save: the user
opts in once per device.

---

## UI Surfaces

| Surface | Canonical name |
|---|---|
| The 3-tab manager page | **Stash Manager** |
| The home page of `index.html` | **Home** (or "Pattern Creator home") |
| The pattern-creation page | **Pattern Creator** |
| The progress-tracking page | **Stitch Tracker** |
| The full-app backup file (`.csbackup`) | **Backup** |
| The autosave slot | **Active project** (singular per user) |

---

## Anti-patterns (do not use)

| Avoid | Use instead |
|---|---|
| Inventory | Stash |
| Save (when you mean write to disk) | Download / Export |
| Pattern (when you mean the whole project) | Project |
| Project (when you mean only the chart) | Pattern |
| File (when you mean an entry in storage) | Project / Pattern |
| Convert (without context) | Convert palette / Convert to Anchor |

---

## Quick reference for contributors

When adding a new UI string:

1. Decide if you're describing a **Project** or just a **Pattern**.
2. Choose **Save** vs. **Download/Export** based on whether a file appears.
3. Use **Stash** (not Inventory) for thread collections.
4. Capitalise brand names: **DMC**, **Anchor**.
5. Keep British spellings ("colour", "organiser", "favourite").

This glossary is also surfaced in the in-app **Help Centre** under the
**Glossary** tab so end-users see the same definitions.
