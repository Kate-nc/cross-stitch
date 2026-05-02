# Color Report 10 — Full Colour Experience: Approach C Implementation Plan

> **Status:** Ready for implementation after Approach B ships.  
> **Depends on:** Report 9 Approach B (data fix + CIEDE2000 matching + similar-colour warning rows).  
> **Wireframes:** `reports/color-wireframes/approach-c-texture.html`, `approach-c-detail-popover.html`, `approach-c-comparator.html`.

---

## What Approach C Adds

Three features layered on top of B:

| # | Feature | Description |
|---|---------|-------------|
| C1 | CSS texture simulation | Subtle diagonal highlight on all `.colour-swatch` elements to suggest thread specularity |
| C2 | Thread colour detail popover | Click any swatch to see its DMC code, three fabric previews, and nearest similar colour |
| C3 | Enhanced similar-colour comparator | Inline panel in palette list showing two similar threads at large scale with ΔE₀₀ reading |

---

## Feature C1: CSS Texture Simulation on Colour Swatches

### What it does

Adds a fine 135° diagonal highlight to every `.colour-swatch` element — a faint warm glint at top-left fading to a slight shadow at bottom-right. The goal is to suggest thread texture (embroidery thread is specular; it catches light differently at different angles) without shifting the perceived hue.

### The technical problem: inline `background` overrides CSS `background-image`

The current swatch pattern sets colour via an inline `background` shorthand:

```js
// components.js line 821
React.createElement("span", {
  className: "colour-swatch",
  style: { background: 'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')' }
})
```

Because the inline `background` shorthand resets all background sub-properties (including `background-image`), adding `background-image: linear-gradient(...)` via `.colour-swatch` in CSS would be overridden for every rendered swatch. **You cannot use `background-image` on the element itself.**

### Solution: `::after` pseudo-element overlay

Use a `position: absolute` pseudo-element that sits on top of the background colour:

```css
/* styles.css — add to the existing .colour-swatch block */
.colour-swatch {
  /* existing rules unchanged */
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--border);
  flex-shrink: 0;
  /* new */
  position: relative;        /* needed for ::after */
  overflow: hidden;          /* clip the gradient to the rounded corners */
}

.colour-swatch::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.18) 0%,
    transparent 50%,
    rgba(0, 0, 0, 0.06) 100%
  );
  pointer-events: none;      /* never capture clicks */
}
```

The `overflow: hidden` on the parent clips the pseudo-element's rounded corners correctly. `pointer-events: none` ensures the overlay never interferes with click or hover handlers on the swatch.

### Why these specific values

- **18% white at top-left:** Below the JND (just-noticeable-difference) for hue shift on saturated colours. At 18%, ΔE₀₀ from the pure flat colour is approximately 1.5–2.0 for a red swatch — within the "barely perceptible" range and consistent with the precision of the underlying colour data.
- **50% midpoint transparent:** Clean fade from highlight to flat colour. A 40% midpoint would make the overlay too visible. A 60% midpoint would make the highlight too small.
- **6% black at bottom-right:** Subtle depth. Higher values (>12%) create a visible shadow that competes with the border.
- **135° angle:** Top-left to bottom-right. Matches the convention of light coming from top-left in UI design. Using 45° (top-right to bottom-left) would be unconventional and fight the user's visual expectation.

### Edge cases and mitigations

| Swatch colour | Behaviour | Acceptable? |
|--------------|-----------|-------------|
| Pure white (blanc, B5200) | White highlight invisible; 6% shadow may be slightly visible | Yes — creates very subtle dimensionality |
| Pure black (310) | 18% white highlight clearly visible at top-left corner | Yes — and correct: dark thread on a needle does catch light |
| Very light pastels (827, 3865) | Both highlight and shadow may be slightly visible | Monitor at 40px size; reduce to 14% white if needed |
| Highly saturated reds (321, 666) | 18% white shifts top-left slightly toward pink-orange | Imperceptible below 20%; use 14% if colour accuracy team objects |

### Size variants

The gradient scales with the element naturally. At 14×14px (default), the highlight occupies roughly the top-left 7×7px corner. At 22×22px (found in some palette chip uses), it occupies ~11×11px. The visual weight is appropriate at both sizes. At 40×40px (comparator swatches in C3), it becomes more prominent — consider reducing to 14% opacity for large swatches via a modifier class.

