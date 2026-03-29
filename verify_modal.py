from playwright.sync_api import sync_playwright

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(bypass_csp=True)
        page = context.new_page()

        # Open creator app
        page.goto("http://localhost:8000/index.html")
        page.wait_for_selector("text=Pattern Creator", timeout=5000)

        # Click Export PDF button
        export_btn = page.locator("button:has-text('Export PDF')").first
        if export_btn.is_visible():
            export_btn.click()
            page.wait_for_selector("text=Export PDF Settings", timeout=2000)
            page.screenshot(path="pdf_modal_creator.png")
            print("Modal successfully captured in creator app!")
        else:
            print("Export PDF button not found in creator app")

        # Open tracker app
        page.goto("http://localhost:8000/stitch.html")
        page.wait_for_selector("text=Stitch Tracker", timeout=5000)

        # Click Export PDF button in tracker
        export_btn = page.locator("button:has-text('Export PDF')").first
        if export_btn.is_visible():
            export_btn.click()
            page.wait_for_selector("text=Export PDF Settings", timeout=2000)
            page.screenshot(path="pdf_modal_tracker.png")
            print("Modal successfully captured in tracker app!")
        else:
            print("Export PDF button not found in tracker app")

        browser.close()

if __name__ == "__main__":
    verify()
