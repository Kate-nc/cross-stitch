/* creator/LegendTab.js — Thread legend table tab.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: skeinEst (helpers.js), FABRIC_COUNTS (constants.js),
               window.confettiTier (helpers.js), CreatorContext (context.js) */

window.CreatorLegendTab = function CreatorLegendTab() {
  var ctx = React.useContext(window.CreatorContext);
  var app = window.useApp();
  var h = React.createElement;

  if (!(ctx.pat && ctx.pal)) return null;
  if (app.tab !== "legend") return null;

  var headerCols = ["Sym","","DMC","Name","Type","Stitches","Skeins"];
  if (ctx.done) headerCols.push("Done");

  return h("div", null,
    h("div", {style:{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}},
      h("span", {style:{fontSize:12,color:"#475569"}}, "Fabric:"),
      h("select", {
        value:ctx.fabricCt, onChange:function(e){ctx.setFabricCt(Number(e.target.value));},
        style:{padding:"4px 10px",borderRadius:6,border:"0.5px solid #e2e8f0",fontSize:12,background:"#fff"}
      }, FABRIC_COUNTS.map(function(f) {
        return h("option", {key:f.ct, value:f.ct}, f.label);
      })),
      h("span", {style:{fontSize:11,color:"#94a3b8"}}, "Total skeins: "+ctx.totalSkeins)
    ),
    h("div", {style:{overflow:"auto",maxHeight:540}},
      h("table", {style:{width:"100%",borderCollapse:"collapse",fontSize:12}},
        h("thead", null,
          h("tr", {style:{background:"#f8f9fa"}},
            headerCols.map(function(hd, i) {
              return h("th", {
                key:i,
                style:{padding:"8px 10px",textAlign:i>=5?"right":"left",borderBottom:"2px solid #e2e8f0",
                  color:"#475569",fontWeight:600,fontSize:11,textTransform:"uppercase"}
              }, hd);
            })
          )
        ),
        h("tbody", null,
          ctx.pal.map(function(p, i) {
            var dc = ctx.colourDoneCounts[p.id] || {total:0, done:0};
            var sk = skeinEst(p.count, ctx.fabricCt);
            var confettiCount = app.confettiData && app.confettiData.clean && app.confettiData.clean.colorConfetti
              ? app.confettiData.clean.colorConfetti[p.id]
              : null;
            var nameCell = h("td", {style:{padding:"6px 10px",fontSize:11,color:"#475569"}},
              p.type === "blend"
                ? p.threads[0].name + " + " + p.threads[1].name
                : p.name,
              confettiCount ? h("span", {
                title:confettiCount+" isolated stitch"+(confettiCount!==1?"es":""),
                style:{marginLeft:6,color:"#dc2626",fontSize:10,fontWeight:600,cursor:"default",whiteSpace:"nowrap"}
              }, "\u25CF "+confettiCount) : null
            );
            return h("tr", {
              key:i,
              onClick:function(){ctx.setHiId(ctx.hiId===p.id?null:p.id); app.setTab("pattern");},
              style:{borderBottom:"0.5px solid #f1f5f9",cursor:"pointer",background:ctx.hiId===p.id?"#fff7ed":"transparent"}
            },
              h("td", {style:{padding:"6px 10px",fontFamily:"monospace",fontSize:16}}, p.symbol),
              h("td", {style:{padding:"6px 10px"}},
                h("div", {style:{width:24,height:24,borderRadius:5,background:"rgb("+p.rgb+")",border:"0.5px solid #e2e8f0",display:"inline-block"}})
              ),
              h("td", {style:{padding:"6px 10px",fontWeight:600}}, p.id),
              nameCell,
              h("td", {style:{padding:"6px 10px"}},
                h("span", {style:{
                  padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:600,
                  background:p.type==="blend"?"#fff7ed":"#f0fdf4",
                  color:p.type==="blend"?"#ea580c":"#16a34a"
                }}, p.type==="blend"?"Blend":"Solid")
              ),
              h("td", {style:{padding:"6px 10px",textAlign:"right"}}, p.count.toLocaleString()),
              h("td", {style:{padding:"6px 10px",textAlign:"right",fontWeight:600}}, sk),
              ctx.done && h("td", {style:{padding:"6px 10px",textAlign:"right"}},
                h("span", {style:{color:dc.done>=dc.total?"#16a34a":"#475569"}}, dc.done+"/"+dc.total)
              )
            );
          })
        )
      )
    )
  );
};
