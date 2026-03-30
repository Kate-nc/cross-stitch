import base64
from playwright.sync_api import sync_playwright, expect
import time

def verify_overlay(page):
    page.goto('http://localhost:8000/index.html')

    # 1. Create dummy PNG image to upload
    pixel_png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    with open('dummy.png', 'wb') as f:
        f.write(base64.b64decode(pixel_png))

    # Upload image
    with page.expect_file_chooser() as fc_info:
        page.locator('.upload-area').first.click()
    file_chooser = fc_info.value
    file_chooser.set_files('dummy.png')

    # Wait for "Generate Pattern" button
    generate_btn = page.get_by_role('button', name='Generate Pattern', exact=True)
    generate_btn.wait_for()
    generate_btn.click()

    # Give it some time to generate
    time.sleep(1.0)

    # Ensure overlay toggle exists
    overlay_btn = page.get_by_role('button', name='Overlay', exact=True)
    overlay_btn.wait_for()

    # Take screenshot before toggle
    page.screenshot(path='/tmp/overlay_off.png')

    # Toggle overlay
    overlay_btn.click()

    # Take screenshot after toggle
    page.screenshot(path='/tmp/overlay_on.png')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(bypass_csp=True)
    page = context.new_page()
    try:
        verify_overlay(page)
    finally:
        context.close()
        browser.close()
