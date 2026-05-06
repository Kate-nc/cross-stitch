# Difficulty Factor 07 — Stitcher-Relative Difficulty

**Status:** Research / Proposal  
**Date:** 2026-05-04  
**Scope:** Personal adjustment layer on top of the objective difficulty score

---

## 1. The Problem This Factor Solves

Every other difficulty factor measures the pattern itself — stitch count, colour complexity, fabric count, backstitch density, etc. Those produce an objective score that is the same for every stitcher who looks at that pattern.

But the same pattern feels completely different to different stitchers:

- A master stitcher finds a 40-colour portrait routine.
- A beginner finds a 10-colour sampler overwhelming.
- A stitcher used to 14-count finds 18-count suddenly hard; a 28-count veteran finds 14-count relaxing.

This factor asks: *given what we know about this specific stitcher, how hard will this pattern actually feel to them?*

The answer is a **personalised modifier** — never a replacement for the objective score.

---

## 2. Personal Dimensions of Difficulty

### 2a. Experience Level

A self-reported or derived estimate of overall skill. Four tiers map to the objective scoring tiers:

| Tier | Typical Profile |
|---|---|
| **Beginner** | First 1–3 projects; may not know standard terminology; relies on numbered fabric |
| **Intermediate** | 4–20 projects; comfortable with 14-count, full cross stitches, small palettes |
| **Advanced** | 20+ projects; has done backstitching, blends, finer counts; can handle complex colour work |
| **Expert** | Extensive experience; metallics, fractional stitches, specialty fabrics, large portraits |

Experience level is the master knob — all other modifiers are calibrated relative to it.

### 2b. Colour Count Comfort

The maximum number of colours the stitcher has successfully managed in a completed project. A stitcher who has only ever worked from 8-colour kits may feel genuine anxiety at a 25-colour pattern even if that pattern is objectively "Intermediate".

This is derivable from project history (stats_summaries palette arrays).

### 2c. Fabric Count Comfort

The count the stitcher normally works on. Experience with fabric count is highly non-linear:

- Moving from 14-count to 18-count is a significant jump for most beginners.
- Moving from 18-count to 28-count is another jump.
- Stitchers experienced at 28-count rarely find 14-count "hard" — just slower.

The app stores `fabricCt` in project metadata (`buildMeta` → `meta.fabricCt`), so a stitcher's "usual count" is derivable without any additional data.

### 2d. Technique Exposure

Has the stitcher previously used:
- **Backstitching** — detail lines that require different needle control and judgment
- **Half stitches** — requires orientation discipline
- **Blends** — two threads on the needle simultaneously; threading fiddliness
- **Fractional stitches** (quarter, three-quarter) — small needle in fabric holes; piercing the fabric
- **French knots** — fundamentally different hand motion; common failure point for beginners

Backstitch and half stitch exposure are partially detectable from saved projects (see §4). Blends are detectable from `stats_summaries.palette` (blend IDs contain `+`). Fractionals are stored as stitch-layer types in the tracker but are not currently surfaced in metadata.

### 2e. Project Completion Rate

A motivational difficulty factor that is unique to this app because it has longitudinal project history.

If a stitcher has abandoned their last three large projects, a new large project is "harder" for them in a practical sense — the risk of non-completion is elevated regardless of objective skill. This is not about judging the stitcher; it is about giving them realistic planning information.

Completion rate = (projects where `completedStitches >= totalStitches`) / (total projects started). This is computable from `project_meta` records, though care is needed with very new users (< 3 projects) where rate is meaningless.

### 2f. Stitches-per-Hour Rate

Personalised time estimation — the most directly actionable output of personal difficulty.

The app already records timing data in `statsSessions` per project. The `project_meta` store includes `stitchesPerHour` (computed in `buildMeta` from `statsSessions` net stitches / total seconds). This makes a personalised time estimate achievable from existing data, with no schema changes.

