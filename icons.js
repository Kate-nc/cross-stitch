/* icons.js — Inline SVG icon components for the cross-stitch app.
   Loaded as a plain <script> after React, before any Babel/JSX scripts.
   Defines window.Icons with functions that return React SVG elements.
   All icons are 1em × 1em, stroke-based lineart using currentColor. */

window.Icons = (function() {
  'use strict';
  var h = React.createElement;

  var SVG_PROPS = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    width: '1em',
    height: '1em',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    style: { display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0 }
  };

  function svg() {
    var children = Array.prototype.slice.call(arguments);
    return h.apply(null, ['svg', SVG_PROPS].concat(children));
  }
  function p(d) { return h('path', { d: d }); }
  function c(cx, cy, r, extra) { return h('circle', Object.assign({ cx: cx, cy: cy, r: r }, extra || {})); }
  function l(x1, y1, x2, y2) { return h('line', { x1: x1, y1: y1, x2: x2, y2: y2 }); }
  function pl(pts) { return h('polyline', { points: pts }); }
  function rc(x, y, w, ht, rx) { return h('rect', Object.assign({ x: x, y: y, width: w, height: ht }, rx != null ? { rx: rx } : {})); }
  function poly(pts) { return h('polygon', { points: pts }); }

  return {
    // Checkmark — replaces ✅
    check: function() {
      return svg(pl('20 6 9 17 4 12'));
    },
    // Thread / spool — replaces 🧵
    thread: function() {
      return svg(rc(5,3,14,3,1), rc(5,18,14,3,1), rc(8,6,8,12), p('M12 6 Q16 12 14 18'));
    },
    // Clipboard — replaces 📋
    clipboard: function() {
      return svg(p('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'), rc(8,2,8,4,1));
    },
    // Save / floppy — replaces 💾
    save: function() {
      return svg(p('M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z'), pl('17 21 17 13 7 13 7 21'), pl('7 3 7 8 15 8'));
    },
    // Open folder — replaces 📂
    folder: function() {
      return svg(p('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'));
    },
    // Padlock — replaces 🔒
    lock: function() {
      return svg(rc(3,11,18,11,2), p('M7 11V7a5 5 0 0 1 10 0v4'));
    },
    // Open padlock — replaces 🔓
    unlock: function() {
      return svg(rc(3,11,18,11,2), p('M7 11V7a5 5 0 0 1 9.2 1'));
    },
    // Hourglass — replaces ⏳
    hourglass: function() {
      return svg(
        p('M5 22h14M5 2h14'),
        p('M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22'),
        p('M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2')
      );
    },
    // Shopping cart — replaces 🛒
    cart: function() {
      return svg(c(9,21,1), c(20,21,1), p('M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6'));
    },
    // Alias used by the B4 Manager Shopping tab + MaterialsHub.
    shoppingCart: function() {
      return svg(c(9,21,1), c(20,21,1), p('M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6'));
    },
    // Trash / delete — replaces 🗑
    trash: function() {
      return svg(pl('3 6 5 6 21 6'), p('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'), l(10,11,10,17), l(14,11,14,17));
    },
    // Copy / duplicate — used by the Shopping list "Copy" action.
    copy: function() {
      return svg(rc(9, 9, 13, 13, 2), p('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'));
    },
    // Settings gear — replaces ⚙️
    gear: function() {
      return svg(
        c(12,12,3),
        p('M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z')
      );
    },
    // Filled circle — replaces 🟢 (active / live indicator)
    dot: function() {
      return svg(c(12,12,5,{ fill:'currentColor', stroke:'none' }));
    },
    // Bar chart — replaces 📊
    barChart: function() {
      return svg(l(18,20,18,10), l(12,20,12,4), l(6,20,6,14));
    },
    // Star — replaces 🎉 (completion celebration)
    star: function() {
      return svg(poly('12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'));
    },
    // Lightbulb — replaces 💡
    lightbulb: function() {
      return svg(
        p('M9 21h6'),
        p('M12 3a6 6 0 0 1 4.47 10.05C15.72 13.87 15 15 15 16.5V17H9v-.5c0-1.5-.72-2.63-1.47-3.45A6 6 0 0 1 12 3z')
      );
    },
    // Eye — replaces 👁 / 👁️
    eye: function() {
      return svg(p('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'), c(12,12,3));
    },
    // Image / picture — replaces 🖼 / 🖼️ (used by the source-image overlay
    // toggle in the Pattern Creator toolbar).
    image: function() {
      return svg(rc(3,3,18,18,2), c(8.5,8.5,1.5), pl('21 15 16 10 5 21'));
    },
    // Pencil — replaces ✏️
    pencil: function() {
      return svg(p('M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'));
    },
    // Eyedropper — replaces 💧 (pick colour)
    eyedropper: function() {
      return svg(
        p('M2 22l1-1h3l9-9'),
        p('M3 21v-3l9-9'),
        p('M15 6l3.4-3.4a2.1 2.1 0 0 1 3 3L18 9l.4.4a2.1 2.1 0 0 1-3 3l-3.8-3.8')
      );
    },
    // Paint bucket — replaces 🪣 (fill tool)
    bucket: function() {
      return svg(
        rc(6,8,12,12,1),
        p('M6 8V7a6 6 0 0 1 12 0v1'),
        l(6,14,18,14)
      );
    },
    // Magic wand — replaces ✨ (select similar)
    wand: function() {
      return svg(l(3,21,10,14), p('M14 5l5 5-9.5 9.5-5-5L14 5z'), l(17,4,21,4), l(19,2,19,6));
    },
    // Colour palette — replaces 🎨
    palette: function() {
      return svg(
        p('M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8z'),
        c(6.5,11.5,1.5,{ fill:'currentColor', stroke:'none' }),
        c(9.5,7.5,1.5,{ fill:'currentColor', stroke:'none' }),
        c(14.5,7.5,1.5,{ fill:'currentColor', stroke:'none' }),
        c(17.5,11.5,1.5,{ fill:'currentColor', stroke:'none' })
      );
    },
    // Magnifying glass — replaces 🔍
    magnify: function() {
      return svg(c(11,11,8), l(21,21,16.65,16.65));
    },
    // Magnify with minus bar — replaces 🔎 (remove highlight)
    magnifyMinus: function() {
      return svg(c(11,11,8), l(21,21,16.65,16.65), l(8,11,14,11));
    },
    // Magnify with plus bar — used by the Tracker Phase 4 mobile dock for "Zoom in".
    magnifyPlus: function() {
      return svg(c(11,11,8), l(21,21,16.65,16.65), l(8,11,14,11), l(11,8,11,14));
    },
    // Plus — generic "add / new" sign. Used by the /home landing tiles and
    // any other "create new …" affordance per UX-12 Phase 7.
    plus: function() {
      return svg(l(12,5,12,19), l(5,12,19,12));
    },
    // Minus — generic "remove / subtract" sign. Used by the threads-needed
    // rail in the Stitch Tracker to indicate "remove from stash".
    minus: function() {
      return svg(l(5,12,19,12));
    },
    // Park-marker flag — small triangular pennant. Used by the Tracker Phase 4
    // mobile dock to toggle the parking colour picker / clear marker affordance.
    parkFlag: function() {
      return svg(l(5,21,5,4), p('M5 4h11l-2 4 2 4H5'));
    },
    // Half-stitch — diagonal slash inside a square. Used by the Tracker Phase 4
    // mobile dock to switch the active stitch into "highlight" view, where
    // half-stitch placement is exposed via the canvas tap interaction.
    halfStitch: function() {
      return svg(rc(4,4,16,16,2), l(4,20,20,4));
    },
    // Info circle — replaces ℹ️
    info: function() {
      return svg(c(12,12,10), l(12,8,12.01,8), l(12,12,12,16));
    },
    // Warning triangle — replaces ⚠️ (with variation selector)
    warning: function() {
      return svg(
        p('M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'),
        l(12,9,12,13), l(12,17,12.01,17)
      );
    },
    // Spinner — quarter-arc; callers add a CSS spin animation.
    spinner: function() {
      return svg(p('M21 12a9 9 0 1 1-6.219-8.56'));
    },
    // Flame — replaces 🔥 (heatmap)
    fire: function() {
      return svg(p('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'));
    },
    // Box / package — replaces 📦
    box: function() {
      return svg(
        p('M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'),
        pl('3.27 6.96 12 12.01 20.73 6.96'),
        l(12,22.08,12,12)
      );
    },
    // Pause bars — replaces ⏸
    pause: function() {
      return svg(rc(6,4,4,16,1), rc(14,4,4,16,1));
    },
    // Stop square — replaces ⏹
    stop: function() {
      return svg(rc(5,5,14,14,1));
    },
    // Archive box — used for bulk-archive on the dashboard
    archive: function() {
      return svg(
        rc(2, 4, 20, 5, 1),
        p('M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9'),
        l(10, 13, 14, 13)
      );
    },
    // Play triangle — replaces ▶ in creator
    play: function() {
      return svg(poly('5 3 19 12 5 21 5 3'));
    },
    // Up-arrow pointer — replaces 👆
    pointing: function() {
      return svg(p('M12 18V8'), p('M8 12l4-4 4 4'));
    },
    // Shuffle / randomise — two crossing arrows
    shuffle: function() {
      return svg(
        pl('16 3 21 3 21 8'),
        l(4,20,21,3),
        pl('21 16 21 21 16 21'),
        p('M15 15l5.5 5.5'),
        p('M4 4l5 5')
      );
    },
    // Adapt / substitute — circular swap around a centred spool. Used by the
    // Stash-Adapt feature to mark adapted projects in the library and to
    // label the entry-point button on the Project tab.
    adapt: function() {
      return svg(
        // Top arc, arrow points right
        p('M4 9a8 8 0 0 1 14-3'),
        pl('18 3 18 7 14 7'),
        // Bottom arc, arrow points left
        p('M20 15a8 8 0 0 1-14 3'),
        pl('6 21 6 17 10 17')
      );
    },
    // Dice — replaces 🎲
    dice: function() {
      return svg(
        rc(2,2,20,20,3),
        c(8,8,1.5,{fill:'currentColor',stroke:'none'}),
        c(16,16,1.5,{fill:'currentColor',stroke:'none'}),
        c(8,16,1.5,{fill:'currentColor',stroke:'none'}),
        c(16,8,1.5,{fill:'currentColor',stroke:'none'}),
        c(12,12,1.5,{fill:'currentColor',stroke:'none'})
      );
    },
    // Bolt — replaces ⚡
    bolt: function() {
      return svg(p('M13 2L3 14h9l-1 8 10-12h-9l1-8z'));
    },
    // Clock — replaces 🕐
    clock: function() {
      return svg(c(12,12,10), l(12,7,12,12), l(12,12,15,15));
    },
    // Calendar — replaces 📅
    calendar: function() {
      return svg(rc(3,4,18,18,2), l(3,10,21,10), l(9,2,9,6), l(15,2,15,6));
    },
    // Camera — replaces 📷 (save snapshot)
    camera: function() {
      return svg(
        p('M14 8l1-1h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4l1 1'),
        c(12,13,3)
      );
    },
    // Sleep/Rest — replaces 💤 (rest indicator)
    sleep: function() {
      return svg(
        p('M21 12a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1z'),
        p('M16 12a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v3z'),
        p('M11 12a1 1 0 0 1-1 1H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3z')
      );
    },
    // Document — replaces 📄 (export/file)
    document: function() {
      return svg(
        p('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'),
        pl('14 2 14 8 20 8'),
        l(9,13,11,13),
        l(9,17,11,17),
        l(9,15,10,15)
      );
    },
    // X / Close — replaces ❌ (error/delete)
    x: function() {
      return svg(p('M18 6L6 18M6 6l12 12'));
    },
    // Cloud Sync — cloud with circular arrows
    cloudSync: function() {
      return svg(
        p('M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242'),
        p('M12 12v9'),
        p('m8 17 4 4 4-4')
      );
    },
    // Cloud Check — cloud with tick
    cloudCheck: function() {
      return svg(
        p('M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242'),
        pl('8 16 12 20 20 12')
      );
    },
    // Cloud Alert — cloud with exclamation
    cloudAlert: function() {
      return svg(
        p('M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242'),
        l(12, 12, 12, 16),
        l(12, 20, 12.01, 20)
      );
    },
    // Cloud Off — cloud with diagonal line through
    cloudOff: function() {
      return svg(
        p('M2 2l20 20'),
        p('M17.5 21H9a7 7 0 0 1-5.21-11.64'),
        p('M22 15.5A4.5 4.5 0 0 0 17.5 11h-1.79A7 7 0 0 0 7.8 5.56')
      );
    },
    // Person — replaces 👤 (profile)
    user: function() {
      return svg(
        p('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'),
        c(12, 7, 4)
      );
    },
    // Globe — replaces 🌐 (regional)
    globe: function() {
      return svg(
        c(12, 12, 10),
        l(2, 12, 22, 12),
        p('M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z')
      );
    },
    // Bell — replaces 🔔 (notifications)
    bell: function() {
      return svg(
        p('M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9'),
        p('M13.73 21a2 2 0 0 1-3.46 0')
      );
    },
    // Accessibility person — replaces ♿ (accessibility)
    accessibility: function() {
      return svg(
        c(12, 4, 2),
        p('M12 6v6'),
        p('M8 10h8'),
        p('M9 22l3-10 3 10'),
        p('M9 14h6')
      );
    },
    // Needle — replaces 🪡 (tracker / stitching)
    needle: function() {
      return svg(
        l(3, 21, 21, 3),
        c(20, 4, 1.5),
        p('M5 19l4 0 0 -4')
      );
    },
    // Frame — replaces 🖼 (preview / display)
    frame: function() {
      return svg(
        rc(3, 3, 18, 18, 1),
        rc(7, 7, 10, 10),
        l(3, 7, 7, 7),
        l(17, 7, 21, 7),
        l(3, 17, 7, 17),
        l(17, 17, 21, 17)
      );
    },
    // Graduation cap — replaces 🎓 (onboarding & help)
    gradCap: function() {
      return svg(
        p('M2 10l10-5 10 5-10 5z'),
        p('M6 12v4a6 3 0 0 0 12 0v-4'),
        l(22, 10, 22, 16)
      );
    },
    // Undo — curved arrow counter-clockwise — replaces ↩ ↺
    undo: function() {
      return svg(
        p('M3 7v6h6'),
        p('M3 13A9 9 0 1 0 6 6.7L3 13')
      );
    },
    // Redo — curved arrow clockwise (mirror of undo).
    redo: function() {
      return svg(
        p('M21 7v6h-6'),
        p('M21 13A9 9 0 1 1 18 6.7L21 13')
      );
    },
    // Refresh / regenerate — counter-clockwise circular arrow.
    refresh: function() {
      return svg(
        p('M1 4v6h6'),
        p('M3.5 15a9 9 0 1 0 .5-8.5L1 10')
      );
    },
    // Hand / pan tool — open hand with extended thumb. Workshop-style
    // single-stroke outline. Used by the new Hand pan tool (touch UX
    // pass) in the creator and tracker toolbars.
    hand: function() {
      return svg(
        p('M9 11V5.5a1.5 1.5 0 0 1 3 0V11'),
        p('M12 11V4.5a1.5 1.5 0 0 1 3 0V11'),
        p('M15 11V6.5a1.5 1.5 0 0 1 3 0V13'),
        p('M9 11V8.5a1.5 1.5 0 0 0-3 0v6.4c0 1.4.4 2.7 1.2 3.8L9 21h7a4 4 0 0 0 4-4v-4')
      );
    },
    // Enter focus / fullscreen — four corner brackets pointing inward.
    focus: function() {
      return svg(
        p('M4 9V4h5'),
        p('M20 9V4h-5'),
        p('M4 15v5h5'),
        p('M20 15v5h-5')
      );
    },
    // Exit focus / fullscreen — four corner brackets pointing outward.
    focusExit: function() {
      return svg(
        p('M9 4H4v5'),
        p('M15 4h5v5'),
        p('M9 20H4v-5'),
        p('M15 20h5v-5')
      );
    },
    // Replay — counter-clockwise circular arrow used by Help drawer's
    // "Restart guided tours" affordance (C8 onboarding).
    replay: function() {
      return svg(
        p('M3 12a9 9 0 1 0 3-6.7L3 8'),
        pl('3 3 3 8 8 8')
      );
    },
    // Hamburger menu — three horizontal lines. Used by the Tracker's
    // left-sidebar opener (added with the Tracker toolbar rework).
    menu: function() {
      return svg(l(3, 6, 21, 6), l(3, 12, 21, 12), l(3, 18, 21, 18));
    },
    // Printer — used by the Creator outcome action bar (UX-12 Phase 5).
    printer: function() {
      return svg(
        pl('6 9 6 2 18 2 18 9'),
        p('M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'),
        rc(6, 14, 12, 8)
      );
    },
    // Chevron up — replaces ▲ ↑
    chevronUp: function() {
      return svg(pl('18 15 12 9 6 15'));
    },
    // Chevron down — replaces ▼ ↓
    chevronDown: function() {
      return svg(pl('6 9 12 15 18 9'));
    },
    // Chevron right — replaces ▶ ›
    chevronRight: function() {
      return svg(pl('9 6 15 12 9 18'));
    },
    // Chevron left — mirror of chevronRight, replaces ◀ ‹
    chevronLeft: function() {
      return svg(pl('15 6 9 12 15 18'));
    },
    // Help — question-mark in a circle. Used by the Header help affordance.
    help: function() {
      return svg(
        c(12, 12, 10),
        p('M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'),
        l(12, 17, 12.01, 17)
      );
    },
    // Layers — stacked sheets. Used by MaterialsHub sub-tab strip and as a
    // small "View:" affordance leading icon.
    layers: function() {
      return svg(
        poly('12 2 2 7 12 12 22 7 12 2'),
        pl('2 17 12 22 22 17'),
        pl('2 12 12 17 22 12')
      );
    },
    // Keyboard — replaces ⌨ for the shortcuts-help launcher.
    keyboard: function() {
      return svg(
        // Body
        h('rect', { x: 2, y: 6, width: 20, height: 13, rx: 2, ry: 2 }),
        // Top row of keys (3 dots)
        l(6, 10, 6.01, 10), l(10, 10, 10.01, 10), l(14, 10, 14.01, 10), l(18, 10, 18.01, 10),
        // Middle row of keys (3 dots)
        l(6, 13, 6.01, 13), l(10, 13, 10.01, 13), l(14, 13, 14.01, 13), l(18, 13, 18.01, 13),
        // Spacebar
        l(7, 16, 17, 16)
      );
    },
    // Crop — replaces ✂ (used by the C7 image-import wizard, step 1)
    crop: function() {
      return svg(
        p('M6 2v14a2 2 0 0 0 2 2h14'),
        p('M18 22V8a2 2 0 0 0-2-2H2')
      );
    },
    // Ruler — replaces 📏 (used by the C7 image-import wizard, step 3)
    ruler: function() {
      return svg(
        p('M21.3 8.7L8.7 21.3a1 1 0 0 1-1.4 0L2.7 16.7a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4z'),
        l(7, 14, 9, 16),
        l(10, 11, 13, 14),
        l(13, 8, 15, 10),
        l(16, 5, 18, 7)
      );
    },
    // Sparkles — replaces 🤖 (used by the embroidery auto-detect card)
    sparkles: function() {
      return svg(
        p('M12 3v4M12 17v4M3 12h4M17 12h4'),
        p('M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M5.6 18.4l2.5-2.5M15.9 8.1l2.5-2.5')
      );
    },
    // Arrows horizontal — replaces ⟺ (used by the split-view drag handle)
    arrowsHorizontal: function() {
      return svg(
        l(3, 12, 21, 12),
        p('M7 8l-4 4 4 4'),
        p('M17 8l4 4-4 4')
      );
    },
    // Lasso — replaces 🧲 (used by the embroidery lasso-select tool)
    lasso: function() {
      return svg(
        p('M3 12c0-4 4-7 9-7s9 3 9 7-4 7-9 7c-1.4 0-2.7-.2-3.9-.6'),
        p('M9 18.4c-.7 1-1.5 1.8-2.5 2.1-.9.3-1.6 0-1.6-.8 0-.7.5-1.4 1.3-1.9'),
        c(6.5, 19, 1.2)
      );
    },
    // Nodes / shape edit — replaces ◇ (used by the embroidery edit-shape tool)
    nodes: function() {
      return svg(
        rc(3, 3, 4, 4, 0.5),
        rc(17, 3, 4, 4, 0.5),
        rc(10, 17, 4, 4, 0.5),
        l(7, 5, 17, 5),
        l(5, 7, 11, 17),
        l(19, 7, 13, 17)
      );
    },
    // Compass — replaces 🧭 (embroidery direction tip)
    compass: function() {
      return svg(c(12, 12, 10), poly('16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76'));
    },
    // Confidence high — solid bars rising
    confidenceHigh: function() {
      return svg(rc(4, 14, 3, 6), rc(10, 9, 3, 11), rc(16, 4, 3, 16));
    },
    // Confidence low — single low bar with downward arrow
    confidenceLow: function() {
      return svg(rc(4, 16, 3, 4), rc(10, 12, 3, 8), p('M16 8l3 3 3-3'), l(19, 11, 19, 4));
    },
    // Magnifier — search/inspect
    magnifier: function() {
      return svg(c(11, 11, 7), l(21, 21, 16.65, 16.65));
    },
    // Split view — two side-by-side rectangles
    splitView: function() {
      return svg(rc(3, 5, 8, 14, 1), rc(13, 5, 8, 14, 1));
    },
    // Grid overlay — 3×3 grid
    gridOverlay: function() {
      return svg(rc(3, 3, 18, 18, 2), l(9, 3, 9, 21), l(15, 3, 15, 21), l(3, 9, 21, 9), l(3, 15, 21, 15));
    },
    // Wand fix — wand with sparkle
    wandFix: function() {
      return svg(p('M15 4V2'), p('M15 16v-2'), p('M8 9h2'), p('M20 9h2'), p('M17.8 11.8 19 13'), p('M15 9h0'), p('M17.8 6.2 19 5'), p('m3 21 9-9'), p('M12.2 6.2 11 5'));
    },
    // Sun — light mode indicator
    sun: function() {
      return svg(
        c(12, 12, 4),
        l(12, 2, 12, 4), l(12, 20, 12, 22),
        l(4.22, 4.22, 5.64, 5.64), l(18.36, 18.36, 19.78, 19.78),
        l(2, 12, 4, 12), l(20, 12, 22, 12),
        l(4.22, 19.78, 5.64, 18.36), l(18.36, 5.64, 19.78, 4.22)
      );
    },
    // Moon — dark mode indicator
    moon: function() {
      return svg(p('M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'));
    },
    // Row mode — two thin lines with a filled row between, indicating
    // current-row highlighting in the stitch tracker.
    rowMode: function() {
      return svg(l(3, 6, 21, 6), rc(3, 10, 18, 4, 1), l(3, 18, 21, 18));
    },
    // Cross-stitch X dot — the brand logo period replacement
    stitchDot: function() {
      return svg(l(4, 4, 20, 20), l(20, 4, 4, 20));
    },
    // Colour swap — two circular arrows indicating a direct colour replacement
    colourSwap: function() {
      return svg(
        p('M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'),
        p('M21 3v5h-5'),
        p('M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'),
        p('M3 21v-5h5')
      );
    },
    // Settings — alias for gear (used by spec EL-SCR-062-* references)
    settings: function() {
      return svg(
        c(12,12,3),
        p('M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z')
      );
    },
    // Sync — circular double-arrow, distinct from cloudSync
    sync: function() {
      return svg(
        p('M21 2v6h-6'),
        p('M3 12a9 9 0 0 1 15-6.7L21 8'),
        p('M3 22v-6h6'),
        p('M21 12a9 9 0 0 1-15 6.7L3 16')
      );
    }
  };
})();

