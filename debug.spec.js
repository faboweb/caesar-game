import { test } from '@playwright/test';

test('visual debug - mobile screenshot with debug labels', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.waitForSelector('#board-img');
  await page.waitForFunction(() => {
    const img = document.getElementById('board-img');
    return img && img.complete && img.naturalWidth > 0;
  });
  await page.waitForTimeout(300);

  // Draw and select a token to show slot highlights
  await page.click('#b-draw');
  await page.waitForTimeout(100);
  await page.locator('.hand-token').first().click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'debug-slots.png', fullPage: true });
  await context.close();
});
