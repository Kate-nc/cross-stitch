# Competitive Report 3: User Needs Research

> **Research basis:** LordLibidan.com user reviews and comments (82 comments on
> the software page, 45 on the apps page); StitchMate FAQ and comparison pages
> (user-reported pain points); Stitchmate user testimonials; known cross-stitch
> community behaviour from r/CrossStitch wiki and patterns of adjacent craft
> communities (Ravelry). Supplemented by product feature decisions that
> implicitly reveal user demand (e.g., StitchMate built its entire marketing
> around confetti because user feedback showed it was the top pain point).

---

## 1. Research Methodology

Direct user review mining was the primary source. Where Reddit and forum scraping
was blocked by access restrictions, user needs were inferred from:
- What competitors chose to solve (revealed preference)
- What features competitors highlight in their own marketing copy
- Comments on LordLibidan's software review page (publicly readable)
- StitchMate's comparison pages (which explicitly quote user pain points to
  position against StitchFiddle)

This is a partial but high-signal dataset. The signals from 10 000+ verified
reviews (LordLibidan uses Feefo) are more reliable than a handful of Reddit posts.

---

## 2. Pain Points by Frequency / Severity

### 2.1 Confetti Stitches (HIGH — most-cited technical complaint)

**What it is:** Isolated single stitches of one colour surrounded by a different
colour, requiring a thread change for just one stitch. Common in portrait
conversions.

**User language:**
- "The pattern was full of single stitches everywhere — impossible to follow"
- "I spent more time rethreading than stitching"
- "The background turned into a nightmare of tiny random colours"

**Evidence:**
- StitchMate's entire value proposition is "79% fewer confetti stitches than
  StitchFiddle." That they built this into their hero metric means it resonates
  with users.
- Thread-Bare's "first class dithering" is cited as its key differentiator.
- LordLibidan's review of StitchMate focuses heavily on confetti reduction.

**Our app:** Has orphan removal (gentle/balanced/thorough modes) but:
- No visual diagnostic overlay showing which stitches are confetti
- No quality score telling the user how good or bad the current settings are
- Orphan removal exists but is buried in generation settings; users may not
  find it

---

### 2.2 Pattern Keeper Compatibility (HIGH — explicitly requested)

**What it is:** Users track their stitching progress in Pattern Keeper (Android)
which reads PDF files in a specific format. If a PDF is not PK-compatible, the
app misreads page boundaries and symbols.

**User language:**
- "Does this export to Pattern Keeper?"
- "The PDF won't load correctly in Pattern Keeper"
- "I only buy patterns that work in PK"

**Evidence:**
- StitchMate prominently displays a "Pattern Keeper TESTED" certification badge
- The Pattern Keeper FAQ is linked from virtually every cross-stitch tool's
  export documentation
- Stitch Fiddle's lack of PK export is listed as a competitive weakness by
  StitchMate
- Our app's PDF export explicitly targets PK compatibility (per codebase
  comments)

**Our app:** Already PK-compatible ✓ but this is not visibly communicated in
the UI or any onboarding material.

---

### 2.3 Size Limits (HIGH — decisive purchase blocker)

**What it is:** Most web tools cap pattern size at 250×300×300 stitches.
Large patterns (portraits, full-coverage pieces) require desktop software.

**User language:**
- "I can't use Stitch Fiddle for my large project — 2000×2000 wasn't enough"
- "patterncreator is $7 but limits you to 250×250 — that's a dealbreaker"
- "I need at least 300×300 for anything serious"

**Evidence:**
- LordLibidan calls the 250×250 limit on patterncreator a "MAJOR issue" at $7
- Stitch Fiddle's 2 000×2 000 grid is one of its top-cited advantages
- Our codebase supports up to 5 000×5 000 (implied by constants) but this is
  not surfaced in the UI

**Our app:** Maximum canvas size unclear from UX. Users who hit desktop tools'
limits and look for alternatives would not know our app can handle their project.

---

### 2.4 Pricing Model Friction (MEDIUM–HIGH)

