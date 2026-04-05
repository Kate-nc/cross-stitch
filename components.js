function Tooltip({text,children,width=180}){
  const[show,setShow]=React.useState(false);
  const[pos,setPos]=React.useState({x:0,y:0});
  return React.createElement("div",{
    style:{position:"relative",display:"inline-flex"},
    onMouseEnter:e=>{const r=e.currentTarget.getBoundingClientRect();setPos({x:r.left+r.width/2,y:r.top});setShow(true);},
    onMouseLeave:()=>setShow(false)
  },
    children,
    show&&ReactDOM.createPortal(
      React.createElement("div",{style:{
        position:"fixed",left:pos.x,top:pos.y-10,
        transform:"translate(-50%,-100%)",
        background:"#18181b",color:"#fff",fontSize:11,lineHeight:"1.45",
        padding:"6px 10px",borderRadius:7,maxWidth:width,width:"max-content",
        zIndex:9999,pointerEvents:"none",
        boxShadow:"0 4px 16px rgba(0,0,0,0.22)",textAlign:"center"
      }},
        text,
        React.createElement("div",{style:{
          position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",
          width:0,height:0,
          borderLeft:"5px solid transparent",borderRight:"5px solid transparent",
          borderTop:"5px solid #18181b"
        }})
      ),
      document.body
    )
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

  return React.createElement("div", {style:{borderRadius:12,border:"0.5px solid var(--border)",background:"#fff",overflow:"hidden"}},
    React.createElement("button", {onClick:handleToggle, style:{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,color:"#18181b",gap:8}},
      React.createElement("span", {style:{display:"flex",alignItems:"center",gap:8}}, title, badge),
      React.createElement("span", {style:{fontSize:10,color:"#a1a1aa",transform:currentOpen?"rotate(180deg)":"rotate(0deg)"}}, "▼")
    ),
    currentOpen&&React.createElement("div", {style:{padding:"0 16px 16px"}}, children)
  );
}
function SliderRow({label,value,min,max,step=1,onChange,suffix="",format=null}){
  return React.createElement("div", {style:{marginBottom:2}},
    React.createElement("div", {style:{display:"flex",justifyContent:"space-between",fontSize:12,color:"#71717a",marginBottom:3}},
      React.createElement("span", null, label),
      React.createElement("span", {style:{fontWeight:600,color:"#18181b"}}, format?format(value):value, suffix)
    ),
    React.createElement("input", {type:"range", min:min, max:max, step:step, value:value, onChange:e=>onChange(Number(e.target.value)), style:{width:"100%"}})
  );

}

// ═══ Stats Components ═══

function ProgressRing({percent, size}){
  size = size || 56;
  var r = (size / 2) - 4;
  var circumference = 2 * Math.PI * r;
  var offset = circumference * (1 - Math.min(percent || 0, 100) / 100);
  return React.createElement("div", {className:"progress-ring", style:{width:size, height:size}},
    React.createElement("svg", {viewBox:"0 0 "+size+" "+size, width:size, height:size},
      React.createElement("circle", {cx:size/2, cy:size/2, r:r, fill:"none", stroke:"#e4e4e7", strokeWidth:"3"}),
      React.createElement("circle", {cx:size/2, cy:size/2, r:r, fill:"none", stroke:"#0d9488", strokeWidth:"3",
        strokeDasharray:circumference, strokeDashoffset:offset,
        transform:"rotate(-90 "+size/2+" "+size/2+")", strokeLinecap:"round"})
    ),
    React.createElement("span", {className:"progress-ring-label"}, Math.round(percent || 0) + "%")
  );
}

function MiniStatsBar({statsSessions, totalCompleted, totalStitches, statsSettings, onOpenStats, currentAutoSession}){
  try {
    var dayEndHour = (statsSettings && statsSettings.dayEndHour) || 0;
    var todayStitches = getStatsTodayStitches(statsSessions || [], dayEndHour);
    var todayMinutes = getStatsTodayMinutes(statsSessions || [], dayEndHour);
    var dailyGoal = statsSettings && statsSettings.dailyGoal;
    var percent = totalStitches > 0 ? Math.round((totalCompleted / totalStitches) * 1000) / 10 : 0;
    var liveTodayStitches = todayStitches;
    var liveTodayMinutes = todayMinutes;
    if (currentAutoSession) {
      liveTodayStitches += ((currentAutoSession.stitchesCompleted||0) - (currentAutoSession.stitchesUndone||0));
      var elapsed = Math.round((Date.now() - new Date(currentAutoSession.startTime).getTime()) / 60000);
      liveTodayMinutes += elapsed;
    }
    return React.createElement("div", {className:"mini-stats-bar"},
      React.createElement(ProgressRing, {percent:percent, size:36}),
      React.createElement("div", {className:"mini-stats-text"},
        React.createElement("span", {className:"mini-stats-count"}, liveTodayStitches + " stitches today"),
        React.createElement("span", {className:"mini-stats-time"}, formatStatsDuration(liveTodayMinutes))
      ),
      dailyGoal && liveTodayStitches < dailyGoal && React.createElement("span", {className:"mini-stats-goal-badge"}, (dailyGoal - liveTodayStitches) + " to goal"),
      dailyGoal && liveTodayStitches >= dailyGoal && React.createElement("span", {className:"mini-stats-goal-met"}, "Goal reached!"),
      React.createElement("button", {className:"mini-stats-btn", onClick:onOpenStats}, "Stats")
    );
  } catch(e) { console.warn('Stats: MiniStatsBar render error', e); return null; }
}

function OverviewCards({statsSessions, totalCompleted, totalStitches}){
  var stats = computeOverviewStats(statsSessions || [], totalCompleted, totalStitches);
  return React.createElement("div", {className:"stats-overview"},
    React.createElement("div", {className:"stats-overview-main"},
      React.createElement(ProgressRing, {percent:stats.percent, size:56}),
      React.createElement("div", null,
        React.createElement("span", {className:"stats-big-number"}, totalCompleted.toLocaleString()),
        React.createElement("span", {className:"stats-label"}, " of " + totalStitches.toLocaleString() + " stitches")
      )
    ),
    React.createElement("div", {className:"stats-overview-grid"},
      React.createElement("div", null, React.createElement("span", {className:"stats-label"}, "Speed"), React.createElement("span", {className:"stats-value"}, stats.stitchesPerHour + "/hr")),
      React.createElement("div", null, React.createElement("span", {className:"stats-label"}, "Time stitched"), React.createElement("span", {className:"stats-value"}, stats.totalTimeFormatted)),
      React.createElement("div", null, React.createElement("span", {className:"stats-label"}, "Est. finish"), React.createElement("span", {className:"stats-value"}, stats.estimatedCompletion)),
      React.createElement("div", null, React.createElement("span", {className:"stats-label"}, "Sessions"), React.createElement("span", {className:"stats-value"}, (statsSessions||[]).length))
    )
  );
}

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
      style:{width:'100%', fontSize:12, padding:'4px 8px', borderRadius:6, border:'1px solid #e4e4e7'}})
  );
}

