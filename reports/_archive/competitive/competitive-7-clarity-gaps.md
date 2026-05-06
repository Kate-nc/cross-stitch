# Competitive Report 7: Clarity Gaps

> **Purpose:** Where does our app fail to communicate its value clearly?
> This includes confusing labels, undiscovered features, missing trust signals,
> and terminology that creates friction with user mental models.

---

## 1. What Is a "Clarity Gap"?

A clarity gap occurs when the app is technically capable of something but the
user does not know it, cannot find it, or does not understand why they should
care. These gaps do not require new feature development — they require better
communication, labelling, and disclosure.

Clarity gaps are often more impactful per effort than building new features,
because they make existing capabilities visible and trustworthy.

---

## 2. Missed Value Communication at Entry Points

### CG-1: Free with no export limits
**Impact: HIGH**

Our app is free and has no per-export charges. This is genuinely unusual among
web tools: StitchMate charges per export, Thread-Bare charges $10/pattern,
Stitch Fiddle charges $5.50/month for full features.

**Current state:** The word "free" does not appear in any prominent UI element.
The cost model is implied (no paywall encountered) but never stated.

**Why this matters:** Users who have been conditioned by StitchMate and Stitch
Fiddle to expect payment walls may assume we also have one, and quit before
reaching the export step.

**Fix:** Add "Free, no account needed, unlimited exports" in three places:
1. The home page hero/tagline
2. The Export tab in the creator (beside the Export button)
3. Any onboarding first-run state

---

### CG-2: Pattern Keeper compatibility not shown
**Impact: HIGH** (for users who track on Android)

Our PDF export is Pattern Keeper–certified. This is the most important trust
signal for the 100 000+ Pattern Keeper users deciding whether our app will
fit their workflow.

**Current state:** No mention of Pattern Keeper anywhere in the UI.

**Fix:** Add "Pattern Keeper compatible" to:
1. The Export tab header
2. Any landing / home page content
3. The export success confirmation

---

### CG-3: Maximum pattern size not stated
**Impact: MEDIUM**

Users comparing web tools check size limits. Stitch Fiddle markets its
2 000×2 000 grid. patterncreator.com's 250×250 limit is called a "MAJOR issue"
by LordLibidan. Pixel-stitch.net advertises "no size limits."

Our app supports up to 5 000×5 000 stitches (per constants.js canvas limits)
but this is not stated anywhere visible to users.

**Fix:** Show max canvas size in the pattern size input (tooltip or helper text):
"Up to 5000×5000 stitches — no limits for complex projects."

---

### CG-4: Offline / PWA capability not communicated
**Impact: MEDIUM**

Our app is a fully offline-capable PWA. Users can install it and use it without
internet access. This is a significant advantage over StitchMate (requires
connection to load), Thread-Bare, and other web-only tools.

**Current state:** The PWA install prompt appears but there is no explanatory
text about what "installing" means or the offline benefit.

**Fix:** Add tooltip or banner: "Works offline once installed — your patterns
stay available without internet."

---

### CG-5: Integrated workflow benefit not visible
**Impact: HIGH**

The core value proposition of our app — that you can create, track, and manage
stash in one place — is never stated explicitly. Users who arrive on the creator
page may not know the tracker exists, and vice versa.

**Current state:** The navigation header has links to all sections, but there
is no "Here's why this is powerful" message anywhere.

**Fix:** A first-run tooltip or home page section: "One app for the whole
journey — create patterns, track your stitching, manage your thread collection."

---

## 3. Confusing or Poorly Named Features

### CG-6: "Orphan removal" terminology
**Impact: MEDIUM**

"Orphan removal" is the internal/technical term for confetti stitch cleanup.
Users searching for help with "confetti" or "isolated stitches" will not
recognise "orphan" as relevant.

StitchMate uses "confetti cleanup" and "ConfettiScope" — terms that map directly
to user language ("confetti" is the community word for isolated stitches).

**Fix:** Rename or add alias: "Confetti cleanup (orphan removal)" or just
"Confetti cleanup" with a tooltip explaining what confetti stitches are.

---

### CG-7: "SABLE index" requires explanation
**Impact: LOW–MEDIUM**

