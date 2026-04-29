# Stash-Adapt — Phase 2.1 — Feature Spec

## 1. One-line definition

> **Adapt** turns any pattern into an independent, editable copy whose
> palette is remapped — to your stash, to a different brand, or to any
> colours you choose — with honest match-quality information for every
> substitution.

## 2. Names & terminology

- **Original** — the source pattern. Never modified by this feature.
- **Adapted pattern** (or **adaptation**) — a deep-copy duplicate that
  carries a substitution map and back-reference to its original.
- **Substitution** — a mapping `original colour → replacement thread`
  with quality metadata.
- **Stash adaptation** — Flow A: substitutions sourced from the user's
  owned threads.
- **Brand conversion** — Flow C: substitutions sourced from a target
  brand's catalogue (DMC ↔ Anchor).
- **Colour swap** — Flow B: a single in-place substitution on any
  pattern, original or adapted.

## 3. Core capabilities (must have)

| # | Capability | Notes |
|---|---|---|
| C1 | Non-destructive duplication | Hard rule: original is byte-identical before and after. |
| C2 | Auto-suggest from stash, ranked by ΔE2000 | Reuses `SubstituteFromStashModal`'s proposal builder. |
| C3 | Manual override per substitution | Replacement can be any DMC, any Anchor, any stash thread, or "leave original." |
| C4 | Match-quality indicator on every row | See report 8 for the design. |
| C5 | Distinct visual treatment for "no match in stash" vs "no match exists" | Two skip reasons → two UX outcomes. |
| C6 | Swap-colour-everywhere on any pattern | Flow B; works without invoking adaptation. |
| C7 | Snapshot semantics | Adapted pattern stores the substitution map and stash snapshot at creation; later stash edits never alter it. |
| C8 | Empty-stash graceful path | Feature still useful for brand conversion + manual swaps. |

## 4. Should-have

| # | Capability |
|---|---|
| S1 | Toggle preview between original and adapted (no extra screen). |
| S2 | Granular per-substitution undo. |
| S3 | "Re-run auto-match on remaining rows" — preserves manual picks. |
| S4 | Adapted patterns are clearly labelled in project list, editor title bar, and exports. |
| S5 | "Show what changed" — list of original→replacement pairs, surfaced in the editor and the export. |
| S6 | Cross-brand conversion (Flow C) reuses the same review UI as Flow A. |

## 5. Out of scope (this release)

- Live stash↔pattern linking (the adapted pattern is a snapshot; that's
  the contract).
- Shopping-list generation directly from the adaptation flow. (The
  existing shopping list is project-scoped; an adapted pattern that
  generates a shopping list will work via the existing path because it's
  a normal project. We're not building a *new* "buy what you don't own"
  flow inside the adaptation modal.)
- Cost / skein-quantity adequacy beyond what `SubstituteFromStashModal`
  already shows (`hasSufficient` flag).
- New thread brands beyond DMC and Anchor.
- Specialty threads (variegated, metallic, light-effects). Excluded from
  *automatic* matching; remain manually selectable. The exclusion is
  driven by id-prefix detection in a small data file (`SPECIALTY_PREFIXES`)
  so future brands can opt in without code changes.
- Dye-lot tracking.

## 6. Technical decisions

### 6.1 Duplication strategy: **deep copy**

- Pattern arrays for the documented worst case (300×300, 80 colours) are
  ~5–15 MB serialised. Two of them is fine in IndexedDB.
- An override-layer / copy-on-write approach would make the "delete the
  original" requirement complicated (we'd need to materialise on delete)
  without saving meaningful storage in our regime.
- The existing `serializePattern` / `deserializePattern` round-trip is
  the cleanest way to get a guaranteed-independent copy. Implementation:
  serialise the source project minus tracking state (`done`,
  `halfStitches`, `halfDone`, `sessions`, `totalTime`) → deserialise
  into a new in-memory project → mint a new id and `createdAt` →
  attach the substitution map and `adaptedFrom` metadata → save.
- **Tracking state is reset on adaptation.** Rationale: the user is
  about to re-stitch with different threads; carrying done-state from
  the original implies progress they haven't made. Spec C7 says
  "snapshot," and that's most honest if it includes "fresh tracking."
  This is a deliberate UX decision worth confirming with the user at the
  review gate.

### 6.2 Matching algorithm: **CIEDE2000 with chart-table fallback**

- Stash adaptation: pure ΔE2000 ranking against owned threads.
- Brand conversion: `CONVERSIONS` chart first, ΔE2000 fallback when
  empty. Always show both the *chart confidence* and the *measured
  ΔE2000* so the user can override for either reason.
- Tier thresholds match those in report 2 (exact / close / good / fair /
  poor / no-match), centralised in `creator/matchQuality.js`.

### 6.3 State location: **adaptation lives on the project**

- New top-level optional fields on the project schema (v12):
  - `adaptation: { fromProjectId, fromName, snapshotAt, stashSnapshotAt, brandTarget, substitutions: [...] }`
- The substitution map is the source of truth for what was done. The
  pattern array carries the *result* (already substituted ids/rgbs).
  Keeping both lets the UI show "this was DMC 310, you swapped to Anchor
  403" without recomputing.
- Patterns that have never been adapted leave `adaptation` absent.

### 6.4 Engine reuse

- Keep `SubstituteFromStashModal` and `ConvertPaletteModal`'s
  proposal builders; refactor them out of those files into a shared
  `creator/adaptationEngine.js` with two exports — `proposeStash(pattern, stash, opts)`
  and `proposeBrand(pattern, srcBrand, tgtBrand, opts)`. Both return the
  same shape. The new UI consumes either.
- General colour-swap (Flow B) doesn't need a proposal — it's
  user-driven. It does need a `searchThreads(query, brand?)` helper that
  supports id and name search across DMC + Anchor catalogues. This is
  trivial to add in `helpers.js`.

## 7. Hard rules (lifted from the user request, restated)

1. The original is **never** modified by the adaptation flow. Test:
   modify the adapted, confirm original byte-identical; modify the
   original, confirm adapted byte-identical; delete the original,
   confirm adapted still loads.
2. Match quality must be perceptual (ΔE2000), not RGB-Euclidean, on
   every quality decision.
3. Match-quality labels must be honest. If we say "Good" we mean ΔE < 5.
4. Empty stash must work — Flow C and Flow B do not depend on the stash.
5. Mobile is first-class. Every screen ships responsive.
6. Adapted patterns are visibly distinct everywhere they appear.
7. Per-substitution undo within the flow.
8. Match calculation budget: total review-screen open ≤ 1 s for the
   worst case (80 colours × 200 stash threads).
9. Conversion tables stored as data, not code (already true).
10. "No match in stash" ≠ "no match exists" — separate UX paths.
