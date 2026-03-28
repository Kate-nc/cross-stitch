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

  return React.createElement("div", {style:{borderRadius:10,border:"1px solid #e2e5ea",background:"#fff",overflow:"hidden"}},
    React.createElement("button", {onClick:handleToggle, style:{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,color:"#2d3748",gap:8}},
      React.createElement("span", {style:{display:"flex",alignItems:"center",gap:8}}, title, badge),
      React.createElement("span", {style:{fontSize:10,color:"#94a3b8",transform:currentOpen?"rotate(180deg)":"rotate(0deg)"}}, "▼")
    ),
    currentOpen&&React.createElement("div", {style:{padding:"0 14px 14px",borderTop:"1px solid #f0f2f5"}}, children)
  );
}
function SliderRow({label,value,min,max,step=1,onChange,suffix="",format=null}){
  return React.createElement("div", {style:{marginBottom:2}},
    React.createElement("div", {style:{display:"flex",justifyContent:"space-between",fontSize:12,color:"#4a5568",marginBottom:3}},
      React.createElement("span", null, label),
      React.createElement("span", {style:{fontWeight:600,color:"#2d3748"}}, format?format(value):value, suffix)
    ),
    React.createElement("input", {type:"range", min:min, max:max, step:step, value:value, onChange:e=>onChange(Number(e.target.value)), style:{width:"100%"}})
  );
}

const pill=a=>({padding:"5px 14px",fontSize:12,borderRadius:20,cursor:"pointer",border:a?"1.5px solid #5b7bb3":"1.5px solid #e2e5ea",background:a?"#edf2fa":"#fff",fontWeight:a?600:400,color:a?"#3d5a8c":"#4a5568"});
const tBtn=(a,color)=>{let c={orange:["#fff7ed","#ea580c"],blue:["#eff6ff","#2563eb"],green:["#f0fdf4","#16a34a"]}[color]||["#eff6ff","#2563eb"];return{padding:"5px 12px",fontSize:12,borderRadius:8,cursor:"pointer",border:a?`1.5px solid ${c[1]}`:"1.5px solid #e2e5ea",background:a?c[0]:"#fff",fontWeight:a?600:400,color:a?c[1]:"#4a5568"};};
const tabSt=a=>({padding:"8px 16px",fontSize:13,fontWeight:a?600:400,background:a?"#edf2fa":"transparent",border:"none",cursor:"pointer",borderBottom:a?"2.5px solid #5b7bb3":"2.5px solid transparent",color:a?"#3d5a8c":"#94a3b8",marginBottom:-2, borderRadius: "6px 6px 0 0"});
