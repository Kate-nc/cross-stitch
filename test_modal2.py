from playwright.sync_api import sync_playwright

def test_export_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 1024})

        page.on("console", lambda msg: print(f"Browser console: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser error: {err}"))

        print("Navigating to index.html...")
        page.goto("http://localhost:8000/index.html")

        # Click "Design from Scratch"
        print("Starting design from scratch...")
        page.click("text=Design from Scratch")
        page.wait_for_timeout(1000)

        print("Clicking File menu...")
        page.click("button:has-text('File')")
        page.wait_for_timeout(500)

        print("Clicking Export...")
        page.click("button:has-text('Export...')")

        page.wait_for_timeout(2000)
        page.screenshot(path="export_modal_test11.png")
        print("Done. Screenshot saved to export_modal_test11.png")
        browser.close()

if __name__ == "__main__":
    test_export_modal()
