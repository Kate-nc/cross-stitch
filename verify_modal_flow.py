import base64
import time
from playwright.sync_api import sync_playwright

def verify_modal():
    png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=="
    with open("dummy.png", "wb") as fh:
        fh.write(base64.b64decode(png_b64))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 1024})
        page = context.new_page()
        page.goto('http://localhost:8000/index.html')
        time.sleep(2)

        page.set_input_files('input[type="file"]', 'dummy.png')

        # Click Generate Pattern
        page.wait_for_selector('button:has-text("Generate Pattern")')
        page.click('button:has-text("Generate Pattern")')

        # Now wait for the tools to appear
        page.wait_for_selector('button[title="Stitch guide"]')

        # Click the fractional stitch guide '?' button
        page.click('button[title="Stitch guide"]')

        page.wait_for_selector('text=Fractional Stitch Guide')
        page.screenshot(path='/home/jules/verification/modal_open.png')
        print("Successfully captured modal screenshot.")
        browser.close()

verify_modal()
