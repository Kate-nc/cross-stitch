// ════════════════════════════════════════════════════════════════════════════
// ModeToggle — two-option segmented control shared by the Creator
// (Navigate | Draw) and the Tracker (Mark | Navigate). Audit DRAW-01: both
// halves of the app show, the same way, whether a touch will change the
// chart or just move around it.
//
//   React.createElement(window.ModeToggle, {
//     value: "navigate",
//     onChange: function (v) { ... },
//     options: [{ value: "navigate", label: "Navigate", icon: Icons.hand() },
//               { value: "draw", label: "Draw", icon: Icons.pencil() }],
//     ariaLabel: "Chart mode",
//     compact: false       // icon-only labels hidden visually (still read out)
//   })
// ════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  function ModeToggle(props) {
    var h = React.createElement;
    var options = props.options || [];
    return h('div', {
      className: 'mode-toggle' + (props.compact ? ' mode-toggle--compact' : '') + (props.className ? ' ' + props.className : ''),
      role: 'group',
      'aria-label': props.ariaLabel || 'Mode'
    },
      options.map(function (o) {
        var on = o.value === props.value;
        return h('button', {
          key: o.value,
          type: 'button',
          className: 'mode-toggle__btn' + (on ? ' mode-toggle__btn--on' : ''),
          'aria-pressed': on ? 'true' : 'false',
          title: o.title || o.label,
          'data-mode': o.value,
          onClick: function () { if (!on && typeof props.onChange === 'function') props.onChange(o.value); }
        },
          o.icon ? h('span', { className: 'mode-toggle__icon', 'aria-hidden': 'true' }, o.icon) : null,
          h('span', { className: 'mode-toggle__label' }, o.label)
        );
      })
    );
  }

  window.ModeToggle = ModeToggle;
})();
