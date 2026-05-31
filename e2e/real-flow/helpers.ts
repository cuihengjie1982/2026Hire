import { type Page, expect } from '@playwright/test';

/**
 * Real-login helper — uses Supabase auth, not localStorage mock.
 *
 * Requires VITE_USE_MOCK_API=false in the dev server environment.
 * Test credentials come from the seed script (server/src/db/seed.ts).
 */
export async function loginReal(page: Page, email: string, password: string) {
  await page.goto('/');
  // Clear any stale mock auth
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();

  // Wait for login form
  await expect(page.getByPlaceholder(/企业邮箱/)).toBeVisible({ timeout: 10_000 });

  await page.getByPlaceholder(/企业邮箱/).fill(email);
  await page.getByPlaceholder(/密码/).fill(password);
  await page.getByRole('button', { name: '登录' }).click();

  // Wait for dashboard sidebar to appear (auth success)
  await expect(page.locator('aside')).toBeVisible({ timeout: 15_000 });
}

/**
 * Navigate via sidebar link text.
 */
export async function navigateViaSidebar(page: Page, title: string) {
  const aside = page.locator('aside');
  const link = aside.locator('a').filter({ hasText: title }).first();
  await link.click();
  await page.waitForTimeout(500);
}

/**
 * Seed credentials from server/src/db/seed.ts
 */
export const TEST_USERS = {
  admin: { email: 'admin@em-box.com', password: 'admin123' },
  recruiter: { email: 'zhang@em-box.com', password: 'password123' },
  hiringManager: { email: 'li@em-box.com', password: 'password123' },
  viewer: { email: 'wang@em-box.com', password: 'password123' },
} as const;
