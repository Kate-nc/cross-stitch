from playwright.sync_api import sync_playwright

def verify_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 1024})
        page = context.new_page()

        # Load Pattern Creator
        page.goto('http://localhost:8000/index.html')
        page.wait_for_selector('button[title="Fractional Stitch Guide"]')

        # Click the fractional stitch guide '?' button
        page.click('button[title="Fractional Stitch Guide"]')
        page.wait_for_selector('text=Fractional Stitch Guide')

        # Take screenshot of the open modal
        page.screenshot(path='/home/jules/verification/modal_open.png')
        print("Successfully captured modal screenshot.")

        browser.close()

verify_modal()