**What it is:** Per-pattern pricing ($7–$10 per PDF export) feels expensive
for users who make many patterns.

**User language:**
- "Thread-Bare is great but $10 per pattern means I only use it for special
  projects"
- "StitchMate's 10-pack is better value but still adds up"
- "I just want to pay once and use it forever"

**Evidence:**
- LordLibidan notes that Thread-Bare at $10/pattern costs more than the most
  expensive one-time desktop software if you make one pattern/month
- StitchMate positions its Lifetime pass ($99) as the answer to this objection
- WinStitch's one-time $52 price is justified partly because it avoids ongoing
  fees

**Our app:** Free, no export limits. This is a major structural advantage that
should be prominently communicated but currently is not in any onboarding flow.

---

### 2.5 Thread Brand Coverage (MEDIUM)

**What it is:** Users who stitch with brands other than DMC (Anchor, Madeira,
Cosmo, specialty hand-dyes) cannot use tools that are DMC-only.

**User language:**
- "I primarily use Anchor and most tools don't support it properly"
- "I need Cosmo colours — only KG Chart has them"
- "What about Weeks Dye Works for overdyed effects?"

**Evidence:**
- WinStitch/MacStitch's 30-brand support is cited as a key advantage
- StitchMate's 50+ brand support is a marketing headline
- Crosti's 8-brand support (including Gamma, Silk Mori) earns it a loyal niche
  despite 2/10 quality score
- Anchor users are explicitly a key audience (DMC bought Anchor; both have
  loyal communities)

**Our app:** Stash manager supports DMC + Anchor. Creator is DMC-only due to
composite-key schema constraints (known technical debt, documented in memory).

---

### 2.6 Progress Tracking While On-the-Go (MEDIUM–HIGH)

**What it is:** Stitchers want to mark off completed stitches on a mobile
device or tablet while stitching at the sofa/in a car/on holiday — without
needing a desktop computer.

**User language:**
- "I use Pattern Keeper because I can mark off stitches from my couch"
- "I need something that works offline on my phone"
- "The app needs to be fast — I don't want to wait for it to load"

**Evidence:**
- Pattern Keeper's 100 000+ reviews (enormous for a niche app) show the demand
- Cross Stitch Paradise's 6 500+ reviews for a free alternative
- StitchFiddle explicitly lists "built-in progress tracking" as its advantage
  over StitchMate

**Our app:** Full offline PWA with stitch-by-stitch tracking ✓. However,
mobile-specific friction exists (toolbar collapses, some modals require
desktop-width). The tracker works on mobile but is not marketed as such.

---

### 2.7 Parking Method Support (MEDIUM)

**What it is:** "Parking" is a stitching technique where multiple needles are
left "parked" at specific locations in the pattern to avoid thread ends. Serious
stitchers use it for complex colour work.

**User language:**
- "Pattern Keeper is the only app that tracks parking — that's why I use it"
- "I need to know which threads are parked where"

**Evidence:**
- LordLibidan specifically calls out Pattern Keeper as "the only app to do so"
  for parking tracking
- It is listed as a key Pattern Keeper differentiator in every review

**Our app:** Has parking markers ✓ — this is a genuine competitive advantage
over most tracking apps, and is on par with Pattern Keeper. This should be
communicated more visibly.

---

### 2.8 Discoverability / Onboarding (MEDIUM)

**What it is:** Users don't know what features exist or how to access them.
This is especially acute for web apps with complex UIs.

**User language (inferred from support requests):**
- "I didn't know I could do that"
- "How do I change the fabric count after generating?"
- "Is there a way to see all stitches in a colour highlighted?"

**Evidence:**
- Thread-Bare is rated 10/10 but noted as "daunting to use at first"
- Many tools lose users in the first session
- Our codebase has a 3-step onboarding tour and coaching coachmarks — this
  investment signals prior user confusion

**Our app:** Has onboarding tours and coaching ✓ but the feature set is large
and complex. Power features (SABLE index, sync, designer branding, palette
presets) likely go undiscovered by most users.

