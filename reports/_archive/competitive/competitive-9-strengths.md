# Competitive Report 9: Strengths to Amplify

> **Purpose:** Identify our genuine competitive advantages — features where we
> lead the market — and assess how well we are currently leveraging them.
> Strengths that are hidden are wasted strengths.

---

## 1. Framework

For each strength, we assess:
- **Current visibility:** How clearly is this communicated to users?
- **Current leverage:** How much of the strategic value are we extracting?
- **Amplification opportunity:** What would it take to extract more value?

---

## 2. Strength 1: The Integrated Workflow

**What it is:** Create, track, and manage stash in one app — no switching
between tools, no format conversions, no duplicate data entry.

**Competitive context:**
- Every other tool serves one part of the journey
- The typical serious stitcher uses 2–3 apps: StitchMate/Stitch Fiddle +
  Pattern Keeper + Thread Stash/X-Stitch
- Total cost: $10–$120/year + $10.50 (PK) + $3–$10 (thread apps) = $23–$140/year
- Total friction: patterns exported from one tool, imported into another; stash
  manually cross-referenced; stats split across apps

**Our position:** A user who adopts our app for all three needs pays $0, has
all their data in one place, and gets cross-feature analytics (e.g., the stash
analytics reflect the threads used in their patterns).

**Current visibility:** LOW. The home page functions as a dashboard but does
not explain the integrated proposition.

**Amplification:**
1. Landing page headline: "Create patterns, track your stitching, manage your
   threads — all in one place, all free."
2. Onboarding tour that explicitly shows the connection: "The palette you create
   with syncs to your stash."
3. "Integrated workflow" explainer section on home page with a 3-step visual.

---

## 3. Strength 2: Statistics Suite (22+ Widgets)

**What it is:** A comprehensive analytics suite covering lifetime stitches,
project velocity, SABLE index, DMC coverage, designer leaderboard, WIP age,
completion projections, thread usage trends, and more.

**Competitive context:**
- No competitor offers any cross-project analytics
- Pattern Keeper, Thread Stash, Stitch Fiddle: zero analytics
- Ravelry has basic "yards used" tracking for yarn; nothing like our suite

**Our position:** This is a genuinely unique feature. A dedicated stitcher who
uses our app for a year accumulates a rich dataset about their hobby that they
cannot get from any other tool.

**Current visibility:** LOW. The stats page is a menu item; no promotional
material highlights the analytics capability.

**Amplification:**
1. Stats preview card on the home page: show a teaser of the user's stats even
   before they open the stats page.
2. "Your stitching in numbers" call-to-action on the home page for users with
   data.
3. Monthly/weekly digest: a brief stats summary delivered on the home page each
   week ("This week you stitched 843 stitches — 12% ahead of your average").
4. Shareable stats cards: an export of a visual "year in review" card that users
   can post to Instagram or Reddit.

---

## 4. Strength 3: Free with No Export Limits

**What it is:** The app is entirely free — no per-export charge, no subscription,
no account required, no feature gating.

**Competitive context:**
- StitchMate: £1.60–£3.49 per export
- Thread-Bare: $10 per pattern
- Stitch Fiddle: free tier limits backstitch/selection to Premium ($5.50/month)
- PCStitch: $50 one-time; WinStitch: $52 one-time
- Pattern Keeper: $10.50

**Our position:** For a user who makes 12 patterns/year, StitchMate would cost
£19–£42/year; Thread-Bare $120/year. We cost $0. Over 5 years: $0 vs $95–$600.

**Current visibility:** ZERO. We do not mention price (or lack thereof) anywhere.

**Amplification:**
1. State "Free" prominently in every entry point
2. On the export step, a small note: "Export is free — no charges, no limits"
3. Comparison table on the home page (optional, if not too promotional):
   "You'd pay $X/year for equivalent features elsewhere"

---

## 5. Strength 4: Offline PWA

**What it is:** The app is a Progressive Web App with a service worker that
caches all app assets. Once loaded, it works without an internet connection.
Projects are stored in IndexedDB (local to the device).

**Competitive context:**
- StitchMate, Thread-Bare, Stitch Fiddle: require network connection
- Desktop tools (WinStitch, PCStitch) are offline but require installation
- Pattern Keeper: native Android, offline
- Our app: offline-capable web app — no install required for full offline use

**Our position:** This is uniquely valuable for:
- Users who stitch in areas with poor connectivity (on a train, abroad)
- Users who distrust cloud storage of personal projects
- Users on slow connections where SaaS tools are sluggish

**Current visibility:** LOW. A PWA install prompt appears but the offline
benefit is not explained.

**Amplification:**
1. "Works offline after first load — install to your home screen for app-like
   access"
