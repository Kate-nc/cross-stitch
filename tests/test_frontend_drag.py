from playwright.sync_api import sync_playwright
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1280, "height": 1024}, bypass_csp=True, record_video_dir=os.path.join(_ROOT, "videos"))
        page = context.new_page()

        # Assuming python3 -m http.server 8000 is running from the root
        page.goto("http://localhost:8000/stitch.html")
        page.wait_for_timeout(1000)

        # Load the test_proj.json file
        file_input = page.locator('input[type="file"]')
        file_input.set_input_files(os.path.join(_HERE, 'test_proj.json'))
        page.wait_for_timeout(2000)

        page.screenshot(path=os.path.join(_HERE, "before_drag.png"))

        # Select first canvas element
        canvas = page.locator('canvas').first
        box = canvas.bounding_box()

        if box:
            x, y = box['x'], box['y']
            # Perform a drag action
            page.mouse.move(x + 100, y + 100)
            page.mouse.down()
            page.mouse.move(x + 150, y + 100, steps=10)
            page.mouse.move(x + 150, y + 150, steps=10)
            page.mouse.up()
            page.wait_for_timeout(1000)
            page.screenshot(path=os.path.join(_HERE, "after_drag.png"))
            print("Drag action completed successfully.")
        else:
            print("Canvas not found!")

        context.close()
        browser.close()

if __name__ == "__main__":
    run()
