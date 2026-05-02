import { test } from '@playwright/test';

test('visual debug - mobile screenshot', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }, // iPhone SE
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
  await page.waitForTimeout(500);

  // Draw a token and select it to show slot highlights
  await page.click('#b-draw');
  await page.locator('.hand-token').first().click();
  await page.waitForTimeout(200);

  await page.screenshot({ path: 'debug-mobile.png', fullPage: true });

  // Also log the img rect vs SVG rect
  const rects = await page.evaluate(() => {
    const img = document.getElementById('board-img');
    const svg = document.getElementById('board-overlay');
    const wrap = document.getElementById('board-wrap');
    const container = document.getElementById('board-container');
    return {
      img: img.getBoundingClientRect(),
      svg: svg.getBoundingClientRect(),
      wrap: wrap.getBoundingClientRect(),
      container: container.getBoundingClientRect(),
      imgNatural: { w: img.naturalWidth, h: img.naturalHeight },
      imgDisplay: { w: img.offsetWidth, h: img.offsetHeight },
      svgViewBox: svg.getAttribute('viewBox'),
      wrapStyle: { w: wrap.offsetWidth, h: wrap.offsetHeight },
    };
  });
  console.log('RECTS:', JSON.stringify(rects, null, 2));
  await context.close();
});
