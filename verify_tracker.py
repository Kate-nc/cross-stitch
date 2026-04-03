import base64
import time
import os
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(bypass_csp=True, viewport={"width": 1280, "height": 1024})
        page = context.new_page()

        print("Navigating to http://localhost:8000/stitch.html")
        page.goto("http://localhost:8000/stitch.html")

        # Wait for the Load button
        page.wait_for_selector("text=Load Project")
        print("Page loaded.")

        print("Uploading mock project...")
        # Since the input is hidden, set_input_files directly on the input element
        page.locator('input[type="file"]').set_input_files('test_proj_direct.json')

        # Wait for the project to load by checking if the canvas or a color palette item appears
        try:
            page.wait_for_selector('canvas', timeout=10000)
            print("Project loaded successfully.")
        except Exception as e:
            print("Failed to load project:", e)
            page.screenshot(path="tracker_failed_load.png")
            browser.close()
            return

        time.sleep(2)
        page.screenshot(path="tracker_unmarked.png")
        print("Captured tracker_unmarked.png")

        # Now simulate tapping a multi-stitch cell
        # The first cell in our mock test_proj_direct.json is at (0, 0), with pattern value 1 (which has fractional stitches)
        # We need to click the canvas at the center of the first cell
        canvas = page.locator('canvas').first
        box = canvas.bounding_box()

        if box:
            print("Clicking top-left corner of the canvas to trigger mark...")
            # cell size is let's say 20px (default 100%), margin is 28px (G=28)
            # Center of the first cell is at G + cSz/2 -> 28 + 10 = 38
            # Corner is at G+2 = 30
            page.mouse.click(box['x'] + 30, box['y'] + 30)

            # Wait for flash component or just wait a bit to capture the frame
            time.sleep(0.1)
            page.screenshot(path="tracker_flash.png")
            print("Captured tracker_flash.png")

            # Wait to let flash settle
            time.sleep(0.5)
            page.screenshot(path="tracker_marked.png")
            print("Captured tracker_marked.png")

            print("Clicking near center of cell (0, 0) to trigger disambiguation popup...")
            page.mouse.click(box['x'] + 38, box['y'] + 38)
            time.sleep(0.5)
            page.screenshot(path="tracker_popup.png")
            print("Captured tracker_popup.png")

        browser.close()

if __name__ == "__main__":
    main()