A stitcher who averages 200 stitches/hour will find a 50,000-stitch project takes 250 hours. The same pattern might take a faster stitcher 100 hours. Both facts are useful; neither is the same as the objective difficulty tier.

---

## 3. What App Data Already Exists

### 3a. `project_meta` store — available from `ProjectStorage.listProjects()`

`listProjects()` reads from the `project_meta` store without loading pattern data. Each entry is built by `buildMeta(p)` in `project-storage.js` and contains:

| Field | Type | Relevant to personalisation? |
|---|---|---|
| `id` | string | Identity |
| `name` | string | — |
| `dimensions` | `{width, height}` | Stitch grid size (multiply for total grid cells) |
| `totalStitches` | number | Max stitches in any project |
| `completedStitches` | number | Completion tracking |
| `fabricCt` | number (default 14) | Stitcher's usual fabric count |
| `sessionCount` | number | Project activity level |
| `totalMinutes` | number | Total time invested |
| `stitchesPerHour` | number | Personal pace (derived from statsSessions) |
| `lastSessionDate` | string / null | Recency |
| `createdAt`, `updatedAt` | string | Project age |

What `project_meta` does **not** contain:
- Whether the project has backstitching (`bsLines` is only in the full project)
- Whether the project has half stitches (`halfStitches` only in full project)
- The colour palette (colours are in `stats_summaries`, not `project_meta`)
- Whether the project is "completed" (must be derived: `completedStitches >= totalStitches && totalStitches > 0`)

### 3b. `stats_summaries` store — available from `ProjectStorage.getAllStatsSummaries()`

Each entry is built by `buildStatsSummary(p)` and contains everything in `project_meta` plus:

| Field | Type | Relevant to personalisation? |
|---|---|---|
| `palette` | `[{id, name, rgb}]` | Colour count AND blend detection (`id.includes('+')`) |
| `isComplete` | boolean | Directly usable for completion rate |
| `statsSessions` | array | Full session array for detailed pace analysis |
| `achievedMilestones` | array | — |

Blend detection from `stats_summaries`: the `buildStatsSummary` code explicitly splits blend IDs (`cell.id.indexOf('+') !== -1`) and emits each constituent thread separately. This means **you cannot detect blends from stats_summaries** by looking for `+` in palette IDs — the split happens before writing. The `+` detection would need to happen at an earlier stage, or a `hasBlends` boolean would need to be added to `buildStatsSummary`.

Correction: reading `buildStatsSummary` more carefully — it does split blend IDs _when building the palette output_, but the split happens inside the anonymous IIFE and each constituent thread is pushed individually. So a project with blend `310+550` would show `{id: '310'}` and `{id: '550'}` in `stats_summaries.palette`, not `{id: '310+550'}`. **Blend detection requires a full project load** or a schema addition.

### 3c. Full project load — `ProjectStorage.get(id)`

Available fields relevant to personalisation:

| Field | Source | Relevant to personalisation? |
|---|---|---|
| `bsLines` | `[]` array | Has backstitching (non-empty = yes) |
| `halfStitches` | `{}` object | Has half stitches (non-empty = yes) |
| `pattern` cells with `type: 'blend'` | pattern array | Has blends |
| `settings.fabricCt` | settings | Fabric count this project used |
| `statsSessions[].netStitches`, `durationSeconds` | sessions | Per-session pace |

### 3d. `user-prefs.js` — existing relevant keys

Searching `DEFAULTS` in `user-prefs.js`, the following keys are potentially relevant:

| Key | Default | Relevance |
|---|---|---|
| `creatorDefaultFabricCount` | `16` | The stitcher's preferred count when creating new patterns |
| `creatorAllowBlends` | `true` | Indicates comfort with blends (indirect) |
| `stitchStrandsUsed` | `2` | Default strand count — affects difficulty perception for fine counts |
| `stashDefaultBrand` | `"DMC"` | — |

**No experience-level keys currently exist.** There is no `user.experienceLevel`, no `user.hasUsedBackstitch`, no `user.hasUsedBlends`, and no `user.preferredFabricCount` in the DEFAULTS object. These would all be new additions.

