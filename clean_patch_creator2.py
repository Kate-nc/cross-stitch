import re

with open("creator-app.js", "r") as f:
    content = f.read()

# remove old `doneCount` reference errors left from previous patch
content = content.replace('if(done&&doneCount>0&&!confirm("This pattern has tracking progress. Editing the pattern will reset your stitching progress. Continue?"))return;', '')

with open("creator-app.js", "w") as f:
    f.write(content)
