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
    // Trash / delete — replaces 🗑
    trash: function() {
      return svg(pl('3 6 5 6 21 6'), p('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'), l(10,11,10,17), l(14,11,14,17));
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
    // Chevron up — replaces ▲ ↑
    chevronUp: function() {
      return svg(pl('18 15 12 9 6 15'));
    },
    // Chevron down — replaces ▼ ↓
    chevronDown: function() {
      return svg(pl('6 9 12 15 18 9'));
    }
  };
})();