SABLE is an in-joke acronym from the yarn community ("Stash Acquisition Beyond
Life Expectancy"). It is beloved by stash hoarders but meaningless to casual
users. Our SABLE chart appears in statistics with no explanation.

**Current state:** The SABLE widget appears in stats with no tooltip.

**Fix:** Add a tooltip or info icon: "SABLE index — are you buying more thread
than you're using? A rising SABLE index means your stash is growing."

---

### CG-8: "Parking markers" with no explanation
**Impact: MEDIUM** (for users unfamiliar with the parking technique)

Parking markers are a niche but valuable feature. Users who do not use the
parking technique will ignore them. Users who do use it may not know we support
it.

**Current state:** Parking markers are in the tracker toolbar with an icon;
no tooltip explaining what parking is or why you'd use it.

**Fix:** Tooltip: "Parking markers — mark where you've left a threaded needle
mid-stitch when working with multiple colours simultaneously."

**Bonus:** Mention parking support on the home page or in onboarding. Pattern
Keeper is recommended by users specifically because it is "the only app that
tracks parking." We also support it; we should say so.

---

### CG-9: "Backstitch" panel discoverability
**Impact: MEDIUM**

Backstitch is one of the most important stitch types for pattern outlines and
details. Our app supports backstitch (bsLines), but users who have only used
the standard cell editor may not know it exists.

**Fix:** Add a tooltip or first-use coachmark on the backstitch tool button
explaining what it is and how to use it.

---

### CG-10: "Limit to stash" filter in creator
**Impact: MEDIUM** (for stash-connected users)

The "Limit palette to stash" feature in the creator is a genuinely unique
feature — no competitor has it. But it only appears in the palette settings and
requires the user to have set up their stash first.

**Current state:** The feature exists but is not called out in onboarding, the
home page, or any promotional material.

**Fix:** Highlight this feature during first-run of the creator: "Have a thread
stash? Let us limit your palette to what you already own."

---

## 4. Trust Signal Gaps

### CG-11: No "last updated" signal
**Impact: LOW–MEDIUM**

Users evaluating tools check for signs of active development. LordLibidan
notes update frequency for every tool reviewed. Several tools lose points for
being "last updated 2009" or "no updates since 2016."

**Current state:** Our app has no visible version number, last-updated date, or
changelog link.

**Fix:** Add a small "What's new" link or changelog modal accessible from the
footer or help drawer. Even a simple "Last updated: May 2026" builds confidence.

---

### CG-12: No social proof
**Impact: MEDIUM**

StitchMate shows "5,194 patterns created, 9,266 photos converted" on its
homepage. It also quotes Lord Libidan: "In my opinion, the best online program
for cross stitch right now." These signals build trust quickly.

**Current state:** Our app has no equivalent social proof or testimonials.

**Fix:** If usage data is available (patterns created via the app), show it.
If not, a single quote from a real user or reviewer would help.

---

## 5. Export / PDF Clarity

### CG-13: Workshop print theme opt-in not explained
**Impact: LOW**

The Workshop print theme for PDFs is a user preference but the differences
between the default (Pattern Keeper–compatible) and Workshop theme are not
explained anywhere in the UI.

Users may enable Workshop theme and then find their PDF doesn't load correctly
in Pattern Keeper — a frustrating experience.

**Fix:** Add a brief note in the export settings: "Workshop theme uses richer
styling. Standard theme is recommended for Pattern Keeper compatibility."

---

### CG-14: Export options overwhelm without guidance
**Impact: MEDIUM**

The PDF export tab has many options: page size, margins, chart modes, cover page,
designer branding, backstitch chart, mini legend, page overlap. A new user does
not know which options matter for their use case.

**Fix:** Add preset export configurations:
- "For personal use" (standard, no cover page)
- "For Pattern Keeper" (PK-compatible, optimised)
- "For Etsy / selling" (cover page, designer branding, full legend)

Each preset pre-fills the relevant settings. Users can still customise.

---

## 6. Onboarding Clarity

### CG-15: Tour skippability loses users
**Impact: MEDIUM**

The per-page onboarding tours run on first visit and can be skipped. Users who
skip them miss important feature disclosures (parking, stash link, etc.).

**Fix:** Make the tour re-triggerable from the help menu. Add a "Feature tips"
shortcut so users can re-run the tour at any time. This is especially important
for the creator, which has the most hidden depth.

---

### CG-16: Empty state design
**Impact: MEDIUM**

When a new user opens the app for the first time, they see an empty project
dashboard. There is no starter template, example pattern, or "create your first
pattern" CTA prominently displayed.

Empty states are an onboarding opportunity that competitors like StitchMate use
well (their hero is "upload your photo — result in seconds").

**Fix:** First-run empty state for the dashboard: large "Make your first
pattern" card with a brief explanation; small "Import existing pattern" link;
optional sample project pre-loaded.

---

## 7. Clarity Gap Summary

| Gap | Impact | Effort | Priority |
|---|---|---|---|
| CG-1: Free tier not stated | HIGH | Low (copy) | **P1** |
| CG-2: PK compat not shown | HIGH | Low (badge + copy) | **P1** |
| CG-5: Integrated workflow benefit | HIGH | Low (copy) | **P1** |
| CG-6: "Orphan removal" → "confetti cleanup" | MEDIUM | Low (rename) | **P1** |
| CG-16: Empty state / first-run | MEDIUM | Medium | **P1** |
| CG-3: Max size not stated | MEDIUM | Low | **P2** |
| CG-4: PWA/offline not communicated | MEDIUM | Low | **P2** |
| CG-8: Parking markers tooltip | MEDIUM | Low | **P2** |
| CG-10: "Limit to stash" not surfaced | MEDIUM | Low | **P2** |
| CG-14: Export presets | MEDIUM | Medium | **P2** |
| CG-15: Tour re-triggerable | MEDIUM | Low | **P2** |
| CG-7: SABLE index tooltip | LOW–MEDIUM | Low | **P3** |
| CG-9: Backstitch discoverability | MEDIUM | Low | **P3** |
| CG-11: Last updated signal | LOW–MEDIUM | Low | **P3** |
| CG-12: Social proof | MEDIUM | Low | **P3** |
| CG-13: Workshop theme note | LOW | Low | **P4** |
