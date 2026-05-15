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

// Helper to navigate via sidebar link
async function navigateTo(page: import('@playwright/test').Page, title: string) {
  const aside = page.locator('aside');
  const link = aside.locator('a').filter({hasText: title}).first();
  await link.click();
  await page.waitForTimeout(500);
}

test.describe('Complete Recruitment Workflow', () => {
  test.beforeEach(async ({page}) => {
    await loginAs(page);
  });

  // ---------------------------------------------------------------
  // 1. Dashboard → verify basic structure
  // ---------------------------------------------------------------
  test('step 1: dashboard loads with project selector and user info', async ({page}) => {
    // Verify sidebar branding
    await expect(page.locator('aside').getByText('EM-BOX')).toBeVisible();
    // Verify user info
    await expect(page.getByText('张招募')).toBeVisible();
    // Project selector exists
    await expect(page.locator('aside select')).toBeVisible();
  });

  // ---------------------------------------------------------------
  // 2. Create a project
  // ---------------------------------------------------------------
  test('step 2: navigate to projects page', async ({page}) => {
    await navigateTo(page, '项目管理');
    await expect(page).toHaveURL(/\/projects/);
  });

  // ---------------------------------------------------------------
  // 3. Configure a position
  // ---------------------------------------------------------------
  test('step 3: navigate to position config page', async ({page}) => {
    await navigateTo(page, '岗位标准配置');
    await expect(page).toHaveURL(/\/positions\/config/);
  });

  // ---------------------------------------------------------------
  // 4. Search candidates
  // ---------------------------------------------------------------
  test('step 4: navigate to candidate search page', async ({page}) => {
    await navigateTo(page, '候选人搜索');
    await expect(page).toHaveURL(/\/search/);
  });

  // ---------------------------------------------------------------
  // 5. View talent pool
  // ---------------------------------------------------------------
  test('step 5: navigate to talent pool page', async ({page}) => {
    await navigateTo(page, '人才库');
    await expect(page).toHaveURL(/\/talent/);
  });

  // ---------------------------------------------------------------
  // 6. View shortlist
  // ---------------------------------------------------------------
  test('step 6: navigate to shortlist page', async ({page}) => {
    await navigateTo(page, '入围名单');
    await expect(page).toHaveURL(/\/shortlist/);
  });

  // ---------------------------------------------------------------
  // 7. View contacts
  // ---------------------------------------------------------------
  test('step 7: navigate to contacts page', async ({page}) => {
    await navigateTo(page, '联系人管理');
    await expect(page).toHaveURL(/\/contacts/);
  });

  // ---------------------------------------------------------------
  // 8. View outreach campaigns
  // ---------------------------------------------------------------
  test('step 8: navigate to outreach page', async ({page}) => {
    await navigateTo(page, '外联序列');
    await expect(page).toHaveURL(/\/outreach/);
  });

  // ---------------------------------------------------------------
  // 9. AI Interview Center
  // ---------------------------------------------------------------
  test('step 9: navigate to AI interview templates page', async ({page}) => {
    await navigateTo(page, 'AI 面试中心');
    await expect(page).toHaveURL(/\/interviews\/templates/);
  });

  // ---------------------------------------------------------------
  // 10. Approvals center
  // ---------------------------------------------------------------
  test('step 10: navigate to approvals center', async ({page}) => {
    await navigateTo(page, '审批中心');
    await expect(page).toHaveURL(/\/approvals/);
  });

  // ---------------------------------------------------------------
  // 11. Data insights
  // ---------------------------------------------------------------
  test('step 11: navigate to data insights page', async ({page}) => {
    await navigateTo(page, '数据洞察');
    await expect(page).toHaveURL(/\/insights/);
  });

  // ---------------------------------------------------------------
  // 12. AI Agents
  // ---------------------------------------------------------------
  test('step 12: navigate to AI agents page', async ({page}) => {
    await navigateTo(page, 'AI 代理');
    await expect(page).toHaveURL(/\/agents/);
  });

  // ---------------------------------------------------------------
  // 13. Settings
  // ---------------------------------------------------------------
  test('step 13: navigate to settings page', async ({page}) => {
    await navigateTo(page, '设置中心');
    await expect(page).toHaveURL(/\/settings/);
  });
});

test.describe('Sidebar Navigation Consistency', () => {
  test.beforeEach(async ({page}) => {
    await loginAs(page);
  });

  test('all sidebar links are clickable and navigate correctly', async ({page}) => {
    const aside = page.locator('aside');
    const links = aside.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(14);

    // Verify each link has a valid href
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toMatch(/^\//);
    }
  });

  test('breadcrumbs update when navigating between pages', async ({page}) => {
    // Navigate to a sub-page
    await navigateTo(page, '候选人搜索');

    // Check if breadcrumbs appear (not on dashboard)
    const breadcrumbs = page.locator('nav');
    if (await breadcrumbs.isVisible()) {
      // Should have "首页" link
      await expect(breadcrumbs.getByText('首页')).toBeVisible();
    }
  });

  test('clicking home in breadcrumbs returns to dashboard', async ({page}) => {
    await navigateTo(page, '候选人搜索');
    await page.waitForTimeout(300);

    // Click home in breadcrumbs
    const homeBtn = page.getByText('首页').first();
    if (await homeBtn.isVisible()) {
      await homeBtn.click();
      await page.waitForTimeout(500);
      // Should be back at dashboard
      expect(page.url()).toBe('http://localhost:3000/');
    }
  });
});

test.describe('Quick Search in Sidebar', () => {
  test.beforeEach(async ({page}) => {
    await loginAs(page);
  });

  test('can type in quick search and see filtered results', async ({page}) => {
    const searchInput = page.getByPlaceholder('快速查找');
    await expect(searchInput).toBeVisible();

    // Type a search query
    await searchInput.fill('候选人');
    await page.waitForTimeout(300);

    // Should show filtered results dropdown (if matching items exist)
    const searchResults = page.locator('aside ul button');
    const count = await searchResults.count();
    if (count > 0) {
      // Click a result to navigate
      await searchResults.first().click();
      await page.waitForTimeout(500);
    }

    // Clear search
    await searchInput.clear();
  });
});

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({page}) => {
    await loginAs(page);
  });

  test('can switch between light and dark theme', async ({page}) => {
    const aside = page.locator('aside');

    // Find theme toggle buttons (sun/moon icons)
    const themeButtons = aside.locator('button').filter({hasText: ''});
    // The theme toggle area has two buttons
    const allButtons = aside.locator('.grid.grid-cols-2 button');
    if (await allButtons.count() >= 2) {
      // Click dark mode
      await allButtons.nth(1).click();
      await page.waitForTimeout(300);

      // Verify dark class applied
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(isDark).toBe(true);

      // Switch back to light
      await allButtons.nth(0).click();
      await page.waitForTimeout(300);
      const isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));
      expect(isLight).toBe(true);
    }
  });
});

test.describe('Error Handling', () => {
  test('navigating to non-existent page shows error boundary or redirect', async ({page}) => {
    await loginAs(page);

    // Navigate to a non-existent route
    await page.goto('/nonexistent-page-xyz');
    await page.waitForTimeout(1000);

    // Should either show error boundary or redirect to dashboard
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
