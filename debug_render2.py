from playwright.sync_api import sync_playwright
import json

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(bypass_csp=True)

        errors = []
        page.on("pageerror", lambda err: errors.append("PAGE ERROR: " + err.message))
        page.on("console", lambda msg: errors.append(f"CONSOLE {msg.type}: {msg.text}") if msg.type in ['error', 'warning'] else None)

        print("Navigating...")
        response = page.goto("http://localhost:8000/index.html")
        print(f"Response status: {response.status}")

        minimal_project = {
            "version": 8, "page": "creator",
            "settings": {"sW":10, "sH":10, "maxC":30, "bri":0, "con":0, "sat":0, "dith":False, "skipBg":False, "bgTh":15, "bgCol":[255,255,255], "minSt":0, "arLock":True, "ar":1, "fabricCt":14, "skeinPrice":1.1, "stitchSpeed":40, "smooth":0, "smoothType":"median", "orphans":0},
            "pattern": [{"id":"310", "type":"solid", "rgb":[0,0,0]} for _ in range(100)],
            "bsLines": [],
            "done": [0]*100,
            "parkMarkers": [], "totalTime": 0, "sessions": [], "hlRow": -1, "hlCol": -1, "threadOwned": {}
        }

        page.evaluate(f"""() => {{
            localStorage.setItem('crossstitch_handoff', JSON.stringify({json.dumps(minimal_project)}));
        }}""")

        print("Reloading to test handoff...")
        response = page.goto("http://localhost:8000/index.html")

        page.wait_for_timeout(2000)

        print("Taking screenshot...")
        page.screenshot(path="debug_creator_with_data.png")

        print("Errors caught:")
        for e in errors:
            print(e)

        browser.close()

test()
