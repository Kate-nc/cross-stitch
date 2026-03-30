# The -1 in creator-app.js comes from `drawPattern` inner loop replacement?
import re
with open('creator-app.js', 'r') as f:
    c = f.read()

# Let's count braces in the inner loop match:
m = re.search(r'(for\(let y2=startY;y2<endY;y2\+\+\)for\(let x2=startX;x2<endX;x2\+\+\)\{.*?let dim=hiId&&!isHi&&m\.id!=="__skip__";)(.*?)(if\(cSz>=3\)\{ctx\.strokeStyle="rgba\(0,0,0,0\.2\)";)', c, flags=re.DOTALL)
if m:
    s2 = m.group(2)
    s2_ct = 0
    for ch in s2:
        if ch == '{': s2_ct += 1
        elif ch == '}': s2_ct -= 1
    print("creator-app group(2) braces:", s2_ct)
