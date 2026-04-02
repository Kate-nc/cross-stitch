import re
with open('modals.js', 'r') as f:
    content = f.read()

print("Calculator component exists:", "Calculator:" in content)
