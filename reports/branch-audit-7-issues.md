# Branch Audit · Report 7 — Consolidated Issue List

Synthesised from reports 2-6. Severity legend:
🔴 ship-blocker · 🟠 high (fix before ship) · 🟡 medium (fix this cycle) · 🟢 polish.

| ID | Severity | Title | Source | Owner |
|---|---|---|---|---|
| **I1** | 🔴 | None — there are no ship-blockers. | — | — |
| **I2** | 🟠 | **Tracker project switch from rail does `window.location.reload()`** — induces full Babel-recompile delay on phones | report 3 F1 / report 6 R2 | tracker-app.js |
| **I3** | 🟠 | **Tracker `lpanel` no longer offers a side-pane variant on desktop** | report 5 V1 / report 6 R1 | tracker-app.js + styles.css |
| **I4** | 🟠 | **Manager Patterns cards still missing "Edit" / "Open in Tracker" buttons** (carry-over, in-scope per Hybrid 4) | report 6 R3 | manager-app.js |
| **I5** | 🟡 | ActionBar wraps to 2 rows below 360 px wide | report 5 V2 | creator/ActionBar.js |
| **I6** | 🟡 | Header mode pill is too quiet vs `plan-c-header-switcher.html` | report 5 V4 | header.js |
| **I7** | 🟡 | Preferences modal hard-codes `COLOURS = { teal: "#B85C38", … }` — bypasses `var(--accent)` and the dark theme | report 5 V5 | preferences-modal.js |
| **I8** | 🟡 | Onboarding popover may overflow the viewport at 320 px | report 5 V7 | onboarding-wizard.js |
| **I9** | 🟡 | No on-screen affordance to open ⌘K on phone (touch-only users can't reach it) | report 4 CF6 | header.js |
| **I10** | 🟡 | "Limit to stash" warning still shown when the user has no stash (carry-over F-W1-H2) | ux-5 | creator/MaterialsHub.js |
| **I11** | 🟢 | `_sprint3_tokens.js` / `_sprint4_css_tokens.js` left at repo root | report 5 V6 | repo root |
| **I12** | 🟢 | Commented-out "App appearance" accent-colour section in `ProfilePanel` | report 1 §5 | preferences-modal.js |
| **I13** | 🟢 | Stylelint hex/px enforcement was on the Phase-7 plan but no `.stylelintrc` change shipped | report 2 D6 | tooling |
| **I14** | 🟢 | PWA install icon files at `assets/icons/` may not exist — manifest references but `list_dir` showed no `assets/icons/` directory | report 2 D7 | manifest.json + assets/ |
| **I15** | 🟢 | Verify Workshop accent contrast in dark mode meets WCAG 2.2 AA | report 5 V9 | styles.css |
| **I16** | 🟢 | iOS notch + status-bar clipping on the new wake-lock chip / HeaderProjectSwitcher | report 5 V8 | styles.css |

## What's NOT in this list

- Sidebar density (Bea's headline friction): out of scope per Hybrid 4. Tracked for a future cycle.
- Watermark / Anchor cross-ref / shopping-list export (Devi/Eli): out of scope per Hybrid 4.
- Live cross-device sync (Eli's biggest blocker): out of scope.

These are real but explicit deferrals, not regressions of this branch.

## Sign-off matrix

| Severity | Status | Action required |
|---|---|---|
| 🔴 | Empty | None — clean ship on this axis. |
| 🟠 | 3 issues | **Fix all three before merge.** Report 9 + report 8 cover them. |
| 🟡 | 7 issues | Fix at minimum I5, I6, I7. Defer or batch the rest. |
| 🟢 | 6 issues | Mop up in a polish PR. |
