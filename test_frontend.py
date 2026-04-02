from playwright.sync_api import sync_playwright

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 1024}, bypass_csp=True)
        page = context.new_page()

        # Load tracker
        page.goto("http://localhost:8000/stitch.html")
        page.wait_for_selector("button:has-text('Load Project')", timeout=10000)

        # Upload valid dummy
        with page.expect_file_chooser() as fc_info:
            page.locator("button:has-text('Load Project')").click()
        file_chooser = fc_info.value
        file_chooser.set_files("test_proj2.json")

        page.wait_for_timeout(2000)

        # We can run JS to click it since Playwright selectors are acting strange.
        page.evaluate("document.querySelectorAll('button').forEach(b => { if(b.textContent === 'Edit Mode') b.click(); })")

        page.wait_for_timeout(1000)

        # Click the second stitch
        canvas = page.locator("canvas")
        box = canvas.bounding_box()
        # Click upper-right cell (approx)
        page.mouse.click(box["x"] + box["width"] * 0.75, box["y"] + box["height"] * 0.25)

        page.wait_for_timeout(1000)
        page.screenshot(path="tracker_edit_popover.png")

        # Click remove stitch
        page.once("dialog", lambda dialog: dialog.accept())
        page.evaluate("document.querySelectorAll('button').forEach(b => { if(b.textContent.includes('Remove Stitch')) b.click(); })")
        page.wait_for_timeout(500)

        page.screenshot(path="tracker_edit_remove.png")

        # Close edit mode modal (Apply changes)
        page.evaluate("document.querySelectorAll('button').forEach(b => { if(b.textContent === 'Tracking Mode') b.click(); })")
        page.wait_for_timeout(500)

        # In case the modal appears
        try:
            page.evaluate("document.querySelectorAll('button').forEach(b => { if(b.textContent === 'Apply') b.click(); })")
        except:
            pass

        page.wait_for_timeout(500)
        page.screenshot(path="tracker_edit_applied.png")

        browser.close()

if __name__ == "__main__":
    run_test()