```css
/* For larger swatches in C3 comparator (40×60px) */
.colour-swatch--large::after {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.14) 0%,
    transparent 50%,
    rgba(0, 0, 0, 0.05) 100%
  );
}
```

### Dark mode

No special dark mode treatment needed. The overlay is semi-transparent and works on any background colour. In dark mode, the swatch background colours themselves do not change (they are thread colours, not UI surface colours), so the overlay behaviour is identical.

### Hover state

Do not change the overlay on hover. The texture is meant to be a subtle constant affordance, not a dynamic interaction cue. Hover interactions (if any) should be expressed via the swatch's border or the parent row's background change.

### Files changed

| File | Change |
|------|--------|
| `styles.css` | Add `position: relative; overflow: hidden;` to `.colour-swatch` block; add `.colour-swatch::after` rule; add `.colour-swatch--large::after` modifier |

### Definition of done (C1)

- [ ] Gradient overlay visible on all `.colour-swatch` elements app-wide (Legend tab, MaterialsHub, tracker palette, manager stash list)
- [ ] No visible hue shift on DMC 321 (red), 826 (blue), blanc (white), 310 (black) at 14×14px — verified by visual inspection
- [ ] No impact on existing click/hover event handlers — confirmed by running `npm test`
- [ ] Overlay clips correctly to rounded corners at all swatch sizes
- [ ] `position: relative` on `.colour-swatch` does not break any existing layout that relied on it being static — verify LegendTab, MaterialsHub list rows

---

## Feature C2: Thread Colour Detail Popover

### What it does

Clicking any `.colour-swatch` anywhere in the app opens a small floating card showing:
- DMC code (large, bold)
- Thread name
- A 48×48px flat-colour swatch (no texture, for accurate reference)
- Three fabric preview chips (32×32px swatch on white Aida / natural linen / black Aida)
- A one-line note: "Code is the authoritative reference — screen colours are approximations."
- If a nearest similar colour exists within ΔE₀₀ < 8: "Similar to [code] ([name], ΔE₀₀ [n]) — [descriptor]"

### Architecture

**Component:** `SwatchDetailPopover` — a new global component in `components.js`.

