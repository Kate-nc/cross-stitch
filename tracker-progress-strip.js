/* tracker-progress-strip.js — the Tracker's progress strip: the bar, the percentage, the counts and the live timer.
   ════════════════════════════════════════════════════════════════════════════
   Presentation only. TrackerApp keeps every piece of state and decides what the strip shows; this component turns
   the numbers it is given into the `.info-strip` markup and reports clicks back through `onOpenSession`.
   It owns no state, effects or refs, so it does not remount or lose anything when TrackerApp re-renders.

   Props:
     progress        ProgressUnits result for the visible count mode (percent, doneUnits, totalUnits, remainingUnits…)
     prevBarPct      width (%) of the bar filled before today
     todayBarPct     width (%) of the bar filled today
     bsCounts        { done, total } backstitch lines
     layerVis        layer visibility map (the backstitch line is hidden with its layer)
     layerCounts     layer id to stitch count, for the hidden-layers chip
     onShowHiddenLayers  called by the chip's Show button
     session         { open, isTimer, paused, timingLabel, elapsedStore } for the timer button; open=false hides it
     LiveElapsed     the clock component (TrackerApp's, so only it re-renders on each tick)
     onOpenSession   opens the Session tab; both the percentage and the timer buttons call it

   Loaded as a plain <script> before the compiled tracker-app. Exposes window.TrackerProgressStrip.
*/
(function () {
  'use strict';

  function TrackerProgressStrip(props) {
    var React = window.React;
    var h = React.createElement;
    var Icons = window.Icons;
    var PU = window.ProgressUnits;
    var progress = props.progress;
    var progressPct = progress.percent;
    var prevBarPct = props.prevBarPct;
    var todayBarPct = props.todayBarPct;
    var bsCounts = props.bsCounts;
    var layerVis = props.layerVis;
    var session = props.session;
    var totalUnits = progress.totalUnits;
    var paused = session.paused;
    var LiveElapsed = props.LiveElapsed;
    var onOpenSession = props.onOpenSession;

    return h('div', { className: 'info-strip' },
      h('div', { className: 'info-strip-bar' },
        progressPct >= 100 && h('div', { className: 'info-strip-fill info-strip-fill--done', style: { width: '100%' } }),
        progressPct < 100 && prevBarPct > 0 && h('div', { className: 'info-strip-fill', style: { width: prevBarPct + '%' } }),
        progressPct < 100 && todayBarPct > 0 && h('div', { className: 'info-strip-fill info-strip-today', style: { width: todayBarPct + '%' } })
      ),
      h('div', { className: 'info-strip-row' },
        h('button', { type: 'button', className: 'info-strip-pct info-strip-open', 'aria-label': 'Open session controls', onClick: onOpenSession },
          progressPct >= 100
            ? h(React.Fragment, null, 'Complete! ', Icons.star())
            : h(React.Fragment, null, progressPct.toFixed(1), '%')),
        progressPct < 100 && totalUnits > 0 && h('span', { className: 'info-strip-counts' },
          PU.formatUnits(progress.doneUnits), ' done · ', PU.formatUnits(progress.remainingUnits), ' to go'),
        progressPct < 100 && totalUnits > 0 && (function () {
          var bt = PU.breakdownText(progress);
          if (bsCounts.total > 0 && layerVis.backstitch !== false) bt = (bt ? bt + ', ' : '') + bsCounts.done + '/' + bsCounts.total + ' backstitch lines';
          return bt ? h('span', { className: 'info-strip-breakdown', title: 'Half stitches count as half a stitch, quarters a quarter; backstitch is counted on its own, in lines' }, bt) : null;
        })(),
        window.TrackerHiddenLayersChip && h(window.TrackerHiddenLayersChip, { layerVis: layerVis, counts: props.layerCounts, onShow: props.onShowHiddenLayers }),
        session.open && h('button', {
          type: 'button',
          className: 'info-strip-timer',
          title: 'Open Session controls',
          'aria-live': 'off',
          'aria-label': (session.isTimer ? 'Timer' : 'Session') + (paused ? ', paused' : '') + '. Open session controls',
          onClick: onOpenSession
        },
          h('span', { className: 'info-strip-timer-icon', 'aria-hidden': 'true' }, paused ? (Icons.pause ? Icons.pause() : null) : (Icons.play ? Icons.play() : null)),
          ' ',
          h('span', { 'aria-hidden': 'true' }, h(LiveElapsed, { store: session.elapsedStore }), ' · ', session.isTimer ? 'Timer' : session.timingLabel))
      )
    );
  }

  window.TrackerProgressStrip = TrackerProgressStrip;
  if (typeof module !== 'undefined' && module.exports) module.exports = TrackerProgressStrip;
})();
