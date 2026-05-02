import { test } from '@playwright/test';

test('alignment check at user phone size (402x874 dpr3)', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  await page.goto('http://localhost:8888/');
  await page.waitForSelector('.board-img');
  await page.waitForFunction(() => {
    const img = document.querySelector('.board-img');
    return img && img.complete && img.naturalWidth > 0;
  });
  await page.waitForTimeout(500);

  // Draw tokens to make it look like the user's screenshot
  await page.click('.btn >> text=Draw');
  await page.click('.btn >> text=Draw');

  // Log the overlay vs image rects
  const rects = await page.evaluate(() => {
    const img = document.querySelector('.board-img');
    const ov = document.querySelector('.board-overlay');
    const wrap = document.querySelector('.board-wrap');
    const ir = img.getBoundingClientRect();
    const or2 = ov.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    return {
      img: { w: Math.round(ir.width), h: Math.round(ir.height), l: Math.round(ir.left), t: Math.round(ir.top) },
      overlay: { w: Math.round(or2.width), h: Math.round(or2.height), l: Math.round(or2.left), t: Math.round(or2.top) },
      wrap: { w: Math.round(wr.width), h: Math.round(wr.height), l: Math.round(wr.left), t: Math.round(wr.top) },
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      imgMatch: Math.abs(ir.width - or2.width) < 2 && Math.abs(ir.height - or2.height) < 2,
      posMatch: Math.abs(ir.left - or2.left) < 2 && Math.abs(ir.top - or2.top) < 2,
      ratio: (ir.width / ir.height).toFixed(3),
      naturalRatio: (img.naturalWidth / img.naturalHeight).toFixed(3),
    };
  });
  console.log('RECTS:', JSON.stringify(rects, null, 2));

  await page.screenshot({ path: 'test-align.png', fullPage: true });
  await context.close();
});
