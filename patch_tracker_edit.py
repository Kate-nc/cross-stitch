import re

with open("tracker-app.js", "r") as f:
    content = f.read()

# Make the Edit in Creator just say Edit
content = content.replace("← Edit in Creator</button>", "Edit</button>")

with open("tracker-app.js", "w") as f:
    f.write(content)
