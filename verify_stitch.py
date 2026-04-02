from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 1024})
        page = context.new_page()

        print("Navigating to stitch.html")
        page.goto("http://localhost:8000/stitch.html")
        page.wait_for_timeout(2000)

        print("Uploading valid_dummy.png to trigger load")
        page.locator('input[type="file"]').set_input_files('valid_dummy.png')
        page.wait_for_timeout(2000)

        print("Clicking Start")
        try:
            page.get_by_role("button", name="▶ Start").click(timeout=3000)
        except:
            print("Start button not found.")

        page.wait_for_timeout(2000)

        print("Taking screenshot")
        page.screenshot(path="stitch_check.png")

        print("Closing")
        browser.close()

if __name__ == "__main__":
    run()