The `creatorDefaultFabricCount` key (default `16`) is the closest existing proxy for fabric-count preference, but it represents the _creation default_, not necessarily a _comfort level_ declaration.

---

## 4. Technique Detection from Project History

### What can be derived without full project loads

From `project_meta` alone (fast, no per-project loading):
- Number of projects started
- `totalStitches` per project → max stitches in any project
- `completedStitches` + `totalStitches` → completion rate
- `fabricCt` per project → range of counts used
- `stitchesPerHour` per project → personal pace (though note: this is 0 if the stitcher never used the timer)
- Project dimensions → can infer approximate project scale

From `stats_summaries` (one read for all summaries):
- `isComplete` → cleaner completion rate
- `palette.length` → colour count per project → max colours managed
- `statsSessions` → richer pace analysis (outlier session removal, etc.)

### What requires full project loads

- **Backstitching**: `bsLines.length > 0` — only in full project
- **Half stitches**: `Object.keys(halfStitches).length > 0` — only in full project
- **Blends**: pattern cells with `type === 'blend'` — only in full project

**Recommendation for technique detection:** Add three boolean flags to `buildStatsSummary` and `buildMeta`:

```javascript
hasBackstitch: (p.bsLines && p.bsLines.length > 0),
hasHalfStitch: (p.halfStitches && Object.keys(p.halfStitches).length > 0),
hasBlends: (function() {
  if (!p.pattern) return false;
  for (var i = 0; i < p.pattern.length; i++) {
    if (p.pattern[i] && p.pattern[i].type === 'blend') return true;
  }
  return false;
})(),
```

These flags would be written at save time and available from `listProjects()` / `getAllStatsSummaries()` without further loading. This is a small, backwards-compatible schema addition.

---

## 5. Deriving Experience Level from Project History

### Algorithm

```javascript
function deriveExperienceLevel(projects, statsSummaries) {
  // projects = results of ProjectStorage.listProjects()
  // statsSummaries = results of ProjectStorage.getAllStatsSummaries()
  
  const completed = statsSummaries.filter(s => s.isComplete);
  const projectCount = projects.length;
  const completedCount = completed.length;
  
  // Sum total stitches completed across all projects
  const totalStitchesDone = statsSummaries.reduce(
    (sum, s) => sum + (s.completedStitches || 0), 0
  );
  
  // Max colours in any single project
  const maxColours = statsSummaries.reduce(
    (max, s) => Math.max(max, (s.palette || []).length), 0
  );
  
  // Technique flags (requires hasBackstitch/hasHalfStitch/hasBlends in schema)
  const hasUsedBackstitch = statsSummaries.some(s => s.hasBackstitch);
  const hasUsedHalfStitch = statsSummaries.some(s => s.hasHalfStitch);
  const hasUsedBlends     = statsSummaries.some(s => s.hasBlends);
  const techniqueScore    = [hasUsedBackstitch, hasUsedHalfStitch, hasUsedBlends]
                              .filter(Boolean).length;
  
  // Range of fabric counts used
  const fabricCounts = projects.map(p => p.fabricCt || 14);
  const maxFabricCt = Math.max(...fabricCounts);
  
  // Classification
  if (projectCount < 3 || totalStitchesDone < 5_000) {
    return { level: 'beginner', confidence: projectCount >= 1 ? 'medium' : 'low' };
  }
  if (projectCount < 15 && totalStitchesDone < 100_000) {
    return { level: 'intermediate', confidence: 'medium' };
  }
  if (projectCount >= 30 && totalStitchesDone >= 400_000 && techniqueScore >= 2) {
    return { level: 'expert', confidence: 'high' };
  }
  if (projectCount >= 15 || totalStitchesDone >= 100_000) {
    return { level: 'advanced', confidence: projectCount >= 20 ? 'high' : 'medium' };
  }
  return { level: 'intermediate', confidence: 'low' };
}
```

