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

        page.screenshot(path="/home/jules/verification/modal4.png")

        context.close()
=======
import os

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(bypass_csp=True)
        page = context.new_page()

        print("Testing Creator App")
        page.goto("http://localhost:8000/index.html")
        page.wait_for_selector("text=Pattern Creator", timeout=5000)

        abs_img_path = os.path.abspath("tests/test-image.png")
        # Find the card with "Need a pattern?" and click it to go to creator if we're not there (but we are)
        # We need to click the "Original Image" change button or just use the global input
        page.locator("input[type='file']").first.set_input_files(abs_img_path)
        page.wait_for_timeout(1000)

        # Look for the generate button, its text might be just "Generate"
        gen_btn = page.locator("button", has_text="Generate").first
        if gen_btn.is_visible():
            gen_btn.click()
            page.wait_for_timeout(2000)

        export_btn = page.locator("button:has-text('Export PDF')").first
        if export_btn.is_visible():
            print("Export PDF button found in creator!")
            export_btn.click()
            page.wait_for_selector("text=PDF Export Settings", timeout=2000)
            page.screenshot(path="pdf_modal_creator.png", full_page=True)
            print("Modal successfully captured in creator app!")
        else:
            print("Export PDF button not found in creator app after generation")
            page.screenshot(path="creator_state.png", full_page=True)

        print("\nTesting Tracker App")
        page.goto("http://localhost:8000/stitch.html")
        page.wait_for_selector("text=Stitch Tracker", timeout=5000)

        abs_json_path = os.path.abspath("tests/test-project.json")
        page.locator("input[type='file']").first.set_input_files(abs_json_path)
        page.wait_for_timeout(2000)

        header_menu_btn = page.locator("button:has-text('☰')").first
        if header_menu_btn.is_visible():
            header_menu_btn.click()
            page.wait_for_timeout(500)

        export_btn = page.locator("button:has-text('Export PDF')").first
        if export_btn.is_visible():
            print("Export PDF button found in tracker!")
            export_btn.click()
            page.wait_for_selector("text=PDF Export Settings", timeout=2000)
            page.screenshot(path="pdf_modal_tracker.png", full_page=True)
            print("Modal successfully captured in tracker app!")
        else:
            print("Export PDF button not found in tracker app")
            page.screenshot(path="tracker_state.png", full_page=True)

>>>>>>> origin/main
        browser.close()

if __name__ == "__main__":
    verify()
