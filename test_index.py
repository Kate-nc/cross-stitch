from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
    page.on("pageerror", lambda exception: print(f"Browser error: {exception}"))
    page.goto("file:///app/index.html")
    page.wait_for_timeout(3000)
    browser.close()
