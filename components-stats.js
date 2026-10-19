// components-stats.js - Stats UI components extracted from components.js.
// Loaded only by pages that render Stats: index.html and stitch.html (for
// the Tracker's StatsContainer + MilestoneCelebration) and stats-page.js
// (for the standalone GlobalStatsDashboard surface). Home and Manager skip
// this file - they only need components-core.js.
//
// Split was performed in chore(perf): components.js -> components-core +
// components-stats; see reports/00_ACTION_PLAN.md headline H1 (=2A.1).
// All exported symbols are plain function declarations so they hoist to
// the global scope - identical behaviour to when they lived in components.js.

function NoteEditor({sessionId, currentNote, onSave}){
  var ref = React.useRef(null);
  var cancelledRef = React.useRef(false);
  var st = React.useState(currentNote || '');
  var text = st[0], setText = st[1];
  React.useEffect(function(){ if(ref.current) ref.current.focus(); }, []);
  var handleSave = function(){ if(!cancelledRef.current) onSave(sessionId, text.trim()); };
  return React.createElement("div", {className:"note-editor"},
    React.createElement("input", {ref:ref, type:"text", value:text,
      onChange:function(e){ setText(e.target.value); },
      onKeyDown:function(e){ if(e.key==='Enter') handleSave(); if(e.key==='Escape'){ cancelledRef.current=true; onSave(sessionId, currentNote||''); } },
      onBlur:handleSave, placeholder:"Add a note about this session...", maxLength:200,
      style:{width:'100%', fontSize:'var(--text-sm)', padding:'4px 8px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)'}})
  );
}

function SessionEditor({session, onSave, onCancel}){
  var sd = new Date(session.startTime);
  var hm = isNaN(sd.getTime()) ? '12:00' : ('0' + sd.getHours()).slice(-2) + ':' + ('0' + sd.getMinutes()).slice(-2);
  var st = React.useState({ date: session.date || '', start: hm, minutes: String(Math.round(getSessionSeconds(session) / 60)), stitches: String(ProgressUnits.sessionAdded(session)) });
  var f = st[0], setF = st[1];
  var es = React.useState('');
  var error = es[0], setError = es[1];
  var set = function(k){ return function(e){ var v = e.target.value; setF(function(p){ var n = Object.assign({}, p); n[k] = v; return n; }); }; };
  var field = function(key, label, type, extra){
    var id = 'sess-edit-' + session.id + '-' + key;
    return React.createElement("label", {key:key, htmlFor:id, style:{display:'flex', flexDirection:'column', gap:2, fontSize:'var(--text-sm)', color:'var(--text-secondary)'}}, label,
      React.createElement("input", Object.assign({id:id, type:type, value:f[key], onChange:set(key), style:{padding:'4px 8px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', fontSize:'var(--text-md)', minHeight:36}}, extra || {})));
  };
  var submit = function(){
    var r = onSave(session.id, { date: f.date, start: f.start, minutes: f.minutes === '' ? NaN : Number(f.minutes), stitches: f.stitches === '' ? NaN : Number(f.stitches) });
    if (r && r.error) setError(r.error);
  };
  return React.createElement("div", {className:"session-editor", role:"group", "aria-label":"Edit session", style:{display:'flex', flexWrap:'wrap', gap:'var(--s-2)', marginTop:'var(--s-2)', alignItems:'flex-end'}},
    field('date', 'Date', 'date'), field('start', 'Start', 'time'),
    field('minutes', 'Minutes', 'number', {min:0, max:1440, step:1, inputMode:'numeric'}),
    field('stitches', 'Stitches', 'number', {min:0, step:0.5, inputMode:'decimal'}),
    React.createElement("button", {className:"timeline-add-note", onClick:submit}, "Save"),
    React.createElement("button", {className:"timeline-add-note", onClick:onCancel}, "Cancel"),
    error ? React.createElement("p", {role:"alert", style:{flexBasis:'100%', margin:0, color:'var(--danger, var(--text-secondary))', fontSize:'var(--text-sm)'}}, error) : null
  );
}

