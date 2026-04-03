from playwright.sync_api import sync_playwright

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(bypass_csp=True)

        errors = []
        page.on("pageerror", lambda err: errors.append(err.message))
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

        page.goto("http://localhost:8000/index.html")
        page.wait_for_timeout(2000)
        browser.close()

        if errors:
            print("Errors found:")
            for e in errors:
                print(e)
            exit(1)
        else:
            print("No errors.")

test()
