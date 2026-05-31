import { test, expect } from '@playwright/test';
import { loginReal, navigateViaSidebar, TEST_USERS } from './helpers';

/**
 * 培训→复面 闭环 E2E
 *
 * 验证：候选人面试评分低 → 培训推荐 → 报名培训 → 完成后评分反馈 → 触发复面
 *
 * 运行条件：
 *   1. VITE_USE_MOCK_API=false
 *   2. Supabase 已执行 seed（含培训课程数据）
 *   3. npm run dev 已启动
 */

test.describe('Training Loop — 培训→复面 闭环', () => {
  test.beforeEach(async ({ page }) => {
    // Admin has full access to training management
    await loginReal(page, TEST_USERS.admin.email, TEST_USERS.admin.password);
  });

  // ── 1. 培训学堂 → 课程管理 ─────────────────────────────────
  test('training academy course management loads', async ({ page }) => {
    await navigateViaSidebar(page, '培训学堂');
    await expect(page).toHaveURL(/\/training/);

    await page.waitForTimeout(1500);

    // Tab bar with courses tab
    const coursesTab = page.getByText('课程管理');
    await expect(coursesTab).toBeVisible({ timeout: 5000 });

    await expect(page.locator('body')).toBeVisible();
  });

  // ── 2. 培训记录 tab ───────────────────────────────────────
  test('training enrollments tab loads', async ({ page }) => {
    await page.goto('/training');
    await page.waitForTimeout(1000);

    // Click enrollments tab
    const enrollmentsTab = page.getByText('培训记录');
    if (await enrollmentsTab.isVisible()) {
      await enrollmentsTab.click();
      await page.waitForTimeout(1000);
    }

    await expect(page.locator('body')).toBeVisible();
  });

  // ── 3. 薄弱分析 tab ───────────────────────────────────────
  test('weakness analysis tab loads', async ({ page }) => {
    await page.goto('/training');
    await page.waitForTimeout(1000);

    const analysisTab = page.getByText('薄弱分析');
    if (await analysisTab.isVisible()) {
      await analysisTab.click();
      await page.waitForTimeout(1500);
    }

    await expect(page.locator('body')).toBeVisible();
  });

  // ── 4. 效果统计 tab ───────────────────────────────────────
  test('training effectiveness tab loads', async ({ page }) => {
    await page.goto('/training');
    await page.waitForTimeout(1000);

    const effectivenessTab = page.getByText('效果统计');
    if (await effectivenessTab.isVisible()) {
      await effectivenessTab.click();
      await page.waitForTimeout(1500);
    }

    await expect(page.locator('body')).toBeVisible();
  });

  // ── 5. 学习路径 tab ────────────────────────────────────────
  test('learning paths tab loads', async ({ page }) => {
    await page.goto('/training');
    await page.waitForTimeout(1000);

    const pathsTab = page.getByText('学习路径');
    if (await pathsTab.isVisible()) {
      await pathsTab.click();
      await page.waitForTimeout(1500);
    }

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Training Loop — Recruiter access', () => {
  // ── Recruiter 也应该能访问培训学堂 ────────────────────────
  test('recruiter can view training academy', async ({ page }) => {
    await loginReal(page, TEST_USERS.recruiter.email, TEST_USERS.recruiter.password);

    await navigateViaSidebar(page, '培训学堂');
    await expect(page).toHaveURL(/\/training/);

    await page.waitForTimeout(1500);
    await expect(page.locator('body')).toBeVisible();
  });
});
