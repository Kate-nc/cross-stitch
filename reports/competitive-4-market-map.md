# Competitive Report 4: Market Map

> **Purpose:** A structured positioning analysis showing where tools sit across
> key dimensions and where whitespace exists. Use this as a reference when
> evaluating feature tradeoffs.

---

## 1. Primary Axes

The two most strategically significant dimensions are:

| Axis | Why it matters |
|---|---|
| **Feature breadth** (creation / tracking / stash) | Defines whether a tool can serve the full user journey |
| **Delivery / access** (desktop / web / mobile) | Defines friction to try and use the tool |

---

## 2. Feature Breadth Map

```
                   CREATION ONLY ◄────────────────────────────────► FULL SUITE
                                                                    (create+track+stash)

 DESKTOP    WinStitch ●   PCStitch ●   KG Chart ●   MiniStitch ●
            (create only, no tracking, no stash management)

 WEB        Thread-Bare ●   StitchMate ●   patterncreator ●   Stitch Fiddle ●
            (create only — Stitch Fiddle adds basic tracking)
                                                            ◄── gap ──►   ● OUR APP

 MOBILE     Magic Needle ●   StitchSketch ●   Cross Stitch Saga ●
            (create only, mobile)

                              ──── tracking pivot ────

            Pattern Keeper ●       Cross Stitch Paradise ●       Markup R-XP ●
            (track only)           (track only)                  (track only)

            Thread Stash ●   Cross Stitch Thread Organizer ●   X-Stitch ●
            (stash only / thread management only)
```

**Reading this map:** Every tool is in one box. Our app is the only tool that
spans creation + tracking + stash in a single web application.

---

## 3. Price vs Quality Matrix (Creation Tools)

```
         HIGH QUALITY
               │
   WinStitch ● │ ● StitchMate
   MacStitch   │   (high quality, medium price)
   ($52)       │
               │  ● Thread-Bare
               │  ($10/pattern)
 ─────────────────────────────────
 LOW PRICE     │             HIGH PRICE
               │
   ● Stitch Fiddle     ● PCStitch
   (free, good         ($50, declining)
   enough)
               │ ● Our App (free, competitive)
               │
         LOW QUALITY
```

Our app positions in the top-left quadrant alongside Stitch Fiddle: free but
competitive quality. We are not yet at StitchMate/Thread-Bare quality for
pattern generation but have features neither of them offers (tracking, stash,
statistics).

---

## 4. Access Friction vs Capability

Higher on the vertical axis = more capable (more features).
Further right on the horizontal axis = lower friction (easier to start).

```
                         HIGH CAPABILITY
                                │
          WinStitch ●           │
          (install, $52, Win/Mac│only)
                                │  ● Our App  ← unique position:
          PCStitch ●            │    high capability + zero friction
                                │
──────────────────────────────────────────────────────── LOW FRICTION (no install, free)
 HIGH FRICTION                  │
 (install / cost)               │
                         ● Stitch Fiddle
          KG Chart ●    (free, web, moderate capability)
                                │
                         ● StitchMate
                         (web, pay per export,
                         high capability for creation)
                                │
                         LOW CAPABILITY
```

Our app is the only tool in the top-right quadrant (high capability + zero
friction). This is the strategically defensible position — reaching it requires
continuing to match or exceed desktop-tool feature depth while maintaining a
zero-cost, no-install experience.

---

## 5. Mobile vs Desktop User Journey Mapping

```
User journey:       Find idea → Convert image → Edit pattern → Print PDF
                    → Track progress → Manage threads → Buy threads

WinStitch user:     [Desktop]──────────────────[Desktop]──────[Manual]
PCStitch user:      [Desktop]──────────────────[Desktop]──────[Manual]
StitchMate user:    [Web]───────────────────[Web+export]──[Pattern Keeper]──[Manual]
Stitch Fiddle user: [Web]──────[Web + built-in tracking]──────────────[Manual]
Pattern Keeper user: ─────────────────────────[Import PDF]──[Android]──────[Manual]
Our App user:       [Web]────────────────[Web]──────────[Web+PWA]──────────[Web]
```

Our app is the only one where the full journey stays in one product.

---

## 6. Competitive Positioning by User Segment

