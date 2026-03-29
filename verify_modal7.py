from playwright.sync_api import sync_playwright
import os

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(bypass_csp=True)
        page = context.new_page()

        # Enable console logging to see frontend errors
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser error: {err.message}"))

        print("Testing Creator App")
        page.goto("http://localhost:8000/index.html")
        page.wait_for_timeout(3000) # give it time to log errors

        try:
            page.wait_for_selector("text=Pattern Creator", timeout=3000)
        except Exception:
            page.screenshot(path="creator_fail.png", full_page=True)
            print("Failed to load Pattern Creator, saved creator_fail.png")
            return

        browser.close()

if __name__ == "__main__":
    verify()
