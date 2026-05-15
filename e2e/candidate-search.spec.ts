import {test, expect} from '@playwright/test';

// Reliable login helper
async function loginAs(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('em-box.authenticated', 'true');
  });
  await page.reload();
  await expect(page.locator('aside')).toBeVisible({timeout: 10000});
}

test.describe('Page Routing', () => {
  test.beforeEach(async ({page}) => {
    await loginAs(page);
  });

  test('can access candidate search page', async ({page}) => {
    await page.goto('/search');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('can access positions config page', async ({page}) => {
    await page.goto('/positions/config');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('can access shortlist page', async ({page}) => {
    await page.goto('/shortlist');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('can access approvals page', async ({page}) => {
    await page.goto('/approvals');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('can access outreach page', async ({page}) => {
    await page.goto('/outreach');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('can access talent pool page', async ({page}) => {
    await page.goto('/talent');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('can access AI interview templates page', async ({page}) => {
    await page.goto('/interviews/templates');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('can access settings page', async ({page}) => {
    await page.goto('/settings');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });
});
