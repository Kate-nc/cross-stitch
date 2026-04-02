import sys
import re

with open("tracker-app.js", "r") as f:
    content = f.read()

# Make sure "Edit in Creator" button is ONLY visible if it's a full pattern, not a progress file or missing properties.
# Well, all projects loaded in Tracker have `pat`.
# Let's ensure the button only shows if the full pattern is loaded, which it is.

# Let's verify the button doesn't look bad or is duplicated
if content.count("handleEditInCreator") > 2:
    print("Warning: Duplicate handleEditInCreator logic found!")
