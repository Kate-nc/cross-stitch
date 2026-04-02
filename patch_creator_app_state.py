import sys

with open("creator-app.js", "r") as f:
    content = f.read()

warn_logic = """if(done&&doneCount>0&&!confirm("This pattern has tracking progress. Editing the pattern will reset your stitching progress. Continue?"))return;
  """

func_paint = """if((activeTool==="paint"||activeTool==="fill")&&selectedColorId&&cmap){
    """
content = content.replace(func_paint, func_paint + warn_logic)

func_erasebs = """if(activeTool==="eraseBs"){
    """
content = content.replace(func_erasebs, func_erasebs + warn_logic)

func_backstitch = """if(activeTool==="backstitch"){if(gx<0||gx>sW||gy<0||gy>sH)return;"""
content = content.replace(func_backstitch, """if(activeTool==="backstitch"){if(gx<0||gx>sW||gy<0||gy>sH)return;""" + warn_logic)

func_autocrop = """const autoCrop = useCallback(() => {
  if (!pat || !img) return;"""
content = content.replace(func_autocrop, func_autocrop + """
  """ + warn_logic.replace("if(done&&doneCount>0", "if(doneCount>0"))

func_generate = """const generate=useCallback(()=>{
  if(!img)return;"""
content = content.replace(func_generate, func_generate + """
  """ + warn_logic.replace("if(done&&doneCount>0", "if(doneCount>0"))


with open("creator-app.js", "w") as f:
    f.write(content)
