import base64
import os
import time
from playwright.sync_api import sync_playwright

png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=="
dummy_img_path = "/app/dummy.png"
with open(dummy_img_path, "wb") as f:
    f.write(base64.b64decode(png_base64))

def test_fractional_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(bypass_csp=True)
        page = context.new_page()
        page.goto("file:///app/index.html")
        page.wait_for_timeout(2000)

        # log errors
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
        page.on("pageerror", lambda exception: print(f"Browser error: {exception}"))

        page.locator('.upload-area').first.click()
        page.locator('input[accept="image/*"]').set_input_files(dummy_img_path)
        page.wait_for_timeout(1000)

        btn = page.get_by_role('button', name='Generate Pattern')
        btn.wait_for(state="visible")
        btn.click()
        page.wait_for_timeout(2000)

        try:
            page.locator('text=Allow fractional stitches').click(timeout=3000)
        except:
            print("Could not find 'Allow fractional stitches'")

        page.wait_for_timeout(500)

        # Select a color
        page.locator('div[style*="font-family: monospace"]').first.click()
        page.wait_for_timeout(500)

        # Click Paint
        page.get_by_role('button', name='Paint', exact=True).click()
        page.wait_for_timeout(500)

        page.screenshot(path="/app/creator_tools.png")

        # Try to select ¾
        page.get_by_role('button', name='¾', exact=True).click()
        page.wait_for_timeout(500)

        # Try to select BL corner
        page.get_by_role('button', name='◺', exact=True).click()
        page.wait_for_timeout(500)

        page.screenshot(path="/app/creator_fractional_state.png")

        browser.close()

if __name__ == "__main__":
    test_fractional_ui()
