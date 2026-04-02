from playwright.sync_api import sync_playwright
<<<<<<< HEAD
import base64

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 1024}, bypass_csp=True)
        page = context.new_page()

        # Create a small dummy image inline
        b64_img = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAXSURBVChTY3gro/mfARIYVQwqAEMMAwMAAroQy4iH07EAAAAASUVORK5CYII="
        img_bytes = base64.b64decode(b64_img)
        with open("/tmp/dummy.png", "wb") as f:
            f.write(img_bytes)

        page.goto("http://localhost:8000/index.html")
        page.wait_for_timeout(1000)

        page.locator('input[accept="image/*"]').set_input_files("/tmp/dummy.png")
        page.wait_for_timeout(1000)

        page.get_by_role("button", name="Generate Pattern").click()
        page.wait_for_timeout(2000)

        # Open the Help Modal
        page.locator('button[title="Stitch guide"]').click()
        page.wait_for_timeout(1000)

        # Click Quarter stitch tab
        page.get_by_role("button", name="Quarter").click()
        page.wait_for_timeout(500)

        page.screenshot(path="/home/jules/verification/modal.png")

        context.close()
=======

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

>>>>>>> origin/main
        browser.close()

if __name__ == "__main__":
    verify()
