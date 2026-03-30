import base64
import time
from playwright.sync_api import sync_playwright

png_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg=="
with open("/app/dummy.png", "wb") as f: f.write(base64.b64decode(png_base64))

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(bypass_csp=True)
    page = context.new_page()
    page.goto("file:///app/index.html")
    page.wait_for_timeout(2000)

    page.locator('.upload-area').first.click()
    page.locator('input[accept="image/*"]').set_input_files("/app/dummy.png")
    page.wait_for_timeout(1000)

    btn = page.get_by_role('button', name='Generate Pattern')
    btn.click()
    page.wait_for_timeout(2000)

    # Open palette
    page.get_by_text('Palette', exact=True).click()
    page.wait_for_timeout(500)

    try:
        # Check Allow fractional stitches
        lbl = page.locator('label', has_text='Allow fractional stitches')
        lbl.click(timeout=3000)
        page.wait_for_timeout(500)
    except Exception as e:
        print("Could not find label:", e)

    # Select color
    page.locator('div[style*="border-radius: 5px"]').first.click()
    page.wait_for_timeout(500)

    # Click Paint
    page.get_by_role('button', name='Paint', exact=True).click()
    page.wait_for_timeout(500)

    page.screenshot(path="/app/creator_tools.png")

    page.get_by_role('button', name='¾', exact=True).click()
    page.wait_for_timeout(500)

    page.get_by_role('button', name='◺', exact=True).click()
    page.wait_for_timeout(500)

    page.screenshot(path="/app/creator_fractional_state.png")

    browser.close()
