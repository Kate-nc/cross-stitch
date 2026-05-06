# Competitive Report 5: Gap Analysis

> **Purpose:** A structured comparison of our app's features vs key competitors,
> identifying where we lag, where we lead, and where gaps are strategically
> important vs merely cosmetic.
>
> Gap severity:
> - **CRITICAL** — blocks users from choosing or staying with our app
> - **HIGH** — disadvantages us in direct comparison; causes churn to competitor
> - **MEDIUM** — noticeable difference; does not usually block adoption
> - **LOW** — minor or niche difference

---

## 1. Creation Quality Gaps

### Gap C1: No stitchability quality score
**Severity: HIGH**

StitchMate shows a FLOW Score (0–100) in real time as the user adjusts generation
settings. It answers the question "how enjoyable will this be to stitch?" before
any commitment is made.

We have no equivalent. Users must visually inspect the preview and guess.

- **Who is affected:** Anyone converting a photo — which is the most common
  creation entry point
- **What they do instead:** Export and look at the PDF; re-generate with
  different settings; sometimes give up
- **Competitor advantage:** StitchMate's "check the score before you commit"
  is directly superior to our silent generation

**Recommended response:** Add a stitchability score below the preview during
generation. A simple confetti-percentage metric (isolated stitches / total
stitches × 100) would be sufficient without requiring the spatial complexity of
StitchMate's full FLOW algorithm.

---

### Gap C2: No confetti diagnostic overlay
**Severity: HIGH**

StitchMate's ConfettiScope renders a coloured overlay on the generated pattern
showing exactly which stitches are isolated. This makes the problem visible and
actionable.

We have orphan removal (which solves the problem) but no way to visualise which
stitches are orphans before or after removal. Users must trust the setting is
working.

- **What they do:** Set orphan removal to "thorough" and hope for the best;
  cannot see whether the setting helped
- **Competitor advantage:** StitchMate users can point to a specific area and
  say "fix that cluster"

**Recommended response:** Add a toggleable confetti overlay in the preview
canvas — isolated stitches highlighted in a warning colour. This visualises
what orphan removal is doing and builds user confidence in the tool.

---

### Gap C3: Creator palette is DMC-only
**Severity: MEDIUM–HIGH** (HIGH for Anchor users specifically)

The stash manager supports DMC + Anchor (via composite keys `dmc:310`,
`anchor:403`). The pattern creator generates DMC-only patterns because the
quantisation pipeline keys colours by bare ID and Anchor IDs overlap DMC IDs.

This means a user who has a full Anchor stash:
- Can track their Anchor threads in the stash manager ✓
- Cannot generate a new pattern in Anchor colours ✗
- Cannot use "Limit to stash" in the creator with their Anchor threads ✗

**Competitor advantage:** StitchMate supports 50+ brands; Thread-Bare supports
DMC/Anchor/Riolis; WinStitch supports 30 brands.

**What it costs to fix:** Schema migration to namespace IDs throughout the
pattern format and quantisation pipeline. High-effort, breaking change.

**Recommended response:** See Report 12 (Roadmap) for phased approach. Medium-
term: add Anchor as a second selectable brand in the creator using a parallel
palette lookup.

---

### Gap C4: No text tool
**Severity: MEDIUM**

StitchMate has a text tool with 48 stitch-friendly fonts. Users can type names,
dates, or quotes and see them rendered on the grid in real time.

Our editor supports hand-drawing letters but has no text-to-stitch tool. This is
a significant gap for:
- Birthday/anniversary personalised gifts
- Sampler patterns with text borders
- Name/date additions to portrait patterns

**Competitor advantage:** StitchMate's text tool is a featured landing page
section; LordLibidan recommends it for lettering projects.

**Recommended response:** Build a basic text tool with 5–8 curated stitch-
optimised fonts. Does not need to reach StitchMate's 48; even 3–4 fonts would
close the gap. Prioritised as HIGH in the roadmap.

