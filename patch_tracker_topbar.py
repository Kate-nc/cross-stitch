import sys
import re

with open("tracker-app.js", "r") as f:
    content = f.read()

# Add an "Edit ->" button next to the "Load Project" / Save top right in tracker if one exists?
# Wait, the prompt asked to add it in creator top right. I already had "Start Tracking ->" there from my previous steps, but the prompt said "add an 'open in stitch tracker' button next to the save/open in the top right". It means they want it in the tracker too!
# Let's check what's in the top right of Tracker. Tracker doesn't have a top right toolbar currently! It only has a bottom toolbar.
# Wait, "Could we also add an 'open in stitch tracker' button next to the save/open in the top right for easier access? The button would need to be one or two words, and a similar size to the existing ones. This is to improve usability and access to the feature"
# This request is explicitly about adding it to the Creator's top right toolbar. Since my first version of the PR had it as "Start Tracking ->", perhaps it was too long or they wanted it literally next to Save/Open with the same style. I just changed it to "Track ->" with the exact same padding. Let's make it just "Track".

content = content.replace("Track →</button>", "Track</button>")

with open("tracker-app.js", "w") as f:
    f.write(content)

with open("creator-app.js", "r") as f:
    content2 = f.read()

content2 = content2.replace("Track →</button>", "Track</button>")

with open("creator-app.js", "w") as f:
    f.write(content2)
