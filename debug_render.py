from playwright.sync_api import sync_playwright

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

        page.wait_for_timeout(2000)

        print("Errors caught:")
        for e in errors:
            print(e)

        browser.close()

test()