function SessionTimeline({sessions, statsSettings, onEditNote, palette, canEdit, onEditSession, onDeleteSession, onMergeSession}){
  var showSt = React.useState(false);
  var showAll = showSt[0], setShowAll = showSt[1];
  var editSt = React.useState(null);
  var editingId = editSt[0], setEditingId = editSt[1];
  var formSt = React.useState(null);
  var formId = formSt[0], setFormId = formSt[1];
  var colourMap = {};
  if (palette) { for (var pi = 0; pi < palette.length; pi++) { var pc = palette[pi]; if (pc.id && pc.rgb) colourMap[pc.id] = pc; } }
  var grouped = groupSessionsByDate(sessions || []);
  var sortedDates = Object.keys(grouped).sort().reverse();
  var displayDates = showAll ? sortedDates : sortedDates.slice(0, 5);
  var dayEndHour = getDayEndHour(statsSettings);
  var children = [];
  if (!sessions || sessions.length === 0) {
    children.push(React.createElement("p", {key:"empty", style:{fontSize:'var(--text-md)', color:'var(--text-tertiary)'}}, "No sessions recorded yet. Start stitching to see your journal!"));
  }
  // Which record each one can be merged with, worked out once for the whole list (not per entry).
  var mergeNext = {};
  if (canEdit && onMergeSession) {
    var ordered = sessionOrder(sessions || []);
    for (var oi = 0; oi + 1 < ordered.length; oi++) if (ordered[oi + 1].date === ordered[oi].date) mergeNext[ordered[oi].id] = true;
  }
  var timelineEntries = [];
  for (var di = 0; di < displayDates.length; di++) {
    var date = displayDates[di];
    var daySessions = grouped[date].slice().reverse();
    for (var si = 0; si < daySessions.length; si++) {
      var session = daySessions[si];
      var sessionWindow = formatTimeRange(session.startTime, session.endTime);
      var contentChildren = [
        React.createElement("span", {key:"date", className:"timeline-date"}, formatRelativeDate(session.date, dayEndHour) + " - Session window " + sessionWindow),
        React.createElement("div", {key:"stats", className:"timeline-stats"},
          React.createElement("span", {className:"timeline-stitches"}, ProgressUnits.formatUnits(ProgressUnits.sessionAdded(session)) + " stitches"),
          ProgressUnits.sessionUnpicked(session) > 0 ? React.createElement("span", {className:"timeline-duration"}, "Unpicked " + ProgressUnits.formatUnits(ProgressUnits.sessionUnpicked(session))) : null,
          ProgressUnits.sessionCatchUp(session) > 0 ? React.createElement("span", {className:"timeline-duration", title:"Marked in one go as catch-up: counted in progress, not in today's stitching or your pace"}, "Catch-up " + ProgressUnits.formatUnits(ProgressUnits.sessionCatchUp(session))) : null,
          sessionSpeedPerHour(session) ? React.createElement("span", {className:"timeline-duration", title:"Stitches added per hour of " + (ProgressUnits.sessionBasis(session) === "auto" ? "estimated" : timingBasisLabel(session)) + " time"}, "Speed " + sessionSpeedPerHour(session) + " st/hr") : null,
          React.createElement("span", {className:"timeline-duration", title:ProgressUnits.sessionBasis(session) === "timer" ? "Measured with the timer" : ProgressUnits.sessionBasis(session) === "edited" ? "You set these minutes" : "Worked out from when stitches were marked, so it is an estimate"}, "Active time " + formatStatsDuration(getSessionSeconds(session)) + " (" + timingBasisLabel(session) + ")")
        )
      ];
      if (session.coloursWorked && session.coloursWorked.length > 0) {
        var chips = session.coloursWorked.slice(0, 14).map(function(cid) {
          var cm = colourMap[cid];
          var rgb = cm ? cm.rgb : [128, 128, 128];
          return React.createElement("span", {key:cid, title:formatThread(cm || {id: cid}, {variant:"title"}), style:{display:'inline-block',width:10,height:10,borderRadius:2,background:'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')',border:'1px solid rgba(0,0,0,0.15)',flexShrink:0}});
        });
        contentChildren.push(React.createElement("div", {key:"chips", style:{display:'flex',gap:3,flexWrap:'wrap',marginTop:'var(--s-1)'}}, chips));
      }
      if (editingId === session.id) {
        contentChildren.push(React.createElement(NoteEditor, {key:"note-edit", sessionId:session.id, currentNote:session.note, onSave:function(id, text){ onEditNote(id, text); setEditingId(null); }}));
      } else {
        if (session.milestones && session.milestones.length > 0) {
          contentChildren.push(React.createElement("div", {key:"ms-badge", className:"timeline-milestone-badge"}, session.milestones[0].label));
        }
        if (session.note) contentChildren.push(React.createElement("p", {key:"note", className:"timeline-note"}, '"' + session.note + '"'));
        var sid = session.id;
        var actions = [React.createElement("button", {key:"add-note", className:"timeline-add-note", onClick:(function(id){ return function(){ setEditingId(id); }; })(sid)}, session.note ? 'Edit note' : 'Add note')];
        var editor = null;
        if (canEdit && onEditSession) {
          if (formId === sid) {
            editor = React.createElement(SessionEditor, {key:"sess-edit", session:session, onCancel:function(){ setFormId(null); }, onSave:function(id, patch){ var r = onEditSession(id, patch); if (!(r && r.error)) setFormId(null); return r; }});
          } else {
            var canMerge = mergeNext[sid];
            actions.push(React.createElement("button", {key:"edit-sess", className:"timeline-add-note", onClick:(function(id){ return function(){ setFormId(id); }; })(sid)}, 'Edit session'));
            if (canMerge) actions.push(React.createElement("button", {key:"merge-sess", className:"timeline-add-note", onClick:(function(id){ return function(){ onMergeSession(id); }; })(sid)}, 'Merge with next'));
            if (onDeleteSession) actions.push(React.createElement("button", {key:"del-sess", className:"timeline-add-note", onClick:(function(id){ return function(){ onDeleteSession(id); }; })(sid)}, 'Delete session'));
          }
        }
        contentChildren.push(React.createElement("div", {key:"actions", className:"timeline-actions"}, actions));
        if (editor) contentChildren.push(editor);
      }
      if (session.edited) contentChildren.push(React.createElement("span", {key:"edited", className:"timeline-duration", title:"You changed this session's details"}, "edited"));
      timelineEntries.push(React.createElement("div", {key:session.id, className:"timeline-entry"},
        React.createElement("div", {className:"timeline-dot"}),
        React.createElement("div", {className:"timeline-content"}, contentChildren)
      ));
    }
  }
  return React.createElement("div", {className:"session-timeline"},
    React.createElement("h3", {style:{fontSize:'var(--text-xl)', fontWeight:700, color:'var(--text-primary)', marginBottom:'var(--s-3)'}}, "Session journal"),
    children,
    React.createElement("div", {className:"timeline-track"}, timelineEntries),
    !showAll && sortedDates.length > 5 && React.createElement("button", {className:"timeline-show-all", onClick:function(){ setShowAll(true); }}, "View all " + sessions.length + " sessions")
  );
}

// ═══ Phase B: Charts & Milestones ═══

// Reading a chart without hovering. A tap or click on the chart, or the slider under it (which works from the keyboard
// and with a screen reader), picks a point; its value is written in a visible line under the chart. Every chart also
// has its data as a table.
function ChartScrubber(props){
  var h = React.createElement;
  var hasSel = props.sel != null && props.sel >= 0 && props.sel < props.count;
  var text = hasSel ? props.text : '';
  return h('div', {className:'chart-scrubber'},
    h('div', {className:'chart-readout', role:'status', 'aria-live':'polite'}, hasSel ? text : 'Tap the chart, or move the slider, to read a value.'),
    h('input', {type:'range', className:'chart-scrub-range', min:0, max:Math.max(0, props.count - 1), step:1, value:hasSel ? props.sel : Math.max(0, props.count - 1),
      'aria-label':props.label, 'aria-valuetext':hasSel ? text : 'No value chosen yet',
      onChange:function(e){ props.setSel(Number(e.target.value)); }})
  );
}
function ChartTable(props){
  var h = React.createElement;
  // Only the rows that are shown are built (formatting a date is not free, and a long project has hundreds of days).
  var total = props.count, first = Math.max(0, total - 40), shown = [];
  for (var ri = first; ri < total; ri++) shown.push(props.rowAt(ri));
  var rows = { length: total };
  return h('details', {className:'chart-table'},
    h('summary', null, 'Show the data as a table'),
    h('div', {className:'chart-table-scroll'},
      h('table', null,
        h('caption', null, props.caption + (rows.length > shown.length ? ' (latest ' + shown.length + ' of ' + rows.length + ')' : '')),
        h('thead', null, h('tr', null, props.headers.map(function(t, i){ return h('th', {key:i, scope:'col'}, t); }))),
        h('tbody', null, shown.map(function(r, i){ return h('tr', {key:i}, r.map(function(v, j){ return h('td', {key:j}, v); })); }))
      )
    )
  );
}
// The index of the nearest of `xs` (viewBox x positions) to a pointer event on an svg whose viewBox is `vbWidth` wide.
function chartNearestIndex(e, vbWidth, xs){
  var r = e.currentTarget.getBoundingClientRect();
  if (!r.width) return null;
  var fx = (e.clientX - r.left) / r.width * vbWidth;
  var best = 0, bd = Infinity;
  for (var i = 0; i < xs.length; i++) { var d = Math.abs(xs[i] - fx); if (d < bd) { bd = d; best = i; } }
  return best;
}

var CumulativeChart=React.memo(function CumulativeChart({sessions, totalStitches, targetDate, whatIfPace, cadence}){
  var selSt = React.useState(null); var sel = selSt[0], setSel = selSt[1];
  var data = getCumulativeProgressData(sessions);
  if (data.length < 2) return React.createElement("p", {className:"stats-empty"}, "Start stitching to see your progress chart");
  var width = 600, height = 130;
  var pl = 46, pr = 8, pt = 8, pb = 4;
  var cW = width - pl - pr, cH = height - pt - pb;
  var maxY = Math.max(totalStitches, 1);
  var yS = function(v){ return pt + cH - (v / maxY) * cH; };
  var last = data[data.length - 1];
  var mid = data[Math.floor(data.length / 2)];
  var firstDate = new Date(data[0].date + 'T12:00:00');
  var lastDate = new Date(last.date + 'T12:00:00');
  // Compute what-if end date so we can extend the time axis to fit the projection
  var wiRemaining = totalStitches - last.total;
  // calendar days: the stitching days it takes, spread over how often the person stitches
  var wiDays = (whatIfPace > 0 && wiRemaining > 0) ? Math.ceil(Math.ceil(wiRemaining / whatIfPace) / (cadence > 0 ? cadence : 1)) : 0;
  // counted from today on the stitching calendar, like the estimate beside it, not from the last recorded session
  var wiStart = new Date(getStitchingDate(new Date(), getDayEndHour()) + 'T12:00:00');
  var wiEndDate = wiDays > 0 ? new Date(wiStart.getTime() + wiDays * 86400000) : null;
  // Extend x-axis to include what-if endpoint and/or target date
  var extendedEnd = lastDate;
  if (wiEndDate && wiEndDate > extendedEnd) extendedEnd = wiEndDate;
  var targetD = targetDate ? new Date(targetDate + 'T12:00:00') : null;
  if (targetD && Number.isNaN(targetD.getTime())) targetD = null;
  if (targetD && targetD < firstDate) targetD = firstDate;
  if (targetD && targetD > extendedEnd) extendedEnd = targetD;
  var totalMs = Math.max(1, extendedEnd - firstDate);
  var xDate = function(d){ return pl + ((d - firstDate) / totalMs) * cW; };
  // Build polyline using date-based x positions
  var pts = [];
  for (var i = 0; i < data.length; i++) {
    var di = new Date(data[i].date + 'T12:00:00');
    pts.push(xDate(di) + ',' + yS(data[i].total));
  }
  var points = pts.join(' ');
  var lastX = xDate(lastDate);
  var fillPoints = points + ' ' + lastX + ',' + yS(0) + ' ' + xDate(firstDate) + ',' + yS(0);
  // On-pace / target-pace line
  var paceEndX = targetD ? xDate(targetD) : lastX;
  var paceEndY = yS(totalStitches);
  var paceLabel = targetD ? 'Target pace' : 'On pace';
  // What-if projection line (now drawn within the extended chart area)
  var wiLine = null;
  if (wiDays > 0 && wiEndDate) {
    wiLine = React.createElement("line", {x1:lastX, y1:yS(last.total), x2:xDate(wiEndDate), y2:yS(totalStitches), stroke:"var(--warning)", strokeWidth:"2", strokeLinecap:"round", strokeDasharray:"0.1 4"});   // dotted: not the same dash as the pace line
  }
  var pctOf = function(v){ return ProgressUnits.percent(v,totalStitches); };
  var xsOf = function(){ var a = []; for (var xi = 0; xi < data.length; xi++) a.push(xDate(new Date(data[xi].date + 'T12:00:00'))); return a; };
  var selD = (sel != null && sel < data.length) ? data[sel] : null;
  var selText = selD ? formatShortDate(selD.date) + ': ' + ProgressUnits.formatUnits(selD.total) + ' of ' + totalStitches.toLocaleString('en-GB') + ' stitches (' + pctOf(selD.total) + '%)' : '';
  return React.createElement("div", {className:"chart-container"},
    React.createElement("div", {className:"stats-plot-scroll", tabIndex:0, role:"region", "aria-label":"Chart plot"},
    React.createElement("div", {className:"stats-plot"},
    React.createElement("svg", {role:"img","aria-label":"Progress over time: " + pctOf(last.total) + "% done by " + formatShortDate(last.date) + ", from " + pctOf(data[0].total) + "% on " + formatShortDate(data[0].date) + ". Tap the chart or use the slider below to read a day.",viewBox:"0 0 " + width + " " + height, width:"100%", style:{display:'block', cursor:'pointer', touchAction:'manipulation'}, onClick:function(e){ var i = chartNearestIndex(e, width, xsOf()); if (i != null) setSel(i); }},
      React.createElement("text", {x:pl - 4, y:pt + 10, textAnchor:"end", fontSize:"15", fill:"var(--text-secondary)"}, formatCompact(totalStitches)),
      React.createElement("text", {x:pl - 4, y:pt + cH / 2 + 3, textAnchor:"end", fontSize:"15", fill:"var(--text-secondary)"}, formatCompact(totalStitches / 2)),
      React.createElement("text", {x:pl - 4, y:pt + cH, textAnchor:"end", fontSize:"15", fill:"var(--text-secondary)"}, "0"),
      React.createElement("line", {x1:pl, y1:pt + cH / 2, x2:width - pr, y2:pt + cH / 2, stroke:"var(--border)", strokeWidth:"0.5", strokeDasharray:"4 4"}),
      React.createElement("line", {x1:xDate(firstDate), y1:yS(0), x2:paceEndX, y2:paceEndY, stroke:"var(--text-tertiary)", strokeWidth:"1.5", strokeDasharray:"5 4"}),   // dashed, in a colour that shows on the page
      wiLine,
      React.createElement("polygon", {points:fillPoints, fill:"var(--accent)", opacity:"0.08"}),
      React.createElement("polyline", {points:points, fill:"none", stroke:"var(--accent)", strokeWidth:"2.5", strokeLinecap:"round", strokeLinejoin:"round"}),
      React.createElement("circle", {cx:lastX, cy:yS(last.total), r:"4", fill:"var(--accent)"}),
      selD ? React.createElement("line", {x1:xDate(new Date(selD.date + 'T12:00:00')), y1:pt, x2:xDate(new Date(selD.date + 'T12:00:00')), y2:pt + cH, stroke:"var(--text-primary)", strokeWidth:"1", strokeDasharray:"2 2"}) : null,
      selD ? React.createElement("circle", {cx:xDate(new Date(selD.date + 'T12:00:00')), cy:yS(selD.total), r:"5", fill:"var(--surface)", stroke:"var(--text-primary)", strokeWidth:"2"}) : null,
      React.createElement("line", {x1:pl, y1:pt + cH, x2:width - pr, y2:pt + cH, stroke:"var(--border)", strokeWidth:"0.5"})
    ),
    React.createElement("div", {className:"chart-x-labels"},
      React.createElement("span", null, formatShortDate(data[0].date)),
      React.createElement("span", null, formatShortDate(mid.date)),
      React.createElement("span", null, formatShortDate(last.date))
    ))),
    React.createElement("div", {className:"chart-legend"},
      React.createElement("span", null, React.createElement("span", {className:"legend-line solid"}), "Actual"),
      React.createElement("span", null, React.createElement("span", {className:"legend-line dashed"}), paceLabel),
      wiLine ? React.createElement("span", null, React.createElement("span", {className:"legend-line dotted"}), "What-if") : null
    ),
    React.createElement(ChartScrubber, {count:data.length, sel:sel, setSel:setSel, text:selText, label:"Day on the progress chart"}),
    React.createElement(ChartTable, {caption:"Progress over time", headers:["Date", "Stitches done", "Percent"], count:data.length, rowAt:function(i){ var d = data[i]; return [formatShortDate(d.date), ProgressUnits.formatUnits(d.total), pctOf(d.total) + '%']; }})
  );
});

var DailyBarChart=React.memo(function DailyBarChart({sessions, dailyGoal, daysToShow, dayEndHour}){
  var selSt = React.useState(null); var sel = selSt[0], setSel = selSt[1];
  daysToShow = daysToShow || 14;
  var data = getDailyStitchData(sessions, daysToShow, dayEndHour);
  var maxVal = 1;
  for (var i = 0; i < data.length; i++) { if (data[i].stitches > maxVal) maxVal = data[i].stitches; }
  if (dailyGoal && dailyGoal > maxVal) maxVal = dailyGoal;
  var width = 600, height = 120;
  var barGap = 4;
  var barW = Math.max(4, (width - barGap * data.length) / data.length);
  var yS = function(v){ return (v / maxVal) * (height - 20); };
  var barElements = [];
  for (var j = 0; j < data.length; j++) {
    var d = data[j];
    var barH = yS(d.stitches);
    var x = j * (barW + barGap);
    var op = d.stitches === 0 ? 0.1 : 0.4 + 0.6 * (d.stitches / maxVal);
    barElements.push(
      React.createElement("rect", {key:d.date, x:x, y:height - barH, width:barW, height:Math.max(barH, 0),
        fill:d.isToday ? '#5DCAA5' : 'var(--accent)',
        opacity:d.isToday ? 1 : op,
        rx:"2", stroke:(sel === j || d.isToday) ? 'var(--text-primary)' : 'none', strokeWidth:sel === j ? 3 : (d.isToday ? 2 : 0)}   /* today is outlined, not just a different green */,
        React.createElement("title", null, formatShortDate(d.date) + ': ' + ProgressUnits.formatUnits(d.stitches) + ' stitches')
      )
    );
  }
  var barXs = []; for (var bx = 0; bx < data.length; bx++) barXs.push(bx * (barW + barGap) + barW / 2);
  var selB = (sel != null && sel < data.length) ? data[sel] : null;
  var selBText = selB ? (selB.isToday ? 'Today' : formatShortDate(selB.date)) + ': ' + ProgressUnits.formatUnits(selB.stitches) + ' stitches' + (dailyGoal ? ' (goal ' + dailyGoal + ')' : '') : '';
  var totalShown = 0; for (var ts = 0; ts < data.length; ts++) totalShown += data[ts].stitches;
  var mid = data[Math.floor(data.length / 2)];
  var svgChildren = [];
  if (dailyGoal) {
    svgChildren.push(React.createElement("line", {key:"goal", x1:0, y1:height - yS(dailyGoal), x2:width, y2:height - yS(dailyGoal), stroke:"var(--accent)", strokeWidth:"2", strokeDasharray:"4 4", opacity:"0.4"}));
    svgChildren.push(React.createElement("text", {key:"goal-lbl", x:width - 4, y:height - yS(dailyGoal) - 4, textAnchor:"end", fontSize:"10", fill:"var(--accent-text)"}, "Goal: " + dailyGoal));
  }
  svgChildren = svgChildren.concat(barElements);
  return React.createElement("div", {className:"chart-container"},
    React.createElement("div", {className:"stats-plot-scroll", tabIndex:0, role:"region", "aria-label":"Chart plot"},
    React.createElement("div", {className:"stats-plot"},
    React.createElement("div", {style:{position:'relative'}},
      React.createElement("svg", {role:"img","aria-label":"Stitches per day for the last " + data.length + " days: " + ProgressUnits.formatUnits(totalShown) + " in all. Tap a bar or use the slider below to read a day.",viewBox:"0 0 " + width + " " + height, width:"100%", style:{display:'block', cursor:'pointer', touchAction:'manipulation'}, onClick:function(e){ var i = chartNearestIndex(e, width, barXs); if (i != null) setSel(i); }}, svgChildren)
    ),
    React.createElement("div", {className:"chart-x-labels"},
      React.createElement("span", null, formatShortDate(data[0].date)),
      React.createElement("span", null, formatShortDate(mid.date)),
      React.createElement("span", null, "Today")
    ))),
    React.createElement(ChartScrubber, {count:data.length, sel:sel, setSel:setSel, text:selBText, label:"Day on the stitches per day chart"}),
    React.createElement(ChartTable, {caption:"Stitches per day", headers:["Date", "Stitches"], count:data.length, rowAt:function(i){ var d = data[i]; return [(d.isToday ? 'Today' : formatShortDate(d.date)), ProgressUnits.formatUnits(d.stitches)]; }})
  );
});

// ═══ Phase E: Speed Trend Chart ═══

var SpeedTrendChart=React.memo(function SpeedTrendChart({sessions}){
  var selSt = React.useState(null); var sel = selSt[0], setSel = selSt[1];
  var raw = getSpeedTrendData(sessions);
  if (raw.length < 3) return React.createElement("p", {className:"stats-empty"}, "Need more sessions (≥10 min each) to show speed trend");
  var data = getRollingAverage(raw);
  var width = 600, height = 130;
  var pl = 58, pr = 8, pt = 8, pb = 4;
  var cW = width - pl - pr, cH = height - pt - pb;
  var maxY = 1;
  for (var i = 0; i < data.length; i++) { if (data[i].speed > maxY) maxY = data[i].speed; }
  maxY = Math.ceil(maxY * 1.15);
  var xS = function(i){ return pl + (i / (data.length - 1)) * cW; };
  var yS = function(v){ return pt + cH - (v / maxY) * cH; };
  // Raw dots
  var dots = [];
  for (var j = 0; j < data.length; j++) {
    dots.push(React.createElement("circle", {key:'d'+j, cx:xS(j), cy:yS(data[j].speed), r:sel === j ? "5" : "3", fill:"var(--accent)", opacity:sel === j ? "1" : "0.3", stroke:sel === j ? 'var(--text-primary)' : 'none', strokeWidth:sel === j ? 2 : 0},
      React.createElement("title", null, formatShortDate(data[j].date) + ': ' + data[j].speed + ' st/hr')));
  }
  var spXs = []; for (var sx = 0; sx < data.length; sx++) spXs.push(xS(sx));
  var selS = (sel != null && sel < data.length) ? data[sel] : null;
  var selSText = selS ? formatShortDate(selS.date) + ': ' + selS.speed + ' stitches an hour (the smoothed line is at ' + Math.round(selS.smoothedSpeed) + ')' : '';
  // Smoothed line (only if 3+ points)
  var linePts = [];
  for (var k = 0; k < data.length; k++) linePts.push(xS(k) + ',' + yS(data[k].smoothedSpeed));
  var mid = data[Math.floor(data.length / 2)];
  var last = data[data.length - 1];
  // Y-axis labels
  var yMid = Math.round(maxY / 2);
  return React.createElement("div", {className:"chart-container"},
    React.createElement("div", {className:"stats-plot-scroll", tabIndex:0, role:"region", "aria-label":"Chart plot"},
    React.createElement("div", {className:"stats-plot"},
    React.createElement("svg", {role:"img","aria-label":"Speed trend over " + data.length + " sessions of at least 10 minutes: latest " + last.speed + " stitches an hour, smoothed " + Math.round(last.smoothedSpeed) + ". Tap the chart or use the slider below to read a session.",viewBox:"0 0 " + width + " " + height, width:"100%", style:{display:'block', cursor:'pointer', touchAction:'manipulation'}, onClick:function(e){ var i = chartNearestIndex(e, width, spXs); if (i != null) setSel(i); }},
      React.createElement("text", {x:pl - 4, y:pt + 10, textAnchor:"end", fontSize:"15", fill:"var(--text-secondary)"}, maxY + '/hr'),
      React.createElement("text", {x:pl - 4, y:pt + cH / 2 + 3, textAnchor:"end", fontSize:"15", fill:"var(--text-secondary)"}, yMid + '/hr'),
      React.createElement("text", {x:pl - 4, y:pt + cH, textAnchor:"end", fontSize:"15", fill:"var(--text-secondary)"}, "0"),
      React.createElement("line", {x1:pl, y1:pt + cH / 2, x2:width - pr, y2:pt + cH / 2, stroke:"var(--border)", strokeWidth:"0.5", strokeDasharray:"4 4"}),
      React.createElement("line", {x1:pl, y1:pt + cH, x2:width - pr, y2:pt + cH, stroke:"var(--border)", strokeWidth:"0.5"}),
      dots,
      React.createElement("polyline", {points:linePts.join(' '), fill:"none", stroke:"var(--accent)", strokeWidth:"2.5", strokeLinecap:"round", strokeLinejoin:"round"}),
      React.createElement("circle", {cx:xS(data.length - 1), cy:yS(last.smoothedSpeed), r:"4", fill:"var(--accent)"})
    ),
    React.createElement("div", {className:"chart-x-labels"},
      React.createElement("span", null, formatShortDate(data[0].date)),
      React.createElement("span", null, formatShortDate(mid.date)),
      React.createElement("span", null, formatShortDate(last.date))
    ))),
    React.createElement("div", {className:"chart-legend"},
      React.createElement("span", null, React.createElement("span", {style:{display:'inline-block', width:8, height:8, borderRadius:'50%', background:'var(--accent)', opacity:0.3, verticalAlign:'middle', marginRight:'var(--s-1)'}}), "Per session"),
      React.createElement("span", null, React.createElement("span", {className:"legend-line solid", style:{borderColor:'var(--accent)'}}), "7-session avg")
    ),
    React.createElement(ChartScrubber, {count:data.length, sel:sel, setSel:setSel, text:selSText, label:"Session on the speed chart"}),
    React.createElement(ChartTable, {caption:"Speed per session", headers:["Date", "Stitches an hour", "Smoothed"], count:data.length, rowAt:function(i){ var d = data[i]; return [formatShortDate(d.date), String(d.speed), String(Math.round(d.smoothedSpeed))]; }})
  );
});

// ═══ Phase E: Monthly Calendar view ═══

var MonthCalendar = React.memo(function MonthCalendar({sessions}) {
  var _mo = React.useState(0); var monthOffset = _mo[0], setMonthOffset = _mo[1];
  var _pk = React.useState(null); var picked = _pk[0], setPicked = _pk[1];
  var now = new Date();
  var targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  var year = targetMonth.getFullYear();
  var month = targetMonth.getMonth();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var firstDayOfWeek = new Date(year, month, 1).getDay();
  var startOffset = (firstDayOfWeek + 6) % 7; // Mon-start: Mon=0, Sun=6
  var prefix = year + '-' + String(month + 1).padStart(2, '0');
  var dailyMap = {};
  if (sessions) {
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if (s.date && s.date.slice(0, 7) === prefix) {
        dailyMap[s.date] = (dailyMap[s.date] || 0) + ProgressUnits.sessionAdded(s);
      }
    }
  }
  var maxVal = 1;
  for (var dk in dailyMap) { if (dailyMap[dk] > maxVal) maxVal = dailyMap[dk]; }
  var todayStr = new Date().toISOString().slice(0, 10);
  var dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var cells = [];
  for (var h = 0; h < 7; h++) {
    cells.push(React.createElement("div", {key:'hd'+h, style:{textAlign:'center',fontSize:10,color:'var(--text-tertiary)',fontWeight:600,padding:'2px 0'}}, dayLabels[h]));
  }
  for (var e = 0; e < startOffset; e++) cells.push(React.createElement("div", {key:'e'+e}));
  for (var day = 1; day <= daysInMonth; day++) {
    var dateStr = prefix + '-' + String(day).padStart(2, '0');
    var stitches = dailyMap[dateStr] || 0;
    var isToday = dateStr === todayStr;
    cells.push(React.createElement("div", {key:dateStr, title:dateStr + ': ' + stitches + ' stitches', role:'button', tabIndex:0,
      'aria-label':day + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'][month] + ': ' + ProgressUnits.formatUnits(stitches) + ' stitches', 'aria-pressed':picked === dateStr,
      onClick:(function(ds){ return function(){ setPicked(ds); }; })(dateStr),
      onFocus:(function(ds){ return function(){ setPicked(ds); }; })(dateStr),
      onKeyDown:(function(ds){ return function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(ds); } }; })(dateStr),
      style:{cursor:'pointer',outlineOffset:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'3px 2px',
        borderRadius:4,fontSize:'var(--text-xs)',fontWeight:isToday?700:400,color:isToday?'var(--accent)':'var(--text-secondary)',
        background:isToday?'var(--accent-light)':'transparent',border:isToday?'1px solid var(--accent-border)':'1px solid transparent',minWidth:0}},
      React.createElement("span", null, day),
      stitches > 0 ? React.createElement("div", {style:{width:6,height:6,borderRadius:'50%',background:heatmapColor(stitches,maxVal),marginTop:1}}) : null
    ));
  }
  var monthName = targetMonth.toLocaleDateString('en-GB', {month:'long', year:'numeric'});
  return React.createElement("div", {style:{padding:'0 8px'}},
    React.createElement("div", {style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'var(--s-2)'}},
      React.createElement("button", {type:"button","aria-label":"Previous month",onClick:function(){ setMonthOffset(monthOffset - 1); },
        style:{background:'none',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer',padding:'2px 8px',color:'var(--text-secondary)',display:'inline-flex',alignItems:'center'}}, window.Icons&&window.Icons.chevronLeft?window.Icons.chevronLeft():null),
      React.createElement("span", {style:{fontSize:'var(--text-md)',fontWeight:600,color:'var(--text-primary)'}}, monthName),
      React.createElement("button", {type:"button","aria-label":"Next month",onClick:function(){ setMonthOffset(Math.min(0, monthOffset + 1)); },
        style:{background:'none',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',cursor:'pointer',padding:'2px 8px',color:monthOffset < 0?'var(--text-secondary)':'#CFC4AC',display:'inline-flex',alignItems:'center'}}, window.Icons&&window.Icons.chevronRight?window.Icons.chevronRight():null),
      monthOffset !== 0 ? React.createElement("button", {type:"button","aria-label":"Jump to current month",onClick:function(){ setMonthOffset(0); },
        style:{fontSize:'var(--text-xs)',padding:'2px 6px',borderRadius:4,border:'1px solid var(--border)',background:'var(--surface-secondary)',cursor:'pointer',color:'var(--text-tertiary)',marginLeft:'var(--s-1)'}}, "Today") : null
    ),
    React.createElement("div", {style:{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',gap:2}}, cells),
    React.createElement("div", {className:"chart-readout", role:"status", "aria-live":"polite", style:{marginTop:'var(--s-2)'}},
      picked && picked.slice(0, 7) === prefix ? formatShortDate(picked) + ': ' + ProgressUnits.formatUnits(dailyMap[picked] || 0) + ' stitches' : 'Tap a day to read how many stitches it had.'),
    React.createElement(ChartTable, {caption:"Stitches per day in " + monthName, headers:["Date", "Stitches"], count:daysInMonth, rowAt:function(i){ var ds = prefix + '-' + String(i + 1).padStart(2, '0'); return [(i + 1) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'][month], ProgressUnits.formatUnits(dailyMap[ds] || 0)]; }})
  );
});

function StatsChartSection({statsSessions, statsSettings, totalStitches, chartView, setChartView, overviewStats, totalCompleted}){
  var dayEndHour = getDayEndHour(statsSettings);
  var dailyGoal = statsSettings && statsSettings.dailyGoal;
  var targetDate = statsSettings && statsSettings.targetDate;
  var _whatIf = React.useState(null);
  var whatIfPace = _whatIf[0], setWhatIfPace = _whatIf[1];
  var est = overviewStats && overviewStats.estimate;
  var cadence = est && est.pace && est.pace.frequency > 0 ? est.pace.frequency : 1;
  var defaultPace = (est && est.stitchesPerStitchingDay) || (overviewStats && overviewStats.avgPerDay) || 50;
  var paceVal = whatIfPace != null ? whatIfPace : defaultPace;
  var remaining = Math.max(0, totalStitches - (totalCompleted || 0));
  var chartTitles = {cumulative: 'Progress over time', daily: 'Stitches per day', speed: 'Speed trend', calendar: 'Monthly calendar'};
  return React.createElement("div", {className:"chart-section"},
    React.createElement("div", {className:"chart-header"},
      React.createElement("span", {className:"chart-title"}, chartTitles[chartView] || ''),
      React.createElement("div", {className:"chart-toggle"},
        React.createElement("button", {type:"button",className:"chart-toggle-btn" + (chartView === 'daily' ? ' active' : ''), onClick:function(){ setChartView('daily'); }}, "Daily"),
        React.createElement("button", {type:"button",className:"chart-toggle-btn" + (chartView === 'cumulative' ? ' active' : ''), onClick:function(){ setChartView('cumulative'); }}, "Cumulative"),
        React.createElement("button", {type:"button",className:"chart-toggle-btn" + (chartView === 'speed' ? ' active' : ''), onClick:function(){ setChartView('speed'); }}, "Speed"),
        React.createElement("button", {type:"button",className:"chart-toggle-btn" + (chartView === 'calendar' ? ' active' : ''), onClick:function(){ setChartView('calendar'); }}, "Calendar")
      )
    ),
    chartView === 'cumulative'
      ? React.createElement(CumulativeChart, {sessions:statsSessions, totalStitches:totalStitches, targetDate:targetDate, whatIfPace:paceVal, cadence:cadence})
      : chartView === 'speed'
        ? React.createElement(SpeedTrendChart, {sessions:statsSessions})
        : chartView === 'calendar'
          ? React.createElement(MonthCalendar, {sessions:statsSessions})
          : React.createElement(DailyBarChart, {sessions:statsSessions, dailyGoal:dailyGoal, dayEndHour:dayEndHour}),
    chartView === 'cumulative' && overviewStats && remaining > 0
      ? React.createElement("div", {style:{display:'flex', alignItems:'center', gap:'var(--s-2)', padding:'6px 0 0', flexWrap:'wrap'}},
          React.createElement("span", {style:{fontSize:'var(--text-sm)', color:'var(--text-tertiary)'}}, "What-if pace:"),
          React.createElement("input", {type:"range", "aria-label":"What-if pace, stitches per stitching day", "aria-valuetext":paceVal + " per stitching day", min:1, max:Math.max(defaultPace * 5, 500), value:paceVal, step:1,
            onChange:function(e){ setWhatIfPace(parseInt(e.target.value)); }, style:{width:110, cursor:'pointer'}}),
          React.createElement("span", {style:{fontSize:'var(--text-sm)', fontWeight:600, color:'var(--text-primary)', minWidth:120}},
            paceVal + " per stitching day: " + estFormatDays(Math.ceil(Math.ceil(remaining / paceVal) / cadence)) + (cadence < 1 ? " at " + (Math.round(cadence * 70) / 10) + " stitching days a week" : "")),
          whatIfPace != null ? React.createElement("button", {onClick:function(){ setWhatIfPace(null); },
            style:{fontSize:'var(--text-xs)', padding:'1px 6px', borderRadius:4, border:'1px solid var(--border)', background:'var(--surface-secondary)', cursor:'pointer', color:'var(--text-tertiary)'}}, "Reset") : null
        )
      : null
  );
}

var MilestoneTracker=React.memo(function MilestoneTracker({milestones, achievedMilestones}){
  if (!milestones || milestones.length === 0) return null;
  // Build a lookup from pct → exact achievedAt timestamp
  var exactDates = {};
  if (achievedMilestones && achievedMilestones.length > 0) {
    for (var ai = 0; ai < achievedMilestones.length; ai++) {
      var am = achievedMilestones[ai];
      if (am.pct != null) exactDates['pct_' + am.pct] = am.achievedAt;
    }
  }
  var badges = [];
  for (var i = 0; i < milestones.length; i++) {
    var m = milestones[i];
    var cls = 'milestone-badge ' + (m.achieved ? 'achieved' : m.isNext ? 'next' : 'future');
    var exactTs = m.achieved ? exactDates['pct_' + m.percent] : null;
    var dateLabel;
    if (m.achieved) {
      if (exactTs) {
        dateLabel = new Date(exactTs).toLocaleDateString('en-GB', {day:'numeric', month:'short'});
      } else if (m.achievedDate) {
        dateLabel = formatShortDate(m.achievedDate);
      } else {
        dateLabel = '\u2713';
      }
    } else {
      dateLabel = m.estimatedDate ? '~' + formatShortDate(m.estimatedDate) : '\u2014';
    }
    // The state is not colour alone: achieved is ticked, next says so, upcoming is dashed (styles.css).
    var mark = m.achieved && window.Icons && window.Icons.check ? React.createElement("span", {className:"milestone-mark"}, window.Icons.check()) : null;
    badges.push(React.createElement("div", {key:m.percent, className:cls},
      React.createElement("span", {className:"milestone-percent"}, mark, m.percent + '%'),
      React.createElement("span", {className:"milestone-date"}, dateLabel),
      !m.achieved && m.isNext ? React.createElement("span", {className:"milestone-state"}, "Next") : null
    ));
  }
  return React.createElement("div", {className:"milestones"},
    React.createElement("h3", {className:"stats-section-title"}, "Milestones"),
    React.createElement("div", {className:"milestone-row"}, badges)
  );
});

// ═══ Phase C: Goals, Motivation & Celebrations ═══

function DailyGoalSetting({currentGoal, avgPerDay, remaining, onSet}){
  var st = React.useState(currentGoal != null ? String(currentGoal) : '');
  var value = st[0], setValue = st[1];
  React.useEffect(function(){ setValue(currentGoal != null ? String(currentGoal) : ''); }, [currentGoal]);

  var avg = avgPerDay || 0;
  var presets = avg > 0 ? [
    { label: 'Easy', value: Math.max(25, Math.floor(avg / 25) * 25) },
    { label: 'Moderate', value: Math.max(25, Math.round(avg * 1.25 / 25) * 25) },
    { label: 'Ambitious', value: Math.max(25, Math.round(avg * 1.5 / 25) * 25) }
  ] : [];

  return React.createElement("div", {className:"goal-setting"},
    React.createElement("label", {className:"goal-label"}, "Daily stitch goal"),
    React.createElement("div", {className:"goal-input-row"},
      React.createElement("input", {type:"number", min:"0", max:"9999", step:"25", value:value,
        onChange:function(e){ setValue(e.target.value); },
        placeholder:"e.g. 300", className:"goal-input", "aria-label":"Daily stitch goal"}),
      React.createElement("button", {className:"goal-set-btn", onClick:function(){
        var v = parseInt(value, 10);
        onSet(v > 0 ? v : null);
      }}, value && parseInt(value, 10) > 0 ? 'Set goal' : 'Clear goal')
    ),
    presets.length > 0 && React.createElement("div", {className:"goal-presets"},
      presets.map(function(p){ return React.createElement("button", {type:"button",key:p.label, className:"goal-preset-btn" + (currentGoal === p.value ? ' active' : ''), onClick:function(){ setValue(String(p.value)); onSet(p.value); }}, p.label + ' (' + p.value + ')'); })
    ),
    currentGoal && remaining > 0 && React.createElement("p", {className:"goal-suggestion"},
      "At " + currentGoal + " per stitching day, you\u2019d finish in ~" + Math.ceil(remaining / currentGoal) + (Math.ceil(remaining / currentGoal) === 1 ? " stitching day" : " stitching days"))
  );
}

function TargetDateSetting({currentTarget, remaining, avgPerDay, frequency, onSet}){
  var st = React.useState(currentTarget || '');
  var date = st[0], setDate = st[1];
  React.useEffect(function(){ setDate(currentTarget || ''); }, [currentTarget]);

  var paceNeeded = date ? getRequiredPace(remaining, date, frequency) : null;
  var todayStr = new Date().toISOString().slice(0, 10);

  return React.createElement("div", {className:"target-setting"},
    React.createElement("label", {className:"goal-label"}, "Target completion date"),
    React.createElement("div", {className:"goal-input-row"},
      React.createElement("input", {type:"date", value:date, min:todayStr, "aria-label":"Target completion date",
        onChange:function(e){ setDate(e.target.value); },
        className:"goal-input"}),
      React.createElement("button", {type:"button",className:"goal-set-btn", onClick:function(){ onSet(date || null); }},
        date ? 'Set target' : 'Clear target')
    ),
    paceNeeded && React.createElement("p", {className:"goal-suggestion"},
      "You\u2019d need ", React.createElement("strong", null, paceNeeded + " stitches per stitching day"), " to finish by then")
  );
}

// "Day ends at": one setting for the whole app (also in Preferences). Late-night stitching counts for the previous day
// until this hour, in the Tracker, project Stats, global Stats, Activity and Insights alike.
function DayEndSetting({statsSettings, onUpdateSettings}){
  var hour = getDayEndHour(statsSettings);
  function labelFor(h) { return h === 0 ? "Midnight" : h + ":00 AM"; }
  return React.createElement("div", {className:"day-end-setting", style:{marginBottom:'var(--s-3)'}},
    React.createElement("label", {className:"goal-label", htmlFor:"day-ends-at"}, "Day ends at"),
    React.createElement("select", {id:"day-ends-at", value:hour, className:"goal-input", style:{maxWidth:160},
      onChange:function(e){
        var h = parseInt(e.target.value, 10) || 0;
        try { if (window.UserPrefs) window.UserPrefs.set('statsDayEndHour', h); } catch (_) {}
        onUpdateSettings(Object.assign({}, statsSettings, {dayEndHour:h}));
      }},
      [0,1,2,3,4,5].map(function(h){ return React.createElement("option", {key:h, value:h}, labelFor(h)); })
    ),
    React.createElement("p", {style:{fontSize:'var(--text-xs)', color:'var(--text-tertiary)', margin:'4px 0 0'}}, "Late-night stitching counts for the previous day until this hour.")
  );
}

function GoalTracker({statsSettings, statsSessions, totalCompleted, totalStitches, overviewStats, onUpdateSettings}){
  var dailyGoal = statsSettings && statsSettings.dailyGoal;
  var weeklyGoal = statsSettings && statsSettings.weeklyGoal;
  var monthlyGoal = statsSettings && statsSettings.monthlyGoal;
  var targetDate = statsSettings && statsSettings.targetDate;
  var dayEndHour = getDayEndHour(statsSettings);
  var todayStitches = getStatsTodayStitches(statsSessions || [], dayEndHour);
  var weekStitches = getStatsThisWeekStitches(statsSessions || [], dayEndHour);
  var monthStitches = getStatsThisMonthStitches(statsSessions || [], dayEndHour);
  var remaining = totalStitches - totalCompleted;
  var requiredPace = targetDate ? getRequiredPace(remaining, targetDate, (overviewStats && overviewStats.estimate && overviewStats.estimate.pace && overviewStats.estimate.pace.frequency) || 0) : null;
  var estimate = overviewStats && overviewStats.estimate;
  var paceFreq = estimate && estimate.pace && estimate.pace.frequency > 0 ? estimate.pace.frequency : 0;
  var avgPerDay = overviewStats ? ((estimate && estimate.stitchesPerStitchingDay) || overviewStats.avgPerDay) : 0;
  var activeDays = overviewStats ? overviewStats.activeDays : 0;
  var elapsedDays = overviewStats ? overviewStats.elapsedDays : 0;

  function goalRow(label, current, goal){
    var pct = Math.min(100, goal > 0 ? (current / goal) * 100 : 0);
    var met = current >= goal;
    return React.createElement("div", {className:"goal-progress"},
      React.createElement("div", {className:"goal-row"},
        React.createElement("span", {className:"goal-row-label"}, label),
        React.createElement("span", {className:"goal-row-value" + (met ? ' met' : ' pending')},
          current.toLocaleString('en-GB') + " / " + goal.toLocaleString('en-GB') + (met ? ' \u2713' : ''))
      ),
      React.createElement("div", {className:"goal-bar-container"},
        React.createElement("div", {className:"goal-bar-fill", style:{width:pct+'%'}})
      )
    );
  }

  return React.createElement("div", {className:"goal-tracker-panel"},
    React.createElement("h3", {className:"stats-section-title"}, "Goals"),
    React.createElement(DayEndSetting, {statsSettings:statsSettings, onUpdateSettings:onUpdateSettings}),
    React.createElement(DailyGoalSetting, {currentGoal:dailyGoal, avgPerDay:avgPerDay, remaining:remaining,
      onSet:function(v){ onUpdateSettings(Object.assign({}, statsSettings, {dailyGoal:v})); }}),
    dailyGoal && goalRow("Today so far", todayStitches, dailyGoal),
    React.createElement("div", {style:{marginTop:'var(--s-3)'}}),
    React.createElement("label", {className:"goal-label"}, "Weekly stitch goal"),
    React.createElement("div", {className:"goal-input-row"},
      React.createElement("input", {type:"number", min:"0", max:"20000", step:"50",
        className:"goal-input", placeholder:"e.g. 500", "aria-label":"Weekly stitch goal",
        defaultValue: weeklyGoal != null ? String(weeklyGoal) : '',
        key: String(weeklyGoal),
        onBlur:function(e){ var v=parseInt(e.target.value); onUpdateSettings(Object.assign({},statsSettings,{weeklyGoal:v>0?v:null})); }}),
      React.createElement("button", {type:"button",className:"goal-set-btn", onClick:function(){ onUpdateSettings(Object.assign({},statsSettings,{weeklyGoal:null})); }}, "Clear")
    ),
    weeklyGoal && goalRow("This week so far", weekStitches, weeklyGoal),
    React.createElement("div", {style:{marginTop:'var(--s-3)'}}),
    React.createElement("label", {className:"goal-label"}, "Monthly stitch goal"),
    React.createElement("div", {className:"goal-input-row"},
      React.createElement("input", {type:"number", min:"0", max:"75000", step:"50",
        className:"goal-input", placeholder:"e.g. 3000", "aria-label":"Monthly stitch goal",
        defaultValue: monthlyGoal != null ? String(monthlyGoal) : '',
        key: String(monthlyGoal),
        onBlur:function(e){ var v=parseInt(e.target.value); onUpdateSettings(Object.assign({},statsSettings,{monthlyGoal:v>0?v:null})); }}),
      React.createElement("button", {type:"button",className:"goal-set-btn", onClick:function(){ onUpdateSettings(Object.assign({},statsSettings,{monthlyGoal:null})); }}, "Clear")
    ),
    monthlyGoal && goalRow("This month so far", monthStitches, monthlyGoal),
    estPaceLine(estimate) && React.createElement("div", {className:"goal-pace-context"}, estPaceLine(estimate)),
    React.createElement("div", {style:{marginTop:'var(--s-4)'}}),
    React.createElement(TargetDateSetting, {currentTarget:targetDate, remaining:remaining, avgPerDay:avgPerDay, frequency:paceFreq,
      onSet:function(v){ onUpdateSettings(Object.assign({}, statsSettings, {targetDate:v})); }}),
    targetDate && requiredPace && React.createElement("div", {className:"goal-progress", style:{marginTop:'var(--s-2)'}},
      React.createElement("div", {className:"goal-row"},
        React.createElement("span", {className:"goal-row-label"}, "Target date"),
        React.createElement("span", {className:"goal-row-value"}, formatShortDate(targetDate))
      ),
      React.createElement("div", {className:"goal-row"},
        React.createElement("span", {className:"goal-row-label"}, "Pace needed"),
        React.createElement("span", {className:"goal-row-value"}, requiredPace + " per stitching day")
      ),
      React.createElement("div", {className:"goal-row"},
        React.createElement("span", {className:"goal-row-label"}, "Status"),
        React.createElement("span", {className:"goal-row-value" + (avgPerDay >= requiredPace ? ' met' : ' pending')},
          avgPerDay >= requiredPace ? 'On track' : 'Behind pace')
      )
    )
  );
}

// The weekly streak is the default (a day or two off never costs anything); the daily streak only when it is turned on,
// and none of it when streaks are turned off, leaving the best day and the average session, which are figures, not a streak.
function StreaksPanel({sessions, dayEndHour, showStreaks, showDaily}){
  if (showStreaks == null) showStreaks = true;
  var weekly = computeWeeklyStreaks(sessions, dayEndHour);
  var daily = showDaily ? computeStreaks(sessions, dayEndHour) : null;
  var bestDay = findBestDay(sessions);
  var avgSession = sessions && sessions.length > 0
    ? Math.round(sessions.reduce(function(sum, s){ return sum + getSessionSeconds(s); }, 0) / sessions.length)
    : 0;
  var row = function(label, value, key){
    return React.createElement("div", {className:"stat-row", key:key},
      React.createElement("span", {className:"stat-row-label"}, label),
      React.createElement("span", {className:"stat-row-value"}, value));
  };
  var rows = [];
  if (showStreaks) {
    rows.push(row("Weeks in a row", weeksText(weekly.current), "wk"));
    rows.push(row("Most weeks in a row", weeksText(weekly.longest), "wkl"));
    if (daily) {
      rows.push(row("Days in a row", daily.current + " day" + (daily.current !== 1 ? 's' : ''), "dy"));
      rows.push(row("Most days in a row", daily.longest + " day" + (daily.longest !== 1 ? 's' : ''), "dyl"));
    }
  }
  rows.push(row("Best day", bestDay ? bestDay.stitches + ' (' + formatShortDate(bestDay.date) + ')' : '\u2014', "bd"));
  rows.push(row("Avg session", formatStatsDuration(avgSession), "as"));
  return React.createElement("div", {className:"streaks-panel"},
    React.createElement("h3", {className:"stats-section-title"}, showStreaks ? "Streaks" : "Sessions"),
    React.createElement("div", {className:"stat-rows"}, rows)
  );
}

function MilestoneCelebration({milestone, onDismiss}){
  React.useEffect(function(){
    var timer = setTimeout(onDismiss, 4000);
    return function(){ clearTimeout(timer); };
  }, []);

  return React.createElement("div", {className:"milestone-celebration"},
    React.createElement("span", {className:"celebration-icon"}, Icons.star()),
    React.createElement("span", {className:"celebration-text"}, milestone.label),
    milestone.pct && React.createElement("span", {className:"celebration-subtext"}, milestone.pct + '% complete')
  );
}

// One panel for every colour: how much is left (from the pattern) and when it was worked (from the sessions).
var COLOUR_SORTS = [
  {id:'remaining', label:'Most remaining'},
  {id:'palette', label:'Palette order'},
  {id:'recent', label:'Recently worked'},
  {id:'oldest', label:'Longest untouched'}
];
var COLOUR_FILTERS = [
  {id:'all', label:'All'},
  {id:'progress', label:'In progress'},
  {id:'todo', label:'Not started'},
  {id:'done', label:'Complete'}
];

function ColourProgress({palette, colourDoneCounts, sessions}){
    var _sort = React.useState('remaining'); var sortBy = _sort[0], setSortBy = _sort[1];
    var _flt = React.useState('all'); var filterBy = _flt[0], setFilterBy = _flt[1];
    if (!palette || palette.length === 0) return React.createElement('div', {className:'colour-progress'},
      React.createElement('h3', {className:'stats-section-title'}, 'Colours'),
      React.createElement('p', {className:'stats-empty'}, 'No colours in this pattern yet.'));
    var timeline = getColourTimeline(sessions);
    var colourStats = [];
    var coloursComplete = 0;
    for (var i = 0; i < palette.length; i++) {
      var p = palette[i];
      if (p.id === '__skip__' || p.id === '__empty__') continue;
      var dc = (colourDoneCounts && colourDoneCounts[p.id]) || {total:0, done:0};
      var halfTotal = dc.halfTotal || 0, halfDone = dc.halfDone || 0;
      var cp = ProgressUnits.colourProgress(dc);
      var remaining = cp.remainingUnits, allDone = cp.doneUnits;
      var pct = cp.percent, complete = cp.complete;
      if (complete) coloursComplete++;
      colourStats.push({id:p.id, brand:p.brand, name:p.name, type:p.type, threads:p.threads, rgb:p.rgb, order:i,
        remaining:remaining, pct:pct, total:dc.total, halfTotal:halfTotal, halfDone:halfDone,
        complete:complete, started:allDone > 0, tl:timeline[p.id] || null});
    }
    var avgSessionStitches = 0;
    if (sessions && sessions.length > 0) {
      var recentSess = sessions.slice(-10);
      var totalSt = recentSess.reduce(function(sum, r) { return sum + ProgressUnits.sessionAdded(r); }, 0);
      avgSessionStitches = totalSt / recentSess.length;
    }
    var totalColours = colourStats.length;
    var unfinished = colourStats.filter(function(c){ return !c.complete && c.remaining > 0; }).sort(function(a,b){ return b.remaining - a.remaining; });
    var mostRemaining = unfinished[0];
    var leastRemaining = unfinished[unfinished.length - 1];
    var hasHistory = false;
    for (var k in timeline) { hasHistory = true; break; }
    var shown = colourStats.filter(function(c){
      if (filterBy === 'progress') return c.started && !c.complete;
      if (filterBy === 'todo') return !c.started;
      if (filterBy === 'done') return c.complete;
      return true;
    });
    // Colours with no recorded sessions always sort last, whichever way the dates run.
    var byLastDate = function(dir){ return function(a, b){
      if (!a.tl || !b.tl) return (a.tl ? -1 : 0) - (b.tl ? -1 : 0) || a.order - b.order;
      return dir * (a.tl.lastDate < b.tl.lastDate ? -1 : a.tl.lastDate > b.tl.lastDate ? 1 : 0) || a.order - b.order;
    }; };
    shown.sort(function(a, b){
      if (sortBy === 'palette') return a.order - b.order;
      if (sortBy === 'recent') return byLastDate(-1)(a, b);
      if (sortBy === 'oldest') return byLastDate(1)(a, b);
      return b.remaining - a.remaining || a.order - b.order;
    });
    var sortOptions = COLOUR_SORTS.filter(function(o){ return hasHistory || (o.id !== 'recent' && o.id !== 'oldest'); });
    var activeSort = sortOptions.some(function(o){ return o.id === sortBy; }) ? sortBy : 'remaining';
    var selStyle = {fontSize:'var(--text-sm)', minHeight:36, maxWidth:'100%', padding:'4px 6px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', background:'var(--surface-secondary)', color:'var(--text-secondary)'};
    return React.createElement("div", {className:"colour-progress"},
      React.createElement("h3", {className:"stats-section-title"}, "Colours"),
      React.createElement("div", {className:"stats-colour-summary"},
        React.createElement("span", null, coloursComplete + " / " + totalColours + " colour" + (totalColours !== 1 ? "s" : "") + " complete"),
        mostRemaining && React.createElement("span", null,
          "Most remaining: " + formatThread(mostRemaining) + " (" + mostRemaining.remaining.toLocaleString('en-GB') + " stitches)"),
        leastRemaining && leastRemaining !== mostRemaining && React.createElement("span", null,
          "Least remaining: " + formatThread(leastRemaining) + " (" + leastRemaining.remaining.toLocaleString('en-GB') + " left)")
      ),
      React.createElement("div", {className:"stats-colour-controls"},
        React.createElement("label", null, "Show ",
          React.createElement("select", {value:filterBy, style:selStyle, "aria-label":"Show colours", onChange:function(e){ setFilterBy(e.target.value); }},
            COLOUR_FILTERS.map(function(o){ return React.createElement("option", {key:o.id, value:o.id}, o.label); }))),
        React.createElement("label", null, "Sort ",
          React.createElement("select", {value:activeSort, style:selStyle, "aria-label":"Sort colours", onChange:function(e){ setSortBy(e.target.value); }},
            sortOptions.map(function(o){ return React.createElement("option", {key:o.id, value:o.id}, o.label); })))
      ),
      !hasHistory ? React.createElement("p", {className:"stats-empty"}, "Which days you worked each colour is recorded as you stitch. Nothing is recorded for this project yet.") : null,
      shown.length === 0 ? React.createElement("p", {className:"stats-empty"}, "No colours match this filter.") : null,
      React.createElement("div", {className:"stats-colour-list", tabIndex:0, role:"region", "aria-label":"Colour progress list"},
        shown.map(function(c){
          var nameStr = formatThread(c, {variant:'name'});
          var rgb = c.rgb || [128,128,128];
          var halfLeft = c.halfTotal - c.halfDone;
          var tl = c.tl;
          var when = tl
            ? formatShortDate(tl.firstDate) + (tl.lastDate !== tl.firstDate ? ' \u2013 ' + formatShortDate(tl.lastDate) : '') + ' \u00B7 ' + tl.sessionCount + ' session' + (tl.sessionCount !== 1 ? 's' : '')
            : null;
          var est = avgSessionStitches > 0 && c.remaining > 0
            ? (function (n) { return "~" + n + (n === 1 ? " session" : " sessions") + " to go"; })(Math.ceil(c.remaining / avgSessionStitches))
            : null;
          var detail = [when, est].filter(Boolean).join(' \u00B7 ');
          return React.createElement("div", {key:c.id, className:"stats-colour-row" + (c.complete ? " complete" : "")},
            React.createElement("span", {className:"colour-swatch", style:{background:'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')'}}),
            React.createElement("div", {className:"colour-info"},
              React.createElement("div", {className:"colour-info-main"},
                React.createElement("span", {className:"colour-id", title:formatThread(c, {variant:"title"})}, formatThread(c, {variant:"short"}), c.type === 'blend' ? React.createElement("span", {className:"ppal-tile-tag"}, "blend") : null),
                React.createElement("span", {className:"colour-name"}, nameStr)),
              detail ? React.createElement("span", {className:"colour-detail"}, detail) : null),
            React.createElement("div", {className:"colour-bar", role:"img", "aria-label":c.pct + "% done"},
              React.createElement("div", {className:"colour-bar-fill", style:{width:c.pct+'%'}})
            ),
            React.createElement("span", {className:"colour-remaining"},
              c.remaining === 0
                ? (halfLeft > 0 ? halfLeft + " half left" : (window.Icons ? window.Icons.check() : null))
                : ProgressUnits.formatUnits(c.remaining) + " units left")
          );
        })
      )
    );
}

// ═══ Visual Progress: Section completion grid ═══
function SectionGrid({sections, statsSettings, onUpdateSettings, pat, done, sW, palette, canEdit}){
  if(canEdit==null)canEdit=true;
  var numX=0,numY=0;
  if(sections&&sections.length>0){
    sections.forEach(function(s){if(s.sx>=numX)numX=s.sx+1;if(s.sy>=numY)numY=s.sy+1;});
  }
  var complete=sections?sections.filter(function(s){return s.isDone;}).length:0;
  var secCols=(statsSettings&&statsSettings.sectionCols)||50;
  var secRows=(statsSettings&&statsSettings.sectionRows)||50;
  var sectionLabels=(statsSettings&&statsSettings.sectionLabels)||{};
  var _editing=React.useState(null);var editingKey=_editing[0],setEditingKey=_editing[1];
  var _editVal=React.useState('');var editVal=_editVal[0],setEditVal=_editVal[1];
  var _selected=React.useState(null);var selectedKey=_selected[0],setSelectedKey=_selected[1];

  function commitLabel(key){
    if(!canEdit){setEditingKey(null);return;}
    var trimmed=editVal.trim();
    var updated=Object.assign({},sectionLabels);
    if(trimmed){updated[key]=trimmed;}else{delete updated[key];}
    onUpdateSettings(Object.assign({},statsSettings,{sectionLabels:updated}));
    setEditingKey(null);
  }

  // Build a colour lookup from palette
  var colourMap={};
  if(palette){palette.forEach(function(c){if(c.id)colourMap[c.id]=c;});}

  // Compute thread breakdown for the selected section
  var selectedSection=selectedKey?sections.find(function(s){return s.sx+','+s.sy===selectedKey;}):null;
  var sectionThreads=React.useMemo(function(){
    if(!selectedSection||!pat||!done||!sW)return null;
    var counts={};
    for(var y=selectedSection.y0;y<selectedSection.y1;y++){
      for(var x=selectedSection.x0;x<selectedSection.x1;x++){
        var idx=y*sW+x;
        var cell=pat[idx];
        if(!cell||cell.id==='__skip__'||cell.id==='__empty__')continue;
        var ids=cell.type==='blend'?splitBlendId(cell.id):[cell.id];
        ids.forEach(function(cid){
          if(!counts[cid])counts[cid]={total:0,doneCount:0};
          counts[cid].total++;
          if(done[idx])counts[cid].doneCount++;
        });
      }
    }
    return Object.keys(counts).sort(function(a,b){return counts[b].total-counts[a].total;}).map(function(cid){
      return Object.assign({id:cid},counts[cid]);
    });
  },[selectedSection,pat,done,sW]);

  var selectedLabel=selectedSection?(sectionLabels[selectedKey]||('Section '+selectedSection.label)):null;

  return React.createElement("div",{className:"stats-sections",style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'var(--s-4)'}},
    React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}},
      React.createElement("h4",{style:{fontSize:'var(--text-lg)',fontWeight:600,color:'var(--text-primary)',margin:0}},"Sections"),
      numX>0&&React.createElement("span",{style:{fontSize:'var(--text-sm)',color:'var(--text-tertiary)'}},complete+" / "+(sections?sections.length:0)+" complete")
    ),
    React.createElement("p",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',margin:'0 0 8px',lineHeight:1.4}},canEdit?"Click a section to see its threads · click again to rename":"Click a section to see its threads"),
    sections&&sections.length>0&&React.createElement("div",{className:"section-grid-scroll",tabIndex:0,role:"region","aria-label":"Sections grid"},
    React.createElement("div",{className:"section-grid",style:{display:'grid',gridTemplateColumns:'repeat('+numX+', minmax(3rem, 1fr))',gap:3,marginBottom:'var(--s-3)'}},
      sections.map(function(sec){
        var cellKey=sec.sx+','+sec.sy;
        var customLabel=sectionLabels[cellKey]||null;
        var isEditing=editingKey===cellKey;
        var isSelected=selectedKey===cellKey;
        var fs=12;
        return React.createElement("div",{
          key:sec.label,
          role:"button",
          tabIndex:isEditing?-1:0,
          className:"section-cell"+(isSelected?" section-cell--selected":""),
          style:{background:sec.isDone?'var(--success)':sectionColor(sec.pct),aspectRatio:'1',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',borderRadius:4,fontSize:fs,color:sec.pct>50?'var(--surface)':'var(--text-primary)',fontWeight:sec.isDone?700:400,cursor:'pointer',padding:1,overflow:'hidden',position:'relative',outlineOffset:1},
          "aria-label":(customLabel?customLabel+' ('+sec.pct+'%)':'Section '+sec.label+': '+sec.completed+'/'+sec.total+' ('+sec.pct+'%)')+(isSelected?' — selected':'')+(sec.isDone?' — complete':''),
          title:customLabel?customLabel+' ('+sec.pct+'%)':'Section '+sec.label+': '+sec.completed+'/'+sec.total+' ('+sec.pct+'%)',
          onClick:function(){
            if(isEditing)return;
            if(isSelected&&canEdit){setEditVal(customLabel||'');setEditingKey(cellKey);}
            else if(isSelected){setSelectedKey(null);setEditingKey(null);}
            else{setSelectedKey(cellKey);setEditingKey(null);}
          },
          onKeyDown:function(e){
            if(isEditing)return;
            if(e.key==='Enter'||e.key===' '){
              e.preventDefault();
              if(isSelected&&canEdit){setEditVal(customLabel||'');setEditingKey(cellKey);}
              else if(isSelected){setSelectedKey(null);setEditingKey(null);}
              else{setSelectedKey(cellKey);setEditingKey(null);}
            }
          }
        },
          isEditing
            ? React.createElement("input",{
                autoFocus:true,
                value:editVal,
                onChange:function(e){setEditVal(e.target.value);},
                onBlur:function(){commitLabel(cellKey);},
                onKeyDown:function(e){if(!canEdit)return;if(e.key==='Enter'){e.preventDefault();commitLabel(cellKey);}if(e.key==='Escape'){setEditingKey(null);}},
                style:{width:'90%',fontSize:Math.max(7,fs-1),padding:'1px 2px',border:'1px solid var(--border)',borderRadius:2,textAlign:'center',background:'var(--surface)',color:'var(--text-primary)'},
                onClick:function(e){e.stopPropagation();}
              })
            : [
                React.createElement("span",{key:'pct'},sec.pct+"%"),
                customLabel&&React.createElement("span",{key:'lbl',style:{fontSize:Math.max(6,fs-2),overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%',textAlign:'center',padding:'0 1px',opacity:0.9}},customLabel),
                sec.isDone&&!customLabel&&React.createElement("span",{key:'done'},window.Icons?window.Icons.check():null)
              ]
        );
      })
    )),
    sectionThreads&&React.createElement("div",{style:{marginBottom:'var(--s-3)',padding:10,background:'var(--surface-secondary)',borderRadius:'var(--radius-md)',border:'1px solid var(--accent-light)'}},
      React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}},
        React.createElement("span",{style:{fontSize:'var(--text-sm)',fontWeight:600,color:'var(--text-primary)'}},selectedLabel+' — threads'),
        React.createElement("button",{type:"button","aria-label":"Close section threads",onClick:function(){setSelectedKey(null);},style:{padding:'1px 8px',borderRadius:'var(--radius-sm)',border:'1px solid var(--accent-light)',background:'var(--surface-secondary)',cursor:'pointer',color:'var(--accent)',lineHeight:'18px',display:'inline-flex',alignItems:'center'}}, window.Icons&&window.Icons.x?window.Icons.x():null)
      ),
      sectionThreads.length===0
        ? React.createElement("p",{style:{fontSize:'var(--text-sm)',color:'var(--text-tertiary)',margin:0}},"No stitches in this section")
        : React.createElement("div",{style:{display:'flex',flexDirection:'column',gap:'var(--s-1)'}},
            sectionThreads.map(function(t){
              var cm=colourMap[t.id];
              var rgb=(cm&&cm.rgb)||[128,128,128];
              var remaining=t.total-t.doneCount;
              var pct=ProgressUnits.percent(t.doneCount,t.total);
              return React.createElement("div",{key:t.id,style:{display:'flex',alignItems:'center',gap:6}},
                React.createElement("span",{style:{width:12,height:12,borderRadius:2,background:'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')',border:'1px solid rgba(0,0,0,0.15)',flexShrink:0,display:'inline-block'}}),
                React.createElement("span",{title:formatThread(cm||t,{variant:"title"}),style:{fontSize:'var(--text-xs)',color:'var(--text-secondary)',minWidth:32,flexShrink:0}},formatThread(cm||t,{variant:"short"})),
                React.createElement("div",{style:{flex:1,height:6,background:'var(--border)',borderRadius:3,overflow:'hidden'}},
                  React.createElement("div",{style:{width:pct+'%',height:'100%',background:t.doneCount===t.total?'var(--success)':'var(--accent)',borderRadius:3}})
                ),
                React.createElement("span",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',flexShrink:0,minWidth:70,textAlign:'right'}},
                  remaining>0?(remaining.toLocaleString('en-GB')+' left'):'\u2713 done'
                )
              );
            })
          )
    ),
    sections&&sections.length===0&&React.createElement("p",{style:{fontSize:'var(--text-md)',color:'var(--text-tertiary)',margin:0}},"No pattern loaded"),
    React.createElement("div",{style:{display:'flex',alignItems:'center',gap:'var(--s-2)',flexWrap:'wrap',fontSize:'var(--text-sm)',color:'var(--text-tertiary)',marginTop:'var(--s-1)'}},
      "Section size:",
      React.createElement("input",{type:"number","aria-label":"Section width in stitches",min:5,max:200,value:secCols,disabled:!canEdit,onChange:function(e){if(!canEdit)return;var v=Math.max(5,Math.min(200,parseInt(e.target.value)||50));onUpdateSettings(Object.assign({},statsSettings,{sectionCols:v}));},style:{width:52,padding:'2px 6px',fontSize:'var(--text-sm)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)'}}),
      " by ",
      React.createElement("input",{type:"number","aria-label":"Section height in stitches",min:5,max:200,value:secRows,disabled:!canEdit,onChange:function(e){if(!canEdit)return;var v=Math.max(5,Math.min(200,parseInt(e.target.value)||50));onUpdateSettings(Object.assign({},statsSettings,{sectionRows:v}));},style:{width:52,padding:'2px 6px',fontSize:'var(--text-sm)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)'}}),
      "stitches",
      React.createElement("button",{type:"button",disabled:!canEdit,onClick:function(){if(!canEdit)return;onUpdateSettings(Object.assign({},statsSettings,{sectionCols:50,sectionRows:50}));},style:{fontSize:'var(--text-xs)',padding:'2px 8px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',background:'var(--surface-secondary)',cursor:canEdit?'pointer':'default',color:'var(--text-tertiary)',opacity:canEdit?1:0.6}},"Reset")
    )
  );
}

// ═══ Visual Progress: Before/After comparison ═══
function ComparisonView({doneSnapshots, setDoneSnapshots, done, pat, sW, sH, canEdit}){
  var editable=canEdit!==false&&typeof setDoneSnapshots==='function';
  var selSt=React.useState(null);var selectedId=selSt[0],setSelectedId=selSt[1];
  var diffSt=React.useState(false);var showDiff=diffSt[0],setShowDiff=diffSt[1];
  var labelSt=React.useState('');var labelText=labelSt[0],setLabelText=labelSt[1];
  var leftCanvasRef=React.useRef(null);
  var rightCanvasRef=React.useRef(null);
  var diffCanvasRef=React.useRef(null);

  var snap=selectedId?(doneSnapshots||[]).find(function(s){return s.id===selectedId;}):null;

  React.useEffect(function(){
    if(selectedId&&!snap)setSelectedId(null);
  },[selectedId,snap]);

  function deleteSnapshot(){
    if(!editable||!snap)return;
    if(!window.confirm('Delete this snapshot? This cannot be undone.'))return;
    var id=snap.id;
    setDoneSnapshots(function(prev){return prev.filter(function(s){return s.id!==id;});});
    setSelectedId(null);
  }
  function deleteAutomaticSnapshots(){
    if(!editable||!(doneSnapshots||[]).some(function(s){return s.label==='auto'&&s.kind!=='manual';}))return;
    if(!window.confirm('Delete all automatic snapshots? Manual and Before pattern change snapshots will be kept. This cannot be undone.'))return;
    setDoneSnapshots(function(prev){return prev.filter(function(s){return s.label!=='auto'||s.kind==='manual';});});
    if(snap&&snap.label==='auto'&&snap.kind!=='manual')setSelectedId(null);
  }

  function uint8ToBase64(bytes){
    var CHUNK=0x8000,out='';
    for(var i=0;i<bytes.length;i+=CHUNK)out+=String.fromCharCode.apply(null,bytes.subarray(i,i+CHUNK));
    return btoa(out);
  }

  function decompressSnap(data){
    try{
      var binary=atob(data);var bytes=new Uint8Array(binary.length);
      for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      return pako.inflate(bytes);
    }catch(e){return null;}
  }

  function snapLabel(s){
    if(s.label!=='auto'||s.kind==='manual')return s.label;
    var today=new Date().toISOString().slice(0,10);
    var days=Math.round((new Date(today)-new Date(s.date))/86400000);
    if(days===0)return'Today ('+s.date+')';
    if(days===1)return'Yesterday';
    if(days<14)return days+' days ago';
    var weeks=Math.round(days/7);
    if(weeks<8)return weeks+' week'+(weeks>1?'s':'')+' ago';
    return s.date;
  }

  React.useEffect(function(){
    if(!pat||!sW||!sH||!rightCanvasRef.current)return;
    renderComparisonCanvas(rightCanvasRef.current,pat,sW,sH,done);
  },[done,pat,sW,sH]);

  React.useEffect(function(){
    if(!pat||!sW||!sH)return;
    [leftCanvasRef.current,diffCanvasRef.current].forEach(function(canvas){
      if(canvas){var ctx=canvas.getContext('2d');if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);}
    });
    var snapDone=snap?decompressSnap(snap.data):null;
    // A snapshot from before the pattern changed size cannot be drawn on today's grid.
    if(snapDone&&snapSizeDiffers(snap,snapDone,pat,sW,sH))return;
    if(snapDone&&leftCanvasRef.current)renderComparisonCanvas(leftCanvasRef.current,pat,sW,sH,snapDone);
    if(snapDone&&showDiff&&diffCanvasRef.current)renderDiffCanvas(diffCanvasRef.current,pat,sW,sH,snapDone,done||new Uint8Array(pat.length));
  },[snap,done,pat,sW,sH,showDiff]);

  // A snapshot made when the pattern had another size cannot be drawn on this grid. The size stored with the
  // snapshot decides (10x20 and 20x10 have the same number of cells); older snapshots have none, so their
  // length is compared instead.
  function snapSizeDiffers(sn,snapDone,patArr,w,h){
    if(sn&&sn.w&&sn.h&&(sn.w!==w||sn.h!==h))return true;
    return snapDone.length!==patArr.length;
  }

  function saveManualSnapshot(){
    if(!editable||!done||!pat)return;
    var l=labelText.trim()||'Snapshot';
    try{
      var data=uint8ToBase64(pako.deflate(new Uint8Array(done)));
      var today=new Date().toISOString().slice(0,10);
      var doneCount=0;for(var i=0;i<done.length;i++)if(done[i])doneCount++;
      var newSnap={id:'snap_'+Date.now(),date:today,label:l,kind:'manual',doneCount:doneCount,w:sW,h:sH,data:data};
      setDoneSnapshots(function(prev){
        var updated=[...prev,newSnap];
        var labelled=updated.filter(function(s){return s.label!=='auto'||s.kind==='manual';});
        var autos=updated.filter(function(s){return s.label==='auto'&&s.kind!=='manual';}).slice(-60);
        return[...labelled,...autos];
      });
      setLabelText('');
    }catch(e){
      console.warn('Snapshot save error',e);
      try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not save snapshot \u2014 try again.', type: 'error'}); } catch(_){}
    }
  }

  var snapDone=snap?decompressSnap(snap.data):null;
  var newCount=done?Array.from(done).filter(function(v){return v;}).length:0;
  var oldCount=snapDone?Array.from(snapDone).filter(function(v){return v;}).length:0;
  var diff=newCount-oldCount;
  var sizeMismatch=!!(snapDone&&pat&&snapSizeDiffers(snap,snapDone,pat,sW,sH));

  var hasPattern=!!(pat&&pat.length&&sW>0&&sH>0);
  var canvasStyle={border:'1px solid var(--border)',borderRadius:4,background:'var(--surface-secondary)',width:hasPattern?'min(100%, '+(28*sW/sH)+'rem)':'100%',height:'auto',aspectRatio:hasPattern?sW+'/'+sH:'1',display:'block',margin:'0 auto'};

  return React.createElement("div",{className:"stats-comparison",style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'var(--s-4)'}},
    React.createElement("h4",{style:{fontSize:'var(--text-lg)',fontWeight:600,color:'var(--text-primary)',margin:'0 0 10px'}},"Before / After Comparison"),
    React.createElement("div",{style:{display:'flex',gap:'var(--s-2)',marginBottom:10,flexWrap:'wrap',alignItems:'center'}},
      React.createElement("select",{value:selectedId||'',"aria-label":"Snapshot to compare with",onChange:function(e){setSelectedId(e.target.value||null);},style:{fontSize:'var(--text-sm)',padding:'4px 8px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',flex:'1',minWidth:0}},
        React.createElement("option",{value:''},"Select a snapshot to compare\u2026"),
        (doneSnapshots||[]).slice().reverse().map(function(s){
          return React.createElement("option",{key:s.id,value:s.id},snapLabel(s)+(s.doneCount?' \u2014 '+s.doneCount+' stitches':''));
        })
      ),
      React.createElement("label",{style:{display:'flex',alignItems:'center',gap:'var(--s-1)',fontSize:'var(--text-sm)',color:'var(--text-tertiary)',cursor:'pointer',flexShrink:0}},
        React.createElement("input",{type:'checkbox',checked:showDiff,onChange:function(e){setShowDiff(e.target.checked);}}),
        "Diff view"
      )
    ),
    snap&&!snapDone&&React.createElement("p",{role:"status",className:"stats-empty"},"This snapshot could not be read. Choose another snapshot."),
    snap&&sizeMismatch&&React.createElement("div",{role:"status",style:{fontSize:'var(--text-sm)',color:'var(--text-secondary)',marginBottom:'var(--s-2)'}},
      "This snapshot ("+snap.date+", "+oldCount+" stitches) was taken before the pattern changed size, so it cannot be drawn or compared with the pattern as it is now."
    ),
    snap&&snapDone&&!sizeMismatch&&React.createElement("div",{style:{fontSize:'var(--text-sm)',color:'var(--text-tertiary)',marginBottom:'var(--s-2)'}},
      "Since "+snap.date+": ",
      React.createElement("strong",{style:{color:diff>=0?'var(--success)':'var(--danger)'}},(diff>=0?'+':'')+diff+" stitches")
    ),
    hasPattern?React.createElement("div",{className:"comparison-previews"},
      React.createElement("div",{className:"comparison-preview"},
        React.createElement("div",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',marginBottom:'var(--s-1)'}},snap?snapLabel(snap):'Select snapshot'),
        React.createElement("canvas",{ref:leftCanvasRef,role:"img","aria-label":snap?("Snapshot from "+snap.date):"Snapshot (none selected)",width:sW||1,height:sH||1,style:canvasStyle})
      ),
      showDiff&&snap&&snapDone&&!sizeMismatch&&React.createElement("div",{className:"comparison-preview"},
        React.createElement("div",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',marginBottom:'var(--s-1)'}},"New stitches"),
        React.createElement("canvas",{ref:diffCanvasRef,role:"img","aria-label":"Changes since snapshot",width:sW||1,height:sH||1,style:canvasStyle})
      ),
      React.createElement("div",{className:"comparison-preview"},
        React.createElement("div",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',marginBottom:'var(--s-1)'}},"Now"),
        React.createElement("canvas",{ref:rightCanvasRef,role:"img","aria-label":"Current progress",width:sW||1,height:sH||1,style:canvasStyle})
      )
    ):React.createElement('p',{className:'stats-empty'},'No pattern loaded.'),
    React.createElement("div",{style:{marginTop:'var(--s-3)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},
      React.createElement("input",{"aria-label":"Snapshot label",type:'text',disabled:!editable,value:labelText,onChange:function(e){setLabelText(e.target.value);},placeholder:'Snapshot label (optional)',style:{flex:1,minWidth:120,fontSize:'var(--text-sm)',padding:'4px 8px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)'}}),
      React.createElement("button",{type:"button",onClick:saveManualSnapshot,disabled:!editable||!hasPattern||!done,style:{fontSize:'var(--text-sm)',padding:'4px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--accent-border)',background:'var(--surface-secondary)',cursor:'pointer',color:'var(--accent-hover)',fontWeight:600,flexShrink:0,display:'flex',alignItems:'center',gap:'6px'}}, Icons.camera(), "Save snapshot")
    ),
    React.createElement("div",{style:{marginTop:'var(--s-3)',display:'flex',gap:6,flexWrap:'wrap'}},
      React.createElement("button",{type:"button",className:"stats-export-btn",disabled:!editable||!snap,onClick:deleteSnapshot},"Delete snapshot"),
      React.createElement("button",{type:"button",className:"stats-export-btn",disabled:!editable||!(doneSnapshots||[]).some(function(s){return s.label==='auto'&&s.kind!=='manual';}),onClick:deleteAutomaticSnapshots},"Delete all automatic snapshots")
    ),
    React.createElement("p",{style:{fontSize:'var(--text-sm)',color:'var(--text-tertiary)'}},"Automatic daily Compare snapshots are off by default. Enable them in Preferences > Stitch Tracker. Manual and Before pattern change snapshots are kept when deleting all automatic snapshots."),
    (!(doneSnapshots||[]).length)&&React.createElement("p",{style:{fontSize:'var(--text-sm)',color:'var(--text-tertiary)',margin:'8px 0 0'}},editable?"No snapshots yet. Save a snapshot to compare your progress later, or enable automatic daily Compare snapshots in Preferences > Stitch Tracker.":"No snapshots yet. Open this project in the Tracker to save snapshots or manage its history.")
  );
}

function ProjectComparison({currentProjectId, onClose, onOpenProject}) {
  var projectsSt = React.useState([]);
  var projects = projectsSt[0], setProjects = projectsSt[1];
  var sortKeySt = React.useState('updatedAt');
  var sortKey = sortKeySt[0], setSortKey = sortKeySt[1];
  var sortDirSt = React.useState('desc');
  var sortDir = sortDirSt[0], setSortDir = sortDirSt[1];
  var showAllSt = React.useState(false);
  var showAll = showAllSt[0], setShowAll = showAllSt[1];

  React.useEffect(function() {
    if (typeof ProjectStorage !== 'undefined') {
      ProjectStorage.listProjects().then(setProjects).catch(function() { setProjects([]); });
    }
  }, []);

  if (projects.length < 2) return null;

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(function(d) { return d === 'asc' ? 'desc' : 'asc'; });
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  var sorted = projects.slice().sort(function(a, b) {
    var av, bv;
    if (sortKey === 'name') {
      av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase();
      return sortDir === 'asc' ? av < bv ? -1 : av > bv ? 1 : 0 : av > bv ? -1 : av < bv ? 1 : 0;
    }
    if (sortKey === 'pct') {
      av = a.totalStitches > 0 ? a.completedStitches / a.totalStitches : 0;
      bv = b.totalStitches > 0 ? b.completedStitches / b.totalStitches : 0;
    } else if (sortKey === 'totalStitches') {
      av = a.totalStitches || 0; bv = b.totalStitches || 0;
    } else if (sortKey === 'stitchesPerHour') {
      av = a.stitchesPerHour || 0; bv = b.stitchesPerHour || 0;
    } else if (sortKey === 'totalMinutes') {
      av = a.totalMinutes || 0; bv = b.totalMinutes || 0;
    } else if (sortKey === 'uniqueActiveDays') {
      av = a.uniqueActiveDays || 0; bv = b.uniqueActiveDays || 0;
    } else {
      av = new Date(a.updatedAt || 0).getTime(); bv = new Date(b.updatedAt || 0).getTime();
    }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  var sortedByPct = projects.slice().sort(function(a, b) {
    var ap = a.totalStitches > 0 ? a.completedStitches / a.totalStitches : 0;
    var bp = b.totalStitches > 0 ? b.completedStitches / b.totalStitches : 0;
    return bp - ap;
  });
  var barProjects = showAll ? sortedByPct : sortedByPct.slice(0, 6);

  function fmtTime(minutes) {
    if (!minutes) return '\u2014';
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    if (h === 0) return m + 'm';
    return h + 'h ' + (m > 0 ? m + 'm' : '');
  }

  function relativeDate(iso) {
    if (!iso) return '\u2014';
    var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return diff + ' days ago';
    if (diff < 14) return '1 week ago';
    if (diff < 30) return Math.floor(diff / 7) + ' weeks ago';
    if (diff < 60) return '1 month ago';
    return Math.floor(diff / 30) + ' months ago';
  }

  var incomplete = projects.filter(function(p) { return p.completedStitches < p.totalStitches; });
  var fastest = projects.filter(function(p) { return p.stitchesPerHour > 0; }).slice().sort(function(a, b) { return b.stitchesPerHour - a.stitchesPerHour; })[0] || null;
  var largest = projects.slice().sort(function(a, b) { return (b.totalStitches || 0) - (a.totalStitches || 0); })[0] || null;
  var closestToDone = incomplete.slice().sort(function(a, b) { return (a.totalStitches - a.completedStitches) - (b.totalStitches - b.completedStitches); })[0] || null;
  var mostNeglected = incomplete.slice().sort(function(a, b) { return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0); })[0] || null;

  var thSt = function(key) {
    return {cursor:'pointer', padding:'8px 10px', fontSize:'var(--text-sm)', fontWeight:600, color: sortKey === key ? 'var(--accent)' : 'var(--text-tertiary)', userSelect:'none', whiteSpace:'nowrap'};
  };

  function SortArrow(key) {
    if (sortKey !== key) return null;
    return React.createElement('span', {style:{marginLeft:3, fontSize:10}}, sortDir === 'asc' ? '\u25B2' : '\u25BC');
  }

  return React.createElement('div', {className:'project-comparison'},
    React.createElement('div', {className:'comparison-header'},
      React.createElement('h3', {style:{margin:0, fontSize:'var(--text-xl)', fontWeight:700, color:'var(--text-primary)'}}, 'My Projects (' + projects.length + ')'),
      React.createElement('button', {onClick: onClose, style:{fontSize:'var(--text-md)', padding:'4px 14px', borderRadius:'var(--radius-md)', border:'1px solid var(--border)', background:'var(--surface-secondary)', cursor:'pointer', color:'var(--text-secondary)'}}, '\u2190 Back to stats')
    ),

    React.createElement('div', {className:'comparison-bars'},
      barProjects.map(function(p) {
        var pct = p.pct != null ? p.pct : (p.totalStitches > 0 ? ProgressUnits.percent(p.completedStitches,p.totalStitches) : 0);
        var isComplete = pct >= 100;
        var isCurrent = p.id === currentProjectId;
        return React.createElement('div', {
          key: p.id,
          className: 'comparison-bar-row' + (isCurrent ? ' current' : ''),
          onClick: function() { if (onOpenProject) onOpenProject(p); }
        },
          React.createElement('span', {className:'comparison-name', title: p.name}, p.name),
          React.createElement('div', {className:'comparison-track'},
            React.createElement('div', {className:'comparison-fill' + (isComplete ? ' complete' : ''), style:{width: Math.min(100, pct) + '%'}})
          ),
          React.createElement('span', {className:'comparison-pct'}, isComplete ? '\u2713 100%' : pct + '%')
        );
      }),
      !showAll && projects.length > 6 && React.createElement('button', {
        onClick: function() { setShowAll(true); },
        style:{marginTop:6, fontSize:'var(--text-sm)', padding:'4px 12px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', background:'var(--surface-secondary)', cursor:'pointer', color:'var(--text-tertiary)'}
      }, 'Show all ' + projects.length + ' projects')
    ),

    React.createElement('div', {style:{overflowX:'auto', marginTop:'var(--s-4)'}},
      React.createElement('table', {className:'comparison-table'},
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', {style:thSt('name'), onClick:function(){toggleSort('name');}}, 'Project', SortArrow('name')),
            React.createElement('th', {style:thSt('totalStitches'), onClick:function(){toggleSort('totalStitches');}}, 'Size', SortArrow('totalStitches')),
            React.createElement('th', {style:thSt('pct'), onClick:function(){toggleSort('pct');}}, 'Progress', SortArrow('pct')),
            React.createElement('th', {style:thSt('stitchesPerHour'), onClick:function(){toggleSort('stitchesPerHour');}}, 'Speed', SortArrow('stitchesPerHour')),
            React.createElement('th', {style:thSt('totalMinutes'), onClick:function(){toggleSort('totalMinutes');}}, 'Time', SortArrow('totalMinutes')),
            React.createElement('th', {style:thSt('uniqueActiveDays'), onClick:function(){toggleSort('uniqueActiveDays');}}, 'Active Days', SortArrow('uniqueActiveDays')),
            React.createElement('th', {style:thSt('updatedAt'), onClick:function(){toggleSort('updatedAt');}}, 'Last Worked', SortArrow('updatedAt'))
          )
        ),
        React.createElement('tbody', null,
          sorted.map(function(p) {
            var pct = p.pct != null ? p.pct : (p.totalStitches > 0 ? ProgressUnits.percent(p.completedStitches,p.totalStitches) : 0);
            var isComplete = pct >= 100;
            var isCurrent = p.id === currentProjectId;
            var w = p.dimensions ? p.dimensions.width : 0;
            var h = p.dimensions ? p.dimensions.height : 0;
            return React.createElement('tr', {
              key: p.id,
              className: 'comparison-row' + (isCurrent ? ' current' : ''),
              onClick: function() { if (onOpenProject) onOpenProject(p); }
            },
              React.createElement('td', {style:{padding:'8px 10px', fontSize:'var(--text-md)', fontWeight: isCurrent ? 700 : 400, color:'var(--text-primary)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}},
                p.name,
                isComplete && React.createElement('span', {style:{marginLeft:6, fontSize:'var(--text-xs)', color:'var(--success)', fontWeight:600}}, '\u2713 Complete'),
                isCurrent && !isComplete && React.createElement('span', {style:{marginLeft:6, fontSize:10, color:'var(--accent)', background:'var(--accent-light)', padding:'1px 6px', borderRadius:4, border:'1px solid var(--accent-border)', fontWeight:600}}, 'current')
              ),
              React.createElement('td', {style:{padding:'8px 10px', fontSize:'var(--text-sm)', color:'var(--text-tertiary)', whiteSpace:'nowrap'}},
                w && h ? (w + '\u00D7' + h + ' \u2014 ' + (p.totalStitches || 0).toLocaleString('en-GB') + ' st') : ((p.totalStitches || 0).toLocaleString('en-GB') + ' st')
              ),
              React.createElement('td', {style:{padding:'8px 10px', fontSize:'var(--text-sm)', whiteSpace:'nowrap'}},
                React.createElement('span', {style:{color: isComplete ? 'var(--success)' : pct >= 50 ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight:600}}, pct + '%'),
                React.createElement('span', {style:{color:'#CFC4AC', fontSize:'var(--text-xs)', marginLeft:'var(--s-1)'}}, '(' + (p.completedStitches||0).toLocaleString('en-GB') + '/' + (p.totalStitches||0).toLocaleString('en-GB') + ')')
              ),
              React.createElement('td', {style:{padding:'8px 10px', fontSize:'var(--text-sm)', color:'var(--text-tertiary)', whiteSpace:'nowrap'}}, p.stitchesPerHour ? p.stitchesPerHour.toLocaleString('en-GB') + ' st/hr' : '\u2014'),
              React.createElement('td', {style:{padding:'8px 10px', fontSize:'var(--text-sm)', color:'var(--text-tertiary)', whiteSpace:'nowrap'}}, fmtTime(p.totalMinutes)),
              React.createElement('td', {style:{padding:'8px 10px', fontSize:'var(--text-sm)', color:'var(--text-tertiary)', whiteSpace:'nowrap'}}, p.uniqueActiveDays || '\u2014'),
              React.createElement('td', {style:{padding:'8px 10px', fontSize:'var(--text-sm)', color:'var(--text-tertiary)', whiteSpace:'nowrap'}}, relativeDate(p.updatedAt))
            );
          })
        )
      )
    ),

    React.createElement('div', {className:'comparison-insights'},
      fastest && React.createElement('div', {className:'comparison-insight-card'},
        React.createElement('span', {className:'comparison-insight-icon'}, '\uD83C\uDFC6'),
        React.createElement('span', null, React.createElement('strong', null, 'Fastest: '), fastest.name + ' (' + fastest.stitchesPerHour.toLocaleString('en-GB') + ' st/hr)')
      ),
      largest && React.createElement('div', {className:'comparison-insight-card'},
        React.createElement('span', {className:'comparison-insight-icon'}, Icons.clipboard()),
        React.createElement('span', null, React.createElement('strong', null, 'Largest: '), largest.name + ' (' + (largest.totalStitches||0).toLocaleString('en-GB') + ' stitches)')
      ),
      closestToDone && React.createElement('div', {className:'comparison-insight-card'},
        React.createElement('span', {className:'comparison-insight-icon'}, Icons.hourglass()),
        React.createElement('span', null, React.createElement('strong', null, 'Closest to done: '), closestToDone.name + ' (' + ((closestToDone.totalStitches||0) - (closestToDone.completedStitches||0)).toLocaleString('en-GB') + ' remaining)')
      ),
      mostNeglected && React.createElement('div', {className:'comparison-insight-card'},
        React.createElement('span', {className:'comparison-insight-icon'}, Icons.sleep()),
        React.createElement('span', null, React.createElement('strong', null, 'Longest companion: '), mostNeglected.name + ' (last worked ' + relativeDate(mostNeglected.updatedAt).toLowerCase() + ')') 
      )
    )
  );
}

// ═══ PNG Progress Card drawing ═══
function drawProgressCard(canvas, opts) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, H - 24, W, 24);
  // Header
  ctx.fillStyle = 'var(--accent-hover)';
  ctx.fillRect(0, 0, W, 62);
  // Project name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  var name = String(opts.projectName || 'My Pattern');
  ctx.font = 'bold 18px system-ui, sans-serif';
  while (name.length > 4 && ctx.measureText(name).width > W - 130) name = name.slice(0, -1);
  if (name !== String(opts.projectName || 'My Pattern')) name += '\u2026';
  ctx.fillText(name, 18, 26);
  ctx.textAlign = 'right';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(String(opts.percent || 0) + '%', W - 18, 26);
  // Progress bar
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(18, 46, W - 36, 9);
  ctx.fillStyle = '#A8C594';
  var barW = Math.round((W - 36) * Math.min(1, (opts.percent || 0) / 100));
  if (barW > 0) ctx.fillRect(18, 46, barW, 9);
  // Stats grid
  var stats = [
    {label: 'Time stitched' + (opts.timeIsEstimated ? ' (est.)' : ''), value: opts.totalTimeFormatted || '\u2014'},
    {label: 'Sessions', value: String((opts.sessions || []).length)},
    {label: 'Per stitching day', value: String(opts.avgPerDay || 0)},
    {label: 'Weeks in a row', value: String(opts.streak || 0)}
  ];
  if (opts.streak == null) stats.pop();      // streaks are turned off: the picture has no streak
  var colW = (W - 36) / stats.length;
  for (var i = 0; i < stats.length; i++) {
    var sx = 18 + colW * i + colW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'var(--accent-hover)';
    ctx.font = 'bold 21px system-ui, sans-serif';
    ctx.fillText(stats[i].value, sx, 108);
    ctx.fillStyle = 'var(--text-tertiary)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(stats[i].label, sx, 124);
  }
  // Separator
  ctx.strokeStyle = 'var(--border)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(18, 136);
  ctx.lineTo(W - 18, 136);
  ctx.stroke();
  // Colour swatches
  ctx.fillStyle = 'var(--text-tertiary)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Colours:', 18, 161);
  if (opts.palette) {
    var cols = opts.palette.filter(function(p){ return p.id !== '__skip__' && p.id !== '__empty__'; }).slice(0, 14);
    for (var ci = 0; ci < cols.length; ci++) {
      var rgb = cols[ci].rgb || [128, 128, 128];
      ctx.beginPath();
      ctx.arc(80 + ci * 21, 161, 7, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }
  // Footer
  ctx.fillStyle = 'var(--text-tertiary)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Made with stitchx', W - 18, H - 7);
}

// A group of the Stats page that starts closed: a native details element, so it works from the keyboard and with a
// screen reader, and remembers (in this browser only) whether it was left open. Its contents are only built while open.
function StatsAccordion(props){
  var h = React.createElement;
  var key = 'cs_stats_acc_' + props.id;
  var init = false;
  try { init = localStorage.getItem(key) === '1'; } catch (e) {}
  var st = React.useState(init);
  var open = st[0], setOpen = st[1];
  return h('details', {className:'stats-accordion', open:open, onToggle:function(e){
      var o = e.currentTarget.open;
      if (o !== open) { setOpen(o); try { localStorage.setItem(key, o ? '1' : '0'); } catch (err) {} }
    }},
    h('summary', {className:'stats-accordion-summary'}, props.title),
    open ? h('div', {className:'stats-accordion-body'}, props.children) : null
  );
}

function StatsDashboard({statsSessions, statsSettings, totalCompleted, totalStitches, halfStitchCounts, onEditNote, onEditSession, onDeleteSession, onMergeSession, onUpdateSettings, onClose, projectName, onShareProgress, onExportCSV, palette, colourDoneCounts, achievedMilestones, done, pat, sW, sH, doneSnapshots, setDoneSnapshots, sections, currentProjectId, onOpenProject, canEdit}){
  if(canEdit==null)canEdit=true;
  var chartSt = React.useState('cumulative');
  var chartView = chartSt[0], setChartView = chartSt[1];
  var copiedSt = React.useState(false);
  var copied = copiedSt[0], setCopied = copiedSt[1];
  var showCompSt = React.useState(false);
  var showComparison = showCompSt[0], setShowComparison = showCompSt[1];
  var hasMultiSt = React.useState(false);
  var hasMultiProjects = hasMultiSt[0], setHasMultiProjects = hasMultiSt[1];
  var cardCanvasRef = React.useRef(null);
  // Overview (numbers, chart, goals, sessions) or Visuals (sections, comparison, colour charts). Remembered between visits.
  var viewSt = React.useState(function() { try { return localStorage.getItem('cs_stats_view') === 'visuals' ? 'visuals' : 'overview'; } catch (e) { return 'overview'; } });
  var view = viewSt[0], setViewRaw = viewSt[1];
  function setView(v) { setViewRaw(v); try { localStorage.setItem('cs_stats_view', v); } catch (e) {} }
  var mot = useMotivationPrefs();     // streaks, goals and celebrations on or off (Preferences)
  React.useEffect(function() {
    if (typeof ProjectStorage !== 'undefined') {
      ProjectStorage.listProjects().then(function(list) { setHasMultiProjects(list.length >= 2); }).catch(function(){});
    }
  }, []);
  var overviewStats = computeOverviewStats(statsSessions || [], totalCompleted, totalStitches);
  var milestones = getMilestones(statsSessions || [], totalCompleted, totalStitches, overviewStats.estimate);
  var dayEndHour = getDayEndHour(statsSettings);
  var timingMode = (statsSettings && typeof statsSettings.timingMode === 'string') ? statsSettings.timingMode : '';
  // With goals hidden, the charts draw no goal line and no target pace either.
  var chartSettings = mot.show ? statsSettings : Object.assign({}, statsSettings, {dailyGoal: null, weeklyGoal: null, monthlyGoal: null, targetDate: null});

  if (showComparison) {
    return React.createElement(ProjectComparison, {
      currentProjectId: currentProjectId,
      onClose: function() { setShowComparison(false); },
      onOpenProject: onOpenProject
    });
  }

  function handleShare(){
    var text = generateShareText(projectName, overviewStats, statsSessions || [], totalCompleted, totalStitches, dayEndHour, {showStreaks: mot.show, showDaily: mot.daily});
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function(){
        setCopied(true); setTimeout(function(){ setCopied(false); }, 2500);
      }).catch(function(){
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text){
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
    setCopied(true); setTimeout(function(){ setCopied(false); }, 2500);
  }

  function handleCSV(){
    downloadCSV(statsSessions || [], projectName);
  }

  function handleExportCard() {
    var canvas = cardCanvasRef.current;
    if (!canvas) return;
    var streakInfo = computeWeeklyStreaks(statsSessions || [], dayEndHour);
    drawProgressCard(canvas, {
      projectName: projectName,
      percent: overviewStats.percent,
      totalTimeFormatted: overviewStats.totalTimeFormatted,
      timeIsEstimated: overviewStats.timeIsEstimated,
      sessions: statsSessions || [],
      // the pace everywhere else: stitches per stitching day over the last 4 weeks (the average per active day until there is one)
      avgPerDay: overviewStats.recentPace || overviewStats.avgPerActiveDay,
      streak: mot.show ? streakInfo.current : null,
      palette: palette
    });
    canvas.toBlob(function(blob) {
      if(!blob)return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = ((projectName || 'pattern').replace(/[^a-z0-9]/gi, '_') || 'pattern') + '-progress.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revocation to give Safari time to start the download before the
      // Blob URL is invalidated.
      setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
    },'image/png');
  }

  return React.createElement("div", {className:"stats-dashboard"},
    React.createElement("canvas", {ref:cardCanvasRef, width:600, height:185, style:{display:'none'}}),
    React.createElement("div", {style:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'var(--s-4)', gap:'var(--s-2)', flexWrap:'wrap'}},
      React.createElement("h2", {style:{fontSize:20, fontWeight:700, color:'var(--text-primary)', margin:0, display:'flex', alignItems:'center', gap:'8px'}}, Icons.barChart(), "Stats"),
      React.createElement("div", {style:{display:'flex', gap:'var(--s-2)', flexWrap:'wrap'}},
        hasMultiProjects && React.createElement("button", {type:"button",onClick:function(){setShowComparison(true);}, style:{fontSize:'var(--text-md)', padding:'4px 14px', borderRadius:'var(--radius-md)', border:'1px solid var(--accent-border)', background:'var(--accent-light)', cursor:'pointer', color:'var(--accent)', fontWeight:600, display:'flex', alignItems:'center', gap:'6px'}}, Icons.barChart(), "Compare projects"),
        React.createElement("button", {type:"button",onClick:onClose, style:{fontSize:'var(--text-md)', padding:'4px 14px', borderRadius:'var(--radius-md)', border:'1px solid var(--border)', background:'var(--surface-secondary)', cursor:'pointer', color:'var(--text-secondary)'}}, "\u2190 Back to grid")
      )
    ),
    React.createElement("div", {className:"stats-viewtabs", role:"tablist", "aria-label":"Stats view"},
      React.createElement("button", {type:"button", role:"tab", "aria-selected":view==="overview", className:"stats-viewtab"+(view==="overview"?" stats-viewtab--on":""), onClick:function(){setView("overview");}}, "Overview"),
      React.createElement("button", {type:"button", role:"tab", "aria-selected":view==="visuals", className:"stats-viewtab"+(view==="visuals"?" stats-viewtab--on":""), onClick:function(){setView("visuals");}}, "Visuals")
    ),
    view === "visuals" ? React.createElement("div", {className:"bento"},
    React.createElement("div", {className:"bento-cell bento-cell--xl"},
      React.createElement(SectionGrid, {sections:sections||[], statsSettings:statsSettings, onUpdateSettings:onUpdateSettings, pat:pat, done:done, sW:sW, palette:palette, canEdit:canEdit})),
    React.createElement("div", {className:"bento-cell bento-cell--md"}, React.createElement(ColourProgress, {palette:palette, colourDoneCounts:colourDoneCounts, sessions:statsSessions})),
    React.createElement("div", {className:"bento-cell bento-cell--lg"}, React.createElement(ComparisonView, {doneSnapshots:doneSnapshots||[], setDoneSnapshots:setDoneSnapshots, done:done, pat:pat, sW:sW, sH:sH, canEdit:canEdit}))
    ) :
    React.createElement("div", {className:"bento"},
    React.createElement("div", {className:"bento-cell bento-cell--lg"},
      React.createElement(OverviewCards, {statsSessions:statsSessions, totalCompleted:totalCompleted, totalStitches:totalStitches, halfStitchCounts:halfStitchCounts, todayStitches:getStatsTodayStitches(statsSessions || [], dayEndHour), weekStitches:getStatsThisWeekStitches(statsSessions || [], dayEndHour)}),
    React.createElement("div", {className:"stats-export-bar"},
      React.createElement("button", {type:"button",className:"stats-export-btn stats-export-btn--share", onClick:handleShare, style:{display:'flex', alignItems:'center', gap:'6px'}},
        copied ? [Icons.check(), ' Copied!'] : [Icons.clipboard(), ' Copy progress summary']),
      React.createElement("button", {type:"button",className:"stats-export-btn", onClick:handleCSV, style:{display:'flex', alignItems:'center', gap:'6px'}},
        Icons.document(), ' Export sessions (CSV)'),
      React.createElement("button", {type:"button",className:"stats-export-btn", onClick:handleExportCard, style:{display:'flex', alignItems:'center', gap:'6px'}},
        Icons.camera(), ' Save as image')
    )
    ),
    React.createElement("div", {className:"bento-cell bento-cell--md bento-cell--stack"},
    React.createElement(StreaksPanel, {sessions:statsSessions, dayEndHour:dayEndHour, showStreaks:mot.show, showDaily:mot.daily}),
    React.createElement(MilestoneTracker, {milestones:milestones, achievedMilestones:achievedMilestones})
    ),
    React.createElement("div", {className:"bento-cell bento-cell--xl"},
      React.createElement(StatsChartSection, {statsSessions:statsSessions, statsSettings:chartSettings, totalStitches:totalStitches, chartView:chartView, setChartView:setChartView, overviewStats:overviewStats, totalCompleted:totalCompleted})
    ),
    mot.show && React.createElement("div", {className:"bento-cell bento-cell--md"}, React.createElement(GoalTracker, {statsSettings:statsSettings, statsSessions:statsSessions, totalCompleted:totalCompleted, totalStitches:totalStitches, overviewStats:overviewStats, onUpdateSettings:onUpdateSettings})),
    React.createElement("div", {className:"bento-cell bento-cell--lg"},
      React.createElement(SessionTimeline, {sessions:statsSessions, statsSettings:statsSettings, onEditNote:onEditNote, palette:palette, canEdit:canEdit, onEditSession:onEditSession, onDeleteSession:onDeleteSession, onMergeSession:onMergeSession})
    ),
    React.createElement("div", {className:"bento-cell bento-cell--md bento-cell--stack"},
    React.createElement(StatsAccordion, {id:"settings", title:"Settings"},
      React.createElement("div", null,
        !mot.show && React.createElement(DayEndSetting, {statsSettings:statsSettings, onUpdateSettings:onUpdateSettings}),
        React.createElement("label", {style:{display:'flex', alignItems:'center', gap:'var(--s-2)', flexWrap:'wrap', fontSize:'var(--text-md)', color:'var(--text-secondary)'}},
          "Session timing:",
          React.createElement("select", {value:timingMode, "aria-label":"Session timing for this project", onChange:function(e){ onUpdateSettings(Object.assign({}, statsSettings, {timingMode:e.target.value || null})); }, style:{fontSize:'var(--text-sm)', padding:'4px 8px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)', minHeight:36}},
            React.createElement("option", {value:''}, "Use global default"),
            React.createElement("option", {value:'classic'}, "Classic"),
            React.createElement("option", {value:'batchAware'}, "Batch-friendly"),
            React.createElement("option", {value:'manual'}, "Manual timer")
          )
        ),
        React.createElement("p", {style:{fontSize:'var(--text-xs)', color:'var(--text-secondary)', margin:'4px 0 0'}}, timingMode ? "This project overrides the global tracker timing mode." : "This project follows the global tracker timing mode from Preferences."),
        // (The "Pace calculation" choice, active days or calendar days, was removed: every pace and estimate now uses
        // stitching days, from one calculation, so it changed nothing.)
        React.createElement("p", {style:{margin:'var(--s-3) 0 0'}},
          React.createElement("button", {type:"button", className:"stats-export-btn", onClick:function(){ try { window.dispatchEvent(new Event('cs:openPreferences')); } catch (e) {} }}, "Open Preferences"),
          React.createElement("span", {style:{fontSize:'var(--text-xs)', color:'var(--text-secondary)', marginLeft:'var(--s-2)'}}, "Day ends at, timing and the other tracker settings are there too.")
        )
      )
    ))
    )
  );
}

const pill=a=>({padding:"5px 14px",fontSize:'var(--text-sm)',borderRadius:'var(--radius-md)',cursor:"pointer",border:a?"1px solid var(--accent-border)":"0.5px solid var(--border)",background:a?"var(--accent-light)":"var(--surface)",fontWeight:a?600:400,color:a?"var(--accent)":"var(--text-secondary)"});
const tBtn=(a)=>({padding:"5px 12px",fontSize:'var(--text-sm)',borderRadius:'var(--radius-md)',cursor:"pointer",border:a?"1px solid var(--accent-border)":"0.5px solid var(--border)",background:a?"var(--accent-light)":"var(--surface)",fontWeight:a?600:400,color:a?"var(--accent)":"var(--text-secondary)"});
const tabSt=a=>({padding:"8px 16px",fontSize:'var(--text-md)',fontWeight:a?600:400,background:a?"var(--accent-light)":"transparent",border:"none",cursor:"pointer",borderBottom:a?"2px solid var(--accent)":"2px solid transparent",color:a?"var(--accent)":"var(--text-tertiary)",marginBottom:-2, borderRadius: "6px 6px 0 0"});

// ═══════════════════════════════════════════════════════════
// GLOBAL STATS DASHBOARD
// ═══════════════════════════════════════════════════════════

var PROJECT_COLORS = ['#0F6E56','#378ADD','#639922','var(--accent)','#534AB7','#D4537E','#BA7517','#E24B4A'];

function assignProjectColor(projectId) {
  if (!projectId) return PROJECT_COLORS[0];
  var hash = 0;
  for (var i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash) + projectId.charCodeAt(i);
    hash |= 0;
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

function heatmapColor(stitches, max) {
  if (stitches === 0) return 'var(--border)';
  var ratio = stitches / max;
  if (ratio < 0.25) return '#9FE1CB';
  if (ratio < 0.50) return '#5DCAA5';
  if (ratio < 0.75) return '#1D9E75';
  return '#0F6E56';
}

function MetricCard({label, value, sub}) {
  return React.createElement('div', {className: 'gsd-metric'},
    React.createElement('div', {className: 'gsd-metric-label'}, label),
    React.createElement('div', {className: 'gsd-metric-value'}, value),
    sub ? React.createElement('div', {className: 'gsd-metric-sub'}, sub) : null
  );
}

function RingChart({size, pct, color}) {
  var r = (size - 6) / 2;
  var circ = 2 * Math.PI * r;
  var offset = circ * (1 - Math.min(pct, 100) / 100);
  return React.createElement('div', {style: {width: size, height: size, position: 'relative', margin: '0 auto 4px'}},
    React.createElement('svg', {width: size, height: size, style: {transform: 'rotate(-90deg)', display: 'block'}},
      React.createElement('circle', {cx: size/2, cy: size/2, r: r, fill: 'none', stroke: 'var(--border)', strokeWidth: 3}),
      React.createElement('circle', {cx: size/2, cy: size/2, r: r, fill: 'none', stroke: color, strokeWidth: 3,
        strokeDasharray: circ, strokeDashoffset: offset, strokeLinecap: 'round'})
    ),
    React.createElement('div', {style: {position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize:'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)'}},
      pct + '%'
    )
  );
}

function WeekMetric({label, value, delta, isDays}) {
  var isPositive = delta > 0;
  var isZero = delta === 0;
  var sign = delta > 0 ? '+' : '';
  var deltaStr = isDays ? sign + delta + ' vs last' : sign + delta + '%';
  return React.createElement('div', {className: 'gsd-week-metric'},
    React.createElement('div', {className: 'gsd-week-metric-label'}, label),
    React.createElement('div', {className: 'gsd-week-metric-value'}, value),
    !isZero ? React.createElement('div', {className: 'gsd-week-metric-delta',
      style: {color: isPositive ? '#0F6E56' : 'var(--text-tertiary)'}}, deltaStr) : null
  );
}

function InsightIcon({type}) {
  var iconMap = {star: Icons.star, bolt: Icons.bolt, clock: Icons.clock, calendar: Icons.calendar};
  var icon = iconMap[type] ? iconMap[type]() : Icons.star();
  return React.createElement('span', {style: {display: 'inline-flex', alignItems: 'center', fontSize:'var(--text-xl)'}}, icon);
}

var CS_GLOBAL_GOALS_KEY = (typeof LOCAL_STORAGE_KEYS !== 'undefined') ? LOCAL_STORAGE_KEYS.globalGoals : 'cs_global_goals';
var CS_GLOBAL_GOALS_COMPAT_KEY = (typeof LOCAL_STORAGE_KEYS !== 'undefined') ? LOCAL_STORAGE_KEYS.globalGoalsCompat : 'cs_stats_settings';
function normaliseGlobalGoals(goals) {
  goals = goals && typeof goals === 'object' ? goals : {};
  return {
    dailyGoal: goals.dailyGoal != null ? goals.dailyGoal : null,
    weeklyGoal: goals.weeklyGoal != null ? goals.weeklyGoal : null,
    monthlyGoal: goals.monthlyGoal != null ? goals.monthlyGoal : null,
    targetDate: goals.targetDate != null ? goals.targetDate : null
  };
}
function readGlobalGoals() {
  try {
    var raw = localStorage.getItem(CS_GLOBAL_GOALS_KEY);
    if(raw) return normaliseGlobalGoals(JSON.parse(raw));
    var compatRaw = localStorage.getItem(CS_GLOBAL_GOALS_COMPAT_KEY);
    return compatRaw ? normaliseGlobalGoals(JSON.parse(compatRaw)) : {};
  } catch(e) { return {}; }
}
function writeGlobalGoals(goals) {
  try {
    var normalised = normaliseGlobalGoals(goals);
    var serialised = JSON.stringify(normalised);
    localStorage.setItem(CS_GLOBAL_GOALS_KEY, serialised);
    localStorage.setItem(CS_GLOBAL_GOALS_COMPAT_KEY, serialised);
  } catch(e) {}
}

function GlobalStatsDashboard({onClose, onViewProject, currentProjectId, statsSettings, onUpdateSettings}) {
  var _summaries = React.useState([]);
  var projectSummaries = _summaries[0], setProjectSummaries = _summaries[1];
  var _loading = React.useState(true);
  // Global goals are stored in localStorage, independent of any single project's statsSettings
  var _globalGoals = React.useState(readGlobalGoals);
  var globalGoals = _globalGoals[0], setGlobalGoals = _globalGoals[1];
  function updateGlobalGoals(newSettings) {
    var goals = {dailyGoal: newSettings.dailyGoal != null ? newSettings.dailyGoal : null,
      weeklyGoal: newSettings.weeklyGoal != null ? newSettings.weeklyGoal : null,
      monthlyGoal: newSettings.monthlyGoal != null ? newSettings.monthlyGoal : null,
      targetDate: newSettings.targetDate != null ? newSettings.targetDate : null};
    setGlobalGoals(goals);
    writeGlobalGoals(goals);
  }
  // Effective settings for GoalTracker: combine global goals with any per-project timing settings
  var effectiveGoalSettings = Object.assign({dayEndHour: 0, timingMode: null, useActiveDays: true}, statsSettings || {}, globalGoals);
  var loading = _loading[0], setLoading = _loading[1];
  var _tlLimit = React.useState(20);
  var tlLimit = _tlLimit[0], setTlLimit = _tlLimit[1];

  React.useEffect(function() {
    if (typeof ProjectStorage === 'undefined') { setLoading(false); return; }
    // Flush the active project to IDB first so the summary includes the latest session data
    var doLoad = function() {
      var rebuild = function() {
        if (typeof ProjectStorage.buildAllStatsSummaries !== 'function') {
          setProjectSummaries([]);
          setLoading(false);
          return;
        }
        ProjectStorage.buildAllStatsSummaries().then(function(built) {
          setProjectSummaries(built);
          setLoading(false);
        }).catch(function() {
          setProjectSummaries([]);
          setLoading(false);
        });
      };
      ProjectStorage.getAllStatsSummaries().then(function(summaries) {
        if (Array.isArray(summaries) && summaries.length) {
          setProjectSummaries(summaries);
          setLoading(false);
          return;
        }
        rebuild();
      }).catch(rebuild);
    };
    // __flushProjectToIDB is only present on tracker/stats page
    if (typeof window.__flushProjectToIDB === 'function') {
      window.__flushProjectToIDB().then(doLoad).catch(doLoad);
    } else {
      doLoad();
    }
  }, []);

  var allSessions = React.useMemo(function() {
    var out = [];
    projectSummaries.forEach(function(p) { (p.statsSessions || []).forEach(function(s) { out.push(s); }); });
    return out;
  }, [projectSummaries]);

  var lifetimeTotals = React.useMemo(function() {
    // "Total stitches" is what is marked on the charts now, summed from each project's own progress, so it agrees with the
    // Tracker, Home and the project cards. Speed is different: it needs the stitches added in recorded sessions to go with
    // their time, so that figure still comes from the session records.
    var sessionStitches = allSessions.reduce(function(s, sess) { return s + (ProgressUnits.sessionAdded(sess) || 0); }, 0);
    var totalStitches = ProgressUnits.sumRows(projectSummaries).doneUnits;
    var totalSeconds = allSessions.reduce(function(s, sess) { return s + getSessionSeconds(sess); }, 0);
    var totalHours = totalSeconds / 3600;
    var activeDays = new Set(allSessions.filter(ProgressUnits.sessionActive).map(function(s) { return s.date; }).filter(Boolean)).size;
    var speed = totalHours > 0 ? Math.round(sessionStitches / totalHours) : 0;
    var complete = projectSummaries.filter(function(p) { return p.isComplete; }).length;
    var total = projectSummaries.length;
    return {totalStitches: totalStitches, sessionStitches: sessionStitches, totalSeconds: totalSeconds, activeDays: activeDays, speed: speed, complete: complete, total: total, estimated: sessionsTimeIsEstimated(allSessions)};
  }, [allSessions, projectSummaries]);

  var mot = useMotivationPrefs();     // streaks, goals and celebrations on or off (Preferences)
  var globalStreak = React.useMemo(function() {
    // Weekly streak by default; the daily one only when it is turned on.
    return {weekly: computeWeeklyStreaks(allSessions, getDayEndHour()),
      daily: (typeof InsightsEngine !== 'undefined' && InsightsEngine.computeDailyStreak) ? InsightsEngine.computeDailyStreak(allSessions) : {current: 0, longest: 0}};
  }, [allSessions]);

  var weekComparison = React.useMemo(function() {
    var today = new Date();
    var dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
    var thisWeekStart = new Date(today); thisWeekStart.setDate(today.getDate() - dow);
    var thisWeekStartStr = formatYMD(thisWeekStart);
    var lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    var lastWeekStartStr = formatYMD(lastWeekStart);
    var lastWeekEndStr = formatYMD(new Date(thisWeekStart.getTime() - 86400000));
    function wk(sessions) {
      var st = sessions.reduce(function(s, x) { return s + (ProgressUnits.sessionAdded(x) || 0); }, 0);
      var sec = sessions.reduce(function(s, x) { return s + getSessionSeconds(x); }, 0);
      var spd = sec > 0 ? Math.round(st / (sec / 3600)) : 0;
      var days = new Set(sessions.filter(ProgressUnits.sessionActive).map(function(x) { return x.date; })).size;
      return {stitches: st, seconds: sec, speed: spd, activeDays: days};
    }
    var tw = wk(allSessions.filter(function(s) { return s.date >= thisWeekStartStr; }));
    var lw = wk(allSessions.filter(function(s) { return s.date >= lastWeekStartStr && s.date <= lastWeekEndStr; }));
    function pct(a, b) { if (b === 0) return a > 0 ? 100 : 0; return Math.round((a - b) / b * 100); }
    return {thisWeek: tw, lastWeek: lw, stitchesDelta: pct(tw.stitches, lw.stitches),
      timeDelta: pct(tw.seconds, lw.seconds), speedDelta: pct(tw.speed, lw.speed),
      daysDelta: tw.activeDays - lw.activeDays};
  }, [allSessions]);

  var insights = React.useMemo(function() {
    if (allSessions.length === 0) return [];
    var result = [];
    var dailyTotals = {};
    allSessions.forEach(function(s) { if (s.date) dailyTotals[s.date] = (dailyTotals[s.date] || 0) + (ProgressUnits.sessionAdded(s) || 0); });
    var bestDay = Object.entries(dailyTotals).sort(function(a, b) { return b[1] - a[1]; })[0];
    if (bestDay && bestDay[1] > 0) result.push({icon: 'star', color: 'teal', text: 'Best day ever: ' + bestDay[1].toLocaleString('en-GB') + ' stitches on ' + formatDateReadable(bestDay[0])});
    var fastest = allSessions.filter(function(s) { return getSessionSeconds(s) >= 600 && (ProgressUnits.sessionAdded(s) || 0) > 0; }).sort(function(a, b) { return (ProgressUnits.sessionAdded(b) / getSessionSeconds(b)) - (ProgressUnits.sessionAdded(a) / getSessionSeconds(a)); })[0];
    if (fastest) {
      var spd = Math.round(ProgressUnits.sessionAdded(fastest) / (getSessionSeconds(fastest) / 3600));
      var proj = projectSummaries.find(function(p) { return (p.statsSessions || []).some(function(s) { return s.id === fastest.id; }); });
      result.push({icon: 'bolt', color: 'amber', text: 'Fastest session: ' + spd + ' st/hr' + (proj ? ' on ' + proj.name : '')});
    }
    var hourCounts = new Array(24).fill(0);
    allSessions.forEach(function(s) { if (s.startTime) { var h = new Date(s.startTime).getHours(); hourCounts[h] += (ProgressUnits.sessionAdded(s) || 0); } });
    var maxH = Math.max.apply(null, hourCounts);
    if (maxH > 0) {
      var peak = hourCounts.indexOf(maxH);
      result.push({icon: 'clock', color: 'purple', text: 'You stitch most between ' + formatHour(peak) + '\u2013' + formatHour((peak + 2) % 24)});
    }
    // Unified completion rule (S6): exclude if stitch-count complete OR user
    // explicitly marked finished. Use engine for ETA (S4) so all three stats
    // pages produce consistent projections.
    var inProg = projectSummaries.filter(function(p) { return !p.isComplete && p.finishStatus !== 'completed' && p.completedStitches > 0 && p.totalStitches > 0; }).sort(function(a, b) { return (a.totalStitches - a.completedStitches) - (b.totalStitches - b.completedStitches); });
    if (inProg.length > 0 && typeof InsightsEngine !== 'undefined' && InsightsEngine.generateProjections) {
      var projs = InsightsEngine.generateProjections(inProg);
      var proj = projs.find(function(pr) { return pr.status === 'projected'; });
      if (proj && proj.projectedText) {
        result.push({icon: 'calendar', color: 'coral', text: proj.name + ': ' + proj.projectedText});
      }
    }
    var firstDate = allSessions.reduce(function(min, s) { return (s.date && s.date < min) ? s.date : min; }, allSessions[0].date || '');
    if (firstDate) {
      var ds = Math.ceil((Date.now() - new Date(firstDate + 'T12:00:00').getTime()) / 86400000);
      result.push({icon: 'calendar', color: 'blue', text: 'Stitching for ' + ds + ' days (since ' + formatDateReadable(firstDate) + ')'});
    }
    return result.slice(0, 4);
  }, [allSessions, projectSummaries]);

  var timeline = React.useMemo(function() {
    var entries = [];
    projectSummaries.forEach(function(p) {
      (p.statsSessions || []).forEach(function(s) {
        entries.push({type: 'session', date: s.date, startTime: s.startTime || (s.date + 'T00:00:00'), projectId: p.id, projectName: p.name || 'Untitled', projectColor: assignProjectColor(p.id), stitches: ProgressUnits.sessionAdded(s) || 0, seconds: getSessionSeconds(s), speed: getSessionSeconds(s) > 0 ? Math.round((ProgressUnits.sessionAdded(s) || 0) / (getSessionSeconds(s) / 3600)) : 0, note: s.note || null});
      });
      (p.achievedMilestones || []).forEach(function(m) {
        var dt = m.achievedAt || m.date || '';
        entries.push({type: 'milestone', date: dt.slice(0, 10), startTime: m.achievedAt || (dt + 'T00:00:00'), projectId: p.id, projectName: p.name || 'Untitled', label: m.label, pct: m.pct});
      });
    });
    entries.sort(function(a, b) { return new Date(b.startTime) - new Date(a.startTime); });
    var grouped = [], curDate = null, curGroup = null;
    entries.slice(0, tlLimit).forEach(function(e) {
      if (e.date !== curDate) { curGroup = {date: e.date, entries: []}; grouped.push(curGroup); curDate = e.date; }
      curGroup.entries.push(e);
    });
    return {grouped: grouped, total: entries.length};
  }, [projectSummaries, tlLimit]);

  function fmtDayLabel(dateStr) {
    if (!dateStr) return '';
    var today = formatYMD(new Date()), yesterday = subtractOneDay(today);
    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'});
  }

  if (loading) {
    return React.createElement('div', {className: 'gsd', style: {padding: '40px', textAlign: 'center', color: 'var(--text-secondary)'}},
      'Loading\u2026');
  }

  if (projectSummaries.length === 0) {
    return React.createElement('div', {className: 'gsd', style: {padding: '40px 16px', textAlign: 'center'}},
      React.createElement('p', {style: {color: 'var(--text-secondary)', fontSize: 15, marginBottom:'var(--s-3)'}}, 'No stitching data yet.'),
      React.createElement('p', {style: {color: 'var(--text-tertiary)', fontSize:'var(--text-md)'}}, 'Open a project and start marking stitches \u2014 your stats will appear here automatically.'));
  }

  // Merged from the Stash and Insights tabs: the narrative weekly summary and the recent pace.
  var weekSummary = (typeof window !== 'undefined' && window.InsightsEngine && window.InsightsEngine.generateWeeklySummary)
    ? window.InsightsEngine.generateWeeklySummary(weekComparison.thisWeek, weekComparison.lastWeek) : '';
  var recentPace = (typeof window !== 'undefined' && window.InsightsEngine && window.InsightsEngine.calculateRecentPace)
    ? window.InsightsEngine.calculateRecentPace(allSessions) : null;

  return React.createElement('div', {className: 'stats-dashboard'},
    React.createElement('div', {style: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom:'var(--s-4)', gap:'var(--s-2)', flexWrap: 'wrap'}},
      React.createElement('h2', {style: {fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px'}}, Icons.barChart(), 'All projects'),
      React.createElement('div', {style: {display: 'flex', gap:'var(--s-2)'}},
        React.createElement('button', {onClick: function() {
          setLoading(true);
          var doRefresh = function() {
            ProjectStorage.buildAllStatsSummaries().then(function(built) {
              setProjectSummaries(built); setLoading(false);
            }).catch(function() { setLoading(false); });
          };
          if (typeof window.__flushProjectToIDB === 'function') {
            // only present on tracker/stats page
            window.__flushProjectToIDB().then(doRefresh).catch(doRefresh);
          } else { doRefresh(); }
        }, style: {fontSize:'var(--text-md)', padding: '4px 12px', borderRadius:'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-secondary)'}}, '↻ Refresh'),
        React.createElement('button', {onClick: onClose, style: {fontSize:'var(--text-md)', padding: '4px 14px', borderRadius:'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-secondary)'}}, '\u2190 Back to grid')
      )
    ),

    // Bento grid: every tile below is one cell. Sizes: sm / md / lg / xl / full.
    React.createElement('div', {className: 'bento'},

    // Lifetime totals (also carries the recent pace, merged in from the Stash tab)
    React.createElement('div', {className: 'bento-cell bento-cell--xl'},
      React.createElement('h3', {className: 'gsd-section-label'}, 'All time'),
      React.createElement('div', {className: 'gsd-metrics'},
        React.createElement(MetricCard, {label: 'Total stitches', value: ProgressUnits.formatUnits(lifetimeTotals.totalStitches), sub: 'marked across ' + lifetimeTotals.total + ' project' + (lifetimeTotals.total !== 1 ? 's' : '')}),
        React.createElement(MetricCard, {label: 'Time stitching' + (lifetimeTotals.estimated ? ' (estimated)' : ''), value: formatDurationCompact(lifetimeTotals.totalSeconds), sub: lifetimeTotals.activeDays + ' active days'}),
        React.createElement(MetricCard, {label: 'Average speed' + (lifetimeTotals.estimated ? ' (estimated)' : ''), value: lifetimeTotals.speed, sub: 'stitches / hour'}),
        recentPace && recentPace.activeDays > 0 && React.createElement(MetricCard, {label: 'Recent pace', value: Math.round(recentPace.pacePerDay).toLocaleString('en-GB'), sub: 'stitches / stitching day'}),
        React.createElement(MetricCard, {label: 'Projects', value: lifetimeTotals.complete + ' finished', sub: (lifetimeTotals.total - lifetimeTotals.complete) + ' in progress'})
      )
    ),

    // Streak (weekly and daily in one tile; merged from the Stash tab)
    mot.show && allSessions.length > 0 && React.createElement('div', {className: 'bento-cell bento-cell--md'},
      React.createElement('h3', {className: 'gsd-section-label'}, 'Streak'),
      React.createElement('div', {className: 'gsd-streak'},
        React.createElement('div', {className: 'gsd-streak-flame'}, Icons.fire()),
        React.createElement('div', {className: 'gsd-streak-body'},
          React.createElement('div', {className: 'gsd-streak-num'}, weeksText(globalStreak.weekly.current)),
          React.createElement('div', {className: 'gsd-streak-label'}, globalStreak.weekly.current > 0 ? 'Weeks in a row with some stitching' : 'A new run of weeks begins with your next session'),
          mot.daily && React.createElement('div', {className: 'gsd-streak-label'}, globalStreak.daily.current + ' day' + (globalStreak.daily.current !== 1 ? 's' : '') + ' in a row (most ' + globalStreak.daily.longest + ')')
        ),
        React.createElement('div', {className: 'gsd-streak-best'}, 'Most: ' + weeksText(globalStreak.weekly.longest))
      )
    ),

    // Project cards
    React.createElement('div', {className: 'bento-cell bento-cell--xl'},
    React.createElement('h3', {className: 'gsd-section-label'}, 'Projects'),
    React.createElement('div', {className: 'gsd-projects'},
      projectSummaries.slice().sort(function(a, b) {
        if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      }).map(function(p) {
        var pct = p.pct != null ? p.pct : (p.totalStitches > 0 ? ProgressUnits.percent(p.completedStitches,p.totalStitches) : 0);
        var remaining = Math.max(0, p.totalStitches - p.completedStitches);
        var color = p.projectColor || assignProjectColor(p.id);
        return React.createElement('div', {key: p.id, className: 'gsd-project-card', onClick: function() { if (onViewProject) onViewProject(p.id); }},
          React.createElement('div', {className: 'gsd-pc-name'}, p.name || 'Untitled'),
          React.createElement(RingChart, {size: 52, pct: pct, color: color}),
          React.createElement('div', {className: 'gsd-pc-sub'}, p.isComplete ? 'Complete!' : remaining.toLocaleString('en-GB') + ' left')
        );
      })
    )),

    // Week comparison, with the narrative summary merged in from the Insights tab
    React.createElement('div', {className: 'bento-cell bento-cell--lg'},
    React.createElement('h3', {className: 'gsd-section-label'}, 'This week vs last week'),
    React.createElement('div', {className: 'gsd-week'},
      React.createElement('div', {className: 'gsd-week-grid'},
        React.createElement(WeekMetric, {label: 'stitches', value: weekComparison.thisWeek.stitches.toLocaleString('en-GB'), delta: weekComparison.stitchesDelta}),
        React.createElement(WeekMetric, {label: 'time', value: formatDurationCompact(weekComparison.thisWeek.seconds), delta: weekComparison.timeDelta}),
        React.createElement(WeekMetric, {label: 'st/hour', value: weekComparison.thisWeek.speed, delta: weekComparison.speedDelta}),
        React.createElement(WeekMetric, {label: 'days active', value: weekComparison.thisWeek.activeDays + ' / 7', delta: weekComparison.daysDelta, isDays: true})
      ),
      weekSummary && React.createElement('p', {className: 'gsd-week-summary'}, weekSummary)
    )),

    // Section 5: Goals (stored globally in localStorage, not tied to any single project)
    mot.show && React.createElement('div', {className: 'bento-cell bento-cell--md'},
      React.createElement('h3', {className: 'gsd-section-label'}, 'Goals'),
      React.createElement(GoalTracker, {
        statsSettings: effectiveGoalSettings,
        statsSessions: allSessions,
        totalCompleted: allSessions.reduce(function(s, x) { return s + (ProgressUnits.sessionNet(x) || 0); }, 0),
        totalStitches: projectSummaries.reduce(function(s, p) { return s + p.totalStitches; }, 0),
        overviewStats: computeOverviewStats(allSessions, lifetimeTotals.sessionStitches, lifetimeTotals.sessionStitches, true),
        onUpdateSettings: updateGlobalGoals
      })
    ),

    // Section 6: Insights
    insights.length > 0 && React.createElement('div', {className: 'bento-cell bento-cell--lg'},
      React.createElement('h3', {className: 'gsd-section-label'}, 'Insights'),
      React.createElement('div', {className: 'gsd-insights'},
        insights.map(function(ins, i) {
          var parts = ins.text.indexOf(':') > -1 ? [ins.text.slice(0, ins.text.indexOf(':')), ins.text.slice(ins.text.indexOf(':') + 1)] : ['', ins.text];
          return React.createElement('div', {key: i, className: 'gsd-insight'},
            React.createElement('div', {className: 'gsd-insight-icon gsd-insight-icon--' + ins.color},
              React.createElement(InsightIcon, {type: ins.icon})),
            React.createElement('div', {className: 'gsd-insight-text'},
              parts[0] ? React.createElement('span', null, React.createElement('strong', null, parts[0] + ':'), parts[1]) : ins.text)
          );
        })
      )
    ),

    // Section 9: Session timeline
    React.createElement('div', {className: 'bento-cell bento-cell--full gsd-timeline'},
      React.createElement('h3', {className: 'gsd-section-label'}, 'Recent sessions'),
      React.createElement('div', {className: 'gsd-tl-cols'}, timeline.grouped.map(function(day) {
        return React.createElement('div', {key: day.date || 'nd', className: 'gsd-tl-day'},
          React.createElement('div', {className: 'gsd-tl-date'}, fmtDayLabel(day.date)),
          day.entries.map(function(entry, i) {
            if (entry.type === 'session') {
              return React.createElement('div', {key: i, className: 'gsd-tl-entry'},
                React.createElement('div', {className: 'gsd-tl-dot', style: {background: entry.projectColor}}),
                React.createElement('div', {className: 'gsd-tl-body'},
                  React.createElement('div', {className: 'gsd-tl-title'}, entry.projectName),
                  React.createElement('div', {className: 'gsd-tl-meta'},
                    formatDurationCompact(entry.seconds) + (entry.speed > 0 ? ' \u00B7 ' + entry.speed + ' st/hr' : '')),
                  entry.note ? React.createElement('div', {className: 'gsd-tl-note'}, '\u201C' + entry.note + '\u201D') : null
                ),
                React.createElement('div', {className: 'gsd-tl-stitches'}, '+' + entry.stitches.toLocaleString('en-GB'))
              );
            }
            return React.createElement('div', {key: i, className: 'gsd-tl-milestone'},
              React.createElement('div', {className: 'gsd-tl-milestone-icon'}, '\u2605'),
              React.createElement('div', {className: 'gsd-tl-body'},
                React.createElement('div', {className: 'gsd-tl-title'}, entry.projectName + ' hit ' + entry.label + '!'),
                React.createElement('div', {className: 'gsd-tl-meta'}, 'Milestone reached')
              )
            );
          })
        );
      })),
      tlLimit < timeline.total && React.createElement('button', {className: 'timeline-show-all',
        onClick: function() { setTlLimit(function(prev) { return prev + 20; }); }}, 'Show more')
    )
    )
  );
}

// StatsErrorBoundary: prevents a single broken chart from crashing the
// whole stats modal. Required because the per-chart try/catch wrappers were
// removed in favour of a proper error boundary (code-quality-07 follow-up).
class StatsErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error: error }; }
  componentDidCatch(error, info) { try { console.error('Stats render error:', error, info); } catch (_) {} }
  render() {
    if (this.state.error) {
      return React.createElement('div', {
        style: {padding: '20px', textAlign: 'center', color: 'var(--danger)', fontSize:'var(--text-md)', background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)', borderRadius:'var(--radius-md)', margin: '12px'}
      },
        React.createElement('div', {style: {fontWeight: 600, marginBottom: 6}}, 'Stats failed to render'),
        React.createElement('div', {style: {fontSize:'var(--text-xs)', color: 'var(--danger)'}}, String(this.state.error && this.state.error.message || this.state.error || 'Unknown error'))
      );
    }
    return this.props.children;
  }
}
if (typeof window !== 'undefined') window.StatsErrorBoundary = StatsErrorBoundary;

// Turn a project's stored grid back into full cells, as the tracker does on
// load. Saved cells are stripped of rgb wherever the DMC catalogue can rebuild
// it (see stripCellForSave), and v8/URL-shared projects keep a compact `.p`
// grid of ["id", flag] cells instead of `.pattern`. Charts that paint done
// stitches read cell.rgb, so raw cells crash them.
function restoreStoredPattern(project) {
  var raw = project && (project.pattern || project.p);
  if (!Array.isArray(raw)) return null;
  // The project's thread brand (P4-5) picks the catalogue ids are read from.
  var brand = typeof projectThreadBrand === 'function' ? projectThreadBrand(project) : 'dmc';
  var restore = typeof restoreStitch === 'function' ? function(m) { return restoreStitch(m, brand); } : function(m) { return m; };
  if (raw.length > 0 && Array.isArray(raw[0])) {
    return raw.map(function(m) {
      if (m[1] === 'k') return restore({id: '__skip__'});
      if (m[1] === 'b') return restore({type: 'blend', id: m[0]});
      return restore({type: 'solid', id: m[0]});
    });
  }
  return raw.map(function(m) { return m ? restore(m) : m; });
}
if (typeof window !== 'undefined') window.restoreStoredPattern = restoreStoredPattern;

// StatsContainer: tab bar wrapping GlobalStatsDashboard or per-project StatsDashboard
function StatsContainer({statsTab, setStatsTab, onClose, currentProjectId, statsSessions, statsSettings, onUpdateSettings, totalCompleted, totalStitches, halfStitchCounts, onEditNote, onEditSession, onDeleteSession, onMergeSession, projectName, palette, colourDoneCounts, achievedMilestones, done, pat, sW, sH, doneSnapshots, setDoneSnapshots, sections, onOpenProject}) {
  var _projects = React.useState([]);
  var projects = _projects[0], setProjects = _projects[1];
  var _loaded = React.useState(null);
  var loadedProject = _loaded[0], setLoadedProject = _loaded[1];
  var _lLoading = React.useState(false);
  var lLoading = _lLoading[0], setLLoading = _lLoading[1];

  React.useEffect(function() {
    if (typeof ProjectStorage !== 'undefined') {
      ProjectStorage.listProjects().then(setProjects).catch(function() {});
    }
  }, []);

  React.useEffect(function() {
    var cancelled = false;
    setLoadedProject(null);
    if (!statsTab || statsTab === 'all' || statsTab === currentProjectId) return;
    setLLoading(true);
    if (typeof ProjectStorage !== 'undefined') {
      ProjectStorage.get(statsTab).then(function(p) { if (!cancelled) { setLoadedProject(p || null); setLLoading(false); } }).catch(function() { if (!cancelled) setLLoading(false); });
    }
    return function() { cancelled = true; };
  }, [statsTab, currentProjectId]);

  var tabBar = React.createElement('div', {className: 'gsd-tabs'},
    React.createElement('div', {className: 'gsd-tabs-inner'},
      React.createElement('button', {className: 'gsd-tab' + (statsTab === 'all' ? ' gsd-tab--on' : ''),
        onClick: function() { setStatsTab('all'); }}, 'All projects'),
      projects.map(function(proj) {
        return React.createElement('button', {key: proj.id,
          className: 'gsd-tab' + (statsTab === proj.id ? ' gsd-tab--on' : ''),
          onClick: function() { setStatsTab(proj.id); }},
          proj.name || 'Untitled');
      })
    )
  );

  var content;
  if (statsTab === 'all') {
    content = React.createElement(GlobalStatsDashboard, {onClose: onClose, onViewProject: function(id) { setStatsTab(id); }, currentProjectId: currentProjectId, statsSettings: statsSettings, onUpdateSettings: onUpdateSettings});
  } else if (statsTab === currentProjectId && pat) {
    content = React.createElement(StatsDashboard, {statsSessions: statsSessions, statsSettings: statsSettings, totalCompleted: totalCompleted, totalStitches: totalStitches, halfStitchCounts: halfStitchCounts, onEditNote: onEditNote, onEditSession: onEditSession, onDeleteSession: onDeleteSession, onMergeSession: onMergeSession, onUpdateSettings: onUpdateSettings, onClose: onClose, projectName: projectName, palette: palette, colourDoneCounts: colourDoneCounts, achievedMilestones: achievedMilestones, done: done, pat: pat, sW: sW, sH: sH, doneSnapshots: doneSnapshots, setDoneSnapshots: setDoneSnapshots, sections: sections, currentProjectId: currentProjectId, onOpenProject: onOpenProject, canEdit: true});
  } else if (loadedProject && loadedProject.id === statsTab) {
    var lp = loadedProject;
    var lpS = lp.settings || {};
    var lpSessions = lp.statsSessions || [];
    var lpDone = lp.done || null;
    var lpPat = restoreStoredPattern(lp);
    var lpProg = ProgressUnits.fromProject(lp);
    var lpTotal = lpProg.totalUnits;
    var lpCompleted = lpProg.doneUnits;
    var lpCDone = ProgressUnits.coloursFromProject(Object.assign({},lp,{pattern:lpPat}));
    var lpPal = Object.keys(lpCDone).map(function(id) { return lpCDone[id].thread; });
    content = React.createElement(StatsDashboard, {statsSessions: lpSessions, statsSettings: lp.statsSettings || {dayEndHour: 0, useActiveDays: true}, totalCompleted: lpCompleted, totalStitches: lpTotal, onEditNote: function() {}, onUpdateSettings: function() {}, onClose: onClose, projectName: lp.name || 'Untitled', palette: lpPal, colourDoneCounts: lpCDone, achievedMilestones: lp.achievedMilestones || [], done: lpDone, pat: lpPat, sW: lpS.sW || lp.w || 0, sH: lpS.sH || lp.h || 0, doneSnapshots: lp.doneSnapshots || [], setDoneSnapshots: function() {}, sections: lp.sections || [], currentProjectId: lp.id, onOpenProject: onOpenProject, canEdit: false});
  } else {
    content = React.createElement('div', {style: {padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize:'var(--text-lg)'}},
      lLoading ? 'Loading\u2026' : 'Load a project in the tracker to see its stats here.');
  }

  return React.createElement('div', {className: 'stats-container'},
    tabBar,
    React.createElement('div', {className: 'stats-container-body'},
      React.createElement(StatsErrorBoundary, null, content)
    )
  );
}

