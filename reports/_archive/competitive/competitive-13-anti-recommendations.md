# Competitive Report 13: Anti-Recommendations

> **Purpose:** Explicit recommendations of what NOT to build — and the
> reasoning. This list is as valuable as the positive recommendations in
> Report 11. Building the wrong things is how a focused product becomes a
> bloated product that excels at nothing.
>
> Each anti-recommendation explains the temptation, the reason to decline,
> and the preferred alternative.

---

## AR-01: Multi-craft support (knitting, crochet, needlepoint)

**The temptation:** Stitch Fiddle supports knitting + crochet and has a large
free user base. Adding multi-craft seems like a natural adjacent market.

**Why not:**
- Stitch Fiddle has owned this space for years and has deeply embedded
  workflows for knitters. We cannot win on feature parity with years of
  technical debt catch-up.
- Knitting charts use completely different symbologies, row-repeat notation,
  and sizing conventions. Supporting them well requires a second codebase, not
  an extension.
- Our integrated suite (create + track + stash) is specifically tuned for
  cross-stitch. Diluting that focus with weaker knitting support damages both
  the cross-stitch users and the new knitting users.
- User research shows that experienced cross-stitchers are attached to
  DMC/Aida vocabulary and do not want their app to feel "generic craft".

**Preferred alternative:** Deepen the cross-stitch specialisation. Add parking
markers, row mode, half-stitch improvements. These are features that knitting
apps cannot copy because they are cross-stitch concepts.

---

## AR-02: Layer system

**The temptation:** Layers are standard in image editors (Procreate, Photoshop).
Advanced pattern editors (WinStitch) offer them. Power users sometimes request
them.

**Why not:**
- Cross-stitch is inherently a single-layer medium. Each fabric cell has exactly
  one thread colour. A layer system adds complexity for a use case that doesn't
  exist in the physical craft.
- The undo/redo history already handles non-destructive editing for every real
  use case we have encountered.
- The added UI (layer panel, blend modes, visibility toggles) would visually
  clutter a tool that is currently clean and approachable.
- Desktop-only apps that have layers (WinStitch) still see user complaints
  about the complexity they introduce.

**Preferred alternative:** Improve the lasso select + fill tools (copy/paste
selection, move selection). This is the actual workflow behind most "I need
layers" requests.

---

## AR-03: Full cloud sync without user-controlled storage

**The temptation:** Offering automatic cloud sync (like Procreate + iCloud, or
Google Docs auto-save) would be a premium differentiator.

**Why not:**
- We are a client-side PWA with no server infrastructure. Building a cloud sync
  backend is an architectural shift of an order of magnitude: authentication,
  servers, databases, billing, GDPR compliance, data breach liability.
- Users would now be trusting us with their data. Our current "no account" model
  is explicitly a trust advantage we would be discarding.
- File-based sync (OneDrive, Dropbox, Google Drive via .csync files) already
  exists and gives users control over where their data lives. This is the better
  architecture.

**Preferred alternative:** Improve the file-based sync UX (Phase 3, R22). Make
.csync onboarding clearer. Add "Last synced" indicator. The user keeps control;
we keep simplicity.

---

## AR-04: Barcode scanning for threads

**The temptation:** Adding a camera barcode scanner (scan a DMC skein to add
to stash) seems like a modern, friction-free interaction.

**Why not:**
- Web apps have limited access to device cameras for barcode scanning without
  specialised libraries (ZXing, etc.), and performance on mobile browsers is
  inconsistent.
- DMC skein barcodes are not standardised across countries. The EAN-13 codes
  on skeins encode different things in different markets.
- The actual friction in stash entry is entering hundreds of codes at once
  (initial setup). Barcode scan is optimised for adding one-at-a-time, which
  is not the painful case.
- Native apps (Thread Stash, etc.) are better positioned for camera features.

**Preferred alternative:** Improve bulk add / CSV import (R17, Phase 3). This
solves the real pain point (initial stash setup of 100+ threads) better than
barcode scanning ever could.

---

## AR-05: Competing with Pattern Keeper on mobile tracking

**The temptation:** Pattern Keeper is the dominant Android tracking app with
100k+ reviews. Building a native-feeling mobile tracker might win some of those
users.

**Why not:**
- Pattern Keeper is a native Android app with years of platform-specific
  optimisations. We are a web PWA. The experience gap on low-end Android devices
  will remain regardless of our effort.
- Pattern Keeper supports any PDF, any file format. We only support our own
  pattern format and PDFs with recognized symbol fonts. This is a genuine
  limitation.
- We should not try to out-Pattern Keeper Pattern Keeper. We should be the
  tool that creates the pattern that gets tracked in Pattern Keeper.

**Preferred alternative:** Deepen the Pattern Keeper integration story. Badge
PK compatibility prominently (R02). Add PK export as a named preset (R06).
Make our export the best PK-compatible export available anywhere. Let PK track
it; let us make it.

---

## AR-06: Premium tiers or paywalls