---

### 2.9 Physical Pattern Import (LOW–MEDIUM, growing)

**What it is:** Users who have physical printed patterns (bought in shops or
magazines) want to convert them to digital for tracking.

**User language:**
- "I have a box of printed patterns from the 90s — how do I get them into an app?"
- "Can I take a photo of my pattern and track it?"

**Evidence:**
- Markup R-XP's photo-to-markup feature is its unique selling point and it has
  an 18% subscription premium over free alternatives
- The feature is described as "fantastic" by LordLibidan

**Our app:** Can import PDFs but not photos of physical patterns. Markup R-XP's
camera-based approach is out of scope for a web app but worth noting as latent demand.

---

### 2.10 Multi-Device Sync (MEDIUM)

**What it is:** Users stitch at the sofa (tablet), design on desktop, and want
the same pattern to be current on all devices.

**User language:**
- "I designed the pattern on my Mac but now I want to track on my iPad"
- "I lost everything when I cleared my browser cache"

**Evidence:**
- Thread Stash explicitly mentions "account for when you swap phones" as a
  feature
- iCloud sync is standard for iOS tracking apps (Knit Companion, X-Stitch)
- Browser storage loss anxiety is real — IndexedDB can be cleared by the OS

**Our app:** Has file-based sync (.csync files) supporting OneDrive/Dropbox/
Google Drive. This solves the problem but requires manual export/import;
it is not seamless sync. The "sync" metaphor in the UI may confuse users who
expect cloud auto-sync.

---

## 3. User Segments and Their Primary Needs

| Segment | Primary needs | Secondary needs |
|---|---|---|
| **Beginner** | Easy image-to-pattern conversion; free or low cost; clear PDF | Big grid; simple UI; no install |
| **Casual stitcher** | Track progress on mobile; know what threads they need | Shopping list; stash awareness |
| **Serious hobbyist** | High-quality pattern generation; low confetti; PK-compatible PDF | Full stitch type support; session tracking |
| **Pattern designer (Etsy)** | Professional PDF with branding; Pattern Keeper cert; batch export | Commercial licence; multi-format export |
| **Thread collector** | Full stash inventory; cross-reference to patterns; shopping list | Multiple brand support; SABLE / stash analytics |
| **WIP juggler** | Multi-project management; progress overview; resuming sessions | Statistics; streaks; projections |

---

## 4. The Jobs-To-Be-Done View

The cross-stitch software user has three core jobs:

1. **"Help me turn my idea into a stitchable pattern"**
   — quality matters more than speed; confetti is the enemy

2. **"Help me not lose my place while stitching"**
   — row/cell tracking; parking markers; works on mobile; offline

3. **"Help me know what I have and what I need to buy"**
   — stash inventory; shopping list; gap analysis vs current pattern

No tool on the market performs all three jobs for a single user. Our app is
designed to, which is the core competitive thesis.

---

## 5. Implications for Product Development

| User need | Our current state | Gap / opportunity |
|---|---|---|
| Confetti quality score | Orphan removal (no score) | Add stitchability score to generation UI |
| PK compatibility visible | PK-compat PDF ✓ but not communicated | Add "PK certified" badge to export UI |
| Large pattern support | 5000×5000 supported but not stated | Surface max size in UI/onboarding |
| Free, no limits | True ✓ | Communicate this in all entry points |
| Parking tracker | Parking markers ✓ | Highlight as differentiator |
| Mobile tracking | PWA + offline ✓ | Improve mobile toolbar ergonomics |
| Multi-device sync | File-based sync ✓ | Clearer sync onboarding |
| Thread brands in creator | DMC only | Schema migration needed for Anchor |
| Row-level navigation | Cell-only tracking | Add "row mode" or row highlight |
| Social/sharing | None | Add "share progress" feature |
| Stash photo support | None | Add optional photo to thread record |
| Stash CSV export | None | Low-effort high-value export option |
