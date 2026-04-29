# Stash-Adapt — Phase 2.2 — Data Model

## 1. Schema delta — bump to v12

Add one optional top-level field to the project document:

```ts
project.adaptation?: {
  // Provenance
  fromProjectId: string;          // proj_… of the original
  fromName:      string;          // copy of name at adaptation time
  snapshotAt:    string;          // ISO8601 — when the adapted copy was created
  modeAtCreate:  "stash" | "brand" | "manual";

  // Stash snapshot — present only when modeAtCreate === "stash"
  stashSnapshotAt?: string;       // ISO8601
  stashSnapshotKeys?: string[];   // composite keys of threads owned at snapshot
                                  // (count not preserved; we only need "what was available")

  // Brand conversion — present only when modeAtCreate === "brand"
  brandSource?: "dmc" | "anchor";
  brandTarget?: "dmc" | "anchor";

  // The substitution map — the source of truth for "what changed".
  // Length = number of unique colour ids that were considered.
  // Includes entries even when the user accepted "no change" so the UI
  // can show the original colour in the Changes view.
  substitutions: Substitution[];
};

type Substitution = {
  // Original
  sourceId:    string;            // bare DMC/Anchor id, or "a+b" blend id
  sourceBrand: "dmc" | "anchor";
  sourceName:  string;
  sourceRgb:   [number, number, number];
  sourceLab:   [number, number, number];

  // Replacement (null if user chose to keep the original)
  target: null | {
    key:        string;           // composite "dmc:310"
    id:         string;           // bare id
    brand:      "dmc" | "anchor";
    name:       string;
    rgb:        [number, number, number];
    lab:        [number, number, number];
    deltaE:     number;           // ΔE2000 vs source
    tier:       "exact" | "close" | "good" | "fair" | "poor" | "none";
    confidence: "official" | "reconciled" | "single-source" | "nearest" | "manual";
    source:     "auto-stash" | "auto-brand" | "manual";
    inStash:    boolean;          // whether the user owns it (may be false for "manual" or "auto-brand")
    ownedSkeins?: number;
    neededSkeins?: number;        // from skeinEst() at time of adaptation
    hasSufficient?: boolean;
  };

  // Status
  state: "accepted" | "skipped" | "no-match";
  // skipReason populated when state === "skipped" or "no-match"
  skipReason?: "no-stash-match" | "all-above-threshold" | "no-equivalent" | "user-skipped";
  // For "skipped" / "no-match" we still surface near-miss candidates so the
  // detail picker can show "you don't quite have it but here's what's close".
  nearMisses?: NearMiss[];
};

type NearMiss = {
  key: string; id: string; brand: "dmc"|"anchor";
  name: string; rgb: [number,number,number];
  deltaE: number; tier: Substitution["target"]["tier"];
  inStash: boolean; ownedSkeins?: number;
};
```

### Why these fields and not others

- **`sourceLab` is stored** so the "re-run auto-match" path is
  perceptual without re-deriving Lab from rgb.
- **`stashSnapshotKeys` (just keys, not counts)** — counts change
  constantly, but the *identity* of what was available at adaptation
  time is the meaningful snapshot for "this was adapted using my stash
  as of [date]." Storing counts would be misleading the moment the user
  marks one bought.
- **`confidence: "manual"`** — when the user picks the replacement,
  there's no algorithmic provenance; we record that explicitly rather
  than fudging it.
- **`source` separately from `confidence`** — `source` answers "who
  picked this" (auto-stash / auto-brand / manual); `confidence` answers
  "how strong is the chart evidence" (only meaningful for brand
  conversion). This separation matters in the UI: a manual pick from
  the chart-mapped Anchor option should still show "official" so the
  user remembers why they trusted it.

## 2. Project-list integration

[ProjectStorage](../project-storage.js) → `project_meta` mirror needs one
field added so the project list can render the adaptation badge without
loading the full project blob:

```ts
project_meta.entry.adaptation?: {
  fromProjectId: string;
  fromName:      string;
  modeAtCreate:  "stash" | "brand" | "manual";
};
```

The mirror is written in `ProjectStorage.save`; we add the projection
once and bump `project_meta` version (currently rolls with main DB v3 —
we don't need a DB version bump because object stores are unchanged,
just data shape is augmented).

## 3. Pattern array — unchanged

The `pattern` array continues to carry only `{id, type, rgb}` per cell.
After adaptation, those values are the *substituted* values; the
original colour data lives in `adaptation.substitutions[i].source*`.

