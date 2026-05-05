function calculateTooltipPosition(x, width){
  return Math.max(width/2+8,Math.min(x,window.innerWidth-width/2-8));
}
function Tooltip({text,children,width=180}){
  const[show,setShow]=React.useState(false);
  const[pos,setPos]=React.useState({x:0,y:0});
  React.useEffect(()=>{
    if(!show) return;
    const dismiss=()=>setShow(false);
    document.addEventListener('click',dismiss);
    return ()=>document.removeEventListener('click',dismiss);
  },[show]);
  return React.createElement("div",{
    style:{position:"relative",display:"inline-flex"},
    onMouseEnter:e=>{const r=e.currentTarget.getBoundingClientRect();setPos({x:r.left+r.width/2,y:r.top});setShow(true);},
    onMouseLeave:()=>setShow(false),
    onClick:e=>{if(e.pointerType==='touch'||e.pointerType==='pen'){const r=e.currentTarget.getBoundingClientRect();setPos({x:r.left+r.width/2,y:r.top});setShow(s=>!s);}}
  },
    children,
    show&&ReactDOM.createPortal(
      React.createElement("div",{style:{
        position:"fixed",left:calculateTooltipPosition(pos.x,width),top:pos.y-10,
        transform:"translate(-50%,-100%)",
        background:"var(--text-primary)",color:"var(--surface)",fontSize:'var(--text-xs)',lineHeight:"1.45",
        padding:"6px 10px",borderRadius:7,maxWidth:width,width:"max-content",
        zIndex:9999,pointerEvents:"none",
        boxShadow:"0 4px 16px rgba(0,0,0,0.22)",textAlign:"center"
      }},
        text,
        React.createElement("div",{style:{
          position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",
          width:0,height:0,
          borderLeft:"5px solid transparent",borderRight:"5px solid transparent",
          borderTop:"5px solid var(--text-primary)"
        }})
      ),
      document.body
    )
  );
}
function InfoIcon({text,width}){
  return React.createElement("span",{style:{display:"inline-flex",alignItems:"center",flexShrink:0},onClick:function(e){e.preventDefault();e.stopPropagation();}},
    React.createElement(Tooltip,{text:text,width:width||200},
      React.createElement("span",{role:"img","aria-label":"Information",style:{cursor:"help",color:"var(--text-tertiary)",lineHeight:1,display:"inline-flex",alignItems:"center"}},window.Icons&&window.Icons.info?window.Icons.info():null)
    )
  );
}

// ── Proposal B: Inline hint bar ───────────────────────────────────────────────
// Slides in below a field when it receives focus. `topic` is a search query
// passed to HelpDrawer.open() when the user clicks "Learn more".
function InlineHint({visible,text,topic}){
  return React.createElement("div",{
    role:visible?"note":undefined,"aria-hidden":!visible,
    style:{overflow:"hidden",maxHeight:visible?"80px":"0",opacity:visible?1:0,
      marginTop:visible?4:0,
      transition:"max-height 180ms ease,opacity 150ms ease,margin-top 180ms ease"}
  },
    React.createElement("div",{style:{
      fontSize:"var(--text-xs)",color:"var(--text-secondary)",lineHeight:1.5,
      background:"var(--surface-secondary)",border:"0.5px solid var(--line)",
      borderRadius:"var(--radius-sm)",padding:"4px 8px",
      display:"flex",alignItems:"baseline",gap:4,flexWrap:"wrap"
    }},
      text,
      topic&&React.createElement("button",{
        type:"button",
        onMouseDown:function(e){e.preventDefault();},
        onClick:function(){
          if(window.HelpDrawer){window.HelpDrawer.open({tab:"help",query:topic});}
          else{window.dispatchEvent(new CustomEvent("cs:openHelp",{detail:{tab:"help",query:topic}}));}
        },
        style:{background:"none",border:"none",color:"var(--accent)",fontSize:"var(--text-xs)",
          cursor:"pointer",padding:0,fontWeight:500,flexShrink:0,lineHeight:1.5}
      },"Learn more")
    )
  );
}

// Wraps any field group and shows an InlineHint when any descendant has focus.
// Uses the setTimeout pattern to avoid flickering when focus moves between
// children (e.g. from a select to the Learn more button).
function FieldWithHint({hint,topic,children}){
  var _f=React.useState(false);var focused=_f[0];var setFocused=_f[1];
  var timer=React.useRef(null);
  React.useEffect(function(){return function(){clearTimeout(timer.current);};}, []);
  return React.createElement("div",{
    onFocus:function(){clearTimeout(timer.current);setFocused(true);},
    onBlur:function(){timer.current=setTimeout(function(){setFocused(false);},0);}
  },
    children,
    React.createElement(InlineHint,{visible:focused,text:hint,topic:topic})
  );
}

function Section({title,children,isOpen,onToggle,defaultOpen=true,badge=null}){
  const[o,sO]=React.useState(defaultOpen);

  const isControlled = isOpen !== undefined && onToggle !== undefined;
  const currentOpen = isControlled ? isOpen : o;

  const handleToggle = () => {
    if (isControlled) {
      onToggle(!currentOpen);
    } else {
      sO(!currentOpen);
    }
  };

  return React.createElement("div", {style:{borderRadius:'var(--radius-xl)',border:"0.5px solid var(--border)",background:"var(--surface)",overflow:"hidden"}},
    React.createElement("button", {type:"button",onClick:handleToggle, style:{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"none",border:"none",cursor:"pointer",fontSize:'var(--text-md)',fontWeight:600,color:"var(--text-primary)",gap:'var(--s-2)'}},
      React.createElement("span", {style:{display:"flex",alignItems:"center",gap:'var(--s-2)'}}, title, badge),
      React.createElement("span", {style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,color:"var(--text-tertiary)",transform:currentOpen?"rotate(180deg)":"rotate(0deg)"},"aria-hidden":"true"}, window.Icons && window.Icons.chevronDown ? window.Icons.chevronDown() : null)
    ),
    currentOpen&&React.createElement("div", {style:{padding:"0 16px 16px"}}, children)
  );
}
var SliderRow=React.memo(function SliderRow({label,value,min,max,step=1,onChange,suffix="",format=null,helpText=null,inlineHint=null,helpTopic=null}){
  var _f=React.useState(false);var focused=_f[0];var setFocused=_f[1];
  var timer=React.useRef(null);
  React.useEffect(function(){return function(){clearTimeout(timer.current);};}, []);
  return React.createElement("div", {style:{marginBottom:2}},
    React.createElement("div", {style:{display:"flex",justifyContent:"space-between",fontSize:'var(--text-sm)',color:"var(--text-secondary)",marginBottom:3}},
      React.createElement("span", {style:{display:"flex",alignItems:"center",gap:3}}, label, helpText&&React.createElement(InfoIcon,{text:helpText})),
      React.createElement("span", {style:{fontWeight:600,color:"var(--text-primary)"}}, format?format(value):value, suffix)
    ),
    React.createElement("input", {type:"range", min:min, max:max, step:step, value:value, onChange:e=>onChange(Number(e.target.value)), style:{width:"100%"},
      onFocus:inlineHint?function(){clearTimeout(timer.current);setFocused(true);}:undefined,
      onBlur:inlineHint?function(){timer.current=setTimeout(function(){setFocused(false);},0);}:undefined
    }),
    inlineHint&&React.createElement(InlineHint,{visible:focused,text:inlineHint,topic:helpTopic})
  );
});

// ═══ Stats Components ═══

var ProgressRing=React.memo(function ProgressRing({percent, size}){
  size = size || 56;
  var r = (size / 2) - 4;
  var circumference = 2 * Math.PI * r;
  var offset = circumference * (1 - Math.min(percent || 0, 100) / 100);
  return React.createElement("div", {className:"progress-ring", style:{width:size, height:size}},
    React.createElement("svg", {viewBox:"0 0 "+size+" "+size, width:size, height:size},
      React.createElement("circle", {cx:size/2, cy:size/2, r:r, fill:"none", stroke:"var(--border)", strokeWidth:"3"}),
      React.createElement("circle", {cx:size/2, cy:size/2, r:r, fill:"none", stroke:"var(--accent)", strokeWidth:"3",
        strokeDasharray:circumference, strokeDashoffset:offset,
        transform:"rotate(-90 "+size/2+" "+size/2+")", strokeLinecap:"round"})
    ),
    React.createElement("span", {className:"progress-ring-label"}, Math.round(percent || 0) + "%")
  );
});

var MiniStatsBar=React.memo(function MiniStatsBar({statsSessions, totalCompleted, totalStitches, statsSettings, onOpenStats, currentAutoSession}){
    var dayEndHour = (statsSettings && statsSettings.dayEndHour) || 0;
    var todayStitches = getStatsTodayStitches(statsSessions || [], dayEndHour);
    var todaySeconds = getStatsTodaySeconds(statsSessions || [], dayEndHour);
    var dailyGoal = statsSettings && statsSettings.dailyGoal;
    var percent = totalStitches > 0 ? Math.round((totalCompleted / totalStitches) * 1000) / 10 : 0;
    var liveTodayStitches = todayStitches;
    var liveTodaySeconds = todaySeconds;
    if (currentAutoSession) {
      liveTodayStitches += ((currentAutoSession.stitchesCompleted||0) - (currentAutoSession.stitchesUndone||0));
      var elapsed = Math.round((Date.now() - new Date(currentAutoSession.startTime).getTime() - (currentAutoSession.totalPausedMs||0)) / 1000);
      liveTodaySeconds += Math.max(0, elapsed);
    }
    var streaks = computeStreaks(statsSessions || [], dayEndHour);
    var isStreakRecord = streaks.current > 0 && streaks.current >= streaks.longest;
    var weeklyGoal = statsSettings && statsSettings.weeklyGoal;
    var monthlyGoal = statsSettings && statsSettings.monthlyGoal;
    var liveExtra = currentAutoSession ? ((currentAutoSession.stitchesCompleted||0) - (currentAutoSession.stitchesUndone||0)) : 0;
    var activeGoal = null;
    if (dailyGoal > 0) {
      var gPct = liveTodayStitches / dailyGoal * 100;
      activeGoal = {label: 'Today', current: liveTodayStitches, target: dailyGoal, pct: gPct, met: liveTodayStitches >= dailyGoal};
    } else if (weeklyGoal > 0) {
      var weekSt = getStatsThisWeekStitches(statsSessions || [], dayEndHour) + liveExtra;
      var gPct = weekSt / weeklyGoal * 100;
      activeGoal = {label: 'This week', current: weekSt, target: weeklyGoal, pct: gPct, met: weekSt >= weeklyGoal};
    } else if (monthlyGoal > 0) {
      var monthSt = getStatsThisMonthStitches(statsSessions || [], dayEndHour) + liveExtra;
      var gPct = monthSt / monthlyGoal * 100;
      activeGoal = {label: 'This month', current: monthSt, target: monthlyGoal, pct: gPct, met: monthSt >= monthlyGoal};
    }
    var statsBar = React.createElement("div", {className:"mini-stats-bar"},
      React.createElement(ProgressRing, {percent:percent, size:36}),
      React.createElement("div", {className:"mini-stats-text"},
        (liveTodayStitches > 0 || dailyGoal > 0) && React.createElement("span", {className:"mini-today"},
          "Today: " + liveTodayStitches + " stitch" + (liveTodayStitches !== 1 ? "es" : "")
        ),
        React.createElement("span", {className:"mini-stats-time"}, formatStatsDuration(liveTodaySeconds))
      ),
      streaks.current > 0 && React.createElement("span", {className:"mini-streak" + (isStreakRecord ? " mini-streak--record" : "")},
        React.createElement("span", {style:{display:"inline-flex", alignItems:"center", gap:"0.25em"}}, Icons.fire(), " " + streaks.current + " day" + (streaks.current !== 1 ? "s" : ""))),
      React.createElement("button", {className:"mini-stats-btn", onClick:onOpenStats}, "Stats")
    );
    if (!activeGoal) return statsBar;
    return React.createElement("div", {className:"mini-stats-wrapper"},
      statsBar,
      React.createElement("div", {className:"mini-goal", onClick:onOpenStats},
        React.createElement("span", {className:"mini-goal-label"}, activeGoal.label + ":"),
        React.createElement("span", {className:"mini-goal-count"}, activeGoal.current.toLocaleString() + " / " + activeGoal.target.toLocaleString(), activeGoal.met && window.Icons && window.Icons.check ? React.createElement("span", {style:{display:"inline-flex",alignItems:"center",marginLeft:4}}, window.Icons.check()) : null),
        React.createElement("div", {className:"mini-goal-track"},
          React.createElement("div", {className:"mini-goal-fill" + (activeGoal.met ? " mini-goal-fill--done" : ""), style:{width:Math.min(100,activeGoal.pct)+'%'}})
        )
      )
    );
});

