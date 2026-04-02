import re

with open('index.html', 'r') as f:
    index_html = f.read()

# We need to drop the huge inline <script type="text/babel"> that was duplicated.
# Let's just restore it exactly to how it was where it only referenced creator-app.js
# and didn't have an inline App definition. Wait, no, we need to look at what the original was.
