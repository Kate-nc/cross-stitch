import re
import os
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(_ROOT, 'modals.js'), 'r') as f:
    content = f.read()

print("Calculator component exists:", "Calculator:" in content)