### Calibration Notes

The thresholds above are a starting point, not final values. Reasonable adjustments:

- `totalStitchesDone` thresholds are generous. A stitcher who has completed five 10,000-stitch projects (50k total) has clearly cleared "beginner" — intermediate at ~30k seems more defensible.
- `projectCount` alone is a weak signal for expert — a stitcher who has done 50 simple bookmarks is not expert. Weighting by average project complexity (colours × stitches) would improve this.
- `techniqueScore` improves the advanced→expert discrimination significantly.

---

## 6. The Two-Score System

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  OBJECTIVE SCORE (always shown)                         │
│  Based purely on pattern properties.                    │
│  Same for every stitcher. Safe to share/embed.          │
│  e.g.  "Intermediate  ★★☆☆"                            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼  (only if user data available)
┌─────────────────────────────────────────────────────────┐
│  PERSONAL ADJUSTMENT (shown below objective score)      │
│  Always a modifier, never a replacement.                │
│  e.g.  "May feel Advanced for you — you've worked       │
│          with up to 18 colours; this has 35"            │
│  Shown inline, opt-out hidden behind a toggle.          │
└─────────────────────────────────────────────────────────┘
```

### Rules

1. The objective score is always computed and always shown.
2. The personal adjustment is shown only when the user has project history OR has set an experience level preference.
3. The personal adjustment is always framed as a modifier: **"Intermediate / may feel Advanced for you"** — not "Advanced".
4. The personal adjustment never appears in a shared URL, PDF export, or any output that leaves the browser. Only the objective score is portable.
5. When the personal adjustment matches the objective score (no modifier needed), it is omitted silently — do not show "Intermediate / feels Intermediate for you" as that is noise.
6. The adjustment degrades gracefully: fewer input signals → lower confidence → more cautious language.

---

## 7. Personal Adjustment Algorithm

### Input object

```javascript
/**
 * @typedef {Object} StitcherProfile
 * @property {string|null}  experienceLevel   - 'beginner'|'intermediate'|'advanced'|'expert'|null
 * @property {number}       maxColoursEver    - highest palette size in any completed project (0 if unknown)
 * @property {number}       maxStitchesEver   - highest totalStitches in any completed project (0 if unknown)
 * @property {boolean}      hasUsedBackstitch
 * @property {boolean}      hasUsedBlends
 * @property {boolean}      hasUsedHalfStitch
 * @property {number}       usualFabricCt     - most common fabric count across projects (14 if unknown)
 * @property {number}       completionRate    - fraction 0..1 (null if < 3 projects)
 * @property {number|null}  stitchesPerHour   - personal pace (null if no timing data)
 * @property {'high'|'medium'|'low'} profileConfidence
 */
```

### Output object

```javascript
/**
 * @typedef {Object} PersonalAdjustment
 * @property {string}   adjustedTier     - 'Beginner'|'Intermediate'|'Advanced'|'Expert'
 * @property {number}   tierDelta        - signed integer: +1 means one tier harder than objective
 * @property {Array}    modifiers        - list of active modifier messages
 * @property {number|null} estimatedHoursPersonal
 * @property {'high'|'medium'|'low'} confidence
 */
```

### Algorithm

```javascript
const TIER_ORDER = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