var OverviewCards=React.memo(function OverviewCards({statsSessions, totalCompleted, totalStitches, halfStitchCounts, useActiveDays}){
  var stats = computeOverviewStats(statsSessions || [], totalCompleted, totalStitches, useActiveDays);
  var hasHalf = halfStitchCounts && halfStitchCounts.total > 0;
  return React.createElement("div", {className:"stats-overview"},
    React.createElement("div", {className:"stats-overview-main"},
      React.createElement(ProgressRing, {percent:stats.percent, size:56}),
      React.createElement("div", null,
        React.createElement("span", {className:"stats-big-number"}, totalCompleted.toLocaleString()),
        React.createElement("span", {className:"stats-label"}, " of " + totalStitches.toLocaleString() + " stitches"),
        hasHalf && React.createElement("span", {className:"stats-sublabel"}, halfStitchCounts.done.toLocaleString() + " / " + halfStitchCounts.total.toLocaleString() + " half stitches (\xbd\xd7)")
      )
    ),
    React.createElement("div", {className:"stats-overview-grid"},
      React.createElement("div", null, React.createElement("span", {className:"stats-label"}, "Speed"), React.createElement("span", {className:"stats-value"}, stats.stitchesPerHour + "/hr")),
      React.createElement("div", null, React.createElement("span", {className:"stats-label"}, "Time stitched"), React.createElement("span", {className:"stats-value"}, stats.totalTimeFormatted)),
      React.createElement("div", null, React.createElement("span", {className:"stats-label"}, "Est. finish"), React.createElement("span", {className:"stats-value"}, stats.estimatedCompletion), stats.hoursRemaining != null && React.createElement("span", {className:"stats-sublabel"}, (stats.hoursRemaining < 1 ? '< 1' : '~' + Math.ceil(stats.hoursRemaining)) + (Math.ceil(stats.hoursRemaining) === 1 ? ' hr' : ' hrs') + ' stitching')),
      React.createElement("div", null, React.createElement("span", {className:"stats-label"}, "Sessions"), React.createElement("span", {className:"stats-value"}, (statsSessions||[]).length))
    )
  );
});

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

function SessionTimeline({sessions, statsSettings, onEditNote, palette}){
  var showSt = React.useState(false);
  var showAll = showSt[0], setShowAll = showSt[1];
  var editSt = React.useState(null);
  var editingId = editSt[0], setEditingId = editSt[1];
  var colourMap = {};
  if (palette) { for (var pi = 0; pi < palette.length; pi++) { var pc = palette[pi]; if (pc.id && pc.rgb) colourMap[pc.id] = pc; } }
  var grouped = groupSessionsByDate(sessions || []);
  var sortedDates = Object.keys(grouped).sort().reverse();
  var displayDates = showAll ? sortedDates : sortedDates.slice(0, 10);
  var dayEndHour = (statsSettings && statsSettings.dayEndHour) || 0;
  var children = [];
  if (!sessions || sessions.length === 0) {
    children.push(React.createElement("p", {key:"empty", style:{fontSize:'var(--text-md)', color:'var(--text-tertiary)'}}, "No sessions recorded yet. Start stitching to see your journal!"));
  }
  var timelineEntries = [];
  for (var di = 0; di < displayDates.length; di++) {
    var date = displayDates[di];
    var daySessions = grouped[date].slice().reverse();
    for (var si = 0; si < daySessions.length; si++) {
      var session = daySessions[si];
      var contentChildren = [
        React.createElement("span", {key:"date", className:"timeline-date"}, formatRelativeDate(session.date, dayEndHour) + ", " + formatTimeRange(session.startTime, session.endTime)),
        React.createElement("div", {key:"stats", className:"timeline-stats"},
          React.createElement("span", {className:"timeline-stitches"}, session.netStitches + " stitches"),
          React.createElement("span", {className:"timeline-duration"}, formatStatsDuration(getSessionSeconds(session)))
        )
      ];
      if (session.coloursWorked && session.coloursWorked.length > 0) {
        var chips = session.coloursWorked.slice(0, 14).map(function(cid) {
          var cm = colourMap[cid];
          var rgb = cm ? cm.rgb : [128, 128, 128];
          return React.createElement("span", {key:cid, title:"DMC " + cid, style:{display:'inline-block',width:10,height:10,borderRadius:2,background:'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')',border:'1px solid rgba(0,0,0,0.15)',flexShrink:0}});
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
        contentChildren.push(React.createElement("button", {key:"add-note", className:"timeline-add-note", onClick:(function(id){ return function(){ setEditingId(id); }; })(sid)}, session.note ? 'Edit note' : 'Add note'));
      }
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
    !showAll && sessions && sessions.length > 10 && React.createElement("button", {className:"timeline-show-all", onClick:function(){ setShowAll(true); }}, "View all " + sessions.length + " sessions")
  );
}

// ═══ Phase B: Charts & Milestones ═══

var CumulativeChart=React.memo(function CumulativeChart({sessions, totalStitches, targetDate, whatIfPace}){
  var data = getCumulativeProgressData(sessions);
  if (data.length < 2) return React.createElement("p", {className:"stats-empty"}, "Start stitching to see your progress chart");
  var width = 600, height = 130;
  var pl = 36, pr = 8, pt = 8, pb = 4;
  var cW = width - pl - pr, cH = height - pt - pb;
  var maxY = Math.max(totalStitches, 1);
  var yS = function(v){ return pt + cH - (v / maxY) * cH; };
  var last = data[data.length - 1];
  var mid = data[Math.floor(data.length / 2)];
  var firstDate = new Date(data[0].date + 'T12:00:00');
  var lastDate = new Date(last.date + 'T12:00:00');
  // Compute what-if end date so we can extend the time axis to fit the projection
  var wiRemaining = totalStitches - last.total;
  var wiDays = (whatIfPace > 0 && wiRemaining > 0) ? wiRemaining / whatIfPace : 0;
  var wiEndDate = wiDays > 0 ? new Date(lastDate.getTime() + wiDays * 86400000) : null;
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
    wiLine = React.createElement("line", {x1:lastX, y1:yS(last.total), x2:xDate(wiEndDate), y2:yS(totalStitches), stroke:"var(--warning)", strokeWidth:"1.5", strokeDasharray:"5 3"});
  }
  return React.createElement("div", {className:"chart-container"},
    React.createElement("svg", {role:"img","aria-label":"Cumulative progress chart",viewBox:"0 0 " + width + " " + height, width:"100%", style:{display:'block'}},
      React.createElement("text", {x:pl - 4, y:pt + 6, textAnchor:"end", fontSize:"9", fill:"var(--text-tertiary)"}, formatCompact(totalStitches)),
      React.createElement("text", {x:pl - 4, y:pt + cH / 2 + 3, textAnchor:"end", fontSize:"9", fill:"var(--text-tertiary)"}, formatCompact(totalStitches / 2)),
      React.createElement("text", {x:pl - 4, y:pt + cH, textAnchor:"end", fontSize:"9", fill:"var(--text-tertiary)"}, "0"),
      React.createElement("line", {x1:pl, y1:pt + cH / 2, x2:width - pr, y2:pt + cH / 2, stroke:"var(--border)", strokeWidth:"0.5", strokeDasharray:"4 4"}),
      React.createElement("line", {x1:xDate(firstDate), y1:yS(0), x2:paceEndX, y2:paceEndY, stroke:"#CFC4AC", strokeWidth:"1", strokeDasharray:"4 4"}),
      wiLine,
      React.createElement("polygon", {points:fillPoints, fill:"#534AB7", opacity:"0.08"}),
      React.createElement("polyline", {points:points, fill:"none", stroke:"#534AB7", strokeWidth:"2.5", strokeLinecap:"round", strokeLinejoin:"round"}),
      React.createElement("circle", {cx:lastX, cy:yS(last.total), r:"4", fill:"#534AB7"}),
      React.createElement("line", {x1:pl, y1:pt + cH, x2:width - pr, y2:pt + cH, stroke:"var(--border)", strokeWidth:"0.5"})
    ),
    React.createElement("div", {className:"chart-x-labels"},
      React.createElement("span", null, formatShortDate(data[0].date)),
      React.createElement("span", null, formatShortDate(mid.date)),
      React.createElement("span", null, formatShortDate(last.date))
    ),
    React.createElement("div", {className:"chart-legend"},
      React.createElement("span", null, React.createElement("span", {className:"legend-line solid"}), "Actual"),
      React.createElement("span", null, React.createElement("span", {className:"legend-line dashed"}), paceLabel),
      wiLine ? React.createElement("span", null, React.createElement("span", {className:"legend-line dashed", style:{borderColor:'var(--warning)'}}), "What-if") : null
    )
  );
});

var DailyBarChart=React.memo(function DailyBarChart({sessions, dailyGoal, daysToShow, dayEndHour}){
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
        rx:"2", stroke:d.isToday ? 'var(--accent)' : 'none', strokeWidth:d.isToday ? 1 : 0},
        React.createElement("title", null, formatShortDate(d.date) + ': ' + d.stitches + ' stitches')
      )
    );
  }
  var mid = data[Math.floor(data.length / 2)];
  var svgChildren = [];
  if (dailyGoal) {
    svgChildren.push(React.createElement("line", {key:"goal", x1:0, y1:height - yS(dailyGoal), x2:width, y2:height - yS(dailyGoal), stroke:"var(--accent)", strokeWidth:"2", strokeDasharray:"4 4", opacity:"0.4"}));
    svgChildren.push(React.createElement("text", {key:"goal-lbl", x:width - 4, y:height - yS(dailyGoal) - 4, textAnchor:"end", fontSize:"10", fill:"var(--accent)"}, "Goal: " + dailyGoal));
  }
  svgChildren = svgChildren.concat(barElements);
  return React.createElement("div", {className:"chart-container"},
    React.createElement("div", {style:{position:'relative'}},
      React.createElement("svg", {role:"img","aria-label":"Daily stitches bar chart",viewBox:"0 0 " + width + " " + height, width:"100%", preserveAspectRatio:"none", style:{display:'block'}}, svgChildren)
    ),
    React.createElement("div", {className:"chart-x-labels"},
      React.createElement("span", null, formatShortDate(data[0].date)),
      React.createElement("span", null, formatShortDate(mid.date)),
      React.createElement("span", null, "Today")
    )
  );
});

// ═══ Phase E: Speed Trend Chart ═══

