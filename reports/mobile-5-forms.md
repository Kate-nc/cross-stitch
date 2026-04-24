# Mobile Audit 5 — Input & Form Usability

## Summary

The app has 16 documented form usability gaps that degrade input on phones: number inputs lack `inputMode`/`step`/`min`/`max`, search inputs lack `enterkeyhint`, several flows use blocking `alert()` instead of inline errors, multi-step forms (onboarding, BulkAdd) show no progress, and personal-data fields lack `autocomplete` hints. Custom autocomplete dropdowns in manager-app may clip below the virtual keyboard.

## TODOs (prioritised)

### 1. 🔴 Add `inputMode="numeric"` to numeric inputs
- **File(s)**: [tracker-app.js](tracker-app.js#L266,#L268,#L322,#L4279,#L4281,#L5023,#L5031), [manager-app.js](manager-app.js#L1573,#L1655), [creator/PrepareTab.js](creator/PrepareTab.js#L315), [preferences-modal.js](preferences-modal.js)
- **Fix**: Add `inputMode="numeric"` (and `inputMode="decimal"` for prices/margins) to existing `type="number"` inputs.

### 2. 🔴 Add `min`/`max`/`step` constraints to number inputs
- **File(s)**: same as above
- **Fix**: Add bounds, e.g. quantity `min="0" max="999" step="1"`, margin `step="0.5"`.

### 3. 🔴 Replace blocking `alert()` with inline error UI
- **File(s)**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L142,#L162), [header.js](header.js#L147,#L156,#L158)
- **Fix**: Modal-local `error` state; inline banner with dismiss button.

### 4. 🟡 Add `enterkeyhint="search"` to search inputs
- **File(s)**: [manager-app.js](manager-app.js#L708,#L973), [modals.js](modals.js) ThreadSelector
- **Fix**: Annotate search fields.

### 5. 🟡 Add `maxLength` to bounded text fields (project name, designer, etc.)
- **File(s)**: [preferences-modal.js](preferences-modal.js), [header.js](header.js#L44,#L270), [creator/ProjectTab.js](creator/ProjectTab.js#L410,#L419,#L428)
- **Fix**: Sensible caps (60 for names, 100 for copyright, 80 contact).

### 6. 🟡 Personal-data fields lack `autocomplete`
- **File(s)**: [preferences-modal.js](preferences-modal.js)
- **Fix**: `autocomplete="name"`, `autocomplete="email"`.

### 7. 🟡 Multi-step forms show no progress indicator
- **File(s)**: [onboarding-wizard.js](onboarding-wizard.js), [creator/BulkAddModal.js](creator/BulkAddModal.js)
- **Fix**: "Step N of M" + dot strip.

### 8. 🟡 Autocomplete dropdowns may clip / lack keyboard nav
- **File(s)**: [manager-app.js](manager-app.js#L1397-L1420)
- **Fix**: Bound `max-height:200px; overflow-y:auto`; add ↑/↓/Enter handling.

### 9. 🟡 Many inputs are unlabelled (no `<label>` / `aria-label`)
- **File(s)**: [tracker-app.js](tracker-app.js#L266,L268,L4279,L4281), [creator/ExportTab.js](creator/ExportTab.js), [components.js](components.js#L186)
- **Fix**: Wrap with `<label htmlFor=>` or add `aria-label`.

### 10. 🟡 Margin slider in fabric calc — tiny number-spinner only
- **File(s)**: [creator/PrepareTab.js](creator/PrepareTab.js#L315)
- **Fix**: Add `<input type="range" min="0" max="10" step="0.5">` paired with the existing number input.

### 11. 🟡 Modal scroll/keyboard interaction needs verification on iOS
- **File(s)**: All modals
- **Fix**: Set `max-height: min(90vh, calc(100vh - 60px)); overflow-y:auto;` on `.modal-content`.

### 12. 🟢 Email field type is currently text
- **File(s)**: [preferences-modal.js](preferences-modal.js) designerContact
- **Fix**: Provide a type toggle (email vs URL) with appropriate `type=`.

### 13. 🟢 Show busy state on async submit (Save/Generate buttons)
- **File(s)**: [creator/BulkAddModal.js](creator/BulkAddModal.js), [manager-app.js](manager-app.js)
- **Fix**: `disabled + opacity:0.6` while pending.

### 14. 🟢 Smooth transitions on collapsible sections (PrepareTab, ExportTab)
- **Fix**: `max-height` + `transition` (note: this is layout-property animation; OK because collapsible is one-shot).

### 15. 🟢 Datalist fallback for thread autocomplete (low-priority polish).
