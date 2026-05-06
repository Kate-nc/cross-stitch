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

// â”€â”€ Proposal B: Inline hint bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â•â•â• Stats Components â•â•â•

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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   AppInfoPopover â€” UX-12 Plan B: shared summary chip + popover.

   Reusable across Tracker, Stash Manager, /home, and Stats. Owns
   only its own dismissal lifecycle (Escape + click-outside via
   `mousedown`). Renders a fixed-position dialog by default; on
   phones (<600px) the matching CSS converts it to a bottom sheet.

   Props:
     open        â€” boolean; render only when true
     onClose     â€” required; called on Escape, click-outside, scrim tap
     triggerRef  â€” ref to the trigger button (so its own clicks are ignored)
     ariaLabel   â€” dialog label, defaults to "Details"
     children    â€” popover body. Use AppInfoSection / AppInfoGrid helpers.

   Helpers:
     window.AppInfoSection({ title, children }) â€” titled subsection
     window.AppInfoGrid({ rows }) â€” rows: [[label, value], â€¦]
     window.AppInfoBadges({ items }) â€” pills, items: [{ label, kind? }]
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

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




// AdaptedBadge â€” small lavender pill shown next to adapted-project titles in
// the pattern library and on /home. Clicking opens the source project (via
// onClick handler â€” usually navigates to the original).
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   color-3 (C2 + C3): Swatch detail popover and similar-colour
   comparator. Both share the deDescriptor() helper for Î”Eâ‚€â‚€
   plain-English labels. SwatchDetailPopover is portalled into
   document.body so it escapes overflow:hidden ancestors (Legend
   list, MaterialsHub tabs). SimilarColourComparator renders
   inline directly under the warning row that triggered it.
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

window.deDescriptor = function deDescriptor(de) {
  if (de < 1.0) return 'imperceptible â€” identical in practice';
  if (de < 2.0) return 'at the threshold of perception â€” side-by-side test recommended';
  if (de < 3.5) return 'barely perceptible in person';
  if (de < 5.0) return 'perceptible on close inspection';
  if (de < 8.0) return 'clearly different on close inspection';
  return 'clearly different at a glance';
};

// Find the nearest other thread in `palette` to `thread` within a Î”Eâ‚€â‚€
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

// Canonical pair key â€” sort IDs alphabetically and join with '+'.
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


