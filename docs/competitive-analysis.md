# stitchx — Competitive Analysis

> Research date: 2025  
> Sources: Official product pages, r/CrossStitch community (1M+ members), crossstitchsubfaq.com

---

## 1. Market Overview

The cross-stitch software market splits cleanly into two jobs:

| Job | Dominant tools | Gap |
|---|---|---|
| **Pattern creation** (image → chart) | Desktop apps (MacStitch/WinStitch, PCStitch); web tools (Stitch Fiddle, FlossCross) | No free browser tool handles the full pipeline from photo → cleaned chart → export |
| **Pattern tracking** (stitching in progress) | Pattern Keeper (mobile); Markup-RXP (power users) | No tracker with creation built in; Pattern Keeper has known import issues |
| **Stash management** | Manual spreadsheets or the Stash Manager within specialised apps | Rarely integrated with creation or tracking |

stitchx occupies all three jobs in a single client-side PWA with no account or install required — a position no direct competitor holds.

---

## 2. Competitor Profiles

### 2.1 Pattern Keeper
- **Platform:** iOS + Android (one-time purchase, ~£5–8)
- **Strengths:**
  - The community default for tracking; mentioned in almost every FO post as a tool used
  - Clean PDF import for standard charts
  - Stitch-by-stitch marking, symbol search, color counts
  - Strong ecosystem: many pattern designers explicitly state "Pattern Keeper compatible"
- **Weaknesses / known community pain points:**
  - **Does not display backstitch.** Multiple users report forgetting to stitch backstitch entirely because it wasn't visible in the app.
  - **PDF import failures with complex or non-standard charts.** Users report incomplete imports, requiring restarts after thousands of stitches.
  - **Half stitches and unusual stitch types** "do not play nice with Pattern Keeper."
  - No pattern creation — purely a tracker.
  - No stash/thread inventory.
  - Slow/no developer response to support queries (community reports unanswered questions).
- **Community quotes:**
  > "Pattern Keeper hadn't fully imported the chart… after ~3000 stitches"  
  > "Pattern Keeper doesn't display backstitch, so I completely forgot this pattern had some"  
  > "half stitches and whatnot did not play nice with pattern keeper"

---

### 2.2 Markup-RXP (MRXP)
- **Platform:** Windows/Mac (yearly licence)
- **Strengths:**
  - More powerful stats than Pattern Keeper: per-symbol, per-page, totals, average stitch rate, estimated completion date, daily/monthly graphs
  - Handles Scarlet Quince full-coverage blend patterns (Pattern Keeper cannot)
  - Stores progress photos and comments per project
  - Responsive developer (answers within 1 day)
  - Per-page focus mode
- **Weaknesses:**
  - Yearly licence vs one-time purchase — a significant community objection
  - Proprietary backup format
  - Blended stitch support requires manual symbol editing per stitch
  - Desktop-only; no mobile tracking
  - No pattern creation

---

### 2.3 MacStitch / WinStitch (Ursa Software)
- **Platform:** macOS / Windows ($35–$65, free trial)
- **Strengths:**
  - Professional-grade pattern design and editing
  - OXS format (Open X-Stitch) import/export — the standard for cross-app interop
  - Used by commercial designers (e.g. StephXStitch uses MacStitch)
  - Photo import with colour reduction
- **Weaknesses:**
  - Paid and desktop-only
  - No tracking or stash management
  - Significant learning curve

---

### 2.4 PCStitch
- **Platform:** Windows only ($49.95)
- **Strengths:** Long-established, pattern design, used by community for manual pattern cleanup
- **Weaknesses:** Windows-only, no tracking, no stash management, high price

---

### 2.5 KG Chart
- **Platform:** Windows ($35)
- **Strengths:** Good for Japanese-style counted charts, competitively priced
- **Weaknesses:** Windows-only, no tracking

---

### 2.6 Stitch Fiddle
- **Platform:** Web, free
- **Strengths:** Free, no install, converts illustrations and images to patterns, works for cross-stitch and crochet graphgans
- **Weaknesses:**
  - No tracking, no stash management
  - Limited photo-to-pattern quality vs dedicated tools
  - No offline use

---

### 2.7 FlossCross
- **Platform:** Web, free, no registration
- **Strengths:**
  - WebGL rendering for fast chart display
  - True DMC colour rendering (498 colours with accurate swatches)
  - Backstitch in Line and Pen modes
  - Half-cross and petite stitch support
  - OXS import/export (MacStitch/WinStitch 2021 compatible)
  - PDF export with custom settings
  - All data stored locally in browser — no server uploads
  - Autosave
- **Weaknesses:**
  - No photo-to-pattern conversion
  - No tracking or stash management
  - Local browser storage only (no cross-device sync)
- **Positioning overlap:** FlossCross is the closest web-based competitor for the creation side; stitchx's photo pipeline, stash management, and integrated tracker are the main differentiators

---

### 2.8 Pic2Pat / My Photo Stitch / CStitch
- Simple free photo-to-pattern converters
- No tracking, no stash, limited quality control
- Produce "pattern mill"-style outputs with excessive confetti (major community complaint)

---

### 2.9 MiniStitch
- **Platform:** All platforms, free or $15 advanced
- Lightweight design tool, limited community presence

