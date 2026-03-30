import re

# We know `patch_pdf.py` replaces the inner body of the `for` loops in `exportPDF` but inadvertently removes `}}`.
# Let's inspect `patch_pdf.py` again.
with open('patch_pdf.py', 'r') as f:
    c = f.read()

# Ah! In patch_pdf.py I wrote:
# content = re.sub(r'(for\(let gy=0;gy<dH;gy\+\+\)for\(let gx=0;gx<dW;gx\+\+\)\{)(.*?\}{2})(pdf\.setDrawColor\(80\);pdf\.setLineWidth\(0\.2\);)', repl_export_pdf, content, flags=re.DOTALL)
# And the repl function returns:
# return prefix + new_inner + suffix
# Wait, `\}{2}` was in group 2!
# `(.*?\}{2})` matches the body AND the `}}`.
# And then `repl_export_pdf` replaced ALL of group 2 with `new_inner` WHICH ONLY HAD `}\n}`.
# BUT WAIT. Does `new_inner` have `}\n}`? Yes, I added `}\n}` to the end of `new_inner`.
# Then why does it still have a missing brace? Let's verify `patch_pdf.py` output.

import subprocess
subprocess.run(['git', 'checkout', 'HEAD', 'creator-app.js', 'index.html'])
def count_braces(fpath):
    with open(fpath, 'r') as f:
        s = f.read()
    c = 0
    for ch in s:
        if ch == '{': c+=1
        elif ch == '}': c-=1
    return c

print("Before pdf:", count_braces('creator-app.js'))
subprocess.run(['python3', 'patch_pdf.py'])
print("After pdf:", count_braces('creator-app.js'))