var SpeedTrendChart=React.memo(function SpeedTrendChart({sessions}){
  var raw = getSpeedTrendData(sessions);
  if (raw.length < 3) return React.createElement("p", {className:"stats-empty"}, "Need more sessions (≥10 min each) to show speed trend");
  var data = getRollingAverage(raw);
  var width = 600, height = 130;
  var pl = 42, pr = 8, pt = 8, pb = 4;
  var cW = width - pl - pr, cH = height - pt - pb;
  var maxY = 1;
  for (var i = 0; i < data.length; i++) { if (data[i].speed > maxY) maxY = data[i].speed; }
  maxY = Math.ceil(maxY * 1.15);
  var xS = function(i){ return pl + (i / (data.length - 1)) * cW; };
  var yS = function(v){ return pt + cH - (v / maxY) * cH; };
  // Raw dots
  var dots = [];
  for (var j = 0; j < data.length; j++) {
    dots.push(React.createElement("circle", {key:'d'+j, cx:xS(j), cy:yS(data[j].speed), r:"3", fill:"var(--accent)", opacity:"0.3"},
      React.createElement("title", null, formatShortDate(data[j].date) + ': ' + data[j].speed + ' st/hr')));
  }
  // Smoothed line (only if 3+ points)
  var linePts = [];
  for (var k = 0; k < data.length; k++) linePts.push(xS(k) + ',' + yS(data[k].smoothedSpeed));
  var mid = data[Math.floor(data.length / 2)];
  var last = data[data.length - 1];
  // Y-axis labels
  var yMid = Math.round(maxY / 2);
  return React.createElement("div", {className:"chart-container"},
    React.createElement("svg", {role:"img","aria-label":"Speed trend chart",viewBox:"0 0 " + width + " " + height, width:"100%", style:{display:'block'}},
      React.createElement("text", {x:pl - 4, y:pt + 6, textAnchor:"end", fontSize:"9", fill:"var(--text-tertiary)"}, maxY + '/hr'),
      React.createElement("text", {x:pl - 4, y:pt + cH / 2 + 3, textAnchor:"end", fontSize:"9", fill:"var(--text-tertiary)"}, yMid + '/hr'),
      React.createElement("text", {x:pl - 4, y:pt + cH, textAnchor:"end", fontSize:"9", fill:"var(--text-tertiary)"}, "0"),
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
    ),
    React.createElement("div", {className:"chart-legend"},
      React.createElement("span", null, React.createElement("span", {style:{display:'inline-block', width:8, height:8, borderRadius:'50%', background:'var(--accent)', opacity:0.3, verticalAlign:'middle', marginRight:'var(--s-1)'}}), "Per session"),
      React.createElement("span", null, React.createElement("span", {className:"legend-line solid", style:{borderColor:'var(--accent)'}}), "7-session avg")
    )
  );
});

// ═══ Phase E: Colour Timeline ═══

var ColourTimeline=React.memo(function ColourTimeline({sessions, palette, colourDoneCounts}){
  var timeline = getColourTimeline(sessions);
  if (!palette || palette.length === 0) return null;
  var hasAnyData = false;
  for (var k in timeline) { hasAnyData = true; break; }
  var rows = [];
  for (var i = 0; i < palette.length; i++) {
    var p = palette[i];
    if (p.id === '__skip__' || p.id === '__empty__') continue;
    var tl = timeline[p.id];
    var counts = (colourDoneCounts && colourDoneCounts[p.id]) || {total:0, done:0, halfTotal:0, halfDone:0};
    var totalForColour = counts.total + counts.halfTotal;
    var doneForColour = counts.done + counts.halfDone;
    var isComplete = totalForColour > 0 && doneForColour >= totalForColour;
    var pctDone = totalForColour > 0 ? Math.round((doneForColour / totalForColour) * 100) : 0;
    var rgb = p.rgb || [128, 128, 128];
    var swatchStyle = {width:14, height:14, borderRadius:3, border:'1px solid #CFC4AC', flexShrink:0,
      background:'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'};
    var nameLabel = p.name || p.id;
    var dateInfo = tl
      ? formatShortDate(tl.firstDate) + (tl.lastDate !== tl.firstDate ? ' – ' + formatShortDate(tl.lastDate) : '') + ' · ' + tl.sessionCount + ' session' + (tl.sessionCount !== 1 ? 's' : '')
      : 'No session data';
    rows.push(React.createElement("div", {key:p.id, className:"colour-tl-row" + (isComplete ? ' complete' : '')},
      React.createElement("div", {className:"colour-tl-swatch", style:swatchStyle}),
      React.createElement("div", {className:"colour-tl-info"},
        React.createElement("span", {className:"colour-tl-name"}, nameLabel),
        React.createElement("span", {className:"colour-tl-dates"}, dateInfo)
      ),
      React.createElement("div", {className:"colour-tl-progress"},
        React.createElement("div", {className:"colour-tl-bar"},
          React.createElement("div", {className:"colour-tl-bar-fill", style:{width:pctDone + '%', background:'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'}})
        ),
        React.createElement("span", {className:"colour-tl-pct"}, isComplete ? (window.Icons ? window.Icons.check() : null) : pctDone + '%')
      )
    ));
  }
  return React.createElement("div", {className:"colour-timeline"},
    React.createElement("h3", {className:"stats-section-title"}, "Colour Timeline"),
    !hasAnyData && React.createElement("p", {className:"stats-empty", style:{marginTop:'var(--s-2)'}}, "Colour tracking data will appear as you stitch"),
    React.createElement("div", {className:"colour-tl-list"}, rows)
  );
});

// ═══ Phase E: Monthly Calendar view ═══