function SessionTimeline({sessions, statsSettings, onEditNote}){
  var showSt = React.useState(false);
  var showAll = showSt[0], setShowAll = showSt[1];
  var editSt = React.useState(null);
  var editingId = editSt[0], setEditingId = editSt[1];
  try {
  var grouped = groupSessionsByDate(sessions || []);
  var sortedDates = Object.keys(grouped).sort().reverse();
  var displayDates = showAll ? sortedDates : sortedDates.slice(0, 10);
  var dayEndHour = (statsSettings && statsSettings.dayEndHour) || 0;
  var children = [];
  if (!sessions || sessions.length === 0) {
    children.push(React.createElement("p", {key:"empty", style:{fontSize:13, color:'#a1a1aa'}}, "No sessions recorded yet. Start stitching to see your journal!"));
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
          React.createElement("span", {className:"timeline-duration"}, formatStatsDuration(session.durationMinutes))
        )
      ];
      if (editingId === session.id) {
        contentChildren.push(React.createElement(NoteEditor, {key:"note-edit", sessionId:session.id, currentNote:session.note, onSave:function(id, text){ onEditNote(id, text); setEditingId(null); }}));
      } else {
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
    React.createElement("h3", {style:{fontSize:16, fontWeight:700, color:'#18181b', marginBottom:12}}, "Session journal"),
    children,
    React.createElement("div", {className:"timeline-track"}, timelineEntries),
    !showAll && sessions && sessions.length > 10 && React.createElement("button", {className:"timeline-show-all", onClick:function(){ setShowAll(true); }}, "View all " + sessions.length + " sessions")
  );
  } catch(e) { console.warn('Stats: SessionTimeline render error', e); return React.createElement("p", {style:{color:'#a1a1aa',fontSize:13}}, "Could not load timeline."); }
}

