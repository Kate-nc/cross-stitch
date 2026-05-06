# Preview-4 — Preview UX audit

## Feedback & communication

| Concern | Status | Detail |
|---|:-:|---|
| Loading state during 400 ms debounce | ❌ | None. Previous preview frozen, no spinner, no "updating…" hint. |
| Loading state during the main-thread `runCleanupPipeline` (50–250 ms) | ❌ | None. Pipeline blocks the main thread synchronously — UI is frozen but visually identical to "nothing happening". |
| Progress indicator for >500 ms operations | ❌ | None. The Generate button shows "Generating…" but the live preview has no equivalent. |
| Explanation when a setting has no visible effect | ❌ | None. E.g. *Allow blended threads* on a high-contrast image, or *Min stitches per colour = 0*, or stash-only with a 200-thread stash. The user has no way to tell "applied but indistinguishable" from "ignored". |
| Summary of currently-applied settings | ❌ | None. The thumbnail is a pixel grid with no caption. The "Cleanup diff" overlay is the closest thing and is opt-in. |
| Toast on stash-mode with empty stash (preview path) | ❌ | The Generate path shows a warning toast and blocks. The preview path silently produces an unconstrained image. |
| Toast on stash-mode with very small stash (preview path) | ❌ | Same. |

## Comparison slider

The slider implementation
([creator-main.js#L24-L222](../creator-main.js#L24-L222)) is solid:

| Behaviour | Status | Notes |
|---|:-:|---|
| Touch / pointer support | ✅ | Pointer Events with `setPointerCapture` |
| Smooth drag (no main-thread thrash) | ✅ | `requestAnimationFrame` batching via `scheduleUpdate` |
| Position survives preview update | ✅ | `splitPos` is local to slider, not reset on `previewSrc` change |
| Auto-sweep animation | ✅ | Optional, 80% per second |
| Alt-key zoom lens | ✅ | 2.5× magnifier |
| Diff highlight on update | ✅ | Pixel-delta overlay, auto-hides after 1.5 s |
| Tap-to-flip alternative | ❌ | Drag is the only interaction. Mobile users in particular often want a simple double-tap toggle. |
| Keyboard support | ❌ | No focus / arrow-key adjustment of the slider position. |
| ARIA semantics | ❌ | No `role="slider"`, no `aria-valuenow`. |

## Performance

| Metric | Status | Notes |
|---|:-:|---|
| Preview cost (small image, 80×80) | ~50–80 ms | Acceptable |
| Preview cost (medium, 200×200) | ~150–250 ms | Borderline — feels laggy without an indicator |
| Preview cost (large, 300×300 capped to 40k) | ~250–400 ms incl. progressive paint | Borderline |
| UI freezes during compute | ⚠ | Yes — the preview runs on the main thread synchronously. Sliders cannot be moved during the compute window. |
| Multiple rapid changes during compute | ⚠ | First change's compute completes before debounce restarts; subsequent rapid changes are coalesced by debounce *after* the in-flight pass finishes. Not catastrophic, but noticeably stutters. |
| Cancellation of in-flight pipeline | ❌ | The 400 ms timer is cancelled. The pipeline call itself is not — it cannot be, because it's synchronous and not in a worker. |
| Progressive dither (perceived speed) | ✅ | Fast first paint, full pass via setTimeout(0). Subjectively faster than waiting for the dithered pass. |

## Edge cases

| Case | Current behaviour |
|---|---|
| Stash-only ON + empty stash | Preview silently shows unconstrained DMC palette. Generate shows a warning toast and refuses. |
| Stash-only ON + 1–2 threads | Preview path is broken anyway (S1 bug). Generate path renders with the tiny palette and shows a "may be limited" toast. |
| Allow blends ON + image with 3 distinct colours | Output has no blends. No message; user may think the toggle is broken. |
| Allow blends ON + dither ON | Brief "fast pre-pass" frame shows un-blended map; full pass repaints with blends ~16 ms later. |
| Min stitches/colour > 0 | Preview ignores the value (broken). |
| Dither strength changed weak↔strong | Preview is identical (broken). |
| Very large source PNG (4000×3000) | Source is downscaled to `sW×sH` by canvas during `drawImage`, then preview area capped to 40k pixels. Works but the initial decode can lock the main thread. |
| PNG with transparency | Treated as if alpha=255 (RGB read directly). Transparent regions render as their underlying colour or black. No "skip transparent" affordance. |
| Source not yet loaded | `if (!img || !img.src) return;` guards. No race. |
| User scrolls preview off-screen | Pipeline still runs on every change. Wasted CPU but not a correctness issue. |
| Two settings changed rapidly within 400 ms | Debounce coalesces — only the last triggers a run. ✅ |
| Setting changed *during* `runCleanupPipeline` execution | Cannot interrupt; blocks until done, then debounce restarts → second run with latest values. |

## Top UX gaps to fix alongside the reactivity bugs

1. **Loading state**: a thin progress strip on the preview card,
   visible during debounce + compute. Single source of "something is
   happening".
2. **Stash-empty inline message** in the preview area — not a toast,
   not a Generate-button-only block.
3. **Setting summary chip-strip** under the slider:
   *15 colours · DMC · Dither balanced · Stash only · Cleanup balanced*.
4. **Move the heavy preview pipeline off the main thread**, even just
   so the slider can be dragged smoothly. (The Generate worker can
   be reused, see preview-5/6.)
5. **Tap-to-flip / keyboard control** for the slider.
