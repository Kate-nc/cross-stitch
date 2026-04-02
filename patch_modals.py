import re
import sys

with open("modals.js", "r") as f:
    content = f.read()

# Make sure not to duplicate
if "Calculator: (" not in content:
    with open("calculator.js", "r") as f:
        calc_content = f.read()

    # calc_content is currently defined as `const Calculator = ...`
    # We want to add it as `Calculator: ({ onClose, initialPatterns = [] }) => { ... },`
    # inside SharedModals

    calc_obj_str = calc_content.replace("const Calculator = ({", "Calculator: ({").replace("};\n", "},\n")

    # Insert it before the last closing brace of SharedModals
    content = content.replace("};", calc_obj_str + "\n};")

    with open("modals.js", "w") as f:
        f.write(content)

    print("Patched modals.js")
else:
    print("Already patched")
