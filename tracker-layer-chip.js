/* tracker-layer-chip.js — a visible sign that the Tracker is hiding part of the chart.
   ════════════════════════════════════════════════════════════════════════════
   Layer visibility is remembered per project, so a layer hidden in one session is still hidden when the project is reopened,
   and nothing on the chart says so. This chip sits in the progress strip (and in the Focus mode bar, which hides the strip)
   whenever a layer that has stitches in this pattern is hidden, and one click shows everything again.

   Loaded as a plain <script> before tracker-app.js. Exposes window.TrackerHiddenLayersChip (a React component) and
   window.TrackerLayerChip (pure helpers, for tests).
*/
(function () {
  'use strict';

  // Names as they read in "<name> hidden": plural nouns, matching the Layers tab.
  var LAYER_NAMES = {
    full: 'Full stitches',
    half: 'Half stitches',
    backstitch: 'Backstitch',
    quarter: 'Quarter stitches',
    petite: 'Petite stitches',
    french_knot: 'French knots',
    long_stitch: 'Long stitches'
  };
  var ORDER = ['full', 'half', 'quarter', 'petite', 'french_knot', 'long_stitch', 'backstitch'];

  // The hidden layers that actually hide something: a layer with no stitches in this pattern is not worth a warning.
  // `counts` (layer id to stitch count) may be omitted, which counts every hidden layer.
  function hiddenLayers(layerVis, counts) {
    var out = [];
    for (var i = 0; i < ORDER.length; i++) {
      var id = ORDER[i];
      if (!layerVis || layerVis[id] !== false) continue;
      if (counts && !(counts[id] > 0)) continue;
      out.push({ id: id, label: LAYER_NAMES[id] });
    }
    return out;
  }

  // Second name in "A and b hidden": lower-case it unless it is a proper noun (French knots).
  function midSentence(label) { return /^French/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1); }

  // "Full stitches hidden", "Full stitches and French knots hidden", "3 layers hidden"; '' when nothing is hidden.
  function summary(hidden) {
    if (!hidden || !hidden.length) return '';
    if (hidden.length === 1) return hidden[0].label + ' hidden';
    if (hidden.length === 2) return hidden[0].label + ' and ' + midSentence(hidden[1].label) + ' hidden';
    return hidden.length + ' layers hidden';
  }

  function TrackerHiddenLayersChip(props) {
    var h = window.React.createElement;
    var hidden = hiddenLayers(props.layerVis, props.counts);
    if (!hidden.length) return null;
    var text = summary(hidden);
    var Icons = window.Icons;
    return h('button', {
      type: 'button',
      className: 'tracker-layers-chip' + (props.className ? ' ' + props.className : ''),
      onClick: props.onShow,
      title: 'Show the hidden layers (Shift+A shows or hides them all)',
      'aria-label': text + '. Show hidden layers'
    },
      Icons && Icons.eyeOff ? h('span', { className: 'tracker-layers-chip__icon', 'aria-hidden': 'true' }, Icons.eyeOff()) : null,
      h('span', { className: 'tracker-layers-chip__text', 'aria-hidden': 'true' }, text),
      h('span', { className: 'tracker-layers-chip__sep', 'aria-hidden': 'true' }, '·'),
      h('span', { className: 'tracker-layers-chip__show', 'aria-hidden': 'true' }, 'Show')
    );
  }

  window.TrackerHiddenLayersChip = TrackerHiddenLayersChip;
  window.TrackerLayerChip = { hiddenLayers: hiddenLayers, summary: summary, LAYER_NAMES: LAYER_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.TrackerLayerChip;
})();