---

### Gap C5: No French knot support
**Severity: LOW–MEDIUM**

StitchMate supports French knots as a stitch type (full editor + PDF export).
Our app supports full, half, quarter, three-quarter, and backstitch but not
French knots.

French knots are used for eyes, berries, texture accents, and decorative
elements. They are not common but are occasionally critical.

**Recommended response:** Low priority. Add as a future stitch type.

---

### Gap C6: No layers
**Severity: LOW**

StitchMate supports layers for non-destructive editing (e.g., draw on a
reference layer, design on the working layer). Our app has a single flat canvas
with undo/redo.

Layers are a power-user feature. Most cross-stitch patterns do not require them.

**Recommended response:** Not recommended. Scope creep risk is high; payoff
is low for most users.

---

### Gap C7: Dithering quality vs Thread-Bare
**Severity: MEDIUM**

Thread-Bare's dithering is described as "first class, even well beyond paid
downloadable software." Our app uses Floyd-Steinberg dithering with three
strength settings.

No direct comparison data is available but Thread-Bare's dithering reputation
is a key reason users pay $10/pattern.

**Recommended response:** Add comparison section to the generation wizard
showing before/after of dithering options. Investigate whether the dithering
algorithm can be improved (e.g., Blue Noise dithering, which tends to produce
more aesthetically pleasing results than Floyd-Steinberg at low colour counts).

---

## 2. Tracking Gaps

### Gap T1: No row-level navigation
**Severity: MEDIUM**

Pattern Keeper and Knit Companion both support highlighting the current row
(all other rows dimmed). This is the single most-praised interaction pattern in
tracker apps across all fibre crafts.

Our tracker marks individual stitches but has no "current row" mode. Users who
work row-by-row (a common technique for large coverage pieces) must track their
row mentally.

**Recommended response:** Add a "row mode" toggle that highlights one row at a
time and advances on button press or keyboard shortcut. See wireframe WF-03.

---

### Gap T2: Mobile tracker ergonomics
**Severity: MEDIUM**

Our PWA tracker works on mobile but:
- The toolbar collapses at <680px and some controls become harder to reach
- Marking stitches on small patterns requires very precise tapping
- No landscape-optimised layout

Pattern Keeper and Cross Stitch Paradise are native apps designed around mobile
first; their hit targets and layouts are phone-native.

**Recommended response:** Mobile-optimised tracker layout with larger hit
targets, swipe-to-mark gesture, and a dedicated "stitching mode" that hides
non-tracking controls.

---

### Gap T3: No cross-device auto-sync
**Severity: MEDIUM**

Our sync model requires manual file export to OneDrive/Dropbox/Google Drive
and re-import on the other device. Pattern Keeper syncs via Google account on
Android. Thread Stash syncs via account.

Users who design on desktop and track on tablet must manually sync.

**Recommended response:** Medium-term: Add optional cloud backup (export to
Google Drive / Dropbox via their JavaScript APIs). Near-term: Improve the sync
UX to make the file-based flow clearer and easier to trigger.

---

## 3. Stash Management Gaps

### Gap S1: No Anchor in creator pipeline (duplicate of C3)
See Gap C3.

### Gap S2: No specialty/hand-dyed brand support
**Severity: LOW–MEDIUM**

Thread Stash supports Weeks Dye Works and Sullivans. Our stash manager
supports DMC and Anchor only.

Specialty hand-dyed threads are growing in popularity with advanced stitchers
but represent a small fraction of total users.

**Recommended response:** Add "Other / custom" brand support with free-text
name and hex colour entry. This handles any brand without requiring database
maintenance per brand.

---

### Gap S3: No stash CSV export
**Severity: LOW**

Power users who track stash in Notion/spreadsheets have no migration path to/
from our app. A CSV export of thread inventory would be low-effort and high-
goodwill.

