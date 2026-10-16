# Portable full-backup preferences, version 1

Full backups now use outer format version 2 (JSON or CSB1 compression); version 1 archives remain supported. A
`preferences` section has `version: 1`, `stateSchemaVersion` and `values`.
Values use UserPrefs names without the storage prefix; restoring writes the
corresponding `cs_pref_*` keys. The schema in user-prefs.js is the explicit
allowlist and validator. Adding a new DEFAULTS key does not make it portable.
Sync's separate opt-in preference contract is unchanged.

Export includes every approved key, including defaults, null, false, zero and
empty strings. Pending slider edits are included. Import applies persisted-state
schema breaks to the imported values, validates types, enums and numeric bounds,
and replaces invalid or missing portable values with current defaults. Unknown
and deprecated keys are ignored. Unsupported section/schema versions are rejected
before any databases are changed. No destination preference can mask a missing
portable value. Pending writes for restored keys are cancelled. Storage write
errors fail staging before publication. A single recovery-generation pointer publishes the completed databases and portable settings together; see [the recovery contract](backup-recovery.md).

Old backups without this section restore as before: destination global preferences
remain, and a clean profile uses defaults. The legacy localStorage map cannot
bypass the preference allowlist. Migration markers are generated locally rather
than copied from the source.

## Portable allowlist (99 keys)

Branding (including a bounded PNG/JPEG data URL), export and generation defaults,
tracking behaviour, global preview/display choices, accessibility, notifications,
regional units, stash defaults and calm-motivation choices express user intent
that should survive moving to a clean device. Logo data URLs are limited to
3,000,000 characters; branding text to 10,000 characters per field. Invalid
values fall back to defaults; no coercion of strings into numbers or booleans.

- `cs_pref_a11yColourBlindAid`
- `cs_pref_a11yDarkMode`
- `cs_pref_a11yFontScale`
- `cs_pref_a11yHighContrast`
- `cs_pref_a11yReducedMotion`
- `cs_pref_a11ySymbolOnly`
- `cs_pref_appAccentColour`
- `cs_pref_autoLibraryLink`
- `cs_pref_coverageAutoSync`
- `cs_pref_coverageManualValue`
- `cs_pref_creator.pdfWorkshopTheme`
- `cs_pref_creatorAllowBlends`
- `cs_pref_creatorCanvasTexture`
- `cs_pref_creatorDefaultDithering`
- `cs_pref_creatorDefaultFabricCount`
- `cs_pref_creatorDefaultPaletteSize`
- `cs_pref_creatorDefaultViewMode`
- `cs_pref_creatorFabricColour`
- `cs_pref_creatorGuessPictureType`
- `cs_pref_creatorMinStitchesPerColour`
- `cs_pref_creatorOrphanRemovalStrength`
- `cs_pref_creatorProtectDetails`
- `cs_pref_creatorReferenceOpacity`
- `cs_pref_creatorSmoothDithering`
- `cs_pref_creatorStashOnlyDefault`
- `cs_pref_creatorStitchCleanup`
- `cs_pref_creatorStitchCleanupStrength`
- `cs_pref_currency`
- `cs_pref_designerContact`
- `cs_pref_designerCopyright`
- `cs_pref_designerLogo`
- `cs_pref_designerLogoPosition`
- `cs_pref_designerName`
- `cs_pref_exportCentreMarks`
- `cs_pref_exportChartModeBw`
- `cs_pref_exportChartModeColour`
- `cs_pref_exportCustomCols`
- `cs_pref_exportCustomRows`
- `cs_pref_exportGridInterval`
- `cs_pref_exportIncludeCover`
- `cs_pref_exportIncludeIndex`
- `cs_pref_exportIncludeInfo`
- `cs_pref_exportMarginsMm`
- `cs_pref_exportMiniLegend`
- `cs_pref_exportOverlap`
- `cs_pref_exportPageSize`
- `cs_pref_exportPreset`
- `cs_pref_exportStitchesPerPage`
- `cs_pref_fabricColour`
- `cs_pref_gridOverlayEnabled`
- `cs_pref_homeShowCompleted`
- `cs_pref_managerDetailGrid`
- `cs_pref_notifHaptic`
- `cs_pref_notifLowStock`
- `cs_pref_notifMilestones`
- `cs_pref_notifSound`
- `cs_pref_patternsDefaultFilter`
- `cs_pref_patternsDefaultSort`
- `cs_pref_preferredFrameStyle`
- `cs_pref_preferredHoopStyle`
- `cs_pref_preferredMockupType`
- `cs_pref_preferredMountColour`
- `cs_pref_preferredMountWidth`
- `cs_pref_preferredPreviewLevel`
- `cs_pref_showDailyStreak`
- `cs_pref_showStreaksAndGoals`
- `cs_pref_skeinPriceDefault`
- `cs_pref_stashDefaultBrand`
- `cs_pref_stashLowStockThreshold`
- `cs_pref_statsDayEndHour`
- `cs_pref_stitchStrandsUsed`
- `cs_pref_stitchWasteFactor`
- `cs_pref_threadLengthUnit`
- `cs_pref_toastMaxVisible`
- `cs_pref_toastsEnabled`
- `cs_pref_trackerActiveGapCapSec`
- `cs_pref_trackerAutomaticSnapshots`
- `cs_pref_trackerBlockShape`
- `cs_pref_trackerCanvasTexture`
- `cs_pref_trackerCelebrate`
- `cs_pref_trackerDefaultHighlightMode`
- `cs_pref_trackerDefaultView`
- `cs_pref_trackerDimLevel`
- `cs_pref_trackerDoneStyle`
- `cs_pref_trackerFabricColour`
- `cs_pref_trackerHighlightSkipDone`
- `cs_pref_trackerIdleMinutes`
- `cs_pref_trackerLegendSort`
- `cs_pref_trackerMarkAllAs`
- `cs_pref_trackerMinimap`
- `cs_pref_trackerOnlyStarted`
- `cs_pref_trackerShowParking`
- `cs_pref_trackerSpotDimOpacity`
- `cs_pref_trackerStartCorner`
- `cs_pref_trackerStitchingStyle`
- `cs_pref_trackerTimingMode`
- `cs_pref_trackerTintColour`
- `cs_pref_trackerTintOpacity`
- `cs_pref_units`