var MonthCalendar = React.memo(function MonthCalendar({sessions}) {
  var _mo = React.useState(0); var monthOffset = _mo[0], setMonthOffset = _mo[1];
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
        dailyMap[s.date] = (dailyMap[s.date] || 0) + s.netStitches;
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
    cells.push(React.createElement("div", {key:dateStr, title:dateStr + ': ' + stitches + ' stitches',
      style:{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'3px 2px',
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
    React.createElement("div", {style:{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',gap:2}}, cells)
  );
});

function StatsChartSection({statsSessions, statsSettings, totalStitches, chartView, setChartView, overviewStats, totalCompleted}){
  var dayEndHour = (statsSettings && statsSettings.dayEndHour) || 0;
  var dailyGoal = statsSettings && statsSettings.dailyGoal;
  var targetDate = statsSettings && statsSettings.targetDate;
  var _whatIf = React.useState(null);
  var whatIfPace = _whatIf[0], setWhatIfPace = _whatIf[1];
  var defaultPace = (overviewStats && overviewStats.avgPerDay) || 50;
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
      ? React.createElement(CumulativeChart, {sessions:statsSessions, totalStitches:totalStitches, targetDate:targetDate, whatIfPace:paceVal})
      : chartView === 'speed'
        ? React.createElement(SpeedTrendChart, {sessions:statsSessions})
        : chartView === 'calendar'
          ? React.createElement(MonthCalendar, {sessions:statsSessions})
          : React.createElement(DailyBarChart, {sessions:statsSessions, dailyGoal:dailyGoal, dayEndHour:dayEndHour}),
    chartView === 'cumulative' && overviewStats && remaining > 0
      ? React.createElement("div", {style:{display:'flex', alignItems:'center', gap:'var(--s-2)', padding:'6px 0 0', flexWrap:'wrap'}},
          React.createElement("span", {style:{fontSize:'var(--text-sm)', color:'var(--text-tertiary)'}}, "What-if pace:"),
          React.createElement("input", {type:"range", min:1, max:Math.max(defaultPace * 5, 500), value:paceVal, step:1,
            onChange:function(e){ setWhatIfPace(parseInt(e.target.value)); }, style:{width:110, cursor:'pointer'}}),
          React.createElement("span", {style:{fontSize:'var(--text-sm)', fontWeight:600, color:'var(--warning)', minWidth:120}},
            paceVal + " st/day \u2192 ~" + Math.ceil(remaining / paceVal) + " days"),
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
    badges.push(React.createElement("div", {key:m.percent, className:cls},
      React.createElement("span", {className:"milestone-percent"}, m.percent + '%'),
      React.createElement("span", {className:"milestone-date"}, dateLabel)
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
        placeholder:"e.g. 300", className:"goal-input"}),
      React.createElement("button", {className:"goal-set-btn", onClick:function(){
        var v = parseInt(value, 10);
        onSet(v > 0 ? v : null);
      }}, value && parseInt(value, 10) > 0 ? 'Set goal' : 'Clear goal')
    ),
    presets.length > 0 && React.createElement("div", {className:"goal-presets"},
      presets.map(function(p){ return React.createElement("button", {type:"button",key:p.label, className:"goal-preset-btn" + (currentGoal === p.value ? ' active' : ''), onClick:function(){ setValue(String(p.value)); onSet(p.value); }}, p.label + ' (' + p.value + ')'); })
    ),
    currentGoal && remaining > 0 && React.createElement("p", {className:"goal-suggestion"},
      "At " + currentGoal + "/day, you\u2019d finish in ~" + Math.ceil(remaining / currentGoal) + " stitching days")
  );
}

function TargetDateSetting({currentTarget, remaining, avgPerDay, onSet}){
  var st = React.useState(currentTarget || '');
  var date = st[0], setDate = st[1];
  React.useEffect(function(){ setDate(currentTarget || ''); }, [currentTarget]);

  var paceNeeded = date ? getRequiredPace(remaining, date) : null;
  var todayStr = new Date().toISOString().slice(0, 10);

  return React.createElement("div", {className:"target-setting"},
    React.createElement("label", {className:"goal-label"}, "Target completion date"),
    React.createElement("div", {className:"goal-input-row"},
      React.createElement("input", {type:"date", value:date, min:todayStr,
        onChange:function(e){ setDate(e.target.value); },
        className:"goal-input"}),
      React.createElement("button", {type:"button",className:"goal-set-btn", onClick:function(){ onSet(date || null); }},
        date ? 'Set target' : 'Clear target')
    ),
    paceNeeded && React.createElement("p", {className:"goal-suggestion"},
      "You\u2019d need ", React.createElement("strong", null, paceNeeded + " stitches/day"), " to finish by then")
  );
}

function GoalTracker({statsSettings, statsSessions, totalCompleted, totalStitches, overviewStats, onUpdateSettings}){
  var dailyGoal = statsSettings && statsSettings.dailyGoal;
  var weeklyGoal = statsSettings && statsSettings.weeklyGoal;
  var monthlyGoal = statsSettings && statsSettings.monthlyGoal;
  var targetDate = statsSettings && statsSettings.targetDate;
  var dayEndHour = (statsSettings && statsSettings.dayEndHour) || 0;
  var useActiveDays = statsSettings && statsSettings.useActiveDays !== false;
  var todayStitches = getStatsTodayStitches(statsSessions || [], dayEndHour);
  var weekStitches = getStatsThisWeekStitches(statsSessions || [], dayEndHour);
  var monthStitches = getStatsThisMonthStitches(statsSessions || [], dayEndHour);
  var remaining = totalStitches - totalCompleted;
  var requiredPace = targetDate ? getRequiredPace(remaining, targetDate) : null;
  var avgPerDay = overviewStats ? overviewStats.avgPerDay : 0;
  var activeDays = overviewStats ? overviewStats.activeDays : 0;
  var elapsedDays = overviewStats ? overviewStats.elapsedDays : 0;

  function goalRow(label, current, goal){
    var pct = Math.min(100, goal > 0 ? (current / goal) * 100 : 0);
    var met = current >= goal;
    return React.createElement("div", {className:"goal-progress"},
      React.createElement("div", {className:"goal-row"},
        React.createElement("span", {className:"goal-row-label"}, label),
        React.createElement("span", {className:"goal-row-value" + (met ? ' met' : ' pending')},
          current.toLocaleString() + " / " + goal.toLocaleString() + (met ? ' \u2713' : ''))
      ),
      React.createElement("div", {className:"goal-bar-container"},
        React.createElement("div", {className:"goal-bar-fill", style:{width:pct+'%'}})
      )
    );
  }

  return React.createElement("div", {className:"goal-tracker-panel"},
    React.createElement("h3", {className:"stats-section-title"}, "Goals"),
    React.createElement(DailyGoalSetting, {currentGoal:dailyGoal, avgPerDay:avgPerDay, remaining:remaining,
      onSet:function(v){ onUpdateSettings(Object.assign({}, statsSettings, {dailyGoal:v})); }}),
    dailyGoal && goalRow("Today so far", todayStitches, dailyGoal),
    React.createElement("div", {style:{marginTop:'var(--s-3)'}}),
    React.createElement("label", {className:"goal-label"}, "Weekly stitch goal"),
    React.createElement("div", {className:"goal-input-row"},
      React.createElement("input", {type:"number", min:"0", max:"20000", step:"50",
        className:"goal-input", placeholder:"e.g. 500",
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
        className:"goal-input", placeholder:"e.g. 3000",
        defaultValue: monthlyGoal != null ? String(monthlyGoal) : '',
        key: String(monthlyGoal),
        onBlur:function(e){ var v=parseInt(e.target.value); onUpdateSettings(Object.assign({},statsSettings,{monthlyGoal:v>0?v:null})); }}),
      React.createElement("button", {type:"button",className:"goal-set-btn", onClick:function(){ onUpdateSettings(Object.assign({},statsSettings,{monthlyGoal:null})); }}, "Clear")
    ),
    monthlyGoal && goalRow("This month so far", monthStitches, monthlyGoal),
    activeDays > 0 && React.createElement("div", {className:"goal-pace-context"},
      "Avg pace: " + avgPerDay + "/day (" +
      (useActiveDays
        ? activeDays + " active day" + (activeDays !== 1 ? "s" : "")
        : "over " + elapsedDays + " day" + (elapsedDays !== 1 ? "s" : "")) +
      (useActiveDays && elapsedDays > activeDays ? " of " + elapsedDays + " elapsed" : "") + ")"
    ),
    React.createElement("div", {style:{marginTop:'var(--s-4)'}}),
    React.createElement(TargetDateSetting, {currentTarget:targetDate, remaining:remaining, avgPerDay:avgPerDay,
      onSet:function(v){ onUpdateSettings(Object.assign({}, statsSettings, {targetDate:v})); }}),
    targetDate && requiredPace && React.createElement("div", {className:"goal-progress", style:{marginTop:'var(--s-2)'}},
      React.createElement("div", {className:"goal-row"},
        React.createElement("span", {className:"goal-row-label"}, "Target date"),
        React.createElement("span", {className:"goal-row-value"}, formatShortDate(targetDate))
      ),
      React.createElement("div", {className:"goal-row"},
        React.createElement("span", {className:"goal-row-label"}, "Pace needed"),
        React.createElement("span", {className:"goal-row-value"}, requiredPace + "/day")
      ),
      React.createElement("div", {className:"goal-row"},
        React.createElement("span", {className:"goal-row-label"}, "Status"),
        React.createElement("span", {className:"goal-row-value" + (avgPerDay >= requiredPace ? ' met' : ' pending')},
          avgPerDay >= requiredPace ? 'On track' : 'Behind pace')
      )
    )
  );
}

function StreaksPanel({sessions, dayEndHour}){
  var streaks = computeStreaks(sessions, dayEndHour);
  var bestDay = findBestDay(sessions);
  var avgSession = sessions && sessions.length > 0
    ? Math.round(sessions.reduce(function(sum, s){ return sum + getSessionSeconds(s); }, 0) / sessions.length)
    : 0;

  return React.createElement("div", {className:"streaks-panel"},
    React.createElement("h3", {className:"stats-section-title"}, "Streaks"),
    React.createElement("div", {className:"stat-rows"},
      React.createElement("div", {className:"stat-row"},
        React.createElement("span", {className:"stat-row-label"}, "Current streak"),
        React.createElement("span", {className:"stat-row-value"}, streaks.current + " day" + (streaks.current !== 1 ? 's' : ''))
      ),
      React.createElement("div", {className:"stat-row"},
        React.createElement("span", {className:"stat-row-label"}, "Longest streak"),
        React.createElement("span", {className:"stat-row-value"}, streaks.longest + " day" + (streaks.longest !== 1 ? 's' : ''))
      ),
      React.createElement("div", {className:"stat-row"},
        React.createElement("span", {className:"stat-row-label"}, "Best day"),
        React.createElement("span", {className:"stat-row-value"},
          bestDay ? bestDay.stitches + ' (' + formatShortDate(bestDay.date) + ')' : '\u2014')
      ),
      React.createElement("div", {className:"stat-row"},
        React.createElement("span", {className:"stat-row-label"}, "Avg session"),
        React.createElement("span", {className:"stat-row-value"}, formatStatsDuration(avgSession))
      )
    )
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

function ColourProgress({palette, colourDoneCounts, sessions}){
    if (!palette || palette.length === 0) return null;
    var colourStats = [];
    var coloursComplete = 0;
    for (var i = 0; i < palette.length; i++) {
      var p = palette[i];
      if (p.id === '__skip__' || p.id === '__empty__') continue;
      var dc = (colourDoneCounts && colourDoneCounts[p.id]) || {total:0, done:0};
      var remaining = Math.max(0, dc.total - dc.done);
      var pct = dc.total > 0 ? Math.round(dc.done / dc.total * 100) : 0;
      if (remaining === 0 && dc.total > 0) coloursComplete++;
      colourStats.push({id:p.id, name:p.name, type:p.type, threads:p.threads, rgb:p.rgb, remaining:remaining, pct:pct, total:dc.total, halfTotal:dc.halfTotal||0, halfDone:dc.halfDone||0});
    }
    colourStats.sort(function(a,b){ return b.remaining - a.remaining; });
    var avgSessionStitches = 0;
    if (sessions && sessions.length > 0) {
      var recentSess = sessions.slice(-10);
      var totalSt = recentSess.reduce(function(sum, r) { return sum + r.netStitches; }, 0);
      avgSessionStitches = totalSt / recentSess.length;
    }
    var totalColours = colourStats.length;
    var inProgress = colourStats.filter(function(c){ return c.remaining > 0; });
    var mostRemaining = inProgress[0];
    var leastRemaining = inProgress[inProgress.length - 1];
    return React.createElement("div", {className:"colour-progress"},
      React.createElement("h3", {className:"stats-section-title"}, "Colour Progress"),
      React.createElement("div", {className:"stats-colour-summary"},
        React.createElement("span", null, coloursComplete + " / " + totalColours + " colour" + (totalColours !== 1 ? "s" : "") + " complete"),
        mostRemaining && React.createElement("span", null,
          "Most remaining: DMC " + mostRemaining.id + " (" + mostRemaining.remaining.toLocaleString() + " stitches)"),
        leastRemaining && leastRemaining !== mostRemaining && React.createElement("span", null,
          "Least remaining: DMC " + leastRemaining.id + " (" + leastRemaining.remaining.toLocaleString() + " left)")
      ),
      React.createElement("div", {className:"stats-colour-list"},
        colourStats.map(function(c){
          var nameStr = c.type === 'blend' && c.threads ? c.threads[0].name + '+' + c.threads[1].name : c.name;
          var rgb = c.rgb || [128,128,128];
          return React.createElement("div", {key:c.id, className:"stats-colour-row"},
            React.createElement("span", {className:"colour-swatch", style:{background:'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')'}}),
            React.createElement("span", {className:"colour-id"}, "DMC " + c.id),
            React.createElement("span", {className:"colour-name"}, nameStr),
            React.createElement("div", {className:"colour-bar"},
              React.createElement("div", {className:"colour-bar-fill", style:{width:c.pct+'%'}})
            ),
            React.createElement("span", {className:"colour-remaining"}, c.remaining === 0 ? (c.halfTotal > 0 && c.halfDone < c.halfTotal ? c.halfTotal - c.halfDone + " half left" : "\u2713") : c.remaining.toLocaleString() + " left" + (c.halfTotal > 0 && c.halfDone < c.halfTotal ? " + " + (c.halfTotal - c.halfDone) + " half" : "")),
            avgSessionStitches > 0 && c.remaining > 0 ? React.createElement("span", {style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',whiteSpace:'nowrap'}}, "~" + Math.ceil(c.remaining / avgSessionStitches) + " sessions") : null
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

  return React.createElement("div",{style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'var(--s-4)'}},
    React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}},
      React.createElement("h4",{style:{fontSize:'var(--text-lg)',fontWeight:600,color:'var(--text-primary)',margin:0}},"Sections"),
      numX>0&&React.createElement("span",{style:{fontSize:'var(--text-sm)',color:'var(--text-tertiary)'}},complete+" / "+(sections?sections.length:0)+" complete")
    ),
    React.createElement("p",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',margin:'0 0 8px',lineHeight:1.4}},canEdit?"Click a section to see its threads · click again to rename":"Click a section to see its threads"),
    sections&&sections.length>0&&React.createElement("div",{className:"section-grid",style:{display:'grid',gridTemplateColumns:'repeat('+numX+', 1fr)',gap:3,marginBottom:'var(--s-3)'}},
      sections.map(function(sec){
        var cellKey=sec.sx+','+sec.sy;
        var customLabel=sectionLabels[cellKey]||null;
        var isEditing=editingKey===cellKey;
        var isSelected=selectedKey===cellKey;
        var fs=Math.max(8,Math.min(11,Math.floor(60/numX)));
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
                style:{width:'90%',fontSize:Math.max(7,fs-1),padding:'1px 2px',border:'1px solid #fff',borderRadius:2,textAlign:'center',background:'rgba(255,255,255,0.9)',color:'var(--text-primary)'},
                onClick:function(e){e.stopPropagation();}
              })
            : [
                React.createElement("span",{key:'pct'},sec.pct+"%"),
                customLabel&&React.createElement("span",{key:'lbl',style:{fontSize:Math.max(6,fs-2),overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%',textAlign:'center',padding:'0 1px',opacity:0.9}},customLabel),
                sec.isDone&&!customLabel&&React.createElement("span",{key:'done',style:{fontSize:Math.max(7,Math.min(10,Math.floor(55/numX)))}},"\u2713")
              ]
        );
      })
    ),
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
              var rgb=cm?cm.rgb:[128,128,128];
              var name=cm?cm.name:('DMC '+t.id);
              var remaining=t.total-t.doneCount;
              var pct=t.total>0?Math.round(t.doneCount/t.total*100):100;
              return React.createElement("div",{key:t.id,style:{display:'flex',alignItems:'center',gap:6}},
                React.createElement("span",{style:{width:12,height:12,borderRadius:2,background:'rgb('+rgb[0]+','+rgb[1]+','+rgb[2]+')',border:'1px solid rgba(0,0,0,0.15)',flexShrink:0,display:'inline-block'}}),
                React.createElement("span",{style:{fontSize:'var(--text-xs)',color:'var(--text-secondary)',minWidth:32,flexShrink:0}},"#"+t.id),
                React.createElement("div",{style:{flex:1,height:6,background:'var(--border)',borderRadius:3,overflow:'hidden'}},
                  React.createElement("div",{style:{width:pct+'%',height:'100%',background:t.doneCount===t.total?'var(--success)':'var(--accent)',borderRadius:3}})
                ),
                React.createElement("span",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',flexShrink:0,minWidth:70,textAlign:'right'}},
                  remaining>0?(remaining.toLocaleString()+' left'):'\u2713 done'
                )
              );
            })
          )
    ),
    sections&&sections.length===0&&React.createElement("p",{style:{fontSize:'var(--text-md)',color:'var(--text-tertiary)',margin:0}},"No pattern loaded"),
    React.createElement("div",{style:{display:'flex',alignItems:'center',gap:'var(--s-2)',fontSize:'var(--text-sm)',color:'var(--text-tertiary)',marginTop:'var(--s-1)'}},
      "Section size:",
      React.createElement("input",{type:"number",min:5,max:200,value:secCols,disabled:!canEdit,onChange:function(e){if(!canEdit)return;var v=Math.max(5,Math.min(200,parseInt(e.target.value)||50));onUpdateSettings(Object.assign({},statsSettings,{sectionCols:v}));},style:{width:52,padding:'2px 6px',fontSize:'var(--text-sm)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)'}}),
      " by ",
      React.createElement("input",{type:"number",min:5,max:200,value:secRows,disabled:!canEdit,onChange:function(e){if(!canEdit)return;var v=Math.max(5,Math.min(200,parseInt(e.target.value)||50));onUpdateSettings(Object.assign({},statsSettings,{sectionRows:v}));},style:{width:52,padding:'2px 6px',fontSize:'var(--text-sm)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)'}}),
      "stitches",
      React.createElement("button",{type:"button",disabled:!canEdit,onClick:function(){if(!canEdit)return;onUpdateSettings(Object.assign({},statsSettings,{sectionCols:50,sectionRows:50}));},style:{fontSize:'var(--text-xs)',padding:'2px 8px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',background:'var(--surface-secondary)',cursor:canEdit?'pointer':'default',color:'var(--text-tertiary)',opacity:canEdit?1:0.6}},"Reset")
    )
  );
}

// ═══ Visual Progress: Before/After comparison ═══
function ComparisonView({doneSnapshots, setDoneSnapshots, done, pat, sW, sH}){
  var selSt=React.useState(null);var selectedId=selSt[0],setSelectedId=selSt[1];
  var diffSt=React.useState(false);var showDiff=diffSt[0],setShowDiff=diffSt[1];
  var labelSt=React.useState('');var labelText=labelSt[0],setLabelText=labelSt[1];
  var leftCanvasRef=React.useRef(null);
  var rightCanvasRef=React.useRef(null);
  var diffCanvasRef=React.useRef(null);

  var snap=selectedId?(doneSnapshots||[]).find(function(s){return s.id===selectedId;}):null;

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
    if(s.label!=='auto')return s.label;
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
    if(!pat||!done||!rightCanvasRef.current)return;
    renderComparisonCanvas(rightCanvasRef.current,pat,sW,sH,done);
  },[done,pat,sW,sH]);

  React.useEffect(function(){
    if(!pat)return;
    var snapDone=snap?decompressSnap(snap.data):null;
    if(snapDone&&leftCanvasRef.current)renderComparisonCanvas(leftCanvasRef.current,pat,sW,sH,snapDone);
    if(snapDone&&showDiff&&diffCanvasRef.current)renderDiffCanvas(diffCanvasRef.current,pat,sW,sH,snapDone,done||new Uint8Array(pat.length));
  },[snap,done,pat,sW,sH,showDiff]);

  function saveManualSnapshot(){
    if(!done||!pat)return;
    var l=labelText.trim()||'Snapshot';
    try{
      var data=uint8ToBase64(pako.deflate(done));
      var today=new Date().toISOString().slice(0,10);
      var doneCount=0;for(var i=0;i<done.length;i++)if(done[i])doneCount++;
      var newSnap={id:'snap_'+Date.now(),date:today,label:l,doneCount:doneCount,data:data};
      setDoneSnapshots(function(prev){
        var updated=[...prev,newSnap];
        var labelled=updated.filter(function(s){return s.label!=='auto';});
        var autos=updated.filter(function(s){return s.label==='auto';}).slice(-60);
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

  var canvasW=pat?Math.min(3,Math.floor(300/Math.max(sW,sH)))*sW:0;
  var canvasH=pat?Math.min(3,Math.floor(300/Math.max(sW,sH)))*sH:0;

  return React.createElement("div",{style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',padding:'var(--s-4)'}},
    React.createElement("h4",{style:{fontSize:'var(--text-lg)',fontWeight:600,color:'var(--text-primary)',margin:'0 0 10px'}},"Before / After Comparison"),
    React.createElement("div",{style:{display:'flex',gap:'var(--s-2)',marginBottom:10,flexWrap:'wrap',alignItems:'center'}},
      React.createElement("select",{value:selectedId||'',onChange:function(e){setSelectedId(e.target.value||null);},style:{fontSize:'var(--text-sm)',padding:'4px 8px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',flex:'1',minWidth:0}},
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
    snap&&React.createElement("div",{style:{fontSize:'var(--text-sm)',color:'var(--text-tertiary)',marginBottom:'var(--s-2)'}},
      "Since "+snap.date+": ",
      React.createElement("strong",{style:{color:diff>=0?'var(--success)':'var(--danger)'}},(diff>=0?'+':'')+diff+" stitches")
    ),
    React.createElement("div",{style:{display:'flex',gap:'var(--s-3)',flexWrap:'wrap',justifyContent:'center'}},
      React.createElement("div",{style:{textAlign:'center'}},
        React.createElement("div",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',marginBottom:'var(--s-1)'}},snap?snapLabel(snap):'Select snapshot'),
        React.createElement("canvas",{ref:leftCanvasRef,role:"img","aria-label":snap?("Snapshot from "+snap.date):"Snapshot (none selected)",style:{border:'1px solid var(--border)',borderRadius:4,background:'var(--surface-secondary)',width:canvasW,height:canvasH,display:'block'}})
      ),
      showDiff&&snap&&React.createElement("div",{style:{textAlign:'center'}},
        React.createElement("div",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',marginBottom:'var(--s-1)'}},"New stitches"),
        React.createElement("canvas",{ref:diffCanvasRef,role:"img","aria-label":"Changes since snapshot",style:{border:'1px solid var(--border)',borderRadius:4,background:'var(--surface-secondary)',width:canvasW,height:canvasH,display:'block'}})
      ),
      React.createElement("div",{style:{textAlign:'center'}},
        React.createElement("div",{style:{fontSize:'var(--text-xs)',color:'var(--text-tertiary)',marginBottom:'var(--s-1)'}},"Now"),
        React.createElement("canvas",{ref:rightCanvasRef,role:"img","aria-label":"Current progress",style:{border:'1px solid var(--border)',borderRadius:4,background:'var(--surface-secondary)',width:canvasW,height:canvasH,display:'block'}})
      )
    ),
    React.createElement("div",{style:{marginTop:'var(--s-3)',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}},
      React.createElement("input",{"aria-label":"Snapshot label",type:'text',value:labelText,onChange:function(e){setLabelText(e.target.value);},placeholder:'Snapshot label (optional)',style:{flex:1,minWidth:120,fontSize:'var(--text-sm)',padding:'4px 8px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)'}}),
      React.createElement("button",{type:"button",onClick:saveManualSnapshot,style:{fontSize:'var(--text-sm)',padding:'4px 12px',borderRadius:'var(--radius-sm)',border:'1px solid var(--accent-border)',background:'var(--surface-secondary)',cursor:'pointer',color:'var(--accent)',fontWeight:600,flexShrink:0,display:'flex',alignItems:'center',gap:'6px'}}, Icons.camera(), "Save snapshot")
    ),
    (doneSnapshots&&doneSnapshots.length===0)&&React.createElement("p",{style:{fontSize:'var(--text-sm)',color:'var(--text-tertiary)',margin:'8px 0 0'}},"No snapshots yet. Snapshots are saved automatically each stitching day, or tap \u201cSave snapshot\u201d to create one now.")
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
        var pct = p.totalStitches > 0 ? Math.round(p.completedStitches / p.totalStitches * 100) : 0;
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
            var pct = p.totalStitches > 0 ? Math.round(p.completedStitches / p.totalStitches * 100) : 0;
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
                w && h ? (w + '\u00D7' + h + ' \u2014 ' + (p.totalStitches || 0).toLocaleString() + ' st') : ((p.totalStitches || 0).toLocaleString() + ' st')
              ),
              React.createElement('td', {style:{padding:'8px 10px', fontSize:'var(--text-sm)', whiteSpace:'nowrap'}},
                React.createElement('span', {style:{color: isComplete ? 'var(--success)' : pct >= 50 ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight:600}}, pct + '%'),
                React.createElement('span', {style:{color:'#CFC4AC', fontSize:'var(--text-xs)', marginLeft:'var(--s-1)'}}, '(' + (p.completedStitches||0).toLocaleString() + '/' + (p.totalStitches||0).toLocaleString() + ')')
              ),
              React.createElement('td', {style:{padding:'8px 10px', fontSize:'var(--text-sm)', color:'var(--text-tertiary)', whiteSpace:'nowrap'}}, p.stitchesPerHour ? p.stitchesPerHour.toLocaleString() + ' st/hr' : '\u2014'),
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
        React.createElement('span', null, React.createElement('strong', null, 'Fastest: '), fastest.name + ' (' + fastest.stitchesPerHour.toLocaleString() + ' st/hr)')
      ),
      largest && React.createElement('div', {className:'comparison-insight-card'},
        React.createElement('span', {className:'comparison-insight-icon'}, Icons.clipboard()),
        React.createElement('span', null, React.createElement('strong', null, 'Largest: '), largest.name + ' (' + (largest.totalStitches||0).toLocaleString() + ' stitches)')
      ),
      closestToDone && React.createElement('div', {className:'comparison-insight-card'},
        React.createElement('span', {className:'comparison-insight-icon'}, Icons.hourglass()),
        React.createElement('span', null, React.createElement('strong', null, 'Closest to done: '), closestToDone.name + ' (' + ((closestToDone.totalStitches||0) - (closestToDone.completedStitches||0)).toLocaleString() + ' remaining)')
      ),
      mostNeglected && React.createElement('div', {className:'comparison-insight-card'},
        React.createElement('span', {className:'comparison-insight-icon'}, Icons.sleep()),
        React.createElement('span', null, React.createElement('strong', null, 'Most neglected: '), mostNeglected.name + ' (last worked ' + relativeDate(mostNeglected.updatedAt).toLowerCase() + ')')
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
    {label: 'Time stitched', value: opts.totalTimeFormatted || '\u2014'},
    {label: 'Sessions', value: String((opts.sessions || []).length)},
    {label: 'Stitches/day', value: String(opts.avgPerDay || 0)},
    {label: 'Day streak', value: String(opts.streak || 0)}
  ];
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
  ctx.fillText('Made with Cross Stitch Pattern Generator', W - 18, H - 7);
}

function StatsDashboard({statsSessions, statsSettings, totalCompleted, totalStitches, halfStitchCounts, onEditNote, onUpdateSettings, onClose, projectName, onShareProgress, onExportCSV, palette, colourDoneCounts, achievedMilestones, done, pat, sW, sH, doneSnapshots, setDoneSnapshots, sections, currentProjectId, onOpenProject, canEdit}){
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
  React.useEffect(function() {
    if (typeof ProjectStorage !== 'undefined') {
      ProjectStorage.listProjects().then(function(list) { setHasMultiProjects(list.length >= 2); }).catch(function(){});
    }
  }, []);
  var useActiveDays = statsSettings && statsSettings.useActiveDays !== false;
  var overviewStats = computeOverviewStats(statsSessions || [], totalCompleted, totalStitches, useActiveDays);
  var milestones = getMilestones(statsSessions || [], totalCompleted, totalStitches, overviewStats.avgPerDay);
  var dayEndHour = (statsSettings && statsSettings.dayEndHour) || 0;

  if (showComparison) {
    return React.createElement(ProjectComparison, {
      currentProjectId: currentProjectId,
      onClose: function() { setShowComparison(false); },
      onOpenProject: onOpenProject
    });
  }

  function handleShare(){
    var text = generateShareText(projectName, overviewStats, statsSessions || [], totalCompleted, totalStitches, dayEndHour);
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
    var streakInfo = computeStreaks(statsSessions || [], dayEndHour);
    drawProgressCard(canvas, {
      projectName: projectName,
      percent: overviewStats.percent,
      totalTimeFormatted: overviewStats.totalTimeFormatted,
      sessions: statsSessions || [],
      avgPerDay: overviewStats.avgPerDay,
      streak: streakInfo.currentStreak,
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
      URL.revokeObjectURL(url);
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
    React.createElement(OverviewCards, {statsSessions:statsSessions, totalCompleted:totalCompleted, totalStitches:totalStitches, halfStitchCounts:halfStitchCounts, useActiveDays:useActiveDays}),
    React.createElement("div", {className:"stats-export-bar"},
      React.createElement("button", {type:"button",className:"stats-export-btn stats-export-btn--share", onClick:handleShare, style:{display:'flex', alignItems:'center', gap:'6px'}},
        copied ? [Icons.check(), ' Copied!'] : [Icons.clipboard(), ' Copy progress summary']),
      React.createElement("button", {type:"button",className:"stats-export-btn", onClick:handleCSV, style:{display:'flex', alignItems:'center', gap:'6px'}},
        Icons.document(), ' Export sessions (CSV)'),
      React.createElement("button", {type:"button",className:"stats-export-btn", onClick:handleExportCard, style:{display:'flex', alignItems:'center', gap:'6px'}},
        Icons.camera(), ' Save as image')
    ),
    React.createElement("div", {style:{marginTop:20}},
      React.createElement(StatsChartSection, {statsSessions:statsSessions, statsSettings:statsSettings, totalStitches:totalStitches, chartView:chartView, setChartView:setChartView, overviewStats:overviewStats, totalCompleted:totalCompleted})
    ),
    React.createElement("div", {style:{marginTop:20}},
      React.createElement(MilestoneTracker, {milestones:milestones, achievedMilestones:achievedMilestones})
    ),
    React.createElement("div", {className:"stats-two-col", style:{marginTop:20}},
      React.createElement(GoalTracker, {statsSettings:statsSettings, statsSessions:statsSessions, totalCompleted:totalCompleted, totalStitches:totalStitches, overviewStats:overviewStats, onUpdateSettings:onUpdateSettings}),
      React.createElement(StreaksPanel, {sessions:statsSessions, dayEndHour:dayEndHour})
    ),
    React.createElement("div", {style:{marginTop:20}},
      React.createElement(ColourTimeline, {sessions:statsSessions, palette:palette, colourDoneCounts:colourDoneCounts})
    ),
    React.createElement("div", {style:{marginTop:20}},
      React.createElement(ColourProgress, {palette:palette, colourDoneCounts:colourDoneCounts, sessions:statsSessions})
    ),
    React.createElement("div", {className:"stats-two-col", style:{marginTop:20}},
      React.createElement(SectionGrid, {sections:sections||[], statsSettings:statsSettings, onUpdateSettings:onUpdateSettings, pat:pat, done:done, sW:sW, palette:palette, canEdit:canEdit}),
      React.createElement(ComparisonView, {doneSnapshots:doneSnapshots||[], setDoneSnapshots:setDoneSnapshots, done:done, pat:pat, sW:sW, sH:sH})
    ),
    React.createElement("div", {style:{marginTop:20}},
      React.createElement(SessionTimeline, {sessions:statsSessions, statsSettings:statsSettings, onEditNote:onEditNote, palette:palette})
    ),
    React.createElement("div", {style:{marginTop:20, padding:'var(--s-4)', background:'var(--surface-secondary)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border)'}},
      React.createElement("h4", {style:{fontSize:'var(--text-lg)', fontWeight:600, color:'var(--text-primary)', marginTop:0, marginBottom:'var(--s-2)'}}, "Settings"),
      React.createElement("label", {style:{display:'flex', alignItems:'center', gap:'var(--s-2)', fontSize:'var(--text-md)', color:'var(--text-secondary)'}},
        "Day ends at:",
        React.createElement("select", {value:dayEndHour, onChange:function(e){ onUpdateSettings(Object.assign({}, statsSettings, {dayEndHour:parseInt(e.target.value)})); }, style:{fontSize:'var(--text-sm)', padding:'4px 8px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)'}},
          React.createElement("option", {value:0}, "Midnight"),
          React.createElement("option", {value:1}, "1:00 AM"),
          React.createElement("option", {value:2}, "2:00 AM"),
          React.createElement("option", {value:3}, "3:00 AM"),
          React.createElement("option", {value:4}, "4:00 AM"),
          React.createElement("option", {value:5}, "5:00 AM")
        )
      ),
      React.createElement("p", {style:{fontSize:'var(--text-xs)', color:'var(--text-tertiary)', margin:'4px 0 0'}}, "Stitches after this time count for the previous day"),
      React.createElement("div", {style:{height:10}}),
      React.createElement("label", {style:{display:'flex', alignItems:'center', gap:'var(--s-2)', fontSize:'var(--text-md)', color:'var(--text-secondary)'}},
        "Auto-pause after inactivity:",
        React.createElement("select", {value: statsSettings.inactivityPauseSec == null ? '' : String(statsSettings.inactivityPauseSec), onChange:function(e){ var v=e.target.value; onUpdateSettings(Object.assign({}, statsSettings, {inactivityPauseSec: v==='' ? null : parseInt(v)})); }, style:{fontSize:'var(--text-sm)', padding:'4px 8px', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)'}},
          React.createElement("option", {value:''}, "Off"),
          React.createElement("option", {value:'60'}, "1 min"),
          React.createElement("option", {value:'90'}, "1.5 min"),
          React.createElement("option", {value:'120'}, "2 min"),
          React.createElement("option", {value:'300'}, "5 min"),
          React.createElement("option", {value:'600'}, "10 min"),
          React.createElement("option", {value:'1800'}, "30 min")
        )
      ),
      React.createElement("p", {style:{fontSize:'var(--text-xs)', color:'var(--text-tertiary)', margin:'4px 0 0'}}, "Pauses the session timer if no stitch is marked for this long"),
      React.createElement("div", {style:{height:10}}),
      React.createElement("div", {style:{fontSize:'var(--text-md)', color:'var(--text-secondary)', marginBottom:'var(--s-1)'}}, "Pace calculation:"),
      React.createElement("label", {style:{display:'flex', alignItems:'center', gap:6, fontSize:'var(--text-md)', color:'var(--text-secondary)', cursor:'pointer', marginBottom:'var(--s-1)'}},
        React.createElement("input", {type:'radio', name:'useActiveDays', checked:useActiveDays, onChange:function(){ onUpdateSettings(Object.assign({}, statsSettings, {useActiveDays:true})); }}),
        "Active days only (stitching days)"
      ),
      React.createElement("label", {style:{display:'flex', alignItems:'center', gap:6, fontSize:'var(--text-md)', color:'var(--text-secondary)', cursor:'pointer'}},
        React.createElement("input", {type:'radio', name:'useActiveDays', checked:!useActiveDays, onChange:function(){ onUpdateSettings(Object.assign({}, statsSettings, {useActiveDays:false})); }}),
        "Calendar days (days since first stitch)"
      ),
      React.createElement("p", {style:{fontSize:'var(--text-xs)', color:'var(--text-tertiary)', margin:'4px 0 0'}}, "Affects average stitches/day calculation")
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
  var effectiveGoalSettings = Object.assign({dayEndHour: 0, useActiveDays: true}, statsSettings || {}, globalGoals);
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
    var totalStitches = allSessions.reduce(function(s, sess) { return s + (sess.netStitches || 0); }, 0);
    var totalSeconds = allSessions.reduce(function(s, sess) { return s + getSessionSeconds(sess); }, 0);
    var totalHours = totalSeconds / 3600;
    var activeDays = new Set(allSessions.map(function(s) { return s.date; }).filter(Boolean)).size;
    var speed = totalHours > 0 ? Math.round(totalStitches / totalHours) : 0;
    var complete = projectSummaries.filter(function(p) { return p.isComplete; }).length;
    var total = projectSummaries.length;
    return {totalStitches: totalStitches, totalSeconds: totalSeconds, activeDays: activeDays, speed: speed, complete: complete, total: total};
  }, [allSessions, projectSummaries]);

  var globalStreak = React.useMemo(function() {
    var allDates = new Set(allSessions.map(function(s) { return s.date; }).filter(Boolean));
    var today = formatYMD(new Date());
    var current = 0, checkDate = today;
    while (allDates.has(checkDate)) { current++; checkDate = subtractOneDay(checkDate); }
    if (current === 0) {
      checkDate = subtractOneDay(today);
      while (allDates.has(checkDate)) { current++; checkDate = subtractOneDay(checkDate); }
    }
    var longest = 0, run = 0, prevD = null;
    Array.from(allDates).sort().forEach(function(d) {
      if (prevD && dayDiff(prevD, d) === 1) { run++; } else { run = 1; }
      if (run > longest) longest = run;
      prevD = d;
    });
    return {current: current, longest: longest};
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
      var st = sessions.reduce(function(s, x) { return s + (x.netStitches || 0); }, 0);
      var sec = sessions.reduce(function(s, x) { return s + getSessionSeconds(x); }, 0);
      var spd = sec > 0 ? Math.round(st / (sec / 3600)) : 0;
      var days = new Set(sessions.map(function(x) { return x.date; })).size;
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
    allSessions.forEach(function(s) { if (s.date) dailyTotals[s.date] = (dailyTotals[s.date] || 0) + (s.netStitches || 0); });
    var bestDay = Object.entries(dailyTotals).sort(function(a, b) { return b[1] - a[1]; })[0];
    if (bestDay && bestDay[1] > 0) result.push({icon: 'star', color: 'teal', text: 'Best day ever: ' + bestDay[1].toLocaleString() + ' stitches on ' + formatDateReadable(bestDay[0])});
    var fastest = allSessions.filter(function(s) { return getSessionSeconds(s) >= 600 && (s.netStitches || 0) > 0; }).sort(function(a, b) { return (b.netStitches / getSessionSeconds(b)) - (a.netStitches / getSessionSeconds(a)); })[0];
    if (fastest) {
      var spd = Math.round(fastest.netStitches / (getSessionSeconds(fastest) / 3600));
      var proj = projectSummaries.find(function(p) { return (p.statsSessions || []).some(function(s) { return s.id === fastest.id; }); });
      result.push({icon: 'bolt', color: 'amber', text: 'Fastest session: ' + spd + ' st/hr' + (proj ? ' on ' + proj.name : '')});
    }
    var hourCounts = new Array(24).fill(0);
    allSessions.forEach(function(s) { if (s.startTime) { var h = new Date(s.startTime).getHours(); hourCounts[h] += (s.netStitches || 0); } });
    var maxH = Math.max.apply(null, hourCounts);
    if (maxH > 0) {
      var peak = hourCounts.indexOf(maxH);
      result.push({icon: 'clock', color: 'purple', text: 'You stitch most between ' + formatHour(peak) + '\u2013' + formatHour((peak + 2) % 24)});
    }
    var inProg = projectSummaries.filter(function(p) { return !p.isComplete && p.completedStitches > 0 && p.totalStitches > 0; }).sort(function(a, b) { return (a.totalStitches - a.completedStitches) - (b.totalStitches - b.completedStitches); });
    if (inProg.length > 0) {
      var p = inProg[0];
      var rem = p.totalStitches - p.completedStitches;
      var rDates = Array.from(new Set((p.statsSessions || []).map(function(s) { return s.date; }))).sort().reverse().slice(0, 14);
      var rSt = (p.statsSessions || []).filter(function(s) { return rDates.indexOf(s.date) >= 0; }).reduce(function(sum, s) { return sum + (s.netStitches || 0); }, 0);
      var apd = rDates.length > 0 ? rSt / rDates.length : 0;
      if (apd > 0) {
        var daysLeft = Math.ceil(rem / apd);
        var estD = new Date(); estD.setDate(estD.getDate() + daysLeft);
        result.push({icon: 'calendar', color: 'coral', text: p.name + ' est. complete: ' + formatDateReadable(formatYMD(estD)) + ' at current pace'});
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
        entries.push({type: 'session', date: s.date, startTime: s.startTime || (s.date + 'T00:00:00'), projectId: p.id, projectName: p.name || 'Untitled', projectColor: assignProjectColor(p.id), stitches: s.netStitches || 0, seconds: getSessionSeconds(s), speed: getSessionSeconds(s) > 0 ? Math.round((s.netStitches || 0) / (getSessionSeconds(s) / 3600)) : 0, note: s.note || null});
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

    // Section 1: Lifetime totals
    React.createElement('h3', {className: 'gsd-section-label'}, 'All time'),
    React.createElement('div', {className: 'gsd-metrics'},
      React.createElement(MetricCard, {label: 'Total stitches', value: lifetimeTotals.totalStitches.toLocaleString(), sub: 'across ' + lifetimeTotals.total + ' project' + (lifetimeTotals.total !== 1 ? 's' : '')}),
      React.createElement(MetricCard, {label: 'Time stitching', value: formatDurationCompact(lifetimeTotals.totalSeconds), sub: lifetimeTotals.activeDays + ' active days'}),
      React.createElement(MetricCard, {label: 'Average speed', value: lifetimeTotals.speed, sub: 'stitches / hour'}),
      React.createElement(MetricCard, {label: 'Projects', value: lifetimeTotals.complete + ' / ' + lifetimeTotals.total, sub: (lifetimeTotals.total - lifetimeTotals.complete) + ' in progress'})
    ),

    // Section 2: Streak
    allSessions.length > 0 && React.createElement('div', {className: 'gsd-streak'},
      React.createElement('div', {className: 'gsd-streak-flame'}, Icons.fire()),
      React.createElement('div', {className: 'gsd-streak-body'},
        React.createElement('div', {className: 'gsd-streak-num'}, globalStreak.current + ' day' + (globalStreak.current !== 1 ? 's' : '')),
        React.createElement('div', {className: 'gsd-streak-label'}, globalStreak.current > 0 ? 'Keep it going \u2014 stitch today!' : 'Start a new streak!')
      ),
      React.createElement('div', {className: 'gsd-streak-best'}, 'Best: ' + globalStreak.longest + ' days')
    ),

    // Section 3: Project cards
    React.createElement('h3', {className: 'gsd-section-label'}, 'Projects'),
    React.createElement('div', {className: 'gsd-projects'},
      projectSummaries.slice().sort(function(a, b) {
        if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1;
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      }).map(function(p) {
        var pct = p.totalStitches > 0 ? Math.round(p.completedStitches / p.totalStitches * 100) : 0;
        var remaining = Math.max(0, p.totalStitches - p.completedStitches);
        var color = p.projectColor || assignProjectColor(p.id);
        return React.createElement('div', {key: p.id, className: 'gsd-project-card', onClick: function() { if (onViewProject) onViewProject(p.id); }},
          React.createElement('div', {className: 'gsd-pc-name'}, p.name || 'Untitled'),
          React.createElement(RingChart, {size: 52, pct: pct, color: color}),
          React.createElement('div', {className: 'gsd-pc-sub'}, p.isComplete ? 'Complete!' : remaining.toLocaleString() + ' left')
        );
      })
    ),

    // Section 4: Week comparison
    React.createElement('h3', {className: 'gsd-section-label'}, 'This week vs last week'),
    React.createElement('div', {className: 'gsd-week'},
      React.createElement('div', {className: 'gsd-week-grid'},
        React.createElement(WeekMetric, {label: 'stitches', value: weekComparison.thisWeek.stitches.toLocaleString(), delta: weekComparison.stitchesDelta}),
        React.createElement(WeekMetric, {label: 'time', value: formatDurationCompact(weekComparison.thisWeek.seconds), delta: weekComparison.timeDelta}),
        React.createElement(WeekMetric, {label: 'st/hour', value: weekComparison.thisWeek.speed, delta: weekComparison.speedDelta}),
        React.createElement(WeekMetric, {label: 'days active', value: weekComparison.thisWeek.activeDays + ' / 7', delta: weekComparison.daysDelta, isDays: true})
      )
    ),

    // Section 5: Goals (stored globally in localStorage, not tied to any single project)
    React.createElement('div', {style: {marginBottom: '1.5rem'}},
      React.createElement('h3', {className: 'gsd-section-label'}, 'Goals'),
      React.createElement(GoalTracker, {
        statsSettings: effectiveGoalSettings,
        statsSessions: allSessions,
        totalCompleted: allSessions.reduce(function(s, x) { return s + (x.netStitches || 0); }, 0),
        totalStitches: projectSummaries.reduce(function(s, p) { return s + p.totalStitches; }, 0),
        overviewStats: computeOverviewStats(allSessions, lifetimeTotals.totalStitches, lifetimeTotals.totalStitches, true),
        onUpdateSettings: updateGlobalGoals
      })
    ),

    // Section 6: Insights
    insights.length > 0 && React.createElement('div', null,
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
    React.createElement('div', {className: 'gsd-timeline'},
      React.createElement('h3', {className: 'gsd-section-label', style: {marginBottom: 10}}, 'Recent sessions'),
      timeline.grouped.map(function(day) {
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
                React.createElement('div', {className: 'gsd-tl-stitches'}, '+' + entry.stitches.toLocaleString())
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
      }),
      tlLimit < timeline.total && React.createElement('button', {className: 'timeline-show-all',
        onClick: function() { setTlLimit(function(prev) { return prev + 20; }); }}, 'Show more')
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

// StatsContainer: tab bar wrapping GlobalStatsDashboard or per-project StatsDashboard
function StatsContainer({statsTab, setStatsTab, onClose, currentProjectId, statsSessions, statsSettings, onUpdateSettings, totalCompleted, totalStitches, halfStitchCounts, onEditNote, projectName, palette, colourDoneCounts, achievedMilestones, done, pat, sW, sH, doneSnapshots, setDoneSnapshots, sections, onOpenProject}) {
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
    if (!statsTab || statsTab === 'all' || statsTab === currentProjectId) { setLoadedProject(null); return; }
    setLLoading(true);
    if (typeof ProjectStorage !== 'undefined') {
      ProjectStorage.get(statsTab).then(function(p) { setLoadedProject(p || null); setLLoading(false); }).catch(function() { setLLoading(false); });
    }
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
    content = React.createElement(StatsDashboard, {statsSessions: statsSessions, statsSettings: statsSettings, totalCompleted: totalCompleted, totalStitches: totalStitches, halfStitchCounts: halfStitchCounts, onEditNote: onEditNote, onUpdateSettings: onUpdateSettings, onClose: onClose, projectName: projectName, palette: palette, colourDoneCounts: colourDoneCounts, achievedMilestones: achievedMilestones, done: done, pat: pat, sW: sW, sH: sH, doneSnapshots: doneSnapshots, setDoneSnapshots: setDoneSnapshots, sections: sections, currentProjectId: currentProjectId, onOpenProject: onOpenProject, canEdit: true});
  } else if (loadedProject) {
    var lp = loadedProject;
    var lpS = lp.settings || {};
    var lpSessions = lp.statsSessions || [];
    var lpDone = lp.done || null;
    var lpPat = lp.pattern || null;
    var lpTotal = lpPat ? lpPat.filter(function(c) { return c && c.id !== '__skip__' && c.id !== '__empty__'; }).length : 0;
    var lpCompleted = lpDone ? (Array.isArray(lpDone) ? lpDone.reduce(function(n, v) { return n + (v === 1 ? 1 : 0); }, 0) : 0) : 0;
    var lpPal = lpPat ? (function() { var seen = {}, out = []; lpPat.forEach(function(c) { if (c && c.id && c.id !== '__skip__' && c.id !== '__empty__' && !c.id.includes('+') && !seen[c.id]) { seen[c.id] = true; out.push(c); } }); return out; })() : [];
    var lpCDone = {};
    if (lpPat && lpDone) {
      var lpTotals = {};
      for (var ci = 0; ci < lpPat.length; ci++) {
        var cid = lpPat[ci] && lpPat[ci].id;
        if (!cid || cid === '__skip__' || cid === '__empty__') continue;
        if (!lpTotals[cid]) lpTotals[cid] = {total: 0, done: 0, halfTotal: 0, halfDone: 0};
        lpTotals[cid].total++;
        if (lpDone[ci] === 1) lpTotals[cid].done++;
      }
      lpCDone = lpTotals;
    }
    content = React.createElement(StatsDashboard, {statsSessions: lpSessions, statsSettings: lp.statsSettings || {dayEndHour: 0, useActiveDays: true}, totalCompleted: lpCompleted, totalStitches: lpTotal, onEditNote: function() {}, onUpdateSettings: function() {}, onClose: onClose, projectName: lp.name || 'Untitled', palette: lpPal, colourDoneCounts: lpCDone, achievedMilestones: lp.achievedMilestones || [], done: lpDone, pat: lpPat, sW: lpS.sW || 0, sH: lpS.sH || 0, doneSnapshots: lp.doneSnapshots || [], setDoneSnapshots: function() {}, sections: lp.sections || [], currentProjectId: lp.id, onOpenProject: onOpenProject, canEdit: false});
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


// --- EmptyState — shared coaching empty-state card ---------------------
// Used on Manager (Patterns/Threads), Home (no projects), and Stats (no data).
// Props: { icon, title, description, ctaLabel, ctaAction, secondaryLabel?, secondaryAction? }
function EmptyState(props) {
  var h = React.createElement;
  var icon = props.icon || null;
  return h('div', {
    className: 'cs-empty-state',
    style: {
      textAlign: 'center', padding: '48px 24px',
      border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-xl)',
      background: 'var(--surface)'
    }
  },
    icon && h('div', {
      style: { fontSize: 32, lineHeight: 1, color: 'var(--text-tertiary)', marginBottom:'var(--s-3)', display: 'flex', justifyContent: 'center' },
      'aria-hidden': 'true'
    }, icon),
    props.title && h('div', {
      style: { fontSize:'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }
    }, props.title),
    props.description && h('div', {
      style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)', maxWidth: 320, margin: '0 auto 16px' }
    }, props.description),
    props.ctaLabel && h('button', {
      className: 'home-btn home-btn--primary',
      onClick: props.ctaAction
    }, props.ctaLabel),
    props.secondaryLabel && h('div', { style: { marginTop: 10 } },
      h('button', { className: 'home-view-all', onClick: props.secondaryAction }, props.secondaryLabel)
    )
  );
}
window.EmptyState = EmptyState;

/* ════════════════════════════════════════════════════════════════
   AppInfoPopover — UX-12 Plan B: shared summary chip + popover.

   Reusable across Tracker, Stash Manager, /home, and Stats. Owns
   only its own dismissal lifecycle (Escape + click-outside via
   `mousedown`). Renders a fixed-position dialog by default; on
   phones (<600px) the matching CSS converts it to a bottom sheet.

   Props:
     open        — boolean; render only when true
     onClose     — required; called on Escape, click-outside, scrim tap
     triggerRef  — ref to the trigger button (so its own clicks are ignored)
     ariaLabel   — dialog label, defaults to "Details"
     children    — popover body. Use AppInfoSection / AppInfoGrid helpers.

   Helpers:
     window.AppInfoSection({ title, children }) — titled subsection
     window.AppInfoGrid({ rows }) — rows: [[label, value], …]
     window.AppInfoBadges({ items }) — pills, items: [{ label, kind? }]
   ════════════════════════════════════════════════════════════════ */

function AppInfoPopover(props) {
  var h = React.createElement;
  var popoverRef = React.useRef(null);

  React.useEffect(function () {
    if (!props || !props.open) return undefined;
    function onDoc(e) {
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      if (props.triggerRef && props.triggerRef.current && props.triggerRef.current.contains(e.target)) return;
      if (typeof props.onClose === "function") props.onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") {
        if (typeof props.onClose === "function") props.onClose();
        if (props.triggerRef && props.triggerRef.current && props.triggerRef.current.focus) {
          props.triggerRef.current.focus();
        }
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return function () {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [props && props.open, props && props.onClose, props && props.triggerRef]);

  if (!props || !props.open) return null;

  return h(React.Fragment, null,
    h("div", {
      className: "app-info-scrim",
      "aria-hidden": "true",
      onClick: function () { if (typeof props.onClose === "function") props.onClose(); }
    }),
    h("div", {
      ref: popoverRef,
      className: "app-info-popover" + (props.className ? " " + props.className : ""),
      role: "dialog",
      "aria-label": props.ariaLabel || "Details"
    }, props.children)
  );
}
window.AppInfoPopover = AppInfoPopover;

function AppInfoSection(props) {
  var h = React.createElement;
  if (!props) return null;
  var children = [];
  if (props.title) children.push(h("h3", { key: "t", className: "app-info-popover__title" }, props.title));
  children.push(h("div", { key: "b" }, props.children));
  return h("div", { className: "app-info-popover__section" }, children);
}
window.AppInfoSection = AppInfoSection;

function AppInfoGrid(props) {
  var h = React.createElement;
  if (!props || !Array.isArray(props.rows)) return null;
  var cells = [];
  props.rows.forEach(function (row, i) {
    if (!row || row.length < 2) return;
    var label = row[0];
    var value = row[1];
    cells.push(h("div", { key: "k" + i, className: "app-info-popover__label" }, label));
    cells.push(h("div", { key: "v" + i, className: "app-info-popover__value" }, value));
  });
  return h("div", { className: "app-info-popover__grid" }, cells);
}
window.AppInfoGrid = AppInfoGrid;

function AppInfoBadges(props) {
  var h = React.createElement;
  if (!props || !Array.isArray(props.items) || !props.items.length) return null;
  return h("div", { className: "app-info-popover__badges" },
    props.items.map(function (item, i) {
      if (!item || !item.label) return null;
      var cls = "app-info-popover__badge";
      if (item.kind === "warning") cls += " app-info-popover__badge--warning";
      else if (item.kind === "danger") cls += " app-info-popover__badge--danger";
      else if (item.kind === "success") cls += " app-info-popover__badge--success";
      return h("span", { key: i, className: cls }, item.label);
    })
  );
}
window.AppInfoBadges = AppInfoBadges;

function AppInfoDivider() {
  return React.createElement("hr", { className: "app-info-popover__divider" });
}
window.AppInfoDivider = AppInfoDivider;




// AdaptedBadge — small lavender pill shown next to adapted-project titles in
// the pattern library and on /home. Clicking opens the source project (via
// onClick handler — usually navigates to the original).
//   Props: { fromName, onClick?, compact? }
function AdaptedBadge(props) {
  var h = React.createElement;
  if (!props || !props.fromName) return null;
  var compact = !!props.compact;
  var Icons = window.Icons || {};
  var label = compact ? 'Adapted' : ('Adapted from ' + props.fromName);
  var title = 'Adapted from ' + props.fromName + (props.onClick ? ' \u2014 click to open original' : '');
  return h('span', {
    className: 'cs-adapted-badge',
    title: title,
    onClick: props.onClick || undefined,
    role: props.onClick ? 'button' : undefined,
    tabIndex: props.onClick ? 0 : undefined,
    onKeyDown: props.onClick ? function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onClick(); }
    } : undefined,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px',
      fontSize: 'var(--text-xs)', fontWeight: 500, lineHeight: 1.2,
      color: 'var(--accent)',
      background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
      border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
      borderRadius: 'var(--radius-pill, 999px)',
      cursor: props.onClick ? 'pointer' : 'default',
      whiteSpace: 'nowrap', maxWidth: '100%'
    }
  },
    Icons.adapt ? h('span', {
      style: { display: 'inline-flex', width: 12, height: 12, fontSize: 12 }
    }, Icons.adapt()) : null,
    h('span', {
      style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
    }, label)
  );
}
window.AdaptedBadge = AdaptedBadge;

/* ════════════════════════════════════════════════════════════════
   color-3 (C2 + C3): Swatch detail popover and similar-colour
   comparator. Both share the deDescriptor() helper for ΔE₀₀
   plain-English labels. SwatchDetailPopover is portalled into
   document.body so it escapes overflow:hidden ancestors (Legend
   list, MaterialsHub tabs). SimilarColourComparator renders
   inline directly under the warning row that triggered it.
   ════════════════════════════════════════════════════════════════ */

window.deDescriptor = function deDescriptor(de) {
  if (de < 1.0) return 'imperceptible — identical in practice';
  if (de < 2.0) return 'at the threshold of perception — side-by-side test recommended';
  if (de < 3.5) return 'barely perceptible in person';
  if (de < 5.0) return 'perceptible on close inspection';
  if (de < 8.0) return 'clearly different on close inspection';
  return 'clearly different at a glance';
};

// Find the nearest other thread in `palette` to `thread` within a ΔE₀₀
// budget (default 8). Returns null if nothing matches. O(n).
window.findNearestSimilarThread = function findNearestSimilarThread(thread, palette, maxDe) {
  if (!thread || !thread.lab || !palette || !palette.length) return null;
  var dE = window.dE00; if (typeof dE !== 'function') return null;
  var best = null, bestDe = (typeof maxDe === 'number') ? maxDe : 8;
  for (var i = 0; i < palette.length; i++) {
    var o = palette[i];
    if (!o || o.id === thread.id || !o.lab) continue;
    var d = dE(thread.lab, o.lab);
    if (d < bestDe) { best = o; bestDe = d; }
  }
  if (!best) return null;
  return { id: best.id, name: best.name || '', rgb: best.rgb, dE: bestDe, descriptor: window.deDescriptor(bestDe) };
};

// Canonical pair key — sort IDs alphabetically and join with '+'.
window.similarPairKey = function similarPairKey(a, b) {
  var s = [String(a), String(b)].sort();
  return s[0] + '+' + s[1];
};

function SwatchDetailPopover(props) {
  var h = React.createElement;
  var thread = props.thread;
  var anchorRect = props.anchorRect;
  var onClose = props.onClose;
  var popoverRef = React.useRef(null);
  var posState = React.useState({ top: -9999, left: -9999, ready: false });
  var pos = posState[0], setPos = posState[1];

  React.useLayoutEffect(function () {
    if (!popoverRef.current || !anchorRect) return;
    var pw = popoverRef.current.offsetWidth;
    var ph = popoverRef.current.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var MARGIN = 8;
    var top = anchorRect.bottom + MARGIN;
    var left = anchorRect.left;
    if (top + ph > vh - MARGIN) top = anchorRect.top - ph - MARGIN;
    if (top < MARGIN) top = MARGIN;
    if (left + pw > vw - MARGIN) left = vw - pw - MARGIN;
    if (left < MARGIN) left = MARGIN;
    setPos({ top: top, left: left, ready: true });
  }, [anchorRect]);

  React.useEffect(function () {
    function onKey(e) { if (e.key === 'Escape') onClose && onClose(); }
    function onDown(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) onClose && onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return function () {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  if (!thread) return null;
  var rgb = thread.rgb || [128,128,128];
  var rgbStr = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  var fabrics = [
    { label: 'White Aida',    bg: '#FFFFFF' },
    { label: 'Natural Linen', bg: '#D2B48C' },
    { label: 'Black Aida',    bg: '#1A1A1A' }
  ];
  var Icons = window.Icons || {};

  var content = h('div', {
    ref: popoverRef,
    className: 'swatch-detail-popover',
    style: { top: pos.top, left: pos.left, visibility: pos.ready ? 'visible' : 'hidden' },
    role: 'dialog',
    'aria-label': 'Colour details for ' + (thread.id || '')
  },
    h('div', { className: 'sdp-header' },
      h('span', { className: 'sdp-code' }, String(thread.id || '')),
      h('span', { className: 'sdp-name' }, thread.name || ''),
      h('button', {
        className: 'sdp-close',
        onClick: onClose,
        'aria-label': 'Close colour details'
      }, Icons.x ? Icons.x() : '\u00D7')
    ),
    h('div', {
      className: 'sdp-swatch-large colour-swatch colour-swatch--large',
      style: { background: rgbStr },
      'aria-hidden': 'true'
    }),
    h('div', { className: 'sdp-fabric-row', 'aria-label': 'Thread on three fabric backgrounds' },
      fabrics.map(function (f) {
        return h('div', { key: f.bg, className: 'sdp-fabric-item' },
          h('div', { className: 'sdp-fabric-bg', style: { background: f.bg } },
            h('div', {
              className: 'sdp-fabric-chip colour-swatch',
              style: { background: rgbStr, border: 'none' }
            })
          ),
          h('span', { className: 'sdp-fabric-label' }, f.label)
        );
      })
    ),
    h('p', { className: 'sdp-note' },
      Icons.info ? h('span', { className: 'sdp-note-icon', 'aria-hidden': 'true' }, Icons.info()) : null,
      ' Code is the authoritative reference \u2014 screen colours are approximations.'
    ),
    thread.similarThread && h('p', { className: 'sdp-similar' },
      'Similar to ' + thread.similarThread.id + ' (' + (thread.similarThread.name || '') + ', \u0394E\u2080\u2080 ' + thread.similarThread.dE.toFixed(1) + ') \u2014 ' + thread.similarThread.descriptor
    )
  );

  return ReactDOM.createPortal(content, document.body);
}
window.SwatchDetailPopover = SwatchDetailPopover;

function SimilarColourComparator(props) {
  var h = React.createElement;
  var threadA = props.threadA;
  var threadB = props.threadB;
  var dE = props.dE;
  var onDismiss = props.onDismiss;
  if (!threadA || !threadB) return null;
  var rgbA = 'rgb(' + threadA.rgb.join(',') + ')';
  var rgbB = 'rgb(' + threadB.rgb.join(',') + ')';
  var fabrics = [
    { label: 'White Aida',    bg: '#FFFFFF' },
    { label: 'Natural Linen', bg: '#D2B48C' },
    { label: 'Black Aida',    bg: '#1A1A1A' }
  ];
  var descriptor = (window.deDescriptor || function () { return ''; })(dE);

  return h('div', {
    className: 'similar-comparator',
    role: 'region',
    'aria-label': 'Similar colour comparison'
  },
    h('div', { className: 'sc-threads' },
      h('div', { className: 'sc-thread' },
        h('div', {
          className: 'sc-swatch-tall colour-swatch colour-swatch--large',
          style: { background: rgbA },
          'aria-label': (threadA.id || '') + ' ' + (threadA.name || '')
        }),
        h('span', { className: 'sc-code' }, String(threadA.id || '')),
        h('span', { className: 'sc-name' }, threadA.name || '')
      ),
      h('div', { className: 'sc-delta-block' },
        h('span', { className: 'sc-delta-value' }, '\u0394E\u2080\u2080 ' + dE.toFixed(1)),
        h('span', { className: 'sc-delta-desc' }, descriptor)
      ),
      h('div', { className: 'sc-thread' },
        h('div', {
          className: 'sc-swatch-tall colour-swatch colour-swatch--large',
          style: { background: rgbB },
          'aria-label': (threadB.id || '') + ' ' + (threadB.name || '')
        }),
        h('span', { className: 'sc-code' }, String(threadB.id || '')),
        h('span', { className: 'sc-name' }, threadB.name || '')
      )
    ),
    h('div', { className: 'sc-fabric-grid', 'aria-label': 'Both threads on three fabrics' },
      fabrics.map(function (f) {
        return h(React.Fragment, { key: f.bg },
          h('div', { className: 'sc-fabric-cell' },
            h('div', { className: 'sc-fabric-bg', style: { background: f.bg } },
              h('div', { className: 'sc-fabric-chip colour-swatch', style: { background: rgbA, border: 'none' } })
            ),
            h('span', { className: 'sc-fabric-label' }, f.label)
          ),
          h('div', { className: 'sc-fabric-cell' },
            h('div', { className: 'sc-fabric-bg', style: { background: f.bg } },
              h('div', { className: 'sc-fabric-chip colour-swatch', style: { background: rgbB, border: 'none' } })
            )
          )
        );
      })
    ),
    h('p', { className: 'sc-note' },
      'In practice, the physical threads may differ more than shown here due to texture, sheen, and lighting.'
    ),
    onDismiss && h('button', {
      className: 'sc-dismiss btn-secondary btn-sm',
      onClick: onDismiss,
      type: 'button'
    }, 'Dismiss warning')
  );
}
window.SimilarColourComparator = SimilarColourComparator;


