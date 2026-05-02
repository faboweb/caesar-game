import { test } from '@playwright/test';

test('corners alignment at 402x874', async ({ browser }) => {
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
  
  // Log overlay position details
  const info = await page.evaluate(() => {
    const img = document.querySelector('.board-img');
    const ov = document.querySelector('.board-overlay');
    const ir = img.getBoundingClientRect();
    const or2 = ov.getBoundingClientRect();
    
    // Check a few slot positions in pixels
    const slots = document.querySelectorAll('.slot-target');
    const slotInfo = [];
    slots.forEach(s => {
      const r = s.getBoundingClientRect();
      slotInfo.push({
        left: Math.round(r.left),
        top: Math.round(r.top),
        style: s.style.cssText.substring(0, 40),
      });
    });
    
    return {
      img: { w: ir.width.toFixed(1), h: ir.height.toFixed(1), l: ir.left.toFixed(1), t: ir.top.toFixed(1) },
      ov: { w: or2.width.toFixed(1), h: or2.height.toFixed(1), l: or2.left.toFixed(1), t: or2.top.toFixed(1) },
      slotsCount: slots.length,
      firstSlots: slotInfo.slice(0, 3),
      lastSlots: slotInfo.slice(-3),
      // Check supply markers
      supplies: document.querySelectorAll('.supply-marker').length,
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await page.screenshot({ path: 'test-corners.png', fullPage: true });
  await context.close();
});
