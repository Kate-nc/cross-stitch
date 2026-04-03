import base64
import time
import os
from playwright.sync_api import sync_playwright

dummy_png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAEFJREFUKFNjZCASMDKgCxgaGv4zMjIyMqILwAWRFaMbBNPEgG4wujw2Z6LrwWU6unm4TMdUhzMMh9NwOo0Bw8kAANwZCxK7x98vAAAAAElFTkSuQmCC"

def main():
    with open("dummy.png", "wb") as f:
        f.write(base64.b64decode(dummy_png_b64))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(bypass_csp=True, viewport={"width": 1280, "height": 1024})
        page = context.new_page()

        print("Navigating to http://localhost:8000/index.html")
        page.goto("http://localhost:8000/index.html")

        # Wait for "Create New Pattern" area
        page.wait_for_selector("text=Create New Pattern")

        print("Uploading dummy image...")
        page.locator('input[accept="image/*"]').set_input_files('dummy.png')

        # Wait for "Generate Pattern" button
        page.wait_for_selector("text=Generate Pattern")
        print("Image uploaded successfully.")

        print("Generating pattern...")
        page.click("text=Generate Pattern")

        # Wait for the tabs to appear
        page.wait_for_selector("button.tab-button:has-text('Export')")
        print("Pattern generated successfully.")

        time.sleep(1)
        page.screenshot(path="creator_toolbar.png")
        print("Captured creator_toolbar.png")

        print("Clicking Half / tool...")
        page.click('button[title="Half stitch /"]')

        time.sleep(0.5)
        page.screenshot(path="creator_onboarding.png")
        print("Captured creator_onboarding.png")

        print("Clicking Got it...")
        page.click("text=Got it")

        time.sleep(0.5)
        page.screenshot(path="creator_tooltip.png")
        print("Captured creator_tooltip.png")

        browser.close()

if __name__ == "__main__":
    main()