// ═══ Phase B: Charts & Milestones ═══

function CumulativeChart({sessions, totalStitches}){
  try {
  var data = getCumulativeProgressData(sessions);
  if (data.length < 2) return React.createElement("p", {className:"stats-empty"}, "Start stitching to see your progress chart");
  var width = 600, height = 130;
  var pl = 36, pr = 8, pt = 8, pb = 4;
  var cW = width - pl - pr, cH = height - pt - pb;
  var maxY = Math.max(totalStitches, 1);
  var xS = function(i){ return pl + (i / (data.length - 1)) * cW; };
  var yS = function(v){ return pt + cH - (v / maxY) * cH; };
  var pts = [];
  for (var i = 0; i < data.length; i++) pts.push(xS(i) + ',' + yS(data[i].total));
  var points = pts.join(' ');
  var fillPoints = points + ' ' + xS(data.length - 1) + ',' + yS(0) + ' ' + xS(0) + ',' + yS(0);
  var last = data[data.length - 1];
  var mid = data[Math.floor(data.length / 2)];
  return React.createElement("div", {className:"chart-container"},
    React.createElement("svg", {viewBox:"0 0 " + width + " " + height, width:"100%", style:{display:'block'}},
      // Y-axis labels
      React.createElement("text", {x:pl - 4, y:pt + 6, textAnchor:"end", fontSize:"9", fill:"#a1a1aa"}, formatCompact(totalStitches)),
      React.createElement("text", {x:pl - 4, y:pt + cH / 2 + 3, textAnchor:"end", fontSize:"9", fill:"#a1a1aa"}, formatCompact(totalStitches / 2)),
      React.createElement("text", {x:pl - 4, y:pt + cH, textAnchor:"end", fontSize:"9", fill:"#a1a1aa"}, "0"),
      // Midpoint gridline
      React.createElement("line", {x1:pl, y1:pt + cH / 2, x2:width - pr, y2:pt + cH / 2, stroke:"#e4e4e7", strokeWidth:"0.5", strokeDasharray:"4 4"}),
      // On-pace line
      React.createElement("line", {x1:xS(0), y1:yS(0), x2:xS(data.length - 1), y2:yS(totalStitches), stroke:"#d4d4d8", strokeWidth:"1", strokeDasharray:"4 4"}),
      // Fill area
      React.createElement("polygon", {points:fillPoints, fill:"#534AB7", opacity:"0.08"}),
      // Actual progress line
      React.createElement("polyline", {points:points, fill:"none", stroke:"#534AB7", strokeWidth:"2.5", strokeLinecap:"round", strokeLinejoin:"round"}),
      // Current position dot
      React.createElement("circle", {cx:xS(data.length - 1), cy:yS(last.total), r:"4", fill:"#534AB7"}),
      // X-axis line
      React.createElement("line", {x1:pl, y1:pt + cH, x2:width - pr, y2:pt + cH, stroke:"#e4e4e7", strokeWidth:"0.5"})
    ),
    React.createElement("div", {className:"chart-x-labels"},
      React.createElement("span", null, formatShortDate(data[0].date)),
      React.createElement("span", null, formatShortDate(mid.date)),
      React.createElement("span", null, formatShortDate(last.date))
    ),
    React.createElement("div", {className:"chart-legend"},
      React.createElement("span", null, React.createElement("span", {className:"legend-line solid"}), "Actual"),
      React.createElement("span", null, React.createElement("span", {className:"legend-line dashed"}), "On pace")
    )
  );
  } catch(e) { console.warn('Stats: CumulativeChart render error', e); return null; }
}

