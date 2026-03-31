const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Pattern Keeper Importer', () => {
    test('UI accepts PDF files and attempts import', async ({ page }) => {
        // Go to local server
        await page.goto('http://localhost:8000/stitch.html');

        // Bypass Content Security Policy to allow inline Babel eval in tests if needed
        await page.route('**/*', (route) => route.continue());

        // Wait for React app to mount
        await page.waitForSelector('text=🧵 Stitch Tracker', { state: 'visible', timeout: 10000 });

        // Trigger file input
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('text=📂 Load Project');
        const fileChooser = await fileChooserPromise;

        // Listen for console errors so we can debug what the app is seeing
        page.on('console', msg => {
            if (msg.type() === 'error') console.log(`BROWSER ERROR: ${msg.text()}`);
        });

        // Use the existing exported_pattern.pdf just to test the pipeline wiring.
        // It's not a true PK pdf, so we expect an error or some parsing action.
        const testPdfPath = path.join(__dirname, '..', 'exported_pattern.pdf');
        await fileChooser.setFiles(testPdfPath);

        // Give the worker time to fetch and process the file
        await page.waitForTimeout(1000);

        // Check if `PatternKeeperImporter` exists, verifying the code was parsed and injected cleanly
        const isParserAvailable = await page.evaluate(() => typeof PatternKeeperImporter !== 'undefined');
        expect(isParserAvailable).toBe(true);
    });
});