**Recommended response:** Add "Export stash as CSV" button in stash manager.
Include columns: Brand, Code, Name, RGB hex, Owned count, Low stock flag.

---

### Gap S4: No per-thread photos
**Severity: LOW**

Ravelry users photograph their yarn. Some thread collectors photograph their
organised thread collections. Our app has no photo field.

**Recommended response:** Deprioritise. Optional feature for a future release.

---

### Gap S5: No wishlist → shopping list with thread gap analysis
**Severity: MEDIUM**

Ravelry shows "here's what yarn you already own vs need for this queued
project." Our pattern library shows status (wishlist/owned/in-progress/
completed) but does not calculate which threads are missing for a wishlist
pattern.

If a user adds a pattern to wishlist, they cannot see "I have 8 of the 12
required colours; I need to buy these 4" without manually checking the legend
against their stash.

**Recommended response:** When viewing a wishlist pattern in the library, show
a thread gap table: "Owned (from stash)" vs "Need to buy." This creates a
natural shopping list. Medium priority.

---

## 4. UX / Discovery Gaps

### Gap U1: PK compatibility not communicated
**Severity: HIGH** (missed opportunity)

Our PDF export is Pattern Keeper–certified. This is table-stakes for the
Android tracking community. StitchMate displays a "Pattern Keeper TESTED"
badge prominently.

We do not mention Pattern Keeper anywhere in our UI. Users who care about PK
compatibility cannot verify our support without testing it.

**Recommended response:** Add "Pattern Keeper compatible" to the export UI and
to any landing page / onboarding material. Zero development cost; high
marketing value.

---

### Gap U2: Max pattern size not communicated
**Severity: MEDIUM** (missed opportunity)

Our app supports up to 5 000×5 000 stitches (inferred from codebase) but this
is not stated anywhere in the UI. Users who hit 300×300 limits on other tools
would not know they can bring their large project here.

**Recommended response:** State maximum size in the Create page header or
pattern size input tooltip. "Up to 5000×5000 stitches" would be a significant
selling point vs most web tools.

---

### Gap U3: Free tier benefits not communicated
**Severity: HIGH** (missed opportunity)

Our app is free with no export limits, no account required, and no size limits.
This is genuinely unusual — most web tools charge per export. But we do not
communicate this at any entry point.

**Recommended response:** Add "Free, no account needed, no export limits" to
the home page hero and to the Create page.

---

### Gap U4: Power features buried / undiscovered
**Severity: MEDIUM**

The SABLE index, file sync, designer branding, palette presets in OKLCH
colourspace, and parking markers are features that are either undiscovered by
most users or require significant exploration to find.

**Recommended response:** Add a "Did you know?" coachmark flow or a features
discovery section. The existing coaching infrastructure supports this.

---

## 5. Gap Priority Summary

| Gap | Severity | Effort | Priority |
|---|---|---|---|
| C1: No stitchability score | HIGH | Medium | **P1** |
| C2: No confetti overlay | HIGH | Medium | **P1** |
| U1: PK compat not communicated | HIGH (missed opportunity) | Low | **P1** |
| U3: Free tier not communicated | HIGH (missed opportunity) | Low | **P1** |
| C4: No text tool | MEDIUM | High | **P2** |
| T1: No row-level navigation | MEDIUM | Medium | **P2** |
| S5: No thread gap analysis | MEDIUM | Medium | **P2** |
| U2: Max size not communicated | MEDIUM (missed opp) | Low | **P2** |
| C3: Creator DMC-only | MEDIUM–HIGH | High | **P2–P3** |
| T2: Mobile tracker UX | MEDIUM | Medium | **P2** |
| T3: No auto-sync | MEDIUM | High | **P3** |
| S2: No specialty brands | LOW–MEDIUM | Low (custom brand) | **P3** |
| S3: No CSV export | LOW | Low | **P3** |
| C5: No French knots | LOW–MEDIUM | Low | **P4** |
| C6: No layers | LOW | Very high | Not recommended |
