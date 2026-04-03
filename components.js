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

const pill=a=>({padding:"5px 14px",fontSize:12,borderRadius:8,cursor:"pointer",border:a?"1px solid #99f6e4":"0.5px solid #e4e4e7",background:a?"#f0fdfa":"#fff",fontWeight:a?600:400,color:a?"#0d9488":"#71717a"});
const tBtn=(a)=>({padding:"5px 12px",fontSize:12,borderRadius:8,cursor:"pointer",border:a?"1px solid #99f6e4":"0.5px solid #e4e4e7",background:a?"#f0fdfa":"#fff",fontWeight:a?600:400,color:a?"#0d9488":"#71717a"});
const tabSt=a=>({padding:"8px 16px",fontSize:13,fontWeight:a?600:400,background:a?"#f0fdfa":"transparent",border:"none",cursor:"pointer",borderBottom:a?"2px solid #0d9488":"2px solid transparent",color:a?"#0d9488":"#a1a1aa",marginBottom:-2, borderRadius: "6px 6px 0 0"});
