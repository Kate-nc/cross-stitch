from playwright.sync_api import sync_playwright

def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 1024})

        page.goto("http://localhost:8000/index.html")
        page.click("text=Design from Scratch")
        page.wait_for_timeout(1000)

        page.click("button:has-text('File')")
        page.wait_for_timeout(500)

        # Click Export in the menu
        page.click("button:has-text('Export...')")

        # Wait for the modal header
        page.wait_for_selector("h3:has-text('Export Pattern')", timeout=5000)

        page.screenshot(path="export_modal_final.png")
        print("Success!")
        browser.close()

if __name__ == "__main__":
    test()