// ─── SVG-string serializer ───────────────────────────────────────────────
// Some legacy DOM helpers (toast.js, status banners) need icons as raw markup
// rather than React elements. window.Icons.svgString(name) renders the same
// React element tree to an inline <svg>…</svg> string suitable for
// element.innerHTML. Returns "" if the icon is unknown.
//
// The serializer only handles the SVG primitives produced by the icon
// factories above (svg/path/circle/line/polyline/rect/polygon) — adding new
// element types to icons.js means adding them here too.
(function() {
  'use strict';
  var ATTR_MAP = {
    className: 'class',
    strokeWidth: 'stroke-width',
    strokeLinecap: 'stroke-linecap',
    strokeLinejoin: 'stroke-linejoin',
    strokeDasharray: 'stroke-dasharray',
    strokeOpacity: 'stroke-opacity',
    fillOpacity: 'fill-opacity',
    textAnchor: 'text-anchor',
    fontSize: 'font-size',
    fontFamily: 'font-family',
    viewBox: 'viewBox'
  };
  // Props that don't belong on the rendered SVG (React metadata or layout
  // hints not needed inside markup-string consumers).
  var SKIP = { children: 1, key: 1, ref: 1, style: 1 };

  function escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function attrs(props) {
    var out = '';
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      if (SKIP[k]) continue;
      var v = props[k];
      if (v == null || v === false) continue;
      var name = ATTR_MAP[k] || k;
      out += ' ' + name + '="' + escape(v) + '"';
    }
    return out;
  }

  function serialize(node) {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return escape(node);
    if (Array.isArray(node)) return node.map(serialize).join('');
    if (typeof node !== 'object' || !node.type) return '';
    if (typeof node.type !== 'string') return ''; // unsupported component
    var inner = '';
    var kids = node.props && node.props.children;
    if (kids != null) inner = serialize(kids);
    return '<' + node.type + attrs(node.props || {}) + (inner ? '>' + inner + '</' + node.type + '>' : '/>');
  }

  window.Icons.svgString = function(name) {
    var fn = window.Icons && window.Icons[name];
    if (typeof fn !== 'function') return '';
    try { return serialize(fn()); } catch (_) { return ''; }
  };
})();
