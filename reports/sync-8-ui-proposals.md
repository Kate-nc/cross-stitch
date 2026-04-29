# Sync 8 — UI Proposals (3 approaches)

> Phase 2 design. Three distinct approaches to where and how sync
> appears in the app. Each proposal covers setup, ongoing
> visibility, conflict resolution, and the preferences panel.
> Wireframes for each are in [sync-wireframes/](sync-wireframes/).

## Quick comparison

|                         | A — Quiet ambient (recommended) | B — Persistent dashboard | C — Modal-led |
|-------------------------|---------------------------------|--------------------------|---------------|
| Header status           | Tiny pill, only when notable   | Always-on chip with text | Hidden        |
| Setup                   | Wizard-on-demand from prefs    | Setup card on home       | Modal flow    |
| Per-project status      | Subtle dot                      | Per-card status row      | None          |
| Reconciliation          | Full-screen wizard              | Inline on dashboard       | Multi-step modal |
| Idle-state intrusion    | Zero                            | Constant pill              | Zero           |
| Discoverability         | Medium                          | High                       | Low            |
| First-time clarity      | High (dedicated wizard)         | Medium                    | High          |
| Mobile feel             | Native                          | Cluttered                  | Native        |

Recommendation: **A — Quiet ambient**, with elements of B for power
users who want a richer dashboard view (live activity feed in
Advanced).

---

## Approach A — Quiet ambient *(recommended)*

**Philosophy:** sync is invisible when it's working. Status only
surfaces at three intensities:

1. **Resting (everything synced):** no UI at all. The header has
   *no* sync indicator visible.
2. **In-progress / recently active:** a small `cloudSync` icon pill
   appears in the header for ~3 seconds after each event then fades.
3. **Needs attention:** a coloured pill stays visible (yellow:
   updates available; red: error; blue: first-time setup
   incomplete) until acknowledged.

### A — Setup

- Triggered from **Preferences → Sync, backup & data → Choose folder**.
- One-screen wizard: pick folder → device name → sync scope → confirm.
- If the folder already contains data, **automatically branches** into the reconciliation wizard (see "First time" below) before completing setup.

### A — Ongoing visibility

- Header pill (when shown): icon + tooltip text. No persistent label text.
- Per-project: a 6 px coloured dot in the corner of project cards on `/home` and `/manager`. Hover tooltip: "Synced 2 min ago" / "Local only" / "Conflict — review".
- Toast on errors only.
- "Sync now" lives in the Preferences panel, not the header.

### A — Reconciliation (first-time, the duplication fix)

- Full-screen wizard (mobile: full-screen; desktop: 720 px modal).
- Three steps: Welcome → Match-up → Confirm.
- The Match-up step shows a two-column drag-or-confirm matcher with
  fingerprint + name suggestions pre-linked. Each pair has a
  three-way action picker (Merge / Keep both / Replace local).

### A — Conflict resolution (steady-state)

- Existing `SyncSummaryModal` enhanced with the new "Possible duplicates"
  section and the always-additive progress merge (no choice, just
  shown as informational: "+247 stitches from Tablet").

### A — Preferences

- Layout from [sync-7](sync-7-preferences-design.md), Advanced collapsed.

**Wireframes:** A1–A7 in [sync-wireframes/](sync-wireframes/).

---

## Approach B — Persistent dashboard

**Philosophy:** sync is a first-class status surface, always
visible. Best for users who actively manage multiple devices.

### B — Setup

Same as A, but reachable from a "Set up sync" CTA in the new home
grid (a tile with cloud-sync icon + caption "Sync across devices").

### B — Ongoing visibility

- Header chip with icon + text: "✓ Synced 2 min ago" / "↻ Syncing…" / "Updates" / "Error".
- Per-project status row in the sidebar (small list of synced/local-only/conflict counts).
- Sync card on `/home` near the Active Project card showing last
  device-to-device flow ("Tablet → Desktop, 12 min ago").

### B — Reconciliation

- Same wizard as A, also reachable from the dashboard card via
  "Resolve duplicates (3)".

### B — Conflict resolution

- Same modal as A.
- Plus a persistent "Resolve" badge in the header chip.

### B — Preferences

- Same as A, but with a "Live activity feed" section uncollapsed
  by default — last 20 sync events scrolling.

**Wireframes:** B1–B6 in [sync-wireframes/](sync-wireframes/).

---

## Approach C — Modal-led

**Philosophy:** keep sync entirely out of the app chrome. All
sync interaction is gated through a single command palette or
File-menu action that opens a Sync modal. The status only shows
when this modal is open.

### C — Setup

- Open File menu → Sync… → opens the modal. Tabs across the top:
  Status / Setup / Devices / Settings.
- Setup tab is the wizard, same as A's wizard reskinned in modal.

### C — Ongoing visibility

- **Nothing in the chrome.**
- The user must open the Sync modal (Cmd+Shift+S or File menu) to see status.
- Toast for errors.

### C — Reconciliation

- The wizard is the first thing the modal shows on first open
  after a folder pick — no separate "wizard" UI vs "settings" UI.

### C — Conflict resolution

- Existing modal, opened from the Sync modal "Updates" tab.

### C — Preferences

- Inside the Sync modal's "Settings" tab. The
  Preferences → Sync section in the prefs panel becomes a deep
  link to opening the Sync modal.

**Wireframes:** C1–C4 in [sync-wireframes/](sync-wireframes/).

---

## Recommendation

**Approach A — Quiet ambient.**

Rationale:

- Best matches the "invisible when it works" rule.
- Doesn't force a permanent header chip onto users who never sync.
- Keeps the existing surfaces (Preferences panel, SyncSummaryModal)
  as the canonical control points instead of duplicating them in a
  dashboard card.
- The dedicated full-screen reconciliation wizard is the cleanest
  surface for the duplication-fix flow (which is the most important
  flow in this whole feature).
- Mobile-friendly: no chrome real-estate cost.
- Discoverability is the trade-off; the new home grid can include
  a one-time "Try cross-device sync" promo card for users who
  haven't set it up, mitigating discoverability without adding
  permanent chrome weight.

If the user wants more visibility for power users, we can add B's
"Live activity feed" inside Advanced as a non-default opt-in. That
gives the best of both without compromising the quiet default.

---

## Wireframe inventory

The wireframes live in [sync-wireframes/](sync-wireframes/) and
cover, at minimum:

| ID | Surface | State | Variants |
|----|---------|-------|----------|
| A1 | Sync prefs panel | Folder configured, healthy | desktop + mobile |
| A2 | Sync prefs panel | Folder unset (cold start) | desktop + mobile |
| A3 | Header pill states | resting / syncing / updates / error | annotated strip |
| A4 | Reconciliation wizard step 1 | Welcome | desktop + mobile |
| A5 | Reconciliation wizard step 2 | Match-up grid | desktop + mobile |
| A6 | Reconciliation wizard step 3 | Confirm + backup | desktop + mobile |
| A7 | SyncSummaryModal v2 | New "Possible duplicates" section | desktop |
| B1 | Header chip variants | All states | desktop |
| B2 | Home dashboard sync card | Active sync card | desktop |
| C1 | Sync modal | Status tab | desktop |

The wireframes use realistic content (project names: "Cottage
Garden Sampler", "DMC 3-page Pattern — Mountains"; realistic file
sizes; realistic timestamps).

---

## End of UI proposals
