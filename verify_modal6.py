from playwright.sync_api import sync_playwright
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

        with page.expect_file_chooser() as fc_info:
            page.locator("text=Create New Pattern").click()
        file_chooser = fc_info.value
        file_chooser.set_files(abs_img_path)

        page.wait_for_timeout(1000)

        gen_btn = page.locator("button:has-text('Generate')").first
        if gen_btn.is_visible():
            gen_btn.click()
            page.wait_for_timeout(2000)

            export_tab = page.locator("button:has-text('Export')").first
            if export_tab.is_visible():
                export_tab.click()
                page.wait_for_timeout(500)

        export_btn = page.locator("button:has-text('Export PDF')").first
        if export_btn.is_visible():
            print("Export PDF button found in creator!")
            export_btn.click()
            # The title of the modal in modals.js is "Export PDF Settings" or similar. Let's just wait for a known string.
            try:
                page.wait_for_selector("text=Chart Style", timeout=2000)
                page.screenshot(path="pdf_modal_creator.png", full_page=True)
                print("Modal successfully captured in creator app!")
            except Exception as e:
                print("Modal did not appear or chart style text not found", e)
                page.screenshot(path="creator_modal_error.png", full_page=True)
        else:
            print("Export PDF button not found in creator app after generation")

        print("\nTesting Tracker App")
        page.goto("http://localhost:8000/stitch.html")
        page.wait_for_selector("text=Stitch Tracker", timeout=5000)

        abs_json_path = os.path.abspath("tests/test-project.json")

        with page.expect_file_chooser() as fc_info:
            page.locator("text=Load Project").first.click()
        file_chooser = fc_info.value
        file_chooser.set_files(abs_json_path)

        page.wait_for_timeout(2000)

        header_menu_btn = page.locator("button:has-text('☰')").first
        if header_menu_btn.is_visible():
            header_menu_btn.click()
            page.wait_for_timeout(500)

        export_btn = page.locator("button:has-text('Export PDF')").first
        if export_btn.is_visible():
            print("Export PDF button found in tracker!")
            export_btn.click()
            try:
                page.wait_for_selector("text=Chart Style", timeout=2000)
                page.screenshot(path="pdf_modal_tracker.png", full_page=True)
                print("Modal successfully captured in tracker app!")
            except Exception as e:
                print("Modal did not appear in tracker", e)
                page.screenshot(path="tracker_modal_error.png", full_page=True)
        else:
            print("Export PDF button not found in tracker app")

        browser.close()

if __name__ == "__main__":
    verify()
