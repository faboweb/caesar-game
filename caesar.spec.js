import { test, expect } from '@playwright/test';

test.describe('Caesar! Virtual Tabletop', () => {

  test.beforeEach(async ({ page }) => {
    // Clear localStorage and load fresh
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await page.waitForSelector('#board-img');
    // Wait for image to load and game to init
    await page.waitForFunction(() => {
      const img = document.getElementById('board-img');
      return img && img.complete && img.naturalWidth > 0;
    });
    // Small delay for render
    await page.waitForTimeout(200);
  });

  test('page loads with board image and UI elements', async ({ page }) => {
    await expect(page.locator('#board-img')).toBeVisible();
    await expect(page.locator('#header')).toBeVisible();
    await expect(page.locator('#hand-panel')).toBeVisible();
    await expect(page.locator('#b-draw')).toBeVisible();
    await expect(page.locator('#b-rot')).toBeVisible();
    await expect(page.locator('#b-mark')).toBeVisible();
    await expect(page.locator('#b-end')).toBeVisible();
  });

  test('starts as Caesar with 16 tokens in bag', async ({ page }) => {
    const name = await page.locator('#pname').textContent();
    expect(name).toBe('Caesar');
    const bag = await page.locator('#pbag').textContent();
    expect(bag).toContain('16');
  });

  test('hand starts empty with prompt to draw', async ({ page }) => {
    const hand = await page.locator('#hand-tokens').textContent();
    expect(hand.toLowerCase()).toContain('draw');
  });

  test('draw button adds token to hand', async ({ page }) => {
    await page.click('#b-draw');
    const tokens = page.locator('.hand-token');
    await expect(tokens).toHaveCount(1);
    // Bag decrements
    const bag = await page.locator('#pbag').textContent();
    expect(bag).toContain('15');
  });

  test('draw multiple tokens', async ({ page }) => {
    await page.click('#b-draw');
    await page.click('#b-draw');
    await page.click('#b-draw');
    const tokens = page.locator('.hand-token');
    await expect(tokens).toHaveCount(3);
    const bag = await page.locator('#pbag').textContent();
    expect(bag).toContain('13');
  });

  test('selecting a hand token highlights it', async ({ page }) => {
    await page.click('#b-draw');
    const token = page.locator('.hand-token').first();
    await token.click();
    await expect(token).toHaveClass(/selected/);
  });

  test('tapping selected token again deselects it', async ({ page }) => {
    await page.click('#b-draw');
    const token = page.locator('.hand-token').first();
    await token.click();
    await expect(token).toHaveClass(/selected/);
    // Wait past double-tap window (350ms) before clicking again to deselect
    await page.waitForTimeout(400);
    await token.click();
    await expect(token).not.toHaveClass(/selected/);
  });

  test('rotate button opens zoom overlay and flips values', async ({ page }) => {
    await page.click('#b-draw');
    const token = page.locator('.hand-token').first();
    await token.click();

    // Read initial values
    const valsBefore = await page.locator('.hand-token .tv').allTextContents();

    // Click rotate — opens zoom overlay
    await page.click('#b-rot');
    await expect(page.locator('#rot-zoom')).toHaveClass(/show/);

    // Read big token values before flip
    const bigBefore = [
      await page.locator('#rz-l').textContent(),
      await page.locator('#rz-r').textContent(),
    ];
    expect(bigBefore[0]).toBe(valsBefore[0]);
    expect(bigBefore[1]).toBe(valsBefore[1]);

    // Flip
    await page.click('#rz-flip');
    const bigAfter = [
      await page.locator('#rz-l').textContent(),
      await page.locator('#rz-r').textContent(),
    ];
    expect(bigAfter[0]).toBe(valsBefore[1]);
    expect(bigAfter[1]).toBe(valsBefore[0]);

    // Confirm
    await page.click('#rz-done');
    await expect(page.locator('#rot-zoom')).not.toHaveClass(/show/);

    // Hand token values should be flipped
    const valsAfter = await page.locator('.hand-token .tv').allTextContents();
    expect(valsAfter[0]).toBe(valsBefore[1]);
    expect(valsAfter[1]).toBe(valsBefore[0]);
  });

  test('rotate button disabled when nothing selected', async ({ page }) => {
    await expect(page.locator('#b-rot')).toBeDisabled();
  });

  test('draw button disabled when bag is empty', async ({ page }) => {
    // Draw all 16 tokens
    for (let i = 0; i < 16; i++) {
      await page.click('#b-draw');
    }
    await expect(page.locator('#b-draw')).toBeDisabled();
    const bag = await page.locator('#pbag').textContent();
    expect(bag).toContain('0');
  });

  test('selecting token shows available slots on board', async ({ page }) => {
    await page.click('#b-draw');
    const token = page.locator('.hand-token').first();
    await token.click();

    // Should see pulsing slot targets
    const slots = page.locator('.slot-avail');
    const count = await slots.count();
    expect(count).toBeGreaterThan(0);
  });

  test('deselecting token hides slot highlights', async ({ page }) => {
    await page.click('#b-draw');
    const token = page.locator('.hand-token').first();
    await token.click();
    const slotsVisible = await page.locator('.slot-avail').count();
    expect(slotsVisible).toBeGreaterThan(0);

    // Wait past double-tap window then deselect
    await page.waitForTimeout(400);
    await token.click();
    const slotsHidden = await page.locator('.slot-avail').count();
    expect(slotsHidden).toBe(0);
  });

  test('place token on a slot', async ({ page }) => {
    await page.click('#b-draw');
    const handCountBefore = await page.locator('.hand-token').count();
    expect(handCountBefore).toBe(1);

    // Select the token
    await page.locator('.hand-token').first().click();

    // Click a slot target
    const slot = page.locator('.slot-avail').first();
    await slot.click();

    // Token removed from hand
    const handCountAfter = await page.locator('.hand-token').count();
    expect(handCountAfter).toBe(0);

    // Token appears on board (placed-token group with data-s)
    const placed = page.locator('g.hit[data-s]');
    const placedCount = await placed.count();
    expect(placedCount).toBeGreaterThan(0);
  });

  test('pick up placed token back to hand', async ({ page }) => {
    // Draw and place a token
    await page.click('#b-draw');
    await page.locator('.hand-token').first().click();
    const slot = page.locator('.slot-avail').first();
    const slotId = await slot.getAttribute('data-s');
    await slot.click();

    // Hand should be empty
    expect(await page.locator('.hand-token').count()).toBe(0);

    // Click the placed token to pick it up (immediate)
    await page.locator(`g.hit[data-s="${slotId}"]`).click();

    // Token back in hand
    expect(await page.locator('.hand-token').count()).toBe(1);
  });

  test('end turn switches to Pompey', async ({ page }) => {
    await page.click('#b-end');

    // Overlay should appear
    await expect(page.locator('#overlay')).toHaveClass(/show/);
    const text = await page.locator('#ov-text').textContent();
    expect(text).toContain('Pompey');

    // Click overlay to dismiss
    await page.locator('#overlay').click();

    // Now Pompey's turn
    const name = await page.locator('#pname').textContent();
    expect(name).toBe('Pompey');
    await expect(page.locator('#pname')).toHaveClass(/pompey/);
  });

  test('end turn hides previous player hand', async ({ page }) => {
    // Caesar draws tokens
    await page.click('#b-draw');
    await page.click('#b-draw');
    expect(await page.locator('.hand-token').count()).toBe(2);

    // End turn
    await page.click('#b-end');
    await page.locator('#overlay').click();

    // Pompey's turn — hand should be empty (Pompey hasn't drawn)
    const hand = await page.locator('#hand-tokens').textContent();
    expect(hand.toLowerCase()).toContain('draw');
  });

  test('full turn cycle: Caesar → Pompey → Caesar', async ({ page }) => {
    expect(await page.locator('#pname').textContent()).toBe('Caesar');

    await page.click('#b-end');
    await page.locator('#overlay').click();
    expect(await page.locator('#pname').textContent()).toBe('Pompey');

    await page.click('#b-end');
    await page.locator('#overlay').click();
    expect(await page.locator('#pname').textContent()).toBe('Caesar');
  });

  test('marker button places control marker on board', async ({ page }) => {
    const markersBefore = await page.locator('#pmarkers').textContent();
    expect(markersBefore).toContain('12');

    // Select marker mode
    await page.click('#b-mark');

    // Click on the board area
    const board = page.locator('#board-container');
    const box = await board.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // Marker count decremented
    const markersAfter = await page.locator('#pmarkers').textContent();
    expect(markersAfter).toContain('11');

    // Marker visible on board SVG
    const markerEls = page.locator('g.hit[data-mi]');
    expect(await markerEls.count()).toBe(1);
  });

  test('pick up control marker', async ({ page }) => {
    // Place a marker
    await page.click('#b-mark');
    const board = page.locator('#board-container');
    const box = await board.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.click(cx, cy);
    expect(await page.locator('#pmarkers').textContent()).toContain('11');

    // Click the marker to pick it up
    const marker = page.locator('g.hit[data-mi]').first();
    await marker.click();
    expect(await page.locator('#pmarkers').textContent()).toContain('12');
  });

  test('bonus tokens visible on board', async ({ page }) => {
    const bonuses = page.locator('circle[data-bi]');
    const count = await bonuses.count();
    // Should have bonus tokens on provinces (up to 18, at least some)
    expect(count).toBeGreaterThan(5);
  });

  test('claim bonus token by clicking', async ({ page }) => {
    const bonusesBefore = await page.locator('circle[data-bi]').count();
    const firstBonus = page.locator('circle[data-bi]').first();
    await firstBonus.click();
    const bonusesAfter = await page.locator('circle[data-bi]').count();
    expect(bonusesAfter).toBe(bonusesBefore - 1);
  });

  test('keyboard R opens rotate zoom for selected token', async ({ page }) => {
    await page.click('#b-draw');
    await page.locator('.hand-token').first().click();
    await page.keyboard.press('r');
    await expect(page.locator('#rot-zoom')).toHaveClass(/show/);
    // Big token should be visible with values
    const bigL = await page.locator('#rz-l').textContent();
    const bigR = await page.locator('#rz-r').textContent();
    expect(parseInt(bigL) + parseInt(bigR)).toBeGreaterThanOrEqual(4);
    // Flip
    await page.click('#rz-flip');
    // Confirm dismisses overlay
    await page.click('#rz-done');
    await expect(page.locator('#rot-zoom')).not.toHaveClass(/show/);
  });

  test('keyboard Escape deselects', async ({ page }) => {
    await page.click('#b-draw');
    await page.locator('.hand-token').first().click();
    await expect(page.locator('.hand-token').first()).toHaveClass(/selected/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.hand-token').first()).not.toHaveClass(/selected/);
  });

  // ── Menu & Save/Load ─────────────────────────────────────

  test('menu opens and closes', async ({ page }) => {
    await expect(page.locator('#menu-panel')).not.toHaveClass(/show/);
    await page.click('#menu-btn');
    await expect(page.locator('#menu-panel')).toHaveClass(/show/);

    // Shows session ID
    const sessionText = await page.locator('#session-id').textContent();
    expect(sessionText).toContain('Session:');

    // Close with Resume
    await page.locator('.menu-item', { hasText: 'Resume' }).click();
    await expect(page.locator('#menu-panel')).not.toHaveClass(/show/);
  });

  test('autosave persists state on reload', async ({ page }) => {
    // Draw 3 tokens
    await page.click('#b-draw');
    await page.click('#b-draw');
    await page.click('#b-draw');
    expect(await page.locator('.hand-token').count()).toBe(3);

    // Reload page
    await page.reload();
    await page.waitForSelector('#board-img');
    await page.waitForFunction(() => {
      const img = document.getElementById('board-img');
      return img && img.complete && img.naturalWidth > 0;
    });
    await page.waitForTimeout(200);

    // State should be restored — 3 tokens in hand, 13 in bag
    expect(await page.locator('.hand-token').count()).toBe(3);
    expect(await page.locator('#pbag').textContent()).toContain('13');
  });

  test('manual save and load', async ({ page }) => {
    // Draw tokens and place one
    await page.click('#b-draw');
    await page.click('#b-draw');
    await page.locator('.hand-token').first().click();
    const slot = page.locator('.slot-avail').first();
    await slot.click();

    // 1 token in hand, 1 on board
    expect(await page.locator('.hand-token').count()).toBe(1);

    // Save
    await page.click('#menu-btn');
    await page.locator('.menu-item', { hasText: 'Save' }).click();

    // Draw more tokens (change state)
    await page.click('#b-draw');
    await page.click('#b-draw');
    expect(await page.locator('.hand-token').count()).toBe(3);

    // Load the save
    await page.click('#menu-btn');
    await page.locator('.menu-item', { hasText: 'Load' }).click();
    // Click the first save entry
    const saveEntry = page.locator('.save-entry').first();
    await saveEntry.click();

    // State should be restored to 1 token in hand
    expect(await page.locator('.hand-token').count()).toBe(1);
  });

  test('new game resets everything', async ({ page }) => {
    // Draw tokens
    await page.click('#b-draw');
    await page.click('#b-draw');
    expect(await page.locator('.hand-token').count()).toBe(2);

    // New game via menu
    page.on('dialog', d => d.accept());
    await page.click('#menu-btn');
    await page.locator('.menu-item', { hasText: 'New Game' }).click();

    // Hand should be empty, bag full
    const hand = await page.locator('#hand-tokens').textContent();
    expect(hand.toLowerCase()).toContain('draw');
    expect(await page.locator('#pbag').textContent()).toContain('16');
  });

  // ── Token distribution ───────────────────────────────────

  test('each player has exactly 16 tokens in bag', async ({ page }) => {
    // Caesar: draw all 16
    for (let i = 0; i < 16; i++) {
      await page.click('#b-draw');
    }
    expect(await page.locator('.hand-token').count()).toBe(16);
    await expect(page.locator('#b-draw')).toBeDisabled();

    // Switch to Pompey
    await page.click('#b-end');
    await page.locator('#overlay').click();

    // Pompey: draw all 16
    for (let i = 0; i < 16; i++) {
      await page.click('#b-draw');
    }
    expect(await page.locator('.hand-token').count()).toBe(16);
    await expect(page.locator('#b-draw')).toBeDisabled();
  });

  test('token values always sum correctly', async ({ page }) => {
    // Draw all tokens and verify values
    for (let i = 0; i < 16; i++) {
      await page.click('#b-draw');
    }
    const tokens = page.locator('.hand-token');
    const count = await tokens.count();
    for (let i = 0; i < count; i++) {
      const vals = await tokens.nth(i).locator('.tv').allTextContents();
      const sum = parseInt(vals[0]) + parseInt(vals[1]);
      // Regular tokens sum to 6, Wild tokens sum to 4
      expect([4, 6]).toContain(sum);
    }
  });

  // ── Edge cases ───────────────────────────────────────────

  test('cannot place token without selecting one first', async ({ page }) => {
    // Click a slot without selecting a token — nothing should happen
    const slot = page.locator('circle[data-s]').first();
    await slot.click();
    // No tokens placed
    const placed = page.locator('g.hit[data-s]');
    expect(await placed.count()).toBe(0);
  });

  test('cannot place on already occupied slot', async ({ page }) => {
    // Draw 2 tokens, place first on a slot
    await page.click('#b-draw');
    await page.click('#b-draw');

    await page.locator('.hand-token').first().click();
    const slot = page.locator('.slot-avail').first();
    const slotId = await slot.getAttribute('data-s');
    await slot.click();

    // Try to place second token on same slot — it should pick up the first instead
    await page.locator('.hand-token').first().click();
    // The occupied slot should NOT appear as .slot-avail
    const availSlots = page.locator(`.slot-avail[data-s="${slotId}"]`);
    expect(await availSlots.count()).toBe(0);
  });

  test('placed tokens persist through turn changes', async ({ page }) => {
    // Caesar places a token
    await page.click('#b-draw');
    await page.locator('.hand-token').first().click();
    await page.locator('.slot-avail').first().click();

    // Switch to Pompey and back
    await page.click('#b-end');
    await page.locator('#overlay').click();
    await page.click('#b-end');
    await page.locator('#overlay').click();

    // Token should still be on board
    const placed = page.locator('g.hit[data-s]');
    expect(await placed.count()).toBeGreaterThan(0);
  });
});
