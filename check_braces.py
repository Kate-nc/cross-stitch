import sys
import re

def check_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    lines = content.split('\n')
    brace_count = 0

    for i, line in enumerate(lines):
        line_clean = re.sub(r'//.*', '', line)
        for char in line_clean:
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1

        if 'return (' in line or 'return(' in line.replace(' ', ''):
            print(f"{filepath} Line {i+1}: return statement found. Current brace depth: {brace_count}")
            if brace_count == 0:
                print("ERROR: return is at depth 0 (outside of any function/block)")

check_file('tracker-app.js')
