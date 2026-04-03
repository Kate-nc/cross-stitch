from playwright.sync_api import sync_playwright
import base64
import time
import os

_HERE = os.path.dirname(os.path.abspath(__file__))

dummy_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

def main():
    dummy_path = os.path.join(_HERE, "dummy.png")
    with open(dummy_path, "wb") as f:
        f.write(base64.b64decode(dummy_png_b64))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(bypass_csp=True)
        page = context.new_page()

        print("Navigating to http://localhost:8000/index.html")
        page.goto("http://localhost:8000/index.html")

        # Wait for "Create New Pattern" area
        page.wait_for_selector("text=Create New Pattern")

        print("Uploading dummy image...")
        with page.expect_file_chooser() as fc_info:
            page.click("text=Create New Pattern")
        file_chooser = fc_info.value
        file_chooser.set_files(dummy_path)

        # Wait for "Generate Pattern" button
        page.wait_for_selector("text=Generate Pattern")
        print("Image uploaded successfully.")

        print("Generating pattern...")
        page.click("text=Generate Pattern")

        # Wait for the tabs to appear
        page.wait_for_selector("button.tab-button:has-text('Export')")
        print("Pattern generated successfully.")

        print("Clicking Export tab...")
        page.click("button.tab-button:has-text('Export')")

        # Wait a bit to ensure it rendered
        time.sleep(1)

        # Verify Download Pattern PDF button exists
        page.wait_for_selector("text=Download Pattern PDF")
        print("Download Pattern PDF button found.")

        # Verify Save (.json) button exists
        page.wait_for_selector("text=Save (.json)")
        print("Save (.json) button found.")

        # Try to click "Save (.json)" to trigger download
        with page.expect_download() as download_info:
            page.click("button:has-text('Save (.json)')")
        download = download_info.value
        path = download.path()
        print(f"Downloaded project to {path}")

        if os.path.exists(path) and os.path.getsize(path) > 0:
            print("Save functionality works.")
        else:
            print("Save functionality failed.")

        browser.close()

if __name__ == "__main__":
    main()
