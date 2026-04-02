import re

with open("stitch.html", "r") as f:
    content = f.read()

start = content.find('<script type="text/babel">\nconst{useState,useRef')
if start == -1:
    print("Could not find start block")
else:
    end = content.find('</script>\n</body>\n</html>', start)
    if end == -1:
        print("Could not find end block")
    else:
        new_content = content[:start] + '<script type="text/babel">\nReactDOM.createRoot(document.getElementById("root")).render(<App/>);\n' + content[end:]
        with open("stitch.html", "w") as f:
            f.write(new_content)
        print("Updated stitch.html")
