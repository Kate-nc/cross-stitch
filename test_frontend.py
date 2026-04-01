from playwright.sync_api import sync_playwright
import time
import base64
import os
import json

def test_stitch_tracker_pdf():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Bypass CSP for local testing
        context = browser.new_context(bypass_csp=True)
        page = context.new_page()

        # Setup console listener early to catch errors
        page.on("console", lambda msg: print(f"Browser Console: {msg.type} - {msg.text}"))

        # Start a local server in the background
        os.system("kill $(lsof -t -i :8000) 2>/dev/null || true")
        os.system("python3 -m http.server 8000 > server.log 2>&1 &")
        time.sleep(2)  # Wait for server to start

        try:
            # Navigate to the Stitch Tracker
            page.goto("http://localhost:8000/stitch.html")
            page.wait_for_load_state("networkidle")

            print("Page title:", page.title())

            # Find the file input and upload PAT1968_2.pdf
            file_input = page.locator('input[type="file"]')
            if file_input.count() > 0:
                print("Found file input, uploading PAT1968_2.pdf...")
                file_input.set_input_files("PAT1968_2.pdf")

                print("Waiting for import to complete...")
                time.sleep(15)

                # Take a screenshot
                page.screenshot(path="stitch_tracker_pdf_loaded.png", full_page=True)
                print("Screenshot saved to stitch_tracker_pdf_loaded.png")

                # Verify threads
                threads = page.locator("div")
                # Look for text like "DMC", or thread codes
                # For now just screenshot and visually verify via my terminal

            else:
                print("File input not found!")

        except Exception as e:
            print("Error during test:", e)
        finally:
            browser.close()
            # Clean up the server
            os.system("kill $(lsof -t -i :8000) 2>/dev/null || true")

if __name__ == "__main__":
    test_stitch_tracker_pdf()
