import re

with open('index.html', 'r') as f:
    index_html = f.read()

# Replace the giant inline <script type="text/babel"> block with just ReactDOM.render
# because the actual App is loaded from creator-app.js
pattern = re.compile(r'(<script type="text/babel">).*?(</script>\s*</body>)', re.DOTALL)
new_html = pattern.sub(r'\1\nReactDOM.createRoot(document.getElementById("root")).render(<App/>);\n\2', index_html)

# Also ensure fractional-stitches.js is loaded
if 'fractional-stitches.js' not in new_html:
    new_html = new_html.replace('<script src="helpers.js"></script>', '<script src="helpers.js"></script>\n<script src="fractional-stitches.js"></script>')

with open('index.html', 'w') as f:
    f.write(new_html)