| User segment | Typical tool stack | Our app's coverage |
|---|---|---|
| Beginner | Stitch Fiddle (create) → Pattern Keeper (track) | Covered by one app |
| Intermediate | StitchMate (create) → Pattern Keeper (track) → Thread Stash (stash) | Covered by one app |
| Advanced / designer | WinStitch (create) → Pattern Keeper (track) → X-Stitch or Thread Stash (stash) | Creation quality gap vs WinStitch |
| Etsy seller | WinStitch or Thread-Bare (create, branded PDF) → separate stash | PDF branding ✓; creation quality gap |
| Mobile-first | Magic Needle (create) → Cross Stitch Paradise (track) | PWA covers both |

---

## 7. Thread Brand Coverage Map

```
 DMC only:         Most tools (Stitch Fiddle, StitchMate base, patternsforyou,
                   MiniStitch, FlossCross, Magic Needle, pixel-stitch.net)

 DMC + Anchor:     KG Chart variant, patterncreator, FreePatternWizard,
                   pixel-stitch.net, Crosti, Our App (stash; creator is DMC-only)

 DMC + Anchor +    Thread-Bare (DMC, Anchor, Riolis)
 1–2 extras:       StitchMate (50+ brands — market leader here)
                   WinStitch/MacStitch (30 brands)

 Niche brands:     Thread Stash (Weeks Dye Works, Sullivans)
 hand-dyed:        StitchMate (hand-dyed brands)
```

Our position: DMC-only in creator (schema limitation), DMC + Anchor in stash.
This is a meaningful gap vs StitchMate's 50+ brands, but for the majority of
users (DMC is 80%+ of thread purchases) it is not a dealbreaker.

---

## 8. Market Dynamics (2024–2026 Trends)

### Growing segments:
1. **Pattern Keeper ecosystem** — PK certification has become table-stakes for
   PDF exports. Any new tool that does not pass PK testing loses the Android
   tracker market.

2. **Confetti reduction** — StitchMate built its position entirely on this.
   It is now an expected differentiator, not a nice-to-have.

3. **Web tools displacing desktop** — WinStitch/PCStitch hold market share via
   inertia but are not growing. New users default to web tools. Our app is
   positioned to capture new users.

4. **Etsy seller tooling** — Growing number of pattern designers monetise on
   Etsy. Commercial-grade PDF tooling (branding, licensing) is the emerging
   premium tier.

5. **Multi-craft tools** — Stitch Fiddle's knitting/crochet expansion is a
   moat-building strategy. We cannot compete here and should not try.

### Declining segments:
1. Desktop-only tools with no web companion
2. Per-pattern pricing without premium quality justification
3. DMC-only tools as the Anchor/Cosmo user base becomes more vocal

---

## 9. Whitespace Analysis

| Whitespace | Description | Competition | Our coverage |
|---|---|---|---|
| **Integrated create+track+stash** | Single web app, full journey | None | ✓ Full coverage |
| **Stitchability quality score** | Real-time quality metric during generation | StitchMate (FLOW score) | Partial (orphan removal, no score) |
| **Confetti visual diagnostic** | Overlay showing problem areas | StitchMate (ConfettiScope) | None |
| **Statistics / analytics** | Project and stitch analytics over time | None in market | ✓ 22+ widgets |
| **Stash-aware pattern creation** | Limit palette to threads owned | None in market | ✓ "Limit to stash" filter |
| **Cross-device seamless sync** | Auto-sync without manual export | Thread Stash (account-based) | Manual file sync |
| **Row-level tracker navigation** | Highlight current row | Pattern Keeper, Knit Companion | Cell-only |
| **Social/sharing features** | Shareable WIP progress | XStitch Plus (limited) | None |
| **Physical pattern OCR import** | Photo of paper pattern → digital | Markup R-XP | None |

The top three rows are the highest-priority items to address: stitchability
quality feedback, confetti diagnostics, and cross-device sync are the features
where users most often choose a competitor.

---

## 10. Summary Positioning Statement

**Our app is the only free, offline-capable, browser-based tool that unifies
pattern creation, stitch tracking, and thread stash management in a single
integrated workflow.**

The strategic value of this position is:
- No cost barrier to try or continue using
- No switching between 2–3 apps
- Full journey visible in statistics
- Exportable (PK-compatible PDF) when users want to move to mobile tracking

The strategic vulnerability is:
- Creation quality (confetti, FLOW score) trails StitchMate
- Creator is DMC-only (technical debt)
- No cross-device auto-sync (file-based workaround exists)
- Not discoverable to users searching "cross stitch app" on app stores
