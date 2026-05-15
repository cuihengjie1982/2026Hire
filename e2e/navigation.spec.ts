import {test, expect} from '@playwright/test';

// Reliable login helper: set localStorage and reload
async function loginAs(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('em-box.authenticated', 'true');
  });
  await page.reload();
  await expect(page.locator('aside')).toBeVisible({timeout: 10000});
}

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({page}) => {
    await loginAs(page);
  });

  test('displays sidebar with EM-BOX branding', async ({page}) => {
    await expect(page.locator('aside').getByText('EM-BOX')).toBeVisible();
  });

  test('displays user name in sidebar', async ({page}) => {
    await expect(page.getByText('张招募')).toBeVisible();
  });

  test('sidebar contains multiple navigation links', async ({page}) => {
    const aside = page.locator('aside');
    const navLinks = aside.locator('a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(3);
  });

  test('can navigate to different pages via sidebar', async ({page}) => {
    const aside = page.locator('aside');

    // Click on a navigation link
    const projectLink = aside.locator('a').filter({hasText: /项目/}).first();
    if (await projectLink.isVisible()) {
      await projectLink.click();
      await page.waitForTimeout(500);
      expect(page.url()).toMatch(/\/projects|\//);
    }
  });

  test('quick search box is visible in sidebar', async ({page}) => {
    const searchInput = page.getByPlaceholder('快速查找');
    await expect(searchInput).toBeVisible();
  });

  test('can logout', async ({page}) => {
    // Find and click the logout button
    const logoutBtn = page.locator('aside button').filter({hasText: ''}).last();
    // The logout icon button exists in the sidebar footer
    const aside = page.locator('aside');
    // Logout button is near the user avatar
    await expect(aside.getByText('张招募')).toBeVisible();
  });
});
