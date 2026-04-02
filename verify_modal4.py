from playwright.sync_api import sync_playwright
import base64

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 1024}, bypass_csp=True)
        page = context.new_page()

        # Create a small dummy image inline
        b64_img = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAXSURBVChTY3gro/mfARIYVQwqAEMMAwMAAroQy4iH07EAAAAASUVORK5CYII="
        img_bytes = base64.b64decode(b64_img)
        with open("/tmp/dummy.png", "wb") as f:
            f.write(img_bytes)

        page.goto("http://localhost:8000/index.html")
        page.wait_for_timeout(1000)

        page.locator('input[accept="image/*"]').set_input_files("/tmp/dummy.png")
        page.wait_for_timeout(1000)

        page.get_by_role("button", name="Generate Pattern").click()
        page.wait_for_timeout(2000)

        page.screenshot(path="/home/jules/verification/modal4.png")

        context.close()
        browser.close()

if __name__ == "__main__":
    verify()