function computePersonalAdjustment(objectiveScore, pattern, profile) {
  // objectiveScore = { label: 'Intermediate', stars: 2, ... }
  // pattern = { colourCount, blendCount, totalStitches, hasBackstitch,
  //              hasHalfStitch, fabricCt }
  // profile = StitcherProfile (see above)

  if (!profile || profile.profileConfidence === 'low' && !profile.experienceLevel) {
    return null; // not enough data, omit personal adjustment entirely
  }

  const modifiers = [];
  let tierDelta = 0;
  const baseIdx = TIER_ORDER.indexOf(objectiveScore.label);

  // ── Colour count modifier ──────────────────────────────────────────
  if (profile.maxColoursEver > 0 && pattern.colourCount > profile.maxColoursEver * 1.5) {
    const gap = pattern.colourCount - profile.maxColoursEver;
    modifiers.push({
      factor: 'colour_count',
      message: `You've worked with up to ${profile.maxColoursEver} colours; this has ${pattern.colourCount}`,
      adjustment: gap > 20 ? +2 : +1,
    });
    tierDelta += gap > 20 ? 2 : 1;
  } else if (profile.maxColoursEver > 0 && pattern.colourCount < profile.maxColoursEver * 0.5) {
    modifiers.push({
      factor: 'colour_count',
      message: `You regularly work with more colours than this`,
      adjustment: -1,
    });
    tierDelta -= 1;
  }

  // ── Fabric count modifier ──────────────────────────────────────────
  if (pattern.fabricCt > profile.usualFabricCt + 4) {
    modifiers.push({
      factor: 'fabric_count',
      message: `This is ${pattern.fabricCt}-count; you usually work ${profile.usualFabricCt}-count`,
      adjustment: +1,
    });
    tierDelta += 1;
  } else if (pattern.fabricCt < profile.usualFabricCt - 4) {
    modifiers.push({
      factor: 'fabric_count',
      message: `${pattern.fabricCt}-count is coarser than you normally work`,
      adjustment: -1,
    });
    tierDelta -= 1;
  }

  // ── Technique modifiers ────────────────────────────────────────────
  if (pattern.hasBackstitch && !profile.hasUsedBackstitch) {
    modifiers.push({
      factor: 'backstitch',
      message: 'This pattern includes backstitching, which you have not tried before',
      adjustment: +1,
    });
    tierDelta += 1;
  }
  if (pattern.blendCount > 0 && !profile.hasUsedBlends) {
    modifiers.push({
      factor: 'blends',
      message: 'This pattern uses thread blends, which you have not tried before',
      adjustment: +1,
    });
    tierDelta += 1;
  }
  if (pattern.hasHalfStitch && !profile.hasUsedHalfStitch) {
    modifiers.push({
      factor: 'half_stitch',
      message: 'This pattern includes half stitches',
      adjustment: +1,
    });
    tierDelta += 1;
  }

  // ── Completion rate modifier ───────────────────────────────────────
  // Only apply when the pattern is large and the stitcher has a low
  // completion rate on large projects. Motivation is a real difficulty factor.
  if (profile.completionRate !== null && profile.completionRate < 0.4 &&
      pattern.totalStitches > 10_000) {
    modifiers.push({
      factor: 'completion_risk',
      message: 'Based on your history, large projects can be challenging to finish',
      adjustment: +1,
    });
    tierDelta += 1;
  }

  // ── Stitch count vs personal max ──────────────────────────────────
  if (profile.maxStitchesEver > 0 && pattern.totalStitches > profile.maxStitchesEver * 2) {
    modifiers.push({
      factor: 'project_scale',
      message: `This is more than twice the size of your largest project so far`,
      adjustment: +1,
    });
    tierDelta += 1;
  }

  // Cap tier delta to ±2 (don't jump more than two tiers in either direction)
  tierDelta = Math.max(-2, Math.min(2, tierDelta));

  const adjustedIdx = Math.max(0, Math.min(3, baseIdx + tierDelta));
  const adjustedTier = TIER_ORDER[adjustedIdx];

  // Estimated hours
  let estimatedHoursPersonal = null;
  if (profile.stitchesPerHour && profile.stitchesPerHour > 0) {
    estimatedHoursPersonal = Math.round(pattern.totalStitches / profile.stitchesPerHour);
  }

  // Confidence: based on how much data was available
  const confidence = profile.profileConfidence;

  // If no adjustment is needed, return null to suppress the modifier UI
  if (tierDelta === 0 && modifiers.length === 0 && !estimatedHoursPersonal) {
    return null;
  }

  return {
    adjustedTier,
    tierDelta,
    modifiers,
    estimatedHoursPersonal,
    confidence,
  };
}
```

### Positive framing for "easier than expected"

When `tierDelta < 0` (the pattern is easier than the objective score suggests for this stitcher):

- "You have experience beyond what this pattern requires — it may feel straightforward for you."
- "Looks like a comfortable project given your history."

These should be shown with a subtle visual treatment (muted / secondary colour), not with the same weight as an upward warning, to avoid reading as patronising.

---

## 8. Proposed New `UserPrefs` Keys

None of these currently exist in `user-prefs.js` DEFAULTS.

```javascript
// ─── Stitcher profile (07 stitcher-relative difficulty) ─────────────────
// Self-reported experience level. When set, overrides the derived level
// for the personal adjustment. null = not set (use derived).
"user.experienceLevel":       null,   // null | 'beginner' | 'intermediate' | 'advanced' | 'expert'

