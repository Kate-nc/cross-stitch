import base64
import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context()
    page = context.new_page()
    page.goto("http://localhost:8000/index.html")
    page.wait_for_timeout(2000)

    page.locator('.upload-area').first.click()
    page.locator('input[accept="image/*"]').set_input_files("/app/dummy.png")
    page.wait_for_timeout(1000)

    btn = page.get_by_role('button', name='Generate Pattern')
    btn.click()
    page.wait_for_timeout(2000)

    # Allow fractional stitches
    try:
        # Since it is in a section called Palette, we open it
        page.get_by_text('Palette', exact=True).click()
        page.wait_for_timeout(500)
        lbl = page.locator('label', has_text='Allow fractional stitches')
        lbl.click(timeout=3000)
        page.wait_for_timeout(500)
    except Exception as e:
        print("Could not find label:", e)

    page.screenshot(path="/app/creator_after_gen.png")

    try:
        # Click the FIRST palette item in the main tools area
        page.locator('div[style*="border: 0.5px solid rgb(228, 228, 231)"]').first.click()
    except Exception as e:
        print("Could not click palette item:", e)

    page.wait_for_timeout(500)

    page.get_by_role('button', name='Paint', exact=True).click()
    page.wait_for_timeout(500)

    page.get_by_role('button', name='¾', exact=True).click()
    page.wait_for_timeout(500)

    page.get_by_role('button', name='◺', exact=True).click()
    page.wait_for_timeout(500)

    page.screenshot(path="/app/creator_fractional_state.png")

    browser.close()