function DailyBarChart({sessions, dailyGoal, daysToShow, dayEndHour}){
  try {
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
        fill:d.isToday ? '#5DCAA5' : '#1D9E75',
        opacity:d.isToday ? 1 : op,
        rx:"2", stroke:d.isToday ? '#1D9E75' : 'none', strokeWidth:d.isToday ? 1 : 0},
        React.createElement("title", null, formatShortDate(d.date) + ': ' + d.stitches + ' stitches')
      )
    );
  }
  var mid = data[Math.floor(data.length / 2)];
  var svgChildren = [];
  if (dailyGoal) {
    svgChildren.push(React.createElement("line", {key:"goal", x1:0, y1:height - yS(dailyGoal), x2:width, y2:height - yS(dailyGoal), stroke:"#D85A30", strokeWidth:"2", strokeDasharray:"4 4", opacity:"0.4"}));
    svgChildren.push(React.createElement("text", {key:"goal-lbl", x:width - 4, y:height - yS(dailyGoal) - 4, textAnchor:"end", fontSize:"10", fill:"#D85A30"}, "Goal: " + dailyGoal));
  }
  svgChildren = svgChildren.concat(barElements);
  return React.createElement("div", {className:"chart-container"},
    React.createElement("div", {style:{position:'relative'}},
      React.createElement("svg", {viewBox:"0 0 " + width + " " + height, width:"100%", preserveAspectRatio:"none", style:{display:'block'}}, svgChildren)
    ),
    React.createElement("div", {className:"chart-x-labels"},
      React.createElement("span", null, formatShortDate(data[0].date)),
      React.createElement("span", null, formatShortDate(mid.date)),
      React.createElement("span", null, "Today")
    )
  );
  } catch(e) { console.warn('Stats: DailyBarChart render error', e); return null; }
}

function StatsChartSection({statsSessions, statsSettings, totalStitches, chartView, setChartView}){
  var dayEndHour = (statsSettings && statsSettings.dayEndHour) || 0;
  var dailyGoal = statsSettings && statsSettings.dailyGoal;
  return React.createElement("div", {className:"chart-section"},
    React.createElement("div", {className:"chart-header"},
      React.createElement("span", {className:"chart-title"}, chartView === 'cumulative' ? 'Progress over time' : 'Stitches per day'),
      React.createElement("div", {className:"chart-toggle"},
        React.createElement("button", {className:"chart-toggle-btn" + (chartView === 'daily' ? ' active' : ''), onClick:function(){ setChartView('daily'); }}, "Daily"),
        React.createElement("button", {className:"chart-toggle-btn" + (chartView === 'cumulative' ? ' active' : ''), onClick:function(){ setChartView('cumulative'); }}, "Cumulative")
      )
    ),
    chartView === 'cumulative'
      ? React.createElement(CumulativeChart, {sessions:statsSessions, totalStitches:totalStitches})
      : React.createElement(DailyBarChart, {sessions:statsSessions, dailyGoal:dailyGoal, dayEndHour:dayEndHour})
  );
}

function MilestoneTracker({milestones}){
  if (!milestones || milestones.length === 0) return null;
  var badges = [];
  for (var i = 0; i < milestones.length; i++) {
    var m = milestones[i];
    var cls = 'milestone-badge ' + (m.achieved ? 'achieved' : m.isNext ? 'next' : 'future');
    var dateLabel = m.achieved
      ? (m.achievedDate ? formatShortDate(m.achievedDate) : '✓')
      : (m.estimatedDate ? '~' + formatShortDate(m.estimatedDate) : '—');
    badges.push(React.createElement("div", {key:m.percent, className:cls},
      React.createElement("span", {className:"milestone-percent"}, m.percent + '%'),
      React.createElement("span", {className:"milestone-date"}, dateLabel)
    ));
  }
  return React.createElement("div", {className:"milestones"},
    React.createElement("h3", {className:"stats-section-title"}, "Milestones"),
    React.createElement("div", {className:"milestone-row"}, badges)
  );
}