// Preferred fabric count when CONSUMING patterns (reading/stitching),
// separate from creatorDefaultFabricCount (which is for creating).
// null = derive from project history.
"user.preferredFabricCount":  null,   // null | number

// Technique exposure overrides. When set to true, treated as confirmed
// even if project history doesn't have examples.
"user.hasUsedBackstitch":     null,   // null | boolean
"user.hasUsedBlends":         null,   // null | boolean
"user.hasUsedHalfStitch":     null,   // null | boolean

// Whether the stitcher has opted in to personalised difficulty scoring.
// Default false until they encounter a difficulty score and engage.
"user.personalDifficultyEnabled": false,
```

### Interaction between self-reported and derived

```
Self-reported level OVERRIDES derived level only when the self-report is
at least as high as the derived level. We never challenge a self-report
downwards ("you said Expert but your history says Beginner").

However, when a self-reported Expert has only 1 project, we set
profileConfidence to 'low', which softens the language in the adjustment
text.
```

---

## 9. `ProfileConfidence` Calculation

```javascript
function computeProfileConfidence(profile, projectCount) {
  if (profile.experienceLevel && projectCount >= 5) return 'high';
  if (profile.experienceLevel && projectCount >= 1) return 'medium';
  if (!profile.experienceLevel && projectCount >= 10) return 'high';
  if (!profile.experienceLevel && projectCount >= 3)  return 'medium';
  return 'low';
}
```

When confidence is `'low'`, the personal adjustment is hidden by default and only shown if the user expands a "How was this score calculated?" disclosure. This avoids making strong claims from weak data.

---

## 10. Privacy Considerations

### All data is local

The personal adjustment uses project history stored exclusively in the browser's IndexedDB (`CrossStitchDB`) and preferences in `localStorage`. No project data or personal profile leaves the browser unless the user explicitly exports it.

### Sharing

When a pattern's difficulty score is shared (embedded in a URL, included in a PDF, sent via sync):
- Only the **objective score** is transmitted.
- The personal adjustment is computed at display time on the recipient's device, from their own profile.
- Neither the stitcher's project history, experience level, completion rate, nor stitches-per-hour are transmitted.

This should be documented explicitly in any sharing UI: "Shared score is the objective rating. Recipients see their own personalised view."

### Sensitive framing

The completion rate modifier has the highest sensitivity risk — telling a stitcher they have a "low completion rate" could feel discouraging. Mitigation:
- Never state the raw completion rate number in the UI.
- Frame as: "Large projects can be challenging to finish" (not "you only complete 30% of your projects").
- Make this modifier opt-out from the preferences panel.

---

## 11. UX Recommendations

### 11a. Placement in the UI

```
┌────────────────────────────────────────┐
│  Difficulty                            │
│                                        │
│  ★★☆☆  Intermediate                   │  ← objective score, always visible
│                                        │
│  For you: may feel Advanced            │  ← personal tier (if different)
│  · You've worked with up to 18         │
│    colours; this has 35                │  ← expanded modifiers (collapsible)
│  · Backstitching, which you haven't    │
│    tried before                        │
│                                        │
│  Est. time for you: ~120 hours         │  ← personal time estimate
└────────────────────────────────────────┘
```

- The personal section should be visually subordinate to the objective score.
- The modifier list should be collapsible (show/hide) — show 1–2 lines max by default.
- When the personal tier matches the objective tier, the "For you: ..." line is omitted.
- The estimated time (when available) is always worth showing — even when the tier matches, a personalised time estimate is valuable.

### 11b. First-Encounter Prompt

The optimal moment to prompt for experience level is when the stitcher views their **first difficulty score** and has fewer than 3 saved projects (so derived data is sparse).

Proposed prompt: a dismissable callout inline with the difficulty score:

> "Want a personalised difficulty estimate?  
> Tell us your experience level and we'll adjust the score for you."  
> [Quick: Beginner / Intermediate / Advanced / Expert]  &  [Not now]

This is a 1-tap / 1-click interaction — no modal, no form. Selecting a tier sets `user.experienceLevel` and `user.personalDifficultyEnabled: true`. Dismissing sets a one-shot suppression flag so it doesn't appear again on every pattern.

### 11c. Framing — avoiding discouragement

| Situation | Avoid | Use instead |
|---|---|---|
| Pattern is harder than expected | "This is too hard for you" | "This may feel Advanced for you" |
| Low completion rate on large patterns | "You often abandon large projects" | "Large projects can be challenging to finish" |
| Pattern well within user's ability | (no adjustment needed) | (omit the block silently) |
| Expert pattern for beginner | "This is Expert — way above your level" | "This is rated Expert; you might enjoy it as a challenge" |
| Easy pattern for expert | (tier adjusted down) | "Looks like a comfortable project given your history" |

Language should always be framed in terms of the pattern's characteristics, not the stitcher's limitations.

### 11d. Settings and Opt-Out

The personalised score should be opt-in-by-default (first encounter prompt) with a clear toggle in the Preferences modal:

> **Personalised difficulty**  
> Show how patterns might feel based on your stitching history.  
> [Toggle]

Individual modifiers (e.g. the completion rate modifier) should also be individually suppressible from a "How was this calculated?" expansion.

---

## 12. Edge Cases

| Case | Handling |
|---|---|
| 0 saved projects | No personal adjustment. Only objective score. Prompt for experience level on first view. |
| 1–2 projects | Low confidence. Adjustment computed but shown with cautious language if at all. |
| Self-reported Expert, 1 project | Honour the self-declaration. Set `profileConfidence: 'low'`. Language: "You've told us you're an Expert stitcher, so this should be comfortable." |
| Project history suggests lower skill than self-report | Never challenge the self-report downwards. Use the higher of derived vs self-reported. |
| Pattern simpler than all user's history | Show as "Likely comfortable for you" with positive framing. Apply negative tierDelta if ≥ 2 tiers below. |
| No timing data (`stitchesPerHour === 0`) | Omit personal time estimate. Show only the objective estimated time (from objective scoring factor). |
| User deletes all projects | Profile reverts to "low confidence, no history". Personal adjustment cleared on next view. |
| Stitcher used app before project history existed | `totalStitches` may be 0 but `user.experienceLevel` may be set. Trust the self-report. |

---

## 13. Open Questions

### Q1: Does `listProjects()` return enough, or does each project need to be loaded?

**Answer (verified):** `listProjects()` reads only from `project_meta` and does not include technique flags (`hasBackstitch`, `hasBlends`, `hasHalfStitch`). To get technique data without loading every project, the three technique boolean flags must be added to `buildMeta()` and `buildStatsSummary()`. This is a small schema addition; the cost is a re-save of all projects on the first page load after the change (or a migration at DB upgrade time).

### Q2: Does `project_meta` have a `palette` field for colour count?

**Answer (verified):** No. `buildMeta()` does **not** include a palette. The `palette` field is only in `stats_summaries` (via `buildStatsSummary()`). So to get max colours from lightweight metadata, either:
- Use `getAllStatsSummaries()` (reads both `stats_summaries` and `project_meta`), or
- Add `colourCount: palette.length` to `buildMeta()` as a scalar.

Adding `colourCount` as a scalar to `buildMeta()` is recommended — it's cheap to compute at save time and removes the need to load the full stats_summaries for a simple colour-count max.

### Q3: Where should the personal adjustment be computed?

**Recommendation:** Compute at display time, not stored per pattern. Reasons:
- The profile changes as the stitcher completes more projects — a cached adjustment would go stale.
- The computation is lightweight (O(1) arithmetic).
- Storing it per pattern would embed personal data into the pattern record, which complicates sharing.

### Q4: What `UserPrefs` keys already exist for experience level?

**Answer (verified):** None. The full DEFAULTS object in `user-prefs.js` contains no `user.*` namespace at all. All proposed `user.*` keys in §8 are new additions.

### Q5: Can the stitches-per-hour figure be trusted?

The `stitchesPerHour` in `project_meta` is only non-zero when the stitcher has used the session timer at least once. Many stitchers may never start a session, especially if they imported a pattern and stitched it without the Stitch Tracker. In practice, treat `stitchesPerHour === 0` as "no data" and fall back to showing only the objective time estimate.

For users who do have timing data, average across all projects (not just the most recent) to reduce per-project variation. The `lastSessionSummary()` function in `helpers.js` already demonstrates per-session pace analysis — the same approach should be used cross-project.

### Q6: Should the personal difficulty score be stored per pattern?

**No.** See Q3. However, the derivation inputs (the `StitcherProfile` object) should be memoised at the app level (computed once per page load, not recomputed on every render) since it requires reading `listProjects()` + `getAllStatsSummaries()`.

---

## 14. Implementation Checklist

The following changes would be required to fully implement this factor:

- [ ] **Schema**: Add `hasBackstitch`, `hasHalfStitch`, `hasBlends`, `colourCount` to `buildMeta()` in `project-storage.js`
- [ ] **Schema**: Add the same four fields to `buildStatsSummary()` in `project-storage.js`
- [ ] **Schema**: Bump `CrossStitchDB` version from 3 to 4 and add a migration pass in `onupgradeneeded` that rewrites `project_meta` and `stats_summaries` from any existing `proj_*` entries
- [ ] **UserPrefs**: Add `user.experienceLevel`, `user.preferredFabricCount`, `user.hasUsedBackstitch`, `user.hasUsedBlends`, `user.hasUsedHalfStitch`, `user.personalDifficultyEnabled` to DEFAULTS in `user-prefs.js`
- [ ] **Logic**: Implement `deriveExperienceLevel()` (see §5)
- [ ] **Logic**: Implement `buildStitcherProfile()` — assembles the StitcherProfile from project history + UserPrefs
- [ ] **Logic**: Implement `computePersonalAdjustment()` (see §7)
- [ ] **UI**: Difficulty display component that renders the two-score layout (objective + personal modifier)
- [ ] **UI**: First-encounter prompt (§11b) inline with difficulty score
- [ ] **Preferences modal**: Toggle for personalised difficulty + experience level selector
- [ ] **Sharing / PDF**: Verify that only objective score is exported (PDF export workers do not read UserPrefs personalisation keys)

---

## Summary

The stitcher-relative difficulty factor is architecturally clean because the app already stores everything needed: project metadata, session timing, fabric counts, and (with a small schema addition) technique flags. The key design decisions are:

1. **Two-score, never one**: objective score is always primary; personal adjustment is always a modifier.
2. **Graceful degradation**: no data → no adjustment (not a broken state).
3. **Never challenge self-reports downwards**: honour the stitcher's own assessment.
4. **Privacy by design**: personal data never leaves the browser.
5. **Small schema addition required**: three technique booleans + one colour count scalar on the existing meta/stats_summaries records — backwards-compatible, computable at save time.
