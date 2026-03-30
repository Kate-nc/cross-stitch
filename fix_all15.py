def count_braces(f):
    with open(f, 'r') as fp:
        s = fp.read()
    c=0
    for ch in s:
        if ch=='{': c+=1
        elif ch=='}': c-=1
    return c
print("creator-app:", count_braces('creator-app.js'))
print("index:", count_braces('index.html'))
print("tracker-app:", count_braces('tracker-app.js'))
print("stitch:", count_braces('stitch.html'))
