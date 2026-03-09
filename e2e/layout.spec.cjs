const { test, expect } = require('@playwright/test');

async function getMaxHorizontalOverflow(page) {
  return page.evaluate(() => {
    const candidates = [
      document.documentElement,
      document.body,
      document.querySelector('.app'),
      document.getElementById('startScreen'),
      document.getElementById('gameScreen'),
      document.querySelector('.game-header'),
      document.querySelector('.actions'),
      document.querySelector('.board-panel')
    ].filter(Boolean);

    return Math.max(
      0,
      ...candidates.map((el) => Math.max(0, el.scrollWidth - el.clientWidth))
    );
  });
}

async function assertNoHorizontalOverflow(page) {
  const maxOverflow = await getMaxHorizontalOverflow(page);
  expect(maxOverflow, `Found horizontal overflow of ${maxOverflow}px`).toBeLessThanOrEqual(1);
}

test('start screen: no horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#startMatchBtn');
  await assertNoHorizontalOverflow(page);
});

test('game screen: no horizontal overflow and board always fits panel', async ({ page }) => {
  await page.goto('/');
  await page.click('#modeHvCBtn');
  await page.click('#difficultyMediumBtn');
  await page.click('#startMatchBtn');
  await page.waitForSelector('#gameScreen:not(.is-hidden)');

  await assertNoHorizontalOverflow(page);

  const boardFits = await page.evaluate(() => {
    const board = document.getElementById('board');
    const boardPanel = board?.closest('.board-panel');
    if (!board || !boardPanel) return false;

    const panelStyle = window.getComputedStyle(boardPanel);
    const paddingLeft = parseFloat(panelStyle.paddingLeft || '0') || 0;
    const paddingRight = parseFloat(panelStyle.paddingRight || '0') || 0;
    const panelContentWidth = boardPanel.clientWidth - paddingLeft - paddingRight;
    const boardWidth = board.getBoundingClientRect().width;

    return boardWidth <= panelContentWidth + 1;
  });

  expect(boardFits).toBe(true);

  const originalViewport = page.viewportSize();
  if (!originalViewport) return;

  const resizedWidth = Math.max(320, originalViewport.width - 24);
  const resizedHeight = Math.max(640, originalViewport.height - 60);
  await page.setViewportSize({ width: resizedWidth, height: resizedHeight });
  await page.waitForTimeout(120);

  await assertNoHorizontalOverflow(page);
});
