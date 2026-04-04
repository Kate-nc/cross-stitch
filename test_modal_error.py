from playwright.sync_api import sync_playwright

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 1024})

        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Page Error: {err}"))

        page.goto("http://localhost:8000/index.html")
        page.wait_for_selector("text=Design from Scratch")
        page.click("text=Design from Scratch")
        page.wait_for_timeout(1000)

        page.click("button:has-text('File')")
        page.wait_for_timeout(500)

        page.click("button:has-text('Export...')")
        page.wait_for_timeout(2000)

        browser.close()

if __name__ == "__main__":
    test()
