import sys
import re

with open("creator-app.js", "r") as f:
    content = f.read()

# Add warnings for editing if `doneCount > 0`. This was already done in `patch_creator_app_state.py`
# Let's verify it's there
if "if(doneCount>0&&!confirm" in content:
    print("Warning logic exists.")
else:
    print("Warning logic missing!")