**Rendering:** Via a React portal to `document.body` to escape `overflow: hidden` ancestors (LegendTab's scrollable list, MaterialsHub tabs, etc.). The popover is positioned with `position: fixed`.

**State:** Local to each palette-list parent component. Each parent holds:

```js
const [popoverThread, setPopoverThread] = React.useState(null);
// null = closed; { id, name, rgb, similarThread, anchorRect } = open
```

**Singleton enforcement:** Only one popover can be open at a time. Because state is local to each parent component, and there is only one palette list visible at a time in the app (the user is either in Legend tab, MaterialsHub, tracker palette, or manager stash), this is naturally enforced. No global popover state is needed.

### Component structure

```jsx
function SwatchDetailPopover({ thread, anchorRect, onClose }) {
  // thread: { id, name, rgb, similarThread: { id, name, dE } | null }
  // anchorRect: DOMRect from getBoundingClientRect() of the clicked swatch
  // onClose: function

  const popoverRef = React.useRef(null);

  // Position calculation (runs after mount to get popover dimensions)
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  React.useLayoutEffect(() => {
    if (!popoverRef.current) return;
    const pw = popoverRef.current.offsetWidth;   // popover width
    const ph = popoverRef.current.offsetHeight;  // popover height
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 8;

    let top = anchorRect.bottom + MARGIN;
    let left = anchorRect.left;

    // Flip above if would overflow bottom
    if (top + ph > vh - MARGIN) top = anchorRect.top - ph - MARGIN;

    // Clamp left to viewport
    if (left + pw > vw - MARGIN) left = vw - pw - MARGIN;
    if (left < MARGIN) left = MARGIN;

    setPos({ top, left });
  }, [anchorRect]);

  // Close on Escape
  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const rgbStr = `rgb(${thread.rgb[0]},${thread.rgb[1]},${thread.rgb[2]})`;

  return ReactDOM.createPortal(
    <div
      ref={popoverRef}
      className="swatch-detail-popover"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label={`Colour details for DMC ${thread.id}`}
    >
      <div className="sdp-header">
        <span className="sdp-code">{thread.id}</span>
        <span className="sdp-name">{thread.name}</span>
        <button className="sdp-close" onClick={onClose} aria-label="Close">
          {window.Icons.x()}
        </button>
      </div>
      <div className="sdp-swatch-large" style={{ background: rgbStr }} aria-hidden="true" />
      <div className="sdp-fabric-row" aria-label="Thread on three fabric backgrounds">
        {[
          { label: 'White Aida', bg: '#FFFFFF' },
          { label: 'Natural Linen', bg: '#D2B48C' },
          { label: 'Black Aida', bg: '#1A1A1A' }
        ].map(({ label, bg }) => (
          <div key={bg} className="sdp-fabric-item">
            <div className="sdp-fabric-bg" style={{ background: bg }}>
              <div className="sdp-fabric-chip" style={{ background: rgbStr }} />
            </div>
            <span className="sdp-fabric-label">{label}</span>
          </div>
        ))}
      </div>
      <p className="sdp-note">
        {window.Icons.info()}
        {' '}Code is the authoritative reference — screen colours are approximations.
      </p>
      {thread.similarThread && (
        <p className="sdp-similar">
          Similar to {thread.similarThread.id} ({thread.similarThread.name},
          {' '}&#916;E&#8320;&#8320; {thread.similarThread.dE.toFixed(1)}) —{' '}
          {thread.similarThread.descriptor}
        </p>
      )}
    </div>,
    document.body
  );
}
```

### Three-fabric views without canvas

No canvas rendering is needed. Each fabric preview is:

```html
<div class="sdp-fabric-bg" style="background: [fabric-hex]">
  <div class="sdp-fabric-chip" style="background: rgb(r,g,b)"></div>
</div>
```

```css
.sdp-fabric-bg {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sdp-fabric-chip {
  width: 28px;
  height: 28px;
  border-radius: 2px;
  /* no border — the thread colour and fabric contrast tells the story */
}
```

The fabric background is the full chip area. The inner swatch chip represents the thread in that context. This is a deliberate simplification — the real pattern canvas shows a grid of tiny cells, not a single block. For the purpose of the popover (showing how a colour reads on different fabrics), this simplified view is sufficient and much faster to render.

### ΔE₀₀ similarity data

The `thread.similarThread` field should be pre-computed in the palette-list parent component using the `dE00()` function (added in Approach B). When building the palette list, for each thread, find the nearest other thread in the palette with ΔE₀₀ < 8.

```js
// In the palette-list parent, when popover is triggered:
function findNearestSimilar(thread, palette) {
  var best = null, bestDe = 8;
  palette.forEach(function(other) {
    if (other.id === thread.id) return;
    var de = dE00(thread.lab, other.lab);
    if (de < bestDe) { best = other; bestDe = de; }
  });
  if (!best) return null;
  return {
    id: best.id,
    name: best.name,
    dE: bestDe,
    descriptor: deDescriptor(bestDe)
  };
}

function deDescriptor(de) {
  if (de < 1.0) return 'imperceptible difference';
  if (de < 2.0) return 'perceptible only to trained observers';
  if (de < 3.5) return 'barely perceptible in person';
  if (de < 5.0) return 'perceptible on close inspection';
  return 'clearly different';
}
```

This computation is O(n) and runs once on click — acceptable performance for palette sizes (typically 10–50 threads).

### Integration touchpoints

The popover must be integrated at four locations:

| File | Location | Change |
|------|----------|--------|
| `creator/LegendTab.js` | Colour list row | Add `onClick` to each swatch; hold `popoverThread` state; render `<SwatchDetailPopover>` |
| `creator/MaterialsHub.js` | Palette chips in Materials tab | Same pattern |
| `tracker-app.js` | Palette list in left sidebar | Same pattern |
| `manager-app.js` | Thread stash list rows | Same pattern |

In each case, the pattern is:

```jsx
// On the swatch element:
onClick={(e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  setPopoverThread({ ...thread, anchorRect: rect, similarThread: findNearestSimilar(thread, palette) });
}}

// Alongside the list render, after the list:
{popoverThread && (
  <SwatchDetailPopover
    thread={popoverThread}
    anchorRect={popoverThread.anchorRect}
    onClose={() => setPopoverThread(null)}
  />
)}
```

### Icons needed

No new icons needed. `window.Icons.info()` and `window.Icons.x()` already exist.

### CSS additions (styles.css)

Add a `.swatch-detail-popover` block and associated sub-classes. All tokens from the Workshop set; no raw hex except in `box-shadow`:

```css
.swatch-detail-popover {
  position: fixed;
  z-index: 9999;
  background: var(--surface-2, #fff);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 16px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.08);
  padding: 12px;
  width: 220px;
  font-size: 13px;
  color: var(--text-primary);
}
.sdp-header { display: flex; align-items: baseline; gap: 6px; margin-bottom: 10px; }
.sdp-code { font-weight: 700; font-size: 16px; font-variant-numeric: tabular-nums; }
.sdp-name { font-size: 12px; color: var(--text-secondary); flex: 1; }
.sdp-close { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--text-secondary); padding: 2px; border-radius: var(--radius-sm); }
.sdp-close:hover { color: var(--text-primary); }
.sdp-swatch-large {
  width: 48px; height: 48px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); margin-bottom: 12px;
}
.sdp-fabric-row { display: flex; gap: 8px; margin-bottom: 10px; }
.sdp-fabric-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.sdp-fabric-bg {
  width: 44px; height: 44px; border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
}
.sdp-fabric-chip { width: 28px; height: 28px; border-radius: 2px; }
.sdp-fabric-label { font-size: 10px; color: var(--text-secondary); text-align: center; line-height: 1.2; }
.sdp-note {
  font-size: 11px; color: var(--text-secondary);
  display: flex; align-items: flex-start; gap: 5px; line-height: 1.4;
  margin-bottom: 6px;
}
.sdp-similar {
  font-size: 11px; color: var(--text-secondary);
  padding: 6px 8px; background: var(--surface);
  border-radius: var(--radius-sm); border: 1px solid var(--border);
  line-height: 1.4; margin-top: 4px;
}
```

### Keyboard accessibility

| Key | Behaviour |
|-----|-----------|
| Enter / Space on swatch | Opens popover (add `tabIndex={0}` and `role="button"` to swatch trigger element) |
| Escape | Closes popover |
| Tab | Focus moves within popover; trapping is not required (the popover is non-modal) |
| Click outside | Closes popover |

The popover has `role="dialog"` and `aria-label`. It does not trap focus (it is informational, not transactional).

### Mobile considerations

On mobile (viewport < 480px), anchor positioning may produce a popover that overflows. Add a special path: if `window.innerWidth < 480`, render the popover full-width at the bottom of the viewport (a bottom sheet pattern) using a `sdp-sheet` modifier class. This is a separate CSS block and does not complicate the desktop path.

### Definition of done (C2)

- [ ] Clicking any swatch in LegendTab, MaterialsHub, tracker palette, and manager stash opens the popover
- [ ] Popover shows correct DMC code (bold, large), name, 48×48px swatch
- [ ] Three fabric previews render without canvas, show correct swatch colour on each fabric background
- [ ] "Code is the authoritative reference" note present with info icon (SVG, not emoji)
- [ ] Nearest similar-colour note appears when ΔE₀₀ < 8; does not appear otherwise
- [ ] Popover stays within viewport on all screen sizes (desktop, tablet, mobile)
- [ ] Escape closes popover; click outside closes popover; X button closes popover
- [ ] Swatch element has `tabIndex` and keyboard open/close works
- [ ] No emoji in any popover text or labels (use `window.Icons.info()` for the note icon)
- [ ] British English: "colour", "authoritative reference", "approximations"

---

## Feature C3: Enhanced Similar-Colour Comparator

### What it does

When the palette list contains two threads with ΔE₀₀ < 3.0 (the similar-colour warning from Approach B), the warning indicator row is interactive: clicking it (or the chevron/expand icon) reveals an inline comparison panel directly below the warning row. The panel shows both threads at large scale (40×60px tall rectangles), their codes and names, the ΔE₀₀ value with a plain-English descriptor, a 3×2 fabric grid (3 fabrics × 2 threads), and a dismissal action.

### Architecture

**Component:** `SimilarColourComparator` — a new component in `components.js` (or inline in the palette-list parent if only used in one place; prefer `components.js` since it will be used in at least LegendTab and MaterialsHub).

**Trigger:** The existing similar-colour warning row (added in Approach B). Clicking anywhere on the warning row, or clicking a dedicated chevron icon on the right side of the row, toggles the comparator open/closed.

**State:**

```js
// In the palette-list parent:
const [expandedPair, setExpandedPair] = React.useState(null);
// null = no comparator open; "blanc+B5200" = pair key
const dismissedPairsRef = React.useRef(new Set());
// persists for the session; not stored in localStorage (reset on page reload)
```

**Pair key:** Canonical string: sort the two IDs alphabetically and join with `+`. This ensures `"blanc+B5200"` and `"B5200+blanc"` are the same key.

### Component structure

```jsx
function SimilarColourComparator({ threadA, threadB, dE, onDismiss }) {
  const rgbA = `rgb(${threadA.rgb.join(',')})`;
  const rgbB = `rgb(${threadB.rgb.join(',')})`;
  const fabrics = [
    { label: 'White Aida', bg: '#FFFFFF' },
    { label: 'Natural Linen', bg: '#D2B48C' },
    { label: 'Black Aida', bg: '#1A1A1A' }
  ];

  return (
    <div className="similar-comparator" role="region" aria-label="Similar colour comparison">
      <div className="sc-threads">
        {[threadA, threadB].map((t, i) => (
          <div key={t.id} className="sc-thread">
            <div className="sc-swatch-tall"
              style={{ background: i === 0 ? rgbA : rgbB }}
              aria-label={`DMC ${t.id} ${t.name}`}
            />
            <span className="sc-code">{t.id}</span>
            <span className="sc-name">{t.name}</span>
          </div>
        ))}
        <div className="sc-delta-block">
          <span className="sc-delta-value">&#916;E&#8320;&#8320; {dE.toFixed(1)}</span>
          <span className="sc-delta-desc">{deDescriptor(dE)}</span>
        </div>
      </div>
      <div className="sc-fabric-grid" aria-label="Both threads on three fabrics">
        {fabrics.map(({ label, bg }) => (
          <React.Fragment key={bg}>
            <div className="sc-fabric-cell">
              <div className="sc-fabric-bg" style={{ background: bg }}>
                <div className="sc-fabric-chip" style={{ background: rgbA }} />
              </div>
              <span className="sc-fabric-label">{label}</span>
            </div>
            <div className="sc-fabric-cell">
              <div className="sc-fabric-bg" style={{ background: bg }}>
                <div className="sc-fabric-chip" style={{ background: rgbB }} />
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <p className="sc-note">
        In practice, the physical threads may differ more than shown here
        due to texture, sheen, and lighting.
      </p>
      <button className="sc-dismiss btn-secondary btn-sm" onClick={onDismiss}>
        Dismiss warning
      </button>
    </div>
  );
}
```

### Where it lives

Inline in the palette list, as an expanding row immediately below the warning row. The warning row shows a chevron that rotates 180° when expanded.

```jsx
// In the palette list render, after each colour row:
{isPairWarning && (
  <div className="similar-warning-row" onClick={() => toggleComparator(pairKey)}>
    <span className="warning-indicator">{window.Icons.warning()}</span>
    <span className="warning-text">
      Very similar to {otherThread.id} — ΔE₀₀ {dE.toFixed(1)}
    </span>
    <span className={`chevron ${expandedPair === pairKey ? 'chevron--open' : ''}`}>
      {window.Icons.chevronDown()}
    </span>
  </div>
)}
{isPairWarning && expandedPair === pairKey && !dismissedPairsRef.current.has(pairKey) && (
  <SimilarColourComparator
    threadA={thread}
    threadB={otherThread}
    dE={dE}
    onDismiss={() => {
      dismissedPairsRef.current.add(pairKey);
      setExpandedPair(null);
    }}
  />
)}
```

### Fabric grid layout

3 rows × 2 columns. Each row is one fabric type; each column is one thread:

```
              Thread A    Thread B
White Aida     [chip]      [chip]
Nat. Linen     [chip]      [chip]
Black Aida     [chip]      [chip]
```

The first column has the fabric label; the second does not (it would be redundant). A small column header row shows the thread IDs.

```css
.sc-fabric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin: 12px 0;
}
.sc-fabric-bg {
  width: 40px; height: 40px; border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
}
.sc-fabric-chip { width: 26px; height: 26px; border-radius: 2px; }
```

### Dismiss behaviour

- Clicking "Dismiss warning" adds the pair key to `dismissedPairsRef` (a `React.useRef(new Set())`) and collapses the comparator.
- The warning row itself (with the chevron) remains visible unless the user removes one of the threads from the palette. Dismissal only hides the comparator for the current session — if the user navigates away and back, the warning row reappears but the comparator is collapsed.
- **Do not save dismissed pairs to `localStorage`.** The warning is genuinely useful — it should resurface on next session so new users who imported a pattern see it.

### Icons needed

**New icon required:** `chevronDown` — a downward-pointing chevron (V shape). Add to `icons.js`:

```js
// Chevron down — used by expandable rows (comparator, collapsible sections)
chevronDown: function() {
  return svg(pl('6 9 12 15 18 9'));
},
```

No other new icons needed. The warning row reuses `window.Icons.warning()`.

### ΔE₀₀ descriptor strings

Used by both C2 (popover) and C3 (comparator). Define once in `components.js` as a pure function:

```js
window.deDescriptor = function deDescriptor(de) {
  if (de < 1.0) return 'imperceptible — identical in practice';
  if (de < 2.0) return 'at the threshold of perception — side-by-side test recommended';
  if (de < 3.5) return 'barely perceptible in person';
  if (de < 5.0) return 'perceptible on close inspection';
  if (de < 8.0) return 'clearly different on close inspection';
  return 'clearly different at a glance';
};
```

### Keyboard accessibility

| Key | Behaviour |
|-----|-----------|
| Enter / Space on warning row | Toggles comparator open/closed |
| Tab | Moves focus into comparator (into "Dismiss warning" button) |
| Escape | Collapses comparator if open (handled by parent) |

The warning row needs `tabIndex={0}`, `role="button"`, and `aria-expanded={isOpen}`.

The `SimilarColourComparator` region has `role="region"` and `aria-label="Similar colour comparison"`.

### CSS additions (styles.css)

```css
.similar-comparator {
  padding: 14px 16px 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  border-left: 3px solid var(--warning, #B7500A);
}
.sc-threads {
  display: flex; align-items: flex-start; gap: 16px;
  margin-bottom: 12px;
}
.sc-thread {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.sc-swatch-tall {
  width: 40px; height: 60px; border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.sc-swatch-tall.sc-swatch-tall--lg::after { /* reduce texture strength */
  background: linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 50%, rgba(0,0,0,0.05) 100%);
}
.sc-code { font-weight: 700; font-size: 13px; }
.sc-name { font-size: 11px; color: var(--text-secondary); text-align: center; max-width: 60px; }
.sc-delta-block {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; flex: 1; gap: 4px; padding-top: 8px;
}
.sc-delta-value { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sc-delta-desc { font-size: 11px; color: var(--text-secondary); text-align: center; max-width: 120px; line-height: 1.3; }
.sc-note {
  font-size: 11px; color: var(--text-secondary); line-height: 1.5;
  margin-bottom: 10px; font-style: italic;
}
.sc-dismiss { align-self: flex-start; }
.chevron { transition: transform var(--motion, 160ms ease-out); color: var(--text-secondary); }
.chevron--open { transform: rotate(180deg); }
```

### Definition of done (C3)

- [ ] Warning rows in palette list (LegendTab, MaterialsHub) have a chevron expand/collapse control
- [ ] Clicking warning row expands comparator inline below
- [ ] Comparator shows both swatches at 40×60px with correct colours
- [ ] DMC code and name correct under each swatch
- [ ] ΔE₀₀ value displayed prominently; descriptor text correct for the value
- [ ] 3×2 fabric grid renders correctly (3 rows = White Aida / Natural Linen / Black Aida, 2 cols = thread A / thread B)
- [ ] Physical-thread caveat note present (no emoji, British English)
- [ ] "Dismiss warning" collapses the comparator; warning row remains visible
- [ ] Dismissed state not persisted across sessions (resets on page reload)
- [ ] Warning row is keyboard navigable (`tabIndex`, `role="button"`, `aria-expanded`)
- [ ] `chevronDown` icon added to `icons.js` following the 24×24 / 1.6 stroke-width convention
- [ ] `deDescriptor()` defined once in `components.js`, used by both C2 and C3

---

## State Management Summary

| State | Type | Where | Lifetime |
|-------|------|--------|----------|
| `popoverThread` | `{id, name, rgb, anchorRect, similarThread}` or `null` | Local state in each palette-list parent component | Until closed |
| `expandedPair` | `string` (pair key) or `null` | Local state in each palette-list parent component | Until collapsed/dismissed |
| `dismissedPairsRef` | `React.useRef(new Set<string>)` | Local ref in each palette-list parent component | Session (cleared on page reload) |

None of this state needs to be global or stored in IndexedDB or localStorage. The palette-list parent is the natural owner — it already owns the thread array.

---

## Testing Approach

### Unit tests (Jest)

| Test | File | What to test |
|------|------|-------------|
| `deDescriptor()` | `tests/colourInfo.test.js` (new) | Correct string for de=0.5, 1.5, 2.5, 4.0, 6.0, 9.0 |
| Popover position clamp | `tests/colourInfo.test.js` | The pure position-calculation function: overflow at bottom flips above; overflow at right clamps; under minimum clamps |
| `findNearestSimilar()` | `tests/colourInfo.test.js` | Returns null when palette has one thread; returns nearest when ΔE₀₀ < 8; returns null when nearest is ΔE₀₀ > 8 |
| Pair key canonical form | `tests/colourInfo.test.js` | `"blanc+B5200"` and `"B5200+blanc"` produce same canonical key |

### Visual / Playwright tests

| Test | What it checks |
|------|---------------|
| `test_colour_popover.py` | Click DMC 321 swatch in LegendTab, assert popover appears with code "321", three fabric chips present |
| `test_colour_comparator.py` | Import a pattern with blanc and B5200, open LegendTab, assert warning row present, click to expand, assert comparator visible |

### Manual review checklist

- [ ] Texture gradient on DMC 310 (black): white highlight at top-left should be subtle, not stark
- [ ] Texture gradient on blanc: no visible gradient effect (white on white)
- [ ] Popover position on narrow viewport (320px wide): stays inside viewport
- [ ] Comparator on palette with 4 similar-colour pairs: each warning row independent

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Texture gradient shifts perceived hue for saturated reds/blues | Low | Medium | Keep white opacity ≤ 18%; reduce to 14% if colour team objects; the `::after` approach means it can be removed with a single CSS rule deletion |
| Popover adds noise to simple one-click-to-pick workflows | Medium | Low | Popover only appears on explicit click of the swatch itself, not the row; row clicks remain for navigation. Only fires on intentional swatch click |
| Comparator overwhelming for beginners | Medium | Medium | Collapsed by default; must actively click warning row to expand; dismiss hides it for session |
| Portal rendering causing z-index conflicts | Low | Low | Use z-index: 9999; test in creator modal context where other portals exist |
| `position: relative` on `.colour-swatch` breaking layout | Low | Medium | Verify in LegendTab (flex row), MaterialsHub (grid chip), tracker (flex row), manager (table cell) |
| `ReactDOM.createPortal` not available in Babel CDN build | Very Low | High | `ReactDOM` is already loaded globally; `createPortal` has been in ReactDOM since 16.0; confirmed present in React 18 |

---

## Effort Breakdown

| Feature | Tasks | Estimate |
|---------|-------|----------|
| C1: CSS texture | 2 CSS rules + visual QA + 4-touchpoint verification | 1–2 hours |
| C2: Detail popover | `SwatchDetailPopover` component, CSS, 4 integration points, position logic, Playwright test | 4–6 hours |
| C3: Comparator | `SimilarColourComparator` component, CSS, 2 integration points, `chevronDown` icon, unit tests, Playwright test | 3–5 hours |
| **Total (C additions on top of B)** | | **8–13 hours** |

---

## Rollout Strategy

Approach C features can be enabled incrementally behind the existing user preference system (`UserPrefs`):

```
creator.showSwatchTexture    — boolean, default false (Feature C1)
creator.swatchClickDetail    — boolean, default true  (Feature C2, on by default — low risk)
creator.showColourComparator — boolean, default true  (Feature C3, on by default — high value)
```

Shipping C2 and C3 together is fine. C1 (texture) should be treated separately — it is a visual change to every swatch and carries the highest hue-shift risk. Consider A/B testing C1 via the preference gate before making it permanent.

---

## One Thing That Must Not Be Done

**Do not add an "exact colour" or "calibrated swatch" claim to the detail popover.** The popover's note explicitly says "Code is the authoritative reference — screen colours are approximations." Any copy that implies the 48×48px flat swatch is the reference (rather than the physical thread) would undermine user trust when the screen colour and physical thread diverge. The DMC code is the reference. Always.
