# UX-5 — Workflow Friction Audit

> Phase 2 audit. Walks the seven canonical workflows from
> [ux-3](ux-3-domain-reference.md#3-core-workflows-the-app-must-support)
> end-to-end and lists the friction points in each.

Severity: **High** · blocks the workflow · **Medium** · adds clicks
or hidden state · **Low** · polish.

---

## W1 — Photo to printable PDF (Bea's primary)

### F-W1-H1 · Four nested tab switches to reach Export
[creator/MaterialsHub.js:88-116](../creator/MaterialsHub.js)

After generating, the user clicks `Materials & Output` → `Output`,
having ignored Threads / Stash / Shopping. The Output tab itself then
gates the PDF behind a collapsed "Format & settings" disclosure
(F-W1-M2). For W1 — *the primary outcome of any creator session* —
this is the highest single friction point in the app.

**Fix idea:** A primary "Print PDF" or "Download PDF" button on the
Pattern tab, with sensible defaults, and a "Customise…" overflow.

### F-W1-H2 · `window.confirm()` blocks the export with an OS dialog
[creator/ExportTab.js:340](../creator/ExportTab.js)

When the ZIP estimate is large, the export uses native
`window.confirm()`, which interrupts the visual flow and looks like a
browser-native warning rather than an in-app one.

**Fix idea:** In-app confirmation pattern with a clear "this will be
~25 MB, continue?" message inside an existing modal frame.

### F-W1-M1 · Export preset cards require a click to commit, no preview
[creator/ExportTab.js:33-70](../creator/ExportTab.js)

Two cards (Pattern Keeper / Home Printing) sit unhighlighted until
clicked, but each is a multi-setting bundle. The user can't compare
their effects without trying both.

**Fix idea:** Default to Pattern Keeper, show a compact preview thumb
of each layout.

### F-W1-M2 · "Format & settings" collapsed by default hides common knobs
[creator/ExportTab.js:46-70](../creator/ExportTab.js)

Most-used controls (page size, margins, chart mode) are one click
behind a disclosure.

**Fix idea:** Expand by default; collapse only on small screens.

### F-W1-L1 · No live PDF preview
The user can't see what their PDF will look like until they download
and open it. **Fix idea:** Inline preview thumbnail of page 1 of the
chart and the legend.

---

## W2 — Photo to track-on-phone

### F-W2-H1 · Mandatory "name your project" gate
[creator/useProjectIO.js:116-120](../creator/useProjectIO.js)

The handoff to Tracker forces the user to name their project first.
For Bea who hasn't decided, this is a stop-the-world prompt.

**Fix idea:** Auto-name as `"<W>×<H> pattern · <date>"`; allow rename
from the Tracker title.

### F-W2-H2 · No explicit "Continue in Tracker" CTA from the Pattern tab
The Track button exists in the header (N-H1 from
[ux-4](ux-4-navigation.md)) but there's no contextual "now stitch this"
CTA next to the freshly generated pattern.

**Fix idea:** Pattern tab gets a primary `Track this pattern` button
next to `Print PDF`.

### F-W2-M1 · No phone handoff (QR / share link)
The user opens the Tracker manually on their phone, then re-picks the
project. There's no "scan to continue on phone" flow.

**Fix idea:** Generate a short URL hash or QR code from the Pattern
tab; on the phone, open the URL → land directly in the Tracker on the
right project.

---

## W3 — Daily stitching session (Eli's primary)

### F-W3-H1 · Project picker is a full modal, not a sidebar
[tracker-app.js:4447](../tracker-app.js)

The Tracker hides project switching behind a modal that fully covers
the canvas. For a power user with 30+ WIPs this is a heavy-handed UI.

**Fix idea:** A persistent left sidebar (collapsible to icons) listing
recent and active projects, à la Linear's project switcher.

### F-W3-M1 · Edit mode entry is too easy and too quiet
[tracker-app.js:3794-3810](../tracker-app.js)

The Edit-pattern affordance is a single tap; the warning banner
appears but the toolbar itself doesn't visually shift to a "danger"
state. Eli has accidentally edited a stitch he meant to mark done.

**Fix idea:** When edit mode is on, give the toolbar an unmissable
state colour (e.g. amber border) and a persistent exit pill.

### F-W3-M2 · Colour picker on phone is bottom-drawer-only
[tracker-app.js:442-450](../tracker-app.js)

On mobile the colour drawer is the only way to see "what am I
stitching", and it covers the bottom of the canvas when open.

**Fix idea:** A persistent compact "current colour" pill at the top of
the canvas; tap to expand the full drawer.

### F-W3-L1 · "Stitches today" is shown but daily goal isn't
The mini-stat is a good motivation hook but doesn't pair with a
target. Pattern Keeper's daily counter has the same shape and is
celebrated.

---

## W4 — Bulk stash add (Eli's secondary)

### F-W4-H1 · "From a kit" tab has no selectable kit list
[creator/BulkAddModal.js:1-80](../creator/BulkAddModal.js)

The tab name implies a browseable list of kits ("DMC 36 Colors
Variety", etc.) but the user is shown a free-text paste field.

**Fix idea:** Add a `<select>` of starter kits ([starter-kits.js](../starter-kits.js)
already exists) above the paste field.

### F-W4-M1 · Validation is post-submit, not as-you-type
[creator/BulkAddModal.js:1-80](../creator/BulkAddModal.js)

Invalid IDs surface only after parse. No live highlight while typing.

**Fix idea:** Debounced live parse; chip-style swatches as recognition
feedback.

### F-W4-M2 · Manager search clears on tab switch
[manager-app.js:42-44](../manager-app.js)

Switching from Inventory to Patterns and back resets the search query,
losing the user's filter.

**Fix idea:** Persist search across tab switches in the Manager
component state.

### F-W4-L1 · Remove buttons on bulk-add chips are <44px
See [ux-7-mobile.md](ux-7-mobile.md). On phone these are fiddly to
tap.

---

## W5 — Cross-pattern shopping list

### F-W5-H1 · Shopping list is modal-only
[manager-app.js:51](../manager-app.js)

The user must check pattern boxes, click "Create shopping list", wait
for a modal. There's no inline preview of what the list contains.

**Fix idea:** Live shopping list rendered inline below the
checked-pattern grid; modal becomes a "Print / Share" launcher only.

### F-W5-H2 · No print or share for the shopping list
The user has to screenshot the modal to take it to a shop. There's no
"Copy as text", "Email me", or "Print" affordance.

**Fix idea:** Three buttons in the shopping list footer — Copy as
text, Print, Save as PDF.

### F-W5-M1 · Brand filter is in the sidebar, not the shopping context
The DMC vs Anchor filter sits on the inventory view, not the shopping
list. A user who wants "Anchor only shopping list because that's my
nearest shop" can't filter from the shopping context.

**Fix idea:** Add brand filter chips inside the shopping list panel.

---

## W6 — Designer publishes a pattern (Devi)

### F-W6-H1 · Designer Branding fields are on the Project tab, not Output
[creator/DesignerBrandingSection.js](../creator/DesignerBrandingSection.js)

The user setting up an export goes to the Output tab and finds no
branding controls there. They're on Project, far from where the
artefact is built.

**Fix idea:** Mirror branding fields into the Output tab (or move the
section entirely).

### F-W6-H2 · Branding section is collapsed by default
The disclosure-collapsed state hides 5 fields and the logo uploader.
Devi has to know they exist before she can open them.

**Fix idea:** Expand by default for any project that has *any*
branding fields filled, or for projects with title set.

### F-W6-H3 · No watermark control
Devi can't add a watermark to her exported PDFs. This is a deal-breaker
for paid distribution.

**Fix idea:** Add a watermark text field + opacity slider. Defer
image-watermark to a later round.

### F-W6-M1 · ZIP bundle filename not customisable
[creator/zipBundle.js:30-35](../creator/zipBundle.js)

Designer can't name their ZIP before download.

**Fix idea:** Filename input next to the "Create ZIP" button.

### F-W6-M2 · No "test in tracker" preview from Creator
Devi exports a PDF, has to open the Tracker, has to import the PDF, to
see whether her exported chart works in PK-compat mode.

**Fix idea:** "Open this in Tracker" round-trip from the Output tab
that uses the in-memory pattern, not the file.

---

## W7 — Resume after a break

### F-W7-M1 · Welcome Back card competes with Welcome Wizard
On first run after some sessions, the Welcome Wizard fires (because
not yet dismissed) *and* the Welcome Back card appears. Two competing
"start here" surfaces.

**Fix idea:** Welcome Wizard hides if Welcome Back has content.

### F-W7-M2 · Project list loads with no skeleton
[project-library.js:44-60](../project-library.js)

Spinner-only loading state. The user sees a blank dashboard for a
beat.

**Fix idea:** 3–4 skeleton cards while ProjectStorage loads.

### F-W7-L1 · Welcome Back card doesn't predict next step
It says "Last project: X". It could say "Resume X" with a primary
button.

---

## Cross-workflow themes

1. **Disclosure-collapsed-by-default hides primary actions.** Recurs
   in W1, W6. The fix is: default-expanded for any field group that
   contains a primary or frequently-used control.
2. **Modal-everything.** Project picker, shopping list, bulk add,
   branding — everything is a modal. Modals destroy context. Inline
   panels and bottom sheets (on phone) are usually better.
3. **Workflows go *across* pages but pages don't acknowledge each
   other.** W2, W6. The "Continue in Tracker" / "Open in Editor" /
   "Test export" handoffs don't exist or are buried.
4. **Action-discovery is back-loaded.** Most primary actions ("print",
   "track this", "share shopping list") are 3+ clicks from where the
   user expects them.