**The temptation:** Every competitor in the space charges: $1.60/pattern
(StitchMate), $5.50/month (Stitch Fiddle Premium), $10 one-time (Thread-Bare,
Pattern Keeper), $52 (WinStitch). Adding a Pro tier could monetise engaged users.

**Why not:**
- "Free, no limits, no account" is our most powerful competitive positioning.
  The moment we add a paywall, we must answer "why is this one free and not
  that one?" — which undermines trust across the whole product.
- The users most likely to pay are power users with complex needs; but complex
  needs are exactly the users we need to keep happy to maintain social proof
  (Reddit recommendations, LordLibidan reviews).
- A paywall on export (the most natural premium gate) would directly damage the
  Pattern Keeper compatibility value proposition ("free export to PK-format").

**Preferred alternative:** If monetisation is needed, explore:
- Donations (Patreon / GitHub Sponsors) — keeps product free
- One-time "support the app" in-app purchase with no feature gate
- Commercial licensing fee for Etsy sellers (separate, opt-in, not a paywall)

---

## AR-07: Machine embroidery features

**The temptation:** Machine embroidery has a larger market than hand
cross-stitching. Adding DST/PES file export or density fill could address it.

**Why not:**
- Machine embroidery is a completely different craft with completely different
  technical requirements: thread density, underlay stitching, pull compensation,
  jump stitches, file format complexity (DST, PES, EXP, JEF).
- The colour matching pipeline (CIE ΔE, DMC palette) is specifically tuned for
  hand-thread optics; it does not model machine thread at all.
- Users looking for machine embroidery tools will find the product confusing
  and leave negative reviews when it doesn't meet their expectations.

**Preferred alternative:** Do nothing. This is not our market.

---

## AR-08: AI-generated pattern prompts (text-to-pattern)

**The temptation:** Generative AI image tools (Stable Diffusion, DALL-E,
Midjourney) are popular for creating cross-stitch inspiration images. Adding
a "describe a pattern" text field that calls an AI API seems like a modern
feature.

**Why not:**
- Requires API integration and ongoing API costs. We have no server; this
  would require a server-side component just for this feature.
- Output quality is extremely variable. A poor AI generation with our name on
  it reflects on our core quantisation quality.
- Copyright and IP questions around AI-generated cross-stitch designs are
  unresolved. Etsy already bans some AI-generated items. Adding AI generation
  could harm our Etsy seller positioning.
- The most technically accomplished AI-to-stitch tools (Woxel, etc.) have
  significant infrastructure. We would be a distant follower.

**Preferred alternative:** Position the import-from-photo pipeline as the
creative gateway. Users can generate AI images in Midjourney/DALL-E and import
them as images. We handle the cross-stitch conversion — which is what we are
genuinely good at.

---

## AR-09: Social network / community features

**The temptation:** Adding pattern sharing, a community gallery, user profiles,
and likes/follows would increase engagement and retention.

**Why not:**
- Building and moderating a social network is a product in itself. Moderation
  alone (copyright violations, spam, inappropriate content) is a full-time job.
- Users who want community already have it: Reddit r/CrossStitch (400k members),
  Instagram hashtags, Ravelry (multi-craft), Facebook groups.
- Pattern sharing raises copyright issues: sharing a converted version of a
  copyrighted image is the most common legal issue in the cross-stitch community.

**Preferred alternative:** Support one-way sharing that doesn't require
infrastructure: shareable stats cards (R20) that link back to the app. Let
users share their finished work on the communities they already use; just give
them a nice card to share.

---

## AR-10: Redesigning the statistics page for general audiences

**The temptation:** The 22-widget statistics suite is complex. "Simplifying" it
for casual users might broaden appeal.

**Why not:**
- The statistics suite is cited as a genuine differentiator. No competitor has
  anything comparable. Power users who value data will leave if we remove depth.
- The suite is already opt-in per widget: users can hide the widgets they don't
  care about.
- "Simplifying" statistics usually means hiding useful information. Better
  answer: add better labels and tooltips so the information makes sense (R07,
  SABLE tooltip, etc.).

**Preferred alternative:** Add tooltips and explanations to less-obvious
widgets (R07). Make the widget toggle more discoverable. Do not remove or
simplify the underlying depth.

---

## Summary

| Anti-Recommendation | Core reason to decline |
|---|---|
| AR-01: Multi-craft | Can't beat Stitch Fiddle; dilutes focus |
| AR-02: Layer system | Doesn't map to the craft; undo/redo suffices |
| AR-03: Full cloud sync | Server infrastructure required; trust tradeoff |
| AR-04: Barcode scanning | Wrong solution to wrong problem |
| AR-05: Compete with PK on mobile | We make patterns; PK tracks them — play to strengths |
| AR-06: Premium tiers | "Free" is our moat; paywalls destroy the positioning |
| AR-07: Machine embroidery | Different craft, different market |
| AR-08: AI text-to-pattern | Server costs, copyright risk, inferior output |
| AR-09: Social network | Moderation burden; users already have communities |
| AR-10: Simplify stats suite | It is a differentiator; add tooltips, not deletions |