2. In the tracker (where offline is most useful): indicator showing "offline
   mode — all changes saved locally"

---

## 6. Strength 5: Parking Method Tracking

**What it is:** Parking markers allow users to mark where they have left a
threaded needle parked in the fabric. This is a niche but important technique
used by serious stitchers working with many colours simultaneously.

**Competitive context:**
- Pattern Keeper is cited by LordLibidan as "the only app to support parking"
  in the context of tracking apps
- Our app also supports parking markers — but this is not known

**Our position:** We are on par with Pattern Keeper (the market leader) for
parking support. This is a feature that serious stitchers specifically seek out.

**Current visibility:** VERY LOW. No mention in onboarding, no tooltip
explaining parking.

**Amplification:**
1. Add tooltip: "Parking markers — leave a marker where your needle is parked
   while working multiple colours (used with the parking technique)"
2. In any comparison or marketing material: "Supports the parking technique —
   like Pattern Keeper"
3. The parking feature could be a blog post / community post ("Did you know
   our tracker supports parking?")

---

## 7. Strength 6: Pattern Keeper–Compatible PDF

**What it is:** Our PDF export is Pattern Keeper–certified. This means Android
users can import our patterns directly into Pattern Keeper for tracking.

**Competitive context:**
- Stitch Fiddle does NOT produce PK-compatible PDFs
- StitchMate does (and shows a "Pattern Keeper TESTED" badge)
- Thread-Bare does (it is a selling point)

**Our position:** On par with the market leaders for PK compatibility.

**Current visibility:** ZERO. Not mentioned anywhere in the UI.

**Amplification:**
1. "Pattern Keeper compatible" badge on the export UI
2. Mention in any landing page / home page content
3. If/when a more detailed feature page exists, include PK certification

---

## 8. Strength 7: Stash-Aware Pattern Creation

**What it is:** The "Limit palette to stash" feature in the creator constrains
the colour quantisation to only use thread colours the user actually owns.
This means generated patterns are immediately stitchable without buying new threads.

**Competitive context:**
- No competitor offers stash-aware creation
- This requires both creation and stash data in the same system — which only
  we have

**Our position:** Exclusively ours. This is a true differentiator that cannot
be replicated by creation-only tools.

**Current visibility:** LOW. The feature exists in the creator palette settings
but is not called out during onboarding.

**Amplification:**
1. Highlight during first use of the creator if stash data exists
2. On the home page: "Have a thread collection? We'll design your pattern
   around what you already own."
3. Consider a "Generate from stash" quick-action button on the home page

---

## 9. Strength 8: Rich Import Format Support

**What it is:** We import .oxs (KG Chart XML), .json (native), image files,
and .pdf (symbol-font detection). Our .oxs support brings in KG Chart users.

**Competitive context:**
- Stitch Fiddle: .oxs only
- StitchMate: .oxs, .pat, .xsd
- Desktop tools: proprietary formats

**Our position:** .oxs, .json, image, .pdf — comparable breadth to StitchMate.

**Current visibility:** LOW. Import formats not listed in UI.

**Amplification:**
1. Import screen: list supported formats with icons
2. "Coming from KG Chart? We can open your .oxs files directly."

---

## 10. Strength 9: Full Stitching Session Analytics

**What it is:** Every stitching session is logged with start time, duration,
stitch count, and net stitches. This enables:
- Historical velocity tracking
- Streak calculation
- Completion date projection
- Time-per-stitch analysis

**Competitive context:**
- No competitor logs session data with this granularity
- Pattern Keeper does not log sessions at all
- Cross Stitch Paradise has session "tracking" but no analytics

**Our position:** Exclusively ours.

**Amplification:**
1. Session summary card after each tracking session: "You stitched 312 stitches
   in 47 minutes — your personal best!"
2. Weekly streak reminder on the home page
3. Completion date projection shown on the active project card

---

## 11. Strength Summary

| Strength | Current visibility | Amplification priority |
|---|---|---|
| S1: Integrated workflow | Low | **P1 — core message** |
| S2: Statistics suite | Low | **P1 — differentiation** |
| S3: Free + no limits | Zero | **P1 — must state this** |
| S4: Offline PWA | Low | **P2** |
| S5: Parking method support | Very low | **P2** |
| S6: PK-compatible PDF | Zero | **P1** |
| S7: Stash-aware creation | Low | **P1 — unique to us** |
| S8: Import formats | Low | **P3** |
| S9: Session analytics | Low | **P2** |

All nine strengths exist and are genuine. Seven of them are either invisible or
barely visible to users. The highest-leverage work is communicating what already
exists, not building new features.
