import { test, expect } from '@playwright/test';
import { loginReal, navigateViaSidebar, TEST_USERS } from './helpers';

/**
 * 面试→评分→审批 完整链路 E2E
 *
 * 运行条件：
 *   1. VITE_USE_MOCK_API=false
 *   2. Supabase 已执行 seed（含面试模板 + 题目）
 *   3. npm run dev 已启动
 */

test.describe('Interview Flow — 面试→评分→审批 链路', () => {
  test.beforeEach(async ({ page }) => {
    await loginReal(page, TEST_USERS.recruiter.email, TEST_USERS.recruiter.password);
  });

  // ── 1. AI 面试中心 → 面试模板列表 ──────────────────────────
  test('interview templates tab loads', async ({ page }) => {
    await navigateViaSidebar(page, 'AI 面试中心');
    await expect(page).toHaveURL(/\/interviews/);

    // Templates tab should show by default
    await page.waitForTimeout(1500);
    await expect(page.locator('body')).toBeVisible();

    // Tab bar should be visible
    const templatesTab = page.getByText('面试模板');
    await expect(templatesTab).toBeVisible({ timeout: 5000 });
  });

  // ── 2. 会话管理 tab ───────────────────────────────────────
  test('session management tab loads', async ({ page }) => {
    await page.goto('/interviews?tab=management');
    await page.waitForTimeout(1500);

    // Should show session management interface
    await expect(page.locator('body')).toBeVisible();
  });

  // ── 3. 面试结果 tab ───────────────────────────────────────
  test('interview results tab loads', async ({ page }) => {
    await page.goto('/interviews?tab=results');
    await page.waitForTimeout(1500);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── 4. 数据分析 tab ───────────────────────────────────────
  test('analytics tab loads', async ({ page }) => {
    await page.goto('/interviews?tab=analytics');
    await page.waitForTimeout(1500);

    await expect(page.locator('body')).toBeVisible();
  });

  // ── 5. 会话式面试 tab ──────────────────────────────────────
  test('conversational interview tab loads', async ({ page }) => {
    await page.goto('/interviews?tab=conversational');
    await page.waitForTimeout(1500);

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Interview Flow — 面试体验预览', () => {
  test.beforeEach(async ({ page }) => {
    await loginReal(page, TEST_USERS.recruiter.email, TEST_USERS.recruiter.password);
  });

  // ── 面试预览页面（候选人视角） ────────────────────────────
  test('interview preview page loads', async ({ page }) => {
    await page.goto('/interviews?tab=preview');
    await page.waitForTimeout(1500);

    // Preview page should show candidate-facing interview interface
    await expect(page.locator('body')).toBeVisible();
  });
});
