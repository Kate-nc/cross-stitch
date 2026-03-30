def check_braces(fpath):
    with open(fpath, 'r') as f:
        s = f.read()
    c = 0
    for ch in s:
        if ch == '{': c+=1
        elif ch == '}': c-=1
    return c

print("creator-app:", check_braces('creator-app.js'))
print("index:", check_braces('index.html'))
print("tracker-app:", check_braces('tracker-app.js'))
print("stitch:", check_braces('stitch.html'))
