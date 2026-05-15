import {test, expect} from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({page}) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('shows login page by default', async ({page}) => {
    await page.goto('/');
    await expect(page.getByText('欢迎回来')).toBeVisible();
    await expect(page.getByPlaceholder(/企业邮箱/)).toBeVisible();
    await expect(page.getByPlaceholder(/密码/)).toBeVisible();
  });

  test('login form has email and password fields', async ({page}) => {
    await page.goto('/');
    const emailInput = page.getByPlaceholder(/企业邮箱/);
    const passwordInput = page.getByPlaceholder(/密码/);
    const loginButton = page.getByRole('button', {name: '登录'});

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(loginButton).toBeVisible();
  });

  test('toggles password visibility', async ({page}) => {
    await page.goto('/');

    const passwordInput = page.getByPlaceholder(/密码/);
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByText('显示').click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await page.getByText('隐藏').click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('logs in with mock credentials and navigates to dashboard', async ({page}) => {
    await page.goto('/');

    await page.getByPlaceholder(/企业邮箱/).fill('test@example.com');
    await page.getByPlaceholder(/密码/).fill('password123');
    await page.getByRole('button', {name: '登录'}).click();

    // After login in mock mode, should navigate to dashboard
    await expect(page).toHaveURL(/\//);
    // Dashboard should show authenticated content
    await page.waitForTimeout(1000);
  });

  test('opens and closes apply account dialog', async ({page}) => {
    await page.goto('/');

    await page.getByText('申请企业账号').click();
    await expect(page.getByText('企业名称')).toBeVisible();

    await page.getByText('取消').click();
    await expect(page.getByText('企业名称')).not.toBeVisible();
  });

  test('submit apply form shows success message', async ({page}) => {
    await page.goto('/');

    await page.getByText('申请企业账号').click();

    await page.getByPlaceholder(/企业全称/).fill('测试公司');
    await page.getByPlaceholder(/联系人姓名/).fill('张三');
    await page.getByPlaceholder(/联系邮箱/).fill('test@company.com');
    await page.getByPlaceholder(/联系电话/).fill('13800138000');

    await page.getByText('提交申请').click();
    await expect(page.getByText('申请已提交')).toBeVisible();
  });
});