---

## 3. Feature Comparison Matrix

| Feature | stitchx | Pattern Keeper | MRXP | MacStitch/WinStitch | Stitch Fiddle | FlossCross |
|---|---|---|---|---|---|---|
| Pattern creation from photo | Yes | No | No | Yes | Partial | No |
| Pattern creation from scratch | Yes | No | No | Yes | Yes | Yes |
| Stitch tracking | Yes | Yes | Yes | No | No | No |
| Backstitch display in tracker | Yes (in canvas) | **No** | Yes | N/A | N/A | Yes |
| Half stitch support | Yes | Partial | Yes | Yes | No | Yes |
| Blend (2-colour) support | Yes | Partial | Partial | Yes | No | No |
| Thread stash management | Yes | No | No | No | No | No |
| Multi-project dashboard | Yes | Yes | Yes | No | No | No |
| Time tracking | Yes | No | Yes | No | No | No |
| Estimated completion stats | No | No | Yes | No | No | No |
| OXS import | Yes | No | No | Yes | No | Yes |
| OXS export | No | No | No | Yes | No | Yes |
| PDF export (Pattern Keeper compat) | Yes | N/A | N/A | Yes | No | Yes |
| No install required | Yes | No | No | No | Yes | Yes |
| No account required | Yes | No | No | No | Partial | Yes |
| Offline capable (PWA) | Yes | Yes | Yes | Yes | No | No |
| Free | Yes | No | No | No | Yes | Yes |
| Mobile-first | No (responsive) | Yes | No | No | No | No |

---

## 4. Community-Identified Pain Points (research from r/CrossStitch, 1M+ members)

These are real user complaints about the existing ecosystem, representing opportunities:

1. **Pattern Keeper import failures** — a significant number of FO posts mention partial imports, requiring manual workarounds or restarts.
2. **Backstitch invisibility in Pattern Keeper** — users routinely forget backstitch exists because their tracker doesn't show it. Several FOs posted "oops, forgot backstitch."
3. **No single tool covers the full workflow** — users juggle a pattern design app, a tracker app, and a spreadsheet for stash. The switch cost is real.
4. **"Pattern mill" output quality** — automated converters produce patterns with too many colours, excessive confetti, and similar symbols. Users request tools that help them clean up these patterns manually.
5. **Scarlet Quince / full-coverage blend patterns** — Pattern Keeper cannot handle them; MRXP can but requires manual blend entry. A significant niche of high-count stitchers is underserved.
6. **Desktop-only professional tools** — MacStitch and PCStitch require a desktop OS; there is no professional-grade browser alternative.
7. **Subscription fatigue** — MRXP's yearly licence is a recurring community objection. One-time or free tools are strongly preferred.
8. **Colour accuracy** — community discussion about DMC 09 charting issues in HAED patterns highlights how incorrect colour mapping in software causes real stitching errors. Accurate Lab/RGB matching matters.

---

## 5. stitchx Differentiation Summary

### Unique strengths (no competitor matches all of these)
- **All-in-one, free, browser-based, no account** — the only tool that creates, tracks, and manages stash in a single place with zero friction to start
- **Photo-to-chart pipeline with quality algorithms** — k-means quantisation, Floyd-Steinberg dithering, CIE ΔE colour matching, bilateral filter, Canny edge detection; far beyond simple converters
- **Pattern Keeper-compatible PDF export** — bridges to the dominant tracker without lock-in
- **Blend (2-colour stitch) support** throughout creation, tracking, and materials calculation
- **Thread stash awareness** — cross-references owned threads against project requirements, a feature no competitor offers in a browser tool
- **Session time tracking** — built into the stitch tracker, matches MRXP's differentiating stat

### Gaps vs top competitors
| Gap | vs. Competitor | Priority |
|---|---|---|
| No backstitch display in tracker | Pattern Keeper has same gap; MRXP shows it | Medium |
| Estimated completion date / daily graphs | MRXP differentiator | Low–Medium |
| OXS export | MacStitch, WinStitch, FlossCross support it | Medium |
| Mobile-native experience | Pattern Keeper strength | Medium |
| Scarlet Quince / per-page mode | MRXP differentiator | Low |
| No cloud sync / cross-device | Most desktop tools have this | Low (PWA offline-first is a feature) |

---

## 6. Positioning Statement

> stitchx is the only free, browser-based tool that takes you from a photo all the way through to a finished stitch — creating the pattern, tracking your progress, and managing your thread stash — without an account, an install, or a subscription.

---

## 7. Sources

- Pattern Keeper: community FO posts, r/CrossStitch wiki, https://patternkeeper.app
- Markup-RXP: [r/CrossStitch comparison post](https://old.reddit.com/r/CrossStitch/comments/12eu280/chat_comparison_of_markuprxp_to_pattern_keeper/)
- MacStitch/WinStitch: https://www.ursasoftware.com/macstitch/
- FlossCross: https://flosscross.com/
- Stitch Fiddle: https://www.stitchfiddle.com/
- crossstitchsubfaq.com pattern design resources page
- r/CrossStitch state of the subreddit survey results (app-related pain points)
- r/CrossStitch FO posts mentioning Pattern Keeper issues (multiple, 2023–2025)