This keeps the rendering pipeline unchanged. The canvas, PDF export,
PNG export, OXS export — all already render whatever's in the pattern
array. Adaptation is invisible to them by design.

## 4. Tracking state — reset on adaptation

`done`, `halfStitches`, `halfDone`, `sessions`, `totalTime` are
**discarded** when an adapted copy is created. Rationale in feature spec
§6.1; revisitable at review gate.

`bsLines` (backstitches) **are copied** because their `colour` field
references a palette id that's been re-mapped. They get the same
substitution treatment as cells.

`parkMarkers` are copied unchanged.

## 5. Storage cost

For the documented large case (300×300 / 80 colours, ~10 MB project):

- Substitution array: 80 entries × ~600 bytes ≈ 48 KB
- Stash snapshot keys: 200 × ~12 bytes ≈ 2.4 KB
- New project row: ~10 MB (full deep copy of pattern)

Adapting the worst-case project doubles its storage footprint plus
~50 KB of metadata. IndexedDB quotas (typically ≥ 100 MB modern
browsers) tolerate dozens of adaptations even of large patterns. No
storage management UX needed in this release.

## 6. Migration

- New v12 reader is fully back-compatible: `adaptation` is optional and
  defaults to absent on every existing project. No on-disk migration
  required — projects load forward unchanged.
- Old reader (v11) loading a v12 project will silently drop the
  `adaptation` field and otherwise work. Acceptable because we control
  shipping; no third-party readers exist.
- `project_meta.adaptation` is similarly optional.

## 7. Engine surfaces

New shared module `creator/adaptationEngine.js` exposing pure functions:

```ts
proposeStash(pattern, stashEntries, opts) → Proposal
proposeBrand(pattern, srcBrand, tgtBrand, opts) → Proposal
applyProposal(project, proposal) → Project   // returns deep-copy with adaptation populated
reRunAuto(proposal, lockedSubstitutionIds) → Proposal  // re-matches anything not locked
classifyMatch(deltaE) → Tier                  // pure; from creator/matchQuality.js
findReplacement({ sourceLab, candidates, opts }) → Substitution["target"] | null

type Proposal = {
  mode: "stash" | "brand" | "manual";
  substitutions: Substitution[];
  stashSnapshotKeys?: string[];
  brandSource?, brandTarget?;
  computedAt: string;
};

type Opts = {
  maxDeltaE?: number;          // user-tunable threshold (default 10 for "fair")
  preserveContrast?: boolean;  // existing modal's flag
  minPairwiseDeltaE?: number;  // "" 
  excludeSpecialty?: boolean;  // default true
  preferOfficial?: boolean;    // brand mode only; default true
};
```

The existing `SubstituteFromStashModal` and `ConvertPaletteModal` keep
their inner UIs but delegate proposal generation to the engine. After
the new UI ships and proves out, the legacy modals can be retired in a
follow-up PR.

## 8. Adaptation chain semantics

Adapting an adapted pattern is allowed. The chain stores only one hop
(`fromProjectId` always points at the *immediate* parent) — full
ancestry can be reconstructed by walking the chain on demand. We don't
store a list because deletes and renames would invalidate it.

If a user deletes the parent of an adapted pattern, the adapted copy
keeps working. The editor's "Original →" link gracefully degrades to a
disabled affordance with text "Original deleted (was: *Old Name*)".

## 9. Test coverage matrix

| # | Test | Asserts |
|---|---|---|
| 1 | `proposeStash` on empty stash | returns proposal where every substitution `state==="no-match"`, `target===null`, `skipReason==="no-stash-match"` |
| 2 | `proposeStash` on monochrome pattern | one substitution, correct nearest stash match |
| 3 | `proposeBrand` DMC→Anchor on a colour with chart mapping | `confidence==="official"`, target id matches `CONVERSIONS` |
| 4 | `proposeBrand` on a colour without chart mapping | `confidence==="nearest"`, target is ΔE2000 winner |
| 5 | `proposeBrand` blue-purple fixture (DMC 824/823/3750) | ΔE2000 ranking is correct (CIE76 would not be) |
| 6 | `applyProposal` produces a deep-copy independent of source | mutate copy → source unchanged; mutate source → copy unchanged |
| 7 | `applyProposal` resets tracking | `done`, `halfStitches`, `sessions`, `totalTime` all empty/zero |
| 8 | `applyProposal` preserves backstitches with substituted colours | `bsLines[i].colour` matches the substitution target id |
| 9 | `reRunAuto` with locked substitutions | locked rows unchanged; unlocked re-matched |
| 10 | Round-trip: `applyProposal` → save → load → palette intact | palette and pattern reload identically |