## Exclusions

All `cs_pview_*` entries are excluded. They describe zoom, scroll and per-pattern
preview overrides in a particular viewport, rather than portable project content.
They stay untouched on the destination; restored projects still contain their
actual pattern, progress and project settings.

The following declared globals are excluded: preview quality, layout and input/hardware choices
should adapt to the device; Sync configuration and wizard state belong to its
local connection; onboarding/dismissal markers should be regenerated; unused or
deprecated fields are not part of the contract; experimental opt-ins and advanced
conflict/hotkey policies must be chosen locally.

- `cs_pref_autoSyncEnabled`
- `cs_pref_commandPaletteHotkey`
- `cs_pref_creator.drawMode`
- `cs_pref_creator.magnifier`
- `cs_pref_creator.precisionCursor`
- `cs_pref_creatorColourDisclaimerDismissed`
- `cs_pref_crossTabConflictPolicy`
- `cs_pref_experimental.embroideryTool`
- `cs_pref_experimental.importWizard`
- `cs_pref_fabricMeasurementUnit`
- `cs_pref_flagExperimentalPreview`
- `cs_pref_onboarding.coached.firstStitch_creator`
- `cs_pref_onboarding.coached.firstStitch_tracker`
- `cs_pref_onboarding.coached.import`
- `cs_pref_onboarding.coached.progress`
- `cs_pref_onboarding.coached.rectSelect_tracker`
- `cs_pref_onboarding.coached.save`
- `cs_pref_onboarding.coached.undo`
- `cs_pref_rightPaneMode`
- `cs_pref_previewQualityAuto`
- `cs_pref_splitPaneEnabled`
- `cs_pref_splitPaneRatio`
- `cs_pref_splitPaneSyncEnabled`
- `cs_pref_sync.conflictBehaviour`
- `cs_pref_sync.defaultConflictAction`
- `cs_pref_sync.firstTimeWizardComplete`
- `cs_pref_sync.includePalettes`
- `cs_pref_sync.includePrefs`
- `cs_pref_sync.includeStash`
- `cs_pref_sync.pollIntervalSec`
- `cs_pref_trackerDragMark`
- `cs_pref_trackerFocusOnPhone`
- `cs_pref_trackerHalfStitchMode`
- `cs_pref_trackerHandedness`
- `cs_pref_trackerHintsSeen`
- `cs_pref_trackerLeftSidebarMode`
- `cs_pref_trackerLeftSidebarOpen`
- `cs_pref_trackerLeftSidebarTab`
- `cs_pref_trackerUndoDepth`
- `cs_pref_trackerWakeLock`

No other localStorage keys are swept into the backup. Credentials, browser file
handles/permissions, device identity, temporary handoffs, recovery journals,
cache entries and migration markers are excluded from preference transfer.
The pre-existing non-preference localStorage allowlist (active project, custom
palettes, shortcut hint and global goals/compatibility goals) is unchanged, as
are the existing project/stash/photo backup sections.

Automatic Compare snapshot opt-in is portable. Restore establishes a fresh stitching-day baseline on the destination and invalidates queued automatic work; the operational `trackerSnapshotsEnabledAt` timestamp stays device-local and is never imported. Missing values in older preference sections default to off.
