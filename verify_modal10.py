from playwright.sync_api import sync_playwright
import os

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(bypass_csp=True)
        page = context.new_page()

        print("\nTesting Tracker App")
        page.goto("http://localhost:8000/stitch.html")
        page.wait_for_selector("text=Stitch Tracker", timeout=5000)

        abs_json_path = os.path.abspath("tests/test-project.json")

        with page.expect_file_chooser() as fc_info:
            page.locator("text=Load Project").first.click()
        file_chooser = fc_info.value
        file_chooser.set_files(abs_json_path)

        page.wait_for_timeout(2000)

        export_btn = page.locator("button:has-text('Export PDF')").first
        if export_btn.is_visible():
            print("Export PDF button found in tracker!")
            export_btn.click()
            page.wait_for_timeout(2000)
            page.screenshot(path="pdf_modal_tracker.png", full_page=True)
            print("Modal successfully captured in tracker app!")
        else:
            print("Export PDF button not found in tracker app")
            page.screenshot(path="tracker_state.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    verify()