function StatsDashboard({statsSessions, statsSettings, totalCompleted, totalStitches, onEditNote, onUpdateSettings, onClose}){
  var chartSt = React.useState('cumulative');
  var chartView = chartSt[0], setChartView = chartSt[1];
  try {
  var overviewStats = computeOverviewStats(statsSessions || [], totalCompleted, totalStitches);
  var milestones = getMilestones(statsSessions || [], totalCompleted, totalStitches, overviewStats.avgPerDay);
  return React.createElement("div", {className:"stats-dashboard"},
    React.createElement("div", {style:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}},
      React.createElement("h2", {style:{fontSize:20, fontWeight:700, color:'#18181b', margin:0}}, "📊 Stats"),
      React.createElement("button", {onClick:onClose, style:{fontSize:13, padding:'4px 14px', borderRadius:8, border:'1px solid #e4e4e7', background:'#fafafa', cursor:'pointer', color:'#71717a'}}, "← Back to grid")
    ),
    React.createElement(OverviewCards, {statsSessions:statsSessions, totalCompleted:totalCompleted, totalStitches:totalStitches}),
    React.createElement("div", {style:{marginTop:20}},
      React.createElement(StatsChartSection, {statsSessions:statsSessions, statsSettings:statsSettings, totalStitches:totalStitches, chartView:chartView, setChartView:setChartView})
    ),
    React.createElement("div", {style:{marginTop:20}},
      React.createElement(MilestoneTracker, {milestones:milestones})
    ),
    React.createElement("div", {style:{marginTop:20}},
      React.createElement(SessionTimeline, {sessions:statsSessions, statsSettings:statsSettings, onEditNote:onEditNote})
    ),
    React.createElement("div", {style:{marginTop:20, padding:16, background:'#fafafa', borderRadius:10, border:'1px solid #e4e4e7'}},
      React.createElement("h4", {style:{fontSize:14, fontWeight:600, color:'#18181b', marginTop:0, marginBottom:8}}, "Settings"),
      React.createElement("label", {style:{display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#71717a'}},
        "Day ends at:",
        React.createElement("select", {value:(statsSettings&&statsSettings.dayEndHour)||0, onChange:function(e){ onUpdateSettings(Object.assign({}, statsSettings, {dayEndHour:parseInt(e.target.value)})); }, style:{fontSize:12, padding:'4px 8px', borderRadius:6, border:'1px solid #e4e4e7'}},
          React.createElement("option", {value:0}, "Midnight"),
          React.createElement("option", {value:1}, "1:00 AM"),
          React.createElement("option", {value:2}, "2:00 AM"),
          React.createElement("option", {value:3}, "3:00 AM"),
          React.createElement("option", {value:4}, "4:00 AM"),
          React.createElement("option", {value:5}, "5:00 AM")
        )
      )
    )
  );
  } catch(e) { console.warn('Stats: StatsDashboard render error', e); return React.createElement("p", {style:{color:'#dc2626',fontSize:13}}, "Stats error — see console."); }
}

const pill=a=>({padding:"5px 14px",fontSize:12,borderRadius:8,cursor:"pointer",border:a?"1px solid #99f6e4":"0.5px solid #e4e4e7",background:a?"#f0fdfa":"#fff",fontWeight:a?600:400,color:a?"#0d9488":"#71717a"});
const tBtn=(a)=>({padding:"5px 12px",fontSize:12,borderRadius:8,cursor:"pointer",border:a?"1px solid #99f6e4":"0.5px solid #e4e4e7",background:a?"#f0fdfa":"#fff",fontWeight:a?600:400,color:a?"#0d9488":"#71717a"});
const tabSt=a=>({padding:"8px 16px",fontSize:13,fontWeight:a?600:400,background:a?"#f0fdfa":"transparent",border:"none",cursor:"pointer",borderBottom:a?"2px solid #0d9488":"2px solid transparent",color:a?"#0d9488":"#a1a1aa",marginBottom:-2, borderRadius: "6px 6px 0 0"});
